import { createUIMessageStream, createUIMessageStreamResponse, generateText, Output, type LanguageModel, type ModelMessage, type ToolSet, type UIMessage } from "ai";
import { z } from "zod";
import { navigatorRoutingSettings } from "@/lib/navigator-model-settings";
import { parseScenePlaybackCommand } from "@/lib/navigator-scene-intent";
import { record } from "@/lib/navigator-chat";
import type { SceneProgress } from "@/lib/navigator-scene-progress";

/** Explicit scene commands are a workflow: extract intent, execute, then let the browser confirm playback. */
export function scenePlaybackResponse({ model, messages, originalMessages, tools, context, signal, onError }: {
    model: LanguageModel; messages: ModelMessage[]; originalMessages: UIMessage[];
    tools: ToolSet; context: unknown; signal: AbortSignal; onError: (_error: unknown) => string;
}) {
    return createUIMessageStreamResponse({ stream: createUIMessageStream({
        originalMessages,
        onError,
        execute: async ({ writer }) => {
            writer.write({ type: "start" });
            writer.write({ type: "start-step" });
            const latestUser = originalMessages.findLast(message => message.role === "user");
            const text = latestUser?.parts.filter(part => part.type === "text").map(part => record(part).text).join(" ") || "";
            const earlierTitles = [...new Set(originalMessages.flatMap(message => message.parts)
                .map(part => record(record(part).output).mediaName).filter((name): name is string => typeof name === "string"))].slice(-6);
            const intentStartedAt = Date.now();
            const parsed = parseScenePlaybackCommand(text);
            const plan = parsed ? { output: parsed } : await generateText({
                model, ...navigatorRoutingSettings(model), abortSignal: signal,
                timeout: { totalMs: 30_000 }, maxOutputTokens: 1400,
                instructions: `Extract a scene-playback request into the schema. mediaQuery is the movie/show title, including any requested year; use null for the current video. userDescription is the scene only; normalize joined words (blackhole → black hole). Copy explicit episode coordinates, otherwise null. Do not invent titles, IDs, episode coordinates, or timestamps. Reference context only: ${JSON.stringify({ context, earlierTitles })}`,
                messages: [{ role: "user", content: text }],
                output: Output.object({ schema: z.object({
                    mediaQuery: z.string().min(1).max(300).nullable(),
                    userDescription: z.string().min(1).max(600),
                    seasonNumber: z.number().int().min(0).nullable(),
                    episodeNumber: z.number().int().min(1).nullable(),
                }) }),
            });
            signal.throwIfAborted();
            const intentMs = Date.now() - intentStartedAt;
            const input = Object.fromEntries(Object.entries(plan.output).filter(([, value]) => value !== null));
            const toolCallId = `scene-${crypto.randomUUID()}`;
            let latestProgress: SceneProgress | undefined;
            const onSceneProgress = (progress: SceneProgress) => {
                latestProgress = progress;
                writer.write({ type: "data-sceneProgress", id: `${toolCallId}-${progress.stage}`, data: { ...progress, toolCallId } });
            };
            writer.write({ type: "tool-input-available", toolName: "skipToSubtitleContent", toolCallId, input });
            const result = await tools.skipToSubtitleContent.execute!(input, { toolCallId, messages, abortSignal: signal, context: { onSceneProgress } });
            const output = { ...record(result), timings: { ...record(record(result).timings), intentMs, intentSource: parsed ? "literal" : "model" } };
            if (record(result).success === false && latestProgress?.state === "running") {
                onSceneProgress({ ...latestProgress, state: "error", detail: record(result).error });
            }
            signal.throwIfAborted();
            writer.write({ type: "tool-output-available", toolCallId, output });
            writer.write({ type: "finish-step" });
            writer.write({ type: "finish", finishReason: "tool-calls" });
        },
    }) });
}
