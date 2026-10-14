import { failure, abortError } from './errors';
import { EMOJIS } from './configuration';
import type { ResidentWorkerAssets } from '../worker/protocol';
interface AssetEntry { path: string; kind: string; sha256: string; size: number }
interface Manifest { schemaVersion: number; runtimeVersion: string; entries: AssetEntry[]; worker?: { sha256: string; size: number } }
export class ResidentAssets {
  readonly fontFamily: string;
  workerURL = '';
  workerAssets: ResidentWorkerAssets | null = null;
  private urls: string[] = [];
  private font: FontFace | null = null;
  private disposed = false;
  constructor(instanceId: string) { this.fontFamily = `PMV-${instanceId}`; }
  private url(bytes: Uint8Array, mimeType: string): string {
    const buffer = new Uint8Array(bytes).buffer;
    const url = URL.createObjectURL(new Blob([buffer], { type: mimeType }));
    this.urls.push(url);
    return url;
  }
  async load(base: string, workerLocation: string, signal: AbortSignal): Promise<void> {
    const fetchLocal = async (url: string): Promise<Uint8Array> => {
      if (new URL(url).origin !== location.origin) throw failure('invalid-configuration');
      const response = await fetch(url, { signal, credentials: 'omit', redirect: 'error', cache: 'no-store' });
      if (!response.ok) throw failure('asset-load-failed');
      return new Uint8Array(await response.arrayBuffer());
    };
    const verify = async (bytes: Uint8Array, entry: { size: number; sha256: string }): Promise<void> => {
      if (!Number.isSafeInteger(entry.size) || entry.size <= 0 || !/^[a-f0-9]{64}$/.test(entry.sha256) || bytes.length !== entry.size) throw failure('asset-integrity-failed');
      const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer);
      const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      if (hash !== entry.sha256) throw failure('asset-integrity-failed');
    };
    const manifest = JSON.parse(new TextDecoder().decode(await fetchLocal(new URL('manifest.json', base).href))) as Manifest;
    if (manifest.schemaVersion !== 1 || manifest.runtimeVersion !== '1.30.0' || !Array.isArray(manifest.entries) || !manifest.worker) throw failure('asset-integrity-failed');
    const required = ['models/face_detection_yunet_2023mar.onnx','models/face_recognition_sface_2021dec.onnx','runtime/ort-wasm-simd-threaded.mjs','runtime/ort-wasm-simd-threaded.wasm','emoji/NotoColorEmoji.ttf','emoji/sequences.json'];
    const resources = new Map<string, Uint8Array>();
    // Sequential loading limits peak download memory on smaller machines.
    for (const resource of required) {
      const entry = manifest.entries.find(candidate => candidate.path === resource);
      if (!entry) throw failure('asset-integrity-failed');
      const bytes = await fetchLocal(new URL(resource, base).href);
      await verify(bytes, entry);
      resources.set(resource, bytes);
    }
    const sequences = JSON.parse(new TextDecoder().decode(resources.get('emoji/sequences.json'))).sequences as unknown;
    if (JSON.stringify(sequences) !== JSON.stringify(EMOJIS)) throw failure('asset-integrity-failed');
    const worker = await fetchLocal(workerLocation);
    await verify(worker, manifest.worker);
    if (this.disposed || signal.aborted) throw abortError();
    this.workerURL = this.url(worker, 'text/javascript');
    this.workerAssets = {
      models: { detector: resources.get(required[0]!)!, recognition: resources.get(required[1]!)! },
      runtime: { mjs: this.url(resources.get(required[2]!)!, 'text/javascript'), wasm: this.url(resources.get(required[3]!)!, 'application/wasm') },
      modelHashes: required.slice(0, 2).map(resource => manifest.entries.find(entry => entry.path === resource)!.sha256),
      runtimeVersion: manifest.runtimeVersion,
    };
    this.font = new FontFace(this.fontFamily, `url(${this.url(resources.get(required[4]!)!, 'font/ttf')})`);
    await this.font.load();
    if (this.disposed || signal.aborted) { this.release(); throw abortError(); }
    document.fonts.add(this.font);
  }
  release(): void {
    this.disposed = true;
    if (this.font) document.fonts.delete(this.font);
    this.font = null;
    for (const url of this.urls.splice(0)) URL.revokeObjectURL(url);
    this.workerAssets = null;
    this.workerURL = '';
  }
}
