import { EncodedAudioPacketSource, EncodedPacketSink, EncodedVideoPacketSource, Mp4OutputFormat, Output, WebMOutputFormat } from 'mediabunny';
import type { EncodedPacket, InputAudioTrack, InputVideoTrack, StreamTarget } from 'mediabunny';
import { complement, normalizeRanges } from './model';
import type { Format, Range, RangeAction, TrimPlan } from './model';

const keyframes = { verifyKeyPackets: true };
const epsilon = 0.000001;

export function outputFormat(format: Format): Mp4OutputFormat | WebMOutputFormat {
  return format === 'mp4' ? new Mp4OutputFormat({ fastStart: false }) : new WebMOutputFormat();
}

export async function planTrim(video: InputVideoTrack, duration: number, ranges: Range[], action: RangeAction): Promise<TrimPlan> {
  const packets = new EncodedPacketSink(video);
  const aligned: Range[] = [];
  for (const range of normalizeRanges(ranges, duration)) {
    const start = await packets.getKeyPacket(range.start + epsilon, keyframes) ?? await packets.getFirstKeyPacket(keyframes);
    if (!start || start.timestamp > range.end) throw new Error('指定範囲のキーフレームを読み込めません。');
    let end = duration;
    if (range.end < duration - 0.001) {
      const previous = await packets.getKeyPacket(range.end + epsilon, keyframes);
      if (!previous) throw new Error('区間の終了位置を確認できません。');
      end = Math.abs(previous.timestamp - range.end) < epsilon
        ? previous.timestamp : (await packets.getNextKeyPacket(previous, keyframes))?.timestamp ?? duration;
    }
    aligned.push({ start: Math.max(0, start.timestamp), end: Math.min(duration, end) });
  }
  const merged = normalizeRanges(aligned, duration);
  const kept = action === 'remove' ? complement(merged, duration) : merged;
  if (!kept.length) throw new Error('保存する区間がありません。');
  return { ranges: kept, duration: kept.reduce((total, range) => total + range.end - range.start, 0) };
}

async function* decodeOrder(sink: EncodedPacketSink, first: EncodedPacket, end: EncodedPacket | undefined): AsyncGenerator<EncodedPacket, void> {
  // 出力に含める時刻は表示順で判定し、パケットはデコード順で渡す。
  let packet: EncodedPacket | null = first;
  while (packet && (!end || packet.sequenceNumber < end.sequenceNumber)) {
    yield packet;
    packet = await sink.getNextPacket(packet);
  }
}

export async function exportTrim(
  video: InputVideoTrack, audio: InputAudioTrack | null, plan: TrimPlan, format: Format, target: StreamTarget,
  onProgress: (value: number) => void,
): Promise<void> {
  const container = outputFormat(format);
  const videoCodec = video.codec;
  const audioCodec = audio?.codec;
  if (!videoCodec || !container.getSupportedVideoCodecs().includes(videoCodec)
    || (audio && (!audioCodec || !container.getSupportedAudioCodecs().includes(audioCodec)))) {
    throw new Error('この保存形式では元の映像・音声コーデックを保持できません。');
  }
  const videoConfig = await video.getDecoderConfig();
  const audioConfig = await audio?.getDecoderConfig();
  if (!videoConfig || (audio && !audioConfig)) throw new Error('コーデック情報を読み込めません。');
  const videoSource = new EncodedVideoPacketSource(videoCodec);
  const audioSource = audioCodec ? new EncodedAudioPacketSource(audioCodec) : null;
  const output = new Output({ format: container, target });
  output.addVideoTrack(videoSource, { decoderConfig: videoConfig, transformationMatrix: await video.getTransformationMatrix() });
  if (audioSource && audioConfig) output.addAudioTrack(audioSource, { decoderConfig: audioConfig });
  const videoPackets = new EncodedPacketSink(video);
  const audioPackets = audio ? new EncodedPacketSink(audio) : null;
  let offset = 0;
  try {
    await output.start();
    for (const { start, end } of plan.ranges) {
      const firstVideo = await videoPackets.getKeyPacket(start + epsilon, keyframes) ?? await videoPackets.getFirstKeyPacket(keyframes);
      if (!firstVideo || firstVideo.timestamp >= end || (firstVideo.timestamp < start - 0.001)) {
        throw new Error('保存区間のキーフレームを読み込めません。');
      }
      const lastVideo = await videoPackets.getKeyPacket(end + epsilon, keyframes);
      const stop = lastVideo && Math.abs(lastVideo.timestamp - end) < epsilon ? lastVideo : undefined;
      const videoStream = decodeOrder(videoPackets, firstVideo, stop);
      const firstAudio = audioPackets && (await audioPackets.getPacket(start) ?? await audioPackets.getFirstPacket());
      const audioStream = audioPackets && firstAudio ? decodeOrder(audioPackets, firstAudio, undefined) : null;
      try {
        let frame = await videoStream.next();
        let sample = await audioStream?.next();
        while (!frame.done || (sample && !sample.done && sample.value.timestamp < end)) {
          if (sample && !sample.done && sample.value.timestamp < end && (frame.done || sample.value.timestamp <= frame.value.timestamp)) {
            const packet = sample.value;
            if (audioSource && audioConfig && packet.timestamp >= start - epsilon) {
              await audioSource.add(packet.clone({ timestamp: offset + packet.timestamp - start, duration: Math.min(packet.duration, end - packet.timestamp) }), { decoderConfig: audioConfig });
            }
            sample = await audioStream?.next();
          } else if (!frame.done) {
            const packet = frame.value;
            if (packet.timestamp < start - epsilon || packet.timestamp >= end - epsilon) {
              throw new Error('この動画は区間外のフレームを参照するため、高速トリミングできません。');
            }
            const timestamp = offset + packet.timestamp - start;
            await videoSource.add(packet.clone({ timestamp, duration: Math.min(packet.duration, end - packet.timestamp) }), { decoderConfig: videoConfig });
            onProgress(Math.min(1, timestamp / plan.duration));
            frame = await videoStream.next();
          }
        }
      } finally {
        await videoStream.return();
        await audioStream?.return();
      }
      offset += end - start;
    }
    videoSource.close();
    audioSource?.close();
    await output.finalize();
  } catch (error) {
    await output.cancel().catch(() => {});
    throw error;
  }
}
