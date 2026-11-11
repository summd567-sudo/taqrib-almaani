#!/usr/bin/env sh
# Fetch the Shatibiyyah matn (Turath book 7754, public-domain text) page by page.
# Usage: sh tools/fetch_matn.sh <out_dir>
out="$1"; mkdir -p "$out"
for pg in $(seq 7 100); do
  f=$(printf "%s/%03d.json" "$out" "$pg")
  [ -s "$f" ] || curl -s --retry 3 "https://api.turath.io/page?book_id=7754&pg=$pg&ver=3" -o "$f"
done
