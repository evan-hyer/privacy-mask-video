import { Tensor } from 'onnxruntime-web/wasm';
import type { InferenceSession } from 'onnxruntime-web/wasm';
import type { Point } from '../core/types';
import { failure } from '../core/errors';
const TEMPLATE: readonly Point[] = [{x:38.2946,y:51.6963},{x:73.5318,y:51.5014},{x:56.0252,y:71.7366},{x:41.5493,y:92.3655},{x:70.7299,y:92.2041}];
export function imagePixels(canvas: OffscreenCanvas | HTMLCanvasElement): ImageData {
  const context=canvas.getContext('2d',{willReadFrequently:true}) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if(!context) throw failure('tracking-failed');
  return context.getImageData(0,0,canvas.width,canvas.height);
}
export function pixel(image: ImageData,x: number,y: number,channel: number): number {
  const ix=Math.floor(x); const iy=Math.floor(y); const fx=x-ix; const fy=y-iy;
  const at=(px:number,py:number):number => px<0||py<0||px>=image.width||py>=image.height ? 0 : image.data[(py*image.width+px)*4+channel]!;
  return at(ix,iy)*(1-fx)*(1-fy)+at(ix+1,iy)*fx*(1-fy)+at(ix,iy+1)*(1-fx)*fy+at(ix+1,iy+1)*fx*fy;
}
export function alignFace(image: ImageData, landmarks: readonly Point[]): Float32Array {
  if(landmarks.length!==5 || !landmarks.every(point=>Number.isFinite(point.x)&&Number.isFinite(point.y))) throw failure('tracking-failed');
  const mean=(points:readonly Point[]):Point => ({x:points.reduce((sum,p)=>sum+p.x,0)/5,y:points.reduce((sum,p)=>sum+p.y,0)/5});
  const source=mean(landmarks); const destination=mean(TEMPLATE);
  let dot=0,cross=0,variance=0;
  for(let i=0;i<5;i++) { const sx=landmarks[i]!.x-source.x,sy=landmarks[i]!.y-source.y; const dx=TEMPLATE[i]!.x-destination.x,dy=TEMPLATE[i]!.y-destination.y; dot+=sx*dx+sy*dy; cross+=sx*dy-sy*dx; variance+=sx*sx+sy*sy; }
  if(variance<1e-8) throw failure('tracking-failed');
  const a=dot/variance,b=cross/variance,determinant=a*a+b*b;
  if(determinant<1e-8) throw failure('tracking-failed');
  const tx=destination.x-a*source.x+b*source.y,ty=destination.y-b*source.x-a*source.y;
  const data=new Float32Array(3*112*112);
  for(let y=0;y<112;y++) for(let x=0;x<112;x++) {
    const sx=(a*(x-tx)+b*(y-ty))/determinant,sy=(-b*(x-tx)+a*(y-ty))/determinant;
    for(let channel=0;channel<3;channel++) data[channel*112*112+y*112+x]=pixel(image,sx,sy,channel);
  }
  return data;
}
export class SFace {
  private image: ImageData | null = null;
  private descriptions = new WeakMap<readonly Point[], Float32Array>();
  constructor(private session: InferenceSession) {}
  async describe(image: ImageData,landmarks: readonly Point[]): Promise<Float32Array> {
    if(this.image!==image) {this.image=image;this.descriptions=new WeakMap();}
    const cached=this.descriptions.get(landmarks);if(cached)return cached;
    const tensor=new Tensor('float32',alignFace(image,landmarks),[1,3,112,112]);
    const outputs=await this.session.run({data:tensor}).finally(()=>tensor.dispose());
    try {
      const output=outputs[this.session.outputNames[0]!]!; const values=output.data as Float32Array;
      let squared=0; for(const value of values) squared+=value*value;
      const norm=Math.sqrt(squared); if(!Number.isFinite(norm)||norm<1e-8) throw failure('tracking-failed');
      const description=Float32Array.from(values,value=>value/norm);this.descriptions.set(landmarks,description);return description;
    } finally { for(const output of Object.values(outputs)) output.dispose(); }
  }
}
export function cosine(a:Float32Array,b:Float32Array):number {
  if(a.length!==b.length) return -1; let score=0;
  for(let i=0;i<a.length;i++) score+=a[i]!*b[i]!;
  return score;
}
