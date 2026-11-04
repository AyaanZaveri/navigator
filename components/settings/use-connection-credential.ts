"use client";

import { useEffect, useRef, useState } from "react";
import { CONNECTION_CREDENTIALS_EVENT, CONNECTION_STORAGE_KEYS, readConnectionCredential, saveConnectionCredential, type ConnectionService } from "@/lib/browser-connection-credentials";

export function useConnectionCredential(service: ConnectionService) {
    const [value, setValue] = useState("");
    const dirty = useRef(false);
    const saved = useRef<string | undefined>(undefined);
    useEffect(() => {
        const restore = () => {
            try {
                const next = readConnectionCredential(service);
                if (saved.current !== next) {
                    saved.current = next;
                    if (!dirty.current) setValue(next || "");
                }
            } catch { /* The input still works without browser storage. */ }
        };
        const storage = (event: StorageEvent) => {
            if (event.key === CONNECTION_STORAGE_KEYS[service] || event.key === null) restore();
        };
        restore();
        window.addEventListener(CONNECTION_CREDENTIALS_EVENT, restore);
        window.addEventListener("storage", storage);
        return () => {
            window.removeEventListener(CONNECTION_CREDENTIALS_EVENT, restore);
            window.removeEventListener("storage", storage);
        };
    }, [service]);
    return { value, setValue: (next: string) => {
        dirty.current = true;
        setValue(next);
    }, persist: (next: string) => {
        saveConnectionCredential(service, next);
        dirty.current = false;
        saved.current = next;
        setValue(next);
    } };
}
