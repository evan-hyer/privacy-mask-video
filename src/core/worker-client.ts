import { abortError, failure } from './errors';
import type { ResidentAssets } from './assets';
import { isMessage, closePayload } from '../worker/protocol';
import type { Message, MessageType } from '../worker/protocol';
type RequestType = 'INIT' | 'LOAD' | 'RUN';
interface Pending { envelope: Message<RequestType>; success: MessageType; resolve: (message: Message) => void; reject: (error: unknown) => void }
export class WorkerClient {
  private worker: Worker | null = null;
  private pending: Pending | null = null;
  private generation = 0;
  private stopping: Promise<void> | null = null;
  private stop: (() => void) | null = null;
  private cancelEnvelope: Message<RequestType> | null = null;
  ready = false;
  get jobId(): string | null { return this.pending?.envelope.jobId ?? null; }
  get operationType(): RequestType | null { return this.pending?.envelope.type ?? null; }
  constructor(readonly instanceId: string, private assets: ResidentAssets, private onMessage: (message: Message) => void) {}
  async initialize(): Promise<Message<'READY'>> {
    if (this.stopping) await this.stopping;
    if (!this.assets.workerAssets || !this.assets.workerURL) throw failure('asset-load-failed');
    const result = await this.request('INIT', this.assets.workerAssets, 'READY');
    this.ready = true;
    return result as Message<'READY'>;
  }
  async request<K extends RequestType>(type: K, payload: Message<K>['payload'], success: MessageType, transfer: Transferable[] = []): Promise<Message> {
    if (this.stopping) await this.stopping;
    if (this.pending) throw failure('invalid-state');
    if (!this.worker) {
      const worker = new Worker(this.assets.workerURL, { type: 'module', name: 'privacy-mask-video' });
      this.worker = worker;
      worker.onmessage = (event: MessageEvent<unknown>) => { if (this.worker === worker) this.receive(event.data); else closePayload(event.data); };
      worker.onerror = event => {
        event.preventDefault();
        if (this.worker !== worker) return;
        const pending = this.pending;
        this.pending = null;
        this.ready = false;
        this.worker?.terminate(); this.worker = null;
        pending?.reject(failure('worker-failed',{stage:'worker',reason:'worker'}));
      };
    }
    const envelope = { protocolVersion: 1, instanceId: this.instanceId, generation: ++this.generation, jobId: crypto.randomUUID(), type, payload } as Message<K>;
    return new Promise<Message>((resolve, reject) => {
      this.pending = { envelope: envelope as Message<RequestType>, success, resolve, reject };
      try { this.worker!.postMessage(envelope, transfer); }
      catch { this.pending = null; this.ready = false; this.worker?.terminate(); this.worker = null; reject(failure('worker-failed')); }
    });
  }
  private receive(message: unknown): void {
    if (!isMessage(message) || message.instanceId !== this.instanceId) { closePayload(message); return; }
    if (message.type === 'CANCELED' && this.stop && message.jobId === this.cancelEnvelope?.jobId && message.generation === this.cancelEnvelope.generation) { this.stop(); return; }
    const pending = this.pending;
    if (!pending || message.generation !== pending.envelope.generation || message.jobId !== pending.envelope.jobId) { closePayload(message); return; }
    if (message.type === 'ERROR') {
      this.pending = null; pending.reject(failure(message.payload.code,message.payload.diagnostic)); return;
    }
    if (message.type === pending.success) {
      this.pending = null; pending.resolve(message); return;
    }
    this.onMessage(message);
  }
  acknowledge(sequence: number): void {
    const pending = this.pending;
    if (pending) this.worker?.postMessage({ ...pending.envelope, type: 'PREVIEW_ACK', payload: { sequence } });
  }
  cancel(reason: string): string | null {
    const pending = this.pending;
    if (!pending) return null;
    this.pending = null; this.ready = false; this.generation++;
    pending.reject(abortError());
    const worker = this.worker;
    this.cancelEnvelope = pending.envelope;
    let timer: ReturnType<typeof setTimeout>;
    this.stopping = new Promise<void>(resolve => {
      const finish = (): void => {
        clearTimeout(timer); worker?.terminate();
        if (this.worker === worker) this.worker = null;
        this.stop = null; this.cancelEnvelope = null; this.stopping = null; resolve();
      };
      this.stop = finish;
      timer = setTimeout(finish, 250);
      worker?.postMessage({ ...pending.envelope, type: 'CANCEL', payload: { reason } });
    });
    return pending.envelope.jobId;
  }
  reset(): void {
    if(this.pending?.envelope.type==='INIT')return;
    if (this.pending) this.cancel('reset');
    else if (this.worker && !this.stopping) this.worker.postMessage({ protocolVersion: 1, instanceId: this.instanceId, generation: ++this.generation, jobId: crypto.randomUUID(), type: 'RESET', payload: null });
  }
  dispose(): void {
    this.pending?.reject(abortError()); this.pending = null; this.generation++; this.ready = false;
    this.stop?.();
    this.worker?.terminate(); this.worker = null;
  }
}
