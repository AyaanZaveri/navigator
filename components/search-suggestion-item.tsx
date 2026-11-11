import React from "react";
import { ArtworkImage } from "./artwork-image";
import { Film, Tv, Star, Calendar } from "lucide-react";
import { Badge } from "./ui/badge";

interface Item {
  id: string;
  name: string;
  type: string;
  poster?: string;
  releaseInfo?: string;
  imdbRating?: string;
  description?: string;
}

interface SearchSuggestionItemProps {
  item: Item;
  onClick: () => void;
}

export function SearchSuggestionItem({
  item,
  onClick,
}: SearchSuggestionItemProps) {
  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 p-3 hover:bg-accent rounded-lg cursor-pointer transition-colors"
    >
      {/* Image */}
      <div className="aspect-[2/3] h-16 bg-muted rounded overflow-hidden flex-shrink-0 relative">
        {item.poster ? (
          <ArtworkImage
            draggable={false}
            src={item.poster}
            alt={item.name}
            className="w-full h-full object-cover"
            fallbackText=""
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {item.type === "movie" ? (
              <Film className="h-6 w-6 text-muted-foreground" />
            ) : (
              <Tv className="h-6 w-6 text-muted-foreground" />
            )}
          </div>
        )}
      </div>

      {/* Content Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="text-foreground font-medium truncate">{item.name}</h4>
          {item.type === "movie" ? (
            <Badge variant="outline" className="bg-background/50">
              <Film className="h-3 w-3 mr-0.5 text-blue-400" />
              Movie
            </Badge>
          ) : item.type === "series" ? (
            <Badge variant="outline" className="bg-background/50">
              <Tv className="h-3 w-3 mr-0.5 text-emerald-400" />
              Series
            </Badge>
          ) : null}
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {item.releaseInfo && (
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {item.releaseInfo}
            </div>
          )}
          {item.imdbRating && (
            <div className="flex items-center gap-1">
              <Star className="h-3 w-3" /> {item.imdbRating}
            </div>
          )}
        </div>

        {item.description && (
          <p className="text-xs text-muted-foreground/70 mt-1 line-clamp-2 truncate">
            {item.description.substring(0, 80)}
            {item.description.length > 80 ? "..." : ""}
          </p>
        )}
      </div>
    </div>
  );
}
