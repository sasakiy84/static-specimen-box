import './style.css';
import { byId } from './dom';
import { codecLabels, formats, isFormat, messageOf } from './model';
import type { AvailableCodecs, Codec, ExportJob, Format, Progress, Settings, SourceInfo } from './model';
import { formatBytes, formatElapsed, OutputWriter, supportsPicker } from './output';
import { Timeline } from './timeline';
import { WorkerClient } from './worker-client';

const fileInput = byId('file', HTMLInputElement);
const dropzone = byId('dropzone');
const compression = byId('options', HTMLFieldSetElement);
const start = byId('start', HTMLButtonElement);
const cancel = byId('cancel', HTMLButtonElement);
const format = byId('extension', HTMLSelectElement);
const codec = byId('video-codec', HTMLSelectElement);
const resolution = byId('resolution', HTMLSelectElement);
const framerate = byId('framerate', HTMLSelectElement);
const removeAudio = byId('remove-audio', HTMLInputElement);
const direct = byId('direct-save', HTMLInputElement);
const tabs = [byId('compress-tab', HTMLButtonElement), byId('trim-tab', HTMLButtonElement)];
const progress = byId('progress', HTMLProgressElement);
const preview = byId('preview', HTMLVideoElement);
const download = byId('download', HTMLAnchorElement);
const result = byId('result');
const errorMessage = byId('error');
const work = byId('work');
const status = byId('status');
const timing = byId('timing');
const plan = byId('plan');
const timeline = new Timeline(exportVideo);
let file: File | null = null;
let info: SourceInfo | null = null;
let client: WorkerClient | null = null;
let writer: OutputWriter | null = null;
let resultUrl: string | null = null;
let busy = false;
let activeTab = 0;
let operation = 0;
let codecRevision = 0;
let checkingCodecs = false;
let available: AvailableCodecs = { mp4: [], webm: [] };
let progressTimer = 0;

function settings(): Settings {
  const preset = document.querySelector<HTMLInputElement>('input[name="mode"]:checked')?.value;
  const selectedCodec = codec.value;
  return {
    mode: preset === 'quality' || preset === 'small' ? preset : 'balanced',
    shortEdge: Number(resolution.value) || null, fps: Number(framerate.value) || null, removeAudio: removeAudio.checked,
    codec: isCodec(selectedCodec) ? selectedCodec : 'auto',
  };
}

function isCodec(value: string): value is Codec {
  return Object.hasOwn(codecLabels, value);
}

function selectedFormat(): Format {
  return isFormat(format.value) ? format.value : 'mp4';
}

function showError(message: string): void {
  errorMessage.textContent = message;
  errorMessage.hidden = !message;
}

function showWork(message: string): void {
  work.hidden = false;
  status.textContent = message;
  progress.removeAttribute('value');
  timing.textContent = '';
  plan.textContent = '';
}

function updateControls(): void {
  fileInput.disabled = busy;
  compression.hidden = !info;
  compression.disabled = busy;
  start.hidden = !info;
  start.disabled = busy || !info || checkingCodecs || !available[selectedFormat()].length;
  codec.disabled = busy || !info || checkingCodecs || !available[selectedFormat()].length;
  cancel.hidden = !busy;
  for (const tab of tabs) tab.disabled = busy;
  timeline.setBusy(busy);
}

function setBusy(value: boolean): void {
  busy = value;
  updateControls();
}

function applyCodecs(): void {
  for (const option of format.options) {
    if (!isFormat(option.value)) continue;
    option.disabled = !available[option.value].length;
    option.textContent = `.${option.value}${option.disabled ? '（非対応）' : ''}`;
  }
  if (!available[selectedFormat()].length) {
    const fallback = formats.find(candidate => available[candidate].length);
    if (fallback) format.value = fallback;
  }
  const supported = available[selectedFormat()];
  for (const option of codec.options) {
    if (isCodec(option.value)) {
      option.disabled = !supported.includes(option.value);
      option.textContent = `${codecLabels[option.value]}${option.disabled ? '（非対応）' : ''}`;
    } else {
      option.textContent = supported[0] ? `自動（${codecLabels[supported[0]]}）` : '自動';
    }
  }
  if (!codec.value || codec.selectedOptions[0]?.disabled) {
    codec.value = 'auto';
    const note = byId('codec-note');
    note.textContent = '設定に合わせて映像コーデックを「自動」に戻しました。';
    note.hidden = false;
  }
  updateControls();
}

async function checkCodecs(): Promise<void> {
  if (!client || !info || activeTab !== 0 || busy) return;
  const revision = ++codecRevision;
  checkingCodecs = true;
  showError('');
  const note = byId('codec-note');
  note.textContent = '利用できる映像コーデックを確認しています…';
  note.hidden = false;
  updateControls();
  try {
    const response = await client.request({ type: 'codecs', settings: settings() });
    if (revision !== codecRevision) return;
    available = response.codecs;
    note.hidden = true;
    if (!formats.some(candidate => available[candidate].length)) {
      showError('この設定で利用できる映像コーデックがありません。解像度やフレームレートを下げてください。');
    }
  } catch (error) {
    if (revision !== codecRevision) return;
    available = { mp4: [], webm: [] };
    note.hidden = true;
    showError(messageOf(error, 'コーデックの対応を確認できません。'));
  } finally {
    if (revision === codecRevision) {
      checkingCodecs = false;
      applyCodecs();
    }
  }
}

function clearResult(): void {
  preview.pause();
  preview.removeAttribute('src');
  preview.load();
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  resultUrl = null;
  result.hidden = true;
  preview.hidden = true;
  download.hidden = true;
  download.removeAttribute('href');
  byId('saved').hidden = true;
  showError('');
}

async function openVideo(source: File, retainTimeline = false): Promise<void> {
  const revision = ++operation;
  codecRevision++;
  checkingCodecs = false;
  if (!retainTimeline) {
    timeline.clearSource();
    info = null;
    available = { mp4: [], webm: [] };
    clearResult();
  }
  file = source;
  client?.close();
  client = null;
  timeline.bindClient(null);
  setBusy(true);
  byId('file-info').hidden = false;
  const filename = byId('filename');
  filename.textContent = source.name;
  filename.title = source.name;
  const metadata = byId('metadata');
  metadata.textContent = `${formatBytes(source.size)} ／ 解析中…`;
  showWork('動画を確認しています…');
  try {
    const worker = new WorkerClient();
    client = worker;
    const response = await worker.request({ type: 'open', file: source });
    if (revision !== operation) return;
    info = response.info;
    const { width, height, duration, videoCodec, audioCodec } = info;
    metadata.textContent = `${formatBytes(source.size)} ／ ${width} × ${height} ／ ${formatElapsed(duration)} ／ ${videoCodec?.toUpperCase() ?? '映像'}${audioCodec ? ` + ${audioCodec.toUpperCase()}` : ' ／ 音声なし'}`;
    timeline.bindClient(worker);
    if (!retainTimeline) timeline.setSource(source, info);
    work.hidden = true;
    setBusy(false);
    if (activeTab === 0) void checkCodecs();
    else timeline.resume();
  } catch (error) {
    if (revision !== operation) return;
    client?.close();
    client = null;
    info = null;
    timeline.clearSource();
    byId('file-info').hidden = true;
    work.hidden = true;
    setBusy(false);
    showError(messageOf(error, '動画を読み込めません。'));
  }
}

function reportProgress(update: Progress): void {
  status.textContent = update.message;
  if (update.value === null) progress.removeAttribute('value');
  else progress.value = update.value;
  if (update.plan) {
    const { codec, width, height, fps } = update.plan;
    plan.textContent = `${codecLabels[codec]} ／ ${width} × ${height} / ${fps.toFixed(1)}fps${update.estimate === undefined ? '' : ` ／ 推定 ${formatBytes(update.estimate)}`}`;
  }
}

async function exportVideo(job: ExportJob, saveDirectly: boolean): Promise<void> {
  if (busy || !client || !file || !info) return;
  const worker = client;
  const original = file;
  const revision = ++operation;
  const trimming = job.kind === 'trim';
  const suffix = job.kind === 'compress' ? `_compressed_${job.settings.mode}` : '_trimmed';
  const name = `${original.name.replace(/\.[^.]+$/, '')}${suffix}.${job.format}`;
  clearResult();
  setBusy(true);
  let output: OutputWriter | null = null;
  let recent: Progress | undefined;
  try {
    const destination = await OutputWriter.open(name, job.format, saveDirectly);
    output = destination;
    if (revision !== operation) { await output.abort(); return; }
    writer = output;
    const started = performance.now();
    showWork(trimming ? '動画をトリミングしています…' : '圧縮設定を調整しています…');
    progressTimer = window.setInterval(() => {
      const elapsed = (performance.now() - started) / 1000;
      const value = recent?.value ?? 0;
      const remaining = value > 0.02 && recent && !recent.message.startsWith('設定') ? ` ／ 残り約 ${formatElapsed(elapsed / value - elapsed)}` : '';
      timing.textContent = `経過 ${formatElapsed(elapsed)}${remaining} ／ 書き込み ${formatBytes(writer?.size ?? 0)}`;
    }, 1000);
    const response = await worker.request({ type: 'export', job }, {
      write: (position, bytes) => destination.write(position, bytes),
      progress: update => { recent = update; reportProgress(update); },
    });
    if (revision !== operation) return;
    if (!output.size) throw new Error('出力された動画を保存できません。');
    const blob = await output.finish(job.format);
    if (revision !== operation) return;
    writer = null;
    if (blob) {
      resultUrl = URL.createObjectURL(blob);
      preview.src = resultUrl;
      preview.hidden = false;
      download.href = resultUrl;
      download.download = name;
      download.textContent = trimming ? 'トリミングした動画を保存' : '圧縮した動画を保存';
      download.hidden = false;
    } else {
      const saved = byId('saved');
      saved.textContent = `保存しました：${name}`;
      saved.hidden = false;
    }
    preview.setAttribute('aria-label', trimming ? 'トリミング後の動画' : '圧縮後の動画');
    result.setAttribute('aria-label', trimming ? 'トリミング結果' : '圧縮結果');
    byId('result-title').textContent = trimming ? 'トリミングできました' : '圧縮できました';
    byId('output-size').textContent = formatBytes(output.size);
    const reduction = 100 * (1 - output.size / original.size);
    byId('reduction').textContent = `${Math.abs(reduction).toFixed(1)}% ${reduction >= 0 ? '削減' : '増加'}`;
    byId('elapsed').textContent = formatElapsed(response.seconds);
    const note = byId('result-note');
    const notes = [];
    if (!trimming && reduction <= 0) notes.push('元の動画より小さくなりませんでした。元ファイルのまま使うか、サイズ優先モードをお試しください。');
    if (!trimming && response.targetMet === false) notes.push('画質が下がっている可能性があります。保存前に映像を確認してください。');
    note.textContent = notes.join(' ');
    note.hidden = !notes.length;
    result.hidden = false;
    progress.value = 1;
    status.textContent = '完了しました。';
    timing.textContent = `経過 ${formatElapsed(response.seconds)} ／ 書き込み ${formatBytes(output.size)}`;
  } catch (error) {
    await output?.abort();
    if (revision !== operation) return;
    writer = null;
    work.hidden = true;
    if (!(error instanceof DOMException && error.name === 'AbortError')) showError(messageOf(error));
  } finally {
    if (revision === operation) {
      clearInterval(progressTimer);
      setBusy(false);
      if (trimming) timeline.resume();
    }
  }
}

async function cancelOperation(): Promise<void> {
  if (!busy) return;
  const revision = ++operation;
  codecRevision++;
  clearInterval(progressTimer);
  client?.close();
  client = null;
  timeline.bindClient(null);
  const output = writer;
  writer = null;
  await output?.abort();
  if (revision !== operation) return;
  if (file && info) {
    await openVideo(file, true);
  } else {
    file = null;
    byId('file-info').hidden = true;
    work.hidden = true;
    setBusy(false);
  }
  if (operation === revision || operation === revision + 1) showError('キャンセルしました。もう一度実行できます。');
}

function selectTab(index: number): void {
  if (busy || index === activeTab) return;
  activeTab = index;
  codecRevision++;
  checkingCodecs = false;
  clearResult();
  work.hidden = true;
  for (const [position, tab] of tabs.entries()) {
    tab.setAttribute('aria-selected', String(position === index));
    tab.tabIndex = position === index ? 0 : -1;
  }
  byId('compress-panel').hidden = index !== 0;
  byId('trim-panel').hidden = index !== 1;
  timeline.setActive(index === 1);
  if (index === 0) void checkCodecs();
}

start.addEventListener('click', () => void exportVideo({ kind: 'compress', format: selectedFormat(), settings: settings() }, direct.checked));
cancel.addEventListener('click', () => void cancelOperation());
fileInput.addEventListener('change', () => {
  const source = fileInput.files?.[0];
  fileInput.value = '';
  if (source && !busy) void openVideo(source);
});
for (const type of ['dragenter', 'dragover']) dropzone.addEventListener(type, event => {
  event.preventDefault();
  if (!busy) dropzone.classList.add('drag');
});
for (const type of ['dragleave', 'drop']) dropzone.addEventListener(type, event => {
  event.preventDefault();
  dropzone.classList.remove('drag');
});
dropzone.addEventListener('drop', event => {
  const source = event.dataTransfer?.files[0];
  if (source && !busy) void openVideo(source);
});
for (const [index, tab] of tabs.entries()) {
  tab.addEventListener('click', () => selectTab(index));
  tab.addEventListener('keydown', event => {
    if (busy || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index;
    selectTab(next);
    tabs[next].focus();
  });
}
for (const control of [resolution, framerate, ...document.querySelectorAll('input[name="mode"]')]) {
  control.addEventListener('change', () => void checkCodecs());
}
format.addEventListener('change', applyCodecs);
codec.addEventListener('change', () => { byId('codec-note').hidden = true; });
byId('reset-settings').addEventListener('click', () => {
  resolution.value = '0';
  framerate.value = '0';
  removeAudio.checked = false;
  codec.value = 'auto';
  direct.checked = true;
  void checkCodecs();
});
for (const id of ['disk-option', 'trim-disk-option']) byId(id).hidden = !supportsPicker(window);
window.addEventListener('beforeunload', event => { if (busy) event.preventDefault(); });
updateControls();
