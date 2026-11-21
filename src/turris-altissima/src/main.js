import './library.css';
import '../formatter/formatter.css';
import { setLibrary, syncLibraryRoute } from './library-view.js';
import { LibraryCore } from './library-core.js';
import { googleConfig } from './google-config.js';
import { authorize, loadIdentity, pickFolder, revoke } from './google-auth.js';
import { createDrive, DriveError, folderIdFromLink, getAccessToken } from './drive.js';
import { createWorkspace } from './workspace.js';
import { readBibAnnotations, writeBibAnnotations } from './catalog.js';
import { browserCatalogCache } from './catalog-cache.js';
import { citationAssets } from './citation-assets.js';
import { demoDrive } from './demo.js';
import { forgetDriveSession, loadDriveSession, saveDriveSession } from './drive-session.js';
import { forgetServerSession, loginUrl, readServerSession, renewableSession } from './persistent-auth.js';
import { readRoute, pageUrl } from './routes.js';
import { discardDraft } from '../formatter/src/draft.ts';

const byId = id => document.getElementById(id);
const connect = byId('connect-drive');
const settingsConnect = byId('settings-connect');
const setupFolder = byId('setup-folder');
const openSettings = byId('open-settings');
const disconnect = byId('disconnect-drive');
const folderButton = byId('choose-folder');
const folderLink = byId('folder-link');
const folderForm = byId('folder-link-form');
const folderInput = byId('folder-link-input');
const demoButton = byId('open-demo');
const refresh = byId('refresh-csv');
const newEntry = byId('new-entry');
const details = byId('detail-panel');
const editButton = byId('edit-bib');
const editAnnotations = byId('edit-bib-annotations');
const attachButton = byId('attach-original');
const noteButton = byId('new-note');
const upload = byId('attachment-file');
const editDialog = byId('edit-dialog');
const formatterPage = byId('formatter-page');
const formatterRoot = byId('formatter-root');
const pdfSearchForm = byId('pdf-search-form');
const pdfSearchQuery = byId('pdf-search-query');
const pdfSearchResults = byId('pdf-search-results');
const routeLinks = [...document.querySelectorAll('a[data-route]')];
const libraryTitle = document.querySelector('[data-page="library"] [data-page-heading]').textContent;
const editSource = byId('edit-source');
const tagEditor = byId('bib-tag-editor');
const tagEntry = byId('bib-tag-input');
const selectedTags = byId('bib-tag-selected');
const tagCandidates = byId('bib-tag-candidates');
const tagsCollator = new Intl.Collator('ja', { numeric: true, sensitivity: 'base' });
const googleEnabled = location.origin === googleConfig.origin || import.meta.env.DEV;

let connected;
let workspace;
let catalog;
let currentEntry;
let activeEdit;
let formatter;
let formatterContext;
let formatterLoading;
let promptLoading;
let isBusy = false;
let authReady = !googleEnabled;
let persistentAuth;
let restoringSession = false;
let dirty = false;

function setText(id, message) {
  const node = byId(id);
  if (node.textContent !== message) node.textContent = message;
  node.hidden = !message;
}

function updateButtons() {
  const sample = readRoute().sample;
  const driveReady = Boolean(connected && !sample && !restoringSession);
  const progress = sample && !workspace?.isDemo ? 'サンプルを読み込んでいます…'
    : restoringSession ? '前回の Google Drive 接続を復元しています…'
    : !sample && !authReady && !connected ? 'Google Drive 接続を準備しています…' : '';
  setText('connection-progress', progress);
  setText('formatter-connection-progress', workspace ? '' : progress);
  const pdfSearchReady = Boolean(workspace && !workspace.isDemo && !sample);
  setText('pdf-search-progress', pdfSearchReady ? '' : progress);
  pdfSearchForm.hidden = !pdfSearchReady;
  byId('pdf-search-unavailable').hidden = Boolean(pdfSearchReady || progress);
  pdfSearchQuery.readOnly = isBusy;
  byId('pdf-search-submit').disabled = isBusy;
  setText('settings-connection-progress', progress || (sample
    ? 'サンプル表示中です。'
    : !googleEnabled ? 'Google Drive 接続は static-specimen-box.sasakiy84.net で利用できます。' : ''));
  byId('formatter-unavailable').hidden = Boolean(workspace || progress || sample);
  byId('formatter-connection-help').textContent = driveReady
    ? '設定で文献フォルダを選んでください。'
    : '設定で Google Drive に接続し、文献フォルダを設定してください。';
  connect.hidden = settingsConnect.hidden = !googleEnabled || sample || Boolean(progress || connected);
  connect.disabled = settingsConnect.disabled = isBusy;
  byId('connection-setup').hidden = Boolean(workspace);
  setupFolder.hidden = !driveReady || Boolean(workspace);
  setupFolder.setAttribute('aria-disabled', String(isBusy));
  openSettings.setAttribute('aria-disabled', String(isBusy));
  byId('settings-folder-controls').hidden = !driveReady;
  byId('settings-folder-empty').hidden = Boolean(workspace);
  folderButton.textContent = workspace ? '文献フォルダを変更' : '文献フォルダを選択';
  folderInput.disabled = isBusy;
  byId('open-folder-link').disabled = isBusy;
  demoButton.hidden = sample || Boolean(progress || connected);
  demoButton.setAttribute('aria-disabled', String(isBusy));
  disconnect.hidden = !(driveReady || workspace);
  byId('workspace-identity').hidden = disconnect.hidden;
  disconnect.textContent = workspace?.isDemo ? 'サンプルを閉じる' : 'ログアウト';
  refresh.hidden = newEntry.hidden = !workspace;
  setText('workspace-account', driveReady ? connected.user.displayName || 'Google Drive' : workspace?.isDemo ? workspace.service.root.name : '');
  byId('attachment-actions').hidden = !workspace || !currentEntry;
  editButton.hidden = !workspace || !currentEntry;
  byId('bib-annotations-actions').hidden = editButton.hidden;
  tagEditor.disabled = isBusy;
  editSource.readOnly = isBusy;
  newEntry.setAttribute('aria-disabled', String(isBusy));
  for (const button of [disconnect, folderButton, refresh, editButton, editAnnotations, attachButton, noteButton, byId('save-edit'), byId('close-edit')]) {
    button.disabled = isBusy;
  }
}

const licenses = byId('licenses');
const licenseText = byId('license-text');
licenses.addEventListener('toggle', async () => {
  if (!licenses.open || !licenseText.hidden) return;
  setText('license-status', 'ライセンスを読み込んでいます…');
  try {
    await citationAssets();
    setText('license-text', globalThis.CitationAssets.licenses);
    setText('license-status', '');
  } catch {
    setText('license-status', 'ライセンス本文を読み込めませんでした。');
  }
});

function scopeKey(userId, rootId) {
  return `bibliography-control:${encodeURIComponent(userId)}:${encodeURIComponent(rootId)}`;
}

function loadRememberedFolder(userId) {
  try { return localStorage.getItem(`${scopeKey(userId, '')}:folder`); }
  catch { return null; }
}

function rememberFolder(userId, rootId) {
  try { localStorage.setItem(`${scopeKey(userId, '')}:folder`, rootId); }
  catch { /* フォルダの記憶は任意。 */ }
}

function setCatalog(data, reset = false) {
  catalog = data;
  setLibrary(data, { reset });
}

function clearWorkspace({ reset = true } = {}) {
  const hadWorkspace = Boolean(workspace);
  workspace = currentEntry = activeEdit = undefined;
  dirty = false;
  editDialog.close();
  resetFormatter();
  resetFolderLink();
  resetPdfSearch();
  setCatalog(null, reset && hadWorkspace);
  setWorkspaceFolder();
  setText('workspace-status', '');
  setText('settings-status', '');
  setText('settings-error', '');
  updateButtons();
}

function connectionErrorTarget() {
  const { page } = readRoute();
  if (page === 'settings') return 'settings-error';
  if (page === 'new') return 'formatter-message';
  if (page === 'pdf-search') return 'pdf-search-error';
  return 'workspace-error';
}

async function action(operation, errorTarget = 'workspace-error') {
  if (isBusy) return;
  isBusy = true;
  setText(errorTarget, '');
  updateButtons();
  try {
    await operation();
  } catch (error) {
    const expired = error instanceof DriveError && error.status === 401;
    if (expired) {
      forgetDriveSession(connected?.session);
      connected = undefined;
      if (workspace) clearWorkspace();
    }
    let message = error instanceof Error ? error.message : '操作を完了できませんでした。';
    if (errorTarget === 'formatter-message' && message.includes('引用キーが空です')) {
      message += '。変換結果の先頭のカンマの前に引用キーを入力してください。';
    }
    setText(errorTarget, message);
    if (errorTarget === 'formatter-message' && !formatterPage.hidden) byId(errorTarget).scrollIntoView({ block: 'nearest' });
    if (expired || (errorTarget === 'formatter-message' && formatterPage.hidden) ||
        (errorTarget === 'edit-error' && !editDialog.open) || (errorTarget === 'entry-message' && !details.open)) {
      setText('workspace-error', message);
    }
  } finally {
    isBusy = false;
    updateButtons();
  }
}

function resetFolderLink() {
  folderLink.open = false;
  folderForm.reset();
}

function setWorkspaceFolder(root) {
  for (const link of [byId('workspace-folder'), byId('settings-folder')]) {
    link.hidden = !root;
    link.textContent = root?.name || '';
    if (root) link.href = 'https://drive.google.com/drive/folders/' + encodeURIComponent(root.id);
    else link.removeAttribute('href');
  }
}

async function selectWorkspace(drive, id, userId, isDemo = false) {
  const cache = isDemo ? undefined : browserCatalogCache(scopeKey(userId, id));
  const next = await createWorkspace(drive, id, cache);
  let nextCatalog;
  let catalogError = '';
  try {
    nextCatalog = isDemo ? await next.rebuild() : await next.readCatalog();
  } catch (error) {
    if (isDemo || (error instanceof DriveError && error.status === 401)) throw error;
    nextCatalog = { entries: [], schemaReady: true, modifiedAt: '' };
    catalogError = `一覧を読み込めませんでした。設定を確認して「一覧・CSV を更新」をお試しください。 ${error.message}`;
  }
  const reset = Boolean(workspace) && (next.root.id !== workspace.service.root.id || userId !== workspace.userId);
  if (reset) resetPdfSearch();
  workspace = { service: next, userId, isDemo };
  currentEntry = undefined;
  dirty = false;
  setWorkspaceFolder(isDemo ? null : next.root);
  setCatalog(nextCatalog, reset);
  setText('workspace-error', catalogError);
  if (readRoute().page === 'settings') setText('settings-error', catalogError);
  setText('workspace-status', nextCatalog.modifiedAt ? '' : '「一覧・CSV を更新」で文献一覧を生成できます。');
  resetFolderLink();
  if (!isDemo) rememberFolder(userId, next.root.id);
  if (readRoute().page === 'new') prepareFormatter();
}

async function connectWith(session, remember = false) {
  const drive = createDrive(session);
  const user = await drive.who();
  const sample = readRoute().sample;
  if (!remember && (sample || (!session.id && loadDriveSession()?.token !== session.token))) return;
  const reset = Boolean(workspace) && workspace.userId !== user.permissionId;
  clearWorkspace({ reset });
  connected = { session, drive, user };
  if (session.id) forgetDriveSession(loadDriveSession());
  if (remember) saveDriveSession(session);
  if (sample) navigate(pageUrl('library', false), true);
  const previous = loadRememberedFolder(user.permissionId);
  if (previous) await selectWorkspace(drive, previous, user.permissionId);
}

async function restoreConnection() {
  if (!googleEnabled || readRoute().sample || connected) return;
  let legacySession;
  restoringSession = true;
  updateButtons();
  try {
    const result = await readServerSession();
    persistentAuth = result.persistent;
    if (result.session) await connectWith(renewableSession(result.session));
    else if (!persistentAuth) {
      legacySession = loadDriveSession();
      if (legacySession) await connectWith(legacySession);
      try { await loadIdentity(); }
      catch (error) { if (!connected) throw error; }
    }
  } catch (error) {
    if (error instanceof DriveError && error.status === 401) forgetDriveSession(legacySession);
    throw error;
  } finally {
    restoringSession = false;
    authReady = true;
    updateButtons();
  }
}

async function readyIdentity() {
  await action(restoreConnection, connectionErrorTarget());
  const url = new URL(location.href);
  if (url.searchParams.get('auth') === 'failed') {
    url.searchParams.delete('auth');
    history.replaceState(history.state, '', url);
    setText(connectionErrorTarget(), 'Google Drive に接続できませんでした。Google の認可を確認して、もう一度お試しください。');
  }
}

for (const button of [connect, settingsConnect]) {
  button.addEventListener('click', async () => {
    await action(async () => {
      if (persistentAuth === undefined) await restoreConnection();
      if (connected) return;
      if (persistentAuth) {
        location.assign(loginUrl(readRoute().page));
        return;
      }
      if (!globalThis.google?.accounts?.oauth2) await loadIdentity();
      await connectWith(await authorize(), true);
    }, connectionErrorTarget());
    if (connected) {
      if (readRoute().page === 'settings') folderButton.focus();
      else (workspace ? refresh : setupFolder).focus();
    }
  });
}

async function chooseWorkspace(getFolderId) {
  if (!connected) return;
  await action(async () => {
    setText('settings-status', '');
    const id = await getFolderId();
    if (!id) return;
    setText('settings-status', 'フォルダを確認しています…');
    try {
      await selectWorkspace(connected.drive, id, connected.user.permissionId);
      setText('settings-status', '文献フォルダを設定しました。');
    } catch (error) {
      setText('settings-status', '');
      throw error;
    }
  }, 'settings-error');
  if (readRoute().page === 'settings') {
    if (connected) (folderLink.open ? folderInput : folderButton).focus();
    else settingsConnect.focus();
  }
}

folderButton.addEventListener('click', () => {
  void chooseWorkspace(async () => pickFolder(await getAccessToken(connected.session)));
});
folderForm.addEventListener('submit', event => {
  event.preventDefault();
  void chooseWorkspace(() => folderIdFromLink(folderInput.value));
});
disconnect.addEventListener('click', async () => {
  await action(async () => {
    const wasSample = workspace?.isDemo;
    if (connected) {
      if (connected.session.id) await forgetServerSession(connected.session.id);
      else {
        forgetDriveSession(connected.session);
        revoke(connected.session.token);
      }
    }
    connected = undefined;
    clearWorkspace();
    if (wasSample) {
      navigate(pageUrl('library', false), true);
      await restoreConnection();
    }
  });
  if (workspace) refresh.focus();
  else if (connected) setupFolder.focus();
  else (connect.hidden ? demoButton : connect).focus();
});

refresh.addEventListener('click', () => action(async () => {
  setText('workspace-status', '文献を読み込み、CSV を生成しています…');
  try {
    const result = await workspace.service.rebuild();
    setCatalog(result);
    dirty = false;
    setText('workspace-status', result.changed ? '一覧と CSV を更新しました。' : '一覧と CSV は最新です。');
  } catch (error) {
    setText('workspace-status', dirty ? '原本に変更があります。一覧と CSV は更新待ちです。' : '');
    throw error;
  }
}));

function resetPdfSearch() {
  pdfSearchForm.reset();
  pdfSearchResults.replaceChildren();
  pdfSearchResults.hidden = true;
  setText('pdf-search-status', '');
  setText('pdf-search-error', '');
}

pdfSearchForm.addEventListener('submit', event => {
  event.preventDefault();
  const context = workspace;
  if (!context || context.isDemo || readRoute().page !== 'pdf-search') return;
  const query = pdfSearchQuery.value.trim();
  void action(async () => {
    pdfSearchResults.replaceChildren();
    pdfSearchResults.hidden = true;
    setText('pdf-search-status', 'Google Drive で検索しています…');
    try {
      const files = await context.service.searchOriginalPdfs(query);
      if (workspace !== context) return;
      const entries = new Map((catalog?.entries ?? []).map(entry => [entry.id, entry]));
      const template = byId('pdf-hit-template');
      for (const file of files) {
        const row = template.content.firstElementChild.cloneNode(true);
        row.querySelector('.pdf-hit-name').textContent = file.name;
        const openPdf = row.querySelector('.action');
        const href = LibraryCore.safeUrl(file.url);
        if (href) openPdf.href = href;
        else openPdf.hidden = true;
        openPdf.setAttribute('aria-label', file.name + ' を開く');
        const entry = entries.get(file.entryId);
        if (entry) {
          const detail = row.querySelector('.pdf-hit-entry');
          const url = pageUrl('library', false);
          url.searchParams.set('entry', entry.id);
          detail.href = url;
          detail.textContent = entry.title ? `${entry.id} · ${entry.title}` : entry.id;
          detail.hidden = false;
        }
        pdfSearchResults.append(row);
      }
      pdfSearchResults.hidden = !files.length;
      setText('pdf-search-status', files.length ? `「${query}」の検索結果 ${files.length} 件` : '一致する PDF はありません。');
    } catch (error) {
      setText('pdf-search-status', '');
      throw error;
    }
  }, 'pdf-search-error');
});

function afterWrite(message) {
  dirty = true;
  setText('workspace-status', '原本に変更があります。「一覧・CSV を更新」で一覧に反映できます。');
  setText('entry-message', message);
}

function resetFormatter() {
  formatterContext = formatter = undefined;
  formatterRoot.replaceChildren();
  formatterRoot.hidden = true;
  setText('formatter-prefix', '');
  setText('formatter-message', '');
}

function prepareFormatter() {
  const context = workspace;
  if (!context || formatterContext === context) return;
  if (formatterLoading?.context === context) return;
  resetFormatter();
  const request = { context };
  formatterLoading = request;
  setText('formatter-message', '文献 ID と登録フォームを準備しています…');
  void Promise.all([
    import('../formatter/src/app.ts'),
    import('../formatter/form.html?raw'),
    context.service.nextNumber(),
  ]).then(([{ mountFormatter }, { default: html }, assigned]) => {
    if (workspace !== context || formatterLoading !== request) return;
    formatterRoot.replaceChildren(document.createRange().createContextualFragment(html));
    const key = `${scopeKey(context.userId, context.service.root.id)}:formatter-draft`;
    const tags = [...new Set((catalog?.entries ?? []).flatMap(entry => entry.tags))];
    let prefix = assigned.prefix;
    setText('formatter-message', '');
    setText('formatter-prefix', `文献 ID ${assigned.nextId}${context.isDemo ? ' · サンプル' : ''}`);
    formatter = mountFormatter(formatterRoot, {
      prefix, tags, draftKey: key, sample: context.isDemo,
      onSave: (bib, filename, pdf) => action(async () => {
        if (workspace !== context) return;
        const result = await context.service.createBib(prefix, filename, bib);
        if (result.next) {
          prefix = result.next.prefix;
          formatter.setPrefix(prefix);
          setText('formatter-prefix', `文献 ID ${result.next.nextId}${context.isDemo ? ' · サンプル' : ''}`);
          setText('formatter-message', `採番が ${result.next.nextId} に変わりました。ファイル名を確認して、もう一度登録してください。`);
          return;
        }
        let message = `${result.saved.name} を保存しました。`;
        if (pdf) {
          try { await context.service.uploadOriginal(prefix.slice(0, -1), pdf); }
          catch (error) {
            message += ` PDF の追加に失敗しました。一覧を更新したあと、文献の詳細から追加できます。 ${error.message}`;
          }
        }
        discardDraft(key);
        resetFormatter();
        afterWrite(message);
        setText('workspace-status', `${message} 「一覧・CSV を更新」で反映できます。`);
        if (readRoute().page === 'new') navigate(pageUrl('library', context.isDemo), true);
      }, 'formatter-message'),
    });
    formatterContext = context;
    formatterRoot.hidden = false;
  }).catch(error => {
    if (workspace !== context || formatterLoading !== request) return;
    if (error instanceof DriveError && error.status === 401) {
      forgetDriveSession(connected?.session);
      connected = undefined;
      clearWorkspace();
    }
    setText('formatter-message', error.message);
  }).finally(() => {
    if (formatterLoading === request) formatterLoading = undefined;
  });
}

function preparePrompt() {
  if (promptLoading) return;
  setText('prompt-status', 'プロンプトを読み込んでいます…');
  promptLoading = import('../formatter/prompt.txt?raw').then(({ default: prompt }) => {
    byId('llm-prompt').textContent = prompt;
    byId('copy-prompt').disabled = false;
    setText('prompt-status', '');
  }).catch(() => {
    setText('prompt-status', 'プロンプトを読み込めませんでした。');
    promptLoading = undefined;
  });
}

byId('copy-prompt').addEventListener('click', async () => {
  const prompt = byId('llm-prompt');
  try {
    await navigator.clipboard.writeText(prompt.textContent);
    setText('prompt-status', 'コピーしました。');
  } catch {
    const range = document.createRange();
    range.selectNodeContents(prompt);
    const selection = getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    setText('prompt-status', '本文を選択しました。ブラウザのコピー操作でコピーしてください。');
  }
});

function navigate(url, replace = false) {
  history[replace ? 'replaceState' : 'pushState']({}, '', url);
  void renderPage(true);
}

async function renderPage(focus = false) {
  const route = readRoute();
  const pages = document.querySelectorAll('main[data-page]');
  for (const page of pages) page.hidden = page.dataset.page !== route.page;
  for (const link of routeLinks) {
    const sample = link.dataset.sample === undefined ? route.sample : link.dataset.sample === 'true';
    link.href = pageUrl(link.dataset.route, sample);
  }
  syncLibraryRoute();
  updateButtons();
  const heading = document.querySelector(`[data-page="${route.page}"] [data-page-heading]`);
  document.title = route.page === 'library' ? libraryTitle : `${heading.textContent} | ${libraryTitle}`;
  if (focus) {
    heading.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  if (route.page === 'prompt') preparePrompt();
  if (!route.sample && workspace?.isDemo) {
    clearWorkspace();
    await action(restoreConnection, connectionErrorTarget());
  }

  if (route.sample && !workspace?.isDemo) {
    await action(async () => {
      connected = undefined;
      await selectWorkspace(demoDrive(), 'demo-root', 'demo', true);
    }, connectionErrorTarget());
  }
  if (readRoute().page === 'new') prepareFormatter();
}

document.addEventListener('click', event => {
  const link = event.target.closest('a[data-route]');
  if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  if (isBusy || link.href === location.href) return;
  navigate(new URL(link.href));
});
window.addEventListener('popstate', () => void renderPage());

function requireCurrentEntry() {
  if (!workspace || !currentEntry) throw new Error('対象の文献を開き直してください。');
  return { context: workspace, entry: currentEntry };
}

function tagChoice(tag, label, description, choose) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tag';
  button.textContent = label;
  button.title = description;
  button.setAttribute('aria-label', description);
  button.addEventListener('click', () => choose(tag));
  return button;
}

function renderBibTagEditor() {
  const { tags, candidates } = activeEdit;
  const query = tagEntry.value.trim().toLocaleLowerCase();
  const suggestions = candidates.filter(tag => !tags.includes(tag) && tag.toLocaleLowerCase().includes(query)).slice(0, 12);
  selectedTags.replaceChildren(...tags.map(tag =>
    tagChoice(tag, tag + ' ×', 'タグ「' + tag + '」を取り消す', value => {
      activeEdit.tags = activeEdit.tags.filter(current => current !== value);
      renderBibTagEditor();
      tagEntry.focus();
    })));
  tagCandidates.replaceChildren(...suggestions.map(tag =>
    tagChoice(tag, tag, '候補タグ「' + tag + '」を追加', value => addBibTag(value))));
  byId('bib-tag-candidates-wrap').hidden = !suggestions.length;
}

function addBibTag(value) {
  const tag = value.trim();
  if (!activeEdit?.annotations || /[,\r\n]/.test(tag)) {
    setText('bib-tag-error', 'タグはカンマや改行を含めず、1件ずつ入力してください。');
    return false;
  }
  if (tag && !activeEdit.tags.includes(tag)) activeEdit.tags.push(tag);
  tagEntry.value = '';
  setText('bib-tag-error', '');
  renderBibTagEditor();
  tagEntry.focus();
  return true;
}

function openEditor(data) {
  activeEdit = data;
  const isBib = data.folder === 'Bibs';
  const isAnnotations = Boolean(data.annotations);
  setText('edit-title', isAnnotations ? 'Bib のメモ・タグを編集' : isBib ? 'Bib を編集' : 'ノートを編集');
  setText('edit-file', data.file?.name || data.entryId);
  byId('save-edit').textContent = workspace.isDemo ? 'サンプルに保存' : 'Drive に保存';
  setText('edit-error', '');
  editDialog.toggleAttribute('data-annotations', isAnnotations);
  byId('edit-source-label').textContent = isAnnotations ? 'Bib 内のメモ' : '原文';
  editSource.required = !isAnnotations;
  editSource.value = isAnnotations ? data.annotations.note : data.content;
  tagEditor.hidden = !isAnnotations;
  if (isAnnotations) {
    tagEntry.value = '';
    setText('bib-tag-error', '');
    renderBibTagEditor();
  }
  editDialog.showModal();
  editSource.focus();
}

async function showNotes(context, entry) {
  const container = byId('editable-notes');
  container.replaceChildren();
  if (!context || !entry) return;
  const isCurrent = () => workspace === context && currentEntry === entry && details.open;
  try {
    const notes = await context.service.filesFor('Notes', entry.id);
    if (!isCurrent()) return;
    const buttons = notes.filter(file => file.capabilities?.canEdit && /\.(md|markdown)$/i.test(file.name)).map(file => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'action-button';
      button.textContent = `${file.name} を編集`;
      button.title = 'Drive の Notes フォルダにある Markdown ファイルを編集します。';
      button.addEventListener('click', () => action(async () => {
        const data = await context.service.openText('Notes', file);
        if (isCurrent()) openEditor({ ...data, context });
      }, 'entry-message'));
      return button;
    });
    container.replaceChildren(...buttons);
  } catch (error) {
    if (isCurrent()) setText('entry-message', error.message);
  }
}

details.addEventListener('libraryentry', event => {
  currentEntry = event.detail;
  setText('entry-message', '');
  updateButtons();
  void showNotes(workspace, currentEntry);
});
details.addEventListener('close', () => {
  if (!details.open) currentEntry = undefined;
});

async function openBibEditor(annotationsOnly) {
  const { context, entry } = requireCurrentEntry();
  const file = await context.service.findBib(entry.id);
  if (!file.capabilities?.canEdit) throw new Error('この Bib を編集する権限がありません。');
  const data = await context.service.openText('Bibs', file);
  if (currentEntry !== entry || !details.open) return;
  if (annotationsOnly) {
    data.entryId = entry.id;
    data.annotations = readBibAnnotations(data.content);
    data.tags = [...data.annotations.tags];
    data.candidates = [...new Set(catalog.entries.flatMap(item => item.tags))]
      .sort((left, right) => tagsCollator.compare(left, right));
  }
  openEditor({ ...data, context });
}

editButton.addEventListener('click', () => action(() => openBibEditor(false), 'entry-message'));
editAnnotations.addEventListener('click', () => action(() => openBibEditor(true), 'entry-message'));
byId('add-bib-tag').addEventListener('click', () => addBibTag(tagEntry.value));
tagEntry.addEventListener('input', () => {
  setText('bib-tag-error', '');
  renderBibTagEditor();
});
tagEntry.addEventListener('keydown', event => {
  if (event.key !== 'Enter' || event.isComposing) return;
  event.preventDefault();
  addBibTag(tagEntry.value);
});
noteButton.addEventListener('click', () => {
  if (isBusy || !workspace || !currentEntry) return;
  openEditor({ folder: 'Notes', entryId: currentEntry.id, content: '', context: workspace });
});
attachButton.addEventListener('click', () => upload.click());
upload.addEventListener('change', () => {
  const file = upload.files[0];
  upload.value = '';
  if (!file) return;
  void action(async () => {
    const { context, entry } = requireCurrentEntry();
    setText('entry-message', '原文をアップロードしています…');
    const saved = await context.service.uploadOriginal(entry.id, file);
    afterWrite(`${saved.name} を追加しました。一覧と CSV を更新してください。`);
  }, 'entry-message');
});

function mayCloseEditor() {
  if (isBusy) return false;
  const previous = activeEdit?.annotations;
  const changed = previous
    ? editSource.value !== previous.note || JSON.stringify(activeEdit.tags) !== JSON.stringify(previous.tags) || Boolean(tagEntry.value.trim())
    : editSource.value !== activeEdit?.content;
  return !changed || confirm('保存していない編集内容を破棄しますか？');
}
byId('close-edit').addEventListener('click', () => { if (mayCloseEditor()) editDialog.close(); });
editDialog.addEventListener('cancel', event => { if (!mayCloseEditor()) event.preventDefault(); });
editDialog.addEventListener('close', () => { if (!editDialog.open) activeEdit = undefined; });
byId('edit-form').addEventListener('submit', event => {
  event.preventDefault();
  if (isBusy) return;
  if (activeEdit?.annotations && tagEntry.value.trim() && !addBibTag(tagEntry.value)) return;
  void action(async () => {
    if (!activeEdit || activeEdit.context !== workspace) throw new Error('ファイルを開き直してください。');
    const { file, context, entryId, annotations, tags } = activeEdit;
    const content = annotations ? writeBibAnnotations(activeEdit.content, editSource.value, tags) : editSource.value;
    if (annotations && content === activeEdit.content) {
      editDialog.close();
      return;
    }
    const saved = file
      ? await context.service.saveText(activeEdit, content)
      : await context.service.createNote(entryId, content);
    editDialog.close();
    if (annotations) {
      const updated = readBibAnnotations(content);
      const entries = catalog.entries.map(entry => entry.id === entryId ? {
        ...entry,
        bib_source: content,
        bib_fields: updated.fields,
        bib_notes: updated.note,
        bib_modified_at: saved.modifiedTime,
        tags: updated.tags,
      } : entry);
      setCatalog({ ...catalog, entries });
    } else {
      void showNotes(context, currentEntry);
    }
    afterWrite(`${saved.name} を保存しました。一覧と CSV を更新してください。`);
  }, 'edit-error');
});

updateButtons();
void renderPage();
if (googleEnabled) void readyIdentity();
else setText('workspace-status', 'Google Drive 接続は static-specimen-box.sasakiy84.net で利用できます。');
