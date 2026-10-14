# Setup implementation evidence

Date: 2026-10-14. Status: setup partially complete; feature implementation blocked
at the Phase 1 corpus gate. This report is not feature qualification.

## Completed setup work

- T001: package/toolchain, strict ES2022 TypeScript configuration, Node 24 engine,
  exact dependency versions, npm lockfile, required script contracts and ignores.
- T002: ESM library build configuration; declaration generation; a worker build
  with code splitting disabled; asset, license, and demo copying. Verified using
  isolated compiler inputs, not a fake application committed under src/.
- T003: Vitest pure tests and separate Playwright browser/privacy/performance
  projects against the compiled host, with one worker, no privacy-sensitive
  traces/screenshots/video and a required-fixture global gate. Later story tests
  have not been authored or run. Performance uses visible UI when invoked.
- T004: acquired and verified actual YuNet 2023mar, SFace 2021dec, ORT 1.30.0
  module/WASM, Noto Color Emoji, 22 supported sequences and upstream license
  texts. Immutable revisions, source locations, SHA-256, sizes and actual
  feed/output tensor shapes are recorded in assets/manifest.json. Initializer
  weights exposed as legacy SFace graph inputs are excluded from runtime feeds.
- T006: localhost:4173 static distribution server, root/nested paths, correct
  MIME types, byte-range/HEAD handling, confinement to static root, server
  lifecycle under Playwright; no COOP/COEP or application server framework.

## Commands and results

- `node --version`: v24.12.0; `npm --version`: 11.6.2.
- `npm install --ignore-scripts --no-audit --no-fund`: passed, 60 packages added;
  exact resolved versions and registry integrity data written to package-lock.json.
- `node scripts/pin-assets.mjs`: acquired 12 resources from immutable sources;
  model binary hashes independently checked against commit-pinned Git LFS
  pointers. This is a maintainer locking action, not normal preparation.
- `npm run assets:verify`: passed, 12 pinned resources, tensor metadata, runtime
  version, and license files verified.
- `npm run assets:prepare`: passed on resident resources and repeated integrity
  verification after correcting tensor metadata. No assets were fetched again.
- `npm test`: passed, 5 setup tests. Integrity mutation/path escapes, missing
  fixtures, split leakage, root/nested static modules/MIME/ranges/HEAD, and actual
  ESM/declaration/self-contained-worker builds using isolated compiler probes.
  Latest run: 5 passed, 3.41 seconds. Probes were removed from their explicitly
  created temporary directories after each test.
- `npm run fixtures:verify`: failed as required, with an explicit T005 missing
  corpus error. This failure is a blocker, not an acceptance test success.
- `npx playwright test --list`: configuration loaded, then exited with "No tests
  found" (0 tests). Story/browser suites belong to later tasks and do not yet
  exist. This is not a browser pass.

One infrastructure test initially used an overly broad URL check that matched
ordinary JavaScript comments; the assertion now checks actual HTTP/protocol
relative URL forms. Vite's deprecated inlineDynamicImports setting was replaced
with codeSplitting:false. The affected suite passed after those fixes.

## Unresolved prerequisite

T005 has only fixture manifest/format documentation and verification tooling.
No real-face videos, calibration/acceptance annotations, timing-edge media or
60-second benchmark clip are acquired. Its checkbox remains unchecked.

The plan explicitly states: "Complete Phase 1 and this phase before story
implementation." T007 also depends directly on T005. No foundation or story
source has been created to bypass that dependency. The skill requires completing
each phase before moving to the next.

Public-source investigation found MobiFace has relevant annotated face videos,
but its source page restricts acquisition to research/academic institutional
requests: https://mobiface.github.io/. No messages/requests were sent. Person
tracking datasets without face-boundary annotations do not fill the gap.
The user was asked for an available local consented/licensed annotated corpus.

No real inference, media import/export, identity continuity, pixel coverage,
offline worker restart, cancellation latency, browser acceptance, independent
output playback or reference-device performance result is claimed. Existing
planning evidence identifies this host as below the performance baseline;
reference-machine qualification will still be required for T061.

No .specify/extensions.yml exists; no pre/post extension hooks are registered.

## Resume

Supply local licensed/consented calibration and held-out acceptance recordings
and their independent annotations. Complete T005 and run fixtures:verify, then
resume T007 onward in task dependency order. The built component/demo and browser
story suites do not exist yet; dev/build/browser/privacy/performance success is
not claimed. No package publication or website deployment has occurred.
