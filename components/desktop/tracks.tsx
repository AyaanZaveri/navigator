"use client";

import { useEffect, useState, type RefObject } from "react";
import { AudioLines, Captions } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem } from "@/components/ui/dropdown-menu";
import type { MpvElementHandle } from "@/lib/desktop/mpv-element";
import type { NativeTrack } from "@/lib/desktop/bridge";

export function DesktopTracks({ mediaRef, sourceKey, onNativeSubtitle }: {
  mediaRef: RefObject<HTMLVideoElement | null>;
  sourceKey: string;
  onNativeSubtitle(): void;
}) {
  const [tracks, setTracks] = useState<NativeTrack[]>([]);
  useEffect(() => {
    const node = mediaRef.current as unknown as MpvElementHandle | null;
    const update = () => setTracks(node?.controller?.tracks ?? []);
    update();
    node?.addEventListener("trackschange", update);
    return () => node?.removeEventListener("trackschange", update);
  }, [mediaRef, sourceKey]);
  const node = mediaRef.current as unknown as MpvElementHandle | null;
  const container = node?.closest('[data-slot="media-player"]');
  return <>{(["audio", "sub"] as const).map((kind) => {
    const choices = tracks.filter((track) => track.type === kind);
    if (!choices.length) return null;
    const Icon = kind === "audio" ? AudioLines : Captions;
    const label = kind === "audio" ? "Audio track" : "Embedded subtitles";
    return (
      <DropdownMenu key={kind}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={label}><Icon /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" container={container}>
          <DropdownMenuGroup>
            <DropdownMenuLabel>{label}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={String(choices.find((track) => track.selected)?.id ?? "no")} onValueChange={(id) => {
              if (kind === "sub") onNativeSubtitle();
              node?.controller?.selectTrack(kind === "audio" ? "audio" : "subtitle", id);
            }}>
              {kind === "sub" && <DropdownMenuRadioItem value="no">Off</DropdownMenuRadioItem>}
              {choices.map((track, index) => <DropdownMenuRadioItem key={track.id} value={String(track.id)}>
                {track.title || track.lang || `Track ${index + 1}`}
              </DropdownMenuRadioItem>)}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  })}</>;
}
