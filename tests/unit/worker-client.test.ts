import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkerClient } from '../../src/core/worker-client';
import type { ResidentAssets } from '../../src/core/assets';
import type { Message, ResidentWorkerAssets } from '../../src/worker/protocol';

class TestWorker {
  static instances: TestWorker[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { preventDefault: () => void }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();

  constructor() {
    TestWorker.instances.push(this);
  }

  get request(): Message {
    return this.postMessage.mock.calls.map(call => call[0] as Message).findLast(message => ['INIT', 'LOAD', 'RUN'].includes(message.type))!;
  }

  emit(type: string, payload: unknown, envelope: Message = this.request): void {
    this.onmessage?.({ data: { ...envelope, type, payload } });
  }
}

class TestBitmap {
  close = vi.fn();
}

const assets = {
  workerURL: 'blob:worker',
  workerAssets: {} as ResidentWorkerAssets,
} as ResidentAssets;
const capabilities = {
  ready: true,
  webCodecs: true,
  offscreenCanvas: true,
  wasm: true,
  videoCodecs: ['avc'],
  audioCodecs: ['aac'],
};
let client: WorkerClient;
const onMessage = vi.fn();

function worker(): TestWorker {
  return TestWorker.instances.at(-1)!;
}

async function initialize(): Promise<void> {
  const ready = client.initialize();
  worker().emit('READY', capabilities);
  await ready;
}

beforeEach(() => {
  TestWorker.instances = [];
  onMessage.mockReset();
  vi.stubGlobal('Worker', TestWorker);
  vi.stubGlobal('ImageBitmap', TestBitmap);
  client = new WorkerClient('instance', assets, onMessage);
});

afterEach(() => {
  client.dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('worker lifecycle', () => {
  it('initializes once per request and rejects overlapping operations', async () => {
    const ready = client.initialize();
    expect(client.operationType).toBe('INIT');
    await expect(client.initialize()).rejects.toMatchObject({ code: 'invalid-state' });
    worker().emit('READY', capabilities);
    await ready;
    expect(client.ready).toBe(true);
    expect(client.jobId).toBeNull();
  });

  it('sanitizes worker construction failures and allows a retry', async () => {
    vi.stubGlobal('Worker', class {
      constructor() { throw new Error('private implementation detail'); }
    });
    await expect(client.initialize()).rejects.toMatchObject({ code: 'worker-failed' });
    expect(client.ready).toBe(false);
    vi.stubGlobal('Worker', TestWorker);
    await initialize();
    expect(client.ready).toBe(true);
  });

  it.each(['error', 'messageerror', 'post'] as const)('recovers after a %s failure', async kind => {
    const ready = client.initialize();
    const failed = expect(ready).rejects.toMatchObject({ code: 'worker-failed' });
    const previous = worker();
    if (kind === 'error') previous.onerror?.({ preventDefault: vi.fn() });
    if (kind === 'messageerror') previous.onmessageerror?.();
    if (kind === 'post') {
      previous.postMessage.mockImplementationOnce(() => { throw new Error('closed'); });
      client.acknowledge(1);
    }
    await failed;
    expect(previous.terminate).toHaveBeenCalledOnce();
    expect(client.ready).toBe(false);
    expect(client.jobId).toBeNull();
    await initialize();
    previous.onerror?.({ preventDefault: vi.fn() });
    expect(client.ready).toBe(true);
    expect(worker().terminate).not.toHaveBeenCalled();
  });

  it('handles an initial request post failure', async () => {
    const ready = client.initialize();
    worker().emit('READY', capabilities);
    await ready;
    const previous = worker();
    previous.postMessage.mockImplementationOnce(() => { throw new Error('closed'); });
    await expect(client.request('INIT', assets.workerAssets!, 'READY')).rejects.toMatchObject({ code: 'worker-failed' });
    expect(client.ready).toBe(false);
    expect(previous.terminate).toHaveBeenCalledOnce();
    await initialize();
  });

  it('does not restore readiness after disposal races with READY', async () => {
    const ready = client.initialize();
    worker().emit('READY', capabilities);
    client.dispose();
    await expect(ready).rejects.toMatchObject({ name: 'AbortError' });
    expect(client.ready).toBe(false);
  });

  it('releases stale bitmaps and forwards only current progress', async () => {
    const ready = client.initialize();
    const current = worker();
    const bitmap = new TestBitmap();
    current.emit('PREVIEW', { bitmap, sequence: 1, timestampUs: 0 }, { ...current.request, generation: 0 });
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(onMessage).not.toHaveBeenCalled();
    current.emit('PROGRESS', { stage: 'scanning', processedFrames: 1, timestampUs: 0, durationUs: 1, ratio: 0 });
    expect(onMessage).toHaveBeenCalledOnce();
    current.emit('READY', capabilities);
    await ready;
    client.dispose();
    const lateBitmap = new TestBitmap();
    current.emit('PREVIEW', { bitmap: lateBitmap, sequence: 2, timestampUs: 0 });
    expect(lateBitmap.close).toHaveBeenCalledOnce();
  });

  it('preserves a healthy worker after a recoverable processing error', async () => {
    const ready = client.initialize();
    const failed = expect(ready).rejects.toMatchObject({ code: 'asset-load-failed' });
    worker().emit('ERROR', { code: 'asset-load-failed', message: 'retry', recoverable: true });
    await failed;
    expect(worker().terminate).not.toHaveBeenCalled();
    await initialize();
    expect(TestWorker.instances).toHaveLength(1);
  });

  it('handles a failed reset post without throwing', async () => {
    await initialize();
    worker().postMessage.mockImplementationOnce(() => { throw new Error('closed'); });
    expect(() => client.reset()).not.toThrow();
    expect(client.ready).toBe(false);
    await initialize();
  });
});

describe('cancellation', () => {
  it.each(['acknowledgment', 'timeout', 'post failure', 'worker failure'] as const)(
    'settles cancellation and allows retry after %s',
    async completion => {
      vi.useFakeTimers();
      const ready = client.initialize();
      const aborted = expect(ready).rejects.toMatchObject({ name: 'AbortError' });
      const previous = worker();
      if (completion === 'post failure') {
        previous.postMessage.mockImplementationOnce(() => { throw new Error('closed'); });
      }
      expect(client.cancel('user')).toBe(previous.request.jobId);
      await aborted;
      expect(client.cancel('user')).toBeNull();

      const retry = client.initialize();
      if (completion === 'acknowledgment') previous.emit('CANCELED', null);
      if (completion === 'timeout') await vi.advanceTimersByTimeAsync(250);
      if (completion === 'worker failure') previous.onmessageerror?.();
      await Promise.resolve();
      expect(previous.terminate).toHaveBeenCalledOnce();
      expect(worker()).not.toBe(previous);
      worker().emit('READY', capabilities);
      await retry;
      expect(client.ready).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('aborts queued initialization and requests when disposed during cancellation', async () => {
    vi.useFakeTimers();
    const ready = client.initialize();
    const aborted = expect(ready).rejects.toMatchObject({ name: 'AbortError' });
    const previous = worker();
    client.cancel('user');
    await aborted;

    const retry = expect(client.initialize()).rejects.toMatchObject({ name: 'AbortError' });
    const request = expect(client.request('INIT', assets.workerAssets!, 'READY')).rejects.toMatchObject({ name: 'AbortError' });
    client.dispose();
    await Promise.all([retry, request]);

    expect(previous.terminate).toHaveBeenCalledOnce();
    expect(TestWorker.instances).toHaveLength(1);
    expect(client.ready).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    await initialize();
    expect(client.ready).toBe(true);
  });
});

