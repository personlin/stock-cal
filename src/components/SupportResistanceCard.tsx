import type { DailyOHLC, Formula } from '../shared/types';
import { evaluateExpression, toContext } from '../lib/formula';
import { SR_BUILTIN_IDS } from '../lib/formulaStore';
import { fmtPrice } from '../lib/utils';

type Props = {
  formulas: Formula[];
  ohlc: DailyOHLC | null;
};

type Cell = {
  id: string;
  label: string;
  tone: 'resistance' | 'support';
  strength: 1 | 2;
};

// 2x2 grid (Z pattern): TL 第一壓力, TR 第二壓力, BL 第一支撐, BR 第二支撐.
const LAYOUT: Cell[] = [
  { id: SR_BUILTIN_IDS.resistance1, label: '第一壓力', tone: 'resistance', strength: 1 },
  { id: SR_BUILTIN_IDS.resistance2, label: '第二壓力', tone: 'resistance', strength: 2 },
  { id: SR_BUILTIN_IDS.support1, label: '第一支撐', tone: 'support', strength: 1 },
  { id: SR_BUILTIN_IDS.support2, label: '第二支撐', tone: 'support', strength: 2 },
];

function compute(expr: string | undefined, ohlc: DailyOHLC | null): number | null {
  if (!expr || !ohlc) return null;
  try {
    const v = evaluateExpression(expr, toContext(ohlc));
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

export function SupportResistanceCard({ formulas, ohlc }: Props) {
  const byId = new Map(formulas.map((f) => [f.id, f]));

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-base font-semibold">壓力 / 支撐</h2>
        <span className="text-xs text-slate-500 dark:text-slate-400">四象限速覽</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {LAYOUT.map((cell) => {
          const formula = byId.get(cell.id);
          const value = compute(formula?.expression, ohlc);
          const isResistance = cell.tone === 'resistance';
          return (
            <div
              key={cell.id}
              className={
                'flex flex-col gap-1 rounded-xl border p-3 ' +
                (isResistance
                  ? 'border-rose-200 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/30'
                  : 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/30')
              }
            >
              <div className="flex items-center justify-between">
                <span
                  className={
                    'text-xs font-medium ' +
                    (isResistance
                      ? 'text-rose-700 dark:text-rose-300'
                      : 'text-emerald-700 dark:text-emerald-300')
                  }
                >
                  {cell.label}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {isResistance ? 'R' : 'S'}
                  {cell.strength}
                </span>
              </div>
              <div className="font-mono text-2xl font-semibold tabular-nums">
                {value === null ? '—' : fmtPrice(value, 0)}
              </div>
            </div>
          );
        })}
      </div>
      {!ohlc && (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">需要先選定一個交易日或輸入完整 OHLC。</p>
      )}
    </section>
  );
}
