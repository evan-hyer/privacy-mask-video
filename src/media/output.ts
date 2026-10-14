import { canEncodeVideo, canEncodeAudio, Output, Mp4OutputFormat, WebMOutputFormat, CanvasSource, StreamTarget } from 'mediabunny';
import type { VideoCodec, AudioCodec } from 'mediabunny';
import type { OpenVideo } from './input';
import type { OutputRoute, AudioRoute } from './types';
import { LIMITS } from '../core/limits';
import { failure } from '../core/errors';
import { toSeconds } from './timeline';
export async function negotiate(media:OpenVideo):Promise<OutputRoute> {
  const seconds=media.durationUs/1e6;
  const budget=Math.floor(LIMITS.outputBytes*.8*8/seconds-media.audio.length*128_000);
  if(budget<400_000) throw failure('resource-limit');
  const videoBitrate=Math.min(8_000_000,Math.max(500_000,media.width*media.height*3),budget);
  const possibilities: {container:'mp4'|'webm';videoCodec:VideoCodec;audioCodec:AudioCodec}[]=[{container:'mp4',videoCodec:'avc',audioCodec:'aac'},{container:'webm',videoCodec:'vp9',audioCodec:'opus'},{container:'webm',videoCodec:'vp8',audioCodec:'opus'}];
  for(const possibility of possibilities) {
    if(!await canEncodeVideo(possibility.videoCodec,{width:media.width,height:media.height,bitrate:videoBitrate})) continue;
    const audio:AudioRoute[]=[]; let supported=true;
    for(const track of media.audio) {
      const codec=await track.getCodec(); const numberOfChannels=await track.getNumberOfChannels(),sampleRate=await track.getSampleRate();
      if(!Number.isSafeInteger(numberOfChannels)||numberOfChannels<=0||!Number.isSafeInteger(sampleRate)||sampleRate<=0) throw failure('unsupported-input');
      const mode=codec===possibility.audioCodec?'copy':'transcode';
      if(mode==='transcode'&&(!await track.canDecode()||!await canEncodeAudio(possibility.audioCodec,{numberOfChannels,sampleRate,bitrate:128_000}))) {supported=false;break;}
      audio.push({mode,codec:possibility.audioCodec,numberOfChannels,sampleRate});
    }
    const format=possibility.container==='mp4'?new Mp4OutputFormat({fastStart:false}):new WebMOutputFormat();
    const counts=format.getSupportedTrackCounts();
    if(supported && media.audio.length<=counts.audio.max && counts.video.max>=1 && media.audio.length+1<=counts.total.max) return {container:possibility.container,videoCodec:possibility.videoCodec,videoBitrate,audio,mimeType:format.mimeType,extension:format.fileExtension};
  }
  throw failure('unsupported-export');
}
class BoundedMemory {
  private readonly segmentSize=64*1024;
  private segments=new Map<number,Uint8Array<ArrayBuffer>>();
  private length=0;
  write(data:Uint8Array,position:number):void {
    const end=position+data.length;
    if(!Number.isSafeInteger(position)||position<0||!Number.isSafeInteger(end)||end>LIMITS.outputBytes) throw failure('resource-limit');
    this.length=Math.max(this.length,end);
    for(let offset=0;offset<data.length;) {
      const absolute=position+offset,index=Math.floor(absolute/this.segmentSize),within=absolute%this.segmentSize;
      let segment=this.segments.get(index); if(!segment) { segment=new Uint8Array(this.segmentSize); this.segments.set(index,segment); }
      const count=Math.min(data.length-offset,this.segmentSize-within); segment.set(data.subarray(offset,offset+count),within); offset+=count;
    }
  }
  blob(type:string):Blob {
    if(!this.length) throw failure('encode-failed');
    const parts:Uint8Array<ArrayBuffer>[]=[];
    for(let start=0;start<this.length;start+=this.segmentSize) { const segment=this.segments.get(start/this.segmentSize)??new Uint8Array(this.segmentSize); parts.push(segment.subarray(0,Math.min(this.segmentSize,this.length-start))); }
    const blob=new Blob(parts,{type}); this.clear(); return blob;
  }
  clear():void { this.segments.clear(); this.length=0; }
}
export class ExportWriter {
  readonly output:Output;
  private readonly memory=new BoundedMemory();
  private readonly video:CanvasSource;
  constructor(canvas:OffscreenCanvas,private route:OutputRoute) {
    const stream=new WritableStream({write:(chunk:{data:Uint8Array;position:number})=>this.memory.write(chunk.data,chunk.position)});
    this.output=new Output({format:route.container==='mp4'?new Mp4OutputFormat({fastStart:false}):new WebMOutputFormat(),target:new StreamTarget(stream)});
    this.video=new CanvasSource(canvas,{codec:route.videoCodec,bitrate:route.videoBitrate}); this.output.addVideoTrack(this.video);
  }
  async add(timestampUs:number,durationUs:number):Promise<void> { await this.video.add(toSeconds(timestampUs),toSeconds(durationUs)); }
  finishVideo():void { this.video.close(); }
  async finalize():Promise<Blob> { this.video.close(); await this.output.finalize(); return this.memory.blob(this.route.mimeType); }
  async abort():Promise<void> { try { await this.output.cancel(); } finally { this.memory.clear(); } }
}
export function outputFilename(input:string,extension:string):string {
  const stem=input.replace(/\.[^.]*$/,'').replace(/[^a-zA-Z0-9_-]/g,'_').replace(/^_+/,'').slice(0,80)||'video';
  return `${stem}-masked${extension.startsWith('.')?'':'.'}${extension}`;
}
