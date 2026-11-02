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
  const cursorRef = useRef(0);
  const requestRef = useRef<AbortController | null>(null);
  const autoArmedRef = useRef(true);
  const failedRef = useRef(false);
  const hasMore = useMemo(
    () => nextIndex < remainingEntries.length,
    [nextIndex, remainingEntries.length]
  );

  const loadNextBatch = useCallback(async () => {
    if (requestRef.current) return;

    const start = cursorRef.current;
    const entries = remainingEntries.slice(start, start + batchSize);
    if (entries.length === 0) return;

    const controller = new AbortController();
    requestRef.current = controller;
    autoArmedRef.current = false;
    failedRef.current = false;
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/home/catalogs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }

      const data = (await response.json()) as { sections?: HomeCatalogSection[] };
      if (controller.signal.aborted) return;
      const nextSections = Array.isArray(data.sections) ? data.sections : [];

      setSections((prev) => [...prev, ...nextSections]);
      cursorRef.current = start + entries.length;
      setNextIndex(cursorRef.current);
    } catch (loadError) {
      if (controller.signal.aborted) return;
      failedRef.current = true;
      console.error("Failed to load next home catalog batch:", loadError);
      setError("Could not load more catalogs. Retry to continue.");
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      if (!controller.signal.aborted) setIsLoading(false);
    }
  }, [batchSize, remainingEntries]);

  useEffect(() => () => requestRef.current?.abort(), []);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    const root = sentinel.closest<HTMLElement>("main");
    const input = root || window;
    let nearBottom = false;
    let active = true;
    const tryLoad = () => {
      if (active && nearBottom && autoArmedRef.current && !failedRef.current && !requestRef.current) void loadNextBatch();
    };
    const arm = () => {
      if (requestRef.current || failedRef.current) return;
      autoArmedRef.current = true;
      tryLoad();
    };
    // One automatic batch per gesture. Layout changes and wheel momentum must
    // not turn completion/empty results into a chain of additional requests.
    let wheelGesture = false;
    let wheelTimer: ReturnType<typeof setTimeout> | undefined;
    const wheel = (event: Event) => {
      if ((event as WheelEvent).deltaY <= 0) return;
      if (!wheelGesture) arm();
      wheelGesture = true;
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => { wheelGesture = false; }, 200);
    };
    let touchY = 0, touchConsumed = false;
    const touchStart = (event: Event) => {
      touchY = (event as TouchEvent).touches[0]?.clientY ?? 0;
      touchConsumed = false;
    };
    const touchMove = (event: Event) => {
      const nextY = (event as TouchEvent).touches[0]?.clientY ?? touchY;
      if (nextY < touchY && !touchConsumed) { touchConsumed = true; arm(); }
      touchY = nextY;
    };
    const key = (event: Event) => {
      const keyboard = event as KeyboardEvent;
      if (keyboard.defaultPrevented || keyboard.repeat || keyboard.shiftKey || keyboard.ctrlKey || keyboard.metaKey || keyboard.altKey) return;
      const target = keyboard.target as Element | null;
      if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (keyboard.key === " " && target?.closest?.("button, a")) return;
      if (["ArrowDown", "PageDown", "End", " "].includes(keyboard.key)) arm();
    };
    // Scrollbar drags have scroll events rather than wheel/touch events.
    let dragging = false, dragConsumed = false, previousTop = root?.scrollTop ?? 0;
    const pointerDown = () => { dragging = true; dragConsumed = false; };
    const pointerUp = () => { dragging = false; };
    const scroll = () => {
      const top = root?.scrollTop ?? window.scrollY;
      if (dragging && !dragConsumed && top > previousTop) { dragConsumed = true; arm(); }
      previousTop = top;
    };
    const observer = new IntersectionObserver(entries => {
      if (!active) return;
      nearBottom = entries[entries.length - 1]?.isIntersecting ?? false;
      tryLoad();
    }, { root, rootMargin: "0px 0px 240px 0px" });

    observer.observe(sentinel);
    input.addEventListener("wheel", wheel, { passive: true });
    input.addEventListener("touchstart", touchStart, { passive: true });
    input.addEventListener("touchmove", touchMove, { passive: true });
    input.addEventListener("keydown", key);
    input.addEventListener("pointerdown", pointerDown, { passive: true });
    input.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("pointerup", pointerUp);
    window.addEventListener("pointercancel", pointerUp);
    return () => {
      active = false;
      observer.disconnect();
      clearTimeout(wheelTimer);
      input.removeEventListener("wheel", wheel);
      input.removeEventListener("touchstart", touchStart);
      input.removeEventListener("touchmove", touchMove);
      input.removeEventListener("keydown", key);
      input.removeEventListener("pointerdown", pointerDown);
      input.removeEventListener("scroll", scroll);
      window.removeEventListener("pointerup", pointerUp);
      window.removeEventListener("pointercancel", pointerUp);
    };
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

      {hasMore ? (
        <div className="relative z-10 mb-6" style={{ overflowAnchor: "none" }}>
          {error && <p role="alert" className="mb-3 text-sm text-muted-foreground">{error}</p>}
          <Button variant="outline" disabled={isLoading} onClick={() => void loadNextBatch()}>
            {isLoading ? "Loading catalogs…" : error ? "Retry loading catalogs" : "Load more catalogs"}
          </Button>
        </div>
      ) : null}

      {hasMore ? <div ref={sentinelRef} className="h-px w-full" /> : null}
    </>
  );
}
