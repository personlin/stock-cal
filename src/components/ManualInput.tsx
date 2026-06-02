type Props = {
  value: { open: string; high: string; low: string; close: string };
  onChange: (next: Props['value']) => void;
};

const FIELDS: Array<{ key: keyof Props['value']; label: string }> = [
  { key: 'open', label: '開盤價' },
  { key: 'high', label: '最高價' },
  { key: 'low', label: '最低價' },
  { key: 'close', label: '收盤價' },
];

export function ManualInput({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {FIELDS.map(({ key, label }) => (
        <label key={key} className="flex flex-col gap-1 text-sm">
          <span className="text-slate-500 dark:text-slate-400">{label}</span>
          <input
            type="number"
            step="any"
            inputMode="decimal"
            value={value[key]}
            onChange={(e) => onChange({ ...value, [key]: e.target.value })}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono tabular-nums shadow-sm focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 dark:border-slate-700 dark:bg-slate-900 dark:focus:border-slate-100"
            placeholder="0.00"
          />
        </label>
      ))}
    </div>
  );
}
