import { center } from '../core/geometry';
import type { Rect } from '../core/types';
export interface MaskSettings { emojiBitmap: ImageBitmap; backingColor: string; paddingRatio: number }
export function drawMask(context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, rect: Rect, rotationRad: number, settings: MaskSettings): void {
  const point = center(rect);
  const radius = Math.hypot(rect.width, rect.height) * (0.5 + settings.paddingRatio);
  const side = Math.max(rect.width, rect.height) * 1.65;
  context.save();
  context.translate(point.x, point.y);
  context.fillStyle = settings.backingColor;
  context.beginPath(); context.arc(0,0,radius,0,Math.PI * 2); context.fill();
  context.rotate(rotationRad);
  context.drawImage(settings.emojiBitmap, -side/2, -side/2, side, side);
  context.restore();
}
