import { google, createGoogle } from "@ai-sdk/google";
import { openai, createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
    openrouter,
    createOpenRouter,
    type OpenRouterSharedSettings,
} from "@openrouter/ai-sdk-provider";
import { groq, createGroq } from "@ai-sdk/groq";
import { cerebras, createCerebras } from "@ai-sdk/cerebras";
import { createOllama } from "ai-sdk-ollama";
import { APICallError, RetryError, convertToModelMessages, streamText, isStepCount, validateUIMessages, toUIMessageStream, createUIMessageStreamResponse, createUIMessageStream } from "ai";
import { z } from "zod";
import { actionToolNames, record, compactNavigatorMessages, pageTargetFromPath, requestsScenePlayback, attemptedScenePlayback } from "@/lib/navigator-chat";
import { scenePlaybackResponse } from "@/app/tools/scene-workflow";
import { navigatorRoutingSettings } from "@/lib/navigator-model-settings";
import type { SceneProgress } from "@/lib/navigator-scene-progress";
import { createOpenCodeGoModel } from "@/lib/opencode-go";
import { getTMDBTitle, getTMDBEpisodes } from "@/lib/tmdb-discovery";
import { createAllTools, createSystemPrompt } from "@/app/tools";
import { OPENAI_DEFAULT_BASE_URL } from "@/lib/models-dev";
import { cookies } from "next/headers";

type OpenRouterReasoningEffort =
  | "default"
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";
type CerebrasReasoningEffort = "default" | "low" | "medium" | "high";

const contextSchema = z.object({
    analysisModel: z.string().max(200).optional(),
    pathname: z.string().max(2000).optional(),
    currentTimestamp: z.number().finite().nonnegative().optional(),
    currentMedia: z.object({
        id: z.string(), name: z.string(), type: z.enum(["movie", "series", "channel", "tv"]),
        mediaSourceId: z.string().optional(), seriesId: z.string().optional(),
        showName: z.string().optional(), episodeTitle: z.string().optional(),
        seasonNumber: z.number().optional(), episodeNumber: z.number().optional(),
        subtitleFilename: z.string().optional(), subtitleVideoSize: z.number().optional(),
    }).nullish(),
});

function chatError(error: unknown): { status: number; message: string } {
    if (RetryError.isInstance(error) && error.errors.length) return chatError(error.errors.at(-1));
    if (error instanceof z.ZodError || error instanceof SyntaxError) return { status: 400, message: "This request could not be read. Start a new chat and try again." };
    if (APICallError.isInstance(error)) {
        let detail: Record<string, any> = {};
        try { detail = record(record(JSON.parse(error.responseBody || "{}")).error); } catch { /* Some providers return plain text. */ }
        if (detail.code === "api_key_expired") return { status: 400, message: "Your AI provider API key has expired. Replace it in Settings." };
        if (error.statusCode === 401 || error.statusCode === 403) return { status: 400, message: "Your AI provider rejected the API key. Check it in Settings." };
        if (error.statusCode === 429) return { status: 429, message: "Your AI provider is rate limiting requests or has no remaining credits. Wait a moment or check your provider account." };
        if ((error.statusCode === 400 || error.statusCode === 422) && /tool[_ -]?choice|tool.?call|function.?call/i.test(`${error.message} ${detail.message || ""}`)) {
            return { status: 400, message: "This model couldn’t run that action. Try again or choose another model in Settings." };
        }
        return { status: 502, message: "Your AI provider could not complete the request. Try again or choose another model in Settings." };
    }
    if (error instanceof Error && /API key is required|requires a stable session|Unsupported AI provider/.test(error.message)) return { status: 400, message: error.message };
    return { status: 500, message: "Navigator could not complete this request. Please try again." };
}

async function getAuthData() {
    const cookieStore = await cookies();
    const authData = cookieStore.get("stremio-auth");

    if (!authData?.value) {
        throw new Error("Not authenticated");
    }

    const parsed = JSON.parse(authData.value);
    return { user: parsed.user };
}

export async function POST(req: Request) {
    try {
        await getAuthData();

        const requestPayload = await req.json();
        const context = contextSchema.parse(requestPayload);
        const {
            messages,

            aiProvider = "openai",
            openaiBaseUrl = "https://api.openai.com/v1",
            openaiModel = "gpt-4o-mini",
            geminiModel = "gemini-flash-lite-latest",
            ollamaBaseUrl = "http://localhost:11434",
            ollamaModel = "phi3",
            groqModel = "llama3-8b-8192",
            openrouterModel = "qwen/qwen3-coder:free",
            openrouterReasoningEffort = "default",
            cerebrasModel = "gpt-oss-120b",
            cerebrasReasoningEffort = "default",
            opencodeModel = "gpt-5.6-luna",
            openaiApiKey,
            googleApiKey,
            groqApiKey,
            openrouterApiKey,
            cerebrasApiKey,
            opencodeApiKey,
            opencodeSessionId,
        } = requestPayload;
        const { currentMedia, currentTimestamp, pathname } = context;

        if (!Array.isArray(messages)) {
            return new Response("Invalid messages payload", { status: 400 });
        }

        const normalizedOpenrouterReasoningEffort: OpenRouterReasoningEffort =
      openrouterReasoningEffort === "none" ||
      openrouterReasoningEffort === "minimal" ||
      openrouterReasoningEffort === "low" ||
      openrouterReasoningEffort === "medium" ||
      openrouterReasoningEffort === "high" ||
      openrouterReasoningEffort === "xhigh"
          ? openrouterReasoningEffort
          : "default";

        const normalizedCerebrasReasoningEffort: CerebrasReasoningEffort =
      cerebrasReasoningEffort === "low" ||
      cerebrasReasoningEffort === "medium" ||
      cerebrasReasoningEffort === "high"
          ? cerebrasReasoningEffort
          : "default";

        console.log({
            aiProvider,
            openaiBaseUrl,
            openaiModel,
            geminiModel,
            ollamaBaseUrl,
            ollamaModel,
            groqModel,
            openrouterModel,
            openrouterReasoningEffort: normalizedOpenrouterReasoningEffort,
            cerebrasModel,
            cerebrasReasoningEffort: normalizedCerebrasReasoningEffort,
            opencodeModel,
            hasOpenaiApiKey: Boolean(openaiApiKey),
            hasGoogleApiKey: Boolean(googleApiKey),
            hasGroqApiKey: Boolean(groqApiKey),
            hasOpenrouterApiKey: Boolean(openrouterApiKey),
            hasCerebrasApiKey: Boolean(cerebrasApiKey),
            hasOpencodeApiKey: Boolean(opencodeApiKey),
            hasOpencodeSessionId: Boolean(opencodeSessionId),
        });

        const openrouterModelSettings: OpenRouterSharedSettings | undefined =
      normalizedOpenrouterReasoningEffort === "default"
          ? undefined
          : {
              // Use extraBody so we can forward all OpenRouter API-supported values.
              extraBody: {
                  reasoning: {
                      effort: normalizedOpenrouterReasoningEffort,
                  },
              },
          };

        const selectModel = (modelOverride?: string) => {
            let model;
            switch (aiProvider) {
            case "openai":
                if (openaiApiKey) {
                    if (openaiBaseUrl === OPENAI_DEFAULT_BASE_URL) {
                        const openaiProvider = createOpenAI({
                            apiKey: openaiApiKey,
                            baseURL: openaiBaseUrl,
                        });
                        model = openaiProvider((modelOverride || openaiModel));
                    } else {
                        const openaiCompatibleProvider = createOpenAICompatible({
                            name: "openai-compatible",
                            apiKey: openaiApiKey,
                            baseURL: openaiBaseUrl,
                        });
                        model = openaiCompatibleProvider((modelOverride || openaiModel));
                    }
                } else if (process.env.OPENAI_API_KEY) {
                    const openaiProvider =
            openaiBaseUrl && openaiBaseUrl !== "https://api.openai.com/v1"
                ? createOpenAICompatible({
                    name: "openai-compatible",
                    apiKey: process.env.OPENAI_API_KEY,
                    baseURL: openaiBaseUrl,
                })
                : openai;
                    model = openaiProvider((modelOverride || openaiModel));
                } else {
                    throw new Error(
                        "OpenAI API key is required for OpenAI provider. Please set your API key in settings."
                    );
                }
                break;
            case "gemini":
                if (googleApiKey) {
                    const googleProvider = createGoogle({
                        apiKey: googleApiKey,
                    });
                    model = googleProvider((modelOverride || geminiModel));
                } else if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
                    // Fallback to environment variable
                    model = google((modelOverride || geminiModel));
                } else {
                    throw new Error(
                        "Google API key is required for Gemini provider. Please set your API key in settings."
                    );
                }
                break;
            case "ollama": {
                const ollamaProvider = createOllama({
                    baseURL: ollamaBaseUrl,
                });
                model = ollamaProvider((modelOverride || ollamaModel));
                break;
            }
            case "groq":
                if (groqApiKey) {
                    const groqProvider = createGroq({
                        apiKey: groqApiKey,
                    });
                    model = groqProvider((modelOverride || groqModel));
                } else if (process.env.GROQ_API_KEY) {
                    model = groq((modelOverride || groqModel));
                } else {
                    throw new Error(
                        "Groq API key is required for Groq provider. Please set your API key in settings."
                    );
                }
                break;
            case "openrouter":
                if (openrouterApiKey) {
                    const openrouterProvider = createOpenRouter({
                        apiKey: openrouterApiKey,
                    });
                    model = openrouterProvider((modelOverride || openrouterModel), openrouterModelSettings);
                } else if (process.env.OPENROUTER_API_KEY) {
                    model = openrouter.chat((modelOverride || openrouterModel), openrouterModelSettings);
                } else {
                    throw new Error(
                        "OpenRouter API key is required for OpenRouter provider. Please set your API key in settings."
                    );
                }
                break;
            case "cerebras":
                if (cerebrasApiKey) {
                    const cerebrasProvider = createCerebras({
                        apiKey: cerebrasApiKey,
                    });
                    model = cerebrasProvider((modelOverride || cerebrasModel));
                } else if (process.env.CEREBRAS_API_KEY) {
                    model = cerebras((modelOverride || cerebrasModel));
                } else {
                    throw new Error(
                        "Cerebras API key is required for Cerebras provider. Please set your API key in settings."
                    );
                }
                break;
            case "opencode": {
                const apiKey = opencodeApiKey || process.env.OPENCODE_GO_API_KEY;
                if (!apiKey) {
                    throw new Error(
                        "OpenCode Go API key is required. Please set your API key in settings."
                    );
                }
                if (typeof opencodeSessionId !== "string" || !opencodeSessionId.trim()) {
                    throw new Error("OpenCode Go requires a stable session ID.");
                }
                model = createOpenCodeGoModel(modelOverride || opencodeModel, apiKey, opencodeSessionId);
                break;
            }
            default:
                throw new Error(`Unsupported AI provider: ${aiProvider}`);
            }

            return model;
        };
        const model = selectModel();
        const analysisModel = context.analysisModel?.trim() ? selectModel(context.analysisModel.trim()) : model;

        const tools = createAllTools(currentMedia, currentTimestamp, analysisModel, req.signal);
        // Retain the old handoff schema for saved chats, without advertising it to models.
        const { completeAction: _legacyAction, ...generationTools } = tools;
        let validatedMessages;
        try {
            validatedMessages = await validateUIMessages({ messages, tools });
        } catch {
            return new Response("This conversation contains an incomplete or outdated tool result. Start a new chat to continue.", { status: 400 });
        }
        if (validatedMessages.some(message => message.role === "system")) {
            return new Response("Invalid message role", { status: 400 });
        }
        const compactedMessages = compactNavigatorMessages(validatedMessages);
        const modelMessages = await convertToModelMessages(compactedMessages, { tools, ignoreIncompleteToolCalls: true });
        const pageTarget = pathname ? pageTargetFromPath(pathname) : null;
        let pageContext = null;
        if (pageTarget) {
            try {
                const details = await getTMDBTitle(pageTarget.id, pageTarget.type, req.signal);
                const episode = pageTarget.season !== undefined && pageTarget.episode !== undefined
                    ? (await getTMDBEpisodes(details.id, pageTarget.season, req.signal)).find(item => item.episode === pageTarget.episode) : null;
                pageContext = {
                    id: details.id, name: details.name, type: pageTarget.type, source: "TMDB",
                    ...(episode ? { episodeId: episode.id, episodeTitle: episode.title,
                        seasonNumber: pageTarget.season, episodeNumber: pageTarget.episode } : {}),
                };
            } catch (error) {
                req.signal.throwIfAborted();
                pageContext = { ...pageTarget, metadataUnavailable: error instanceof Error ? error.message : "TMDB metadata unavailable." };
            }
        }
        const systemPrompt = createSystemPrompt(currentMedia, currentTimestamp, pageContext);
        if (navigatorRoutingSettings(model).providerOptions && requestsScenePlayback(validatedMessages) && !attemptedScenePlayback(validatedMessages)) {
            return scenePlaybackResponse({ model, messages: modelMessages, originalMessages: validatedMessages, tools, context: { currentMedia, viewedTitle: pageContext }, signal: req.signal, onError: error => chatError(error).message });
        }
        const startedAt = Date.now();

        const streamSettings: {
      temperature?: number;
      maxOutputTokens: number;
      maxRetries: number;
      providerOptions?: any;
    } = {
        maxOutputTokens: 1400,
        maxRetries: 2,
        ...navigatorRoutingSettings(model),
    };

        if (aiProvider === "cerebras") {
            const cerebrasProviderOptions: Record<string, any> = {};
            if (normalizedCerebrasReasoningEffort !== "default") {
                cerebrasProviderOptions.reasoningEffort =
          normalizedCerebrasReasoningEffort;
            }
            if (Object.keys(cerebrasProviderOptions).length > 0) {
                streamSettings.providerOptions = {
                    cerebras: cerebrasProviderOptions,
                };
            }
        }

        return createUIMessageStreamResponse({ stream: createUIMessageStream({
            originalMessages: validatedMessages,
            onError: error => chatError(error).message,
            execute: ({ writer }) => {
                const progressTools: typeof generationTools = { ...generationTools, skipToSubtitleContent: {
                    ...generationTools.skipToSubtitleContent,
                    execute: async (input: unknown, options: Parameters<NonNullable<typeof generationTools.skipToSubtitleContent.execute>>[1]) => {
                        let latest: SceneProgress | undefined;
                        const onSceneProgress = (progress: SceneProgress) => {
                            latest = progress;
                            writer.write({ type: "data-sceneProgress", id: `${options.toolCallId}-${progress.stage}`, data: { ...progress, toolCallId: options.toolCallId } });
                        };
                        const output = await generationTools.skipToSubtitleContent.execute!(input, { ...options, context: { ...record(options.context), onSceneProgress } });
                        if (record(output).success === false && latest?.state === "running") onSceneProgress({ ...latest, state: "error", detail: record(output).error });
                        return output;
                    },
                } };
                const result = streamText({
            model,
            messages: modelMessages,
            stopWhen: [isStepCount(8), ({ steps }) => steps.at(-1)?.toolResults.some(result =>
                actionToolNames.has(result.toolName) && record(result.output).execution === "prepared") ?? false],
            abortSignal: req.signal,
            timeout: { totalMs: 120_000, stepMs: 60_000 },
            ...streamSettings,
            tools: progressTools,
            instructions: systemPrompt,
            prepareStep: () => ({
                activeTools: Object.keys(generationTools).filter(name => currentMedia || !["explainScene", "analyzeMedia"].includes(name)),
            }),
            onStepEnd: (stepResult) => {
                console.log("[chat] step-finish", {
                    finishReason: stepResult.finishReason,
                    inputTokens: stepResult.usage?.inputTokens,
                    outputTokens: stepResult.usage?.outputTokens,
                    toolCalls: stepResult.toolCalls?.length ?? 0,
                });
            },
            onToolExecutionEnd: ({ toolCall, toolExecutionMs }) => {
                console.log("[chat] tool-end", { tool: toolCall.toolName, durationMs: toolExecutionMs });
            },
            onEnd: ({ totalUsage: usage, finishReason }) => {
                console.log("[chat] finish", {
                    finishReason,
                    durationMs: Date.now() - startedAt,
                    inputTokens: usage?.inputTokens,
                    outputTokens: usage?.outputTokens,
                    totalTokens: usage?.totalTokens,
                });
            },
            onError: ({ error }) => {
                console.error("[chat] stream error", error);
            },
        });

                writer.merge(toUIMessageStream({
                stream: result.stream,
                originalMessages: validatedMessages,
                onError: error => chatError(error).message,
                }));
            },
        }) });
    } catch (error) {
        console.error("Chat API Error:", error);

        if (error instanceof Error && error.message === "Not authenticated") {
            return new Response("Unauthorized", { status: 401 });
        }

        const failure = chatError(error);
        return new Response(failure.message, { status: failure.status });
    }
}
