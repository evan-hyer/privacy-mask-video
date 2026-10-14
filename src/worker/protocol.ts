import type { CapabilityReport, ExportResult, Progress, LossReason } from '../core/types';
import type { ErrorCode } from '../core/errors';
import { isErrorCode } from '../core/errors';
import { validRect } from '../core/geometry';
import type { SourceVideo } from '../media/types';
import type { TargetSelection } from '../vision/types';
export interface ResidentWorkerAssets { models: { detector: Uint8Array; recognition: Uint8Array }; runtime: { mjs: string; wasm: string }; modelHashes: string[]; runtimeVersion: string }
interface Payloads {
  INIT: ResidentWorkerAssets;
  LOAD: { file: File; sourceId: string };
  RUN: { source: SourceVideo; selection: TargetSelection; emojiBitmap: ImageBitmap; settingsRevision: number };
  PREVIEW_ACK: { sequence: number };
  CANCEL: { reason: string };
  RESET: null;
  DISPOSE: null;
  READY: CapabilityReport;
  LOADED: { source: SourceVideo; bitmap: ImageBitmap };
  PROGRESS: Progress;
  PREVIEW: { bitmap: ImageBitmap; sequence: number; timestampUs: number };
  TRACKING: { status: 'acquired' | 'lost'; reason: LossReason | null; timestampUs: number };
  COMPLETE: ExportResult;
  CANCELED: null;
  ERROR: { code: ErrorCode; message: string; recoverable: boolean };
}
export type MessageType = keyof Payloads;
export type Message<K extends MessageType = MessageType> = K extends MessageType ? { protocolVersion: 1; instanceId: string; generation: number; jobId: string; type: K; payload: Payloads[K] } : never;
export const incoming = new Set<MessageType>(['INIT','LOAD','RUN','PREVIEW_ACK','CANCEL','RESET','DISPOSE']);
const object=(value:unknown):value is Record<string,unknown> => value!==null && typeof value==='object' && !Array.isArray(value);
const integer=(value:unknown):value is number => Number.isSafeInteger(value) && (value as number)>=0;
const text=(value:unknown):value is string => typeof value==='string' && value.length>0;
const bitmap=(value:unknown):value is ImageBitmap => typeof ImageBitmap!=='undefined' && value instanceof ImageBitmap;
const file=(value:unknown):value is File => typeof File!=='undefined' && value instanceof File && value.size>0;
const lossReasons=new Set(['no-candidate','ambiguous','occluded-or-out-of-frame','weak-manual-match']);
const source=(value:unknown):boolean => object(value) && text(value.sourceId) && file(value.file) && integer(value.displayWidth) && (value.displayWidth as number)>0 && integer(value.displayHeight) && (value.displayHeight as number)>0 && integer(value.durationUs) && (value.durationUs as number)>0 && integer(value.audioTrackCount) && ['mp4','webm'].includes(value.container as string) && Array.isArray(value.initialCandidates) && object(value.outputRoute);
export function isMessage(value: unknown): value is Message {
  if (!value || typeof value !== 'object') return false;
  const message = value as Record<string, unknown>;
  if(message.protocolVersion!==1 || !text(message.instanceId) || !text(message.jobId) || !integer(message.generation) || typeof message.type!=='string')return false;
  const payload=message.payload;
  if(['RESET','DISPOSE','CANCELED'].includes(message.type))return payload===null;
  if(!object(payload))return false;
  switch(message.type) {
    case 'INIT':return object(payload.models) && payload.models.detector instanceof Uint8Array && payload.models.recognition instanceof Uint8Array && object(payload.runtime) && text(payload.runtime.mjs) && text(payload.runtime.wasm) && Array.isArray(payload.modelHashes) && payload.modelHashes.length===2 && payload.modelHashes.every(hash=>typeof hash==='string'&&/^[a-f0-9]{64}$/.test(hash)) && text(payload.runtimeVersion);
    case 'LOAD':return file(payload.file)&&text(payload.sourceId);
    case 'RUN':return source(payload.source)&&object(payload.selection)&&text(payload.selection.sourceId)&&text(payload.selection.selectionId)&&validRect(payload.selection.initialRect)&&['detected','manual'].includes(payload.selection.kind as string)&&bitmap(payload.emojiBitmap)&&integer(payload.settingsRevision);
    case 'PREVIEW_ACK':return integer(payload.sequence);
    case 'CANCEL':return ['user','replaced','settings','reset','disconnected'].includes(payload.reason as string);
    case 'READY':return payload.ready===true&&typeof payload.webCodecs==='boolean'&&typeof payload.offscreenCanvas==='boolean'&&typeof payload.wasm==='boolean'&&Array.isArray(payload.videoCodecs)&&payload.videoCodecs.every(text)&&Array.isArray(payload.audioCodecs)&&payload.audioCodecs.every(text);
    case 'LOADED':return source(payload.source)&&bitmap(payload.bitmap);
    case 'PROGRESS':return ['processing','finalizing'].includes(payload.stage as string)&&integer(payload.processedFrames)&&integer(payload.timestampUs)&&integer(payload.durationUs)&&(payload.ratio===null||typeof payload.ratio==='number'&&Number.isFinite(payload.ratio)&&payload.ratio>=0&&payload.ratio<1);
    case 'PREVIEW':return bitmap(payload.bitmap)&&integer(payload.sequence)&&integer(payload.timestampUs);
    case 'TRACKING':return integer(payload.timestampUs)&&(payload.status==='acquired'&&payload.reason===null||payload.status==='lost'&&lossReasons.has(payload.reason as string));
    case 'COMPLETE':return payload.blob instanceof Blob&&text(payload.filename)&&/^[a-zA-Z0-9_.-]+$/.test(payload.filename)&&text(payload.mimeType)&&integer(payload.width)&&integer(payload.height)&&integer(payload.durationUs)&&integer(payload.frameCount)&&integer(payload.audioTrackCount)&&text(payload.sourceId)&&integer(payload.settingsRevision)&&Array.isArray(payload.lostIntervals)&&payload.lostIntervals.every(interval=>object(interval)&&integer(interval.startUs)&&integer(interval.endUs)&&(interval.endUs as number)>(interval.startUs as number)&&Array.isArray(interval.reasons)&&interval.reasons.every(reason=>lossReasons.has(reason)));
    case 'ERROR':return isErrorCode(payload.code)&&text(payload.message)&&typeof payload.recoverable==='boolean';
    default:return false;
  }
}
export function closePayload(message: unknown): void {
  if(!object(message)||!object(message.payload))return;
  if(bitmap(message.payload.bitmap))message.payload.bitmap.close();
  if(bitmap(message.payload.emojiBitmap))message.payload.emojiBitmap.close();
}
