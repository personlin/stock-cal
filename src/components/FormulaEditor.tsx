import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { Formula } from '../shared/types';
import { validateExpression } from '../lib/formula';

type Props = {
  open: boolean;
  initial: Formula | null;
  onClose: () => void;
  onSave: (input: { id?: string; name: string; expression: string }) => void;
};

export function FormulaEditor({ open, initial, onClose, onSave }: Props) {
  const [name, setName] = useState('');
  const [expression, setExpression] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '');
      setExpression(initial?.expression ?? '');
      setError(null);
    }
  }, [open, initial]);

  if (!open) return null;

  function handleSubmit() {
    const trimmedName = name.trim();
    const trimmedExpr = expression.trim();
    if (!trimmedName) {
      setError('請輸入公式名稱');
      return;
    }
    if (!trimmedExpr) {
      setError('請輸入公式表達式');
      return;
    }
    const result = validateExpression(trimmedExpr);
    if (!result.ok) {
      setError(`公式無法解析：${result.error}`);
      return;
    }
    onSave({ id: initial?.id, name: trimmedName, expression: trimmedExpr });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{initial ? '編輯公式' : '新增公式'}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉"
            className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500 dark:text-slate-400">名稱</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：第二壓力價"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 shadow-sm focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500 dark:text-slate-400">公式表達式</span>
            <input
              value={expression}
              onChange={(e) => setExpression(e.target.value)}
              placeholder="例如：(H + L) / 2"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono shadow-sm focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-100"
            />
            <span className="text-xs text-slate-500 dark:text-slate-400">
              可用變數：<code className="font-mono">O</code> 開盤、<code className="font-mono">H</code> 最高、
              <code className="font-mono">L</code> 最低、<code className="font-mono">C</code> 收盤、
              <code className="font-mono">AVG</code> (O+H+L+C)/4。支援 + − × ÷ 與括號。
            </span>
          </label>
          {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
          >
            儲存
          </button>
        </div>
      </div>
    </div>
  );
}
