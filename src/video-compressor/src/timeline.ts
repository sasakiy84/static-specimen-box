import { button, byId, node } from './dom';
import { clamp, complement, formatTime, isFormat, messageOf, parseTime } from './model';
import type { ExportJob, Range, RangeAction, SourceInfo, TrimPlan } from './model';
import type { WorkerClient } from './worker-client';

type Snapshot = { ranges: Range[]; action: RangeAction; selected: number };
type Edge = 'start' | 'end';
type Drag = { index: number; edge: Edge; pointerId: number; before: Snapshot };
const precision = 0.001;

function position(element: HTMLElement, start: number, end?: number): void {
  element.style.left = `${start * 100}%`;
  if (end !== undefined) element.style.width = `${Math.max(0, end - start) * 100}%`;
}

export class Timeline {
  readonly controls = byId('trim-controls', HTMLFieldSetElement);
  private readonly video = byId('trim-preview', HTMLVideoElement);
  private readonly editor = byId('trim-editor');
  private readonly surface = byId('trim-timeline');
  private readonly track = byId('trim-track');
  private readonly rows = byId('trim-ranges');
  private readonly ruler = byId('trim-ruler');
  private readonly thumbnails = byId('trim-thumbnails');
  private readonly overview = byId('trim-overview');
  private readonly cursor = byId('trim-cursor', HTMLInputElement);
  private readonly seek = byId('trim-seek', HTMLInputElement);
  private readonly outputSeek = byId('trim-output-seek', HTMLInputElement);
  private readonly play = byId('trim-play', HTMLButtonElement);
  private readonly action = byId('trim-action', HTMLSelectElement);
  private readonly format = byId('trim-extension', HTMLSelectElement);
  private readonly start = byId('trim-start', HTMLButtonElement);
  private readonly history: Snapshot[] = [];
  private readonly future: Snapshot[] = [];
  private model: Snapshot = { ranges: [], action: 'keep', selected: -1 };
  private plan: TrimPlan | null = null;
  private info: SourceInfo | null = null;
  private sourceUrl: string | null = null;
  private client: WorkerClient | null = null;
  private active = false;
  private busy = false;
  private time = 0;
  private window = { start: 0, end: 1 };
  private planRevision = 0;
  private frameRevision = 0;
  private hoverRevision = 0;
  private planTimer = 0;
  private hoverTimer = 0;
  private frameRequest = 0;
  private playbackRange = -1;
  private drag: Drag | null = null;

  constructor(exportVideo: (job: ExportJob, direct: boolean) => Promise<void>) {
    this.start.addEventListener('click', () => {
      if (!this.plan || !isFormat(this.format.value)) return;
      void exportVideo({ kind: 'trim', format: this.format.value, ranges: this.model.ranges, action: this.model.action }, byId('trim-direct-save', HTMLInputElement).checked);
    });
    this.play.addEventListener('click', () => void this.togglePreview());
    this.outputSeek.addEventListener('input', () => this.seekOutput(Number(this.outputSeek.value)));
    this.seek.addEventListener('input', () => this.seekSource(Number(this.seek.value)));
    this.cursor.addEventListener('input', () => this.cursor.setCustomValidity(''));
    this.cursor.addEventListener('change', () => {
      try { this.seekSource(parseTime(this.cursor.value)); }
      catch (error) { this.cursor.setCustomValidity(messageOf(error)); this.cursor.reportValidity(); }
    });
    this.video.addEventListener('loadedmetadata', () => this.updateControls());
    this.video.addEventListener('ended', () => this.finishPreview());
    this.video.addEventListener('error', () => {
      this.pause();
      const note = byId('trim-preview-note');
      note.textContent = 'この端末ではプレビューを再生できません。時刻を指定して保存できます。';
      note.hidden = false;
      this.updateControls();
    });
    this.action.addEventListener('change', () => {
      if (this.action.value !== 'keep' && this.action.value !== 'remove') return;
      this.remember();
      this.model.action = this.action.value;
      this.refresh();
    });
    byId('trim-add').addEventListener('click', () => this.addRange());
    byId('trim-split').addEventListener('click', () => this.split());
    byId('trim-delete').addEventListener('click', () => this.remove());
    byId('trim-undo').addEventListener('click', () => this.restore(false));
    byId('trim-redo').addEventListener('click', () => this.restore(true));
    byId('trim-prev').addEventListener('click', () => this.moveWindow(-0.8));
    byId('trim-next').addEventListener('click', () => this.moveWindow(0.8));
    byId('trim-zoom-in').addEventListener('click', () => this.zoom(0.25));
    byId('trim-zoom-out').addEventListener('click', () => this.zoom(4));
    byId('trim-zoom-fit').addEventListener('click', () => this.setWindow(0, this.duration));
    byId('trim-zoom-selection').addEventListener('click', () => {
      const range = this.model.ranges[this.model.selected];
      if (range) this.setWindow(range.start - (range.end - range.start) * 0.1, (range.end - range.start) * 1.2);
    });
    this.editor.addEventListener('keydown', event => this.shortcuts(event));
    this.overview.addEventListener('click', event => {
      const rectangle = this.overview.getBoundingClientRect();
      if (rectangle.width) this.setWindow((event.clientX - rectangle.left) / rectangle.width * this.duration - this.windowLength / 2, this.windowLength);
    });
    this.overview.addEventListener('keydown', event => this.overviewKey(event));
    this.ruler.addEventListener('pointerdown', event => {
      if (!this.busy && event.button === 0) {
        this.ruler.setPointerCapture(event.pointerId);
        this.seekSource(this.timeAt(event.clientX));
      }
    });
    this.ruler.addEventListener('pointermove', event => {
      if (this.ruler.hasPointerCapture(event.pointerId)) this.seekSource(this.timeAt(event.clientX));
    });
    this.track.addEventListener('click', event => this.selectAt(event));
    this.track.addEventListener('pointerdown', event => this.beginDrag(event));
    this.track.addEventListener('pointermove', event => this.moveDrag(event));
    this.track.addEventListener('pointerup', event => this.endDrag(event, false));
    this.track.addEventListener('pointercancel', event => this.endDrag(event, true));
    this.track.addEventListener('lostpointercapture', event => this.endDrag(event, true));
    this.track.addEventListener('keydown', event => this.boundaryKey(event));
    this.surface.addEventListener('pointermove', event => {
      if (event.pointerType !== 'touch' && !event.buttons && !this.drag) this.hover(this.timeAt(event.clientX), event.clientX);
    });
    this.surface.addEventListener('pointerleave', () => this.hideHover());
    this.surface.addEventListener('pointerdown', () => this.hideHover());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.pause(); this.hideHover(); }
    });
  }

  private get duration(): number { return this.info?.duration ?? 0; }
  private get windowLength(): number { return this.window.end - this.window.start; }

  setSource(file: File, info: SourceInfo): void {
    this.pause();
    if (this.sourceUrl) URL.revokeObjectURL(this.sourceUrl);
    this.sourceUrl = URL.createObjectURL(file);
    this.video.src = this.sourceUrl;
    byId('trim-preview-note').hidden = true;
    this.info = info;
    this.time = 0;
    this.window = { start: 0, end: info.duration };
    this.seek.max = String(info.duration);
    this.model = { ranges: [{ start: 0, end: info.duration }], action: 'keep', selected: 0 };
    this.history.length = 0;
    this.future.length = 0;
    const choices = info.trimFormats.map(format => {
      const option = node('option', '', `.${format}`);
      option.value = format;
      return option;
    });
    this.format.replaceChildren(...choices);
    const extension = file.name.split('.').at(-1)?.toLowerCase();
    if (extension && isFormat(extension) && info.trimFormats.includes(extension)) this.format.value = extension;
    this.controls.hidden = false;
    this.clearPlan();
    this.renderRows();
    this.renderTimeline();
  }

  clearSource(): void {
    this.pause();
    this.hideHover();
    this.clearPlan();
    this.frameRevision++;
    if (this.sourceUrl) URL.revokeObjectURL(this.sourceUrl);
    this.sourceUrl = null;
    this.video.removeAttribute('src');
    this.video.load();
    this.info = null;
    this.controls.hidden = true;
  }

  bindClient(client: WorkerClient | null): void { this.client = client; }

  setActive(active: boolean): void {
    this.active = active;
    this.pause();
    this.hideHover();
    this.frameRevision++;
    if (active && this.info) this.resume();
  }

  setBusy(busy: boolean): void {
    this.busy = busy;
    this.controls.disabled = busy;
    if (busy) { this.pause(); this.hideHover(); this.frameRevision++; }
    this.updateControls();
  }

  resume(): void {
    if (!this.active || this.busy || !this.info || !this.client) return;
    if (!this.plan) this.queuePlan();
    this.renderTimeline();
    void this.renderThumbnails();
  }

  private snapshot(): Snapshot { return structuredClone(this.model); }

  private remember(before = this.snapshot()): void {
    if (this.history.length >= 100) this.history.shift();
    this.history.push(before);
    this.future.length = 0;
  }

  private restore(redo: boolean): void {
    const past = redo ? this.future : this.history;
    const restored = past.pop();
    if (!restored) return;
    (redo ? this.history : this.future).push(this.snapshot());
    this.model = restored;
    this.refresh();
  }

  private refresh(): void {
    this.pause();
    this.renderRows();
    this.renderTimeline();
    this.queuePlan();
  }

  private addRange(): void {
    if (this.model.ranges.length >= 100 || !this.duration) return;
    this.remember();
    const start = Math.min(this.time, Math.max(0, this.duration - precision));
    this.model.selected = this.model.ranges.length;
    this.model.ranges.push({ start, end: Math.min(this.duration, start + 30) });
    this.refresh();
  }

  private remove(index = this.model.selected): void {
    if (!this.model.ranges[index]) return;
    this.remember();
    this.model.ranges.splice(index, 1);
    this.model.selected = Math.min(index, this.model.ranges.length - 1);
    this.refresh();
  }

  private split(): void {
    const index = this.model.ranges.findIndex(range => this.time > range.start + precision && this.time < range.end - precision);
    if (index < 0 || this.model.ranges.length >= 100) return;
    this.remember();
    const { start, end } = this.model.ranges[index];
    this.model.ranges.splice(index, 1, { start, end: this.time }, { start: this.time, end });
    this.model.selected = index + 1;
    this.refresh();
  }

  private clearPlan(): void {
    clearTimeout(this.planTimer);
    this.planRevision++;
    this.plan = null;
  }

  private queuePlan(): void {
    this.clearPlan();
    const revision = this.planRevision;
    this.updateControls();
    this.renderMarks();
    byId('trim-plan').textContent = 'キーフレームを確認しています…';
    this.planTimer = window.setTimeout(() => void this.calculatePlan(revision), 130);
  }

  private async calculatePlan(revision: number): Promise<void> {
    if (!this.client || !this.active || this.busy) return;
    const status = byId('trim-plan');
    try {
      const { plan } = await this.client.request({ type: 'plan', ranges: this.model.ranges, action: this.model.action });
      if (revision !== this.planRevision) return;
      this.plan = plan;
      status.textContent = `${plan.ranges.map(({ start, end }) => `${formatTime(start)}〜${formatTime(end)}`).join(' / ')}（合計 ${formatTime(plan.duration)}）`;
      if (!this.info?.trimFormats.length) status.textContent += ' 元の映像・音声を保持できる保存形式がありません。';
      const first = plan.ranges[0];
      if (first && !plan.ranges.some(range => this.time >= range.start && this.time < range.end)) this.seekSource(first.start);
    } catch (error) {
      if (revision !== this.planRevision) return;
      status.textContent = messageOf(error, '区間を確認できません。');
    }
    this.updateControls();
    if (!this.plan) byId('trim-range-status').textContent = '保存する区間を確認してください。';
    this.renderMarks();
  }

  private renderRows(): void {
    this.action.value = this.model.action;
    const fields = this.model.ranges.map((range, index) => {
      const card = node('div', 'trim-range');
      const header = node('div', 'trim-range-header');
      const remove = button('削除');
      remove.setAttribute('aria-label', `区間 ${index + 1} を削除`);
      remove.addEventListener('click', () => this.remove(index));
      header.append(node('strong', '', `区間 ${index + 1}`), remove);
      const times = node('div', 'trim-range-fields');
      for (const edge of ['start', 'end'] as const) {
        const label = edge === 'start' ? '開始' : '終了';
        const field = node('div');
        const input = node('input', 'time-input');
        input.id = `range-${index}-${edge}`;
        input.value = formatTime(range[edge]);
        input.inputMode = 'decimal';
        const caption = node('label', '', label);
        caption.htmlFor = input.id;
        input.addEventListener('input', () => input.setCustomValidity(''));
        input.addEventListener('change', () => {
          try {
            const time = parseTime(input.value);
            if (time < 0 || time > this.duration + precision || (edge === 'start' ? time >= range.end : time <= range.start)) {
              throw new Error('動画の長さの範囲で、開始を終了より前にしてください。');
            }
            this.commitEdge(index, edge, time);
          } catch (error) { input.setCustomValidity(messageOf(error)); input.reportValidity(); }
        });
        const useCursor = button('現在位置を使う');
        useCursor.setAttribute('aria-label', `${label}を現在位置に設定`);
        useCursor.addEventListener('click', () => this.commitEdge(index, edge, this.time));
        field.append(caption, input, useCursor);
        times.append(field);
      }
      card.append(header, times);
      return card;
    });
    this.rows.replaceChildren(...fields);
  }

  private updateControls(): void {
    const plan = this.plan;
    const canPreview = !!plan && this.video.readyState > 0 && !this.video.error;
    this.play.disabled = this.busy || !canPreview;
    this.outputSeek.disabled = this.play.disabled;
    this.outputSeek.max = String(plan?.duration ?? 0);
    this.start.disabled = this.busy || !plan || !this.info?.trimFormats.length;
    byId('trim-preview-empty').hidden = canPreview;
    this.video.parentElement?.classList.toggle('unavailable', !canPreview);
    byId('trim-total').textContent = formatTime(plan?.duration ?? 0);
    byId('trim-edit-summary').textContent = plan ? `${plan.ranges.length} 区間` : '';
    byId('trim-range-status').textContent = plan ? `${formatTime(plan.duration)} を保存` : '';
    byId('trim-undo', HTMLButtonElement).disabled = this.busy || !this.history.length;
    byId('trim-redo', HTMLButtonElement).disabled = this.busy || !this.future.length;
    byId('trim-delete', HTMLButtonElement).disabled = this.busy || !this.model.ranges[this.model.selected];
    byId('trim-split', HTMLButtonElement).disabled = this.busy || this.model.ranges.length >= 100 || !this.model.ranges.some(range => this.time > range.start + precision && this.time < range.end - precision);
    byId('trim-add', HTMLButtonElement).disabled = this.busy || this.model.ranges.length >= 100;
    byId('trim-zoom-selection', HTMLButtonElement).disabled = this.busy || !this.model.ranges[this.model.selected];
  }

  private seekSource(time: number, fromPlayback = false): void {
    if (!fromPlayback) this.pause();
    this.time = clamp(time, 0, this.duration);
    if (!fromPlayback && this.video.readyState > 0 && !this.video.error) this.video.currentTime = this.time;
    this.updateCursor();
  }

  private updateCursor(): void {
    if (document.activeElement !== this.cursor) this.cursor.value = formatTime(this.time);
    this.seek.value = String(this.time);
    const visible = this.time >= this.window.start && this.time <= this.window.end;
    byId('trim-playhead').hidden = !visible;
    position(byId('trim-playhead'), (this.time - this.window.start) / this.windowLength);
    position(byId('trim-overview-head'), this.time / (this.duration || 1));
    let outputTime = 0;
    for (const range of this.plan?.ranges ?? []) {
      outputTime += clamp(this.time - range.start, 0, range.end - range.start);
    }
    this.outputSeek.value = String(outputTime);
    byId('trim-output-time').textContent = formatTime(outputTime);
    this.updateControls();
  }

  private seekOutput(time: number): void {
    let remaining = time;
    const ranges = this.plan?.ranges ?? [];
    for (const range of ranges) {
      const length = range.end - range.start;
      if (remaining < length) { this.seekSource(range.start + remaining); return; }
      remaining -= length;
    }
    if (ranges.length) this.seekSource(ranges[ranges.length - 1].end);
  }

  pause(): void {
    cancelAnimationFrame(this.frameRequest);
    this.playbackRange = -1;
    this.video.pause();
    this.play.textContent = '▶';
    this.play.setAttribute('aria-label', '編集後の動画を再生');
  }

  private async togglePreview(): Promise<void> {
    if (this.playbackRange >= 0) { this.pause(); return; }
    const ranges = this.plan?.ranges ?? [];
    if (this.play.disabled || !ranges.length) return;
    const next = ranges.findIndex(range => range.end > this.time + precision);
    const index = next < 0 ? 0 : next;
    this.seekSource(next < 0 ? ranges[0].start : Math.max(ranges[index].start, this.time));
    this.playbackRange = index;
    try {
      await this.video.play();
      if (this.playbackRange !== index) return;
      this.play.textContent = '❚❚';
      this.play.setAttribute('aria-label', '編集後の動画を一時停止');
      this.frameRequest = requestAnimationFrame(() => this.tickPreview());
    } catch {
      this.pause();
    }
  }

  private tickPreview(): void {
    const ranges = this.plan?.ranges ?? [];
    const current = ranges[this.playbackRange];
    if (!current) { this.pause(); return; }
    if (!this.video.seeking && this.video.currentTime >= current.end - precision) {
      const next = ranges[++this.playbackRange];
      if (!next) { this.finishPreview(); return; }
      this.video.currentTime = next.start;
    }
    this.seekSource(this.video.currentTime, true);
    this.frameRequest = requestAnimationFrame(() => this.tickPreview());
  }

  private finishPreview(): void {
    const range = this.plan?.ranges.at(-1);
    this.pause();
    if (range) this.seekSource(range.end);
  }

  private setWindow(start: number, length: number): void {
    if (!this.duration || this.busy) return;
    const span = clamp(length, Math.min(0.25, this.duration), this.duration);
    const left = clamp(start, 0, this.duration - span);
    this.window = { start: left, end: left + span };
    this.hideHover();
    this.renderTimeline();
    void this.renderThumbnails();
  }

  private moveWindow(fraction: number): void { this.setWindow(this.window.start + this.windowLength * fraction, this.windowLength); }
  private zoom(scale: number): void {
    const length = this.windowLength * scale;
    const anchor = this.time >= this.window.start && this.time <= this.window.end ? this.time : (this.window.start + this.window.end) / 2;
    this.setWindow(anchor - length / 2, length);
  }
  private overviewKey(event: KeyboardEvent): void {
    const step = event.shiftKey ? 0.8 : 0.1;
    switch (event.key) {
      case 'ArrowLeft': case 'ArrowDown': this.moveWindow(-step); break;
      case 'ArrowRight': case 'ArrowUp': this.moveWindow(step); break;
      case 'Home': this.setWindow(0, this.windowLength); break;
      case 'End': this.setWindow(this.duration, this.windowLength); break;
      default: return;
    }
    event.preventDefault();
  }

  private timeAt(clientX: number): number {
    const rect = this.surface.getBoundingClientRect();
    const fraction = rect.width ? clamp((clientX - rect.left) / rect.width, 0, 1) : 0;
    return clamp(this.window.start + this.windowLength * fraction, 0, this.duration);
  }

  private renderTimeline(): void {
    if (!this.info) return;
    this.ruler.replaceChildren(...Array.from({ length: 7 }, (_, index) => {
      const fraction = index / 6;
      const time = formatTime(this.window.start + fraction * this.windowLength);
      const label = node('span', '', time.slice(0, this.windowLength < 1 ? -1 : this.windowLength < 6 ? -2 : -4));
      position(label, fraction);
      if (index === 6) label.style.transform = 'translateX(-100%)';
      return label;
    }));
    this.track.replaceChildren(...this.model.ranges.flatMap((range, index) => {
      const left = Math.max(range.start, this.window.start), right = Math.min(range.end, this.window.end);
      if (left >= right) return [];
      const selected = index === this.model.selected;
      const clip = node('div', `timeline-clip${selected ? ' selected' : ''}${this.model.action === 'remove' ? ' removal' : ''}`);
      clip.dataset.clip = String(index);
      position(clip, (left - this.window.start) / this.windowLength, (right - this.window.start) / this.windowLength);
      for (const edge of ['start', 'select', 'end'] as const) {
        if (edge === 'start' && left > range.start || edge === 'end' && right < range.end) continue;
        const control = button(edge === 'select' ? `区間 ${index + 1}` : '', edge === 'select' ? 'clip-select' : 'clip-handle');
        if (edge === 'select') {
          control.setAttribute('aria-pressed', String(selected));
          control.append(node('small', '', `${formatTime(range.start)}–${formatTime(range.end)}`));
        } else {
          control.dataset.edge = edge;
          control.setAttribute('aria-label', `区間 ${index + 1} の${edge === 'start' ? '開始' : '終了'}`);
        }
        clip.append(control);
      }
      return [clip];
    }));
    const range = this.model.ranges[this.model.selected];
    byId('trim-selected').textContent = range ? `区間 ${this.model.selected + 1} ／ ${formatTime(range.end - range.start)}` : '';
    byId('trim-window').textContent = `${formatTime(this.window.start)}〜${formatTime(this.window.end)}`;
    byId('trim-prev', HTMLButtonElement).disabled = this.window.start <= precision;
    byId('trim-next', HTMLButtonElement).disabled = this.window.end >= this.duration - precision;
    byId('trim-zoom-in', HTMLButtonElement).disabled = this.windowLength <= 0.25;
    byId('trim-zoom-out', HTMLButtonElement).disabled = this.windowLength >= this.duration - precision;
    byId('trim-zoom-fit', HTMLButtonElement).disabled = this.windowLength >= this.duration - precision;
    this.overview.setAttribute('aria-valuemax', String(Math.max(0, this.duration - this.windowLength)));
    this.overview.setAttribute('aria-valuenow', String(this.window.start));
    this.overview.setAttribute('aria-valuetext', formatTime(this.window.start));
    position(byId('trim-overview-window'), this.window.start / this.duration, this.window.end / this.duration);
    this.updateCursor();
    this.renderMarks();
  }

  private renderMarks(): void {
    if (!this.duration) return;
    const kept = this.plan?.ranges ?? [];
    const marks = kept.map(range => {
      const mark = node('span', 'trim-mark');
      position(mark, range.start / this.duration, range.end / this.duration);
      return mark;
    });
    byId('trim-marks').replaceChildren(...marks);
    const excluded = this.plan ? complement(kept, this.duration) : [];
    byId('trim-excluded').replaceChildren(...excluded.flatMap(range => {
      const start = Math.max(range.start, this.window.start), end = Math.min(range.end, this.window.end);
      if (start >= end) return [];
      const block = node('span', 'excluded-region');
      position(block, (start - this.window.start) / this.windowLength, (end - this.window.start) / this.windowLength);
      return [block];
    }));
  }

  private async renderThumbnails(): Promise<void> {
    const client = this.client;
    if (!client || !this.info || !this.active || this.busy) return;
    const revision = ++this.frameRevision;
    const count = clamp(Math.floor(this.surface.clientWidth / 96), 3, 12);
    const tiles = Array.from({ length: count }, (_, index) => {
      const time = this.window.start + this.windowLength * index / count;
      const tile = button('');
      tile.setAttribute('aria-label', `${formatTime(time)} を表示`);
      tile.append(node('span', 'thumb-placeholder'), node('span', '', formatTime(time).slice(0, -4)));
      tile.addEventListener('click', () => this.seekSource(time));
      tile.addEventListener('focus', () => this.hover(time, tile.getBoundingClientRect().left));
      tile.addEventListener('blur', () => this.hideHover());
      return { tile, time };
    });
    this.thumbnails.style.setProperty('--thumb-count', String(count));
    this.thumbnails.replaceChildren(...tiles.map(item => item.tile));
    const status = byId('trim-thumbnail-note');
    status.textContent = '';
    try {
      for (const { tile, time } of tiles) {
        const { bitmap } = await client.request({ type: 'frame', timestamp: time, keyframe: true });
        if (revision !== this.frameRevision) { bitmap.close(); return; }
        const canvas = this.drawBitmap(bitmap);
        tile.firstElementChild?.replaceWith(canvas);
      }
      status.textContent = 'サムネイルは各位置付近のキーフレームです。';
    } catch {
      if (revision === this.frameRevision) status.textContent = 'サムネイルを表示できません。時刻を指定して保存できます。';
    }
  }

  private drawBitmap(bitmap: ImageBitmap, canvas = node('canvas')): HTMLCanvasElement {
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
    bitmap.close();
    return canvas;
  }

  private hover(time: number, clientX: number): void {
    if (!this.info?.canDecode || !this.active || this.busy) return;
    const popup = byId('trim-hover');
    const canvas = byId('trim-hover-canvas', HTMLCanvasElement);
    const rect = this.surface.getBoundingClientRect();
    const revision = ++this.hoverRevision;
    clearTimeout(this.hoverTimer);
    popup.hidden = false;
    popup.style.left = `${clamp(clientX - rect.left, 0, Math.max(0, rect.width - 180))}px`;
    byId('trim-hover-time').textContent = formatTime(time);
    this.hoverTimer = window.setTimeout(async () => {
      try {
        const result = await this.client?.request({ type: 'frame', timestamp: time, keyframe: false });
        if (!result) return;
        if (revision !== this.hoverRevision) { result.bitmap.close(); return; }
        this.drawBitmap(result.bitmap, canvas);
        canvas.hidden = false;
      } catch {
        if (revision === this.hoverRevision) canvas.hidden = true;
      }
    }, 160);
  }

  private hideHover(): void {
    this.hoverRevision++;
    clearTimeout(this.hoverTimer);
    byId('trim-hover').hidden = true;
    byId('trim-hover-canvas').hidden = true;
  }

  private selectAt(event: MouseEvent): void {
    if (this.busy || !(event.target instanceof Element) || event.target.closest('.clip-handle')) return;
    const clip = event.target.closest<HTMLElement>('[data-clip]');
    if (clip) this.model.selected = Number(clip.dataset.clip);
    this.seekSource(event.detail ? this.timeAt(event.clientX) : this.model.ranges[this.model.selected]?.start ?? this.time);
    this.renderTimeline();
    if (event.detail === 0 && clip) this.track.querySelector<HTMLButtonElement>(`[data-clip="${this.model.selected}"] .clip-select`)?.focus();
  }

  private hitEdge(target: EventTarget | null): { index: number; edge: Edge } | null {
    if (!(target instanceof Element)) return null;
    const handle = target.closest<HTMLElement>('[data-edge]');
    const clip = target.closest<HTMLElement>('[data-clip]');
    const edge = handle?.dataset.edge;
    return clip && (edge === 'start' || edge === 'end') ? { index: Number(clip.dataset.clip), edge } : null;
  }

  private beginDrag(event: PointerEvent): void {
    const hit = this.hitEdge(event.target);
    if (!hit || this.busy || event.button !== 0) return;
    event.preventDefault();
    this.pause();
    this.drag = { ...hit, pointerId: event.pointerId, before: this.snapshot() };
    this.model.selected = hit.index;
    this.track.setPointerCapture(event.pointerId);
  }

  private setEdge(index: number, edge: Edge, time: number): void {
    const range = this.model.ranges[index];
    if (!range) return;
    range[edge] = edge === 'start' ? clamp(time, 0, Math.max(0, range.end - precision)) : clamp(time, Math.min(this.duration, range.start + precision), this.duration);
    this.model.selected = index;
  }

  private moveDrag(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    this.setEdge(drag.index, drag.edge, this.timeAt(event.clientX));
    this.renderTimeline();
  }

  private endDrag(event: PointerEvent, canceled: boolean): void {
    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    this.drag = null;
    if (canceled) this.model = drag.before;
    else if (this.model.ranges[drag.index][drag.edge] !== drag.before.ranges[drag.index][drag.edge]) this.remember(drag.before);
    this.refresh();
  }

  private commitEdge(index: number, edge: Edge, time: number): void {
    const before = this.snapshot();
    this.setEdge(index, edge, time);
    if (this.model.ranges[index]?.[edge] !== before.ranges[index]?.[edge]) this.remember(before);
    this.refresh();
  }

  private boundaryKey(event: KeyboardEvent): void {
    const hit = this.hitEdge(event.target);
    if (!hit || this.busy || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const step = (event.shiftKey ? 1 : 0.05) * (event.key === 'ArrowLeft' ? -1 : 1);
    this.commitEdge(hit.index, hit.edge, this.model.ranges[hit.index][hit.edge] + step);
    this.track.querySelector<HTMLButtonElement>(`[data-clip="${hit.index}"] [data-edge="${hit.edge}"]`)?.focus();
  }

  private shortcuts(event: KeyboardEvent): void {
    if (this.busy || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      this.restore(event.shiftKey);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.remove();
    } else if (event.key.toLowerCase() === 's' && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      this.split();
    }
  }
}
