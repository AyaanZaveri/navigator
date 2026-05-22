export const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";
export const MODELS_DEV_API_URL = "https://models.dev/api.json";
export const MODELS_DEV_LOGO_BASE_URL = "https://models.dev/logos";

type ModelsDevModelRecord = {
  id?: string;
  name?: string;
  modalities?: {
    input?: string[];
    output?: string[];
  };
};

type ModelsDevProviderRecord = {
  id?: string;
  name?: string;
  api?: string;
  models?: Record<string, ModelsDevModelRecord>;
};

export type ModelsDevApiResponse = Record<string, ModelsDevProviderRecord>;

export type MatchedModelsDevProvider = {
  id: string;
  name: string;
  apiBaseUrl: string;
  logoUrl: string;
  models: Array<{
    id: string;
    name: string;
  }>;
};

export type ModelsDevProviderById = {
  id: string;
  name: string;
  apiBaseUrl: string | null;
  logoUrl: string;
  models: Array<{
    id: string;
    name: string;
  }>;
};

function normalizeBaseUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const normalized = new URL(trimmed);
    const pathname = normalized.pathname.replace(/\/+$/, "");
    return `${normalized.origin}${pathname}`.toLowerCase();
  } catch {
    return trimmed.replace(/\/+$/, "").toLowerCase();
  }
}

function getProviderApiBaseUrl(provider: ModelsDevProviderRecord): string | null {
  if (provider.id === "openai") {
    return OPENAI_DEFAULT_BASE_URL;
  }

  return provider.api ?? null;
}

function supportsTextInput(model: ModelsDevModelRecord): boolean {
  const inputModalities = model.modalities?.input;
  if (!Array.isArray(inputModalities) || inputModalities.length === 0) {
    return true;
  }

  return inputModalities.includes("text");
}

function getMatchScore(candidateBaseUrl: string, targetBaseUrl: string): number {
  if (candidateBaseUrl === targetBaseUrl) return 1_000;

  try {
    const candidate = new URL(candidateBaseUrl);
    const target = new URL(targetBaseUrl);

    if (candidate.hostname !== target.hostname) return -1;

    const candidatePath = candidate.pathname.replace(/\/+$/, "");
    const targetPath = target.pathname.replace(/\/+$/, "");

    if (candidatePath === targetPath) return 900;
    if (
      candidatePath &&
      (targetPath.startsWith(candidatePath) || candidatePath.startsWith(targetPath))
    ) {
      return 800 - Math.abs(candidatePath.length - targetPath.length);
    }

    return 500;
  } catch {
    return -1;
  }
}

export function matchModelsDevProvider(
  payload: ModelsDevApiResponse,
  baseUrl: string
): MatchedModelsDevProvider | null {
  const normalizedTarget = normalizeBaseUrl(baseUrl);
  if (!normalizedTarget) return null;

  let bestMatch: {
    provider: ModelsDevProviderRecord;
    normalizedBaseUrl: string;
    score: number;
  } | null = null;

  for (const [providerId, provider] of Object.entries(payload)) {
    const providerBaseUrl = getProviderApiBaseUrl({
      ...provider,
      id: provider.id ?? providerId,
    });
    if (!providerBaseUrl) continue;

    const normalizedProviderBaseUrl = normalizeBaseUrl(providerBaseUrl);
    if (!normalizedProviderBaseUrl) continue;

    const score = getMatchScore(normalizedProviderBaseUrl, normalizedTarget);
    if (score < 0) continue;

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = {
        provider: {
          ...provider,
          id: provider.id ?? providerId,
        },
        normalizedBaseUrl: normalizedProviderBaseUrl,
        score,
      };
    }
  }

  if (!bestMatch?.provider.id) return null;

  const models = Object.entries(bestMatch.provider.models ?? {})
    .filter(([, model]) => supportsTextInput(model))
    .map(([modelId, model]) => ({
      id: model.id ?? modelId,
      name: model.name ?? model.id ?? modelId,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    id: bestMatch.provider.id,
    name: bestMatch.provider.name ?? bestMatch.provider.id,
    apiBaseUrl: bestMatch.normalizedBaseUrl,
    logoUrl: `${MODELS_DEV_LOGO_BASE_URL}/${bestMatch.provider.id}.svg`,
    models,
  };
}

export function getModelsDevProviderById(
  payload: ModelsDevApiResponse,
  providerId: string
): ModelsDevProviderById | null {
  const provider = payload[providerId];
  if (!provider) return null;

  const models = Object.entries(provider.models ?? {})
    .filter(([, model]) => supportsTextInput(model))
    .map(([modelId, model]) => ({
      id: model.id ?? modelId,
      name: model.name ?? model.id ?? modelId,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    id: provider.id ?? providerId,
    name: provider.name ?? providerId,
    apiBaseUrl: getProviderApiBaseUrl({
      ...provider,
      id: provider.id ?? providerId,
    }),
    logoUrl: `${MODELS_DEV_LOGO_BASE_URL}/${provider.id ?? providerId}.svg`,
    models,
  };
}
