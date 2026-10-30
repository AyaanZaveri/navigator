"use client";

import { useState, useEffect } from "react";
import type { MediaItem, StremioStream } from "@/types/stremio";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LoadingPlaceholder } from "@/components/ui/loading-placeholder";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Play, SearchX } from "lucide-react";
import { useMediaPlayer } from "@/contexts/MediaPlayerContext";
import { fetchPlaybackProgress } from "@/app/actions";
import { SearchField } from "@/components/arc/search-field/search-field";
import { ChipGroup } from "@/components/arc/chip-group/chip-group";
import styles from "./media-actions.module.css";

interface MediaActionsProps {
  media?: MediaItem;
  movie?: MediaItem;
}

interface StreamAddonTarget {
  id: string;
  name: string;
}

interface StreamWithAddon extends StremioStream {
  addonId: string;
  addonName: string;
}

const RESOLUTION_FILTERS = ["2160p", "1080p", "720p", "480p"] as const;

export function MediaActions({ media, movie }: MediaActionsProps) {
  const activeMedia = media ?? movie;
  const { setIsPlayerVisible, playMedia } = useMediaPlayer();
  const [streams, setStreams] = useState<StreamWithAddon[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasCheckedStreams, setHasCheckedStreams] = useState(false);
  const [pendingAddons, setPendingAddons] = useState(0);
  const [totalAddons, setTotalAddons] = useState(0);
  const [streamSearchQuery, setStreamSearchQuery] = useState("");
  const [selectedResolutions, setSelectedResolutions] = useState<string[]>([]);
  const [resumePositionTicks, setResumePositionTicks] = useState<
    number | undefined
  >(activeMedia?.resumePositionTicks);

  useEffect(() => {
    setResumePositionTicks(activeMedia?.resumePositionTicks);
  }, [activeMedia?.resumePositionTicks]);

  useEffect(() => {
    if (!activeMedia) return;
    let cancelled = false;

    const libraryItemId = activeMedia.seriesId || activeMedia.id;
    const targetVideoId =
      activeMedia.episodeId || activeMedia.mediaSourceId || activeMedia.id;

    void (async () => {
      const progress = await fetchPlaybackProgress(
        libraryItemId,
        targetVideoId,
      );
      if (cancelled) return;
      if (
        typeof progress?.resumePositionTicks === "number" &&
        progress.resumePositionTicks > 0
      ) {
        setResumePositionTicks(progress.resumePositionTicks);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    activeMedia?.episodeId,
    activeMedia?.id,
    activeMedia?.mediaSourceId,
    activeMedia?.seriesId,
  ]);

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
      setSelectedResolutions([]);
      try {
        const targetsResponse = await fetch(
          `/api/streams/addons?type=${encodeURIComponent(activeMedia.type)}`,
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
                `/api/streams/addon?mediaItemId=${encodeURIComponent(activeMedia.id)}&type=${encodeURIComponent(activeMedia.type)}&addonId=${encodeURIComponent(target.id)}`,
              );
              const streamData = await streamResponse.json();
              const result: StreamWithAddon[] = Array.isArray(
                streamData?.streams,
              )
                ? streamData.streams.map((stream: StremioStream) => ({
                    ...stream,
                    addonId: target.id,
                    addonName: target.name,
                  }))
                : [];

              if (cancelled) return;

              if (result.length > 0) {
                setStreams((previous) => {
                  const existing = new Set(
                    previous.map(
                      (stream) => `${stream.addonId}|${getStreamKey(stream)}`,
                    ),
                  );
                  const next = [...previous];
                  for (const stream of result) {
                    const key = `${stream.addonId}|${getStreamKey(stream)}`;
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

  const normalizedSearchQuery = streamSearchQuery.trim().toLowerCase();
  const hasActiveFilters = selectedResolutions.length > 0;
  const filteredStreams = streams.filter((stream) => {
    const searchableText = [
      getSourceLabel(stream),
      stream.title,
      stream.name,
      stream.addonName,
      stream.behaviorHints?.filename,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (
      normalizedSearchQuery &&
      !searchableText.includes(normalizedSearchQuery)
    ) {
      return false;
    }

    if (selectedResolutions.length > 0) {
      const detectedResolution = detectStreamResolution(searchableText);
      if (
        !detectedResolution ||
        !selectedResolutions.includes(detectedResolution)
      ) {
        return false;
      }
    }


    return true;
  });
  const isAddonLoading = loading && totalAddons > 0 && pendingAddons > 0;

  const handlePlay = async (stream: StremioStream) => {
    if (!activeMedia) return;

    const streamUrl = stream.url || stream.externalUrl || undefined;
    if (!streamUrl) return;
    const isEpisode =
      activeMedia.type === "series" &&
      !!activeMedia.seriesId &&
      !!activeMedia.episodeId;

    await playMedia({
      id: isEpisode ? activeMedia.seriesId! : activeMedia.id,
      name: isEpisode
        ? activeMedia.episodeTitle || activeMedia.name
        : activeMedia.name,
      type: activeMedia.type,
      resumePositionTicks,
      streamUrl,
      mediaSourceId: isEpisode ? activeMedia.episodeId : activeMedia.id,
      seriesId: isEpisode ? activeMedia.seriesId : undefined,
      showName: isEpisode
        ? activeMedia.showName || activeMedia.name
        : undefined,
      episodeTitle: isEpisode
        ? activeMedia.episodeTitle || activeMedia.name
        : undefined,
      seasonNumber: isEpisode ? activeMedia.seasonNumber : undefined,
      episodeNumber: isEpisode ? activeMedia.episodeNumber : undefined,
      backdropUrl: activeMedia.background || activeMedia.poster,
      subtitleFilename: stream.behaviorHints?.filename,
      subtitleVideoSize: stream.behaviorHints?.videoSize,
    });
    setIsPlayerVisible(true);
  };

  function getSourceLabel(stream: StremioStream) {
    if (stream.name) return stream.name;
    if (stream.url || stream.externalUrl) {
      try {
        return new URL(stream.url || stream.externalUrl || "").hostname;
      } catch {
        return "Stream";
      }
    }
    return "Unknown source";
  }

  function detectStreamResolution(text: string) {
    if (/(2160p|4k|uhd)/i.test(text)) return "2160p";
    if (/1080p/i.test(text)) return "1080p";
    if (/720p/i.test(text)) return "720p";
    if (/480p/i.test(text)) return "480p";
    return null;
  }

  const formatVideoSize = (sizeInBytes?: number) =>
    typeof sizeInBytes === "number"
      ? `${(sizeInBytes / 1024 ** 3).toFixed(2)} GB`
      : null;

  return (
    <div className={styles.root}>
      {totalAddons > 0 && (
        <div className={styles.toolbar}>
          <div className={styles.search}>
            <SearchField
              label="Search streams"
              hideLabel
              value={streamSearchQuery}
              onValueChange={setStreamSearchQuery}
              placeholder="Find the least broken stream..."
              autoComplete="off"
            />
          </div>
          <fieldset className={styles.facet}>
            <legend className="sr-only">Resolution</legend>
            <ChipGroup
              label="Filter by resolution"
              multiple
              className={styles.chips}
              options={RESOLUTION_FILTERS.map((resolution) => ({
                value: resolution,
                label: resolution,
              }))}
              value={selectedResolutions}
              onValueChange={setSelectedResolutions}
            />
          </fieldset>
          {isAddonLoading && (
            <div className={styles.feedback}>
              <div role="status" className={styles.loading}>
                <Loader2
                  aria-hidden="true"
                  className="size-3.5 animate-spin motion-reduce:animate-none"
                />
                <span>
                  {pendingAddons} addon{pendingAddons === 1 ? "" : "s"} loading
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {filteredStreams.length > 0 && (
        <div className={styles.results}>
          <ScrollArea className="w-full h-[24rem] rounded-xl">
            <div className={styles.streamList}>
              {filteredStreams.map((stream, index) => {
                const streamUrl = stream.url || stream.externalUrl;
                return (
                  <div
                    key={index}
                    className="rounded-lg border border-border/60 bg-card/50 p-2.5 shadow-xs"
                  >
                    <div className={styles.streamRow}>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium break-words">
                          {getSourceLabel(stream)}
                        </div>
                        {stream.title && (
                          <div className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap [overflow-wrap:anywhere]">
                            {stream.title}
                          </div>
                        )}
                        {(stream.behaviorHints?.filename ||
                          stream.behaviorHints?.videoSize) && (
                          <div className="mt-1 text-xs text-muted-foreground font-mono [overflow-wrap:anywhere]">
                            {stream.behaviorHints?.filename ?? "Unknown file"}
                            {formatVideoSize(stream.behaviorHints?.videoSize) &&
                              ` ~ ${formatVideoSize(stream.behaviorHints?.videoSize)}`}
                          </div>
                        )}
                      </div>

                      <div className={styles.playAction}>
                        <Button
                          variant="outline"
                          className="group h-8 px-2.5 gap-1.5 hover:ring-2 hover:ring-offset-2 hover:ring-primary hover:ring-offset-accent hover:shadow-xl hover:shadow-primary/30"
                          disabled={!streamUrl}
                          onClick={() => handlePlay(stream)}
                        >
                          <Play className="h-3.5 w-3.5" />
                          <span className="text-xs">Play</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
          <div className="mt-3 flex justify-end">
            <span className="text-xs text-muted-foreground font-mono">
              {filteredStreams.length} stream
              {filteredStreams.length === 1 ? "" : "s"} found
            </span>
          </div>
        </div>
      )}

      {loading && streams.length === 0 && (
        <LoadingPlaceholder className={styles.results}>
          <ScrollArea className="w-full h-[24rem] rounded-xl">
            <div className={styles.streamList}>
              {[1, 2, 3, 4, 5, 6].map((item) => (
                <div
                  key={item}
                  className="rounded-lg border border-border/60 bg-card/50 p-2.5 shadow-xs"
                >
                  <div className={styles.streamRow}>
                    <div className="min-w-0 flex-1">
                      <Skeleton className="h-5 w-56 max-w-full rounded-md" />
                      <Skeleton className="mt-2 h-3 w-72 max-w-full rounded-md" />
                    </div>
                    <div className={styles.playAction}>
                      <Skeleton className="h-8 w-[68px] rounded-md" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </LoadingPlaceholder>
      )}

      {filteredStreams.length === 0 &&
        ((!loading && hasCheckedStreams) || streams.length > 0) && (
          <Empty className="border border-border/60 bg-card/30 py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchX className="size-5" />
              </EmptyMedia>
              <EmptyTitle>
                {loading
                  ? "No matching streams yet"
                  : normalizedSearchQuery || hasActiveFilters
                  ? "Your filters were a little too powerful"
                  : "No streams crawled out of hiding"}
              </EmptyTitle>
              <EmptyDescription>
                {loading
                  ? "More addons are still loading. Try adjusting your search or resolution filters."
                  : normalizedSearchQuery || hasActiveFilters
                  ? "Loosen the search/filters a bit and you should find the least broken stream."
                  : "Try again in a minute and hunt for a less cursed source."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
    </div>
  );
}
