/// <reference lib="webworker" />
import { BlobSource, CanvasSink, EncodedPacketSink, Input, MATROSKA, MP4, QTFF, StreamTarget, UnsupportedInputFormatError, WEBM } from 'mediabunny';
import type { InputAudioTrack, InputVideoTrack, StreamTargetChunk } from 'mediabunny';
import { availableCodecs, compressMedia } from './compress-media';
import { clamp, formats, messageOf } from './model';
import type { AvailableCodecs, FromWorker, MediaCommand, MediaResult, Settings, SourceInfo, ToWorker } from './model';
import { exportTrim, outputFormat, planTrim } from './trim-media';

declare const self: DedicatedWorkerGlobalScope;

type Source = { input: Input; video: InputVideoTrack; audio: InputAudioTrack | null; info: SourceInfo };
let source: Source | null = null;
let queue = Promise.resolve();
let chunkId = 0;
const chunks = new Map<number, { resolve: () => void; reject: (error: Error) => void }>();
const codecCache = new Map<string, Promise<AvailableCodecs>>();

function send(message: FromWorker, transfers: Transferable[] = []): void {
  self.postMessage(message, transfers);
}

async function open(file: File): Promise<Source> {
  // ファイルの一部だけを読み込み、外部参照を持つプレイリストを入力から除く。
  const input = new Input({ source: new BlobSource(file), formats: [MP4, QTFF, WEBM, MATROSKA] });
  try {
    const tracks = await input.getTracks();
    const [video] = await input.getVideoTracks();
    const audios = await input.getAudioTracks();
    if (!video || audios.length > 1 || tracks.length !== 1 + audios.length) {
      throw new Error('映像1本・音声0〜1本の動画に対応しています。複数の映像・音声トラックや字幕を含むファイルは処理できません。');
    }
    const audio = audios[0] ?? null;
    const duration = await video.computeDuration();
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('動画の長さを取得できません。');
    const { averagePacketRate } = await video.computePacketStats(180);
    const audioBitrate = audio ? await audio.getAverageBitrate() ?? (await audio.computePacketStats(100)).averageBitrate : 0;
    return {
      input, video, audio,
      info: {
        width: await video.getDisplayWidth(), height: await video.getDisplayHeight(), duration,
        fps: clamp(averagePacketRate || 30, 1, 240), videoBitrate: await video.getAverageBitrate() ?? Math.max(80000, file.size * 8 / duration - audioBitrate),
        audioBitrate, videoCodec: video.codec, audioCodec: audio?.codec ?? null,
        hdr: await video.hasHighDynamicRange().catch(() => false), canDecode: await video.canDecode().catch(() => false),
        trimFormats: formats.filter(format => {
          const output = outputFormat(format);
          return !!video.codec && output.getSupportedVideoCodecs().includes(video.codec)
            && (!audio || (!!audio.codec && output.getSupportedAudioCodecs().includes(audio.codec)));
        }),
      },
    };
  } catch (error) {
    input.dispose();
    if (error instanceof UnsupportedInputFormatError) throw new Error('対応形式の動画を読み込めません。MP4・MOV・WebM・MKVのファイルを選んでください。');
    throw error;
  }
}

function supportedCodecs(info: SourceInfo, settings: Settings): Promise<AvailableCodecs> {
  const key = JSON.stringify([settings.mode, settings.shortEdge, settings.fps]);
  const pending = codecCache.get(key) ?? availableCodecs(info, settings);
  codecCache.set(key, pending);
  return pending;
}

function createTarget(id: number): StreamTarget {
  return new StreamTarget(new WritableStream<StreamTargetChunk>({
    write: ({ position, data }) => {
      const current = ++chunkId;
      const buffer = data.slice().buffer;
      return new Promise<void>((resolve, reject) => {
        chunks.set(current, { resolve, reject });
        send({ type: 'chunk', id, chunkId: current, position, buffer }, [buffer]);
      });
    },
  }), { chunked: true, chunkSize: 1024 * 1024 });
}

async function execute(id: number, command: MediaCommand): Promise<MediaResult> {
  if (command.type === 'open') {
    source?.input.dispose();
    source = null;
    codecCache.clear();
    source = await open(command.file);
    return { type: 'open', info: source.info };
  }
  if (!source) throw new Error('動画を選んでください。');
  const { input, video, audio, info } = source;
  switch (command.type) {
    case 'codecs':
      return { type: 'codecs', codecs: await supportedCodecs(info, command.settings) };
    case 'plan':
      return { type: 'plan', plan: await planTrim(video, info.duration, command.ranges, command.action) };
    case 'frame': {
      if (!info.canDecode) throw new Error('この端末ではサムネイルを表示できません。');
      let timestamp = clamp(command.timestamp, 0, Math.max(0, info.duration - 0.001));
      if (command.keyframe) {
        const key = await new EncodedPacketSink(video).getKeyPacket(timestamp, { verifyKeyPackets: true });
        if (key) timestamp = key.timestamp + 0.000001;
      }
      const frame = await new CanvasSink(video, { width: 160, height: 90, fit: 'contain', poolSize: 1 }).getCanvas(timestamp);
      if (!frame) throw new Error('この位置のサムネイルを取得できません。');
      return { type: 'frame', timestamp: frame.timestamp, bitmap: await createImageBitmap(frame.canvas) };
    }
    case 'export': {
      const start = performance.now();
      const job = command.job;
      let lastProgress = 0;
      let lastMessage = '';
      const report = (value: number | null, message: string, plan?: Extract<FromWorker, { type: 'progress' }>['plan'], estimate?: number): void => {
        const now = performance.now();
        if (message === lastMessage && now - lastProgress < 250 && value !== 1 && !plan) return;
        lastProgress = now;
        lastMessage = message;
        send({ type: 'progress', id, value, message, plan, estimate });
      };
      const target = createTarget(id);
      if (job.kind === 'trim') {
        const plan = await planTrim(video, info.duration, job.ranges, job.action);
        report(0, '動画をトリミングしています…');
        await exportTrim(video, audio, plan, job.format, target, value => report(value, '動画をトリミングしています…'));
        return { type: 'export', seconds: (performance.now() - start) / 1000 };
      }
      const codecs = await supportedCodecs(info, job.settings);
      const targetMet = await compressMedia(input, audio, info, job.format, job.settings, codecs, target, report);
      return { type: 'export', seconds: (performance.now() - start) / 1000, targetMet };
    }
  }
}

self.onmessage = (event: MessageEvent<ToWorker>) => {
  const message = event.data;
  if (message.type === 'ack') {
    const pending = chunks.get(message.id);
    chunks.delete(message.id);
    if (message.error) pending?.reject(new Error(message.error));
    else pending?.resolve();
    return;
  }
  queue = queue.then(async () => {
    try {
      const result = await execute(message.id, message.command);
      send({ type: 'result', id: message.id, result }, result.type === 'frame' ? [result.bitmap] : []);
    } catch (error) {
      send({ type: 'error', id: message.id, message: messageOf(error, '動画を処理できません。') });
    }
  });
};
