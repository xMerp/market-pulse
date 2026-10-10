export const DIVERGENCE_NEGATIVE_MOVE_PCT = -1.5;
export const DIVERGENCE_POSITIVE_MOVE_PCT = 1.5;
export const MIN_MOOD_HEADLINES = 10;

export const NIFTY50_SECTORS = Object.freeze({
  ADANIENT: 'Energy & Utilities', ADANIPORTS: 'Transport', APOLLOHOSP: 'Healthcare', ASIANPAINT: 'Consumer', AXISBANK: 'Banking',
  'BAJAJ-AUTO': 'Auto', BAJAJFINSV: 'Financial Services', BAJFINANCE: 'Financial Services', BEL: 'Industrials', BHARTIARTL: 'Telecom',
  CIPLA: 'Healthcare', COALINDIA: 'Energy & Utilities', DRREDDY: 'Healthcare', EICHERMOT: 'Auto', ETERNAL: 'Consumer',
  GRASIM: 'Materials', HCLTECH: 'IT', HDFCBANK: 'Banking', HDFCLIFE: 'Financial Services', HINDALCO: 'Metals',
  HINDUNILVR: 'FMCG', ICICIBANK: 'Banking', INDIGO: 'Transport', INFY: 'IT', ITC: 'FMCG',
  JIOFIN: 'Financial Services', JSWSTEEL: 'Metals', KOTAKBANK: 'Banking', LT: 'Industrials', 'M&M': 'Auto',
  MARUTI: 'Auto', MAXHEALTH: 'Healthcare', NESTLEIND: 'FMCG', NTPC: 'Energy & Utilities', ONGC: 'Energy & Utilities',
  POWERGRID: 'Energy & Utilities', RELIANCE: 'Energy & Utilities', SBILIFE: 'Financial Services', SBIN: 'Banking', SHRIRAMFIN: 'Financial Services',
  SUNPHARMA: 'Healthcare', TATACONSUM: 'FMCG', TATASTEEL: 'Metals', TCS: 'IT', TECHM: 'IT',
  TITAN: 'Consumer', TMPV: 'Auto', TRENT: 'Consumer', ULTRACEMCO: 'Materials', WIPRO: 'IT',
});

function indiaDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Kolkata', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(value);
  const part = (type) => parts.find((entry) => entry.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function toneLabel(score, total) {
  if (total < MIN_MOOD_HEADLINES) return 'Not enough headlines';
  if (score >= 5) return 'Bullish tone';
  if (score <= -5) return 'Bearish tone';
  return 'Mixed';
}

function dateFor(item) {
  const timestamp = Date.parse(item.publishedAt || '');
  return Number.isFinite(timestamp) ? indiaDate(new Date(timestamp)) : '';
}

export function buildMarketInsights({ items = [], quotes = [], universe = [], date = indiaDate(), marketDate = null } = {}) {
  const todayItems = items.filter((item) => dateFor(item) === date);
  const counts = todayItems.reduce((result, item) => {
    const sentiment = ['positive','neutral','negative'].includes(item.analysis?.sentiment) ? item.analysis.sentiment : 'neutral';
    result[sentiment]++;
    result.total++;
    return result;
  }, { positive:0, neutral:0, negative:0, total:0 });
  const rawScore = counts.total ? (counts.positive - counts.negative) / counts.total * 100 : null;
  const score = counts.total >= MIN_MOOD_HEADLINES ? Math.round(rawScore) : null;
  const mood = { ...counts, score, label:toneLabel(score, counts.total), date };

  const names = new Map(universe.map((stock) => [stock.symbol, stock.name]));
  const quoteBySymbol = new Map(quotes
    .filter((quote) => Object.hasOwn(NIFTY50_SECTORS, quote.symbol) && quote.changePct !== null && quote.changePct !== undefined && quote.changePct !== '' && Number.isFinite(Number(quote.changePct)))
    .map((quote) => [quote.symbol, quote]));
  const storyBySymbol = new Map();
  for (const item of todayItems) {
    if (!storyBySymbol.has(item.symbol)) storyBySymbol.set(item.symbol, []);
    storyBySymbol.get(item.symbol).push(item);
  }

  const stocks = Object.keys(NIFTY50_SECTORS).map((symbol) => {
    const stories = storyBySymbol.get(symbol) || [];
    const positive = stories.filter((item) => item.analysis?.sentiment === 'positive').length;
    const negative = stories.filter((item) => item.analysis?.sentiment === 'negative').length;
    const neutral = Math.max(0, stories.length - positive - negative);
    const quote = quoteBySymbol.get(symbol);
    return {
      symbol,
      name:names.get(symbol) || quote?.name || symbol,
      sector:NIFTY50_SECTORS[symbol],
      positive,
      negative,
      neutral,
      netSentiment:positive - negative,
      headlineCount:stories.length,
      changePct:quote ? Number(quote.changePct) : null,
    };
  });

  const divergences = stocks.flatMap((stock) => {
    if (!stock.headlineCount || stock.changePct === null) return [];
    const positiveNewsDown = stock.netSentiment > 0 && stock.changePct <= DIVERGENCE_NEGATIVE_MOVE_PCT;
    const negativeNewsUp = stock.netSentiment < 0 && stock.changePct >= DIVERGENCE_POSITIVE_MOVE_PCT;
    if (!positiveNewsDown && !negativeNewsUp) return [];
    const relevantTone = positiveNewsDown ? 'positive' : 'negative';
    const headline = (storyBySymbol.get(stock.symbol) || []).find((item) => item.analysis?.sentiment === relevantTone);
    return [{
      symbol:stock.symbol,
      name:stock.name,
      movePct:stock.changePct,
      netSentiment:stock.netSentiment,
      headlineCount:stock.headlineCount,
      flag:positiveNewsDown ? 'Positive news, price down' : 'Negative news, price up',
      headline:headline ? { title:headline.title, url:headline.url, source:headline.source } : null,
    }];
  }).sort((a, b) => Math.abs(b.movePct) - Math.abs(a.movePct));

  const sectorNames = [...new Set(Object.values(NIFTY50_SECTORS))];
  const sectors = sectorNames.map((sector) => {
    const members = stocks.filter((stock) => stock.sector === sector);
    const quoted = members.filter((stock) => stock.changePct !== null);
    const headlineCount = members.reduce((sum, stock) => sum + stock.headlineCount, 0);
    const netSentiment = members.reduce((sum, stock) => sum + stock.netSentiment, 0);
    return {
      name:sector,
      stockCount:members.length,
      quotedCount:quoted.length,
      averageChangePct:quoted.length ? quoted.reduce((sum, stock) => sum + stock.changePct, 0) / quoted.length : null,
      netSentiment,
      headlineCount,
    };
  }).filter((sector) => sector.quotedCount > 0);

  return {
    date,
    marketDate,
    marketDateLabel:marketDate || null,
    marketDataAvailable:quoteBySymbol.size > 0,
    mood,
    divergences,
    sectors,
    stocks,
    thresholds:{ positiveNewsPriceDown:DIVERGENCE_NEGATIVE_MOVE_PCT, negativeNewsPriceUp:DIVERGENCE_POSITIVE_MOVE_PCT },
  };
}
