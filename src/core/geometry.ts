import type { Rect, Point } from './types';
import { failure } from './errors';
export function validRect(rect: unknown): rect is Rect {
  if (!rect || typeof rect !== 'object') return false;
  const value = rect as Rect;
  return [value.x, value.y, value.width, value.height].every(Number.isFinite) && value.width > 0 && value.height > 0;
}
export function validateRegion(rect: unknown, width: number, height: number): Rect {
  if (!validRect(rect) || rect.x < 0 || rect.y < 0 || rect.x + rect.width > width || rect.y + rect.height > height) throw failure('invalid-selection');
  return { ...rect };
}
export const center = (rect: Rect): Point => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
export function intersectionOverUnion(a: Rect, b: Rect): number {
  const area = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return area / (a.width * a.height + b.width * b.height - area);
}
export function rotation(landmarks: readonly Point[] | null): number {
  if (!landmarks || landmarks.length !== 5) return 0;
  const left = landmarks[0]!; const right = landmarks[1]!;
  return Math.atan2(right.y - left.y, right.x - left.x);
}
export function cssToSource(point: Point, bounds: { left: number; top: number; width: number; height: number }, width: number, height: number): Point | null {
  const scale = Math.min(bounds.width / width, bounds.height / height);
  if (!(scale > 0)) return null;
  const x = (point.x - bounds.left - (bounds.width - width * scale) / 2) / scale;
  const y = (point.y - bounds.top - (bounds.height - height * scale) / 2) / scale;
  return x >= 0 && y >= 0 && x <= width && y <= height ? { x, y } : null;
}
