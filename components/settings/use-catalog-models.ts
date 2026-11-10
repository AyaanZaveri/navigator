"use client";

import { useEffect, useState } from "react";
import type { ModelsDevModel } from "@/lib/models-dev";

type CatalogState = { models: ModelsDevModel[]; loading: boolean; error: string | null };
const cache = new Map<string, { models: ModelsDevModel[]; expires: number }>();
const TTL = 60 * 60 * 1000;
const EMPTY: CatalogState = { models: [], loading: false, error: null };
const LOADING: CatalogState = { ...EMPTY, loading: true };

export function useCatalogModels(providerId: string | null) {
    const [result, setResult] = useState<{ providerId: string; state: CatalogState } | null>(null);
    useEffect(() => {
        if (!providerId) return;
        const cached = cache.get(providerId);
        if (cached && cached.expires > Date.now()) return;
        const controller = new AbortController();
        let active = true;
        const update = (state: CatalogState) => {
            if (active) setResult({ providerId, state });
        };
        const timeout = window.setTimeout(() => {
            controller.abort();
            update({ ...EMPTY, error: "Loading models timed out. Your saved model is still available." });
        }, 15_000);
        async function load() {
            update(LOADING);
            try {
                const params = new URLSearchParams({ providerId: providerId! });
                const response = await fetch(`/api/models-dev/provider?${params}`, { signal: controller.signal });
                const data = await response.json() as { provider?: { models?: ModelsDevModel[] }; error?: string };
                if (!response.ok) throw new Error(data.error || "Failed to load available models.");
                if (!Array.isArray(data.provider?.models) || !data.provider.models.length) {
                    throw new Error("No models are currently available. Your saved model is still available.");
                }
                if (!active || controller.signal.aborted) return;
                cache.set(providerId!, { models: data.provider.models, expires: Date.now() + TTL });
                update({ models: data.provider.models, loading: false, error: null });
            } catch (error) {
                if (!controller.signal.aborted) update({ ...EMPTY, error: error instanceof Error ? error.message : "Failed to load available models." });
            } finally {
                window.clearTimeout(timeout);
            }
        }
        void load();
        return () => {
            active = false;
            window.clearTimeout(timeout);
            controller.abort();
        };
    }, [providerId]);
    if (!providerId) return EMPTY;
    const cached = cache.get(providerId);
    if (cached && cached.expires > Date.now()) return { models: cached.models, loading: false, error: null };
    return result?.providerId === providerId ? result.state : LOADING;
}
