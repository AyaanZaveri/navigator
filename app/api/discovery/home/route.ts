import { getTMDBHomeRows } from "@/lib/tmdb-discovery";

/** Retry one known public feed, with credentials kept entirely on the server. */
export async function GET(request: Request) {
    const feed = new URL(request.url).searchParams.get("feed") || "";
    const row = getTMDBHomeRows(new Set([feed]), request.signal).rows[0];
    if (!row) return new Response("Unknown discovery feed", { status: 404 });
    const result = await row.result;
    return Response.json(result, { status: result.status === "error" ? 502 : 200,
        headers: { "Cache-Control": "private, no-store" } });
}
