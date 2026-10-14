import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { containedPath, sha256, verifyBytes, projectRoot } from '../../scripts/integrity.mjs';
import { verifyFixtures } from '../../scripts/verify-fixtures.mjs';
import { buildDistribution } from '../../scripts/build.mjs';
import { createDistServer } from '../../scripts/serve-dist.mjs';

const temporaryRoots: string[] = [];
async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'pmv-infrastructure-'));
  temporaryRoots.push(root);
  return root;
}
async function put(root: string, relative: string, content: string): Promise<void> {
  const filename = path.join(root, relative);
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, content);
}
afterEach(async () => {
  // Only these explicitly created temporary roots are removed.
  for (const root of temporaryRoots.splice(0)) {
    if (path.dirname(root) !== path.resolve(tmpdir()) || !path.basename(root).startsWith('pmv-infrastructure-')) throw new Error('Unsafe temporary cleanup path');
    await rm(root, { recursive: true, force: true });
  }
});

describe('integrity and fixture gates', () => {
  it('rejects changed bytes, incorrect sizes, and escaping resource paths', () => {
    const bytes = Buffer.from('pinned source');
    const entry = { path: 'model.onnx', size: bytes.length, sha256: sha256(bytes) };
    verifyBytes(bytes, entry);
    expect(() => verifyBytes(Buffer.from('changed data!'), entry)).toThrow('Integrity mismatch');
    expect(() => verifyBytes(bytes, { ...entry, size: 1 })).toThrow('Integrity mismatch');
    expect(() => containedPath(projectRoot, '../outside')).toThrow();
    expect(() => containedPath(projectRoot, 'nested/../../outside')).toThrow();
    expect(() => containedPath(projectRoot, 'C:\\outside')).toThrow();
  });

  it('fails explicitly when a required real-face corpus is missing', async () => {
    const root = await temporaryRoot();
    await put(root, 'manifest.json', JSON.stringify({ schemaVersion: 1, status: 'incomplete', entries: [] }));
    await expect(verifyFixtures(root)).rejects.toThrow('T005');
  });

  it('rejects identical media allocated to calibration and acceptance', async () => {
    const root = await temporaryRoot();
    const content = 'local synthetic timing fixture';
    await put(root, 'calibration/sample.mp4', content);
    await put(root, 'acceptance/sample.mp4', content);
    const entries = ['calibration', 'acceptance'].map(split => ({
      split, path: `${split}/sample.mp4`, size: content.length, sha256: sha256(Buffer.from(content)),
      mediaKind: 'synthetic-timing', recordingId: split, scenarios: ['mp4'],
      provenance: { source: 'generated locally', license: 'CC0-1.0', rightsEvidence: 'author generated' },
    }));
    await put(root, 'manifest.json', JSON.stringify({ schemaVersion: 1, status: 'complete', entries }));
    await expect(verifyFixtures(root)).rejects.toThrow('leakage');
  });
});

it('serves root/nested modules, correct MIME, ranges and HEAD; denies escaping paths', async () => {
  const root = await temporaryRoot();
  await put(root, 'demo/index.html', '<!doctype html>');
  await put(root, 'index.js', 'export const value = 1;');
  await put(root, 'assets/test.wasm', 'wasm');
  await put(root, 'assets/test.ttf', 'font');
  await put(root, 'assets/test.mp4', '0123456789');
  const server = createDistServer(root);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test port');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    expect((await fetch(`${base}/`)).status).toBe(200);
    const nested = await fetch(`${base}/nested/components/privacy-mask-video/index.js`);
    expect(await nested.text()).toBe('export const value = 1;');
    expect(nested.headers.get('content-type')).toContain('text/javascript');
    expect(nested.headers.has('cross-origin-embedder-policy')).toBe(false);
    expect((await fetch(`${base}/assets/test.wasm`)).headers.get('content-type')).toBe('application/wasm');
    expect((await fetch(`${base}/assets/test.ttf`)).headers.get('content-type')).toBe('font/ttf');
    const range = await fetch(`${base}/assets/test.mp4`, { headers: { Range: 'bytes=2-5' } });
    expect(range.status).toBe(206);
    expect(range.headers.get('content-range')).toBe('bytes 2-5/10');
    expect(await range.text()).toBe('2345');
    expect((await fetch(`${base}/assets/test.mp4`, { headers: { Range: 'bytes=30-' } })).status).toBe(416);
    const head = await fetch(`${base}/index.js`, { method: 'HEAD' });
    expect(head.headers.get('content-length')).toBe(String(Buffer.byteLength('export const value = 1;')));
    expect(await head.text()).toBe('');
    expect((await fetch(`${base}/%2e%2e%2foutside`)).status).toBe(400);
    expect((await fetch(`${base}/index.js`, { method: 'POST' })).status).toBe(405);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

it('builds ESM/declarations/assets and one worker bundle using isolated tooling inputs', async () => {
  const root = await temporaryRoot();
  // These are compiler probes, not a mock component or inference acceptance test.
  await put(root, 'src/index.ts', 'export const buildProbe: number = 1;');
  await put(root, 'src/define.ts', 'import { buildProbe } from "./index"; export const autoProbe = buildProbe;');
  await put(root, 'src/worker/extra.ts', 'export const value = 42;');
  await put(root, 'src/worker/pipeline.worker.ts', 'export async function probe() { return (await import("./extra")).value; }');
  await put(root, 'demo/index.html', '<script type="module" src="../define.js"></script>');
  await put(root, 'assets/manifest.json', '{"toolingProbe":true}');
  await put(root, 'THIRD_PARTY_NOTICES.txt', 'Tooling probe only');
  await cp(path.join(projectRoot, 'tsconfig.json'), path.join(root, 'tsconfig.json'));
  await buildDistribution(root);
  const output = path.join(root, 'dist');
  for (const entry of ['index.js', 'define.js', 'index.d.ts', 'define.d.ts', 'workers/pipeline.worker.js', 'assets/manifest.json', 'demo/index.html', 'THIRD_PARTY_NOTICES.txt']) {
    expect((await readFile(path.join(output, entry))).length).toBeGreaterThan(0);
  }
  const worker = await readFile(path.join(output, 'workers/pipeline.worker.js'), 'utf8');
  expect(worker).not.toMatch(/import\s*\(/);
  expect(worker).not.toMatch(/https?:\/\/|["']\/\//);
}, 60_000);
