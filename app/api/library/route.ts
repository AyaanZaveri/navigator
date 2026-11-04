import { getAuthData } from "@/lib/server/auth";
import { loadLibraryPage, LibraryNotFound } from "@/lib/server/library-page";
import { parseLibraryQuery } from "@/lib/library-page";

export async function GET(request: Request) {
    const params = new URL(request.url).searchParams;
    const addon = params.get("addon");
    if (!addon || addon.length > 4000 || (params.get("q")?.length ?? 0) > 300) return new Response(null, { status: 400 });
    try { await getAuthData(); } catch { return new Response(null, { status: 401 }); }
    try {
        const data = await loadLibraryPage(addon, parseLibraryQuery(params));
        request.signal.throwIfAborted();
        return Response.json(data, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
        return new Response(null, { status: error instanceof LibraryNotFound ? 404 : 503, headers: { "Cache-Control": "no-store" } });
    }
}
