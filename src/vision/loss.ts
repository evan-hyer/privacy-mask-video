import type { LossInterval } from '../core/types';
import type { FrameTrackingResult } from './types';
export class LossCollector {
  readonly intervals:LossInterval[]=[];
  append(frame:FrameTrackingResult):void {
    if(frame.status!=='lost'||!frame.reason) return;
    const previous=this.intervals.at(-1);
    if(previous&&previous.endUs===frame.timestampUs) { previous.endUs=frame.timestampUs+frame.durationUs; if(!previous.reasons.includes(frame.reason)) previous.reasons.push(frame.reason); }
    else this.intervals.push({startUs:frame.timestampUs,endUs:frame.timestampUs+frame.durationUs,reasons:[frame.reason]});
  }
}
