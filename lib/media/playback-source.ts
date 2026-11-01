/** Mux only infers MP4/HLS URLs. Other direct files need native type sniffing. */
export function getWebPlaybackElement(src: string | null): "mux" | "video" {
    if (!src) return "video";
    try {
        const url = new URL(src);
        if (/\.(mp4|m3u8)$/i.test(url.pathname)) return "mux";
        if (
            url.protocol === "https:" &&
            url.hostname === "stream.mux.com" &&
            /^\/[^/.]+$/.test(url.pathname)
        ) return "mux";
    } catch {
        // Relative or opaque URLs can still be resolved by the media element.
    }
    return "video";
}
