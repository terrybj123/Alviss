import { describe, expect, it } from "vitest";
import { CHAT_PANEL_DEFAULT, CHAT_PANEL_MAX, CHAT_PANEL_MIN, chatWidthFrom, clampChatWidth } from "./chatPanelWidth";

describe("the docked chat width", () => {
  it("keeps a width inside the range", () => {
    expect(clampChatWidth(420)).toBe(420);
  });

  it("never lets the note disappear", () => {
    expect(clampChatWidth(2_000)).toBe(CHAT_PANEL_MAX);
    expect(clampChatWidth(20)).toBe(CHAT_PANEL_MIN);
    expect(clampChatWidth(-100)).toBe(CHAT_PANEL_MIN);
  });

  it("rounds what a drag produced", () => {
    expect(clampChatWidth(412.6)).toBe(413);
  });

  it("uses the default for a value that is not a width", () => {
    expect(clampChatWidth(Number.NaN)).toBe(CHAT_PANEL_DEFAULT);
  });

  it("treats a missing or empty stored value as no choice", () => {
    expect(chatWidthFrom(null)).toBe(CHAT_PANEL_DEFAULT);
    expect(chatWidthFrom("")).toBe(CHAT_PANEL_DEFAULT);
    expect(chatWidthFrom("0")).toBe(CHAT_PANEL_MIN);
    expect(chatWidthFrom("512")).toBe(512);
    expect(chatWidthFrom("9999")).toBe(CHAT_PANEL_MAX);
  });
});
