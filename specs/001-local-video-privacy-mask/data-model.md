# Data Model: Local Video Privacy Mask Component

All entities are transient, per-instance data. There is no database schema or server API. Public integration shapes are defined in [contracts/web-component.md](contracts/web-component.md); worker ownership is defined in [contracts/worker-protocol.md](contracts/worker-protocol.md).

## Coordinate and time conventions

- `Rect = { x, y, width, height }` uses finite display-oriented source pixels. Imported orientation/flip is normalized before detection. CSS coordinates are converted through the actual letterboxed preview rectangle.
- Manual rectangles must be nonempty and fully within the displayed source bounds. Detector estimates may extend outside the picture; drawing clips at the video edge.
- `Point = { x, y }` uses the same coordinates. Rotation is finite radians, clockwise in canvas coordinates, with zero upright. Missing landmarks are null, not invented points.
- Internal `timestampUs` and `durationUs` are safe integer microseconds. Preserve presentation order, source durations, and relative audio/video offsets. The adapter converts media-library seconds once; never derive time from frame index for variable-rate input.
- Use a common timeline origin across audio/video, not a separate zero for each track. Preserve any initial track offset. Normalize final output orientation metadata to neutral after baking display orientation into pixels.

## ComponentConfiguration

| Field | Meaning / validation |
| --- | --- |
| `emoji: string` | One canonical supported sequence from the shipped manifest; default U+1F60E. Invalid input preserves previous value. |
| `disabled: boolean` | Prevents new user actions and load/process/selection; cancel/reset remain available. Does not implicitly cancel existing processing. |
| `assetBase: URL` | Same-origin directory for fixed model/runtime/font assets; default relative to the module. Set only before first connection. |
| `limits: ResourceLimits` | Internal versioned input/output/dimensions/duration caps from plan; not mutable host configuration in v1. |

## SourceVideo

| Field | Meaning / validation |
| --- | --- |
| `sourceId: string` | Opaque instance-local identifier, replaced on every load. |
| `file: File` | Local reference only; positive size, accepted container and limits. Never placed in DOM events. |
| `container: 'mp4' or 'webm'` | Determined by demuxing, not trusted from filename alone. |
| `displayWidth, displayHeight: integer` | Positive normalized dimensions, within resource limits. |
| `durationUs: integer` | Positive playable duration within limit. |
| `timelineOriginUs: integer` | Common normalization origin for all tracks. |
| `videoTrack: TrackDescriptor` | Selected primary video stream and actual decode configuration. Extra video tracks are outside the single-view workflow and trigger a clear unsupported-input error. |
| `audioTracks: TrackDescriptor[]` | Every source audio track to preserve, or empty for silent input. |
| `initialFrameTimeUs: integer` | First valid display frame. |
| `initialCandidates: FaceCandidate[]` | Stable order and IDs for selection in that frame. |
| `outputRoute: OutputRoute` | Capability-tested preservation route, chosen before processing. |

`TrackDescriptor` includes codec/configuration, timestamps, duration, and for audio sample rate/channels. Input must expose usable finite timing and constant supported display dimensions. Unsupported metadata/configuration fails clearly rather than stretching or dropping tracks. Encoded packets and frames are streamed, not retained in this entity.

## FaceCandidate and TargetSelection

`FaceCandidate` has `id`, `sourceId`, `rect`, five `landmarks`, and detector `confidence`. Sort accepted candidates deterministically by left/top/size and a stable final detection index; deduplicate with fixed NMS. IDs remain stable only for the loaded initial frame. Every detected candidate is represented in the selection list even when boxes overlap.

`TargetSelection` has `selectionId`, `sourceId`, `kind: 'detected' | 'manual'`, `candidateId: string | null`, `initialRect`, `initialLandmarks: Point[] | null`, and `initialRotationRad`. It references exactly one SourceVideo. Selecting a candidate from a stale source or an invalid manual box fails without changing the current valid selection.

Reference embeddings are not public selection fields. They are created in the worker from the original initial frame at the start of each run. A manually selected region starts upright if landmarks are unavailable. A later uniquely agreeing detection may establish landmarks and a frozen appearance reference.

## TrackingProfile and IdentityReference (worker-only)

`TrackingProfile` contains a version/hash, model/runtime hashes, tensor preprocessing parameters, detector/NMS thresholds, motion/scale gates, cosine thresholds, runner-up margins, reacquisition rules, manual correlation search grid, and fixed ordering rules. Calibration produces concrete numeric constants before acceptance testing; changing any constant changes the profile hash. No randomness, adaptive wall-clock thresholds, or frame skipping.

`IdentityReference` contains the immutable initial normalized SFace descriptor when available, the frozen grayscale manual template when applicable, and the last two accepted geometries/times for motion prediction. Keep only a bounded history. Neither named identities nor external face libraries are consulted. References are destroyed on source replacement/reset/disconnect and recreated for repeated processing.

## FrameTrackingResult and LossInterval

| Field | Meaning |
| --- | --- |
| `frameIndex, timestampUs, durationUs` | Presentation index and timing. |
| `status: 'acquired' | 'lost'` | Whether this frame has an accepted target match. |
| `reason` | Null while acquired; otherwise no-candidate, ambiguous, occluded-or-out-of-frame, or weak-manual-match. No unsupported claim that the system knows which kind of occlusion occurred. |
| `rect, rotationRad` | Accepted geometry or held last-accepted geometry while lost. |
| `landmarks: Point[] | null` | Landmarks measured on this frame only; null on loss or when unavailable. |
| `geometrySource: 'measured' | 'held'` | Separates actual matching from hold behavior. |
| `selectionId, profileHash` | Associates the record with the intended target and configuration. |

Every successfully processed frame produces exactly one result. An encoded frame cannot bypass tracking/rendering. Coalesce contiguous lost results into `LossInterval { startUs, endUs, reasons[] }`, with start inclusive/end exclusive; the final interval ends at the last affected frame's end time. Keep compact typed records if needed for review/tests, never raw per-frame images. Public events expose only status and aggregate progress; detailed coordinates/embeddings stay internal.

## MaskSettings

Fields: canonical `emoji`, `emojiBitmap` resource, `backingColor`, fixed `paddingRatio`, and a settings revision. The bundled font and sequence manifest must be ready before rasterization. The backing's opaque circle radius is at least half the current face-box diagonal plus padding; emoji scale/rotation follow the same box. One immutable settings snapshot belongs to a run. A valid setting change invalidates the old result; invalid input does not.

## OutputRoute and ExportResult

`OutputRoute` records selected container/media type/extension, exact video configuration, audio track copy-or-transcode plans, common time offset, and limits. Every planned track must pass compatibility/capability checks before processing. Compatible audio packet copy is preferred; local transcode preserves audible content, not necessarily encoded bytes. If no route preserves required audio/dimensions, fail before processing.

`ExportResult` contains `blob: Blob`, safe `filename`, `mimeType`, `width`, `height`, `durationUs`, `frameCount`, `audioTrackCount`, `lostIntervals`, `sourceId`, and `settingsRevision`. It exists only after encoder flush and muxer finalization succeed. It does not claim verified coverage merely because the file was created. `complete` event reports summary information; the Blob is retrieved through the result property or process return value.

The component owns its review/download object URLs and revokes them on invalidation/disconnect. A host that keeps the returned Blob owns that reference and any URLs it creates; the component cannot revoke copies retained by the host.

## ProcessingSession and state transitions

`ProcessingSession` contains `instanceId`, monotonically increasing `generation`, `jobId`, `state`, configuration, optional source/selection/result, progress, lost intervals, worker ownership, and last typed error. Every asynchronous response must match the active generation/job before it can mutate UI or resolve a promise.

States: `disconnected`, `initializing`, `empty`, `loading`, `selecting`, `selected`, `processing`, `finalizing`, `complete`, `error`.

| Trigger | Transition / invariant |
| --- | --- |
| First connection or reconnection | disconnected -> initializing -> empty; media never restored automatically |
| Initialization failure | initializing -> error; explicit initialize retry allowed |
| Valid load request | any connected noninitializing state -> loading; abort/invalidate previous operation and source first |
| Load success | loading -> selecting, including when no candidates exist |
| Load failure | loading -> error with no stale result/source offered |
| Valid detected/manual selection | selecting/selected/complete -> selected; old export invalidated |
| Selection change during processing | abort old run, invalidate export, then selected; source retained |
| Valid emoji change | keep current stage when no run/result; processing/finalizing/complete -> selected after invalidation; source/selection retained |
| Process | selected or complete -> processing -> finalizing -> complete; complete rerun starts with original selection and fresh identity state |
| Cancel during load | -> empty; reject load with AbortError |
| Cancel during processing/finalizing | -> selected with retained source/selection, no result; reject process with AbortError |
| Cancel while idle | No-op |
| Processing/export failure | -> error; retain usable source/selection for retry, no partial result |
| Reset | any connected state -> empty if runtime ready, otherwise initializing; clear media/identity/result, preserve configuration |
| Disconnect | any state -> disconnected; abort, terminate worker, clear all owned media/resources |

`load()` waits for initialization before entering loading. Retry `process()` from error is allowed only when a valid retained source/selection and initialized runtime exist; otherwise load or initialize first. Invalid API arguments reject without disturbing a valid session. All public snapshots are defensive/read-only views, never live mutable internal objects.
