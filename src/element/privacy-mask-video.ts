import { template } from './template';
import { emojiBitmap } from './emoji';
import { sourcePoint, drawnRegion } from './selection';
import { faceColor } from './face-colors';
import { drawMask } from '../render/mask';
import { ProcessingSession } from '../core/session';
import { ResidentAssets } from '../core/assets';
import { WorkerClient } from '../core/worker-client';
import { platformCapabilities } from '../core/capabilities';
import { DEFAULT_EMOJI, EMOJIS, validateEmoji, assetDirectory } from '../core/configuration';
import { validateFile } from '../core/limits';
import { rotation, validateRegion } from '../core/geometry';
import { abortError, failure, sanitized } from '../core/errors';
import { snapshot } from '../core/types';
import type { CancelReason, CapabilityReport, ComponentState, ExportResult, FaceSummary, LossReason, Point, Rect, SourceSummary } from '../core/types';
import type { Message } from '../worker/protocol';
import type { SourceVideo } from '../media/types';

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve,reject) => {
    const cancel = (): void => reject(abortError()); signal.addEventListener('abort',cancel,{ once:true });
    promise.then(resolve,reject).finally(() => signal.removeEventListener('abort',cancel));
  });
}
let instanceCounter = 0;
const LOSS_LABELS:Record<LossReason,string>={'no-candidate':'No face match','ambiguous':'Face match uncertain','occluded-or-out-of-frame':'No confident target match','weak-manual-match':'Manual match too weak'};
export class PrivacyMaskVideoElement extends HTMLElement {
  static get observedAttributes(): string[] { return ['emoji','disabled','asset-base']; }
  private readonly instanceId = globalThis.crypto?.randomUUID?.() ?? `pmv-${++instanceCounter}`;
  private readonly session = new ProcessingSession();
  private assets: ResidentAssets | null = null;
  private client: WorkerClient | null = null;
  private runtimeController: AbortController | null = null;
  private initialization: Promise<CapabilityReport> | null = null;
  private capability: CapabilityReport | null = null;
  private operation: { kind: 'load' | 'process'; controller: AbortController; jobId: string } | null = null;
  private loaded: SourceVideo | null = null;
  private firstFrame: ImageBitmap | null = null;
  private previewEmoji: ImageBitmap | null = null;
  private resultURL: string | null = null;
  private _emoji = DEFAULT_EMOJI;
  private _assetBase = new URL(/* @vite-ignore */ './assets/', import.meta.url).href;
  private reflecting = false;
  private connectedOnce = false;
  private connectionEpoch = 0;
  private upgraded = false;
  private preupgrade = new Map<string, unknown>();
  private drawStart: Point | null = null;
  private drawing = false;
  private faceURLs: string[] = [];
  private lastAnnouncement = 0;
  private lastLiveAnnouncement = -Infinity;
  private liveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly reportedErrors = new WeakSet<object>();
  private statusText = 'Initializing local processing…';
  constructor() {
    super();
    for (const property of ['emoji','disabled','assetBase']) {
      if (Object.prototype.hasOwnProperty.call(this, property)) {
        this.preupgrade.set(property, (this as unknown as Record<string,unknown>)[property]);
        delete (this as unknown as Record<string,unknown>)[property];
      }
    }
    const shadow = this.attachShadow({ mode:'open' }); shadow.innerHTML = template();
    for (const emoji of EMOJIS) { const option = document.createElement('option'); option.value = emoji; option.textContent = emoji; this.ui<HTMLSelectElement>('emoji').append(option); }
    this.bindControls(); this.updateControls();
  }
  private ui<T extends HTMLElement = HTMLElement>(id: string): T { return this.shadowRoot!.getElementById(id) as T; }
  get state(): ComponentState { return this.session.state; }
  get emoji(): string { return this._emoji; }
  set emoji(value: string) {
    try { value = validateEmoji(value); } catch(error) { this.report(error, false); throw error; }
    if (value === this._emoji) { this.reflect('emoji',value); return; }
    this.cancelOperation('settings'); this.invalidateResult(); this.session.settingsRevision++; this._emoji = value;
    this.reflect('emoji',value); this.ui<HTMLSelectElement>('emoji').value = value;
    if (this.session.selection && this.isConnected) this.setState('selected');
    if(this.isConnected&&this.state!=='initializing')this.status(this.session.selection?'Target selected. Adjust the emoji or process the video.':this.loaded?'Choose a face or draw a rectangle.':'Choose a video to begin.');
    void this.refreshEmoji();
  }
  get disabled(): boolean { return this.hasAttribute('disabled'); }
  set disabled(value: boolean) { this.toggleAttribute('disabled',Boolean(value)); this.updateControls(); }
  get assetBase(): string { return this._assetBase; }
  set assetBase(value: string) {
    let next: string;
    try { next = assetDirectory(value, document.baseURI); if (next !== this._assetBase && this.connectedOnce) throw failure('invalid-configuration'); }
    catch(error) { this.report(error,false); throw error; }
    this._assetBase = next; this.reflect('asset-base',next);
  }
  get capabilities(): CapabilityReport | null { return this.capability ? snapshot(this.capability) : null; }
  get source(): SourceSummary | null { return this.session.source ? snapshot(this.session.source) : null; }
  get faces(): readonly FaceSummary[] { return snapshot(this.session.faces.map(({id,rect,landmarks,confidence,firstSeenUs}) => ({id,rect,landmarks,confidence,...(firstSeenUs===undefined?{}:{firstSeenUs})}))); }
  get selectedFaceIds(): readonly string[] { return snapshot(this.session.selections.flatMap(selection => selection.candidateId ? [selection.candidateId] : [])); }
  get result(): ExportResult | null { return this.session.result ? snapshot(this.session.result) : null; }
  attributeChangedCallback(name: string, oldValue: string | null, value: string | null): void {
    if (this.reflecting || oldValue === value) return;
    if (name === 'disabled') { this.updateControls(); return; }
    try { if (name === 'emoji') this.emoji = value ?? DEFAULT_EMOJI; else this.assetBase = value ?? new URL(/* @vite-ignore */ './assets/', import.meta.url).href; }
    catch { this.reflect(name, name === 'emoji' ? this._emoji : this._assetBase); }
  }
  private reflect(name: string, value: string): void { this.reflecting = true; try { this.setAttribute(name,value); } finally { this.reflecting = false; } }
  connectedCallback(): void {
    if (!this.upgraded) {
      this.upgraded = true;
      for (const [property,value] of this.preupgrade) { try { (this as unknown as Record<string,unknown>)[property] = value; } catch { /* setter reported sanitized configuration error */ } }
      this.preupgrade.clear();
    }
    if (this.state !== 'disconnected') return;
    this.connectedOnce = true; this.connectionEpoch++;
    void this.initialize().catch(() => {});
  }
  disconnectedCallback(): void {
    this.connectionEpoch++; this.cancelOperation('disconnected');
    if(this.liveTimer!==null)clearTimeout(this.liveTimer); this.liveTimer=null;
    this.runtimeController?.abort(); this.client?.dispose(); this.assets?.release();
    this.assets = null; this.client = null; this.capability = null; this.initialization = null;
    this.clearMedia(); this.setState('disconnected');
  }
  async initialize(): Promise<CapabilityReport> {
    if (!this.isConnected) throw failure('invalid-state');
    if (this.initialization) return this.initialization;
    if (this.capability && this.client?.ready) return snapshot(this.capability);
    const epoch = this.connectionEpoch;
    if(this.operation?.kind!=='process')this.setState('initializing'); this.status('Preparing local processing resources…');
    this.initialization = (async () => {
      await Promise.resolve();
      try {
        const basic = platformCapabilities();
        if (!this.assets) {
          const assets = new ResidentAssets(this.instanceId); this.assets = assets;
          this.runtimeController = new AbortController();
          await assets.load(this._assetBase, new URL(/* @vite-ignore */ './workers/pipeline.worker.js', import.meta.url).href, this.runtimeController.signal);
          if (epoch !== this.connectionEpoch) throw abortError();
          this.client = new WorkerClient(this.instanceId,assets,message => this.workerMessage(message));
        }
        if (!this.client) throw failure('asset-load-failed');
        const ready = await this.client.initialize();
        if (epoch !== this.connectionEpoch || !this.isConnected) throw abortError();
        this.capability = { ...basic, ...ready.payload, ready:true };
        if (!this.operation) { this.setState(this.session.selection ? 'selected' : this.loaded ? 'selecting' : 'empty'); this.status(this.loaded ? 'Choose a face or draw a rectangle.' : 'Choose a video to begin.'); }
        this.emit('ready',{ capabilities:this.capability }); this.updateControls();
        return snapshot(this.capability);
      } catch(error) {
        if (epoch === this.connectionEpoch && (error as Error).name !== 'AbortError') {
          this.client?.dispose(); this.client = null; this.assets?.release(); this.assets = null; this.capability = null;
          const safe = sanitized(error,'asset-load-failed'); this.report(safe,true); throw safe;
        }
        throw error;
      } finally { if (epoch === this.connectionEpoch) { this.initialization = null; this.updateControls(); } }
    })();
    return this.initialization;
  }
  async load(file: File): Promise<SourceSummary> {
    this.guard(() => { this.requireEnabled(); validateFile(file); });
    this.cancelOperation('replaced'); this.clearMedia();
    const operation = this.begin('load');
    try {
      await abortable(this.initialize(),operation.controller.signal); this.assertOperation(operation);
      this.setState('loading'); this.ui<HTMLProgressElement>('progress').value=0; this.status('Scanning the entire video for faces. Longer videos take more time on this device…');
      const response = await this.client!.request('LOAD',{file,sourceId:crypto.randomUUID()},'LOADED');
      if (response.type !== 'LOADED') throw failure('worker-failed');
      if (this.operation !== operation || !this.isConnected) { response.payload.bitmap.close(); throw abortError(); }
      this.loaded = response.payload.source; this.firstFrame = response.payload.bitmap;
      const {sourceId,displayWidth,displayHeight,durationUs,container,audioTrackCount} = this.loaded;
      this.session.source = {sourceId,displayWidth,displayHeight,durationUs,container,audioTrackCount}; this.session.faces = this.loaded.initialCandidates;
      await this.refreshEmoji(); this.assertOperation(operation);
      this.operation = null; this.setState('selecting');
      this.status(this.session.faces.length ? 'Full-video scan complete. Choose up to 8 faces below. Colors and numbers match the preview; thumbnails show later appearances.' : 'No faces detected in the video. Open manual selection or choose another video.');
      this.renderFaces(); this.drawInitial();
      this.emit('loaded',{sourceId,width:displayWidth,height:displayHeight,durationUs,faceCount:this.session.faces.length,audioTrackCount});
      return snapshot(this.session.source);
    } catch(error) { this.finishFailure(error,operation,'decode-failed'); throw (error as Error).name === 'AbortError' ? error : sanitized(error,'decode-failed'); }
  }
  selectFace(candidateId: string): void { this.selectFaces([candidateId]); }
  selectFaces(candidateIds: readonly string[]): void {
    const candidates = this.guard(() => {
      this.requireEnabled(); if (!this.loaded || this.operation?.kind === 'load') throw failure('invalid-state');
      if (!Array.isArray(candidateIds) || candidateIds.length > 8 || new Set(candidateIds).size !== candidateIds.length) throw failure('invalid-selection');
      return candidateIds.map(id => {
        const face = this.session.faces.find(item => item.id === id && item.sourceId === this.loaded!.sourceId);
        if (!face) throw failure('invalid-selection'); return face;
      });
    });
    this.cancelOperation('settings'); this.invalidateResult();
    this.session.selections = candidates.map(candidate => ({ selectionId:crypto.randomUUID(), sourceId:this.loaded!.sourceId,kind:'detected',candidateId:candidate.id,initialRect:{...candidate.rect},initialLandmarks:candidate.landmarks.map(point=>({...point})),initialRotationRad:rotation(candidate.landmarks),...(candidate.firstSeenUs===undefined?{}:{firstSeenUs:candidate.firstSeenUs}),...(candidate.embedding?{embedding:candidate.embedding.slice()}:{}) }));
    this.setState(candidates.length ? 'selected' : 'selecting');
    this.status(candidates.length ? candidates.length + ' face(s) selected. Tap a face to add or remove it, then process the video.' : 'Choose the faces you want to mask.');
    this.renderFaces(); this.drawInitial();
    const first = this.session.selection;
    this.emit('selectionchange',{sourceId:this.loaded!.sourceId,selectionId:first?.selectionId ?? null,kind:first?.kind ?? null,candidateId:first?.candidateId ?? null,candidateIds:this.selectedFaceIds,selectionCount:candidates.length});
  }
  private toggleFace(candidateId: string): void {
    const ids = this.selectedFaceIds;
    this.selectFaces(ids.includes(candidateId) ? ids.filter(id=>id!==candidateId) : [...ids,candidateId]);
  }
  selectRegion(rect: Rect): void {
    const region = this.guard(() => {
      this.requireEnabled(); if (!this.loaded || this.operation?.kind === 'load') throw failure('invalid-state');
      return validateRegion(rect,this.loaded.displayWidth,this.loaded.displayHeight);
    });
    this.stopDrawing(); this.select(region,null,null);
  }
  private select(rect: Rect, candidateId: string | null, landmarks: Point[] | null): void {
    if (!this.loaded) throw failure('invalid-state');
    this.cancelOperation('settings'); this.invalidateResult();
    this.session.selection = {selectionId:crypto.randomUUID(),sourceId:this.loaded.sourceId,kind:candidateId ? 'detected' : 'manual',candidateId,initialRect:rect,initialLandmarks:landmarks,initialRotationRad:rotation(landmarks)};
    this.setState('selected'); this.status('Target selected. Adjust the emoji or process the video.'); this.renderFaces(); this.drawInitial();
    this.emit('selectionchange',{sourceId:this.loaded.sourceId,selectionId:this.session.selection.selectionId,kind:this.session.selection.kind,candidateId,candidateIds:this.selectedFaceIds,selectionCount:1});
  }
  async process(): Promise<ExportResult> {
    const context = this.guard(() => {
      this.requireEnabled(); if (!this.loaded || !this.session.selection || this.operation || this.initialization) throw failure('invalid-state');
      return { source:this.loaded, selections:structuredClone(this.session.selections) };
    });
    this.stopDrawing(); this.invalidateResult();
    const operation = this.begin('process'); const { source,selections } = context; const emoji = this._emoji; const settingsRevision = this.session.settingsRevision;
    this.ui<HTMLProgressElement>('progress').value=0;
    this.ui('progress').setAttribute('aria-label','Video processing progress');
    this.setState('processing'); this.status('Processing video locally…');
    try {
      await abortable(this.initialize(),operation.controller.signal); this.assertOperation(operation); this.setState('processing');
      const bitmap = await emojiBitmap(emoji,this.assets!.emojiImages);
      try { this.assertOperation(operation); } catch(error) { bitmap.close(); throw error; }
      const response = await this.client!.request('RUN',{source,selections,emojiBitmap:bitmap,settingsRevision},'COMPLETE',[bitmap]);
      this.assertOperation(operation); if (response.type !== 'COMPLETE') throw failure('worker-failed');
      this.session.result = response.payload; this.operation = null;
      this.resultURL = URL.createObjectURL(response.payload.blob); this.ui<HTMLVideoElement>('review').src = this.resultURL;
      this.renderLosses(); this.setState('complete'); this.status('Video created. Review the entire video before downloading.'); this.ui<HTMLProgressElement>('progress').value = 1;
      const {blob:_,...summary} = response.payload; this.emit('complete',{jobId:operation.jobId,...summary});
      return snapshot(response.payload);
    } catch(error) { this.finishFailure(error,operation,'encode-failed'); throw (error as Error).name === 'AbortError' ? error : sanitized(error,'encode-failed'); }
  }
  cancel(): void { this.cancelOperation('user'); }
  reset(): void { this.cancelOperation('reset'); this.clearMedia(); this.client?.reset(); if (this.isConnected) { this.setState(this.capability ? 'empty' : 'initializing'); this.status('Choose a video to begin.'); } }
  download(): void {
    if (!this.isConnected || !this.session.result || !this.resultURL) throw failure('invalid-state');
    const link = document.createElement('a'); link.href = this.resultURL; link.download = this.session.result.filename;
    this.shadowRoot!.append(link); link.click(); link.remove();
  }
  private begin(kind: 'load' | 'process'): NonNullable<PrivacyMaskVideoElement['operation']> {
    const operation = {kind,controller:new AbortController(),jobId:crypto.randomUUID()}; this.operation = operation; return operation;
  }
  private assertOperation(operation: NonNullable<PrivacyMaskVideoElement['operation']>): void { if (this.operation !== operation || operation.controller.signal.aborted || !this.isConnected) throw abortError(); }
  private cancelOperation(reason: CancelReason): void {
    const operation = this.operation; if (!operation) return;
    this.operation = null; operation.controller.abort(); if (this.client?.operationType !== 'INIT') this.client?.cancel(reason); this.invalidateResult();
    if(this.capability&&!this.client?.ready)this.capability={...this.capability,ready:false};
    if (operation.kind === 'load') this.clearMedia();
    if (this.isConnected) { this.setState(this.session.selection ? 'selected' : 'empty'); this.status('Canceled. You can retry or choose another video.'); }
    this.emit('cancel',{jobId:operation.jobId,reason});
  }
  private finishFailure(error: unknown, operation: NonNullable<PrivacyMaskVideoElement['operation']>, fallback: 'decode-failed' | 'encode-failed'): void {
    if (this.operation !== operation || (error as Error).name === 'AbortError') return;
    this.operation = null; this.invalidateResult(); if (operation.kind === 'load') this.clearMedia();
    this.report(sanitized(error,fallback),true,operation.jobId);
  }
  private requireEnabled(): void { if (!this.isConnected || this.disabled) throw failure('invalid-state'); }
  private guard<T>(validation: () => T): T { try { return validation(); } catch(error) { this.report(error,false); throw error; } }
  private invalidateResult(): void {
    this.session.invalidate();
    if (this.resultURL) URL.revokeObjectURL(this.resultURL); this.resultURL = null;
    const video = this.ui<HTMLVideoElement>('review'); video.pause(); video.removeAttribute('src'); video.load();
    this.ui('review-section').hidden = true;
  }
  private clearMedia(): void {
    for(const url of this.faceURLs)URL.revokeObjectURL(url); this.faceURLs=[];
    this.stopDrawing();
    this.invalidateResult(); this.firstFrame?.close(); this.firstFrame = null; this.loaded = null;
    this.session.clear(); this.ui('faces').replaceChildren();
    const canvas = this.ui<HTMLCanvasElement>('preview'); canvas.getContext('2d')?.clearRect(0,0,canvas.width,canvas.height);
    this.previewEmoji?.close(); this.previewEmoji = null; this.updateControls();
  }
  private stopDrawing(): void {
    this.drawing=false;this.drawStart=null;this.ui('preview').classList.remove('drawing');this.ui('draw').setAttribute('aria-pressed','false');
  }
  private emit(name: string, detail: unknown): void { this.dispatchEvent(new CustomEvent(`pmv-${name}`,{detail:snapshot(detail),bubbles:true,composed:true})); }
  private setState(state: ComponentState): void {
    const previous = this.session.state; this.session.state = state; this.updateControls();
    if (previous !== state) this.emit('statechange',{previous,state,jobId:this.operation?.jobId ?? null});
  }
  private status(text: string, error = false): void {
    this.statusText=text; const status=this.ui('status'); status.textContent=text; status.classList.toggle('error',error);
    const delay=this.operation?.kind==='process'&&!error?Math.max(0,1000-(performance.now()-this.lastLiveAnnouncement)):0;
    const announce=():void=>{this.liveTimer=null; if(this.isConnected){this.lastLiveAnnouncement=performance.now();this.ui('announce').textContent=this.statusText;}};
    if(delay===0){if(this.liveTimer!==null)clearTimeout(this.liveTimer);announce();}
    else if(this.liveTimer===null)this.liveTimer=setTimeout(announce,delay);
  }
  private report(error: unknown, changeState: boolean, jobId: string | null = this.operation?.jobId ?? null): void {
    if(error&&typeof error==='object') { if(this.reportedErrors.has(error))return; this.reportedErrors.add(error); }
    const safe = sanitized(error,'invalid-configuration');
    if (changeState) this.setState('error'); this.status(safe.message,true); this.emit('error',{code:safe.code,message:safe.message,recoverable:safe.recoverable,jobId,diagnostic:'diagnostic' in safe ? safe.diagnostic : undefined}); this.updateControls();
  }
  private updateControls(): void {
    if (!this.shadowRoot) return;
    const blocked = this.disabled || !this.isConnected;
    this.ui<HTMLInputElement>('file').disabled = blocked;
    this.ui<HTMLButtonElement>('process').disabled = blocked || !this.session.selection || !!this.operation || !!this.initialization;
    this.ui<HTMLButtonElement>('region').disabled = blocked || !this.loaded;
    this.ui<HTMLButtonElement>('draw').disabled = blocked || !this.loaded || !!this.operation;
    this.ui<HTMLFieldSetElement>('manual').disabled = blocked || !this.loaded;
    for (const id of ['emoji','custom','apply']) (this.ui(id) as HTMLInputElement).disabled = blocked;
    this.ui<HTMLButtonElement>('cancel').disabled = !this.operation;
    this.ui<HTMLButtonElement>('download').disabled = blocked || !this.session.result;
    this.ui('initialize').hidden = this.state !== 'error' || !!this.capability;
    this.ui('progress').hidden = !this.operation && this.state !== 'complete';
    this.shadowRoot.querySelectorAll<HTMLButtonElement>('#faces button').forEach(button => { button.disabled = blocked || this.operation?.kind === 'load'; });
  }
  private async refreshEmoji(): Promise<void> {
    if (!this.assets || !this.capability) return;
    const emoji = this._emoji; const assets = this.assets;
    try {
      const bitmap = await emojiBitmap(emoji,assets.emojiImages);
      if (this._emoji !== emoji || this.assets !== assets || !this.isConnected) { bitmap.close(); return; }
      this.previewEmoji?.close(); this.previewEmoji = bitmap; this.drawInitial();
    } catch(error) { if (this.assets === assets && this.isConnected) this.report(error,false); }
  }
  private renderFaces(): void {
    const focusedFace=this.shadowRoot!.activeElement?.getAttribute('data-face-id');
    for(const url of this.faceURLs)URL.revokeObjectURL(url); this.faceURLs=[];
    const container = this.ui('faces'); container.replaceChildren();
    this.session.faces.forEach((candidate,index) => {
      const color=faceColor(index),selected=this.session.selections.some(selection=>selection.candidateId===candidate.id);
      const button = document.createElement('button'); button.type = 'button'; button.disabled = this.disabled;
      button.setAttribute('aria-label',`Face ${index+1}`);button.title=`Face ${index+1} · ${color.name} · first seen at ${((candidate.firstSeenUs??0)/1e6).toFixed(2)} s`;
      button.setAttribute('data-face-id',candidate.id);button.setAttribute('aria-description',`${color.name}; first seen at ${((candidate.firstSeenUs??0)/1e6).toFixed(2)} seconds`);
      button.style.setProperty('--face-color',color.value);
      if(candidate.thumbnail) {const image=document.createElement('img');const url=URL.createObjectURL(candidate.thumbnail);this.faceURLs.push(url);image.src=url;image.alt='';image.width=48;image.height=48;button.append(image);}
      const label=document.createElement('span');label.textContent=`${selected?'✓ ':''}Face ${index+1}`;
      const detail=document.createElement('small');detail.textContent=`${color.name} · ${((candidate.firstSeenUs??0)/1e6).toFixed(2)} s`;label.append(detail);button.append(label);
      button.setAttribute('aria-pressed',String(selected));
      button.addEventListener('click',() => this.userAction(() => this.toggleFace(candidate.id))); container.append(button);
      if(focusedFace===candidate.id)button.focus({preventScroll:true});
    });
  }
  private drawInitial(draft?: Rect): void {
    if (!this.firstFrame || !this.loaded || this.operation?.kind === 'process') return;
    const canvas = this.ui<HTMLCanvasElement>('preview'); canvas.width = this.loaded.displayWidth; canvas.height = this.loaded.displayHeight;
    const context = canvas.getContext('2d')!; context.drawImage(this.firstFrame,0,0);
    if (this.previewEmoji) for (const selection of this.session.selections) {
      if((selection.firstSeenUs??this.loaded.initialFrameTimeUs)>this.loaded.initialFrameTimeUs)continue;
      drawMask(context,selection.initialRect,selection.initialRotationRad,{emojiBitmap:this.previewEmoji,backingColor:faceColor(Math.max(0,this.session.faces.findIndex(face=>face.id===selection.candidateId))).value,paddingRatio:.12});
    }
    this.session.faces.forEach((face,index)=>{
      if((face.firstSeenUs??this.loaded!.initialFrameTimeUs)>this.loaded!.initialFrameTimeUs)return;
      const color=faceColor(index);context.strokeStyle=color.value;context.lineWidth=Math.max(3,canvas.width/240);context.strokeRect(face.rect.x,face.rect.y,face.rect.width,face.rect.height);
      const size=Math.max(18,canvas.width/36),text=`Face ${index+1}`;context.font=`bold ${size}px system-ui`;
      const width=context.measureText(text).width+12,x=Math.max(0,Math.min(face.rect.x,canvas.width-width)),y=Math.max(size+8,face.rect.y);
      context.fillStyle=color.value;context.fillRect(x,y-size-8,width,size+8);context.fillStyle='#14212c';context.fillText(text,x+6,y-5);
    });
    if (draft) { context.strokeStyle='#48ed95'; context.lineWidth=3; context.strokeRect(draft.x,draft.y,draft.width,draft.height); }
  }
  private renderLosses(): void {
    const result = this.session.result!; this.ui('review-section').hidden = false; this.ui('losses').replaceChildren();
    this.ui('loss-summary').textContent = result.lostIntervals.length ? 'Tracking was lost during these intervals. A held mask may not cover the intended face.' : 'No tracking loss was reported. Coverage still requires review.';
    const losses = result.targetLosses.flatMap(target=>{const selection=this.session.selections.find(selection=>selection.selectionId===target.selectionId),index=this.session.faces.findIndex(face=>face.id===selection?.candidateId);return target.intervals.map(interval=>({interval,label:index>=0?'Face '+(index+1):'Manual target'}));});
    for (const {interval,label} of losses) {
      const item = document.createElement('li'); const button = document.createElement('button'); button.type='button';
      button.textContent=`${label}: ${(interval.startUs/1e6).toFixed(2)}–${(interval.endUs/1e6).toFixed(2)} s: ${interval.reasons.map(reason=>LOSS_LABELS[reason]).join(', ')}`;
      button.addEventListener('click',() => { this.ui<HTMLVideoElement>('review').currentTime=interval.startUs/1e6; }); item.append(button); this.ui('losses').append(item);
    }
  }
  private workerMessage(message: Message): void {
    if(this.operation?.kind==='load' && message.type==='PROGRESS' && message.payload.stage==='scanning') {
      this.ui('progress').setAttribute('aria-label','Full-video face discovery progress');
      const progress=this.ui<HTMLProgressElement>('progress');if(message.payload.ratio===null)progress.removeAttribute('value');else progress.value=message.payload.ratio;
      this.status(`Scanning the entire video for faces… ${Math.round((message.payload.ratio??0)*100)}%`);this.emit('progress',{jobId:this.operation.jobId,...message.payload});return;
    }
    if (this.operation?.kind !== 'process') { if (message.type === 'PREVIEW') message.payload.bitmap.close(); return; }
    const jobId = this.operation.jobId;
    if (message.type === 'PREVIEW') {
      const canvas = this.ui<HTMLCanvasElement>('preview'); const bitmap = message.payload.bitmap;
      canvas.width=bitmap.width; canvas.height=bitmap.height;
      try { canvas.getContext('2d')!.drawImage(bitmap,0,0); } finally { bitmap.close(); this.client?.acknowledge(message.payload.sequence); }
    } else if (message.type === 'PROGRESS') {
      if (message.payload.stage === 'finalizing') this.setState('finalizing');
      const progress = this.ui<HTMLProgressElement>('progress');
      if (message.payload.ratio === null) progress.removeAttribute('value'); else progress.value=message.payload.ratio;
      this.emit('progress',{jobId,...message.payload});
      if (performance.now()-this.lastAnnouncement >= 1000) { this.lastAnnouncement=performance.now(); this.status(`${this.statusText.split('\n')[0]}\n${message.payload.processedFrames} frames processed.`); }
    } else if (message.type === 'TRACKING') {
      this.status(message.payload.status === 'lost' ? 'Tracking lost. Holding the last mask position; review this interval.' : 'Tracking acquired. Processing video locally…');
      this.emit('trackingchange',{jobId,...message.payload});
    }
  }
  private userAction(action: () => void | Promise<unknown>): void {
    try { Promise.resolve(action()).catch(error => { if ((error as Error).name !== 'AbortError' && this.state !== 'error') this.report(error,false); }); }
    catch(error) { this.report(error,false); }
  }
  private bindControls(): void {
    const file = this.ui<HTMLInputElement>('file'); file.addEventListener('change',() => { const chosen=file.files?.[0]; if (chosen) this.userAction(() => this.load(chosen)); file.value=''; });
    const drop = this.shadowRoot!.querySelector('.drop')!;
    for (const event of ['dragenter','dragover']) drop.addEventListener(event,e => { e.preventDefault(); drop.classList.add('drag'); });
    drop.addEventListener('dragleave',() => drop.classList.remove('drag'));
    drop.addEventListener('drop',event => { event.preventDefault(); drop.classList.remove('drag'); const files=(event as DragEvent).dataTransfer?.files; if (files?.length === 1) this.userAction(() => this.load(files[0]!)); else this.report(failure('invalid-file'),false); });
    this.ui('process').addEventListener('click',() => this.userAction(() => this.process()));
    this.ui('cancel').addEventListener('click',() => this.cancel()); this.ui('reset').addEventListener('click',() => this.reset());
    this.ui('download').addEventListener('click',() => this.userAction(() => this.download()));
    this.ui('initialize').addEventListener('click',() => this.userAction(() => this.initialize()));
    this.ui('emoji').addEventListener('change',() => this.userAction(() => { this.emoji=this.ui<HTMLSelectElement>('emoji').value; }));
    this.ui('apply').addEventListener('click',() => this.userAction(() => { this.emoji=this.ui<HTMLInputElement>('custom').value; }));
    this.ui('region').addEventListener('click',() => this.userAction(() => this.selectRegion({x:Number(this.ui<HTMLInputElement>('x').value),y:Number(this.ui<HTMLInputElement>('y').value),width:Number(this.ui<HTMLInputElement>('width').value),height:Number(this.ui<HTMLInputElement>('height').value)})));
    this.ui('draw').addEventListener('click',()=>{this.drawing=!this.drawing;this.ui('draw').setAttribute('aria-pressed',String(this.drawing));this.ui('preview').classList.toggle('drawing',this.drawing);});
    this.ui<HTMLDetailsElement>('manual-details').addEventListener('toggle',()=>{if(!this.ui<HTMLDetailsElement>('manual-details').open)this.stopDrawing();});
    const canvas = this.ui<HTMLCanvasElement>('preview');
    canvas.addEventListener('pointerdown',event => { if (!this.loaded || this.disabled || this.operation) return; this.drawStart=sourcePoint(canvas,event); if (this.drawStart && this.drawing) canvas.setPointerCapture(event.pointerId); });
    canvas.addEventListener('pointermove',event => { const point=sourcePoint(canvas,event); if (point && this.drawStart && this.drawing) this.drawInitial(drawnRegion(this.drawStart,point)); });
    canvas.addEventListener('pointerup',event => {
      const end=sourcePoint(canvas,event); const start=this.drawStart; this.drawStart=null;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (!start || !end || this.disabled) return;
      const rect=drawnRegion(start,end);
      const scale=Math.min(canvas.clientWidth/canvas.width,canvas.clientHeight/canvas.height),tapSlop=6/scale;
      if (rect.width < tapSlop && rect.height < tapSlop) {
        const face=this.session.faces.find(face => (face.firstSeenUs??this.loaded!.initialFrameTimeUs)<=this.loaded!.initialFrameTimeUs && end.x >= face.rect.x && end.y >= face.rect.y && end.x <= face.rect.x+face.rect.width && end.y <= face.rect.y+face.rect.height);
        if (face) this.userAction(() => this.toggleFace(face.id)); else this.drawInitial();
      } else if(this.drawing)this.userAction(() => this.selectRegion(rect));
    });
    canvas.addEventListener('pointercancel',() => { this.drawStart=null; this.drawInitial(); });
  }
}
