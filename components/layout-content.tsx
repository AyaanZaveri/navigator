"use client";

import { useAtom } from "jotai";
import { AppHeader } from "@/components/app-header";
import AIAsk from "@/components/navigator/ai-ask";
import { GlobalMediaPlayer } from "@/components/global-media-player";
import {
  isAIAskOpenAtom,
  isFullscreenAtom,
  isNavigatorEnabledAtom,
} from "@/lib/atoms";
import { useSettings } from "@/contexts/settings-context";
import { useEffect } from "react";

interface LayoutContentProps {
  children: React.ReactNode;
  email: string;
}

export function LayoutContent({ children, email }: LayoutContentProps) {
  const [isAIAskOpen, setIsAIAskOpen] = useAtom(isAIAskOpenAtom);
  const [isFullscreen] = useAtom(isFullscreenAtom);
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
        if (document.exitFullscreen) {
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
    <div className="flex h-dvh flex-col overflow-hidden">
      <AppHeader email={email} />
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain no-scrollbar pb-[env(safe-area-inset-bottom)]">
        {children}
      </main>
      {navigatorEnabled && <AIAsk />}
      <GlobalMediaPlayer onToggleAIAsk={navigatorEnabled ? handleToggleAIAsk : undefined} />
    </div>
  );
}
