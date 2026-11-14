"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { getArtworkSettings } from "@/app/actions/artwork-settings";
import { desktopBridge } from "@/lib/desktop/bridge";
import { CONNECTION_CREDENTIALS_EVENT, readConnectionCredential } from "@/lib/browser-connection-credentials";

export function DesktopTmdbSetupPrompt({ userId }: { userId?: string }) {
    const pathname = usePathname();
    const router = useRouter();
    const shown = useRef<string | undefined>(undefined);

    useEffect(() => {
        const platform = desktopBridge()?.platform;
        if (!userId || !platform || !["macos", "windows", "linux"].includes(platform)) return;
        const id = `tmdb-setup:${userId}`;
        const storageKey = `navigator-${id}`;
        const savedLocally = () => {
            try { return !!readConnectionCredential("tmdb")?.trim(); }
            catch { return false; }
        };
        const onCredentials = () => { if (savedLocally()) toast.dismiss(id); };
        window.addEventListener(CONNECTION_CREDENTIALS_EVENT, onCredentials);
        let active = true;
        async function check() {
            if (pathname.startsWith("/settings/connections") || shown.current === userId || savedLocally()) return;
            try { if (sessionStorage.getItem(storageKey)) return; } catch { /* The ref still prevents repeats. */ }
            try {
                const settings = await getArtworkSettings();
                // Browser credential restoration can finish while this request runs.
                if (!active || settings.configured || savedLocally()) return;
                shown.current = userId;
                try { sessionStorage.setItem(storageKey, "1"); } catch { /* Storage can be unavailable. */ }
                toast("Set up TMDB metadata", {
                    id,
                    description: "Add your TMDB read access token for movie and TV details, artwork, and search.",
                    duration: Infinity,
                    closeButton: true,
                    action: { label: "Configure TMDB", onClick: () => router.push("/settings/connections#tmdb") },
                });
            } catch { /* A failed settings request is not evidence of a missing key. */ }
        }
        void check();
        return () => {
            active = false;
            window.removeEventListener(CONNECTION_CREDENTIALS_EVENT, onCredentials);
            toast.dismiss(id);
        };
    }, [userId, pathname, router]);

    return null;
}
