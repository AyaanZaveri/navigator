import { cache } from "react";
import { fetchMediaDetails, fetchSimilarItems } from "@/app/actions";
import type { MediaItem, StremioVideo } from "@/types/stremio";

export interface SeriesLayoutData {
  show: MediaItem;
  regularSeasonCount: number;
  similarItems: MediaItem[];
}

export interface SeriesEpisodeSelectionData {
  show: MediaItem;
  regularSeasonCount: number;
  similarItems: MediaItem[];
  seasonNumber: number;
  episodeNumber: number;
  selectedEpisode: StremioVideo;
  selectedEpisodeTitle: string;
  episodeMedia: MediaItem;
}

export const getSeriesLayoutData = cache(
  async (id: string): Promise<SeriesLayoutData | null> => {
    const [show, similarItems] = await Promise.all([
      fetchMediaDetails(id, "series"),
      fetchSimilarItems(id, "series", 12),
    ]);

    if (!show) {
      return null;
    }

    const seasonNumbers = new Set(
      (show.videos ?? [])
        .map((video) => video.season)
        .filter(
          (seasonNumber): seasonNumber is number =>
            typeof seasonNumber === "number" && seasonNumber > 0
        )
    );

    return {
      show,
      regularSeasonCount: seasonNumbers.size,
      similarItems,
    };
  }
);

export const getSeriesEpisodeSelectionData = cache(
  async (
    id: string,
    seasonParam: string,
    episodeParam: string
  ): Promise<SeriesEpisodeSelectionData | null> => {
    const seasonNumber = Number(seasonParam);
    const episodeNumber = Number(episodeParam);

    if (
      !Number.isFinite(seasonNumber) ||
      !Number.isFinite(episodeNumber) ||
      !Number.isInteger(seasonNumber) ||
      !Number.isInteger(episodeNumber) ||
      seasonNumber < 1 ||
      episodeNumber < 1
    ) {
      return null;
    }

    const layoutData = await getSeriesLayoutData(id);
    if (!layoutData) {
      return null;
    }

    const selectedEpisode = layoutData.show.videos?.find(
      (video) =>
        video.season === seasonNumber && video.episode === episodeNumber
    );

    if (!selectedEpisode) {
      return null;
    }

    const selectedEpisodeTitle =
      selectedEpisode.title ||
      selectedEpisode.name ||
      `Episode ${episodeNumber}`;

    const episodeMedia: MediaItem = {
      ...layoutData.show,
      id: selectedEpisode.id,
      type: "series",
      name: selectedEpisodeTitle,
      description: selectedEpisode.overview || layoutData.show.description,
      poster: selectedEpisode.thumbnail || layoutData.show.poster,
    };

    return {
      ...layoutData,
      seasonNumber,
      episodeNumber,
      selectedEpisode,
      selectedEpisodeTitle,
      episodeMedia,
    };
  }
);
