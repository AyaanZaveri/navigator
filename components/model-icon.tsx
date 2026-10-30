import type { ComponentType } from "react";
import {
    Claude,
    Cohere,
    DeepSeek,
    Gemini,
    Grok,
    Hunyuan,
    Kimi,
    Meta,
    Minimax,
    Mistral,
    Nvidia,
    OpenAI,
    Qwen,
    Stepfun,
    Zhipu,
} from "@lobehub/icons";
import type { ModelsDevModel } from "@/lib/models-dev";

const MODEL_ICONS: Array<[RegExp, ComponentType]> = [
    [/^(gpt|chatgpt|o[1-9](?:-|$))/, OpenAI],
    [/^claude/, Claude],
    [/^(gemini|gemma)/, Gemini],
    [/^deepseek/, DeepSeek],
    [/^(glm|z-ai|zhipu)/, Zhipu],
    [/^kimi/, Kimi],
    [/^minimax/, Minimax],
    [/^qwen/, Qwen],
    [/^grok/, Grok],
    [/^step/, Stepfun],
    [/^(hy[0-9]?|hunyuan)/, Hunyuan],
    [/^(llama|muse)/, Meta],
    [/^(mistral|mixtral|codestral|devstral|magistral|pixtral)/, Mistral],
    [/^(command|cohere)/, Cohere],
    [/^nemotron/, Nvidia],
];

export function ModelIcon({ model, fallbackIcon }: { model: ModelsDevModel; fallbackIcon: ComponentType<{ className?: string }> }) {
    const identities = [model.family, model.id.split("/").at(-1)]
        .filter((identity): identity is string => Boolean(identity))
        .map((identity) => identity.toLowerCase());
    const Icon = MODEL_ICONS.find(([pattern]) => identities.some((identity) => pattern.test(identity)))?.[1] ?? fallbackIcon;

    return (
        <span aria-hidden="true" className="flex size-4 shrink-0 items-center justify-center [&>svg]:size-4">
            <Icon />
        </span>
    );
}
