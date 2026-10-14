import { EncodedPacketSink, EncodedAudioPacketSource, AudioSampleSink, AudioSampleSource } from 'mediabunny';
import type { AudioSample, EncodedPacket, InputAudioTrack, Output } from 'mediabunny';
import type { AudioRoute } from './types';
import { toUs, toSeconds } from './timeline';
import { failure } from '../core/errors';
type Pump = { iterator:AsyncGenerator<EncodedPacket|AudioSample,void,unknown>; source:EncodedAudioPacketSource|AudioSampleSource; config:AudioDecoderConfig; next:IteratorResult<EncodedPacket|AudioSample,void>|null; copy:boolean; first:boolean };
export class AudioPump {
  private pumps:Pump[]=[];
  constructor(private originUs:number,tracks:InputAudioTrack[],routes:AudioRoute[],private output:Output) {
    if(tracks.length!==routes.length) throw failure('unsupported-export');
    tracks.forEach((track,index)=>{
      const route=routes[index]!;
      const source=route.mode==='copy'?new EncodedAudioPacketSource(route.codec):new AudioSampleSource({codec:route.codec,bitrate:128_000});
      output.addAudioTrack(source);
      this.pumps.push({iterator:route.mode==='copy'?new EncodedPacketSink(track).packets():new AudioSampleSink(track).samples(),source,config:null as unknown as AudioDecoderConfig,next:null,copy:route.mode==='copy',first:true});
    });
  }
  async initialize(tracks:InputAudioTrack[]):Promise<void> {
    for(let i=0;i<this.pumps.length;i++) { const pump=this.pumps[i]!; const config=await tracks[i]!.getDecoderConfig(); if(!config) throw failure('unsupported-export'); pump.config=config; pump.next=await pump.iterator.next(); if(pump.next.done)throw failure('unsupported-input'); }
  }
  private async writeNext(pump:Pump,check:()=>void):Promise<void> {
    if(!pump.next||pump.next.done)return;
    check();const item=pump.next.value,timestampUs=toUs(item.timestamp)-this.originUs;
    if(timestampUs<0)throw failure('unsupported-input');
    if(pump.copy)await (pump.source as EncodedAudioPacketSource).add((item as EncodedPacket).clone({timestamp:toSeconds(timestampUs)}),pump.first?{decoderConfig:pump.config}:undefined);
    else {const sample=item as AudioSample;try{sample.setTimestamp(toSeconds(timestampUs));await (pump.source as AudioSampleSource).add(sample);}finally{sample.close();}}
    pump.first=false;pump.next=null;pump.next=await pump.iterator.next();
    if(pump.next.done)pump.source.close();
  }
  async prime(check:()=>void):Promise<void> {
    // Signal each track's first timestamp even if its audio starts later. This
    // prevents muxers from retaining all earlier video while awaiting metadata.
    for(const pump of this.pumps)await this.writeNext(pump,check);
  }
  async advance(untilUs:number,check:()=>void):Promise<void> {
    for(const pump of this.pumps) {
      while(pump.next && !pump.next.done && toUs(pump.next.value.timestamp)-this.originUs<untilUs) {
        await this.writeNext(pump,check);
      }
      if(pump.next?.done) pump.source.close();
    }
  }
  async close():Promise<void> {
    for(const pump of this.pumps) {
      if(!pump.copy && pump.next&&!pump.next.done) (pump.next.value as AudioSample).close();
      try { await pump.iterator.return(); } finally { if(this.output.state!=='pending')pump.source.close(); }
    }
    this.pumps=[];
  }
}
