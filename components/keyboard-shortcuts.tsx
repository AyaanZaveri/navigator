"use client";

import { useAtom } from 'jotai';
import { isAIAskOpenAtom, isFullscreenAtom, isNavigatorEnabledAtom } from '@/lib/atoms';
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut';

export function KeyboardShortcuts() {
  const [isAIAskOpen, setIsAIAskOpen] = useAtom(isAIAskOpenAtom);
  const [isFullscreen] = useAtom(isFullscreenAtom);
  const [isNavigatorEnabled] = useAtom(isNavigatorEnabledAtom);

  // Function to handle opening AI Ask with fullscreen exit if needed
  const handleToggleAIAsk = async () => {
    // Don't handle shortcuts if navigator is disabled
    if (!isNavigatorEnabled) {
      return;
    }

    // ...existing code...
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

  // Handle Cmd+K (Mac) / Ctrl+K (Windows/Linux) to toggle AI Ask
  useKeyboardShortcut(
    {
      key: "k",
      metaKey: true, // Command key on Mac
    },
    handleToggleAIAsk
  );

  // Also handle Ctrl+K for non-Mac users
  useKeyboardShortcut(
    {
      key: "k",
      ctrlKey: true,
    },
    handleToggleAIAsk
  );

  // Handle Escape key to close AI Ask when it's open
  useKeyboardShortcut(
    {
      key: "Escape",
      allowInInputFields: true, // Allow Escape to work even when focused on input fields
    },
    () => {
      // Only handle escape if navigator is enabled and AI Ask is open
      if (isNavigatorEnabled && isAIAskOpen) {
        setIsAIAskOpen(false);
      }
    }
  );

  return null; // This component doesn't render anything
}
