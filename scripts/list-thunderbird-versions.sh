#!/bin/sh
# Prints a JSON array with the newest release of every Thunderbird major
# version from $1 (default 91) up, e.g. ["91.13.1","102.15.1",...,"157.0.1"].
set -eu
min=${1:-91}
curl -sSf https://archive.mozilla.org/pub/thunderbird/releases/ |
  grep -oE 'releases/[0-9]+\.[0-9.]+(esr)?/' | sed 's#releases/##; s#/##' |
  sort -V | awk -F. -v min="$min" '$1 >= min { last[$1] = $0 } END { for (m in last) print m, last[m] }' |
  sort -n | awk 'BEGIN { printf "[" } { printf "%s\"%s\"", (NR > 1 ? "," : ""), $2 } END { print "]" }'
