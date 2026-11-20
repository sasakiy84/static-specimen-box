import { messageOf } from './model';
import type { FromWorker, MediaCommand, MediaResult, Progress, ToWorker } from './model';

type Callbacks = {
  progress?: (progress: Progress) => void;
  write?: (position: number, data: ArrayBuffer) => Promise<void>;
};
type Pending = Callbacks & { resolve: (result: MediaResult) => void; reject: (error: Error) => void };

function matches<Kind extends MediaResult['type']>(result: MediaResult, type: Kind): result is Extract<MediaResult, { type: Kind }> {
  return result.type === type;
}

export class WorkerClient {
  private readonly worker = new Worker(new URL('./media.worker.ts', import.meta.url), { type: 'module' });
  private readonly pending = new Map<number, Pending>();
  private sequence = 0;
  private closed = false;

  constructor() {
    this.worker.onmessage = (event: MessageEvent<FromWorker>) => this.receive(event.data);
    this.worker.onerror = event => this.close(new Error(`処理エンジンを実行できません。${event.message}`));
    this.worker.onmessageerror = () => this.close(new Error('処理エンジンからの結果を読み取れません。'));
  }

  async request<Kind extends MediaCommand['type']>(command: MediaCommand & { type: Kind }, callbacks: Callbacks = {}): Promise<Extract<MediaResult, { type: Kind }>> {
    if (this.closed) throw new Error('処理エンジンは終了しています。');
    const id = ++this.sequence;
    const result = await new Promise<MediaResult>((resolve, reject) => {
      this.pending.set(id, { ...callbacks, resolve, reject });
      try {
        this.post({ type: 'request', id, command });
      } catch (error) {
        this.pending.delete(id);
        reject(error);
      }
    });
    if (!matches<Kind>(result, command.type)) throw new Error('処理エンジンから予期しない結果を受け取りました。');
    return result;
  }

  close(reason: Error = new DOMException('キャンセルしました。', 'AbortError')): void {
    if (this.closed) return;
    this.closed = true;
    this.worker.terminate();
    for (const request of this.pending.values()) request.reject(reason);
    this.pending.clear();
  }

  private post(message: ToWorker): void {
    this.worker.postMessage(message);
  }

  private receive(message: FromWorker): void {
    const request = this.pending.get(message.id);
    if (!request) {
      if (message.type === 'result' && message.result.type === 'frame') message.result.bitmap.close();
      return;
    }
    switch (message.type) {
      case 'progress':
        request.progress?.(message);
        break;
      case 'chunk':
        void this.writeChunk(message, request);
        break;
      case 'result':
        this.pending.delete(message.id);
        request.resolve(message.result);
        break;
      case 'error':
        this.pending.delete(message.id);
        request.reject(new Error(message.message));
        break;
    }
  }

  private async writeChunk(message: Extract<FromWorker, { type: 'chunk' }>, request: Pending): Promise<void> {
    let error: string | undefined;
    try {
      if (!request.write) throw new Error('書き込み先がありません。');
      await request.write(message.position, message.buffer);
    } catch (failure) {
      error = messageOf(failure, '保存できません。');
    }
    if (!this.closed) this.post({ type: 'ack', id: message.chunkId, error });
  }
}
