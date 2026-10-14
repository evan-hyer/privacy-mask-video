// Maintainer-only initial lock generation. Normal preparation uses manifest hashes.
// Changing these revisions requires review and repeating model/font qualification.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { projectRoot, sha256, containedPath, verifyBytes } from './integrity.mjs';
import { onnxSignature } from './onnx-signature.mjs';
import { appendRuntimeNotices } from './lock-runtime-notices.mjs';

const zoo = '47534e27c9851bb1128ccc0102f1145e27f23f98';
const noto = 'e20cbc2bbec1926686be9f9bee7d1d2cfa1fea0e';
const runtimeVersion = '1.30.0';
const root = containedPath(projectRoot, 'assets');
const entries = [];
async function request(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Pinned source failed: ${response.status} ${url}`);
  return Buffer.from(await response.arrayBuffer());
}
async function add(entry, bytes) {
  const destination = containedPath(root, entry.path);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
  entries.push({ ...entry, size: bytes.length, sha256: sha256(bytes), ...(entry.kind === 'model' ? { tensors: onnxSignature(bytes) } : {}) });
  console.log(`Pinned ${entry.path} (${bytes.length} bytes)`);
}
async function remote(entry) { await add(entry, await request(entry.url)); }
const raw = (repo, revision, file) => `https://raw.githubusercontent.com/${repo}/${revision}/${file}`;
for (const [dir, filename, license] of [
  ['face_detection_yunet', 'face_detection_yunet_2023mar.onnx', 'MIT'],
  ['face_recognition_sface', 'face_recognition_sface_2021dec.onnx', 'Apache-2.0'],
]) {
  const source = `models/${dir}/${filename}`;
  const pointer = (await request(raw('opencv/opencv_zoo', zoo, source))).toString('utf8');
  const expectedHash = pointer.match(/oid sha256:([a-f0-9]{64})/)?.[1];
  const expectedSize = Number(pointer.match(/size (\d+)/)?.[1]);
  if (!expectedHash || !expectedSize) throw new Error('Expected pinned Git LFS integrity pointer');
  const url = `https://media.githubusercontent.com/media/opencv/opencv_zoo/${zoo}/${source}`;
  const bytes = await request(url);
  verifyBytes(bytes, { path: filename, size: expectedSize, sha256: expectedHash });
  const notice = `licenses/${dir}.txt`;
  await add({ path: `models/${filename}`, kind: 'model', url, revision: zoo, license, notice }, bytes);
  await remote({ path: notice, kind: 'license', url: raw('opencv/opencv_zoo', zoo, `models/${dir}/LICENSE`), revision: zoo, license, notice });
}
const runtimeNotice = 'licenses/onnxruntime.txt';
await remote({ path: runtimeNotice, kind: 'license', url: raw('microsoft/onnxruntime', `v${runtimeVersion}`, 'LICENSE'), revision: `v${runtimeVersion}`, license: 'MIT', notice: runtimeNotice });
for (const [filename, kind] of [['ort-wasm-simd-threaded.mjs', 'runtime-module'], ['ort-wasm-simd-threaded.wasm', 'runtime-wasm']]) {
  const localSource = `node_modules/onnxruntime-web/dist/${filename}`;
  await add({ path: `runtime/${filename}`, kind, localSource, revision: runtimeVersion, license: 'MIT', notice: runtimeNotice }, await readFile(containedPath(projectRoot, localSource)));
}
const fontNotice = 'licenses/noto-emoji.txt';
await remote({ path: fontNotice, kind: 'license', url: raw('googlefonts/noto-emoji', noto, '2D/fonts/LICENSE'), revision: noto, license: 'OFL-1.1', notice: fontNotice });
await remote({ path: 'emoji/NotoColorEmoji.ttf', kind: 'font', url: raw('googlefonts/noto-emoji', noto, '2D/fonts/NotoColorEmoji.ttf'), revision: noto, license: 'OFL-1.1', notice: fontNotice });
// v1 deliberately supports this finite reviewed set, including joined sequences.
// The source SVG for each sequence establishes its presence in this font revision.
const candidates = ['1f60e', '1f600', '1f602', '1f923', '1f603', '1f604', '1f601', '1f605', '1f606', '1f607', '1f608', '1f609', '1f60a', '1f60b', '1f60d', '1f910', '1f916', '1f47d', '1f47b', '1f431', '1f436', '1f9d1_200d_1f4bb'];
const sequences = [];
for (const hex of candidates) {
  await request(raw('googlefonts/noto-emoji', noto, `2D/svg/emoji_u${hex}.svg`));
  sequences.push(String.fromCodePoint(...hex.split('_').map(part => parseInt(part, 16))));
}
await add({ path: 'emoji/sequences.json', kind: 'emoji-sequences', revision: noto, license: 'Apache-2.0', notice: 'licenses/noto-source.txt' }, Buffer.from(`${JSON.stringify({ schemaVersion: 1, fontRevision: noto, default: '😎', sequences }, null, 2)}\n`));
await remote({ path: 'licenses/noto-source.txt', kind: 'license', url: raw('googlefonts/noto-emoji', noto, 'LICENSE'), revision: noto, license: 'Apache-2.0', notice: 'licenses/noto-source.txt' });
await add({ path: 'licenses/mediabunny.txt', kind: 'license', localSource: 'node_modules/mediabunny/LICENSE', revision: '1.61.4', license: 'MPL-2.0', notice: 'licenses/mediabunny.txt' }, await readFile(containedPath(projectRoot, 'node_modules/mediabunny/LICENSE')));
await appendRuntimeNotices(entries,root);
await writeFile(containedPath(root, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, runtimeVersion, entries }, null, 2)}\n`);
