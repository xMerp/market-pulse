const NSE_HOME = 'https://www.nseindia.com/';
// Bulk endpoint currently used by NSE's public live-equity page; the app races it with NSE MCP.
const NSE_LIVE_EQUITY_API = 'https://www.nseindia.com/api/NextApi/apiClient/marketWatchApi';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function requestSignal(signal, timeoutMs) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function cookiesFrom(response) {
  const cookies = response.headers.getSetCookie?.() || [response.headers.get('set-cookie') || ''];
  return cookies.map((cookie) => cookie.split(';', 1)[0]).filter(Boolean).join('; ');
}

export async function getNseWebsiteNiftySnapshot({ signal } = {}) {
  const baseHeaders = {
    'User-Agent':USER_AGENT,
    Accept:'text/html,application/xhtml+xml,application/json',
    'Accept-Language':'en-IN,en;q=0.9',
  };
  const home = await fetch(NSE_HOME, {
    headers:baseHeaders,
    cache:'no-store',
    signal:requestSignal(signal, 5_000),
  });
  if (!home.ok) throw new Error(`NSE live-market session returned ${home.status}`);

  const url = new URL(NSE_LIVE_EQUITY_API);
  url.searchParams.set('functionName', 'getIndicesData');
  url.searchParams.set('symbol', 'NIFTY 50');
  const response = await fetch(url, {
    headers:{
      ...baseHeaders,
      Accept:'application/json, text/plain, */*',
      Referer:'https://www.nseindia.com/market-data/live-equity-market',
      Cookie:cookiesFrom(home),
    },
    cache:'no-store',
    signal:requestSignal(signal, 6_000),
  });
  if (!response.ok) throw new Error(`NSE live-equity snapshot returned ${response.status}`);

  const marketData = await response.json();
  const rows = marketData?.data?.data;
  if (!Array.isArray(rows)) throw new Error('NSE live-equity snapshot did not contain quote rows');
  const stockCount = rows.filter((row) => row?.symbol && row.symbol !== 'NIFTY 50'
    && row.lastPrice !== null && row.lastPrice !== undefined && Number.isFinite(Number(row.lastPrice))).length;
  if (stockCount < 45) throw new Error(`NSE live-equity snapshot returned only ${stockCount} stock quotes`);

  return {
    marketData,
    freshness:marketData.data.timestamp ? `Official NSE live-equity snapshot · ${marketData.data.timestamp}` : 'Official NSE live-equity snapshot',
    tool:'NIFTY 50 live-equity bulk snapshot',
    quoteCount:stockCount,
    quoteErrors:[],
    fetchedAt:new Date().toISOString(),
  };
}
