#!/usr/bin/env sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC_ICON="$ROOT_DIR/public/logo/desktop/navigator.png"
BUILD_DIR="$ROOT_DIR/build"
OUT_ICNS="$BUILD_DIR/icon.icns"

if [ ! -f "$SRC_ICON" ]; then
  echo "Missing source icon: $SRC_ICON"
  exit 1
fi

mkdir -p "$BUILD_DIR"
cp "$SRC_ICON" "$BUILD_DIR/icon.png"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "Skipping .icns generation (macOS tools unavailable on this OS)."
  exit 0
fi

if ! command -v sips >/dev/null 2>&1 || ! command -v iconutil >/dev/null 2>&1; then
  echo "Missing required macOS icon tools (sips/iconutil)."
  exit 1
fi

ICONSET_DIR="$(mktemp -d "$BUILD_DIR/icon.XXXXXX.iconset")"
trap 'rm -rf "$ICONSET_DIR"' EXIT

sips -z 16 16 "$SRC_ICON" --out "$ICONSET_DIR/icon_16x16.png" >/dev/null
sips -z 32 32 "$SRC_ICON" --out "$ICONSET_DIR/icon_16x16@2x.png" >/dev/null
sips -z 32 32 "$SRC_ICON" --out "$ICONSET_DIR/icon_32x32.png" >/dev/null
sips -z 64 64 "$SRC_ICON" --out "$ICONSET_DIR/icon_32x32@2x.png" >/dev/null
sips -z 128 128 "$SRC_ICON" --out "$ICONSET_DIR/icon_128x128.png" >/dev/null
sips -z 256 256 "$SRC_ICON" --out "$ICONSET_DIR/icon_128x128@2x.png" >/dev/null
sips -z 256 256 "$SRC_ICON" --out "$ICONSET_DIR/icon_256x256.png" >/dev/null
sips -z 512 512 "$SRC_ICON" --out "$ICONSET_DIR/icon_256x256@2x.png" >/dev/null
sips -z 512 512 "$SRC_ICON" --out "$ICONSET_DIR/icon_512x512.png" >/dev/null
sips -z 1024 1024 "$SRC_ICON" --out "$ICONSET_DIR/icon_512x512@2x.png" >/dev/null

iconutil -c icns "$ICONSET_DIR" -o "$OUT_ICNS"
echo "Generated $OUT_ICNS"
