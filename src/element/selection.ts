import { cssToSource } from '../core/geometry';
import type { Point, Rect } from '../core/types';
export function sourcePoint(canvas: HTMLCanvasElement, event: PointerEvent): Point | null {
  return cssToSource({ x: event.clientX, y: event.clientY }, canvas.getBoundingClientRect(), canvas.width, canvas.height);
}
export function drawnRegion(start: Point, end: Point): Rect { return { x: Math.min(start.x,end.x), y: Math.min(start.y,end.y), width: Math.abs(end.x-start.x), height: Math.abs(end.y-start.y) }; }
