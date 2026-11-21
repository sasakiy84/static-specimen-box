// CSV の生成規則を変えたときは、この値を進めて前回の生成結果を再検証する。
export const catalogRevision = 2;

const CSV_COLUMNS = [
    'id', 'citekey', 'entrytype', 'title', 'author', 'date', 'year',
    'publication', 'publisher', 'volume', 'number', 'pages', 'doi',
    'url', 'language', 'keywords', 'abstract', 'bib_url', 'originals', 'notes',
    'tags', 'bib_notes', 'bib_source', 'bib_modified_at', 'bib_fields', 'bib_filename'
];
/** @typedef {{name: string, url: string}} CatalogFile */
/** @typedef {{name: string, url: string, content: string, modifiedAt?: string}} BibSource */
/** @typedef {Object<string, string>} CatalogEntry */
function buildCatalogEntries_(bibs, originalFiles, noteFiles) {
    const originals = indexAttachments_(originalFiles);
    const notes = indexAttachments_(noteFiles);
    const entries = [];
    const seen = new Set();
    for (const bib of bibs) {
        const id = extractId_(bib.name);
        if (!id)
            throw new Error('文献IDがありません（ID_資料名.bib）: ' + bib.name);
        if (seen.has(id))
            throw new Error('文献IDが重複しています: ' + id);
        let parsed;
        try {
            parsed = parseBibFile_(bib.content);
        }
        catch (error) {
            throw new Error(bib.name + ': ' + error.message);
        }
        if (parsed.length !== 1) {
            throw new Error(bib.name + ': .bibファイルには書誌エントリを1件だけ記述してください');
        }
        seen.add(id);
        const entry = parsed[0];
        const fields = entry.fields;
        const raw = entry.rawFields;
        const { note, tags } = bibAnnotations(raw);
        const date = fields.date || fields.year || '';
        const year = fields.year || (date.match(/\b\d{4}\b/) || [''])[0];
        entries.push({
            id: id,
            citekey: entry.citekey,
            entrytype: entry.entrytype,
            title: fields.title || '',
            author: fields.author || fields.editor || '',
            date: date,
            year: year,
            publication: fields.journaltitle || fields.booktitle || fields.eventtitle ||
                fields.institution || fields.school || fields.organization || '',
            publisher: fields.publisher || '',
            volume: fields.volume || '',
            number: fields.number || '',
            pages: fields.pages || '',
            doi: fields.doi || '',
            url: fields.url || '',
            language: fields.language || fields.langid || '',
            keywords: fields.keywords || '',
            abstract: fields.abstract || '',
            bib_url: bib.url,
            originals: JSON.stringify(originals.get(id) || []),
            notes: JSON.stringify(notes.get(id) || []),
            tags: JSON.stringify(tags),
            bib_notes: note,
            bib_source: bib.content,
            bib_modified_at: bib.modifiedAt || '',
            bib_fields: JSON.stringify(raw),
            bib_filename: bib.name
        });
    }
    return entries.sort((a, b) => b.year.localeCompare(a.year) || a.id.localeCompare(b.id));
}
/** @param {CatalogEntry[]} entries @returns {string} */
function serializeEntries_(entries) {
    return [CSV_COLUMNS.join(',')].concat(entries.map(entry => CSV_COLUMNS.map(key => csvCell_(entry[key])).join(','))).join('\r\n') + '\r\n';
}
function extractId_(filename) {
    const separator = filename.indexOf('_');
    return separator > 0 ? filename.slice(0, separator) : '';
}
/** @param {CatalogFile[]} files @returns {Map<string, CatalogFile[]>} */
function indexAttachments_(files) {
    // 任意のIDを扱うため、constructor等の組み込みプロパティとも衝突させない。
    const indexed = new Map();
    for (const file of files) {
        const id = extractId_(file.name);
        if (!id)
            continue;
        if (!indexed.has(id))
            indexed.set(id, []);
        indexed.get(id).push({ name: file.name, url: file.url });
    }
    for (const attachments of indexed.values()) {
        attachments.sort((a, b) => a.name.localeCompare(b.name));
    }
    return indexed;
}
/** @param {string} value @returns {string} */
function csvCell_(value) {
    const text = String(value == null ? '' : value);
    return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}
/**
 * BibLaTeXを走査する。表示値と原文のフィールド値を別に保持する。
 * 波括弧内の引用符は文字として扱い、引用符で囲まれた値だけで引用状態を切り替える。
 * @param {string} text
 * @param {boolean} [trackValues]
 */
function parseBibFile_(text, trackValues = false) {
    const entries = [];
    let cursor = 0;
    while (cursor < text.length) {
        if (text[cursor] === '%') {
            const end = text.indexOf('\n', cursor);
            cursor = end < 0 ? text.length : end + 1;
            continue;
        }
        if (text[cursor] !== '@') {
            cursor++;
            continue;
        }
        const match = /^@([A-Za-z]+)\s*\{/.exec(text.slice(cursor));
        if (!match)
            throw new Error('書誌エントリは @type{...} で記述してください');
        const kind = match[1].toLowerCase();
        const start = cursor + match[0].length;
        let depth = 1;
        let quoted = false;
        let end = -1;
        for (let i = start; i < text.length; i++) {
            const char = text[i];
            if (char === '\\') {
                i++;
                continue;
            }
            if (char === '%' && depth === 1 && !quoted) {
                const newline = text.indexOf('\n', i);
                if (newline < 0)
                    break;
                i = newline;
                continue;
            }
            if (char === '"' && depth === 1) {
                quoted = !quoted;
                continue;
            }
            if (char === '{')
                depth++;
            if (char === '}') {
                if (quoted && depth === 1)
                    continue;
                depth--;
                if (depth === 0) {
                    end = i;
                    break;
                }
            }
        }
        if (end < 0)
            throw new Error('biblatexの波括弧または引用符が閉じていません');
        cursor = end + 1;
        if (['comment', 'preamble', 'string'].includes(kind))
            continue;
        const body = text.slice(start, end);
        const comma = body.indexOf(',');
        if (comma < 0)
            throw new Error('@' + kind + ' に引用キーがありません');
        const citekey = body.slice(0, comma).trim();
        if (!citekey)
            throw new Error('@' + kind + ' の引用キーが空です');
        const fieldStart = start + comma + 1;
        const valueRanges = trackValues ? new Map() : null;
        const recordValue = valueRanges && ((name, from, to) =>
            valueRanges.set(name, [fieldStart + from, fieldStart + to]));
        const rawFields = parseBibFields_(text.slice(fieldStart, end), recordValue);
        const fields = Object.create(null);
        Object.keys(rawFields).forEach(key => fields[key] = decodeBibText_(rawFields[key]));
        entries.push({ entrytype: kind, citekey: citekey, fields: fields, rawFields, valueRanges, fieldStart });
    }
    return entries;
}
function parseBibFields_(body, onValue) {
    const fields = Object.create(null);
    let i = 0;
    function whitespace() {
        while (i < body.length) {
            if (/\s/.test(body[i])) {
                i++;
                continue;
            }
            if (body[i] === '%') {
                while (i < body.length && body[i] !== '\n')
                    i++;
                continue;
            }
            break;
        }
    }
    function fragment() {
        const opening = body[i];
        if (opening === '{' || opening === '"') {
            const start = ++i;
            let depth = opening === '{' ? 1 : 0;
            while (i < body.length) {
                const char = body[i];
                if (char === '\\') {
                    i += 2;
                    continue;
                }
                if (char === '"' && opening === '"' && depth === 0) {
                    return body.slice(start, i++);
                }
                if (char === '{')
                    depth++;
                if (char === '}') {
                    depth--;
                    if (opening === '{' && depth === 0)
                        return body.slice(start, i++);
                    if (depth < 0)
                        throw new Error('フィールドの波括弧の対応が不正です');
                }
                i++;
            }
            throw new Error(opening === '{' ? 'フィールドの波括弧が閉じていません' : 'フィールドの引用符が閉じていません');
        }
        const start = i;
        while (i < body.length && !/[\s,#%]/.test(body[i]))
            i++;
        if (start === i)
            throw new Error('フィールド値を読み取れません');
        return body.slice(start, i);
    }
    while (true) {
        whitespace();
        if (i >= body.length)
            break;
        const keyMatch = /^[a-zA-Z_][\w-]*/.exec(body.slice(i));
        if (!keyMatch)
            throw new Error('フィールド名を読み取れません: ' + body.slice(i, i + 20));
        const name = keyMatch[0].toLowerCase();
        i += keyMatch[0].length;
        whitespace();
        if (body[i++] !== '=')
            throw new Error(name + ' に = がありません');
        whitespace();
        const start = i;
        let value = fragment();
        let end = i;
        whitespace();
        while (body[i] === '#') {
            i++;
            whitespace();
            value += fragment();
            end = i;
            whitespace();
        }
        if (Object.prototype.hasOwnProperty.call(fields, name))
            throw new Error('フィールドが重複しています: ' + name);
        fields[name] = value;
        onValue?.(name, start, end);
        if (i < body.length) {
            if (body[i] !== ',')
                throw new Error(name + ' の後にコンマがありません');
            i++;
        }
    }
    return fields;
}
/** @param {string} value @returns {string} */
function decodeBibText_(value) {
    // エスケープされた波括弧は本文として保持する。
    const text = String(value).replace(/\r\n?/g, '\n')
        .replace(/\\([&%_#{}$])/g, (_, char) => char === '{' ? '\uE000' : char === '}' ? '\uE001' : char)
        .replace(/\\(?:textit|emph|textbf)\s*\{/g, '{')
        .replace(/[{}]/g, '').replace(/~/g, ' ')
        .replace(/\uE000/g, '{').replace(/\uE001/g, '}');
    return text.replace(/\s+/g, ' ').trim();
}
const customEscapes = { '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}' };

function escapeCustomText(text) {
    return text.replace(/[\\{}]/g, character => customEscapes[character]);
}

function unescapeCustomText(text) {
    return text.replace(/\\(textbackslash\{\}|textasciitilde\{\}|textasciicircum\{\}|[{}&%$#_])/g, (_, value) =>
        ({ 'textbackslash{}': '\\', 'textasciitilde{}': '~', 'textasciicircum{}': '^' })[value] ?? value);
}

function bibAnnotations(fields) {
    const note = unescapeCustomText((fields._notes || '').replace(/\r\n?/g, '\n').trim());
    const tags = (fields._tags || '').split(',').map(tag => unescapeCustomText(tag.trim())).filter(Boolean);
    return { note, tags: [...new Set(tags)] };
}

function singleBib(source, trackValues = false) {
    const entries = parseBibFile_(source, trackValues);
    if (entries.length !== 1) throw new Error('Bib に書誌エントリが1件あることを確認してください。');
    return entries[0];
}

export function readBibAnnotations(source) {
    const { rawFields } = singleBib(source);
    return { ...bibAnnotations(rawFields), fields: rawFields };
}

export function writeBibAnnotations(source, note, tags) {
    const { rawFields, valueRanges, fieldStart } = singleBib(source, true);
    const current = bibAnnotations(rawFields);
    const nextNote = note.replace(/\r\n?/g, '\n').trim();
    const nextTags = [...new Set(tags.map(tag => tag.trim()).filter(Boolean))];
    if (nextTags.some(tag => /[,\r\n]/.test(tag))) throw new Error('タグにカンマや改行を含めることはできません。');
    const updates = [];
    const additions = [];
    const newline = source.includes('\r\n') ? '\r\n' : '\n';
    for (const [name, value, changed] of [
        ['_notes', nextNote.replaceAll('\n', newline), current.note !== nextNote],
        ['_tags', nextTags.join(', '), JSON.stringify(current.tags) !== JSON.stringify(nextTags)],
    ]) {
        if (!changed) continue;
        const written = '{' + escapeCustomText(value) + '}';
        const range = valueRanges.get(name);
        if (range) updates.push([...range, written]);
        else additions.push('  ' + name + ' = ' + written + ',');
    }
    if (additions.length) {
        const suffix = /^[ \t]*\r?\n/.test(source.slice(fieldStart)) ? '' : newline;
        updates.push([fieldStart, fieldStart, newline + additions.join(newline) + suffix]);
    }
    for (const [from, to, replacement] of updates.sort((left, right) => right[0] - left[0])) {
        source = source.slice(0, from) + replacement + source.slice(to);
    }
    return source;
}

function parseCatalogRows_(rows) {
    if (!rows.length || !rows[0].length)
        throw new Error('CSVが空です');
    const headers = rows[0];
    const required = ['id', 'citekey', 'title', 'author', 'year', 'entrytype', 'originals', 'notes'];
    if (new Set(headers).size !== headers.length || required.some(name => !headers.includes(name))) {
        throw new Error('CSVの列名が想定と異なります');
    }
    const schemaReady = ['tags', 'bib_notes', 'bib_source', 'bib_modified_at', 'bib_fields', 'bib_filename'].every(name => headers.includes(name));
    const seen = new Set();
    const entries = [];
    rows.slice(1).forEach((row, rowIndex) => {
        if (!row.some(Boolean))
            return;
        if (row.length !== headers.length)
            throw new Error('CSVの列数が不正です（行' + (rowIndex + 2) + '）');
        const entry = Object.create(null);
        headers.forEach((name, index) => entry[name] = row[index] || '');
        if (!entry.id || seen.has(entry.id))
            throw new Error('文献IDが空か重複しています');
        seen.add(entry.id);
        ['originals', 'notes'].forEach(key => {
            entry[key] = JSON.parse(entry[key] || '[]');
            if (!Array.isArray(entry[key]) || entry[key].some(file => !file || typeof file.name !== 'string' || typeof file.url !== 'string')) {
                throw new Error('添付ファイル一覧が不正です: ' + entry.id);
            }
        });
        entry.tags = JSON.parse(entry.tags || '[]');
        if (!Array.isArray(entry.tags) || entry.tags.some(tag => typeof tag !== 'string'))
            throw new Error('タグが不正です: ' + entry.id);
        entry.tags = Array.from(new Set(entry.tags.map(tag => tag.trim()).filter(Boolean)));
        entry.bib_fields = JSON.parse(entry.bib_fields || '{}');
        if (!entry.bib_fields || Array.isArray(entry.bib_fields) || typeof entry.bib_fields !== 'object' ||
            Object.values(entry.bib_fields).some(value => typeof value !== 'string'))
            throw new Error('書誌フィールドが不正です: ' + entry.id);
        entry.bib_notes = entry.bib_notes || '';
        entry.bib_source = entry.bib_source || '';
        entry.bib_modified_at = entry.bib_modified_at || '';
        entry.bib_filename = entry.bib_filename || '';
        entries.push(entry);
    });
    return { entries: entries, schemaReady: schemaReady };
}
export function buildCatalogEntry(bib, originals, notes) {
    const [row] = buildCatalogEntries_([bib], [], []);
    const [entry] = parseCatalogRows_([CSV_COLUMNS, CSV_COLUMNS.map(name => row[name])]).entries;
    return { ...entry, originals, notes };
}

function calculateMaState_(filenames) {
    let highest = 0, latestId = null;
    for (const filename of filenames) {
        if (!/\.bib$/i.test(filename)) continue;
        const separator = filename.indexOf('_');
        if (separator <= 0) continue;
        const id = filename.slice(0, separator);
        const match = /^MA(\d{4,})$/.exec(id);
        if (!match) continue;
        const number = Number(match[1]);
        if (!Number.isSafeInteger(number) || number >= Number.MAX_SAFE_INTEGER)
            throw new Error('採番できる整数範囲を超えています: ' + filename);
        if (latestId === null || number > highest ||
            (number === highest && (id.length < latestId.length || (id.length === latestId.length && id < latestId)))) {
            highest = number;
            latestId = id;
        }
    }
    const nextId = 'MA' + String(highest + 1).padStart(4, '0');
    return { series: 'MA', latestId: latestId, nextId: nextId, prefix: nextId + '_' };
}

export { buildCatalogEntries_, serializeEntries_, extractId_, parseCatalogRows_, calculateMaState_ };
