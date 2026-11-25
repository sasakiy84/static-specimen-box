import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { strFromU8, unzipSync } from 'fflate';

async function fixture(page) {
  const image = await page.evaluate(() => {
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
    draw.fillText('The complete document is processed on this device.', 105, 262);
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
    return image.toDataURL('image/png');
  });
  const pdf = await PDFDocument.create();
  pdf.setTitle('OCR example');
  const main = pdf.addPage([590, 760]);
  main.drawImage(await pdf.embedPng(image), { x: 0, y: 0, width: 590, height: 760 });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  main.drawText('The embedded text layer is the selected source.', { x: 53, y: 655, size: 15, font, opacity: 0 });
  const text = pdf.addPage([590, 760]);
  text.drawText('A page with embedded text remains editable.', { x: 50, y: 660, size: 20, font });
  return Buffer.from(await pdf.save());
}

async function download(page, name, path) {
  const started = page.waitForEvent('download');
  await page.getByRole('link', { name, exact: true }).click();
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

test('文字レイヤーとOCRを切り替えても、図表の切り出しとキャプションを維持する', async ({ page }, info) => {
  const outside = [];
  const modelRequests = [];
  page.on('request', request => {
    if (request.url().includes('/models/') && request.url().endsWith('.bin')) modelRequests.push(request.url());
    if (!['blob:', 'data:'].includes(new URL(request.url()).protocol) &&
        new URL(request.url()).origin !== new URL(info.project.use.baseURL).origin) outside.push(request.url());
  });
  await page.goto('./');
  const pdf = await fixture(page);
  const input = page.locator('#file');
  const preferText = page.getByRole('checkbox', { name: 'PDFに埋め込まれた文字を優先する' });
  await expect(preferText).toBeChecked();
  await preferText.uncheck();
  await input.setInputFiles({ name: 'sample.pdf', mimeType: 'application/pdf', buffer: pdf });
  await expect(page.getByRole('region', { name: 'ダウンロード' })).toBeVisible({ timeout: 105_000 });
  const epub = unzipSync(await download(page, 'EPUB', info.outputPath('sample.epub')));
  const chapters = Object.entries(epub).filter(([name]) => name.includes('/chapter-')).map(([, bytes]) => strFromU8(bytes)).join('');
  expect(chapters).toContain('Sample Document');
  expect(chapters).toMatch(/browser optical character recognition/i);
  expect(chapters).toMatch(/embedded text remains editable/i);
  expect(chapters).not.toContain('The embedded text layer is the selected source.');
  expect(chapters).toContain('<figure>');
  expect(chapters).toMatch(/<ruby>図書館<rp>（<\/rp><rt>とし[ょよ]かん<\/rt>/);
  const figures = figureImages(epub, chapters);
  expect([...figures.keys()]).toEqual(['Table 1. Archival holdings', 'Figure 1. Mountain landscape']);
  for (const image of figures.values()) {
    const dimensions = new DataView(image.buffer, image.byteOffset, image.byteLength);
    expect(dimensions.getUint32(16)).toBeLessThan(590 * 2.5);
    expect(dimensions.getUint32(20)).toBeLessThan(760 * 2.5 / 2);
  }
  const markdown = unzipSync(await download(page, 'Markdown ＋ 画像', info.outputPath('sample-markdown.zip')));
  const document = strFromU8(markdown['document.md']);
  expect(document).toContain('Sample Document');
  expect(document).toContain('Table 1.');
  expect(document).toMatch(/図書館（とし[ょよ]かん）/);
  expect(document.match(/Figure 1\./g)).toHaveLength(2);
  expect(document).toMatch(/\|\s*Material\s*\||<table>/i);
  expect(modelRequests.length).toBeGreaterThan(0);
  modelRequests.length = 0;
  await page.reload();
  await expect(preferText).toBeChecked();
  await page.locator('input[name="pages"]').fill('1');
  await page.locator('select[name="format"]').selectOption('epub');
  await input.setInputFiles({ name: 'sample.pdf', mimeType: 'application/pdf', buffer: pdf });
  await expect(page.getByRole('link', { name: 'EPUB', exact: true })).toBeVisible({ timeout: 45_000 });
  const textEpub = unzipSync(await download(page, 'EPUB', info.outputPath('prefer-pdf-text.epub')));
  const textChapters = Object.entries(textEpub).filter(([name]) => name.includes('/chapter-'))
    .map(([, bytes]) => strFromU8(bytes)).join('');
  expect(textChapters).toContain('The embedded text layer is the selected source.');
  expect(textChapters).not.toMatch(/browser optical character recognition/i);
  expect(textChapters).toMatch(/図書館/);
  const textFigures = figureImages(textEpub, textChapters);
  expect([...textFigures.keys()]).toEqual([...figures.keys()]);
  for (const [caption, image] of figures) {
    expect(Buffer.from(textFigures.get(caption))).toEqual(Buffer.from(image));
  }
  expect(modelRequests).toEqual([]);
  expect(outside).toEqual([]);
  await page.screenshot({ path: info.outputPath('result.png') });
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
