#!/bin/sh
# Bump the version, commit, tag and push. GitHub Actions then tests, builds and
# publishes the release (.xpi + updates.json).
#   sh scripts/release.sh 1.0.1
set -eu
cd "$(dirname "$0")/.."
version=${1:?usage: scripts/release.sh X.Y.Z}
case "$version" in *[!0-9.]*|"") echo "version must look like 1.2.3" >&2; exit 1 ;; esac
[ -z "$(git status --porcelain)" ] || { echo "working tree not clean" >&2; exit 1; }

node -e '
  const fs = require("fs");
  for (const f of ["manifest.json", "package.json"]) {
    const j = JSON.parse(fs.readFileSync(f, "utf8"));
    j.version = process.argv[1];
    fs.writeFileSync(f, JSON.stringify(j, null, 2) + "\n");
  }' "$version"

git add manifest.json package.json
git commit -m "Release $version"
git tag "v$version"
git push origin HEAD "v$version"
