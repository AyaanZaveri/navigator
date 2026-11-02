"use client";

import { Children, useId, useState, type ComponentProps, type ComponentType, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { motionTokens } from "@/components/arc/lib/motion-tokens";
import { ResultCardEntranceContext } from "./result-card-motion";
import {
  ArrowUpRight,
  Film,
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
import { PersonCard } from "./person-card";
import { actionToolNames } from "@/lib/navigator-chat";
import { sceneProgressLabel, type SceneProgress } from "@/lib/navigator-scene-progress";
import { Accordion } from "@/components/arc/accordion/accordion";
import { Button } from "@/components/ui/button";

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
  | { kind: "lookup"; key: string; trace: Trace; cards: ReactNode }
  | { kind: "results"; key: string; results: { cards: ReactNode } };

const lookupTools = new Set([
  "searchPeople", "getPersonDetails", "getFilmography", "searchMedia",
  "getMediaDetails", "getSeasons", "getEpisodes", "findEpisodeByTitle",
]);

export function isPlaybackRequest(value: string): boolean {
  return /^(?:(?:please|can you|could you|would you|i want to|i[’']d like to)\s+)*(?:play|watch|put on|start playback)\b/i.test(value.trim());
}

const toolLabels: Record<string, [string, string, Trace["icon"]]> = {
  searchPeople: ["Searching TMDB people", "Found people", Search],
  getPersonDetails: ["Reading person details", "Read person details", BookOpen],
  getFilmography: ["Reading filmography", "Found filmography", Film],
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
  themeToggle: ["Changing theme", "Theme changed", Palette],
};

function toolCards(
  name: string,
  output: RecordValue,
  input: RecordValue,
): ReactNode {
  // Reuse Navigator's original cards, including their navigation and playback behavior.
  switch (name) {
    case "searchPeople":
      return list(output.results).map(person => <PersonCard key={text(person.id)} person={person as ComponentProps<typeof PersonCard>["person"]} />);
    case "getPersonDetails":
      return output.person ? <PersonCard person={output.person as ComponentProps<typeof PersonCard>["person"]} /> : null;
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
              seasonNumber: details.seasonNumber ?? details.season,
              episodeNumber: details.episodeNumber ?? details.episode,
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
              source: item.source || output.source,
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
  options: { playbackRequest?: boolean } = {},
): NavigatorSegment[] {
  const segments: NavigatorSegment[] = [];
  const collapseLookups = options.playbackRequest || parts.some(raw => {
    const part = record(raw);
    return part.type === "tool-playMedia" || (part.type === "dynamic-tool" && part.toolName === "playMedia");
  });
  // Progress belongs before its final playback card, even though the tool input arrived first.
  const ordered = parts.flatMap(raw => {
    const part = record(raw);
    if (part.type === "data-sceneProgress") return [];
    const progress = parts.filter(candidate => record(candidate).type === "data-sceneProgress" && record(record(candidate).data).toolCallId === part.toolCallId);
    return [...progress, raw];
  });
  ordered.forEach((raw, index) => {
    const part = record(raw);
    if (part.type === "data-sceneProgress") {
      const progress = record(part.data) as unknown as SceneProgress;
      if (!["title", "subtitles", "scene"].includes(progress.stage) || !["running", "completed", "error"].includes(progress.state)) return;
      segments.push({ kind: "trace", key: `progress-${text(part.id) || index}`, trace: {
        label: progress.state === "error" ? progress.detail || sceneProgressLabel(progress) : sceneProgressLabel(progress), detail: progress.detail,
        phase: progress.state, icon: progress.stage === "title" ? Search : Subtitles,
      } });
      return;
    }
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
    // Legacy handoff parts are transport details, never a second visible action.
    if (name === "completeAction") return;
    if (actionToolNames.has(name)) {
      const legacyAcknowledgement = parts.map(record).find(candidate => candidate.type === "tool-completeAction"
        && (candidate.state === "output-available" || candidate.state === "output-error")
        && (record(candidate.output).preparedToolCallId || record(candidate.input).preparedToolCallId) === part.toolCallId);
      const result = legacyAcknowledgement ? { ...output, ...record(legacyAcknowledgement.output), execution: "completed",
        ...(legacyAcknowledgement.state === "output-error" ? { success: false, error: legacyAcknowledgement.errorText } : {}),
      } : output;
      const failed = part.state === "output-error" || part.state === "output-denied" || result.success === false;
      if (failed) {
        if (parts.some(candidate => record(candidate).type === "data-sceneProgress" && record(record(candidate).data).toolCallId === part.toolCallId && record(record(candidate).data).state === "error")) return;
        const detail = text(part.errorText || result.error || result.message) || "Unable to complete this action";
        segments.push({ kind: "trace", key: `trace-${index}`, trace: {
          label: detail, detail, phase: "error", icon: toolLabels[name]?.[2] || Search,
        } });
        return;
      }
      if (part.state !== "output-available") return;
      const applied = result.execution === "completed" || !result.preparedToolCallId;
      // Show the existing theme controls only after the browser has applied the change.
      const cards = name !== "themeToggle" || applied ? toolCards(name, result, input) : null;
      if (cards) segments.push({ kind: "results", key: `results-${index}`, results: { cards } });
      const hasAnswer = parts.some(rawPart => record(rawPart).type === "text" && text(record(rawPart).text).trim());
      if (applied && name !== "themeToggle" && result.message && !hasAnswer) {
        segments.push({ kind: "text", key: `action-text-${index}`, text: text(result.message), streaming: false });
      }
      return;
    }
    const failed = part.state === "output-error" || part.state === "output-denied" || output.success === false;
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
    const trace: Trace = {
      label: failed
        ? detail || "Unable to complete this step"
        : part.state === "approval-requested" ? "Awaiting approval"
        : `${complete ? completed : running}${count}`,
      detail: detail || undefined,
      phase: failed ? "error" : complete ? "completed" : "running",
      icon,
    };
    if (collapseLookups && complete && !failed && cards && lookupTools.has(name) && Children.count(cards) > 3) {
      segments.push({ kind: "lookup", key: `lookup-${index}`, trace, cards });
    } else {
      segments.push({ kind: "trace", key: `trace-${index}`, trace });
      if (cards) {
        segments.push({
          kind: "results",
          key: `results-${index}`,
          results: { cards },
        });
      }
    }
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
      className={`flex min-h-10 items-center gap-2 px-2 py-2 text-sm font-medium leading-[1.4] text-muted-foreground ${trace.phase === "error" ? "text-destructive" : ""}`}
      role="status"
      title={trace.detail}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0 stroke-[1.5]" />
      <span className="min-w-0 truncate">{trace.label}</span>
    </p>
  );
}

export function NavigatorLookup({ trace, cards }: { trace: Trace; cards: ReactNode }) {
  const Icon = trace.icon;
  const [open, setOpen] = useState(false);
  return (
    <Accordion
      defaultOpen={-1}
      onOpenChange={index => setOpen(index !== null)}
      size="sm"
      items={[{
        title: trace.label,
        icon: <Icon aria-hidden="true" className="size-4 shrink-0 stroke-[1.5]" />,
        content: <NavigatorResultCards cards={cards} revealed={open} />,
      }]}
    />
  );
}

export function NavigatorResultCards({ cards, revealed = true }: { cards: ReactNode; revealed?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const reduced = useReducedMotion();
  const listId = useId();
  const items = Children.toArray(cards);
  const remaining = items.length - 5;
  const hidden = { opacity: 0, transform: reduced ? "none" : "translateY(4px)" };
  const visible = { opacity: 1, transform: reduced ? "none" : "translateY(0)" };
  return (
    <div className="flex w-full flex-col gap-0.5">
      <div id={listId} className="flex w-full flex-col gap-0.5">
        {(expanded ? items : items.slice(0, 5)).map((card, index) => (
          <motion.div
            key={typeof card === "object" && card !== null && "key" in card ? card.key : index}
            initial={index >= 5 ? hidden : false}
            animate={revealed ? visible : hidden}
            transition={{ duration: 0.15, ease: motionTokens.ease.out }}
          >
            <ResultCardEntranceContext.Provider value={false}>{card}</ResultCardEntranceContext.Provider>
          </motion.div>
        ))}
      </div>
      {remaining > 0 && (
        <div className="flex self-start py-1 pl-2 pr-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={expanded}
            aria-controls={listId}
            className="-ml-3"
            onClick={() => setExpanded(value => !value)}
          >
            {expanded ? "Show fewer results" : `Show ${remaining} more ${remaining === 1 ? "result" : "results"}`}
          </Button>
        </div>
      )}
    </div>
  );
}
