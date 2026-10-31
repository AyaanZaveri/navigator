"use client";

import { useEffect } from "react";
import { useAtom } from "jotai";
import { desktopBridge } from "@/lib/desktop/bridge";
import { isDesktopMacAtom, isFullscreenAtom } from "@/lib/atoms";

export function FullscreenDetector() {
  const [, setIsFullscreen] = useAtom(isFullscreenAtom);
  const [, setIsDesktopMac] = useAtom(isDesktopMacAtom);

  useEffect(() => {
    const isMac =
      typeof navigator !== "undefined" &&
      /(Mac|iPhone|iPad|iPod)/i.test(navigator.platform || navigator.userAgent);
    setIsDesktopMac(isMac);
  }, [setIsDesktopMac]);

  // Track fullscreen state
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(desktopBridge()?.fullscreen ?? !!document.fullscreenElement);
    };

    const unsubscribe = desktopBridge()?.subscribe((message) => {
      if (message.type === "fullscreen") {
        handleFullscreenChange();
        document.dispatchEvent(new Event("navigatorfullscreenchange"));
      }
    });
    setIsFullscreen(desktopBridge()?.fullscreen ?? !!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);

    return () => {
      unsubscribe?.();
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
    };
  }, [setIsFullscreen]);

  return null;
}
