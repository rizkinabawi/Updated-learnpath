import * as SecureStore from "expo-secure-store";

const STORE_KEY = "lp_ai_keys_v2";

export type AIProvider = "openai" | "gemini";

export interface AIKey {
  id: string;
  provider: AIProvider;
  apiKey: string;
  label: string;
  model: string;
  createdAt: string;
}

export interface ModelOption {
  id: string;
  label: string;
  desc: string;
}

export const PROVIDER_MODELS: Record<AIProvider, ModelOption[]> = {
  openai: [
    { id: "gpt-4o-mini",    label: "GPT-4o Mini",  desc: "Cepat & hemat (default)" },
    { id: "gpt-4.1-mini",   label: "GPT-4.1 Mini", desc: "Lebih baru, lebih hemat" },
    { id: "gpt-4.1-nano",   label: "GPT-4.1 Nano", desc: "Paling ringan & murah" },
    { id: "gpt-3.5-turbo",  label: "GPT-3.5 Turbo",desc: "Legacy, sangat hemat" },
    { id: "gpt-4o",         label: "GPT-4o",        desc: "Paling pintar (mahal)" },
  ],
  gemini: [
    { id: "gemini-2.0-flash",      label: "Gemini 2.0 Flash",      desc: "Cepat & gratis (default)" },
    { id: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite", desc: "Lebih ringan, kuota lebih tinggi" },
    { id: "gemini-1.5-flash",      label: "Gemini 1.5 Flash",      desc: "Gratis, kuota tinggi" },
    { id: "gemini-1.5-flash-8b",   label: "Gemini 1.5 Flash 8B",   desc: "Paling ringan, kuota tertinggi" },
    { id: "gemini-1.5-pro",        label: "Gemini 1.5 Pro",        desc: "Paling pintar Gemini" },
  ],
};

const DEFAULT_MODEL: Record<AIProvider, string> = {
  openai: "gpt-4o-mini",
  gemini: "gemini-2.0-flash",
};

const genId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function readStore(): Promise<AIKey[]> {
  try {
    const raw = await SecureStore.getItemAsync(STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AIKey[];
    return parsed.map((k) => ({
      ...k,
      model: k.model ?? DEFAULT_MODEL[k.provider],
    }));
  } catch {
    return [];
  }
}

async function writeStore(keys: AIKey[]): Promise<void> {
  await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(keys), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function getApiKeys(): Promise<AIKey[]> {
  return readStore();
}

export async function getApiKeyByProvider(
  provider: AIProvider
): Promise<AIKey | null> {
  const keys = await readStore();
  return keys.find((k) => k.provider === provider) ?? null;
}

export async function saveApiKey(data: {
  provider: AIProvider;
  apiKey: string;
  model?: string;
  label?: string;
}): Promise<AIKey> {
  const keys = await readStore();
  const existingIdx = keys.findIndex((k) => k.provider === data.provider);
  const entry: AIKey = {
    id: existingIdx >= 0 ? keys[existingIdx].id : genId(),
    provider: data.provider,
    apiKey: data.apiKey.trim(),
    model: data.model ?? (existingIdx >= 0 ? keys[existingIdx].model : DEFAULT_MODEL[data.provider]),
    label:
      data.label ??
      (data.provider === "openai" ? "OpenAI GPT" : "Google Gemini"),
    createdAt:
      existingIdx >= 0
        ? keys[existingIdx].createdAt
        : new Date().toISOString(),
  };
  if (existingIdx >= 0) {
    keys[existingIdx] = entry;
  } else {
    keys.push(entry);
  }
  await writeStore(keys);
  return entry;
}

export async function updateModel(
  provider: AIProvider,
  model: string
): Promise<void> {
  const keys = await readStore();
  const idx = keys.findIndex((k) => k.provider === provider);
  if (idx >= 0) {
    keys[idx] = { ...keys[idx], model };
    await writeStore(keys);
  }
}

export async function deleteApiKey(id: string): Promise<void> {
  const keys = await readStore();
  await writeStore(keys.filter((k) => k.id !== id));
}

export function maskKey(key: string): string {
  if (!key || key.length <= 8) return "••••••••";
  return "••••••••••••" + key.slice(-6);
}

export const PROVIDER_META: Record<
  AIProvider,
  { label: string; color: string; bg: string; model: string }
> = {
  openai: {
    label: "OpenAI GPT",
    color: "#10A37F",
    bg: "#10A37F18",
    model: "gpt-4o-mini",
  },
  gemini: {
    label: "Google Gemini",
    color: "#4285F4",
    bg: "#4285F418",
    model: "gemini-2.0-flash",
  },
};
