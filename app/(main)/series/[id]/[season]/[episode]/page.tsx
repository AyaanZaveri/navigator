import { Badge } from "@/components/ui/badge";
import { Star, TvIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buildSeriesPath } from "@/lib/series-route";
import { getSeriesEpisodeSelectionData } from "../../_shared/series-data";
import { EpisodeHeroThumbnail } from "@/components/episode-hero-thumbnail";
import { MediaPlayButton } from "@/components/media-page/play-button";

export default async function EpisodeOnSeriesPage({
  params,
}: {
  params: Promise<{ id: string; season: string; episode: string }>;
}) {
  const { id, season, episode } = await params;

  try {
    const episodeData = await getSeriesEpisodeSelectionData(
      id,
      season,
      episode,
    );

    if (!episodeData) {
      return <div className="p-4">Episode not found</div>;
    }

    const {
      show,
      seasonNumber,
      episodeNumber,
      selectedEpisode,
      selectedEpisodeTitle,
    } = episodeData;

    return (
      <section
        aria-labelledby="episode-title"
        className="@container"
      >
        <div className="grid min-w-0 gap-6 @4xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] @4xl:items-start @4xl:gap-8">
          <div className="relative mx-auto aspect-video w-full max-w-xl overflow-hidden rounded-lg bg-muted shadow-lg @4xl:mx-0 @4xl:max-w-none">
            <EpisodeHeroThumbnail
              thumbnail={selectedEpisode.thumbnail}
              released={selectedEpisode.released}
              title={selectedEpisodeTitle}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-6 text-start @4xl:pt-3">
            <div className="flex min-w-0 flex-col items-center gap-3 text-center @4xl:items-start @4xl:text-start">
              <nav
                aria-label="Episode context"
                className="flex min-w-0 flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm font-medium text-muted-foreground @4xl:justify-start"
              >
                <Link
                  href={buildSeriesPath(id)}
                  prefetch={true}
                  draggable={false}
                  className="inline-flex min-w-0 max-w-full items-center gap-2 transition-colors hover:text-foreground"
                >
                  <TvIcon aria-hidden="true" className="relative -top-[0.5px] size-3.5 shrink-0" />
                  <span className="min-w-0 break-words">{show.name}</span>
                </Link>
              </nav>

              <h1
                id="episode-title"
                className="min-w-0 break-words text-3xl font-semibold leading-tight text-foreground text-balance @lg:text-4xl @5xl:text-5xl"
              >
                {`${episodeNumber}. ${selectedEpisodeTitle}`}
              </h1>

              <div className="flex flex-wrap items-center justify-center gap-2 @4xl:justify-start">
                <Badge
                  variant="outline"
                  className="bg-background/90 backdrop-blur-sm"
                >
                  S{seasonNumber} • E{episodeNumber}
                </Badge>
                {selectedEpisode.released && (
                  <Badge
                    variant="outline"
                    className="bg-background/90 backdrop-blur-sm"
                  >
                    {new Date(selectedEpisode.released).getFullYear()}
                  </Badge>
                )}
                {show.imdbRating && (
                  <Badge
                    variant="outline"
                    className="bg-background/90 backdrop-blur-sm"
                  >
                    <Star className="size-3 fill-yellow-400 text-yellow-400" />
                    {show.imdbRating}
                  </Badge>
                )}
              </div>
              <MediaPlayButton
                media={{
                  id: show.id,
                  name: selectedEpisodeTitle,
                  type: "series",
                  mediaSourceId: selectedEpisode.id,
                  seriesId: show.id,
                  showName: show.name,
                  episodeTitle: selectedEpisodeTitle,
                  seasonNumber,
                  episodeNumber,
                  resumePositionTicks: selectedEpisode.resumePositionTicks,
                  backdropUrl: show.background || selectedEpisode.thumbnail || show.poster,
                }}
              />
            </div>

            {selectedEpisode.overview && (
              <p className="max-w-prose break-words text-base leading-relaxed">
                {selectedEpisode.overview}
              </p>
            )}
          </div>
        </div>
      </section>
    );
  } catch (error: any) {
    if (error.message?.includes("Authentication expired")) {
      redirect("/login");
    }
    console.error("Error loading episode on series page:", error);
    return <div className="p-4">Error loading episode. Please try again.</div>;
  }
}
