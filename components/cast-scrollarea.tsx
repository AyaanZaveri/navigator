"use client";

import React, { useRef, useEffect } from "react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface CastScrollAreaProps {
  cast?: string[];
}

export function CastScrollArea({ cast }: CastScrollAreaProps) {
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

  if (!cast || cast.length === 0) {
    return (
      <section className="relative z-10 mb-12">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-2xl font-semibold text-foreground font-poppins">
            Cast
          </h3>
        </div>
        <p className="text-muted-foreground">No cast information available.</p>
      </section>
    );
  }

  return (
    <section className="relative z-10 mb-12">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-2xl font-semibold text-foreground font-poppins">
          Cast
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
        </div>
      </div>
      <ScrollArea className="w-full pb-6">
        <div className="flex gap-4 w-max" ref={scrollRef}>
          {cast.map((name, index) => (
            <div key={`${name}-${index}`} className="shrink-0">
              <figure className="cursor-pointer transition-transform">
                <div className="overflow-hidden rounded-full shadow-lg">
                  <div className="aspect-square h-24 w-24 bg-muted rounded-full flex items-center justify-center">
                    <span className="text-muted-foreground text-lg font-medium font-mono">
                      {name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                </div>
                <figcaption className="pt-3 text-xs text-center text-muted-foreground max-w-24">
                  <p
                    className="font-semibold text-foreground truncate"
                    title={name}
                  >
                    {name}
                  </p>
                </figcaption>
              </figure>
            </div>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </section>
  );
}
