import { cookies } from "next/headers";
import { readSession, SESSION_COOKIE } from "@/lib/server/session";

export async function GET() {
    const session = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
    return Response.json(session ? { user: session.user, timestamp: session.issuedAt } : { user: null, timestamp: null }, {
        status: session ? 200 : 401, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
    });
}
