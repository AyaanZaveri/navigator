import { google, createGoogleGenerativeAI } from "@ai-sdk/google";
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

    const {
      messages,
      currentMedia,
      currentTimestamp,
      aiProvider = "gemini",
      ollamaBaseUrl = "http://localhost:11434",
      ollamaModel = "phi3",
      groqModel = "llama3-8b-8192",
      openrouterModel = "qwen/qwen3-coder:free",
      openrouterReasoningEffort = "default",
      cerebrasModel = "gpt-oss-120b",
      cerebrasReasoningEffort = "default",
      googleApiKey,
      groqApiKey,
      openrouterApiKey,
      cerebrasApiKey,
    } = await req.json();

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
      ollamaBaseUrl,
      ollamaModel,
      groqModel,
      openrouterModel,
      openrouterReasoningEffort: normalizedOpenrouterReasoningEffort,
      cerebrasModel,
      cerebrasReasoningEffort: normalizedCerebrasReasoningEffort,
      hasGoogleApiKey: Boolean(googleApiKey),
      hasGroqApiKey: Boolean(groqApiKey),
      hasOpenrouterApiKey: Boolean(openrouterApiKey),
      hasCerebrasApiKey: Boolean(cerebrasApiKey),
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
      case "gemini":
        if (googleApiKey) {
          const googleProvider = createGoogleGenerativeAI({
            apiKey: googleApiKey,
          });
          model = googleProvider("gemini-flash-lite-latest");
        } else if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
          // Fallback to environment variable
          model = google("gemini-flash-lite-latest");
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
      default:
        throw new Error(`Unsupported AI provider: ${aiProvider}`);
    }

    const modelMessages = convertToModelMessages(messages);
    const systemPrompt = createSystemPrompt(currentMedia, currentTimestamp);

    // Debug log: exact prompt inputs sent to the model.
    console.log("[chat] model-input", {
      aiProvider,
      modelId: String(model),
      messageCount: modelMessages.length,
      systemLength: systemPrompt.length,
      messages: modelMessages,
      system: systemPrompt,
    });

    const streamSettings: {
      temperature: number;
      maxOutputTokens: number;
      providerOptions?: any;
    } = {
      temperature: 0.2,
      maxOutputTokens: 400,
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
      stopWhen: stepCountIs(10),
      ...streamSettings,
      tools: createAllTools(currentMedia, currentTimestamp, model),
      system: systemPrompt,
      // onChunk: async (chunk: any) => {
      //   console.log("🪣 [streamText] New chunk received:", chunk);
      // },
      // onFinish: async ({ usage, finishReason, text, toolResults }) => {},
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
