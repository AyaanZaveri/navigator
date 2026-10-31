"use client";

import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from "react";
import type { MediaItem, StremioStream } from "@/types/stremio";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import {
  MediaPlayer,
  MediaPlayerControls,
  MediaPlayerControlsOverlay,
  MediaPlayerFullscreen,
  MediaPlayerLoading,
  MediaPlayerPiP,
  MediaPlayerPlay,
  MediaPlayerSeek,
  MediaPlayerSeekBackward,
  MediaPlayerSeekForward,
  MediaPlayerTime,
  MediaPlayerVideo,
  MediaPlayerVolume,
  MediaPlayerSettings,
  MediaPlayerTooltip,
} from "@/components/ui/media-player";
import MuxVideo from "@mux/mux-video-react";
import { desktopBridge } from "@/lib/desktop/bridge";
import { MpvVideo } from "@/components/desktop/mpv-video";
import { DesktopTracks } from "@/components/desktop/tracks";
import type { MpvElementHandle } from "@/lib/desktop/mpv-element";
import { ArrowLeft, RotateCcw, RotateCw, Users, Ship } from "lucide-react";
import { useMediaPlayer } from "@/contexts/MediaPlayerContext";
import {
  fetchMediaDetails,
  fetchStreams,
  reportPlaybackStart,
  reportPlaybackProgress,
  reportPlaybackStopped,
} from "@/app/actions";
import { fetchSubtitleFileContent } from "@/app/actions/subtitles";
import { getSubtitleTracks } from "@/app/actions/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useSettings } from "@/contexts/settings-context";

interface GlobalMediaPlayerProps {
  onToggleAIAsk?: () => void;
}

const PROGRESS_REPORT_INTERVAL_MS = 30_000;

export function GlobalMediaPlayer({ onToggleAIAsk }: GlobalMediaPlayerProps) {
  const {
    isPlayerVisible,
    setIsPlayerVisible,
    currentMedia,
    skipTimestamp,
    setCurrentMediaWithSource,
    setCurrentTimestamp,
  } = useMediaPlayer();
  const { videoBitrate } = useSettings();

  const [nativePlayback, setNativePlayback] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [playerAttempt, setPlayerAttempt] = useState(0);
  const [requestHeaders, setRequestHeaders] = useState<Record<string, string>>({});
  useEffect(() => { setNativePlayback(!!desktopBridge()); }, []);
  useLayoutEffect(() => {
    if (!nativePlayback || !isPlayerVisible || !currentMedia) return;
    document.documentElement.dataset.nativePlaying = "";
    return () => { delete document.documentElement.dataset.nativePlaying; };
  }, [nativePlayback, isPlayerVisible, currentMedia]);

  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [mediaDetails, setMediaDetails] = useState<MediaItem | null>(null);
  const [subtitleTracks, setSubtitleTracks] = useState<
    Array<{
      kind: string;
      label: string;
      language: string;
      src: string;
      default?: boolean;
      active: boolean;
    }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [fetchingSubtitles, setFetchingSubtitles] = useState(false);

  const [currentSubtitle, setCurrentSubtitle] = useState<{
    text: string;
    positionTop: boolean;
  } | null>(null);
  const [subtitleData, setSubtitleData] = useState<
    Array<{
      timestamp: number;
      endTimestamp?: number;
      timestampFormatted: string;
      text: string;
    }>
  >([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const loadGenerationRef = useRef(0);
  const lastProgressReportAtRef = useRef(0);
  const playbackStartedReportedRef = useRef(false);
  const playbackStoppedReportedRef = useRef(false);
  const lastLoadedPlaybackKeyRef = useRef<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const playbackKey = currentMedia
    ? [
        currentMedia.type,
        currentMedia.seriesId || currentMedia.id,
        currentMedia.mediaSourceId || currentMedia.id,
        currentMedia.streamUrl || "",
        videoBitrate,
      ].join("::")
    : null;

  // Helper function to format time to HH:MM AM/PM
  const formatEndTime = (currentSeconds: number, durationSeconds: number) => {
    const remainingSeconds = durationSeconds - currentSeconds;
    const endTime = new Date(Date.now() + remainingSeconds * 1000);
    return endTime.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const formatRuntime = (runtimeStr?: string) => {
    if (!runtimeStr) return null;
    return runtimeStr;
  };

  const buildPlaybackPayload = useCallback(
    (overrides?: {
      currentTimeSeconds?: number;
      durationSeconds?: number;
      ended?: boolean;
    }) => {
      if (!currentMedia) return null;

      const mediaType: "movie" | "series" | null =
        currentMedia.type === "series" || currentMedia.seriesId
          ? "series"
          : currentMedia.type === "movie"
            ? "movie"
            : null;
      if (!mediaType) return null;

      const currentTimeSeconds =
        typeof overrides?.currentTimeSeconds === "number"
          ? overrides.currentTimeSeconds
          : videoRef.current?.currentTime ?? currentTime;
      const durationSeconds =
        typeof overrides?.durationSeconds === "number"
          ? overrides.durationSeconds
          : Number.isFinite(videoRef.current?.duration)
            ? (videoRef.current?.duration as number)
            : duration;

      return {
        libraryItemId: currentMedia.seriesId || currentMedia.id,
        videoId: currentMedia.mediaSourceId || currentMedia.id,
        mediaType,
        mediaName: currentMedia.showName || mediaDetails?.name || currentMedia.name,
        poster: mediaDetails?.poster || currentMedia.backdropUrl,
        currentTimeSeconds: Number.isFinite(currentTimeSeconds)
          ? currentTimeSeconds
          : 0,
        durationSeconds:
          typeof durationSeconds === "number" && Number.isFinite(durationSeconds)
            ? durationSeconds
            : undefined,
        ended: overrides?.ended ?? false,
      };
    },
    [currentMedia, currentTime, duration, mediaDetails?.name, mediaDetails?.poster]
  );

  const sendPlaybackUpdate = useCallback(
    (
      kind: "start" | "progress" | "stopped",
      overrides?: {
        currentTimeSeconds?: number;
        durationSeconds?: number;
        ended?: boolean;
      }
    ) => {
      const payload = buildPlaybackPayload(overrides);
      if (!payload) return;

      if (kind === "start") {
        if (playbackStartedReportedRef.current) return;
        playbackStartedReportedRef.current = true;
        playbackStoppedReportedRef.current = false;
        void reportPlaybackStart(payload);
        return;
      }

      if (kind === "stopped") {
        if (playbackStoppedReportedRef.current) return;
        playbackStoppedReportedRef.current = true;
        void reportPlaybackStopped(payload);
        return;
      }

      void reportPlaybackProgress(payload);
    },
    [buildPlaybackPayload]
  );

  const handleVideoPause = useCallback(() => {
    sendPlaybackUpdate("progress");
  }, [sendPlaybackUpdate]);

  const handleVideoCanPlay = useCallback(() => {
    setVideoReady(true);
  }, []);

  const maybeReportPeriodicProgress = useCallback(
    (timeSeconds: number, durationSeconds?: number) => {
      const now = Date.now();
      if (now - lastProgressReportAtRef.current < PROGRESS_REPORT_INTERVAL_MS) {
        return;
      }
      lastProgressReportAtRef.current = now;
      sendPlaybackUpdate("progress", {
        currentTimeSeconds: timeSeconds,
        durationSeconds,
      });
    },
    [sendPlaybackUpdate]
  );

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      const time = videoRef.current.currentTime;
      setCurrentTime(time);
      setCurrentTimestamp(time);

      maybeReportPeriodicProgress(time, videoRef.current.duration);
    }
  }, [maybeReportPeriodicProgress, setCurrentTimestamp]);

  const handleDurationChange = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  }, []);

  const handleVideoLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      const mediaElement = videoRef.current;
      const mediaDuration = mediaElement.duration;
      setDuration(mediaDuration);
      let effectiveStartTime = mediaElement.currentTime || 0;

      const requestedResume = currentMedia?.resumePositionTicks;
      if (
        typeof requestedResume === "number" &&
        Number.isFinite(requestedResume) &&
        requestedResume > 0
      ) {
        const maxSeekTime =
          Number.isFinite(mediaDuration) && mediaDuration > 1
            ? mediaDuration - 1
            : requestedResume;
        const resumeTime = Math.max(0, Math.min(requestedResume, maxSeekTime));
        mediaElement.currentTime = resumeTime;
        setCurrentTime(resumeTime);
        setCurrentTimestamp(resumeTime);
        effectiveStartTime = resumeTime;
      }

      sendPlaybackUpdate("start", {
        currentTimeSeconds: effectiveStartTime,
        durationSeconds: mediaDuration,
      });
      mediaElement.play().catch(() => {});
    }
  }, [currentMedia?.resumePositionTicks, sendPlaybackUpdate, setCurrentTimestamp]);

  const handleClose = useCallback((options?: { ended?: boolean }) => {
    loadGenerationRef.current++;
    sendPlaybackUpdate("stopped", { ended: options?.ended });
    setIsPlayerVisible(false);
    setStreamUrl(null);
    setMediaDetails(null);
    setSubtitleTracks([]);
    setCurrentTime(0);
    setDuration(0);
    setFetchingSubtitles(false);
    setCurrentMediaWithSource(null);
    setVideoReady(false);
    setPlaybackError(null);
    lastLoadedPlaybackKeyRef.current = null;
  }, [sendPlaybackUpdate, setCurrentMediaWithSource, setIsPlayerVisible]);

  const handleVideoEnded = useCallback(() => {
    handleClose({ ended: true });
  }, [handleClose]);

  // Process subtitle text for HTML rendering
  const processSubtitleText = useCallback((text: string) => {
    const shouldPositionTop = /\{\\an8\}/.test(text);
    let processedText = text.replace(/\{\\an\d+\}/g, "");
    processedText = processedText.replace(/\n/g, "<br>");
    return { text: processedText, positionTop: shouldPositionTop };
  }, []);

  const parseSubtitleTimestamp = useCallback((value: string) => {
    const normalized = value.trim().replace(",", ".");
    const parts = normalized.split(":");
    if (parts.length < 2 || parts.length > 3) return null;

    const secondsPart = Number(parts[parts.length - 1]);
    const minutesPart = Number(parts[parts.length - 2]);
    const hoursPart = parts.length === 3 ? Number(parts[0]) : 0;
    if (
      !Number.isFinite(secondsPart) ||
      !Number.isFinite(minutesPart) ||
      !Number.isFinite(hoursPart)
    ) {
      return null;
    }

    return hoursPart * 3600 + minutesPart * 60 + secondsPart;
  }, []);

  const parseSubtitleTextContent = useCallback(
    (rawContent: string) => {
      const normalized = rawContent.replace(/^\uFEFF/, "").replace(/\r/g, "");
      const blocks = normalized
        .split(/\n{2,}/)
        .map((block) => block.trim())
        .filter(Boolean);

      const parsed: Array<{
        timestamp: number;
        endTimestamp?: number;
        timestampFormatted: string;
        text: string;
      }> = [];

      for (const block of blocks) {
        const lines = block.split("\n").map((line) => line.trimEnd());
        if (lines.length < 2) continue;

        const timingIndex = lines.findIndex((line) => line.includes("-->"));
        if (timingIndex === -1) continue;

        const timing = lines[timingIndex];
        const textLines = lines.slice(timingIndex + 1).filter(Boolean);
        if (textLines.length === 0) continue;

        const [startRaw, endRaw] = timing.split("-->").map((part) => part.trim());
        if (!startRaw || !endRaw) continue;

        const start = parseSubtitleTimestamp(startRaw);
        const end = parseSubtitleTimestamp(endRaw.split(" ")[0] || endRaw);
        if (start === null) continue;

        parsed.push({
          timestamp: start,
          endTimestamp: end ?? undefined,
          timestampFormatted: startRaw,
          text: textLines.join("\n"),
        });
      }

      return parsed;
    },
    [parseSubtitleTimestamp]
  );

  // Find current subtitle
  const findCurrentSubtitle = useCallback(
    (currentTimeSeconds: number) => {
      if (subtitleData.length === 0) return null;

      let currentSub = null;
      for (let i = 0; i < subtitleData.length; i++) {
        const subtitle = subtitleData[i];
        if (subtitle.timestamp <= currentTimeSeconds) {
          currentSub = subtitle;
        } else {
          break;
        }
      }

      const withinSubtitleWindow =
        currentSub &&
        (typeof currentSub.endTimestamp === "number"
          ? currentTimeSeconds <= currentSub.endTimestamp
          : currentTimeSeconds - currentSub.timestamp <= 5);

      if (currentSub && withinSubtitleWindow) {
        return processSubtitleText(currentSub.text);
      }
      return null;
    },
    [subtitleData, processSubtitleText]
  );

  const loadMedia = useCallback(async (media: NonNullable<typeof currentMedia>) => {
    const generation = ++loadGenerationRef.current;
    setLoading(true);
    setPlaybackError(null);
    setStreamUrl(null);
    setRequestHeaders(media.requestHeaders ?? {});
    try {
      const metadataId = media.seriesId || media.id;
      const streamSourceId = media.mediaSourceId || media.id;
      let subtitleFilename = media.subtitleFilename;
      let subtitleVideoSize = media.subtitleVideoSize;

      // Fetch media details
      const details = await fetchMediaDetails(metadataId, media.type);
      if (generation !== loadGenerationRef.current) return;
      setMediaDetails(details || null);

      // If a direct stream URL was passed (e.g., from MediaActions), use it
      if (media.streamUrl) {
        setStreamUrl(media.streamUrl);
      } else {
        // Fetch available streams and use the first one
        const streams = await fetchStreams(
          streamSourceId,
          media.type
        );
        if (generation !== loadGenerationRef.current) return;

        if (streams.length > 0) {
          const stream = streams[0];
          setRequestHeaders(stream.behaviorHints?.proxyHeaders?.request ?? {});
          const url = stream.url || stream.externalUrl || null;
          setStreamUrl(url);
          subtitleFilename = subtitleFilename || stream.behaviorHints?.filename;
          subtitleVideoSize =
            subtitleVideoSize || stream.behaviorHints?.videoSize;
        } else {
          setPlaybackError("No playable streams were returned for this title.");
        }
      }

      // Update media context
      setCurrentMediaWithSource({
        id: metadataId,
        name: media.name,
        type: media.type,
        streamUrl: media.streamUrl,
        mediaSourceId: streamSourceId,
        seriesId: media.seriesId,
        showName: media.showName,
        episodeTitle: media.episodeTitle,
        seasonNumber: media.seasonNumber,
        episodeNumber: media.episodeNumber,
        backdropUrl:
          media.backdropUrl ||
          details?.background ||
          details?.poster,
        subtitleFilename,
        subtitleVideoSize,
      });

      // Fetch subtitle tracks
      try {
        const tracks = await getSubtitleTracks(
          streamSourceId,
          media.type,
          {
            filename: subtitleFilename,
            videoSize: subtitleVideoSize,
          }
        );
        if (generation !== loadGenerationRef.current) return;
        const tracksWithActiveState = tracks.map((track) => ({
          ...track,
          active: false,
        }));
        setSubtitleTracks(tracksWithActiveState);
      } catch {
        if (generation !== loadGenerationRef.current) return;
        setSubtitleTracks([]);
      }

      setSubtitleData([]);
      setCurrentSubtitle(null);
    } catch (error) {
      if (generation !== loadGenerationRef.current) return;
      console.error("Failed to load media:", error);
      setPlaybackError("Could not load this title. Try again.");
    } finally {
      if (generation === loadGenerationRef.current) setLoading(false);
    }
  }, [setCurrentMediaWithSource]);

  useEffect(() => {
    if (!currentMedia || !isPlayerVisible || !playbackKey) return;
    if (lastLoadedPlaybackKeyRef.current === playbackKey) return;

    lastLoadedPlaybackKeyRef.current = playbackKey;
    playbackStartedReportedRef.current = false;
    playbackStoppedReportedRef.current = false;
    lastProgressReportAtRef.current = 0;
    setVideoReady(false);
    void loadMedia(currentMedia);
  }, [currentMedia, isPlayerVisible, playbackKey, loadMedia]);

  // Update current subtitle
  useEffect(() => {
    const subtitle = findCurrentSubtitle(currentTime);
    setCurrentSubtitle(subtitle);
  }, [currentTime, findCurrentSubtitle]);

  // Handle skip timestamp
  useEffect(() => {
    if (skipTimestamp === null) return;

    if (videoRef.current) {
      videoRef.current.currentTime = skipTimestamp;
      setCurrentTime(skipTimestamp);
    }
  }, [skipTimestamp]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      loadGenerationRef.current++;
      lastLoadedPlaybackKeyRef.current = null;
    };
  }, []);

  if (!isPlayerVisible || !currentMedia) return null;

  const isEpisodePlayback =
    currentMedia.type === "series" &&
    ((typeof currentMedia.seasonNumber === "number" &&
      typeof currentMedia.episodeNumber === "number") ||
      !!currentMedia.mediaSourceId);
  const episodeTitle = currentMedia.episodeTitle || currentMedia.name;
  const showTitle = currentMedia.showName || mediaDetails?.name;
  const primaryTitle = isEpisodePlayback
    ? episodeTitle
    : mediaDetails?.name || currentMedia.name;
  const fallbackBackdrop =
    currentMedia.backdropUrl || mediaDetails?.background || mediaDetails?.poster;
  const loadingLogo = mediaDetails?.logo;

  const Video = nativePlayback ? MpvVideo : MuxVideo;
  return (
    <div data-native-player-shell={nativePlayback ? "" : undefined} className="fixed inset-0 z-[999999] flex items-center justify-center w-screen bg-black">
      <MediaPlayer
        autoHide
        onEnded={handleVideoEnded}
        onMediaError={(error) => {
          console.warn("Media player error caught:", error);
          if (error) setPlaybackError(error.message || "This stream could not be played.");
        }}
        className="w-screen"
        customSubtitleTracks={subtitleTracks}
        customSubtitlesEnabled={subtitleTracks.length > 0}
        chapters={[]}
        onCustomSubtitleChange={(subtitleTrack) => {
          if (!subtitleTrack) {
            if (nativePlayback) {
              (videoRef.current as unknown as MpvElementHandle | null)?.controller?.selectTrack("subtitle", "no");
            }
            setSubtitleData([]);
            setCurrentSubtitle(null);
            setSubtitleTracks((prev) =>
              prev.map((track) => ({ ...track, active: false }))
            );
            return;
          }

          if (nativePlayback) {
            (videoRef.current as unknown as MpvElementHandle | null)?.controller?.selectTrack("subtitle", "no");
          }
          const trackIndex = subtitleTracks.findIndex(
            (track) => track.label === subtitleTrack.label
          );
          if (trackIndex !== -1) {
            setFetchingSubtitles(true);
            fetchSubtitleFileContent(subtitleTrack.src).then((result) => {
              setFetchingSubtitles(false);
              if (!result.success) {
                setSubtitleData([]);
                setCurrentSubtitle(null);
                return;
              }

              const parsedSubtitles = parseSubtitleTextContent(result.content);
              setSubtitleData(parsedSubtitles);
              setCurrentSubtitle(null);
              setSubtitleTracks((prev) =>
                prev.map((track, idx) => ({
                  ...track,
                  active: idx === trackIndex,
                }))
              );
            });
          }
        }}
      >
        {/* Video element */}
        {streamUrl && (
          <MediaPlayerVideo asChild>
            <Video
              key={`${streamUrl}:${playerAttempt}`}
              // @ts-ignore
              ref={videoRef}
              src={streamUrl}
              {...(nativePlayback ? { requestHeaders } : {})}
              crossOrigin=""
              playsInline
              preload="auto"
              autoPlay
              className="h-screen bg-black w-screen"
              onPause={handleVideoPause}
              onEnded={handleVideoEnded}
              onLoadedMetadata={handleVideoLoadedMetadata}
              onTimeUpdate={handleTimeUpdate}
              onDurationChange={handleDurationChange}
              onCanPlay={handleVideoCanPlay}
              onLoadedData={handleVideoCanPlay}
              onError={(event) => {
                console.warn("Video error caught:", event);
                setPlaybackError(videoRef.current?.error?.message || "This stream could not be played.");
              }}
            />
          </MediaPlayerVideo>
        )}

        {/* Loading overlay */}
        {(loading || !streamUrl || !videoReady || playbackError) && (
          <div className="fixed inset-0 bg-black z-[1000000]">
            <Button
              variant="ghost"
              className="fixed left-4 top-4 z-10 hover:backdrop-blur-md"
              onClick={() => handleClose()}
            >
              <ArrowLeft className="h-4 w-4" />
              Go Back
            </Button>

            {fallbackBackdrop ? (
              <div className="relative w-full h-full">
                <img
                  src={fallbackBackdrop}
                  alt={currentMedia?.name}
                  className="w-full h-full object-cover brightness-75"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              </div>
            ) : (
              <div className="w-full h-full bg-black" />
            )}

            {loadingLogo && (
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="absolute inset-0 z-[2] flex items-center justify-center px-8 pointer-events-none"
              >
                <img
                  src={loadingLogo}
                  alt={`${showTitle || primaryTitle} logo`}
                  className="w-auto max-w-[66vw] md:max-w-[52vw] max-h-[18vh] md:max-h-[22vh] object-contain opacity-85 drop-shadow-[0_10px_28px_rgba(0,0,0,0.85)]"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </motion.div>
            )}

            {/* Title and loading spinner */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="absolute bottom-8 left-8 right-8"
            >
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2, duration: 0.5 }}
                className="flex flex-col w-full gap-1.5 pb-2"
              >
                <div className="flex items-center justify-between w-full">
                  <motion.h2
                    className="text-3xl font-semibold text-white truncate font-poppins"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                  >
                    {primaryTitle}
                  </motion.h2>
                </div>

                {isEpisodePlayback && showTitle && (
                  <motion.p
                    className="text-sm text-white/75 truncate"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                  >
                    {showTitle}
                  </motion.p>
                )}

                <motion.div
                  className="flex items-center gap-3 text-sm text-white/60"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
                >
                  {mediaDetails?.runtime && (
                    <span>{mediaDetails.runtime}</span>
                  )}
                  {mediaDetails?.year && <span>{mediaDetails.year}</span>}
                  {mediaDetails?.imdbRating && (
                    <span>IMDb {mediaDetails.imdbRating}</span>
                  )}
                </motion.div>

                <motion.div
                  className="flex items-center gap-2 mt-2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.7 }}
                >
                  {playbackError ? (
                    <div className="flex flex-col items-start gap-3" role="alert">
                      <p className="text-sm text-white">{playbackError}</p>
                      <Button variant="secondary" onClick={() => {
                        setPlaybackError(null);
                        setVideoReady(false);
                        setPlayerAttempt((attempt) => attempt + 1);
                        if (!streamUrl && currentMedia) void loadMedia(currentMedia);
                      }}>Try again</Button>
                    </div>
                  ) : (
                    <><div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    <span className="text-sm text-white/70">Loading...</span></>
                  )}
                </motion.div>
              </motion.div>
            </motion.div>
          </div>
        )}

        {/* Current subtitle */}
        {currentSubtitle && (
          <div
            className={`fixed left-1/2 transform -translate-x-1/2 z-[100] text-white text-center bg-black/20 px-4 py-2 rounded text-3xl font-medium shadow-xl backdrop-blur-md ${
              currentSubtitle.positionTop ? "top-[15%]" : "bottom-[10%]"
            }`}
            dangerouslySetInnerHTML={{ __html: currentSubtitle.text }}
          />
        )}

        <MediaPlayerControls className="flex-col items-start gap-2.5 px-6 pb-4 z-[9999]">
          <Button
            variant="ghost"
            className="fixed left-4 top-4 z-10 hover:backdrop-blur-md"
            onClick={() => handleClose()}
          >
            <ArrowLeft className="h-4 w-4" />
            Go Back
          </Button>

          {fetchingSubtitles && (
            <div className="fixed right-4 top-16 z-10 bg-black/50 backdrop-blur-sm rounded-md px-3 py-2 text-white text-sm flex items-center gap-2">
              <div className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full"></div>
              Fetching subtitles
            </div>
          )}

          <MediaPlayerControlsOverlay />

          <div className="flex flex-col w-full gap-1.5 pb-2">
            <div className="flex items-center justify-between w-full">
              <h2 className="text-3xl font-semibold text-white truncate font-poppins">
                {primaryTitle}
              </h2>

              {duration > 0 && currentTime >= 0 && (
                <div className="text-sm text-white/70 ml-4 whitespace-nowrap">
                  Ends at {formatEndTime(currentTime, duration)}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 text-sm text-white/60">
              {isEpisodePlayback && (
                <span className="truncate">
                  {showTitle || "TV Show"}
                  {currentMedia.seasonNumber && currentMedia.episodeNumber
                    ? ` • S${currentMedia.seasonNumber}E${currentMedia.episodeNumber}`
                    : ""}
                </span>
              )}
              {mediaDetails?.runtime && (
                <span>{mediaDetails.runtime}</span>
              )}
              {mediaDetails?.year && <span>{mediaDetails.year}</span>}
            </div>
          </div>

          <MediaPlayerSeek />

          <div className="flex w-full items-center gap-2">
            <div className="flex flex-1 items-center gap-2">
              <MediaPlayerPlay />
              <MediaPlayerSeekBackward>
                <RotateCcw />
              </MediaPlayerSeekBackward>
              <MediaPlayerSeekForward>
                <RotateCw />
              </MediaPlayerSeekForward>
              <MediaPlayerVolume expandable />
              <MediaPlayerTime />
            </div>
            <div className="flex items-center gap-2">
              {onToggleAIAsk && (
                <MediaPlayerTooltip tooltip="Navigator" shortcut="Cmd + K">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-white hover:bg-white/20"
                    onClick={onToggleAIAsk}
                  >
                    <Ship className="h-4 w-4" />
                  </Button>
                </MediaPlayerTooltip>
              )}

              {/* Cast popover */}
              {mediaDetails?.cast && mediaDetails.cast.length > 0 && (
                <Popover>
                  <PopoverTrigger asChild>
                    <MediaPlayerTooltip tooltip="Cast">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-white hover:bg-white/20"
                      >
                        <Users className="h-4 w-4" />
                      </Button>
                    </MediaPlayerTooltip>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-80 bg-black/90 border-white/20 text-white z-[1000000]"
                    side="top"
                  >
                    <div className="space-y-3">
                      <h3 className="font-semibold text-lg">Cast</h3>
                      <div className="max-h-64 overflow-y-auto space-y-2">
                        {mediaDetails.cast.map((name, index) => (
                          <div
                            key={`${name}-${index}`}
                            className="flex items-center space-x-3 p-2 rounded hover:bg-white/10"
                          >
                            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-xs flex-shrink-0">
                              {name.charAt(0) || "?"}
                            </div>
                            <p className="font-medium text-sm truncate">
                              {name}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              )}

              {nativePlayback && <DesktopTracks mediaRef={videoRef} sourceKey={`${streamUrl}:${playerAttempt}`} onNativeSubtitle={() => {
                setSubtitleData([]);
                setCurrentSubtitle(null);
                setSubtitleTracks((tracks) => tracks.map((track) => ({ ...track, active: false })));
              }} />}
              <MediaPlayerSettings />
              {!nativePlayback && <MediaPlayerPiP />}
              <MediaPlayerFullscreen />
            </div>
          </div>
        </MediaPlayerControls>
      </MediaPlayer>
    </div>
  );
}
