import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { containedPath, projectRoot, verifyBytes } from './integrity.mjs';
import { verifyAssets } from './verify-assets.mjs';

const root = containedPath(projectRoot, 'assets');
const manifest = JSON.parse(await readFile(containedPath(root, 'manifest.json'), 'utf8'));
for (const entry of manifest.entries) {
  const destination = containedPath(root, entry.path);
  try {
    verifyBytes(await readFile(destination), entry);
    continue;
  } catch (error) {
    // Existing mismatched files are rejected; preparation never blesses new bytes.
    if (error.code !== 'ENOENT') throw error;
  }
  let bytes;
  if (entry.localSource) {
    bytes = await readFile(containedPath(projectRoot, entry.localSource));
  } else if (entry.url) {
    const url = new URL(entry.url);
    if (url.protocol !== 'https:' || !url.pathname.includes(entry.revision)) throw new Error('Unpinned asset URL');
    const response = await fetch(url, { signal: AbortSignal.timeout(120_000), redirect: 'error' });
    if (!response.ok) throw new Error(`Asset request failed (${response.status}): ${entry.path}`);
    bytes = Buffer.from(await response.arrayBuffer());
  } else throw new Error(`Non-downloadable checked-in asset is missing: ${entry.path}`);
  verifyBytes(bytes, entry);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(`${destination}.tmp`, bytes);
  await rename(`${destination}.tmp`, destination);
  console.log(`Prepared ${entry.path}`);
}
await verifyAssets();
