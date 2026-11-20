import './style.css';
import { loadEntry, loadSearch, loadSynset, loadText } from './dictionary.js';
import { detailHref, element, posBadge, renderEntry, renderSynset } from './detail.js';
import { indexTerms, isSynsetId, normalize, partsOfSpeech, searchTerms } from './search.js';

const byId = id => document.getElementById(id);
const form = byId('search-form');
const input = byId('query');
const posFilter = byId('part-of-speech');
const includeText = byId('include-text');
const status = byId('result-meta');
const empty = byId('empty-results');
const results = byId('result-list');
const detail = byId('detail-content');
const about = byId('about-nav');
const views = { search: byId('search-page'), about: byId('about-page'), detail: byId('detail-page') };
const paginations = [byId('results-pagination-top'), byId('results-pagination-bottom')];
const pageSize = 30;
const number = new Intl.NumberFormat('ja-JP');
let renderCount = 0;
let termsPromise;
let previousSearch;

const statIds = {
  entries: 'entries', senses: 'senses', synsets: 'synsets', 'japanese-synsets': 'japaneseSynsets',
  definitions: 'definitions', examples: 'examples',
};
for (const [id, key] of Object.entries(statIds)) byId(`stat-${id}`).textContent = number.format(WORDNET_STATS[key]);

function route(href) {
  history.pushState(null, '', href);
  renderLocation();
}

function show(view) {
  for (const [name, node] of Object.entries(views)) node.hidden = name !== view;
  if (view === 'about') about.setAttribute('aria-current', 'page');
  else about.removeAttribute('aria-current');
}

function setSearchStatus(message, busy = false) {
  status.textContent = message;
  status.setAttribute('aria-busy', String(busy));
}

function showEmpty(message) {
  empty.textContent = message;
  empty.hidden = !message;
}

function searchHref(params, page = 1) {
  const query = new URLSearchParams({ page: 'search' });
  for (const key of ['q', 'pos', 'text']) {
    if (params.has(key)) query.set(key, params.get(key));
  }
  if (page > 1) query.set('p', String(page));
  return `?${query}`;
}

function paginationButton(label, page, params, disabled = false) {
  const button = element('button', 'pagination-button', label);
  button.type = 'button';
  button.disabled = disabled;
  button.addEventListener('click', () => {
    route(searchHref(params, page));
    status.scrollIntoView({ block: 'nearest' });
  });
  return button;
}

function updatePagination(page, total, params) {
  for (const pagination of paginations) {
    pagination.replaceChildren();
    pagination.hidden = total < 2;
    if (pagination.hidden) continue;
    pagination.append(paginationButton('前へ', page - 1, params, page <= 1));
    const visiblePages = new Set([1, total]);
    for (let candidate = Math.max(1, page - 2); candidate <= Math.min(total, page + 2); candidate++) {
      visiblePages.add(candidate);
    }
    let previous = 0;
    for (const current of [...visiblePages].sort((a, b) => a - b)) {
      if (current - previous > 1) pagination.append(element('span', 'pagination-ellipsis', '…'));
      const button = paginationButton(String(current), current, params);
      if (current === page) button.setAttribute('aria-current', 'page');
      pagination.append(button);
      previous = current;
    }
    pagination.append(paginationButton('次へ', page + 1, params, page >= total));
  }
}

function resultCard(term) {
  const button = element('button', 'result-card');
  button.type = 'button';
  const subtitle = element('span', 'result-subtitle');
  subtitle.append(posBadge(term.pos));
  if (term.aliases.length) subtitle.append(term.aliases.join('、'));
  button.append(element('span', 'result-word', term.label), subtitle);
  button.addEventListener('click', () => route(detailHref(term.kind ?? 'entry', term.id)));
  return button;
}

async function find(query, pos, text) {
  if (isSynsetId(query)) {
    const synset = await loadSynset(query);
    if (!synset || (pos !== 'all' && synset[1] !== pos)) return [];
    const [id, partOfSpeech, definitions, , , , members] = synset;
    const labels = members.slice(0, 3).map(([, label]) => label);
    return [{ id, label: id, aliases: labels.length ? labels : definitions.slice(0, 1), pos: partOfSpeech, kind: 'synset' }];
  }
  if (!termsPromise) {
    termsPromise = loadSearch().then(indexTerms).catch(error => {
      termsPromise = undefined;
      throw error;
    });
  }
  const [terms, textRows] = await Promise.all([termsPromise, text && query ? loadText() : null]);
  return searchTerms(terms, query, pos, textRows);
}

async function renderSearch(params, request) {
  show('search');
  views.search.classList.add('paginated-mode');
  const query = params.get('q') ?? '';
  const pos = Object.hasOwn(partsOfSpeech, params.get('pos')) ? params.get('pos') : 'all';
  const text = params.get('text') === '1';
  input.value = query;
  posFilter.value = pos === 's' ? 'a' : pos;
  includeText.checked = text;
  previousSearch = searchHref(params, Number(params.get('p')) || 1);
  updatePagination(1, 0, params);
  results.replaceChildren();
  showEmpty('');
  if (!params.has('q') && pos === 'all' && !text) {
    setSearchStatus('');
    return;
  }
  setSearchStatus('検索しています…', true);
  try {
    const matches = await find(normalize(query), pos, text);
    if (request !== renderCount) return;
    if (!matches.length) {
      setSearchStatus('0件');
      showEmpty('該当する結果がありません。');
      return;
    }
    const total = Math.ceil(matches.length / pageSize);
    const page = Math.min(total, Math.max(1, Number.parseInt(params.get('p'), 10) || 1));
    const start = (page - 1) * pageSize;
    const end = Math.min(matches.length, start + pageSize);
    setSearchStatus(`${number.format(matches.length)}件中 ${number.format(start + 1)}–${number.format(end)}件`);
    results.replaceChildren(...matches.slice(start, end).map(resultCard));
    updatePagination(page, total, params);
  } catch {
    if (request !== renderCount) return;
    setSearchStatus('');
    showEmpty('辞書データを読み込めませんでした。もう一度検索してください。');
  }
}

function detailStatus(label) {
  const message = element('p', 'detail-status', label);
  message.setAttribute('role', 'status');
  return message;
}

async function renderDetail(view, id, request) {
  show('detail');
  detail.hidden = false;
  detail.replaceChildren(detailStatus('読み込み中…'));
  views.detail.setAttribute('aria-busy', 'true');
  try {
    let content;
    if (view === 'synset' && id && isSynsetId(id)) {
      const synset = await loadSynset(id);
      if (synset) content = renderSynset(synset);
    } else if (view === 'entry' && id && /^\d+$/.test(id) && Number(id) < WORDNET_STATS.entries) {
      const index = Number(id);
      const entry = await loadEntry(index);
      if (entry) content = await renderEntry(index, entry);
    }
    if (request !== renderCount) return;
    const back = element('a', 'data-link', '検索に戻る');
    back.href = previousSearch ?? '?page=search';
    detail.replaceChildren(content ?? detailStatus('該当する項目がありません。'), back);
    detail.querySelector('h2')?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  } catch {
    if (request === renderCount) detail.replaceChildren(detailStatus('辞書データを読み込めませんでした。ページを再読み込みしてください。'));
  } finally {
    if (request === renderCount) views.detail.setAttribute('aria-busy', 'false');
  }
}

function renderLocation() {
  const request = ++renderCount;
  const params = new URLSearchParams(location.search);
  const view = params.get('page');
  if (view === 'about') {
    show('about');
    window.scrollTo(0, 0);
  } else if (view === 'entry' || view === 'synset') {
    renderDetail(view, params.get('id'), request);
  } else {
    renderSearch(params, request);
  }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  const params = new URLSearchParams({ q: input.value.trim() });
  if (posFilter.value !== 'all') params.set('pos', posFilter.value);
  if (includeText.checked) params.set('text', '1');
  route(searchHref(params));
});
about.addEventListener('click', () => route('?page=about'));
document.addEventListener('click', event => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const anchor = event.target.closest('a[href^="?page="]');
  if (!anchor) return;
  event.preventDefault();
  route(anchor.getAttribute('href'));
});
window.addEventListener('popstate', renderLocation);
renderLocation();
