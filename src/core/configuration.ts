import { failure } from './errors';
export const EMOJIS = Object.freeze(['😎','😀','😂','🤣','😃','😄','😁','😅','😆','😇','😈','😉','😊','😋','😍','🤐','🤖','👽','👻','🐱','🐶','🧑‍💻']);
export const DEFAULT_EMOJI = '😎';
export interface ComponentConfiguration { emoji: string; disabled: boolean; assetBase: string }
export function validateEmoji(value: unknown): string {
  if (typeof value !== 'string' || !EMOJIS.includes(value)) throw failure('invalid-emoji');
  return value;
}
export function assetDirectory(value: string, base: string): string {
  if(typeof value!=='string'||!value)throw failure('invalid-configuration');
  let url: URL;
  try { url = new URL(value, base); } catch { throw failure('invalid-configuration'); }
  if (url.origin !== new URL(base).origin || !['http:', 'https:'].includes(url.protocol) || url.search || url.hash || url.username || url.password) throw failure('invalid-configuration');
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.href;
}
