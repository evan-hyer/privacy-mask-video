# Final security analysis

Date: 2026-10-14. Review after release pipeline push; runtime tests remain deferred.

GitHub run 38587728626 completed its final security job successfully: dependency
audit found zero vulnerabilities; CodeQL extended JavaScript/TypeScript analysis
completed and uploaded results. An independent read-only security analyst
reviewed asset integrity, worker ownership, media lifecycle and release controls.
No confirmed exploitable vulnerability was found. This is not proof of browser
privacy, tracking coverage or malformed-media safety.

The final release run 38589122375 also completed its final security job
successfully after npm staging and GitHub prerelease creation. All five prior
alerts were dismissed with reviewed evidence; the GitHub API reports zero open
CodeQL alerts. Final workflow/staging changes received a second read-only analyst
review, which found no new concrete security bug.

## CodeQL triage

All five medium alerts were reviewed as false positives in this trust model:

- #5, `js/missing-origin-check`, pipeline.worker.ts:104: a DedicatedWorker receives
  messages through its private creator channel, not Window cross-origin messages.
  Worker creation and protocol/instance/job/generation checks are present. No
  external Window messaging or transferred MessagePort is accepted.
- #4, `js/http-to-file-access`, pin-assets.mjs:22: maintainer-only lock generation
  intentionally downloads source-code-defined pinned model/font/license URLs to
  contained assets paths. Models additionally match pinned Git LFS hashes/sizes.
  There is no HTTP request handler or user-controlled upload destination.
- #3, `js/http-to-file-access`, prepare-assets.mjs:29: committed manifest selects
  HTTPS revision URLs; redirects are rejected and size/SHA-256 are checked before
  contained filesystem writes. Existing mismatched assets fail closed.
- #2, `js/http-to-file-access`, lock-runtime-notices.mjs:25: maintainer-only fixed
  ONNX Runtime license-text download to a fixed assets notice path, recording its
  hash/size; no executable resource or untrusted request input is involved.
- #1, `js/file-access-to-http`, prepare-assets.mjs:23: public manifest URL metadata
  drives HTTPS GET requests. No file body, credential or local media is sent.

Dismissals retain this evidence in GitHub. Do not add a Window-style origin
comparison to DedicatedWorker messaging to silence a diagnostic.

## Recommendations

1. After initial npm account approval, configure npm OIDC trusted publishing for
   release.yml and remove the bootstrap NPM_TOKEN repository secret.
2. Resume deferred network/privacy, tracking coverage, malformed-media and
   cancellation qualification before describing the component as verified
   anonymization. Lost tracking holds previous geometry and audio is preserved.
3. Continue reviewing manifest/lock updates: integrity checks detect mismatched
   resources but cannot authenticate a compromised host serving the manifest.

Sources: [dedicated-worker standard](https://html.spec.whatwg.org/multipage/workers.html#dedicatedworkerglobalscope),
[CodeQL download-to-file rule](https://codeql.github.com/codeql-query-help/javascript/js-http-to-file-access/),
[CodeQL file-to-network rule](https://codeql.github.com/codeql-query-help/javascript/js-file-access-to-http/),
[npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).
