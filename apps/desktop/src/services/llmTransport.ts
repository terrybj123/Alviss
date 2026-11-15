import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { LlmHttpSpec } from "@plainva/core";
import type { LlmTransport, LlmTransportEvent } from "@plainva/ui";

/**
 * The desktop shell's side of the chat (plan §5.2).
 *
 * Every call here lands in `src-tauri/src/llm.rs`: the key is read from the OS
 * keychain there, never here. The renderer sends a specification and a slot
 * name, and receives the answer as events.
 */
// The names here are the names `src-tauri/src/llm.rs` serialises: serde renames
// `request_id` to `requestId`. They must match — reading `request_id` silently
// dropped every event and left the panel on "Thinking…" forever (2026-11-15).
interface ChunkPayload {
  requestId: string;
  text: string;
}

interface DonePayload {
  requestId: string;
  cancelled: boolean;
}

interface ErrorPayload {
  requestId: string;
  status: number | null;
  message: string;
  detail: string | null;
}

function headersOf(spec: LlmHttpSpec): [string, string][] {
  return Object.entries(spec.headers);
}

export const desktopLlmTransport: LlmTransport = {
  async start(requestId, spec, keyRef) {
    await invoke("llm_stream", {
      requestId,
      url: spec.url,
      headers: headersOf(spec),
      body: JSON.stringify(spec.body ?? {}),
      keyRef,
    });
  },

  async cancel(requestId) {
    await invoke("llm_cancel", { requestId });
  },

  async models(spec, keyRef) {
    return await invoke<string>("llm_models", { url: spec.url, headers: headersOf(spec), keyRef });
  },

  async setKey(keyRef, key) {
    await invoke("llm_set_key", { keyRef, key });
  },

  async clearKey(keyRef) {
    await invoke("llm_clear_key", { keyRef });
  },

  async hasKey(keyRef) {
    return await invoke<boolean>("keychain_has", { key: keyRef });
  },

  onEvent(handler) {
    const stops: Array<() => void> = [];
    let closed = false;
    const wire = <T,>(name: string, map: (payload: T) => LlmTransportEvent) => {
      void listen<T>(name, (event) => {
        if (!closed) handler(map(event.payload));
      }).then((unlisten) => {
        if (closed) unlisten();
        else stops.push(unlisten);
      });
    };

    wire<ChunkPayload>("llm-chunk", (p) => ({ type: "chunk", requestId: p.requestId, text: p.text }));
    wire<DonePayload>("llm-done", (p) => ({ type: "done", requestId: p.requestId, cancelled: p.cancelled }));
    wire<ErrorPayload>("llm-error", (p) => ({
      type: "error",
      requestId: p.requestId,
      status: p.status ?? undefined,
      message: p.message,
      detail: p.detail ?? undefined,
    }));

    return () => {
      closed = true;
      for (const stop of stops) stop();
    };
  },
};
