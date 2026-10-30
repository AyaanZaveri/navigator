import { Badge } from "@/components/ui/badge";
import { Star, TvIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buildSeriesPath } from "@/lib/series-route";
import { getSeriesEpisodeSelectionData } from "../../_shared/series-data";
import { Suspense } from "react";
import { PlaybackProgressOverlay } from "@/components/media-page/playback-progress-overlay";
import { EpisodeHeroThumbnail } from "@/components/episode-hero-thumbnail";

export default async function EpisodeOnSeriesPage({
  params,
}: {
  params: Promise<{ id: string; season: string; episode: string }>;
}) {
  const { id, season, episode } = await params;

  try {
    const episodeData = await getSeriesEpisodeSelectionData(id, season, episode);

    if (!episodeData) {
      return <div className="p-4">Episode not found</div>;
    }

    const {
      show,
      seasonNumber,
      episodeNumber,
      selectedEpisode,
      selectedEpisodeTitle,
      regularSeasonCount,
    } = episodeData;

    return (
      <div className="flex flex-col md:flex-row md:gap-2 mx-auto">
        <div className="w-full md:w-auto flex-shrink-0 justify-center flex flex-col items-center md:items-start md:block z-50 mt-6">
          <div className="relative aspect-video rounded-lg overflow-hidden shadow-lg bg-muted max-w-1/2 md:w-[22rem] lg:w-[24rem] md:max-w-none mt-16">
            <EpisodeHeroThumbnail
              thumbnail={selectedEpisode.thumbnail}
              released={selectedEpisode.released}
              title={selectedEpisodeTitle}
            />
            <Suspense fallback={null}>
              <PlaybackProgressOverlay mediaId={show.id} videoId={selectedEpisode.id} />
            </Suspense>
          </div>
        </div>

        <div className="w-full min-w-0 flex-1 pt-10 md:pt-8 text-center md:text-start mt-8 md:mt-12">
          <div className="mb-4 flex justify-center md:justify-start">
            <h2 className="text-sm font-medium text-muted-foreground md:pl-8 inline-flex items-center">
              <Link
                href={buildSeriesPath(id)}
                prefetch={true}
                className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
              >
                <TvIcon className="w-3.5 h-3.5 mr-2" />
                {show.name}
              </Link>
              <span className="mx-2">•</span>
              <span>Season {seasonNumber}</span>
            </h2>
          </div>

          <div className="mb-4 flex justify-center md:justify-start">
            <h1
              className="text-4xl md:text-5xl font-semibold font-poppins text-foreground md:pl-8 drop-shadow-xl"
            >
              {`${episodeNumber}. ${selectedEpisodeTitle}`}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-2 justify-center md:justify-start md:pl-8">
            <Badge variant="outline" className="bg-background/90 backdrop-blur-sm">
              S{seasonNumber} • E{episodeNumber}
            </Badge>
            {selectedEpisode.released && (
              <Badge variant="outline" className="bg-background/90 backdrop-blur-sm">
                {new Date(selectedEpisode.released).getFullYear()}
              </Badge>
            )}
            {show.imdbRating && (
              <Badge variant="outline" className="bg-background/90 backdrop-blur-sm">
                <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                {show.imdbRating}
              </Badge>
            )}
            {regularSeasonCount > 0 && (
              <Badge variant="outline" className="bg-background/90 backdrop-blur-sm">
                {regularSeasonCount} Season{regularSeasonCount !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>

          <div className="px-8 md:pl-8 md:pt-4 md:pr-16 flex flex-col justify-center md:items-start items-center">
            {selectedEpisode.overview && (
              <p className="text-md leading-relaxed mb-6 max-w-4xl">
                {selectedEpisode.overview}
              </p>
            )}

          </div>
        </div>
      </div>
    );
  } catch (error: any) {
    if (error.message?.includes("Authentication expired")) {
      redirect("/login");
    }
    console.error("Error loading episode on series page:", error);
    return <div className="p-4">Error loading episode. Please try again.</div>;
  }
}
