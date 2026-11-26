import { strToU8, zip } from 'fflate';

const xml = text => String(text).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g, '').replace(
  /[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]));
const md = text => String(text).replace(/[\\`*_[\]{}<>#|!+~]/g, '\\$&');
const captionText = lines => lines.map(line => line.inline.map(item => item.text).join('')).join(' ');

function lineText(line, format) {
  return line.inline.map(({ text, ruby }) => {
    if (format === 'epub') {
      return ruby ? `<ruby>${xml(text)}<rp>（</rp><rt>${xml(ruby)}</rt><rp>）</rp></ruby>` : xml(text);
    }
    return md(text) + (ruby ? `（${md(ruby)}）` : '');
  }).join('');
}

function paragraph(lines, format) {
  return lines.reduce((output, line, index) => {
    const content = lineText(line, format);
    if (!index) return content;
    if (lines[index - 1].breakAfter) return output + (format === 'epub' ? '<br />' : '  \n') + content;
    const previous = lines[index - 1].inline.at(-1);
    const first = line.inline[0];
    return output + (/[A-Za-z0-9.!?;:)]$/.test(previous?.ruby || previous?.text || '') &&
      /^[A-Za-z0-9]/.test(first?.text || '') ? ' ' : '') + content;
  }, '');
}

function tableToMarkdown({ rows, columns, cells }) {
  const indexed = new Map(cells.map(cell => [cell.row * columns + cell.column, cell]));
  if (cells.some(cell => cell.rowspan > 1 || cell.colspan > 1)) {
    const covered = new Set();
    let body = '';
    for (let row = 0; row < rows; row++) {
      body += '<tr>';
      for (let col = 0; col < columns; col++) {
        const slot = row * columns + col;
        if (covered.has(slot)) continue;
        const cell = indexed.get(slot);
        if (!cell) { body += '<td></td>'; continue; }
        for (let y = row; y < row + cell.rowspan; y++) {
          for (let x = col; x < col + cell.colspan; x++) covered.add(y * columns + x);
        }
        body += `<td rowspan="${cell.rowspan}" colspan="${cell.colspan}">${xml(cell.text)}</td>`;
      }
      body += '</tr>\n';
    }
    return `<table>\n${body}</table>`;
  }
  const rowText = row => '| ' + Array.from({ length: columns }, (_, col) =>
    md(indexed.get(row * columns + col)?.text ?? '').replace(/\r?\n/g, '<br>')).join(' | ') + ' |';
  return [rowText(0), '| ' + Array(columns).fill('---').join(' | ') + ' |',
    ...Array.from({ length: rows - 1 }, (_, row) => rowText(row + 1))].join('\n');
}

function blocksWithFiles(pages) {
  return pages.flatMap(page => page.blocks.map((block, index) => ({
    ...block,
    number: page.number,
    file: block.image ? `images/p${page.number}-${index + 1}.png` : undefined,
  })));
}

function markdownBlock(block, includeImages) {
  if (block.image) {
    const caption = paragraph(block.caption, 'md');
    if (block.table) return [tableToMarkdown(block.table), caption].filter(Boolean).join('\n\n');
    if (!includeImages) return [block.tableText?.map(md).join('  \n'), caption].filter(Boolean).join('\n\n');
    const alt = md(captionText(block.caption) || (block.kind === 'table' ? '表' : '図版'));
    const visual = `![${alt}](${block.file})`;
    return caption ? `${visual}\n\n${caption}` : visual;
  }
  const text = paragraph(block.lines, 'md');
  if (block.kind === 'heading') return '#'.repeat(block.level) + ' ' + text;
  if (block.kind === 'list') return text.replace(/^[・•]\s*/, '- ').replace(/^(?!- )/, '- ');
  return text;
}

function epubBlock(block) {
  if (block.image) {
    const label = block.kind === 'table' ? '表' : '図版';
    const alt = block.caption.length ? label : `${label}（原本 ${block.number} ページ）`;
    const caption = block.caption.length ? `<figcaption>${paragraph(block.caption, 'epub')}</figcaption>` : '';
    return `<figure><img src="${block.file}" alt="${xml(alt)}" />${caption}</figure>`;
  }
  const text = paragraph(block.lines, 'epub');
  if (block.kind === 'heading') return `<h${block.level}>${text}</h${block.level}>`;
  if (block.kind === 'list') return `<ul><li>${text}</li></ul>`;
  return `<p>${text}</p>`;
}

const stored = data => [data, { level: 0 }];
function archive(entries) {
  return new Promise((resolve, reject) => zip(entries, (error, bytes) => error ? reject(error) : resolve(bytes)));
}

export async function createMarkdown(title, pages, { includeImages = false } = {}) {
  const blocks = blocksWithFiles(pages);
  const parts = blocks.map(block => markdownBlock(block, includeImages));
  const text = strToU8('# ' + md(title) + '\n\n' + parts.filter(Boolean).join('\n\n') + '\n');
  if (!includeImages) return text;
  const files = { 'document.md': text };
  for (const block of blocks) {
    if (block.image && !block.table) files[block.file] = stored(block.image);
  }
  return archive(files);
}

const xhtml = (title, body, language, extra = '', namespaces = '') => `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" ${namespaces} lang="${language}" xml:lang="${language}">
<head><meta charset="utf-8" /><title>${xml(title)}</title>${extra}</head><body>${body}</body></html>`;

export async function createEpub(title, pages, language, vertical) {
  const blocks = blocksWithFiles(pages);
  const chapters = [];
  for (const block of blocks) {
    if (!chapters.length || (block.kind === 'heading' && block.level <= 2 && chapters.at(-1).blocks.length)) {
      const name = block.kind === 'heading' ? captionText(block.lines) : title;
      chapters.push({ name, file: `chapter-${chapters.length + 1}.xhtml`, blocks: [] });
    }
    chapters.at(-1).blocks.push(block);
  }
  if (!chapters.length) chapters.push({ name: title, file: 'chapter-1.xhtml', blocks: [] });
  const toc = chapters.map(chapter => `<li><a href="${chapter.file}">${xml(chapter.name)}</a></li>`).join('');
  const images = blocks.filter(block => block.image);
  const uuid = 'urn:uuid:' + crypto.randomUUID();
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const items = chapters.map((chapter, index) => `<item id="c${index}" href="${chapter.file}" media-type="application/xhtml+xml"/>`).join('');
  const spine = chapters.map((_, index) => `<itemref idref="c${index}"/>`).join('');
  const imageItems = images.map((block, index) => `<item id="i${index}" href="${block.file}" media-type="image/png"/>`).join('');
  const files = {
    mimetype: stored(strToU8('application/epub+zip')),
    'META-INF/container.xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),
    'EPUB/book.opf': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${language}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">${uuid}</dc:identifier><dc:title>${xml(title)}</dc:title><dc:language>${language}</dc:language><meta property="dcterms:modified">${modified}</meta></metadata>
<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="style" href="book.css" media-type="text/css"/>${items}${imageItems}</manifest>
<spine page-progression-direction="${vertical ? 'rtl' : 'ltr'}">${spine}</spine></package>`),
    'EPUB/nav.xhtml': strToU8(xhtml(title, `<nav epub:type="toc" id="toc"><h1>${language === 'ja' ? '目次' : 'Contents'}</h1><ol>${toc}</ol></nav>`,
      language, '', 'xmlns:epub="http://www.idpf.org/2007/ops"')),
    'EPUB/book.css': strToU8((vertical ? 'html { writing-mode: vertical-rl; }\n' : '') +
      'body { line-height: 1.75; }\nfigure { margin: 1em auto; break-inside: avoid; }\nimg { max-width: 100%; max-height: 85vh; object-fit: contain; }\nfigcaption { font-size: .9em; }'),
  };
  for (const chapter of chapters) {
    files['EPUB/' + chapter.file] = strToU8(xhtml(chapter.name,
      chapter.blocks.map(epubBlock).join('\n') || `<h1>${xml(title)}</h1>`, language,
      '<link rel="stylesheet" type="text/css" href="book.css" />'));
  }
  for (const block of images) files['EPUB/' + block.file] = stored(block.image);
  return archive(files);
}
