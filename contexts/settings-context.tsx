"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export interface BitrateOption {
  value: string;
  label: string;
  bitrate: number;
}

export const BITRATE_OPTIONS: BitrateOption[] = [
  { value: "auto", label: "Auto", bitrate: 0 },
  { value: "20000", label: "20 Mbps (4K)", bitrate: 20000000 },
  { value: "8000", label: "8 Mbps (1080p)", bitrate: 8000000 },
  { value: "4000", label: "4 Mbps (720p)", bitrate: 4000000 },
  { value: "2000", label: "2 Mbps (480p)", bitrate: 2000000 },
  { value: "1000", label: "1 Mbps (360p)", bitrate: 1000000 },
];

export type AIProvider =
  | "gemini"
  | "ollama"
  | "groq"
  | "openrouter"
  | "cerebras";
export type OpenRouterReasoningEffort =
  | "default"
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";
export type CerebrasReasoningEffort = "default" | "low" | "medium" | "high";

interface SettingsContextType {
  videoBitrate: string;
  setVideoBitrate: (bitrate: string) => void;
  navigatorEnabled: boolean;
  setNavigatorEnabled: (enabled: boolean) => void;
  aiProvider: AIProvider;
  setAiProvider: (provider: AIProvider) => void;
  // model settings
  ollamaBaseUrl: string;
  setOllamaBaseUrl: (url: string) => void;
  ollamaModel: string;
  setOllamaModel: (model: string) => void;
  groqModel: string;
  setGroqModel: (model: string) => void;
  openrouterModel: string;
  setOpenrouterModel: (model: string) => void;
  openrouterReasoningEffort: OpenRouterReasoningEffort;
  setOpenrouterReasoningEffort: (effort: OpenRouterReasoningEffort) => void;
  cerebrasModel: string;
  setCerebrasModel: (model: string) => void;
  cerebrasReasoningEffort: CerebrasReasoningEffort;
  setCerebrasReasoningEffort: (effort: CerebrasReasoningEffort) => void;
  // API keys
  googleApiKey: string;
  setGoogleApiKey: (key: string) => void;
  groqApiKey: string;
  setGroqApiKey: (key: string) => void;
  openrouterApiKey: string;
  setOpenrouterApiKey: (key: string) => void;
  cerebrasApiKey: string;
  setCerebrasApiKey: (key: string) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(
  undefined
);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [videoBitrate, setVideoBitrateState] = useState<string>("auto");
  const [navigatorEnabled, setNavigatorEnabledState] = useState<boolean>(true);
  const [aiProvider, setAiProviderState] = useState<AIProvider>("gemini");
  const [ollamaBaseUrl, setOllamaBaseUrlState] = useState<string>(
    "http://localhost:11434"
  );
  const [ollamaModel, setOllamaModelState] = useState<string>("phi3");
  const [groqModel, setGroqModelState] = useState<string>("llama3-8b-8192");
  const [openrouterModel, setOpenrouterModelState] = useState<string>(
    "qwen/qwen3-coder:free"
  );
  const [openrouterReasoningEffort, setOpenrouterReasoningEffortState] =
    useState<OpenRouterReasoningEffort>("default");
  const [cerebrasModel, setCerebrasModelState] = useState<string>("gpt-oss-120b");
  const [cerebrasReasoningEffort, setCerebrasReasoningEffortState] =
    useState<CerebrasReasoningEffort>("default");

  // API Key states
  const [googleApiKey, setGoogleApiKeyState] = useState<string>("");
  const [groqApiKey, setGroqApiKeyState] = useState<string>("");
  const [openrouterApiKey, setOpenrouterApiKeyState] = useState<string>("");
  const [cerebrasApiKey, setCerebrasApiKeyState] = useState<string>("");

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedBitrate = localStorage.getItem("navigator-video-bitrate");
    if (
      savedBitrate &&
      BITRATE_OPTIONS.some((option) => option.value === savedBitrate)
    ) {
      setVideoBitrateState(savedBitrate);
    }

    const savedNavigatorEnabled = localStorage.getItem(
      "navigator-navigator-enabled"
    );
    if (savedNavigatorEnabled !== null) {
      setNavigatorEnabledState(savedNavigatorEnabled === "true");
    }

    const savedAiProvider = localStorage.getItem(
      "navigator-ai-provider"
    ) as AIProvider;
    if (
      savedAiProvider &&
      ["gemini", "ollama", "groq", "openrouter", "cerebras"].includes(
        savedAiProvider
      )
    ) {
      setAiProviderState(savedAiProvider);
    }

    const savedOllamaBaseUrl = localStorage.getItem("navigator-ollama-base-url");
    if (savedOllamaBaseUrl) {
      setOllamaBaseUrlState(savedOllamaBaseUrl);
    }

    const savedOllamaModel = localStorage.getItem("navigator-ollama-model");
    if (savedOllamaModel) {
      setOllamaModelState(savedOllamaModel);
    }

    const savedGroqModel = localStorage.getItem("navigator-groq-model");
    if (savedGroqModel) {
      setGroqModelState(savedGroqModel);
    }

    const savedOpenrouterModel = localStorage.getItem(
      "navigator-openrouter-model"
    );
    if (savedOpenrouterModel) {
      setOpenrouterModelState(savedOpenrouterModel);
    }

    const savedOpenrouterReasoningEffort = localStorage.getItem(
      "navigator-openrouter-reasoning-effort"
    ) as OpenRouterReasoningEffort | null;
    if (
      savedOpenrouterReasoningEffort &&
      ["default", "none", "minimal", "low", "medium", "high", "xhigh"].includes(
        savedOpenrouterReasoningEffort
      )
    ) {
      setOpenrouterReasoningEffortState(savedOpenrouterReasoningEffort);
    }
    const savedCerebrasModel = localStorage.getItem("navigator-cerebras-model");
    if (savedCerebrasModel) {
      setCerebrasModelState(savedCerebrasModel);
    }
    const savedCerebrasReasoningEffort = localStorage.getItem(
      "navigator-cerebras-reasoning-effort"
    ) as CerebrasReasoningEffort | null;
    if (
      savedCerebrasReasoningEffort &&
      ["default", "low", "medium", "high"].includes(savedCerebrasReasoningEffort)
    ) {
      setCerebrasReasoningEffortState(savedCerebrasReasoningEffort);
    }

    // Load API key settings
    const savedGoogleApiKey = localStorage.getItem("navigator-google-api-key");
    if (savedGoogleApiKey) {
      setGoogleApiKeyState(savedGoogleApiKey);
    }

    const savedGroqApiKey = localStorage.getItem("navigator-groq-api-key");
    if (savedGroqApiKey) {
      setGroqApiKeyState(savedGroqApiKey);
    }

    const savedOpenrouterApiKey = localStorage.getItem("navigator-openrouter-api-key");
    if (savedOpenrouterApiKey) {
      setOpenrouterApiKeyState(savedOpenrouterApiKey);
    }
    const savedCerebrasApiKey = localStorage.getItem("navigator-cerebras-api-key");
    if (savedCerebrasApiKey) {
      setCerebrasApiKeyState(savedCerebrasApiKey);
    }
  }, []);

  // Save to localStorage when states change
  const setVideoBitrate = (bitrate: string) => {
    setVideoBitrateState(bitrate);
    localStorage.setItem("navigator-video-bitrate", bitrate);
  };

  const setNavigatorEnabled = (enabled: boolean) => {
    setNavigatorEnabledState(enabled);
    localStorage.setItem("navigator-navigator-enabled", enabled.toString());
  };

  const setAiProvider = (provider: AIProvider) => {
    setAiProviderState(provider);
    localStorage.setItem("navigator-ai-provider", provider);
  };

  const setOllamaBaseUrl = (url: string) => {
    setOllamaBaseUrlState(url);
    localStorage.setItem("navigator-ollama-base-url", url);
  };

  const setOllamaModel = (model: string) => {
    setOllamaModelState(model);
    localStorage.setItem("navigator-ollama-model", model);
  };

  const setGroqModel = (model: string) => {
    setGroqModelState(model);
    localStorage.setItem("navigator-groq-model", model);
  };

  const setOpenrouterModel = (model: string) => {
    setOpenrouterModelState(model);
    localStorage.setItem("navigator-openrouter-model", model);
  };

  const setOpenrouterReasoningEffort = (effort: OpenRouterReasoningEffort) => {
    setOpenrouterReasoningEffortState(effort);
    localStorage.setItem("navigator-openrouter-reasoning-effort", effort);
  };
  const setCerebrasModel = (model: string) => {
    setCerebrasModelState(model);
    localStorage.setItem("navigator-cerebras-model", model);
  };
  const setCerebrasReasoningEffort = (effort: CerebrasReasoningEffort) => {
    setCerebrasReasoningEffortState(effort);
    localStorage.setItem("navigator-cerebras-reasoning-effort", effort);
  };

  // API Key setters
  const setGoogleApiKey = (key: string) => {
    setGoogleApiKeyState(key);
    localStorage.setItem("navigator-google-api-key", key);
  };

  const setGroqApiKey = (key: string) => {
    setGroqApiKeyState(key);
    localStorage.setItem("navigator-groq-api-key", key);
  };

  const setOpenrouterApiKey = (key: string) => {
    setOpenrouterApiKeyState(key);
    localStorage.setItem("navigator-openrouter-api-key", key);
  };
  const setCerebrasApiKey = (key: string) => {
    setCerebrasApiKeyState(key);
    localStorage.setItem("navigator-cerebras-api-key", key);
  };

  return (
    <SettingsContext.Provider
      value={{
        videoBitrate,
        setVideoBitrate,
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
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}
