import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { QuoteResponse } from '../shared/types';

export type QuoteFetchError = Error & {
  status?: number;
  transient?: boolean;
};

const TRANSIENT_STATUS = new Set([429, 502, 503, 504]);

function createQuoteError(message: string, status?: number): QuoteFetchError {
  const err = new Error(message) as QuoteFetchError;
  err.status = status;
  err.transient = status ? TRANSIENT_STATUS.has(status) : true;
  return err;
}

export function isTransientQuoteError(error: unknown): boolean {
  return Boolean((error as QuoteFetchError | undefined)?.transient);
}

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
  let res: Response;
  try {
    res = await fetch(`/api/quote?ticker=${encodeURIComponent(ticker)}`);
  } catch {
    throw createQuoteError('網路連線暫時失敗，請稍後再試。');
  }

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // swallow body-parse failure; fall back to status code
    }
    throw createQuoteError(message, res.status);
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
    retry: (failureCount, error) => {
      const status = (error as QuoteFetchError).status;
      if (status && [400, 404, 405].includes(status)) return false;
      return isTransientQuoteError(error) && failureCount < 2;
    },
    retryDelay: (failureCount) => Math.min(750 * 2 ** (failureCount - 1), 3_000),
  });
}

export function useInvalidateQuotes() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['quote'] });
}
