#!/bin/sh
# Download a Linux Thunderbird release for the integration tests.
#   scripts/fetch-thunderbird.sh [version] [dest]
# version: e.g. 140.7.1esr (default), 115.5.1, "latest-esr" (newest ESR) or
# "latest-release" (newest monthly release).
set -eu
version=${1:-140.7.1esr}
dest=${2:-.thunderbird}
base=https://archive.mozilla.org/pub/thunderbird/releases

case "$version" in
  latest-esr) version=$(curl -sSf "$base/" | grep -oE '[0-9]+\.[0-9]+(\.[0-9]+)?esr' | sort -uV | tail -1) ;;
  latest-release) version=$(curl -sSf "$base/" | grep -oE 'releases/[0-9]+\.[0-9]+(\.[0-9]+)?/' | sed 's#releases/##; s#/##' | sort -uV | tail -1) ;;
esac

mkdir -p "$dest"
if [ ! -x "$dest/$version/thunderbird/thunderbird" ]; then
  echo "Downloading Thunderbird $version" >&2
  mkdir -p "$dest/$version"
  url="$base/$version/linux-x86_64/en-US/thunderbird-$version"
  # Newer builds ship .tar.xz, older ones (e.g. 115) .tar.bz2.
  if curl -sSfIL "$url.tar.xz" >/dev/null 2>&1; then
    curl -sSfL "$url.tar.xz" | tar xJ -C "$dest/$version"
  else
    curl -sSfL "$url.tar.bz2" | tar xj -C "$dest/$version"
  fi
fi
echo "$dest/$version/thunderbird/thunderbird"
