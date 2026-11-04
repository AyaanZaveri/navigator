"use server";

import { subtitleAddonBaseUrl } from "@/lib/subtitle-provider";

import type { MediaItem, StremioAddon, StremioStream } from "@/types/stremio";
import {
  getAuthData as getAuthDataFromAuth,
  getInstalledAddons,
} from "./auth";

// ─── Image URL helpers ──────────────────────────────────────────

export async function getImageUrl(
  itemId: string,
  imageType: string = "Primary"
): Promise<string> {
  // In Stremio, images are embedded in media metadata (poster, background, logo).
  // This function now returns a placeholder; actual images come from the MediaItem.
  return "";
}

export async function getDownloadUrl(_itemId: string): Promise<string> {
  // Stremio doesn't support direct downloads
  return "";
}

export async function getStreamUrl(
  itemId: string,
  type: string = "movie"
): Promise<string> {
  // Fetch streams and return the first usable URL
  const addons = await getInstalledAddons();

  for (const addon of addons) {
    const hasStream = addon.manifest.resources.some((r) =>
      typeof r === "string" ? r === "stream" : r.name === "stream"
    );
    if (!hasStream) continue;

    try {
      const base = addon.transportUrl.replace(/\/manifest\.json$/, "");
      const response = await fetch(
        `${base}/stream/${type}/${itemId}.json`
      );
      if (!response.ok) continue;
      const data = await response.json();

      if (data?.streams?.length > 0) {
        const stream = data.streams[0];
        if (stream.url) return stream.url;
        if (stream.externalUrl) return stream.externalUrl;
      }
    } catch {
      continue;
    }
  }

  return "";
}

export async function getSubtitleTracks(
  itemId: string,
  type: string = "movie",
  options?: {
    filename?: string;
    videoSize?: number;
    signal?: AbortSignal;
  }
): Promise<
  Array<{
    id?: string;
    filename?: string;
    provider?: string;
    kind: string;
    label: string;
    language: string;
    src: string;
    default?: boolean;
    forced?: boolean;
  }>
> {
  try {
    if (/^tmdb:[1-9]\d*(?=:|$)/.test(itemId) && (type === "movie" || type === "series")) {
      const { resolveAddonMediaId } = await import("@/lib/tmdb-discovery");
      itemId = await resolveAddonMediaId(itemId, type, options?.signal);
    }
    const addons = await getInstalledAddons();
    const subtitleRequestHeaders = {
      Referer: "https://web.stremio.com/",
      Origin: "https://web.stremio.com",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
      Accept: "application/json, text/plain, */*",
    };

    const buildSubtitlePath = () => {
      const filename = options?.filename?.trim();
      const videoSize = options?.videoSize;

      if (!filename) {
        return `subtitles/${type}/${itemId}.json`;
      }

      const hintParts = [`filename=${encodeURIComponent(filename)}`];
      if (typeof videoSize === "number" && Number.isFinite(videoSize) && videoSize > 0) {
        hintParts.push(`videoSize=${Math.trunc(videoSize)}`);
      }

      return `subtitles/${type}/${itemId}/${hintParts.join("&")}.json`;
    };

    const subtitleAddons = addons.filter((a) =>
      a.manifest.resources.some((r) =>
        typeof r === "string" ? r === "subtitles" : r.name === "subtitles"
      )
    );

    const tracks: Array<{
      id?: string;
      filename?: string;
      provider?: string;
      kind: string;
      label: string;
      language: string;
      src: string;
      default?: boolean;
      forced?: boolean;
    }> = [];

    const groups = await Promise.all(subtitleAddons.map(async (addon) => {
      const addonTracks: typeof tracks = [];
      const timeout = AbortSignal.timeout(8_000);
      const signal = options?.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
      try {
        const base = subtitleAddonBaseUrl(addon.transportUrl, addon.manifest.id);
        const hintedPath = buildSubtitlePath();
        let response = await fetch(`${base}/${hintedPath}`, {
          signal,
          headers: subtitleRequestHeaders,
          cache: "no-store",
        });
        if (!response.ok && hintedPath.includes("/filename=")) {
          response = await fetch(`${base}/subtitles/${type}/${itemId}.json`, {
            signal,
            headers: subtitleRequestHeaders,
            cache: "no-store",
          });
        }
        if (!response.ok) return addonTracks;
        const data = await response.json();

        if (data?.subtitles) {
          for (const sub of data.subtitles) {
            addonTracks.push({
              id: sub.id,
              filename: [sub.filename, sub.subtitleFileName, sub.movieReleaseName].find(value => typeof value === "string" && value.trim()),
              provider: addon.manifest.name,
              kind: "subtitles",
              label: sub.label || sub.name || sub.lang || "Unknown",
              language: sub.lang || "unknown",
              src: sub.url,
              default: false,
              forced: typeof sub.forced === "boolean" ? sub.forced : undefined,
            });
          }
        }
      } catch {
        options?.signal?.throwIfAborted();
      }
      return addonTracks;
    }));
    tracks.push(...groups.flat());

    return tracks;
  } catch (error) {
    options?.signal?.throwIfAborted();
    console.error("Failed to fetch subtitle tracks:", error);
    return [];
  }
}

// ─── User Libraries (Addon Catalogs) ────────────────────────────

export interface AddonLibrary {
  Id: string;
  Name: string;
  CollectionType: string;
}

export async function getUserLibraries(): Promise<AddonLibrary[]> {
  try {
    const addons = await getInstalledAddons();

    // Return catalogs from installed addons as "libraries"
    const libraries: AddonLibrary[] = [];

    for (const addon of addons) {
      if (addon.manifest.catalogs.length === 0) continue;

      // Determine collection type based on addon types
      const types = addon.manifest.types || [];
      let collectionType = "movies";
      if (types.includes("series") && !types.includes("movie")) {
        collectionType = "tvshows";
      } else if (types.includes("movie") && types.includes("series")) {
        collectionType = "mixed";
      }

      libraries.push({
        Id: addon.transportUrl,
        Name: addon.manifest.name,
        CollectionType: collectionType,
      });
    }

    return libraries;
  } catch (error) {
    console.error("Failed to fetch user libraries:", error);
    return [];
  }
}

export async function getLibraryById(
  libraryId: string
): Promise<AddonLibrary | null> {
  const libraries = await getUserLibraries();
  return libraries.find((l) => l.Id === libraryId) || null;
}

// ─── Image management (No-ops for Stremio) ──────────────────────

export interface RemoteImage {
  ProviderName: string;
  CommunityRating: number;
  Height: number;
  Width: number;
  Language: string;
  RatingType: string;
  Type: string;
  Url: string;
  VoteCount: number;
}

export interface RemoteImagesResponse {
  Images: RemoteImage[];
}

export async function fetchRemoteImages(): Promise<RemoteImagesResponse> {
  return { Images: [] };
}

export async function downloadRemoteImage(): Promise<void> {}

export interface CurrentImage {
  ImageType: string;
  ImageIndex?: number;
  ImageTag: string;
  Path: string;
  BlurHash: string;
  Height: number;
  Width: number;
  Size: number;
}

export async function fetchCurrentImages(): Promise<CurrentImage[]> {
  return [];
}

export async function reorderBackdropImage(): Promise<void> {}

export async function deleteImage(): Promise<void> {}

export interface UserPolicy {
  IsAdministrator: boolean;
}

export interface UserWithPolicy {
  Name: string;
  Id: string;
  Policy: UserPolicy;
}

export async function getUserWithPolicy(): Promise<UserWithPolicy | null> {
  try {
    const { user } = await getAuthDataFromAuth();
    return {
      Name: user.email,
      Id: user._id,
      Policy: { IsAdministrator: false },
    };
  } catch {
    return null;
  }
}

// ─── Scheduled Tasks / Logs (No-ops) ────────────────────────────

export async function fetchScheduledTasks(): Promise<any[]> {
  return [];
}

export async function fetchLogs(): Promise<any[]> {
  return [];
}

export async function fetchLogContent(_logName?: string): Promise<string> {
  return "";
}

// Backward-compat shim for callers importing from this module.
export async function getAuthData(): ReturnType<typeof getAuthDataFromAuth> {
  return getAuthDataFromAuth();
}
