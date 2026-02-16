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
  Blend,
  ScanText,
  Film,
  Tv,
  Star,
  User,
  Layers,
  List,
  Subtitles,
  LoaderPinwheel,
  Palette,
  BookOpen,
  GalleryVerticalEnd,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Markdown from "react-markdown";
import { toast } from "sonner";
import { Input } from "../ui/input";
import { useRouter } from "next/navigation";
import { DefaultChatTransport, ToolCallPart } from "ai";
import { useMediaPlayer } from "@/contexts/MediaPlayerContext";
import * as Kbd from "@/components/ui/kbd";
import { Badge } from "../ui/badge";
import { AuroraText } from "@/components/magicui/aurora-text";
import { useTheme } from "next-themes";
import { MediaLinkCard } from "./media-link-card";
import { ThemeToggleCard } from "./theme-toggle-card";
import { PersonCard } from "./person-card";
import { SeasonCard } from "./season-card";
import { EpisodeCard } from "./episode-card";
import { GenreCard } from "./genre-card";
import { MediaDetailsCard } from "./media-details-card";
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

const AIAsk = () => {
  const [isAskOpen, setIsAskOpen] = useAtom(isAIAskOpenAtom);
  const [currentTool, setCurrentTool] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [input, setInput] = useState("");
  const [isToolHistoryOpen, setIsToolHistoryOpen] = useState(false);
  const handledToolOutputsRef = useRef<Set<string>>(new Set());
  const {
    aiProvider,
    ollamaBaseUrl,
    ollamaModel,
    groqModel,
    openrouterModel,
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
      playMedia({
        id: toolPart.mediaId,
        name: toolPart.mediaName,
        type:
          toolPart.mediaType === "Movie"
            ? "movie"
            : toolPart.mediaType === "Series"
            ? "series"
            : "series",
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
    handledToolOutputsRef.current.clear();
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
      getMovies: { icon: Film, label: "Getting Movies" },
      getMoviesByGenre: { icon: Film, label: "Getting Movies by Genre" },
      getTVShows: { icon: Tv, label: "Getting TV Shows" },
      getTVShowsByGenre: { icon: Tv, label: "Getting TV Shows by Genre" },
      continueWatching: { icon: List, label: "Continue Watching" },
      getPeople: { icon: User, label: "Searching People" },
      getPersonDetails: { icon: User, label: "Getting Person Details" },
      getPersonFilmography: { icon: Film, label: "Getting Filmography" },
      getGenres: { icon: Layers, label: "Getting Genres" },
      getMediaDetails: { icon: Search, label: "Getting Details" },
      getSeasons: { icon: Layers, label: "Getting Seasons" },
      getEpisodes: { icon: List, label: "Getting Episodes" },
      getWatchlist: { icon: Star, label: "Getting Watchlist" },
      skipToSubtitleContent: { icon: Subtitles, label: "Searching Subtitles" },
      explainScene: { icon: BookOpen, label: "Explaining Scene" },
      analyzeMedia: { icon: ScanText, label: "Analyzing Media" },
      themeToggle: { icon: Palette, label: "Changing Theme" },
      findSimilarItems: { icon: Blend, label: "Finding Similar" },
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

  const extractMediaResults = (toolParts: any[]) => {
    const results: any[] = [];

    for (const part of toolParts) {
      if (part.state === "output-available" && part.output) {
        const output = part.output;

        if (
          (part.type === "tool-searchMedia" ||
            part.toolName === "searchMedia") &&
          output.success &&
          output.results
        ) {
          results.push(...output.results);
        } else if (output.movies) {
          results.push(...output.movies);
        } else if (output.shows) {
          results.push(...output.shows);
        } else if (output.resumeItems) {
          results.push(...output.resumeItems);
        } else if (output.watchlist) {
          results.push(...output.watchlist);
        } else if (output.filmography) {
          results.push(...output.filmography);
        } else if (output.similarItems) {
          results.push(...output.similarItems);
        } else if (output.episodes) {
          results.push(...output.episodes);
        }
      }
    }

    return results;
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
    const mediaResults = extractMediaResults(toolParts);

    if (!textContent && mediaResults.length === 0) {
      return null;
    }

    return (
      <div className="space-y-3 w-full">
        {textContent && <Markdown>{textContent}</Markdown>}

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
            googleApiKey,
            groqApiKey,
            openrouterApiKey,
          },
        }
      );
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
                  colorFrom={"#AA5CC3"}
                  colorTo={"#00A4DC"}
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
          <Kbd.Root variant="outline" size="sm">
            <Kbd.Key className="font-sans">⌘</Kbd.Key>
            <Kbd.Separator />
            <Kbd.Key>K</Kbd.Key>
          </Kbd.Root>
        </Button>
      </motion.div>
    </div>
  );
};

export default AIAsk;
