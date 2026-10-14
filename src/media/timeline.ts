import { failure } from '../core/errors';
export function toUs(seconds: number): number {
  const time = Math.round(seconds * 1_000_000);
  if (!Number.isFinite(seconds) || !Number.isSafeInteger(time)) throw failure('unsupported-input');
  return time;
}
export function toSeconds(microseconds: number): number {
  if (!Number.isSafeInteger(microseconds)) throw failure('unsupported-input');
  return microseconds / 1_000_000;
}
export function frameTime(timestamp: number, duration: number, originUs: number, previousUs: number): { timestampUs: number; durationUs: number } {
  const timestampUs = toUs(timestamp) - originUs;
  const durationUs = toUs(duration);
  if (timestampUs < 0 || timestampUs <= previousUs || durationUs <= 0) throw failure('unsupported-input');
  return { timestampUs, durationUs };
}
