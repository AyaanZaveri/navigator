"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Suspense } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  CerebrasReasoningEffort,
  OpenRouterReasoningEffort,
  useSettings,
} from "@/contexts/settings-context";
import { Settings2, Ship } from "lucide-react";
import { AuroraBackground } from "@/components/aurora-background";
import { SearchBar } from "@/components/search-component";
import { Label } from "@/components/ui/label";
import { Cerebras, Gemini, Groq, OpenAI, OpenRouter } from "@lobehub/icons";
import { Ollama } from "@lobehub/icons";
import { OPENAI_DEFAULT_BASE_URL } from "@/lib/models-dev";

const OPENAI_BASE_URL_STORAGE_KEY = "navigator-openai-base-url";
const MODELS_DEV_PROVIDER_CACHE_PREFIX = "navigator-modelsdev-provider:";

type ModelsDevProviderResponse = {
  provider: {
    id: string;
    name: string;
    apiBaseUrl: string;
    logoUrl: string;
    models: Array<{
      id: string;
      name: string;
    }>;
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
    void fetchModelsDevProvider();
  }, [aiProvider, fetchModelsDevProvider]);

  useEffect(() => {
    if (aiProvider !== "openai") return;
    if (typeof window === "undefined") return;

    const storedBaseUrl =
      window.localStorage.getItem(OPENAI_BASE_URL_STORAGE_KEY)?.trim() ?? "";
    const cacheKey = getModelsDevProviderCacheKey(
      storedBaseUrl || openaiBaseUrl || OPENAI_DEFAULT_BASE_URL
    );
    if (!cacheKey) return;

    const cachedProvider = window.localStorage.getItem(cacheKey);
    if (!cachedProvider) return;

    try {
      const parsed = JSON.parse(
        cachedProvider
      ) as ModelsDevProviderResponse["provider"];
      setModelsDevProvider(parsed);
    } catch {
      window.localStorage.removeItem(cacheKey);
    }
  }, [aiProvider, openaiBaseUrl]);

  useEffect(() => {
    if (aiProvider !== "gemini") return;
    void fetchGeminiModels();
  }, [aiProvider, fetchGeminiModels]);

  useEffect(() => {
    if (aiProvider !== "cerebras") return;
    void fetchCerebrasModels();
  }, [aiProvider, fetchCerebrasModels]);

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

  console.log({
    navigatorEnabled,
    aiProvider,
    openaiBaseUrl,
    openaiModel,
    geminiModel,
    modelsDevProvider,
    geminiModelsProvider,
    ollamaBaseUrl,
    ollamaModel,
    groqModel,
    openrouterModel,
    openrouterReasoningEffort,
    cerebrasModel,
    cerebrasReasoningEffort,
    openaiApiKey,
    googleApiKey,
    groqApiKey,
    openrouterApiKey,
    cerebrasApiKey,
  });

  return (
    <div className="relative px-4 py-6 max-w-full overflow-hidden">
      {/* Aurora background */}
      <AuroraBackground colorStops={["#34d399", "#38bdf8", "#2dd4bf"]} />

      {/* Main content with higher z-index */}
      <div className="relative z-10">
        <div className="relative z-[9999] mb-8">
          <div className="mb-6">
            <Suspense fallback={null}>
              <SearchBar />
            </Suspense>
          </div>
        </div>
        <div className="mb-8">
          <h2 className="text-3xl font-semibold text-foreground mb-2 font-poppins flex items-center gap-2">
            <Settings2 className="h-8 w-8" />
            Settings
          </h2>
        </div>

        <div className="grid gap-6">
          {/* Navigator Settings */}
          <Card className="bg-card/75">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-poppins text-lg">
                <Ship className="h-5 w-5" />
                Navigator
              </CardTitle>
              <CardDescription>
                Configure the AI-powered navigation assistant that helps you
                find and play content using natural language.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="text-base font-medium">Enable Navigator</div>
                  <div className="text-sm text-muted-foreground">
                    Allow the Navigator to help you search and play content.
                    When disabled, the Navigator button and keyboard shortcuts
                    will be hidden.
                  </div>
                </div>
                <Switch
                  checked={navigatorEnabled}
                  onCheckedChange={setNavigatorEnabled}
                  className="scale-125"
                />
              </div>

              {navigatorEnabled && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label
                      htmlFor="ai-provider"
                      className="text-base font-medium"
                    >
                      AI Provider
                    </Label>
                    <Select value={aiProvider} onValueChange={setAiProvider}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select AI provider" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="openai">
                          <div className="flex items-center gap-2">
                            <OpenAI className="h-4 w-4" />
                            OpenAI
                          </div>
                        </SelectItem>
                        <SelectItem value="gemini">
                          <div className="flex items-center gap-2">
                            <Gemini.Color className="h-4 w-4" />
                            Gemini
                          </div>
                        </SelectItem>
                        <SelectItem value="ollama">
                          <div className="flex items-center gap-2">
                            <Ollama className="h-4 w-4 fill-foreground" />
                            Ollama
                          </div>
                        </SelectItem>
                        <SelectItem value="groq">
                          <div className="flex items-center gap-2">
                            <Groq className="h-4 w-4 fill-[#F55036]" />
                            Groq
                          </div>
                        </SelectItem>
                        <SelectItem value="openrouter">
                          <div className="flex items-center gap-2">
                            <OpenRouter className="h-4 w-4 fill-foreground" />
                            OpenRouter
                          </div>
                        </SelectItem>
                        <SelectItem value="cerebras">
                          <div className="flex items-center gap-2">
                            <Cerebras className="h-4 w-4" />
                            Cerebras
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground">
                      {aiProvider === "openai" &&
                        "Uses OpenAI-compatible chat models with a configurable base URL, API key, and model selection."}
                      {aiProvider === "gemini" &&
                        "Uses Google's Gemini 2.0 Flash model for AI responses. Requires your own API key."}
                      {aiProvider === "ollama" &&
                        "Uses a locally running Ollama instance for AI responses."}
                      {aiProvider === "groq" &&
                        "Uses Groq's high-speed inference API for AI responses."}
                      {aiProvider === "openrouter" &&
                        "Uses OpenRouter's API to access various AI models."}
                      {aiProvider === "cerebras" &&
                        "Uses Cerebras high-speed inference with configurable reasoning and decoding parameters."}
                    </p>
                  </div>

                  {aiProvider === "openai" && (
                    <div className="space-y-4 pl-4 border-l-2 border-muted">
                      <div className="rounded-lg border border-border/60 bg-background/40 p-3">
                        <div className="flex items-center gap-3">
                          {modelsDevProvider?.logoUrl ? (
                            <img
                              src={modelsDevProvider.logoUrl}
                              alt={`${modelsDevProvider.name} logo`}
                              className="h-8 w-8 rounded-sm object-contain dark:invert"
                            />
                          ) : (
                            <OpenAI className="h-8 w-8" />
                          )}
                          <div className="min-w-0">
                            <div className="text-sm font-medium">
                              {modelsDevProvider?.name ?? "OpenAI-compatible API"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {isLoadingModelsDevProvider
                                ? "Matching provider from models.dev..."
                                : modelsDevProvider
                                  ? `Matched from ${modelsDevProvider.apiBaseUrl}`
                                  : "No matching provider found for this base URL."}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label
                          htmlFor="openai-base-url"
                          className="text-base font-medium"
                        >
                          Base URL
                        </Label>
                        <Input
                          id="openai-base-url"
                          type="url"
                          value={openaiBaseUrl}
                          onChange={(e) => setOpenaiBaseUrl(e.target.value)}
                          placeholder={OPENAI_DEFAULT_BASE_URL}
                          className="w-full"
                        />
                        <p className="text-sm text-muted-foreground">
                          The OpenAI-compatible API base URL. Default:{" "}
                          <code className="text-xs bg-muted px-1 py-0.5 rounded">
                            {OPENAI_DEFAULT_BASE_URL}
                          </code>
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label
                          htmlFor="openai-api-key"
                          className="text-base font-medium"
                        >
                          API Key
                        </Label>
                        <Input
                          id="openai-api-key"
                          type="password"
                          value={openaiApiKey}
                          onChange={(e) => setOpenaiApiKey(e.target.value)}
                          placeholder="Enter your OpenAI API key"
                          className="w-full"
                        />
                        <p className="text-sm text-muted-foreground">
                          Get your API key from{" "}
                          <a
                            href="https://platform.openai.com/api-keys"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            OpenAI Platform
                          </a>
                          . Your key is stored locally and never shared.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label
                          htmlFor="openai-model"
                          className="text-base font-medium"
                        >
                          Model
                        </Label>
                        <Select
                          value={openaiModel}
                          onValueChange={setOpenaiModel}
                          disabled={isLoadingModelsDevProvider}
                        >
                          <SelectTrigger id="openai-model" className="w-full">
                            <SelectValue placeholder="Select an OpenAI model" />
                          </SelectTrigger>
                          <SelectContent>
                            {openaiModelOptions.map((model) => (
                              <SelectItem key={model.id} value={model.id}>
                                {model.id}
                              </SelectItem>
                            ))}
                            {openaiModelOptions.length === 0 && (
                              <SelectItem value="__none" disabled>
                                No models available
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                        <p className="text-sm text-muted-foreground">
                          {modelsDevProvider
                            ? `Model list loaded from models.dev for ${modelsDevProvider.name}.`
                            : "Model list is sourced from models.dev based on the base URL."}
                          {modelsDevProviderError && ` Error: ${modelsDevProviderError}`}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Google API Key Configuration */}
                  {aiProvider === "gemini" && (
                    <div className="space-y-4 pl-4 border-l-2 border-muted">
                      <div className="space-y-2">
                        <Label
                          htmlFor="google-api-key"
                          className="text-base font-medium"
                        >
                          Google API Key
                        </Label>
                        <Input
                          id="google-api-key"
                          type="password"
                          value={googleApiKey}
                          onChange={(e) => setGoogleApiKey(e.target.value)}
                          placeholder="Enter your Google Generative AI API key"
                          className="w-full"
                          required
                        />
                        <p className="text-sm text-muted-foreground">
                          Get your API key from{" "}
                          <a
                            href="https://makersuite.google.com/app/apikey"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            Google AI Studio
                          </a>
                          . Your key is stored locally and never shared.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label
                          htmlFor="gemini-model"
                          className="text-base font-medium"
                        >
                          Model
                        </Label>
                        <Select
                          value={geminiModel}
                          onValueChange={setGeminiModel}
                          disabled={isLoadingGeminiModels}
                        >
                          <SelectTrigger id="gemini-model" className="w-full">
                            <SelectValue placeholder="Select a Gemini model" />
                          </SelectTrigger>
                          <SelectContent>
                            {geminiModelOptions.map((model) => (
                              <SelectItem key={model.id} value={model.id}>
                                {model.id}
                              </SelectItem>
                            ))}
                            {geminiModelOptions.length === 0 && (
                              <SelectItem value="__none" disabled>
                                No models available
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                        <p className="text-sm text-muted-foreground">
                          {geminiModelsProvider
                            ? "Model list loaded from models.dev for Google."
                            : "Model list is sourced from models.dev."}
                          {geminiModelsError && ` Error: ${geminiModelsError}`}
                        </p>
                      </div>
                    </div>
                  )}

                  {aiProvider === "ollama" && (
                    <div className="space-y-4 pl-4 border-l-2 border-muted">
                      <div className="space-y-2">
                        <Label
                          htmlFor="ollama-base-url"
                          className="text-base font-medium"
                        >
                          Base URL
                        </Label>
                        <Input
                          id="ollama-base-url"
                          type="url"
                          value={ollamaBaseUrl}
                          onChange={(e) => setOllamaBaseUrl(e.target.value)}
                          placeholder="http://localhost:11434"
                          className="w-full"
                        />
                        <p className="text-sm text-muted-foreground">
                          The base URL for your Ollama instance:{" "}
                          <code className="text-xs bg-muted px-1 py-0.5 rounded">
                            http://localhost:11434
                          </code>
                          ,{" "}
                          <code className="text-xs bg-muted px-1 py-0.5 rounded">
                            https://ollama.mydomain.com
                          </code>
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label
                          htmlFor="ollama-model"
                          className="text-base font-medium"
                        >
                          Model
                        </Label>
                        <Input
                          id="ollama-model"
                          type="text"
                          value={ollamaModel}
                          onChange={(e) => setOllamaModel(e.target.value)}
                          placeholder="phi3"
                          className="w-full"
                        />
                        <p className="text-sm text-muted-foreground">
                          The Ollama model to use. Check out{" "}
                          <a
                            href="https://ollama.com/search?c=tools"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            all available models
                          </a>
                          .
                        </p>
                      </div>
                    </div>
                  )}

                  {aiProvider === "groq" && (
                    <div className="space-y-4 pl-4 border-l-2 border-muted">
                      <div className="space-y-2">
                        <Label
                          htmlFor="groq-api-key"
                          className="text-base font-medium"
                        >
                          API Key
                        </Label>
                        <Input
                          id="groq-api-key"
                          type="password"
                          value={groqApiKey}
                          onChange={(e) => setGroqApiKey(e.target.value)}
                          placeholder="Enter your Groq API key"
                          className="w-full"
                        />
                        <p className="text-sm text-muted-foreground">
                          Get your API key from{" "}
                          <a
                            href="https://console.groq.com/keys"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            Groq Console
                          </a>
                          . Your key is stored locally and never shared.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label
                          htmlFor="groq-model"
                          className="text-base font-medium"
                        >
                          Model
                        </Label>
                        <Input
                          id="groq-model"
                          type="text"
                          value={groqModel}
                          onChange={(e) => setGroqModel(e.target.value)}
                          placeholder="llama3-8b-8192"
                          className="w-full"
                        />
                        <p className="text-sm text-muted-foreground">
                          The Groq model to use. Check out{" "}
                          <a
                            href="https://console.groq.com/docs/models"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            available models
                          </a>
                          . Popular options include{" "}
                          <code className="text-xs bg-muted px-1 py-0.5 rounded">
                            llama3-8b-8192
                          </code>
                          ,{" "}
                          <code className="text-xs bg-muted px-1 py-0.5 rounded">
                            mixtral-8x7b-32768
                          </code>
                          .
                        </p>
                      </div>
                    </div>
                  )}

                  {aiProvider === "openrouter" && (
                    <div className="space-y-4 pl-4 border-l-2 border-muted">
                      <div className="space-y-2">
                        <Label
                          htmlFor="openrouter-api-key"
                          className="text-base font-medium"
                        >
                          API Key
                        </Label>
                        <Input
                          id="openrouter-api-key"
                          type="password"
                          value={openrouterApiKey}
                          onChange={(e) => setOpenrouterApiKey(e.target.value)}
                          placeholder="Enter your OpenRouter API key"
                          className="w-full"
                        />
                        <p className="text-sm text-muted-foreground">
                          Get your API key from{" "}
                          <a
                            href="https://openrouter.ai/keys"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            OpenRouter Dashboard
                          </a>
                          . Your key is stored locally and never shared.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label
                          htmlFor="openrouter-model"
                          className="text-base font-medium"
                        >
                          Model
                        </Label>
                        <Input
                          id="openrouter-model"
                          type="text"
                          value={openrouterModel}
                          onChange={(e) => setOpenrouterModel(e.target.value)}
                          placeholder="qwen/qwen3-coder:free"
                          className="w-full"
                        />
                        <p className="text-sm text-muted-foreground">
                          The OpenRouter model to use. Check out{" "}
                          <a
                            href="https://openrouter.ai/models?fmt=cards&supported_parameters=tools"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            available models
                          </a>
                          .
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label
                          htmlFor="openrouter-reasoning-effort"
                          className="text-base font-medium"
                        >
                          Reasoning Effort
                        </Label>
                        <Select
                          value={openrouterReasoningEffort}
                          onValueChange={(value) =>
                            setOpenrouterReasoningEffort(
                              value as OpenRouterReasoningEffort
                            )
                          }
                        >
                          <SelectTrigger
                            id="openrouter-reasoning-effort"
                            className="w-full"
                          >
                            <SelectValue placeholder="Select reasoning effort" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="default">
                              Model default (off)
                            </SelectItem>
                            <SelectItem value="none">None</SelectItem>
                            <SelectItem value="minimal">Minimal</SelectItem>
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="xhigh">XHigh</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-sm text-muted-foreground">
                          Sets OpenRouter&apos;s <code>reasoning.effort</code>:
                          {" "}xhigh, high, medium, low, minimal, or none.
                        </p>
                      </div>
                    </div>
                  )}

                  {aiProvider === "cerebras" && (
                    <div className="space-y-4 pl-4 border-l-2 border-muted">
                      <div className="space-y-2">
                        <Label
                          htmlFor="cerebras-api-key"
                          className="text-base font-medium"
                        >
                          API Key
                        </Label>
                        <Input
                          id="cerebras-api-key"
                          type="password"
                          value={cerebrasApiKey}
                          onChange={(e) => setCerebrasApiKey(e.target.value)}
                          placeholder="Enter your Cerebras API key"
                          className="w-full"
                        />
                        <p className="text-sm text-muted-foreground">
                          Get your API key from{" "}
                          <a
                            href="https://cloud.cerebras.ai"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            Cerebras Cloud
                          </a>
                          . Your key is stored locally and never shared.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label
                          htmlFor="cerebras-model"
                          className="text-base font-medium"
                        >
                          Model
                        </Label>
                        <Select
                          value={cerebrasModel}
                          onValueChange={setCerebrasModel}
                          disabled={!cerebrasApiKey.trim()}
                        >
                          <SelectTrigger id="cerebras-model" className="w-full">
                            <SelectValue
                              placeholder={
                                isLoadingCerebrasModels
                                  ? "Loading models..."
                                  : "Select a Cerebras model"
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {cerebrasModelOptions.map((modelId) => (
                              <SelectItem key={modelId} value={modelId}>
                                {modelId}
                              </SelectItem>
                            ))}
                            {cerebrasModelOptions.length === 0 && (
                              <SelectItem value="__none" disabled>
                                No models available
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                        <p className="text-sm text-muted-foreground">
                          {cerebrasApiKey.trim()
                            ? "Model list is fetched live from Cerebras."
                            : "Add your API key to fetch available models."}
                          {cerebrasModelsError && ` Error: ${cerebrasModelsError}`}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label
                          htmlFor="cerebras-reasoning-effort"
                          className="text-base font-medium"
                        >
                          Reasoning Effort
                        </Label>
                        <Select
                          value={cerebrasReasoningEffort}
                          onValueChange={(value) =>
                            setCerebrasReasoningEffort(
                              value as CerebrasReasoningEffort
                            )
                          }
                        >
                          <SelectTrigger
                            id="cerebras-reasoning-effort"
                            className="w-full"
                          >
                            <SelectValue placeholder="Select reasoning effort" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="default">Model default</SelectItem>
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-sm text-muted-foreground">
                          Uses Cerebras provider reasoning effort option.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
