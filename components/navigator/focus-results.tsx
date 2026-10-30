"use client";

import type { ComponentProps, ComponentType, ReactNode } from "react";
import {
  ArrowUpRight,
  BookOpen,
  Layers,
  List,
  Palette,
  Play,
  Radio,
  ScanText,
  Search,
  Subtitles,
} from "lucide-react";
import { MediaLinkCard } from "./media-link-card";
import { MediaDetailsCard } from "./media-details-card";
import { SeasonCard } from "./season-card";
import { StreamListCard } from "./stream-list-card";
import { NavigationCard } from "./navigation-card";
import { PlayMediaCard } from "./play-media-card";
import { ThemeToggleCard } from "./theme-toggle-card";
import { SubtitleSkipCard } from "./subtitle-skip-card";
import { SceneExplainCard } from "./scene-explain-card";
import { MediaAnalysisCard } from "./media-analysis-card";

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue =>
  typeof value === "object" && value !== null ? (value as RecordValue) : {};
const text = (value: unknown) =>
  typeof value === "string"
    ? value
    : typeof value === "number"
      ? String(value)
      : "";
const list = (value: unknown): RecordValue[] =>
  Array.isArray(value) ? value.map(record) : [];

type Trace = {
  label: string;
  detail?: string;
  phase: "running" | "completed" | "error";
  icon: ComponentType<{
    className?: string;
    "aria-hidden"?: boolean | "true" | "false";
  }>;
};
export type NavigatorSegment =
  | { kind: "text"; key: string; text: string; streaming: boolean }
  | { kind: "trace"; key: string; trace: Trace }
  | { kind: "results"; key: string; results: { cards: ReactNode } };

const toolLabels: Record<string, [string, string, Trace["icon"]]> = {
  searchMedia: ["Searching media", "Searched media", Search],
  getMediaDetails: ["Reading title details", "Read title details", Search],
  getSeasons: ["Getting seasons", "Found seasons", Layers],
  getEpisodes: ["Getting episodes", "Found episodes", List],
  findEpisodeByTitle: ["Finding the episode", "Found the episode", Search],
  getMediaStreams: ["Finding streams", "Found streams", Radio],
  navigateToMedia: ["Opening title", "Opened title", ArrowUpRight],
  navigateToEpisode: ["Opening episode", "Opened episode", ArrowUpRight],
  navigateToMediaByQuery: [
    "Finding and opening title",
    "Opened title",
    ArrowUpRight,
  ],
  playMedia: ["Starting playback", "Started playback", Play],
  skipToSubtitleContent: ["Searching subtitles", "Found the moment", Subtitles],
  explainScene: ["Reading scene context", "Read scene context", BookOpen],
  analyzeMedia: ["Analyzing media", "Analyzed media", ScanText],
  themeToggle: ["Changing theme", "Changed theme", Palette],
};

function toolCards(
  name: string,
  output: RecordValue,
  input: RecordValue,
): ReactNode {
  // Reuse Navigator's original cards, including their navigation and playback behavior.
  switch (name) {
    case "getMediaStreams":
      return (
        <StreamListCard
          result={output as ComponentProps<typeof StreamListCard>["result"]}
        />
      );
    case "navigateToMedia":
    case "navigateToEpisode":
    case "navigateToMediaByQuery":
      return (
        <NavigationCard
          result={output as ComponentProps<typeof NavigationCard>["result"]}
        />
      );
    case "playMedia":
      return (
        <PlayMediaCard
          result={output as ComponentProps<typeof PlayMediaCard>["result"]}
        />
      );
    case "themeToggle":
      return output.success ? <ThemeToggleCard /> : null;
    case "skipToSubtitleContent":
      return (
        <SubtitleSkipCard
          result={output as ComponentProps<typeof SubtitleSkipCard>["result"]}
        />
      );
    case "explainScene":
      return (
        <SceneExplainCard
          result={output as ComponentProps<typeof SceneExplainCard>["result"]}
        />
      );
    case "analyzeMedia":
      return (
        <MediaAnalysisCard
          result={output as ComponentProps<typeof MediaAnalysisCard>["result"]}
        />
      );
    case "getMediaDetails": {
      if (!output.success || !output.details) return null;
      const details = record(output.details);
      return (
        <MediaDetailsCard
          media={
            {
              ...details,
              type:
                text(details.type).toLowerCase() === "series"
                  ? "Series"
                  : text(details.type).toLowerCase() === "episode"
                    ? "Episode"
                    : "Movie",
            } as ComponentProps<typeof MediaDetailsCard>["media"]
          }
        />
      );
    }
    case "getSeasons": {
      const seasons = list(output.seasons);
      if (!output.success || !seasons.length) return null;
      return seasons.map((season, index) => (
        <SeasonCard
          key={text(season.id) || index}
          season={season as ComponentProps<typeof SeasonCard>["season"]}
          seriesId={text(input.tvShowId) || undefined}
          index={index}
        />
      ));
    }
    default: {
      if (output.success === false) return null;
      const items = Array.isArray(output.results)
        ? list(output.results)
        : list(output.episodes);
      if (!items.length) return null;
      return items.map((item, index) => (
        <MediaLinkCard
          key={`${text(item.id || item.Id)}-${index}`}
          item={
            {
              ...item,
              id: text(item.id || item.Id),
              ...(Array.isArray(output.episodes) ? { type: "Episode" } : {}),
            } as ComponentProps<typeof MediaLinkCard>["item"]
          }
          index={index}
        />
      ));
    }
  }
}

export function toNavigatorSegments(
  parts: ReadonlyArray<unknown>,
): NavigatorSegment[] {
  const segments: NavigatorSegment[] = [];
  parts.forEach((raw, index) => {
    const part = record(raw);
    if (part.type === "text") {
      if (text(part.text).trim())
        segments.push({
          kind: "text",
          key: `text-${index}`,
          text: text(part.text),
          streaming: part.state === "streaming",
        });
      return;
    }
    if (
      typeof part.type !== "string" ||
      (!part.type.startsWith("tool-") && part.type !== "dynamic-tool")
    )
      return;
    const name =
      part.type === "dynamic-tool" ? text(part.toolName) : part.type.slice(5);
    const output = record(part.output);
    const input = record(part.input);
    const failed = part.state === "output-error" || output.success === false;
    const complete = part.state === "output-available" || failed;
    const [running, completed, icon] = toolLabels[name] ?? [
      "Working",
      "Completed step",
      Search,
    ];
    const cards =
      part.state === "output-available" ? toolCards(name, output, input) : null;
    const resultCount =
      [output.results, output.episodes, output.seasons, output.streams].find(
        Array.isArray,
      )?.length ?? 0;
    const count = resultCount
      ? ` · ${resultCount} ${resultCount === 1 ? "result" : "results"}`
      : "";
    const detail = text(
      part.errorText ||
        output.error ||
        input.query ||
        input.question ||
        output.message,
    );
    segments.push({
      kind: "trace",
      key: `trace-${index}`,
      trace: {
        label: failed
          ? detail || "Unable to complete this step"
          : `${complete ? completed : running}${count}`,
        detail: detail || undefined,
        phase: failed ? "error" : complete ? "completed" : "running",
        icon,
      },
    });
    if (cards)
      segments.push({
        kind: "results",
        key: `results-${index}`,
        results: { cards },
      });
    // Tool-only replies still expose their user-facing result, without duplicating assistant text.
    const hasAnswer = parts.some((rawPart) => {
      const p = record(rawPart);
      return p.type === "text" && text(p.text).trim();
    });
    const resultText = text(
      output.explanation || output.analysis || output.answer || output.message,
    );
    if (complete && !failed && resultText && !hasAnswer)
      segments.push({
        kind: "text",
        key: `tool-text-${index}`,
        text: resultText,
        streaming: false,
      });
  });
  return segments;
}

export function NavigatorTraceRow({ trace }: { trace: Trace }) {
  const Icon = trace.icon;
  return (
    <p
      aria-busy={trace.phase === "running"}
      aria-live={trace.phase === "running" ? "off" : "polite"}
      className={`flex items-center gap-2 px-2 text-sm text-muted-foreground ${trace.phase === "error" ? "text-destructive" : ""}`}
      role="status"
      title={trace.detail}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0 stroke-2" />
      <span className="min-w-0 truncate">{trace.label}</span>
    </p>
  );
}

export function NavigatorResultCards({ cards }: { cards: ReactNode }) {
  return <div className="flex w-full flex-col gap-1">{cards}</div>;
}
