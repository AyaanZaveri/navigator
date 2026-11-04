"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createHomePaletteScene, type HomeArtwork, type HomePaletteScene } from "@/lib/home-palette";
import { loadHomePalette } from "@/lib/aurora-palette-loader";

const HomePaletteContext = createContext<HomePaletteScene | null>(null);

export function HomePaletteProvider({ children }: { children: ReactNode }) {
    const [scene] = useState(() => createHomePaletteScene(loadHomePalette));
    useEffect(() => { scene.start(); return () => scene.stop(); }, [scene]);
    return <HomePaletteContext.Provider value={scene}>{children}</HomePaletteContext.Provider>;
}

export function useHomePaletteScene() { return useContext(HomePaletteContext); }

/** The server streams this with Continue Watching; no extra metadata request. */
export function HomeInitialPalette({ primary, fallback }: HomeArtwork) {
    const scene = useHomePaletteScene();
    useEffect(() => scene?.registerInitial({ primary, fallback }), [scene, primary, fallback]);
    return null;
}
