/// <reference lib="webworker" />
import { isMessage, incoming, closePayload } from './protocol';
import type { Message, MessageType } from './protocol';
import { initializeVision } from '../vision/runtime';
import type { VisionRuntime } from '../vision/runtime';
import { failure, sanitized, abortError } from '../core/errors';
import { validRect, validateRegion } from '../core/geometry';
import { openVideo, initialFrame } from '../media/input';
import type { OpenVideo } from '../media/input';
import { negotiate, ExportWriter, outputFilename } from '../media/output';
import type { SourceVideo } from '../media/types';
import { AudioPump } from '../media/audio';
import { toUs, frameTime } from '../media/timeline';
import { YuNet } from '../vision/yunet';
import { SFace, imagePixels } from '../vision/sface';
import { Association } from '../vision/association';
import { PROFILE, profileHash } from '../vision/profile';
import { LossCollector } from '../vision/loss';
import { drawMask } from '../render/mask';
import { PreviewGate } from '../render/preview';
import { canEncodeVideo, canEncodeAudio } from 'mediabunny';
declare const self: DedicatedWorkerGlobalScope;
let runtime:VisionRuntime|null=null;
let active:Message|null=null;
let canceled=false;
let trackingProfileHash='';
let previews:PreviewGate|null=null;
let owner:string|null=null;
function reply<K extends MessageType>(request:Message,type:K,payload:Message<K>['payload'],transfer:Transferable[]=[]):void {
  self.postMessage({protocolVersion:1,instanceId:request.instanceId,generation:request.generation,jobId:request.jobId,type,payload},transfer);
}
function check():void { if(canceled) throw abortError(); }
async function load(request:Message<'LOAD'>):Promise<void> {
  if(!runtime) throw failure('invalid-state');
  const media=await openVideo(request.payload.file);
  try {
    check(); const route=await negotiate(media); check();
    const frame=await initialFrame(media); check();
    const candidates=await new YuNet(runtime.detector).detect(frame.canvas,request.payload.sourceId); check();
    const bitmap=await createImageBitmap(frame.canvas);
    if(canceled) {bitmap.close();check();}
    const source:SourceVideo={sourceId:request.payload.sourceId,file:request.payload.file,displayWidth:media.width,displayHeight:media.height,durationUs:media.durationUs,container:media.container,audioTrackCount:media.audio.length,timelineOriginUs:media.originUs,videoTrack:media.videoDescriptor,audioTracks:media.audioDescriptors,initialFrameTimeUs:toUs(frame.timestamp)-media.originUs,initialCandidates:candidates,outputRoute:route};
    reply(request,'LOADED',{source,bitmap},[bitmap]);
  } finally {media.input.dispose();}
}
async function run(request:Message<'RUN'>):Promise<void> {
  if(!runtime) {request.payload.emojiBitmap.close();throw failure('invalid-state');}
  const {source,selection,emojiBitmap,settingsRevision}=request.payload;
  let media:OpenVideo|null=null,writer:ExportWriter|null=null,audio:AudioPump|null=null,association:Association|null=null;
  try {
    if(source.sourceId!==selection.sourceId||!validRect(selection.initialRect)||!Number.isFinite(selection.initialRotationRad)||!Number.isSafeInteger(settingsRevision)||!(emojiBitmap instanceof ImageBitmap)) throw failure('invalid-selection');
    if(selection.initialLandmarks && (selection.initialLandmarks.length!==5||!selection.initialLandmarks.every(point=>Number.isFinite(point.x)&&Number.isFinite(point.y)))) throw failure('invalid-selection');
    media=await openVideo(source.file); check();
    if(media.width!==source.displayWidth||media.height!==source.displayHeight||media.originUs!==source.timelineOriginUs||media.durationUs!==source.durationUs||media.audio.length!==source.audioTrackCount||media.container!==source.container) throw failure('unsupported-input');
    if(selection.kind==='manual') validateRegion(selection.initialRect,media.width,media.height);
    else if(selection.kind!=='detected'||!selection.initialLandmarks) throw failure('invalid-selection');
    const route=await negotiate(media); check();
    if(JSON.stringify(route)!==JSON.stringify(source.outputRoute)) throw failure('unsupported-export');
    const canvas=new OffscreenCanvas(media.width,media.height),context=canvas.getContext('2d')!;
    writer=new ExportWriter(canvas,route); audio=new AudioPump(media.originUs,media.audio,route.audio,writer.output);
    await audio.initialize(media.audio); await writer.output.start(); await audio.prime(check); check();
    const detector=new YuNet(runtime.detector),recognizer=new SFace(runtime.recognition);
    association=new Association(selection,recognizer,trackingProfileHash);
    const losses=new LossCollector(); previews=new PreviewGate();
    let frameCount=0,previousTime=-1,endUs=0,lastProgress=-Infinity,lastTracking='';
    for await(const frame of media.sink.canvases()) {
      check();
      if(frame.canvas.width!==media.width||frame.canvas.height!==media.height) throw failure('unsupported-input');
      const timing=frameTime(frame.timestamp,frame.duration,media.originUs,previousTime);
      if(frameCount===0&&timing.timestampUs!==source.initialFrameTimeUs) throw failure('unsupported-input');
      const image=imagePixels(frame.canvas);
      if(frameCount===0) await association.initialize(image);
      const faces=await detector.detect(frame.canvas,source.sourceId); check();
      const tracking=await association.track(image,faces,frameCount,timing.timestampUs,timing.durationUs); check();
      context.drawImage(frame.canvas,0,0); drawMask(context,tracking.rect,tracking.rotationRad,{emojiBitmap,backingColor:PROFILE.backing,paddingRatio:PROFILE.coveragePadding});
      losses.append(tracking);
      await writer.add(timing.timestampUs,timing.durationUs); check();
      endUs=timing.timestampUs+timing.durationUs;
      await audio.advance(endUs,check); check();
      frameCount++; previousTime=timing.timestampUs;
      const trackingKey=`${tracking.status}:${tracking.reason}`;
      if(lastTracking!==trackingKey) {lastTracking=trackingKey;reply(request,'TRACKING',{status:tracking.status,reason:tracking.reason,timestampUs:timing.timestampUs});}
      const now=performance.now();
      if(now-lastProgress>=500) {lastProgress=now;reply(request,'PROGRESS',{stage:'processing',processedFrames:frameCount,timestampUs:timing.timestampUs,durationUs:source.durationUs,ratio:Math.min(.98,endUs/source.durationUs*.98)});}
      const sequence=previews.next(now);
      if(sequence!==null) {
        const bitmap=await createImageBitmap(canvas);
        if(canceled) {bitmap.close();check();}
        reply(request,'PREVIEW',{bitmap,sequence,timestampUs:timing.timestampUs},[bitmap]);
      }
      await new Promise<void>(resolve=>setTimeout(resolve,0));
    }
    if(frameCount===0) throw failure('no-valid-frame');
    writer.finishVideo();
    reply(request,'PROGRESS',{stage:'finalizing',processedFrames:frameCount,timestampUs:endUs,durationUs:source.durationUs,ratio:.99});
    await audio.advance(Infinity,check); await audio.close(); audio=null; check();
    const blob=await writer.finalize(); writer=null; check();
    reply(request,'COMPLETE',{blob,filename:outputFilename(source.file.name,route.extension),mimeType:route.mimeType,width:source.displayWidth,height:source.displayHeight,durationUs:source.durationUs,frameCount,audioTrackCount:source.audioTrackCount,lostIntervals:losses.intervals,sourceId:source.sourceId,settingsRevision});
  } finally {
    emojiBitmap.close(); association?.dispose(); previews=null;
    try {await audio?.close();} finally {try {await writer?.abort();} finally {media?.input.dispose();}}
  }
}
self.onmessage=(event:MessageEvent<unknown>):void=>{
  const request=event.data;
  if(!isMessage(request)||!incoming.has(request.type)||owner!==null&&request.instanceId!==owner) {closePayload(request);return;}
  if(request.type==='CANCEL') {if(active?.jobId===request.jobId&&active.generation===request.generation)canceled=true;return;}
  if(request.type==='PREVIEW_ACK') {if(active?.jobId===request.jobId&&active.generation===request.generation)previews?.acknowledge(request.payload.sequence);return;}
  if(request.type==='RESET') {return;}
  if(request.type==='DISPOSE') {canceled=true;void runtime?.release().finally(()=>self.close());return;}
  if(active) {closePayload(request);reply(request,'ERROR',{code:'invalid-state',message:failure('invalid-state').message,recoverable:true});return;}
  active=request;owner=request.instanceId;canceled=false;
  void(async()=>{
    try {
      if(request.type==='INIT') {
        await runtime?.release();runtime=null;runtime=await initializeVision(request.payload);check();
        trackingProfileHash=await profileHash(request.payload.modelHashes,request.payload.runtimeVersion);
        const videoCodecs:string[]=[],audioCodecs:string[]=[];
        for(const codec of ['avc','vp9','vp8'] as const)if(await canEncodeVideo(codec,{width:1280,height:720,bitrate:2_000_000}))videoCodecs.push(codec);
        for(const codec of ['aac','opus'] as const)if(await canEncodeAudio(codec,{numberOfChannels:2,sampleRate:48000,bitrate:128_000}))audioCodecs.push(codec);
        check();reply(request,'READY',{ready:true,webCodecs:typeof VideoEncoder!=='undefined'&&typeof VideoDecoder!=='undefined',offscreenCanvas:true,wasm:true,videoCodecs,audioCodecs});
      } else if(request.type==='LOAD') await load(request);
      else if(request.type==='RUN') await run(request);
    } catch(error) {
      if(!canceled) {const safe=sanitized(error,request.type==='INIT'?'asset-load-failed':request.type==='LOAD'?'decode-failed':'encode-failed');reply(request,'ERROR',{code:safe.code,message:safe.message,recoverable:safe.recoverable});}
    } finally {if(canceled)reply(request,'CANCELED',null);active=null;}
  })();
};
