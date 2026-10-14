# Quickstart and Validation: Privacy Mask Video Web Component

The component and plain HTML demos are implemented. Runtime testing, fixture
acquisition, calibration and qualification are deferred at the user's request
(2026-10-14). The validation scenarios below are the deferred acceptance plan,
not passing results. TypeScript compilation, asset integrity and builds are the
active checks. Public API details are in [contracts/web-component.md](contracts/web-component.md);
entities/timing are in [data-model.md](data-model.md). Actual implementation
status is recorded in [validation/final.md](validation/final.md).

## Prerequisites

- Node.js 24 LTS and npm; a desktop browser with the capabilities in [plan.md](plan.md).
- HTTPS or localhost static hosting. Opening an HTML file directly with file:// is not a supported worker/module deployment.
- Network access for development dependency installation and pinned asset preparation only. End-user processing is fully local after ready.
- Asset/model manifests and third-party notices. Licensed/consented annotated
  fixtures are needed when deferred runtime tests resume; they do not block
  building or using the local demo. Acquisition scripts never receive a user's video.
- For the performance claim: the nominated i5-8250U/8 GiB/Windows 11 reference or a documented equivalent, with the exact browser version and codec probe results recorded. The current approximately 4 GiB workspace host is below the baseline.

## Planned setup and scripts

From the repository root:

```powershell
npm ci
npm run assets:prepare
npm run assets:verify
npm run dev
```

Script contracts:

| Command | Required behavior |
| --- | --- |
| `assets:prepare` | Fetch only version/commit-pinned model/font/runtime resources from the checked-in manifest; verify hashes and notices; no floating latest URLs. Runtime preparation is complete before offline checks. |
| `assets:verify` | Verify every shipped asset against the manifest, required model tensors, matching JS/WASM versions, and included license notices. Missing/mismatched assets fail. |
| `dev` | Build and serve the plain-HTML distribution on localhost:5173/demo/index.html using Vite. Restart after source edits. No browser is opened automatically. |
| `typecheck` | Check main-thread, worker, and public declaration boundaries. |
| `test` | Run pure unit tests once, without watch mode. |
| `build` | Produce ESM entries/declarations, workers, all assets/notices, and plain demo files under dist. Fail on missing pinned assets. |
| `serve:dist` | Serve dist statically at localhost:4173 with correct JS/WASM/font/media MIME types, without a framework runtime or cross-origin isolation headers. |
| `test:browser` | Launch/use the compiled static host and run Playwright component/integration/end-to-end tests; no live-server dependency for ordinary CI runs. |
| `test:privacy` | Run compiled-host page/worker request capture plus offline full-workflow scenarios. |
| `test:performance` | Run the 60-second baseline with visible browser UI and environment evidence; report unsupported/insufficient environment instead of claiming pass. |

## Active build checks

```powershell
npm run typecheck
npm run build
```

Testing commands remain available but are deferred. The existing `npm test`
suite covers setup tooling only; browser/story suites have not been authored.
Acquire the annotated corpus and install Chromium when resuming qualification:

```powershell
npx playwright install chromium
npm run fixtures:verify
npm test
npm run test:browser
npm run test:privacy
npm run test:performance
```

Run checks once on unchanged inputs; rerun affected checks after fixes. When
testing resumes, browser validation must include real ONNX inference and real
media decoding/export. Missing fixtures fail explicitly. None of the acceptance
scenarios below has been validated by the current implementation build.

For interactive validation:

```powershell
npm run serve:dist
```

Open http://localhost:4173/demo/index.html. The distributed demo imports ../define.js; embedding elsewhere requires copying the full distribution and using the relative/nested path shown in the component contract.

## Scenario 1 — Plain HTML import, selection, and download

1. Use the compiled demo on the static server. Import a valid MP4 through the file picker, then repeat with WebM via drag-and-drop.
2. Confirm the first valid frame stays paused. Every annotated detectable initial face has a selectable boundary/list entry. Processing is unavailable before explicit selection.
3. Select the second of several faces by click and then, on a separate run, by keyboard list selection. Choose a preset and a supported custom emoji.
4. Process, inspect progress/status, review, and download. Open the result in an independent compatible player and decoder.
5. Verify selected identity coverage on every annotated trackable frame, no identity switches, expected emoji, original displayed dimensions/orientation, presentation order, and audio content. Check duration tolerance from SC-005 and relative audio/video timing.

Expected: the entire experience resides in the native custom element, with no UI framework or host application required.

## Scenario 2 — Deterministic tracking and manual fallback

Use fixtures for translation, scale, head tilt, crossings, partial/full occlusion, exit/re-entry, and no initial detection. Run each three times with the same file, selection, settings, model/profile/runtime hashes, and browser/device configuration. Compare internal per-frame target assignments, geometry, and statuses exactly. Do not compare encoded output bytes as a determinism test.

For no-face detection, draw a valid manual region and repeat using its labeled numeric input. Reject zero/out-of-bounds boxes. Confirm the region attempts tracking and does not invent landmarks. Verify ambiguous matches become lost, held geometry is labeled, and timed loss intervals appear in review. Manual targets without an appearance anchor may remain lost after disappearance. Successful file export does not count as proof of coverage.

Expected: acceptance clips meet SC-002/003/007, or the test fails visibly. Do not remove hard clips or change thresholds on the acceptance set to report success; tune using separate calibration fixtures.

## Scenario 3 — Timing, audio, unsupported input, and resource limits

Test portrait rotation metadata, variable frame rate, B-frames, nonzero initial timestamps, audio track offsets, silent input, multiple audio tracks, corrupted/empty containers, unsupported codecs, excessive dimensions/duration/size, and a forced encoder failure. Preserve supported audio through packet copy or verified local transcode. Reject unsupported preservation routes before expensive processing. Never silently downscale, drop audio, or offer a partial output.

Expected: clear recoverable errors for unsupported cases; playable correctly timed output for supported cases; old output is never mislabeled as the newly loaded video.

## Scenario 4 — Offline privacy

1. Use the compiled static build, which has no development hot-reload WebSocket. Start page and worker request capture before component initialization.
2. Await initialize/pmv-ready so model/runtime/font resources are resident. Record the fixed same-origin asset requests; none may contain media-derived data.
3. Disable network access while leaving the page open. Import, select, change emoji, process, cancel/retry, review, and download a local clip. Force the nonresponsive-worker termination path and retry offline to prove resident worker/runtime modules are sufficient without an HTTP cache hit.
4. Assert no new processing-time network requests, no telemetry/uploads, and no media in browser persistent stores. Repeat with two instances initialized before going offline.

Expected: SC-004 passes; incomplete asset warmup is a failure rather than an excuse to fetch missing resources during processing. Offline page reload is outside scope.

## Scenario 5 — Component API, lifecycle, and concurrency

Use the compiled two-instance page at /demo/embed.html. Exercise attributes/properties/methods/events from the contract, including properties set before registration, repeated registration, conflicting tag registration, disabled behavior, invalid emoji, and same-origin asset-base validation.

Load different files in two instances; changing/canceling one must leave the other unaffected. Replace a file during processing and inject delayed old-worker replies in the contract harness: old results cannot overwrite the new source. Remove an active element and verify canceled promise, worker termination, and disposal. Reinsert it and expect fresh empty state. Repeat load/process/reset cycles and check owned-resource counters for leaks.

Expected: SC-009 passes from a plain page under both root and nested URL paths, without cross-origin isolation. Host styles remain outside the shadow UI except documented CSS properties/parts; hidden works; internal buttons do not submit a surrounding form.

## Scenario 6 — Responsiveness and accessibility

On the recorded reference environment, process the 60-second 1280x720/30fps clip while interacting with controls. Measure advancing progress notifications at intervals no greater than one second and cancellation acknowledgement within one second. Verify a long inference does not block the main-thread cancel acknowledgement. Record processing time and peak resource observations without imposing real-time throughput as a success condition.

Navigate file import, face selection, manual region entry, emoji choice, process/cancel, review, and download using the keyboard. Confirm visible focus, labeled controls, readable loss/error text, and usable status announcements.

## Evidence to retain locally

Record application commit, dependency lock hash, model/asset/profile hashes, fixture IDs/hashes and provenance, CPU/RAM/OS, exact browser version, actual codec capabilities, command results, network assertions, repeated tracking comparisons, independent output checks, and performance timings. Do not attach private user media or identifying frame logs to external services. Report a test as unverified if its required device or fixture is unavailable.
