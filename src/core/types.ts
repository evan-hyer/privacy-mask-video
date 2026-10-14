export interface Point { x: number; y: number }
export interface Rect extends Point { width: number; height: number }
export type ComponentState = 'disconnected' | 'initializing' | 'empty' | 'loading' | 'selecting' | 'selected' | 'processing' | 'finalizing' | 'complete' | 'error';
export interface CapabilityReport { ready: boolean; webCodecs: boolean; offscreenCanvas: boolean; wasm: boolean; videoCodecs: readonly string[]; audioCodecs: readonly string[] }
export interface SourceSummary { sourceId: string; displayWidth: number; displayHeight: number; durationUs: number; container: 'mp4' | 'webm'; audioTrackCount: number }
export interface FaceSummary { id: string; rect: Rect; landmarks: readonly Point[]; confidence: number }
export type LossReason = 'no-candidate' | 'ambiguous' | 'occluded-or-out-of-frame' | 'weak-manual-match';
export interface LossInterval { startUs: number; endUs: number; reasons: LossReason[] }
export interface ExportResult { blob: Blob; filename: string; mimeType: string; width: number; height: number; durationUs: number; frameCount: number; audioTrackCount: number; lostIntervals: LossInterval[]; sourceId: string; settingsRevision: number }
export interface Progress { stage: 'processing' | 'finalizing'; processedFrames: number; timestampUs: number; durationUs: number; ratio: number | null }
export type CancelReason = 'user' | 'replaced' | 'settings' | 'reset' | 'disconnected';
export function snapshot<T>(value: T): T {
  const copy = structuredClone(value);
  function freeze(item: unknown): void {
    if (item && typeof item === 'object' && !(item instanceof Blob) && !ArrayBuffer.isView(item)) {
      for (const child of Object.values(item)) freeze(child);
      Object.freeze(item);
    }
  }
  freeze(copy);
  return copy;
}
