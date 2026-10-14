import { buildFeed } from '../lib/feed.mjs';

function json(response, status, payload, cacheControl = 'no-store') {
  response.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', cacheControl);
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.end(JSON.stringify(payload));
}

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return json(response, 405, { error:'Method not allowed' });
  }
  const url = new URL(request.url || '/api/feed', `https://${request.headers.host || 'vercel.app'}`);
  try {
    const forcedRefresh = url.searchParams.get('refresh') === '1';
    const payload = await buildFeed(url.searchParams.get('symbol') || '', forcedRefresh);
    const hasHealthyQuotes = Number(payload?.data?.quoteCount) >= 45;
    const cache = !forcedRefresh && hasHealthyQuotes ? 'public, s-maxage=30, stale-while-revalidate=60' : 'no-store';
    return json(response, 200, payload, cache);
  } catch (error) {
    console.error(`[feed] ${error.stack || error}`);
    return json(response, 502, { error:'The NIFTY 50 feed could not be assembled. Refresh in a moment.', detail:error.message });
  }
}
