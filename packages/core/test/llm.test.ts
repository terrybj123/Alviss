import { describe, expect, it } from "vitest";
import {
  buildChatRequest,
  buildModelsRequest,
  describeLlmError,
  llmErrorForStatus,
  LlmError,
  LlmStreamDecoder,
  normalizeBaseUrl,
  parseModels,
  redactForDiagnostics,
  type LlmEndpoint,
  type LlmRequest,
} from "../src/llm/index.js";

const openai: LlmEndpoint = {
  id: "openai",
  label: "OpenAI",
  protocol: "openai-chat",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-x",
  keyRef: "openai",
};

const anthropic: LlmEndpoint = {
  id: "anthropic",
  label: "Anthropic",
  protocol: "anthropic-messages",
  baseUrl: "https://api.anthropic.com/v1",
  model: "claude-x",
  keyRef: "anthropic",
};

function request(endpoint: LlmEndpoint): LlmRequest {
  return {
    endpoint,
    messages: [
      { role: "system", text: "You are a careful note assistant." },
      { role: "user", text: "What is this note about?" },
      { role: "assistant", text: "It is about tides." },
      { role: "user", text: "Summarize it." },
    ],
    maxOutputTokens: 512,
    temperature: 0.2,
  };
}

describe("endpoint addresses", () => {
  it("accepts https and trims a trailing slash", () => {
    expect(normalizeBaseUrl("https://api.openai.com/v1/")).toEqual({ baseUrl: "https://api.openai.com/v1", local: false });
  });

  it("allows plain http only for a server on this machine", () => {
    expect(normalizeBaseUrl("http://localhost:11434/v1")).toEqual({ baseUrl: "http://localhost:11434/v1", local: true });
    expect(normalizeBaseUrl("http://example.com/v1")).toBeNull();
  });

  it("rejects what is not an address", () => {
    expect(normalizeBaseUrl("api.openai.com")).toBeNull();
    expect(normalizeBaseUrl("ftp://example.com")).toBeNull();
    expect(normalizeBaseUrl("https://example.com/v1?x=1")).toBeNull();
  });
});

describe("openai-chat requests", () => {
  it("posts the conversation with the system turn lifted out", () => {
    const spec = buildChatRequest(request(openai));
    expect(spec.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(spec.method).toBe("POST");
    expect(spec.stream).toBe(true);
    expect(spec.auth).toEqual({ header: "authorization", scheme: "Bearer" });
    expect(spec.body).toMatchObject({ model: "gpt-x", stream: true, max_tokens: 512, temperature: 0.2 });
    expect(spec.body?.messages).toEqual([
      { role: "system", content: "You are a careful note assistant." },
      { role: "user", content: "What is this note about?" },
      { role: "assistant", content: "It is about tides." },
      { role: "user", content: "Summarize it." },
    ]);
  });

  it("never puts a credential in the spec", () => {
    expect(JSON.stringify(buildChatRequest(request(openai)))).not.toMatch(/sk-|bearer [A-Za-z0-9]/i);
  });

  it("asks for the model list on a GET", () => {
    const spec = buildModelsRequest(openai);
    expect(spec.method).toBe("GET");
    expect(spec.url).toBe("https://api.openai.com/v1/models");
  });
});

describe("anthropic-messages requests", () => {
  it("uses the messages endpoint, the version header and a system field", () => {
    const spec = buildChatRequest(request(anthropic));
    expect(spec.url).toBe("https://api.anthropic.com/v1/messages");
    expect(spec.headers["anthropic-version"]).toBe("2023-06-01");
    expect(spec.body).toMatchObject({ model: "claude-x", system: "You are a careful note assistant.", max_tokens: 512 });
    expect(spec.body?.messages).toEqual([
      { role: "user", content: "What is this note about?" },
      { role: "assistant", content: "It is about tides." },
      { role: "user", content: "Summarize it." },
    ]);
  });
});

describe("model lists", () => {
  it("reads ids and ignores everything else", () => {
    expect(parseModels({ data: [{ id: "a" }, { id: "" }, { nope: 1 }, { id: "b" }] })).toEqual(["a", "b"]);
    expect(parseModels({ models: ["a"] })).toEqual([]);
  });
});

describe("openai stream", () => {
  it("emits text deltas, usage and the finish reason", () => {
    const decoder = new LlmStreamDecoder("openai-chat");
    const events = decoder.push(
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n' +
        'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n' +
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":7,"completion_tokens":2}}\n\n' +
        "data: [DONE]\n\n",
    );
    expect(events).toEqual([
      { type: "text", text: "Hel" },
      { type: "text", text: "lo" },
      { type: "usage", inputTokens: 7, outputTokens: 2 },
      { type: "done", stopReason: "stop" },
      { type: "done" },
    ]);
  });

  it("decodes a CRLF stream the same way", () => {
    const decoder = new LlmStreamDecoder("openai-chat");
    expect(decoder.push('data: {"choices":[{"delta":{"content":"Hi"}}]}\r\n\r\n')).toEqual([{ type: "text", text: "Hi" }]);
  });

  it("holds a partial block across chunks", () => {
    const decoder = new LlmStreamDecoder("openai-chat");
    expect(decoder.push('data: {"choices":[{"delta":{"content":"He')).toEqual([]);
    expect(decoder.push('llo"}}]}\n\n')).toEqual([{ type: "text", text: "Hello" }]);
  });

  it("separates a reasoning model's thinking from its answer", () => {
    const decoder = new LlmStreamDecoder("openai-chat");
    expect(decoder.push('data: {"choices":[{"delta":{"reasoning_content":"let me think"}}]}\n\n')).toEqual([
      { type: "reasoning", text: "let me think" },
    ]);
    expect(decoder.push('data: {"choices":[{"delta":{"content":"Answer"}}]}\n\n')).toEqual([
      { type: "text", text: "Answer" },
    ]);
  });

  it("reports a provider error event", () => {
    const decoder = new LlmStreamDecoder("openai-chat");
    expect(decoder.push('data: {"error":{"message":"quota"}}\n\n')).toEqual([{ type: "error", message: "quota" }]);
  });
});

describe("anthropic stream", () => {
  it("emits text, usage and the stop reason", () => {
    const decoder = new LlmStreamDecoder("anthropic-messages");
    const events = decoder.push(
      'event: message_start\ndata: {"message":{"usage":{"input_tokens":9}}}\n\n' +
        'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"Hi"}}\n\n' +
        'event: message_delta\ndata: {"delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":3}}\n\n' +
        "event: message_stop\ndata: {}\n\n",
    );
    expect(events).toEqual([
      { type: "usage", inputTokens: 9 },
      { type: "text", text: "Hi" },
      { type: "usage", outputTokens: 3 },
      { type: "done", stopReason: "end_turn" },
      { type: "done" },
    ]);
  });

  it("reports a provider error with its type", () => {
    const decoder = new LlmStreamDecoder("anthropic-messages");
    expect(decoder.push('event: error\ndata: {"error":{"type":"overloaded_error","message":"busy"}}\n\n')).toEqual([
      { type: "error", message: "busy", code: "overloaded_error" },
    ]);
  });
});

describe("errors", () => {
  it("maps the statuses a user can act on", () => {
    expect(llmErrorForStatus(401).code).toBe("invalid_key");
    expect(llmErrorForStatus(403).code).toBe("invalid_key");
    expect(llmErrorForStatus(404).code).toBe("unknown_model");
    expect(llmErrorForStatus(429, undefined, "12").code).toBe("rate_limited");
    expect(llmErrorForStatus(429, undefined, "12").retryAfterMs).toBe(12_000);
    expect(llmErrorForStatus(500).code).toBe("server");
    expect(llmErrorForStatus(400, { error: { message: "maximum context length exceeded" } }).code).toBe("context_overflow");
  });

  it("uses the provider's own words when it has them", () => {
    expect(llmErrorForStatus(401, { error: { message: "invalid api key" } }).message).toBe("invalid api key");
  });

  it("describes an error without leaking a credential", () => {
    const described = describeLlmError(new LlmError("invalid_key", "bad key sk-abcdefghijkl"));
    expect(redactForDiagnostics(described)).not.toContain("sk-abcdefghijkl");
  });
});
