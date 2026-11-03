"use client";

import { useId, useRef } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { Popover, PopoverAnchor, PopoverClose, PopoverContent } from "@/components/arc/popover/popover";
import { RulerSlider } from "@/components/arc/ruler-slider/ruler-slider";
import { Button } from "@/components/ui/button";
import { normalizeSubtitleDelay, SUBTITLE_TIMING_LIMIT } from "@/lib/media/subtitle-timing";
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
  const description = !available
    ? "Select a downloaded subtitle track to adjust timing. Embedded subtitle timing is not supported yet."
    : seconds === 0 ? "Original timing"
      : `Subtitles appear ${Math.abs(seconds).toFixed(1)} seconds ${seconds < 0 ? "earlier" : "later"}.`;
  return <Popover open={open} onOpenChange={onOpenChange} modal={false}>
    <PopoverAnchor virtualRef={anchor ? { current: anchor } : undefined} />
    <PopoverContent container={container} side="left" align="end" sideOffset={14}
      data-subtitle-timing="" data-player-native-glass="" className={styles.panel}
      aria-labelledby={headingId} aria-describedby={descriptionId}
      onOpenAutoFocus={event => {
        const panel = event.currentTarget as HTMLElement;
        const target = panel.querySelector<HTMLElement>('[role="slider"]:not([aria-disabled="true"])')
          ?? panel.querySelector<HTMLElement>('button');
        if (target) { event.preventDefault(); target.focus(); }
      }}
      onInteractOutside={event => {
        if (anchor?.contains(event.target as Node)) { event.preventDefault(); return; }
        interactedOutside.current = true;
      }}
      onCloseAutoFocus={event => {
        event.preventDefault();
        if (!interactedOutside.current && anchor?.isConnected) anchor.focus();
        interactedOutside.current = false;
      }}>
      <div className={styles.header}>
        <h2 id={headingId}>Subtitle timing</h2>
        <PopoverClose asChild><Button type="button" variant="ghost" size="icon"
          aria-label="Close subtitle timing" className="size-9"><X className="size-4" /></Button></PopoverClose>
      </div>
      <RulerSlider className={styles.ruler} label="Subtitle delay" value={seconds} onValueChange={onChange}
        min={-SUBTITLE_TIMING_LIMIT} max={SUBTITLE_TIMING_LIMIT} step={0.1} largeStep={1}
        majorEvery={10} spacing={10} format={value => `${value > 0 ? "+" : ""}${value.toFixed(1)}`}
        unit="s" disabled={!available} />
      <p id={descriptionId} className={styles.description}>{description}</p>
      <div className={styles.actions}>
        <Button type="button" variant="secondary" size="sm" className="h-11"
          aria-label="Show subtitles 0.1 seconds earlier" disabled={!available || seconds <= -SUBTITLE_TIMING_LIMIT}
          onClick={() => onChange(normalizeSubtitleDelay(seconds - 0.1))}><ArrowLeft className="size-4" />Earlier</Button>
        <Button type="button" variant="ghost" size="sm" className="h-11"
          disabled={!available || seconds === 0} onClick={() => onChange(0)}>Reset</Button>
        <Button type="button" variant="secondary" size="sm" className="h-11"
          aria-label="Show subtitles 0.1 seconds later" disabled={!available || seconds >= SUBTITLE_TIMING_LIMIT}
          onClick={() => onChange(normalizeSubtitleDelay(seconds + 0.1))}>Later<ArrowRight className="size-4" /></Button>
      </div>
    </PopoverContent>
  </Popover>;
}
