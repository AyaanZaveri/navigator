import { tool } from "ai";
import { z } from "zod";
import { fetchSeasons, fetchEpisodes } from "@/app/actions/tv-shows";

function parseSeasonId(seasonId: string): { seriesId: string; seasonNumber?: number } {
  const trimmed = seasonId.trim();
  const match = trimmed.match(/^(.*):(\d+)$/);

  if (!match) {
    return { seriesId: trimmed };
  }

  const [, seriesId, seasonStr] = match;
  const parsedSeason = Number(seasonStr);
  if (!Number.isInteger(parsedSeason) || parsedSeason < 0) {
    return { seriesId: trimmed };
  }

  return { seriesId, seasonNumber: parsedSeason };
}

export const getSeasons = tool({
  description: "Get seasons for a TV show",
  inputSchema: z.object({
    tvShowId: z.string().describe("The unique ID of the TV show"),
  }),
  execute: async ({ tvShowId }) => {
    console.log("📺 [getSeasons] Tool called with tvShowId:", tvShowId);
    try {
      const seasons = await fetchSeasons(tvShowId);
      return {
        success: true,
        seasons: seasons.map((season) => ({
          id: `${tvShowId}:${season.number}`,
          name: season.name,
          seasonNumber: season.number,
          episodeCount: season.episodeCount,
          overview: null,
        })),
        count: seasons.length,
      };
    } catch (error) {
      return {
        success: false,
        error: "Failed to fetch seasons",
        seasons: [],
      };
    }
  },
});

export const getEpisodes = tool({
  description: "Get episodes for a TV show season",
  inputSchema: z.object({
    seasonId: z.string().describe("The unique ID of the season"),
  }),
  execute: async ({ seasonId }) => {
    console.log(
      "📺 [getEpisodes] Tool called with seasonId:",
      seasonId
    );
    try {
      const { seriesId, seasonNumber } = parseSeasonId(seasonId);
      if (seasonNumber === undefined) {
        return {
          success: false,
          error:
            "Invalid seasonId. Expected format '<seriesId>:<seasonNumber>' (for example: 'tt0944947:1').",
          episodes: [],
        };
      }

      const episodes = await fetchEpisodes(seriesId, seasonNumber);
      const sortedEpisodes = [...episodes].sort((a, b) => {
        if (a.season !== b.season) return a.season - b.season;
        return a.episode - b.episode;
      });
      const MAX_EPISODES = 40;
      const trimmedEpisodes = sortedEpisodes.slice(0, MAX_EPISODES);

      return {
        success: true,
        episodes: trimmedEpisodes.map((episode) => ({
          id: episode.id,
          type: "Episode",
          seriesId,
          name: episode.title,
          episodeNumber: episode.episode,
          seasonNumber: episode.season,
          overview: episode.overview,
          thumbnail: episode.thumbnail,
          poster: episode.thumbnail ?? null,
        })),
        count: episodes.length,
        returnedCount: trimmedEpisodes.length,
        truncated: episodes.length > MAX_EPISODES,
      };
    } catch (error) {
      return {
        success: false,
        error: "Failed to fetch episodes",
        episodes: [],
      };
    }
  },
});
