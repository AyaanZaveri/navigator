"use client";

import React, { useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { CarouselAction } from "@/components/carousel-action";
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
    <section className="relative z-10 mb-8">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="min-w-0 text-xl sm:text-2xl font-semibold text-foreground font-poppins">
          {sectionName}
        </h3>
        <div className="flex shrink-0 items-center gap-2">
          <CarouselAction
            size="icon-sm"
            className="hidden md:inline-flex"
            aria-label="Scroll left"
            onClick={scrollLeft}
          >
            <ChevronLeft className="h-4 w-4" />
          </CarouselAction>
          <CarouselAction
            size="icon-sm"
            className="hidden md:inline-flex"
            aria-label="Scroll right"
            onClick={scrollRight}
          >
            <ChevronRight className="h-4 w-4" />
          </CarouselAction>
          <CarouselAction
            onClick={onViewAll}
          >
            View All
          </CarouselAction>
        </div>
      </div>
      {mediaItems.length > 0 ? (
        <ScrollArea className="w-full">
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
