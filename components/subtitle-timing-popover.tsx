"use client";

import { useId, useRef } from "react";
import { Minus, Plus } from "lucide-react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/arc/popover/popover";
import { RulerSlider } from "@/components/arc/ruler-slider/ruler-slider";
import { Button } from "@/components/ui/button";
import { normalizeSubtitleDelay, SUBTITLE_TIMING_LIMIT } from "@/lib/media/subtitle-timing";
import glass from "./arc/floating-surface.module.css";
import styles from "./subtitle-timing-popover.module.css";

export function SubtitleTimingPopover({ open, onOpenChange, seconds, onChange, available, container }: {
  open: boolean;
  onOpenChange(open: boolean): void;
  seconds: number;
  onChange(seconds: number): void;
  available: boolean;
  container?: HTMLElement | null;
}) {
  const headingId = useId();
  const descriptionId = useId();
  const interactedOutside = useRef(false);
  const anchor = container?.querySelector<HTMLElement>('[data-slot="media-player-subtitle-timing"]')
    ?? container?.querySelector<HTMLElement>('[data-slot="media-player-settings"]');
  const description = !available ? "Timing unavailable for this subtitle track."
    : seconds === 0 ? "Original timing"
      : `Subtitles appear ${Math.abs(seconds).toFixed(1)} seconds ${seconds < 0 ? "earlier" : "later"}.`;
  const nudge = (direction: -1 | 1) => <Button type="button" variant="ghost" size="icon"
    className="size-11" aria-label={`Show subtitles 0.1 seconds ${direction < 0 ? "earlier" : "later"}`}
    title={direction < 0 ? "Earlier by 0.1 seconds" : "Later by 0.1 seconds"}
    disabled={!available || (direction < 0 ? seconds <= -SUBTITLE_TIMING_LIMIT : seconds >= SUBTITLE_TIMING_LIMIT)}
    onClick={() => onChange(normalizeSubtitleDelay(seconds + direction * 0.1))}>
    {direction < 0 ? <Minus className="size-4" /> : <Plus className="size-4" />}
  </Button>;
  return <Popover open={open} onOpenChange={onOpenChange} modal={false}>
    <PopoverAnchor virtualRef={anchor ? { current: anchor } : undefined} />
    <PopoverContent container={container} side="left" align="end" sideOffset={14}
      data-subtitle-timing="" data-player-native-glass="" className={`${glass.surface} ${styles.panel}`}
      aria-labelledby={headingId} aria-describedby={descriptionId}
      onOpenAutoFocus={event => {
        const panel = event.currentTarget as HTMLElement;
        const target = panel.querySelector<HTMLElement>('[role="slider"]:not([aria-disabled="true"])')
          ?? panel.querySelector<HTMLElement>('button');
        if (target) { event.preventDefault(); target.focus(); }
      }}
      onInteractOutside={event => {
        const target = event.target as Node;
        // This panel is click-toggled. Radix's menu hover/roving focus and
        // keyboard focus changes must not act as a click outside the panel.
        if (anchor?.contains(target) || event.detail?.originalEvent.type === "focusin") {
          event.preventDefault(); return;
        }
        interactedOutside.current = true;
      }}
      onCloseAutoFocus={event => {
        event.preventDefault();
        // Switching to a sibling panel already gives that menu item focus.
        // Returning to Timing here would immediately close the new submenu.
        const focusedItem = anchor?.ownerDocument.activeElement?.closest('[role^="menuitem"]');
        if (!interactedOutside.current && anchor?.isConnected && (!focusedItem || focusedItem === anchor)) anchor.focus();
        interactedOutside.current = false;
      }}>
      <div className={styles.header}>
        <h2 id={headingId}>Subtitle timing</h2>
        <div className={styles.headerActions}>
          <Button type="button" variant="ghost" size="sm" disabled={!available || seconds === 0}
            onClick={() => onChange(0)}>Reset</Button>
        </div>
      </div>
      <RulerSlider className={styles.ruler} label="Subtitle timing" hideLabel valueStart={nudge(-1)} valueEnd={nudge(1)} value={seconds} onValueChange={onChange}
        min={-SUBTITLE_TIMING_LIMIT} max={SUBTITLE_TIMING_LIMIT} step={0.1} largeStep={1}
        majorEvery={10} spacing={10} format={value => `${value > 0 ? "+" : ""}${value.toFixed(1)}`}
        unit="s" disabled={!available} />
      <p id={descriptionId} className="sr-only">{description}</p>
    </PopoverContent>
  </Popover>;
}
