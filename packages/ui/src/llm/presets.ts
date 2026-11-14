import type { LlmEndpoint } from "@plainva/core";

/**
 * The endpoints a new installation offers out of the box (plan §5.1).
 *
 * Three named providers, each with the address and a model that is a sensible
 * starting point — never "the best": the field is editable and the model list
 * of the provider is one click away. Every other provider (a gateway, a
 * self-hosted server, a vendor we have not named) is added as a custom
 * OpenAI-compatible endpoint, which is a first-class path, not a workaround.
 */
export interface LlmPreset {
  id: string;
  label: string;
  protocol: LlmEndpoint["protocol"];
  baseUrl: string;
  model: string;
  /** Where the user creates a key; empty for a server on this machine. */
  keyUrl: string;
  /** False for a server that runs here and takes no key. */
  needsKey?: boolean;
}

export const LLM_PRESETS: readonly LlmPreset[] = [
  {
    id: "openai",
    label: "OpenAI",
    protocol: "openai-chat",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    keyUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    protocol: "anthropic-messages",
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-sonnet-4-5",
    keyUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "ollama",
    label: "Ollama",
    protocol: "openai-chat",
    baseUrl: "http://localhost:11434/v1",
    model: "llama3.2",
    keyUrl: "",
    needsKey: false,
  },
  {
    id: "lmstudio",
    label: "LM Studio",
    protocol: "openai-chat",
    baseUrl: "http://localhost:1234/v1",
    model: "",
    keyUrl: "",
    needsKey: false,
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    protocol: "openai-chat",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    keyUrl: "https://platform.deepseek.com/api_keys",
  },
];

/** A stored endpoint: the preset plus what the user changed. */
export interface LlmConfig {
  endpoints: LlmEndpoint[];
  /** Which endpoint a new conversation starts with. */
  activeId?: string;
}

export const EMPTY_LLM_CONFIG: LlmConfig = { endpoints: [] };

/** Same object under a name that reads better at a call site. */
export const emptyLlmConfig = EMPTY_LLM_CONFIG;

/** What a preset becomes once it is added. */
export function endpointFromPreset(preset: LlmPreset): LlmEndpoint {
  return {
    id: preset.id,
    label: preset.label,
    protocol: preset.protocol,
    baseUrl: preset.baseUrl,
    model: preset.model,
    keyRef: `llm.${preset.id}`,
    ...(preset.needsKey === false ? { needsKey: false } : {}),
  };
}

/** A provider the user named themselves — any OpenAI-compatible server. */
export function customEndpoint(id: string, label: string, baseUrl: string, model: string, needsKey = true): LlmEndpoint {
  return { id, label, protocol: "openai-chat", baseUrl, model, keyRef: `llm.${id}`, ...(needsKey ? {} : { needsKey: false }) };
}

/** Reads what was stored, and keeps only what is still a valid endpoint. */
export function readLlmConfig(raw: unknown): LlmConfig {
  const value = raw as Partial<LlmConfig> | null | undefined;
  if (!value || !Array.isArray(value.endpoints)) return EMPTY_LLM_CONFIG;
  const endpoints: LlmEndpoint[] = [];
  for (const entry of value.endpoints) {
    const candidate = entry as Partial<LlmEndpoint> | null;
    if (!candidate || typeof candidate.id !== "string" || typeof candidate.baseUrl !== "string") continue;
    if (candidate.protocol !== "openai-chat" && candidate.protocol !== "anthropic-messages") continue;
    endpoints.push({
      id: candidate.id,
      label: typeof candidate.label === "string" && candidate.label.trim() ? candidate.label : candidate.id,
      protocol: candidate.protocol,
      baseUrl: candidate.baseUrl,
      model: typeof candidate.model === "string" ? candidate.model : "",
      keyRef: typeof candidate.keyRef === "string" && candidate.keyRef ? candidate.keyRef : `llm.${candidate.id}`,
      ...(candidate.needsKey === false ? { needsKey: false } : {}),
      ...(typeof candidate.contextTokens === "number" && candidate.contextTokens > 0
        ? { contextTokens: candidate.contextTokens }
        : {}),
    });
  }
  const activeId = typeof value.activeId === "string" && endpoints.some((e) => e.id === value.activeId) ? value.activeId : endpoints[0]?.id;
  return { endpoints, ...(activeId ? { activeId } : {}) };
}

/** A stable id for a provider the user adds: "custom-1", "custom-2", … */
export function nextCustomId(existing: readonly LlmEndpoint[]): string {
  let n = 1;
  while (existing.some((e) => e.id === `custom-${n}`)) n++;
  return `custom-${n}`;
}
