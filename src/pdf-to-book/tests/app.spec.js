import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { strFromU8, unzipSync } from 'fflate';

async function fixture(page) {
  const images = await page.evaluate(() => {
    const image = document.createElement('canvas');
    image.width = 1180;
    image.height = 1520;
    const draw = image.getContext('2d');
    draw.fillStyle = 'white';
    draw.fillRect(0, 0, image.width, image.height);
    draw.fillStyle = '#000';
    draw.font = 'bold 48px serif';
    draw.fillText('Sample Document', 105, 120);
    draw.font = '31px serif';
    draw.fillText('This sample verifies browser optical character recognition.', 105, 210);
    draw.fillText('8642 records are listed in the archive.', 105, 262);
    draw.font = '20px serif';
    draw.fillText('としょかん', 110, 315);
    draw.font = '36px serif';
    draw.fillText('図書館の資料を読み取ります。', 103, 355);
    draw.strokeStyle = '#141414';
    draw.lineWidth = 3;
    for (const y of [455, 515, 575, 635, 695]) {
      draw.beginPath(); draw.moveTo(105, y); draw.lineTo(990, y); draw.stroke();
    }
    for (const x of [105, 400, 690, 990]) {
      draw.beginPath(); draw.moveTo(x, 455); draw.lineTo(x, 695); draw.stroke();
    }
    draw.font = '28px serif';
    for (const [row, cells] of [['Material', 'Copies', 'Status'], ['Books', '55', 'Ready'], ['Maps', '27', 'Ready'], ['Records', '37', 'Saved']].entries()) {
      cells.forEach((text, col) => draw.fillText(text, [125, 425, 720][col], 495 + row * 60));
    }
    draw.font = '24px serif';
    draw.fillText('Table 1. Archival holdings', 105, 748);
    draw.fillStyle = '#d5dee8';
    draw.fillRect(110, 810, 650, 380);
    draw.beginPath();
    draw.moveTo(110, 1180); draw.lineTo(280, 900); draw.lineTo(440, 1100);
    draw.lineTo(550, 935); draw.lineTo(760, 1160); draw.lineTo(760, 1190); draw.closePath();
    draw.fillStyle = '#457461';
    draw.fill();
    draw.fillStyle = '#000';
    draw.fillText('Figure 1. Mountain landscape', 112, 1230);
    draw.font = '20px serif';
    draw.fillText('8642', 570, 1465);
    draw.fillText('Reference 2013.1', 860, 1465);
    const first = image.toDataURL('image/png');
    draw.fillStyle = 'white';
    draw.fillRect(0, 0, image.width, image.height);
    draw.fillStyle = '#000';
    draw.font = '40px serif';
    draw.fillText('A second page follows the first in the export.', 100, 200);
    return [first, image.toDataURL('image/png')];
  });
  const pdf = await PDFDocument.create();
  pdf.setTitle('OCR example');
  for (const image of images) {
    const page = pdf.addPage([590, 760]);
    page.drawImage(await pdf.embedPng(image), { x: 0, y: 0, width: 590, height: 760 });
  }
  const scan = Buffer.from(await pdf.save());
  const textPdf = await PDFDocument.load(scan);
  const [main] = textPdf.getPages();
  const font = await textPdf.embedFont(StandardFonts.Helvetica);
  main.drawText('The embedded text layer is the selected source.', { x: 53, y: 655, size: 15, font, opacity: 0 });
  const serif = await textPdf.embedFont(StandardFonts.TimesRoman);
  for (const [text, x] of [['8642', 285], ['Reference 2013.1', 430]]) {
    main.drawText(text, { x, y: 27.5, size: 10, font: serif, opacity: 0 });
  }
  main.drawText('Unclassified margin note.', { x: 470, y: 728, size: 10, font, opacity: 0 });
  return { scan, withText: Buffer.from(await textPdf.save()) };
}

async function download(page, name, path) {
  const started = page.waitForEvent('download');
  await page.getByRole('button', { name, exact: true }).click();
  const file = await started;
  await file.saveAs(path);
  return readFile(path);
}

function figureImages(archive, chapters) {
  return new Map(Array.from(
    chapters.matchAll(/<figure><img src="([^"]+)"[^>]*\/><figcaption>([^<]+)<\/figcaption><\/figure>/g),
    ([, path, caption]) => [caption, archive['EPUB/' + path]],
  ));
}

test('文字レイヤーとOCRの両方で柱とページ番号を除き、本文と図表を残す', async ({ page }, info) => {
  const outside = [];
  const modelRequests = [];
  page.on('request', request => {
    if (request.url().includes('/models/') && request.url().endsWith('.bin')) modelRequests.push(request.url());
    if (!['blob:', 'data:'].includes(new URL(request.url()).protocol) &&
        new URL(request.url()).origin !== new URL(info.project.use.baseURL).origin) outside.push(request.url());
  });
  await page.goto('./');
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: /WebGPU/ })).toHaveCount(0);
  const { scan, withText } = await fixture(page);
  const input = page.locator('#file');
  const preferText = page.getByRole('checkbox', { name: 'PDFに埋め込まれた文字を優先する' });
  const includeRuby = page.getByRole('checkbox', { name: 'ルビを出力する' });
  await expect(includeRuby).not.toBeChecked();
  await expect(preferText).toBeChecked();
  await preferText.uncheck();
  await input.setInputFiles({ name: 'sample.pdf', mimeType: 'application/pdf', buffer: scan });
  await expect(page.getByRole('region', { name: 'ダウンロード' })).toBeVisible({ timeout: 105_000 });
  const epub = unzipSync(await download(page, 'EPUB', info.outputPath('sample.epub')));
  const chapters = Object.entries(epub).filter(([name]) => name.includes('/chapter-')).map(([, bytes]) => strFromU8(bytes)).join('');
  expect(chapters).toContain('Sample Document');
  expect(chapters).toMatch(/browser optical character recognition/i);
  expect(chapters).toMatch(/A second page follows the first in the export/i);
  expect(chapters.indexOf('Sample Document')).toBeLessThan(chapters.search(/A second page follows the first/i));
  expect(chapters).toMatch(/8642 records are listed/i);
  expect(chapters.match(/8642/g)).toHaveLength(1);
  expect(chapters).not.toMatch(/Reference\s*2013/i);
  expect(chapters).not.toContain('The embedded text layer is the selected source.');
  expect(chapters).toContain('<figure>');
  expect(chapters).toContain('図書館の資料');
  expect(chapters).not.toMatch(/<ruby>|とし[ょよ]かん/);
  const figures = figureImages(epub, chapters);
  expect([...figures.keys()]).toEqual(['Table 1. Archival holdings', 'Figure 1. Mountain landscape']);
  for (const image of figures.values()) {
    const dimensions = new DataView(image.buffer, image.byteOffset, image.byteLength);
    expect(dimensions.getUint32(16)).toBeLessThan(590 * 2.5);
    expect(dimensions.getUint32(20)).toBeLessThan(760 * 2.5 / 2);
  }
  const preview = page.getByRole('region', { name: 'PDFプレビュー' });
  const overlay = preview.locator('#preview-overlay .konvajs-content');
  const bounds = await overlay.boundingBox();
  await overlay.hover({ position: { x: bounds.width * .24, y: bounds.height * .067 } });
  await expect(preview.locator('#preview-label')).toHaveText('見出し · OCR');
  await expect(preview.locator('#preview-text')).toHaveText('Sample Document');
  await expect(preview.getByRole('status')).toBeHidden();
  const legend = preview.getByRole('list', { name: '検出ラベルの凡例' });
  await expect(legend).toBeVisible();
  const currentBounds = await overlay.boundingBox();
  expect((await legend.boundingBox()).y).toBeGreaterThanOrEqual(currentBounds.y + currentBounds.height);
  await preview.screenshot({ path: info.outputPath('pdf-preview.png') });
  await overlay.hover({ position: { x: bounds.width * .124, y: bounds.height * .2 } });
  await expect(preview.locator('#preview-text')).toHaveText(/とし[ょよ]かん/);
  const frames = preview.getByRole('group', { name: '検出枠' });
  await frames.press('ArrowDown');
  await expect(preview.locator('#preview-tooltip')).toBeVisible();
  await frames.press('Escape');
  await expect(preview.locator('#preview-tooltip')).toBeHidden();
  const markdown = unzipSync(await download(page, 'Markdown（画像あり）', info.outputPath('sample-markdown.zip')));
  const document = strFromU8(markdown['document.md']);
  expect(document).toContain('Sample Document');
  expect(document.match(/8642/g)).toHaveLength(1);
  expect(document).not.toMatch(/Reference\s*2013/i);
  expect(document).toContain('Table 1.');
  expect(document).toContain('図書館の資料');
  expect(document).not.toMatch(/とし[ょよ]かん/);
  expect(document.match(/Figure 1\./g)).toHaveLength(2);
  expect(document).toMatch(/\|\s*Material\s*\||<table>/i);
  const plain = (await download(page, 'Markdown', info.outputPath('sample.md'))).toString();
  expect(plain).toContain('Figure 1. Mountain landscape');
  expect(plain).toMatch(/\|\s*Material\s*\||<table>/i);
  expect(plain).not.toMatch(/!\[|images\/|とし[ょよ]かん/);
  expect(Object.keys(markdown).some(file => file.endsWith('.png'))).toBe(true);
  expect(modelRequests.length).toBeGreaterThan(0);
  expect(modelRequests.some(url => /\/models\/table-/.test(url))).toBe(false);
  modelRequests.length = 0;
  await page.reload();
  await expect(preferText).toBeChecked();
  await includeRuby.check();
  await page.locator('input[name="pages"]').fill('1');
  await input.setInputFiles({ name: 'sample.pdf', mimeType: 'application/pdf', buffer: withText });
  await expect(page.getByRole('button', { name: 'EPUB', exact: true })).toBeVisible({ timeout: 45_000 });
  const textEpub = unzipSync(await download(page, 'EPUB', info.outputPath('prefer-pdf-text.epub')));
  const textChapters = Object.entries(textEpub).filter(([name]) => name.includes('/chapter-'))
    .map(([, bytes]) => strFromU8(bytes)).join('');
  expect(textChapters).toContain('The embedded text layer is the selected source.');
  expect(textChapters).toContain('Sample Document');
  expect(textChapters).toContain('Unclassified margin note.');
  expect(textChapters).toMatch(/8642 records are listed/i);
  expect(textChapters.match(/8642/g)).toHaveLength(1);
  expect(textChapters).not.toMatch(/Reference\s*2013/i);
  expect(textChapters).not.toMatch(/browser optical character recognition/i);
  expect(textChapters).toMatch(/<ruby>図書館<rp>（<\/rp><rt>とし[ょよ]かん<\/rt>/);
  const textFigures = figureImages(textEpub, textChapters);
  expect([...textFigures.keys()]).toEqual([...figures.keys()]);
  for (const [caption, image] of figures) {
    expect(Buffer.from(textFigures.get(caption))).toEqual(Buffer.from(image));
  }
  const textMarkdown = unzipSync(await download(page, 'Markdown（画像あり）', info.outputPath('prefer-pdf-text-markdown.zip')));
  const textDocument = strFromU8(textMarkdown['document.md']);
  expect(textDocument).toMatch(/図書館（とし[ょよ]かん）/);
  expect(textDocument).toContain('Unclassified margin note.');
  expect(textDocument.match(/8642/g)).toHaveLength(1);
  expect(textDocument).not.toMatch(/Reference\s*2013/i);
  expect(modelRequests).toEqual([]);
  expect(outside).toEqual([]);
  await page.screenshot({ path: info.outputPath('result.png') });
});

test('121ページのPDFで表示中の1ページだけを描画する', async ({ page }, info) => {
  const pdf = await PDFDocument.create();
  for (let number = 1; number <= 121; number++) {
    const sheet = pdf.addPage(number === 121 ? [540, 260] : [260, 540]);
    if (number === 1 || number === 121) sheet.drawText(`Page ${number}`, { x: 30, y: 190, size: 24 });
  }
  await page.goto('./');
  await page.getByLabel('ページ範囲').fill('1');
  await page.locator('#file').setInputFiles({
    name: '121-pages.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()),
  });
  const preview = page.getByRole('region', { name: 'PDFプレビュー' });
  const number = preview.getByRole('spinbutton', { name: 'プレビューのページ番号' });
  const image = preview.locator('#preview-raster canvas');
  await expect(image).toBeVisible();
  expect(await image.evaluate(canvas => canvas.width / canvas.height)).toBeLessThan(1);
  await number.fill('121');
  await number.press('Enter');
  await expect(preview.getByRole('status')).toHaveText('変換範囲外');
  await expect(preview.getByRole('button', { name: '次のページ' })).toBeDisabled();
  await expect(image).toHaveCount(1);
  expect(await image.evaluate(canvas => canvas.width / canvas.height)).toBeGreaterThan(1);
  await preview.getByRole('button', { name: '前のページ' }).click();
  await expect(number).toHaveValue('120');
  await expect(image).toBeVisible();
  expect(await image.evaluate(canvas => canvas.width / canvas.height)).toBeLessThan(1);
  await expect(page.getByRole('button', { name: 'EPUB', exact: true })).toBeVisible({ timeout: 60_000 });
  await number.fill('1');
  await number.press('Enter');
  const legend = preview.getByRole('list', { name: '検出ラベルの凡例' });
  await expect(legend).toBeVisible();
  await expect(preview.getByRole('status')).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await preview.screenshot({ path: info.outputPath('pdf-preview-mobile.png') });
  await expect(preview.getByRole('checkbox', { name: '解析枠を表示' })).toBeChecked();
  await preview.getByRole('checkbox', { name: '解析枠を表示' }).uncheck();
  await expect(legend).toBeHidden();
});

test('スマートフォン幅でPDFの選択とエラーが表示される', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.screenshot({ path: info.outputPath('mobile.png'), fullPage: true });
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'ファイルを選択' }).click();
  await (await chooser).setFiles({ name: 'invalid.pdf', mimeType: 'application/pdf', buffer: Buffer.from('Not a PDF') });
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'ファイルを選択' })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
