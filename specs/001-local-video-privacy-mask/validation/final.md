# Implementation delivery and deferred qualification

Date: 2026-10-14. The user instructed "lets defere testing" after the initial
fixture gate. This explicitly supersedes test-first scheduling and the corpus
prerequisite. The native component and demo are implemented and packaged;
qualification remains deferred. This document does not claim a tested release.

## Active checks

- `npm run typecheck`: passed on the implementation.
- `npm run build`: passed, including verification of 26 pinned resources and
  licenses, main/worker bundling and public declaration generation.
- `node scripts/inspect-dist.mjs`: inspects ESM dependencies, declarations,
  demos, copied resources, worker integrity and self-contained packaging. The
  check passed: 26 pinned resources/notices and one 621,720-byte worker; no bare
  or external static module imports or inlined WASM copies in browser entries.
- No unit, browser, integration, privacy, accuracy, repeatability, output-decoder
  or performance suite was authored or run during this resumed implementation.
  The earlier five tests in setup.md cover tooling only.

The distribution includes index.js, define.js, a shared local implementation
module, index.d.ts/define.d.ts and supporting declarations, one worker bundle,
all assets/notices, and demo/index.html/demo/embed.html. The worker uses ORT's
external-WASM export condition; unused WASM data URLs are not embedded into it.
The build adds the worker SHA-256 to the distribution manifest. Script/module
dependencies are bundled; the runtime companion module is imported from an
instance-owned resident Blob URL with an explicit matching WASM override.

The original default ORT bundle embedded two WASM copies (38.6 MB worker).
The external-WASM condition reduced the current worker to about 622 kB. This is
artifact evidence, not an inference-memory or browser-performance measurement.

## Requirement-to-implementation mapping

Every acceptance result in this table is **unverified / testing deferred**.

| Requirement | Implemented code / behavior | Qualification |
| --- | --- | --- |
| FR-001 | element controls accept one picker/drop File; media/input.ts demuxes MP4/WebM, validates metadata/limits and typed errors | Deferred |
| FR-002 | initialFrame(), local paused bitmap, no implicit selection, process preconditions | Deferred |
| FR-003 | YuNet deterministic decode/NMS/candidate IDs; initial boxes, independent keyboard buttons and one selection | Deferred |
| FR-004 | Ordered sample timestamps; per-frame association, geometry, measured landmarks and status; frozen SFace reference and bounded motion history | Deferred; profile uncalibrated |
| FR-005 | render/mask.ts centers/scales/rotates glyph and draws opaque diagonal-radius backing, clipped by canvas bounds | Deferred; estimate coverage is not ground-truth coverage |
| FR-006 | Output preflight, common timeline, awaited CanvasSource writes, bounded encoded output, encoder/muxer finalization and Blob download | Deferred |
| FR-007 | No-face guidance, pointer and numeric fully in-bounds manual rectangle selection | Deferred |
| FR-008 | Conservative appearance matching/reacquisition; held geometry on loss, null current landmarks, coalesced intervals | Deferred; zero-switch accuracy not claimed |
| FR-009 | Default/preset/custom canonical emoji validation against resident sequence/font resources; invalid settings retained | Deferred |
| FR-010 | Masked preview with one outstanding ACK and at most 5 Hz; separate progress and acquired/lost events | Deferred; cadence not measured |
| FR-011 | Immediate operation invalidation/AbortError, stale message rejection and bitmap cleanup, 250 ms worker termination, reset/replacement/settings handling | Deferred; latency not measured |
| FR-012 | Local result video, interval seek buttons, audio notice and explicit held-mask/coverage review text | Deferred |
| FR-013 | Native HTMLElement/open Shadow DOM, ESM registration, reflected/pre-upgrade configuration, defensive properties, methods/events, per-instance ownership and disconnect cleanup | Deferred |
| NFR-001 | Fixed same-origin asset startup, File-only media source, CPU/WASM local inference, no upload/logger/telemetry path in component code | Network/privacy audit deferred |
| NFR-002 | Worker-based processing, main-thread cancellation and independent progress metadata | Reference-device qualification deferred |
| NFR-003 | Native labeled controls, keyboard face buttons/manual fields, text status/loss/errors and throttled live region | Accessibility review deferred |
| NFR-004 | Session-local references, explicit downloads, owned Blob URL/bitmap disposal, no persistent media store | Lifecycle/storage audit deferred |
| SC-001 | Workflow code and demo are present | Independent player/media acceptance deferred |
| SC-002 | Real per-frame detection/association and estimate-backed mask implemented | Annotated coverage and zero-switch evidence deferred |
| SC-003 | Fixed profile/models/order, fresh run state and frozen references | Three-run comparisons deferred |
| SC-004 | Resident verified worker/runtime/model/font assets support offline reconstruction by design | Offline/network/persistence evidence deferred |
| SC-005 | Timestamp/duration preservation and per-sample dimension checks; output orientation baked into pixels | Output timing/orientation/frame-order inspection deferred |
| SC-006 | Worker architecture, bounded pools/queues/output and responsive main-thread cancellation implemented | Reference-machine 60-second benchmark deferred |
| SC-007 | Missing-face/manual/loss/re-entry/cancel/error workflow implemented | Real recovery fixtures deferred |
| SC-008 | 22 canonical sequences, shared mask geometry/bitmap rendering and invalid-setting retention | Glyph/coverage/preview-export comparisons deferred |
| SC-009 | Compiled ordinary HTML host and two-instance/pre-upgrade demo; independent workers and cleanup | API/lifecycle/multiple-instance/browser evidence deferred |

## Implementation decisions

The input adapter uses VideoSampleSink and a two-canvas pool rather than
CanvasSink's automatic resizing. Each decoded sample's display dimensions are
checked before orientation/flip normalization. Changing dimensions fail instead
of stretching the source. Export timestamps use safe integer microseconds on a
common origin, with adapter conversion at the boundary. Every frame receives
one tracking result and one rendered encoding submission.

Audio routes preserve all tracks by packet copy or supported local transcode.
Each track's first packet/sample is submitted before the frame loop to signal
its actual first timestamp, including a future offset, so muxers need not buffer
all preceding video waiting for that track's configuration. Audio then advances
alongside video with bounded lookahead and awaited writes. Audio is unchanged
in content and is not anonymized. Encoded bytes need not remain identical.

Detector decoding and five-point alignment were implemented using the primary
[OpenCV detector reference](https://raw.githubusercontent.com/opencv/opencv/4.x/modules/objdetect/src/face_detect.cpp)
and [SFace reference](https://raw.githubusercontent.com/opencv/opencv/4.x/modules/objdetect/src/face_recognize.cpp).
Parity against those references has not been measured. The model/font/runtime
revisions and tensor metadata are locked in assets/manifest.json.

Profile constants in src/vision/profile.ts are explicitly provisional. Its hash
includes constants, model hashes and runtime version. No calibration results or
threshold tuning on an acceptance corpus are fabricated. Manual-only recovery
is limited to a short, stricter local-template window; longer disappearance
without a frozen face descriptor remains lost.

Cancellation settles user operations and invalidates old jobs before worker
cleanup. Recreated workers use retained Blob modules/resources; disconnect
terminates workers before revoking those URLs. These are implemented paths;
forced offline restarts and disposal counters have not been tested.

## Remaining work

- Real licensed/consented calibration and held-out media acquisition (T005).
- Story contract/integration/e2e test authoring and execution (T016–T020,
  T040–T042, T049–T051, T057).
- Actual inference initialization/restart and API readiness verification (parts
  of T014/T015), SFace reference parity (T027), calibrated profile/recovery
  parameters (T031/T046), focused interval tests (T043), and embedding tests
  (T058).
- Accessibility/privacy/performance qualification (T059–T061), and the test
  portions of final packaging qualification (T063).

Code-only tasks are marked [X]. Mixed tasks retain an unchecked
"CODE COMPLETE; VALIDATION DEFERRED" marker. Test tasks retain unchecked
"DEFERRED" markers. Documentation and this truthful status report are complete;
the full original 64-task qualification plan is not complete.

Final task count: 40 complete, 16 deferred, and 8 with implementation complete
and validation deferred. Checklist: requirements.md remains 16/16 checked,
0 unchecked; it was not modified by implementation.

No .specify/extensions.yml exists; pre/post hooks are absent. No package was
published, site deployed, private fixture uploaded, or external dataset request
sent. The checklist remains reviewer-owned and unchanged.
