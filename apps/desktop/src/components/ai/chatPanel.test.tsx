// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import i18n from "@plainva/ui/i18n";
import {
  ChatPanel,
  setPlatformServices,
  type LlmTransport,
  type LlmTransportEvent,
  type PlatformServices,
} from "@plainva/ui";
import type { LlmHttpSpec } from "@plainva/core";

/**
 * The chat panel against a fake transport (plan §5.1): what it sends, what it
 * shows while an answer streams, and what it does with a provider error.
 *
 * The shell's transport is the only thing faked — the request specification,
 * the stream decoder and the error mapping are the real ones, which is where
 * the mistakes live.
 */
const memory = new Map<string, unknown>();
const store = {
  get: async <T,>(key: string) => memory.get(key) as T | undefined,
  set: async (key: string, value: unknown) => {
    memory.set(key, value);
  },
  delete: async (key: string) => memory.delete(key),
  keys: async () => [...memory.keys()],
  save: async () => undefined,
};

function services(): PlatformServices {
  return {
    loadSettings: async () => store,
    credentials: {
      readSecret: async () => null,
      writeSecret: async () => undefined,
      removeSecret: async () => undefined,
    },
    openExternal: async () => undefined,
  };
}

interface Started {
  requestId: string;
  spec: LlmHttpSpec;
  keyRef: string | null;
}

let started: Started | null = null;
let handler: ((event: LlmTransportEvent) => void) | null = null;

const transport: LlmTransport = {
  async start(requestId, spec, keyRef) {
    started = { requestId, spec, keyRef };
  },
  async cancel() {
    return undefined;
  },
  async models() {
    return '{"data":[{"id":"m1"},{"id":"m2"}]}';
  },
  async setKey() {
    return undefined;
  },
  async clearKey() {
    return undefined;
  },
  async hasKey() {
    return true;
  },
  onEvent(callback) {
    handler = callback;
    return () => {
      handler = null;
    };
  },
};

let container: HTMLDivElement;
let root: Root;

function setInput(field: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

function input(): HTMLTextAreaElement {
  return container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Ask a question…"]')!;
}

function buttonWithText(text: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(text));
}

beforeEach(async () => {
  memory.clear();
  memory.set("alviss.llm", {
    endpoints: [
      {
        id: "openai",
        label: "OpenAI",
        protocol: "openai-chat",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-x",
        keyRef: "llm.openai",
      },
    ],
    activeId: "openai",
  });
  started = null;
  handler = null;
  await i18n.changeLanguage("en");
  setPlatformServices(services());
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<ChatPanel transport={transport} context={{ title: "Tides", text: "The tide rises twice a day." }} />);
  });
  await act(async () => undefined);
});

afterEach(() => {
  root.unmount();
  container.remove();
});

describe("the chat panel", () => {
  it("sends the question with the open note as context", async () => {
    await act(async () => {
      setInput(input(), "When does the tide rise?");
    });
    await act(async () => {
      buttonWithText("Send")?.click();
    });

    expect(started).not.toBeNull();
    expect(started!.spec.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(started!.spec.stream).toBe(true);
    const body = JSON.stringify(started!.spec.body);
    expect(body).toContain("When does the tide rise?");
    expect(body).toContain("The tide rises twice a day.");
    expect(started!.keyRef).toBe("llm.openai");
  });

  it("never puts the key in the request it sends", async () => {
    await act(async () => {
      setInput(input(), "Hello");
    });
    await act(async () => {
      buttonWithText("Send")?.click();
    });
    // The spec names the SLOT the key belongs in; the value is attached by the
    // native side, so no header may carry it here.
    expect(Object.keys(started!.spec.headers)).not.toContain("authorization");
    expect(JSON.stringify(started!.spec)).not.toMatch(/sk-[A-Za-z0-9]/);
  });

  it("shows the answer as it streams and keeps it afterwards", async () => {
    await act(async () => {
      setInput(input(), "Hello");
    });
    await act(async () => {
      buttonWithText("Send")?.click();
    });
    await act(async () => {
      handler!({ type: "chunk", requestId: started!.requestId, text: 'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n' });
    });
    expect(container.textContent).toContain("Hel");

    await act(async () => {
      handler!({ type: "chunk", requestId: started!.requestId, text: 'data: {"choices":[{"delta":{"content":"lo"}}]}\n\ndata: [DONE]\n\n' });
    });
    await act(async () => {
      handler!({ type: "done", requestId: started!.requestId });
    });
    expect(container.textContent).toContain("Hello");
  });

  it("renders the answer as escaped markdown, never as markup from the model", async () => {
    await act(async () => {
      setInput(input(), "Hello");
    });
    await act(async () => {
      buttonWithText("Send")?.click();
    });
    await act(async () => {
      handler!({
        type: "chunk",
        requestId: started!.requestId,
        text: 'data: {"choices":[{"delta":{"content":"**bold** and <img src=x onerror=alert(1)>"}}]}\n\ndata: [DONE]\n\n',
      });
    });
    await act(async () => {
      handler!({ type: "done", requestId: started!.requestId });
    });
    const answer = container.querySelector('[data-testid="llm-answer"]')!;
    expect(answer.innerHTML).toContain("<strong>bold</strong>");
    // The tag arrives escaped: it is text the model wrote, not markup.
    expect(answer.innerHTML).toContain("&lt;img");
    expect(answer.querySelector("img")).toBeNull();
  });

  it("offers the provider's models after a successful test", async () => {
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Providers"]')?.click();
    });
    await act(async () => {
      buttonWithText("Own server")?.click();
    });
    const address = container.querySelector<HTMLInputElement>('input[aria-label="Address (https://…/v1)"]')!;
    await act(async () => {
      setInput(address, "https://example.org/v1");
    });
    await act(async () => {
      buttonWithText("Test connection")?.click();
    });
    await act(async () => undefined);

    const picker = container.querySelector<HTMLSelectElement>('[data-testid="llm-model-picker"]')!;
    expect(picker).not.toBeNull();
    expect([...picker.options].map((o) => o.value)).toEqual(["", "m1", "m2"]);
  });

  it("edits an existing provider instead of forcing a new one", async () => {
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Providers"]')?.click();
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="llm-edit-openai"]')?.click();
    });

    const model = container.querySelector<HTMLInputElement>('[data-testid="llm-model-input"]')!;
    expect(model.value).toBe("gpt-x");
    await act(async () => {
      setInput(model, "gpt-y");
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="llm-save"]')?.click();
    });
    await act(async () => undefined);

    const stored = memory.get("alviss.llm") as { endpoints: Array<{ id: string; model: string }> };
    expect(stored.endpoints).toHaveLength(1);
    expect(stored.endpoints[0]?.id).toBe("openai");
    expect(stored.endpoints[0]?.model).toBe("gpt-y");
    // Back on the list, where the change is visible.
    expect(container.textContent).toContain("gpt-y");
  });

  it("always offers the model field, and says so when no list is known", async () => {
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Providers"]')?.click();
    });
    await act(async () => {
      buttonWithText("Own server")?.click();
    });
    expect(container.querySelector('[data-testid="llm-model-input"]')).not.toBeNull();
    expect(container.textContent).toContain("type the model id");
  });

  it("shows a reasoning model's thinking while it has not answered yet", async () => {
    await act(async () => {
      setInput(input(), "Hello");
    });
    await act(async () => {
      buttonWithText("Send")?.click();
    });
    await act(async () => {
      handler!({
        type: "chunk",
        requestId: started!.requestId,
        text: 'data: {"choices":[{"delta":{"reasoning_content":"weighing the tide"}}]}\n\n',
      });
    });
    const thinking = container.querySelector('[data-testid="llm-thinking"]');
    expect(thinking?.textContent).toContain("weighing the tide");
  });

  it("says so when a reasoning model runs out of budget before answering", async () => {
    await act(async () => {
      setInput(input(), "Hello");
    });
    await act(async () => {
      buttonWithText("Send")?.click();
    });
    await act(async () => {
      handler!({
        type: "chunk",
        requestId: started!.requestId,
        text: 'data: {"choices":[{"delta":{"reasoning_content":"only thinking"}}]}\n\n',
      });
    });
    await act(async () => {
      handler!({ type: "done", requestId: started!.requestId });
    });
    expect(container.textContent).toContain("returned no text");
  });

  it("draws a Markdown table as a table, in the prose class", async () => {
    await act(async () => {
      setInput(input(), "Give me a table");
    });
    await act(async () => {
      buttonWithText("Send")?.click();
    });
    const md = "| a | b |\n| --- | --- |\n| 1 | 2 |";
    const payload = JSON.stringify({ choices: [{ delta: { content: md } }] });
    await act(async () => {
      handler!({ type: "chunk", requestId: started!.requestId, text: `data: ${payload}\n\n` });
    });
    await act(async () => {
      handler!({ type: "done", requestId: started!.requestId });
    });
    const answer = container.querySelector('[data-testid="llm-answer"]')!;
    expect(answer.classList.contains("pv-chat-md")).toBe(true);
    expect(answer.querySelector("table")).not.toBeNull();
    expect(answer.querySelectorAll("td")).toHaveLength(2);
  });

  it("cycles the text size and remembers the choice", async () => {
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="llm-text-size"]')?.click();
    });
    await act(async () => undefined);
    expect(memory.get("alviss.llm.font")).toBe(1);
  });

  it("takes several lines, and only Enter sends", async () => {
    const field = input();
    expect(field.tagName).toBe("TEXTAREA");
    await act(async () => {
      setInput(field, "first line");
    });
    await act(async () => {
      field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true }));
    });
    // Shift+Enter is a new paragraph: nothing was sent.
    expect(started).toBeNull();

    await act(async () => {
      field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(started).not.toBeNull();
  });

  it("keeps the text while a Chinese IME is composing", async () => {
    const field = input();
    await act(async () => {
      setInput(field, "tong");
    });
    await act(async () => {
      field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true }));
    });
    expect(started).toBeNull();
  });

  it("remembers the height the composer was dragged to", async () => {
    const handle = container.querySelector<HTMLElement>('[data-testid="llm-composer-handle"]')!;
    await act(async () => {
      handle.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientY: 300 }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientY: 250 }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent("mouseup"));
    });
    await act(async () => undefined);

    expect(memory.get("alviss.llm.composer")).toBe(134);
    expect(input().style.height).toBe("134px");
  });

  it("clamps a drag that would swallow the conversation", async () => {
    const handle = container.querySelector<HTMLElement>('[data-testid="llm-composer-handle"]')!;
    await act(async () => {
      handle.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientY: 300 }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientY: -2000 }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent("mouseup"));
    });
    await act(async () => undefined);
    expect(input().style.height).toBe("360px");
  });

  it("gives the composer the whole width and puts the controls underneath", async () => {
    const composer = input();
    expect(composer.style.width).toBe("100%");
    const send = container.querySelector('[data-testid="llm-send"]')!;
    // Not beside the text: the old row stole width from what you type.
    expect(send.parentElement).not.toBe(composer.parentElement);
    // The provider switch lives with the send button, like a chat app's footer.
    expect(container.querySelector('[data-testid="llm-provider-select"]')).not.toBeNull();
    // And the grip is a visible, styled bar rather than an invisible strip.
    const grip = container.querySelector('[data-testid="llm-composer-handle"]')!;
    expect(grip.classList.contains("pv-chat-grip")).toBe(true);
    expect(grip.querySelector("span")).not.toBeNull();
  });

  it("keeps the newest line visible when the composer grows", async () => {
    const list = container.querySelector<HTMLElement>('[data-testid="llm-messages"]')!;
    Object.defineProperty(list, "scrollHeight", { value: 1000, configurable: true });
    Object.defineProperty(list, "clientHeight", { value: 400, configurable: true });

    const handle = container.querySelector<HTMLElement>('[data-testid="llm-composer-handle"]')!;
    await act(async () => {
      handle.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientY: 300 }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientY: 200 }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent("mouseup"));
    });
    await act(async () => undefined);

    // The list follows the bottom instead of hiding the last line behind the
    // taller composer.
    expect(list.scrollTop).toBe(1000);
  });

  it("does not drag the reader back down once they scrolled up", async () => {
    const list = container.querySelector<HTMLElement>('[data-testid="llm-messages"]')!;
    Object.defineProperty(list, "scrollHeight", { value: 1000, configurable: true });
    Object.defineProperty(list, "clientHeight", { value: 400, configurable: true });
    list.scrollTop = 0;
    await act(async () => {
      list.dispatchEvent(new Event("scroll", { bubbles: false }));
    });

    await act(async () => {
      setInput(input(), "Hello");
    });
    await act(async () => {
      buttonWithText("Send")?.click();
    });
    await act(async () => undefined);

    expect(list.scrollTop).toBe(0);
  });

  it("names the fix when the provider rejects the key", async () => {
    await act(async () => {
      setInput(input(), "Hello");
    });
    await act(async () => {
      buttonWithText("Send")?.click();
    });
    await act(async () => {
      handler!({
        type: "error",
        requestId: started!.requestId,
        status: 401,
        message: "bad key",
        detail: '{"error":{"message":"Incorrect API key provided"}}',
      });
    });
    expect(container.textContent).toContain("rejected the key");
    expect(container.textContent).toContain("Incorrect API key provided");
  });
});
