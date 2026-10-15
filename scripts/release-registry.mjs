import { readFile, appendFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { waitForRegistryVersion } from './registry-visibility.mjs';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const tag = `v${pkg.version}`;
if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== tag) {
  throw new Error('Release tag must match package.json version');
}
const packOutput = JSON.parse(await readFile('pack.json', 'utf8'));
const pack = Array.isArray(packOutput) ? packOutput[0] : packOutput[pkg.name];
if (!pack || pack.name !== pkg.name || pack.version !== pkg.version || pack.filename !== `${pkg.name}-${pkg.version}.tgz`) {
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
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000), cache: 'no-store' });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Registry lookup failed: ${response.status}`);
    return response.json();
  }
  let published = await registryVersion();
  if (!published && process.env.RELEASE_MODE === 'stage') {
    const result = spawnSync('npm', ['stage', 'publish', `./${pack.filename}`, '--access', 'public', '--provenance', '--ignore-scripts'], { stdio: 'inherit' });
    if (result.status !== 0) throw new Error('npm staging failed');
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, 'status=staged\n');
    if (process.env.GITHUB_STEP_SUMMARY) {
      await appendFile(process.env.GITHUB_STEP_SUMMARY, `Staged ${pkg.name}@${pkg.version}; maintainer must approve with 2FA on npmjs.com. Not yet published.\n`);
    }
    process.exit(0);
  }
  if (!published) {
    const result = spawnSync('npm', ['publish', `./${pack.filename}`, '--access', 'public', '--provenance', '--ignore-scripts', '--fetch-retries=0', '--fetch-timeout=300000'], { stdio: 'inherit' });
    if (result.status !== 0) throw new Error('npm publication failed');
    published = await waitForRegistryVersion(registryVersion);
  }
  if (published?.dist?.integrity !== integrity) throw new Error('Published version does not match this archive');
  console.log(`Verified ${pkg.name}@${pkg.version} registry integrity`);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, 'status=published\n');
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `Published and verified ${pkg.name}@${pkg.version}. Runtime qualification remains deferred.\n`);
  }
} else throw new Error('Expected prepare or publish');
