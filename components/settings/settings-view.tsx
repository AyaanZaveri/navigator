"use client";

import { useCallback, useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { Cerebras, Gemini, Groq, Ollama, OpenAI, OpenRouter } from "@lobehub/icons";
import { Eye, EyeOff, KeyRound, Link2, Cpu } from "lucide-react";
import Link from "next/link";
import { OpenCodeIcon } from "@/components/opencode-icon";
import { ModelIcon } from "@/components/model-icon";
import { Switch } from "@/components/arc/switch/switch";
import { Select } from "@/components/arc/select/select";
import { Combobox } from "@/components/arc/combobox/combobox";
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
import {
    type AIProvider,
    CerebrasReasoningEffort,
    OpenRouterReasoningEffort,
    useSettings,
} from "@/contexts/settings-context";
import { OPENAI_DEFAULT_BASE_URL, type ModelsDevModel } from "@/lib/models-dev";
import { Button } from "@/components/ui/button";
import { getArtworkSettings, saveArtworkToken, removeArtworkToken, type ArtworkSettingsState } from "@/app/actions/artwork-settings";
import { PlaybackSettings } from "@/components/playback-settings";
import { PlaybackLanguageSettings } from "@/components/playback-language-settings";
import { SubtitleSettings } from "@/components/subtitle-settings";
import { TinyFishIcon } from "@/components/icons/tinyfish";
import { getWebSearchSettings, saveWebSearchKey, removeWebSearchKey, setWebSearchEnabled } from "@/app/actions/web-search-settings";
import { useConnectionCredential } from "@/components/settings/use-connection-credential";
import { CONNECTION_CREDENTIALS_EVENT } from "@/lib/browser-connection-credentials";
import type { SettingsCategory } from "@/lib/settings-navigation";
import styles from "@/app/(main)/settings/settings.module.css";

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

const PROVIDERS: Array<{ value: AIProvider; name: string; icon: ComponentType<{ className?: string }> }> = [
    { value: "openai", name: "OpenAI", icon: OpenAI },
    { value: "gemini", name: "Gemini", icon: Gemini.Color },
    { value: "ollama", name: "Ollama", icon: Ollama },
    { value: "groq", name: "Groq", icon: Groq },
    { value: "openrouter", name: "OpenRouter", icon: OpenRouter },
    { value: "cerebras", name: "Cerebras", icon: Cerebras },
    { value: "opencode", name: "OpenCode Go", icon: OpenCodeIcon },
];

type ModelOption = ModelsDevModel;

type SettingsInputProps = {
    id: string;
    label: string;
    value: string;
    onValueChange: (_value: string) => void;
    placeholder?: string;
    description?: ReactNode;
    type?: "text" | "url";
};

function SettingsInput({ id, label, value, onValueChange, placeholder, description, type = "text" }: SettingsInputProps) {
    return (
        <Field>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            <InputGroup className={styles.apiKeyInput}>
                <InputGroupInput
                    id={id}
                    type={type}
                    value={value}
                    onChange={(event) => onValueChange(event.target.value)}
                    placeholder={placeholder}
                    aria-describedby={description ? `${id}-description` : undefined}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                />
                <InputGroupAddon align="inline-start">
                    {type === "url" ? <Link2 aria-hidden="true" /> : <Cpu aria-hidden="true" />}
                </InputGroupAddon>
            </InputGroup>
            {description && <FieldDescription id={`${id}-description`}>{description}</FieldDescription>}
        </Field>
    );
}

function ApiKeyInput({ id, value, onValueChange, keyUrl, label = "API key", description, placeholder = "Enter your API key", keyLinkLabel = "Get an API key", error, disabled, icon }: {
    id: string;
    value: string;
    onValueChange: (_value: string) => void;
    keyUrl?: string;
    label?: string;
    description?: string;
    placeholder?: string;
    keyLinkLabel?: string;
    error?: string | null;
    disabled?: boolean;
    icon?: ReactNode;
}) {
    const [visible, setVisible] = useState(false);

    return (
        <Field data-invalid={!!error || undefined} data-disabled={disabled || undefined}>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <FieldLabel htmlFor={id}>{label}</FieldLabel>
                {keyUrl && (
                    <a
                        href={keyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`${styles.keyLink} min-w-0 underline underline-offset-4 hover:text-foreground`}
                    >
                        {keyLinkLabel}
                    </a>
                )}
            </div>
            <InputGroup className={styles.apiKeyInput}>
                <InputGroupInput
                    id={id}
                    type={visible ? "text" : "password"}
                    value={value}
                    onChange={(event) => onValueChange(event.target.value)}
                    placeholder={placeholder}
                    aria-describedby={[description && `${id}-description`, error && `${id}-error`].filter(Boolean).join(" ") || undefined}
                    aria-invalid={!!error || undefined}
                    disabled={disabled}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                />
                <InputGroupAddon align="inline-start">
                    {icon || <KeyRound aria-hidden="true" />}
                </InputGroupAddon>
                <InputGroupAddon align="inline-end">
                    <InputGroupButton
                        size="icon-xs"
                        type="button"
                        disabled={disabled}
                        aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
                        aria-controls={id}
                        aria-pressed={visible}
                        onClick={() => setVisible((current) => !current)}
                    >
                        {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                    </InputGroupButton>
                </InputGroupAddon>
            </InputGroup>
            {description && <FieldDescription id={`${id}-description`}>
                {description}
            </FieldDescription>}
            {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
        </Field>
    );
}

function WebSearchSettings({ variant }: { variant: "preference" | "connection" }) {
    const [state, setState] = useState<Awaited<ReturnType<typeof getWebSearchSettings>>>({ configured: false, personal: false, enabled: true });
    const { value: key, setValue: setKey, persist: persistKey } = useConnectionCredential("tinyfish");
    const [loading, setLoading] = useState(true);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState("");
    useEffect(() => {
        let active = true;
        const load = () => getWebSearchSettings().then(value => { if (active) setState(value); })
            .catch(() => { if (active) setError("Couldn’t load web search settings."); })
            .finally(() => { if (active) setLoading(false); });
        void load();
        window.addEventListener(CONNECTION_CREDENTIALS_EVENT, load);
        return () => { active = false; window.removeEventListener(CONNECTION_CREDENTIALS_EVENT, load); };
    }, []);
    async function update(operation: "save" | "remove" | "toggle", enabled?: boolean) {
        setPending(true); setError(null); setStatus("");
        try {
            const result = operation === "save" ? await saveWebSearchKey(key)
                : operation === "remove" ? await removeWebSearchKey() : await setWebSearchEnabled(!!enabled);
            if (!result.success) { setError(result.error); return; }
            setState({ configured: result.configured, personal: result.personal, enabled: result.enabled });
            if (operation === "save") persistKey(key.trim());
            if (operation === "remove") persistKey("");
            setStatus(operation === "save" ? "Key saved." : operation === "remove" ? "Key removed." : result.enabled ? "Web search enabled." : "Web search disabled.");
        } catch { setError("Couldn’t update web search. Try again."); }
        finally { setPending(false); }
    }
    return <section aria-label={variant === "connection" ? "TinyFish connection" : "Web search"} className={styles.section}>
        {variant === "connection" && <div className={styles.connectionHeader}>
            <h2>TinyFish</h2>
        </div>}
        <div className={`flex min-w-0 flex-col ${variant === "preference" ? "gap-2" : "gap-4"}`}>
            {variant === "preference" && <Field orientation="horizontal">
                <FieldContent><FieldLabel htmlFor="tinyfish-web-search"><TinyFishIcon size={16} className="shrink-0" />Use TinyFish web search</FieldLabel></FieldContent>
                <Switch id="tinyfish-web-search" checked={state.enabled && state.configured} disabled={loading || pending || !state.configured}
                    onCheckedChange={enabled => void update("toggle", enabled)} />
            </Field>}
            {variant === "preference" && error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            {variant === "preference" && !loading && !state.configured && <p className={styles.description}>
                <Link href="/settings/connections" className={styles.keyLink}>Connect TinyFish</Link> to enable web search.
            </p>}
            {variant === "connection" && <form className="min-w-0" aria-busy={loading || pending} onSubmit={event => { event.preventDefault(); if (!pending && key.trim()) void update("save"); }}>
                <FieldGroup className="gap-4">
                    <ApiKeyInput id="tinyfish-api-key" label="TinyFish API key" value={key} icon={<TinyFishIcon />}
                        onValueChange={value => { setKey(value); setError(null); setStatus(""); }} keyUrl="https://tinyfish.ai" keyLinkLabel="Get a TinyFish key"
                        placeholder="API key"
                        disabled={loading || pending} error={error} />
                    <div className="flex flex-wrap items-center gap-3">
                        <Button type="submit" variant="outline" size="sm" disabled={loading || pending || !key.trim()}>{pending ? "Updating…" : "Save key"}</Button>
                        {(state.personal || key) && <Button type="button" variant="ghost" disabled={loading || pending} onClick={() => void update("remove")}>Remove key</Button>}
                    </div>
                </FieldGroup>
            </form>}
            <p role="status" className={styles.feedback}>{status}</p>
        </div>
    </section>;
}

function ArtworkSettings() {
    const [state, setState] = useState<ArtworkSettingsState>({ configured: false, personal: false });
    const { value: token, setValue: setToken, persist: persistToken } = useConnectionCredential("tmdb");
    const [loading, setLoading] = useState(true);
    const [pending, setPending] = useState<"save" | "remove" | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState("");
    useEffect(() => {
        let active = true;
        const load = () => getArtworkSettings().then((value) => {
            if (active) setState(value);
        }).catch(() => {
            if (active) setError("Couldn’t load artwork settings. Reload the page to try again.");
        }).finally(() => { if (active) setLoading(false); });
        void load();
        window.addEventListener(CONNECTION_CREDENTIALS_EVENT, load);
        return () => { active = false; window.removeEventListener(CONNECTION_CREDENTIALS_EVENT, load); };
    }, []);

    async function update(operation: "save" | "remove") {
        setPending(operation);
        setError(null);
        setStatus("");
        try {
            const result = operation === "save" ? await saveArtworkToken(token) : await removeArtworkToken();
            if (!result.success) { setError(result.error); return; }
            setState({ configured: result.configured, personal: result.personal });
            persistToken(operation === "save" ? token.trim() : "");
            setStatus(operation === "save" ? "Token saved." : "Token removed.");
        } catch {
            setError("Couldn’t update artwork settings. Check your connection and try again.");
        } finally { setPending(null); }
    }

    return (
        <section aria-labelledby="artwork-settings-title" className={styles.section}>
            <div className={styles.connectionHeader}>
                <h2 id="artwork-settings-title">TMDB</h2>
            </div>
            <form className="min-w-0" aria-busy={loading || !!pending} onSubmit={(event) => { event.preventDefault(); if (!pending && token.trim()) void update("save"); }}>
                <FieldGroup className="gap-4">
                    <ApiKeyInput
                        id="tmdb-read-access-token"
                        label="TMDB read access token"
                        value={token}
                        onValueChange={(value) => { setToken(value); setError(null); setStatus(""); }}
                        keyUrl="https://www.themoviedb.org/settings/api"
                        keyLinkLabel="Get a TMDB token"
                        placeholder="Read access token"
                        disabled={loading || !!pending}
                        error={error}
                    />
                    <div className="flex flex-wrap items-center gap-3">
                        <Button type="submit" variant="outline" size="sm" disabled={loading || !!pending || !token.trim()}>{pending === "save" ? "Checking token…" : "Save token"}</Button>
                        {(state.personal || token) && <Button type="button" variant="ghost" disabled={loading || !!pending} onClick={() => void update("remove")}>{pending === "remove" ? "Removing…" : "Remove token"}</Button>}
                    </div>
                    <p role="status" className={styles.feedback}>{status}</p>
                </FieldGroup>
            </form>
        </section>
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
            <Select
                id={id}
                label={label}
                value={value}
                onValueChange={onValueChange}
                disabled={unavailable}
                aria-describedby={describedBy}
                aria-busy={loading || undefined}
                placeholder={loading ? "Loading models…" : `Select ${label.toLowerCase()}`}
                options={options.length ? options.map((option) => ({ value: option.id, label: option.name })) : [{ value: "__no_options__", label: "No options available", disabled: true }]}
            />
            {(loading || description) && (
                <FieldDescription id={`${id}-description`} role="status">
                    {loading ? "Loading available models…" : description}
                </FieldDescription>
            )}
            {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
        </Field>
    );
}

function ModelCombobox({ id, value, onValueChange, options, description, loading, error, disabled, providerIcon }: Omit<SettingsSelectProps, "label"> & { providerIcon: ComponentType<{ className?: string }> }) {
    const selected = options.find((option) => option.id === value) ?? (value ? { id: value, name: value } : null);
    const unavailable = disabled || (loading && options.length === 0);
    const describedBy = [
        (loading || description) && `${id}-description`,
        error && `${id}-error`,
    ].filter(Boolean).join(" ") || undefined;

    return (
        <Field data-disabled={unavailable || undefined}>
            <Combobox
                className={styles.providerInput}
                id={id}
                label="Model"
                value={value}
                onValueChange={onValueChange}
                options={(selected && !options.some((option) => option.id === value) ? [selected, ...options] : options).map((model) => ({
                    value: model.id,
                    label: model.name,
                    keywords: [model.id],
                    icon: <ModelIcon model={model} fallbackIcon={providerIcon} />,
                }))}
                placeholder={loading ? "Loading models…" : "Search models…"}
                emptyMessage={loading ? "Loading models…" : "No models found."}
                aria-describedby={describedBy}
                aria-busy={loading || undefined}
                disabled={unavailable}
            />
            {(loading || description) && (
                <FieldDescription id={`${id}-description`} role="status">
                    {loading ? "Loading available models…" : description}
                </FieldDescription>
            )}
            {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
        </Field>
    );
}

function NavigatorSettings() {
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
        },
        gemini: {
            value: geminiModel, onValueChange: setGeminiModel, options: geminiModelOptions,
            loading: isLoadingGeminiModels, error: geminiModelsError,
        },
        ollama: {
            value: ollamaModel, onValueChange: setOllamaModel, placeholder: "phi3",
            description: <a href="https://ollama.com/search?c=tools" target="_blank" rel="noopener noreferrer">Browse Ollama models</a>,
        },
        groq: {
            value: groqModel, onValueChange: setGroqModel, placeholder: "llama3-8b-8192",
            description: <a href="https://console.groq.com/docs/models" target="_blank" rel="noopener noreferrer">Browse Groq models</a>,
        },
        openrouter: {
            value: openrouterModel, onValueChange: setOpenrouterModel, placeholder: "qwen/qwen3-coder:free",
            description: <a href="https://openrouter.ai/models?fmt=cards&supported_parameters=tools" target="_blank" rel="noopener noreferrer">Browse OpenRouter models</a>,
        },
        cerebras: {
            value: cerebrasModel, onValueChange: setCerebrasModel,
            options: cerebrasModelOptions.map((id) => ({ id, name: id })),
            loading: isLoadingCerebrasModels, error: cerebrasModelsError, disabled: !cerebrasApiKey.trim(),
        },
        opencode: {
            value: opencodeModel, onValueChange: setOpencodeModel, options: opencodeModelOptions,
            loading: isLoadingOpencodeModels, error: opencodeModelsError,
        },
    };
    const currentModel = modelSettings[aiProvider];

    return <section aria-label="Assistant" className={`${styles.section} ${styles.navigatorSettings}`}>
        <FieldGroup className={styles.navigatorPreferences}>
            <Field orientation="horizontal">
                <FieldContent>
                    <FieldLabel htmlFor="navigator-enabled">Enable Navigator</FieldLabel>
                </FieldContent>
                <Switch
                    id="navigator-enabled"
                    checked={navigatorEnabled}
                    onCheckedChange={setNavigatorEnabled}
                />
            </Field>
            {navigatorEnabled && <WebSearchSettings variant="preference" />}
        </FieldGroup>
        {navigatorEnabled && (
            <FieldGroup className={styles.navigatorFields} aria-label="AI configuration">
                <Field>
                    <Select
                        id="ai-provider"
                        label="AI provider"
                        value={aiProvider}
                        onValueChange={(value) => setAiProvider(value as AIProvider)}
                        options={PROVIDERS.map((provider) => {
                            const Icon = provider.icon;
                            return { value: provider.value, label: provider.name, icon: <Icon /> };
                        })}
                    />
                </Field>

                {aiProvider === "openai" && (
                    <SettingsInput
                        id="openai-base-url"
                        label="Base URL"
                        type="url"
                        value={openaiBaseUrl}
                        onValueChange={setOpenaiBaseUrl}
                        placeholder={OPENAI_DEFAULT_BASE_URL}
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
                    />
                ) : (
                    <ApiKeyInput key={`${aiProvider}-api-key`} id={`${aiProvider}-api-key`} {...apiKeySettings[aiProvider]} />
                )}

                {currentModel.options ? (
                    <ModelCombobox key={`${aiProvider}-model`} id={`${aiProvider}-model`} {...currentModel} description={currentModel.disabled ? "Add an API key to load models." : undefined} options={currentModel.options} providerIcon={selectedProvider.icon} />
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
                    />
                )}
            </FieldGroup>
        )}
    </section>;
}

export function SettingsView({ category }: { category: SettingsCategory }) {
    switch (category) {
    case "playback":
        return <><PlaybackSettings /><PlaybackLanguageSettings />
            <p className={styles.credits}>Skip timings from <a href="https://theintrodb.org" target="_blank" rel="noreferrer">TheIntroDB</a>, <a href="https://introdb.app" target="_blank" rel="noreferrer">IntroDB</a>, and <a href="https://skipdb.tv" target="_blank" rel="noreferrer">SkipDB</a> (<a href="https://skipdb.tv/license" target="_blank" rel="noreferrer">ODbL license</a>).</p>
        </>;
    case "subtitles":
        return <SubtitleSettings />;
    case "navigator":
        return <NavigatorSettings />;
    case "connections":
        return <><ArtworkSettings /><WebSearchSettings variant="connection" /></>;
    }
}
