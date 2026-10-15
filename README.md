# Privacy Mask Video

A native `<privacy-mask-video>` Web Component for choosing up to eight faces in a local
MP4/WebM video, covering it with an emoji, reviewing tracking losses, and
downloading the result. No UI framework or consumer bundler is required.

Implementation is available. **Runtime testing and qualification are deferred
at the user's request.** Tracking thresholds are provisional and uncalibrated.
Compilation/build success does not establish tracking accuracy, output coverage,
browser compatibility, offline behavior, or performance. Review all output.

## npm package

The release name is `privacy-mask-video`, version 0.1.1 (experimental).

```powershell
npm install privacy-mask-video
```

Copy node_modules/privacy-mask-video/dist/ in its entirety to a directory served
on your origin, then use the ordinary HTML embedding example below. The package
includes the worker, WASM, models, emoji PNGs, sequence manifest and third-party
notices; installed consumers do not need to download resources from upstream.
Asset and worker subpaths are exported for host tooling. Importing the component
does not automatically copy static assets for a consuming bundler.

Maintainers can run the **Release** workflow from GitHub Actions or push a
`v<package.json version>` tag. It restores pinned assets, compiles/builds and
inspects the archive, publishes to npm with provenance, verifies registry
integrity, and creates an experimental GitHub release with the archive and
checksum. The final job runs dependency auditing and CodeQL security analysis.
Runtime testing remains deferred. A failed security job requires review even
when publication has already succeeded; it cannot undo a published version.
If npm requires account 2FA for direct publication, run the workflow with mode
`stage`, then approve the prepared version in npm's Staged Packages tab. Staging
creates the GitHub prerelease with an explicit npm-pending note. After approval,
the archive checksum can be compared with npm's `dist.integrity`; update the
release note to reflect confirmed publication.

Initial publishing uses the encrypted `NPM_TOKEN` repository secret. Configure
npm trusted publishing for owner `evan-hyer`, repository `privacy-mask-video`,
workflow `release.yml`, with direct publication allowed, then remove that secret
to use short-lived OIDC credentials. See
[npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).

## Run locally

Use Node.js 24:

```powershell
git clone https://github.com/evan-hyer/privacy-mask-video.git
cd privacy-mask-video
npm ci
npm run assets:prepare
npm run dev
```

Open http://localhost:5173/demo/index.html. The dev command builds the distribution
and serves it with Vite; restart it after source changes. It does not open an
extra window. For a plain static host with no development WebSocket:

```powershell
npm run build
npm run serve:dist
```

Open http://localhost:4173/demo/index.html. demo/embed.html contains two independent
components and demonstrates pre-upgrade properties. The same distribution is
available at /nested/components/privacy-mask-video/demo/index.html for nested
hosting. npm publication distributes the component library; it does not deploy
or host a website.

## Embed in an ordinary page

Copy the **entire dist/** directory to a same-origin directory, preserving all
modules, workers, assets and notices:

```html
<script type="module" src="/components/privacy-mask-video/define.js"></script>
<privacy-mask-video emoji="😎" aria-label="Mask a face locally"></privacy-mask-video>
```

For explicit registration:

```js
import { definePrivacyMaskVideo } from '/components/privacy-mask-video/index.js';
definePrivacyMaskVideo();
const component = document.querySelector('privacy-mask-video');
component.addEventListener('pmv-error', event => {
  console.info(event.detail.code, event.detail.message);
});
await component.initialize();
// Obtain a local File from a file input, then:
await component.load(file);
if (component.faces.length) component.selectFace(component.faces[0].id);
// Alternatively: component.selectRegion({ x: 20, y: 30, width: 100, height: 120 });
const result = await component.process();
// Retrieve result.blob directly, or call download() from a user gesture.
```

index.js exports the element class, explicit registration, public types and typed
errors. Its import does not register the tag. define.js auto-registers. Repeated
registration using the same constructor is harmless; a conflicting constructor
throws NotSupportedError. index.d.ts and supporting declarations ship in dist/.

## Configuration and methods

| Attribute | Property | Behavior |
| --- | --- | --- |
| emoji | emoji | Default 😎. One of the bundled 22 canonical sequences; valid changes cancel an active run and invalidate output. Invalid input throws TypeError, reports an error and retains the previous value/result. |
| disabled | disabled | Boolean attribute; even disabled="false" disables. Blocks new import/selection/process actions; cancel/reset remain available and existing processing continues. |
| asset-base | assetBase | Optional same-origin assets directory. Set before first connection; a later change throws TypeError. |

Pre-upgrade property values win over conflicting initial attributes. No network
or processing starts in the constructor. Read-only state, capabilities, source,
faces and result properties return defensive frozen snapshots. source contains
metadata, not the File; faces contains initial candidate boundaries/landmarks,
not appearance descriptors. result is null until finalization succeeds.

| Method | Behavior |
| --- | --- |
| initialize() | Initialize or retry local resources while connected; Promise of capability report. |
| load(file) | Accept a positive-sized local File; await initialization, preflight export, show the first decoded frame and detectable candidates. Invalid arguments retain valid prior media; an accepted replacement cancels old work and clears old results. |
| selectFace(id) | Select one current initial-frame candidate, replacing the selection. Processing never starts automatically. |
| selectFaces(ids) | Replace the selection with up to eight distinct current candidate IDs; an empty array clears it. |
| selectRegion(rect) | Select a finite, positive rectangle entirely within the display-oriented source dimensions. |
| process() | Process from the beginning with fresh identity state; Promise of a finalized ExportResult. Concurrent process calls reject. |
| cancel() | Abort active work and reject its promise with AbortError; retain source/selection after processing cancellation. A worker that has not acknowledged within 250 ms is terminated. |
| reset() | Clear media/results; retain configuration and reusable resident assets. |
| download() | Initiate local browser download of a current completed result. Use a user gesture. |

Each instance owns its worker, identity state and media. Disconnect terminates
work, rejects operations, closes bitmaps, revokes URLs and clears its media and
assets. Reinsertion initializes an empty session. A host retaining a returned
Blob owns that reference and any object URLs it creates.

## Events and styles

Events bubble and cross Shadow DOM boundaries. Their detail objects are defensive
snapshots, without input Files, image payloads, embeddings, or private stack data.

| Event | Detail |
| --- | --- |
| pmv-ready | capabilities |
| pmv-statechange | previous, state, jobId |
| pmv-loaded | sourceId, width, height, durationUs, faceCount, audioTrackCount |
| pmv-selectionchange | sourceId, selectionId, kind, candidateId |
| pmv-progress | jobId, stage, processedFrames, timestampUs, durationUs, ratio |
| pmv-trackingchange | jobId, status, reason, timestampUs |
| pmv-complete | jobId, filename, MIME type, dimensions/timing/counts and lostIntervals; retrieve the Blob through result or process() |
| pmv-cancel | jobId, reason |
| pmv-error | code, message, recoverable, jobId |

The selectedFaceIds getter returns a defensive snapshot of selected detected-face IDs. Face buttons and preview taps toggle selection; selectFace(id) retains its exclusive-selection API behavior. Manual selection replaces detected-face selections. Export results include targetCount and per-target targetLosses alongside the aggregate lostIntervals.

Error detail optionally includes a diagnostic with a fixed stage/reason, known public resource path and HTTP status. It never includes raw exceptions, file names, URLs, media or embeddings. The component itself sends no telemetry.

State changes precede their associated events. Complete is emitted after the
result becomes accessible and before process() resolves. Stale replies are
discarded and transferred bitmaps closed. Status text distinguishes file
completion from face coverage; review has seek buttons for lost intervals.

CSS properties: --pmv-accent, --pmv-background, --pmv-text,
--pmv-border-radius. Parts: container, drop-zone, preview, face-list, controls,
status, progress, review, download-button. Host hidden behavior is respected.
Controls have labels and type="button", keyboard face selection, numeric manual
selection, and throttled status announcements.

## Processing and limitations

The worker uses single-thread ONNX Runtime CPU/WASM, pinned YuNet/SFace models,
fixed ordering/thresholds and a frozen within-clip appearance reference. YuNet
detects every frame; ambiguous matching becomes loss with held geometry.
Manual targets use a fixed grayscale correlation template. Brief local recovery
is conservative; longer disappearance without an appearance anchor remains
lost. Each selected face has its own frozen reference and tracker. Competing claims on one detected face are treated as ambiguous for both targets and retain their previous geometry. No named-person lookup or remote face processing is used.

An opaque circular backing encloses the tracked rectangle, including when the
emoji has transparent margins. This establishes coverage of the estimate; it
does not prove coverage of the intended person during tracking errors or loss.
The profile in src/vision/profile.ts is explicitly uncalibrated.

Mediabunny/WebCodecs reads presentation-ordered samples. The adapter validates
each decoded display size before drawing into a two-canvas pool, bakes orientation
and flip into pixels, and retains timestamps/durations on a common audio/video
timeline. Every successfully processed frame is masked and submitted to the
encoder with backpressure. Preview throttling does not skip export frames.

Export prefers MP4/AVC/AAC, then WebM/VP9 or VP8/Opus, with actual configuration
probes. All audio tracks are retained using compatible packet copy or local
transcoding. Unsupported preservation routes fail; no silent resize or audio
removal. Audio content is not anonymized.

Resource limits: 256 MiB input and output each, 10 minutes, 1920 pixels per side,
and 2,073,600 displayed pixels. Encoded output is capped during writes before
allocation. MP4 fast-start is disabled to limit buffering. The completed Blob is
kept in memory; processing speed depends on hardware and codecs. Extra video
tracks, unusable timing, changing dimensions and unsupported codecs are rejected.

## Hosting and assets

Serve over HTTPS or localhost with correct module, WASM, PNG and media MIME
types. file:// hosting is unsupported. The host needs module workers,
OffscreenCanvas 2D, WebCodecs, WebAssembly/SIMD and PNG ImageBitmap support. No browser
has completed qualification yet; capability probes determine actual routes.

All fixed processing resources load from the host origin before ready. Emoji images replace the CBDT/CBLC font that Apple renderers cannot load; no downloadable font is required. The
component retains verified model data, emoji images, worker and runtime Blob URLs for
offline retries while connected. Disconnect releases them. Offline page reload
is outside scope. No service worker, upload API, analytics or persistent media
store is installed. The trusted host page can access local results; Shadow DOM
provides style encapsulation rather than a security boundary.

A restrictive CSP must permit initial same-origin assets, Blob workers and Blob
module imports, WASM compilation (wasm-unsafe-eval where applicable), component
inline shadow styles and Blob review media. Appropriate
directives include script-src, worker-src, connect-src, style-src and
media-src. The component never changes CSP. COOP/COEP are not required for its
single-thread runtime.

Exact dependency versions are locked. assets/manifest.json records resource
revisions, hashes, sizes, actual runtime tensor signatures and license texts.
Large binary assets are ignored by Git; assets:prepare restores them and rejects
mismatched resident files. The build adds the emitted worker hash to the
distribution manifest. Full licenses ship in assets/licenses/ and are listed in
THIRD_PARTY_NOTICES.txt.

The project's original code currently has no open-source license grant
(package metadata: UNLICENSED). Third-party resources retain their included
upstream licenses.

## Checks and deferred testing

```powershell
npm run assets:verify
npm run typecheck
npm run build
```

Testing was deferred on 2026-10-14. Existing npm test covers setup tooling, diagnostic sanitization and multi-target conflict resolution. It does not qualify tracking accuracy. Browser, privacy, performance, repeatability, codec,
audio/timing, reference-alignment and per-frame face-coverage testing remain
deferred, as do real fixture acquisition and profile calibration. These tasks
are unchecked in specs/001-local-video-privacy-mask/tasks.md. Explicit browser
scripts retain their fixture gate and fail on an absent corpus; they do not
manufacture a passing result.

See specs/001-local-video-privacy-mask/validation/final.md for the implementation
mapping, actual compilation/build results and deferred qualification work.
