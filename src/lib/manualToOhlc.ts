import type { DailyOHLC } from '../shared/types';

type ManualOhlcInput = {
  open: string;
  high: string;
  low: string;
  close: string;
};

export function manualToOhlc(v: ManualOhlcInput): DailyOHLC | null {
  const open = parseFloat(v.open);
  const high = parseFloat(v.high);
  const low = parseFloat(v.low);
  const close = parseFloat(v.close);
  if (![open, high, low, close].every(Number.isFinite)) return null;
  return { date: '手動輸入', open, high, low, close };
}
