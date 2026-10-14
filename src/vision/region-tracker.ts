import type { Rect } from '../core/types';
import { center, intersectionOverUnion } from '../core/geometry';
import { pixel } from './sface';
import { PROFILE } from './profile';
function patch(image:ImageData,rect:Rect,roll:number):Float32Array {
  const data=new Float32Array(PROFILE.manualSize**2); const point=center(rect); const cos=Math.cos(roll),sin=Math.sin(roll);
  for(let y=0;y<PROFILE.manualSize;y++) for(let x=0;x<PROFILE.manualSize;x++) {
    const px=((x+.5)/PROFILE.manualSize-.5)*rect.width,py=((y+.5)/PROFILE.manualSize-.5)*rect.height;
    const sx=point.x+cos*px-sin*py,sy=point.y+sin*px+cos*py;
    data[y*PROFILE.manualSize+x]=.299*pixel(image,sx,sy,0)+.587*pixel(image,sx,sy,1)+.114*pixel(image,sx,sy,2);
  }
  return data;
}
function normalize(data:Float32Array):{data:Float32Array;variance:number} {
  const mean=data.reduce((sum,value)=>sum+value,0)/data.length;
  let square=0; for(let i=0;i<data.length;i++) { data[i]=data[i]!-mean; square+=data[i]!*data[i]!; }
  const length=Math.sqrt(square); if(length>0) for(let i=0;i<data.length;i++) data[i]=data[i]!/length;
  return {data,variance:square/data.length};
}
export class RegionTracker {
  private readonly template: Float32Array;
  private readonly textured: boolean;
  constructor(image:ImageData,rect:Rect) { const reference=normalize(patch(image,rect,0)); this.template=reference.data; this.textured=reference.variance>=PROFILE.minimumTemplateVariance; }
  match(image:ImageData,rect:Rect,roll:number,elapsedUs:number): {rect:Rect;rotationRad:number;score:number} | null {
    if(!this.textured) return null;
    const radius=Math.max(rect.width,rect.height)*Math.min(.75,.25+elapsedUs/1_000_000);
    const candidates:{rect:Rect;rotationRad:number;score:number}[]=[];
    for(const scale of PROFILE.manualScales) for(const dx of PROFILE.manualOffsets) for(const dy of PROFILE.manualOffsets) for(const delta of PROFILE.manualRolls) {
      const middle=center(rect); const width=rect.width*scale,height=rect.height*scale;
      const candidate={x:middle.x+dx*radius-width/2,y:middle.y+dy*radius-height/2,width,height};
      const normalized=normalize(patch(image,candidate,roll+delta)); if(normalized.variance<PROFILE.minimumTemplateVariance) continue;
      let score=0; for(let i=0;i<this.template.length;i++) score+=this.template[i]!*normalized.data[i]!;
      candidates.push({rect:candidate,rotationRad:roll+delta,score});
    }
    candidates.sort((a,b)=>b.score-a.score);
    const best=candidates[0]; if(!best || best.score<PROFILE.manualScore) return null;
    const alternative=candidates.find(candidate=>intersectionOverUnion(candidate.rect,best.rect)<.5);
    return alternative && best.score-alternative.score<PROFILE.manualMargin ? null : best;
  }
}
