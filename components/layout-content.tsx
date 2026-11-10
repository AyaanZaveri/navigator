"use client";

import { useAtom } from "jotai";
import { usePathname } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { DeferredTools } from "@/components/deferred-tools";
import {
    isAIAskOpenAtom,
    isPlayerVisibleAtom,
    isFullscreenAtom,
    isNavigatorEnabledAtom,
} from "@/lib/atoms";
import { useSettings } from "@/contexts/settings-context";
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { desktopBridge } from "@/lib/desktop/bridge";
import { AuroraProvider, PersistentAuroraBackground } from "@/components/aurora-provider";
import { ScrollAreaRoot, ScrollAreaViewport, ScrollBar } from "@/components/ui/scroll-area";
import styles from "./layout-content.module.css";
import { useAccountAccess } from "@/contexts/account-context";

interface LayoutContentProps {
  children: ReactNode;
  email: string;
  userId?: string;
}

export function LayoutContent({ children, email, userId }: LayoutContentProps) {
    const { authenticated } = useAccountAccess();
    const pathname = usePathname();
    const viewportRef = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        // Next's document scrolling does not reset this persistent scrollport.
        // Reset before paint so a new title opens on its hero, not the previous
        // title's recommendations. This also cancels any in-flight smooth scroll.
        viewportRef.current?.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }, [pathname]);
    const overlayHeader = /^\/(movie|series)(?:\/|$)/.test(pathname);
    const [isAIAskOpen, setIsAIAskOpen] = useAtom(isAIAskOpenAtom);
    const [isFullscreen] = useAtom(isFullscreenAtom);
    const [isPlayerVisible] = useAtom(isPlayerVisibleAtom);
    const [, setIsNavigatorEnabled] = useAtom(isNavigatorEnabledAtom);
  
    const { navigatorEnabled } = useSettings();

    // Sync the navigator enabled state with the atom
    useEffect(() => {
        setIsNavigatorEnabled(authenticated && navigatorEnabled);
    }, [authenticated, navigatorEnabled, setIsNavigatorEnabled]);

    // Function to handle opening AI Ask with fullscreen exit if needed
    const handleToggleAIAsk = async () => {
        if (isFullscreen && !isAIAskOpen && !(isPlayerVisible && desktopBridge())) {
            // Exit fullscreen first when opening AI Ask
            try {
                const desktop = desktopBridge();
                if (desktop) {
                    desktop.send({ type: "fullscreen", value: false });
                } else if (document.exitFullscreen) {
                    await document.exitFullscreen();
                } else if ((document as any).webkitExitFullscreen) {
                    await (document as any).webkitExitFullscreen();
                } else if ((document as any).mozCancelFullScreen) {
                    await (document as any).mozCancelFullScreen();
                } else if ((document as any).msExitFullscreen) {
                    await (document as any).msExitFullscreen();
                }
                // Wait a bit for fullscreen to exit, then open AI Ask
                setTimeout(() => {
                    setIsAIAskOpen(true);
                }, 100);
            } catch (error) {
                console.warn("Failed to exit fullscreen:", error);
                // Still try to open AI Ask even if fullscreen exit fails
                setIsAIAskOpen((prev) => !prev);
            }
        } else {
            setIsAIAskOpen((prev) => !prev);
        }
    };

    return (
        <AuroraProvider>
            <div data-app-layout className="relative flex h-dvh flex-col overflow-hidden">
                <ScrollAreaRoot type="scroll" scrollHideDelay={900} asChild>
                    <div data-desktop-app-content data-playback-hidden={isPlayerVisible ? "" : undefined} inert={isPlayerVisible} className="relative grid min-h-0 min-w-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)]">
                        <AppHeader email={email} overlay={overlayHeader} />
                        <ScrollAreaViewport ref={viewportRef} role="main" aria-label="Page content" tabIndex={0} data-page-scroll="" data-header-overlay={overlayHeader ? "true" : "false"} className={`${styles.viewport} relative z-[1] col-start-1 min-h-0 min-w-0 overscroll-contain pb-[env(safe-area-inset-bottom)] ${overlayHeader ? "row-start-1 row-span-2 [scroll-padding-top:calc(var(--app-header-height,5.25rem)+1rem)]" : "row-start-2 scroll-pt-4"}`}>
                            <PersistentAuroraBackground />
                            {children}
                        </ScrollAreaViewport>
                        <ScrollBar className={styles.scrollbar} style={{ top: "var(--app-header-height, 5.25rem)", bottom: "env(safe-area-inset-bottom, 0px)" }} />
                    </div>
                </ScrollAreaRoot>
                {authenticated && <DeferredTools key={userId || email} userId={userId || email} navigatorEnabled={navigatorEnabled} onToggleAIAsk={handleToggleAIAsk} />}
            </div>
        </AuroraProvider>
    );
}
