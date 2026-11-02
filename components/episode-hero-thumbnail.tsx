"use client";

import { useMemo, useState } from "react";

interface EpisodeHeroThumbnailProps {
  thumbnail?: string;
  released?: string;
  title: string;
}

export function EpisodeHeroThumbnail({
  thumbnail,
  released,
  title,
}: EpisodeHeroThumbnailProps) {
  const [failedSrc, setFailedSrc] = useState<string | undefined>();

  const releaseDate = useMemo(
    () => (released ? new Date(released) : null),
    [released]
  );
  const releaseTimestamp = releaseDate?.getTime();
  const hasValidReleaseDate =
    typeof releaseTimestamp === "number" && !Number.isNaN(releaseTimestamp);
  const isUpcoming = hasValidReleaseDate && releaseTimestamp > Date.now();
  const hasUsableThumbnail = Boolean(thumbnail) && failedSrc !== thumbnail;
  const shouldShowUnavailable = isUpcoming || !hasUsableThumbnail;

  const formattedReleaseDate =
    hasValidReleaseDate && releaseDate
      ? releaseDate.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : null;

  if (shouldShowUnavailable) {
    return (
      <div className="flex h-full w-full items-center justify-center border border-border/70 bg-gradient-to-br from-accent via-accent to-accent/70 px-6 text-center text-sm font-medium text-foreground/85 shadow-xs">
        This episode is still in the oven. Serving starts{" "}
        {formattedReleaseDate ? `on ${formattedReleaseDate}` : "soon"}.
      </div>
    );
  }

  return (
    <img
      draggable={false}
      src={thumbnail}
      alt={title}
      className="h-full w-full object-cover"
      onError={() => setFailedSrc(thumbnail)}
    />
  );
}
