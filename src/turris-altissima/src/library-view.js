import { LibraryCore } from './library-core.js';
import { ReferenceFormats } from './citations.js';
import { citationAssets } from './citation-assets.js';
import { pageUrl, readRoute } from './routes.js';

const names = { __proto__: null, article: '雑誌論文', inproceedings: '会議論文', conference: '会議論文', proceedings: '会議録', book: '書籍', inbook: '書籍の章', incollection: '論集所収', thesis: '学位論文', phdthesis: '博士論文', mastersthesis: '修士論文', online: 'オンライン資料', report: '報告書', misc: 'その他' };
const byId = id => document.getElementById(id);
const queryInput = byId('search'), tagInput = byId('tag-query'), yearSelect = byId('year'), typeSelect = byId('type'), sortSelect = byId('sort');
sortSelect.value = 'id-desc';
const list = byId('list'), count = byId('count'), empty = byId('empty'), template = byId('entry-template');
const clearFilters = byId('clear-filters');
const advancedToggle = byId('advanced-toggle'), advancedFilters = byId('advanced-filters'), advancedCount = byId('advanced-count');
const suggestions = byId('tag-suggestions'), tagError = byId('tag-error'), panel = byId('detail-panel');
const collator = new Intl.Collator('ja', { numeric: true, sensitivity: 'base' });
let entries = [], catalog = [], entriesById = new Map(), searchIndex = new Map();
let tagExpression = null, activeSuggestions = [], activeOption = -1, composing = false;
let selectedEntry = null, returnFocus = null, activeTab = 'details';
let referenceRequest = null;
let detailSlot = history.state?.libraryDetailSlot === true;
const modalPanel = window.matchMedia('(max-width: 960px)');
function addLink(container, text, url, title) {
    const href = LibraryCore.safeUrl(url);
    if (!href)
        return;
    const link = document.createElement('a');
    link.className = 'action';
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = text;
    if (title)
        link.title = title;
    container.append(link);
}
function fillLinks(container, entry) {
    container.replaceChildren();
    (entry.originals || []).forEach((file, index) => addLink(container, (file.name.split('.').pop() || '原文').toUpperCase() + (entry.originals.length > 1 ? ' ' + (index + 1) : ''), file.url, file.name));
    (entry.notes || []).forEach((file, index) => addLink(container, 'ノート' + (entry.notes.length > 1 ? ' ' + (index + 1) : ''), file.url, file.name));
    if (entry.doi)
        addLink(container, 'DOI', 'https://doi.org/' + entry.doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').split('/').map(encodeURIComponent).join('/'));
    if (entry.url)
        addLink(container, '外部サイト', entry.url);
    addLink(container, 'Bib', entry.bib_url);
}
function authorText(value) {
    return ReferenceFormats.parseNames(value || '').map(person => person.literal ||
        (/[一-龯ぁ-んァ-ヶ]/.test(person.family || '') ? (person.family || '') + (person.given || '') : [person.given, person.family, person.suffix].filter(Boolean).join(' '))).join(' · ');
}
function tagButton(tag, title) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tag';
    button.textContent = tag;
    button.title = title || ('タグ「' + tag + '」をOR条件に追加');
    button.addEventListener('click', () => {
        setAdvancedSearch(true);
        if (panel.open) {
            returnFocus = tagInput;
            closeDetails();
        }
        try {
            tagInput.value = LibraryCore.appendTag(tagInput.value, tag);
            applyTagQuery();
        }
        catch (error) {
            showTagError(error.message);
        }
        tagInput.focus();
        hideSuggestions();
    });
    return button;
}
function renderEntry(entry) {
    const article = template.content.firstElementChild.cloneNode(true);
    article.dataset.id = entry.id;
    article.querySelector('.entry-id').textContent = entry.id;
    article.querySelector('.entry-year').textContent = entry.year || '年不明';
    article.querySelector('.entry-type').textContent = names[entry.entrytype] || entry.entrytype || '種別不明';
    const title = article.querySelector('.entry-title');
    title.textContent = entry.title || '（タイトル未設定）';
    title.addEventListener('click', () => openDetails(entry, title));
    const author = article.querySelector('.entry-authors');
    author.textContent = authorText(entry.bib_fields?.author || entry.bib_fields?.editor || entry.author);
    author.hidden = !author.textContent;
    author.title = author.textContent;
    const tags = article.querySelector('.entry-tags');
    (entry.tags || []).forEach(tag => tags.append(tagButton(tag)));
    tags.hidden = !tags.childElementCount;
    const links = article.querySelector('.links');
    fillLinks(links, entry);
    links.hidden = !links.childElementCount;
    article.querySelector('.entry-tools').hidden = tags.hidden && links.hidden;
    article.addEventListener('click', event => {
        if (event.target.closest('a,button,input,select,textarea') || window.getSelection()?.toString())
            return;
        openDetails(entry, title);
    });
    return article;
}
function render() {
    const query = LibraryCore.normalize(queryInput.value.trim());
    const found = entries.filter(entry => (!yearSelect.value || entry.year === yearSelect.value) && (!typeSelect.value || entry.entrytype === typeSelect.value) && (!query || searchIndex.get(entry.id).includes(query)) && LibraryCore.matchesTags(tagExpression, entry.tags || []));
    found.sort((a, b) => LibraryCore.compareEntries(a, b, sortSelect.value));
    list.replaceChildren(...found.map(renderEntry));
    count.textContent = found.length + ' / ' + entries.length + ' 件';
    empty.hidden = found.length > 0;
    byId('empty-message').textContent = entries.length ? '一致する文献はありません。' : '文献はまだ登録されていません。';
    clearFilters.hidden = !entries.length || found.length > 0;
    byId('clear-tags').disabled = !tagInput.value;
    const applied = [yearSelect.value, typeSelect.value, tagExpression].filter(Boolean).length;
    advancedCount.hidden = applied === 0;
    advancedCount.textContent = applied ? applied + '条件' : '';
}
function setAdvancedSearch(open) {
    advancedFilters.hidden = !open;
    advancedToggle.setAttribute('aria-expanded', String(open));
    if (!open) hideSuggestions();
}
function showTagError(message) { tagError.textContent = message; tagError.hidden = false; tagInput.setAttribute('aria-invalid', 'true'); }
function applyTagQuery() {
    try {
        tagExpression = LibraryCore.parseTagQuery(tagInput.value);
        tagError.hidden = true;
        tagError.textContent = '';
        tagInput.removeAttribute('aria-invalid');
        render();
    }
    catch (error) {
        showTagError(error.message);
        byId('clear-tags').disabled = !tagInput.value;
    }
}
function hideSuggestions() { suggestions.hidden = true; tagInput.setAttribute('aria-expanded', 'false'); tagInput.removeAttribute('aria-activedescendant'); activeOption = -1; }
function highlightSuggestion(index) {
    activeOption = index;
    [...suggestions.children].forEach((node, i) => node.setAttribute('aria-selected', String(i === index)));
    if (index >= 0) {
        tagInput.setAttribute('aria-activedescendant', 'tag-option-' + index);
        suggestions.children[index]?.scrollIntoView({ block: 'nearest' });
    }
    else
        tagInput.removeAttribute('aria-activedescendant');
}
function selectSuggestion(index) {
    const suggestion = activeSuggestions[index];
    if (!suggestion)
        return;
    const caret = tagInput.selectionStart ?? tagInput.value.length;
    const atEnd = LibraryCore.completionRange(tagInput.value, caret).end === tagInput.value.length;
    tagInput.value = LibraryCore.completeTag(tagInput.value, caret, suggestion.tag) + (atEnd ? ' ' : '');
    tagInput.setSelectionRange(tagInput.value.length, tagInput.value.length);
    applyTagQuery();
    hideSuggestions();
    tagInput.focus();
}
function showSuggestions() {
    if (composing)
        return;
    const range = LibraryCore.completionRange(tagInput.value, tagInput.selectionStart ?? tagInput.value.length);
    const fragment = ['AND', 'OR'].includes(range.fragment) ? '' : LibraryCore.normalize(range.fragment);
    activeSuggestions = catalog.filter(info => !fragment || LibraryCore.normalize(info.tag).includes(fragment)).slice(0, 30);
    suggestions.replaceChildren(...activeSuggestions.map((info, index) => {
        const option = document.createElement('li');
        option.id = 'tag-option-' + index;
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', 'false');
        const label = document.createElement('span');
        label.textContent = info.tag;
        const hits = document.createElement('small');
        hits.textContent = info.count + '件';
        option.append(label, hits);
        option.addEventListener('mousedown', event => event.preventDefault());
        option.addEventListener('click', () => selectSuggestion(index));
        return option;
    }));
    suggestions.hidden = !activeSuggestions.length;
    tagInput.setAttribute('aria-expanded', String(activeSuggestions.length > 0));
    highlightSuggestion(-1);
}
advancedToggle.addEventListener('click', () => setAdvancedSearch(advancedFilters.hidden));
queryInput.addEventListener('input', render);
[yearSelect, typeSelect, sortSelect].forEach(element => element.addEventListener('change', render));
tagInput.addEventListener('input', () => {
    if (!composing) {
        applyTagQuery();
        showSuggestions();
    }
});
tagInput.addEventListener('focus', showSuggestions);
tagInput.addEventListener('click', showSuggestions);
tagInput.addEventListener('blur', () => setTimeout(hideSuggestions, 100));
tagInput.addEventListener('compositionstart', () => { composing = true; hideSuggestions(); });
tagInput.addEventListener('compositionend', () => { composing = false; applyTagQuery(); showSuggestions(); });
tagInput.addEventListener('keydown', event => {
    if (event.isComposing || composing)
        return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (suggestions.hidden)
            showSuggestions();
        if (activeSuggestions.length)
            highlightSuggestion(activeOption < 0 ? (event.key === 'ArrowDown' ? 0 : activeSuggestions.length - 1) : (activeOption + (event.key === 'ArrowDown' ? 1 : -1) + activeSuggestions.length) % activeSuggestions.length);
    }
    if (event.key === 'Enter') {
        event.preventDefault();
        if (!suggestions.hidden && activeOption >= 0)
            selectSuggestion(activeOption);
        else {
            applyTagQuery();
            hideSuggestions();
        }
    }
    if (event.key === 'Escape') {
        event.preventDefault();
        hideSuggestions();
    }
});
byId('clear-tags').addEventListener('click', () => { tagInput.value = ''; applyTagQuery(); hideSuggestions(); tagInput.focus(); });
clearFilters.addEventListener('click', () => {
    queryInput.value = tagInput.value = yearSelect.value = typeSelect.value = '';
    applyTagQuery();
    hideSuggestions();
    queryInput.focus();
});
queryInput.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.isComposing) {
        queryInput.value = '';
        render();
    }
});
document.addEventListener('keydown', event => {
    if (event.key === '/' && readRoute().page === 'library' && !document.querySelector('dialog[open]') && !event.altKey && !event.ctrlKey && !event.metaKey && !event.target.isContentEditable && !['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) {
        event.preventDefault();
        queryInput.focus();
    }
});
function detailRow(label, value) {
    if (!value)
        return;
    const term = document.createElement('dt'), definition = document.createElement('dd');
    term.textContent = label;
    definition.textContent = value;
    byId('detail-fields').append(term, definition);
}
function writePanelRoute(id, method, ownsSlot) {
    const url = new URL(location.href);
    if (id) url.searchParams.set('entry', id);
    else url.searchParams.delete('entry');
    history[method + 'State']({ ...history.state, libraryDetailSlot: ownsSlot }, '', url);
    detailSlot = ownsSlot;
}
function applyPanelRoute() {
    const id = readRoute().page === 'library' ? new URL(location.href).searchParams.get('entry') : '';
    const entry = entriesById.get(id);
    if (entry) {
        if (!panel.open || selectedEntry?.id !== id) {
            const card = [...list.children].find(node => node.dataset.id === id);
            openDetails(entry, card?.querySelector('.entry-title'), true);
        }
    } else {
        closeDetails(true);
    }
}
function closeDetails(fromHistory = false) {
    if (!panel.open) return;
    if (!fromHistory) writePanelRoute('', 'replace', detailSlot);
    panel.close();
}
function openDetails(entry, trigger, fromHistory = false) {
    if (!fromHistory) {
        if (panel.open && selectedEntry?.id === entry.id) return;
        const method = panel.open || detailSlot ? 'replace' : 'push';
        writePanelRoute(entry.id, method, detailSlot || method === 'push');
    }
    selectedEntry = entry;
    returnFocus = trigger;
    panel.dispatchEvent(new CustomEvent('libraryentry', { detail: entry }));
    byId('detail-title').textContent = entry.title || '（タイトル未設定）';
    byId('detail-id').textContent = entry.id + ' · ' + (names[entry.entrytype] || entry.entrytype);
    renderDetailCopies(entry);
    byId('detail-tags').replaceChildren(...(entry.tags || []).map(tag => tagButton(tag)));
    byId('detail-fields').replaceChildren();
    const fields = entry.bib_fields || {};
    detailRow('著者', authorText(fields.author || (!Object.keys(fields).length ? entry.author : '')));
    detailRow('編者', authorText(fields.editor));
    detailRow('翻訳者', authorText(fields.translator));
    for (const [label, value] of [['出版年月日', entry.date || entry.year], ['掲載先', entry.publication], ['巻', entry.volume], ['号', entry.number], ['ページ', entry.pages], ['出版社', entry.publisher], ['出版地', ReferenceFormats.plain(fields.location || fields.address)], ['版', ReferenceFormats.plain(fields.edition)], ['言語', entry.language], ['DOI', entry.doi], ['ISBN', ReferenceFormats.plain(fields.isbn)], ['ISSN', ReferenceFormats.plain(fields.issn)], ['引用キー', entry.citekey]])
        detailRow(label, value);
    if (entry.bib_modified_at)
        detailRow('Bib更新', new Date(entry.bib_modified_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }));
    byId('memo-section').hidden = !entry.bib_notes;
    byId('detail-memo').textContent = entry.bib_notes || '';
    byId('abstract-section').hidden = !entry.abstract;
    byId('detail-abstract').textContent = entry.abstract || '';
    fillLinks(byId('detail-links'), entry);
    byId('bib-source').value = entry.bib_source || 'Bib本文はCSVに未収録です。「一覧・CSV を更新」を押してください。';
    byId('copy-bib').disabled = !entry.bib_source;
    byId('bib-status').textContent = '';
    switchTab('details');
    document.body.classList.add('panel-open');
    if (!panel.open) {
        if (modalPanel.matches)
            panel.showModal();
        else
            panel.show();
    }
    document.querySelector('.panel-scroll').scrollTop = 0;
    byId('close-panel').focus();
    void renderReferences();
}
function switchTab(tab, focus = false) {
    activeTab = tab;
    ['details', 'bib', 'references'].forEach(name => { const selected = name === tab; byId('tab-' + name).setAttribute('aria-selected', String(selected)); byId('tab-' + name).tabIndex = selected ? 0 : -1; byId('pane-' + name).hidden = !selected; });
    if (tab === 'references')
        void renderReferences();
    if (focus)
        byId('tab-' + tab).focus();
}
['details', 'bib', 'references'].forEach((name, index) => {
    byId('tab-' + name).addEventListener('click', () => switchTab(name));
    byId('tab-' + name).addEventListener('keydown', event => {
        const tabs = ['details', 'bib', 'references'];
        let next;
        if (event.key === 'ArrowRight')
            next = (index + 1) % 3;
        if (event.key === 'ArrowLeft')
            next = (index + 2) % 3;
        if (event.key === 'Home')
            next = 0;
        if (event.key === 'End')
            next = 2;
        if (next !== undefined) {
            event.preventDefault();
            switchTab(tabs[next], true);
        }
    });
});
byId('close-panel').addEventListener('click', () => closeDetails());
panel.addEventListener('cancel', event => { event.preventDefault(); closeDetails(); });
modalPanel.addEventListener('change', () => {
    if (panel.open) {
        panel.close();
        if (modalPanel.matches)
            panel.showModal();
        else
            panel.show();
    }
});
document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.isComposing && panel.open && !modalPanel.matches && !document.querySelector('.edit-dialog[open], #license-panel[open]') && event.target !== tagInput) {
        event.preventDefault();
        closeDetails();
    }
});
panel.addEventListener('click', event => {
    if (event.target === panel) {
        const r = panel.getBoundingClientRect();
        if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)
            closeDetails();
    }
});
panel.addEventListener('close', () => {
    if (panel.open)
        return;
    selectedEntry = null;
    document.body.classList.remove('panel-open');
    const target = returnFocus;
    if (target?.isConnected)
        target.focus({ preventScroll: true });
    else
        queryInput.focus({ preventScroll: true });
});
/** citeproc出力も、許可した文字装飾以外を取り除いて表示する。 */
function safeReference(html) {
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const fragment = document.createDocumentFragment();
    function copy(source, target) {
        for (const node of source.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
                target.append(document.createTextNode(node.textContent));
                continue;
            }
            if (node.nodeType !== Node.ELEMENT_NODE)
                continue;
            if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT'].includes(node.tagName))
                continue;
            if (!['DIV', 'SPAN', 'I', 'EM', 'B', 'STRONG', 'SUP', 'SUB', 'BR'].includes(node.tagName)) {
                copy(node, target);
                continue;
            }
            const element = document.createElement(node.tagName.toLowerCase());
            if (node.classList.contains('csl-entry'))
                element.className = 'csl-entry';
            if (node.classList.contains('csl-right-inline'))
                element.className = 'csl-right-inline';
            const style = node.getAttribute('style') || '';
            if (/font-style\s*:\s*italic/i.test(style))
                element.style.fontStyle = 'italic';
            if (/font-weight\s*:\s*(bold|700)/i.test(style))
                element.style.fontWeight = 'bold';
            if (/font-variant\s*:\s*small-caps/i.test(style))
                element.style.fontVariant = 'small-caps';
            copy(node, element);
            target.append(element);
        }
    }
    copy(parsed.body, fragment);
    return fragment;
}
/** 書式ごとに結果とコピー操作を分け、1書式の失敗で他の結果を消さない。 */
async function renderReferences() {
    const entry = selectedEntry;
    if (!entry || referenceRequest?.entry === entry) return;
    const request = { entry };
    referenceRequest = request;
    const container = byId('citation-list');
    container.textContent = '参考文献を準備しています…';
    try {
        await citationAssets();
    } catch (error) {
        if (referenceRequest === request) {
            referenceRequest = null;
            if (panel.open && selectedEntry === entry) container.textContent = error.message;
        }
        return;
    }
    if (activeTab !== 'references') {
        // 詳細の初回描画を先に済ませてから整形する。
        await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
    }
    if (referenceRequest !== request) return;
    if (!panel.open || selectedEntry !== entry) {
        referenceRequest = null;
        return;
    }
    container.replaceChildren();
    for (const style of ReferenceFormats.styles) {
        const card = byId('citation-template').content.firstElementChild.cloneNode(true);
        card.dataset.style = style.id;
        const heading = card.querySelector('.citation-heading');
        heading.id = 'reference-heading-' + style.id;
        heading.textContent = style.label;
        card.setAttribute('aria-labelledby', heading.id);
        card.querySelector('.citation-source').href = style.source;
        const result = card.querySelector('.citation-result');
        const textButton = card.querySelector('.copy-citation');
        const richButton = card.querySelector('.copy-rich');
        const status = card.querySelector('.citation-status');
        textButton.setAttribute('aria-label', style.label + 'のテキストをコピー');
        richButton.setAttribute('aria-label', style.label + 'を書式付きでコピー');
        textButton.disabled = richButton.disabled = true;
        container.append(card);
        try {
            if (!entry.bib_source)
                throw new Error('Bib本文がCSVに未収録です。CSV更新後にページを再読み込みしてください。');
            const output = ReferenceFormats.render(entry, style.id);
            result.append(safeReference(output.html));
            const citationHtml = result.innerHTML;
            const missing = card.querySelector('.citation-missing');
            missing.hidden = !output.missing.length;
            missing.textContent = '未入力：' + output.missing.join('、');
            const notice = card.querySelector('.citation-notice');
            notice.hidden = !output.notices.length;
            notice.textContent = output.notices.join(' ');
            textButton.disabled = richButton.disabled = !result.textContent.trim();
            textButton.addEventListener('click', () => copyAction(textButton, status, () => copyText(result.innerText.trim())));
            richButton.addEventListener('click', () => copyAction(richButton, status, async () => {
                const citationText = result.innerText.trim();
                if (window.ClipboardItem && navigator.clipboard?.write) {
                    try {
                        await navigator.clipboard.write([new ClipboardItem({
                            'text/html': new Blob([citationHtml], { type: 'text/html' }),
                            'text/plain': new Blob([citationText], { type: 'text/plain' })
                        })]);
                        return;
                    } catch (_) { /* 書式付きコピーが拒否された場合はテキストを使う。 */ }
                }
                await copyText(citationText);
                return 'テキストとしてコピーしました。';
            }));
        } catch (error) {
            console.error('参考文献整形: ' + style.id, error);
            const message = card.querySelector('.citation-error');
            message.textContent = 'この書式を表示できません：' + (error.message || String(error));
            message.hidden = false;
        }
    }
}
async function copyText(text) {
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return;
        }
        catch (_) { /* GASの埋め込み側のPermissions Policyで拒否された場合は選択コピーに切り替える。 */ }
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.className = 'clipboard-fallback';
    (panel.open ? panel : document.body).append(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    if (!copied)
        throw new Error('自動コピーできませんでした。テキストを選択してコピーしてください。');
}
async function copyAction(button, status, operation) {
    button.disabled = true;
    try {
        const message = await operation();
        status.textContent = message || 'コピーしました。';
    }
    catch (error) {
        status.textContent = error.message;
    }
    finally {
        button.disabled = false;
        if (button.isConnected && panel.open) button.focus();
    }
}
byId('copy-bib').addEventListener('click', () => copyAction(byId('copy-bib'), byId('bib-status'), () => copyText(selectedEntry.bib_source)));
async function copyEntryLink(text, url) {
    const markdown = '[' + text.replace(/[\\[\]]/g, '\\$&') + '](' + url.href + ')';
    if (window.ClipboardItem && navigator.clipboard?.write) {
        const anchor = document.createElement('a');
        anchor.href = url.href;
        anchor.textContent = text;
        try {
            await navigator.clipboard.write([new ClipboardItem({
                'text/html': new Blob([anchor.outerHTML], { type: 'text/html' }),
                'text/plain': new Blob([markdown], { type: 'text/plain' })
            })]);
            return;
        } catch { /* HTML をコピーできない場合は Markdown でリンクを渡す。 */ }
    }
    await copyText(markdown);
}

function renderDetailCopies(entry) {
    const status = byId('detail-copy-status');
    status.textContent = '';
    const fields = entry.bib_fields || {};
    const people = ReferenceFormats.parseNames(fields.author || fields.editor || entry.author);
    const first = people[0];
    const surname = first?.family || first?.literal;
    const authorYear = surname && entry.year ? surname + (people.length > 1 ? '+' : '') + ' ' + entry.year : '';
    const url = pageUrl('library', readRoute().sample);
    url.searchParams.set('entry', entry.id);
    const rows = [];
    for (const [label, text] of [
        ['Bib ファイル名', entry.bib_filename?.replace(/\.bib$/i, '')],
        ['著者名と年', authorYear],
        ['文献 ID', entry.id],
    ]) {
        if (!text) continue;
        const row = document.createElement('div');
        row.className = 'detail-copy-row';
        row.setAttribute('role', 'group');
        row.setAttribute('aria-label', label);
        const value = document.createElement('span');
        value.className = 'detail-copy-label';
        value.textContent = text;
        const buttons = document.createElement('div');
        buttons.className = 'copy-actions';
        for (const [name, operation] of [['コピー', () => copyText(text)], ['リンク付きコピー', () => copyEntryLink(text, url)]]) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'action-button';
            button.textContent = name;
            button.setAttribute('aria-label', label + 'を' + name);
            button.addEventListener('click', () => copyAction(button, status, operation));
            buttons.append(button);
        }
        row.append(value, buttons);
        rows.push(row);
    }
    byId('detail-copy').replaceChildren(...rows);
}
byId('show-licenses').addEventListener('click', async () => {
    byId('license-text').textContent = 'ライセンスを読み込んでいます…';
    if (!byId('license-panel').open) byId('license-panel').showModal();
    try {
        await citationAssets();
        byId('license-text').textContent = globalThis.CitationAssets.licenses;
    } catch (error) {
        byId('license-text').textContent = error.message;
    }
});
byId('close-licenses').addEventListener('click', () => byId('license-panel').close());
export function syncLibraryRoute() {
    detailSlot = history.state?.libraryDetailSlot === true;
    applyPanelRoute();
}

export function setLibrary(next, { reset = false } = {}) {
    const currentTab = activeTab;
    if (reset) {
        closeDetails(true);
        writePanelRoute('', 'replace', false);
        queryInput.value = tagInput.value = '';
        sortSelect.value = 'id-desc';
        setAdvancedSearch(false);
    }
    entries = next?.entries ?? [];
    selectedEntry = null;
    referenceRequest = null;
    catalog = LibraryCore.tagCatalog(entries).sort((a, b) => collator.compare(a.tag, b.tag));
    entriesById = new Map(entries.map(entry => [entry.id, entry]));
    searchIndex = new Map(entries.map(entry => [entry.id, [
        entry.id, entry.citekey, entry.title, entry.author, entry.publication, entry.publisher,
        entry.date, entry.doi, entry.keywords, entry.abstract, entry.bib_notes,
    ].map(LibraryCore.normalize).join(' ')]));
    hideSuggestions();
    updateSelect(yearSelect, entries.map(e => e.year).filter(Boolean).sort((a, b) => b.localeCompare(a)));
    updateSelect(typeSelect, entries.map(e => e.entrytype).filter(Boolean).sort((a, b) => collator.compare(names[a] || a, names[b] || b)), names);
    const recent = LibraryCore.recentTags(entries, 10);
    byId('recent-tags').replaceChildren(...recent.map(info => tagButton(info.tag,
        info.count + '件 · Bib更新 ' + new Date(info.lastUsed).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }))));
    byId('recent-wrap').hidden = !recent.length;
    byId('schema-message').hidden = next?.schemaReady !== false;
    byId('library-content').hidden = !next;
    byId('library-filters').hidden = byId('library-toolbar').hidden = !entries.length;
    applyTagQuery();
    if (!next) return;
    const wasOpen = panel.open && !reset;
    applyPanelRoute();
    if (wasOpen && panel.open) switchTab(currentTab);
}

function updateSelect(select, values, labels = Object.create(null)) {
    const selected = select.value;
    select.replaceChildren(select.options[0], ...[...new Set(values)].map(value => new Option(labels[value] || value, value)));
    select.value = values.includes(selected) ? selected : '';
}
