# Implementation Plan: Local Video Privacy Mask Web Component

**Branch**: `main` (actual Git branch) | **Date**: 2026-10-13 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification and the user's requirement: "THIS NEEDS TO BE A STANDARD WEB COMPONENT."

**Spec Kit identifier**: `001-local-video-privacy-mask`. Setup returns this identifier as BRANCH from feature-directory state; it did not create or switch a Git branch.

## Summary

**Execution update (2026-10-14)**: The user deferred testing. Fixture acquisition,
calibration, browser/coverage/privacy/performance acceptance, and test authoring
no longer block implementation. Basic asset verification, TypeScript compilation
and distribution builds continue. Acceptance remains unverified; tracking
thresholds are provisional until calibration. This supersedes the original
test-first and fixture-gate scheduling without changing the functional scope.

The input adapter uses Mediabunny's ordered `VideoSampleSink` with a two-canvas
pool instead of the convenience `CanvasSink`: inspection of the pinned library
showed that CanvasSink fits later samples into the initial metadata dimensions.
The adapter checks each decoded sample's display dimensions before drawing so
changing-resolution input is rejected rather than silently resized. Orientation
and flip are baked into pixels; timestamps and durations remain explicit.

Deliver `<privacy-mask-video>` as an autonomous custom element containing local import, face selection, emoji masking, preview, review, and download. A plain HTML page imports the distributed ES module without a UI framework or build step. Shadow DOM encapsulates the interface.

A per-instance worker uses Mediabunny/WebCodecs for ordered media I/O and ONNX Runtime WASM with YuNet/SFace for detection and anonymous within-clip appearance association. Every presentation frame is masked and encoded with original timing; original audio is preserved. [Research](research.md) records alternatives and evidence.

## Technical Context

**Language/Version**: Strict TypeScript targeting ES2022/ES modules; Node.js 24 LTS for tooling. Browser distribution is JavaScript plus declarations.

**Primary Dependencies**: Mediabunny; onnxruntime-web/wasm; YuNet 2023mar and SFace 2021dec models; Noto Color Emoji font. Vite for library/demo builds, Vitest for pure logic, Playwright for browser checks. Exact versions and asset hashes are locked during implementation. No UI framework.

**Storage**: Session-local File, bounded frame/codec buffers, transient tracking records, final Blob. No backend or persistent media store. Explicit downloads are the persistence boundary.

**Testing**: Pure tracking/geometry/timing tests; custom-element API/lifecycle checks; real-model/media integration; annotated output coverage; network/offline audit; independent output decode. Test compiled ESM on a plain static host.

**Target Platform**: HTTPS/localhost desktop browser with custom elements, Shadow DOM, ES modules, module workers, OffscreenCanvas, WASM, and supported actual WebCodecs configurations. Qualify Chromium first. No mandatory GPU, service worker, COOP/COEP, or cross-origin isolation.

**Project Type**: Component library with a thin plain-HTML demo/validation host.

**Performance Goals**: Responsive 60-second 720p/30fps baseline; progress at least once per second while advancing; cancellation acknowledged within one second. Batch processing may be slower than playback. Preview targets at most 5 Hz without skipping export frames; bounded queues and one inference at a time.

**Constraints**: Zero media egress; offline operation after readiness; explicit target selection; deterministic tracking within a pinned environment; visible loss; original dimensions/orientation/timing/audio. Initial limits: 256 MiB input/output each, 10-minute duration, 1920 pixels per displayed dimension, 2,073,600 total display pixels. No silent resize/audio loss.

**Scale/Scope**: One video/target per instance; independent multiple instances within resources. No cloud, webcam, multi-face masking, named-person identification, publishing, or deployment work.

## Constitution Check

*Checked before research and after design.*

The constitution remains an unfilled template. Its examples are not ratified rules; this absence is recorded rather than treated as constitutional compliance.

| Gate | Before research | After design | Evidence |
| --- | --- | --- | --- |
| Standard Web Component | Pass: hard constraint | Pass in design | Native element, ESM, lifecycle/API, plain-HTML tests |
| Local-only media | Pass | Pass in design | File input, worker/assets, offline/network checks |
| Explicit target/continuity | Pass | Pass in design | Conservative association, loss review, crossing fixtures |
| Ordered complete export | Pass | Pass in design | Timestamped batch pipeline, audio negotiation, output decode |
| Bounded scope | Pass | Pass | Library/demo, no server or publishing |

These assess design consistency, not measured runtime quality. No unjustified violations or unresolved architecture questions; see research.md.

## Project Structure

### Documentation (this feature)

```text
specs/001-local-video-privacy-mask/
  spec.md
  plan.md
  research.md
  data-model.md
  quickstart.md
  checklists/requirements.md
  contracts/
    web-component.md
    worker-protocol.md
```

Tasks are generated separately by `$speckit-tasks`.

### Source Code (repository root; planned)

```text
src/
  index.ts                         # Explicit registration/class/types
  define.ts                        # Auto-registration entry
  element/
    privacy-mask-video.ts           # HTMLElement/API/lifecycle
    template.ts
    styles.css
    selection.ts
    emoji.ts
  core/
    types.ts
    session.ts
    capabilities.ts
    assets.ts
    limits.ts
  worker/
    pipeline.worker.ts
    protocol.ts
  media/
    input.ts
    output.ts
    audio.ts
    timeline.ts
  vision/
    yunet.ts
    sface.ts
    association.ts
    region-tracker.ts
    profile.ts
  render/
    mask.ts
    preview.ts
assets/
  manifest.json
  models/
  runtime/
  emoji/
scripts/
  prepare-assets.mjs
  verify-assets.mjs
  serve-dist.mjs
demo/
  index.html
  embed.html
tests/
  unit/
  contract/
  integration/
  e2e/
  fixtures/
    manifest.json
    calibration/
    acceptance/
dist/
  index.js
  define.js
  index.d.ts
  assets/
  workers/
  demo/
  THIRD_PARTY_NOTICES.txt
package.json
package-lock.json
tsconfig.json
vite.config.ts
playwright.config.ts
README.md
THIRD_PARTY_NOTICES.txt
```

**Structure Decision**: One component library separates native UI integration from media/vision logic; the worker is internal. Consumers copy the complete distribution under any same-origin path. All source/build files above are planned, not created by this command.

## Architecture

1. Connection checks capabilities, starts an instance worker, and loads/verifies all same-origin runtime/model/font assets before ready. No media is acquired automatically.
2. Import validates limits, demuxes, negotiates an output preserving dimensions and every source audio track, decodes the first valid frame, and normalizes orientation. Show paused candidate boundaries and a keyboard-accessible list.
3. Explicit selection establishes one target; capture landmarks/appearance or initialize manual region tracking. Validate/rasterize the emoji locally.
4. Restart at the first valid frame with fresh tracking state. Sequentially detect, associate, record status, render opaque backing and emoji, then await timestamped encoding. Interleave audio. Never skip frames based on load.
5. Hold last accepted geometry during loss, record timed intervals, and attempt conservative unique reacquisition. Held coordinates are not verified coverage; manual-only targets may remain lost.
6. Send masked preview bitmaps with at most one awaiting acknowledgement. Progress metadata is separate. Main-thread controls remain responsive; public events omit embeddings/raw frames.
7. Flush/mux, enforce output cap, and expose a completed Blob for review/download. Show lost intervals. Failure creates no success result.
8. Invalidate job IDs before replacement/settings changes/cancel/reset/disconnect. Abort canceled promises promptly; terminate unresponsive workers. Disconnect releases all media; reconnect begins empty.

## Invariants

- Constructor initializes instance fields/Shadow DOM only. Native connection initializes resources; same-constructor registration is idempotent, conflicting registration throws.
- No shared mutable media/session/identity state. One active operation per instance. Replacement aborts prior work; duplicate processing rejects. Stale messages are ignored and their transferables closed.
- Local File input only: no src URL attribute or remote-media method.
- Cache verified worker/runtime module bytes and model assets in instance memory before ready; use Blob module/runtime URLs for worker creation and offline restart after forced cancellation. No unresolved worker chunks or reliance on HTTP cache. Host CSP requirements and URL cleanup are explicit in the component contract.
- Geometry uses display-oriented source pixels; reject letterbox clicks. Internal timing is integer microseconds, converted from media seconds at the adapter boundary.
- Fixed ordering, identity references, models, and tracking profile. Determinism must pass measured repeat-run tests.
- Backing covers estimated face geometry regardless of glyph holes; ground-truth coverage is separately tested.
- Target/valid-emoji changes invalidate results. Invalid emoji retains prior settings/result. No partial downloads.
- Preserve supported audio tracks and offsets; any unsupported required audio rejects the route. UI states that audio content remains unchanged.
- Frames, bitmaps, URLs, codecs, inference sessions, and buffers have explicit ownership/release paths. No persistent media outside downloads.

## Validation Strategy

| Requirements | Planned evidence |
| --- | --- |
| FR-001/002; SC-001 | MP4/WebM picker/drop, paused first frame, invalid/corrupt/unsupported inputs |
| FR-003/007 | Multiple/overlapping candidates, keyboard/manual selection, coordinate mapping |
| FR-004/008; SC-002/003/007 | Real-model motion/scale/tilt/crossing/occlusion corpus, three identical runs, zero switches, visible ambiguity |
| FR-005/009; SC-008 | Geometric/pixel coverage, emoji validity, preview/export parity |
| FR-006; SC-005 | Independent output decode, frame order, dimensions, portrait/VFR/B-frames, timing/audio |
| FR-010/011/012; NFR-002/003 | Progress/cancel latency, stale replies, replacement, loss review, accessible status |
| FR-013; SC-009 | Compiled ESM on plain HTML, upgrade/registration, two instances, detach/reinsert, styling |
| NFR-001/004; SC-004 | Page/worker request audit, offline processing, no persistence, disposal |
| SC-006 | Reference 60-second 720p run without an unresponsive-page prompt |

Fixtures must be consented or appropriately licensed and carry identity/boundary/loss/timing annotations and hashes. Separate calibration from acceptance; synthetic timing media cannot replace real tracking tests. Tensor parity, confidence calibration, codec support, coverage, and performance are explicit implementation gates.

Nominated performance reference: Intel Core i5-8250U, 8 GiB RAM, Windows 11; exact Chrome stable version recorded at qualification. Current host: i5-4300U, about 4 GiB RAM, below baseline. No performance result is claimed. Exact environment evidence accompanies eventual test results.

## Phase Outputs and Handoff

Phase 0: [research.md](research.md). Phase 1: [data-model.md](data-model.md), [component contract](contracts/web-component.md), [worker protocol](contracts/worker-protocol.md), [quickstart.md](quickstart.md).

Post-design gates have no unjustified violations. No extension hooks are configured. Next is `$speckit-tasks`. This planning phase creates no application code, installs no runtime dependencies, and claims no runtime validation.

## Complexity Tracking

No constitution violations or exception requests. Worker/media/model dependencies serve responsiveness, ordered export, and target continuity; framework/backend layers are unnecessary.
