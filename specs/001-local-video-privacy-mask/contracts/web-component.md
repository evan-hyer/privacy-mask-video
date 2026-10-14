# Public Contract: <privacy-mask-video>

Status: API implemented; runtime acceptance testing is deferred at the user's
request. This remains the normative contract for FR-013/SC-009 and the workflow
in [../spec.md](../spec.md). The authoritative state/coordinate model is
[../data-model.md](../data-model.md). Compilation is not proof of conformance;
see [../validation/final.md](../validation/final.md).

## Distribution and registration

The package's proposed local name is `privacy-mask-video`; no registry publication is implied. The distribution contains `index.js`, `define.js`, `index.d.ts`, `workers/`, `assets/`, and third-party notices. All assets must remain accessible on the host origin. Worker/module asset paths resolve from `import.meta.url`, not the document's route.

- `index.js` exports `PrivacyMaskVideoElement`, `definePrivacyMaskVideo()`, and public types; importing it does not register the element.
- `definePrivacyMaskVideo(): void` registers the fixed tag `privacy-mask-video`. Repeating it with the same exported class is harmless; an existing different class produces `NotSupportedError`.
- `define.js` invokes that registration function for declarative use.
- No React/Vue/Lit runtime, application router, consumer bundler, server, iframe, service worker, or cross-origin isolation headers are required.
- The demo consists of ordinary HTML hosting the same distributed component, not a separate implementation of its UI.

Minimal host, after the package is built and copied to `/components/privacy-mask-video/`:

```html
<script type="module" src="/components/privacy-mask-video/define.js"></script>
<privacy-mask-video emoji="😎" aria-label="Mask a face in a local video"></privacy-mask-video>
```

## Attributes and properties

| Attribute | Property | Contract |
| --- | --- | --- |
| `emoji` | `emoji: string` | Default 😎. One canonical supported sequence from the bundled manifest. Property and attribute reflect each other. Valid change invalidates output and cancels an active run; invalid value retains the previous setting/result and emits a configuration error. |
| `disabled` | `disabled: boolean` | Boolean presence semantics: `disabled="false"` still disables. Prevents new import/selection/process actions; cancel/reset remain enabled. Does not implicitly stop an existing run. |
| `asset-base` | `assetBase: string` | Optional same-origin directory for model/runtime/font assets. Default is the distribution's assets directory. Set before first connection; later changes reject/restore the previous value and require a new element to change asset location. |

All these properties set before custom-element upgrade are replayed through their setters after upgrade. An explicit pre-upgrade property wins over a conflicting initial attribute. Property changes before connection perform validation/configuration only; no media or worker starts in the constructor.

Read-only properties:

- `state: ComponentState` from the data model.
- `capabilities: CapabilityReport | null` with readiness/features and general codec support; exact per-file route is evaluated during load.
- `source: SourceSummary | null`, including sourceId, display dimensions, durationUs, container, audioTrackCount; no raw File.
- `faces: readonly FaceSummary[]`: initial candidate IDs, rectangles, and landmarks, available to host-controlled selection. Defensive copies. No identity descriptors.
- `result: ExportResult | null`: completed Blob and metadata only, invalidated on source/target/settings changes.

No `src`, remote URL input, upload method, or persistent media property is defined. Strings such as filenames/emoji/errors are inserted as text, not interpreted as HTML.

## Methods

| Signature | Preconditions and results |
| --- | --- |
| `initialize(): Promise<CapabilityReport>` | Must be connected. Starts or joins resource initialization; resolves after all processing assets/font are resident. Automatic connection initialization uses the same operation. Retry after an initialization failure is allowed. No media is loaded. |
| `load(file: File): Promise<SourceSummary>` | Connected and enabled; awaits initialize. Validate argument/size before replacing a valid source. A valid new request aborts previous work, invalidates previous results, and returns after route preflight, initial decode, and candidate detection. Demux/codec failure after replacement leaves no stale source/result. |
| `selectFace(candidateId: string): void` | Connected/enabled with a loaded source and matching initial candidate. Select exactly one target, invalidate output, cancel an active run. Selection is local metadata; initial appearance extraction occurs at process start. |
| `selectRegion(rect: Rect): void` | Same conditions as selectFace. Rectangle must be finite/nonzero and wholly within display-oriented source bounds. Creates manual target selection even if no face was detected. |
| `process(): Promise<ExportResult>` | Connected/enabled with valid source and selection; rejects duplicate active processing. Rerun from complete/error is permitted when source/selection remain valid. Reinitializes runtime if cancellation terminated the worker. Resolves only after all frames and required audio are finalized into a complete Blob. |
| `cancel(): void` | Idempotent. Invalidate active job and settle its promise with AbortError; visible acknowledgement within one second. No completed partial output. Retain source/selection after processing cancellation; canceled loading returns empty. |
| `reset(): void` | Cancel work, clear source/selection/result/identity and owned media URLs; preserve configuration and reusable non-media assets while connected. |
| `download(): void` | Requires a current complete result; initiates a local browser download with a sanitized filename. Call from a user gesture where the browser requires it. No promise of delivery to disk beyond the browser's download mechanism. |

Synchronous methods throw typed errors for invalid arguments/state; async methods reject with the same types. Initialization triggered by lifecycle callbacks catches its errors and reports them through UI/events, avoiding unhandled rejections. A disconnected instance rejects operational methods with InvalidStateError; cancel/reset remain safe. Disconnect always invalidates the current job before disposing resources.

For property assignment, invalid emoji/asset-base values throw a configuration TypeError and retain the old value; attribute-based invalid configuration is reverted and emits the error event without throwing from lifecycle callbacks. A reflection guard prevents attribute/property loops.

## DOM events

Events are dispatched on the host element with `bubbles: true`, `composed: true`, and `cancelable: false`. Names are prefixed to avoid collisions. Details are read-only snapshots. Programmatic actions use the same events as UI actions; changed values emit once, no-op assignments do not.

| Event | Detail |
| --- | --- |
| `pmv-ready` | `{ capabilities }` after each successful initialization generation; no source loaded by implication |
| `pmv-statechange` | `{ previous, state, jobId }`; jobId null when idle |
| `pmv-loaded` | `{ sourceId, width, height, durationUs, faceCount, audioTrackCount }` |
| `pmv-selectionchange` | `{ sourceId, selectionId, kind, candidateId }`; null candidateId for manual |
| `pmv-progress` | `{ jobId, stage, processedFrames, timestampUs, durationUs, ratio }`; stage processing/finalizing, ratio null if unknown, less than 1 until finalization succeeds |
| `pmv-trackingchange` | `{ jobId, status, reason, timestampUs }` only on acquired/lost/reason changes |
| `pmv-complete` | `{ jobId, mimeType, filename, width, height, durationUs, frameCount, audioTrackCount, lostIntervals }`; no Blob in event |
| `pmv-cancel` | `{ jobId, reason }`; reason user/replaced/settings/reset/disconnected |
| `pmv-error` | `{ code, message, recoverable, jobId }`; no source filename/path, stack, raw frame, or embeddings |

Event ordering: state is updated before its event. Loaded fires after selecting state; selectionchange after selected state; complete after complete state with result already accessible, then process resolves. Error UI/state is updated before error event and rejection. Configuration/argument errors leave valid state intact. Cancellation emits once per active job; stale worker messages emit nothing. Public events do not expose video/frame payloads; a host can explicitly retrieve its local result through the API.

## Errors

Stable codes: `unsupported-platform`, `invalid-file`, `unsupported-input`, `decode-failed`, `no-valid-frame`, `asset-load-failed`, `asset-integrity-failed`, `invalid-selection`, `invalid-emoji`, `invalid-configuration`, `invalid-state`, `unsupported-export`, `resource-limit`, `tracking-failed`, `encode-failed`, `worker-failed`. The error object has name, code, message, and recoverable. Cancel is an AbortError and cancellation event, not a processing-failure event.

No-face detection and ordinary target loss are recoverable workflow states, not fatal errors. Low-confidence matches hold geometry with loss status. Codec failures never initiate remote fallback or silently omit audio.

## Encapsulation, UI, and accessibility

Use open Shadow DOM and native file input, buttons, select/list controls, progress, and review video. Do not repurpose the host's global role, tabindex, class, or style. Set `:host { display: block }` and respect `[hidden]`. Public styles: `--pmv-accent`, `--pmv-background`, `--pmv-text`, `--pmv-border-radius`. Stable parts: `container`, `drop-zone`, `preview`, `face-list`, `controls`, `status`, `progress`, `review`, `download-button`. No slot is needed for the self-contained first release.

Every detected face is available in a keyboard-accessible list synchronized with clickable preview boundaries. Manual selection supports pointer drawing and an equivalent labeled numeric rectangle form. Status uses text and an appropriate live region; progress announcements are throttled. Review identifies lost intervals and unchanged audio. Internal controls do not submit enclosing host forms. Selection handles CSS scaling/letterboxing and source orientation consistently.

## Lifecycle, concurrency, and privacy

Each instance owns its worker and inference/session state. Two instances can load different Files, select different emojis, and cancel independently. Resource failure in one must not mutate the other. Repeated connectedCallback calls do not duplicate listeners/jobs.

Removal aborts work, terminates the worker, closes frames/bitmaps/codecs, revokes owned URLs, releases media/model/font references, and clears source/selection/result. Reinsertion initializes a fresh empty session. Normal DOM moves that disconnect also reset in v1; state-preserving moves are not required.

A host retaining a returned Blob owns that reference and any URLs it creates. Shadow DOM is not a security sandbox: a trusted embedding page must not upload data using unrelated scripts. The component itself has no media network path, telemetry, or persistent media writes.

Host prerequisites: serve modules/workers/assets with correct MIME types from HTTPS/localhost. A restrictive CSP must permit same-origin initial asset loads, Blob module scripts/workers for offline worker restarts, WASM compilation, component shadow styles, and Blob font/media use. Cross-origin asset-base values are rejected. Public assets load before ready; all media work, worker restart after cancellation, and emoji changes then run offline. The component never modifies host CSP or installs a service worker.

## Required contract validation

Use the compiled distribution in framework-free pages under root and nested paths. Cover registration conflicts, property-before-upgrade behavior, attribute reflection, invalid arguments, exact event ordering, keyboard/manual selection, reset/cancel races, two instances, host CSS isolation, hidden behavior, disconnect/reinsert, and resource disposal. A supported custom element can still report unsupported codec capabilities; do not equate Web Component support with universal media support.
