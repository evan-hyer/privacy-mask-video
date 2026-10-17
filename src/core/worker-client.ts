import { abortError, failure } from './errors';
import type { ResidentAssets } from './assets';
import { closePayload, isMessage } from '../worker/protocol';
import type { Message, MessageType } from '../worker/protocol';

type RequestType = 'INIT' | 'LOAD' | 'RUN';

interface Pending {
  envelope: Message<RequestType>;
  success: MessageType;
  resolve: (message: Message) => void;
  reject: (error: unknown) => void;
}

const CANCEL_TIMEOUT_MS = 250;

export class WorkerClient {
  private worker: Worker | null = null;
  private pending: Pending | null = null;
  private generation = 0;
  private disposalVersion = 0;
  private stopping: Promise<void> | null = null;
  private stop: (() => void) | null = null;
  private cancelEnvelope: Message<RequestType> | null = null;
  ready = false;

  constructor(
    readonly instanceId: string,
    private readonly assets: ResidentAssets,
    private readonly onMessage: (message: Message) => void,
  ) {}

  get jobId(): string | null {
    return this.pending?.envelope.jobId ?? null;
  }

  get operationType(): RequestType | null {
    return this.pending?.envelope.type ?? null;
  }

  async initialize(): Promise<Message<'READY'>> {
    const disposalVersion = this.disposalVersion;
    if (this.stopping) await this.stopping;
    if (disposalVersion !== this.disposalVersion) throw abortError();
    if (!this.assets.workerAssets || !this.assets.workerURL) throw failure('asset-load-failed');

    const request = this.request('INIT', this.assets.workerAssets, 'READY');
    const worker = this.worker;
    const result = await request;
    if (worker !== this.worker) throw abortError();

    this.ready = true;
    return result as Message<'READY'>;
  }

  async request<K extends RequestType>(
    type: K,
    payload: Message<K>['payload'],
    success: MessageType,
    transfer: Transferable[] = [],
  ): Promise<Message> {
    const disposalVersion = this.disposalVersion;
    if (this.stopping) await this.stopping;
    if (disposalVersion !== this.disposalVersion) throw abortError();
    if (this.pending) throw failure('invalid-state');

    const worker = this.worker ?? this.createWorker();
    const envelope = {
      protocolVersion: 1,
      instanceId: this.instanceId,
      generation: ++this.generation,
      jobId: crypto.randomUUID(),
      type,
      payload,
    } as Message<K>;

    return new Promise<Message>((resolve, reject) => {
      this.pending = { envelope: envelope as Message<RequestType>, success, resolve, reject };
      try {
        worker.postMessage(envelope, transfer);
      } catch {
        this.failWorker(worker);
      }
    });
  }

  private createWorker(): Worker {
    let worker: Worker;
    try {
      worker = new Worker(this.assets.workerURL, { type: 'module', name: 'privacy-mask-video' });
    } catch {
      this.ready = false;
      throw failure('worker-failed', { stage: 'worker', reason: 'worker' });
    }

    this.worker = worker;
    worker.onmessage = event => {
      if (this.worker === worker) this.receive(event.data);
      else closePayload(event.data);
    };
    worker.onerror = event => {
      event.preventDefault();
      this.failWorker(worker);
    };
    worker.onmessageerror = () => this.failWorker(worker);
    return worker;
  }

  private failWorker(worker: Worker): void {
    if (this.worker !== worker) return;

    const pending = this.pending;
    this.pending = null;
    this.ready = false;
    if (this.stop) this.stop();
    else {
      worker.terminate();
      this.worker = null;
    }
    pending?.reject(failure('worker-failed', { stage: 'worker', reason: 'worker' }));
  }

  private receive(message: unknown): void {
    if (!isMessage(message) || message.instanceId !== this.instanceId) {
      closePayload(message);
      return;
    }

    if (message.type === 'CANCELED' && this.stop && message.jobId === this.cancelEnvelope?.jobId && message.generation === this.cancelEnvelope.generation) {
      this.stop();
      return;
    }

    const pending = this.pending;
    if (!pending || message.generation !== pending.envelope.generation || message.jobId !== pending.envelope.jobId) {
      closePayload(message);
      return;
    }

    if (message.type === 'ERROR') {
      this.pending = null;
      pending.reject(failure(message.payload.code, message.payload.diagnostic));
    } else if (message.type === pending.success) {
      this.pending = null;
      pending.resolve(message);
    } else {
      this.onMessage(message);
    }
  }

  private post(message: Message): void {
    const worker = this.worker;
    if (!worker) return;
    try {
      worker.postMessage(message);
    } catch {
      this.failWorker(worker);
    }
  }

  acknowledge(sequence: number): void {
    const pending = this.pending;
    if (pending) this.post({ ...pending.envelope, type: 'PREVIEW_ACK', payload: { sequence } });
  }

  cancel(reason: string): string | null {
    const pending = this.pending;
    if (!pending) return null;

    this.pending = null;
    this.ready = false;
    this.generation++;
    pending.reject(abortError());
    const worker = this.worker;
    this.cancelEnvelope = pending.envelope;

    // Install the cleanup promise before posting: a failed post can finish synchronously.
    let resolveStop!: () => void;
    this.stopping = new Promise<void>(resolve => { resolveStop = resolve; });
    const finish = (): void => {
      if (this.stop !== finish) return;
      clearTimeout(timer);
      worker?.terminate();
      if (this.worker === worker) this.worker = null;
      this.stop = null;
      this.cancelEnvelope = null;
      this.stopping = null;
      resolveStop();
    };
    this.stop = finish;
    const timer = setTimeout(finish, CANCEL_TIMEOUT_MS);
    this.post({ ...pending.envelope, type: 'CANCEL', payload: { reason } });
    return pending.envelope.jobId;
  }

  reset(): void {
    if (this.pending?.envelope.type === 'INIT') return;
    if (this.pending) {
      this.cancel('reset');
    } else if (this.worker && !this.stopping) {
      this.post({
        protocolVersion: 1,
        instanceId: this.instanceId,
        generation: ++this.generation,
        jobId: crypto.randomUUID(),
        type: 'RESET',
        payload: null,
      });
    }
  }

  dispose(): void {
    this.disposalVersion++;
    this.pending?.reject(abortError());
    this.pending = null;
    this.generation++;
    this.ready = false;
    this.stop?.();
    this.worker?.terminate();
    this.worker = null;
  }
}
