import { FOLDER_MIME, validateFileId } from './drive.js';
import { buildCatalogEntries_, serializeEntries_, extractId_, parseCatalogRows_, calculateMaState_, catalogRevision } from './catalog.js';

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

function findCsv(files) {
  const csv = single(files, csvName, true);
  if (csv && !isRegular(csv)) throw new Error(`${csvName} は通常の CSV ファイルである必要があります。`);
  return csv;
}

function fileUrl(file) {
  return file.webViewLink || `https://drive.google.com/open?id=${validateFileId(file.id)}`;
}

function version(file) {
  return JSON.stringify([file.id, file.name, file.version, file.modifiedTime, file.size, file.mimeType, file.webViewLink]);
}

function hasVersion(file) {
  return typeof file?.version === 'string' && file.version.length > 0;
}

function inputVersions(inputs) {
  return JSON.stringify(Object.values(inputs).map(group => group.map(version).sort()));
}

function canMatchInputs(inputs) {
  return Object.values(inputs).every(group => group.every(hasVersion));
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

function unpackBuild(record) {
  if (!record || typeof record.content !== 'string' || !Array.isArray(record.bibVersions)) return null;
  const catalog = parseCatalogRows_(csvRecords(record.content));
  if (!catalog.schemaReady) return null;
  return {
    record,
    catalog,
    bibVersions: new Map(record.bibVersions),
    // CSV の bib_source を使い、同じ本文をキャッシュへ二重に保存しない。
    bibSources: new Map(catalog.entries.map(entry => [entry.bib_filename, entry.bib_source])),
  };
}

export async function createWorkspace(drive, rootId, cache) {
  validateFileId(rootId);
  const [root, children] = await Promise.all([
    drive.get(rootId),
    rootId === 'root' ? null : drive.list(rootId),
  ]);
  if (root.trashed || root.mimeType !== FOLDER_MIME) throw new Error('文献管理用のフォルダを選択してください。');
  validateFileId(root.id);
  const rootChildren = (root.id === rootId && children ? children : await drive.list(root.id))
    .filter(file => childOf(file, root));
  const folders = {};
  for (const name of directories) {
    const folder = single(rootChildren, name);
    if (folder.mimeType !== FOLDER_MIME) throw new Error(`${name} はフォルダである必要があります。`);
    folders[name] = folder;
  }

  let lastBuild;
  let readingCache;

  async function cachedBuild() {
    if (lastBuild) return lastBuild;
    readingCache ??= Promise.resolve().then(() => cache?.read()).then(unpackBuild).catch(() => null);
    return readingCache;
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

  async function ensureFileInFolder(folder, id, editable = false) {
    const file = await drive.get(id);
    if (!childOf(file, folder) || !isRegular(file)) throw new Error('ファイルの場所や種類が変わりました。');
    if (editable && !file.capabilities?.canEdit) throw new Error('このファイルには編集権限がありません。');
    return file;
  }

  async function ensureFile(name, id, editable = false) {
    return ensureFileInFolder(await getFolder(name), id, editable);
  }

  async function targetCsv() {
    return findCsv(await listFiles('Scripts'));
  }

  async function cachedPublished(csvVersion) {
    const build = await cachedBuild();
    if (build?.record.csvVersion === csvVersion) return build.catalog;
    try {
      const record = await cache?.readPublished?.();
      if (record?.csvVersion === csvVersion && typeof record.content === 'string') {
        return parseCatalogRows_(csvRecords(record.content));
      }
    } catch { /* 読めないキャッシュは Drive の CSV で置き換える。 */ }
    return null;
  }

  async function readCatalog() {
    const scripts = folders.Scripts;
    const csv = findCsv((await drive.list(scripts.id)).filter(file => childOf(file, scripts)));
    // 直前に同じルートから見つけたフォルダと、CSV の現在の所属を並行して確認する。
    const [, verified] = await Promise.all([getFolder('Scripts'), csv && ensureFileInFolder(scripts, csv.id)]);
    if (!verified) return { entries: [], schemaReady: true, modifiedAt: '' };
    if (verified.name !== csvName) throw new Error(`${csvName} の名前が変わりました。`);

    const modifiedAt = verified.modifiedTime || '';
    const csvVersion = hasVersion(verified) && verified.capabilities?.canDownload === true ? version(verified) : null;
    if (csvVersion) {
      const cached = await cachedPublished(csvVersion);
      if (cached) return { ...cached, modifiedAt };
    }
    const content = await drive.read(verified.id);
    const catalog = parseCatalogRows_(csvRecords(content));
    if (csvVersion) {
      try { await cache?.writePublished?.({ content, csvVersion }); }
      catch { /* キャッシュに保存できなくても取得した一覧は表示する。 */ }
    }
    return { ...catalog, modifiedAt };
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
    const [inputs, csv, previous] = await Promise.all([inspectInputs(), targetCsv(), cachedBuild()]);
    const snapshot = inputVersions(inputs);
    const csvVersion = hasVersion(csv) ? version(csv) : null;
    const sameCsv = Boolean(csvVersion && previous?.record.csvVersion === csvVersion);
    if (sameCsv && previous.record.revision === catalogRevision && previous.record.snapshot === snapshot) {
      return { ...previous.catalog, modifiedAt: csv.modifiedTime || '', changed: false };
    }

    const bodies = new Map();
    const toRead = [];
    for (const file of inputs.bibs) {
      const savedBody = previous?.bibSources.get(file.name);
      if (typeof savedBody === 'string' && hasVersion(file) && previous.bibVersions.get(file.id) === version(file)) {
        bodies.set(file.id, savedBody);
      } else {
        toRead.push(file);
      }
    }
    // 読み込み件数を抑えつつ、同じグループでは確認済みの Bibs フォルダを使う。
    for (let start = 0; start < toRead.length; start += 8) {
      const folder = await getFolder('Bibs');
      await Promise.all(toRead.slice(start, start + 8).map(async file => {
        const verified = await ensureFileInFolder(folder, file.id);
        if (version(verified) !== version(file)) throw new Error('CSV の生成中に Bib が変更されました。');
        bodies.set(file.id, await drive.read(file.id));
      }));
    }
    const bibs = inputs.bibs.map(file => ({
      name: file.name, url: fileUrl(file), modifiedAt: file.modifiedTime, content: bodies.get(file.id),
    }));
    const entries = buildCatalogEntries_(bibs,
      inputs.originals.map(file => ({ name: file.name, url: fileUrl(file) })),
      inputs.notes.map(file => ({ name: file.name, url: fileUrl(file) })));
    const content = serializeEntries_(entries);
    const current = sameCsv ? previous.record.content : csv ? await drive.read((await ensureFile('Scripts', csv.id)).id) : null;
    const [fresh, freshCsv] = await Promise.all([inspectInputs(), targetCsv()]);
    if (snapshot !== inputVersions(fresh)) {
      throw new Error('CSV の生成中に文献フォルダが変更されました。もう一度お試しください。');
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
    const record = {
      revision: catalogRevision,
      content,
      csvVersion: hasVersion(saved) ? version(saved) : null,
      snapshot: canMatchInputs(inputs) ? snapshot : null,
      bibVersions: inputs.bibs.filter(hasVersion).map(file => [file.id, version(file)]),
    };
    lastBuild = unpackBuild(record);
    try { await cache?.write(record); }
    catch { /* IndexedDB を使えない場合は、同じ画面を開いている間だけキャッシュを使う。 */ }
    return { ...lastBuild.catalog, modifiedAt: saved.modifiedTime || '', changed: current !== content };
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
