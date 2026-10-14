import type { AudioCodec, VideoCodec } from 'mediabunny';
import type { SourceSummary } from '../core/types';
import type { FaceCandidate } from '../vision/types';
export interface TrackDescriptor { codec: string; config: VideoDecoderConfig | AudioDecoderConfig; firstTimestampUs: number; endTimestampUs: number }
export interface AudioRoute { mode: 'copy' | 'transcode'; codec: AudioCodec; sampleRate: number; numberOfChannels: number }
export interface OutputRoute { container: 'mp4' | 'webm'; mimeType: string; extension: string; videoCodec: VideoCodec; videoBitrate: number; audio: AudioRoute[] }
export interface SourceVideo extends SourceSummary { file: File; timelineOriginUs: number; videoTrack: TrackDescriptor; audioTracks: TrackDescriptor[]; initialFrameTimeUs: number; initialCandidates: FaceCandidate[]; outputRoute: OutputRoute }
