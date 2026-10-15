import { expect, it } from 'vitest';
import { resolveTrackingConflicts } from '../../src/vision/multi-target';
import type { FrameTrackingResult } from '../../src/vision/types';
import { diagnosed, failure } from '../../src/core/errors';
import { isDiagnostic } from '../../src/core/diagnostics';

const frame = (selectionId:string,candidateId:string):FrameTrackingResult => ({frameIndex:2,timestampUs:100,durationUs:50,status:'acquired',reason:null,rect:{x:50,y:0,width:10,height:10},rotationRad:0,landmarks:null,geometrySource:'measured',selectionId,profileHash:'test',candidateId});
const holder = (x:number) => ({hold:(tracking:FrameTrackingResult):FrameTrackingResult=>({...tracking,status:'lost',reason:'ambiguous',geometrySource:'held',rect:{x,y:0,width:10,height:10},candidateId:null})});

it('holds both previous masks when two selected targets claim the same face', () => {
  const results=resolveTrackingConflicts([frame('a','face-1'),frame('b','face-1')],[holder(0),holder(100)]);
  expect(results.map(result=>[result.status,result.rect.x])).toEqual([['lost',0],['lost',100]]);
});
it('keeps independent measured targets and leaves an unselected face alone', () => {
  const proposed=[frame('a','face-1'),frame('b','face-3')];
  expect(resolveTrackingConflicts(proposed,[holder(0),holder(100)])).toEqual(proposed);
});
it('preserves HTTP stage details and never copies private exception text', () => {
  const original=failure('asset-load-failed',{stage:'assets',reason:'http',resource:'emoji/1f60e.png',httpStatus:404});
  expect(diagnosed(original,'asset-load-failed',{stage:'runtime',reason:'initialization'})).toBe(original);
  const safe=diagnosed(new Error('private-file-name.mp4 and private stack'),'asset-load-failed',{stage:'detector',reason:'initialization'});
  expect(JSON.stringify(safe)).not.toContain('private');
  expect(isDiagnostic({stage:'assets',reason:'network',resource:'private-file-name.mp4'})).toBe(false);
});
