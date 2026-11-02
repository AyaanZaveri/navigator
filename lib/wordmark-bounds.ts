export interface WordmarkBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Solid lettering has more visual weight than sparse text and decorative trails. */
export function getWordmarkDensity(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
  bounds: WordmarkBounds,
): number {
  let coverage = 0;
  for (let offset = 3; offset < pixels.length; offset += 4) {
    if (pixels[offset] > 32) coverage += pixels[offset] / 255;
  }
  return coverage / Math.max(1, width * height * bounds.width * bounds.height);
}

/** Normalized visible bounds; transparent canvas padding should not determine logo size. */
export function getWordmarkBounds(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
): WordmarkBounds | null {
  if (width < 1 || height < 1) return null;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] <= 32) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) return null;
  // A sample pixel of breathing room protects soft edges from being clipped.
  left = Math.max(0, left - 1);
  top = Math.max(0, top - 1);
  right = Math.min(width, right + 2);
  bottom = Math.min(height, bottom + 2);
  return {
    left: left / width,
    top: top / height,
    width: (right - left) / width,
    height: (bottom - top) / height,
  };
}
