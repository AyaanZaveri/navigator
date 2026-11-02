"use client";

import { Select, type SelectOption } from "@/components/arc/select/select";
import styles from "./player-settings-panel.module.css";

export function PlayerSettingsPanel({ speed, speeds, onSpeedChange, quality, subtitles, disabled, portalContainer }: {
  speed: number;
  speeds: number[];
  onSpeedChange(_rate: number): void;
  quality?: { value: string; options: SelectOption[]; onChange(_value: string): void };
  subtitles: { value: string; options: SelectOption[]; onChange(_value: string): void };
  disabled?: boolean;
  portalContainer: Element | DocumentFragment | null;
}) {
  return <div className={styles.panel}>
    <h2 className={styles.heading}>Playback settings</h2>
    <Select label="Speed" value={String(speed)} disabled={disabled}
      onValueChange={value => onSpeedChange(Number(value))}
      options={speeds.map(rate => ({ value: String(rate), label: rate === 1 ? "Normal (1×)" : `${rate}×` }))}
      portalContainer={portalContainer} contentClassName={styles.options} />
    {quality && <Select label="Quality" value={quality.value} disabled={disabled}
      onValueChange={quality.onChange} options={quality.options}
      portalContainer={portalContainer} contentClassName={styles.options} />}
    <Select label="Subtitles" value={subtitles.value} disabled={disabled}
      onValueChange={subtitles.onChange} options={subtitles.options}
      portalContainer={portalContainer} contentClassName={styles.options} />
    {subtitles.options.length === 1 && <p className={styles.empty}>No subtitle tracks available for this stream.</p>}
  </div>;
}
