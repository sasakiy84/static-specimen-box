import { ALL_FORMATS, BufferSource, BufferTarget, CanvasSink, CanvasSource, Conversion, Input, Output, Quality, canDecodeVideo, canEncodeAudio, canEncodeVideo } from 'mediabunny';
import type { ConversionVideoOptions, InputAudioTrack, StreamTarget } from 'mediabunny';
import { codecsByFormat, formats, presets } from './model';
import type { AvailableCodecs, Codec, CompressionPlan, Format, Settings, SourceInfo } from './model';
import { outputFormat } from './trim-media';

type Trial = { bitrate: number; similarity: number; bytesPerSecond: number };
type Report = (value: number | null, message: string, plan?: CompressionPlan, estimate?: number) => void;
const bitrateRatios = [0.65, 1, 1.5];
const probes = new Map<string, Promise<boolean>>();

function compressionPlan(info: SourceInfo, settings: Settings, codec: Codec): CompressionPlan {
  const preset = presets[settings.mode];
  const scale = Math.min(1, (settings.shortEdge ?? preset.shortEdge) / Math.min(info.width, info.height), 3840 / Math.max(info.width, info.height));
  const width = Math.max(2, Math.floor(info.width * scale / 2) * 2);
  const height = Math.max(2, Math.floor(info.height * scale / 2) * 2);
  const fps = Math.min(settings.fps ?? preset.fps, info.fps);
  const bitrate = Math.round(Math.max(80000, Math.min(info.videoBitrate * scale ** 1.2 * preset.ratio, width * height * fps * (codec === 'avc' ? 0.1 : 0.075))));
  return { codec, width, height, fps, bitrate };
}

function videoOptions(plan: CompressionPlan): ConversionVideoOptions {
  return {
    width: plan.width, height: plan.height, codec: plan.codec, frameRate: plan.fps,
    quality: new Quality({ bitrate: plan.bitrate, bitrateMode: 'variable' }),
    fit: 'contain', forceTranscode: true, keyFrameInterval: 4, allowTransformationMetadata: false,
  };
}

async function probe(plan: CompressionPlan, format: Format): Promise<boolean> {
  const canvas = new OffscreenCanvas(plan.width, plan.height);
  const context = canvas.getContext('2d');
  if (!context) return false;
  const target = new BufferTarget();
  const output = new Output({ format: outputFormat(format), target });
  let input: Input | undefined;
  try {
    const source = new CanvasSource(canvas, { codec: plan.codec, quality: new Quality({ bitrate: plan.bitrate, bitrateMode: 'variable' }) });
    output.addVideoTrack(source, { frameRate: plan.fps });
    await output.start();
    for (let index = 0; index < 3; index++) {
      context.fillStyle = index % 2 ? '#326cb0' : '#e8bd54';
      context.fillRect(0, 0, plan.width, plan.height);
      await source.add(index / plan.fps, 1 / plan.fps);
    }
    await output.finalize();
    if (!target.buffer) return false;
    input = new Input({ source: new BufferSource(target.buffer), formats: ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    if (!track || !await track.canDecode()) return false;
    return !!await new CanvasSink(track, { width: 2, height: 2, fit: 'contain', poolSize: 1 }).getCanvas(1 / plan.fps);
  } catch {
    return false;
  } finally {
    input?.dispose();
    if (output.state === 'started' || output.state === 'finalizing') await output.cancel().catch(() => {});
  }
}

export async function availableCodecs(info: SourceInfo, settings: Settings): Promise<AvailableCodecs> {
  if (!globalThis.VideoEncoder || !globalThis.VideoDecoder || !globalThis.OffscreenCanvas) {
    throw new Error('このブラウザでは動画圧縮に必要な WebCodecs を利用できません。');
  }
  if (info.hdr) throw new Error('色や明るさを保持できないため、HDR動画の圧縮には対応していません。');
  if (!info.canDecode) throw new Error('このブラウザ・端末では動画の映像コーデックを読み込めません。');
  const result: AvailableCodecs = { mp4: [], webm: [] };
  for (const codec of new Set([...codecsByFormat.mp4, ...codecsByFormat.webm])) {
    const plan = compressionPlan(info, settings, codec);
    if (!await canDecodeVideo(codec, { codedWidth: plan.width, codedHeight: plan.height })) continue;
    const supported = await Promise.all(bitrateRatios.map(ratio => canEncodeVideo(codec, {
      width: plan.width, height: plan.height, frameRate: plan.fps,
      quality: new Quality({ bitrate: Math.round(plan.bitrate * ratio), bitrateMode: 'variable' }),
    })));
    if (!supported.every(Boolean)) continue;
    for (const format of formats.filter(format => codecsByFormat[format].includes(codec))) {
      const key = JSON.stringify([format, plan]);
      const test = probes.get(key) ?? probe(plan, format);
      probes.set(key, test);
      if (await test) result[format].push(codec);
    }
  }
  for (const format of formats) result[format] = codecsByFormat[format].filter(codec => result[format].includes(codec));
  return result;
}

function luma(pixels: Uint8ClampedArray, index: number): number {
  return 0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2];
}

function similarity(source: Uint8ClampedArray, output: Uint8ClampedArray, width: number, height: number): number {
  // 8×8 のブロックごとに輝度の構造的類似度を測り、小さい試行出力を選ぶ。
  let score = 0;
  let blocks = 0;
  for (let top = 0; top < height; top += 8) {
    for (let left = 0; left < width; left += 8) {
      let sumSource = 0, sumOutput = 0, squareSource = 0, squareOutput = 0, product = 0, count = 0;
      for (let y = top; y < Math.min(height, top + 8); y++) {
        for (let x = left; x < Math.min(width, left + 8); x++) {
          const offset = (y * width + x) * 4;
          const a = luma(source, offset), b = luma(output, offset);
          sumSource += a;
          sumOutput += b;
          squareSource += a * a;
          squareOutput += b * b;
          product += a * b;
          count++;
        }
      }
      const meanSource = sumSource / count, meanOutput = sumOutput / count;
      const varianceSource = Math.max(0, squareSource / count - meanSource ** 2);
      const varianceOutput = Math.max(0, squareOutput / count - meanOutput ** 2);
      const covariance = product / count - meanSource * meanOutput;
      score += (2 * meanSource * meanOutput + 6.5025) * (2 * covariance + 58.5225)
        / ((meanSource ** 2 + meanOutput ** 2 + 6.5025) * (varianceSource + varianceOutput + 58.5225));
      blocks++;
    }
  }
  return score / blocks;
}

async function sampleScene(input: Input, format: Format, plan: CompressionPlan, start: number, length: number): Promise<{ bytes: number; score: number }> {
  const { width, height } = plan;
  const context = new OffscreenCanvas(width, height).getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('画質評価用の Canvas を利用できません。');
  const frames: { timestamp: number; pixels: Uint8ClampedArray }[] = [];
  const frameTimes = [0, 0.4, 0.75].map(fraction => fraction * length);
  const target = new BufferTarget();
  const output = new Output({ format: outputFormat(format), target });
  const conversion = await Conversion.init({
    input, output, trim: { start, end: start + length }, audio: { discard: true }, tags: {}, showWarnings: false,
    video: {
      ...videoOptions(plan),
      process: frame => {
        if (frames.length < frameTimes.length && frame.timestamp >= frameTimes[frames.length]) {
          frame.draw(context, 0, 0, width, height);
          frames.push({ timestamp: frame.timestamp, pixels: context.getImageData(0, 0, width, height).data });
        }
        return frame;
      },
    },
  });
  if (!conversion.isValid || conversion.discardedTracks.some(({ track }) => track.type === 'video')) {
    throw new Error('この解像度・コーデックで動画を圧縮できません。別の設定を選んでください。');
  }
  try {
    await conversion.execute();
  } catch (error) {
    await conversion.cancel().catch(() => {});
    throw error;
  }
  if (!target.buffer || !frames.length) throw new Error('比較用の映像フレームを作成できません。');
  const sample = new Input({ source: new BufferSource(target.buffer), formats: ALL_FORMATS });
  try {
    const track = await sample.getPrimaryVideoTrack();
    if (!track || !await track.canDecode()) throw new Error('圧縮後の映像を読み込めず画質を評価できません。');
    const sink = new CanvasSink(track, { width, height, fit: 'contain', poolSize: 1 });
    let sum = 0;
    let index = 0;
    for await (const frame of sink.canvasesAtTimestamps(frames.map(frame => frame.timestamp + 0.00001))) {
      const comparison = frame?.canvas.getContext('2d');
      if (!comparison || !('getImageData' in comparison)) throw new Error('圧縮後の比較フレームを取得できません。');
      sum += similarity(frames[index++].pixels, comparison.getImageData(0, 0, width, height).data, width, height);
    }
    return { bytes: target.buffer.byteLength, score: sum / frames.length };
  } finally {
    sample.dispose();
  }
}

async function chooseBitrate(input: Input, format: Format, plan: CompressionPlan, duration: number, threshold: number, report: Report): Promise<Trial> {
  const length = Math.min(1.6, duration);
  const starts = duration < 6 ? [0] : [0.1, 0.5, 0.9].map(fraction => Math.min(duration * fraction, duration - length));
  const trials: Trial[] = [];
  for (const [candidate, ratio] of bitrateRatios.entries()) {
    const bitrate = Math.round(plan.bitrate * ratio);
    let bytes = 0;
    let score = 1;
    for (const [scene, start] of starts.entries()) {
      report((candidate * starts.length + scene) / (bitrateRatios.length * starts.length), `設定を自動調整中：候補 ${candidate + 1}/${bitrateRatios.length}・シーン ${scene + 1}/${starts.length}`);
      const trial = await sampleScene(input, format, { ...plan, bitrate }, start, length);
      bytes += trial.bytes;
      score = Math.min(score, trial.score);
    }
    trials.push({ bitrate, similarity: score, bytesPerSecond: bytes / (length * starts.length) });
  }
  return trials.filter(trial => trial.similarity >= threshold).sort((a, b) => a.bytesPerSecond - b.bytesPerSecond)[0]
    ?? trials.sort((a, b) => b.similarity - a.similarity)[0];
}

export async function compressMedia(
  input: Input, audio: InputAudioTrack | null, info: SourceInfo, format: Format, settings: Settings,
  codecs: AvailableCodecs, target: StreamTarget, report: Report,
): Promise<boolean> {
  const codec = settings.codec === 'auto' ? codecs[format][0] : codecs[format].find(codec => codec === settings.codec);
  if (!codec) throw new Error('この設定では選択した映像コーデックを利用できません。');
  const keepAudio = audio && !settings.removeAudio;
  const copyAac = format === 'mp4' && audio?.codec === 'aac';
  if (keepAudio && !copyAac && !await audio.canDecode()) {
    throw new Error('元の音声を読み込めないため、圧縮を中止しました。保存形式を変えるか、音声を削除してください。');
  }
  if (keepAudio && !copyAac && format === 'mp4' && !await canEncodeAudio('aac')) {
    const { registerAacEncoder } = await import('@mediabunny/aac-encoder');
    registerAacEncoder();
  }
  if (keepAudio && format === 'webm' && !await canEncodeAudio('opus', { numberOfChannels: 2, sampleRate: 48000 })) {
    throw new Error('このブラウザではWebMの音声を圧縮できません。MP4形式をお試しください。');
  }
  const basePlan = compressionPlan(info, settings, codec);
  const threshold = presets[settings.mode].similarity;
  const best = await chooseBitrate(input, format, basePlan, info.duration, threshold, report);
  const plan = { ...basePlan, bitrate: best.bitrate };
  const estimate = (best.bytesPerSecond + (keepAudio ? (copyAac ? info.audioBitrate : 96000) / 8 : 0)) * info.duration;
  report(0, '動画を圧縮しています…', plan, estimate);
  const conversion = await Conversion.init({
    input, output: new Output({ format: outputFormat(format), target }), video: videoOptions(plan),
    audio: settings.removeAudio ? { discard: true } : copyAac ? { codec: 'aac' } : {
      codec: format === 'mp4' ? 'aac' : 'opus', quality: new Quality({ bitrate: 96000 }), numberOfChannels: 2, sampleRate: 48000,
    },
    tags: {}, showWarnings: false,
  });
  if (!conversion.isValid || conversion.discardedTracks.some(({ track, reason }) => (
    !(settings.removeAudio && track.type === 'audio' && reason === 'discarded_by_user')
  ))) throw new Error('映像または音声を保持して変換できません。別の保存形式を選んでください。');
  conversion.onProgress = value => report(value, value < 1 ? '動画を圧縮しています…' : 'ファイルを仕上げています…');
  try {
    await conversion.execute();
  } catch (error) {
    await conversion.cancel().catch(() => {});
    throw error;
  }
  return best.similarity >= threshold;
}
