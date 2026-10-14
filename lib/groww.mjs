const GROWW_API = 'https://api.groww.in';
const REQUESTS_PER_BATCH = 9;
const BATCH_INTERVAL_MS = 1_050;

function requestSignal(signal, timeoutMs) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function getQuote(symbol, token, signal) {
  const url = new URL('/v1/live-data/quote', GROWW_API);
  url.search = new URLSearchParams({ exchange:'NSE', segment:'CASH', trading_symbol:symbol }).toString();
  const response = await fetch(url, {
    headers:{ Accept:'application/json', Authorization:`Bearer ${token}`, 'X-API-VERSION':'1.0' },
    cache:'no-store',
    signal:requestSignal(signal, 8_000),
  });
  if (!response.ok) throw new Error(`Groww returned ${response.status} for ${symbol}`);
  const body = await response.json();
  if (body.status !== 'SUCCESS' || !body.payload || typeof body.payload !== 'object') {
    throw new Error(`Groww did not return a quote for ${symbol}`);
  }
  return body.payload;
}

function number(value) {
  if (value === null || value === undefined || value === '') return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function tradeTimestamp(value) {
  const milliseconds = Number(value);
  if (Number.isFinite(milliseconds) && milliseconds > 1_000_000_000_000) return new Date(milliseconds).toISOString();
  return value ? String(value) : null;
}

function normalizeQuote(payload, symbol, name) {
  const lastPrice = number(payload.last_price);
  const change = number(payload.day_change);
  return {
    symbol,
    name,
    lastPrice,
    pChange:number(payload.day_change_perc),
    change,
    timestamp:tradeTimestamp(payload.last_trade_time),
  };
}

function pause(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function getGrowwNiftySnapshot(stocks = [], { signal } = {}) {
  const token = process.env.GROWW_ACCESS_TOKEN?.trim();
  if (!token) throw new Error('GROWW_ACCESS_TOKEN is not configured');

  const uniqueStocks = [...new Map(stocks.map((stock) => [String(stock.symbol).trim().toUpperCase(), stock])).values()];
  const instruments = [
    ...uniqueStocks.map((stock) => ({ symbol:stock.symbol, name:stock.name, index:false })),
    { symbol:'NIFTY', name:'NIFTY 50', index:true },
  ];
  const quotes = { stocks:[] };
  const quoteErrors = [];

  for (let offset = 0; offset < instruments.length; offset += REQUESTS_PER_BATCH) {
    if (offset > 0) await pause(BATCH_INTERVAL_MS);
    const batch = instruments.slice(offset, offset + REQUESTS_PER_BATCH);
    const results = await Promise.all(batch.map(async (instrument) => {
      try {
        return { instrument, payload:await getQuote(instrument.symbol, token, signal) };
      } catch (error) {
        return { instrument, error };
      }
    }));
    for (const result of results) {
      if (result.error) {
        quoteErrors.push({ symbol:result.instrument.index ? 'NIFTY 50' : result.instrument.symbol, message:result.error.message });
        continue;
      }
      const quote = normalizeQuote(result.payload, result.instrument.index ? 'NIFTY 50' : result.instrument.symbol, result.instrument.name);
      if (quote.lastPrice === null || quote.pChange === null) {
        quoteErrors.push({ symbol:quote.symbol, message:'Groww quote omitted the last price or day percentage change' });
      }
      if (result.instrument.index) quotes.index = quote;
      else quotes.stocks.push(quote);
    }
  }

  const index = quotes.index;
  if (!index?.lastPrice) throw new Error('Groww did not return a usable NIFTY 50 index quote');
  const marketData = {
    stocks:quotes.stocks,
    index:{ ...index, indexName:'NIFTY 50', price:index.lastPrice },
  };
  return {
    marketData,
    freshness:'Groww live market quote snapshot',
    tool:'Groww Get Quote',
    quoteCount:quotes.stocks.filter((row) => row.lastPrice !== null && row.pChange !== null).length,
    quoteErrors,
    fetchedAt:new Date().toISOString(),
  };
}
