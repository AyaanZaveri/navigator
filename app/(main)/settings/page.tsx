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
import { Cerebras, Gemini, Groq, OpenRouter } from "@lobehub/icons";
import { Ollama } from "@lobehub/icons";

export default function SettingsPage() {
  const {
    navigatorEnabled,
    setNavigatorEnabled,
    aiProvider,
    setAiProvider,
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
    if (aiProvider !== "cerebras") return;
    void fetchCerebrasModels();
  }, [aiProvider, fetchCerebrasModels]);

  const cerebrasModelOptions = useMemo(() => {
    if (!cerebrasModel) return cerebrasModels;
    if (cerebrasModels.includes(cerebrasModel)) return cerebrasModels;
    return [cerebrasModel, ...cerebrasModels];
  }, [cerebrasModel, cerebrasModels]);

  console.log({
    navigatorEnabled,
    aiProvider,
    ollamaBaseUrl,
    ollamaModel,
    groqModel,
    openrouterModel,
    openrouterReasoningEffort,
    cerebrasModel,
    cerebrasReasoningEffort,
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
