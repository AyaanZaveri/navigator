import { SearchBar } from "@/components/search-component";
import { MediaSection } from "@/components/media-section";
import { VibrantAuroraBackground } from "@/components/vibrant-aurora-background";
import { VibrantLogo } from "@/components/vibrant-logo";
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

    const { show, similarItems } = layoutData;

    return (
      <div className="min-h-screen overflow-hidden md:pr-1 pb-8">
        <VibrantAuroraBackground
          backdropUrl={show.background || show.poster || ""}
          className="fixed inset-0 z-10 pointer-events-none opacity-50"
        />

        <div className="relative">
          <div className="relative h-[46vh] md:h-[62vh] overflow-hidden md:rounded-xl md:mt-2.5">
            <BackdropImage
              movie={show}
              backdropImage={show.background || ""}
              className="w-full h-full object-cover"
              width={1920}
              height={1080}
            />
            {show.logo && (
              <Link
                href={buildSeriesPath(id)}
                aria-label={`Go to ${show.name} series page`}
                className="absolute md:top-[38%] top-[32%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 max-w-2/3 invisible md:visible transition-transform duration-500 ease-in-out hover:scale-[1.03] will-change-transform"
              >
                <VibrantLogo
                  src={show.logo}
                  alt={`${show.name} logo`}
                  movieName={show.name || ""}
                  width={420}
                  height={134}
                  className="max-h-24 md:max-h-32 w-auto object-contain"
                />
              </Link>
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

        <div className="relative z-10 -mt-54 md:pl-6 bg-background/95 dark:bg-background/50 backdrop-blur-xl rounded-2xl mx-4 pb-6">
          <div
            id="stream-loading-pill-anchor"
            className="absolute top-4 right-4 z-30 pointer-events-none"
          />
          {children}

          <div className="mt-10 md:mt-8">
            <SeriesEpisodesRouteAware showId={id} prefetchedVideos={show.videos} />
          </div>

          <EpisodeStreamsRouteAware show={show} prefetchedVideos={show.videos} />
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
    console.error("Error loading show layout:", error);
    return <div className="p-4">Error loading show. Please try again.</div>;
  }
}
