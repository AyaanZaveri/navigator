"use client";

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
import { useSettings } from "@/contexts/settings-context";
import { Settings2, Ship, Bot } from "lucide-react";
import { AuroraBackground } from "@/components/aurora-background";
import { SearchBar } from "@/components/search-component";
import { Label } from "@/components/ui/label";
import { Gemini, Groq, OpenRouter } from "@lobehub/icons";
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
    googleApiKey,
    setGoogleApiKey,
    groqApiKey,
    setGroqApiKey,
    openrouterApiKey,
    setOpenrouterApiKey,
  } = useSettings();

  console.log({
    navigatorEnabled,
    aiProvider,
    ollamaBaseUrl,
    ollamaModel,
    groqModel,
    openrouterModel,
    googleApiKey,
    groqApiKey,
    openrouterApiKey,
  });

  return (
    <div className="relative px-4 py-6 max-w-full overflow-hidden">
      {/* Aurora background */}
      <AuroraBackground colorStops={["#34d399", "#38bdf8", "#2dd4bf"]} />

      {/* Main content with higher z-index */}
      <div className="relative z-10">
        <div className="relative z-[9999] mb-8">
          <div className="mb-6">
            <SearchBar />
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
