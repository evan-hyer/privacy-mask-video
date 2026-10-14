import { validateEmoji } from '../core/configuration';
import { failure } from '../core/errors';
export async function emojiBitmap(emoji: string, fontFamily: string): Promise<ImageBitmap> {
  validateEmoji(emoji);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context || !document.fonts.check(`192px "${fontFamily}"`, emoji)) throw failure('asset-load-failed');
  context.font = `192px "${fontFamily}"`; context.textAlign = 'center'; context.textBaseline = 'middle';
  context.fillText(emoji, 128, 132);
  return createImageBitmap(canvas);
}
