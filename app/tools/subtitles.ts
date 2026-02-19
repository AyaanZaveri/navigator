import { generateObject, generateText, tool } from "ai";
import { z } from "zod";
import { fetchSubtitleFileContent } from "@/app/actions/subtitles";
import { getSubtitleTracks } from "@/app/actions/utils";
import type { CurrentMediaWithSource } from "@/lib/atoms";
import { convertTimestampToSeconds } from "@/lib/utils";

interface ParsedSubtitleEntry {
  timestamp: number;
  endTimestamp?: number;
  timestampFormatted: string;
  text: string;
}

interface SubtitleLoadResult {
  success: boolean;
  subtitles: ParsedSubtitleEntry[];
  selectedTrackLabel?: string;
  selectedTrackLanguage?: string;
  selectedTrackIndex?: number;
  error?: string;
}

const DEFAULT_SUBTITLE_INDEX = 0;
const ENGLISH_TRACK_MIN_SCORE = 60;
const SUBTITLE_CACHE_TTL_MS = 10 * 60 * 1000;
const parsedSubtitleCache = new Map<
  string,
  {
    cachedAt: number;
    subtitles: ParsedSubtitleEntry[];
    selectedTrackLabel?: string;
    selectedTrackLanguage?: string;
    selectedTrackIndex?: number;
  }
>();
const STOP_WORDS = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "to",
    "of",
    "in",
    "on",
    "at",
    "for",
    "with",
    "is",
    "are",
    "be",
    "this",
    "that",
    "it",
    "they",
    "he",
    "she",
    "we",
    "you",
    "scene",
    "part",
    "when",
    "where",
]);

const timestampExtractionSchema = z.object({
  timestamp: z
    .string()
    .describe(
      "Best matching subtitle timestamp in HH:MM:SS or MM:SS format"
    ),
});

function parseSubtitleTimestamp(value: string): number | null {
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
}

function parseSubtitleTextContent(rawContent: string): ParsedSubtitleEntry[] {
    const normalized = rawContent.replace(/^\uFEFF/, "").replace(/\r/g, "");
    const blocks = normalized
        .split(/\n{2,}/)
        .map((block) => block.trim())
        .filter(Boolean);

    const parsed: ParsedSubtitleEntry[] = [];

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
}

function tokenizeQuery(query: string): string[] {
    return query
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function selectRelevantSubtitles(
    subtitles: ParsedSubtitleEntry[],
    query: string,
    options?: {
    maxMatches?: number;
    maxOutput?: number;
  }
): ParsedSubtitleEntry[] {
    const maxMatches = options?.maxMatches ?? 200;
    const maxOutput = options?.maxOutput ?? 400;
    const queryTokens = tokenizeQuery(query);

    if (subtitles.length <= maxOutput) {
        return subtitles;
    }

    const scored = subtitles
        .map((subtitle, index) => {
            const text = subtitle.text.toLowerCase();
            const score = queryTokens.reduce(
                (acc, token) => (text.includes(token) ? acc + 1 : acc),
                0
            );

            return { score, index };
        })
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, maxMatches);

    if (scored.length > 0) {
        const pickedIndices = new Set<number>();

        for (const entry of scored) {
            pickedIndices.add(entry.index);
            pickedIndices.add(Math.max(0, entry.index - 1));
            pickedIndices.add(Math.min(subtitles.length - 1, entry.index + 1));
        }

        return [...pickedIndices]
            .sort((a, b) => a - b)
            .slice(0, maxOutput)
            .map((index) => subtitles[index]);
    }

    const sampled: ParsedSubtitleEntry[] = [];
    const step = Math.max(1, Math.ceil(subtitles.length / maxOutput));
    for (let i = 0; i < subtitles.length; i += step) {
        sampled.push(subtitles[i]);
        if (sampled.length >= maxOutput) break;
    }

    return sampled;
}

function scoreEnglishTrack(track: {
    id?: string;
    label?: string;
    language?: string;
}): number {
    const values = [track.id, track.label, track.language]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());
    let score = 0;

    for (const value of values) {
        if (value.includes("english")) score += 100;
        if (value.includes("eng")) score += 80;

        const tokens = value
            .split(/[^a-z0-9]+/)
            .map((token) => token.trim())
            .filter(Boolean);

        if (tokens.includes("english")) score += 50;
        if (tokens.includes("eng")) score += 40;
        if (tokens.includes("en")) score += 25;
    }

    return score;
}

function pickPreferredSubtitleTrackIndex(
    tracks: Array<{
    id?: string;
    label?: string;
    language?: string;
  }>,
    subtitleIndex: number
): number {
    let bestEnglishIndex = -1;
    let bestEnglishScore = -1;

    for (const [index, track] of tracks.entries()) {
        const score = scoreEnglishTrack(track);
        if (score > bestEnglishScore) {
            bestEnglishScore = score;
            bestEnglishIndex = index;
        }
    }

    if (bestEnglishIndex >= 0 && bestEnglishScore >= ENGLISH_TRACK_MIN_SCORE) {
        return bestEnglishIndex;
    }

    return Math.max(0, Math.min(Math.floor(subtitleIndex), tracks.length - 1));
}

async function loadParsedSubtitles(
    currentMedia: CurrentMediaWithSource | null,
    subtitleIndex: number
): Promise<SubtitleLoadResult> {
    if (!currentMedia || !currentMedia.id) {
        return {
            success: false,
            subtitles: [],
            error:
        "No media is currently playing. Please start playing a video first.",
        };
    }

    const mediaType = currentMedia.type || "movie";
    const streamSourceId = currentMedia.mediaSourceId || currentMedia.id;

    const tracks = await getSubtitleTracks(streamSourceId, mediaType, {
        filename: currentMedia.subtitleFilename,
        videoSize: currentMedia.subtitleVideoSize,
    });

    if (tracks.length === 0) {
        return {
            success: false,
            subtitles: [],
            error: `No subtitle tracks found for ${currentMedia.name}.`,
        };
    }

    const boundedSubtitleIndex = pickPreferredSubtitleTrackIndex(
        tracks,
        subtitleIndex
    );
    const selectedTrack = tracks[boundedSubtitleIndex];
    const cacheKey = `${streamSourceId}:${selectedTrack.src}`;
    const cached = parsedSubtitleCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt <= SUBTITLE_CACHE_TTL_MS) {
        return {
            success: true,
            subtitles: cached.subtitles,
            selectedTrackLabel: cached.selectedTrackLabel,
            selectedTrackLanguage: cached.selectedTrackLanguage,
            selectedTrackIndex: cached.selectedTrackIndex,
        };
    }

    const subtitleFileResult = await fetchSubtitleFileContent(selectedTrack.src);
    if (!subtitleFileResult.success) {
        return {
            success: false,
            subtitles: [],
            error: subtitleFileResult.error || "Failed to fetch subtitle file",
        };
    }

    const parsedSubtitles = parseSubtitleTextContent(subtitleFileResult.content);
    if (parsedSubtitles.length === 0) {
        return {
            success: false,
            subtitles: [],
            error:
        "The selected subtitle track could not be parsed. Try a different subtitle index.",
        };
    }

    const result = {
        success: true,
        subtitles: parsedSubtitles,
        selectedTrackLabel: selectedTrack.label,
        selectedTrackLanguage: selectedTrack.language,
        selectedTrackIndex: boundedSubtitleIndex,
    };
    parsedSubtitleCache.set(cacheKey, {
        cachedAt: Date.now(),
        subtitles: parsedSubtitles,
        selectedTrackLabel: selectedTrack.label,
        selectedTrackLanguage: selectedTrack.language,
        selectedTrackIndex: boundedSubtitleIndex,
    });

    // Best-effort cache trim to avoid unbounded growth.
    for (const [key, entry] of parsedSubtitleCache.entries()) {
        if (Date.now() - entry.cachedAt > SUBTITLE_CACHE_TTL_MS) {
            parsedSubtitleCache.delete(key);
        }
    }

    return result;
}

async function analyzeText(
    prompt: string,
    maxOutputTokens: number,
    analysisModel: any
): Promise<string> {
    if (!analysisModel) {
        throw new Error("No analysis model provided");
    }

    const result = await generateText({
        model: analysisModel,
        prompt,
        maxOutputTokens,
        temperature: 0.1,
    });

    return result.text.trim();
}

async function extractTimestampWithStructuredOutput(
    prompt: string,
    analysisModel: any
): Promise<string> {
    if (!analysisModel) {
        throw new Error("No analysis model provided");
    }

    const result = await generateObject({
        model: analysisModel,
        schema: timestampExtractionSchema,
        prompt,
    });

    return result.object.timestamp.trim();
}

function formatSecondsToTimestamp(seconds: number): string {
    const totalSeconds = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(
            2,
            "0"
        )}`;
    }

    return `${minutes}:${String(secs).padStart(2, "0")}`;
}

export interface SkipToSubtitleContent {
  success: boolean;
  action: "skipTo";
  timestamp: number;
  timestampFormatted: string;
  text: string;
  message: string;
  error?: string;
}

export const skipToSubtitleContent = (
    currentMedia: CurrentMediaWithSource | null,
    analysisModel?: any
) =>
    tool({
        description:
      "Analyze subtitles and find the best timestamp to skip to based on the user's description. Only works when media is currently playing.",
        inputSchema: z.object({
            userDescription: z
                .string()
                .describe(
                    "The user's description of what scene/moment they want to skip to"
                ),
            subtitleIndex: z
                .number()
                .int()
                .min(0)
                .optional()
                .describe("The subtitle stream index (default: 0)"),
        }),
        execute: async ({ userDescription, subtitleIndex = DEFAULT_SUBTITLE_INDEX }) => {
            console.log("⏩ [skipToSubtitleContent] Tool called with:", {
                userDescription,
                subtitleIndex,
                currentMedia,
            });

            try {
                const subtitleResult = await loadParsedSubtitles(currentMedia, subtitleIndex);

                if (!subtitleResult.success) {
                    return {
                        success: false,
                        error: subtitleResult.error || "Failed to fetch subtitles",
                    };
                }

                const relevantSubtitles = selectRelevantSubtitles(
                    subtitleResult.subtitles,
                    userDescription,
                    { maxMatches: 220, maxOutput: 420 }
                );

                const subtitleText = relevantSubtitles
                    .map(
                        (sub, index) => `${index + 1}. [${sub.timestampFormatted}] ${sub.text}`
                    )
                    .join("\n");

                const analysisPrompt = `You are analyzing subtitles from "${currentMedia?.name}" to help a user skip to a specific scene.

User wants to skip to: "${userDescription}"

Subtitle entries (format: [HH:MM:SS] text):
${subtitleText}

Task: Find the most relevant timestamp that matches the user's description.

Rules:
- Return one best timestamp in HH:MM:SS format when possible.
- If only MM:SS is available, use MM:SS.
- Return the timestamp value only.`;

                const extractedTimestamp = await extractTimestampWithStructuredOutput(
                    analysisPrompt,
                    analysisModel
                );
                console.log("[skipToSubtitleContent] Extracted timestamp:", extractedTimestamp);

                const timestampMatch = extractedTimestamp.match(
                    /\d{1,2}:\d{2}:\d{2}(?:\.\d+)?|\d{1,2}:\d{2}(?:\.\d+)?/
                );

                if (!timestampMatch) {
                    return {
                        success: false,
                        error:
              "Could not determine a matching subtitle timestamp. Try a more specific description.",
                    };
                }

                const bestTimestamp = convertTimestampToSeconds(timestampMatch[0]);

                const correspondingSubtitle =
          subtitleResult.subtitles.find(
              (sub) => Math.abs(sub.timestamp - bestTimestamp) <= 2
          ) ||
          subtitleResult.subtitles.reduce((closest, current) =>
              Math.abs(current.timestamp - bestTimestamp) <
            Math.abs(closest.timestamp - bestTimestamp)
                  ? current
                  : closest
          );

                return {
                    success: true,
                    action: "skipTo",
                    timestamp: correspondingSubtitle.timestamp,
                    timestampFormatted: correspondingSubtitle.timestampFormatted,
                    text: correspondingSubtitle.text,
                    message: `Found a matching scene in ${currentMedia?.name} at ${correspondingSubtitle.timestampFormatted}. Skipping there now...`,
                };
            } catch (error) {
                console.error("[skipToSubtitleContent] Error:", error);
                return {
                    success: false,
                    error: "Failed to analyze subtitle content",
                };
            }
        },
    });

export const createExplainScene = (
    currentMedia: CurrentMediaWithSource | null,
    analysisModel?: any
) =>
    tool({
        description:
      "Analyze subtitles around the current timestamp to explain what's happening in the movie or show. Works when media is currently playing.",
        inputSchema: z.object({
            currentTimestamp: z
                .number()
                .describe(
                    "The current playback timestamp in seconds (where the user is in the video)"
                ),
            contextWindow: z
                .number()
                .min(5)
                .max(180)
                .optional()
                .describe(
                    "Number of seconds before and after current timestamp to analyze (default: 30)"
                ),
            subtitleIndex: z
                .number()
                .int()
                .min(0)
                .optional()
                .describe("The subtitle stream index (default: 0)"),
        }),
        execute: async ({
            currentTimestamp,
            contextWindow = 30,
            subtitleIndex = DEFAULT_SUBTITLE_INDEX,
        }) => {
            console.log("📖 [explainScene] Tool called with:", {
                currentTimestamp,
                contextWindow,
                subtitleIndex,
                currentMedia,
            });

            try {
                const subtitleResult = await loadParsedSubtitles(currentMedia, subtitleIndex);

                if (!subtitleResult.success) {
                    return {
                        success: false,
                        error: subtitleResult.error || "Failed to fetch subtitles",
                    };
                }

                const startTime = Math.max(0, currentTimestamp - contextWindow);
                const endTime = currentTimestamp + contextWindow;

                const relevantSubtitles = subtitleResult.subtitles.filter(
                    (sub) => sub.timestamp >= startTime && sub.timestamp <= endTime
                );

                if (relevantSubtitles.length === 0) {
                    return {
                        success: false,
                        error:
              "No subtitles found around the current timestamp. The scene might be silent or you may need to adjust the time window.",
                    };
                }

                const subtitleContext = relevantSubtitles
                    .map(
                        (sub) =>
                            `[${sub.timestampFormatted}] ${sub.text}${
                                Math.abs(sub.timestamp - currentTimestamp) <= 2
                                    ? " <- CURRENT POSITION"
                                    : ""
                            }`
                    )
                    .join("\n");

                const analysisPrompt = `You are analyzing a scene from "${currentMedia?.name}" to explain what is happening.

Subtitle context:
${subtitleContext}

Provide a concise 1-2 sentence explanation of the scene.
Do not mention timestamps.`;

                const explanation = await analyzeText(
                    analysisPrompt,
                    220,
                    analysisModel
                );
                const closestSubtitle = relevantSubtitles.reduce((closest, current) =>
                    Math.abs(current.timestamp - currentTimestamp) <
          Math.abs(closest.timestamp - currentTimestamp)
                        ? current
                        : closest
                );

                return {
                    success: true,
                    explanation,
                    currentTime: {
                        timestamp: currentTimestamp,
                        formatted: formatSecondsToTimestamp(currentTimestamp),
                    },
                    contextSubtitles: relevantSubtitles.length,
                    closestDialogue: {
                        text: closestSubtitle.text,
                        timestamp: closestSubtitle.timestampFormatted,
                    },
                    mediaName: currentMedia?.name,
                };
            } catch (error) {
                console.error("[explainScene] Error:", error);
                return {
                    success: false,
                    error: "Failed to analyze scene content",
                };
            }
        },
    });

export const createAnalyzeMedia = (
    currentMedia: CurrentMediaWithSource | null,
    analysisModel?: any
) =>
    tool({
        description:
      "Analyze the entire movie or episode using subtitles to answer questions about the plot, characters, themes, or any aspect of the content. Works when media is currently playing.",
        inputSchema: z.object({
            userQuestion: z
                .string()
                .describe(
                    "The user's question about the movie/episode (e.g., 'What is this about?', 'Who are the main characters?', 'What happened at the end?')"
                ),
            subtitleIndex: z
                .number()
                .int()
                .min(0)
                .optional()
                .describe("The subtitle stream index (default: 0)"),
        }),
        execute: async ({ userQuestion, subtitleIndex = DEFAULT_SUBTITLE_INDEX }) => {
            console.log("🎬 [analyzeMedia] Tool called with:", {
                userQuestion,
                subtitleIndex,
                currentMedia,
            });

            try {
                const subtitleResult = await loadParsedSubtitles(currentMedia, subtitleIndex);

                if (!subtitleResult.success) {
                    return {
                        success: false,
                        error: subtitleResult.error || "Failed to fetch subtitles",
                    };
                }

                const relevantSubtitles = selectRelevantSubtitles(
                    subtitleResult.subtitles,
                    userQuestion,
                    { maxMatches: 260, maxOutput: 500 }
                );

                const subtitleContext = relevantSubtitles
                    .map((sub) => `[${sub.timestampFormatted}] ${sub.text}`)
                    .join("\n");

                const analysisPrompt = `You are analyzing "${currentMedia?.name}" to answer a user question.

User question: "${userQuestion}"

Subtitle excerpts:
${subtitleContext}

Answer the question with the information available in the subtitles.
If the subtitles do not provide enough evidence, say that clearly.`;

                const answer = await analyzeText(
                    analysisPrompt,
                    400,
                    analysisModel
                );

                return {
                    success: true,
                    answer,
                    question: userQuestion,
                    mediaName: currentMedia?.name,
                    subtitleCount: subtitleResult.subtitles.length,
                    analyzedSubtitleCount: relevantSubtitles.length,
                };
            } catch (error) {
                console.error("[analyzeMedia] Error:", error);
                return {
                    success: false,
                    error: "Failed to analyze media content",
                };
            }
        },
    });
