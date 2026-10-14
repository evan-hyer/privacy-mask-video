import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const projectRoot = path.resolve(import.meta.dirname, '..');

export function containedPath(root, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || relative.includes('\\')) {
    throw new Error('Invalid resource path');
  }
  const resolved = path.resolve(root, relative);
  if (!resolved.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error('Resource path escapes its root');
  return resolved;
}

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function verifyBytes(bytes, entry) {
  if (!Number.isSafeInteger(entry.size) || entry.size <= 0 || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
    throw new Error(`Missing integrity metadata: ${entry.path}`);
  }
  if (bytes.length !== entry.size || sha256(bytes) !== entry.sha256) {
    throw new Error(`Integrity mismatch: ${entry.path}`);
  }
}

export async function verifyFile(root, entry) {
  const bytes = await readFile(containedPath(root, entry.path));
  verifyBytes(bytes, entry);
  return bytes;
}
