import { Pencil, Trash2 } from 'lucide-react';
import type { Formula, DailyOHLC } from '../shared/types';
import { evaluateExpression, toContext } from '../lib/formula';
import { fmtPrice } from '../lib/utils';

type Props = {
  formulas: Formula[];
  ohlc: DailyOHLC | null;
  onEdit: (f: Formula) => void;
  onDelete: (f: Formula) => void;
};

function compute(expr: string, ohlc: DailyOHLC | null): { value: number | null; error: string | null } {
  if (!ohlc) return { value: null, error: null };
  try {
    return { value: evaluateExpression(expr, toContext(ohlc)), error: null };
  } catch (e) {
    return { value: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export function FormulaList({ formulas, ohlc, onEdit, onDelete }: Props) {
  return (
    <ul className="divide-y divide-slate-200 dark:divide-slate-800">
      {formulas.map((f) => {
        const { value, error } = compute(f.expression, ohlc);
        return (
          <li key={f.id} className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{f.name}</span>
                {f.isBuiltin && (
                  <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                    內建
                  </span>
                )}
              </div>
              <div className="mt-0.5 truncate font-mono text-xs text-slate-500 dark:text-slate-400">
                {f.expression}
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-lg tabular-nums">
                {ohlc ? (error ? <span className="text-red-500 text-xs">{error}</span> : fmtPrice(value as number)) : '—'}
              </div>
            </div>
            <div className="flex gap-1">
              {!f.isBuiltin && (
                <>
                  <button
                    type="button"
                    onClick={() => onEdit(f)}
                    aria-label="編輯"
                    className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(f)}
                    aria-label="刪除"
                    className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
