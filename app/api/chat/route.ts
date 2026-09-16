import { google, createGoogleGenerativeAI } from "@ai-sdk/google";
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
import { convertToModelMessages, streamText, stepCountIs } from "ai";
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

const MODEL_MESSAGE_WINDOW = 18;
const MAX_TEXT_PART_CHARS = 1_200;
const MAX_TOOL_LIST_ITEMS = 20;
const MAX_FALLBACK_TOOL_PAYLOAD_CHARS = 1_600;

async function getAuthData() {
  const cookieStore = await cookies();
  const authData = cookieStore.get("stremio-auth");

  if (!authData?.value) {
    throw new Error("Not authenticated");
  }

  const parsed = JSON.parse(authData.value);
  return { user: parsed.user };
}

function truncateText(value: string, maxChars = MAX_TEXT_PART_CHARS): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars).trimEnd()}...`;
}

function safeJsonLength(value: unknown): number {
  try {
    return JSON.stringify(value).length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

function summarizeToolOutput(toolName: string, output: any): any {
  if (!output || typeof output !== "object") return output;

  switch (toolName) {
    case "searchMedia":
      return {
        success: Boolean(output.success),
        count: Number(output.count ?? 0),
        results: Array.isArray(output.results)
          ? output.results.slice(0, MAX_TOOL_LIST_ITEMS).map((item: any) => ({
              id: item?.id,
              name: item?.name,
              type: item?.type,
              year: item?.year ?? null,
            }))
          : [],
      };
    case "getMediaStreams":
      return {
        success: Boolean(output.success),
        mediaId: output.mediaId,
        mediaType: output.mediaType,
        selectionId: output.selectionId,
        streamCount: Number(
          output.streamCount ??
            (Array.isArray(output.streams) ? output.streams.length : 0)
        ),
        bestStream: output.bestStream
          ? {
              choice: output.bestStream.choice,
              streamId: output.bestStream.streamId,
              resolution: output.bestStream.resolution,
              playable: Boolean(output.bestStream.playable),
            }
          : null,
        streams: Array.isArray(output.streams)
          ? output.streams.slice(0, MAX_TOOL_LIST_ITEMS).map((stream: any) => ({
              choice: stream?.choice,
              streamId: stream?.streamId,
              playable: Boolean(stream?.playable),
              resolution: stream?.resolution ?? null,
              tags: Array.isArray(stream?.tags)
                ? stream.tags.slice(0, 4)
                : [],
            }))
          : [],
      };
    case "getEpisodes":
      return {
        success: Boolean(output.success),
        count: Number(output.count ?? 0),
        returnedCount: Number(output.returnedCount ?? 0),
        episodes: Array.isArray(output.episodes)
          ? output.episodes.slice(0, MAX_TOOL_LIST_ITEMS).map((episode: any) => ({
              id: episode?.id,
              name: episode?.name,
              seasonNumber: episode?.seasonNumber,
              episodeNumber: episode?.episodeNumber,
            }))
          : [],
      };
    case "findEpisodeByTitle":
      return {
        success: Boolean(output.success),
        seriesId: output.seriesId,
        seriesName: output.seriesName,
        episodes: Array.isArray(output.episodes)
          ? output.episodes.slice(0, MAX_TOOL_LIST_ITEMS).map((episode: any) => ({
              id: episode?.id,
              title: episode?.title,
              seasonNumber: episode?.seasonNumber,
              episodeNumber: episode?.episodeNumber,
            }))
          : [],
      };
    default: {
      if (safeJsonLength(output) <= MAX_FALLBACK_TOOL_PAYLOAD_CHARS) {
        return output;
      }

      return {
        success:
          typeof output.success === "boolean" ? output.success : undefined,
        message:
          typeof output.message === "string"
            ? truncateText(output.message, 240)
            : "Tool result available.",
        truncated: true,
      };
    }
  }
}

function compactMessagesForModel(rawMessages: any[]): any[] {
  const recentMessages = rawMessages.slice(-MODEL_MESSAGE_WINDOW);

  return recentMessages.map((message) => {
    if (!message || typeof message !== "object") return message;

    const compactedMessage: any = { ...message };

    if (typeof compactedMessage.content === "string") {
      compactedMessage.content = truncateText(compactedMessage.content);
    }

    if (!Array.isArray(compactedMessage.parts)) {
      return compactedMessage;
    }

    compactedMessage.parts = compactedMessage.parts.map((part: any) => {
      if (!part || typeof part !== "object") return part;

      if (part.type === "text" && typeof part.text === "string") {
        return {
          ...part,
          text: truncateText(part.text),
        };
      }

      const toolName = part.type?.startsWith("tool-")
        ? part.type.slice("tool-".length)
        : part.toolName;

      if (!toolName || !("output" in part)) {
        return part;
      }

      return {
        ...part,
        output: summarizeToolOutput(toolName, part.output),
      };
    });

    return compactedMessage;
  });
}

export async function POST(req: Request) {
  try {
    await getAuthData();

    const requestPayload = await req.json();
    const {
      messages,
      currentMedia,
      currentTimestamp,
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
      opencodeModel = "hy3",
      openaiApiKey,
      googleApiKey,
      groqApiKey,
      openrouterApiKey,
      cerebrasApiKey,
      opencodeApiKey,
      opencodeSessionId,
    } = requestPayload;

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

    let model;
    switch (aiProvider) {
      case "openai":
        if (openaiApiKey) {
          if (openaiBaseUrl === OPENAI_DEFAULT_BASE_URL) {
            const openaiProvider = createOpenAI({
              apiKey: openaiApiKey,
              baseURL: openaiBaseUrl,
            });
            model = openaiProvider(openaiModel);
          } else {
            const openaiCompatibleProvider = createOpenAICompatible({
              name: "openai-compatible",
              apiKey: openaiApiKey,
              baseURL: openaiBaseUrl,
            });
            model = openaiCompatibleProvider(openaiModel);
          }
        } else if (process.env.OPENAI_API_KEY) {
          const openaiProvider =
            openaiBaseUrl && openaiBaseUrl !== "https://api.openai.com/v1"
              ? createOpenAICompatible({
                  name: "openai-compatible",
                  baseURL: openaiBaseUrl,
                })
              : openai;
          model = openaiProvider(openaiModel);
        } else {
          throw new Error(
            "OpenAI API key is required for OpenAI provider. Please set your API key in settings."
          );
        }
        break;
      case "gemini":
        if (googleApiKey) {
          const googleProvider = createGoogleGenerativeAI({
            apiKey: googleApiKey,
          });
          model = googleProvider(geminiModel);
        } else if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
          // Fallback to environment variable
          model = google(geminiModel);
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
        model = ollamaProvider(ollamaModel);
        break;
      }
      case "groq":
        if (groqApiKey) {
          const groqProvider = createGroq({
            apiKey: groqApiKey,
          });
          model = groqProvider(groqModel);
        } else if (process.env.GROQ_API_KEY) {
          model = groq(groqModel);
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
          model = openrouterProvider(openrouterModel, openrouterModelSettings);
        } else if (process.env.OPENROUTER_API_KEY) {
          model = openrouter.chat(openrouterModel, openrouterModelSettings);
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
          model = cerebrasProvider(cerebrasModel);
        } else if (process.env.CEREBRAS_API_KEY) {
          model = cerebras(cerebrasModel);
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
            "OpenCode Zen API key is required. Please set your API key in settings."
          );
        }
        if (typeof opencodeSessionId !== "string" || !opencodeSessionId.trim()) {
          throw new Error("OpenCode Zen requires a stable session ID.");
        }
        const opencodeProvider = createOpenAICompatible({
          name: "opencode",
          baseURL: "https://opencode.ai/zen/go/v1",
          apiKey,
          headers: {
            "x-opencode-session": opencodeSessionId.trim(),
            "user-agent": "navigator/1.0",
          },
          includeUsage: true,
        });
        model = opencodeProvider(opencodeModel);
        break;
      }
      default:
        throw new Error(`Unsupported AI provider: ${aiProvider}`);
    }

    const compactedMessages = compactMessagesForModel(messages);
    const modelMessages = convertToModelMessages(compactedMessages);
    const systemPrompt = createSystemPrompt(currentMedia, currentTimestamp);

    console.log("[chat] model-input-summary", {
      aiProvider,
      modelId: String(model),
      messageCount: modelMessages.length,
      compactedFrom: messages.length,
      systemLength: systemPrompt.length,
      approxInputChars: safeJsonLength({
        messages: compactedMessages,
        system: systemPrompt,
      }),
    });

    const streamSettings: {
      temperature: number;
      maxOutputTokens: number;
      maxRetries: number;
      providerOptions?: any;
    } = {
      temperature: 0.1,
      maxOutputTokens: 700,
      maxRetries: 2,
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

    const result = streamText({
      model,
      messages: modelMessages,
      stopWhen: stepCountIs(6),
      ...streamSettings,
      tools: createAllTools(currentMedia, currentTimestamp, model),
      system: systemPrompt,
      onStepFinish: (stepResult) => {
        console.log("[chat] step-finish", {
          finishReason: stepResult.finishReason,
          inputTokens: stepResult.usage?.inputTokens,
          outputTokens: stepResult.usage?.outputTokens,
          toolCalls: stepResult.toolCalls?.length ?? 0,
        });
      },
      onFinish: ({ usage, finishReason }) => {
        console.log("[chat] finish", {
          finishReason,
          inputTokens: usage?.inputTokens,
          outputTokens: usage?.outputTokens,
          totalTokens: usage?.totalTokens,
        });
      },
      onError: ({ error }) => {
        console.error("[chat] stream error", error);
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("Chat API Error:", error);

    if (error instanceof Error && error.message === "Not authenticated") {
      return new Response("Unauthorized", { status: 401 });
    }

    return new Response("Internal Server Error", { status: 500 });
  }
}
