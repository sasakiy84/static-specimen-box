import { Stage } from 'konva/lib/Stage.js';
import { Layer } from 'konva/lib/Layer.js';
import { Group } from 'konva/lib/Group.js';
import { Rect } from 'konva/lib/shapes/Rect.js';
import { renderPreviewPage } from './pdf.js';

const labels = {
  0: ['本文ブロック', '#64748b'],
  1: ['本文', '#1d5cbc'],
  2: ['キャプション', '#087b67'],
  4: ['注', '#925710'],
  5: ['割注', '#875f92'],
  6: ['図版', '#8150b5'],
  8: ['柱', '#8f4b57'],
  9: ['ページ番号', '#775b48'],
  10: ['ルビ', '#228042'],
  11: ['組織図', '#a4479c'],
  12: ['数式', '#4d5ba3'],
  13: ['化学式', '#2a707a'],
  15: ['表', '#ae5509'],
  16: ['見出し', '#c13154'],
};

const area = ([x, y, right, bottom]) => (right - x) * (bottom - y);

export class PdfPreview {
  constructor(root, { pdf, pdfTask, filename, numbers }) {
    this.root = root;
    this.pdf = pdf;
    this.pdfTask = pdfTask;
    this.numbers = new Set(numbers);
    this.pages = new Map();
    this.processing = true;
    const find = name => root.querySelector('#preview-' + name);
    this.numberInput = find('page');
    this.previous = find('prev');
    this.next = find('next');
    this.toggle = find('regions');
    this.status = find('status');
    this.legend = find('legend');
    this.picker = find('picker');
    this.regionSelect = find('region');
    this.frame = find('frame');
    this.raster = find('raster');
    this.tooltip = find('tooltip');
    this.tooltipLabel = find('label');
    this.tooltipText = find('text');

    find('filename').textContent = filename;
    find('total').textContent = `/ ${pdf.numPages}`;
    this.numberInput.max = pdf.numPages;
    this.toggle.checked = true;
    this.events = new AbortController();
    const options = { signal: this.events.signal };
    this.previous.addEventListener('click', () => void this.show(this.number - 1), options);
    this.next.addEventListener('click', () => void this.show(this.number + 1), options);
    find('navigation').addEventListener('submit', event => {
      event.preventDefault();
      void this.show(Number(this.numberInput.value));
    }, options);
    this.numberInput.addEventListener('change', () => {
      if (this.numberInput.validity.valid) void this.show(Number(this.numberInput.value));
    }, options);
    this.toggle.addEventListener('change', () => this.update(), options);
    this.regionSelect.addEventListener('change', () => this.inspect(this.regionSelect.value), options);

    this.stage = new Stage({ container: find('overlay'), width: 1, height: 1 });
    this.layer = new Layer();
    this.rectangles = new Group();
    this.layer.add(this.rectangles);
    this.stage.add(this.layer);
    this.stage.on('mouseover', event => this.inspect(event.target.getAttr('region')));
    this.stage.on('mouseout', () => this.inspect(this.regionSelect.value));
    this.stage.on('click tap', event => {
      this.regionSelect.value = event.target.getAttr('region') ?? '';
      this.inspect(this.regionSelect.value);
    });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.raster);
    root.hidden = false;
    void this.show(numbers[0]);
  }

  async show(number) {
    if (!Number.isInteger(number) || number < 1 || number > this.pdf.numPages ||
        (number === this.number && this.request && !this.failed)) return;
    this.request?.abort();
    this.dropCanvas();
    this.number = number;
    this.numberInput.value = number;
    this.previous.disabled = number === 1;
    this.next.disabled = number === this.pdf.numPages;
    this.failed = false;
    const request = new AbortController();
    this.request = request;
    this.update();
    try {
      const page = await this.pdf.getPage(number);
      const canvas = await renderPreviewPage(page, request.signal);
      if (request.signal.aborted) {
        canvas.width = canvas.height = 0;
        return;
      }
      this.canvas = canvas;
      this.raster.replaceChildren(canvas);
      this.frame.hidden = false;
      this.update();
    } catch {
      if (request.signal.aborted) return;
      this.failed = true;
      this.update();
    }
  }

  addPage(number, layout) {
    this.pages.set(number, layout);
    if (number === this.number) this.update();
  }

  finish() {
    this.processing = false;
    if (!this.pages.has(this.number)) this.update();
  }

  dropCanvas() {
    this.frame.hidden = true;
    if (this.canvas) this.canvas.width = this.canvas.height = 0;
    this.canvas = null;
    this.raster.replaceChildren();
  }

  update() {
    const layout = this.pages.get(this.number);
    this.status.textContent = this.failed ? `${this.number}ページ目を表示できませんでした。` :
      !this.canvas ? `${this.number}ページ目を表示しています…` :
      layout ? `解析済み · ${layout.annotations.length}領域` :
      !this.numbers.has(this.number) ? '変換範囲外' : this.processing ? '解析待ち' : '未解析';
    const annotations = this.canvas && this.toggle.checked ? layout?.annotations ?? [] : [];
    this.toggle.disabled = !layout?.annotations.length || !this.canvas;
    this.rectangles.destroyChildren();
    this.tooltip.hidden = true;
    this.legend.hidden = this.picker.hidden = !annotations.length;
    this.legend.replaceChildren();
    this.regionSelect.replaceChildren(new Option('領域を選択', ''));
    const usedLabels = new Set();
    const shapes = [];
    for (const [index, annotation] of annotations.entries()) {
      const [name, color] = labels[annotation.label];
      if (!usedLabels.has(annotation.label)) {
        usedLabels.add(annotation.label);
        const item = document.createElement('li');
        const swatch = document.createElement('span');
        swatch.className = 'preview-swatch';
        swatch.style.color = swatch.style.backgroundColor = color;
        item.append(swatch, name);
        this.legend.append(item);
      }
      const summary = annotation.text?.trim().slice(0, 50);
      this.regionSelect.add(new Option(summary ? `${name} · ${summary}` : name, String(index)));
      const [x, y, right, bottom] = annotation.box;
      shapes.push({ annotation, rect: new Rect({
        x, y, width: right - x, height: bottom - y, stroke: color, strokeWidth: 1.5,
        fill: color + (annotation.label === 0 ? '0c' : '19'), strokeScaleEnabled: false,
        perfectDrawEnabled: false, preventDefault: false, region: String(index),
      }) });
    }
    shapes.sort((a, b) => area(b.annotation.box) - area(a.annotation.box));
    this.rectangles.add(...shapes.map(({ rect }) => rect));
    this.resize();
  }

  resize() {
    const layout = this.pages.get(this.number);
    const width = this.canvas?.clientWidth || 1;
    const height = this.canvas?.clientHeight || 1;
    this.stage.size({ width, height });
    if (layout) this.rectangles.scale({ x: width / layout.width, y: height / layout.height });
    if (this.regionSelect.value) this.inspect(this.regionSelect.value);
    else this.tooltip.hidden = true;
  }

  inspect(index) {
    const layout = this.pages.get(this.number);
    const annotation = index ? layout?.annotations[Number(index)] : undefined;
    this.tooltip.hidden = !annotation || !this.canvas || !this.toggle.checked;
    if (this.tooltip.hidden) return;
    this.tooltipLabel.textContent = labels[annotation.label][0] +
      (annotation.source === 'pdf' ? ' · 埋め込み文字' : annotation.source === 'ocr' ? ' · OCR' : '');
    this.tooltipText.textContent = annotation.text ?? '';
    this.tooltipText.hidden = !annotation.text;
    const [x, y, , bottom] = annotation.box;
    const point = y * this.rectangles.scaleY();
    const tooltipHeight = this.tooltip.offsetHeight;
    this.tooltip.style.left = `${Math.max(8, Math.min(x * this.rectangles.scaleX(),
      this.stage.width() - this.tooltip.offsetWidth - 8))}px`;
    this.tooltip.style.top = `${point > tooltipHeight + 6 ? point - tooltipHeight - 6 :
      Math.max(0, Math.min(bottom * this.rectangles.scaleY() + 6, this.stage.height() - tooltipHeight))}px`;
  }

  destroy() {
    this.request?.abort();
    this.events.abort();
    this.resizeObserver.disconnect();
    this.stage.destroy();
    this.dropCanvas();
    this.pages.clear();
    this.root.hidden = true;
    return this.pdfTask.destroy();
  }
}
