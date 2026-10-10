const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const state = { payload: null, sentiment: 'all', query: '', focusSymbol: '', page: 1, pageSize: 10, busy: false, timer: 0 };
const icons = { positive: '😊', neutral: '😐', negative: '☹️' };
const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const integer = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
}
function safeUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : '#'; } catch { return '#'; }
}
function signed(value, suffix = '%') {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const number = Number(value);
  return `${number > 0 ? '+' : ''}${number.toFixed(2)}${suffix}`;
}
function when(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Time unavailable';
  const age = Date.now() - date.getTime();
  if (age >= 0 && age < 60 * 60 * 1000) return `${Math.max(1, Math.round(age / 60_000))}m ago`;
  return new Intl.DateTimeFormat('en-IN', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit', timeZone:'Asia/Kolkata' }).format(date);
}
function setTone(element, value) {
  element.classList.remove('up', 'down', 'flat');
  element.classList.add(value > 0 ? 'up' : value < 0 ? 'down' : 'flat');
}
function matchingItems() {
  const items = state.payload?.items || [];
  const query = state.query.trim().toLocaleLowerCase('en-IN');
  return items.filter((item) => {
    if (state.sentiment !== 'all' && item.analysis?.sentiment !== state.sentiment) return false;
    if (state.focusSymbol && item.symbol !== state.focusSymbol) return false;
    return !query || `${item.companyName} ${item.symbol} ${item.title} ${item.source}`.toLocaleLowerCase('en-IN').includes(query);
  });
}
function renderCounts() {
  const counts = state.payload?.counts || {};
  $('#storyCount').textContent = state.payload ? integer.format(state.payload.items.length) : '—';
  $('#positiveCount').textContent = integer.format(counts.positive || 0);
  $('#neutralCount').textContent = integer.format(counts.neutral || 0);
  $('#negativeCount').textContent = integer.format(counts.negative || 0);
  $('#allFilterCount').textContent = integer.format(state.payload?.items.length || 0);
  for (const tone of ['positive','neutral','negative']) $(`#${tone}FilterCount`).textContent = integer.format(counts[tone] || 0);
}
function storyCard(item) {
  const tone = ['positive','neutral','negative'].includes(item.analysis?.sentiment) ? item.analysis.sentiment : 'neutral';
  const quote = item.quote;
  const move = quote?.changePct;
  const quoteClass = Number(move) > 0 ? 'up' : Number(move) < 0 ? 'down' : 'flat';
  const price = Number.isFinite(Number(quote?.price)) ? money.format(Number(quote.price)) : 'Quote unavailable';
  const moveText = quote && quote.changePct !== null ? signed(quote.changePct) : '—';
  return `<article class="story-card">
    <div class="story-marker ${tone}">${icons[tone]}</div>
    <div class="story-content">
      <div class="story-meta"><span class="company-chip">${escapeHtml(item.symbol)}</span><span class="company-name">${escapeHtml(item.companyName)}</span><span class="meta-dot">·</span><span>${escapeHtml(item.source)}</span><span class="meta-dot">·</span><time>${escapeHtml(when(item.publishedAt))}</time></div>
      <a class="story-title" href="${escapeHtml(safeUrl(item.url))}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a>
      ${item.description ? `<p class="story-description">${escapeHtml(item.description)}</p>` : ''}
      <div class="story-analysis ${tone}"><span>${icons[tone]}</span><span>${escapeHtml(item.analysis?.remark || 'No clear directional signal in this headline.')}</span><small>${escapeHtml(item.analysis?.basis || 'Headline signal')}</small></div>
    </div>
    <div class="story-quote"><span class="quote-label">NSE SNAPSHOT</span><strong>${escapeHtml(price)}</strong><span class="quote-change ${quoteClass}">${escapeHtml(moveText)} <small>TODAY</small></span></div>
  </article>`;
}
function renderStories() {
  const list = $('#storyList');
  const items = matchingItems();
  list.setAttribute('aria-busy', 'false');
  if (!state.payload) {
    list.innerHTML = `<div class="loading-state"><span class="spinner"></span><strong>Opening the wire</strong><span>Collecting company headlines and the latest NSE snapshot…</span></div>`;
    return;
  }
  if (!items.length) {
    list.innerHTML = `<div class="empty-state"><span>⌕</span><strong>No matching headlines</strong><p>Try another company or sentiment filter. The feed only includes current NIFTY 50 constituents.</p><button class="text-button" data-clear-search type="button">Clear filters ↗</button></div>`;
    return;
  }
  const pageCount = Math.ceil(items.length / state.pageSize);
  state.page = Math.min(state.page, pageCount);
  const first = (state.page - 1) * state.pageSize;
  const pageItems = items.slice(first, first + state.pageSize);
  const pageButtons = Array.from({ length:pageCount }, (_, index) => {
    const page = index + 1;
    return `<button class="pagination-page${page === state.page ? ' active' : ''}" type="button" data-page="${page}"${page === state.page ? ' aria-current="page"' : ''}>${page}</button>`;
  }).join('');
  list.innerHTML = `${pageItems.map(storyCard).join('')}
    <nav class="story-pagination" aria-label="News pages">
      <span class="pagination-summary">Showing ${first + 1}–${first + pageItems.length} of ${items.length}</span>
      <div class="pagination-controls">
        <button class="pagination-step" type="button" data-page="${state.page - 1}"${state.page === 1 ? ' disabled' : ''}>← Previous</button>
        <div class="pagination-pages">${pageButtons}</div>
        <button class="pagination-step" type="button" data-page="${state.page + 1}"${state.page === pageCount ? ' disabled' : ''}>Next →</button>
      </div>
    </nav>`;
}
function renderMarket() {
  const payload = state.payload;
  const index = payload?.indices?.[0] || {};
  if (index.value !== null && index.value !== undefined) $('#indexValue').textContent = integer.format(index.value);
  if (index.changePct !== null && index.changePct !== undefined) {
    const changeLabel = `${signed(index.changePct)} today`;
    $('#indexChange').textContent = changeLabel;
    setTone($('#indexChange'), Number(index.changePct));
  }
  const quoteTime = payload?.data?.quotesUpdatedAt;
  $('#indexTimestamp').textContent = quoteTime ? `Snapshot ${when(quoteTime)} · delayed` : 'Waiting for NSE MCP snapshot';
  const movers = (payload?.movers || []).filter((stock) => stock.changePct !== null && stock.changePct !== undefined).slice(0, 6);
  $('#marketGrid').innerHTML = movers.length ? movers.slice(0, 4).map((stock) => {
    const value = Number(stock.changePct);
    const tone = value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
    return `<button class="market-tile" type="button" data-symbol="${escapeHtml(stock.symbol)}"><span class="tile-top"><span class="tile-symbol">${escapeHtml(stock.symbol)}</span><span class="tile-arrow">↗</span></span><span class="tile-name">${escapeHtml(stock.name)}</span><span class="tile-bottom"><strong>${Number.isFinite(Number(stock.price)) ? escapeHtml(money.format(Number(stock.price))) : '—'}</strong><span class="quote-change ${tone}">${escapeHtml(signed(value))}</span></span></button>`;
  }).join('') : `<div class="market-empty"><span>⌁</span><strong>${payload?.data?.mcpError ? 'NSE snapshot unavailable' : 'Waiting for NSE MCP data'}</strong><span>Live quote cards appear when the official market snapshot responds.</span></div>`;
  const railMovers = (payload?.movers || []).slice(0, 5);
  $('#moversList').innerHTML = railMovers.length ? railMovers.map((stock) => {
    const value = Number(stock.changePct || 0);
    const tone = value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
    return `<button class="mover-row" type="button" data-symbol="${escapeHtml(stock.symbol)}"><span class="mover-name"><strong>${escapeHtml(stock.symbol)}</strong><small>${escapeHtml(stock.name)}</small></span><span class="quote-change ${tone}">${escapeHtml(signed(value))}</span></button>`;
  }).join('') : `<div class="rail-empty">Quote data will appear here when NSE MCP is reachable.</div>`;
}
function renderUniverse() {
  const universe = state.payload?.universe || [];
  const query = $('#universeSearch').value.trim().toLocaleLowerCase('en-IN');
  const matches = universe.filter((stock) => `${stock.symbol} ${stock.name}`.toLocaleLowerCase('en-IN').includes(query));
  $('#dialogCount').textContent = `${matches.length} of ${universe.length || 50} stocks`;
  $('#universeList').innerHTML = matches.map((stock) => {
    const quote = (state.payload?.quotes || []).find((row) => row.symbol === stock.symbol);
    const change = quote?.changePct;
    const tone = Number(change) > 0 ? 'up' : Number(change) < 0 ? 'down' : 'flat';
    return `<button class="universe-row" type="button" data-symbol="${escapeHtml(stock.symbol)}"><span class="universe-symbol">${escapeHtml(stock.symbol)}</span><span class="universe-name">${escapeHtml(stock.name)}</span><span class="universe-price">${quote?.price !== null && quote?.price !== undefined ? escapeHtml(money.format(Number(quote.price))) : '—'}</span><span class="quote-change ${tone}">${change !== null && change !== undefined ? escapeHtml(signed(change)) : '—'}</span><span class="universe-open">↗</span></button>`;
  }).join('') || `<div class="universe-empty">No matching company. Try its NSE symbol.</div>`;
}
function renderStatus() {
  const payload = state.payload;
  const data = payload?.data || {};
  const isAvailable = Boolean(data.mcpTool);
  $('#marketStatus').textContent = state.busy ? 'Refreshing snapshot' : (payload?.market || 'Market status unavailable');
  $('#marketPip').classList.toggle('offline', !isAvailable);
  $('#mcpStatus').textContent = isAvailable ? `NSE MCP / ${data.mcpTool}` : 'NSE MCP / unavailable';
  $('#mcpFreshness').textContent = isAvailable ? (data.mcpFreshness || `Snapshot ${when(data.quotesUpdatedAt)} · 1–3 min delay`) : 'Could not reach official market data';
  $('#lastUpdated').textContent = data.newsUpdatedAt ? `Last updated ${when(data.newsUpdatedAt)}` : 'Waiting for the first news update';
  if (payload?.data?.errors?.length) $('#lastUpdated').textContent += ` · ${payload.data.errors.length} news source${payload.data.errors.length === 1 ? '' : 's'} unavailable`;
}
function render() {
  renderCounts(); renderStories(); renderMarket(); renderStatus(); renderUniverse();
  $('#clearFocus').classList.toggle('hidden', !state.focusSymbol);
}
async function loadFeed(force = false) {
  if (state.busy) return;
  state.busy = true;
  $('#refreshButton').classList.add('loading');
  $('#storyList').setAttribute('aria-busy', 'true');
  renderStatus();
  try {
    const response = await fetch(`/api/feed${force ? '?refresh=1' : ''}`, { headers:{ Accept:'application/json' }, cache:'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Feed error ${response.status}`);
    state.payload = result;
    state.page = 1;
    render();
  } catch (error) {
    $('#storyList').setAttribute('aria-busy', 'false');
    $('#storyList').innerHTML = `<div class="error-state"><span>!</span><strong>The feed could not be refreshed</strong><p>${escapeHtml(error.message)}</p><button class="retry-button" type="button" data-retry>Try again</button></div>`;
    showToast('Could not reach the feed. Try again in a moment.');
  } finally {
    state.busy = false;
    $('#refreshButton').classList.remove('loading');
    renderStatus();
    window.clearTimeout(state.timer);
    state.timer = window.setTimeout(() => loadFeed(false), Math.max(45, Number(state.payload?.data?.refreshSeconds || 90)) * 1000);
  }
}
let toastTimer;
function showToast(message) {
  const toast = $('#toast'); toast.textContent = message; toast.classList.add('visible');
  window.clearTimeout(toastTimer); toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 3200);
}
function focusCompany(symbol) {
  state.page = 1;
  state.focusSymbol = symbol || '';
  if (state.focusSymbol) {
    const company = state.payload?.universe?.find((stock) => stock.symbol === state.focusSymbol);
    $('#companySearch').value = company?.name || state.focusSymbol;
    state.query = '';
  } else {
    $('#companySearch').value = '';
    state.query = '';
  }
  if ($('#universeDialog').open) $('#universeDialog').close();
  renderStories(); $('#clearFocus').classList.toggle('hidden', !state.focusSymbol);
  $('#feed').scrollIntoView({ behavior:'smooth', block:'start' });
}

$('#todayLabel').textContent = new Intl.DateTimeFormat('en-IN', { weekday:'short', day:'numeric', month:'short', year:'numeric', timeZone:'Asia/Kolkata' }).format(new Date());
$('#companySearch').addEventListener('input', (event) => { state.focusSymbol = ''; state.page = 1; state.query = event.target.value; renderStories(); $('#clearFocus').classList.add('hidden'); });
$('#clearFocus').addEventListener('click', () => focusCompany(''));
$$('.filter-chip').forEach((button) => button.addEventListener('click', () => {
  state.sentiment = button.dataset.sentiment; state.page = 1;
  $$('.filter-chip').forEach((chip) => chip.classList.toggle('selected', chip === button)); renderStories();
}));
$('#refreshButton').addEventListener('click', () => loadFeed(true));
$('#universeButton').addEventListener('click', () => { $('#universeDialog').showModal(); renderUniverse(); $('#universeSearch').focus(); });
$('#moversAllButton').addEventListener('click', () => { $('#universeDialog').showModal(); renderUniverse(); });
$('#dialogClose').addEventListener('click', () => $('#universeDialog').close());
$('#universeSearch').addEventListener('input', renderUniverse);
$('#universeDialog').addEventListener('click', (event) => { if (event.target === $('#universeDialog')) $('#universeDialog').close(); });
document.addEventListener('click', (event) => {
  const pageButton = event.target.closest('[data-page]');
  if (pageButton && !pageButton.disabled) {
    state.page = Number(pageButton.dataset.page);
    renderStories();
    $('#storyList').scrollIntoView({ behavior:'smooth', block:'start' });
    return;
  }
  const stockButton = event.target.closest('[data-symbol]');
  if (stockButton) focusCompany(stockButton.dataset.symbol);
  if (event.target.closest('[data-retry]')) loadFeed(true);
  if (event.target.closest('[data-clear-search]')) { state.sentiment = 'all'; $$('.filter-chip').forEach((chip) => chip.classList.toggle('selected', chip.dataset.sentiment === 'all')); focusCompany(''); }
});
document.addEventListener('keydown', (event) => {
  if (event.key === '/' && !['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) { event.preventDefault(); $('#companySearch').focus(); }
  if (event.key.toLowerCase() === 'r' && !event.ctrlKey && !event.metaKey && !['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) loadFeed(true);
});
loadFeed();
