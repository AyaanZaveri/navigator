"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
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

type CatalogState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; section: HomeCatalogSection | null };

// Reserve the same minimum space for a skeleton, loaded row, or empty catalog.
const CATALOG_ROW_HEIGHT = 360;

export function HomeCatalogSectionsLazy({ initialSections, remainingEntries, batchSize }: HomeCatalogSectionsLazyProps) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState<number | null>(null);
  const [catalogs, setCatalogs] = useState<Map<string, CatalogState>>(() => new Map());
  const requestRef = useRef<{ controller: AbortController; keys: string[] } | null>(null);
  const initialCount = initialSections.length;
  const getItemKey = useCallback((index: number) => index < initialCount
    ? initialSections[index].key : remainingEntries[index - initialCount].key,
  [initialCount, initialSections, remainingEntries]);

  const virtualizer = useVirtualizer({
    count: initialCount + remainingEntries.length,
    getScrollElement: () => listRef.current?.closest<HTMLElement>("[data-page-scroll]") || null,
    estimateSize: () => CATALOG_ROW_HEIGHT,
    getItemKey,
    overscan: 2,
    scrollMargin: scrollMargin ?? 0,
    initialRect: { width: 0, height: Math.max(1, initialCount) * CATALOG_ROW_HEIGHT },
  });

  useLayoutEffect(() => {
    const list = listRef.current;
    const scroller = list?.closest<HTMLElement>("[data-page-scroll]");
    if (!list || !scroller) return;
    const update = () => setScrollMargin(Math.max(0,
      Math.round(list.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    observer.observe(list.parentElement || list);
    return () => observer.disconnect();
  }, []);

  const loadEntries = useCallback(async (entries: HomeCatalogEntry[]) => {
    if (requestRef.current || !entries.length) return;
    const controller = new AbortController();
    const keys = entries.map(entry => entry.key);
    const request = { controller, keys };
    requestRef.current = request;
    setCatalogs(previous => {
      const next = new Map(previous);
      keys.forEach(key => next.set(key, { status: "loading" }));
      return next;
    });
    try {
      const response = await fetch("/api/home/catalogs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }), signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Request failed: ${response.status}`);
      const data = await response.json() as { sections?: HomeCatalogSection[] };
      if (controller.signal.aborted) return;
      const sections = new Map((Array.isArray(data.sections) ? data.sections : []).map(section => [section.key, section]));
      setCatalogs(previous => {
        const next = new Map(previous);
        keys.forEach(key => next.set(key, { status: "ready", section: sections.get(key) || null }));
        return next;
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error("Failed to load home catalogs:", error);
      setCatalogs(previous => {
        const next = new Map(previous);
        keys.forEach(key => next.set(key, { status: "error" }));
        return next;
      });
    } finally {
      if (requestRef.current === request) requestRef.current = null;
    }
  }, []);

  const rows = virtualizer.getVirtualItems();
  const center = (virtualizer.scrollOffset ?? 0) + (virtualizer.scrollRect?.height ?? 0) / 2;
  const wantedEntries = useMemo(() => [...rows]
    .sort((a, b) => Math.abs(a.start + a.size / 2 - center) - Math.abs(b.start + b.size / 2 - center))
    .flatMap(row => remainingEntries[row.index - initialCount] ? [remainingEntries[row.index - initialCount]] : []),
  [rows, center, remainingEntries, initialCount]);

  useEffect(() => {
    if (scrollMargin === null) return;
    const wanted = new Set(wantedEntries.map(entry => entry.key));
    const pending = requestRef.current;
    if (pending && !pending.keys.some(key => wanted.has(key))) {
      // A fast flick can jump past whole groups. Cancel obsolete work and load
      // the landing viewport, rather than downloading every catalog on the way.
      pending.controller.abort();
      requestRef.current = null;
      setCatalogs(previous => {
        const next = new Map(previous);
        pending.keys.forEach(key => { if (next.get(key)?.status === "loading") next.delete(key); });
        return next;
      });
    }
    if (requestRef.current) return;
    const missing = wantedEntries.filter(entry => !catalogs.has(entry.key));
    void loadEntries(missing.slice(0, Math.max(1, Math.min(batchSize, 6))));
  }, [wantedEntries, catalogs, batchSize, loadEntries, scrollMargin]);

  useEffect(() => () => requestRef.current?.controller.abort(), []);

  return (
    <div ref={listRef} data-home-catalogs="" className="relative w-full" style={{ height: virtualizer.getTotalSize(), overflowAnchor: "none" }}>
      {rows.map(row => {
        const entry = remainingEntries[row.index - initialCount];
        const state = entry ? catalogs.get(entry.key) : undefined;
        const section = row.index < initialCount ? initialSections[row.index] : state?.status === "ready" ? state.section : undefined;
        return (
          <div key={row.key} data-index={row.index} ref={virtualizer.measureElement}
            className="absolute left-0 top-0 w-full flow-root"
            aria-busy={entry && (!state || state.status === "loading") ? true : undefined}
            style={{ minHeight: CATALOG_ROW_HEIGHT, transform: `translateY(${row.start - (scrollMargin ?? 0)}px)` }}>
            {section ? <MediaSection sectionName={section.sectionName} mediaItems={section.mediaItems} />
              : state?.status === "error" ? <section className="relative z-10 mb-8">
                <h3 className="mb-4 text-xl sm:text-2xl font-semibold">{entry.sectionName}</h3>
                <p role="alert" className="mb-3 text-sm text-muted-foreground">Could not load this catalog.</p>
                <Button variant="outline" disabled={Boolean(requestRef.current)} onClick={() => void loadEntries([entry])}>Retry</Button>
              </section>
              : state?.status === "ready" ? <section className="relative z-10 mb-8">
                <h3 className="mb-4 text-xl sm:text-2xl font-semibold">{entry.sectionName}</h3>
                <p className="text-sm text-muted-foreground">No titles available in this catalog.</p>
              </section>
              : <HomeSectionSkeleton />}
          </div>
        );
      })}
    </div>
  );
}
