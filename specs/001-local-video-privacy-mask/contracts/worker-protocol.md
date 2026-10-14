# Internal Contract: Component Worker Protocol

This is an internal versioned message contract, not a network API. The worker is created and owned by one `<privacy-mask-video>` instance. See [web-component.md](web-component.md) for the public interface and [../data-model.md](../data-model.md) for entities.

## Envelope and correlation

Every message uses `{ protocolVersion: 1, instanceId, generation, jobId, type, payload }`. IDs are opaque, per-instance correlation data, not media-derived values. `generation` increases on replacement, invalidation, or reconnect. `jobId` identifies an initialize, load, or processing operation. A receiver validates the envelope and ignores stale/mismatched results before modifying state. Stale transferred resources must still be closed/released.

The main thread owns authoritative lifecycle and cancellation. The worker owns processing order and media/model resources for its active job. No concurrent runs within a worker; every inference and frame render belongs to one ordered pipeline. Async encoder callbacks are correlated before their output is accepted.

## Main thread to worker

| Type | Payload and effect |
| --- | --- |
| `INIT` | Validated asset manifest plus verified resident model/runtime data or fixed same-origin asset URLs, profile version, resource limits. Create CPU/WASM sessions with one thread. No media input. |
| `LOAD` | Local `File` structured clone, sourceId, resource limits. Demux, probe input/output routes, decode first valid oriented frame, detect candidates. |
| `RUN` | Retained source or local File, SourceVideo metadata, TargetSelection, immutable MaskSettings snapshot with transferred emoji bitmap, selected output route/profile. Restart from the beginning; reset all tracking state. |
| `PREVIEW_ACK` | Sequence number acknowledging a consumed/disposed preview bitmap; allows the next progress preview. |
| `CANCEL` | Job being canceled and reason. Stop when cooperative control resumes; never finalize a successful result after cancellation. |
| `RESET` | Clear source/trackers/results/codec state; preserve only immutable non-media runtime assets if the worker stays connected. |
| `DISPOSE` | Best-effort full cleanup before termination. Main thread never waits indefinitely for acknowledgement. |

Changing target/emoji does not require an inference command before processing: main thread stores the valid initial selection/settings and refreshes its paused preview. RUN reconstructs identity from the original initial frame. Typed manifests, rectangles, limits, and decoded track metadata are validated on both sides of the boundary.

## Worker to main thread

| Type | Payload and effect |
| --- | --- |
| `READY` | Runtime/profile/asset versions and capabilities; no media metadata. Main thread combines with local font readiness before public ready. |
| `LOADED` | Source summary, candidates with boxes/landmarks, preflighted output route, one transferred first-frame ImageBitmap. This initial unmasked frame is required for selection and stays internal. |
| `PROGRESS` | Stage, processed frame count, current media timestamp/duration, ratio or unknown; metadata only. |
| `PREVIEW` | Transferred masked ImageBitmap, sequence, tracking status/reason, media timestamp. At most one bitmap awaiting ACK. |
| `TRACKING` | Acquired/lost transition and reason/time. No embedding/raw patch. |
| `COMPLETE` | Fully finalized Blob and ExportResult metadata, compact lost intervals. Do not send before all encoder/muxer work succeeds. |
| `CANCELED` | Cooperative cleanup confirmation for the requested job. |
| `ERROR` | Stable sanitized code/message/recoverable data. No raw media/identity descriptors/stack logging. |

Public progress/tracking events are derived from internal metadata, not a forwarding of arbitrary worker payloads. Detailed per-frame tracking records may be collected by internal test instrumentation for determinism/coverage assertions; they are not emitted as default DOM events.

## Resource ownership

- File is structured-cloned without reading its entire content on the main thread; the host/component keeps only the source reference required for retry. The worker demuxes bounded chunks.
- Main thread retains immutable verified model/font/runtime source data across a canceled job when necessary to recreate the worker offline. Transferring those sole buffers would detach them, so reuse by cloning or reconstructing from resident immutable copies; no runtime refetch after readiness. Release all instance-owned references on disconnect.
- Worker creation uses a Blob URL for a preloaded self-contained module bundle. ORT companion module and WASM path overrides use preloaded Blob resources as well. Initialization creates and retains these URLs for offline restarts, with no unresolved module chunks or reliance on HTTP cache. Revoke them only after all instance workers are stopped on disconnect. Verify the pinned ORT module/binary combination through forced termination followed by an offline retry.
- Worker owns decoded frames/canvases, inference sessions, tensors, manual patches, embeddings, encoders, muxer, and output accumulation. Close/dispose in success, error, cancel, reset, and termination paths.
- First-frame/preview/emoji ImageBitmaps transfer ownership. Receivers close replaced/stale bitmaps. Main closes previews after drawing and acknowledges the sequence. No growing preview queue.
- Main owns final Blob references and review/download URLs. Worker drops redundant result buffers after transfer/clone completion. Host-retained returned Blobs are outside component ownership.
- A finite frame pool bounds intermediate frames, not total encoded output. Enforce the encoded-output cap while writing, accounting for finalization and copies; fail early on excessive estimates, and abort on actual limit breach.

## Cancellation and failure

1. Main immediately marks the job invalid, updates visible state, settles its pending promise with AbortError, and emits one cancellation event.
2. Send CANCEL; if cleanup has not acknowledged within 250 milliseconds, terminate the worker. Disconnect terminates immediately after best-effort DISPOSE. The UI acknowledgement must not wait for inference completion.
3. Close any late transferables and discard all late state/results. Never expose a completed old Blob after replacement.
4. A subsequent run can reconstruct the worker from resident assets and the retained local source/selection. Disconnect discards everything and needs normal initialization on reconnect.

Uncaught worker failure becomes worker-failed and clears any incomplete output. A retry creates a new worker/generation; it cannot reuse partially initialized inference/codec state. Worker startup/script-load errors are surfaced as initialization failures.

## Privacy and timing

Assets are fixed package resources and contain no media-derived URL data. Worker code has no upload, analytics, WebSocket, remote inference, or media logging path. Do not forward private objects to a general logger. Network tests cover worker requests as well as page requests.

Frame processing is driven by presentation time, not requestAnimationFrame or wall clock. Await each render/encode submission; honor bounded encoder backpressure. Audio uses the same timeline origin and is interleaved to avoid accumulating a full second track. Preview throttling affects display only, never selected-frame processing, association, or export.
