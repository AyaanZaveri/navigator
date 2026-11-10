import { Badge } from "@/components/ui/badge";
import { Star } from "lucide-react";
import type { MediaItem } from "@/types/stremio";

type RatingMedia = Pick<MediaItem, "imdbRating" | "communityRating" | "ratingSource" | "voteCount">;

export function MediaRatingBadge({ media }: { media: RatingMedia }) {
    const imdb = Number(media.imdbRating);
    const hasIMDb = Number.isFinite(imdb) && imdb > 0 && imdb <= 10;
    const score = hasIMDb ? imdb : media.communityRating;
    if (score == null || !Number.isFinite(score) || score <= 0 || score > 10) return null;

    const source = hasIMDb ? "IMDb" : media.ratingSource || "Rating";
    const count = !hasIMDb && typeof media.voteCount === "number" && Number.isSafeInteger(media.voteCount) && media.voteCount > 0
        ? media.voteCount : undefined;
    const label = `${source} ${score.toFixed(1)} out of 10${count ? `, ${count.toLocaleString("en-US")} vote${count === 1 ? "" : "s"}` : ""}`;

    return (
        <Badge variant="secondary" aria-label={label} title={label}>
            <Star aria-hidden="true" className="size-3 fill-yellow-400 text-yellow-400" />
            <span>{source} {score.toFixed(1)}</span>
        </Badge>
    );
}
