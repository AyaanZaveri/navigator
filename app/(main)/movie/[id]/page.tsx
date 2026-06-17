import {
  fetchMediaDetails,
  fetchPlaybackProgress,
  fetchSimilarItems,
} from "@/app/actions";
import { MediaActions } from "@/components/media-actions";
import { SearchBar } from "@/components/search-component";
import { Badge } from "@/components/ui/badge";
import { MediaSection } from "@/components/media-section";
import { Skeleton } from "@/components/ui/skeleton";
import { VibrantAuroraBackground } from "@/components/vibrant-aurora-background";
import { VibrantLogo } from "@/components/vibrant-logo";
import { TextAnimate } from "@/components/magicui/text-animate";
import { Star } from "lucide-react";
import { redirect } from "next/navigation";
import { BackdropImage } from "@/components/media-page/backdrop-image";
import { PosterImage } from "@/components/media-page/poster-image";
import type { MediaItem } from "@/types/stremio";
import { Suspense } from "react";

function formatResumeTime(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

async function MovieProgressOverlay({ movieId }: { movieId: string }) {
  const playbackProgress = await fetchPlaybackProgress(movieId, movieId);

  if (
    typeof playbackProgress?.progressPercent !== "number" &&
    typeof playbackProgress?.resumePositionTicks !== "number" &&
    typeof playbackProgress?.totalDuration !== "number"
  ) {
    return null;
  }

  return (
    <div className="absolute inset-x-2 bottom-2 pointer-events-none">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="rounded-full bg-black/35 backdrop-blur-md border border-white/20 px-1.5 py-0.5 text-[11px] leading-none font-mono text-white/90">
          {formatResumeTime(playbackProgress?.resumePositionTicks ?? 0)}
        </span>
        <span className="rounded-full bg-black/35 backdrop-blur-md border border-white/20 px-1.5 py-0.5 text-[11px] leading-none font-mono text-white/90">
          {formatResumeTime(playbackProgress?.totalDuration ?? 0)}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/30 backdrop-blur-sm overflow-hidden">
        <div
          className="h-full rounded-full bg-white/80 transition-all"
          style={{
            width: `${Math.max(
              0,
              Math.min(100, playbackProgress?.progressPercent ?? 0)
            )}%`,
          }}
        />
      </div>
    </div>
  );
}

function SimilarMoviesSkeleton() {
  return (
    <div className="mt-8 px-6">
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
          <div key={`similar-movie-skeleton-${index}`} className="w-36 flex-shrink-0">
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
    <div className="mt-8 px-6">
      <MediaSection
        sectionName="More Like This"
        mediaItems={similarItems}
      />
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
            <div className="w-full md:w-auto flex-shrink-0 justify-center flex flex-col items-center md:items-start md:block z-50 mt-6">
              <div className="relative max-w-1/2 md:w-[14rem] md:max-w-none">
                <PosterImage
                  movie={movie}
                  posterImage={movie.poster || ""}
                  className="w-full h-auto rounded-lg shadow-lg"
                  width={500}
                  height={750}
                />
                <Suspense fallback={null}>
                  <MovieProgressOverlay movieId={id} />
                </Suspense>
              </div>
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
