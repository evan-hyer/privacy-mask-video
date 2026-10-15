import type { Point, Rect } from '../core/types';
import type { TargetSelection, FaceCandidate, FrameTrackingResult } from './types';
import { center, intersectionOverUnion, rotation } from '../core/geometry';
import { SFace, cosine } from './sface';
import { RegionTracker } from './region-tracker';
import { PROFILE } from './profile';
export class Association {
  private anchor: Float32Array | null = null;
  private manual: RegionTracker | null = null;
  private rect: Rect;
  private roll: number;
  private lastTime=0;
  private history: {rect:Rect;time:number}[]=[];
  private lost=false;
  private referenceGeometry:{rect:Rect;landmarks:readonly Point[]}|null=null;
  constructor(private selection:TargetSelection,private recognizer:SFace,private hash:string) { this.rect={...selection.initialRect}; this.roll=selection.initialRotationRad; }
  async initialize(image:ImageData):Promise<void> {
    this.lastTime=this.selection.firstSeenUs ?? 0;
    if(this.selection.initialLandmarks) { this.anchor=this.selection.embedding?.slice() ?? await this.recognizer.describe(image,this.selection.initialLandmarks); this.referenceGeometry={rect:{...this.rect},landmarks:this.selection.initialLandmarks.map(point=>({...point}))}; }
    else this.manual=new RegionTracker(image,this.rect);
  }
  async track(image:ImageData,faces:FaceCandidate[],frameIndex:number,timestampUs:number,durationUs:number,commit=true):Promise<FrameTrackingResult> {
    let rect:Rect|null=null,landmarks:Point[]|null=null,roll=this.roll,candidateId:string|null=null;
    let reason:FrameTrackingResult['reason']='no-candidate';
    if(timestampUs===(this.selection.firstSeenUs ?? 0) || frameIndex===0 && this.selection.firstSeenUs===undefined) { rect={...this.selection.initialRect}; landmarks=this.selection.initialLandmarks; candidateId=faces.find(face=>intersectionOverUnion(face.rect,this.selection.initialRect)>.9)?.id ?? this.selection.candidateId; }
    else if(this.anchor) {
      const elapsed=Math.max(0,timestampUs-this.lastTime)/1e6;
      const expected=center(this.rect); const recent=this.history.at(-1),older=this.history.at(-2);
      if(recent&&older&&recent.time>older.time&&!this.lost) { const c1=center(recent.rect),c0=center(older.rect); const horizon=Math.min(elapsed,.25)*1e6/(recent.time-older.time); expected.x+=(c1.x-c0.x)*horizon; expected.y+=(c1.y-c0.y)*horizon; }
      const scores:{face:FaceCandidate;score:number;eligible:boolean}[]=[];
      for(const face of faces) {
        const reference=this.referenceGeometry;
        let shapeOK=true;
        if(reference) {
          const oldSize=Math.hypot(reference.rect.width,reference.rect.height),newSize=Math.hypot(face.rect.width,face.rect.height);
          for(let i=0;i<5;i++) for(let j=i+1;j<5;j++) {
            const oldDistance=Math.hypot(reference.landmarks[i]!.x-reference.landmarks[j]!.x,reference.landmarks[i]!.y-reference.landmarks[j]!.y)/oldSize;
            const newDistance=Math.hypot(face.landmarks[i]!.x-face.landmarks[j]!.x,face.landmarks[i]!.y-face.landmarks[j]!.y)/newSize;
            if(oldDistance<1e-6||newDistance<1e-6||Math.max(oldDistance/newDistance,newDistance/oldDistance)>PROFILE.landmarkRatioLimit)shapeOK=false;
          }
        }
        if(!shapeOK) continue;
        const score=cosine(this.anchor,await this.recognizer.describe(image,face.landmarks));
        const point=center(face.rect); const scale=Math.max(face.rect.width/this.rect.width,this.rect.width/face.rect.width,face.rect.height/this.rect.height,this.rect.height/face.rect.height);
        const distance=Math.hypot(point.x-expected.x,point.y-expected.y)/Math.max(this.rect.width,this.rect.height);
        const radius=PROFILE.motionRadius+Math.min(elapsed,3)*PROFILE.motionGrowthPerSecond;
        scores.push({face,score,eligible:this.lost || (scale<=PROFILE.maxScaleRatio && distance<=radius)});
      }
      // The runner-up includes spatially rejected faces, so position cannot hide ambiguity.
      scores.sort((a,b)=>b.score-a.score);
      const best=scores[0],runnerUp=scores[1]; const threshold=this.lost?PROFILE.reacquireSimilarity:PROFILE.similarity; const margin=this.lost?PROFILE.reacquireMargin:PROFILE.margin;
      if(best && best.eligible && best.score>=threshold && (!runnerUp||best.score-runnerUp.score>=margin)) { candidateId=best.face.id; rect=best.face.rect; landmarks=best.face.landmarks.map(point=>({...point})); roll=rotation(landmarks); }
      else reason=best&&best.score>=threshold?'ambiguous':faces.length?'occluded-or-out-of-frame':'no-candidate';
    } else if(this.manual && (!this.lost || timestampUs-this.lastTime<=PROFILE.manualReacquireUs)) {
      const match=this.manual.match(image,this.rect,this.roll,timestampUs-this.lastTime);
      if(match && (!this.lost || match.score>=PROFILE.manualReacquireScore)) {
        rect=match.rect; roll=match.rotationRad;
        const agreeing=faces.filter(face=>intersectionOverUnion(face.rect,match.rect)>.65);
        if(agreeing.length===1) { const face=agreeing[0]!; candidateId=face.id; this.anchor=await this.recognizer.describe(image,face.landmarks); this.referenceGeometry={rect:{...face.rect},landmarks:face.landmarks.map(point=>({...point}))}; rect=face.rect; landmarks=face.landmarks.map(point=>({...point})); roll=rotation(landmarks); }
      } else reason='weak-manual-match';
    } else reason='weak-manual-match';
    const acquired=rect!==null;
    const tracking:FrameTrackingResult={frameIndex,timestampUs,durationUs,status:acquired?'acquired':'lost',reason:acquired?null:reason,rect:acquired?{...rect!}:{...this.rect},rotationRad:acquired?roll:this.roll,landmarks:acquired?landmarks:null,geometrySource:acquired?'measured':'held',selectionId:this.selection.selectionId,profileHash:this.hash,candidateId};
    if(commit)this.commit(tracking);
    return tracking;
  }
  hold(tracking:FrameTrackingResult):FrameTrackingResult { return {...tracking,status:'lost',reason:'ambiguous',rect:{...this.rect},rotationRad:this.roll,landmarks:null,geometrySource:'held',candidateId:null}; }
  commit(tracking:FrameTrackingResult):void {
    if(tracking.status==='acquired') { this.rect={...tracking.rect};this.roll=tracking.rotationRad;this.lastTime=tracking.timestampUs;this.history.push({rect:{...this.rect},time:tracking.timestampUs});if(this.history.length>2)this.history.shift(); }
    this.lost=tracking.status==='lost';
  }
  dispose():void { this.anchor=null; this.referenceGeometry=null; this.manual=null; this.history=[]; }
}
