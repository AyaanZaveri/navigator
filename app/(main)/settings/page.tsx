"use client";

import { useCallback, useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { Cerebras, Gemini, Groq, Ollama, OpenAI, OpenRouter } from "@lobehub/icons";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { OpenCodeIcon } from "@/components/opencode-icon";
import { ModelIcon } from "@/components/model-icon";
import { HomeGradientBackground } from "@/components/home-gradient-background";
import { Switch } from "@/components/ui/switch";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Combobox,
    ComboboxContent,
    ComboboxEmpty,
    ComboboxInput,
    ComboboxItem,
    ComboboxList,
    useComboboxAnchor,
} from "@/components/ui/combobox";
import {
    InputGroup,
    InputGroupAddon,
    InputGroupButton,
    InputGroupInput,
} from "@/components/ui/input-group";
import {
    Field,
    FieldContent,
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
} from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import {
    type AIProvider,
    CerebrasReasoningEffort,
    OpenRouterReasoningEffort,
    useSettings,
} from "@/contexts/settings-context";
import { OPENAI_DEFAULT_BASE_URL, type ModelsDevModel } from "@/lib/models-dev";

const OPENAI_BASE_URL_STORAGE_KEY = "navigator-openai-base-url";
const MODELS_DEV_PROVIDER_CACHE_PREFIX = "navigator-modelsdev-provider:";

type ModelsDevProviderResponse = {
    provider: {
        id: string;
        name: string;
        apiBaseUrl: string;
        logoUrl: string;
        models: ModelsDevModel[];
    } | null;
    error?: string;
};

function normalizeBaseUrl(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return "";

    try {
        const normalized = new URL(trimmed);
        const pathname = normalized.pathname.replace(/\/+$/, "");
        return `${normalized.origin}${pathname}`.toLowerCase();
    } catch {
        return trimmed.replace(/\/+$/, "").toLowerCase();
    }
}

function getModelsDevProviderCacheKey(baseUrl: string): string | null {
    const normalized = normalizeBaseUrl(baseUrl);
    if (!normalized) return null;
    return `${MODELS_DEV_PROVIDER_CACHE_PREFIX}${normalized}`;
}

const PROVIDERS: Array<{ value: AIProvider; name: string; description: string; icon: ComponentType<{ className?: string }> }> = [
    { value: "openai", name: "OpenAI", icon: OpenAI, description: "Connect OpenAI or another compatible API." },
    { value: "gemini", name: "Gemini", icon: Gemini.Color, description: "Use Google's Gemini models." },
    { value: "ollama", name: "Ollama", icon: Ollama, description: "Use models running on your own Ollama instance." },
    { value: "groq", name: "Groq", icon: Groq, description: "Use models hosted by Groq." },
    { value: "openrouter", name: "OpenRouter", icon: OpenRouter, description: "Access models from multiple providers through OpenRouter." },
    { value: "cerebras", name: "Cerebras", icon: Cerebras, description: "Use models hosted by Cerebras." },
    { value: "opencode", name: "OpenCode Go", icon: OpenCodeIcon, description: "Use models included in your OpenCode Go subscription." },
];

type ModelOption = ModelsDevModel;

type SettingsInputProps = {
    id: string;
    label: string;
    value: string;
    onValueChange: (_value: string) => void;
    placeholder?: string;
    description: ReactNode;
    type?: "text" | "url";
};

function SettingsInput({ id, label, value, onValueChange, placeholder, description, type = "text" }: SettingsInputProps) {
    return (
        <Field>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            <InputGroup>
                <InputGroupInput
                    id={id}
                    type={type}
                    value={value}
                    onChange={(event) => onValueChange(event.target.value)}
                    placeholder={placeholder}
                    aria-describedby={`${id}-description`}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                />
            </InputGroup>
            <FieldDescription id={`${id}-description`}>{description}</FieldDescription>
        </Field>
    );
}

function ApiKeyInput({ id, value, onValueChange, keyUrl }: {
    id: string;
    value: string;
    onValueChange: (_value: string) => void;
    keyUrl?: string;
}) {
    const [visible, setVisible] = useState(false);

    return (
        <Field>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <FieldLabel htmlFor={id}>API key</FieldLabel>
                {keyUrl && (
                    <a
                        href={keyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 whitespace-nowrap text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
                    >
                        Get an API key
                    </a>
                )}
            </div>
            <InputGroup>
                <InputGroupInput
                    id={id}
                    type={visible ? "text" : "password"}
                    value={value}
                    onChange={(event) => onValueChange(event.target.value)}
                    placeholder="Enter your API key"
                    aria-describedby={`${id}-description`}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                />
                <InputGroupAddon align="inline-start">
                    <KeyRound aria-hidden="true" />
                </InputGroupAddon>
                <InputGroupAddon align="inline-end">
                    <InputGroupButton
                        size="icon-xs"
                        aria-label={visible ? "Hide API key" : "Show API key"}
                        aria-controls={id}
                        onClick={() => setVisible((current) => !current)}
                    >
                        {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                    </InputGroupButton>
                </InputGroupAddon>
            </InputGroup>
            <FieldDescription id={`${id}-description`}>
                Stored in this browser and sent to your provider.
            </FieldDescription>
        </Field>
    );
}

type SettingsSelectProps = {
    id: string;
    label: string;
    value: string;
    onValueChange: (_value: string) => void;
    options: ModelOption[];
    description?: ReactNode;
    loading?: boolean;
    error?: string | null;
    disabled?: boolean;
};

function SettingsSelect({ id, label, value, onValueChange, options, description, loading, error, disabled }: SettingsSelectProps) {
    const unavailable = disabled || (loading && options.length === 0);
    const describedBy = [
        (loading || description) && `${id}-description`,
        error && `${id}-error`,
    ].filter(Boolean).join(" ") || undefined;

    return (
        <Field data-disabled={unavailable || undefined}>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            <Select value={value} onValueChange={onValueChange} disabled={unavailable}>
                <SelectTrigger
                    id={id}
                    className="w-full min-w-0"
                    aria-describedby={describedBy}
                    aria-busy={loading || undefined}
                >
                    <SelectValue placeholder={loading ? "Loading models…" : `Select ${label.toLowerCase()}`} />
                </SelectTrigger>
                <SelectContent className="overscroll-contain">
                    <SelectGroup>
                        {options.map((option) => (
                            <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>
                        ))}
                        {options.length === 0 && (
                            <SelectItem value="__no_options__" disabled>No options available</SelectItem>
                        )}
                    </SelectGroup>
                </SelectContent>
            </Select>
            {(loading || description) && (
                <FieldDescription id={`${id}-description`} role="status">
                    {loading ? "Loading available models…" : description}
                </FieldDescription>
            )}
            {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
        </Field>
    );
}

function ModelCombobox({ id, value, onValueChange, options, description, loading, error, disabled }: Omit<SettingsSelectProps, "label">) {
    const anchor = useComboboxAnchor();
    const selected = options.find((option) => option.id === value) ?? (value ? { id: value, name: value } : null);
    const unavailable = disabled || (loading && options.length === 0);
    const describedBy = [
        (loading || description) && `${id}-description`,
        error && `${id}-error`,
    ].filter(Boolean).join(" ") || undefined;

    return (
        <Field data-disabled={unavailable || undefined}>
            <FieldLabel htmlFor={id}>Model</FieldLabel>
            <Combobox
                items={options}
                value={selected}
                onValueChange={(model) => {
                    if (model) onValueChange(model.id);
                }}
                itemToStringLabel={(model) => model.name}
                itemToStringValue={(model) => model.id}
                isItemEqualToValue={(model, current) => model.id === current.id}
                filter={(model, query) => {
                    const normalize = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
                    return normalize(`${model.name} ${model.id}`).includes(normalize(query));
                }}
                autoHighlight
                disabled={unavailable}
            >
                <div ref={anchor}>
                    <ComboboxInput
                        id={id}
                        className="w-full min-w-0"
                        placeholder={loading ? "Loading models…" : "Search models…"}
                        aria-describedby={describedBy}
                        aria-busy={loading || undefined}
                        disabled={unavailable}
                    >
                        {selected && (
                            <InputGroupAddon align="inline-start">
                                <ModelIcon model={selected} />
                            </InputGroupAddon>
                        )}
                    </ComboboxInput>
                </div>
                <ComboboxContent anchor={anchor} className="min-w-0">
                    <ComboboxEmpty>{loading ? "Loading models…" : "No models found."}</ComboboxEmpty>
                    <ComboboxList className="max-h-[min(16rem,var(--available-height))] overscroll-contain">
                        {(model: ModelOption) => (
                            <ComboboxItem key={model.id} value={model} title={model.name}>
                                <ModelIcon model={model} />
                                <span className="min-w-0 truncate">{model.name}</span>
                            </ComboboxItem>
                        )}
                    </ComboboxList>
                </ComboboxContent>
            </Combobox>
            {(loading || description) && (
                <FieldDescription id={`${id}-description`} role="status">
                    {loading ? "Loading available models…" : description}
                </FieldDescription>
            )}
            {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
        </Field>
    );
}

export default function SettingsPage() {
    const {
        navigatorEnabled,
        setNavigatorEnabled,
        aiProvider,
        setAiProvider,
        openaiBaseUrl,
        setOpenaiBaseUrl,
        openaiModel,
        setOpenaiModel,
        geminiModel,
        setGeminiModel,
        ollamaBaseUrl,
        setOllamaBaseUrl,
        ollamaModel,
        setOllamaModel,
        groqModel,
        setGroqModel,
        openrouterModel,
        setOpenrouterModel,
        openrouterReasoningEffort,
        setOpenrouterReasoningEffort,
        cerebrasModel,
        setCerebrasModel,
        cerebrasReasoningEffort,
        setCerebrasReasoningEffort,
        opencodeModel,
        setOpencodeModel,
        openaiApiKey,
        setOpenaiApiKey,
        googleApiKey,
        setGoogleApiKey,
        groqApiKey,
        setGroqApiKey,
        openrouterApiKey,
        setOpenrouterApiKey,
        cerebrasApiKey,
        setCerebrasApiKey,
        opencodeApiKey,
        setOpencodeApiKey,
    } = useSettings();

    const [cerebrasModels, setCerebrasModels] = useState<string[]>([]);
    const [isLoadingCerebrasModels, setIsLoadingCerebrasModels] = useState(false);
    const [cerebrasModelsError, setCerebrasModelsError] = useState<string | null>(
        null
    );
    const [modelsDevProvider, setModelsDevProvider] =
    useState<ModelsDevProviderResponse["provider"]>(null);
    const [isLoadingModelsDevProvider, setIsLoadingModelsDevProvider] =
    useState(false);
    const [modelsDevProviderError, setModelsDevProviderError] = useState<
    string | null
  >(null);
    const [geminiModelsProvider, setGeminiModelsProvider] =
    useState<ModelsDevProviderResponse["provider"]>(null);
    const [isLoadingGeminiModels, setIsLoadingGeminiModels] = useState(false);
    const [geminiModelsError, setGeminiModelsError] = useState<string | null>(
        null
    );
    const [opencodeModelsProvider, setOpencodeModelsProvider] =
    useState<ModelsDevProviderResponse["provider"]>(null);
    const [isLoadingOpencodeModels, setIsLoadingOpencodeModels] = useState(false);
    const [opencodeModelsError, setOpencodeModelsError] = useState<string | null>(
        null
    );

    const fetchModelsDevProvider = useCallback(async () => {
        let trimmedBaseUrl = openaiBaseUrl.trim();
        if (
            typeof window !== "undefined" &&
      (!trimmedBaseUrl || trimmedBaseUrl === OPENAI_DEFAULT_BASE_URL)
        ) {
            const storedBaseUrl =
        window.localStorage.getItem(OPENAI_BASE_URL_STORAGE_KEY)?.trim() ?? "";
            if (storedBaseUrl) {
                trimmedBaseUrl = storedBaseUrl;
            }
        }

        if (!trimmedBaseUrl) {
            setModelsDevProvider(null);
            setModelsDevProviderError(null);
            return;
        }

        if (typeof window !== "undefined") {
            const cacheKey = getModelsDevProviderCacheKey(trimmedBaseUrl);
            if (cacheKey) {
                const cachedProvider = window.localStorage.getItem(cacheKey);
                if (cachedProvider) {
                    try {
                        const parsed = JSON.parse(
                            cachedProvider
                        ) as ModelsDevProviderResponse["provider"];
                        setModelsDevProvider(parsed);
                    } catch {
                        window.localStorage.removeItem(cacheKey);
                    }
                }
            }
        }

        setIsLoadingModelsDevProvider(true);
        setModelsDevProviderError(null);

        try {
            const params = new URLSearchParams({ baseUrl: trimmedBaseUrl });
            const response = await fetch(`/api/models-dev/provider?${params.toString()}`);
            const data = (await response.json()) as ModelsDevProviderResponse;

            if (!response.ok) {
                throw new Error(
                    data.error || "Failed to load provider info from models.dev."
                );
            }

            setModelsDevProvider(data.provider ?? null);
            if (typeof window !== "undefined") {
                const cacheKey = getModelsDevProviderCacheKey(trimmedBaseUrl);
                if (cacheKey) {
                    if (data.provider) {
                        window.localStorage.setItem(cacheKey, JSON.stringify(data.provider));
                    } else {
                        window.localStorage.removeItem(cacheKey);
                    }
                }
            }
        } catch (error) {
            console.error("Failed to load models.dev provider info:", error);
            setModelsDevProviderError(
                error instanceof Error
                    ? error.message
                    : "Failed to load provider info from models.dev."
            );
        } finally {
            setIsLoadingModelsDevProvider(false);
        }
    }, [openaiBaseUrl]);

    const fetchGeminiModels = useCallback(async () => {
        setIsLoadingGeminiModels(true);
        setGeminiModelsError(null);

        try {
            const params = new URLSearchParams({ providerId: "google" });
            const response = await fetch(`/api/models-dev/provider?${params.toString()}`);
            const data = (await response.json()) as ModelsDevProviderResponse;

            if (!response.ok) {
                throw new Error(data.error || "Failed to load Gemini models.");
            }

            setGeminiModelsProvider(data.provider ?? null);
        } catch (error) {
            console.error("Failed to load Gemini models:", error);
            setGeminiModelsProvider(null);
            setGeminiModelsError(
                error instanceof Error ? error.message : "Failed to load Gemini models."
            );
        } finally {
            setIsLoadingGeminiModels(false);
        }
    }, []);

    const fetchCerebrasModels = useCallback(async () => {
        if (!cerebrasApiKey.trim()) {
            setCerebrasModels([]);
            setCerebrasModelsError(null);
            return;
        }

        setIsLoadingCerebrasModels(true);
        setCerebrasModelsError(null);

        try {
            const response = await fetch("/api/cerebras/models", {
                method: "GET",
                headers: {
                    "x-cerebras-api-key": cerebrasApiKey.trim(),
                },
            });

            const data = (await response.json()) as {
                models?: string[];
                error?: string;
            };

            if (!response.ok) {
                throw new Error(data.error || "Failed to fetch Cerebras models.");
            }

            setCerebrasModels(Array.isArray(data.models) ? data.models : []);
        } catch (error) {
            console.error("Failed to load Cerebras models:", error);
            setCerebrasModels([]);
            setCerebrasModelsError(
                error instanceof Error
                    ? error.message
                    : "Failed to load Cerebras models."
            );
        } finally {
            setIsLoadingCerebrasModels(false);
        }
    }, [cerebrasApiKey]);

    useEffect(() => {
        if (aiProvider !== "openai") return;
        const timeout = window.setTimeout(() => void fetchModelsDevProvider(), 300);
        return () => window.clearTimeout(timeout);
    }, [aiProvider, fetchModelsDevProvider]);

    useEffect(() => {
        if (aiProvider !== "gemini") return;
        const timeout = window.setTimeout(() => void fetchGeminiModels(), 0);
        return () => window.clearTimeout(timeout);
    }, [aiProvider, fetchGeminiModels]);

    useEffect(() => {
        if (aiProvider !== "cerebras") return;
        const timeout = window.setTimeout(() => void fetchCerebrasModels(), 400);
        return () => window.clearTimeout(timeout);
    }, [aiProvider, fetchCerebrasModels]);

    useEffect(() => {
        if (aiProvider !== "opencode") return;

        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 15_000);
        let active = true;

        async function fetchOpencodeModels() {
            setIsLoadingOpencodeModels(true);
            setOpencodeModelsError(null);

            try {
                const params = new URLSearchParams({ providerId: "opencode-go" });
                const response = await fetch(`/api/models-dev/provider?${params}`, {
                    signal: controller.signal,
                });
                const data = (await response.json()) as ModelsDevProviderResponse;

                if (!response.ok) {
                    throw new Error(data.error || "Failed to load OpenCode Go models.");
                }
                if (!data.provider?.models.length) {
                    throw new Error("No OpenCode Go models are currently available.");
                }

                if (active) setOpencodeModelsProvider(data.provider);
            } catch (error) {
                if (active) {
                    setOpencodeModelsError(
                        controller.signal.aborted
                            ? "Loading models timed out. Your saved model is still available."
                            : error instanceof Error
                                ? error.message
                                : "Failed to load OpenCode Go models."
                    );
                }
            } finally {
                window.clearTimeout(timeout);
                if (active) setIsLoadingOpencodeModels(false);
            }
        }

        void fetchOpencodeModels();
        return () => {
            active = false;
            window.clearTimeout(timeout);
            controller.abort();
        };
    }, [aiProvider]);

    const opencodeModelOptions = useMemo(() => {
        const providerModels = opencodeModelsProvider?.models ?? [];
        if (!opencodeModel || providerModels.some((model) => model.id === opencodeModel)) {
            return providerModels;
        }

        return [{ id: opencodeModel, name: opencodeModel }, ...providerModels];
    }, [opencodeModel, opencodeModelsProvider]);

    const cerebrasModelOptions = useMemo(() => {
        if (!cerebrasModel) return cerebrasModels;
        if (cerebrasModels.includes(cerebrasModel)) return cerebrasModels;
        return [cerebrasModel, ...cerebrasModels];
    }, [cerebrasModel, cerebrasModels]);

    const openaiModelOptions = useMemo(() => {
        const providerModels = modelsDevProvider?.models ?? [];
        if (!openaiModel) return providerModels;
        if (providerModels.some((model) => model.id === openaiModel)) {
            return providerModels;
        }

        return [
            {
                id: openaiModel,
                name: openaiModel,
            },
            ...providerModels,
        ];
    }, [modelsDevProvider, openaiModel]);

    const geminiModelOptions = useMemo(() => {
        const providerModels = geminiModelsProvider?.models ?? [];
        if (!geminiModel) return providerModels;
        if (providerModels.some((model) => model.id === geminiModel)) {
            return providerModels;
        }

        return [
            {
                id: geminiModel,
                name: geminiModel,
            },
            ...providerModels,
        ];
    }, [geminiModel, geminiModelsProvider]);

    const selectedProvider = PROVIDERS.find((provider) => provider.value === aiProvider)!;
    const apiKeySettings = {
        openai: { value: openaiApiKey, onValueChange: setOpenaiApiKey, keyUrl: openaiBaseUrl.replace(/\/+$/, "") === OPENAI_DEFAULT_BASE_URL ? "https://platform.openai.com/api-keys" : undefined },
        gemini: { value: googleApiKey, onValueChange: setGoogleApiKey, keyUrl: "https://aistudio.google.com/apikey" },
        groq: { value: groqApiKey, onValueChange: setGroqApiKey, keyUrl: "https://console.groq.com/keys" },
        openrouter: { value: openrouterApiKey, onValueChange: setOpenrouterApiKey, keyUrl: "https://openrouter.ai/keys" },
        cerebras: { value: cerebrasApiKey, onValueChange: setCerebrasApiKey, keyUrl: "https://cloud.cerebras.ai" },
        opencode: { value: opencodeApiKey, onValueChange: setOpencodeApiKey, keyUrl: "https://opencode.ai/auth" },
    };
    const modelSettings: Record<AIProvider, Omit<SettingsSelectProps, "id" | "label" | "options"> & { options?: ModelOption[]; placeholder?: string }> = {
        openai: {
            value: openaiModel, onValueChange: setOpenaiModel, options: openaiModelOptions,
            loading: isLoadingModelsDevProvider, error: modelsDevProviderError,
            description: modelsDevProvider ? `Models available through ${modelsDevProvider.name}.` : "Choose a model for your API endpoint.",
        },
        gemini: {
            value: geminiModel, onValueChange: setGeminiModel, options: geminiModelOptions,
            loading: isLoadingGeminiModels, error: geminiModelsError,
            description: "Choose the Gemini model Navigator uses for responses.",
        },
        ollama: {
            value: ollamaModel, onValueChange: setOllamaModel, placeholder: "phi3",
            description: <>Enter the name of a model installed in Ollama. <a href="https://ollama.com/search?c=tools" target="_blank" rel="noopener noreferrer">Browse models</a>.</>,
        },
        groq: {
            value: groqModel, onValueChange: setGroqModel, placeholder: "llama3-8b-8192",
            description: <>Enter a model ID from <a href="https://console.groq.com/docs/models" target="_blank" rel="noopener noreferrer">Groq&apos;s model list</a>.</>,
        },
        openrouter: {
            value: openrouterModel, onValueChange: setOpenrouterModel, placeholder: "qwen/qwen3-coder:free",
            description: <>Enter a model ID from <a href="https://openrouter.ai/models?fmt=cards&supported_parameters=tools" target="_blank" rel="noopener noreferrer">OpenRouter&apos;s model list</a>.</>,
        },
        cerebras: {
            value: cerebrasModel, onValueChange: setCerebrasModel,
            options: cerebrasModelOptions.map((id) => ({ id, name: id })),
            loading: isLoadingCerebrasModels, error: cerebrasModelsError, disabled: !cerebrasApiKey.trim(),
            description: cerebrasApiKey.trim() ? "Choose the Cerebras model Navigator uses for responses." : "Add your API key to load available models.",
        },
        opencode: {
            value: opencodeModel, onValueChange: setOpencodeModel, options: opencodeModelOptions,
            loading: isLoadingOpencodeModels, error: opencodeModelsError,
        },
    };
    const currentModel = modelSettings[aiProvider];

    return (
        <div className="relative px-[var(--page-gutter)] py-6">
            <HomeGradientBackground />

            <div className="relative z-10 flex w-full max-w-4xl flex-col gap-8 pb-10">
                <header className="flex flex-col gap-2">
                    <h1 className="font-poppins text-3xl font-semibold tracking-tight">Settings</h1>
                </header>

                <section aria-labelledby="navigator-settings-title" className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:gap-12">
                    <div className="flex flex-col gap-2">
                        <h2 id="navigator-settings-title" className="text-base font-medium">Navigator</h2>
                        <p className="text-sm leading-relaxed text-muted-foreground">
                            Find and play movies and shows with natural language.
                        </p>
                    </div>

                    <FieldGroup className="min-w-0 gap-6">
                        <Field orientation="horizontal">
                            <FieldContent>
                                <FieldLabel htmlFor="navigator-enabled">Enable Navigator</FieldLabel>
                                <FieldDescription id="navigator-enabled-description">
                                    Show the assistant and enable its keyboard shortcuts.
                                </FieldDescription>
                            </FieldContent>
                            <Switch
                                id="navigator-enabled"
                                checked={navigatorEnabled}
                                onCheckedChange={setNavigatorEnabled}
                                aria-describedby="navigator-enabled-description"
                            />
                        </Field>

                        {navigatorEnabled && (
                            <>
                                <Separator />
                                <Field>
                                    <FieldLabel htmlFor="ai-provider">AI provider</FieldLabel>
                                    <Select value={aiProvider} onValueChange={setAiProvider}>
                                        <SelectTrigger id="ai-provider" className="w-full min-w-0" aria-describedby="ai-provider-description">
                                            <SelectValue placeholder="Select a provider" />
                                        </SelectTrigger>
                                        <SelectContent className="overscroll-contain">
                                            <SelectGroup>
                                                {PROVIDERS.map((provider) => {
                                                    const Icon = provider.icon;
                                                    return (
                                                        <SelectItem key={provider.value} value={provider.value}>
                                                            <span className="flex items-center gap-2">
                                                                <Icon />
                                                                {provider.name}
                                                            </span>
                                                        </SelectItem>
                                                    );
                                                })}
                                            </SelectGroup>
                                        </SelectContent>
                                    </Select>
                                    <FieldDescription id="ai-provider-description">{selectedProvider.description}</FieldDescription>
                                </Field>

                                {aiProvider === "openai" && (
                                    <SettingsInput
                                        id="openai-base-url"
                                        label="Base URL"
                                        type="url"
                                        value={openaiBaseUrl}
                                        onValueChange={setOpenaiBaseUrl}
                                        placeholder={OPENAI_DEFAULT_BASE_URL}
                                        description="Use the default OpenAI URL or an OpenAI-compatible endpoint."
                                    />
                                )}

                                {aiProvider === "ollama" ? (
                                    <SettingsInput
                                        id="ollama-base-url"
                                        label="Base URL"
                                        type="url"
                                        value={ollamaBaseUrl}
                                        onValueChange={setOllamaBaseUrl}
                                        placeholder="http://localhost:11434"
                                        description="The address where your Ollama instance is running."
                                    />
                                ) : (
                                    <ApiKeyInput key={aiProvider} id={`${aiProvider}-api-key`} {...apiKeySettings[aiProvider]} />
                                )}

                                {currentModel.options ? (
                                    <ModelCombobox key={aiProvider} id={`${aiProvider}-model`} {...currentModel} options={currentModel.options} />
                                ) : (
                                    <SettingsInput
                                        id={`${aiProvider}-model`}
                                        label="Model"
                                        value={currentModel.value}
                                        onValueChange={currentModel.onValueChange}
                                        placeholder={currentModel.placeholder}
                                        description={currentModel.description}
                                    />
                                )}

                                {aiProvider === "openrouter" && (
                                    <SettingsSelect
                                        id="openrouter-reasoning-effort"
                                        label="Reasoning effort"
                                        value={openrouterReasoningEffort}
                                        onValueChange={(value) => setOpenrouterReasoningEffort(value as OpenRouterReasoningEffort)}
                                        options={[
                                            { id: "default", name: "Model default" },
                                            { id: "none", name: "None" },
                                            { id: "minimal", name: "Minimal" },
                                            { id: "low", name: "Low" },
                                            { id: "medium", name: "Medium" },
                                            { id: "high", name: "High" },
                                            { id: "xhigh", name: "Extra high" },
                                        ]}
                                        description="Set how much reasoning supported models use before responding."
                                    />
                                )}

                                {aiProvider === "cerebras" && (
                                    <SettingsSelect
                                        id="cerebras-reasoning-effort"
                                        label="Reasoning effort"
                                        value={cerebrasReasoningEffort}
                                        onValueChange={(value) => setCerebrasReasoningEffort(value as CerebrasReasoningEffort)}
                                        options={[
                                            { id: "default", name: "Model default" },
                                            { id: "low", name: "Low" },
                                            { id: "medium", name: "Medium" },
                                            { id: "high", name: "High" },
                                        ]}
                                        description="Set how much reasoning supported models use before responding."
                                    />
                                )}
                            </>
                        )}
                    </FieldGroup>
                </section>
            </div>
        </div>
    );
}
