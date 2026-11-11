import { getAuthData } from "@/lib/server/auth";
import { metadataIdentity } from "@/lib/server/metadata-identity";
export async function GET() {
    const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
    try { await getAuthData(); } catch { return new Response(null, { status: 401, headers }); }
    const { revision } = await metadataIdentity();
    return Response.json({ revision }, { headers });
}
