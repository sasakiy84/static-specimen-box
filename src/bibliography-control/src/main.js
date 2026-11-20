import './library.css';
import '../formatter/formatter.css';
import { setLibrary } from './library-view.js';
import { googleConfig } from './google-config.js';
import { authorize, loadIdentity, pickFolder, revoke } from './google-auth.js';
import { createDrive, DriveError } from './drive.js';
import { createWorkspace } from './workspace.js';
import { demoDrive } from './demo.js';
import { discardDraft } from '../formatter/src/draft.ts';

const byId = id => document.getElementById(id);
const connect = byId('connect-drive');
const disconnect = byId('disconnect-drive');
const folderButton = byId('choose-folder');
const demoButton = byId('open-demo');
const refresh = byId('refresh-csv');
const newEntry = byId('new-entry');
const details = byId('detail-panel');
const editButton = byId('edit-bib');
const attachButton = byId('attach-original');
const noteButton = byId('new-note');
const upload = byId('attachment-file');
const editDialog = byId('edit-dialog');
const formatterDialog = byId('formatter-dialog');
const editSource = byId('edit-source');
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
  demoButton.hidden = Boolean(workspace?.isDemo);
  disconnect.hidden = !connected && !workspace;
  disconnect.textContent = connected ? '接続を解除' : 'サンプルを閉じる';
  byId('workspace-bar').hidden = !workspace;
  byId('attachment-actions').hidden = !workspace || !currentEntry;
  editButton.hidden = !workspace || !currentEntry;
  for (const button of [disconnect, folderButton, demoButton, refresh, newEntry, editButton, attachButton, noteButton, byId('save-edit'), byId('close-edit'), byId('close-formatter')]) {
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
  formatterDialog.close();
  setCatalog(null, reset && hadWorkspace);
  setText('workspace-name', '');
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
      connected = undefined;
      if (workspace) clearWorkspace();
    }
    let message = error instanceof Error ? error.message : '操作を完了できませんでした。';
    if (errorTarget === 'formatter-message' && message.includes('引用キーが空です')) {
      message += '。変換結果の先頭のカンマの前に引用キーを入力してください。';
    }
    setText(errorTarget, message);
    if (errorTarget === 'formatter-message' && formatterDialog.open) byId(errorTarget).scrollIntoView({ block: 'nearest' });
    if (expired || (errorTarget === 'formatter-message' && !formatterDialog.open) ||
        (errorTarget === 'edit-error' && !editDialog.open) || (errorTarget === 'entry-message' && !details.open)) {
      setText('workspace-error', message);
    }
  } finally {
    isBusy = false;
    updateButtons();
  }
}

async function selectWorkspace(drive, id, userId, isDemo = false) {
  const next = await createWorkspace(drive, id);
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
  const label = isDemo ? 'この画面内' : connected.user.displayName || 'Google Drive';
  setText('workspace-name', `${next.root.name} · ${label}`);
  setCatalog(nextCatalog, reset);
  setText('workspace-status', nextCatalog.modifiedAt ? '' : '「一覧・CSV を更新」で文献一覧を生成できます。');
  if (!isDemo) rememberFolder(userId, next.root.id);
}

async function readyIdentity() {
  try {
    await loadIdentity();
    authReady = true;
  } catch (error) {
    setText('workspace-error', error.message);
    authReady = true;
  } finally {
    updateButtons();
  }
}

connect.addEventListener('click', () => action(async () => {
  if (!globalThis.google?.accounts?.oauth2) await loadIdentity();
  const session = await authorize();
  const drive = createDrive(session);
  const user = await drive.who();
  const reset = Boolean(workspace) && workspace.userId !== user.permissionId;
  clearWorkspace({ reset });
  connected = { session, drive, user };
  setText('workspace-status', '文献管理フォルダを選択してください。');
  const previous = loadRememberedFolder(user.permissionId);
  if (previous) await selectWorkspace(drive, previous, user.permissionId);
}));
folderButton.addEventListener('click', () => action(async () => {
  if (Date.now() >= connected.session.expiresAt) throw new DriveError(401, '接続期限が切れました。Google Drive に再接続してください。');
  const id = await pickFolder(connected.session.token);
  if (id) await selectWorkspace(connected.drive, id, connected.user.permissionId);
}));
disconnect.addEventListener('click', () => {
  if (connected) revoke(connected.session.token);
  connected = undefined;
  clearWorkspace();
  setText('workspace-error', '');
});
demoButton.addEventListener('click', () => action(async () => {
  if (workspace?.isDemo) return;
  if (connected) revoke(connected.session.token);
  connected = undefined;
  await selectWorkspace(demoDrive(), 'demo-root', 'demo', true);
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

newEntry.addEventListener('click', () => action(async () => {
  const context = workspace;
  const [{ mountFormatter }, { default: html }, assigned] = await Promise.all([
    import('../formatter/src/app.ts'),
    import('../formatter/form.html?raw'),
    context.service.nextNumber(),
  ]);
  const root = byId('formatter-root');
  root.replaceChildren(document.createRange().createContextualFragment(html));
  const key = `${scopeKey(context.userId, context.service.root.id)}:formatter-draft`;
  const tags = [...new Set((catalog?.entries ?? []).flatMap(entry => entry.tags))];
  let prefix = assigned.prefix;
  setText('formatter-message', '');
  setText('formatter-prefix', `文献ID ${assigned.nextId}`);
  formatter = mountFormatter(root, {
    prefix, tags, draftKey: key,
    onSave: (bib, filename, pdf) => action(async () => {
      const result = await context.service.createBib(prefix, filename, bib);
      if (result.next) {
        prefix = result.next.prefix;
        formatter.setPrefix(prefix);
        setText('formatter-prefix', `文献ID ${result.next.nextId}`);
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
      formatterDialog.close();
      afterWrite(message);
      setText('workspace-status', `${message} 「一覧・CSV を更新」で反映できます。`);
    }, 'formatter-message'),
  });
  formatterDialog.showModal();
}));
byId('close-formatter').addEventListener('click', () => formatterDialog.close());
formatterDialog.addEventListener('cancel', event => { if (isBusy) event.preventDefault(); });
formatterDialog.addEventListener('close', () => {
  if (formatterDialog.open) return;
  formatter = undefined;
  byId('formatter-root').replaceChildren();
});

function requireCurrentEntry() {
  if (!workspace || !currentEntry) throw new Error('対象の文献を開き直してください。');
  return { context: workspace, entry: currentEntry };
}

function openEditor(data) {
  activeEdit = data;
  setText('edit-title', data.folder === 'Bibs' ? 'Bib を編集' : 'ノートを編集');
  setText('edit-file', data.file?.name || data.entryId);
  setText('edit-error', '');
  editSource.value = data.content;
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

editButton.addEventListener('click', () => action(async () => {
  const { context, entry } = requireCurrentEntry();
  const file = await context.service.findBib(entry.id);
  if (!file.capabilities?.canEdit) throw new Error('この Bib を編集する権限がありません。');
  const data = await context.service.openText('Bibs', file);
  if (currentEntry === entry && details.open) openEditor({ ...data, context });
}, 'entry-message'));
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
  return !isBusy && (editSource.value === activeEdit?.content || confirm('保存していない編集内容を破棄しますか？'));
}
byId('close-edit').addEventListener('click', () => { if (mayCloseEditor()) editDialog.close(); });
editDialog.addEventListener('cancel', event => { if (!mayCloseEditor()) event.preventDefault(); });
editDialog.addEventListener('close', () => { if (!editDialog.open) activeEdit = undefined; });
byId('edit-form').addEventListener('submit', event => {
  event.preventDefault();
  void action(async () => {
    if (!activeEdit || activeEdit.context !== workspace) throw new Error('ファイルを開き直してください。');
    const { file, context, entryId } = activeEdit;
    const content = editSource.value;
    const saved = file
      ? await context.service.saveText(activeEdit, content)
      : await context.service.createNote(entryId, content);
    editDialog.close();
    afterWrite(`${saved.name} を保存しました。一覧と CSV を更新してください。`);
    void showNotes(context, currentEntry);
  }, 'edit-error');
});

updateButtons();
if (googleEnabled) void readyIdentity();
else setText('workspace-status', 'Google Drive 接続は static-specimen-box.sasakiy84.net で利用できます。');
