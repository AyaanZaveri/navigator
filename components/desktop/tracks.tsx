"use client";

import { useEffect, useState, type RefObject } from "react";
import { AudioLines } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuOptions } from "@/components/arc/dropdown-menu/dropdown-menu";
import { Button } from "@/components/ui/button";
import { trackOptions } from "@/lib/media/track-label";
import styles from "@/components/player-settings-menu.module.css";
import type { MpvElementHandle } from "@/lib/desktop/mpv-element";
import type { NativeTrack } from "@/lib/desktop/bridge";

/** Subtitle choices live in PlayerSubtitles; this button only selects audio. */
export function DesktopTracks({ mediaRef, sourceKey }: {
  mediaRef: RefObject<HTMLVideoElement | null>;
  sourceKey: string;
}) {
  const [snapshot, setSnapshot] = useState<{ tracks: NativeTrack[]; container: Element | null }>({ tracks: [], container: null });
  useEffect(() => {
    const node = mediaRef.current as unknown as MpvElementHandle | null;
    const update = () => setSnapshot({ tracks: node?.controller?.tracks.filter(track => track.type === "audio") ?? [], container: node?.closest('[data-slot="media-player"]') ?? null });
    update();
    node?.addEventListener("trackschange", update);
    node?.addEventListener("emptied", update);
    return () => { node?.removeEventListener("trackschange", update); node?.removeEventListener("emptied", update); };
  }, [mediaRef, sourceKey]);
  const { tracks, container } = snapshot;
  if (!tracks.length) return null;
  const options = trackOptions(tracks.map(track => ({ language: track.lang, label: track.title, provider: "Embedded audio" })))
    .map(option => ({ ...option, value: String(tracks[Number(option.value)].id) }));
  return <DropdownMenu modal={false}>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="icon" aria-label="Audio track" className="text-white hover:text-white hover:bg-white/20"><AudioLines aria-hidden="true" /></Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent data-player-native-glass="" container={container} side="top" sideOffset={10} align="end" aria-label="Audio track" className={styles.trackMenu}>
      <DropdownMenuOptions value={String(tracks.find(track => track.selected)?.id ?? "no")} options={options}
        onValueChange={id => (mediaRef.current as unknown as MpvElementHandle | null)?.controller?.selectTrack("audio", id)} />
    </DropdownMenuContent>
  </DropdownMenu>;
}
