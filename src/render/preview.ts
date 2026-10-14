export class PreviewGate {
  private pending:number|null=null;
  private previousTime=-Infinity;
  private sequence=0;
  next(now:number):number|null {
    if(this.pending!==null||now-this.previousTime<200) return null;
    this.previousTime=now; this.pending=++this.sequence; return this.pending;
  }
  acknowledge(sequence:number):void { if(this.pending===sequence) this.pending=null; }
}
