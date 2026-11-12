"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { createHomePaletteScene, type HomeArtwork, type HomePaletteScene } from "@/lib/home-palette";
import { loadHomePalette } from "@/lib/aurora-palette-loader";

const HomePaletteContext = createContext<HomePaletteScene | null>(null);

export function HomePaletteProvider({ children }: { children: ReactNode }) {
    const [scene] = useState(() => createHomePaletteScene(loadHomePalette));
    const pathname = usePathname();
    // Reset page intent before the new page registers its initial artwork.
    // Keep the snapshot and the layout-owned canvas across the navigation.
    useLayoutEffect(() => { scene.navigate(); }, [scene, pathname]);
    useEffect(() => { scene.start(); return () => scene.stop(); }, [scene]);
    return <HomePaletteContext.Provider value={scene}>{children}</HomePaletteContext.Provider>;
}

export function useHomePaletteScene() { return useContext(HomePaletteContext); }

/** The server streams this with Continue Watching; no extra metadata request. */
export function HomeInitialPalette({ primary, fallback, resetInteraction = false }: HomeArtwork & { resetInteraction?: boolean }) {
    const scene = useHomePaletteScene();
    useEffect(() => scene?.registerInitial({ primary, fallback }, resetInteraction), [scene, primary, fallback, resetInteraction]);
    return null;
}
