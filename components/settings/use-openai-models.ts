"use client";

import { useEffect, useState } from "react";
import type { ModelsDevModel } from "@/lib/models-dev";

type ModelState = { models: ModelsDevModel[]; loading: boolean; error: string | null };
const EMPTY_STATE: ModelState = { models: [], loading: false, error: null };
const LOADING_STATE: ModelState = { models: [], loading: true, error: null };

export function useOpenAIModels({ enabled, baseUrl, apiKey }: { enabled: boolean; baseUrl: string; apiKey: string }) {
    const [result, setResult] = useState<{ baseUrl: string; apiKey: string; state: ModelState } | null>(null);

    useEffect(() => {
        if (!enabled || !baseUrl.trim()) return;

        let active = true;
        const controller = new AbortController();
        const setState = (state: ModelState) => setResult({ baseUrl, apiKey, state });
        const deadline = window.setTimeout(() => {
            controller.abort();
            if (active) setState({ models: [], loading: false, error: "Loading models timed out. You can still enter a model ID manually." });
        }, 15_000);
        const debounce = window.setTimeout(async () => {
            setState(LOADING_STATE);
            try {
                const response = await fetch("/api/openai/models", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "x-openai-api-key": apiKey.trim() },
                    body: JSON.stringify({ baseUrl: baseUrl.trim() }),
                    signal: controller.signal,
                });
                const data = await response.json() as { models?: ModelsDevModel[]; error?: string };
                if (!response.ok) throw new Error(data.error || "Failed to load available models.");
                if (!Array.isArray(data.models)) throw new Error("The provider returned an invalid model list.");
                if (active && !controller.signal.aborted) setState({
                    models: data.models,
                    loading: false,
                    error: data.models.length ? null : "The provider returned no models. Enter a model ID manually.",
                });
            } catch (error) {
                if (active && !controller.signal.aborted) setState({
                    models: [], loading: false,
                    error: error instanceof Error ? error.message : "Failed to load available models.",
                });
            } finally {
                window.clearTimeout(deadline);
            }
        }, 300);

        return () => {
            active = false;
            window.clearTimeout(debounce);
            window.clearTimeout(deadline);
            controller.abort();
        };
    }, [enabled, baseUrl, apiKey]);

    if (!enabled || !baseUrl.trim()) return EMPTY_STATE;
    return result?.baseUrl === baseUrl && result.apiKey === apiKey ? result.state : LOADING_STATE;
}
