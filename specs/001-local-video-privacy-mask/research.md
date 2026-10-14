# Research: Standard Web Component for Local Video Privacy Masking

**Date**: 2026-10-13. Decisions below resolve the planning questions; they are design choices, not claims of completed implementation validation.

## R1 — Component delivery and lifecycle

**Decision**: Build an autonomous `<privacy-mask-video>` element extending `HTMLElement`, with an open Shadow DOM and native controls. Author in strict TypeScript, publish browser ES modules plus declarations, and provide an explicit registration function and a separate auto-registration entry. Vite is build/development tooling only. The consuming page needs neither a framework nor a bundler.

**Rationale**: This directly satisfies the user's standard Web Component constraint. Native lifecycle callbacks, attributes, and DOM events supply the integration boundary. Handle properties set before upgrade, make connection initialization idempotent, and dispose per-instance workers and media on disconnect. CSS custom properties and named parts provide controlled styling.

**Alternatives considered**: React/Vue application shells add an unwanted consumer runtime. Lit could implement a conforming custom element but is unnecessary for this small UI. Customized built-in elements and an iframe would complicate the intended embedding contract.

**Sources**: [HTML custom elements standard](https://html.spec.whatwg.org/multipage/custom-elements.html), [custom-element best practices](https://web.dev/articles/custom-elements-best-practices), [Shadow DOM guide](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM).

## R2 — Ordered local media processing

**Decision**: Use Mediabunny with WebCodecs in a dedicated module worker. Read a local `File` with `BlobSource`; restrict input demuxers to MP4 and WebM. Iterate `CanvasSink.canvases()` sequentially, apply masking, and await `CanvasSource.add(timestamp, duration)` for every output frame. Decode through a small canvas pool, normalize source orientation once, and preserve original presentation timestamps and durations. Preview may be throttled independently of export.

**Rationale**: The documented sinks expose ordered frames, their timing, and worker-compatible canvases. Explicit sample timing makes batch processing independent of playback speed. Treat seconds in the media adapter and integer microseconds internally as different units; conversion and rounding occur only at the adapter boundary.

**Alternatives considered**: Live `MediaRecorder` capture and repeated video seeks are not selected for authoritative export because they do not provide this explicit, ordered batch pipeline. FFmpeg.wasm adds a large runtime and separate codec-build concerns. Maintaining custom demuxers and muxers would expand the project unnecessarily.

**Sources**: [Mediabunny sinks](https://mediabunny.dev/guide/media-sinks), [sources and backpressure](https://mediabunny.dev/guide/media-sources), [WebCodecs specification](https://www.w3.org/TR/webcodecs/), [MediaStream Recording specification](https://www.w3.org/TR/mediastream-recording/). The preference over recording a live stream is an architectural inference from these APIs.

## R3 — Export capabilities, audio, and memory

**Decision**: Select one supported output route before processing: prefer MP4/AVC with compatible AAC audio, otherwise WebM/VP9 or VP8 with Opus. Probe actual decoder/encoder configurations, dimensions, and audio layout, rather than infer support from browser name or container extension. Remux original audio packets if compatible; otherwise transcode locally with explicit support checks. Reject an unsupported route before processing instead of silently losing audio. Preserve the original relative audio/video start offset using a single timeline origin.

**Rationale**: WebCodecs support varies by codec, platform, and configuration. Interleave audio/video production and await writes to bound queues. In-memory export has a finite cost even when frame processing is bounded: initial defaults cap input at 256 MiB, encoded output at 256 MiB, display dimensions at 1920 by 1920 with no more than 2,073,600 pixels, and duration at 10 minutes. These are disclosed resource limits, not performance promises. Limits fail with a recoverable error and may be revised only with validation.

**Alternatives considered**: Guaranteeing every MP4 codec or every browser is not feasible. Streaming to a user-selected file is a future extension; it is not required for the initial Blob-based download contract. Silent resizing and silent audio removal would violate the specification.

**Sources**: [Supported formats and codec checks](https://mediabunny.dev/guide/supported-formats-and-codecs), [media file writing and targets](https://mediabunny.dev/guide/writing-media-files), [audio packet sources](https://mediabunny.dev/guide/media-sources).

## R4 — Face detection and local appearance matching

**Decision**: Use `onnxruntime-web/wasm` with the CPU WASM execution provider inside the component's worker, `numThreads = 1`, and matching self-hosted WASM binaries. Bundle the fixed-shape `face_detection_yunet_2023mar.onnx` detector and `face_recognition_sface_2021dec.onnx` appearance model from OpenCV Zoo. Honor the pinned model's actual tensor shapes. Port and test preprocessing, YuNet output decoding/NMS, and five-point SFace alignment against the upstream reference. No custom OpenCV.js build is required.

**Rationale**: YuNet supplies face boxes and five landmarks, sufficient for in-plane tilt. SFace provides transient within-clip appearance comparisons for target continuity; this feature does not identify named people. Single-threaded inference and fixed preprocessing reduce sources of repeat-run variation. ONNX Runtime's privacy document explicitly excludes WebAssembly builds from its telemetry collection.

**Alternatives considered**: MediaPipe Tasks' current upstream privacy notice describes performance/utilization reporting, so merely self-hosting its assets does not establish the desired network behavior. A custom OpenCV.js DNN build adds a substantial build/binding burden. Position-only nearest-neighbor matching is inadequate when people cross.

**Sources**: [ORT environment settings](https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html), [ORT deployment](https://onnxruntime.ai/docs/tutorials/web/deploy.html), [ORT privacy](https://raw.githubusercontent.com/microsoft/onnxruntime/main/docs/Privacy.md), [YuNet model](https://github.com/opencv/opencv_zoo/blob/main/models/face_detection_yunet/README.md), [SFace model](https://github.com/opencv/opencv_zoo/blob/main/models/face_recognition_sface/README.md), [detector reference](https://raw.githubusercontent.com/opencv/opencv/4.x/modules/objdetect/src/face_detect.cpp), [alignment reference](https://raw.githubusercontent.com/opencv/opencv/4.x/modules/objdetect/src/face_recognize.cpp), [MediaPipe notice](https://github.com/google-ai-edge/mediapipe).

## R5 — Deterministic association and manual fallback

**Decision**: Detect candidates on every frame. Use deterministic candidate ordering and NMS; associate the chosen target with motion/scale/landmark gates plus cosine similarity to its frozen initial appearance. Accept only a candidate that passes an absolute confidence threshold and a runner-up margin. Lock preprocessing, numeric thresholds, tie-breaking, and model hashes in a versioned tracking profile. Equal or ambiguous matches are lost, not accepted through tie-breaking. Reacquisition uses appearance across the whole frame with stricter thresholds; motion gates widen by elapsed media time, not wall-clock time.

**Rationale**: Target selection must persist through motion without silently switching people. Algorithm repeatability does not prove correct identity assignment. The annotated crossing/occlusion corpus is a release gate, and failed cases require improving or conservatively rejecting association rather than weakening the criterion. Frozen identity references avoid gradual drift toward a different face.

**Manual fallback**: A valid user rectangle initializes a grayscale, fixed-resolution reference patch. A deterministic bounded normalized cross-correlation search over fixed position/scale/roll candidates attempts tracking while per-frame detection continues. Weak, low-texture, or ambiguous results become lost. Acquire facial landmarks and an appearance reference only when a detection uniquely agrees with the region track. Without an acquired face reference, complete disappearance has no reliable identity-based reacquisition; remain lost unless a unique bounded region match is possible. Do not invent landmarks or require the user to select an automatically detected face to use the manual path.

**Alternatives considered**: Randomized fitting, wall-clock-based frame skipping, or adaptive workload-dependent thresholds compromise repeatability. Optical flow is possible but adds another runtime or algorithm implementation; bounded template search is the initial manual-only path. No model establishes a universal identity guarantee.

**Evidence boundary**: This association procedure is the project's engineering design. The models supply detections and appearance descriptors, not a proven tracker for this application. Before final thresholds are frozen, calibration must use separate calibration fixtures; the acceptance fixtures remain held out. Identical input runs must meet SC-003 on the qualified environment; CPU/WASM alone is not evidence of passing it.

## R6 — Emoji rendering and full coverage

**Decision**: Self-host a pinned Noto Color Emoji font and a supported-sequence manifest. Validate one supported emoji sequence, rasterize it once on the main thread after the font is loaded, and transfer the bitmap to the worker. Reuse that bitmap for preview/export. Always draw an opaque backing centered at the tracked face. A circle with radius at least half the face-box diagonal plus fixed padding encloses the entire axis-aligned face boundary at any emoji rotation. Clip at the video edge.

**Rationale**: Platform glyph differences and transparent emoji edges must not determine privacy coverage. The support manifest restricts custom input to sequences proven to render with the shipped font. Font loading is part of initialization, so changing emojis does not fetch resources during offline processing.

**Alternatives considered**: System-font-only rendering can vary by host. Emoji glyph bounds without an opaque backing do not guarantee face coverage. Generating new artwork is unnecessary.

**Source**: [Noto Emoji distribution and font license](https://github.com/googlefonts/noto-emoji). The geometric coverage rule is a project design decision.

## R7 — Asset delivery, privacy, and distribution

**Decision**: Distribute all runtime modules, WASM, models, emoji resources, asset hashes, and notices with the package. Defaults resolve relative to the distributed entry module; an optional same-origin asset base supports host layouts. Initialize all processing assets before reporting ready. Asset reads use fixed allowlisted URLs, no media-derived query parameters, and no telemetry. There are no media upload APIs, backend services, cookies, or persistent media stores.

**Rationale**: A standard element must be embeddable in an ordinary HTTPS/localhost page without cross-origin isolation headers, a CDN, an application router, or a service worker. Single-threaded WASM avoids a mandatory SharedArrayBuffer deployment prerequisite. The trusted host page shares access to JavaScript state; Shadow DOM is UI encapsulation, not a security sandbox. The component cannot make privacy guarantees about unrelated host scripts.

**Alternatives considered**: Runtime CDN downloads and hidden remote fallbacks contradict reliable offline processing. Persisting video in IndexedDB/OPFS complicates the session-only lifetime without being needed for the first release.

**Distribution checks**: Lock dependency versions at implementation, record immutable model/font revisions and SHA-256 values, validate asset integrity, and include upstream notices. Current upstream licenses are Mediabunny MPL-2.0, ONNX Runtime MIT, YuNet MIT, SFace Apache-2.0, and Noto font OFL-1.1. Preserve the corresponding licenses when packaging. This is dependency provenance, not a legal assessment.

**Offline worker restart**: Loading models once is insufficient if cancellation terminates a worker and its replacement fetches scripts again. During initialization, retain the verified self-contained worker module, ORT companion module/WASM bytes, and model buffers in memory. Create instance-owned Blob URLs for worker/runtime modules and use the runtime's explicit module/WASM path overrides. Bundle worker dependencies without network-loaded chunks. Retain these immutable resources across cancellation, and revoke them on disconnect. This requires Blob worker/module permission under a restrictive host CSP and an offline forced-termination/retry test; it must not depend on an incidental HTTP cache hit.

**Sources**: [Mediabunny upstream](https://github.com/Vanilagy/mediabunny/blob/main/README.md), [ONNX Runtime license](https://github.com/microsoft/onnxruntime/blob/main/LICENSE), model/font sources in R4/R6, [ORT self-hosting](https://onnxruntime.ai/docs/tutorials/web/deploy.html).

Runtime override details: [ORT WebAssembly configuration API](https://onnxruntime.ai/docs/api/js/interfaces/Env.WebAssemblyFlags.html). Pin and test the matching runtime module/binary combination; module and binary overrides must both resolve to resident resources.

## R8 — Validation and supported environments

**Decision**: Qualify desktop Chromium first with actual WebCodecs configurations, module workers, OffscreenCanvas, WASM, and local font rendering in a secure context. Other browsers get capability checks and actionable errors until qualified; Web Component conformance does not imply universal codec availability. Use Vitest for pure tracking/timing/geometry invariants and Playwright for real-browser component, media, lifecycle, offline, and multi-instance scenarios.

**Rationale**: The standalone compiled element must be tested outside the development shell. Browser tests must use real decoding, inference, and exported media alongside mock-driven edge-case tests. Record application/model/profile hashes and exact browser versions per run. The nominated performance reference is an Intel Core i5-8250U, 8 GiB RAM, Windows 11, and a pinned Chrome stable build at qualification time. This is a qualification target, not a machine claimed to be available or tested.

**Current environment evidence**: Planning inspection found Node 24.12.0/npm 11.6.2 and a Windows 10 machine with an i5-4300U (two cores/four threads) and approximately 4 GiB RAM. It is below the specification's performance baseline; it can support design work and potentially functional checks, but cannot substantiate SC-006 for the reference device.

**Alternatives considered**: DOM emulators alone cannot validate canvas codecs, WASM, privacy, or resource lifetime. A visual demo alone cannot prove that all frames were masked. Browser/tool versions are captured when dependencies are locked and tests are run, rather than guessed during this documentation phase.

## Resolution summary

All architectural questions have decisions: native custom element, worker ownership, ordered media pipeline, local inference models, conservative association, manual fallback, emoji coverage, output/audio negotiation, resource limits, and browser qualification. Model compatibility, confidence calibration, performance, and coverage are explicit implementation validation work; none is represented as already proven.
