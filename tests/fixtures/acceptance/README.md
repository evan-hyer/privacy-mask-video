# Held-out acceptance corpus (T005 incomplete)

No real-face videos or reference annotations are available. This is a blocker,
not a passed or skipped test. Follow the manifest and annotation format described
in ../calibration/README.md, using `split: "acceptance"` and unique original
recordings. Do not adjust thresholds using these clips or remove difficult
clips to hide failures.

Cover every scenario in ../manifest.json. Synthetic clips can establish media
timing/container/audio/corruption/resource-limit behavior, but cannot establish
real face detection, identity tracking or coverage. The 60-second benchmark must
have exactly 1280x720 pixels at 30 fps and separately documented reference-device
evidence. License/consent evidence, source, SHA-256, size, timestamps, expected
frame count, identities, face boundaries, and known loss intervals are mandatory.

Acquisition investigation: MobiFace provides annotated mobile face tracking,
but https://mobiface.github.io/ restricts access to research/academic institution
requests. No request has been submitted. Other person-tracking datasets are not
automatically face-boundary corpora. No download is claimed here.

Required fixtures must remain local. `npm run fixtures:verify` and Playwright
global setup fail until the corpus is complete; there is no success-by-skip.
