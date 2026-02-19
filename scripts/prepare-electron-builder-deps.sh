#!/usr/bin/env sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

mkdir -p "$ROOT_DIR/node_modules/@img/sharp-darwin-x64"
mkdir -p "$ROOT_DIR/node_modules/@img/sharp-libvips-darwin-x64"

if [ ! -f "$ROOT_DIR/node_modules/@img/sharp-darwin-x64/package.json" ]; then
  printf '{"name":"@img/sharp-darwin-x64","version":"0.0.0"}\n' > "$ROOT_DIR/node_modules/@img/sharp-darwin-x64/package.json"
fi

if [ ! -f "$ROOT_DIR/node_modules/@img/sharp-libvips-darwin-x64/package.json" ]; then
  printf '{"name":"@img/sharp-libvips-darwin-x64","version":"0.0.0"}\n' > "$ROOT_DIR/node_modules/@img/sharp-libvips-darwin-x64/package.json"
fi

echo "Prepared electron-builder optional @img/sharp darwin-x64 stubs."
