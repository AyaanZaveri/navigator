"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MediaSection } from "@/components/media-section";
import { LoadingPlaceholder } from "@/components/ui/loading-placeholder";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import type { HomeCatalogEntry, HomeCatalogSection } from "@/lib/home-catalogs";

function PosterCardSkeleton() {
  return (
    <div className="flex-shrink-0 w-36">
      <Skeleton className="w-full aspect-[2/3] rounded-md" />
      <div className="px-1 mt-2.5 space-y-1.5">
        <Skeleton className="h-4 w-11/12 rounded" />
        <Skeleton className="h-3 w-2/5 rounded" />
      </div>
    </div>
  );
}

function HomeSectionSkeleton() {
  return (
    <LoadingPlaceholder className="relative z-10 mb-8">
      <div className="flex items-center justify-between gap-3 mb-4">
        <Skeleton className="h-8 w-56 rounded-full" />
        <div className="flex items-center gap-2">
          <Skeleton className="hidden md:block size-8 rounded-full" />
          <Skeleton className="hidden md:block size-8 rounded-full" />
        </div>
      </div>
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 16 }).map((_, index) => (
          <PosterCardSkeleton key={`home-catalog-lazy-skeleton-${index}`} />
        ))}
      </div>
    </LoadingPlaceholder>
  );
}

interface HomeCatalogSectionsLazyProps {
  initialSections: HomeCatalogSection[];
  remainingEntries: HomeCatalogEntry[];
  batchSize: number;
}

export function HomeCatalogSectionsLazy({
  initialSections,
  remainingEntries,
  batchSize,
}: HomeCatalogSectionsLazyProps) {
  const [sections, setSections] = useState<HomeCatalogSection[]>(initialSections);
  const [nextIndex, setNextIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const hasMore = useMemo(
    () => nextIndex < remainingEntries.length,
    [nextIndex, remainingEntries.length]
  );

  const loadNextBatch = useCallback(async () => {
    if (isLoading || !hasMore) return;

    const entries = remainingEntries.slice(nextIndex, nextIndex + batchSize);
    if (entries.length === 0) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/home/catalogs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      });

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }

      const data = (await response.json()) as { sections?: HomeCatalogSection[] };
      const nextSections = Array.isArray(data.sections) ? data.sections : [];

      setSections((prev) => [...prev, ...nextSections]);
      setNextIndex((prev) => prev + entries.length);
    } catch (loadError) {
      console.error("Failed to load next home catalog batch:", loadError);
      setError("Could not load more catalogs. Retry to continue.");
    } finally {
      setIsLoading(false);
    }
  }, [batchSize, hasMore, isLoading, nextIndex, remainingEntries]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadNextBatch();
        }
      },
      { rootMargin: "600px 0px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadNextBatch]);

  return (
    <>
      {sections.map((section) => (
        <MediaSection
          key={section.key}
          sectionName={section.sectionName}
          mediaItems={section.mediaItems}
        />
      ))}

      {isLoading &&
        Array.from({ length: Math.min(batchSize, remainingEntries.length - nextIndex) }).map(
          (_, index) => <HomeSectionSkeleton key={`home-catalog-batch-loading-${index}`} />
        )}

      {error ? (
        <div className="relative z-10 mb-6">
          <Button variant="outline" onClick={() => void loadNextBatch()}>
            Retry loading catalogs
          </Button>
        </div>
      ) : null}

      {hasMore ? <div ref={sentinelRef} className="h-px w-full" /> : null}
    </>
  );
}
