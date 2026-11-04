import type { LanguageModel, generateText } from "ai";

/** Keep interactive routing/index selection light without changing the chosen model. */
export function navigatorRoutingSettings(model: LanguageModel, effort: "minimal" | "low" = "minimal", purpose: "structured" | "tools" = "structured"): { providerOptions?: Parameters<typeof generateText>[0]["providerOptions"] } {
    if (typeof model === "string") return {};
    // These are short classification/extraction tasks, not open-ended reasoning.
    // Compatible providers namespace their options by the provider name (opencode).
    if (model.provider.startsWith("opencode.") && /^(deepseek-|glm-)/.test(model.modelId)) {
        // DeepSeek documents that low STILL enables thinking; none disables it.
        // These bounded app routing/extraction tasks need a final answer, not an
        // unbounded thinking trace that exhausts a small output budget.
        // OpenCode's native streaming tool path stalled with none in live tests;
        // retain its tested low setting there, separate from structured analysis.
        return { providerOptions: { opencode: { reasoningEffort: model.modelId.startsWith("deepseek-") && purpose === "structured" ? "none" : "low" } } };
    }
    if (!model.modelId.startsWith("muse-spark-") || !model.provider.startsWith("opencode-responses")) return {};
    // The SDK does not recognize this custom model ID as a reasoning model automatically.
    return { providerOptions: { openai: { forceReasoning: true, reasoningEffort: effort } } };
}
