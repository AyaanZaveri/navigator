import { MediaActions } from "@/components/media-actions";
import { Badge } from "@/components/ui/badge";
import { TextAnimate } from "@/components/magicui/text-animate";
import { Star, TvIcon } from "lucide-react";
import { redirect } from "next/navigation";
import { getSeriesEpisodeSelectionData } from "../../_shared/series-data";

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
      episodeMedia,
      regularSeasonCount,
    } = episodeData;

    return (
      <div className="flex flex-col md:flex-row mx-auto">
        <div className="w-full md:w-1/3 lg:w-1/4 flex-shrink-0 justify-center flex md:block z-50 mt-6">
          {selectedEpisode.thumbnail ? (
            <div className="relative aspect-video rounded-lg overflow-hidden shadow-2xl bg-muted max-w-1/2 md:max-w-full mt-16">
              <img
                src={selectedEpisode.thumbnail}
                alt={selectedEpisodeTitle}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <img
              src={show.poster || ""}
              alt={show.name}
              className="w-full h-auto rounded-lg shadow-2xl max-w-1/2 md:max-w-full"
            />
          )}
        </div>

        <div className="w-full md:w-2/3 lg:w-3/4 pt-10 md:pt-8 text-center md:text-start mt-8">
          <div className="mb-4 flex justify-center md:justify-start">
            <h2 className="text-sm font-medium text-muted-foreground md:pl-8 inline-flex items-center">
              <TvIcon className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
              <span>{show.name}</span>
              <span className="mx-2">•</span>
              <span>Season {seasonNumber}</span>
            </h2>
          </div>

          <div className="mb-4 flex justify-center md:justify-start">
            <TextAnimate
              as="h1"
              className="text-4xl md:text-5xl font-semibold font-poppins text-foreground md:pl-8 drop-shadow-xl"
              animation="blurInUp"
              by="character"
              once
            >
              {`${episodeNumber}. ${selectedEpisodeTitle}`}
            </TextAnimate>
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

            <MediaActions media={episodeMedia} />
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
