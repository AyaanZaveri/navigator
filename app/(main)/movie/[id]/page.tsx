import { fetchMediaDetails, fetchSimilarItems } from "@/app/actions";
import { MediaActions } from "@/components/media-actions";
import { Badge } from "@/components/ui/badge";
import { MediaSection } from "@/components/media-section";
import { Skeleton } from "@/components/ui/skeleton";
import { VibrantAuroraBackground } from "@/components/vibrant-aurora-background";
import { VibrantLogo } from "@/components/vibrant-logo";
import { Star } from "lucide-react";
import { redirect } from "next/navigation";
import { BackdropImage } from "@/components/media-page/backdrop-image";
import { PosterImage } from "@/components/media-page/poster-image";
import type { MediaItem } from "@/types/stremio";
import { Suspense } from "react";
import { PlaybackProgressOverlay } from "@/components/media-page/playback-progress-overlay";

function SimilarMoviesSkeleton() {
  return (
    <div className="mt-8 px-6 md:px-10">
      <div className="mb-6 flex items-center justify-between">
        <Skeleton className="h-8 w-40 rounded" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-9 w-20 rounded-md" />
        </div>
      </div>
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={`similar-movie-skeleton-${index}`}
            className="w-36 flex-shrink-0"
          >
            <Skeleton className="aspect-[2/3] w-full rounded-md" />
            <Skeleton className="mt-3 h-4 w-11/12 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

async function SimilarMovies({ movieId }: { movieId: string }) {
  const similarItems = await fetchSimilarItems(movieId, "movie", 12);

  if (!similarItems || similarItems.length === 0) return null;

  return (
    <div className="mt-8 px-6 md:px-10">
      <MediaSection sectionName="More Like This" mediaItems={similarItems} />
    </div>
  );
}

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

    const movieWithProgress: MediaItem = {
      ...movie,
    };

    return (
      <div className="min-h-screen overflow-hidden pb-8">
        <VibrantAuroraBackground
          backdropUrl={movie.background || movie.poster || ""}
          className="fixed inset-0 z-10 pointer-events-none opacity-50"
        />

        {/* Backdrop section */}
        <div className="relative">
          <div className="relative h-[46vh] md:h-[62vh] overflow-hidden">
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
                width={480}
                height={154}
                className="absolute top-[28%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 max-h-24 md:max-h-28 w-[min(30rem,60%)] h-auto object-contain invisible md:visible"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/30 to-black/90" />
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black to-transparent" />
          </div>
        </div>

        {/* Content section */}
        <div className="relative z-10 -mt-54 px-4 pt-6 md:px-6 md:pt-8 bg-background/95 dark:bg-background/50 backdrop-blur-xl rounded-2xl mx-4 pb-6">
          <div
            id="stream-loading-pill-anchor"
            className="absolute top-4 right-4 z-30 pointer-events-none"
          />
          <section aria-labelledby="movie-title" className="@container">
            <div className="grid min-w-0 gap-6 @3xl:grid-cols-[14rem_minmax(0,1fr)] @3xl:items-start @3xl:gap-8">
              <div className="relative w-40 max-w-full @3xl:w-full">
                <PosterImage
                  movie={movie}
                  posterImage={movie.poster || ""}
                  className="w-full h-auto rounded-lg shadow-lg"
                  width={500}
                  height={750}
                />
                <Suspense fallback={null}>
                  <PlaybackProgressOverlay mediaId={id} videoId={id} />
                </Suspense>
              </div>

              <div className="flex min-w-0 flex-col gap-6 text-start @3xl:pt-3">
                <div className="flex min-w-0 flex-col gap-3">
                  <h1
                    id="movie-title"
                    className="min-w-0 break-words text-3xl font-semibold leading-tight text-foreground text-balance @lg:text-4xl @5xl:text-5xl"
                  >
                    {movie.name || ""}
                  </h1>
                  <div className="flex flex-wrap items-center gap-2">
                    {movie.year && (
                      <Badge
                        variant="outline"
                        className="bg-background/90 backdrop-blur-sm"
                      >
                        {movie.year}
                      </Badge>
                    )}
                    {movie.runtime && (
                      <Badge
                        variant="outline"
                        className="bg-background/90 backdrop-blur-sm"
                      >
                        {movie.runtime}
                      </Badge>
                    )}
                    {movie.imdbRating && (
                      <Badge
                        variant="outline"
                        className="bg-background/90 backdrop-blur-sm"
                      >
                        <Star className="size-3 fill-yellow-400 text-yellow-400" />
                        {movie.imdbRating}
                      </Badge>
                    )}
                  </div>
                </div>

                {movie.description && (
                  <p className="max-w-prose whitespace-pre-line break-words text-base leading-relaxed">
                    {movie.description}
                  </p>
                )}

                <dl className="grid min-w-0 grid-cols-[max-content_minmax(0,1fr)] items-baseline gap-x-3 gap-y-3 text-sm">
                  {movie.genres && movie.genres.length > 0 && (
                    <>
                      <dt className="text-muted-foreground">Genres</dt>
                      <dd className="flex min-w-0 flex-wrap gap-1.5">
                        {movie.genres.map((genre) => (
                          <Badge
                            key={genre}
                            variant="secondary"
                            className="text-xs"
                          >
                            {genre}
                          </Badge>
                        ))}
                      </dd>
                    </>
                  )}
                  {movie.director && movie.director.length > 0 && (
                    <>
                      <dt className="text-muted-foreground">Director</dt>
                      <dd className="min-w-0 break-words">
                        {movie.director.join(", ")}
                      </dd>
                    </>
                  )}
                  {movie.writer && movie.writer.length > 0 && (
                    <>
                      <dt className="text-muted-foreground">Writers</dt>
                      <dd className="min-w-0 break-words">
                        {movie.writer.join(", ")}
                      </dd>
                    </>
                  )}
                  {movie.cast && movie.cast.length > 0 && (
                    <>
                      <dt className="text-muted-foreground">Cast</dt>
                      <dd className="min-w-0 break-words">
                        {movie.cast.slice(0, 8).join(", ")}
                      </dd>
                    </>
                  )}
                </dl>
              </div>
            </div>
          </section>

          <div className="mt-8 w-full">
            <MediaActions movie={movieWithProgress} />
          </div>
        </div>

        <Suspense fallback={<SimilarMoviesSkeleton />}>
          <SimilarMovies movieId={id} />
        </Suspense>
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
