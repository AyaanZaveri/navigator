import "server-only";

export async function fetchTMDB<T>(path: string, token: string): Promise<T | null> {
  try {
    const response = await fetch(`https://api.themoviedb.org/3/${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(3000),
    });
    return response.ok ? await response.json() as T : null;
  } catch {
    return null;
  }
}

export async function resolveTMDBId(id: string, type: "movie" | "series", token: string): Promise<number | undefined> {
  let result: number | undefined;
  if (/^tmdb:\d+$/.test(id)) {
    result = Number(id.split(":")[1]);
  } else if (/^tt\d+(?::|$)/.test(id)) {
    const match = await fetchTMDB<{ movie_results?: { id: number }[]; tv_results?: { id: number }[] }>(
      `find/${id.split(":")[0]}?external_source=imdb_id`, token,
    );
    result = (type === "series" ? match?.tv_results : match?.movie_results)?.[0]?.id;
  }
  return result && Number.isSafeInteger(result) && result > 0 ? result : undefined;
}
