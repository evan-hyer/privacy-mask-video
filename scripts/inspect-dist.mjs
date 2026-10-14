import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { containedPath, projectRoot, verifyBytes } from './integrity.mjs';
const root=containedPath(projectRoot,'dist');
const required=['index.js','define.js','index.d.ts','define.d.ts','workers/pipeline.worker.js','demo/index.html','demo/embed.html','assets/manifest.json','THIRD_PARTY_NOTICES.txt'];
for(const file of required)if(!(await stat(containedPath(root,file))).size)throw new Error(`Missing/empty distribution file: ${file}`);
const manifest=JSON.parse(await readFile(containedPath(root,'assets/manifest.json'),'utf8'));
for(const entry of manifest.entries)verifyBytes(await readFile(containedPath(root,`assets/${entry.path}`)),entry);
const worker=await readFile(containedPath(root,'workers/pipeline.worker.js'));
verifyBytes(worker,{...manifest.worker,path:'workers/pipeline.worker.js'});
const workerFiles=(await readdir(containedPath(root,'workers'))).filter(file=>file.endsWith('.js'));
if(workerFiles.length!==1)throw new Error('Worker has unexpected separate JavaScript chunks');
const workerText=worker.toString('utf8');
if(/(?:import|export)\s[^;\n]{0,150}\sfrom\s*["']/.test(workerText))throw new Error('Worker contains unresolved static module imports');
if(workerText.includes('data:application/wasm;base64,'))throw new Error('Worker unexpectedly embeds a WASM binary');
for(const filename of (await readdir(root)).filter(file=>file.endsWith('.js'))) {
  const source=await readFile(containedPath(root,filename),'utf8');
  for(const match of source.matchAll(/(?:from|import)\s*["']([^"']+)["']/g)) {
    const dependency=match[1];
    if(!dependency.startsWith('./'))throw new Error('Browser distribution contains a bare or external module import');
    await stat(containedPath(root,dependency));
  }
}
console.log(`Distribution verified: ESM entries, declarations, demos, ${manifest.entries.length} pinned assets/notices, one ${worker.length}-byte worker with resident runtime overrides.`);
console.log('This is artifact inspection only; runtime testing remains deferred.');
