## Changes in 0.1.1

- Replace the incompatible CBDT/CBLC emoji font with 22 pinned PNG images for Apple browser compatibility.
- Select and independently track up to eight faces; resolve conflicting face assignments conservatively and report per-target tracking losses.
- Add privacy-safe resource/initialization diagnostics to error events.
- Preserve selectFace(id) and the same-origin, local-processing contract.

Native `<privacy-mask-video>` Web Component for local MP4/WebM face masking,
manual selection, emoji customization, tracking-loss review and download.

Install with `npm install privacy-mask-video`. Copy the complete package `dist/`
directory to your origin; see README.md for the plain HTML embedding and API.

Experimental release: runtime testing, calibration, browser/privacy checks,
per-frame coverage and performance qualification remain deferred. Tracking
thresholds are provisional. Review all output; audio is not anonymized.

The attached npm archive includes pinned models, WASM, emoji PNGs and third-party
notices. The original project code is UNLICENSED.
