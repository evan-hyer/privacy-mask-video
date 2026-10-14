import { build } from 'vite';
import { cp, mkdir, access, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { verifyAssets } from './verify-assets.mjs';
import { projectRoot, sha256 } from './integrity.mjs';

export async function buildDistribution(root = projectRoot) {
  // Missing source entries are a failure, never an empty successful distribution.
  for (const entry of ['src/index.ts', 'src/define.ts', 'src/worker/pipeline.worker.ts', 'demo/index.html']) {
    await access(path.join(root, entry));
  }
  const output = path.join(root, 'dist');
  await build({
    configFile: path.join(projectRoot, 'vite.config.ts'),
    root,
    build: {
      outDir: output,
      lib: {
        entry: { index: path.join(root, 'src/index.ts'), define: path.join(root, 'src/define.ts') },
        formats: ['es'],
        fileName: (_format, entry) => `${entry}.js`,
      },
    },
  });
  await build({
  configFile: false,
  root,
  resolve: { conditions:['onnxruntime-web-use-extern-wasm','module','browser','production'] },
  publicDir: false,
  build: {
    target: 'es2022',
    outDir: path.join(output, 'workers'),
    emptyOutDir: true,
    lib: {
      entry: path.join(root, 'src/worker/pipeline.worker.ts'),
      formats: ['es'],
      fileName: () => 'pipeline.worker.js',
    },
    rolldownOptions: { output: { codeSplitting: false } },
  },
  });
  const tsc = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url));
  const declarations = spawnSync(process.execPath, [tsc, '--project', path.join(root, 'tsconfig.json'), '--emitDeclarationOnly', '--outDir', output], { stdio: 'inherit' });
  if (declarations.status !== 0) throw new Error('Declaration generation failed');
  await mkdir(output, { recursive: true });
  await cp(path.join(root, 'assets'), path.join(output, 'assets'), { recursive: true });
  const manifestPath = path.join(output,'assets/manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath,'utf8'));
  const workerBytes = await readFile(path.join(output,'workers/pipeline.worker.js'));
  manifest.worker = { size:workerBytes.length,sha256:sha256(workerBytes) };
  await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
  await cp(path.join(root, 'demo'), path.join(output, 'demo'), { recursive: true });
  await cp(path.join(root, 'THIRD_PARTY_NOTICES.txt'), path.join(output, 'THIRD_PARTY_NOTICES.txt'));
  await writeFile(path.join(output,'.npmignore'),'**/*.map\n**/*.tmp\n**/*.tgz\n.env*\n.npmrc\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await verifyAssets();
  await buildDistribution();
}
