import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const revision='e20cbc2bbec1926686be9f9bee7d1d2cfa1fea0e';
const manifest=JSON.parse(await readFile('assets/manifest.json','utf8'));
const sequences=JSON.parse(await readFile('assets/emoji/sequences.json','utf8')).sequences;
manifest.entries=manifest.entries.filter(entry=>entry.kind!=='font'&&entry.kind!=='emoji-image');
await mkdir('assets/emoji',{recursive:true});
for(const emoji of sequences){
 const hex=Array.from(emoji,char=>char.codePointAt(0).toString(16)).join('_');
 const path='emoji/'+hex+'.png';const url='https://raw.githubusercontent.com/googlefonts/noto-emoji/'+revision+'/2D/png/128/emoji_u'+hex+'.png';
 const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(60000)});if(!response.ok)throw new Error('PNG source failed: '+response.status);
 const bytes=Buffer.from(await response.arrayBuffer());
 if(bytes.readUInt32BE(16)!==128||bytes.readUInt32BE(20)!==128)throw new Error('Unexpected emoji dimensions');
 await writeFile('assets/'+path,bytes);
 manifest.entries.push({path,kind:'emoji-image',url,revision,license:'Apache-2.0',notice:'licenses/noto-source.txt',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
await writeFile('assets/manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log('Pinned '+sequences.length+' cross-browser emoji PNGs');
