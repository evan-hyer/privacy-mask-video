# Calibration corpus (T005 incomplete)

No real-face videos are available in this repository. Add consented/licensed clips
and manually reviewed per-frame annotations here before calibrating tracking.
Do not derive reference annotations from the tracker being tested. Do not put
private media or identifying annotation data in remote services or Git history.

Each manifest entry records `path`, `size`, `sha256`, `split: "calibration"`,
`mediaKind: "real-face"`, `recordingId`, `scenarios`, `expectedFrameCount`,
`provenance: { source, license, rightsEvidence }`, and
`annotations: { path, size, sha256 }`.

Annotation JSON has `schemaVersion: 1`, `targetIdentityId`, `lossIntervals`
(startUs inclusive, endUs exclusive, reasons), and `frames`. Each frame has
integer `timestampUs`, positive `durationUs`, and `faces`, each containing an
opaque `identityId`, `visibility` (trackable/occluded/out-of-frame), and a
display-oriented `rect: { x, y, width, height }` when visible. Include available
landmarks/rotation for upstream alignment comparisons. Record source dimensions,
orientation, exact track timing/audio offsets, and expected codec behavior.

Use different original recordings from acceptance, including real multiple
faces, translation, scale, tilt, crossings, manual seeds and occlusion/re-entry.
Freeze the calibrated profile and provenance before running held-out acceptance.
`npm run fixtures:verify` rejects incomplete corpora or split leakage.
