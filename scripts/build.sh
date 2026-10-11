#!/bin/sh
# Package the add-on as dist/thunderbird-jump-<version>.xpi
set -eu
cd "$(dirname "$0")/.."
version=$(node -p "require('./manifest.json').version")
mkdir -p dist
out="dist/thunderbird-jump-$version.xpi"
rm -f "$out"
zip -qr "$out" manifest.json icons src
echo "$out"
