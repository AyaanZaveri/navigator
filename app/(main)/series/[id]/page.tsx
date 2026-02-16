import { PosterImage } from "@/components/media-page/poster-image";
import { Badge } from "@/components/ui/badge";
import { Star } from "lucide-react";
import { redirect } from "next/navigation";
import { getSeriesLayoutData } from "./_shared/series-data";

export default async function SeriesOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  try {
    const layoutData = await getSeriesLayoutData(id);

    if (!layoutData) {
      return <div className="p-4">Show not found</div>;
    }

    const { show, regularSeasonCount } = layoutData;

    return (
      <div className="flex flex-col md:flex-row mx-auto">
        <div className="w-full md:w-[18%] lg:w-[16%] flex-shrink-0 justify-center flex md:block z-50 mt-6">
          <PosterImage
            movie={show}
            posterImage={show.poster || ""}
            className="w-full h-auto rounded-lg shadow-2xl max-w-1/2 md:max-w-[14rem]"
            width={500}
            height={750}
          />
        </div>

        <div className="w-full md:w-[82%] lg:w-[84%] pt-2 text-center md:text-start mt-8">
          <div className="px-8 md:pl-8 md:pt-4 md:pr-16 flex flex-col justify-center md:items-start items-center">
            <div className="mb-4 flex justify-center md:justify-start w-full">
              <h1 className="text-4xl md:text-5xl font-semibold font-poppins text-foreground drop-shadow-xl">
                {show.name}
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-6 justify-center md:justify-start w-full">
              {!show.releaseInfo && show.year && (
                <Badge variant="outline" className="bg-background/90 backdrop-blur-sm">
                  {show.year}
                </Badge>
              )}
              {show.releaseInfo && (
                <Badge variant="outline" className="bg-background/90 backdrop-blur-sm">
                  {show.releaseInfo}
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

            {show.description && (
              <p className="text-md leading-relaxed mb-6 max-w-4xl">
                {show.description}
              </p>
            )}

            <div className="space-y-3 mb-6 max-w-4xl">
              {show.genres && show.genres.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-muted-foreground min-w-fit">
                    Genres:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {show.genres.map((genre) => (
                      <Badge key={genre} variant="secondary" className="text-xs">
                        {genre}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {show.director && show.director.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-muted-foreground min-w-fit">
                    Director:
                  </span>
                  <span className="text-sm">{show.director.join(", ")}</span>
                </div>
              )}

              {show.cast && show.cast.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-muted-foreground min-w-fit">
                    Cast:
                  </span>
                  <span className="text-sm">{show.cast.slice(0, 8).join(", ")}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  } catch (error: any) {
    if (error.message?.includes("Authentication expired")) {
      redirect("/login");
    }
    console.error("Error loading show overview:", error);
    return <div className="p-4">Error loading show. Please try again.</div>;
  }
}
