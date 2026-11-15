// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";

/**
 * The wire contract between `src-tauri/src/llm.rs` and the panel.
 *
 * This is the test that was missing on 2026-11-15: the native side serialises
 * `request_id` as `requestId`, the transport read `request_id`, every event
 * came back with an undefined id and was dropped — the chat sat on "Thinking…"
 * forever while the provider answered normally.
 */
const handlers: Record<string, (event: { payload: unknown }) => void> = {};

vi.mock("@tauri-apps/api/event", () => ({
  listen: async (name: string, callback: (event: { payload: unknown }) => void) => {
    handlers[name] = callback;
    return () => {
      delete handlers[name];
    };
  },
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => undefined) }));

import { desktopLlmTransport } from "./llmTransport";
import type { LlmTransportEvent } from "@plainva/ui";

async function subscribe(): Promise<{ events: LlmTransportEvent[]; stop: () => void }> {
  const events: LlmTransportEvent[] = [];
  const stop = desktopLlmTransport.onEvent((event) => events.push(event));
  await Promise.resolve();
  await Promise.resolve();
  return { events, stop };
}

describe("the native event contract", () => {
  it("reads the fields the native side actually sends", async () => {
    const { events, stop } = await subscribe();

    handlers["llm-chunk"]?.({ payload: { requestId: "r1", text: "Hel" } });
    handlers["llm-chunk"]?.({ payload: { requestId: "r1", text: "lo" } });
    handlers["llm-done"]?.({ payload: { requestId: "r1", cancelled: false } });
    handlers["llm-error"]?.({ payload: { requestId: "r2", status: 401, message: "bad key", detail: "{}" } });
    stop();

    expect(events).toEqual([
      { type: "chunk", requestId: "r1", text: "Hel" },
      { type: "chunk", requestId: "r1", text: "lo" },
      { type: "done", requestId: "r1", cancelled: false },
      { type: "error", requestId: "r2", status: 401, message: "bad key", detail: "{}" },
    ]);
  });

  it("stops delivering after the caller unsubscribes", async () => {
    const { events, stop } = await subscribe();
    handlers["llm-chunk"]?.({ payload: { requestId: "r1", text: "a" } });
    stop();
    handlers["llm-chunk"]?.({ payload: { requestId: "r1", text: "b" } });
    expect(events).toHaveLength(1);
  });
});
