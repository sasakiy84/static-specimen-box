import { loadEntryXml, loadSynset, loadSynsetXml } from './dictionary.js';
import { isSynsetId, partsOfSpeech } from './search.js';

const formLabels = { kana: 'カタカナ', hira: 'ひらがな', '': '別表記' };
const relationLabels = {
  antonym: '反義語', hypernym: '上位語', hyponym: '下位語',
  instance_hypernym: '上位語（例）', instance_hyponym: '具体例',
  also: '関連', similar: '類似', exemplifies: '例示', is_exemplified_by: '例示される',
  has_domain_topic: '分野', domain_topic: '分野', domain_region: '地域', has_domain_region: '地域',
  restricted_by: '制約', restricts: '制約する', eq_synonym: '同義語', attribute: '属性',
  entails: '含意', is_entailed_by: '含意される', causes: '原因となる', is_caused_by: '原因',
  mero_member: '構成員', mero_part: '部分', holo_part: '全体', holo_substance: '原料の全体',
  holo_member: '集合', mero_substance: '原料',
};

export function element(tag, className, contents) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (contents !== undefined) node.textContent = contents;
  return node;
}

export const posBadge = pos => element('span', 'pos-badge', partsOfSpeech[pos] ?? pos);

export function detailHref(type, id) {
  return `?${new URLSearchParams({ page: type, id })}`;
}

function link(className, label, href) {
  const anchor = element('a', className, label);
  anchor.href = href;
  return anchor;
}

function section(title, ...contents) {
  const container = element('section', 'detail-section');
  container.append(element('h3', '', title), ...contents);
  return container;
}

function list(items, className, render) {
  const node = element('ul', className);
  for (const item of items) {
    const row = element('li');
    row.append(render(item));
    node.append(row);
  }
  return node;
}

function header(title, id, pos, ili) {
  const heading = element('h2', 'detail-title', title);
  heading.tabIndex = -1;
  const metadata = element('div', 'detail-meta detail-meta-row');
  metadata.append(posBadge(pos), element('span', 'sense-id', id));
  if (ili) metadata.append(element('span', 'sense-id', ili));
  return [heading, metadata];
}

function textSection(title, text, className) {
  if (!text.length) return [];
  return [section(title, list(text, className, item => item))];
}

function rawXml(loadXml) {
  const disclosure = element('details', 'raw-data');
  const content = element('pre', 'raw-xml');
  disclosure.append(element('summary', '', '元データ（XML）'), content);
  disclosure.addEventListener('toggle', async () => {
    if (!disclosure.open || disclosure.dataset.loaded) return;
    disclosure.dataset.loaded = 'true';
    content.textContent = '読み込み中…';
    try {
      const xml = await loadXml();
      content.textContent = xml ?? '該当するXMLがありません。';
    } catch {
      content.textContent = 'XMLを読み込めませんでした。閉じてからもう一度開いてください。';
      delete disclosure.dataset.loaded;
    }
  });
  return disclosure;
}

export async function renderEntry(index, entry) {
  const [id, title, pos, forms, senses, tags] = entry;
  const result = document.createDocumentFragment();
  result.append(...header(title, id, pos));
  if (forms.length) {
    result.append(section('読み・別表記', list(forms, 'form-list', ([script, spelling]) => {
      const chip = element('span', 'form-chip', spelling);
      chip.append(element('small', '', formLabels[script] ?? script));
      return chip;
    })));
  }
  if (tags.length) result.append(section('分類', ...tags.map(([key, value]) => element('p', '', `${key} ${value}`))));
  const cards = await Promise.all(senses.map(async ([synsetId, senseId, counts], senseIndex) => {
    const synset = await loadSynset(synsetId);
    const card = element('article', 'sense-card');
    const heading = element('div', 'sense-heading');
    const senseTitle = element('div', 'sense-title');
    senseTitle.append(element('strong', '', `語義 ${senseIndex + 1}`), element('span', 'sense-id', senseId));
    heading.append(senseTitle);
    if (counts.length) heading.append(element('span', 'result-subtitle', counts.map(([source, count]) => `${source} ${count}`).join('、')));
    card.append(heading);
    if (synset) {
      const [, , definitions, examples] = synset;
      if (definitions.length) card.append(list(definitions, 'text-list', item => item));
      if (examples.length) card.append(list(examples, 'text-list example-list', item => item));
    }
    card.append(link('data-link', synsetId, detailHref('synset', synsetId)));
    return card;
  }));
  result.append(section('語義', ...cards), rawXml(() => loadEntryXml(index, id)));
  return result;
}

function relationItem([type, target, title]) {
  const row = isSynsetId(target) ? link('relation-link', '', detailHref('synset', target)) : element('span', 'relation-link');
  const label = element('span', 'relation-target');
  if (title) label.append(element('span', 'relation-target-name', title));
  label.append(element('span', 'relation-target-id', target));
  row.append(element('span', 'relation-type', relationLabels[type] ?? type), label);
  return row;
}

export function renderSynset(synset) {
  const [id, pos, definitions, examples, relations, ili, members] = synset;
  const result = document.createDocumentFragment();
  result.append(...header(id, id, pos, ili));
  if (members.length) {
    result.append(section('同じ語義の語', list(members, 'member-list', ([index, label]) => link('data-link', label, detailHref('entry', index)))));
  }
  result.append(...textSection('定義', definitions, 'text-list'), ...textSection('例文', examples, 'text-list example-list'));
  const parents = relations.filter(([type]) => type.endsWith('hypernym'));
  const children = relations.filter(([type]) => type.endsWith('hyponym'));
  const hierarchy = [];
  for (const [label, entries] of [['上位語', parents], ['下位語', children]]) {
    if (!entries.length) continue;
    const group = element('div', 'hierarchy-group');
    group.append(element('h4', '', label), list(entries, 'relation-list', relationItem));
    hierarchy.push(group);
  }
  if (hierarchy.length) result.append(section('上位語・下位語', ...hierarchy));
  const related = relations.filter(([type]) => !type.endsWith('hypernym') && !type.endsWith('hyponym'));
  if (related.length) result.append(section('関連するsynset', list(related, 'relation-list', relationItem)));
  result.append(rawXml(() => loadSynsetXml(id)));
  return result;
}
