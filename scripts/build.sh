#!/bin/sh
# Package the add-on:
#   dist/thunderbird-jump-<version>.xpi        Thunderbird 140+ (Manifest V3)
#   dist/thunderbird-jump-<version>-tb115.xpi  Thunderbird 115–139 (Manifest V2)
set -eu
cd "$(dirname "$0")/.."
version=$(node -p "require('./manifest.json').version")
mkdir -p dist
out="dist/thunderbird-jump-$version.xpi"
legacy="dist/thunderbird-jump-$version-tb115.xpi"
rm -f "$out" "$legacy"
zip -qr "$out" manifest.json icons src -x src/background/background.html

stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
cp -r icons src "$stage/"
node scripts/manifest-mv2.mjs manifest.json "$stage/manifest.json"
(cd "$stage" && zip -qr "$OLDPWD/$legacy" manifest.json icons src)
echo "$out"
echo "$legacy"
