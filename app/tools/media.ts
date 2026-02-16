import { tool } from "ai";
import { z } from "zod";
import { searchItems } from "@/app/actions/search";
import {
  fetchMovies,
  fetchTVShows,
  fetchMediaDetails,
  fetchResumeItems,
  fetchSimilarItems,
  fetchGenres,
  fetchGenre,
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

export interface PlayMediaTool {
  success: boolean;
  action: string;
  mediaId: string;
  mediaName: string;
  mediaType: "Movie" | "Series" | "Episode";
  message: string;
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
  }>;
  message: string;
  error?: string;
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
    "Return all NON-special episodes (season > 0) for a resolved TV series so the model can semantically choose the best match for the user's episode title.",
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
          overview: episode.overview,
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
  }),
  execute: async ({ mediaId, mediaName, mediaType }) => {
    console.log("▶️ [playMedia] Tool called with:", {
      mediaId,
      mediaName,
      mediaType,
    });
    return {
      success: true,
      action: "play",
      mediaId,
      mediaName,
      mediaType,
      message: `Playing ${mediaName}...`,
    };
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
