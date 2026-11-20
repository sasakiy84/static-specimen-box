import { FOLDER_MIME, validateFileId } from './drive.js';
import { buildCatalogEntries_, serializeEntries_, extractId_, parseCatalogRows_, calculateMaState_ } from './catalog.js';

const directories = ['Bibs', 'Originals', 'Notes', 'Scripts'];
const attachments = new Set(['Bibs', 'Originals', 'Notes']);
const csvName = '_entries.csv';
const bibMime = 'application/x-bibtex';
const textMime = 'text/markdown';
const csvMime = 'text/csv';

function childOf(file, parent) {
  return !file.trashed && file.parents?.includes(parent.id);
}

function isRegular(file) {
  return typeof file.mimeType === 'string' && !file.mimeType.startsWith('application/vnd.google-apps.');
}

function single(files, name, optional = false) {
  const found = files.filter(file => file.name === name);
  if (found.length > 1) throw new Error(`${name} が複数あります。`);
  if (!found.length && !optional) throw new Error(`${name} が見つかりません。`);
  return found[0];
}

function fileUrl(file) {
  return file.webViewLink || `https://drive.google.com/open?id=${validateFileId(file.id)}`;
}

function version(file) {
  return [file.id, file.name, file.version, file.modifiedTime, file.size].join('\t');
}

function validateFilename(name) {
  if (typeof name !== 'string' || !name.trim() || /[\x00-\x1f/\\]/.test(name)) {
    throw new Error('ファイル名を確認してください。');
  }
}

function csvRecords(text) {
  const rows = [];
  let row = [], cell = '', quoted = false, closed = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let offset = 0; offset < source.length; offset++) {
    const character = source[offset];
    if (quoted) {
      if (character === '"' && source[offset + 1] === '"') {
        cell += '"';
        offset++;
      } else if (character === '"') {
        quoted = false;
        closed = true;
      } else {
        cell += character;
      }
      continue;
    }
    if (character === '\r' || character === '\n' || character === ',') {
      row.push(cell);
      cell = '';
      closed = false;
      if (character !== ',') {
        rows.push(row);
        row = [];
        if (character === '\r' && source[offset + 1] === '\n') offset++;
      }
    } else if (character === '"' && !cell && !closed) {
      quoted = true;
    } else if (closed || character === '"') {
      throw new Error('CSV の引用符が不正です。');
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error('CSV の引用符が閉じていません。');
  if (row.length || cell || closed) rows.push([...row, cell]);
  return rows;
}

export async function createWorkspace(drive, rootId) {
  const root = await drive.get(rootId);
  if (root.trashed || root.mimeType !== FOLDER_MIME) throw new Error('文献管理用のフォルダを選択してください。');
  validateFileId(root.id);
  const rootChildren = (await drive.list(root.id)).filter(file => childOf(file, root));
  const folders = {};
  for (const name of directories) {
    const folder = single(rootChildren, name);
    if (folder.mimeType !== FOLDER_MIME) throw new Error(`${name} はフォルダである必要があります。`);
    folders[name] = folder;
  }

  async function getFolder(name, forCreate = false) {
    const expected = folders[name];
    if (!expected) throw new Error('保存先フォルダが不正です。');
    const folder = await drive.get(expected.id);
    if (folder.mimeType !== FOLDER_MIME || folder.name !== name || !childOf(folder, root)) {
      throw new Error(`${name} の場所が変わりました。フォルダを選び直してください。`);
    }
    if (forCreate && !folder.capabilities?.canAddChildren) throw new Error(`${name} にファイルを作成する権限がありません。`);
    return folder;
  }

  async function listFiles(name) {
    const folder = await getFolder(name);
    return (await drive.list(folder.id)).filter(file => childOf(file, folder));
  }

  async function ensureFile(name, id, editable = false) {
    const folder = await getFolder(name);
    const file = await drive.get(id);
    if (!childOf(file, folder) || !isRegular(file)) throw new Error('ファイルの場所や種類が変わりました。');
    if (editable && !file.capabilities?.canEdit) throw new Error('このファイルには編集権限がありません。');
    return file;
  }

  async function targetCsv() {
    const existing = single(await listFiles('Scripts'), csvName, true);
    if (existing && !isRegular(existing)) throw new Error(`${csvName} は通常の CSV ファイルである必要があります。`);
    return existing;
  }

  async function readCatalog() {
    const csv = await targetCsv();
    if (!csv) return { entries: [], schemaReady: true, modifiedAt: '' };
    const verified = await ensureFile('Scripts', csv.id);
    const text = await drive.read(verified.id);
    return { ...parseCatalogRows_(csvRecords(text)), modifiedAt: verified.modifiedTime || '' };
  }

  async function inspectInputs() {
    const [bibs, originals, notes] = await Promise.all([...attachments].map(listFiles));
    return {
      bibs: bibs.filter(file => isRegular(file) && /\.bib$/i.test(file.name)),
      originals: originals.filter(isRegular),
      notes: notes.filter(isRegular),
    };
  }

  async function rebuild() {
    const [inputs, csv] = await Promise.all([inspectInputs(), targetCsv()]);
    // 一度に読む Bib の数を抑え、大きな一覧でも Drive API のリクエストを分散する。
    const bibs = [];
    for (let start = 0; start < inputs.bibs.length; start += 8) {
      bibs.push(...await Promise.all(inputs.bibs.slice(start, start + 8).map(async file => {
        const verified = await ensureFile('Bibs', file.id);
        if (version(verified) !== version(file)) throw new Error('CSV の生成中に Bib が変更されました。');
        return { name: file.name, url: fileUrl(file), modifiedAt: file.modifiedTime, content: await drive.read(file.id) };
      })));
    }
    const entries = buildCatalogEntries_(bibs,
      inputs.originals.map(file => ({ name: file.name, url: fileUrl(file) })),
      inputs.notes.map(file => ({ name: file.name, url: fileUrl(file) })));
    const content = serializeEntries_(entries);
    const current = csv ? await drive.read((await ensureFile('Scripts', csv.id)).id) : null;
    const [fresh, freshCsv] = await Promise.all([inspectInputs(), targetCsv()]);
    for (const name of Object.keys(inputs)) {
      if (JSON.stringify(inputs[name].map(version).sort()) !== JSON.stringify(fresh[name].map(version).sort())) {
        throw new Error('CSV の生成中に文献フォルダが変更されました。もう一度お試しください。');
      }
    }
    if ((csv ? version(csv) : null) !== (freshCsv ? version(freshCsv) : null)) {
      throw new Error('CSV が生成中に変更されました。もう一度お試しください。');
    }
    let saved = freshCsv;
    if (current !== content) {
      if (freshCsv) {
        const verified = await ensureFile('Scripts', freshCsv.id, true);
        if (version(verified) !== version(freshCsv)) throw new Error('CSV が変更されました。もう一度お試しください。');
        saved = await drive.update(verified.id, content, csvMime);
      } else {
        const parent = await getFolder('Scripts', true);
        saved = await drive.create(parent.id, csvName, content, csvMime);
      }
    }
    return { ...parseCatalogRows_(csvRecords(content)), modifiedAt: saved.modifiedTime || '', changed: current !== content };
  }

  async function filesFor(folder, id) {
    return (await listFiles(folder)).filter(file => isRegular(file) && extractId_(file.name) === id);
  }

  async function findBib(id) {
    const files = (await filesFor('Bibs', id)).filter(file => /\.bib$/i.test(file.name));
    if (files.length !== 1) throw new Error(`${id} に対応する Bib を1件に特定できません。現在のフォルダを確認してください。`);
    return files[0];
  }

  async function openText(folder, file) {
    const before = await ensureFile(folder, file.id);
    const content = await drive.read(before.id);
    const after = await ensureFile(folder, file.id);
    if (version(before) !== version(after)) throw new Error('読み込み中にファイルが変更されました。');
    return { file: after, content, folder };
  }

  async function saveText(draft, content) {
    const { folder, file } = draft;
    const latest = await ensureFile(folder, file.id, true);
    if (version(latest) !== version(file)) throw new Error('Drive 上のファイルが変更されました。下書きをコピーして、ファイルを開き直してください。');
    if (folder === 'Bibs') buildCatalogEntries_([{ name: latest.name, content }], [], []);
    return drive.update(latest.id, content, folder === 'Bibs' ? bibMime : textMime);
  }

  async function nextNumber() {
    return calculateMaState_((await listFiles('Bibs')).filter(isRegular).map(file => file.name));
  }

  async function createBib(prefix, name, content) {
    validateFilename(name);
    if (!name.startsWith(prefix) || !/\.bib$/i.test(name)) throw new Error('採番された ID を含む .bib ファイル名を使ってください。');
    buildCatalogEntries_([{ name, content }], [], []);
    const folder = await getFolder('Bibs', true);
    const next = await nextNumber();
    if (next.prefix !== prefix) return { next };
    return { saved: await drive.create(folder.id, name, content, bibMime) };
  }

  async function uploadOriginal(id, file) {
    validateFilename(file.name);
    await findBib(id);
    const name = file.name.startsWith(id + '_') ? file.name : id + '_' + file.name;
    const folder = await getFolder('Originals', true);
    if (single(await listFiles('Originals'), name, true)) throw new Error('同じ名前の原文が既にあります。ファイル名を変えてください。');
    const mime = /^[\w.+-]+\/[\w.+-]+$/.test(file.type) ? file.type : 'application/octet-stream';
    return drive.create(folder.id, name, file, mime);
  }

  async function createNote(id, content) {
    await findBib(id);
    const folder = await getFolder('Notes', true);
    const names = new Set((await listFiles('Notes')).map(file => file.name));
    let name = `${id}_ノート.md`, sequence = 2;
    while (names.has(name)) name = `${id}_ノート${sequence++}.md`;
    return drive.create(folder.id, name, content, textMime);
  }

  return { root, readCatalog, rebuild, filesFor, findBib, openText, saveText, nextNumber, createBib, uploadOriginal, createNote };
}
