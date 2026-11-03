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
import { useEffect, type ReactNode } from "react";
import { desktopBridge } from "@/lib/desktop/bridge";
import { AuroraProvider, PersistentAuroraBackground } from "@/components/aurora-provider";

interface LayoutContentProps {
  children: ReactNode;
  email: string;
  userId?: string;
}

export function LayoutContent({ children, email, userId }: LayoutContentProps) {
    const pathname = usePathname();
    const overlayHeader = /^\/(movie|series)(?:\/|$)/.test(pathname);
    const [isAIAskOpen, setIsAIAskOpen] = useAtom(isAIAskOpenAtom);
    const [isFullscreen] = useAtom(isFullscreenAtom);
    const [isPlayerVisible] = useAtom(isPlayerVisibleAtom);
    const [, setIsNavigatorEnabled] = useAtom(isNavigatorEnabledAtom);
  
    const { navigatorEnabled } = useSettings();

    // Sync the navigator enabled state with the atom
    useEffect(() => {
        setIsNavigatorEnabled(navigatorEnabled);
    }, [navigatorEnabled, setIsNavigatorEnabled]);

    // Function to handle opening AI Ask with fullscreen exit if needed
    const handleToggleAIAsk = async () => {
        if (isFullscreen && !isAIAskOpen) {
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
                <div data-desktop-app-content data-playback-hidden={isPlayerVisible ? "" : undefined} inert={isPlayerVisible} className="relative grid min-h-0 min-w-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)]">
                    <AppHeader email={email} overlay={overlayHeader} />
                    <main className={`relative z-[1] col-start-1 min-h-0 min-w-0 overflow-y-auto overscroll-contain no-scrollbar pb-[env(safe-area-inset-bottom)] ${overlayHeader ? "row-start-1 row-span-2 [scroll-padding-top:calc(var(--app-header-height,5.25rem)+1rem)]" : "row-start-2 scroll-pt-4"}`}>
                        <PersistentAuroraBackground />
                        {children}
                    </main>
                </div>
                <DeferredTools userId={userId || email} navigatorEnabled={navigatorEnabled} onToggleAIAsk={handleToggleAIAsk} />
            </div>
        </AuroraProvider>
    );
}
