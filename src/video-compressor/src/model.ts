import type { AudioCodec, VideoCodec } from 'mediabunny';

export const formats = ['mp4', 'webm'] as const;
export type Format = typeof formats[number];
export const presets = {
  quality: { shortEdge: 1080, fps: 60, ratio: 0.95, similarity: 0.97 },
  balanced: { shortEdge: 720, fps: 30, ratio: 0.65, similarity: 0.945 },
  small: { shortEdge: 480, fps: 24, ratio: 0.4, similarity: 0.9 },
};
export type Mode = keyof typeof presets;
export type Codec = Extract<VideoCodec, 'avc' | 'hevc' | 'vp9' | 'vp8' | 'av1'>;
export const codecsByFormat: Record<Format, Codec[]> = {
  mp4: ['avc', 'hevc', 'av1', 'vp9'],
  webm: ['vp9', 'vp8', 'av1'],
};
export const codecLabels: Record<Codec, string> = {
  avc: 'H.264', hevc: 'H.265', vp9: 'VP9', vp8: 'VP8', av1: 'AV1',
};
export type AvailableCodecs = Record<Format, Codec[]>;
export type Settings = { mode: Mode; shortEdge: number | null; fps: number | null; removeAudio: boolean; codec: Codec | 'auto' };
export type SourceInfo = {
  width: number;
  height: number;
  duration: number;
  fps: number;
  videoBitrate: number;
  audioBitrate: number;
  videoCodec: VideoCodec | null;
  audioCodec: AudioCodec | null;
  hdr: boolean;
  canDecode: boolean;
  trimFormats: Format[];
};
export type Range = { start: number; end: number };
export type RangeAction = 'keep' | 'remove';
export type TrimPlan = { ranges: Range[]; duration: number };
export type CompressionPlan = { codec: Codec; width: number; height: number; fps: number; bitrate: number };
export type ExportJob =
  | { kind: 'compress'; format: Format; settings: Settings }
  | { kind: 'trim'; format: Format; ranges: Range[]; action: RangeAction };

export type MediaCommand =
  | { type: 'open'; file: File }
  | { type: 'codecs'; settings: Settings }
  | { type: 'plan'; ranges: Range[]; action: RangeAction }
  | { type: 'frame'; timestamp: number; keyframe: boolean }
  | { type: 'export'; job: ExportJob };
export type MediaResult =
  | { type: 'open'; info: SourceInfo }
  | { type: 'codecs'; codecs: AvailableCodecs }
  | { type: 'plan'; plan: TrimPlan }
  | { type: 'frame'; timestamp: number; bitmap: ImageBitmap }
  | { type: 'export'; seconds: number; targetMet?: boolean };
export type ToWorker =
  | { type: 'request'; id: number; command: MediaCommand }
  | { type: 'ack'; id: number; error?: string };
export type FromWorker =
  | { type: 'result'; id: number; result: MediaResult }
  | { type: 'error'; id: number; message: string }
  | { type: 'progress'; id: number; value: number | null; message: string; estimate?: number; plan?: CompressionPlan }
  | { type: 'chunk'; id: number; chunkId: number; position: number; buffer: ArrayBuffer };
export type Progress = Extract<FromWorker, { type: 'progress' }>;

export function isFormat(value: string): value is Format {
  return value === 'mp4' || value === 'webm';
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function messageOf(error: unknown, fallback = '処理できませんでした。'): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function formatTime(seconds: number): string {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  const clock = [Math.floor(milliseconds / 3600000), Math.floor(milliseconds / 60000) % 60, Math.floor(milliseconds / 1000) % 60];
  return `${clock.map(part => String(part).padStart(2, '0')).join(':')}.${String(milliseconds % 1000).padStart(3, '0')}`;
}

export function parseTime(value: string): number {
  if (!/^\d+(?::[0-5]?\d){0,2}(?:\.\d{1,3})?$/.test(value.trim())) {
    throw new Error('時刻は秒、または 00:00:00.000 で入力してください。');
  }
  const seconds = value.trim().split(':').reduce((total, field) => total * 60 + Number(field), 0);
  if (!Number.isFinite(seconds)) throw new Error('時刻が大きすぎます。');
  return seconds;
}

export function normalizeRanges(ranges: Range[], duration: number): Range[] {
  if (ranges.length > 100) throw new Error('区間は100個まで指定できます。');
  const sorted = ranges.map(({ start, end }) => {
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > duration + 0.001 || start >= Math.min(duration, end)) {
      throw new Error('開始は終了より前にし、動画の長さの範囲で指定してください。');
    }
    return { start, end: Math.min(duration, end) };
  }).sort((a, b) => a.start - b.start);
  const merged: Range[] = [];
  for (const range of sorted) {
    const last = merged.at(-1);
    if (last && range.start <= last.end + 0.000001) last.end = Math.max(last.end, range.end);
    else merged.push(range);
  }
  return merged;
}

export function complement(ranges: Range[], duration: number): Range[] {
  const remaining: Range[] = [];
  let start = 0;
  for (const range of ranges) {
    if (range.start > start) remaining.push({ start, end: range.start });
    start = range.end;
  }
  if (start < duration) remaining.push({ start, end: duration });
  return remaining;
}
