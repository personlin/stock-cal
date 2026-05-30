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
};

type IsinEntry = { ticker: string; name: string; market: 'TWSE' | 'TPEx' };

let isinCache: { at: number; entries: IsinEntry[] } | null = null;
const ISIN_TTL_MS = 24 * 60 * 60 * 1000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      ...CORS,
    },
  });
}

async function loadIsin(): Promise<IsinEntry[]> {
  const now = Date.now();
  if (isinCache && now - isinCache.at < ISIN_TTL_MS) return isinCache.entries;

  const entries: IsinEntry[] = [];
  const urls: Array<{ url: string; market: 'TWSE' | 'TPEx' }> = [
    { url: 'https://isin.twse.com.tw/isin/C_public.jsp?strMode=2', market: 'TWSE' },
    { url: 'https://isin.twse.com.tw/isin/C_public.jsp?strMode=4', market: 'TPEx' },
  ];

  for (const { url, market } of urls) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 stock-cal/1.0' },
      });
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      const html = new TextDecoder('big5').decode(buf);
      const re = /<td[^>]*>(\d{4,6})　([^<]+)<\/td>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) !== null) {
        const ticker = m[1];
        const name = m[2].trim();
        if (ticker.length === 4) entries.push({ ticker, name, market });
      }
    } catch {
      // ignore individual market failure
    }
  }

  if (entries.length > 0) isinCache = { at: now, entries };
  return entries;
}

async function resolveTicker(query: string): Promise<IsinEntry | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  if (/^\d{4}$/.test(trimmed)) {
    const all = await loadIsin();
    const found = all.find((e) => e.ticker === trimmed);
    if (found) return found;
    return { ticker: trimmed, name: trimmed, market: 'TWSE' };
  }
  const all = await loadIsin();
  const exact = all.find((e) => e.name === trimmed);
  if (exact) return exact;
  const partial = all.find((e) => e.name.includes(trimmed));
  return partial ?? null;
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
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 stock-cal/1.0' },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { stat?: string; data?: string[][] };
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
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 stock-cal/1.0' },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    tables?: Array<{ data?: string[][] }>;
  };
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

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'GET') return json(405, { error: 'Method not allowed' });

  const url = new URL(req.url);
  const query = url.searchParams.get('ticker') ?? url.searchParams.get('q');
  if (!query) return json(400, { error: '缺少 ticker 參數' });

  try {
    const resolved = await resolveTicker(query);
    if (!resolved) return json(404, { error: `找不到 "${query}" 對應的股票` });

    let days = await fetchRecent5(resolved.ticker, resolved.market);
    let market = resolved.market;
    if (days.length === 0) {
      const other: 'TWSE' | 'TPEx' = resolved.market === 'TWSE' ? 'TPEx' : 'TWSE';
      const altDays = await fetchRecent5(resolved.ticker, other);
      if (altDays.length > 0) {
        days = altDays;
        market = other;
      }
    }

    if (days.length === 0) {
      return json(404, { error: `查無 ${resolved.ticker} ${resolved.name} 的近期成交資料` });
    }

    const body: Quote = {
      ticker: resolved.ticker,
      name: resolved.name,
      market,
      days,
      fetchedAt: new Date().toISOString(),
    };
    return json(200, body);
  } catch (err) {
    return json(500, { error: err instanceof Error ? err.message : 'Unknown error' });
  }
}

export const config: Config = {
  path: '/api/quote',
};
