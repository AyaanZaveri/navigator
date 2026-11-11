import { getAuthData } from "@/lib/server/auth";
import { outboundFetch, outboundUrl } from "@/lib/server/outbound-fetch";
import { createDesktopVideoPreload, MAX_PRELOAD_BYTES } from "@/lib/server/desktop-video-preload";

export const runtime = "nodejs";
type Cache = ReturnType<typeof createDesktopVideoPreload>;
const shared = globalThis as typeof globalThis & { navigatorVideoPreload?: Cache };
function cache() {
    return shared.navigatorVideoPreload ??= createDesktopVideoPreload((url, init) => outboundFetch(url, init,
        { maxBytes: Number.MAX_SAFE_INTEGER, timeoutMs: 4 * 60 * 60_000 }));
}
function local(request: Request) {
    const url = new URL(request.url);
    return (process.env.NAVIGATOR_DESKTOP === "1" || process.env.NODE_ENV === "development")
    && url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}
function sameOrigin(request: Request) { return request.headers.get("Origin") === new URL(request.url).origin; }
async function readBody(request: Request) {
    const reader = request.body?.getReader();
    if (!reader) throw Error("Missing request body");
    const decoder = new TextDecoder(); let bytes = 0, text = "";
    while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 64 * 1024) { await reader.cancel(); throw Error("Request too large"); }
        text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
}
export async function POST(request: Request) {
    if (!local(request)) return new Response(null, { status: 404 });
    if (!sameOrigin(request)) return new Response(null, { status: 403 });
    try { await getAuthData(); } catch { return new Response(null, { status: 401 }); }
    if (Number(request.headers.get("Content-Length")) > 64 * 1024) return new Response(null, { status: 413 });
    try {
        const body = await readBody(request);
        const url = outboundUrl(body.url).href;
        if (/\.(?:m3u8|mpd)(?:[?#]|$)/i.test(url)) return new Response(null, { status: 204 });
        const headers = body.headers ?? {};
        if (typeof headers !== "object" || Array.isArray(headers) || Object.keys(headers).length > 32
      || Object.entries(headers).some(([key, value]) => !/^[a-z0-9-]+$/i.test(key) || typeof value !== "string"
        || value.length > 8192 || /[\r\n\0]/.test(value) || /^(host|range|connection|content-length|accept-encoding|if-range)$/i.test(key))) {
            return new Response(null, { status: 400 });
        }
        const bytes = Math.min(MAX_PRELOAD_BYTES, Math.max(2 * 1024 * 1024, Math.floor(Number(body.bytes) || 8 * 1024 * 1024)));
        const token = await cache().prepare(url, headers, bytes, request.signal);
        return token ? Response.json({ token }, { headers: { "Cache-Control": "no-store" } }) : new Response(null, { status: 204 });
    } catch { return new Response(null, { status: 400 }); }
}
export async function GET(request: Request) {
    if (!local(request)) return new Response(null, { status: 404 });
    return cache().serve(new URL(request.url).searchParams.get("token") || "", request);
}
export const HEAD = GET;
export async function DELETE(request: Request) {
    if (!local(request)) return new Response(null, { status: 404 });
    if (!sameOrigin(request)) return new Response(null, { status: 403 });
    try { await getAuthData(); } catch { return new Response(null, { status: 401 }); }
    const params = new URL(request.url).searchParams;
    cache().release(params.get("token") || "", params.get("active") === "1");
    return new Response(null, { status: 204 });
}
