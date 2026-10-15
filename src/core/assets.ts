import { failure, diagnosed, abortError } from './errors';
import { EMOJIS, emojiResource } from './configuration';
import type { ResidentWorkerAssets } from '../worker/protocol';
interface AssetEntry { path: string; kind: string; sha256: string; size: number }
interface Manifest { schemaVersion: number; runtimeVersion: string; entries: AssetEntry[]; worker?: { sha256: string; size: number } }
export class ResidentAssets {
  workerURL = '';
  workerAssets: ResidentWorkerAssets | null = null;
  readonly emojiImages = new Map<string, Uint8Array>();
  private urls: string[] = [];
  private disposed = false;
  constructor(_instanceId: string) {}
  private url(bytes: Uint8Array, mimeType: string): string {
    const buffer = new Uint8Array(bytes).buffer;
    const url = URL.createObjectURL(new Blob([buffer], { type: mimeType }));
    this.urls.push(url); return url;
  }
  async load(base: string, workerLocation: string, signal: AbortSignal): Promise<void> {
    const fetchLocal = async (url: string, resource: string): Promise<Uint8Array> => {
      if (new URL(url).origin !== location.origin) throw failure('invalid-configuration');
      const stage = resource === 'manifest.json' ? 'manifest' : 'assets';
      try {
        const response = await fetch(url, { signal, credentials: 'omit', redirect: 'error', cache: 'no-store' });
        if (!response.ok) throw failure('asset-load-failed', {stage, reason:'http',resource,httpStatus:response.status});
        return new Uint8Array(await response.arrayBuffer());
      } catch(error) {
        if (signal.aborted) throw abortError();
        throw diagnosed(error, 'asset-load-failed', {stage,reason:'network',resource});
      }
    };
    const verify = async (bytes: Uint8Array, entry: { size: number; sha256: string }, resource: string): Promise<void> => {
      const fail = () => failure('asset-integrity-failed',{stage:'assets',reason:'integrity',resource});
      if (!Number.isSafeInteger(entry.size) || entry.size <= 0 || !/^[a-f0-9]{64}$/.test(entry.sha256) || bytes.length !== entry.size) throw fail();
      const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer);
      const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      if (hash !== entry.sha256) throw fail();
    };
    let manifest: Manifest;
    try { manifest = JSON.parse(new TextDecoder().decode(await fetchLocal(new URL('manifest.json',base).href,'manifest.json'))) as Manifest; }
    catch(error) { throw diagnosed(error,'asset-integrity-failed',{stage:'manifest',reason:'integrity',resource:'manifest.json'}); }
    if (manifest.schemaVersion !== 1 || manifest.runtimeVersion !== '1.30.0' || !Array.isArray(manifest.entries) || !manifest.worker) throw failure('asset-integrity-failed',{stage:'manifest',reason:'integrity',resource:'manifest.json'});
    const required = ['models/face_detection_yunet_2023mar.onnx','models/face_recognition_sface_2021dec.onnx','runtime/ort-wasm-simd-threaded.mjs','runtime/ort-wasm-simd-threaded.wasm','emoji/sequences.json',...EMOJIS.map(emojiResource)];
    const resources = new Map<string, Uint8Array>();
    for (const resource of required) {
      const entry = manifest.entries.find(candidate => candidate.path === resource);
      if (!entry) throw failure('asset-integrity-failed',{stage:'assets',reason:'integrity',resource});
      const bytes = await fetchLocal(new URL(resource,base).href,resource);
      await verify(bytes,entry,resource); resources.set(resource,bytes);
    }
    let sequences: unknown;
    try { sequences = JSON.parse(new TextDecoder().decode(resources.get('emoji/sequences.json'))).sequences; }
    catch { throw failure('asset-integrity-failed',{stage:'assets',reason:'integrity',resource:'emoji/sequences.json'}); }
    if (JSON.stringify(sequences) !== JSON.stringify(EMOJIS)) throw failure('asset-integrity-failed',{stage:'assets',reason:'integrity',resource:'emoji/sequences.json'});
    const worker = await fetchLocal(workerLocation,'workers/pipeline.worker.js');
    await verify(worker,manifest.worker,'workers/pipeline.worker.js');
    if (this.disposed || signal.aborted) throw abortError();
    this.workerURL = this.url(worker,'text/javascript');
    this.workerAssets = {
      models: { detector:resources.get(required[0]!)!,recognition:resources.get(required[1]!)! },
      runtime: { mjs:this.url(resources.get(required[2]!)!,'text/javascript'),wasm:this.url(resources.get(required[3]!)!,'application/wasm') },
      modelHashes:required.slice(0,2).map(resource => manifest.entries.find(entry => entry.path === resource)!.sha256),runtimeVersion:manifest.runtimeVersion,
    };
    for (const emoji of EMOJIS) this.emojiImages.set(emoji,resources.get(emojiResource(emoji))!);
  }
  release(): void {
    this.disposed = true;
    for (const url of this.urls.splice(0)) URL.revokeObjectURL(url);
    this.emojiImages.clear(); this.workerAssets = null; this.workerURL = '';
  }
}
