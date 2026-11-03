import artworkStyles from "./detail-artwork.module.css";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Star, TvIcon } from "lucide-react";
import Link from "next/link";

// Shared by real details and the inert sample so responsive geometry stays aligned.
export function EpisodeDetailsView({
  titleId, showHref, showName, title, seasonNumber, episodeNumber,
  released, rating, thumbnail, actions, description,
}: {
  titleId?: string;
  showHref?: string;
  showName: string;
  title: string;
  seasonNumber: number;
  episodeNumber: number;
  released?: string;
  rating?: string;
  thumbnail: ReactNode;
  actions: ReactNode;
  description?: ReactNode;
}) {
  return (
    <section
      aria-labelledby={titleId}
      className="@container"
    >
      <div className="grid min-w-0 gap-6 @4xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] @4xl:items-center @4xl:gap-8">
        <div className={`${artworkStyles.surface} relative mx-auto aspect-video w-full max-w-xl overflow-hidden rounded-lg bg-muted @4xl:mx-0 @4xl:max-w-none`}>
          {thumbnail}
        </div>

        <div className="flex min-w-0 flex-col gap-6 text-start">
          <div className="flex min-w-0 flex-col items-center gap-3 text-center @4xl:items-start @4xl:text-start">
            <nav
              aria-label="Episode context"
              className="flex min-w-0 flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm font-medium text-muted-foreground @4xl:justify-start"
            >
              {showHref ? <Link
                href={showHref}
                prefetch={true}
                draggable={false}
                className="inline-flex min-w-0 max-w-full items-center gap-2 transition-colors hover:text-foreground"
              >
                <TvIcon aria-hidden="true" className="relative -top-[0.5px] size-3.5 shrink-0" />
                <span className="min-w-0 break-words">{showName}</span>
              </Link> : <span className="inline-flex min-w-0 max-w-full items-center gap-2">
                <TvIcon aria-hidden="true" className="relative -top-[0.5px] size-3.5 shrink-0" />
                <span className="min-w-0 break-words">{showName}</span>
              </span>}
            </nav>

            <h1
              id={titleId}
              className="min-w-0 break-words text-3xl font-semibold leading-tight text-foreground text-balance @lg:text-4xl @5xl:text-5xl"
            >
              {`${episodeNumber}. ${title}`}
            </h1>

            <div className="flex flex-wrap items-center justify-center gap-2 @4xl:justify-start">
              <Badge
                variant="secondary"
              >
                S{seasonNumber} • E{episodeNumber}
              </Badge>
              {released && (
                <Badge
                  variant="secondary"
                >
                  {new Date(released).getFullYear()}
                </Badge>
              )}
              {rating && (
                <Badge
                  variant="secondary"
                >
                  <Star className="size-3 fill-yellow-400 text-yellow-400" />
                  {rating}
                </Badge>
              )}
            </div>
            {actions}
          </div>

          {description}
        </div>
      </div>
    </section>
  );
}
