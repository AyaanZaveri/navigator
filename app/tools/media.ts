import { tool } from "ai";
import { z } from "zod";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { searchItems } from "@/app/actions/search";
import {
  fetchMovies,
  fetchTVShows,
  fetchMediaDetails,
  fetchResumeItems,
  fetchSimilarItems,
  fetchGenres,
  fetchGenre,
  getStreamAddonTargets,
  fetchStreamsFromAddon,
} from "@/app/actions/media";
import { fetchEpisodes, fetchSeasons } from "@/app/actions/tv-shows";
import {
  buildEpisodePath,
  parseSeriesRouteId,
} from "@/lib/series-route";

export interface NavigateMediaTool {
  success: boolean;
  action: string;
  url?: string;
  message: string;
  error?: string;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s]|_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreSeriesMatch(query: string, candidateName: string): number {
  const q = normalizeText(query);
  const name = normalizeText(candidateName);
  if (!q || !name) return 0;
  if (name === q) return 1_000;
  if (name.startsWith(q)) return 700;
  if (name.includes(q)) return 500;

  const qTokens = q.split(" ").filter(Boolean);
  const nTokens = name.split(" ").filter(Boolean);
  let score = 0;
  for (const token of qTokens) {
    if (nTokens.includes(token)) score += 120;
    else if (nTokens.some((n) => n.startsWith(token))) score += 60;
    else if (name.includes(token)) score += 30;
  }
  return score;
}

function scoreMediaMatch(
  query: string,
  candidate: { name: string; imdbRating?: string; poster?: string },
  preferredTypeScore = 0
): number {
  const nameScore = scoreSeriesMatch(query, candidate.name);
  let qualityScore = 0;
  if (candidate.poster) qualityScore += 10;
  if (candidate.imdbRating) {
    const rating = Number(candidate.imdbRating);
    if (!Number.isNaN(rating)) qualityScore += rating;
  }
  return nameScore + qualityScore + preferredTypeScore;
}

function formatReleaseDate(released?: string): string | null {
  if (!released) return null;

  const parsed = new Date(released);
  if (Number.isNaN(parsed.getTime())) {
    return released;
  }

  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export interface PlayMediaTool {
  success: boolean;
  action: string;
  mediaId: string;
  mediaName: string;
  mediaType: "Movie" | "Series" | "Episode";
  streamId?: string;
  selectionId?: string;
  streamChoice?: number;
  streamUrl?: string;
  mediaSourceId?: string;
  subtitleFilename?: string;
  subtitleVideoSize?: number;
  seriesId?: string;
  showName?: string;
  episodeTitle?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  message: string;
}

interface StreamRegistryEntry {
  streamUrl: string;
  subtitleFilename?: string;
  subtitleVideoSize?: number;
  mediaId: string;
  mediaType: "Movie" | "Series" | "Episode";
  createdAt: number;
}

interface StreamSelectionEntry {
  mediaId: string;
  mediaType: "Movie" | "Series" | "Episode";
  createdAt: number;
  choices: Record<string, string>;
}

const STREAM_REGISTRY_TTL_MS = 30 * 60 * 1000;
const STREAM_REGISTRY_MAX_ENTRIES = 500;
const streamRegistry = new Map<string, StreamRegistryEntry>();
const streamSelectionRegistry = new Map<string, StreamSelectionEntry>();
const STREAM_REGISTRY_FILE_PATH = path.join(
  os.tmpdir(),
  "navigator-stream-registry.json"
);
let streamRegistryHydrated = false;

function cleanupExpiredStreams(now = Date.now()) {
  for (const [id, entry] of streamRegistry.entries()) {
    if (now - entry.createdAt > STREAM_REGISTRY_TTL_MS) {
      streamRegistry.delete(id);
    }
  }

  if (streamRegistry.size > STREAM_REGISTRY_MAX_ENTRIES) {
    const sortedByAge = [...streamRegistry.entries()].sort(
      (a, b) => a[1].createdAt - b[1].createdAt
    );
    const entriesToTrim = streamRegistry.size - STREAM_REGISTRY_MAX_ENTRIES;
    for (let i = 0; i < entriesToTrim; i += 1) {
      const entry = sortedByAge[i];
      if (entry) {
        streamRegistry.delete(entry[0]);
      }
    }
  }

  for (const [id, entry] of streamSelectionRegistry.entries()) {
    if (now - entry.createdAt > STREAM_REGISTRY_TTL_MS) {
      streamSelectionRegistry.delete(id);
    }
  }
}

async function hydrateStreamRegistry() {
  if (streamRegistryHydrated) return;
  streamRegistryHydrated = true;

  try {
    const raw = await fs.readFile(STREAM_REGISTRY_FILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as
      | {
          version?: number;
          streams?: Array<[string, StreamRegistryEntry]>;
          selections?: Array<[string, StreamSelectionEntry]>;
        }
      | Array<[string, StreamRegistryEntry]>;

    if (Array.isArray(parsed)) {
      for (const [id, entry] of parsed) {
        if (!entry || !entry.streamUrl || !entry.createdAt) continue;
        streamRegistry.set(id, entry);
      }
    } else {
      for (const [id, entry] of parsed.streams ?? []) {
        if (!entry || !entry.streamUrl || !entry.createdAt) continue;
        streamRegistry.set(id, entry);
      }
      for (const [id, entry] of parsed.selections ?? []) {
        if (!entry || !entry.mediaId || !entry.mediaType || !entry.createdAt) {
          continue;
        }
        streamSelectionRegistry.set(id, entry);
      }
    }
    cleanupExpiredStreams();
  } catch {
    // No persisted registry yet (first run) or unreadable cache; ignore safely.
  }
}

async function persistStreamRegistry() {
  cleanupExpiredStreams();
  const serialized = JSON.stringify({
    version: 2,
    streams: [...streamRegistry.entries()],
    selections: [...streamSelectionRegistry.entries()],
  });
  try {
    await fs.writeFile(STREAM_REGISTRY_FILE_PATH, serialized, "utf8");
  } catch {
    // Persistence is best-effort; in-memory map still serves same-process calls.
  }
}

function registerStreamSelection(input: {
  mediaId: string;
  mediaType: "Movie" | "Series" | "Episode";
  choices: Record<string, string>;
}): string {
  cleanupExpiredStreams();
  const selectionId = `sel_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;

  streamSelectionRegistry.set(selectionId, {
    mediaId: input.mediaId,
    mediaType: input.mediaType,
    createdAt: Date.now(),
    choices: input.choices,
  });

  return selectionId;
}

async function resolveSelectionChoice(input: {
  selectionId: string;
  streamChoice: number;
  mediaId: string;
  mediaType: "Movie" | "Series" | "Episode";
}): Promise<string | undefined> {
  await hydrateStreamRegistry();
  cleanupExpiredStreams();

  const selection = streamSelectionRegistry.get(input.selectionId);
  if (!selection) return undefined;
  if (selection.mediaId !== input.mediaId || selection.mediaType !== input.mediaType) {
    return undefined;
  }

  const mappedStreamId = selection.choices[String(input.streamChoice)];
  return mappedStreamId || undefined;
}

function registerStreamCandidate(input: {
  streamUrl: string;
  subtitleFilename?: string;
  subtitleVideoSize?: number;
  mediaId: string;
  mediaType: "Movie" | "Series" | "Episode";
}): string {
  cleanupExpiredStreams();
  const streamId = `strm_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;

  streamRegistry.set(streamId, {
    streamUrl: input.streamUrl,
    subtitleFilename: input.subtitleFilename,
    subtitleVideoSize: input.subtitleVideoSize,
    mediaId: input.mediaId,
    mediaType: input.mediaType,
    createdAt: Date.now(),
  });

  return streamId;
}

async function resolveStreamId(streamId: string): Promise<StreamRegistryEntry | null> {
  await hydrateStreamRegistry();
  cleanupExpiredStreams();
  const entry = streamRegistry.get(streamId);
  if (!entry) return null;

  const isExpired = Date.now() - entry.createdAt > STREAM_REGISTRY_TTL_MS;
  if (isExpired) {
    streamRegistry.delete(streamId);
    await persistStreamRegistry();
    return null;
  }

  return entry;
}

export interface EpisodeLookupTool {
  success: boolean;
  seriesId?: string;
  seriesName?: string;
  episodeTitle?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  episodes?: Array<{
    title: string;
    seasonNumber: number;
    episodeNumber: number;
    overview?: string | null;
  }>;
  message: string;
  error?: string;
}

const EPISODE_DESCRIPTION_MAX_CHARS = 300;

function truncateText(
  value?: string | null,
  maxChars = EPISODE_DESCRIPTION_MAX_CHARS
): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars).trimEnd()}...`;
}

export const searchMedia = tool({
  description:
    "Search for media by title/keyword and return compact ranked candidates. Use this to discover IDs before calling navigation/play tools. Do not use this when navigateToMediaByQuery or navigateToEpisode can directly resolve the request.",
  inputSchema: z.object({
    query: z.string().describe("The search term or media title to look for"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe("Maximum number of results to return (default: 8)"),
  }),
  execute: async ({ query, limit = 8 }) => {
    console.log("🔍 [searchMedia] Tool called with query:", query);
    try {
      const results = await searchItems(query);
      console.log("🔍 [searchMedia] Search results:", results);
      const ranked = results
        .map((item) => ({
          item,
          score: scoreMediaMatch(query, item),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((entry) => entry.item);
      return {
        success: true,
        results: ranked.map((item) => ({
          // Prefer numeric year when release info starts with a year like "2018"
          year: (() => {
            const match = item.releaseInfo?.match(/\d{4}/);
            return match ? Number(match[0]) : null;
          })(),
          id: item.id,
          name: item.name,
          type: item.type,
          communityRating: item.imdbRating ? Number(item.imdbRating) : null,
          criticRating: null,
          officialRating: null,
          runtime: null,
          overview: item.description,
          poster: item.poster ?? null,
          releaseInfo: item.releaseInfo ?? null,
          addonName: item.addonName ?? null,
          catalogName: item.catalogName ?? null,
        })),
        count: ranked.length,
      };
    } catch (error) {
      return {
        success: false,
        error: "Failed to search media",
        results: [],
      };
    }
  },
});

export const navigateToMedia = tool({
  description:
    "Navigate to a known media item ID. Use this only when you already have a validated mediaId or explicit episode coordinates.",
  inputSchema: z.object({
    mediaId: z.string().describe("The unique ID of the media item"),
    mediaType: z
      .enum(["Movie", "Series", "Episode"])
      .describe("The type of media - Movie, Series (TV Show), or Episode"),
    seriesId: z
      .string()
      .optional()
      .describe("Series ID for episodes when available"),
    seasonNumber: z
      .number()
      .optional()
      .describe("Season number for episodes when available"),
    episodeNumber: z
      .number()
      .optional()
      .describe("Episode number for episodes when available"),
  }),
  execute: async ({
    mediaId,
    mediaType,
    seriesId,
    seasonNumber,
    episodeNumber,
  }) => {
    console.log("🎯 [navigateToMedia] Tool called with:", {
      mediaId,
      mediaType,
      seriesId,
      seasonNumber,
      episodeNumber,
    });
    let basePath: string;
    if (mediaType === "Movie") {
      basePath = "/movie";
    } else if (mediaType === "Series") {
      basePath = "/series";
    } else {
      if (seriesId && seasonNumber && episodeNumber) {
        return {
          success: true,
          action: "navigate",
          url: buildEpisodePath(seriesId, seasonNumber, episodeNumber),
          message: "Navigating to episode...",
        };
      }

      const parsed = parseSeriesRouteId(mediaId);
      if (parsed.isEpisodeTarget && parsed.season && parsed.episode) {
        return {
          success: true,
          action: "navigate",
          url: buildEpisodePath(parsed.seriesId, parsed.season, parsed.episode),
          message: "Navigating to episode...",
        };
      }

      return {
        success: false,
        action: "navigate",
        message: "Could not determine season/episode for navigation.",
        error:
          "Missing season/episode context. Provide seriesId, seasonNumber, and episodeNumber.",
      };
    }
    const url = `${basePath}/${mediaId}`;
    return {
      success: true,
      action: "navigate",
      url,
      message: `Navigating to ${mediaType.toLowerCase()}...`,
    };
  },
});

export const navigateToEpisode = tool({
  description:
    "Navigate to a TV episode when season and episode numbers are already known. This tool requires explicit seasonNumber and episodeNumber.",
  inputSchema: z.object({
    seriesQuery: z.string().describe("Series name to resolve to a series ID"),
    seasonNumber: z.number().int().min(1).describe("Season number"),
    episodeNumber: z.number().int().min(1).describe("Episode number"),
  }),
  execute: async ({ seriesQuery, seasonNumber, episodeNumber }) => {
    console.log("🎯📺 [navigateToEpisode] Tool called with:", {
      seriesQuery,
      seasonNumber,
      episodeNumber,
    });

    try {
      const results = await searchItems(seriesQuery);
      const seriesCandidates = results.filter((item) => item.type === "series");

      if (seriesCandidates.length === 0) {
        return {
          success: false,
          action: "navigate",
          message: "Series not found.",
          error: "No matching TV series found.",
        };
      }

      const bestSeries = seriesCandidates
        .map((item) => ({
          item,
          score: scoreSeriesMatch(seriesQuery, item.name),
        }))
        .sort((a, b) => b.score - a.score)[0]?.item;

      if (!bestSeries) {
        return {
          success: false,
          action: "navigate",
          message: "Series not found.",
          error: "Could not resolve a series ID.",
        };
      }

      const url = buildEpisodePath(bestSeries.id, seasonNumber, episodeNumber);

      return {
        success: true,
        action: "navigate",
        url,
        mediaId: bestSeries.id,
        mediaName: bestSeries.name,
        seasonNumber,
        episodeNumber,
        message: "Navigating to episode.",
      };
    } catch (error) {
      return {
        success: false,
        action: "navigate",
        message: "Episode navigation failed.",
        error:
          error instanceof Error
            ? error.message
            : "Failed to resolve series for episode navigation.",
      };
    }
  },
});

export const findEpisodeByTitle = tool({
  description:
    "Return all NON-special episodes (season > 0) for a resolved TV series so the model can semantically choose the best match for the user's episode title. Each returned episode includes `overview`, which is that episode's own description (capped).",
  inputSchema: z.object({
    seriesQuery: z.string().describe("Series name to resolve to a series ID"),
    episodeTitle: z.string().describe("Episode title to match"),
  }),
  execute: async ({ seriesQuery, episodeTitle }) => {
    console.log("🔎📺 [findEpisodeByTitle] Tool called with:", {
      seriesQuery,
      episodeTitle,
    });

    try {
      const results = await searchItems(seriesQuery);
      const seriesCandidates = results.filter((item) => item.type === "series");

      if (seriesCandidates.length === 0) {
        return {
          success: false,
          message: "Series not found.",
          error: "No matching TV series found.",
        } satisfies EpisodeLookupTool;
      }

      const bestSeries = seriesCandidates
        .map((item) => ({
          item,
          score: scoreSeriesMatch(seriesQuery, item.name),
        }))
        .sort((a, b) => b.score - a.score)[0]?.item;

      if (!bestSeries) {
        return {
          success: false,
          message: "Series not found.",
          error: "Could not resolve a series ID.",
        } satisfies EpisodeLookupTool;
      }

      const seasons = (await fetchSeasons(bestSeries.id)).filter(
        (season) => season.number > 0
      );
      if (seasons.length === 0) {
        return {
          success: false,
          seriesId: bestSeries.id,
          seriesName: bestSeries.name,
          message: "No non-special seasons found for the series.",
          error: "Only specials (season 0) are available for lookup.",
        } satisfies EpisodeLookupTool;
      }

      const seasonEpisodes = await Promise.all(
        seasons.map(async (season) => ({
          episodes: await fetchEpisodes(bestSeries.id, season.number),
        }))
      );

      const flattened = seasonEpisodes.flatMap((entry) =>
        entry.episodes.filter((episode) => episode.season > 0).map((episode) => ({
          id: episode.id,
          type: "Episode" as const,
          seriesId: bestSeries.id,
          seriesName: bestSeries.name,
          name: episode.title,
          title: episode.title,
          seasonNumber: episode.season,
          episodeNumber: episode.episode,
          overview: truncateText(episode.overview),
          releaseInfo: formatReleaseDate(episode.released),
          thumbnail: episode.thumbnail,
          poster: episode.thumbnail ?? null,
        }))
      );
      flattened.sort((a, b) => {
        if (a.seasonNumber !== b.seasonNumber) {
          return a.seasonNumber - b.seasonNumber;
        }
        return a.episodeNumber - b.episodeNumber;
      });

      if (flattened.length === 0) {
        return {
          success: false,
          seriesId: bestSeries.id,
          seriesName: bestSeries.name,
          message: "No regular episodes found in non-special seasons.",
          error: "No episodes are available after excluding season 0 specials.",
        } satisfies EpisodeLookupTool;
      }

      return {
        success: true,
        seriesId: bestSeries.id,
        seriesName: bestSeries.name,
        episodes: flattened,
        message: `Resolved ${flattened.length} non-special episodes for semantic title selection of "${episodeTitle}".`,
      } satisfies EpisodeLookupTool;
    } catch (error) {
      return {
        success: false,
        message: "Episode lookup failed.",
        error:
          error instanceof Error
            ? error.message
            : "Failed to resolve episode by title.",
      } satisfies EpisodeLookupTool;
    }
  },
});

export const navigateToMediaByQuery = tool({
  description:
    "Resolve a movie or series title to the best match and navigate in one step. Prefer this for commands like 'go to Interstellar' or 'open The Rookie'.",
  inputSchema: z.object({
    mediaQuery: z.string().describe("Movie or series title to navigate to"),
    preferredType: z
      .enum(["Movie", "Series"])
      .optional()
      .describe("Preferred media type when ambiguous"),
  }),
  execute: async ({ mediaQuery, preferredType }) => {
    console.log("🎯🔎 [navigateToMediaByQuery] Tool called with:", {
      mediaQuery,
      preferredType,
    });
    try {
      const results = await searchItems(mediaQuery);
      const candidates = results.filter(
        (item) => item.type === "movie" || item.type === "series"
      );

      if (candidates.length === 0) {
        return {
          success: false,
          action: "navigate",
          message: "Media not found.",
          error: "No matching movie or series found.",
        };
      }

      const preferred = preferredType?.toLowerCase();
      const best = candidates
        .map((item) => {
          const preferredTypeScore =
            preferred && item.type === preferred ? 150 : 0;
          return {
            item,
            score: scoreMediaMatch(mediaQuery, item, preferredTypeScore),
          };
        })
        .sort((a, b) => b.score - a.score)[0]?.item;

      if (!best) {
        return {
          success: false,
          action: "navigate",
          message: "Media not found.",
          error: "Could not resolve media ID.",
        };
      }

      const url =
        best.type === "movie" ? `/movie/${best.id}` : `/series/${best.id}`;

      return {
        success: true,
        action: "navigate",
        url,
        mediaId: best.id,
        mediaName: best.name,
        mediaType: best.type === "movie" ? "Movie" : "Series",
        message: "Navigating.",
      };
    } catch (error) {
      return {
        success: false,
        action: "navigate",
        message: "Navigation failed.",
        error:
          error instanceof Error
            ? error.message
            : "Failed to resolve media ID for navigation.",
      };
    }
  },
});

export const playMedia = tool({
  description:
    "Play a known media item immediately. Use after resolving title to mediaId (with searchMedia) or when the ID is already known.",
  inputSchema: z.object({
    mediaId: z.string().describe("The unique ID of the media item"),
    mediaName: z.string().describe("The name of the media item"),
    mediaType: z
      .enum(["Movie", "Series", "Episode"])
      .describe("The type of media - Movie, Series (TV Show), or Episode"),
    streamId: z
      .string()
      .optional()
      .describe(
        "Short stream reference ID returned by GetMediaStreams (preferred over streamUrl)"
      ),
    selectionId: z
      .string()
      .optional()
      .describe("Selection group ID returned by GetMediaStreams"),
    streamChoice: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("Numeric stream choice from GetMediaStreams (1-based)"),
    streamUrl: z
      .string()
      .optional()
      .describe("Direct stream URL (legacy fallback; prefer streamId)"),
    mediaSourceId: z
      .string()
      .optional()
      .describe("Source-specific ID for playback (e.g. episode ID)"),
    subtitleFilename: z
      .string()
      .optional()
      .describe("Subtitle hint filename from the selected stream"),
    subtitleVideoSize: z
      .number()
      .optional()
      .describe("Subtitle hint video size from the selected stream"),
    seriesId: z
      .string()
      .optional()
      .describe("Series ID for episode playback context"),
    showName: z
      .string()
      .optional()
      .describe("Series name for episode playback context"),
    episodeTitle: z
      .string()
      .optional()
      .describe("Episode title when mediaType is Episode"),
    seasonNumber: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("Episode season number when available"),
    episodeNumber: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("Episode number when available"),
  }),
  execute: async ({
    mediaId,
    mediaName,
    mediaType,
    streamId,
    selectionId,
    streamChoice,
    streamUrl,
    mediaSourceId,
    subtitleFilename,
    subtitleVideoSize,
    seriesId,
    showName,
    episodeTitle,
    seasonNumber,
    episodeNumber,
  }) => {
    await hydrateStreamRegistry();
    console.log("▶️ [playMedia] Tool called with:", {
      mediaId,
      mediaName,
      mediaType,
      streamId,
      selectionId,
      streamChoice,
      hasStreamUrl: Boolean(streamUrl),
      mediaSourceId,
    });

    let candidateStreamId: string | undefined = streamId;
    if (!candidateStreamId && selectionId && streamChoice) {
      candidateStreamId = await resolveSelectionChoice({
        selectionId,
        streamChoice,
        mediaId,
        mediaType,
      });
    }

    const resolved =
      !streamUrl && candidateStreamId
        ? await resolveStreamId(candidateStreamId)
        : null;
    const resolvedStreamUrl = streamUrl || resolved?.streamUrl;
    const resolvedSubtitleFilename = subtitleFilename || resolved?.subtitleFilename;
    const resolvedSubtitleVideoSize =
      subtitleVideoSize ?? resolved?.subtitleVideoSize;

    if (
      resolved &&
      (resolved.mediaId !== mediaId || resolved.mediaType !== mediaType)
    ) {
      candidateStreamId = undefined;
    }

    let resolvedMediaSourceId = mediaSourceId;
    let resolvedSeriesId = seriesId;
    let resolvedShowName = showName;
    let resolvedEpisodeTitle = episodeTitle;
    let resolvedSeasonNumber = seasonNumber;
    let resolvedEpisodeNumber = episodeNumber;

    if (mediaType === "Episode") {
      resolvedMediaSourceId = resolvedMediaSourceId || mediaId;

      const parsed = parseSeriesRouteId(mediaId);
      if (parsed.isEpisodeTarget) {
        resolvedSeriesId = resolvedSeriesId || parsed.seriesId;
        resolvedSeasonNumber = resolvedSeasonNumber || parsed.season;
        resolvedEpisodeNumber = resolvedEpisodeNumber || parsed.episode;
      }

      if (resolvedSeriesId && !resolvedShowName) {
        try {
          const seriesDetails = await fetchMediaDetails(resolvedSeriesId, "series");
          resolvedShowName = seriesDetails?.name || undefined;
        } catch {
          // Best effort metadata enrichment.
        }
      }

      const needsEpisodeLookup =
        !!resolvedSeriesId &&
        typeof resolvedSeasonNumber === "number" &&
        typeof resolvedEpisodeNumber === "number";

      if (needsEpisodeLookup && resolvedSeriesId) {
        try {
          const episodes = await fetchEpisodes(resolvedSeriesId, resolvedSeasonNumber!);
          const matchedEpisode = episodes.find(
            (episode) => episode.episode === resolvedEpisodeNumber
          );
          if (matchedEpisode?.title) {
            resolvedEpisodeTitle = matchedEpisode.title;
          }
        } catch {
          // Fall back to provided title.
        }
      }

      if (!resolvedEpisodeTitle) {
        resolvedEpisodeTitle =
          resolvedShowName &&
          mediaName.trim().toLowerCase() === resolvedShowName.trim().toLowerCase()
            ? `Episode ${resolvedEpisodeNumber ?? ""}`.trim()
            : mediaName;
      }
    }

    return {
      success: true,
      action: "play",
      mediaId,
      mediaName,
      mediaType,
      streamId: candidateStreamId || undefined,
      streamUrl: resolvedStreamUrl,
      mediaSourceId: resolvedMediaSourceId,
      subtitleFilename: resolvedSubtitleFilename,
      subtitleVideoSize: resolvedSubtitleVideoSize,
      seriesId: resolvedSeriesId,
      showName: resolvedShowName,
      episodeTitle: resolvedEpisodeTitle,
      seasonNumber: resolvedSeasonNumber,
      episodeNumber: resolvedEpisodeNumber,
      message: resolvedStreamUrl
        ? `Playing ${mediaName}...`
        : `Playing ${mediaName}... (loading best available stream)`,
    };
  },
});

function detectStreamResolution(value: string): string | null {
  if (/\b2160p\b|\b4k\b/.test(value)) return "2160p";
  if (/\b1080p\b/.test(value)) return "1080p";
  if (/\b720p\b/.test(value)) return "720p";
  if (/\b480p\b/.test(value)) return "480p";
  return null;
}

function detectStreamTags(value: string): string[] {
  const tags: string[] = [];
  if (/\bhdr\b/.test(value)) tags.push("HDR");
  if (/\bdv\b|dolby[\s-]?vision/.test(value)) tags.push("DV");
  if (/\bweb[-\s]?dl\b|\bweb[-\s]?rip\b|\bweb\b/.test(value)) tags.push("WEB");
  if (/\bbluray\b|\bbdrip\b/.test(value)) tags.push("BLURAY");
  if (/\bremux\b/.test(value)) tags.push("REMUX");
  return tags;
}

function detectContainer(value: string): "mp4" | "mkv" | "webm" | "ts" | "unknown" {
  if (/\.(mp4|m4v)\b/.test(value)) return "mp4";
  if (/\.(mkv)\b/.test(value)) return "mkv";
  if (/\.(webm)\b/.test(value)) return "webm";
  if (/\.(ts|m2ts)\b/.test(value)) return "ts";
  return "unknown";
}

function detectVideoCodec(
  value: string
):
  | "h264"
  | "h265"
  | "av1"
  | "vp9"
  | "vp8"
  | "xvid"
  | "mpeg2"
  | "unknown" {
  if (/\b(avc|h\.?264|x264)\b/.test(value)) return "h264";
  if (/\b(hevc|h\.?265|x265)\b/.test(value)) return "h265";
  if (/\b(av1)\b/.test(value)) return "av1";
  if (/\b(vp9)\b/.test(value)) return "vp9";
  if (/\b(vp8)\b/.test(value)) return "vp8";
  if (/\b(xvid|divx)\b/.test(value)) return "xvid";
  if (/\b(mpeg2|mpeg-2)\b/.test(value)) return "mpeg2";
  return "unknown";
}

function detectAudioCodec(
  value: string
):
  | "aac"
  | "opus"
  | "ac3"
  | "eac3"
  | "dts"
  | "truehd"
  | "flac"
  | "mp3"
  | "unknown" {
  if (/\b(aac)\b/.test(value)) return "aac";
  if (/\b(opus)\b/.test(value)) return "opus";
  if (/\b(truehd|mlp)\b/.test(value)) return "truehd";
  if (/\b(dts(?:-hd)?|dca)\b/.test(value)) return "dts";
  if (/\b(ddp|e-?ac-?3|eac3)\b/.test(value)) return "eac3";
  if (/\b(ac-?3|dd5[._ ]?1|dolby\s*digital)\b/.test(value)) return "ac3";
  if (/\b(flac)\b/.test(value)) return "flac";
  if (/\b(mp3)\b/.test(value)) return "mp3";
  return "unknown";
}

function scoreStreamCandidate(input: {
  raw: string;
  hasPlayableUrl: boolean;
  videoSize?: number | null;
}): number {
  const { raw, hasPlayableUrl, videoSize } = input;
  if (!hasPlayableUrl) return -10_000;

  let score = 100;
  const resolution = detectStreamResolution(raw);
  if (resolution === "1080p") score += 320;
  if (resolution === "720p") score += 220;
  if (resolution === "480p") score += 120;

  const tags = detectStreamTags(raw);
  if (tags.includes("WEB")) score += 40;

  const container = detectContainer(raw);
  if (container === "mp4") score += 140;
  if (container === "webm") score += 80;
  if (container === "mkv") score -= 40;
  if (container === "ts") score -= 20;

  const videoCodec = detectVideoCodec(raw);
  if (videoCodec === "h264") score += 180;
  if (videoCodec === "vp9") score += 110;
  if (videoCodec === "av1") score += 60;
  if (videoCodec === "vp8") score += 40;
  if (videoCodec === "h265") score -= 120;
  if (videoCodec === "xvid") score -= 220;
  if (videoCodec === "mpeg2") score -= 180;

  const audioCodec = detectAudioCodec(raw);
  if (audioCodec === "aac") score += 120;
  if (audioCodec === "opus") score += 90;
  if (audioCodec === "ac3") score += 60;
  if (audioCodec === "eac3") score += 30;
  if (audioCodec === "mp3") score += 20;
  if (audioCodec === "flac") score -= 50;
  if (audioCodec === "dts") score -= 180;
  if (audioCodec === "truehd") score -= 250;

  if (/\b(?:cam|hdcam|telesync|ts)\b/.test(raw)) score -= 500;
  if (/\b(?:3d)\b/.test(raw)) score -= 30;
  if (/\b(?:dubbed)\b/.test(raw)) score -= 20;
  if (/\b(?:10bit|12bit)\b/.test(raw)) score -= 80;
  if (/\b(?:atmos)\b/.test(raw)) score -= 20;

  if (typeof videoSize === "number" && Number.isFinite(videoSize)) {
    const gb = videoSize / (1024 * 1024 * 1024);
    if (gb > 20) score -= 100;
    else if (gb > 14) score -= 55;
    else if (gb > 10) score -= 25;
    else if (gb >= 2.5 && gb <= 8.5) score += 25;
  }

  return score;
}

export const GetMediaStreams = tool({
  description:
    "Fetch available streams for a known media item using the same addon stream discovery path as playback/media actions. Returns ranked playable stream candidates with compact streamId values (1080p and below, no HDR/DV/Blu-ray/Remux) and a bestStream suggestion.",
  inputSchema: z.object({
    mediaId: z.string().describe("The stream source ID to fetch streams for"),
    mediaType: z
      .enum(["Movie", "Series", "Episode"])
      .describe("The media type context"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Maximum stream candidates to return (default: 20)"),
  }),
  execute: async ({ mediaId, mediaType, limit = 20 }) => {
    await hydrateStreamRegistry();
    console.log("🎞️ [GetMediaStreams] Tool called with:", {
      mediaId,
      mediaType,
      limit,
    });

    try {
      const stremioType = mediaType === "Movie" ? "movie" : "series";
      const targets = await getStreamAddonTargets(stremioType);
      const streamResponses = await Promise.all(
        targets.map(async (target) => {
          const streams = await fetchStreamsFromAddon(
            mediaId,
            stremioType,
            target.transportUrl,
            target.name
          );
          return { target, streams };
        })
      );

      const seen = new Set<string>();
      const candidates = streamResponses.flatMap(({ target, streams }) =>
        streams
          .map((stream) => {
            const streamUrl = stream.url || stream.externalUrl || null;
            const streamId = streamUrl
              ? registerStreamCandidate({
                  streamUrl,
                  subtitleFilename: stream.behaviorHints?.filename || undefined,
                  subtitleVideoSize: stream.behaviorHints?.videoSize || undefined,
                  mediaId,
                  mediaType,
                })
              : null;
            const raw = `${stream.title || ""} ${stream.name || ""} ${stream.behaviorHints?.filename || ""}`.toLowerCase();
            const key = `${target.id}|${streamUrl || ""}|${stream.title || ""}|${stream.name || ""}`;
            if (seen.has(key)) return null;
            seen.add(key);
            return {
              addonId: target.id,
              addonName: target.name,
              streamId,
              name: stream.name || null,
              title: stream.title || null,
              filename: stream.behaviorHints?.filename || null,
              videoSize: stream.behaviorHints?.videoSize || null,
              resolution: detectStreamResolution(raw),
              tags: detectStreamTags(raw),
              container: detectContainer(raw),
              videoCodec: detectVideoCodec(raw),
              audioCodec: detectAudioCodec(raw),
              score: scoreStreamCandidate({
                raw,
                hasPlayableUrl: Boolean(streamId),
                videoSize: stream.behaviorHints?.videoSize || null,
              }),
              playable: Boolean(streamId),
            };
          })
          .filter(Boolean)
      );

      const ranked = candidates
        .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
        // Hard-filter: only streams the browser can actually play.
        // Exclude 4K (2160p), HDR, Dolby Vision, Blu-ray, and Remux encodings.
        .filter((candidate) => {
          if (candidate.resolution === "2160p") return false;
          const tags = candidate.tags ?? [];
          if (tags.includes("HDR")) return false;
          if (tags.includes("DV")) return false;
          if (tags.includes("BLURAY")) return false;
          if (tags.includes("REMUX")) return false;
          if (candidate.audioCodec === "dts") return false;
          if (candidate.audioCodec === "truehd") return false;
          if (candidate.videoCodec === "xvid") return false;
          if (candidate.videoCodec === "mpeg2") return false;
          return true;
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      const numbered = ranked.map((stream, index) => ({
        ...stream,
        choice: index + 1,
      }));

      const selectionId = registerStreamSelection({
        mediaId,
        mediaType,
        choices: numbered.reduce<Record<string, string>>((acc, stream) => {
          if (stream.streamId) {
            acc[String(stream.choice)] = stream.streamId;
          }
          return acc;
        }, {}),
      });

      const bestStream =
        numbered.find((stream) => stream.playable && stream.streamId) || null;

      await persistStreamRegistry();

      return {
        success: true,
        action: "getMediaStreams",
        mediaId,
        mediaType,
        selectionId,
        streamCount: numbered.length,
        addonCount: targets.length,
        streams: numbered,
        bestStream,
        message: bestStream
          ? `Found ${ranked.length} stream candidates.`
          : "No playable stream URLs found.",
      };
    } catch (error) {
      return {
        success: false,
        action: "getMediaStreams",
        mediaId,
        mediaType,
        streams: [],
        bestStream: null,
        message: "Failed to fetch streams.",
        error:
          error instanceof Error ? error.message : "Failed to fetch streams.",
      };
    }
  },
});

export const getMovies = tool({
  description:
    "Get a list of recent movies from the library. For genre-specific requests, use getMoviesByGenre instead.",
  inputSchema: z.object({
    limit: z
      .number()
      .optional()
      .describe("Number of movies to retrieve (default: 20)"),
    genreIds: z
      .array(z.string())
      .optional()
      .describe(
        "Array of genre IDs to filter movies by (use getMoviesByGenre for genre names)"
      ),
  }),
  execute: async ({ limit = 20, genreIds }) => {
    console.log("🎬 [getMovies] Tool called with:", { limit, genreIds });
    try {
      const movies = await fetchMovies(limit);
      const filteredMovies =
        genreIds && genreIds.length > 0
          ? movies.filter((movie) =>
              movie.genres?.some((genre) => genreIds.includes(genre))
            )
          : movies;
      return {
        success: true,
        movies: filteredMovies.map((movie) => ({
          id: movie.id,
          name: movie.name,
          type: movie.type || "movie",
          year: movie.year || null,
          overview: movie.description
            ? movie.description.substring(0, 200) + "..."
            : null,
          genres: movie.genres || [],
        })),
        count: filteredMovies.length,
      };
    } catch (error) {
      return {
        success: false,
        error: "Failed to fetch movies",
        movies: [],
      };
    }
  },
});

export const getTVShows = tool({
  description:
    "Get a list of recent TV shows from the library. For genre-specific requests, use getTVShowsByGenre instead.",
  inputSchema: z.object({
    limit: z
      .number()
      .optional()
      .describe("Number of TV shows to retrieve (default: 20)"),
    genreIds: z
      .array(z.string())
      .optional()
      .describe(
        "Array of genre IDs to filter TV shows by (use getTVShowsByGenre for genre names)"
      ),
  }),
  execute: async ({ limit = 20, genreIds }) => {
    console.log("📺 [getTVShows] Tool called with:", { limit, genreIds });
    try {
      const shows = await fetchTVShows(limit);
      const filteredShows =
        genreIds && genreIds.length > 0
          ? shows.filter((show) =>
              show.genres?.some((genre) => genreIds.includes(genre))
            )
          : shows;
      return {
        success: true,
        shows: filteredShows.map((show) => ({
          id: show.id,
          name: show.name,
          type: show.type || "series",
          year: show.year || null,
          overview: show.description ? show.description.substring(0, 200) + "..." : null,
          genres: show.genres || [],
        })),
        count: filteredShows.length,
      };
    } catch (error) {
      return {
        success: false,
        error: "Failed to fetch TV shows",
        shows: [],
      };
    }
  },
});

export const continueWatching = tool({
  description:
    "Fetch list of media items that are currently being watched/continued",
  inputSchema: z.object({
    limit: z.number().optional().describe("Number of items, default is 20"),
  }),
  execute: async ({ limit = 20 }) => {
    console.log("🕒 [continueWatching] Tool called with limit:", limit);
    try {
      const items = await fetchResumeItems();
      console.log("[continueWatching] Fetched items:", items);
      return {
        success: true,
        resumeItems: items.slice(0, limit).map((item) => ({
          id: item.id,
          name: item.name,
          seriesId: null,
          seriesName: null,
          type: item.type,
          year: item.year || null,
          communityRating: item.imdbRating ? Number(item.imdbRating) : null,
          criticRating: null,
          officialRating: null,
          runtime: item.runtime || null,
          overview: item.description ? item.description.substring(0, 200) + "..." : null,
          userProgress: null,
        })),
        count: items.length,
      };
    } catch (error) {
      return {
        success: false,
        error: "Failed to fetch continue-watching items",
        resumeItems: [],
      };
    }
  },
});

export const getMediaDetails = tool({
  description: "Get detailed information about a specific movie or TV show",
  inputSchema: z.object({
    mediaId: z.string().describe("The unique ID of the media item"),
  }),
  execute: async ({ mediaId }) => {
    console.log("📋 [getMediaDetails] Tool called with mediaId:", mediaId);
    try {
      const details = await fetchMediaDetails(mediaId);
      if (!details) {
        return {
          success: false,
          error: "Media not found",
        };
      }
      return {
        success: true,
        details: {
          id: details.id,
          name: details.name,
          type: details.type,
          year: details.year || null,
          overview: details.description,
          rating: details.imdbRating || null,
          runtime: details.runtime || null,
          genres: details.genres || [],
          cast: details.cast?.slice(0, 5) || [],
        },
      };
    } catch (error) {
      return {
        success: false,
        error: "Failed to fetch media details",
      };
    }
  },
});

export const getGenres = tool({
  description: "Get list of all genres available in the library",
  inputSchema: z.object({
    mediaType: z
      .enum(["Movie", "Series", "All"])
      .optional()
      .describe("Filter by media type, default is All"),
  }),
  execute: async ({ mediaType = "All" }) => {
    console.log("🎭 [getGenres] Tool called with mediaType:", mediaType);
    try {
      const genresResponse = await fetchGenres();
      console.log("[getGenres] Fetched genres:", genresResponse);

      if (!genresResponse?.Items) {
        return {
          success: false,
          error: "No genres found",
          genres: [],
        };
      }

      const genres = genresResponse.Items;

      return {
        success: true,
        genres,
        count: genres.length,
      };
    } catch (error) {
      return {
        success: false,
        error: "Failed to fetch genres",
        genres: [],
      };
    }
  },
});

export const getWatchlist = tool({
  description:
    "Get user's watchlist or favorites (simulated with highly-rated content)",
  inputSchema: z.object({
    limit: z.number().optional().describe("Number of items, default is 20"),
  }),
  execute: async ({ limit = 20 }) => {
    console.log("⭐ [getWatchlist] Tool called with limit:", limit);
    try {
      // Since there's no direct watchlist API, we'll get popular/recent content
      const [movies, shows] = await Promise.all([
        fetchMovies(Math.ceil(limit / 2)),
        fetchTVShows(Math.ceil(limit / 2)),
      ]);

      const allItems = [...movies, ...shows].slice(0, limit);

      return {
        success: true,
        watchlist: allItems.map((item) => ({
          id: item.id,
          name: item.name,
          type: item.type,
          year: item.year || null,
          communityRating: item.imdbRating ? Number(item.imdbRating) : null,
          criticRating: null,
          officialRating: null,
          runtime: item.runtime || null,
          overview: item.description ? item.description.substring(0, 200) + "..." : null,
        })),
        count: allItems.length,
      };
    } catch (error) {
      return {
        success: false,
        error: "Failed to fetch watchlist",
        watchlist: [],
      };
    }
  },
});

export const findSimilarItems = tool({
  description: "Find similar items by media ID",
  inputSchema: z.object({
    mediaId: z.string().describe("The unique ID of the media item"),
  }),
  execute: async ({ mediaId }) => {
    console.log("🔗 [findSimilarItems] Tool called with mediaId:", mediaId);
    try {
      const results = await fetchSimilarItems(mediaId);
      return {
        success: true,
        similarItems: results?.map((item) => ({
          id: item.id,
          name: item.name,
          type: item.type,
          year: item.year || null,
          communityRating: item.imdbRating ? Number(item.imdbRating) : null,
          criticRating: null,
          officialRating: null,
          runtime: item.runtime || null,
          overview: item.description,
        })),
        count: results.length,
      };
    } catch (error) {
      return {
        success: false,
        error: "Failed to find similar items",
        similarItems: [],
      };
    }
  },
});

export const getMoviesByGenre = tool({
  description: "Get a list of movies filtered by genre name",
  inputSchema: z.object({
    genreName: z.string().describe("The name of the genre to filter by"),
    limit: z
      .number()
      .optional()
      .describe("Number of movies to retrieve (default: 20)"),
  }),
  execute: async ({ genreName, limit = 20 }) => {
    console.log("🎬🎭 [getMoviesByGenre] Tool called with:", {
      genreName,
      limit,
    });
    try {
      // First, fetch the genre to get its ID
      const genreData = await fetchGenre(genreName);
      if (!genreData?.Id) {
        return {
          success: false,
          error: `Genre "${genreName}" not found`,
          movies: [],
        };
      }

      // Then fetch movies with the genre ID
      const movies = (await fetchMovies(limit)).filter((movie) =>
        movie.genres?.includes(genreData.Id)
      );
      return {
        success: true,
        movies: movies.map((movie) => ({
          id: movie.id,
          name: movie.name,
          year: movie.year || null,
          overview: movie.description ? movie.description.substring(0, 200) + "..." : null,
          genres: movie.genres || [],
        })),
        count: movies.length,
        genre: genreData.Name,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to fetch movies for genre "${genreName}"`,
        movies: [],
      };
    }
  },
});

export const getTVShowsByGenre = tool({
  description: "Get a list of TV shows filtered by genre name",
  inputSchema: z.object({
    genreName: z.string().describe("The name of the genre to filter by"),
    limit: z
      .number()
      .optional()
      .describe("Number of TV shows to retrieve (default: 20)"),
  }),
  execute: async ({ genreName, limit = 20 }) => {
    console.log("📺🎭 [getTVShowsByGenre] Tool called with:", {
      genreName,
      limit,
    });
    try {
      // First, fetch the genre to get its ID
      const genreData = await fetchGenre(genreName);
      if (!genreData?.Id) {
        return {
          success: false,
          error: `Genre "${genreName}" not found`,
          shows: [],
        };
      }

      // Then fetch TV shows with the genre ID
      const shows = (await fetchTVShows(limit)).filter((show) =>
        show.genres?.includes(genreData.Id)
      );
      return {
        success: true,
        shows: shows.map((show) => ({
          id: show.id,
          name: show.name,
          year: show.year || null,
          overview: show.description ? show.description.substring(0, 200) + "..." : null,
          genres: show.genres || [],
        })),
        count: shows.length,
        genre: genreData.Name,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to fetch TV shows for genre "${genreName}"`,
        shows: [],
      };
    }
  },
});
