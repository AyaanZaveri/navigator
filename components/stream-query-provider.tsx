"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createStreamQueries, type StreamQueries } from "@/lib/media/stream-queries";

const Context = createContext<StreamQueries | null>(null);
export const useStreamQueries = () => useContext(Context);

export function StreamQueryProvider({ scope, children }: { scope: string; children: ReactNode }) {
    const [queries] = useState(() => createStreamQueries(scope));
    const lifecycle = useRef(0);
    useEffect(() => {
        const owner = lifecycle;
        const epoch = ++owner.current;
        return () => { queueMicrotask(() => { if (epoch === owner.current) queries.clear(); }); };
    }, [queries]);
    return <QueryClientProvider client={queries.client}><Context.Provider value={queries}>{children}</Context.Provider></QueryClientProvider>;
}
