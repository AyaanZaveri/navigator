"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createStreamQueries, type StreamQueries } from "@/lib/media/stream-queries";

import { createMetadataWarmup } from "@/lib/media/metadata-warmup";
import { createMetadataQueries, type MetadataQueries } from "@/lib/media/metadata-queries";

const Context = createContext<(StreamQueries & { metadata: MetadataQueries; warmer: ReturnType<typeof createMetadataWarmup> }) | null>(null);
export const useStreamQueries = () => useContext(Context);
export const useMetadataWarmup = () => useContext(Context)?.warmer;
export const useMetadataQueries = () => useContext(Context)?.metadata;

export function StreamQueryProvider({ scope, children }: { scope: string; children: ReactNode }) {
    const [queries] = useState(() => { const streams = createStreamQueries(scope); const metadata = createMetadataQueries(streams); return { ...streams, metadata, warmer: createMetadataWarmup(metadata) }; });
    const lifecycle = useRef(0);
    useEffect(() => {
        const owner = lifecycle;
        const epoch = ++owner.current;
        return () => { queueMicrotask(() => { if (epoch === owner.current) { queries.warmer.dispose(); queries.metadata.dispose(); queries.clear(); } }); };
    }, [queries]);
    return <QueryClientProvider client={queries.client}><Context.Provider value={queries}>{children}</Context.Provider></QueryClientProvider>;
}
