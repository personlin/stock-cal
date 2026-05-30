import type { DailyOHLC } from '../shared/types';
import { fmtPrice } from '../lib/utils';

type Props = {
  days: DailyOHLC[];
  selectedDate: string;
  onSelect: (date: string) => void;
};

export function OHLCTable({ days, selectedDate, onSelect }: Props) {
  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0">
      <table className="w-full min-w-[480px] border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="text-slate-500 dark:text-slate-400">
            <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left font-medium dark:bg-slate-950">
              日期
            </th>
            <th className="px-3 py-2 text-right font-medium">開盤</th>
            <th className="px-3 py-2 text-right font-medium">最高</th>
            <th className="px-3 py-2 text-right font-medium">最低</th>
            <th className="px-3 py-2 text-right font-medium">收盤</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => {
            const selected = d.date === selectedDate;
            return (
              <tr
                key={d.date}
                onClick={() => onSelect(d.date)}
                className={
                  'cursor-pointer transition ' +
                  (selected
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800/60')
                }
              >
                <td
                  className={
                    'sticky left-0 z-10 px-3 py-2 font-mono tabular-nums ' +
                    (selected
                      ? 'bg-slate-900 dark:bg-slate-100'
                      : 'bg-slate-50 dark:bg-slate-950')
                  }
                >
                  {d.date}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtPrice(d.open)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtPrice(d.high)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtPrice(d.low)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtPrice(d.close)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
