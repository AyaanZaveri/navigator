"use client";

import { useEffect, useState } from "react";
import { Maximize, Minimize, Minus, X } from "lucide-react";
import { desktopBridge } from "@/lib/desktop/bridge";
import styles from "./window-controls.module.css";

/** Native hit testing handles mouse input and Snap; buttons also support keyboard/AT input. */
export function DesktopWindowControls() {
  const [windows, setWindows] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const bridge = desktopBridge();
    if (bridge?.platform !== "windows") return;
    setWindows(true);
    setFullscreen(bridge.fullscreen);
    return bridge.subscribe(message => {
      if (message.type === "fullscreen") setFullscreen(message.value);
    });
  }, []);
  if (!windows) return null;
  const send = (action: "minimize" | "toggle-maximize" | "close") => desktopBridge()?.send({ type: "window-control", action });
  return (
    <div className={styles.controls} aria-label="Window controls" data-no-window-drag="">
      <button type="button" aria-label="Minimize" title="Minimize" onClick={() => send("minimize")}>
        <Minus size={12} strokeWidth={1.5} aria-hidden="true" />
      </button>
      <button type="button" aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"} title={fullscreen ? "Exit fullscreen (F11)" : "Fullscreen (F11)"} onClick={() => send("toggle-maximize")}>
        {fullscreen ? <Minimize size={12} strokeWidth={1.5} aria-hidden="true" /> : <Maximize size={12} strokeWidth={1.5} aria-hidden="true" />}
      </button>
      <button type="button" aria-label="Close window" title="Close" className={styles.close} onClick={() => send("close")}>
        <X size={12} strokeWidth={1.5} aria-hidden="true" />
      </button>
    </div>
  );
}
