"use server";

import { getAuthData } from "./auth";
import { getTMDBToken } from "@/lib/tmdb-credentials";
import { fetchTMDB } from "@/lib/tmdb";

/** Only ID translation runs on our server; timestamp APIs are called by the client. */
export async function resolveSkipIMDbId(id: string, type: "movie" | "series"): Promise<string | null> {
    if (!/^tmdb:[1-9]\d*$/.test(id) || (type !== "movie" && type !== "series")) return null;
    await getAuthData();
    const token = await getTMDBToken();
    if (!token) return null;
    const data = await fetchTMDB<{ imdb_id?: string | null }>(
        `${type === "series" ? "tv" : "movie"}/${id.slice(5)}/external_ids`, token,
    );
    return data?.imdb_id && /^tt\d+$/.test(data.imdb_id) ? data.imdb_id : null;
}
