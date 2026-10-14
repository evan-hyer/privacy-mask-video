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
