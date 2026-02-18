import {
  fetchMediaDetails,
  fetchSimilarItems,
} from "@/app/actions";
import { MediaActions } from "@/components/media-actions";
import { SearchBar } from "@/components/search-component";
import { Badge } from "@/components/ui/badge";
import { MediaSection } from "@/components/media-section";
import { VibrantAuroraBackground } from "@/components/vibrant-aurora-background";
import { VibrantLogo } from "@/components/vibrant-logo";
import { TextAnimate } from "@/components/magicui/text-animate";
import { Star } from "lucide-react";
import { redirect } from "next/navigation";
import { BackdropImage } from "@/components/media-page/backdrop-image";
import { PosterImage } from "@/components/media-page/poster-image";
import type { MediaItem } from "@/types/stremio";
import { Suspense } from "react";

export default async function Movie({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  try {
    const movie = await fetchMediaDetails(id, "movie");

    if (!movie) {
      return <div className="p-4">Movie not found</div>;
    }

    const similarItems = await fetchSimilarItems(id, "movie", 12);

    return (
      <div className="min-h-screen overflow-hidden md:pr-1 pb-8">
        <VibrantAuroraBackground
          backdropUrl={movie.background || movie.poster || ""}
          className="fixed inset-0 z-10 pointer-events-none opacity-50"
        />

        {/* Backdrop section */}
        <div className="relative">
          <div className="relative h-[46vh] md:h-[62vh] overflow-hidden md:rounded-xl md:mt-2.5">
            <BackdropImage
              movie={movie}
              backdropImage={movie.background || ""}
              className="w-full h-full object-cover"
              width={1920}
              height={1080}
            />
            {movie.logo && (
              <VibrantLogo
                src={movie.logo}
                alt={`${movie.name} logo`}
                movieName={movie.name || ""}
                width={420}
                height={134}
                className="absolute md:top-[38%] top-[32%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 max-h-24 md:max-h-32 w-auto object-contain max-w-2/3 invisible md:visible"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/30 to-black/90 md:rounded-xl" />
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black to-transparent md:rounded-xl" />
          </div>

          <div className="absolute top-8 left-0 right-0 z-20 px-6">
            <Suspense fallback={null}>
              <SearchBar />
            </Suspense>
          </div>
        </div>

        {/* Content section */}
        <div className="relative z-10 -mt-54 md:pl-6 bg-background/95 dark:bg-background/50 backdrop-blur-xl rounded-2xl mx-4 pb-6">
          <div
            id="stream-loading-pill-anchor"
            className="absolute top-4 right-4 z-30 pointer-events-none"
          />
          <div className="flex flex-col md:flex-row md:gap-2 mx-auto">
            <div className="w-full md:w-auto flex-shrink-0 justify-center flex md:block z-50 mt-6">
              <PosterImage
                movie={movie}
                posterImage={movie.poster || ""}
                className="w-full h-auto rounded-lg shadow-lg max-w-1/2 md:w-[14rem] md:max-w-none"
                width={500}
                height={750}
              />
            </div>

            <div className="w-full min-w-0 flex-1 pt-2 text-center md:text-start mt-8 md:mt-12">
              <div className="mb-4 flex justify-center md:justify-start">
                <TextAnimate
                  as="h1"
                  className="text-4xl md:text-5xl font-semibold font-poppins text-foreground md:pl-8 drop-shadow-xl"
                  animation="blurInUp"
                  by="character"
                  once
                >
                  {movie.name || ""}
                </TextAnimate>
              </div>

              {/* Badges */}
              <div className="flex flex-wrap items-center gap-2 mb-2 justify-center md:justify-start md:pl-8">
                {movie.year && (
                  <Badge variant="outline" className="bg-background/90 backdrop-blur-sm">
                    {movie.year}
                  </Badge>
                )}
                {movie.runtime && (
                  <Badge variant="outline" className="bg-background/90 backdrop-blur-sm">
                    {movie.runtime}
                  </Badge>
                )}
                {movie.imdbRating && (
                  <Badge variant="outline" className="bg-background/90 backdrop-blur-sm flex items-center gap-1">
                    <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                    {movie.imdbRating}
                  </Badge>
                )}
              </div>

              <div className="px-8 md:pl-8 md:pt-4 md:pr-16 flex flex-col justify-center md:items-start items-center">
                {movie.description && (
                  <p className="text-md leading-relaxed mb-6 max-w-4xl">
                    {movie.description}
                  </p>
                )}

                <div className="space-y-3 mb-6 max-w-4xl">
                  {movie.genres && movie.genres.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-muted-foreground min-w-fit">
                        Genres:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {movie.genres.map((genre) => (
                          <Badge key={genre} variant="secondary" className="text-xs">
                            {genre}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {movie.director && movie.director.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-muted-foreground min-w-fit">
                        Director:
                      </span>
                      <span className="text-sm">{movie.director.join(", ")}</span>
                    </div>
                  )}

                  {movie.writer && movie.writer.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-muted-foreground min-w-fit">
                        Writers:
                      </span>
                      <span className="text-sm">{movie.writer.join(", ")}</span>
                    </div>
                  )}

                  {movie.cast && movie.cast.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-muted-foreground min-w-fit">
                        Cast:
                      </span>
                      <span className="text-sm">{movie.cast.slice(0, 8).join(", ")}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-10 w-full pr-4">
            <MediaActions movie={movie} />
          </div>
        </div>

        {similarItems && similarItems.length > 0 && (
          <div className="mt-8 px-6">
            <MediaSection
              sectionName="More Like This"
              mediaItems={similarItems}
            />
          </div>
        )}
      </div>
    );
  } catch (error: any) {
    if (error.message?.includes("Authentication expired")) {
      redirect("/login");
    }
    console.error("Error loading movie:", error);
    return <div className="p-4">Error loading movie. Please try again.</div>;
  }
}
