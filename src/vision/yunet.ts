import { Tensor } from 'onnxruntime-web/wasm';
import type { InferenceSession } from 'onnxruntime-web/wasm';
import type { FaceCandidate } from './types';
import { intersectionOverUnion, validRect } from '../core/geometry';
import { PROFILE } from './profile';
import { failure } from '../core/errors';
export class YuNet {
  private canvas = new OffscreenCanvas(640,640);
  private context = this.canvas.getContext('2d',{willReadFrequently:true})!;
  constructor(private session: InferenceSession) {}
  async detect(source: OffscreenCanvas | HTMLCanvasElement, sourceId: string): Promise<FaceCandidate[]> {
    const ratio = Math.min(640/source.width,640/source.height);
    const scaledWidth = Math.max(1,Math.round(source.width*ratio)); const scaledHeight = Math.max(1,Math.round(source.height*ratio));
    const sx=scaledWidth/source.width; const sy=scaledHeight/source.height;
    this.context.fillStyle='#000'; this.context.fillRect(0,0,640,640); this.context.drawImage(source,0,0,scaledWidth,scaledHeight);
    const rgba=this.context.getImageData(0,0,640,640).data;
    const inputData=new Float32Array(3*640*640); const plane=640*640;
    for(let i=0;i<plane;i++) { inputData[i]=rgba[i*4+2]!; inputData[i+plane]=rgba[i*4+1]!; inputData[i+2*plane]=rgba[i*4]!; }
    const tensor=new Tensor('float32',inputData,[1,3,640,640]);
    const outputs=await this.session.run({input:tensor}).finally(() => tensor.dispose());
    try {
      const candidates: (FaceCandidate & { order:number })[]=[]; let order=0;
      for(const stride of [8,16,32]) {
        const cls=outputs[`cls_${stride}`]?.data as Float32Array | undefined;
        const obj=outputs[`obj_${stride}`]?.data as Float32Array | undefined;
        const boxes=outputs[`bbox_${stride}`]?.data as Float32Array | undefined;
        const keypoints=outputs[`kps_${stride}`]?.data as Float32Array | undefined;
        if(!cls || !obj || !boxes || !keypoints) throw failure('tracking-failed');
        const cols=640/stride;
        for(let row=0;row<cols;row++) for(let col=0;col<cols;col++,order++) {
          const index=row*cols+col;
          const confidence=Math.sqrt(Math.min(1,Math.max(0,cls[index]!))*Math.min(1,Math.max(0,obj[index]!)));
          if(confidence<PROFILE.detectorConfidence) continue;
          const width=Math.exp(boxes[index*4+2]!)*stride/sx; const height=Math.exp(boxes[index*4+3]!)*stride/sy;
          const cx=(col+boxes[index*4]!)*stride/sx; const cy=(row+boxes[index*4+1]!)*stride/sy;
          const rect={x:cx-width/2,y:cy-height/2,width,height};
          if(!validRect(rect) || rect.x+width<=0 || rect.y+height<=0 || rect.x>=source.width || rect.y>=source.height) continue;
          const landmarks=Array.from({length:5},(_,point) => ({x:(col+keypoints[index*10+point*2]!)*stride/sx,y:(row+keypoints[index*10+point*2+1]!)*stride/sy}));
          if(!landmarks.every(point => Number.isFinite(point.x)&&Number.isFinite(point.y))) continue;
          candidates.push({id:'',sourceId,rect,landmarks,confidence,order});
        }
      }
      candidates.sort((a,b) => b.confidence-a.confidence || a.order-b.order);
      const kept: typeof candidates=[];
      for(const candidate of candidates.slice(0,PROFILE.topK)) if(!kept.some(face => intersectionOverUnion(face.rect,candidate.rect)>PROFILE.nms)) kept.push(candidate);
      kept.sort((a,b) => a.rect.x-b.rect.x || a.rect.y-b.rect.y || a.rect.width-b.rect.width || a.rect.height-b.rect.height || a.order-b.order);
      return kept.map(({order:_,...face},index) => ({...face,id:`${sourceId}:face:${index}`}));
    } finally { for(const output of Object.values(outputs)) output.dispose(); }
  }
}
