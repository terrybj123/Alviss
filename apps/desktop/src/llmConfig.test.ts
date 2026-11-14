import { describe, expect, it } from "vitest";
import { emptyLlmConfig, LLM_PRESETS, nextCustomId, readLlmConfig } from "@plainva/ui";

/**
 * What survives a restart, and what a hand-edited settings file cannot smuggle
 * back in (plan §5.1): an endpoint is only kept when it still names a protocol
 * and an address.
 */
describe("stored chat endpoints", () => {
  it("keeps a complete endpoint", () => {
    const config = readLlmConfig({
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
    expect(config.endpoints).toHaveLength(1);
    expect(config.activeId).toBe("openai");
  });

  it("drops an entry without a known protocol or an address", () => {
    const config = readLlmConfig({
      endpoints: [
        { id: "a", protocol: "grpc", baseUrl: "https://x/v1" },
        { id: "b", protocol: "openai-chat" },
        { id: "c", protocol: "anthropic-messages", baseUrl: "https://y/v1", model: "m" },
      ],
    });
    expect(config.endpoints.map((e) => e.id)).toEqual(["c"]);
  });

  it("gives a key slot to an entry that lost one", () => {
    const config = readLlmConfig({
      endpoints: [{ id: "deepseek", protocol: "openai-chat", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" }],
    });
    expect(config.endpoints[0]?.keyRef).toBe("llm.deepseek");
    expect(config.endpoints[0]?.label).toBe("deepseek");
  });

  it("falls back to the first endpoint when the active one is gone", () => {
    const config = readLlmConfig({
      endpoints: [{ id: "a", protocol: "openai-chat", baseUrl: "https://x/v1", model: "m" }],
      activeId: "gone",
    });
    expect(config.activeId).toBe("a");
  });

  it("treats anything else as an empty configuration", () => {
    expect(readLlmConfig(undefined)).toEqual(emptyLlmConfig);
    expect(readLlmConfig({ endpoints: "nope" })).toEqual(emptyLlmConfig);
  });

  it("names a new own server without colliding", () => {
    expect(nextCustomId([])).toBe("custom-1");
    expect(nextCustomId([{ id: "custom-1", label: "x", protocol: "openai-chat", baseUrl: "https://x/v1", model: "", keyRef: "llm.custom-1" }])).toBe("custom-2");
  });

  it("ships OpenAI, Anthropic and DeepSeek with usable addresses", () => {
    expect(LLM_PRESETS.map((p) => p.id)).toEqual(["openai", "anthropic", "deepseek"]);
    for (const preset of LLM_PRESETS) {
      expect(preset.baseUrl.startsWith("https://")).toBe(true);
      expect(preset.model.length).toBeGreaterThan(0);
    }
  });
});
