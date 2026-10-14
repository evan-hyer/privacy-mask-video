import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { projectRoot, containedPath, verifyFile } from './integrity.mjs';
import { onnxSignature } from './onnx-signature.mjs';

export async function verifyAssets() {
  const root = containedPath(projectRoot, 'assets');
  const manifest = JSON.parse(await readFile(containedPath(root, 'manifest.json'), 'utf8'));
  const pkg = JSON.parse(await readFile(containedPath(projectRoot, 'package.json'), 'utf8'));
  const runtime = JSON.parse(await readFile(containedPath(projectRoot, 'node_modules/onnxruntime-web/package.json'), 'utf8'));
  if (manifest.schemaVersion !== 1 || manifest.runtimeVersion !== pkg.dependencies['onnxruntime-web'] || runtime.version !== manifest.runtimeVersion) {
    throw new Error('Asset manifest/runtime/package version mismatch');
  }
  if (!manifest.entries?.length) throw new Error('Asset manifest is empty');
  const paths = new Set();
  const kinds = new Set();
  for (const entry of manifest.entries) {
    if (paths.has(entry.path)) throw new Error('Duplicate asset path');
    paths.add(entry.path);
    kinds.add(entry.kind);
    if (!entry.revision || !entry.license || !entry.notice) throw new Error(`Missing provenance: ${entry.path}`);
    containedPath(root, entry.notice);
    const bytes = await verifyFile(root, entry);
    if (entry.kind === 'model' && JSON.stringify(onnxSignature(bytes)) !== JSON.stringify(entry.tensors)) {
      throw new Error(`Tensor signature mismatch: ${entry.path}`);
    }
  }
  for (const kind of ['model', 'runtime-module', 'runtime-wasm', 'font', 'emoji-sequences', 'license']) {
    if (!kinds.has(kind)) throw new Error(`Missing required asset kind: ${kind}`);
  }
  for (const entry of manifest.entries) {
    if (!paths.has(entry.notice)) throw new Error(`Notice is not integrity-verified: ${entry.path}`);
  }
  await readFile(containedPath(projectRoot, 'THIRD_PARTY_NOTICES.txt'));
  console.log(`Verified ${manifest.entries.length} pinned assets, model tensors, runtime ${manifest.runtimeVersion}, and license files.`);
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await verifyAssets();
}
