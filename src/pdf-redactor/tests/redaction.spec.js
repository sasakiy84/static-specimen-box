import { readFile, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { PDFDocument, PDFName, PDFString, StandardFonts, TextRenderingMode, degrees, popGraphicsState,
  pushGraphicsState, rgb, setTextRenderingMode } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const fakeText = 'SECRET ALPHA 832';
const fakeScan = 'SCANNED SAMPLE 907';
const fakeRotated = 'SECRET ROTATED 902';
const fakeHidden = 'SECRET INVISIBLE 744';
const fakeAuthor = 'SECRET METADATA 077';
const fakeComment = 'SECRET COMMENT 156';
const fakeAttachment = 'SECRET ATTACHMENT 611';
const fakeForm = 'SECRET FORM 319';
const firstBox = { left: .121, top: .205, right: .596, bottom: .415 };
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
  first.drawText(`Left ${fakeText} Right`, { x: 20, y: 459, size: 24, font });
  first.pushOperators(pushGraphicsState(), setTextRenderingMode(TextRenderingMode.Invisible));
  first.drawText(fakeHidden, { x: 65, y: 431, size: 12, font });
  first.pushOperators(popGraphicsState());
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
  second.drawText(fakeRotated, { x: 110, y: 95, size: 23, font });
  second.drawText('KEEP ROTATED', { x: 85, y: 343, size: 24, font });

  const third = pdf.addPage([420, 300]);
  third.drawText('KEEP LAST PAGE', { x: 55, y: 200, size: 26, font });
  const image = await pdf.embedPng(scan);
  third.drawImage(image, { x: 140, y: 55, width: 260, height: 79 });
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

async function readPageText(bytes) {
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
  try {
    const pdf = await task.promise;
    const texts = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const { items } = await page.getTextContent();
      texts.push(items.map(item => item.str).join(' '));
    }
    return texts;
  } finally {
    await task.destroy();
  }
}

test('削除した文字は抽出できず、範囲外の文字は検索できる', async ({ page }, testInfo) => {
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
  const firstRange = page.getByRole('button', { name: '1 ページ目 · 範囲 1' });
  await firstRange.click();
  await expect(preview).toHaveAccessibleName('PDF プレビュー 1 ページ目');
  await expect(firstRange).toHaveAttribute('aria-pressed', 'true');
  await expect(preview.locator('[data-selected] .mask-number')).toHaveText('1');
  await page.screenshot({ path: testInfo.outputPath('preview.png') });
  const downloaded = page.waitForEvent('download');
  await save.click();
  await expect(page.getByText('黒塗り PDF を生成しました。')).toBeVisible();
  const result = await downloaded;
  expect(result.suggestedFilename()).toBe('redacted.pdf');
  const outputPath = testInfo.outputPath('exported.pdf');
  await result.saveAs(outputPath);
  const bytes = await readFile(outputPath);
  const exported = await PDFDocument.load(bytes, { updateMetadata: false });
  expect(exported.getPages()[1].getRotation().angle).toBe(90);
  expect(exported.getPages()[1].getCropBox()).toEqual({ x: 40, y: 30, width: 520, height: 400 });
  const inputTexts = await readPageText(fixture);
  expect(inputTexts[0]).toContain(fakeText);
  expect(inputTexts[0]).toContain(fakeHidden);
  expect(inputTexts[1]).toContain(fakeRotated);
  const outputTexts = await readPageText(bytes);
  expect(outputTexts[0].replace(/\s+/g, ' ').trim()).toBe('KEEP HEADER KEEP FOOTER Left Right');
  expect(outputTexts[1]).toContain('KEEP ROTATED');
  expect(outputTexts[2]).toContain('KEEP LAST PAGE');
  for (const text of [fakeText, fakeHidden, fakeRotated]) {
    expect(outputTexts.join(' ')).not.toContain(text);
  }
  expect(exported.getTitle()).toBeUndefined();
  expect(exported.getAuthor()).toBeUndefined();
  expect(exported.getSubject()).toBeUndefined();
  for (const key of ['AcroForm', 'Metadata', 'Names', 'OpenAction', 'OCProperties']) {
    expect(exported.catalog.get(PDFName.of(key))).toBeUndefined();
  }
  for (const page of exported.getPages()) {
    expect(page.node.Annots()).toBeUndefined();
  }
  for (const text of [fakeAuthor, fakeAttachment, fakeComment, fakeForm, fakeText, 'private-name-fixture']) {
    expect(bytes.includes(text)).toBe(false);
  }
  expect(errors).toEqual([]);
  expect(requests.filter(request => request.method !== 'GET' || new URL(request.url).origin !== origin)).toEqual([]);
});

test('一覧とプレビューで同じ番号を選択でき、削除した範囲は元に戻せる', async ({ page }, testInfo) => {
  await page.goto('./');
  await openByDrop(page, await makeFixture(page));
  const preview = page.getByRole('application', { name: 'PDF プレビュー 1 ページ目' });
  const first = page.getByRole('button', { name: '1 ページ目 · 範囲 1' });
  const second = page.getByRole('button', { name: '1 ページ目 · 範囲 2' });
  const activeNumber = preview.locator('[data-selected] .mask-number');
  await selectBox(page, preview, firstBox);
  await selectBox(page, preview, { left: .10, top: .76, right: .44, bottom: .87 });
  await expect(activeNumber).toHaveText('2');
  await expect(second).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: testInfo.outputPath('matching-ranges.png') });

  const zoom = page.getByRole('combobox', { name: '表示倍率' });
  await zoom.selectOption('3');
  await first.click();
  await expect(activeNumber).toHaveText('1');
  await expect(activeNumber).toBeInViewport({ ratio: 1 });
  await second.click();
  await expect(activeNumber).toHaveText('2');
  await expect(activeNumber).toBeInViewport({ ratio: 1 });
  await zoom.selectOption('1');

  // PDF 上の番号をクリックしても新しい範囲は増えない。
  await preview.locator('.mask-number').filter({ hasText: /^1$/ }).click();
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await expect(second).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#mask-count')).toHaveText('2 件');
  await preview.press('Delete');
  await expect(first).toHaveCount(0);
  await expect(second).toBeVisible();
  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect(activeNumber).toHaveText('1');
  await expect(first).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: '範囲 2 を削除', exact: true }).click();
  await expect(second).toHaveCount(0);
  await expect(first).toBeFocused();
  await expect(activeNumber).toHaveText('1');
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
  await preview.press('Escape');
  const badge = preview.locator('.mask-number');
  const area = await badge.boundingBox();
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchStart', touchPoints: [{ x: area.x + area.width / 2, y: area.y + area.height / 2 }],
  });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByRole('button', { name: '1 ページ目 · 範囲 2' })).toHaveAttribute('aria-pressed', 'true');
  const quickDelete = page.getByRole('button', { name: '選択中の範囲 2 を削除' });
  await expect(quickDelete).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('mobile.png'), fullPage: true });
  await quickDelete.click();
  await expect(save).toBeDisabled();
  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect(save).toBeEnabled();
});

test('スキャン画像の文字を選ぶと、黒塗り済みの PDF を生成せずエラーを表示する', async ({ page }) => {
  await page.goto('./');
  await openByDrop(page, await makeFixture(page));
  const next = page.getByRole('button', { name: '次のページ' });
  await next.click();
  await next.click();
  const preview = page.getByRole('application', { name: 'PDF プレビュー 3 ページ目' });
  await selectBox(page, preview, { left: .35, top: .56, right: .90, bottom: .80 });
  const downloads = [];
  page.on('download', event => downloads.push(event));
  await page.getByRole('button', { name: '黒塗り PDF を保存' }).click();
  await expect(page.getByRole('alert')).toContainText('3 ページ目を処理できませんでした');
  expect(downloads).toHaveLength(0);
});

test('rejects an invalid PDF and keeps export disabled', async ({ page }) => {
  await page.goto('./');
  await openByDrop(page, Buffer.from('This is not a PDF'));
  await expect(page.getByRole('alert')).toHaveText('PDF を開けませんでした。ファイルを確認してください。');
  await expect(page.getByRole('button', { name: '黒塗り PDF を保存' })).toBeDisabled();
});
