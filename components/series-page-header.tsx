"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Star } from "lucide-react";

interface SeriesPageHeaderProps {
  showName: string;
  showYear?: number;
  releaseInfo?: string;
  imdbRating?: string;
  regularSeasonCount: number;
}

function toPositiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return undefined;
  return parsed;
}

export function SeriesPageHeader({
  showName,
  showYear,
  releaseInfo,
  imdbRating,
  regularSeasonCount,
}: SeriesPageHeaderProps) {
  const params = useParams<{ season?: string; episode?: string }>();
  const seasonNumber = useMemo(() => toPositiveInt(params?.season), [params?.season]);
  const episodeNumber = useMemo(
    () => toPositiveInt(params?.episode),
    [params?.episode]
  );

  if (seasonNumber && episodeNumber) {
    return null;
  }

  return (
    <div className="w-full md:w-[82%] lg:w-[84%] pt-10 md:pt-8 text-center md:text-start mt-8">
      <div className="mb-4 flex justify-center md:justify-start">
        <h1 className="text-4xl md:text-5xl font-semibold font-poppins text-foreground md:pl-8 drop-shadow-xl">
          {showName}
        </h1>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-2 justify-center md:justify-start md:pl-8">
        {!releaseInfo && showYear && (
          <Badge variant="outline" className="bg-background/90 backdrop-blur-sm">
            {showYear}
          </Badge>
        )}
        {releaseInfo && (
          <Badge variant="outline" className="bg-background/90 backdrop-blur-sm">
            {releaseInfo}
          </Badge>
        )}
        {imdbRating && (
          <Badge variant="outline" className="bg-background/90 backdrop-blur-sm">
            <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
            {imdbRating}
          </Badge>
        )}
        {regularSeasonCount > 0 && (
          <Badge variant="outline" className="bg-background/90 backdrop-blur-sm">
            {regularSeasonCount} Season{regularSeasonCount !== 1 ? "s" : ""}
          </Badge>
        )}
      </div>
    </div>
  );
}
