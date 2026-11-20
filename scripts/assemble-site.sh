#!/usr/bin/env bash
set -euo pipefail

output=${1:?集約先のディレクトリを指定してください}
mkdir -- "$output"
cp -R site/. "$output/"

for app in src/*/; do
  [[ -d "$app" ]] || continue
  if [[ ! -f "${app}dist/index.html" ]]; then
    printf '%s にビルド済みの dist/index.html がありません。\n' "$app" >&2
    exit 1
  fi
  slug=${app%/}
  slug=${slug##*/}
  mkdir -- "$output/$slug"
  cp -R "${app}dist/." "$output/$slug/"
done
