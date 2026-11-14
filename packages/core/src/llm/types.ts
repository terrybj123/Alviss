/**
 * The wire protocols Alviss speaks (plan §5, "LLM chat").
 *
 * Everything here is a REQUEST SPECIFICATION, never a request: the code turn a
 * conversation into "where, with which headers, with which body", and the
 * native egress in `apps/desktop/src-tauri/src/llm/` performs it. The API key
 * therefore never enters this package, the WebView or any log — the spec only
 * says which header slot it belongs in.
 */

/** Which protocol an endpoint speaks. */
export type LlmProtocol = "openai-chat" | "anthropic-messages";

/** A configured provider endpoint. The key itself lives in the OS keychain. */
export interface LlmEndpoint {
  /** Stable id, also the settings key. */
  id: string;
  /** Shown to the user; may be changed freely. */
  label: string;
  protocol: LlmProtocol;
  /** Origin plus path prefix, without a trailing slash (e.g. https://api.openai.com/v1). */
  baseUrl: string;
  /** The model id exactly as the provider names it. */
  model: string;
  /** Keychain slot the native side reads the key from. */
  keyRef: string;
  /**
   * The model's whole window in tokens, when the user stated it — local servers
   * name their models but not what they can read at once.
   */
  contextTokens?: number;
}

/** A turn in the conversation. `system` is only used for a leading instruction. */
export type LlmRole = "system" | "user" | "assistant";

export interface LlmMessage {
  role: LlmRole;
  text: string;
}

export interface LlmRequest {
  endpoint: LlmEndpoint;
  messages: readonly LlmMessage[];
  maxOutputTokens: number;
  temperature?: number;
}

/** A request the native egress can carry out. */
export interface LlmHttpSpec {
  url: string;
  method: "POST" | "GET";
  headers: Record<string, string>;
  body?: Record<string, unknown>;
  /**
   * Where the key belongs. The native side decides the placement from the
   * endpoint itself and refuses to send a key anywhere else.
   */
  auth: { header: string; scheme?: "Bearer" } | null;
  /** The answer arrives as a server-sent event stream. */
  stream: boolean;
}

/** What a streamed answer produces. */
export type LlmEvent =
  | { type: "text"; text: string }
  | { type: "usage"; inputTokens?: number; outputTokens?: number }
  | { type: "done"; stopReason?: string }
  | { type: "error"; message: string; code?: string };
