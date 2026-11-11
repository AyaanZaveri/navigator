"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useStreamQueries } from "@/components/stream-query-provider";
import type { MediaItem } from "@/types/stremio";
import { useAccountAccess } from "@/contexts/account-context";
import { useSettings } from "@/contexts/settings-context";
import { useIsPlayerVisible } from "@/contexts/MediaPlayerContext";
import { routePrefetchAllowed } from "@/lib/route-prefetch";
import { createContinueWatchingWarmup, continueWatchingTarget } from "@/lib/media/continue-watching-warmup";

type Manager = ReturnType<typeof createContinueWatchingWarmup>;
const Context = createContext<{ intent: (_item: MediaItem) => () => void; claim: Manager["claim"] } | null>(null);
export const useContinueWatchingWarmup = () => useContext(Context);

export function ContinueWatchingWarmup({ items, children }: { items: MediaItem[]; children: ReactNode }) {
    const queries = useStreamQueries();
    const root = useRef<HTMLDivElement>(null);
    const manager = useRef<Manager | null>(null);
    const { authenticated } = useAccountAccess();
    const { playbackPreferences: { continueWatchingPrefetch } } = useSettings();
    const playing = useIsPlayerVisible();
    useEffect(() => {
        if (!continueWatchingPrefetch || !authenticated || playing || !root.current) return;
        const owner = createContinueWatchingWarmup(queries?.speculate, undefined, Boolean(queries));
        manager.current = owner;
        const element = root.current;
        const page = element.closest<HTMLElement>("[data-home-page]") || element;
        let disposed = false, started = false, cancelIdle: (() => void) | null = null;
        const visible = (node: Element) => {
            const box = node.getBoundingClientRect();
            return box.bottom > 0 && box.top < window.innerHeight && box.right > 0 && box.left < window.innerWidth;
        };
        const ready = () => routePrefetchAllowed() && visible(element)
            && ![...page.querySelectorAll("[data-home-initial-pending]")].some(visible)
            && ![...page.querySelectorAll<HTMLImageElement>("img")].some(image => !image.complete && visible(image));
        const check = () => {
            if (disposed || started || cancelIdle || !ready()) return;
            const run = () => {
                cancelIdle = null;
                if (disposed || started || !ready()) return;
                started = true;
                const first = items.find(item => continueWatchingTarget(item));
                if (first) owner.warm(first, true);
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
                cancelIdle?.(); cancelIdle = null; started = false; owner.clear();
            } else check();
        };
        const intersection = new IntersectionObserver(visibility);
        intersection.observe(element);
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
            owner.dispose(); if (manager.current === owner) manager.current = null;
        };
    }, [continueWatchingPrefetch, authenticated, playing, items, queries]);
    const claim = useCallback<Manager["claim"]>(item => continueWatchingPrefetch ? manager.current?.claim(item) : undefined, [continueWatchingPrefetch]);
    const intent = useCallback((item: MediaItem) => {
        if (!continueWatchingPrefetch) return () => {};
        const owner = manager.current;
        const timer = setTimeout(() => { if (routePrefetchAllowed()) owner?.warm(item); }, 120);
        return () => { clearTimeout(timer); owner?.release(item); };
    }, [continueWatchingPrefetch]);
    const value = useMemo(() => ({ intent, claim }), [intent, claim]);
    return <Context.Provider value={value}><div ref={root}>{children}</div></Context.Provider>;
}
