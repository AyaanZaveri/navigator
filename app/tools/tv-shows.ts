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
      const episodes = await fetchEpisodes(seriesId, seasonNumber);
      return {
        success: true,
        episodes: episodes.map((episode) => ({
          id: episode.id,
          type: "Episode",
          seriesId,
          name: episode.title,
          episodeNumber: episode.episode,
          seasonNumber: episode.season,
          overview: episode.overview,
          thumbnail: episode.thumbnail,
          released: episode.released,
        })),
        count: episodes.length,
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
