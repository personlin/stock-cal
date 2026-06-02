export type DailyOHLC = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export type QuoteResponse = {
  ticker: string;
  name: string;
  market: 'TWSE' | 'TPEx';
  days: DailyOHLC[];
  fetchedAt: string;
  stale?: boolean;
  warning?: string;
};

export type Formula = {
  id: string;
  name: string;
  expression: string;
  isBuiltin: boolean;
  createdAt: string;
};
