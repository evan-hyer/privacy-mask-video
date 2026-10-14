import { Input, BlobSource, MP4, WEBM, VideoSampleSink } from 'mediabunny';
import type { InputVideoTrack, InputAudioTrack, WrappedCanvas, Rotation } from 'mediabunny';
import { failure, sanitized } from '../core/errors';
import { validateFile, validateMedia } from '../core/limits';
import { toUs } from './timeline';
import type { TrackDescriptor } from './types';
// CanvasSink resizes samples to the track's initial metadata dimensions. Validate
// each decoded sample first so a changing-resolution stream cannot be stretched.
class ValidatedCanvasSink {
  private pool:OffscreenCanvas[]=[];
  private index=0;
  constructor(private track:InputVideoTrack,private width:number,private height:number,private rotation:Rotation,private flip:boolean) {}
  async *canvases():AsyncGenerator<WrappedCanvas,void,unknown> {
    for await(const sample of new VideoSampleSink(this.track).samples()) {
      let frame:WrappedCanvas;
      try {
        const [width,height]=this.rotation%180===0?[sample.squarePixelWidth,sample.squarePixelHeight]:[sample.squarePixelHeight,sample.squarePixelWidth];
        if(width!==this.width||height!==this.height)throw failure('unsupported-input');
        const index=this.index++%2;
        const canvas=this.pool[index]??(this.pool[index]=new OffscreenCanvas(this.width,this.height));
        const context=canvas.getContext('2d')!;
        context.fillStyle='#000';context.fillRect(0,0,this.width,this.height);
        sample.drawWithFit(context,{fit:'fill',rotation:this.rotation,flip:this.flip});
        frame={canvas,timestamp:sample.timestamp,duration:sample.duration};
      } finally {sample.close();}
      yield frame;
    }
  }
}
export interface OpenVideo { input:Input; video:InputVideoTrack; audio:InputAudioTrack[]; sink:ValidatedCanvasSink; width:number; height:number; durationUs:number; originUs:number; container:'mp4'|'webm'; videoDescriptor:TrackDescriptor; audioDescriptors:TrackDescriptor[] }
export async function openVideo(file:File):Promise<OpenVideo> {
  validateFile(file);
  const input=new Input({source:new BlobSource(file),formats:[MP4,WEBM]});
  try {
    const format=await input.getFormat(); const container=format===MP4?'mp4':format===WEBM?'webm':null;
    if(!container) throw failure('unsupported-input');
    const videoTracks=await input.getVideoTracks(),audio=await input.getAudioTracks();
    if(videoTracks.length!==1) throw failure('unsupported-input');
    const video=videoTracks[0]!;
    const config=await video.getDecoderConfig();
    if(!config || !await video.canDecode()) throw failure('unsupported-input');
    const width=await video.getDisplayWidth(),height=await video.getDisplayHeight();
    const descriptors:TrackDescriptor[]=[];
    const first=toUs(await video.getFirstTimestamp()); const end=toUs(await video.computeDuration());
    const videoDescriptor={codec:(await video.getCodec())??'',config,firstTimestampUs:first,endTimestampUs:end};
    for(const track of audio) {
      const audioConfig=await track.getDecoderConfig(),codec=await track.getCodec();
      if(!audioConfig || !codec) throw failure('unsupported-input');
      descriptors.push({codec,config:audioConfig,firstTimestampUs:toUs(await track.getFirstTimestamp()),endTimestampUs:toUs(await track.computeDuration())});
    }
    const originUs=Math.min(first,...descriptors.map(track=>track.firstTimestampUs));
    const endUs=Math.max(end,...descriptors.map(track=>track.endTimestampUs)); const durationUs=endUs-originUs;
    validateMedia(width,height,durationUs);
    if(end<=first || descriptors.some(track=>track.endTimestampUs<=track.firstTimestampUs)) throw failure('unsupported-input');
    return {input,video,audio,sink:new ValidatedCanvasSink(video,width,height,await video.getRotation(),await video.getFlip()),width,height,durationUs,originUs,container,videoDescriptor,audioDescriptors:descriptors};
  } catch(error) { input.dispose(); throw sanitized(error,'unsupported-input'); }
}
export async function initialFrame(media:OpenVideo):Promise<WrappedCanvas> {
  const iterator=media.sink.canvases();
  try {
    const first=await iterator.next(); if(first.done) throw failure('no-valid-frame');
    if(first.value.canvas.width!==media.width||first.value.canvas.height!==media.height) throw failure('unsupported-input');
    // The canvas pool remains valid after iterator cleanup; snapshot before using a new iterator.
    return first.value;
  } finally { await iterator.return(); }
}
