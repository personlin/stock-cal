import type { Config } from '@netlify/functions';

type DailyOHLC = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

type Quote = {
  ticker: string;
  name: string;
  market: 'TWSE' | 'TPEx';
  days: DailyOHLC[];
  fetchedAt: string;
  stale?: boolean;
  warning?: string;
};

type IsinEntry = { ticker: string; name: string; market: 'TWSE' | 'TPEx' };

let isinCache: { at: number; entries: IsinEntry[] } | null = null;
let finmindInfoCache: { at: number; entries: IsinEntry[] } | null = null;
const ISIN_TTL_MS = 24 * 60 * 60 * 1000;
const FINMIND_INFO_TTL_MS = 24 * 60 * 60 * 1000;
const QUOTE_CACHE_TTL_MS = 5 * 60 * 1000;
const QUOTE_STALE_TTL_MS = 24 * 60 * 60 * 1000;
const UPSTREAM_TIMEOUT_MS = 4_000;
const UPSTREAM_ATTEMPTS = 2;

// FinMind 提供單一 JSON API 同時涵蓋上市(TWSE)與上櫃(TPEx)，速度遠快於逐月抓
// TWSE/TPEx 再加上 Big5 的 ISIN 對照表。設定 FINMIND_TOKEN 可提高速率上限。
const FINMIND_API = 'https://api.finmindtrade.com/api/v4/data';
const FINMIND_TOKEN = process.env.FINMIND_TOKEN ?? '';
// 往前抓 30 天日曆日，足以涵蓋連假後仍取得最近 5 個交易日。
const FINMIND_LOOKBACK_DAYS = 30;
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const SUCCESS_CACHE_CONTROL = 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600';
const STALE_CACHE_CONTROL = 'no-store';
const ERROR_CACHE_CONTROL = 'no-store';

const quoteCache = new Map<string, { at: number; quote: Quote }>();

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

class UpstreamFetchError extends Error {
  readonly status?: number;
  readonly source: string;

  constructor(source: string, message: string, status?: number) {
    super(message);
    this.name = 'UpstreamFetchError';
    this.source = source;
    this.status = status;
  }
}

function json(status: number, body: unknown, cacheControl?: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cacheControl ?? (status >= 200 && status < 300 ? SUCCESS_CACHE_CONTROL : ERROR_CACHE_CONTROL),
      ...CORS,
    },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cacheKey(query: string): string {
  return query.trim().toUpperCase();
}

function getCachedQuote(query: string, maxAgeMs: number): Quote | null {
  const cached = quoteCache.get(cacheKey(query));
  if (!cached) return null;
  if (Date.now() - cached.at > maxAgeMs) return null;
  return cached.quote;
}

function setCachedQuote(keys: string[], quote: Quote): void {
  const cleanQuote: Quote = { ...quote };
  delete cleanQuote.stale;
  delete cleanQuote.warning;

  for (const key of new Set(keys.map(cacheKey).filter(Boolean))) {
    quoteCache.set(key, { at: Date.now(), quote: cleanQuote });
  }
}

function staleQuote(quote: Quote, warning: string): Quote {
  return { ...quote, stale: true, warning };
}

async function fetchUpstream(url: string, source: string): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < UPSTREAM_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 stock-cal/1.0',
          Accept: 'application/json,text/html;q=0.9,*/*;q=0.8',
        },
        signal: controller.signal,
      });

      if (res.ok) return res;

      const error = new UpstreamFetchError(source, `${source} 回應 HTTP ${res.status}`, res.status);
      if (!RETRYABLE_STATUS.has(res.status)) throw error;
      lastError = error;
    } catch (err) {
      if (err instanceof UpstreamFetchError && err.status && !RETRYABLE_STATUS.has(err.status)) {
        throw err;
      }
      lastError =
        err instanceof UpstreamFetchError
          ? err
          : new UpstreamFetchError(source, `${source} 暫時無法連線或連線逾時`);
    } finally {
      clearTimeout(timeout);
    }

    if (attempt < UPSTREAM_ATTEMPTS - 1) {
      await sleep(250 * 2 ** attempt);
    }
  }

  throw lastError ?? new UpstreamFetchError(source, `${source} 暫時無法取得資料`);
}

async function readJson<T>(res: Response, source: string): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    throw new UpstreamFetchError(source, `${source} 回應格式異常`);
  }
}

async function loadIsin(): Promise<IsinEntry[]> {
  const now = Date.now();
  if (isinCache && now - isinCache.at < ISIN_TTL_MS) return isinCache.entries;

  const entries: IsinEntry[] = [];
  const urls: Array<{ url: string; market: 'TWSE' | 'TPEx' }> = [
    { url: 'https://isin.twse.com.tw/isin/C_public.jsp?strMode=2', market: 'TWSE' },
    { url: 'https://isin.twse.com.tw/isin/C_public.jsp?strMode=4', market: 'TPEx' },
  ];

  let firstError: UpstreamFetchError | null = null;
  for (const { url, market } of urls) {
    try {
      const res = await fetchUpstream(url, `ISIN ${market}`);
      const buf = await res.arrayBuffer();
      const html = new TextDecoder('big5').decode(buf);
      const re = /<td[^>]*>(\d{4,6})\u3000([^<]+)<\/td>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) !== null) {
        const ticker = m[1];
        const name = m[2].trim();
        if (ticker.length === 4) entries.push({ ticker, name, market });
      }
    } catch (err) {
      if (!firstError && err instanceof UpstreamFetchError) firstError = err;
      // ignore individual market failure
    }
  }

  if (entries.length > 0) isinCache = { at: now, entries };
  if (entries.length === 0 && isinCache) return isinCache.entries;
  if (entries.length === 0 && firstError) throw firstError;
  return entries;
}

async function lookupIsinByTicker(ticker: string): Promise<IsinEntry | null> {
  try {
    const all = await loadIsin();
    return all.find((e) => e.ticker === ticker) ?? null;
  } catch {
    return null;
  }
}

async function resolveTicker(query: string): Promise<IsinEntry | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  if (/^\d{4}$/.test(trimmed)) {
    const found = await lookupIsinByTicker(trimmed);
    if (found) return found;
    return { ticker: trimmed, name: trimmed, market: 'TWSE' };
  }
  const all = await loadIsin();
  const exact = all.find((e) => e.name === trimmed);
  if (exact) return exact;
  const partial = all.find((e) => e.name.includes(trimmed));
  return partial ?? null;
}

function finmindUrl(params: Record<string, string>): string {
  const search = new URLSearchParams(params);
  if (FINMIND_TOKEN) search.set('token', FINMIND_TOKEN);
  return `${FINMIND_API}?${search.toString()}`;
}

type FinMindResponse<T> = { msg?: string; status?: number; data?: T[] };

// 載入 FinMind 的全市場代號 ↔ 名稱 ↔ 市場對照表（JSON，較 ISIN 的 Big5 HTML 快）。
async function loadFinMindInfo(): Promise<IsinEntry[]> {
  const now = Date.now();
  if (finmindInfoCache && now - finmindInfoCache.at < FINMIND_INFO_TTL_MS) {
    return finmindInfoCache.entries;
  }

  const res = await fetchUpstream(finmindUrl({ dataset: 'TaiwanStockInfo' }), 'FinMind');
  const body = await readJson<
    FinMindResponse<{ stock_id: string; stock_name: string; type: string }>
  >(res, 'FinMind');

  const entries: IsinEntry[] = [];
  for (const row of body.data ?? []) {
    const market = row.type === 'twse' ? 'TWSE' : row.type === 'tpex' ? 'TPEx' : null;
    if (!market) continue; // 略過興櫃(emerging)等非上市櫃
    if (!/^\d{4}$/.test(row.stock_id)) continue;
    entries.push({ ticker: row.stock_id, name: row.stock_name, market });
  }

  if (entries.length > 0) finmindInfoCache = { at: now, entries };
  if (entries.length === 0 && finmindInfoCache) return finmindInfoCache.entries;
  return entries;
}

async function resolveFinMind(query: string): Promise<IsinEntry | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  let entries: IsinEntry[];
  try {
    entries = await loadFinMindInfo();
  } catch {
    // 對照表失敗時，純數字代號仍可直接查價（市場暫以 TWSE 標示）。
    if (/^\d{4}$/.test(trimmed)) return { ticker: trimmed, name: trimmed, market: 'TWSE' };
    return null;
  }

  if (/^\d{4}$/.test(trimmed)) {
    const found = entries.find((e) => e.ticker === trimmed);
    return found ?? { ticker: trimmed, name: trimmed, market: 'TWSE' };
  }
  const exact = entries.find((e) => e.name === trimmed);
  if (exact) return exact;
  const partial = entries.find((e) => e.name.includes(trimmed));
  return partial ?? null;
}

async function fetchFinMindDays(ticker: string): Promise<DailyOHLC[]> {
  const start = new Date(Date.now() - FINMIND_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const startDate = start.toISOString().slice(0, 10);
  const res = await fetchUpstream(
    finmindUrl({ dataset: 'TaiwanStockPrice', data_id: ticker, start_date: startDate }),
    'FinMind',
  );
  const body = await readJson<
    FinMindResponse<{
      date: string;
      open: number;
      max: number;
      min: number;
      close: number;
      Trading_Volume?: number;
    }>
  >(res, 'FinMind');

  return (body.data ?? [])
    .map((row) => ({
      date: row.date,
      open: row.open,
      high: row.max,
      low: row.min,
      close: row.close,
      volume: row.Trading_Volume,
    }))
    .filter((d) => Number.isFinite(d.open) && Number.isFinite(d.close))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-5);
}

async function fetchFinMindQuote(query: string): Promise<Quote | null> {
  const resolved = await resolveFinMind(query);
  if (!resolved) return null;

  const days = await fetchFinMindDays(resolved.ticker);
  if (days.length === 0) return null;

  return {
    ticker: resolved.ticker,
    name: resolved.name,
    market: resolved.market,
    days,
    fetchedAt: new Date().toISOString(),
  };
}

// Yahoo Finance 圖表 API —— 即 yfinance 套件底層所用的端點。台股代號後綴：
// 上市(TWSE) 用 `.TW`、上櫃(TPEx) 用 `.TWO`。純 HTTP，可直接在 Node Function 內呼叫。
const YAHOO_CHART_API = 'https://query1.finance.yahoo.com/v8/finance/chart';

function marketSuffix(market: 'TWSE' | 'TPEx'): string {
  return market === 'TWSE' ? '.TW' : '.TWO';
}

type YahooChart = {
  chart?: {
    result?: Array<{
      meta?: { shortName?: string; longName?: string };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
          volume?: (number | null)[];
        }>;
      };
    }>;
  };
};

async function fetchYahooSymbol(symbol: string): Promise<{ days: DailyOHLC[]; name: string | null }> {
  const url = `${YAHOO_CHART_API}/${encodeURIComponent(symbol)}?interval=1d&range=1mo`;
  const res = await fetchUpstream(url, 'Yahoo');
  const body = await readJson<YahooChart>(res, 'Yahoo');
  const result = body.chart?.result?.[0];
  const ts = result?.timestamp;
  const q = result?.indicators?.quote?.[0];
  if (!result || !ts || !q) return { days: [], name: null };

  const days: DailyOHLC[] = ts
    .map((t, i) => {
      const vol = q.volume?.[i];
      return {
        // Yahoo 的每日 timestamp 為 UTC 秒數，加 8 小時換算台北日期。
        date: new Date((t + 8 * 3600) * 1000).toISOString().slice(0, 10),
        open: q.open?.[i] ?? NaN,
        high: q.high?.[i] ?? NaN,
        low: q.low?.[i] ?? NaN,
        close: q.close?.[i] ?? NaN,
        volume: typeof vol === 'number' ? vol : undefined,
      };
    })
    .filter((d) => Number.isFinite(d.open) && Number.isFinite(d.close))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-5);

  return { days, name: result.meta?.shortName ?? result.meta?.longName ?? null };
}

// 名稱／市場解析：先試 FinMind 對照表，失敗再退回 ISIN（供 Yahoo 路徑解析中文名稱用）。
async function resolveAnySource(query: string): Promise<IsinEntry | null> {
  try {
    const r = await resolveFinMind(query);
    if (r) return r;
  } catch {
    // ignore, fall back to ISIN
  }
  try {
    return await resolveTicker(query);
  } catch {
    return null;
  }
}

async function fetchYahooQuote(query: string): Promise<Quote | null> {
  const trimmed = query.trim();
  const resolved = await resolveAnySource(trimmed);
  const ticker = resolved?.ticker ?? (/^\d{4}$/.test(trimmed) ? trimmed : null);
  if (!ticker) return null;

  const markets: Array<'TWSE' | 'TPEx'> = resolved
    ? [resolved.market, otherMarket(resolved.market)]
    : ['TWSE', 'TPEx'];

  const upstreamErrors: UpstreamFetchError[] = [];
  for (const market of markets) {
    try {
      const { days, name } = await fetchYahooSymbol(`${ticker}${marketSuffix(market)}`);
      if (days.length > 0) {
        const chineseName = resolved?.name && resolved.name !== ticker ? resolved.name : null;
        return {
          ticker,
          name: chineseName ?? name ?? ticker,
          market,
          days,
          fetchedAt: new Date().toISOString(),
        };
      }
    } catch (err) {
      if (err instanceof UpstreamFetchError) {
        upstreamErrors.push(err);
        continue;
      }
      throw err;
    }
  }

  if (upstreamErrors.length > 0) throw upstreamErrors[0];
  return null;
}

function rocToAd(rocDate: string): string {
  const m = rocDate.match(/^(\d{2,3})\/(\d{1,2})\/(\d{1,2})$/);
  if (!m) return rocDate;
  const year = parseInt(m[1], 10) + 1911;
  const month = m[2].padStart(2, '0');
  const day = m[3].padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseNum(s: string): number {
  return parseFloat(s.replace(/,/g, ''));
}

async function fetchTwseMonth(ticker: string, yyyymm: string): Promise<DailyOHLC[]> {
  const url = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${yyyymm}01&stockNo=${ticker}`;
  const res = await fetchUpstream(url, 'TWSE');
  const data = await readJson<{ stat?: string; data?: string[][] }>(res, 'TWSE');
  if (data.stat !== 'OK' || !data.data) return [];
  return data.data
    .map((row) => ({
      date: rocToAd(row[0]),
      open: parseNum(row[3]),
      high: parseNum(row[4]),
      low: parseNum(row[5]),
      close: parseNum(row[6]),
      volume: parseNum(row[1]),
    }))
    .filter((d) => Number.isFinite(d.open) && Number.isFinite(d.close));
}

async function fetchTpexMonth(ticker: string, year: number, month: number): Promise<DailyOHLC[]> {
  const mm = String(month).padStart(2, '0');
  const url = `https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock?code=${ticker}&date=${year}/${mm}/01&id=&response=json`;
  const res = await fetchUpstream(url, 'TPEx');
  const data = await readJson<{
    tables?: Array<{ data?: string[][] }>;
  }>(res, 'TPEx');
  const rows = data.tables?.[0]?.data;
  if (!rows || rows.length === 0) return [];
  return rows
    .map((row) => ({
      date: rocToAd(row[0]),
      open: parseNum(row[3]),
      high: parseNum(row[4]),
      low: parseNum(row[5]),
      close: parseNum(row[6]),
      volume: parseNum(row[1]),
    }))
    .filter((d) => Number.isFinite(d.open) && Number.isFinite(d.close));
}

async function fetchRecent5(ticker: string, market: 'TWSE' | 'TPEx'): Promise<DailyOHLC[]> {
  const now = new Date();
  const months: Array<{ y: number; m: number }> = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ y: d.getFullYear(), m: d.getMonth() + 1 });
  }

  let collected: DailyOHLC[] = [];
  for (const { y, m } of months) {
    const yyyymm = `${y}${String(m).padStart(2, '0')}`;
    const rows =
      market === 'TWSE'
        ? await fetchTwseMonth(ticker, yyyymm)
        : await fetchTpexMonth(ticker, y, m);
    collected = [...rows, ...collected];
    const byDate = new Map(collected.map((r) => [r.date, r]));
    collected = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
    if (collected.length >= 5) return collected.slice(-5);
  }
  return collected.slice(-5);
}

function otherMarket(market: 'TWSE' | 'TPEx'): 'TWSE' | 'TPEx' {
  return market === 'TWSE' ? 'TPEx' : 'TWSE';
}

async function fetchResolvedQuote(resolved: IsinEntry): Promise<Quote | null> {
  const markets: Array<'TWSE' | 'TPEx'> = [resolved.market, otherMarket(resolved.market)];
  const upstreamErrors: UpstreamFetchError[] = [];

  for (const market of markets) {
    try {
      const days = await fetchRecent5(resolved.ticker, market);
      if (days.length > 0) {
        return {
          ticker: resolved.ticker,
          name: resolved.name,
          market,
          days,
          fetchedAt: new Date().toISOString(),
        };
      }
    } catch (err) {
      if (err instanceof UpstreamFetchError) {
        upstreamErrors.push(err);
        continue;
      }
      throw err;
    }
  }

  if (upstreamErrors.length > 0) throw upstreamErrors[0];
  return null;
}

async function fetchNumericQuote(ticker: string): Promise<Quote | null> {
  const upstreamErrors: UpstreamFetchError[] = [];

  for (const market of ['TWSE', 'TPEx'] as const) {
    try {
      const days = await fetchRecent5(ticker, market);
      if (days.length > 0) {
        const isin = await lookupIsinByTicker(ticker);
        return {
          ticker,
          name: isin?.name ?? ticker,
          market,
          days,
          fetchedAt: new Date().toISOString(),
        };
      }
    } catch (err) {
      if (err instanceof UpstreamFetchError) {
        upstreamErrors.push(err);
        continue;
      }
      throw err;
    }
  }

  if (upstreamErrors.length > 0) throw upstreamErrors[0];
  return null;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'GET') return json(405, { error: 'Method not allowed' });

  const url = new URL(req.url);
  const query = url.searchParams.get('ticker') ?? url.searchParams.get('q');
  if (!query) return json(400, { error: '缺少 ticker 參數' });

  const trimmed = query.trim();
  if (!trimmed) return json(400, { error: '缺少 ticker 參數' });

  const cached = getCachedQuote(trimmed, QUOTE_CACHE_TTL_MS);
  if (cached) return json(200, cached);

  // 依序嘗試快速來源：FinMind（單一 JSON、涵蓋上市櫃）→ Yahoo（yfinance 同源端點）。
  // 兩者皆失敗或查無資料時，再退回 TWSE/TPEx 原始來源。
  let primaryError: UpstreamFetchError | null = null;
  const fastSources: Array<{ name: string; fetch: (q: string) => Promise<Quote | null> }> = [
    { name: 'FinMind', fetch: fetchFinMindQuote },
    { name: 'Yahoo', fetch: fetchYahooQuote },
  ];
  for (const source of fastSources) {
    try {
      const quote = await source.fetch(trimmed);
      if (quote) {
        setCachedQuote([trimmed, quote.ticker, `${quote.ticker}:${quote.market}`], quote);
        return json(200, quote);
      }
    } catch (err) {
      if (err instanceof UpstreamFetchError) {
        if (!primaryError) primaryError = err;
      } else {
        throw err;
      }
    }
  }

  try {
    const quote = /^\d{4}$/.test(trimmed)
      ? await fetchNumericQuote(trimmed)
      : await (async () => {
          const resolved = await resolveTicker(trimmed);
          if (!resolved) return null;
          return fetchResolvedQuote(resolved);
        })();

    if (!quote) {
      if (primaryError) throw primaryError;
      return json(404, { error: `查無 "${query}" 的近期成交資料` });
    }

    setCachedQuote([trimmed, quote.ticker, `${quote.ticker}:${quote.market}`], quote);
    return json(200, quote);
  } catch (err) {
    if (err instanceof UpstreamFetchError) {
      const stale = getCachedQuote(trimmed, QUOTE_STALE_TTL_MS);
      if (stale) {
        return json(
          200,
          staleQuote(stale, '資料來源暫時無法更新，已顯示伺服器快取的上次成功資料。'),
          STALE_CACHE_CONTROL,
        );
      }

      return json(
        503,
        { error: `${err.source} 資料來源暫時無法回應，請稍後再試。` },
        ERROR_CACHE_CONTROL,
      );
    }

    return json(500, { error: err instanceof Error ? err.message : 'Unknown error' });
  }
}

export const config: Config = {
  path: '/api/quote',
};
