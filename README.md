# Privacy Mask Video

A native `<privacy-mask-video>` Web Component that covers selected faces in local
MOV, MP4, and WebM videos with emoji. Scan a video, choose up to eight faces,
process it on your device, and review the result before downloading.
No UI framework or consumer bundler is required.

**Want to experiment? [Try the live demo](https://d28lux7c66widn.cloudfront.net/privacy-mask-video).**

[npm package](https://www.npmjs.com/package/privacy-mask-video) ·
[Report an issue](https://github.com/evan-hyer/privacy-mask-video/issues)

**Experimental:** face matching can miss faces or create duplicate entries.
Review the full output before sharing. Audio is preserved and is not anonymized.

## Contents

- [Features](#features)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Using the editor](#using-the-editor)
- [JavaScript API](#javascript-api)
- [Events](#events)
- [Styling](#styling)
- [How it works](#how-it-works)
- [Supported media and limits](#supported-media-and-limits)
- [Browser and hosting requirements](#browser-and-hosting-requirements)
- [Privacy](#privacy)
- [Local development](#local-development)
- [Validation status](#validation-status)
- [Releases](#releases)
- [License](#license)

## Features

- Scan every decoded frame for faces, including brief and later appearances.
- Choose up to eight faces from a gallery with thumbnails and first-seen times.
- Keep face numbers and colors stable as selections change; Face 1 is green.
- Remember multiple appearances during discovery to reduce duplicate entries
  after head turns, lighting changes, and later returns.
- Use one of 22 bundled emoji images with an opaque mask backing.
- Select a manual rectangle for an undetected face in the opening frame.
- Follow scan/export progress, cancel processing, and review tracking-loss intervals.
- Export MP4 or WebM while preserving every audio track through a supported route.
- Embed independent component instances in an ordinary HTML page.

These features describe the current repository. Its package version is **0.1.3**;
the npm `latest` tag was **0.1.2** when checked on October 17, 2026. Installing
from npm or visiting the demo may provide a different revision. Source changes
reach those destinations after a package release or site deployment.

## Installation

Install the published package:

```sh
npm install privacy-mask-video
```

Copy the **complete** `node_modules/privacy-mask-video/dist/` directory to a
same-origin location such as `/components/privacy-mask-video/`. Preserve its
JavaScript chunks, workers, assets, and notices. The package includes the models,
WASM runtime, emoji images, and TypeScript declarations; installed consumers do
not need to fetch upstream model resources.

Importing the package does not copy static assets into your application. If you
use a bundler, configure asset copying explicitly. To use the current source
version, follow [Local development](#local-development) and copy the built `dist/`.

## Quick start

After copying the distribution, add the component to a page served over HTTPS
or localhost:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Mask faces in a video</title>
    <script type="module" src="/components/privacy-mask-video/define.js"></script>
  </head>
  <body>
    <privacy-mask-video emoji="😎" aria-label="Mask faces locally"></privacy-mask-video>
  </body>
</html>
```

`define.js` registers the custom element automatically. Initialization begins
when the element connects to the page. Import `index.js` instead to register it
explicitly with `definePrivacyMaskVideo()`.

## Using the editor

1. Choose or drop a local MOV, MP4, or WebM video.
2. Wait for the full-video scan to finish. Longer clips take more time.
3. Select up to eight faces from the gallery. Tap a selected face again to remove it.
4. Choose an emoji and select **Process video**.
5. Review the entire result, including the marked tracking-loss intervals, then download.

A face first detected later in the clip starts masking at its first detected
appearance. The gallery can contain more than eight entries; eight is the
selection limit.

For a face missed in the opening frame, expand **Manual selection** and enable
drawing or enter a rectangle in video pixels. Manual selection replaces the
detected-face selection and applies only to the opening frame. Outside drawing
mode, the preview permits normal touch scrolling and pinch zoom.

## JavaScript API

This example adds a file input and action buttons alongside the connected editor:

```html
<input id="video-file" type="file" accept=".mov,.mp4,.webm">
<button id="process-video" type="button">Process</button>
<button id="download-video" type="button">Download</button>
<privacy-mask-video></privacy-mask-video>

<script type="module">
  import { definePrivacyMaskVideo } from '/components/privacy-mask-video/index.js';

  definePrivacyMaskVideo();
  const editor = document.querySelector('privacy-mask-video');

  editor.addEventListener('pmv-error', ({ detail }) => {
    console.info(detail.code, detail.message);
  });

  document.querySelector('#video-file').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await editor.load(file);
      if (editor.faces.length) editor.selectFace(editor.faces[0].id);
    } catch (error) {
      if (error.name !== 'AbortError') console.info(error.code, error.message);
    }
  });

  document.querySelector('#process-video').addEventListener('click', async () => {
    try {
      const result = await editor.process();
      // result.blob is the video; result.targetLosses reports each target.
      console.info(result.filename, result.targetCount);
    } catch (error) {
      if (error.name !== 'AbortError') console.info(error.code, error.message);
    }
  });

  document.querySelector('#download-video').addEventListener('click', () => editor.download());
</script>
```

The first listed face is selected automatically only by the example above.
The built-in UI requires explicit selection before processing.

### Configuration

| Attribute | Property | Behavior |
| --- | --- | --- |
| `emoji` | `emoji` | Defaults to 😎. Accepts one of the 22 bundled sequences. A valid change cancels active work and invalidates completed output. Invalid values throw `TypeError` and retain the previous value/result. |
| `disabled` | `disabled` | Boolean attribute. Blocks new import, selection, and processing actions. Existing processing continues; cancel/reset remain available. `disabled="false"` still disables. |
| `asset-base` | `assetBase` | Optional same-origin assets directory. Set before the element first connects. The worker still loads from the distribution's `workers/` directory. |

Pre-upgrade property values take precedence over conflicting initial attributes.

### Methods

| Method | Behavior |
| --- | --- |
| `initialize()` | Initialize or retry resources while connected; returns a capability-report promise. `load()` also awaits initialization. |
| `load(file)` | Load a nonempty local `File`, preflight export, and scan the entire video. An accepted replacement cancels previous work and clears old results. |
| `selectFace(id)` | Select one current gallery face, replacing the selection. |
| `selectFaces(ids)` | Select up to eight distinct current gallery IDs. An empty array clears selection. |
| `selectRegion({ x, y, width, height })` | Select a positive rectangle fully inside the display-oriented opening frame. Replaces detected-face selections. |
| `process()` | Process from the beginning with fresh tracking state; returns a promise of `ExportResult`. Concurrent processing calls reject. |
| `cancel()` | Abort active work with `AbortError`. Processing cancellation retains the source and selection. |
| `reset()` | Clear media and results while retaining configuration and reusable resident assets. |
| `download()` | Download the current completed result. Call from a user gesture. |

### Read-only properties

| Property | Contents |
| --- | --- |
| `state` | Current lifecycle state, such as `loading`, `selected`, `processing`, `complete`, or `error`. |
| `capabilities` | Capability-report snapshot, or `null` before initialization. |
| `source` | Source dimensions, duration, container, and audio-track count; excludes the input `File`. |
| `faces` | Gallery summaries with IDs, rectangles, landmarks, confidence, and `firstSeenUs`; excludes private appearance descriptors. |
| `selectedFaceIds` | Selected detected-face IDs. |
| `result` | Finalized `ExportResult`, or `null` before completion. Includes the `Blob`, filename, MIME type, dimensions, duration, frame/audio/target counts, aggregate `lostIntervals`, and per-target `targetLosses`. |

Object and array snapshots are defensive and frozen. Timestamps and durations
ending in `Us` are microseconds. Public types and typed errors are exported from
`index.js`; declarations ship in `dist/`.

Disconnecting terminates work and clears media and resident resources.
Reconnecting starts an empty session. If your application retains a returned
`Blob` or creates an object URL, it owns that reference and URL's lifetime.

## Events

Events bubble and cross Shadow DOM boundaries. Listen with `addEventListener`;
payloads are available in `event.detail`.

| Event | Detail |
| --- | --- |
| `pmv-ready` | `capabilities` |
| `pmv-statechange` | `previous`, `state`, `jobId` |
| `pmv-loaded` | `sourceId`, `width`, `height`, `durationUs`, `faceCount`, `audioTrackCount` |
| `pmv-selectionchange` | `sourceId`, `selectionId`, `kind`, `candidateId`, `candidateIds`, `selectionCount` |
| `pmv-progress` | `jobId`, `stage`, `processedFrames`, `timestampUs`, `durationUs`, `ratio` |
| `pmv-trackingchange` | `jobId`, `status`, `reason`, `timestampUs` |
| `pmv-complete` | `jobId` and result metadata, including tracking losses; retrieve the `Blob` through `result` or `process()`. |
| `pmv-cancel` | `jobId`, `reason` |
| `pmv-error` | `code`, `message`, `recoverable`, `jobId`, and an optional sanitized `diagnostic` |

Progress stages are `scanning`, `processing`, and `finalizing`. State changes
precede their associated events. `pmv-complete` fires after `result` becomes
accessible and before `process()` resolves.

Diagnostics use fixed stage/reason values and may include a known resource path
and HTTP status. Event payloads exclude input files, image data, appearance
descriptors, and private exception stacks.

## Styling

```css
privacy-mask-video {
  --pmv-accent: #74334f;
  --pmv-background: #fffaf5;
  --pmv-text: #34202b;
  --pmv-border-radius: 16px;
}

privacy-mask-video::part(download-button) {
  border-radius: 9999px;
}
```

Available parts: `container`, `drop-zone`, `preview`, `face-list`, `controls`,
`status`, `progress`, `review`, and `download-button`. Controls include keyboard
face selection, numeric manual selection, and throttled status announcements.

## How it works

| Technology | Role |
| --- | --- |
| YuNet | Detect faces and five facial landmarks in each decoded frame. |
| SFace | Generate appearance descriptors to match faces within the clip. |
| ONNX Runtime Web | Run both models in a worker using single-thread CPU/WASM inference. |
| Mediabunny and WebCodecs | Decode local media, preserve timing, and encode the masked result. |

Discovery compares recent detections and a bounded set of remembered appearances
with each identity. One-to-one assignments keep simultaneously visible people
separate. Original thumbnails, references, and first-seen times stay stable.

Export uses a fixed reference and independent tracker for each selected face.
Uncertain matches or competing claims on one face become reported tracking
losses, with masks held at their previous geometry. Manual targets start with a
fixed grayscale correlation template and limited local recovery.

An opaque circular backing encloses the estimated face rectangle. It does not
prove coverage of the intended person when tracking is wrong or lost. Scanning
and export each decode the video; preview throttling does not skip export frames.

## Supported media and limits

| Item | Support or limit |
| --- | --- |
| Input containers | MOV, MP4, WebM, recognized from contents rather than filename/MIME type alone. |
| Input video | Exactly one video track with a browser-supported decoder. |
| Export | MP4/AVC/AAC preferred, then WebM/VP9 or VP8/Opus, subject to runtime probes. |
| Audio | Every track retained through compatible packet copy or local transcoding. Unsupported preservation routes fail. |
| File size | 256 MiB each for input and encoded output. |
| Duration | 10 minutes. |
| Dimensions | At most 1920 pixels per side and 2,073,600 displayed pixels; portrait and landscape are subject to both limits. |
| Selected targets | Up to eight detected faces, or one manual region. |

Rotation and flip metadata are applied before selection and masking. Changing
dimensions, unusable timing, extra video tracks, and unsupported codecs are rejected.
Completed output is held in memory; speed and memory use depend on the device.

### iPhone MOV files

H.264 and HEVC/H.265 decoding depend on the browser's WebCodecs support. MOV
support does not guarantee ProRes, HDR/Dolby Vision, cinematic auxiliary tracks,
or every HEVC profile. Physical iPhone qualification remains outstanding.
Recording H.264 at 1080p can improve compatibility; changing recording settings
does not convert existing videos.

## Browser and hosting requirements

Serve the component and assets from the same origin over **HTTPS or localhost**.
Opening a page through `file://` is unsupported. The browser needs custom elements,
module workers, OffscreenCanvas 2D, WebCodecs, WebAssembly/SIMD, ImageBitmap support
for PNGs, and Web Crypto. Capability probes determine available codec routes;
there is no fully qualified browser/device matrix yet.

Serve JavaScript modules, WASM, PNGs, JSON, and media with appropriate MIME types.
Keep the distribution intact so relative module, worker, and asset URLs resolve.
The build records a worker hash in `assets/manifest.json`; mixing assets from
different builds can fail integrity checks.

A restrictive Content Security Policy must permit same-origin assets, Blob
workers and module imports, WASM compilation (`'wasm-unsafe-eval'` where
applicable), inline component shadow styles, and Blob review media. Relevant
directives include `script-src`, `worker-src`, `connect-src`, `style-src`, and
`media-src`. The component does not modify your CSP. COOP/COEP headers are not
required for the single-thread runtime.

## Privacy

Video, face processing, and export run locally. The component installs no upload
API, analytics, service worker, or persistent media store. It performs no
named-person lookup. Host applications can add their own functionality, so
review the privacy policy of the page embedding it.

Initialization fetches processing resources from the host origin and verifies
their hashes. Resident resources support offline retries while the instance
remains connected; offline page reload is outside scope. Reset/replacement
clears media and face references; disconnect also releases resident assets.

The embedding page can access local results. Shadow DOM provides style
encapsulation, not a security boundary. Audio content remains identifiable
unless you edit it separately.

## Local development

Use **Node.js 24** and npm:

```sh
git clone https://github.com/evan-hyer/privacy-mask-video.git
cd privacy-mask-video
npm ci
npm run assets:prepare
npm run dev
```

Open [the local demo](http://localhost:5173/demo/index.html). The dev command
builds the distribution before serving it; rebuild/restart after source changes.

For a plain static server without the development WebSocket:

```sh
npm run build
npm run serve:dist
```

Open [the built demo](http://localhost:4173/demo/index.html).
`demo/embed.html` demonstrates two independent instances and pre-upgrade
properties. The static server also exposes the distribution under
`/nested/components/privacy-mask-video/` for nested-hosting checks.

| Command | Purpose |
| --- | --- |
| `npm run assets:prepare` | Restore pinned binary assets from the manifest. |
| `npm run assets:verify` | Verify resource hashes, model signatures, runtime files, and licenses. |
| `npm run typecheck` | Check TypeScript without emitting files. |
| `npm test` | Run unit and regression tests. |
| `npm run build` | Verify assets and build modules, worker, declarations, and demos into `dist/`. |
| `npm run fixtures:verify` | Check the real-video fixture corpus and annotations. |
| `npm run test:browser` | Run the fixture-gated browser project. |
| `npm run test:privacy` | Run the fixture-gated privacy project. |
| `npm run test:performance` | Run the fixture-gated performance project. |
| `npm run prepack` | Compile, build, and inspect the distribution for packaging. |

## Validation status

On October 17, 2026, **all 22 unit tests, TypeScript checks, and the production
build passed** for the discovery changes. Tests cover setup tooling, sanitized
diagnostics, registry visibility, multi-target conflicts, and face-discovery
regressions including changing appearances, reentry, and simultaneous lookalikes.

These checks do not establish real-video accuracy or face coverage. Tracking
thresholds remain provisional and uncalibrated. Real-face corpus acquisition,
browser/privacy/performance qualification, codec and audio/timing validation,
repeatability, and per-frame coverage checks remain outstanding. Browser scripts
retain a fixture gate and fail when the required corpus is absent.

See the [implementation tasks](specs/001-local-video-privacy-mask/tasks.md) for
outstanding qualification work. The [initial delivery report](specs/001-local-video-privacy-mask/validation/final.md)
records the earlier baseline; its October 14 test counts are historical.

## Releases

Maintainers can run the GitHub Actions **Release** workflow or push a
`v<package.json version>` tag. It restores pinned assets, runs unit tests, builds
and inspects the package, publishes with npm provenance, verifies registry
integrity, and creates an experimental GitHub release with the archive/checksum.

Publishing uses GitHub OIDC trusted publishing, configured in npm for
`evan-hyer/privacy-mask-video` and `release.yml`. No reusable `NPM_TOKEN` is used.
If account policy requires staged publication, use workflow mode `stage` and
approve the prepared version in npm. A staged version is not installable until
approval; verify registry integrity and update the release note after publication.

The final security job audits dependencies and runs CodeQL. Its failure requires
review even if publication succeeded. Publishing the library does not deploy
the demo website; that host must update its bundled package separately.

## License

The original project code is currently **UNLICENSED**, with no open-source
license grant. Third-party models, runtime files, and emoji resources retain
their included upstream licenses. See [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt)
and the packaged `assets/licenses/` directory.
