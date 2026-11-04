import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { defaultSettingsMiddleware, wrapLanguageModel } from "ai";

export const OPENCODE_GO_BASE_URL = "https://opencode.ai/inference/go/openai/v1";

/** Follow Go's native Responses route for GPT, Muse Spark, and Grok models. */
export function createOpenCodeGoModel(modelId: string, apiKey: string, sessionId: string) {
    const settings = {
        baseURL: OPENCODE_GO_BASE_URL,
        apiKey,
        headers: { "x-opencode-session": sessionId.trim(), "user-agent": "navigator/1.0" },
    };
    if (/^(gpt-|muse-spark-|grok-)/.test(modelId)) {
        return wrapLanguageModel({
            model: createOpenAI({ ...settings, name: "opencode-responses" }).responses(modelId),
            middleware: defaultSettingsMiddleware({ settings: { providerOptions: { openai: { store: false } } } }),
        });
    }
    return createOpenAICompatible({ ...settings, name: "opencode", includeUsage: true, supportsStructuredOutputs: true })(modelId);
}
