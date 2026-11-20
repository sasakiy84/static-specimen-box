import type { Format } from './model';

const blockSize = 1024 * 1024;
const memoryLimit = 768 * blockSize;
type VideoWindow = Window & {
  showSaveFilePicker(options: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }): Promise<FileSystemFileHandle>;
};

export function supportsPicker(view: Window): view is VideoWindow {
  return 'showSaveFilePicker' in view && typeof view.showSaveFilePicker === 'function';
}

export function mimeType(format: Format): string {
  return format === 'mp4' ? 'video/mp4' : 'video/webm';
}

export function formatBytes(size: number): string {
  if (size >= 1024 ** 3) return `${(size / 1024 ** 3).toFixed(2)} GB`;
  if (size >= 1024 ** 2) return `${(size / 1024 ** 2).toFixed(1)} MB`;
  return `${(size / 1024).toFixed(1)} KB`;
}

export function formatElapsed(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const hours = Math.floor(whole / 3600);
  return `${hours ? `${hours}時間` : ''}${Math.floor(whole % 3600 / 60)}分${whole % 60}秒`;
}

export class OutputWriter {
  private readonly blocks = new Map<number, Uint8Array<ArrayBuffer>>();
  private stream: FileSystemWritableFileStream | null;
  size = 0;

  private constructor(stream: FileSystemWritableFileStream | null) {
    this.stream = stream;
  }

  static async open(name: string, format: Format, direct: boolean): Promise<OutputWriter> {
    if (!direct || !supportsPicker(window)) return new OutputWriter(null);
    const handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: '動画', accept: { [mimeType(format)]: [`.${format}`] } }] });
    return new OutputWriter(await handle.createWritable());
  }

  async write(position: number, buffer: ArrayBuffer): Promise<void> {
    const end = position + buffer.byteLength;
    if (!Number.isSafeInteger(position) || position < 0) throw new Error('出力の書き込み位置が不正です。');
    if (this.stream) {
      await this.stream.write({ type: 'write', position, data: buffer });
    } else {
      if (end > memoryLimit) throw new Error('メモリ保存の上限（768 MB）に達しました。設定を下げるか、保存先を指定できるブラウザでお試しください。');
      const input = new Uint8Array(buffer);
      for (let read = 0; read < input.length;) {
        const index = Math.floor((position + read) / blockSize);
        const offset = (position + read) % blockSize;
        const count = Math.min(blockSize - offset, input.length - read);
        const block = this.blocks.get(index) ?? new Uint8Array(blockSize);
        block.set(input.subarray(read, read + count), offset);
        this.blocks.set(index, block);
        read += count;
      }
    }
    this.size = Math.max(this.size, end);
  }

  async finish(format: Format): Promise<Blob | null> {
    if (this.stream) {
      await this.stream.close();
      this.stream = null;
      return null;
    }
    const data: BlobPart[] = [];
    for (let index = 0; index < Math.ceil(this.size / blockSize); index++) {
      const length = Math.min(blockSize, this.size - index * blockSize);
      data.push(this.blocks.get(index)?.subarray(0, length) ?? new Uint8Array(length));
    }
    this.blocks.clear();
    return new Blob(data, { type: mimeType(format) });
  }

  async abort(): Promise<void> {
    const stream = this.stream;
    this.stream = null;
    this.blocks.clear();
    await stream?.abort().catch(() => {});
  }
}
