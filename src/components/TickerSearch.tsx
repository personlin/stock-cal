import { useState, type FormEvent } from 'react';
import { Search, RefreshCw } from 'lucide-react';

type Props = {
  defaultValue?: string;
  onSubmit: (ticker: string) => void;
  onRefresh: () => void;
  isLoading: boolean;
};

export function TickerSearch({ defaultValue = '', onSubmit, onRefresh, isLoading }: Props) {
  const [value, setValue] = useState(defaultValue);

  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) onSubmit(trimmed);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          inputMode="search"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="輸入股票代號（2330）或名稱（台積電）"
          className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-base text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-slate-100"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isLoading}
          className="flex-1 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300 sm:flex-initial"
        >
          {isLoading ? '查詢中…' : '查詢'}
        </button>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          title="清除快取並重新抓取"
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <RefreshCw className={'size-4 ' + (isLoading ? 'animate-spin' : '')} />
        </button>
      </div>
    </form>
  );
}
