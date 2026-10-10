import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 4173);

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^(["'])(.*)\1$/, '$2');
  }
}
loadEnv(path.join(ROOT, '.env'));
const { buildFeed, healthPayload } = await import('./lib/feed.mjs');
const { readDailySnapshots } = await import('./lib/snapshots.mjs');

function json(response, status, payload) {
  response.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
  response.end(JSON.stringify(payload));
}
function contentType(file) {
  return ({ '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.json':'application/json; charset=utf-8' })[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    if (request.method !== 'GET') return json(response, 405, { error:'Method not allowed' });
    if (url.pathname === '/api/health') return json(response, 200, healthPayload());
    if (url.pathname === '/api/snapshots') {
      const from = url.searchParams.get('from') || '';
      const to = url.searchParams.get('to') || '';
      if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))) return json(response, 400, { error:'Use YYYY-MM-DD for from and to.' });
      try { return json(response, 200, await readDailySnapshots({ from, to })); }
      catch (error) {
        console.error(`[snapshots] ${error.stack || error}`);
        return json(response, 502, { error:'Daily snapshots could not be read.' });
      }
    }
    if (url.pathname === '/api/feed') {
      try { return json(response, 200, await buildFeed(url.searchParams.get('symbol') || '', url.searchParams.get('refresh') === '1')); }
      catch (error) {
        console.error(`[feed] ${error.stack || error}`);
        return json(response, 502, { error:'The NIFTY 50 feed could not be assembled. Refresh in a moment.', detail:error.message });
      }
    }
    return json(response, 404, { error:'Not found' });
  }
  let decoded;
  try { decoded = decodeURIComponent(url.pathname); } catch { decoded = '/'; }
  const relative = path.normalize(decoded.replace(/^[/\\]+/, '') || 'index.html');
  const file = path.resolve(PUBLIC, relative);
  if (file !== path.join(PUBLIC, 'index.html') && !file.startsWith(PUBLIC + path.sep)) {
    response.writeHead(403); return response.end('Forbidden');
  }
  fs.readFile(file, (error, data) => {
    if (error) { response.writeHead(404); return response.end('Not found'); }
    const ext = path.extname(file).toLowerCase();
    const cache = ['.html','.css','.js'].includes(ext) ? 'no-cache' : 'public, max-age=300';
    response.writeHead(200, { 'Content-Type':contentType(file), 'Cache-Control':cache, 'X-Content-Type-Options':'nosniff' });
    response.end(data);
  });
});
server.listen(PORT, '0.0.0.0', () => console.log(`Market Pulse running at http://localhost:${PORT}`));
