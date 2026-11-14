import type { LlmHttpSpec } from "@plainva/core";

/**
 * What the chat needs from its shell (plan §5.2).
 *
 * The shared UI never imports Tauri: the desktop shell hands it this port, a
 * test hands it a fake. `start` sends a request SPECIFICATION and a key slot;
 * the shell reads the key from the OS keychain, attaches it and streams the
 * answer back as events. The key value never crosses this boundary.
 */
export interface LlmTransportEvent {
  type: "chunk" | "done" | "error";
  requestId: string;
  /** chunk: the raw server-sent-events text. */
  text?: string;
  /** done: the user stopped it. */
  cancelled?: boolean;
  /** error: the HTTP status, when the failure came from a response. */
  status?: number;
  message?: string;
  detail?: string;
}

export interface LlmTransport {
  start(requestId: string, spec: LlmHttpSpec, keyRef: string | null): Promise<void>;
  cancel(requestId: string): Promise<void>;
  /** The provider's `/models` answer, as JSON text. */
  models(spec: LlmHttpSpec, keyRef: string | null): Promise<string>;
  setKey(keyRef: string, key: string): Promise<void>;
  clearKey(keyRef: string): Promise<void>;
  hasKey(keyRef: string): Promise<boolean>;
  /** Subscribes to the shell's events; returns the unsubscribe function. */
  onEvent(handler: (event: LlmTransportEvent) => void): () => void;
}
