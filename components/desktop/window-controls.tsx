"use client";

import { useEffect, useState } from "react";
import { desktopBridge } from "@/lib/desktop/bridge";
import styles from "./window-controls.module.css";

/** Native hit testing handles mouse input and Snap; buttons also support keyboard/AT input. */
export function DesktopWindowControls() {
  const [windows, setWindows] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const bridge = desktopBridge();
    if (bridge?.platform !== "windows") return;
    setWindows(true);
    setFullscreen(bridge.fullscreen);
    return bridge.subscribe(message => {
      if (message.type === "fullscreen") setFullscreen(message.value);
      if (message.type === "window-state") setMaximized(message.maximized);
    });
  }, []);
  if (!windows || fullscreen) return null;
  const send = (action: "minimize" | "toggle-maximize" | "close") => desktopBridge()?.send({ type: "window-control", action });
  return (
    <div className={styles.controls} aria-label="Window controls" data-no-window-drag="">
      <button type="button" aria-label="Minimize" title="Minimize" onClick={() => send("minimize")}>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M1 6.5h10" /></svg>
      </button>
      <button type="button" aria-label={maximized ? "Restore window" : "Maximize"} title={maximized ? "Restore window" : "Maximize"} onClick={() => send("toggle-maximize")}>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">{maximized ? <path d="M3.5 3.5v-2h7v7h-2m-7-5h7v7h-7z" /> : <path d="M1.5 1.5h9v9h-9z" />}</svg>
      </button>
      <button type="button" aria-label="Close window" title="Close" className={styles.close} onClick={() => send("close")}>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="m1.5 1.5 9 9m0-9-9 9" /></svg>
      </button>
    </div>
  );
}
