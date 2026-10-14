import type { ComponentState, ExportResult, SourceSummary } from './types';
import type { TargetSelection, FaceCandidate } from '../vision/types';
export class ProcessingSession {
  state: ComponentState = 'disconnected';
  generation = 0;
  source: SourceSummary | null = null;
  faces: FaceCandidate[] = [];
  selection: TargetSelection | null = null;
  result: ExportResult | null = null;
  settingsRevision = 0;
  invalidate(): void { this.generation++; this.result = null; }
  clear(): void { this.invalidate(); this.source = null; this.faces = []; this.selection = null; }
}
