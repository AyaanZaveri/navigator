"use server";

import type { StremioSubtitle, StremioSubtitleResponse } from "@/types/stremio";
import { getInstalledAddons } from "./auth";

// ─── Helpers ─────────────────────────────────────────────────────

async function fetchAddonResource<T>(
  transportUrl: string,
  path: string,
  init?: RequestInit
): Promise<T | null> {
  try {
    const base = transportUrl.replace(/\/manifest\.json$/, "");
    const url = `${base}/${path}`;
    const response = await fetch(url, {
      ...(init ?? {}),
      ...(init?.cache || init?.next ? {} : { next: { revalidate: 300 } }),
    });
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
  _subtitleIndex: number = 0,
  options?: {
    filename?: string;
    videoSize?: number;
  }
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
    const subtitleRequestHeaders = {
      Referer: "https://web.stremio.com/",
      Origin: "https://web.stremio.com",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
      Accept: "application/json, text/plain, */*",
    };
    const filename = options?.filename?.trim();
    const hintParts = filename ? [`filename=${encodeURIComponent(filename)}`] : [];
    if (
      typeof options?.videoSize === "number" &&
      Number.isFinite(options.videoSize) &&
      options.videoSize > 0
    ) {
      hintParts.push(`videoSize=${Math.trunc(options.videoSize)}`);
    }

    const allSubtitles: StremioSubtitle[] = [];

    const promises = subtitleAddons.map(async (addon) => {
      const hintedPath =
        hintParts.length > 0
          ? `subtitles/${type}/${videoId}/${hintParts.join("&")}.json`
          : `subtitles/${type}/${videoId}.json`;
      let data = await fetchAddonResource<StremioSubtitleResponse>(
        addon.transportUrl,
        hintedPath,
        { headers: subtitleRequestHeaders, cache: "no-store" }
      );
      if (!data && hintParts.length > 0) {
        data = await fetchAddonResource<StremioSubtitleResponse>(
          addon.transportUrl,
          `subtitles/${type}/${videoId}.json`,
          { headers: subtitleRequestHeaders, cache: "no-store" }
        );
      }
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

export async function fetchSubtitleFileContent(
  subtitleUrl: string,
  signal?: AbortSignal
): Promise<{ success: boolean; content: string; error?: string }> {
  try {
    if (!subtitleUrl) {
      return { success: false, content: "", error: "Missing subtitle URL" };
    }

    const response = await fetch(subtitleUrl, {
      signal,
      headers: {
        Accept: "*/*",
        Referer: "https://web.stremio.com/",
        Origin: "https://web.stremio.com",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        success: false,
        content: "",
        error: `Subtitle download failed (${response.status})`,
      };
    }

    return { success: true, content: await response.text() };
  } catch (error) {
    signal?.throwIfAborted();
    console.error("Failed to fetch subtitle file:", error);
    return {
      success: false,
      content: "",
      error: "Failed to fetch subtitle file",
    };
  }
}
