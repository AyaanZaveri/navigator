"use client";

import { useEffect } from 'react';
import { useAtom } from 'jotai';
import { isFullscreenAtom, isElectronMacAtom } from '@/lib/atoms';

export function FullscreenDetector() {
  const [, setIsFullscreen] = useAtom(isFullscreenAtom);
  const [, setIsElectronMac] = useAtom(isElectronMacAtom);

  // Detect if running in Electron on macOS
  useEffect(() => {
    const checkElectronMac = () => {
      // Check if running in Electron
      const isElectron =
        typeof window !== "undefined" &&
        (window.navigator.userAgent.includes("Electron") ||
          (window as any).electronAPI ||
          (window as any).require);

      // Check if running on macOS
      const isMac =
        typeof window !== "undefined" &&
        navigator.platform.toUpperCase().indexOf("MAC") >= 0;

      console.log("isElectron:", isElectron);
      console.log("isMac:", isMac);

      setIsElectronMac(isElectron && isMac);
    };

    checkElectronMac();
  }, [setIsElectronMac]);

  // Track fullscreen state
  useEffect(() => {
    // Check if we're in Electron
    if (typeof window !== "undefined" && window.electronAPI) {
      console.log("Setting up Electron fullscreen listeners");
      
      // Get initial fullscreen state
      window.electronAPI.getFullscreenState().then(({ isFullscreen }) => {
        console.log("Initial fullscreen state:", isFullscreen);
        setIsFullscreen(isFullscreen);
      }).catch(error => {
        console.error("Error getting initial fullscreen state:", error);
      });
      
      // Use Electron's fullscreen events
      window.electronAPI.onFullscreenChange((isFullscreen) => {
        console.log("Electron fullscreen changed:", isFullscreen);
        setIsFullscreen(isFullscreen);
      });

      return () => {
        console.log("Cleaning up Electron fullscreen listeners");
        window.electronAPI?.removeFullscreenListener();
      };
    } else {
      console.log("Setting up web API fullscreen listeners");
      // Fallback to web API for browser
      const handleFullscreenChange = () => {
        const isFullscreen = !!document.fullscreenElement;
        console.log("Web API fullscreen changed:", isFullscreen);
        setIsFullscreen(isFullscreen);
      };

      document.addEventListener("fullscreenchange", handleFullscreenChange);
      document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.addEventListener("mozfullscreenchange", handleFullscreenChange);
      document.addEventListener("MSFullscreenChange", handleFullscreenChange);

      // Set initial state
      const initialFullscreen = !!document.fullscreenElement;
      console.log("Initial web API fullscreen state:", initialFullscreen);
      setIsFullscreen(initialFullscreen);

      return () => {
        console.log("Cleaning up web API fullscreen listeners");
        document.removeEventListener("fullscreenchange", handleFullscreenChange);
        document.removeEventListener(
          "webkitfullscreenchange",
          handleFullscreenChange
        );
        document.removeEventListener(
          "mozfullscreenchange",
          handleFullscreenChange
        );
        document.removeEventListener(
          "MSFullscreenChange",
          handleFullscreenChange
        );
      };
    }
  }, [setIsFullscreen]);

  return null; // This component doesn't render anything
}
