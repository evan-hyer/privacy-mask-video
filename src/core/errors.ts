export type ErrorCode = 'unsupported-platform' | 'invalid-file' | 'unsupported-input' | 'decode-failed' | 'no-valid-frame' | 'asset-load-failed' | 'asset-integrity-failed' | 'invalid-selection' | 'invalid-emoji' | 'invalid-configuration' | 'invalid-state' | 'unsupported-export' | 'resource-limit' | 'tracking-failed' | 'encode-failed' | 'worker-failed';
import type { Diagnostic } from './diagnostics';
const messages: Record<ErrorCode, string> = {
  'unsupported-platform': 'Use a browser with local video codecs, module workers and WebAssembly on HTTPS or localhost.',
  'invalid-file': 'Choose a nonempty local MP4 or WebM video file.',
  'unsupported-input': 'This video’s tracks, dimensions or codecs are unsupported. Try another MP4 or WebM video.',
  'decode-failed': 'The video could not be decoded. Try another file.',
  'no-valid-frame': 'This video contains no usable video frame.',
  'asset-load-failed': 'Processing resources could not be loaded. Check the installation and retry initialization.',
  'asset-integrity-failed': 'A processing resource failed its integrity check. Restore the component assets.',
  'invalid-selection': 'Select up to 8 distinct listed faces or a nonempty rectangle fully inside the picture.',
  'invalid-emoji': 'Choose one emoji from the supported set. Your previous emoji is retained.',
  'invalid-configuration': 'Set a same-origin asset directory before the component first connects.',
  'invalid-state': 'This action is unavailable in the current state.',
  'unsupported-export': 'No local export route can preserve this video’s dimensions and every audio track.',
  'resource-limit': 'The video exceeds the limits: 256 MiB input/output, 10 minutes, 1920 pixels per side and 2,073,600 pixels.',
  'tracking-failed': 'Local face tracking failed. Retry or select another region.',
  'encode-failed': 'The video could not be finalized. No partial download is available.',
  'worker-failed': 'The processing worker stopped unexpectedly. Retry the operation.',
};
export class PrivacyMaskError extends Error {
  readonly recoverable = true;
  constructor(readonly code: ErrorCode, readonly diagnostic?: Diagnostic) { super(messages[code]); this.name = code === 'invalid-state' ? 'InvalidStateError' : code.startsWith('invalid-') ? 'TypeError' : 'PrivacyMaskError'; }
}
export class PrivacyMaskConfigurationError extends TypeError {
  readonly recoverable=true;
  constructor(readonly code:'invalid-emoji'|'invalid-configuration') { super(messages[code]); }
}
export type ComponentError = PrivacyMaskError | PrivacyMaskConfigurationError;
export const failure = (code: ErrorCode, diagnostic?: Diagnostic): ComponentError => code==='invalid-emoji'||code==='invalid-configuration'?new PrivacyMaskConfigurationError(code):new PrivacyMaskError(code, diagnostic);
export function diagnosed(error: unknown, fallback: ErrorCode, diagnostic: Diagnostic): ComponentError {
  const safe = sanitized(error, fallback);
  return safe instanceof PrivacyMaskError && safe.diagnostic ? safe : failure(safe.code, diagnostic);
}
export function isErrorCode(value:unknown):value is ErrorCode { return typeof value==='string' && Object.prototype.hasOwnProperty.call(messages,value); }
export const abortError = (): DOMException => new DOMException('The operation was canceled.', 'AbortError');
export function sanitized(error: unknown, fallback: ErrorCode): ComponentError { return error instanceof PrivacyMaskError || error instanceof PrivacyMaskConfigurationError ? error : failure(fallback); }
