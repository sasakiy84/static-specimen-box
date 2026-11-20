import { FOLDER_MIME } from './drive.js';

const sample = [
  ['MA0001', 'article', 'Sample2024', 'A notebook for reading research', 'Sample, Robin', '2024', 'text, handbook', 'An example memo.'],
  ['MA0002', 'book', 'Yamada2025', '文献をつなぐ読書ノート', '山田, 春', '2025', '日本語, 読解', 'テスト用のノートです。'],
  ['MA0003', 'inproceedings', 'Rivera2026', 'Sketches for visual comparison', 'Rivera, Casey and Lee, Morgan', '2026', 'English, p:vis', 'An example of a proceedings entry.'],
  ['MA0004', 'incollection', 'Sato2023p20', '調査記録を読み返す', '佐藤, 凪', '2023', '日本語, 読解, text', '文献の詳細・Bib・参考文献を試せます。'],
];

export function demoDrive() {
  const now = '2026-11-19T10:00:00.000Z';
  const files = new Map();
  const bodies = new Map();
  let sequence = 0;
  function add(name, parent, mimeType, content, id = `demo-file-${++sequence}`) {
    const file = {
      id, name, parents: parent ? [parent] : [], mimeType, modifiedTime: now,
      version: '1', size: String(new Blob([content ?? '']).size),
      capabilities: { canEdit: true, canAddChildren: true },
    };
    files.set(id, file);
    bodies.set(id, content ?? '');
    return structuredClone(file);
  }
  const root = add('サンプル文献', null, FOLDER_MIME, '', 'demo-root');
  for (const name of ['Bibs', 'Originals', 'Notes', 'Scripts']) add(name, root.id, FOLDER_MIME, '', name);
  for (const [id, type, key, title, author, year, tags, memo] of sample) {
    const [person] = author.split(' and ');
    const surname = person.split(',')[0];
    add(`${id}_${year}_${surname}_${title}.bib`, 'Bibs', 'application/x-bibtex', [
      `@${type}{${key},`,
      `  title = {${title}},`, `  author = {${author}},`, `  date = {${year}},`,
      `  language = {${/^[A-Z]/.test(title) ? 'english' : 'japanese'}},`,
      `  _tags = {${tags}},`, `  _notes = {${memo}},`,
      '}\n',
    ].join('\n'));
  }
  add('MA0002_読書メモ.md', 'Notes', 'text/markdown', '# 読書メモ\n\nこれは編集できるサンプルです。\n');
  return {
    async get(id) {
      if (!files.has(id)) throw new Error('サンプルファイルが見つかりません。');
      return structuredClone(files.get(id));
    },
    async list(id) { return structuredClone([...files.values()].filter(file => file.parents.includes(id))); },
    async read(id) {
      const body = bodies.get(id);
      return body instanceof Blob ? body.text() : body;
    },
    async update(id, content, mimeType) {
      const file = files.get(id);
      Object.assign(file, { mimeType, size: String(new Blob([content]).size), version: String(Number(file.version) + 1), modifiedTime: new Date().toISOString() });
      bodies.set(id, content);
      return structuredClone(file);
    },
    async create(parent, name, content, mimeType) { return add(name, parent, mimeType, content); },
  };
}
