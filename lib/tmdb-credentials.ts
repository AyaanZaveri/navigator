import "server-only";
import { cookies } from "next/headers";
import { getAuthData } from "@/lib/server/auth";

export const TMDB_TOKEN_COOKIE = "navigator-tmdb-token";

/** Saved credentials stay out of artwork URLs and client JavaScript. */
export async function getTMDBToken(): Promise<string | undefined> {
    const token = (await cookies()).get(TMDB_TOKEN_COOKIE)?.value.trim();
    // Desktop users configure artwork in Settings. Hosted sites can still
    // supply their existing shared credential without requiring every visitor to.
    const shared = process.env.NAVIGATOR_DESKTOP === "1" ? undefined : process.env.TMDB_API_READ_ACCESS_TOKEN?.trim() || undefined;
    if (token && shared) {
        // A previous account's saved/revoked token must not override public
        // discovery after sign-out. Keep personal precedence while signed in.
        try { await getAuthData(); } catch { return shared; }
    }
    return token || shared;
}
