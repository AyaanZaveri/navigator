import { CastSection } from "@/components/media-page/cast-section";
import { MediaSection } from "@/components/media-section";
import { VibrantAuroraBackground } from "@/components/vibrant-aurora-background";
import { HeroWordmark } from "@/components/hero-wordmark";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BackdropImage } from "@/components/media-page/backdrop-image";
import { SeriesEpisodesRouteAware } from "@/components/series-episodes-route-aware";
import { EpisodeStreamsRouteAware } from "@/components/episode-streams-route-aware";
import {
  buildEpisodePath,
  buildSeriesPath,
  parseSeriesRouteId,
} from "@/lib/series-route";
import { getSeriesLayoutData } from "./_shared/series-data";
import { Suspense } from "react";
import { fetchSimilarItems } from "@/app/actions";

async function SimilarShows({ showId }: { showId: string }) {
  const items = await fetchSimilarItems(showId, "series", 12);
  if (!items.length) return null;

  return (
    <div className="mt-8 px-6 md:px-10">
      <MediaSection sectionName="More Like This" mediaItems={items} />
    </div>
  );
}

export default async function SeriesLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const parsed = parseSeriesRouteId(id);

  if (parsed.isEpisodeTarget && parsed.season && parsed.episode) {
    redirect(buildEpisodePath(parsed.seriesId, parsed.season, parsed.episode));
  }

  try {
    const layoutData = await getSeriesLayoutData(id);

    if (!layoutData) {
      return <div className="p-4">Show not found</div>;
    }

    const { show } = layoutData;

    return (
      <div className="min-h-screen overflow-hidden pb-8">
        <VibrantAuroraBackground
          backdropUrl={show.background}
          posterUrl={show.poster}
          className="fixed inset-0 z-10 pointer-events-none opacity-50"
        />

        <div className="relative">
          <div className="relative h-[46vh] md:h-[62vh] overflow-hidden">
            <BackdropImage
              movie={show}
              backdropImage={show.background || ""}
              className="w-full h-full object-cover"
              width={1920}
              height={1080}
            />
            {show.logo && (
              <div className="pointer-events-none absolute inset-x-0 top-16 bottom-54 z-10 hidden place-items-center md:grid">
                <Link
                  href={buildSeriesPath(id)}
                  prefetch={true}
                  aria-label={`Go to ${show.name} series page`}
                  className="pointer-events-auto block w-[min(40rem,70%)] transition-transform duration-500 ease-in-out hover:scale-[1.03] will-change-transform"
                >
                  <HeroWordmark
                    src={show.logo}
                    alt={`${show.name} logo`}
                    movieName={show.name || ""}
                    className="w-full"
                  />
                </Link>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/30 to-black/90" />
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black to-transparent" />
          </div>
        </div>

        <div className="relative z-10 -mt-54 px-4 md:px-6 bg-background/95 dark:bg-background/50 backdrop-blur-xl rounded-2xl mx-4 pb-6">
          <div
            id="stream-loading-pill-anchor"
            className="absolute top-4 right-4 z-30 pointer-events-none"
          />
          {children}

          <div className="mt-10 md:mt-8">
            <SeriesEpisodesRouteAware
              showId={id}
              prefetchedVideos={show.videos}
            />
          </div>

          <EpisodeStreamsRouteAware
            show={show}
            prefetchedVideos={show.videos}
          />
        </div>

        <Suspense fallback={null}>
          <CastSection id={id} type="series" names={show.cast} />
        </Suspense>

        <Suspense fallback={null}>
          <SimilarShows showId={id} />
        </Suspense>
      </div>
    );
  } catch (error: any) {
    if (error.message?.includes("Authentication expired")) {
      redirect("/login");
    }
    console.error("Error loading show layout:", error);
    return <div className="p-4">Error loading show. Please try again.</div>;
  }
}
