# npm release preparation

User authorization (2026-10-14): publish a new npm package, commit the repository
and push it to the configured GitHub remote. This supersedes the original
implementation-only publication exclusion. Runtime testing remains deferred.

Package: privacy-mask-video@0.1.0, public registry, experimental implementation.
Registry lookup returned 404 for the name at preparation time.
The current npm login returned 401 Unauthorized; publication requires the user's
authentication. No credential contents were inspected or added to the repository.

Preparation removes private:true, adds repository/author/export/public access
metadata, allows only dist/, original source and notices in the npm payload, and
excludes source maps/local files using nested npm ignores. Original-code license
metadata remains UNLICENSED; no open-source grant was invented. Upstream licenses
remain packaged and integrity-verified.

The prepack hook checks TypeScript compilation, asset integrity, builds and
distribution structure. No deferred runtime tests are executed. A tarball is
prepared in the machine's temporary directory, rather than committed to Git.
Inspection verifies all 26 pinned resource hashes and required entry points,
declarations, workers and demo files, without including fixtures, repository
tooling, credentials or media. Large model/runtime/font binaries are ignored by
Git and restored using the pinned preparation script; they are included in npm.

Git destination: https://github.com/evan-hyer/privacy-mask-video.git, main.
Publication and push outcomes are reported to the user after the commands return;
this preparation document alone does not assert that npm publication succeeded.

## Outcome

- Implementation/release preparation committed as
  a3ae7810df44a455491e62ff5625f954002cb79c and pushed to origin/main. The remote
  head was verified to match.
- npm authentication subsequently succeeded as evan-hyer.
- Checked archive: privacy-mask-video-0.1.0.tgz in the machine's TEMP directory;
  103 files, 50,025,482 compressed bytes. All 26 resource hashes match; no source
  maps, local configuration, credentials, test fixtures or repository tooling.
- npm publication failed with FETCH_ERROR/network timeout at the package's
  registry endpoint. Authenticated retries with 120-second and 900-second
  request timeouts also failed. Automatic retries were disabled on the final
  attempts. No publish process is left running.
- Publication is not confirmed; registry lookups returned E404. The package is
  ready for publication from a working connection. No deferred runtime testing
  was introduced to prepare the release.

Resume with `npm publish` from the prepared checkout on a working connection
(or publish the verified temporary tarball with --access public --ignore-scripts).
Verify the registry version and integrity before reporting a successful release.

## Automated release continuation

The user additionally authorized an npm/GitHub release pipeline, push, final
security analysis and cleanup. Two further local upload attempts (120-second
timeouts, including IPv4 preference) failed with FETCH_ERROR. Authentication
and registry reads worked; no publication was claimed.

`.github/workflows/release.yml` provides tag/manual release execution, pinned
actions, Node 24, restored verified assets, prepack inspection, npm publication
with provenance, exact registry-integrity verification, and an experimental
GitHub release with archive/checksum. Dependency auditing and extended CodeQL
analysis run as the final job, including when the release job fails.

The existing npm credential was transferred directly to an encrypted GitHub
repository secret, without displaying or committing its value. Recommend npm
OIDC trusted publishing and removal of the bootstrap secret after setup.
Security analysis does not replace the deferred runtime qualification.
