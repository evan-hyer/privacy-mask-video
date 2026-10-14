import type { CapabilityReport } from './types';
import { failure } from './errors';
export function platformCapabilities(): CapabilityReport {
  const webCodecs = typeof VideoDecoder !== 'undefined' && typeof VideoEncoder !== 'undefined';
  const offscreenCanvas = typeof OffscreenCanvas !== 'undefined';
  const wasm = typeof WebAssembly !== 'undefined';
  if (!globalThis.isSecureContext || !globalThis.customElements || !globalThis.Worker || !offscreenCanvas || !wasm || !webCodecs || !document.fonts || typeof FontFace==='undefined' || typeof createImageBitmap==='undefined' || !globalThis.crypto?.subtle || !new OffscreenCanvas(1,1).getContext('2d')) throw failure('unsupported-platform');
  return { ready: false, webCodecs, offscreenCanvas, wasm, videoCodecs: [], audioCodecs: [] };
}
