import { failure } from './errors';
export const LIMITS = Object.freeze({ version: 1, inputBytes: 256 * 1024 ** 2, outputBytes: 256 * 1024 ** 2, durationUs: 600_000_000, side: 1920, pixels: 2_073_600 });
export type ResourceLimits = typeof LIMITS;
export function validateFile(file: unknown): asserts file is File {
  if (!(file instanceof File) || file.size <= 0) throw failure('invalid-file');
  if (file.size > LIMITS.inputBytes) throw failure('resource-limit');
}
export function validateMedia(width: number, height: number, durationUs: number): void {
  if (![width, height, durationUs].every(Number.isSafeInteger) || width <= 0 || height <= 0 || durationUs <= 0) throw failure('unsupported-input');
  if (width > LIMITS.side || height > LIMITS.side || width * height > LIMITS.pixels || durationUs > LIMITS.durationUs) throw failure('resource-limit');
}
