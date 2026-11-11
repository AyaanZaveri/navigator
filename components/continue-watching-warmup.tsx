"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useContinueWatchingMetadata } from "@/components/metadata-preload";
import { useStreamQueries } from "@/components/stream-query-provider";
import type { MediaItem } from "@/types/stremio";
import { useAccountAccess } from "@/contexts/account-context";
import { useSettings } from "@/contexts/settings-context";
import { useIsPlayerVisible } from "@/contexts/MediaPlayerContext";
import { routePrefetchAllowed } from "@/lib/route-prefetch";
import { createContinueWatchingScheduler } from "@/lib/media/continue-watching-scheduler";
import { createContinueWatchingWarmup } from "@/lib/media/continue-watching-warmup";

type Manager = ReturnType<typeof createContinueWatchingScheduler>;
const Context = createContext<{ intent: (_item: MediaItem) => () => void; claim: Manager["claim"] } | null>(null);
export const useContinueWatchingWarmup = () => useContext(Context);

export function ContinueWatchingWarmup({ items, children }: { items: MediaItem[]; children: ReactNode }) {
    const queries = useStreamQueries();
    const root = useRef<HTMLDivElement>(null);
    useContinueWatchingMetadata(root, items);
    const manager = useRef<Manager | null>(null);
    const { authenticated } = useAccountAccess();
    const { playbackPreferences: { continueWatchingPrefetch } } = useSettings();
    const playing = useIsPlayerVisible();
    useEffect(() => {
        if (!continueWatchingPrefetch || !authenticated || playing || !root.current) return;
        const owner = createContinueWatchingWarmup(queries?.speculate, undefined, Boolean(queries));
        const element = root.current;
        const page = element.closest<HTMLElement>("[data-home-page]") || element;
        let disposed = false, cancelIdle: (() => void) | null = null;
        const visible = (node: Element) => {
            const box = node.getBoundingClientRect();
            return box.bottom > 0 && box.top < window.innerHeight && box.right > 0 && box.left < window.innerWidth;
        };
        const ready = () => routePrefetchAllowed() && visible(element)
            && ![...page.querySelectorAll("[data-home-initial-pending]")].some(visible)
            && ![...page.querySelectorAll<HTMLImageElement>("img")].some(image => !image.complete && visible(image));
        const viewport = element.querySelector<HTMLElement>("[data-media-row-viewport]");
        const cards = [...element.querySelectorAll<HTMLElement>("[data-continue-watching-index]")];
        const candidates = () => {
            if (!viewport) return [];
            const clip = viewport.getBoundingClientRect();
            return cards.filter(card => {
                const box = card.getBoundingClientRect();
                const width = Math.min(box.right, clip.right, window.innerWidth) - Math.max(box.left, clip.left, 0);
                const height = Math.min(box.bottom, clip.bottom, window.innerHeight) - Math.max(box.top, clip.top, 0);
                return box.width > 0 && box.height > 0 && width >= box.width / 2 && height >= box.height / 2;
            }).map(card => items[Number(card.dataset.continueWatchingIndex)]).filter(Boolean);
        };
        const scheduler = createContinueWatchingScheduler(owner, { candidates, allowed: ready });
        manager.current = scheduler;
        const check = () => {
            if (disposed || cancelIdle || !ready()) return;
            const run = () => {
                cancelIdle = null;
                if (!disposed && ready()) scheduler.refresh();
            };
            if (window.requestIdleCallback) {
                const id = window.requestIdleCallback(run, { timeout: 1500 });
                cancelIdle = () => window.cancelIdleCallback(id);
            } else {
                const id = setTimeout(run, 200); cancelIdle = () => clearTimeout(id);
            }
        };
        const changes = new MutationObserver(check);
        changes.observe(page, { childList: true, subtree: true });
        const visibility = () => {
            if (!routePrefetchAllowed() || !visible(element)) {
                cancelIdle?.(); cancelIdle = null; scheduler.clear();
            } else check();
        };
        const intersection = new IntersectionObserver(visibility, { threshold: [0, 0.5, 1] });
        intersection.observe(element);
        cards.forEach(card => intersection.observe(card));
        viewport?.addEventListener("scroll", check, { passive: true });
        window.addEventListener("resize", check);
        page.addEventListener("load", check, true); page.addEventListener("error", check, true);
        document.addEventListener("visibilitychange", visibility);
        const connection = (navigator as Navigator & { connection?: EventTarget }).connection;
        connection?.addEventListener("change", visibility);
        check();
        return () => {
            disposed = true; cancelIdle?.(); changes.disconnect(); intersection.disconnect();
            page.removeEventListener("load", check, true); page.removeEventListener("error", check, true);
            document.removeEventListener("visibilitychange", visibility);
            connection?.removeEventListener("change", visibility);
            viewport?.removeEventListener("scroll", check); window.removeEventListener("resize", check);
            scheduler.dispose(); if (manager.current === scheduler) manager.current = null;
        };
    }, [continueWatchingPrefetch, authenticated, playing, items, queries]);
    const claim = useCallback<Manager["claim"]>(item => continueWatchingPrefetch ? manager.current?.claim(item) : undefined, [continueWatchingPrefetch]);
    const intent = useCallback((item: MediaItem) => {
        if (!continueWatchingPrefetch) return () => {};
        const owner = manager.current;
        let release: (() => void) | undefined;
        const timer = setTimeout(() => { if (routePrefetchAllowed()) release = owner?.intent(item); }, 120);
        return () => { clearTimeout(timer); release?.(); };
    }, [continueWatchingPrefetch]);
    const value = useMemo(() => ({ intent, claim }), [intent, claim]);
    return <Context.Provider value={value}><div ref={root}>{children}</div></Context.Provider>;
}
