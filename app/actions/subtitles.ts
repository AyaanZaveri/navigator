"use server";

import type { StremioSubtitle, StremioSubtitleResponse } from "@/types/stremio";
import { getInstalledAddons } from "./auth";

// ─── Helpers ─────────────────────────────────────────────────────

async function fetchAddonResource<T>(
  transportUrl: string,
  path: string
): Promise<T | null> {
  try {
    const base = transportUrl.replace(/\/manifest\.json$/, "");
    const url = `${base}/${path}`;
    const response = await fetch(url, { next: { revalidate: 300 } });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

// ─── Subtitle fetching ──────────────────────────────────────────

export async function getSubtitleContent(
  videoId: string,
  typeOrMediaSourceId?: string,
  _subtitleIndex: number = 0
): Promise<{
  success: boolean;
  subtitles: any[];
  error?: string;
}> {
  try {
    const type =
      typeOrMediaSourceId === "movie" ||
      typeOrMediaSourceId === "series" ||
      typeOrMediaSourceId === "tv" ||
      typeOrMediaSourceId === "channel"
        ? typeOrMediaSourceId
        : "movie";

    const addons = await getInstalledAddons();

    const subtitleAddons = addons.filter((a) =>
      a.manifest.resources.some((r) =>
        typeof r === "string" ? r === "subtitles" : r.name === "subtitles"
      )
    );

    const allSubtitles: StremioSubtitle[] = [];

    const promises = subtitleAddons.map(async (addon) => {
      const data = await fetchAddonResource<StremioSubtitleResponse>(
        addon.transportUrl,
        `subtitles/${type}/${videoId}.json`
      );
      if (data?.subtitles) {
        allSubtitles.push(...data.subtitles);
      }
    });

    await Promise.all(promises);

    return { success: true, subtitles: allSubtitles };
  } catch (error) {
    console.error("Failed to fetch subtitles:", error);
    return { success: false, subtitles: [], error: "Failed to fetch subtitles" };
  }
}
