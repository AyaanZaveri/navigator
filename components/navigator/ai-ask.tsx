"use client";

import { useChat } from "@ai-sdk/react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAtom } from "jotai";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { DefaultChatTransport } from "ai";
import { useMediaPlayer } from "@/contexts/MediaPlayerContext";
import { useTheme } from "next-themes";
import { isAIAskOpenAtom } from "@/lib/atoms";
import { useSettings } from "@/contexts/settings-context";
import type { NavigateMediaTool, PlayMediaTool } from "@/app/tools/media";
import type { SkipToSubtitleContent } from "@/app/tools/subtitles";
import type { ThemeToggle } from "@/app/tools/theme";
import { NavigatorFocus } from "./focus";

const AIAsk = () => {
  const [isAskOpen, setIsAskOpen] = useAtom(isAIAskOpenAtom);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [input, setInput] = useState("");
  const [requestDurationsMs, setRequestDurationsMs] = useState<
    Record<string, number>
  >({});
  const handledToolOutputsRef = useRef<Set<string>>(new Set());
  const taskStartTimeRef = useRef<number | null>(null);
  const activeTaskUserMessageIdRef = useRef<string | null>(null);
  const awaitingTaskUserMessageRef = useRef(false);
  const messagesRef = useRef<any[]>([]);
  const opencodeSessionIdRef = useRef<string | null>(null);
  const {
    aiProvider,
    openaiBaseUrl,
    openaiModel,
    geminiModel,
    ollamaBaseUrl,
    ollamaModel,
    groqModel,
    openrouterModel,
    openrouterReasoningEffort,
    cerebrasModel,
    cerebrasReasoningEffort,
    opencodeModel,
    openaiApiKey,
    googleApiKey,
    groqApiKey,
    openrouterApiKey,
    cerebrasApiKey,
    opencodeApiKey,
  } = useSettings();

  const getStableMessageId = (message: any, fallbackIndex: number) =>
    String(
      message?.id ||
        message?.message?.id ||
        `${message?.role || "msg"}-${fallbackIndex}`,
    );

  const finalizeRequestDuration = () => {
    if (taskStartTimeRef.current == null) return;

    const durationMs = Math.max(0, Date.now() - taskStartTimeRef.current);
    setRequestDurationsMs((prev) => {
      let userMessageId = activeTaskUserMessageIdRef.current;

      if (!userMessageId) {
        for (let i = messagesRef.current.length - 1; i >= 0; i -= 1) {
          const message = messagesRef.current[i];
          if (message?.role !== "user") continue;
          const candidateId = getStableMessageId(message, i);
          if (prev[candidateId] == null) {
            userMessageId = candidateId;
            break;
          }
        }
      }

      if (!userMessageId) return prev;
      return {
        ...prev,
        [userMessageId]: durationMs,
      };
    });

    taskStartTimeRef.current = null;
  };

  // Function to handle opening AI Ask, with fullscreen exit if needed
  const handleOpenAsk = async () => {
    if (isFullscreen) {
      // Exit fullscreen first
      try {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        } else if ((document as any).mozCancelFullScreen) {
          await (document as any).mozCancelFullScreen();
        } else if ((document as any).msExitFullscreen) {
          await (document as any).msExitFullscreen();
        }
        // Wait a bit for fullscreen to exit, then open AI Ask
        setTimeout(() => {
          setIsAskOpen(true);
        }, 100);
      } catch (error) {
        console.warn("Failed to exit fullscreen:", error);
        // Still try to open AI Ask even if fullscreen exit fails
        setIsAskOpen(true);
      }
    } else {
      setIsAskOpen(!isAskOpen);
    }
  };

  const router = useRouter();
  const { setTheme, theme } = useTheme();

  // Track fullscreen state
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);

    // Set initial state
    setIsFullscreen(!!document.fullscreenElement);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener(
        "webkitfullscreenchange",
        handleFullscreenChange,
      );
      document.removeEventListener(
        "mozfullscreenchange",
        handleFullscreenChange,
      );
      document.removeEventListener(
        "MSFullscreenChange",
        handleFullscreenChange,
      );
    };
  }, []);

  const {
    playMedia,
    isPlayerVisible,
    skipToTimestamp,
    currentMediaWithSource,
    currentTimestamp,
  } = useMediaPlayer();

  const {
    messages,
    sendMessage,
    stop,
    status,
    error: askError,
    setMessages,
    clearError,
  } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
    }),
    onToolCall: ({ toolCall }) => {
      console.log("🔧 Tool call received:", toolCall);
    },
    onFinish: () => {
      finalizeRequestDuration();
      activeTaskUserMessageIdRef.current = null;
      awaitingTaskUserMessageRef.current = false;
    },
    onError: () => {
      finalizeRequestDuration();
      activeTaskUserMessageIdRef.current = null;
      awaitingTaskUserMessageRef.current = false;
    },
  });

  const finalizeToolAction = () => {
    finalizeRequestDuration();
    stop();
  };

  const navigateToMedia = (toolPart: NavigateMediaTool) => {
    if (toolPart.success && toolPart.action === "navigate" && toolPart.url) {
      finalizeToolAction();
      router.push(toolPart.url);
      setIsAskOpen(false);
    }
  };

  const handlePlayMedia = (toolPart: PlayMediaTool) => {
    if (
      toolPart.success &&
      toolPart.action === "play" &&
      toolPart.mediaId &&
      toolPart.mediaName &&
      toolPart.mediaType
    ) {
      finalizeToolAction();
      const isEpisode = toolPart.mediaType === "Episode";
      playMedia({
        id:
          isEpisode && toolPart.seriesId ? toolPart.seriesId : toolPart.mediaId,
        name: toolPart.mediaName,
        type: toolPart.mediaType === "Movie" ? "movie" : "series",
        streamUrl: toolPart.streamUrl,
        mediaSourceId:
          toolPart.mediaSourceId || (isEpisode ? toolPart.mediaId : undefined),
        seriesId: toolPart.seriesId,
        showName: toolPart.showName,
        episodeTitle: toolPart.episodeTitle,
        seasonNumber: toolPart.seasonNumber,
        episodeNumber: toolPart.episodeNumber,
        subtitleFilename: toolPart.subtitleFilename,
        subtitleVideoSize: toolPart.subtitleVideoSize,
      });
      setIsAskOpen(false);
    }
  };

  const handleSkipToTimestamp = (toolPart: SkipToSubtitleContent) => {
    if (
      toolPart.success &&
      toolPart.action === "skipTo" &&
      typeof toolPart.timestamp === "number"
    ) {
      finalizeToolAction();
      skipToTimestamp(toolPart.timestamp);
      toast.success(
        `Skipped to ${toolPart.timestampFormatted}: "${toolPart.text}"`,
      );
      // Hide the AI Ask component after successfully skipping
      setIsAskOpen(false);
    } else if (!toolPart.success && toolPart.error) {
      toast.error(toolPart.error);
    }
  };

  const handleThemeToggle = (toolPart: ThemeToggle) => {
    if (toolPart.success && toolPart.action === "setTheme" && toolPart.theme) {
      if (toolPart.theme === "toggle") {
        // Toggle between light and dark (ignore system)
        const currentTheme = theme === "system" ? "light" : theme;
        const newTheme = currentTheme === "light" ? "dark" : "light";
        setTheme(newTheme);
        toast.success(`Theme switched to ${newTheme} mode`);
      } else {
        // Set specific theme
        setTheme(toolPart.theme);
        const themeLabel =
          toolPart.theme === "system"
            ? "system (follows device preference)"
            : `${toolPart.theme} mode`;
        toast.success(`Theme switched to ${themeLabel}`);
      }

      // Don't auto-close for theme changes as they're quick and users might want to keep chatting
    } else if (!toolPart.success) {
      toast.error("Failed to change theme");
    }
  };

  const handleResetChat = () => {
    if (isBusy) return;
    clearError();
    setInput("");
    setMessages([]);
    setRequestDurationsMs({});
    handledToolOutputsRef.current.clear();
    taskStartTimeRef.current = null;
    activeTaskUserMessageIdRef.current = null;
    awaitingTaskUserMessageRef.current = false;
    messagesRef.current = [];
    opencodeSessionIdRef.current = null;
  };

  const isBusy = status === "submitted" || status === "streaming";

  useEffect(() => {
    messagesRef.current = messages as any[];
  }, [messages]);

  useEffect(() => {
    if (!awaitingTaskUserMessageRef.current) return;
    if (activeTaskUserMessageIdRef.current) return;

    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i] as any;
      if (message?.role !== "user") continue;
      const messageId = getStableMessageId(message, i);
      activeTaskUserMessageIdRef.current = messageId;
      awaitingTaskUserMessageRef.current = false;
      break;
    }
  }, [messages]);

  useEffect(() => {
    messages.forEach((message: any) => {
      if (message.role !== "assistant" || !message.parts) return;

      message.parts.forEach((part: any, partIndex: number) => {
        if (part.state !== "output-available" || !part.output) return;

        const stableId =
          part.toolCallId ||
          part.id ||
          `${message.id || "assistant"}:${part.type || "tool"}:${partIndex}`;

        if (handledToolOutputsRef.current.has(stableId)) return;
        handledToolOutputsRef.current.add(stableId);

        switch (part.type) {
          case "tool-navigateToMedia":
          case "tool-navigateToEpisode":
          case "tool-navigateToMediaByQuery":
            navigateToMedia(part.output as NavigateMediaTool);
            break;
          case "tool-playMedia":
            handlePlayMedia(part.output as PlayMediaTool);
            break;
          case "tool-skipToSubtitleContent":
            handleSkipToTimestamp(part.output as SkipToSubtitleContent);
            break;
          case "tool-themeToggle":
            handleThemeToggle(part.output as ThemeToggle);
            break;
        }
      });
    });
  }, [messages]);

  const handleSubmitQuestion = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!input.trim() || isBusy) {
      console.log("No input provided");
      return;
    }

    try {
      const opencodeSessionId =
        opencodeSessionIdRef.current ?? crypto.randomUUID();
      opencodeSessionIdRef.current = opencodeSessionId;
      sendMessage(
        { text: input.trim() },
        {
          body: {
            currentMedia: currentMediaWithSource,
            currentTimestamp,
            aiProvider,
            openaiBaseUrl,
            openaiModel,
            geminiModel,
            ollamaBaseUrl,
            ollamaModel,
            groqModel,
            openrouterModel,
            openrouterReasoningEffort,
            cerebrasModel,
            cerebrasReasoningEffort,
            opencodeModel,
            openaiApiKey,
            googleApiKey,
            groqApiKey,
            openrouterApiKey,
            cerebrasApiKey,
            opencodeApiKey,
            opencodeSessionId,
          },
        },
      );
      setInput("");
      taskStartTimeRef.current = Date.now();
      activeTaskUserMessageIdRef.current = null;
      awaitingTaskUserMessageRef.current = true;
    } catch (error) {
      console.error("Error asking question:", error);
    }
  };

  const handleStopGeneration = () => {
    finalizeRequestDuration();
    stop();
  };

  const responseDurations = useMemo(() => {
    const durations: Record<string, number> = {};
    let userId: string | null = null;
    messages.forEach((message, index) => {
      if (message.role === "user") userId = getStableMessageId(message, index);
      else if (
        message.role === "assistant" &&
        userId &&
        requestDurationsMs[userId] !== undefined
      )
        durations[message.id] = requestDurationsMs[userId] / 1000;
    });
    return durations;
  }, [messages, requestDurationsMs]);

  if (isPlayerVisible && !isAskOpen) return null;

  return (
    <NavigatorFocus
      open={isAskOpen}
      showLauncher={!isPlayerVisible}
      onOpen={handleOpenAsk}
      onOpenChange={setIsAskOpen}
      messages={messages}
      input={input}
      onInputChange={setInput}
      onSubmit={handleSubmitQuestion}
      onStop={handleStopGeneration}
      onNewChat={handleResetChat}
      isBusy={isBusy}
      error={askError}
      responseDurations={responseDurations}
    />
  );
};

export default AIAsk;
