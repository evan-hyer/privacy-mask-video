// Maintainer-only: lock upstream notices from already locked package sources.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { projectRoot, sha256 } from './integrity.mjs';
export async function appendRuntimeNotices(entries,root) {
  const lock=JSON.parse(await readFile(path.join(projectRoot,'package-lock.json'),'utf8'));
  const names=['flatbuffers','long','platform','protobufjs','@protobufjs/aspromise','@protobufjs/base64','@protobufjs/codegen','@protobufjs/eventemitter','@protobufjs/fetch','@protobufjs/float','@protobufjs/path','@protobufjs/pool','@protobufjs/utf8'];
  for(const name of names) {
    const metadata=lock.packages[`node_modules/${name}`];
    const localSource=`node_modules/${name}/LICENSE`;
    const bytes=await readFile(path.join(projectRoot,localSource));
    const notice=`licenses/${name.replaceAll('/','-').replace('@','')}.txt`;
    await mkdir(path.join(root,'licenses'),{recursive:true});
    await writeFile(path.join(root,notice),bytes);
    const entry={path:notice,kind:'license',localSource,revision:metadata.version,license:metadata.license,notice,size:bytes.length,sha256:sha256(bytes)};
    const index=entries.findIndex(candidate=>candidate.path===notice);
    if(index>=0)entries[index]=entry;else entries.push(entry);
  }
  const revision='v1.30.0';
  const url=`https://raw.githubusercontent.com/microsoft/onnxruntime/${revision}/ThirdPartyNotices.txt`;
  const response=await fetch(url,{signal:AbortSignal.timeout(60_000),redirect:'error'});
  if(!response.ok)throw new Error(`ORT third-party notices request failed (${response.status})`);
  const bytes=Buffer.from(await response.arrayBuffer());
  const notice='licenses/onnxruntime-dependencies.txt';
  await writeFile(path.join(root,notice),bytes);
  const entry={path:notice,kind:'license',url,revision,license:'upstream-third-party-notices',notice,size:bytes.length,sha256:sha256(bytes)};
  const index=entries.findIndex(candidate=>candidate.path===notice);if(index>=0)entries[index]=entry;else entries.push(entry);
}
if(process.argv[1]&&path.resolve(process.argv[1])===import.meta.filename) {
  const root=path.join(projectRoot,'assets'),filename=path.join(root,'manifest.json');
  const manifest=JSON.parse(await readFile(filename,'utf8'));
  await appendRuntimeNotices(manifest.entries,root);
  await writeFile(filename,JSON.stringify(manifest,null,2)+'\n');
  console.log('Locked runtime dependency notices.');
}
