import type { ComponentState, ExportResult, SourceSummary } from './types';
import type { TargetSelection, FaceCandidate } from '../vision/types';
export class ProcessingSession {
  state: ComponentState = 'disconnected';
  generation = 0;
  source: SourceSummary | null = null;
  faces: FaceCandidate[] = [];
  selections: TargetSelection[] = [];
  get selection(): TargetSelection | null { return this.selections[0] ?? null; }
  set selection(value: TargetSelection | null) { this.selections = value ? [value] : []; }
  result: ExportResult | null = null;
  settingsRevision = 0;
  invalidate(): void { this.generation++; this.result = null; }
  clear(): void { this.invalidate(); this.source = null; this.faces = []; this.selection = null; }
}
