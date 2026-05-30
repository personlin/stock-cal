import { useEffect, useMemo, useState } from 'react';
import { Plus, LineChart, Pencil } from 'lucide-react';
import { TickerSearch } from './components/TickerSearch';
import { ManualInput, manualToOhlc } from './components/ManualInput';
import { OHLCTable } from './components/OHLCTable';
import { FormulaList } from './components/FormulaList';
import { FormulaEditor } from './components/FormulaEditor';
import { useInvalidateQuotes, useQuote } from './api/quote';
import { formulaStore } from './lib/formulaStore';
import type { DailyOHLC, Formula } from './shared/types';

type Tab = 'quote' | 'manual';

export default function App() {
  const [tab, setTab] = useState<Tab>('quote');

  // Quote state
  const [ticker, setTicker] = useState<string | null>(null);
  const quoteQuery = useQuote(ticker);
  const invalidate = useInvalidateQuotes();
  const [selectedDate, setSelectedDate] = useState<string>('');

  useEffect(() => {
    if (quoteQuery.data?.days.length) {
      const last = quoteQuery.data.days[quoteQuery.data.days.length - 1];
      setSelectedDate((prev) => prev || last.date);
    }
  }, [quoteQuery.data]);

  // Manual state
  const [manual, setManual] = useState({ open: '', high: '', low: '', close: '' });

  // Formula state
  const [formulas, setFormulas] = useState<Formula[]>(() => formulaStore.list());
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Formula | null>(null);

  function refreshFormulas() {
    setFormulas(formulaStore.list());
  }

  const activeOhlc: DailyOHLC | null = useMemo(() => {
    if (tab === 'manual') return manualToOhlc(manual);
    const days = quoteQuery.data?.days ?? [];
    return days.find((d) => d.date === selectedDate) ?? days[days.length - 1] ?? null;
  }, [tab, manual, quoteQuery.data, selectedDate]);

  function handleSearch(q: string) {
    setSelectedDate('');
    setTicker(q);
  }

  function handleRefresh() {
    invalidate();
    if (ticker) quoteQuery.refetch();
  }

  function openCreate() {
    setEditing(null);
    setEditorOpen(true);
  }

  function openEdit(f: Formula) {
    setEditing(f);
    setEditorOpen(true);
  }

  function saveFormula(input: { id?: string; name: string; expression: string }) {
    formulaStore.upsert(input);
    refreshFormulas();
    setEditorOpen(false);
  }

  function deleteFormula(f: Formula) {
    if (confirm(`確定刪除「${f.name}」？`)) {
      formulaStore.remove(f.id);
      refreshFormulas();
    }
  }

  return (
    <div className="min-h-full">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3">
          <LineChart className="size-5 text-slate-700 dark:text-slate-300" />
          <h1 className="text-base font-semibold">台股技術價格計算機</h1>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:grid md:grid-cols-2 md:gap-6 md:p-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-5">
          <div className="mb-3 flex items-center gap-1 rounded-lg bg-slate-100 p-1 text-sm dark:bg-slate-800">
            <TabButton active={tab === 'quote'} onClick={() => setTab('quote')}>
              抓取股價
            </TabButton>
            <TabButton active={tab === 'manual'} onClick={() => setTab('manual')}>
              <Pencil className="mr-1 inline size-3.5" /> 手動輸入
            </TabButton>
          </div>

          {tab === 'quote' ? (
            <div className="flex flex-col gap-3">
              <TickerSearch
                defaultValue={ticker ?? ''}
                onSubmit={handleSearch}
                onRefresh={handleRefresh}
                isLoading={quoteQuery.isFetching}
              />

              {quoteQuery.isError && (
                <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                  {(quoteQuery.error as Error).message}
                </div>
              )}

              {quoteQuery.data && (
                <>
                  <div className="text-sm text-slate-600 dark:text-slate-400">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {quoteQuery.data.ticker} {quoteQuery.data.name}
                    </span>
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800">
                      {quoteQuery.data.market}
                    </span>
                    <span className="ml-2 text-xs">
                      抓取於 {new Date(quoteQuery.data.fetchedAt).toLocaleString('zh-TW')}
                    </span>
                  </div>
                  <OHLCTable
                    days={quoteQuery.data.days}
                    selectedDate={selectedDate || quoteQuery.data.days.at(-1)?.date || ''}
                    onSelect={setSelectedDate}
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    點任一日切換計算依據；資料快取在瀏覽器，同一交易日不會重新抓取。
                  </p>
                </>
              )}

              {!quoteQuery.data && !quoteQuery.isFetching && !quoteQuery.isError && (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  輸入代號或公司名稱按「查詢」，將顯示最近 5 個交易日的 OHLC。
                </p>
              )}
            </div>
          ) : (
            <ManualInput value={manual} onChange={setManual} />
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-base font-semibold">技術價格</h2>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
            >
              <Plus className="size-3.5" />
              新增公式
            </button>
          </div>
          {!activeOhlc && (
            <p className="rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">
              {tab === 'quote' ? '請先查詢或選擇一個交易日' : '請輸入完整的開高低收四個價格'}
            </p>
          )}
          <FormulaList
            formulas={formulas}
            ohlc={activeOhlc}
            onEdit={openEdit}
            onDelete={deleteFormula}
          />
        </section>
      </main>

      <footer className="mx-auto max-w-5xl px-4 pb-8 text-center text-xs text-slate-500 dark:text-slate-500">
        資料來源：TWSE / TPEx 公開資料。本工具僅供研究參考，不構成投資建議。
      </footer>

      <FormulaEditor
        open={editorOpen}
        initial={editing}
        onClose={() => setEditorOpen(false)}
        onSave={saveFormula}
      />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ' +
        (active
          ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100'
          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200')
      }
    >
      {children}
    </button>
  );
}
