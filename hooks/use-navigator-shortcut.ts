"use client";

import { useEffect, useState } from "react";
import { desktopBridge } from "@/lib/desktop/bridge";

/** Keep the launcher and player hint consistent, including in Windows browsers. */
export function useNavigatorShortcut(): string[] {
  const [modifier, setModifier] = useState("⌘");
  useEffect(() => {
    const platform = desktopBridge()?.platform ?? navigator.platform;
    setModifier(/mac|ios|iphone|ipad/i.test(platform) ? "⌘" : "Ctrl");
  }, []);
  return [modifier, "K"];
}
