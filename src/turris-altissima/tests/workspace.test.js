import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoDrive } from '../src/demo.js';
import { readBibAnnotations, writeBibAnnotations } from '../src/catalog.js';
import { createWorkspace } from '../src/workspace.js';

test('reuses the CSV and indexes Bib and attachments by the first underscore', async () => {
  const drive = demoDrive();
  const workspace = await createWorkspace(drive, 'demo-root');
  const initial = await workspace.rebuild();
  const [csv] = await drive.list('Scripts');
  assert.equal(initial.entries.length, 4);
  assert.equal(initial.entries.find(entry => entry.id === 'MA0002').notes.length, 1);
  assert.equal((await workspace.rebuild()).changed, false);
  const source = await workspace.openText('Bibs', await workspace.findBib('MA0001'));
  await workspace.saveText(source, source.content.replace('2024', '2027'));
  assert.equal((await workspace.readCatalog()).entries.length, 4);
  const rebuilt = await workspace.rebuild();
  assert.equal(rebuilt.changed, true);
  assert.equal((await drive.list('Scripts'))[0].id, csv.id);
});

test('preserves the previous CSV when Bib validation fails', async () => {
  const drive = demoDrive();
  const workspace = await createWorkspace(drive, 'demo-root');
  await workspace.rebuild();
  const [csv] = await drive.list('Scripts');
  const previous = await drive.read(csv.id);
  await drive.create('Bibs', 'MA0005_broken.bib', '@article{bad, title={Missing', 'text/plain');
  await assert.rejects(workspace.rebuild(), /MA0005_broken/);
  assert.equal(await drive.read(csv.id), previous);
});

test('rejects a stale Bib draft and preserves the latest content', async () => {
  const drive = demoDrive();
  const workspace = await createWorkspace(drive, 'demo-root');
  const file = await workspace.findBib('MA0001');
  const draft = await workspace.openText('Bibs', file);
  const changed = draft.content.replace('2024', '2028');
  await drive.update(file.id, changed, 'text/plain');
  await assert.rejects(workspace.saveText(draft, draft.content), /変更されました/);
  assert.equal(await drive.read(file.id), changed);
});

test('keeps the original Bib body, including unknown fields, on save', async () => {
  const drive = demoDrive();
  const workspace = await createWorkspace(drive, 'demo-root');
  const file = await workspace.findBib('MA0001');
  const draft = await workspace.openText('Bibs', file);
  const raw = '% local comment\n@book{chosen, title={A}, abstract={Keep}, other_field={Keep}}\n';
  const saved = await workspace.saveText(draft, raw);
  assert.equal(saved.id, file.id);
  assert.equal(await drive.read(file.id), raw);
});

test('recomputes an occupied MA prefix before creating a Bib', async () => {
  const workspace = await createWorkspace(demoDrive(), 'demo-root');
  const { prefix } = await workspace.nextNumber();
  const source = '@misc{New, title={Title}}';
  assert.equal(prefix, 'MA0005_');
  assert.ok((await workspace.createBib(prefix, prefix + 'New.bib', source)).saved);
  assert.equal((await workspace.createBib(prefix, prefix + 'Second.bib', source)).next.nextId, 'MA0006');
});

test('treats embedded line breaks, matching quotes, and BOM as CSV data', async () => {
  const drive = demoDrive();
  const workspace = await createWorkspace(drive, 'demo-root');
  const file = await workspace.findBib('MA0001');
  const source = '@book{Key, title={A, "B"}, _notes={Line one\nLine two}}\n';
  await drive.update(file.id, source, 'application/x-bibtex');
  await workspace.rebuild();
  const [csv] = await drive.list('Scripts');
  await drive.update(csv.id, '\ufeff' + await drive.read(csv.id), 'text/csv');
  const entry = (await workspace.readCatalog()).entries.find(row => row.id === 'MA0001');
  assert.equal(entry.bib_source, source);
  assert.equal(entry.bib_notes, 'Line one\nLine two');
  assert.equal(entry.title, 'A, "B"');
});

test('checks the file belongs to the active root before reading or writing', async () => {
  const drive = demoDrive();
  const workspace = await createWorkspace(drive, 'demo-root');
  const file = await drive.create('Notes', 'MA0001_外部のファイル.bib', '@misc{New, title={Title}}', 'text/plain');
  await assert.rejects(workspace.openText('Bibs', file), /場所や種類が変わりました/);
  await assert.rejects(workspace.saveText({ file, folder:'Bibs' }, 'Do not write'), /場所や種類が変わりました/);
  assert.equal(await drive.read(file.id), '@misc{New, title={Title}}');
});

test('keeps only matching PDFs in Originals and returns direct links without reading PDF bytes', async () => {
  const drive = demoDrive();
  const attached = await drive.create('Originals', 'MA0001_example.pdf', '', 'application/pdf');
  const unattached = await drive.create('Originals', 'unregistered.pdf', '', 'application/pdf');
  const misplaced = await drive.create('Notes', 'MA0002_example.pdf', '', 'application/pdf');
  const otherType = await drive.create('Originals', 'example.txt', '', 'text/plain');
  drive.searchPdfs = async (folder, query) => {
    assert.equal(folder.id, 'Originals');
    assert.equal(query, 'text in the PDF');
    return [attached, unattached, misplaced, otherType, { ...attached, trashed: true }];
  };
  drive.read = () => assert.fail('PDF body was downloaded');
  const workspace = await createWorkspace(drive, 'demo-root');
  assert.deepEqual(await workspace.searchOriginalPdfs('text in the PDF'), [
    { name: attached.name, url: 'https://drive.google.com/open?id=' + attached.id, entryId: 'MA0001' },
    { name: unattached.name, url: 'https://drive.google.com/open?id=' + unattached.id, entryId: '' },
  ]);
});

test('leaves the CSV untouched when an input changes during generation', async () => {
  const drive = demoDrive();
  const workspace = await createWorkspace(drive, 'demo-root');
  await workspace.rebuild();
  const [csv] = await drive.list('Scripts');
  const previous = await drive.read(csv.id);
  const bib = await workspace.findBib('MA0001');
  await drive.update(bib.id, (await drive.read(bib.id)).replace('2024', '2028'), 'text/plain');
  const read = drive.read;
  drive.read = async id => {
    const text = await read(id);
    if (id === bib.id) await drive.update(id, text.replace('2028', '2029'), 'text/plain');
    return text;
  };
  await assert.rejects(workspace.rebuild(), /生成中に文献フォルダが変更/);
  assert.equal(await drive.read(csv.id), previous);
});

function trackDriveCalls(drive) {
  const calls = [];
  for (const method of ['get', 'list', 'read', 'update', 'create']) {
    const request = drive[method];
    drive[method] = (...args) => {
      calls.push({ method, id: args[0] });
      return request(...args);
    };
  }
  return calls;
}

test('checks Bibs once per batch and uses just eight metadata requests for an unchanged catalog', async () => {
  const drive = demoDrive();
  for (let number = 5; number <= 17; number++) {
    const id = String(number).padStart(4, '0');
    await drive.create('Bibs', 'MA' + id + '_sample.bib', '@misc{Key' + id + ', title={Sample}}', 'application/x-bibtex');
  }
  const workspace = await createWorkspace(drive, 'demo-root');
  const calls = trackDriveCalls(drive);
  const initial = await workspace.rebuild();
  assert.equal(initial.entries.length, 17);
  assert.equal(calls.filter(call => call.method === 'get' && call.id === 'Bibs').length, 5);
  assert.equal(calls.filter(call => call.method === 'read').length, 17);

  calls.length = 0;
  assert.deepEqual(await workspace.rebuild(), { ...initial, changed: false });
  assert.equal(calls.filter(call => call.method === 'get').length, 4);
  assert.equal(calls.filter(call => call.method === 'list').length, 4);
  assert.equal(calls.length, 8);
});

test('restores the previous build in a new workspace and reads only edited Bib files', async () => {
  let record;
  const cache = {
    read: async () => structuredClone(record),
    write: async value => { record = structuredClone(value); },
  };
  const drive = demoDrive();
  const initial = await (await createWorkspace(drive, 'demo-root', cache)).rebuild();
  const workspace = await createWorkspace(drive, 'demo-root', cache);
  const calls = trackDriveCalls(drive);
  assert.deepEqual(await workspace.rebuild(), { ...initial, changed: false });
  assert.equal(calls.length, 8);

  const bib = await workspace.findBib('MA0001');
  await drive.update(bib.id, '@misc{Edited, title={Updated}, _notes={memo}}', 'application/x-bibtex');
  calls.length = 0;
  const rebuilt = await workspace.rebuild();
  assert.equal(rebuilt.changed, true);
  assert.equal(rebuilt.entries.find(entry => entry.id === 'MA0001').title, 'Updated');
  assert.deepEqual(calls.filter(call => call.method === 'read'), [{ method: 'read', id: bib.id }]);

  await drive.create('Originals', 'MA0001_example.pdf', 'example', 'application/pdf');
  calls.length = 0;
  const withAttachment = await workspace.rebuild();
  assert.equal(withAttachment.changed, true);
  assert.equal(withAttachment.entries.find(entry => entry.id === 'MA0001').originals[0].name, 'MA0001_example.pdf');
  assert.equal(calls.filter(call => call.method === 'read').length, 0);
});

test('reads the published CSV again after an external edit', async () => {
  const drive = demoDrive();
  const workspace = await createWorkspace(drive, 'demo-root');
  await workspace.rebuild();
  const [csv] = await drive.list('Scripts');
  const published = await drive.read(csv.id);
  await drive.update(csv.id, published.replace('A notebook for reading research', 'External title'), 'text/csv');
  const calls = trackDriveCalls(drive);

  assert.equal((await workspace.rebuild()).changed, true);
  assert.deepEqual(calls.filter(call => call.method === 'read'), [{ method: 'read', id: csv.id }]);
  assert.equal(await drive.read(csv.id), published);
});

test('continues with the current page cache when browser storage is unavailable', async () => {
  const unavailable = () => { throw new Error('Storage unavailable'); };
  const drive = demoDrive();
  const workspace = await createWorkspace(drive, 'demo-root', { read: unavailable, write: unavailable });
  assert.equal((await workspace.rebuild()).changed, true);

  const calls = trackDriveCalls(drive);
  assert.equal((await workspace.rebuild()).changed, false);
  assert.equal(calls.length, 8);
});


test('adds multiline Bib notes and tags without changing existing source', async () => {
  const source = '\ufeff% header\r\n@comment{ignore}\r\n@book{Key, % comment\r\n    title={A},\r\n    unknown={Keep}\r\n}\r\n';
  const note = '1行目 {注}\n2行目 \\ Unicode';
  const tags = ['日本語', '{tag}', 'foo\\bar', '日本語'];
  const edited = writeBibAnnotations(source, note, tags);
  const added = edited.slice(source.indexOf(', % comment') + 1, edited.indexOf(' % comment'));
  assert.equal(edited.replace(added, ''), source);
  assert.deepEqual(readBibAnnotations(edited).tags, tags.slice(0, 3));
  assert.equal(readBibAnnotations(edited).note, note);

  const drive = demoDrive();
  const workspace = await createWorkspace(drive, 'demo-root');
  const draft = await workspace.openText('Bibs', await workspace.findBib('MA0001'));
  await workspace.saveText(draft, edited);
  const { entries } = await workspace.rebuild();
  const entry = entries.find(row => row.id === 'MA0001');
  assert.deepEqual(entry.tags, tags.slice(0, 3));
  assert.equal(entry.bib_notes, note);
  assert.equal(entry.bib_source, edited);
});

test('only rewrites the values of Bib annotations that changed', () => {
  const source = '@book{Key,\n  _notes = "Keep " # {this}, % comment\n  _tags = {reading},\n  title = {Original}\n}\n';
  assert.equal(writeBibAnnotations(source, 'Keep this', ['reading']), source);
  assert.equal(writeBibAnnotations(source, 'Keep this', ['reading', 'other']), source.replace('{reading}', '{reading, other}'));
  assert.equal(writeBibAnnotations(source, '', ['reading']), source.replace('"Keep " # {this}', '{}'));
  assert.throws(() => writeBibAnnotations(source, 'Keep this', ['comma,tag']), /カンマ/);
});

test('reuses a previously loaded CSV only when its Drive version still matches', async () => {
  const drive = demoDrive();
  const initial = await (await createWorkspace(drive, 'demo-root')).rebuild();
  const [csv] = await drive.list('Scripts');
  let record;
  const cache = {
    readPublished: async () => structuredClone(record),
    writePublished: async value => { record = structuredClone(value); },
  };
  const calls = trackDriveCalls(drive);

  const read = async () => (await createWorkspace(drive, 'demo-root', cache)).readCatalog();
  assert.deepEqual((await read()).entries, initial.entries);
  assert.deepEqual(calls.filter(call => call.method === 'read'), [{ method: 'read', id: csv.id }]);
  assert.equal(calls.filter(call => call.method === 'get' && call.id === 'Scripts').length, 1);

  calls.length = 0;
  assert.deepEqual((await read()).entries, initial.entries);
  assert.equal(calls.some(call => call.method === 'read'), false);

  const edited = record.content.replace('A notebook for reading research', 'Changed title');
  await drive.update(csv.id, edited, 'text/csv');
  calls.length = 0;
  assert.equal((await read()).entries.find(entry => entry.id === 'MA0001').title, 'Changed title');
  assert.deepEqual(calls.filter(call => call.method === 'read'), [{ method: 'read', id: csv.id }]);
});

test('checks folder placement and download permission before using a cached CSV', async () => {
  const drive = demoDrive();
  await (await createWorkspace(drive, 'demo-root')).rebuild();
  const [csv] = await drive.list('Scripts');
  let record;
  const cache = {
    readPublished: async () => record,
    writePublished: async value => { record = value; },
  };
  const workspace = await createWorkspace(drive, 'demo-root', cache);
  await workspace.readCatalog();

  const get = drive.get;
  drive.get = async id => {
    const file = await get(id);
    if (id === csv.id) file.capabilities.canDownload = false;
    return file;
  };
  drive.read = async () => { throw new Error('Drive denied download'); };
  await assert.rejects(workspace.readCatalog(), /Drive denied download/);

  drive.get = async id => {
    const file = await get(id);
    if (id === 'Scripts') file.parents = ['outside-root'];
    return file;
  };
  await assert.rejects(workspace.readCatalog(), /Scripts の場所が変わりました/);
});
