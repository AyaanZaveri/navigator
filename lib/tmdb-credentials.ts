import "server-only";
import { cookies } from "next/headers";

export const TMDB_TOKEN_COOKIE = "navigator-tmdb-token";

/** Saved credentials stay out of artwork URLs and client JavaScript. */
export async function getTMDBToken(): Promise<string | undefined> {
    const token = (await cookies()).get(TMDB_TOKEN_COOKIE)?.value.trim();
    if (token) return token;
    // Desktop users configure artwork in Settings. Hosted sites can still
    // supply their existing shared credential without requiring every visitor to.
    if (process.env.NAVIGATOR_DESKTOP === "1") return undefined;
    return process.env.TMDB_API_READ_ACCESS_TOKEN?.trim() || undefined;
}
