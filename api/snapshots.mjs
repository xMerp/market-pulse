import { readDailySnapshots } from '../lib/snapshots.mjs';

function json(response, status, payload) {
  response.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.end(JSON.stringify(payload));
}

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return json(response, 405, { error:'Method not allowed' });
  }
  const url = new URL(request.url || '/api/snapshots', `https://${request.headers.host || 'vercel.app'}`);
  const from = url.searchParams.get('from') || '';
  const to = url.searchParams.get('to') || '';
  if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))) {
    return json(response, 400, { error:'Use YYYY-MM-DD for from and to.' });
  }
  try { return json(response, 200, await readDailySnapshots({ from, to })); }
  catch (error) {
    console.error(`[snapshots] ${error.stack || error}`);
    return json(response, 502, { error:'Daily snapshots could not be read.' });
  }
}
