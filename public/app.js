const state = {
  items: [],
  universe: [],
  filter: 'all',
  query: '',
  focusedSymbol: '',
  response: null,
  toastTimer: null,
  loading: false,
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const els = {
  storyList: $('#storyList'), search: $('#companySearch'), refresh: $('#refreshButton'),
  dialog: $('#universeDialog'), dialogSearch: $('#universeSearch'), dialogList: $('#universeList'),
  toast: $('#toast'),
};

const sentimentMeta = {
  positive: { emoji: '😊', label: 'Positive signal' },
  neutral: { emoji: '😐', label: 'Neutral read' },
  negative: { emoji: '☹️', label: 'Negative signal' },
};

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
}
function normalize(value = '') { return String(value).toLocaleLowerCase('en-IN').replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
function formatInr(value) {
  if (!Number.isFinite(Number(value))) return '—';
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(Number(value));
}
function formatPct(value) {
  if (!Number.isFinite(Number(value))) return '—';
  const number = Number(value);
  return `${number > 0 ? '+' : ''}${number.toFixed(2)}%`;
}
function timeAgo(value) {
  if (!value) return 'recent';
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
function formatDate(value) {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(value);
}
function shortSource(value) {
  const key = normalize(value);
  if (key.includes('moneycontrol')) return 'Moneycontrol';
  if (key.includes('economic times')) return 'Economic Times';
  if (key === 'mint' || key.includes('live mint')) return 'Mint';
  if (key.includes('business standard')) return 'Business Standard';
  if (key.includes('financial express')) return 'Financial Express';
  return value || 'Finance desk';
}
function sourceInitial(value) {
  const source = shortSource(value);
  return source === 'Economic Times' ? 'ET' : source.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
}
function filteredItems() {
  const query = normalize(state.query);
  return state.items.filter((item) => {
    const sentiment = item.analysis?.sentiment || 'neutral';
    if (state.filter !== 'all' && sentiment !== state.filter) return false;
    if (!query) return true;
    return normalize(`${item.title} ${item.companyName} ${item.symbol} ${item.source}`).includes(query);
  });
}
function renderStory(item) {
  const analysis = item.analysis || { sentiment: 'neutral', remark: 'No clear directional signal in the headline.', basis: 'headline signals' };
  const sentiment = sentimentMeta[analysis.sentiment] ? analysis.sentiment : 'neutral';
  const meta = sentimentMeta[sentiment];
  const quote = item.quote;
  const change = Number(quote?.changePct);
  const quotePeriod = state.response?.market === 'Market open' ? 'today' : 'last session';
  const quoteTrend = !Number.isFinite(change) ? 'flat' : change > 0.005 ? 'up' : change < -0.005 ? 'down' : 'flat';
  const quoteProvider = quote?.source === 'NSE' ? 'NSE snapshot' : quote?.source === 'Yahoo Finance' ? 'Yahoo · may delay' : '';
  const publishedDate = item.publishedAt ? new Date(item.publishedAt) : null;
  const isFresh = publishedDate && (Date.now() - publishedDate.getTime()) < 90 * 60 * 1000;
  const snippet = (item.description || '').trim();
  const description = snippet ? `<p class="story-description">${escapeHtml(snippet)}</p>` : '';
  const quoteMarkup = quote && Number.isFinite(Number(quote.price))
    ? `<div class="quote-box"><div class="quote-price"><small>₹</small>${formatInr(quote.price)}</div><div class="quote-change ${quoteTrend}">${formatPct(quote.changePct)} ${quotePeriod}</div><span class="quote-source">${escapeHtml(quoteProvider)}</span></div>`
    : `<div class="quote-box"><span class="quote-unavailable">Quote unavailable</span></div>`;
  const basis = analysis.basis === 'OpenAI LLM' ? `AI read · ${escapeHtml(state.response?.data?.model || 'OpenAI')}` : 'Headline signal · configure an LLM key for deeper analysis';
  return `<article class="story-card">
    <div class="story-topline">
      <div class="story-source"><span class="source-mark">${escapeHtml(sourceInitial(item.source))}</span><span>${escapeHtml(shortSource(item.source))}</span><span class="source-time">· ${timeAgo(item.publishedAt)}</span></div>
      <div class="story-top-right">${isFresh ? '<span class="fresh-pill">NEW</span>' : ''}</div>
    </div>
    <a class="story-company" href="#" data-company-symbol="${escapeHtml(item.symbol)}"><span>${escapeHtml(item.companyName)}</span><span class="company-ticker">${escapeHtml(item.symbol)}</span></a>
    <a class="story-title" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a>
    ${description}
    <div class="story-bottom">
      <div class="analysis ${sentiment}"><span class="analysis-emoji" aria-hidden="true">${meta.emoji}</span><div class="analysis-copy"><span class="analysis-label">${meta.label}</span><p>${escapeHtml(analysis.remark || 'No clear directional signal in the headline.')}</p><small>${basis}</small></div></div>
      ${quoteMarkup}
    </div>
  </article>`;
}
function renderEmpty(message, detail, icon = '⌁') {
  els.storyList.innerHTML = `<div class="empty-state"><span class="empty-icon">${icon}</span><strong>${escapeHtml(message)}</strong><span>${escapeHtml(detail)}</span></div>`;
}
function renderFeed() {
  const items = filteredItems();
  if (state.loading && !state.items.length) {
    els.storyList.setAttribute('aria-busy', 'true');
    els.storyList.innerHTML = '<div class="loading-state"><span class="spinner"></span><strong>Finding the latest stories</strong><span>Checking market desks across India…</span></div>';
    return;
  }
  els.storyList.setAttribute('aria-busy', 'false');
  if (!state.items.length) {
    const errors = state.response?.data?.errors || [];
    const allFailed = errors.length >= 5;
    renderEmpty(allFailed ? 'News desks are taking a pause' : 'No matching live stories right now', allFailed ? 'Feeds are temporarily unavailable. Use Refresh feed to try again.' : 'No recent F&O company headlines matched this view. Try another company or check back shortly.', allFailed ? '↻' : '◌');
  } else if (!items.length) {
    renderEmpty('Nothing in this filter yet', 'Try another sentiment or clear your company search.', '⌕');
  } else {
    els.storyList.innerHTML = items.map(renderStory).join('');
  }
  updateCounts();
  updateMovers();
}
function updateCounts() {
  const counts = state.response?.counts || { positive: 0, neutral: 0, negative: 0 };
  const total = state.items.length;
  $('#storyCount').textContent = String(total).padStart(2, '0');
  $('#positiveCount').textContent = String(counts.positive).padStart(2, '0');
  $('#neutralCount').textContent = String(counts.neutral).padStart(2, '0');
  $('#negativeCount').textContent = String(counts.negative).padStart(2, '0');
  $('#allFilterCount').textContent = total;
  $('#positiveFilterCount').textContent = counts.positive;
  $('#neutralFilterCount').textContent = counts.neutral;
  $('#negativeFilterCount').textContent = counts.negative;
}
function updateMovers() {
  const distinct = new Map();
  for (const item of state.items) {
    if (item.quote && Number.isFinite(Number(item.quote.changePct))) distinct.set(item.symbol, item);
  }
  const movers = [...distinct.values()].sort((a, b) => Math.abs(Number(b.quote.changePct)) - Math.abs(Number(a.quote.changePct))).slice(0, 5);
  const root = $('#moversList');
  root.innerHTML = movers.length ? movers.map((item) => {
    const pct = Number(item.quote.changePct);
    const trend = pct > 0.005 ? 'up' : pct < -0.005 ? 'down' : '';
    return `<button class="mover-row" type="button" data-company-symbol="${escapeHtml(item.symbol)}"><span class="mover-symbol">${escapeHtml(item.symbol)}</span><span class="mover-name">${escapeHtml(item.companyName)}</span><span class="mover-change ${trend}">${formatPct(pct)}</span></button>`;
  }).join('') : '<div class="movers-empty">No quote snapshots available yet.</div>';
}
function setIndices(indices = []) {
  const nifty = indices.find((index) => index.name === 'NIFTY 50');
  const bank = indices.find((index) => index.name === 'NIFTY BANK');
  setIndex('nifty', nifty);
  setIndex('bank', bank);
}
function setIndex(prefix, item) {
  const value = $(`#${prefix}Value`);
  const change = $(`#${prefix}Change`);
  if (!item || !Number.isFinite(Number(item.value))) { value.textContent = '—'; change.textContent = 'Snapshot unavailable'; change.className = 'index-change'; return; }
  value.textContent = formatInr(item.value);
  change.textContent = formatPct(item.changePct);
  change.className = `index-change ${Number(item.changePct) < 0 ? 'down' : ''}`;
}
function renderUniverse() {
  const universe = state.universe || [];
  const query = normalize(els.dialogSearch.value);
  const filtered = universe.filter((stock) => !query || normalize(`${stock.name} ${stock.symbol}`).includes(query));
  $('#dialogCount').textContent = `${filtered.length} shown`;
  els.dialogList.innerHTML = filtered.map((stock) => `<button class="universe-row" type="button" data-company-symbol="${escapeHtml(stock.symbol)}"><span class="universe-row-symbol">${escapeHtml(stock.symbol)}</span><span class="universe-row-name">${escapeHtml(stock.name)}</span><span aria-hidden="true">↗</span></button>`).join('');
}
function renderQuickCompanies() {
  const root = $('#quickCompanies');
  const featuredSymbols = ['RELIANCE','HDFCBANK','ICICIBANK','INFY','TCS','SBIN','BHARTIARTL','LT'];
  const bySymbol = new Map(state.universe.map((stock) => [stock.symbol, stock]));
  const companies = featuredSymbols.map((symbol) => bySymbol.get(symbol)).filter(Boolean);
  const expanded = state.universe.filter((stock) => !featuredSymbols.includes(stock.symbol)).slice(0, Math.max(0, 8 - companies.length));
  const display = [...companies, ...expanded].slice(0, 8);
  root.innerHTML = display.map((stock) => `<button class="quick-company ${state.focusedSymbol === stock.symbol ? 'is-active' : ''}" type="button" data-company-symbol="${escapeHtml(stock.symbol)}"><span class="quick-symbol">${escapeHtml(stock.symbol)}</span><span class="quick-name">${escapeHtml(stock.name)}</span></button>`).join('');
}
function setServerMetadata(data) {
  const response = state.response;
  const sourceName = response?.data?.quoteSource || 'Live quote feed';
  const universeSource = response?.universeSource || '';
  const universeSourceLabel = universeSource === 'NSE live' ? 'NSE SNAPSHOT' : universeSource === 'NSE market-lot file' ? 'NSE CONTRACT FILE' : 'LOCAL FALLBACK';
  $('#universeLabel').textContent = `${(response?.universeCount || 0).toLocaleString('en-IN')} F&O COMPANIES · ${universeSourceLabel}`;
  $('#navUniverseCount').textContent = (response?.universeCount || 0).toLocaleString('en-IN');
  $('#dialogUniverseCount').textContent = `${(response?.universeCount || 0).toLocaleString('en-IN')} listed companies available to scan.`;
  $('#universeSourceNote').textContent = response?.universeSource || 'Exchange constituent list';
  $('#sideSession').textContent = response?.market || 'Market status unavailable';
  $('#marketStatus').textContent = response?.market || 'Market status unavailable';
  $('#marketPip').classList.toggle('closed', response?.market !== 'Market open');
  $('#sideSessionDot').style.background = response?.market === 'Market open' ? '#85d998' : '#9ba99e';
  $('#footerProvider').textContent = `${sourceName} · sentiment: ${response?.data?.sentimentMode || 'headline signals'}`;
  const updated = response?.data?.newsUpdatedAt ? new Date(response.data.newsUpdatedAt) : null;
  const allFeedsFailed = (response?.data?.errors || []).length >= 5;
  $('#lastUpdated').textContent = allFeedsFailed ? 'News feeds unavailable' : updated ? `Synced ${timeAgo(updated.toISOString())}` : 'Waiting for first sync';
  $('#indexUpdated').textContent = response?.data?.quoteSource === 'NSE' ? 'NSE SNAPSHOT' : 'QUOTE SNAPSHOT';
  const focused = state.universe.find((stock) => stock.symbol === state.focusedSymbol);
  $('#focusedLabel').textContent = focused ? `· ${focused.name}` : '';
  $('#clearFocus').classList.toggle('hidden', !focused);
  document.title = focused ? `${focused.symbol} News — Market Pulse` : 'Market Pulse — Indian F&O News';
}
function setOverview(response) {
  state.response = response;
  state.items = response.items || [];
  state.universe = response.universe || [];
  setServerMetadata(response.data);
  setIndices(response.indices || []);
  renderQuickCompanies();
  renderUniverse();
  renderFeed();
}
async function loadFeed({ force = false, symbol = state.focusedSymbol } = {}) {
  if (state.loading) return;
  state.loading = true;
  if (els.refresh) els.refresh.disabled = true;
  if (!state.items.length) renderFeed();
  const params = new URLSearchParams();
  if (symbol) params.set('symbol', symbol);
  if (force) params.set('refresh', '1');
  try {
    const response = await fetch(`/api/feed${params.size ? `?${params}` : ''}`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail || payload.error || `Feed unavailable (${response.status})`);
    setOverview(payload);
    if (payload.data?.errors?.length) {
      const active = payload.data.errors.length;
      const failed = payload.data.errors.map((error) => error.source).join(', ');
      showToast(`${active} news source${active === 1 ? '' : 's'} unavailable: ${failed}`);
    }
  } catch (error) {
    if (!state.items.length) renderEmpty('Could not connect to the live feed', 'Make sure the local server is running and try refreshing.', '↻');
    showToast(error.message || 'The live feed is unavailable.');
  } finally {
    state.loading = false;
    if (els.refresh) els.refresh.disabled = false;
  }
}
function showToast(message) {
  clearTimeout(state.toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add('show');
  state.toastTimer = setTimeout(() => els.toast.classList.remove('show'), 4200);
}
function focusCompany(symbol) {
  const stock = state.universe.find((company) => company.symbol === symbol);
  if (!stock) return;
  state.focusedSymbol = stock.symbol;
  state.filter = 'all';
  state.query = '';
  els.search.value = '';
  $$('.filter-chip').forEach((chip) => chip.classList.toggle('selected', chip.dataset.sentiment === 'all'));
  $('#universeDialog').close();
  $('#quickCompanies').querySelectorAll('.quick-company').forEach((button) => button.classList.toggle('is-active', button.dataset.companySymbol === stock.symbol));
  els.storyList.innerHTML = '<div class="loading-state"><span class="spinner"></span><strong>Scanning for company headlines</strong><span>Opening the latest news for ' + escapeHtml(stock.name) + '…</span></div>';
  state.items = [];
  state.response = null;
  updateCounts();
  loadFeed({ symbol: stock.symbol });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function clearCompany() {
  state.focusedSymbol = '';
  state.query = '';
  els.search.value = '';
  loadFeed({ symbol: '' });
}
function openUniverse() {
  if (typeof els.dialog.showModal === 'function') els.dialog.showModal();
  els.dialogSearch.value = '';
  renderUniverse();
  setTimeout(() => els.dialogSearch.focus(), 30);
}

$('#todayLabel').textContent = formatDate(new Date());
$('#todayLabel').dateTime = new Date().toISOString();
$('#feedNav').addEventListener('click', clearCompany);
$('#universeNav').addEventListener('click', openUniverse);
$('#viewAllButton').addEventListener('click', openUniverse);
$('#moversAllButton').addEventListener('click', openUniverse);
$('#refreshButton').addEventListener('click', () => loadFeed({ force: true }));
$('#dialogClose').addEventListener('click', () => els.dialog.close());
$('#clearFocus').addEventListener('click', clearCompany);
$('#mobileMenu').addEventListener('click', () => $('#sidebar').classList.toggle('mobile-open'));
$$('.filter-chip').forEach((chip) => chip.addEventListener('click', () => {
  state.filter = chip.dataset.sentiment;
  $$('.filter-chip').forEach((item) => item.classList.toggle('selected', item === chip));
  renderFeed();
}));
els.search.addEventListener('input', () => { state.query = els.search.value; renderFeed(); });
els.search.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  const query = normalize(els.search.value);
  const exact = state.universe.find((stock) => normalize(stock.symbol) === query || normalize(stock.name) === query);
  if (exact) focusCompany(exact.symbol);
});
els.dialogSearch.addEventListener('input', renderUniverse);
document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-company-symbol]');
  if (target) { event.preventDefault(); focusCompany(target.dataset.companySymbol); }
  if (event.target === els.dialog) els.dialog.close();
});
document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    els.search.focus();
  }
  if (event.key === 'Escape') $('#sidebar').classList.remove('mobile-open');
});

loadFeed();
setInterval(() => loadFeed(), 60_000);
