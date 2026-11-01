export type PreviewBounds = { x: number; y: number; width: number; height: number };

/** Trim matching near-black edge bands, retaining dark scenes and full-black frames. */
export function previewContentBounds(data: Uint8ClampedArray, width: number, height: number): PreviewBounds {
    const dark = (x: number, y: number) => {
        const i = (y * width + x) * 4;
        return Math.max(data[i], data[i + 1], data[i + 2]) <= 18;
    };
    const row = (y: number) => {
        let count = 0;
        for (let x = 0; x < width; x++) if (dark(x, y)) count++;
        return count >= width * 0.99;
    };
    const column = (x: number, top: number, bottom: number) => {
        let count = 0;
        for (let y = top; y < bottom; y++) if (dark(x, y)) count++;
        return count >= (bottom - top) * 0.99;
    };
    let top = 0, bottom = 0, left = 0, right = 0;
    while (top < height && row(top)) top++;
    while (bottom < height && row(height - bottom - 1)) bottom++;
    // A dark scene is not a letterbox. Require two modest, matching bands.
    if (top < 2 || bottom < 2 || Math.abs(top - bottom) > 2 || top + bottom >= height * 0.6) top = bottom = 0;
    while (left < width && column(left, top, height - bottom)) left++;
    while (right < width && column(width - right - 1, top, height - bottom)) right++;
    if (left < 2 || right < 2 || Math.abs(left - right) > 2 || left + right >= width * 0.6) left = right = 0;
    return { x: left, y: top, width: width - left - right, height: height - top - bottom };
}
