import './library.css';
import '../formatter/formatter.css';
import { setLibrary, syncLibraryRoute } from './library-view.js';
import { googleConfig } from './google-config.js';
import { authorize, loadIdentity, pickFolder, revoke } from './google-auth.js';
import { createDrive, DriveError, folderIdFromLink, getAccessToken } from './drive.js';
import { createWorkspace } from './workspace.js';
import { readBibAnnotations, writeBibAnnotations } from './catalog.js';
import { browserCatalogCache } from './catalog-cache.js';
import { demoDrive } from './demo.js';
import { forgetDriveSession, loadDriveSession, saveDriveSession } from './drive-session.js';
import { readRoute, pageUrl } from './routes.js';
import { discardDraft } from '../formatter/src/draft.ts';

const byId = id => document.getElementById(id);
const connect = byId('connect-drive');
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
const routeLinks = [...document.querySelectorAll('a[data-route]')];
const libraryTitle = document.querySelector('[data-page="library"] [data-page-heading]').textContent;
const editSource = byId('edit-source');
const tagEditor = byId('bib-tag-editor');
const tagEntry = byId('bib-tag-input');
const selectedTags = byId('bib-tag-selected');
const tagCandidates = byId('bib-tag-candidates');
const tagsCollator = new Intl.Collator('ja', { numeric: true, sensitivity: 'base' });
const googleEnabled = location.origin === googleConfig.origin || import.meta.env.DEV;
const caption = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
});

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
let authReady = false;
let dirty = false;

function setText(id, message) {
  const node = byId(id);
  node.textContent = message;
  node.hidden = !message;
}

function updateButtons() {
  connect.disabled = isBusy || !googleEnabled || !authReady;
  connect.textContent = connected ? 'アカウントを切り替え' : 'Google Drive に接続';
  folderButton.hidden = !connected;
  folderLink.hidden = !connected;
  folderInput.disabled = isBusy;
  byId('open-folder-link').disabled = isBusy;
  demoButton.hidden = Boolean(workspace?.isDemo);
  disconnect.hidden = !connected && !workspace;
  disconnect.textContent = connected ? '接続を解除' : 'サンプルを閉じる';
  byId('workspace-bar').hidden = !workspace;
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
  setText('csv-updated', data?.modifiedAt ? `CSV更新：${caption.format(new Date(data.modifiedAt))}（JST）` : '');
}

function clearWorkspace({ reset = true } = {}) {
  const hadWorkspace = Boolean(workspace);
  workspace = currentEntry = activeEdit = undefined;
  dirty = false;
  editDialog.close();
  resetFormatter();
  resetFolderLink();
  setCatalog(null, reset && hadWorkspace);
  setText('workspace-name', '');
  setWorkspaceFolder();
  setText('workspace-status', '');
  updateButtons();
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
  const link = byId('workspace-folder');
  link.hidden = !root;
  link.textContent = root?.name || '';
  if (root) link.href = 'https://drive.google.com/drive/folders/' + encodeURIComponent(root.id);
  else link.removeAttribute('href');
}

async function selectWorkspace(drive, id, userId, isDemo = false) {
  const cache = isDemo ? undefined : browserCatalogCache(scopeKey(userId, id));
  const next = await createWorkspace(drive, id, cache);
  let nextCatalog;
  try {
    nextCatalog = isDemo ? await next.rebuild() : await next.readCatalog();
  } catch (error) {
    if (isDemo || (error instanceof DriveError && error.status === 401)) throw error;
    nextCatalog = { entries: [], schemaReady: true, modifiedAt: '' };
    setText('workspace-error', `一覧を読み込めませんでした。設定を確認して「一覧・CSV を更新」をお試しください。 ${error.message}`);
  }
  const reset = Boolean(workspace) && (next.root.id !== workspace.service.root.id || userId !== workspace.userId);
  workspace = { service: next, userId, isDemo };
  currentEntry = undefined;
  dirty = false;
  setWorkspaceFolder(isDemo ? null : next.root);
  setText('workspace-name', isDemo ? `${next.root.name} · この画面内` : ` · ${connected.user.displayName || 'Google Drive'}`);
  setCatalog(nextCatalog, reset);
  setText('workspace-status', nextCatalog.modifiedAt ? '' : '「一覧・CSV を更新」で文献一覧を生成できます。');
  resetFolderLink();
  if (!isDemo) rememberFolder(userId, next.root.id);
  if (readRoute().page === 'new') prepareFormatter();
}

async function connectWith(session, remember = false) {
  const drive = createDrive(session);
  const user = await drive.who();
  const sample = readRoute().sample;
  if (!remember && (sample || loadDriveSession()?.token !== session.token)) return;
  const reset = Boolean(workspace) && workspace.userId !== user.permissionId;
  clearWorkspace({ reset });
  connected = { session, drive, user };
  if (remember) saveDriveSession(session);
  if (sample) navigate(pageUrl('library', false), true);
  setText('workspace-status', '文献管理フォルダを選択してください。');
  const previous = loadRememberedFolder(user.permissionId);
  if (previous) await selectWorkspace(drive, previous, user.permissionId);
}

async function restoreConnection() {
  if (readRoute().sample || connected) return;
  const session = loadDriveSession();
  if (!session) return;
  try {
    await connectWith(session);
  } catch (error) {
    if (error instanceof DriveError && error.status === 401) forgetDriveSession(session);
    throw error;
  }
}

async function readyIdentity() {
  await action(restoreConnection, readRoute().page === 'new' ? 'formatter-message' : 'workspace-error');
  try {
    await loadIdentity();
  } catch (error) {
    if (!connected) setText('workspace-error', error.message);
  } finally {
    authReady = true;
    updateButtons();
  }
}

connect.addEventListener('click', () => action(async () => {
  if (!globalThis.google?.accounts?.oauth2) await loadIdentity();
  await connectWith(await authorize(), true);
}));
folderButton.addEventListener('click', () => action(async () => {
  const id = await pickFolder(getAccessToken(connected.session));
  if (id) await selectWorkspace(connected.drive, id, connected.user.permissionId);
}));
folderForm.addEventListener('submit', event => {
  event.preventDefault();
  if (!connected) return;
  void action(async () => {
    const id = folderIdFromLink(folderInput.value);
    await selectWorkspace(connected.drive, id, connected.user.permissionId);
    folderLink.querySelector('summary').focus();
  });
});
disconnect.addEventListener('click', () => action(async () => {
  const wasSample = workspace?.isDemo;
  if (connected) {
    forgetDriveSession(connected.session);
    revoke(connected.session.token);
  }
  connected = undefined;
  clearWorkspace();
  if (wasSample) {
    navigate(pageUrl('library', false), true);
    await restoreConnection();
  }
}));

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

function afterWrite(message) {
  dirty = true;
  setText('workspace-status', '原本に変更があります。「一覧・CSV を更新」で一覧に反映できます。');
  setText('entry-message', message);
}

function resetFormatter() {
  formatterContext = formatter = undefined;
  formatterRoot.replaceChildren();
  formatterRoot.hidden = true;
  byId('formatter-unavailable').hidden = Boolean(workspace);
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
  promptLoading ??= import('../formatter/prompt.txt?raw').then(({ default: prompt }) => {
    byId('llm-prompt').textContent = prompt;
    byId('copy-prompt').disabled = false;
  }).catch(() => {
    setText('prompt-status', 'プロンプトを読み込めませんでした。');
    promptLoading = undefined;
  });
}

byId('copy-prompt').disabled = true;
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
    link.href = pageUrl(link.dataset.route, link.dataset.sample === 'true' || route.sample);
  }
  syncLibraryRoute();
  const heading = document.querySelector(`[data-page="${route.page}"] [data-page-heading]`);
  document.title = route.page === 'library' ? libraryTitle : `${heading.textContent} | ${libraryTitle}`;
  if (focus) {
    heading.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  if (route.page === 'prompt') preparePrompt();
  if (!route.sample && workspace?.isDemo) {
    clearWorkspace();
    await action(restoreConnection);
  }

  if (route.sample && !workspace?.isDemo) {
    await action(async () => {
      connected = undefined;
      await selectWorkspace(demoDrive(), 'demo-root', 'demo', true);
    }, route.page === 'new' ? 'formatter-message' : 'workspace-error');
  }
  if (readRoute().page === 'new') {
    byId('formatter-unavailable').hidden = Boolean(workspace);
    prepareFormatter();
  }
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
