#!/bin/sh
# Package the add-on:
#   dist/thunderjump-<v>.xpi                     Thunderbird 140+ (Manifest V3)
#   dist/thunderjump-<v>-tb91-139.xpi            Thunderbird 91–139 (Manifest V2)
#   dist/thunderjump-<v>-atn.xpi                 Thunderbird 91 and newer, for addons.thunderbird.net
#                                        (Manifest V2, no upper limit, no self-update URL)
set -eu
cd "$(dirname "$0")/.."
root=$PWD
version=$(node -p "require('./manifest.json').version")
mkdir -p dist
rm -f dist/thunderjump-"$version"*.xpi
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT

# pack <manifest-producing command> <output>
pack() {
  rm -rf "$stage/x" && mkdir "$stage/x"
  cp -r icons src LICENSE "$stage/x/"
  eval "$1"
  # Only the MV2 build uses the background page.
  if node -e "process.exit(require('$stage/x/manifest.json').manifest_version >= 3 ? 0 : 1)"; then
    rm "$stage/x/src/background/background.html"
  fi
  (cd "$stage/x" && zip -qr "$root/$2" manifest.json icons src LICENSE)
  echo "$2"
}

pack "cp manifest.json $stage/x/manifest.json" "dist/thunderjump-$version.xpi"
pack "node scripts/manifest-mv2.mjs manifest.json $stage/x/manifest.json" "dist/thunderjump-$version-tb91-139.xpi"
pack "node scripts/manifest-mv2.mjs manifest.json $stage/mv2.json any && node scripts/atn-manifest.mjs $stage/mv2.json $stage/x/manifest.json" "dist/thunderjump-$version-atn.xpi"
