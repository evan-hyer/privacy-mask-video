import type { FaceSummary, LossReason, Point, Rect } from '../core/types';
export interface FaceCandidate extends FaceSummary { sourceId: string }
export interface TargetSelection { selectionId: string; sourceId: string; kind: 'detected' | 'manual'; candidateId: string | null; initialRect: Rect; initialLandmarks: Point[] | null; initialRotationRad: number }
export interface FrameTrackingResult { frameIndex: number; timestampUs: number; durationUs: number; status: 'acquired' | 'lost'; reason: LossReason | null; rect: Rect; rotationRad: number; landmarks: Point[] | null; geometrySource: 'measured' | 'held'; selectionId: string; profileHash: string; candidateId?: string | null }
