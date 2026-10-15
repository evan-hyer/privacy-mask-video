## Changes in 0.1.2

- Enable QuickTime MOV input, including iPhone files with rotation metadata.
- Accept MOV in the file picker and worker protocol; preserve audio through the existing MP4/WebM export routes.
- Report fixed, privacy-safe input failure reasons instead of an undifferentiated unsupported-input diagnostic.
- Browser-native H.264/HEVC decoding and existing 1080p limits still apply; physical iPhone/HDR qualification remains outstanding.

## Changes in 0.1.1

- Replace the incompatible CBDT/CBLC emoji font with 22 pinned PNG images for Apple browser compatibility.
- Select and independently track up to eight faces; resolve conflicting face assignments conservatively and report per-target tracking losses.
- Add privacy-safe resource/initialization diagnostics to error events.
- Preserve selectFace(id) and the same-origin, local-processing contract.

Native `<privacy-mask-video>` Web Component for local MOV/MP4/WebM face masking,
manual selection, emoji customization, tracking-loss review and download.

Install with `npm install privacy-mask-video`. Copy the complete package `dist/`
directory to your origin; see README.md for the plain HTML embedding and API.

Experimental release: runtime testing, calibration, browser/privacy checks,
per-frame coverage and performance qualification remain deferred. Tracking
thresholds are provisional. Review all output; audio is not anonymized.

The attached npm archive includes pinned models, WASM, emoji PNGs and third-party
notices. The original project code is UNLICENSED.
