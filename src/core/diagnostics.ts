import { EMOJIS, emojiResource } from './configuration';
export const diagnosticStages = ['platform', 'manifest', 'assets', 'worker', 'runtime', 'detector', 'recognizer', 'emoji', 'decode', 'encode'] as const;
export const diagnosticReasons = ['network', 'http', 'integrity', 'decode', 'wasm-compile', 'memory', 'unsupported', 'initialization', 'worker'] as const;
const resources = new Set(['manifest.json','workers/pipeline.worker.js','models/face_detection_yunet_2023mar.onnx','models/face_recognition_sface_2021dec.onnx','runtime/ort-wasm-simd-threaded.mjs','runtime/ort-wasm-simd-threaded.wasm','emoji/sequences.json',...EMOJIS.map(emojiResource)]);
export interface Diagnostic { stage: typeof diagnosticStages[number]; reason: typeof diagnosticReasons[number]; resource?: string; httpStatus?: number }
export function diagnosticReason(error: unknown): Diagnostic['reason'] {
  const name = error && typeof error === 'object' && 'name' in error ? error.name : '';
  if (name === 'CompileError') return 'wasm-compile';
  if (name === 'RangeError') return 'memory';
  return 'initialization';
}
export function isDiagnostic(value: unknown): value is Diagnostic {
  if (!value || typeof value !== 'object') return false;
  const d = value as Record<string, unknown>;
  if (Object.keys(d).some(key=>!['stage','reason','resource','httpStatus'].includes(key))) return false;
  return diagnosticStages.includes(d.stage as Diagnostic['stage']) && diagnosticReasons.includes(d.reason as Diagnostic['reason']) &&
    (d.resource === undefined || typeof d.resource === 'string' && resources.has(d.resource)) &&
    (d.httpStatus === undefined || Number.isInteger(d.httpStatus) && Number(d.httpStatus) >= 100 && Number(d.httpStatus) <= 599);
}
