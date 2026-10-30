"use client";

import type { ComponentType } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Film,
  Layers,
  List,
  Palette,
  Play,
  Radio,
  ScanText,
  Search,
  Subtitles,
  Tv,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "./focus-ui/badge";
import { buildEpisodePath, toEpisodeNavigationPath } from "@/lib/series-route";

// Navigator's tool data in the same compact trace/result presentation as Focus.
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
type Result = {
  key: string;
  title: string;
  image?: string;
  badges?: string[];
  subtitle?: string;
  href?: string;
  icon: Trace["icon"];
};
export type NavigatorSegment =
  | { kind: "text"; key: string; text: string; streaming: boolean }
  | { kind: "trace"; key: string; trace: Trace }
  | { kind: "results"; key: string; results: { rows: Result[] } };

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

function mediaResult(item: RecordValue, index: number): Result {
  const type = text(item.type).toLowerCase();
  const id = text(item.id || item.Id);
  let href: string | undefined;
  if (id) {
    if (type === "episode" || item.episodeNumber !== undefined) {
      href =
        item.seriesId &&
        item.seasonNumber !== undefined &&
        item.episodeNumber !== undefined
          ? buildEpisodePath(
              text(item.seriesId),
              Number(item.seasonNumber),
              Number(item.episodeNumber),
            )
          : toEpisodeNavigationPath(id);
    } else if (type === "movie" || type === "series")
      href = `/${type}/${encodeURIComponent(id)}`;
  }
  const badges = [
    type ? type[0].toUpperCase() + type.slice(1) : "",
    text(item.year || item.releaseInfo),
    item.seasonNumber !== undefined && item.episodeNumber !== undefined
      ? `S${item.seasonNumber} · E${item.episodeNumber}`
      : "",
    item.rating || item.communityRating
      ? `★ ${item.rating || item.communityRating}`
      : "",
  ].filter(Boolean);
  return {
    key: `${id}-${index}`,
    title: text(item.name || item.title) || "Untitled",
    image: text(item.poster || item.thumbnail) || undefined,
    badges,
    href,
    icon: type === "movie" ? Film : Tv,
  };
}

function toolResults(
  name: string,
  output: RecordValue,
  input: RecordValue,
): Result[] {
  if (output.success === false) return [];
  if (Array.isArray(output.results))
    return list(output.results).map(mediaResult);
  if (Array.isArray(output.episodes))
    return list(output.episodes).map((item, index) =>
      mediaResult({ type: "episode", ...item }, index),
    );
  if (output.details) return [mediaResult(record(output.details), 0)];
  if (Array.isArray(output.seasons))
    return list(output.seasons).map((season, index) => {
      const match = text(season.id).match(/^(.*):(\d+)$/);
      const seriesId = text(input.tvShowId) || match?.[1];
      const number = Number(season.seasonNumber ?? match?.[2] ?? 1);
      return {
        key: text(season.id) || String(index),
        title: text(season.name) || `Season ${number}`,
        icon: Layers,
        badges: [
          season.episodeCount ? `${season.episodeCount} episodes` : "",
          text(season.year),
        ].filter(Boolean),
        href: seriesId ? buildEpisodePath(seriesId, number, 1) : undefined,
      };
    });
  if (name === "getMediaStreams")
    return list(output.streams).map((stream, index) => ({
      key: text(stream.streamId) || String(index),
      title:
        text(stream.title || stream.name || stream.filename) ||
        `Stream ${index + 1}`,
      icon: Radio,
      badges: [
        text(stream.resolution),
        text(stream.addonName),
        ...(Array.isArray(stream.tags) ? stream.tags.map(text) : []),
      ].filter(Boolean),
    }));
  return [];
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
    const rows =
      part.state === "output-available" ? toolResults(name, output, input) : [];
    const count = rows.length
      ? ` · ${rows.length} ${rows.length === 1 ? "result" : "results"}`
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
    if (rows.length)
      segments.push({
        kind: "results",
        key: `results-${index}`,
        results: { rows },
      });
    // Tool-only replies still expose their user-facing result, without duplicating assistant text.
    const hasAnswer = parts.some((rawPart) => {
      const p = record(rawPart);
      return p.type === "text" && text(p.text).trim();
    });
    const resultText = text(
      output.explanation || output.analysis || output.answer || output.message,
    );
    if (complete && !failed && !rows.length && resultText && !hasAnswer)
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

export function NavigatorResultRows({
  rows,
  onNavigate,
}: {
  rows: Result[];
  onNavigate?: () => void;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <div className="w-full space-y-1">
      {rows.map((row, index) => {
        const Icon = row.icon;
        const content = (
          <>
            {row.image ? (
              <img
                alt=""
                aria-hidden="true"
                className="size-8 shrink-0 rounded-sm object-cover shadow-xs ring-1 ring-border/50"
                src={row.image}
              />
            ) : (
              <div className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-muted text-muted-foreground">
                <Icon className="size-4" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="flex min-w-0 items-center gap-1 font-medium">
                <span className="truncate">{row.title}</span>
                {row.href && (
                  <ArrowRight
                    aria-hidden="true"
                    className="navigator-result-arrow size-4 shrink-0 text-muted-foreground"
                  />
                )}
              </p>
              {row.badges && row.badges.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {row.badges.map((badge, i) => (
                    <Badge
                      key={`${badge}-${i}`}
                      className="h-5 max-w-full border-border bg-background px-1.5 text-[11px]"
                      variant="outline"
                    >
                      <span className="truncate">{badge}</span>
                    </Badge>
                  ))}
                </div>
              )}
              {row.subtitle && (
                <p className="truncate text-xs text-muted-foreground">
                  {row.subtitle}
                </p>
              )}
            </div>
          </>
        );
        const classes =
          "navigator-result-row group/command-item flex w-full min-w-0 items-center gap-3 rounded-lg px-2 py-2 text-sm outline-hidden transition-transform duration-150 ease-[cubic-bezier(0.2,0,0,1)] hover:bg-muted focus-visible:bg-muted active:scale-[0.995] motion-reduce:transform-none motion-reduce:transition-none";
        return (
          <motion.div
            key={row.key}
            animate={{ opacity: 1, transform: "translateY(0)" }}
            initial={{
              opacity: 0,
              transform: reduceMotion ? "none" : "translateY(10px)",
            }}
            transition={{
              delay: reduceMotion ? 0 : index * 0.05,
              duration: 0.18,
              ease: [0.23, 1, 0.32, 1],
            }}
          >
            {row.href ? (
              <Link
                className={`${classes} cursor-pointer`}
                href={row.href}
                draggable={false}
                onDragStart={(event) => event.preventDefault()}
                onClick={onNavigate}
              >
                {content}
              </Link>
            ) : (
              <div className={classes}>{content}</div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
