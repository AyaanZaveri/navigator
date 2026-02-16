"use client";

import React, { useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MediaCard } from "@/components/media-card";
import { Play, ChevronLeft, ChevronRight } from "lucide-react";
import { ScrollArea, ScrollBar } from "./ui/scroll-area";
import type { MediaItem } from "@/types/stremio";

interface MediaSectionProps {
  sectionName: string;
  mediaItems: MediaItem[];
  onViewAll?: () => void;
  isLoading?: boolean;
  continueWatching?: boolean;
}

export function MediaSection({
  sectionName,
  mediaItems,
  onViewAll,
  isLoading = false,
  continueWatching = false,
}: MediaSectionProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      const viewport = scrollRef.current
        .closest('[data-slot="scroll-area"]')
        ?.querySelector(
          '[data-slot="scroll-area-viewport"]'
        ) as HTMLDivElement;
      if (viewport) {
        viewportRef.current = viewport;
      }
    }
  }, []);

  const scrollLeft = () => {
    if (viewportRef.current) {
      viewportRef.current.scrollBy({ left: -300, behavior: "smooth" });
    }
  };

  const scrollRight = () => {
    if (viewportRef.current) {
      viewportRef.current.scrollBy({ left: 300, behavior: "smooth" });
    }
  };

  return (
    <section className="relative z-10 mb-5">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-2xl font-semibold text-foreground font-poppins">
          {sectionName}
        </h3>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="bg-background/10 border-border text-foreground hover:bg-accent p-2"
            onClick={scrollLeft}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="bg-background/10 border-border text-foreground hover:bg-accent p-2"
            onClick={scrollRight}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="bg-background/10 border-border text-foreground hover:bg-accent"
            onClick={onViewAll}
          >
            View All
          </Button>
        </div>
      </div>
      {mediaItems.length > 0 ? (
        <ScrollArea className="w-full pb-6">
          <div className="flex gap-4 w-max" ref={scrollRef}>
            {mediaItems.map((item, index) => (
              <div
                key={`${item.type}:${item.id}:${item.addonName ?? "unknown"}:${item.catalogName ?? "unknown"}:${index}`}
                className="flex-shrink-0"
              >
                <MediaCard
                  item={item}
                  continueWatching={continueWatching}
                />
              </div>
            ))}
          </div>
          <ScrollBar orientation="horizontal" className="opacity-0" />
        </ScrollArea>
      ) : (
        <Card className="bg-card border-border text-foreground">
          <CardContent className="p-8 text-center">
            <Play className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              No {sectionName.toLowerCase()} found in your library
            </p>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
