"use client";

import { useState, useEffect } from "react";
import type { MediaItem, StremioStream } from "@/types/stremio";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Play } from "lucide-react";
import { useMediaPlayer } from "@/contexts/MediaPlayerContext";
import { createPortal } from "react-dom";

interface MediaActionsProps {
  media?: MediaItem;
  movie?: MediaItem;
}

interface StreamAddonTarget {
  id: string;
  name: string;
}

export function MediaActions({ media, movie }: MediaActionsProps) {
  const activeMedia = media ?? movie;
  const { setIsPlayerVisible, playMedia } = useMediaPlayer();
  const [streams, setStreams] = useState<StremioStream[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasCheckedStreams, setHasCheckedStreams] = useState(false);
  const [pendingAddons, setPendingAddons] = useState(0);
  const [totalAddons, setTotalAddons] = useState(0);
  const [streamPillAnchor, setStreamPillAnchor] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setStreamPillAnchor(document.getElementById("stream-loading-pill-anchor"));
  }, []);

  useEffect(() => {
    if (!activeMedia) return;
    let cancelled = false;

    const getStreamKey = (stream: StremioStream) =>
      `${stream.url || stream.externalUrl || ""}|${stream.title || ""}|${stream.name || ""}`;

    const loadStreams = async () => {
      setStreams([]);
      setHasCheckedStreams(false);
      setLoading(true);
      setPendingAddons(0);
      setTotalAddons(0);
      try {
        const targetsResponse = await fetch(
          `/api/streams/addons?type=${encodeURIComponent(activeMedia.type)}`
        );
        const targetsData = await targetsResponse.json();
        const targets: StreamAddonTarget[] = Array.isArray(targetsData?.addons)
          ? targetsData.addons
          : [];

        if (cancelled) return;

        setTotalAddons(targets.length);
        setPendingAddons(targets.length);

        if (targets.length === 0) {
          setLoading(false);
          setHasCheckedStreams(true);
          return;
        }

        let remaining = targets.length;

        targets.forEach((target) => {
          void (async () => {
            try {
              const streamResponse = await fetch(
                `/api/streams/addon?mediaItemId=${encodeURIComponent(activeMedia.id)}&type=${encodeURIComponent(activeMedia.type)}&addonId=${encodeURIComponent(target.id)}`
              );
              const streamData = await streamResponse.json();
              const result: StremioStream[] = Array.isArray(streamData?.streams)
                ? streamData.streams
                : [];

              if (cancelled) return;

              if (result.length > 0) {
                setStreams((previous) => {
                  const existing = new Set(previous.map(getStreamKey));
                  const next = [...previous];
                  for (const stream of result) {
                    const key = getStreamKey(stream);
                    if (!existing.has(key)) {
                      existing.add(key);
                      next.push(stream);
                    }
                  }
                  return next;
                });
              }
            } catch (error) {
              if (!cancelled) {
                console.error("Failed to fetch streams for addon:", error);
              }
            } finally {
              if (cancelled) return;
              remaining -= 1;
              setPendingAddons(remaining);
              if (remaining === 0) {
                setLoading(false);
                setHasCheckedStreams(true);
              }
            }
          })();
        });
      } catch (error) {
        console.error("Failed to fetch streams:", error);
        if (!cancelled) {
          setLoading(false);
          setHasCheckedStreams(true);
        }
      }
    };

    loadStreams();
    return () => {
      cancelled = true;
    };
  }, [activeMedia?.id, activeMedia?.type]);

  if (!activeMedia) return null;

  const handlePlay = async (stream: StremioStream) => {
    if (!activeMedia) return;

    const streamUrl = stream.url || stream.externalUrl || undefined;
    if (!streamUrl) return;

    await playMedia({
      id: activeMedia.id,
      name: activeMedia.name,
      type: activeMedia.type,
      streamUrl,
    });
    setIsPlayerVisible(true);
  };

  const getSourceLabel = (stream: StremioStream) => {
    if (stream.name) return stream.name;
    if (stream.url || stream.externalUrl) {
      try {
        return new URL(stream.url || stream.externalUrl || "").hostname;
      } catch {
        return "Stream";
      }
    }
    return "Unknown source";
  };

  const formatVideoSize = (sizeInBytes?: number) =>
    typeof sizeInBytes === "number" ? `${(sizeInBytes / 1024 ** 3).toFixed(2)} GB` : null;

  return (
    <div className="flex flex-col gap-2 mb-6 w-full">
      {streamPillAnchor &&
        loading &&
        totalAddons > 0 &&
        pendingAddons > 0 &&
        createPortal(
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm backdrop-blur-sm">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>
              {pendingAddons} addon{pendingAddons === 1 ? "" : "s"} loading
            </span>
          </div>,
          streamPillAnchor
        )}

      {streams.length > 0 && (
        <div className="-ml-3 -mt-3">
          <ScrollArea className="w-full h-[22rem] rounded-xl">
            <div className="p-3 space-y-2">
              {streams.map((stream, index) => {
                const streamUrl = stream.url || stream.externalUrl;
                return (
                  <div
                    key={index}
                    className="rounded-lg border border-border/60 bg-card/50 p-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-base font-medium break-words">
                          {getSourceLabel(stream)}
                        </div>
                        {stream.title && (
                          <div className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap break-words">
                            {stream.title}
                          </div>
                        )}
                        {(stream.behaviorHints?.filename ||
                          stream.behaviorHints?.videoSize) && (
                          <div className="mt-1 text-xs text-muted-foreground font-mono break-all">
                            {stream.behaviorHints?.filename ?? "Unknown file"}
                            {formatVideoSize(stream.behaviorHints?.videoSize) &&
                              ` ~ ${formatVideoSize(stream.behaviorHints?.videoSize)}`}
                          </div>
                        )}
                      </div>

                      <div className="flex shrink-0 self-center items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 px-3 gap-1.5"
                          disabled={!streamUrl}
                          onClick={() => handlePlay(stream)}
                        >
                          <Play className="h-3.5 w-3.5" />
                          <span className="text-sm">Play</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
          <div className="-mb-3 mt-3 flex justify-end pr-3">
            <span className="text-xs text-muted-foreground font-mono">
              {streams.length} stream{streams.length === 1 ? "" : "s"} found
            </span>
          </div>
        </div>
      )}

      {loading && streams.length === 0 && (
        <div className="-ml-3 -mt-3">
          <ScrollArea className="w-full h-[22rem] rounded-xl">
            <div className="p-3 space-y-2">
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="rounded-lg border border-border/60 bg-card/50 p-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <Skeleton className="h-5 w-64 rounded-full" />
                      <Skeleton className="mt-3 h-4 w-full max-w-4xl rounded-full" />
                    </div>
                    <div className="flex shrink-0 self-center items-center gap-2">
                      <Skeleton className="h-9 w-[92px] rounded-md" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {!loading && hasCheckedStreams && streams.length === 0 && (
        <span className="text-sm text-muted-foreground">No streams found</span>
      )}
    </div>
  );
}
