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
import { Skeleton } from "@/components/ui/skeleton";
import { FilterX, Loader2, Play, Puzzle, Search, SearchX } from "lucide-react";
import { useMediaPlayer } from "@/contexts/MediaPlayerContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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

const HIDDEN_ADDON_IDS = new Set(["org.stremio.local"]);
const RESOLUTION_FILTERS = ["2160p", "1080p", "720p", "480p"] as const;
const STREAM_TAG_FILTERS = ["HDR", "DV", "WEB"] as const;

export function MediaActions({ media, movie }: MediaActionsProps) {
  const activeMedia = media ?? movie;
  const { setIsPlayerVisible, playMedia } = useMediaPlayer();
  const [streams, setStreams] = useState<StreamWithAddon[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasCheckedStreams, setHasCheckedStreams] = useState(false);
  const [pendingAddons, setPendingAddons] = useState(0);
  const [totalAddons, setTotalAddons] = useState(0);
  const [addonTargets, setAddonTargets] = useState<StreamAddonTarget[]>([]);
  const [selectedAddonId, setSelectedAddonId] = useState<string>("all");
  const [streamSearchQuery, setStreamSearchQuery] = useState("");
  const [selectedResolutions, setSelectedResolutions] = useState<string[]>([]);
  const [selectedStreamTags, setSelectedStreamTags] = useState<string[]>([]);

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
      setAddonTargets([]);
      setSelectedAddonId("all");
      setSelectedResolutions([]);
      setSelectedStreamTags([]);
      try {
        const targetsResponse = await fetch(
          `/api/streams/addons?type=${encodeURIComponent(activeMedia.type)}`
        );
        const targetsData = await targetsResponse.json();
        const targets: StreamAddonTarget[] = Array.isArray(targetsData?.addons)
          ? targetsData.addons
          : [];

        if (cancelled) return;

        setAddonTargets(targets);
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
              const result: StreamWithAddon[] = Array.isArray(streamData?.streams)
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
                    previous.map((stream) => `${stream.addonId}|${getStreamKey(stream)}`)
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

  const selectedAddonName =
    selectedAddonId === "all"
      ? "All"
      : addonTargets.find((addon) => addon.id === selectedAddonId)?.name || "All";

  const selectableAddonTargets = addonTargets.filter(
    (addon) => !HIDDEN_ADDON_IDS.has(addon.id)
  );

  const addonFilteredStreams =
    selectedAddonId === "all"
      ? streams
      : streams.filter((stream) => stream.addonId === selectedAddonId);
  const normalizedSearchQuery = streamSearchQuery.trim().toLowerCase();
  const hasActiveFilters =
    selectedResolutions.length > 0 || selectedStreamTags.length > 0;
  const filteredStreams = addonFilteredStreams.filter((stream) => {
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

    if (normalizedSearchQuery && !searchableText.includes(normalizedSearchQuery)) {
      return false;
    }

    if (selectedResolutions.length > 0) {
      const detectedResolution = detectStreamResolution(searchableText);
      if (!detectedResolution || !selectedResolutions.includes(detectedResolution)) {
        return false;
      }
    }

    if (selectedStreamTags.length > 0) {
      const tags = detectStreamTags(searchableText);
      const matchesAnySelectedTag = selectedStreamTags.some((tag) => tags.has(tag));
      if (!matchesAnySelectedTag) {
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
      streamUrl,
      mediaSourceId: isEpisode ? activeMedia.episodeId : activeMedia.id,
      seriesId: isEpisode ? activeMedia.seriesId : undefined,
      showName: isEpisode ? activeMedia.showName || activeMedia.name : undefined,
      episodeTitle: isEpisode ? activeMedia.episodeTitle || activeMedia.name : undefined,
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

  function detectStreamTags(text: string) {
    const tags = new Set<string>();
    if (/\b(hdr|hdr10|hdr10\+|hlg)\b/i.test(text)) tags.add("HDR");
    if (/\b(dv|dovi|dolby[ .-]?vision)\b/i.test(text)) tags.add("DV");
    if (/\bweb([ .-]?(dl|rip))?\b/i.test(text)) tags.add("WEB");
    return tags;
  }

  const formatVideoSize = (sizeInBytes?: number) =>
    typeof sizeInBytes === "number" ? `${(sizeInBytes / 1024 ** 3).toFixed(2)} GB` : null;

  return (
    <div className="flex flex-col gap-2 mb-6 w-full">
      {(selectableAddonTargets.length > 0 || isAddonLoading) && (
        <div className="mb-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2 flex-wrap">
              <InputGroup className="max-w-sm">
                <InputGroupInput
                  value={streamSearchQuery}
                  onChange={(event) => setStreamSearchQuery(event.target.value)}
                  aria-label="Search stream results"
                  placeholder="Find the least broken stream..."
                />
                <InputGroupAddon align="inline-end">
                  <Search className="h-4 w-4" />
                </InputGroupAddon>
              </InputGroup>
              {selectableAddonTargets.length > 0 && (
                <Select value={selectedAddonId} onValueChange={setSelectedAddonId}>
                  <SelectTrigger className="h-9 gap-1.5">
                    <Puzzle className="h-3 w-3" />
                    <SelectValue>{selectedAddonName}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {selectableAddonTargets.map((addon) => (
                      <SelectItem key={addon.id} value={addon.id}>
                        {addon.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <ToggleGroup
                type="multiple"
                variant="outline"
                size="default"
                value={selectedResolutions}
                onValueChange={setSelectedResolutions}
                className="flex-wrap"
                aria-label="Filter by resolution"
              >
                {RESOLUTION_FILTERS.map((resolution) => (
                  <ToggleGroupItem
                    key={resolution}
                    value={resolution}
                    aria-label={`Filter by ${resolution}`}
                    className="font-mono"
                  >
                    {resolution}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <ToggleGroup
                type="multiple"
                variant="outline"
                size="default"
                value={selectedStreamTags}
                onValueChange={setSelectedStreamTags}
                className="flex-wrap"
                aria-label="Filter by stream tags"
              >
                {STREAM_TAG_FILTERS.map((tag) => (
                  <ToggleGroupItem
                    key={tag}
                    value={tag}
                    aria-label={`Filter by ${tag}`}
                    className="font-mono"
                  >
                    {tag}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              {hasActiveFilters && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Clear filters"
                      onClick={() => {
                        setSelectedResolutions([]);
                        setSelectedStreamTags([]);
                      }}
                    >
                      <FilterX className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent sideOffset={6}>
                    Clear filters
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            {isAddonLoading && (
              <div className="mr-4 inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm backdrop-blur-sm">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>
                  {pendingAddons} addon{pendingAddons === 1 ? "" : "s"} loading
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {filteredStreams.length > 0 && (
        <div className="-ml-3 -mt-3">
          <ScrollArea className="w-full h-[22rem] rounded-xl">
            <div className="p-3 space-y-2">
              {filteredStreams.map((stream, index) => {
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
              {filteredStreams.length} stream{filteredStreams.length === 1 ? "" : "s"} found
            </span>
          </div>
        </div>
      )}

      {loading && filteredStreams.length === 0 && (
        <div className="-ml-3 -mt-3">
          <ScrollArea className="w-full h-[22rem] rounded-xl">
            <div className="p-3 space-y-2">
              {[1, 2, 3, 4, 5, 6].map((item) => (
                <div
                  key={item}
                  className="rounded-lg border border-border/60 bg-card/50 p-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <Skeleton className="h-6 w-56 rounded-md" />
                      <Skeleton className="mt-2 h-3 w-72 rounded-md" />
                    </div>
                    <div className="flex shrink-0 self-center items-center gap-2">
                      <Skeleton className="h-9 w-[74px] rounded-md" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {!loading && hasCheckedStreams && filteredStreams.length === 0 && (
        <Empty className="border border-border/60 bg-card/30 py-10">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchX className="size-5" />
            </EmptyMedia>
            <EmptyTitle>
              {normalizedSearchQuery || hasActiveFilters
                ? "Your filters were a little too powerful"
                : selectedAddonId === "all"
                ? "No streams crawled out of hiding"
                : "This addon is stream-empty right now"}
            </EmptyTitle>
            <EmptyDescription>
              {normalizedSearchQuery || hasActiveFilters
                ? "Loosen the search/filters a bit and you should find the least broken stream."
                : selectedAddonId === "all"
                ? "Try again in a minute, or switch addons and hunt for a less cursed source."
                : "Pick another addon, or clear filters and let chaos do the sorting."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}
