import type { LanguageModel } from "ai";

/** Keep interactive routing/index selection light without changing the chosen model. */
export function navigatorRoutingSettings(model: LanguageModel, effort: "minimal" | "low" = "minimal") {
    if (typeof model === "string" || !model.modelId.startsWith("muse-spark-") || !model.provider.startsWith("opencode-responses")) return {};
    // The SDK does not recognize this custom model ID as a reasoning model automatically.
    return { providerOptions: { openai: { forceReasoning: true, reasoningEffort: effort } } };
}
