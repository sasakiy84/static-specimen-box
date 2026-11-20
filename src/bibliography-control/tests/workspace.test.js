import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoDrive } from '../src/demo.js';
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

test('leaves the CSV untouched when an input changes during generation', async () => {
  const drive = demoDrive();
  const workspace = await createWorkspace(drive, 'demo-root');
  await workspace.rebuild();
  const [csv] = await drive.list('Scripts');
  const previous = await drive.read(csv.id);
  const bib = await workspace.findBib('MA0001');
  const read = drive.read;
  drive.read = async id => {
    const text = await read(id);
    if (id === bib.id) await drive.update(id, text.replace('2024', '2029'), 'text/plain');
    return text;
  };
  await assert.rejects(workspace.rebuild(), /生成中に文献フォルダが変更/);
  assert.equal(await drive.read(csv.id), previous);
});
