import type { LlmEndpoint, LlmEvent, LlmHttpSpec, LlmMessage, LlmProtocol, LlmRequest } from "./types.js";

/**
 * The two protocol codecs (plan §5.2).
 *
 * Each turns a conversation into an `LlmHttpSpec` and decodes the provider's
 * server-sent events into `LlmEvent`s. No provider SDK: the protocols are small
 * and stable enough to own, and owning them keeps the dependency surface — and
 * the places a key could end up — tiny.
 */

/** Default output budget when the caller names none. */
export const DEFAULT_MAX_OUTPUT_TOKENS = 2_048;

/** Room kept for the system prompt, so truncation never eats it. */
export const SYSTEM_PROMPT_RESERVE = 256;

/**
 * Normalises what a user typed as a server address: origin plus optional path
 * prefix, no trailing slash. `local` says the server runs on this device, which
 * is the only case where plain `http` is allowed.
 */
export function normalizeBaseUrl(raw: string): { baseUrl: string; local: boolean } | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const local = isLocalHost(url.hostname);
  if (url.protocol === "http:" && !local) return null;
  if (url.search || url.hash) return null;
  let path = url.pathname;
  while (path.endsWith("/")) path = path.slice(0, -1);
  return { baseUrl: `${url.origin}${path}`, local };
}

function isLocalHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]" || host.endsWith(".local");
}

/** Where the key goes for a protocol. */
function authFor(): { header: string; scheme?: "Bearer" } {
  // Both protocols take a bearer token in the same header; Anthropic also
  // accepts `x-api-key`, but a bearer token keeps one code path.
  return { header: "authorization", scheme: "Bearer" };
}

/** Splits the leading system turns out of the conversation. */
function splitSystem(messages: readonly LlmMessage[]): { system: string; rest: LlmMessage[] } {
  const system: string[] = [];
  let i = 0;
  for (; i < messages.length; i++) {
    const m = messages[i]!;
    if (m.role !== "system") break;
    if (m.text.trim()) system.push(m.text);
  }
  return { system: system.join("\n\n"), rest: messages.slice(i) };
}

function openAiBody(request: LlmRequest): Record<string, unknown> {
  const { system, rest } = splitSystem(request.messages);
  const messages = [
    ...(system ? [{ role: "system", content: system }] : []),
    ...rest.map((m) => ({ role: m.role, content: m.text })),
  ];
  return {
    model: request.endpoint.model,
    messages,
    stream: true,
    max_tokens: request.maxOutputTokens,
    ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
  };
}

function anthropicBody(request: LlmRequest): Record<string, unknown> {
  const { system, rest } = splitSystem(request.messages);
  return {
    model: request.endpoint.model,
    // Anthropic wants alternating user/assistant turns and no empty content.
    messages: rest.filter((m) => m.text.length > 0).map((m) => ({ role: m.role, content: m.text })),
    stream: true,
    max_tokens: request.maxOutputTokens,
    ...(system ? { system } : {}),
    ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
  };
}

/** The streamed request for a conversation. */
export function buildChatRequest(request: LlmRequest): LlmHttpSpec {
  const { endpoint } = request;
  if (endpoint.protocol === "anthropic-messages") {
    return {
      url: `${endpoint.baseUrl}/messages`,
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "text/event-stream",
        "anthropic-version": "2023-06-01",
      },
      body: anthropicBody(request),
      auth: authFor(),
      stream: true,
    };
  }
  return {
    url: `${endpoint.baseUrl}/chat/completions`,
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: openAiBody(request),
    auth: authFor(),
    stream: true,
  };
}

/**
 * The model list, used by "Test connection". Both protocols expose one; a
 * server that does not answer leaves the model list to the user.
 */
export function buildModelsRequest(endpoint: LlmEndpoint): LlmHttpSpec {
  return {
    url: `${endpoint.baseUrl}/models`,
    method: "GET",
    headers: { accept: "application/json", ...(endpoint.protocol === "anthropic-messages" ? { "anthropic-version": "2023-06-01" } : {}) },
    auth: authFor(),
    stream: false,
  };
}

/** Model ids out of a `/models` answer, whatever shape the provider uses. */
export function parseModels(json: unknown): string[] {
  const data = (json as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  const ids: string[] = [];
  for (const entry of data) {
    const id = (entry as { id?: unknown })?.id;
    if (typeof id === "string" && id.length > 0) ids.push(id);
  }
  return ids;
}

// ------------------------------------------------------------------ streams

/**
 * A stateful server-sent-events decoder.
 *
 * Feed it decoded text chunks; it returns the events that are complete. It
 * holds one partial line and one pending `event:` name across calls, because a
 * network chunk can end anywhere.
 */
export class LlmStreamDecoder {
  private buffer = "";
  private readonly protocol: LlmProtocol;

  constructor(protocol: LlmProtocol) {
    this.protocol = protocol;
  }

  push(chunk: string): LlmEvent[] {
    // Server-sent events allow CRLF. A buffer split across chunks can also split
    // the pair, so the normalisation runs on the whole buffer, after appending.
    this.buffer = (this.buffer + chunk).replace(/\r\n/g, "\n");
    const events: LlmEvent[] = [];
    for (;;) {
      const boundary = this.buffer.indexOf("\n\n");
      if (boundary < 0) break;
      const block = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 2);
      const parsed = this.parseBlock(block);
      if (parsed) events.push(...parsed);
    }
    return events;
  }

  private parseBlock(block: string): LlmEvent[] | null {
    let eventName = "";
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) eventName = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
      // `id:`, `retry:` and comments are not part of any answer we read.
    }
    if (data.length === 0) return null;
    const payload = data.join("\n");
    if (payload === "[DONE]") return [{ type: "done" }];
    let json: unknown;
    try {
      json = JSON.parse(payload);
    } catch {
      return null;
    }
    return this.protocol === "anthropic-messages" ? anthropicEvents(eventName, json) : openAiEvents(json);
  }
}

function openAiEvents(json: unknown): LlmEvent[] {
  const out: LlmEvent[] = [];
  const obj = json as {
    choices?: Array<{ delta?: { content?: unknown }; finish_reason?: unknown }>;
    usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
    error?: { message?: unknown };
  };
  if (obj.error) {
    out.push({ type: "error", message: String(obj.error.message ?? "provider error") });
  }
  const choice = obj.choices?.[0];
  const delta = choice?.delta as { content?: unknown; reasoning_content?: unknown; reasoning?: unknown } | undefined;
  const reasoning = delta?.reasoning_content ?? delta?.reasoning;
  if (typeof reasoning === "string" && reasoning.length > 0) out.push({ type: "reasoning", text: reasoning });
  const text = delta?.content;
  if (typeof text === "string" && text.length > 0) out.push({ type: "text", text });
  if (obj.usage) {
    out.push({
      type: "usage",
      inputTokens: numberOrUndefined(obj.usage.prompt_tokens),
      outputTokens: numberOrUndefined(obj.usage.completion_tokens),
    });
  }
  if (typeof choice?.finish_reason === "string") out.push({ type: "done", stopReason: choice.finish_reason });
  return out;
}

function anthropicEvents(eventName: string, json: unknown): LlmEvent[] {
  const out: LlmEvent[] = [];
  const obj = json as {
    type?: string;
    delta?: { text?: unknown; stop_reason?: unknown };
    message?: { usage?: { input_tokens?: unknown } };
    usage?: { output_tokens?: unknown };
    error?: { message?: unknown; type?: unknown };
  };
  const kind = eventName || obj.type || "";
  if (kind === "content_block_delta") {
    const text = obj.delta?.text;
    if (typeof text === "string" && text.length > 0) out.push({ type: "text", text });
  } else if (kind === "message_start") {
    const inputTokens = numberOrUndefined(obj.message?.usage?.input_tokens);
    if (inputTokens !== undefined) out.push({ type: "usage", inputTokens });
  } else if (kind === "message_delta") {
    const outputTokens = numberOrUndefined(obj.usage?.output_tokens);
    if (outputTokens !== undefined) out.push({ type: "usage", outputTokens });
    if (typeof obj.delta?.stop_reason === "string") out.push({ type: "done", stopReason: obj.delta.stop_reason });
  } else if (kind === "message_stop") {
    out.push({ type: "done" });
  } else if (kind === "error") {
    out.push({ type: "error", message: String(obj.error?.message ?? "provider error"), code: typeof obj.error?.type === "string" ? obj.error.type : undefined });
  }
  return out;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
