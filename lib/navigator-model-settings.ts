import type { LanguageModel, generateText } from "ai";

/** Keep interactive routing/index selection light without changing the chosen model. */
export function navigatorRoutingSettings(model: LanguageModel, effort: "minimal" | "low" = "minimal"): { providerOptions?: Parameters<typeof generateText>[0]["providerOptions"] } {
    if (typeof model === "string") return {};
    // These are short classification/extraction tasks, not open-ended reasoning.
    // Compatible providers namespace their options by the provider name (opencode).
    if (model.provider.startsWith("opencode.") && /^(deepseek-|glm-)/.test(model.modelId)) {
        return { providerOptions: { opencode: { reasoningEffort: "low" } } };
    }
    if (!model.modelId.startsWith("muse-spark-") || !model.provider.startsWith("opencode-responses")) return {};
    // The SDK does not recognize this custom model ID as a reasoning model automatically.
    return { providerOptions: { openai: { forceReasoning: true, reasoningEffort: effort } } };
}
