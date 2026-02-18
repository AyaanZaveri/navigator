"use client";

import { useChat } from "@ai-sdk/react";
import { AnimatePresence, motion } from "framer-motion";
import React, { useEffect, useRef, useState } from "react";
import { useAtom } from "jotai";
import { BorderBeam } from "../magicui/border-beam";
import { Button } from "../ui/button";
import {
  ArrowRight,
  Loader2,
  Ship,
  Plus,
  X,
  Search,
  Play,
  Navigation,
  ScanText,
  Layers,
  List,
  Subtitles,
  LoaderPinwheel,
  Palette,
  BookOpen,
  GalleryVerticalEnd,
  Coffee,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Markdown from "react-markdown";
import { toast } from "sonner";
import { Input } from "../ui/input";
import { useRouter } from "next/navigation";
import { DefaultChatTransport, ToolCallPart } from "ai";
import { useMediaPlayer } from "@/contexts/MediaPlayerContext";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Badge } from "../ui/badge";
import { AuroraText } from "@/components/magicui/aurora-text";
import { useTheme } from "next-themes";
import { MediaLinkCard } from "./media-link-card";
import { ThemeToggleCard } from "./theme-toggle-card";
import { SeasonCard } from "./season-card";
import { EpisodeCard } from "./episode-card";
import { MediaDetailsCard } from "./media-details-card";
import { StreamListCard } from "./stream-list-card";
import { NavigationCard } from "./navigation-card";
import { PlayMediaCard } from "./play-media-card";
import { SubtitleSkipCard } from "./subtitle-skip-card";
import { SceneExplainCard } from "./scene-explain-card";
import { MediaAnalysisCard } from "./media-analysis-card";
import { isAIAskOpenAtom } from "@/lib/atoms";
import { TextShimmer } from "../motion-primitives/text-shimmer";
import { useSettings } from "@/contexts/settings-context";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { NavigateMediaTool, PlayMediaTool } from "@/app/tools/media";
import { SkipToSubtitleContent } from "@/app/tools/subtitles";
import { ThemeToggle } from "@/app/tools/theme";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

const AIAsk = () => {
  const [isAskOpen, setIsAskOpen] = useAtom(isAIAskOpenAtom);
  const [currentTool, setCurrentTool] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [input, setInput] = useState("");
  const [isToolHistoryOpen, setIsToolHistoryOpen] = useState(false);
  const [toolDurationsMs, setToolDurationsMs] = useState<Record<string, number>>(
    {}
  );
  const [lastTaskDurationMs, setLastTaskDurationMs] = useState<number | null>(
    null
  );
  const handledToolOutputsRef = useRef<Set<string>>(new Set());
  const toolStartTimesRef = useRef<Record<string, number>>({});
  const taskStartTimeRef = useRef<number | null>(null);
  const {
    aiProvider,
    ollamaBaseUrl,
    ollamaModel,
    groqModel,
    openrouterModel,
    openrouterReasoningEffort,
    googleApiKey,
    groqApiKey,
    openrouterApiKey,
  } = useSettings();

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
        handleFullscreenChange
      );
      document.removeEventListener(
        "mozfullscreenchange",
        handleFullscreenChange
      );
      document.removeEventListener(
        "MSFullscreenChange",
        handleFullscreenChange
      );
    };
  }, []);

  const {
    playMedia,
    skipToTimestamp,
    currentMedia,
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
  } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
    }),
    onToolCall: ({ toolCall }) => {
      console.log("🔧 Tool call received:", toolCall);
      setCurrentTool(toolCall.toolName);
    },
    onFinish: () => {
      setCurrentTool(null);
      if (taskStartTimeRef.current != null) {
        setLastTaskDurationMs(Math.max(0, Date.now() - taskStartTimeRef.current));
        taskStartTimeRef.current = null;
      }
    },
  });

  const finalizeToolAction = () => {
    setCurrentTool(null);
    stop();
  };

  const navigateToMedia = (toolPart: NavigateMediaTool) => {
    if (toolPart.success && toolPart.action === "navigate" && toolPart.url) {
      finalizeToolAction();
      router.push(toolPart.url);
      setTimeout(() => {
        setIsAskOpen(false);
      }, 500);
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
        id: isEpisode && toolPart.seriesId ? toolPart.seriesId : toolPart.mediaId,
        name: toolPart.mediaName,
        type: toolPart.mediaType === "Movie" ? "movie" : "series",
        streamUrl: toolPart.streamUrl,
        mediaSourceId: toolPart.mediaSourceId || (isEpisode ? toolPart.mediaId : undefined),
        seriesId: toolPart.seriesId,
        showName: toolPart.showName,
        episodeTitle: toolPart.episodeTitle,
        seasonNumber: toolPart.seasonNumber,
        episodeNumber: toolPart.episodeNumber,
        subtitleFilename: toolPart.subtitleFilename,
        subtitleVideoSize: toolPart.subtitleVideoSize,
      });
      setTimeout(() => {
        setIsAskOpen(false);
      }, 500);
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
        `Skipped to ${toolPart.timestampFormatted}: "${toolPart.text}"`
      );
      // Hide the AI Ask component after successfully skipping
      setTimeout(() => {
        setIsAskOpen(false);
      }, 500);
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
    setMessages([]);
    setCurrentTool(null);
    setToolDurationsMs({});
    setLastTaskDurationMs(null);
    handledToolOutputsRef.current.clear();
    toolStartTimesRef.current = {};
    taskStartTimeRef.current = null;
  };

  const handleCloseAsk = () => {
    if (status !== "ready") {
      stop();
    }
    setCurrentTool(null);
    setIsAskOpen(false);
  };

  useEffect(() => {
    if (status === "ready") {
      setCurrentTool(null);
    }
  }, [status]);

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

  useEffect(() => {
    setToolDurationsMs((prevDurations) => {
      const nextDurations = { ...prevDurations };
      let hasDurationChange = false;

      messages.forEach((message: any) => {
        const actualMessage = message.message || message;
        if (!actualMessage.parts) return;

        actualMessage.parts.forEach((part: any) => {
          if (
            !part ||
            !(part.type?.startsWith("tool-") || part.type === "dynamic-tool")
          ) {
            return;
          }

          const toolCallId = part.toolCallId || part.id;
          if (typeof toolCallId !== "string" || toolCallId.length === 0) return;

          if (toolStartTimesRef.current[toolCallId] == null) {
            toolStartTimesRef.current[toolCallId] = Date.now();
          }

          if (
            (part.state === "output-available" || part.state === "output-error") &&
            nextDurations[toolCallId] == null
          ) {
            nextDurations[toolCallId] = Math.max(
              0,
              Date.now() - toolStartTimesRef.current[toolCallId]
            );
            hasDurationChange = true;
          }
        });
      });

      return hasDurationChange ? nextDurations : prevDurations;
    });
  }, [messages]);

  // Helper function to get tool badge info
  const getToolBadgeInfo = (toolName: string) => {
    console.log("Current tool:", toolName);

    const toolMap: Record<
      string,
      { icon: React.ComponentType<any>; label: string; color?: string }
    > = {
      thinking: { icon: LoaderPinwheel, label: "Thinking..." },
      weather: { icon: Search, label: "Getting Weather" },
      searchMedia: { icon: Search, label: "Searching Media" },
      navigateToMedia: { icon: Navigation, label: "Navigating" },
      navigateToEpisode: { icon: Navigation, label: "Navigating Episode" },
      findEpisodeByTitle: { icon: Search, label: "Finding Episode" },
      navigateToMediaByQuery: { icon: Navigation, label: "Resolving & Navigating" },
      playMedia: { icon: Play, label: "Playing Media" },
      getMediaStreams: { icon: Search, label: "Finding Streams" },
      getMediaDetails: { icon: Search, label: "Getting Details" },
      getSeasons: { icon: Layers, label: "Getting Seasons" },
      getEpisodes: { icon: List, label: "Getting Episodes" },
      skipToSubtitleContent: { icon: Subtitles, label: "Searching Subtitles" },
      explainScene: { icon: BookOpen, label: "Explaining Scene" },
      analyzeMedia: { icon: ScanText, label: "Analyzing Media" },
      themeToggle: { icon: Palette, label: "Changing Theme" },
    };
    return toolMap[toolName] || { icon: Search, label: "Working..." };
  };

  const renderMessageText = (message: any) => {
    const actualMessage = message.message || message;

    if (actualMessage.parts) {
      const textParts = actualMessage.parts
        .filter((part: any) => part.type === "text" && part.text)
        .map((part: any) => String(part.text).trim())
        .filter(Boolean);

      // In multi-step tool flows, assistant text is often appended per step.
      // Show only the latest step text to avoid stacked interim narration.
      if (textParts.length > 0) {
        return textParts[textParts.length - 1] ?? "";
      }

      // Fallback for tool-only assistant messages (e.g. after immediate navigation).
      const toolTextParts = actualMessage.parts
        .filter(
          (part: any) =>
            part &&
            (part.type?.startsWith("tool-") || part.type === "dynamic-tool") &&
            part.output
        )
        .map((part: any) => {
          const output = part.output as {
            message?: unknown;
            error?: unknown;
          };

          if (
            typeof output.message === "string" &&
            output.message.trim().length > 0
          ) {
            return output.message.trim();
          }

          if (typeof output.error === "string" && output.error.trim().length > 0) {
            return output.error.trim();
          }

          return "";
        })
        .filter(Boolean);

      return toolTextParts[toolTextParts.length - 1] ?? "";
    }
    return actualMessage.content || message.content || "";
  };

  const findToolParts = (message: any) => {
    const actualMessage = message.message || message;
    if (!actualMessage.parts) return [];

    return actualMessage.parts.filter(
      (part: any) =>
        part.type &&
        (part.type.startsWith("tool-") || part.type === "dynamic-tool")
    );
  };

  const getToolName = (part: any): string => {
    if (part.type?.startsWith("tool-")) {
      return part.type.replace("tool-", "");
    }
    return part.toolName || "unknown";
  };

  const getMediaResultsFromToolPart = (part: any): any[] => {
    if (part.state !== "output-available" || !part.output) return [];

    const output = part.output;

    if (
      (part.type === "tool-searchMedia" || part.toolName === "searchMedia") &&
      output.success &&
      output.results
    ) {
      return output.results;
    }

    if (output.episodes) return output.episodes;

    return [];
  };

  // Render the dedicated widget card for a specific tool part.
  // Returns null if no specific widget applies (falls back to generic).
  const renderToolWidget = (part: any, partIndex: number): React.ReactNode => {
    if (part.state !== "output-available" || !part.output) return null;

    const toolName = getToolName(part);
    const output = part.output as any;

    switch (toolName) {
      // --- Streams ---
      case "getMediaStreams":
        return (
          <StreamListCard
            key={`stream-list-${partIndex}`}
            result={output}
            index={partIndex}
          />
        );

      // --- Navigation ---
      case "navigateToMedia":
      case "navigateToEpisode":
      case "navigateToMediaByQuery":
        return (
          <NavigationCard
            key={`nav-${partIndex}`}
            result={output}
            index={partIndex}
          />
        );

      // --- Play ---
      case "playMedia":
        return (
          <PlayMediaCard
            key={`play-${partIndex}`}
            result={output}
            index={partIndex}
          />
        );

      // --- Theme ---
      case "themeToggle":
        return <ThemeToggleCard key={`theme-${partIndex}`} index={partIndex} />;

      // --- Subtitle skip ---
      case "skipToSubtitleContent":
        return (
          <SubtitleSkipCard
            key={`sub-skip-${partIndex}`}
            result={output}
            index={partIndex}
          />
        );

      // --- Scene explain ---
      case "explainScene":
        return (
          <SceneExplainCard
            key={`scene-${partIndex}`}
            result={output}
            index={partIndex}
          />
        );

      // --- Media analysis ---
      case "analyzeMedia":
        return (
          <MediaAnalysisCard
            key={`analysis-${partIndex}`}
            result={output}
            index={partIndex}
          />
        );

      // --- Media details ---
      case "getMediaDetails":
        if (output.success && output.details) {
          return (
            <MediaDetailsCard
              key={`details-${partIndex}`}
              media={{
                id: output.details.id,
                name: output.details.name,
                type:
                  output.details.type === "movie"
                    ? "Movie"
                    : output.details.type === "series"
                      ? "Series"
                      : "Movie",
                year: output.details.year,
                overview: output.details.overview,
                rating: output.details.rating,
                runtime: output.details.runtime,
                genres: output.details.genres,
                cast: output.details.cast,
              }}
              index={partIndex}
            />
          );
        }
        return null;

      // --- Seasons ---
      case "getSeasons":
        if (output.success && output.seasons?.length > 0) {
          return (
            <div key={`seasons-${partIndex}`} className="space-y-1">
              {output.seasons.map((season: any, i: number) => (
                <SeasonCard
                  key={`season-${season.id}-${i}`}
                  season={season}
                  index={i}
                />
              ))}
            </div>
          );
        }
        return null;

      default:
        return null;
    }
  };

  // For tool types not handled by renderToolWidget, extract media list items.
  const extractMediaResults = (toolParts: any[]) => {
    for (let i = toolParts.length - 1; i >= 0; i -= 1) {
      const results = getMediaResultsFromToolPart(toolParts[i]);
      if (results.length > 0) {
        return results;
      }
    }

    return [];
  };

  const getAllToolCalls = () => {
    const allToolCalls: any[] = [];

    messages.forEach((message: any, messageIndex: number) => {
      const toolParts = findToolParts(message);
      toolParts.forEach((part: any, partIndex: number) => {
        allToolCalls.push({
          ...part,
          messageIndex,
          partIndex,
          timestamp: new Date().toISOString(),
        });
      });
    });

    return allToolCalls.reverse();
  };

  const renderMessageContent = (message: any, index: number) => {
    const textContent = renderMessageText(message);
    const toolParts = findToolParts(message);

    // Collect dedicated widget cards from tool parts (latest only per tool type)
    const widgetCards: React.ReactNode[] = [];
    let hasSpecificWidget = false;

    // Render widgets from tool parts – use latest tool step only for each
    for (let i = toolParts.length - 1; i >= 0; i -= 1) {
      const widget = renderToolWidget(toolParts[i], i);
      if (widget) {
        widgetCards.unshift(widget);
        hasSpecificWidget = true;
        break; // Only show the latest tool widget to avoid stacking
      }
    }

    // Fallback: if no specific widget matched, use generic MediaLinkCard list
    const mediaResults = hasSpecificWidget ? [] : extractMediaResults(toolParts);

    if (!textContent && widgetCards.length === 0 && mediaResults.length === 0) {
      return null;
    }

    return (
      <div className="space-y-3 w-full">
        {textContent && <Markdown>{textContent}</Markdown>}

        {widgetCards.length > 0 && (
          <div className="space-y-2">{widgetCards}</div>
        )}

        {mediaResults.length > 0 && (
          <div className="space-y-2">
            {mediaResults.map((item: any, itemIndex: number) => (
              <MediaLinkCard
                key={`media-${item.id || item.Id}-${itemIndex}`}
                item={item}
                className="mb-2"
                index={itemIndex}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  const handleSubmitQuestion = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!input.trim()) {
      console.log("No input provided");
      return;
    }

    try {
      sendMessage(
        { text: input },
        {
          body: {
            currentMedia: currentMediaWithSource,
            currentTimestamp,
            aiProvider,
            ollamaBaseUrl,
            ollamaModel,
            groqModel,
            openrouterModel,
            openrouterReasoningEffort,
            googleApiKey,
            groqApiKey,
            openrouterApiKey,
          },
        }
      );
      taskStartTimeRef.current = Date.now();
      setCurrentTool("thinking");
    } catch (error) {
      console.error("Error asking question:", error);
    }
  };

  return (
    <div
      className={`fixed bottom-4 left-1/2 transform -translate-x-1/2 flex flex-col items-center px-4 w-full max-w-xl ${isAskOpen ? "z-[9999999]" : "z-50"}`}
    >
      <AnimatePresence>
        {isAskOpen && (
          <motion.div
            className="mb-3 w-full"
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <div className="relative bg-card/90 backdrop-blur-[6px] rounded-2xl border shadow-xl shadow-primary/5 p-4 max-h-[80vh]">
              {status !== "ready" && (
                <BorderBeam
                  size={150}
                  duration={4}
                  colorFrom={"var(--color-4)"}
                  colorTo={"var(--color-2)"}
                />
              )}
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium text-sm">Ask Navigator</h4>
                  {currentTool &&
                    (() => {
                      const { icon: ToolIcon, label } =
                        getToolBadgeInfo(currentTool);
                      return (
                        <Badge variant={"secondary"}>
                          <ToolIcon
                            className={cn(
                              "h-3 w-3",
                              currentTool === "thinking" && "animate-spin"
                            )}
                          />
                          <TextShimmer>{label}</TextShimmer>
                        </Badge>
                      );
                    })()}
                </div>
                <div className="flex items-center gap-1">
                  {lastTaskDurationMs != null && status === "ready" && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground"
                          aria-label={`done in ${lastTaskDurationMs} milliseconds`}
                        >
                          <Coffee className="h-3.5 w-3.5" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" sideOffset={6}>
                        {`done in ${lastTaskDurationMs} milliseconds`}
                      </TooltipContent>
                    </Tooltip>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => setIsToolHistoryOpen(true)}
                    title="Tool history"
                    disabled={getAllToolCalls().length === 0}
                  >
                    <GalleryVerticalEnd className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={handleResetChat}
                    title="New chat"
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={handleCloseAsk}
                    title="Close"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {(messages.length > 0 || status !== "ready") && (
                <div
                  className="mb-4 max-h-[60vh] overflow-y-auto space-y-3"
                  id="chat-body"
                >
                  {messages.map((message, index) => {
                    const assistantContent =
                      message.role === "assistant"
                        ? renderMessageContent(message, index)
                        : null;

                    if (message.role === "assistant" && !assistantContent) {
                      return null;
                    }

                    return (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className={cn(
                          "p-3 rounded-lg",
                          message.role === "user"
                            ? "bg-primary/10 text-primary"
                            : "bg-muted/50"
                        )}
                      >
                        {message.role === "assistant" ? (
                          <div className="prose prose-sm text-sm text-foreground dark:prose-invert max-w-none">
                            {assistantContent}
                          </div>
                        ) : (
                          <div className="text-sm font-medium">
                            {renderMessageText(message)}
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              )}

              <form onSubmit={handleSubmitQuestion} className="space-y-3">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder={`Ask something like "play Inception" or "go to Breaking Bad"`}
                      className="rounded-xl bg-background/80 backdrop-blur-md border px-4"
                      disabled={status !== "ready"}
                      autoFocus
                    />
                  </div>
                  <Button
                    type="submit"
                    className="rounded-full px-4 h-10"
                    disabled={status !== "ready" || !input.trim()}
                  >
                    {status !== "ready" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowRight className="h-4 w-4 scale-105" />
                    )}
                  </Button>
                </div>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Sheet open={isToolHistoryOpen} onOpenChange={setIsToolHistoryOpen}>
        <SheetContent
          side="right"
          className="w-[400px] sm:w-[540px] z-[10000000000]"
        >
          <SheetHeader>
            <SheetTitle>Tool History</SheetTitle>
            <SheetDescription>
              List of all tool calls that Navigator made
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 max-h-[calc(100vh-120px)] overflow-y-auto px-4">
            {getAllToolCalls().length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <GalleryVerticalEnd className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No tool calls yet</p>
                <p className="text-sm">
                  Start a conversation to see tool history
                </p>
              </div>
            ) : (
              getAllToolCalls().map((toolCall, index) => (
                <Tool
                  key={`history-tool-${toolCall.messageIndex}-${toolCall.partIndex}-${index}`}
                  defaultOpen={false}
                >
                  <ToolHeader
                    type={
                      toolCall.type?.replace("tool-", "") ||
                      toolCall.toolName ||
                      "Unknown"
                    }
                    state={toolCall.state}
                    completedDurationMs={toolDurationsMs[toolCall.toolCallId]}
                  />
                  <ToolContent>
                    {toolCall.input && <ToolInput input={toolCall.input} />}
                    <ToolOutput
                      output={
                        toolCall.output
                          ? JSON.stringify(toolCall.output, null, 2)
                          : undefined
                      }
                      errorText={toolCall.errorText}
                    />
                  </ToolContent>
                </Tool>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

      <motion.div
        initial={false}
        animate={isAskOpen ? { scale: 1.05 } : { scale: 1 }}
        transition={{ duration: 0.2 }}
        className="flex items-center gap-2 w-full justify-center"
      >
        <Button
          variant="outline"
          className="px-4 py-2 h-auto rounded-full flex items-center gap-2 backdrop-blur-[6px] border dark:bg-background/70 bg-background/90 dark:hover:bg-background/60!"
          onClick={handleOpenAsk}
        >
          <Ship className="h-4 w-4" />
          <span className="text-sm mr-0.5">Ask Navigator</span>
          <KbdGroup>
            <Kbd className="font-sans">⌘</Kbd>
            <span>+</span>
            <Kbd>K</Kbd>
          </KbdGroup>
        </Button>
      </motion.div>
    </div>
  );
};

export default AIAsk;
