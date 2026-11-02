"use client";

import { useEffect, useState, type RefObject } from "react";
import { AudioLines, Captions } from "lucide-react";
import { Select } from "@/components/arc/select/select";
import { trackOptions } from "@/lib/media/track-label";
import styles from "@/components/player-settings-panel.module.css";
import type { MpvElementHandle } from "@/lib/desktop/mpv-element";
import type { NativeTrack } from "@/lib/desktop/bridge";

export function DesktopTracks({ mediaRef, sourceKey, onNativeSubtitle }: {
  mediaRef: RefObject<HTMLVideoElement | null>;
  sourceKey: string;
  onNativeSubtitle(): void;
}) {
  const [snapshot, setSnapshot] = useState<{ tracks: NativeTrack[]; container: Element | null }>({ tracks: [], container: null });
  useEffect(() => {
    const node = mediaRef.current as unknown as MpvElementHandle | null;
    const update = () => setSnapshot({ tracks: node?.controller?.tracks ?? [], container: node?.closest('[data-slot="media-player"]') ?? null });
    update();
    node?.addEventListener("trackschange", update);
    return () => node?.removeEventListener("trackschange", update);
  }, [mediaRef, sourceKey]);
  const { tracks, container } = snapshot;
  return <>{(["audio", "sub"] as const).map((kind) => {
    const choices = tracks.filter((track) => track.type === kind);
    if (!choices.length) return null;
    const Icon = kind === "audio" ? AudioLines : Captions;
    const label = kind === "audio" ? "Audio track" : "Embedded subtitles";
    const options = trackOptions(choices.map(track => ({
      language: track.lang, label: track.title,
      provider: kind === "audio" ? "Embedded audio" : "Embedded subtitles",
    }))).map(option => ({ ...option, value: String(choices[Number(option.value)].id) }));
    return <Select key={kind} label={label} hideLabel
      triggerContent={<Icon aria-hidden="true" />} showChevron={false}
      className={styles.trackTrigger} contentClassName={styles.trackOptions}
      portalContainer={container} side="top" sideOffset={10}
      value={String(choices.find(track => track.selected)?.id ?? "no")}
      options={kind === "sub" ? [{ value: "no", label: "Off" }, ...options] : options}
      onValueChange={id => {
        if (kind === "sub") onNativeSubtitle();
        (mediaRef.current as unknown as MpvElementHandle | null)?.controller?.selectTrack(kind === "audio" ? "audio" : "subtitle", id);
      }} />;
  })}</>;
}
