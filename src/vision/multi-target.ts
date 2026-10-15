import type { Association } from './association';
import type { FrameTrackingResult } from './types';

// Resolve the whole frame before any target commits its measured geometry.
export function resolveTrackingConflicts(proposed: FrameTrackingResult[], associations: Pick<Association,'hold'>[]): FrameTrackingResult[] {
  return proposed.map((tracking,index) => tracking.candidateId && proposed.some((other,i) => i !== index && other.candidateId === tracking.candidateId)
    ? associations[index]!.hold(tracking) : tracking);
}
