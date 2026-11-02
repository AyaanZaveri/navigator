"use client";

import {
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
  DropdownMenuOptions, type DropdownOption,
} from "@/components/arc/dropdown-menu/dropdown-menu";
import styles from "./player-settings-menu.module.css";

export function PlayerSettingsMenu({ speed, speeds, onSpeedChange, quality, subtitles, disabled, portalContainer }: {
  speed: number;
  speeds: number[];
  onSpeedChange(_rate: number): void;
  quality?: { value: string; options: DropdownOption[]; onChange(_value: string): void };
  subtitles: { value: string; options: DropdownOption[]; onChange(_value: string): void };
  disabled?: boolean;
  portalContainer: Element | DocumentFragment | null;
}) {
  const rows = [
    { label: "Speed", value: String(speed), summary: `${speed}×`, options: speeds.map(rate => ({ value: String(rate), label: rate === 1 ? "Normal (1×)" : `${rate}×` })), onChange: (value: string) => onSpeedChange(Number(value)) },
    ...(quality ? [{ label: "Quality", ...quality, summary: quality.options.find(option => option.value === quality.value)?.label ?? "Auto" }] : []),
    { label: "Subtitles", ...subtitles, summary: subtitles.options.find(option => option.value === subtitles.value)?.label ?? "Off" },
  ];
  return <>{rows.map(row => <DropdownMenuSub key={row.label}>
    <DropdownMenuSubTrigger disabled={disabled}>
      <span className={styles.rowLabel}>{row.label}</span>
      <span className={styles.summary}>{row.summary}</span>
    </DropdownMenuSubTrigger>
    <DropdownMenuSubContent container={portalContainer} aria-label={row.label}
      className={row.label === "Subtitles" ? styles.subtitleMenu : undefined}>
      <DropdownMenuOptions value={row.value} onValueChange={row.onChange} options={row.options} />
      {row.label === "Subtitles" && row.options.length === 1 && <p className={styles.empty}>No subtitle tracks available.</p>}
    </DropdownMenuSubContent>
  </DropdownMenuSub>)}</>;
}
