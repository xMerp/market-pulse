const UPSTOX_API = 'https://api.upstox.com';
const NIFTY50_INDEX_KEY = 'NSE_INDEX|Nifty 50';
const configuredCacheSeconds = Number(process.env.UPSTOX_INSTRUMENT_CACHE_SECONDS || 86_400);
const INSTRUMENT_CACHE_TTL = Math.max(600, Number.isFinite(configuredCacheSeconds) ? configuredCacheSeconds : 86_400) * 1000;
const LOOKUP_CONCURRENCY = 10;

let instrumentCache = new Map();
let instrumentCacheExpiresAt = 0;
let instrumentLookupPromise = null;

const SEARCH_QUERIES = {
  'BAJAJ-AUTO':'BAJAJ AUTO',
  'M&M':'MAHINDRA MAHINDRA',
  LT:'LARSEN TOUBRO',
  TMPV:'TATA MOTORS PASSENGER VEHICLES',
};

function canonicalSymbol(value = '') {
  return String(value).toLocaleUpperCase('en-IN').replace(/[^A-Z0-9]/g, '');
}

function requestSignal(signal, timeoutMs) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function requestJson(url, token, signal, timeoutMs = 8_000) {
  const response = await fetch(url, {
    headers:{ Accept:'application/json', Authorization:`Bearer ${token}` },
    cache:'no-store',
    signal:requestSignal(signal, timeoutMs),
  });
  if (!response.ok) throw new Error(`Upstox returned ${response.status}`);
  const body = await response.json();
  if (body.status && body.status !== 'success') throw new Error('Upstox did not return a successful response');
  return body;
}

async function lookupInstrument(symbol, token, signal) {
  const query = SEARCH_QUERIES[symbol] || symbol;
  const url = new URL('/v2/instruments/search', UPSTOX_API);
  url.search = new URLSearchParams({
    query,
    exchanges:'NSE',
    segments:'EQ',
    page_number:'1',
    records:'30',
  }).toString();
  const body = await requestJson(url, token, signal);
  const rows = Array.isArray(body.data) ? body.data : [];
  const matching = rows.filter((row) => row.segment === 'NSE_EQ' && row.exchange === 'NSE');
  const exact = matching.find((row) => canonicalSymbol(row.trading_symbol) === canonicalSymbol(symbol));
  const instrument = exact || matching.find((row) => canonicalSymbol(row.short_name) === canonicalSymbol(symbol));
  if (!instrument?.instrument_key) return null;
  return { instrumentKey:instrument.instrument_key, name:instrument.short_name || instrument.name || symbol };
}

async function mapWithConcurrency(values, concurrency, work) {
  const results = Array(values.length);
  let next = 0;
  await Promise.all(Array.from({ length:Math.min(concurrency, values.length) }, async () => {
    while (next < values.length) {
      const index = next++;
      try { results[index] = await work(values[index]); }
      catch { results[index] = null; }
    }
  }));
  return results;
}

async function resolveInstruments(symbols, token, signal) {
  const now = Date.now();
  const cachedCount = symbols.filter((symbol) => instrumentCache.has(symbol)).length;
  const cacheIsFresh = instrumentCacheExpiresAt > now && cachedCount >= 45;
  if (cacheIsFresh) return instrumentCache;
  if (instrumentLookupPromise) return instrumentLookupPromise;

  instrumentLookupPromise = (async () => {
    const rows = await mapWithConcurrency(symbols, LOOKUP_CONCURRENCY, (symbol) => lookupInstrument(symbol, token, signal));
    const found = new Map(rows.flatMap((row, index) => row ? [[symbols[index], row]] : []));
    if (found.size < 45) throw new Error(`Upstox resolved only ${found.size} of 50 NIFTY 50 instruments`);
    instrumentCache = found;
    instrumentCacheExpiresAt = Date.now() + INSTRUMENT_CACHE_TTL;
    return instrumentCache;
  })().finally(() => { instrumentLookupPromise = null; });
  return instrumentLookupPromise;
}

function number(value) {
  if (value === null || value === undefined || value === '') return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function tradeTimestamp(row) {
  const raw = row?.last_trade_time;
  const milliseconds = Number(raw);
  if (Number.isFinite(milliseconds) && milliseconds > 1_000_000_000_000) return new Date(milliseconds).toISOString();
  return raw || row?.timestamp || null;
}

function changePercent(row) {
  const price = number(row?.last_price);
  const previousClose = number(row?.prev_close_price);
  if (price === null || previousClose === null || previousClose <= 0) return null;
  return (price - previousClose) / previousClose * 100;
}

function normalizeQuote(row, symbol, name) {
  const lastPrice = number(row?.last_price);
  const previousClose = number(row?.prev_close_price);
  const change = number(row?.net_change) ?? (lastPrice !== null && previousClose !== null ? lastPrice - previousClose : null);
  return {
    symbol,
    name,
    lastPrice,
    pChange:changePercent(row),
    change,
    timestamp:tradeTimestamp(row),
  };
}

export async function getUpstoxNiftySnapshot(symbols = [], { signal } = {}) {
  const token = process.env.UPSTOX_ACCESS_TOKEN?.trim();
  if (!token) throw new Error('UPSTOX_ACCESS_TOKEN is not configured');

  const uniqueSymbols = [...new Set(symbols.map((symbol) => String(symbol).trim().toUpperCase()).filter(Boolean))];
  const instruments = await resolveInstruments(uniqueSymbols, token, signal);
  const instrumentKeys = [NIFTY50_INDEX_KEY, ...uniqueSymbols.flatMap((symbol) => {
    const instrument = instruments.get(symbol);
    return instrument ? [instrument.instrumentKey] : [];
  })];
  const url = new URL('/v3/market-quote/quotes', UPSTOX_API);
  url.searchParams.set('instrument_key', instrumentKeys.join(','));
  const response = await requestJson(url, token, signal, 12_000);
  const entries = Object.values(response.data || {}).filter((row) => row && typeof row === 'object');
  const rowsBySymbol = new Map(entries.map((row) => [canonicalSymbol(row.symbol), row]));
  const stocks = uniqueSymbols.flatMap((symbol) => {
    const row = rowsBySymbol.get(canonicalSymbol(symbol));
    if (!row) return [];
    return [normalizeQuote(row, symbol, instruments.get(symbol)?.name || symbol)];
  });
  const indexQuote = entries.find((row) => row.instrument_token === NIFTY50_INDEX_KEY)
    || entries.find((row) => /nifty\s*50/i.test(`${row.symbol || ''} ${row.name || ''}`));
  if (!indexQuote) throw new Error('Upstox did not return the NIFTY 50 index quote');

  const index = normalizeQuote(indexQuote, 'NIFTY 50', 'NIFTY 50');
  const marketData = { stocks, index:{ ...index, indexName:'NIFTY 50', price:index.lastPrice } };
  return {
    marketData,
    freshness:'Upstox full market quote snapshot',
    tool:'Full Market Quotes V3',
    quoteCount:stocks.filter((row) => row.lastPrice !== null && row.pChange !== null).length,
    quoteErrors:uniqueSymbols.filter((symbol) => !rowsBySymbol.has(canonicalSymbol(symbol))).map((symbol) => ({ symbol, message:'Quote unavailable' })),
    fetchedAt:new Date().toISOString(),
  };
}
