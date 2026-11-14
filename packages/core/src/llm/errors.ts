/**
 * What can go wrong with a model call, in terms a screen can act on.
 *
 * The mapping matters more than the message: the chat panel offers a different
 * fix for a rejected key, an unknown model, a rate limit and an unreachable
 * host. Everything here is derived from the response, never from the request,
 * so an error can be shown and logged without leaking the key.
 */

export type LlmErrorCode =
  | "invalid_key"
  | "rate_limited"
  | "unknown_model"
  | "context_overflow"
  | "server"
  | "network"
  | "cancelled"
  | "invalid_response"
  | "not_configured";

export class LlmError extends Error {
  readonly code: LlmErrorCode;
  /** HTTP status, when the failure came from a response. */
  readonly status?: number;
  /** How long the provider asked us to wait, when it said so. */
  readonly retryAfterMs?: number;
  /** The provider's own words, kept for diagnostics. */
  readonly detail?: string;

  constructor(code: LlmErrorCode, message: string, options: { status?: number; retryAfterMs?: number; detail?: string } = {}) {
    super(message);
    this.name = "LlmError";
    this.code = code;
    this.status = options.status;
    this.retryAfterMs = options.retryAfterMs;
    this.detail = options.detail;
  }
}

/** The `error.message` of a provider body, without trusting its shape. */
export function providerMessage(body: unknown): string | undefined {
  const root = body as { error?: { message?: unknown } | string; message?: unknown } | undefined;
  if (!root) return undefined;
  if (typeof root.error === "string") return root.error;
  if (typeof root.error?.message === "string") return root.error.message;
  if (typeof root.message === "string") return root.message;
  return undefined;
}

/** Maps a non-2xx answer onto a code the UI knows how to fix. */
export function llmErrorForStatus(status: number, body?: unknown, retryAfterHeader?: string | null): LlmError {
  const detail = providerMessage(body);
  const lower = (detail ?? "").toLowerCase();
  const retryAfterMs = parseRetryAfter(retryAfterHeader);

  if (status === 401 || status === 403) {
    return new LlmError("invalid_key", detail ?? "The provider rejected the key.", { status, detail });
  }
  if (status === 429) {
    return new LlmError("rate_limited", detail ?? "The provider is rate limiting this key.", { status, retryAfterMs, detail });
  }
  if (status === 404) {
    return new LlmError("unknown_model", detail ?? "The provider does not know this model.", { status, detail });
  }
  if (status === 400 && (lower.includes("context") || lower.includes("too long") || lower.includes("maximum"))) {
    return new LlmError("context_overflow", detail ?? "The conversation does not fit the model's window.", { status, detail });
  }
  if (status >= 500) {
    return new LlmError("server", detail ?? "The provider had a problem.", { status, retryAfterMs, detail });
  }
  return new LlmError("invalid_response", detail ?? `The provider answered with HTTP ${status}.`, { status, detail });
}

function parseRetryAfter(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const at = Date.parse(value);
  if (Number.isFinite(at)) return Math.max(0, at - Date.now());
  return undefined;
}

/** One sentence for the user, and nothing that could contain a credential. */
export function describeLlmError(error: unknown): string {
  if (error instanceof LlmError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Guards what may leave the machine as diagnostics: a provider sometimes echoes
 * part of the request in an error. Any bearer-looking run is replaced.
 */
export function redactForDiagnostics(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-…")
    .replace(/(bearer\s+)[A-Za-z0-9._-]{8,}/gi, "$1…")
    .replace(/\b[a-f0-9]{32,}\b/gi, "…");
}
