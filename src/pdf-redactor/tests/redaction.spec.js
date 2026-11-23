import { readFile, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFString, StandardFonts,
  decodePDFRawStream, degrees, rgb } from 'pdf-lib';

const fakeText = 'SECRET ALPHA 832';
const fakeScan = 'SECRET SCAN 907';
const fakeAuthor = 'SECRET METADATA 077';
const fakeComment = 'SECRET COMMENT 156';
const fakeAttachment = 'SECRET ATTACHMENT 611';
const fakeForm = 'SECRET FORM 319';
const firstBox = { left: .10, top: .205, right: .89, bottom: .415 };
const rotatedBox = { left: .07, top: .10, right: .37, bottom: .70 };

async function makeFixture(page) {
  const scan = await page.evaluate(text => {
    const canvas = document.createElement('canvas');
    canvas.width = 840;
    canvas.height = 255;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffe5b8';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#161616';
    ctx.font = 'bold 58px sans-serif';
    ctx.fillText(text, 44, 150);
    ctx.font = '38px sans-serif';
    ctx.fillText('架空の氏名 山田花子', 44, 211);
    return canvas.toDataURL('image/png');
  }, fakeScan);

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.setTitle(fakeAuthor);
  pdf.setAuthor(fakeAuthor);
  pdf.setSubject(fakeAuthor);
  await pdf.attach(new TextEncoder().encode(fakeAttachment), 'private-fixture.txt', { description: fakeAttachment });
  pdf.addJavaScript('fixture', 'var secret = "SECRET SCRIPT 185";');

  const first = pdf.addPage([504, 632]);
  first.drawText('KEEP HEADER', { x: 55, y: 560, size: 29, font });
  first.drawText('KEEP FOOTER', { x: 55, y: 105, size: 26, font });
  first.drawRectangle({ x: 55, y: 511, width: 44, height: 16, color: rgb(0, .5, .2) });
  first.drawRectangle({ x: 70, y: 448, width: 220, height: 39, color: rgb(1, .7, .7) });
  first.drawText(fakeText, { x: 80, y: 459, size: 24, font });
  first.drawText('SECRET INVISIBLE 744', { x: 55, y: 85, size: 12, font, opacity: 0 });
  const comment = pdf.context.register(pdf.context.obj({
    Type: 'Annot', Subtype: 'Text', F: 2, Rect: [64, 140, 88, 164], Contents: PDFString.of(fakeComment),
  }));
  first.node.addAnnot(comment);
  const field = pdf.getForm().createTextField('private_field');
  field.setText(fakeForm);
  field.addToPage(first, { x: 80, y: 384, width: 223, height: 34, font });

  const second = pdf.addPage([600, 480]);
  second.setCropBox(40, 30, 520, 400);
  second.setRotation(degrees(90));
  const image = await pdf.embedPng(scan);
  second.drawImage(image, { x: 110, y: 72, width: 280, height: 85 });
  second.drawText('KEEP ROTATED', { x: 85, y: 343, size: 24, font });

  const third = pdf.addPage([420, 300]);
  third.drawText('KEEP LAST PAGE', { x: 55, y: 200, size: 26, font });
  third.drawRectangle({ x: 55, y: 102, width: 70, height: 42, color: rgb(.2, .3, 1) });
  return Buffer.from(await pdf.save());
}

async function openByDrop(page, bytes) {
  const transfer = await page.evaluateHandle(data => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(data)], 'private-name-fixture.pdf', { type: 'application/pdf' }));
    return transfer;
  }, [...bytes]);
  await page.getByRole('region', { name: 'PDF を開く' }).dispatchEvent('drop', { dataTransfer: transfer });
  await transfer.dispose();
}

async function selectBox(page, preview, box, backwards = false) {
  await preview.scrollIntoViewIfNeeded();
  const { x, y, width, height } = await preview.boundingBox();
  const first = [x + box.left * width, y + box.top * height];
  const last = [x + box.right * width, y + box.bottom * height];
  await page.mouse.move(...(backwards ? last : first));
  await page.mouse.down();
  await page.mouse.move(...(backwards ? first : last), { steps: 7 });
  await page.mouse.up();
}

function readPageImage(pdf, page) {
  const resources = page.node.Resources();
  const fonts = resources.lookupMaybe(PDFName.of('Font'), PDFDict);
  expect(fonts?.keys().length ?? 0).toBe(0);
  const annotations = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
  expect(annotations?.size() ?? 0).toBe(0);
  const images = resources.lookup(PDFName.of('XObject'), PDFDict).entries();
  expect(images).toHaveLength(1);
  const image = pdf.context.lookup(images[0][1], PDFRawStream);
  expect(image.dict.get(PDFName.of('Subtype')).toString()).toBe('/Image');
  expect(image.dict.get(PDFName.of('ColorSpace')).toString()).toBe('/DeviceRGB');
  expect(image.dict.get(PDFName.of('BitsPerComponent')).asNumber()).toBe(8);
  expect(image.dict.get(PDFName.of('SMask'))).toBeUndefined();
  const contents = page.node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray() : [contents];
  const drawing = streams.map(ref => Buffer.from(decodePDFRawStream(pdf.context.lookup(ref, PDFRawStream)).decode()).toString()).join('\n');
  expect(drawing.trim().split('\n').map(line => line.trim().split(/\s+/).at(-1)))
    .toEqual(['q', 'cm', 'cm', 'cm', 'cm', 'Do', 'Q']);
  return {
    width: image.dict.get(PDFName.of('Width')).asNumber(),
    height: image.dict.get(PDFName.of('Height')).asNumber(),
    pixels: decodePDFRawStream(image).decode(),
  };
}

function pixel({ pixels, width, height }, x, y) {
  const index = (Math.floor(y * height) * width + Math.floor(x * width)) * 3;
  return [...pixels.subarray(index, index + 3)];
}

function expectColorNear(actual, expected) {
  // 同じ PDF の RGB 成分でも、描画時の８ビットへの丸めで１だけ異なる場合がある。
  expect(Math.max(...actual.map((value, channel) => Math.abs(value - expected[channel])))).toBeLessThanOrEqual(1);
}

function expectBlackImageRegion(image, box) {
  const { pixels, width, height } = image;
  expect(pixels.length).toBe(width * height * 3);
  const left = Math.ceil((box.left + .004) * width);
  const right = Math.floor((box.right - .004) * width);
  const top = Math.ceil((box.top + .004) * height);
  const bottom = Math.floor((box.bottom - .004) * height);
  let nonblack = 0;
  for (let y = top; y < bottom; y++) {
    for (let index = (y * width + left) * 3; index < (y * width + right) * 3; index++) {
      if (pixels[index] !== 0) nonblack++;
    }
  }
  expect(nonblack).toBe(0);
}

test('exports only masked image streams and removes text, hidden content and document identifiers', async ({ page }, testInfo) => {
  const requests = [];
  const errors = [];
  page.context().on('request', request => {
    if (/^https?:/.test(request.url())) requests.push({ method: request.method(), url: request.url() });
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  const origin = new URL(page.url()).origin;
  const fixture = await makeFixture(page);
  await writeFile(testInfo.outputPath('input.pdf'), fixture);
  await openByDrop(page, fixture);

  const preview = page.getByRole('application', { name: /PDF プレビュー/ });
  const save = page.getByRole('button', { name: '黒塗り PDF を保存' });
  const count = page.locator('#mask-count');
  await expect(preview).toHaveAccessibleName('PDF プレビュー 1 ページ目');
  await expect(save).toBeDisabled();
  await selectBox(page, preview, firstBox, true);
  await expect(count).toHaveText('1 件');
  await page.getByRole('button', { name: '次のページ' }).click();
  await expect(preview).toHaveAccessibleName('PDF プレビュー 2 ページ目');
  await selectBox(page, preview, rotatedBox);
  await expect(count).toHaveText('2 件');
  await expect(save).toBeEnabled();
  await page.getByRole('button', { name: '1 ページ目 · 範囲 1' }).click();
  await expect(preview).toHaveAccessibleName('PDF プレビュー 1 ページ目');
  await page.screenshot({ path: testInfo.outputPath('preview.png') });
  const downloaded = page.waitForEvent('download');
  await save.click();
  const result = await downloaded;
  expect(result.suggestedFilename()).toBe('redacted.pdf');
  const outputPath = testInfo.outputPath('exported.pdf');
  await result.saveAs(outputPath);
  const bytes = await readFile(outputPath);
  const exported = await PDFDocument.load(bytes, { updateMetadata: false });
  expect(exported.getPages().map(page => page.getSize())).toEqual([
    { width: 504, height: 632 }, { width: 400, height: 520 }, { width: 420, height: 300 },
  ]);
  expect(exported.getTitle()).toBeUndefined();
  expect(exported.getAuthor()).toBeUndefined();
  expect(exported.getSubject()).toBeUndefined();
  for (const key of ['AcroForm', 'Metadata', 'Names', 'OpenAction', 'OCProperties']) {
    expect(exported.catalog.get(PDFName.of(key))).toBeUndefined();
  }
  const [first, second, third] = exported.getPages().map(page => readPageImage(exported, page));
  expectBlackImageRegion(first, firstBox);
  expectBlackImageRegion(second, rotatedBox);
  expectColorNear(pixel(first, 70 / 504, 112 / 632), [0, 128, 51]);
  expectColorNear(pixel(third, 75 / 420, 178 / 300), [51, 77, 255]);
  for (const text of [fakeAuthor, fakeAttachment, fakeComment, fakeForm, fakeScan, fakeText, 'private-name-fixture']) {
    expect(bytes.includes(text)).toBe(false);
  }
  expect(errors).toEqual([]);
  expect(requests.filter(request => request.method !== 'GET' || new URL(request.url).origin !== origin)).toEqual([]);
});

test('supports keyboard selection, undo, and precise zoom on a small screen', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto('./');
  const fixture = await makeFixture(page);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'ファイルを選択' }).click();
  await (await chooser).setFiles({ name: 'fixture.pdf', mimeType: 'application/pdf', buffer: fixture });
  const preview = page.getByRole('application', { name: 'PDF プレビュー 1 ページ目' });
  const save = page.getByRole('button', { name: '黒塗り PDF を保存' });
  await expect(preview).toBeVisible();
  await preview.press('Enter');
  await preview.press('Shift+ArrowRight');
  await preview.press('Shift+ArrowDown');
  await expect(save).toBeDisabled();
  await preview.press('Escape');
  await expect(page.locator('#mask-count')).toHaveText('0 件');
  await preview.press('Enter');
  await preview.press('Shift+ArrowRight');
  await preview.press('Shift+ArrowDown');
  await preview.press('Enter');
  await expect(save).toBeEnabled();
  await preview.press('Control+z');
  await expect(save).toBeDisabled();
  await page.getByRole('combobox', { name: '表示倍率' }).selectOption('2');
  await page.getByRole('button', { name: '移動', exact: true }).click();
  await expect(page.getByRole('button', { name: '移動', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('combobox', { name: '表示倍率' }).selectOption('1');
  await page.getByRole('button', { name: '範囲選択' }).click();
  await preview.scrollIntoViewIfNeeded();
  const { x, y, width, height } = await preview.boundingBox();
  const touch = await page.context().newCDPSession(page);
  await touch.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchStart', touchPoints: [{ x: x + width * firstBox.left, y: y + height * firstBox.top }],
  });
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchMove', touchPoints: [{ x: x + width * firstBox.right, y: y + height * firstBox.bottom }],
  });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(save).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: testInfo.outputPath('mobile.png'), fullPage: true });
});

test('rejects an invalid PDF and keeps export disabled', async ({ page }) => {
  await page.goto('./');
  await openByDrop(page, Buffer.from('This is not a PDF'));
  await expect(page.getByRole('alert')).toHaveText('PDF を開けませんでした。ファイルを確認してください。');
  await expect(page.getByRole('button', { name: '黒塗り PDF を保存' })).toBeDisabled();
});
