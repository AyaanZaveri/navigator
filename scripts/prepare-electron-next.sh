#!/usr/bin/env sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
STANDALONE_DIR="$ROOT_DIR/.next/standalone"
STANDALONE_NEXT_DIR="$STANDALONE_DIR/.next"

if [ ! -f "$STANDALONE_DIR/server.js" ]; then
  echo "Missing $STANDALONE_DIR/server.js. Run 'npm run build' first."
  exit 1
fi

mkdir -p "$STANDALONE_NEXT_DIR"

rm -rf "$STANDALONE_NEXT_DIR/static"
cp -R "$ROOT_DIR/.next/static" "$STANDALONE_NEXT_DIR/static"

rm -rf "$STANDALONE_DIR/public"
cp -R "$ROOT_DIR/public" "$STANDALONE_DIR/public"

echo "Prepared Next standalone assets for Electron packaging."
