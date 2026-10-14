import { readFile, appendFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const tag = `v${pkg.version}`;
if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== tag) {
  throw new Error('Release tag must match package.json version');
}
const pack = JSON.parse(await readFile('pack.json', 'utf8'))[0];
if (pack.name !== pkg.name || pack.version !== pkg.version || pack.filename !== `${pkg.name}-${pkg.version}.tgz`) {
  throw new Error('Unexpected release archive');
}
const bytes = await readFile(pack.filename);
const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
if (integrity !== pack.integrity) throw new Error('Archive integrity mismatch');
if (process.argv[2] === 'prepare') {
  console.log(`Prepared ${pkg.name}@${pkg.version}: ${bytes.length} bytes`);
} else if (process.argv[2] === 'publish') {
  const url = `https://registry.npmjs.org/${encodeURIComponent(pkg.name)}/${pkg.version}`;
  async function registryVersion() {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Registry lookup failed: ${response.status}`);
    return response.json();
  }
  let published = await registryVersion();
  if (!published) {
    const result = spawnSync('npm', ['publish', pack.filename, '--access', 'public', '--provenance', '--ignore-scripts', '--fetch-retries=0', '--fetch-timeout=300000'], { stdio: 'inherit' });
    if (result.status !== 0) throw new Error('npm publication failed');
    published = await registryVersion();
  }
  if (published?.dist?.integrity !== integrity) throw new Error('Published version does not match this archive');
  console.log(`Verified ${pkg.name}@${pkg.version} registry integrity`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `Published and verified ${pkg.name}@${pkg.version}. Runtime qualification remains deferred.\n`);
  }
} else throw new Error('Expected prepare or publish');
