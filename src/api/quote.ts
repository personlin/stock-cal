import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { QuoteResponse } from '../shared/types';

export function todayMarketDateKey(now: Date = new Date()): string {
  // Treat 14:00 Asia/Taipei as the cutoff; before that, key by yesterday's date.
  const taipeiMillis = now.getTime() + now.getTimezoneOffset() * 60_000 + 8 * 60 * 60_000;
  const taipei = new Date(taipeiMillis);
  if (taipei.getUTCHours() < 14) taipei.setUTCDate(taipei.getUTCDate() - 1);
  const y = taipei.getUTCFullYear();
  const m = String(taipei.getUTCMonth() + 1).padStart(2, '0');
  const d = String(taipei.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function fetchQuote(ticker: string): Promise<QuoteResponse> {
  const res = await fetch(`/api/quote?ticker=${encodeURIComponent(ticker)}`);
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // swallow body-parse failure; fall back to status code
    }
    throw new Error(message);
  }
  return (await res.json()) as QuoteResponse;
}

export function useQuote(ticker: string | null) {
  return useQuery({
    queryKey: ['quote', ticker, todayMarketDateKey()],
    queryFn: () => fetchQuote(ticker as string),
    enabled: Boolean(ticker),
    staleTime: Infinity,
    gcTime: 7 * 24 * 60 * 60 * 1000,
    retry: 1,
  });
}

export function useInvalidateQuotes() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['quote'] });
}
