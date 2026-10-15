import { validateEmoji, emojiResource } from '../core/configuration';
import { failure, diagnosed } from '../core/errors';
export async function emojiBitmap(emoji: string, images: ReadonlyMap<string, Uint8Array>): Promise<ImageBitmap> {
  validateEmoji(emoji);
  const resource = emojiResource(emoji), bytes = images.get(emoji);
  if (!bytes) throw failure('asset-load-failed',{stage:'emoji',reason:'integrity',resource});
  try {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes).buffer],{type:'image/png'}));
    if (bitmap.width !== 128 || bitmap.height !== 128) { bitmap.close(); throw failure('asset-integrity-failed',{stage:'emoji',reason:'integrity',resource}); }
    return bitmap;
  } catch(error) { throw diagnosed(error,'asset-load-failed',{stage:'emoji',reason:'decode',resource}); }
}
