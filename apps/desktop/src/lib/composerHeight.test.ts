import { describe, expect, it } from "vitest";
import { COMPOSER_DEFAULT, COMPOSER_MAX, COMPOSER_MIN, clampComposerHeight, composerHeightFrom } from "@plainva/ui";

describe("the chat composer height", () => {
  it("keeps a dragged height inside the range", () => {
    expect(clampComposerHeight(120)).toBe(120);
    expect(clampComposerHeight(5)).toBe(COMPOSER_MIN);
    expect(clampComposerHeight(999)).toBe(COMPOSER_MAX);
    expect(clampComposerHeight(101.4)).toBe(101);
  });

  it("falls back to a sane default for anything that is not a height", () => {
    expect(clampComposerHeight(Number.NaN)).toBe(COMPOSER_DEFAULT);
    expect(composerHeightFrom(undefined)).toBe(COMPOSER_DEFAULT);
    expect(composerHeightFrom(null)).toBe(COMPOSER_DEFAULT);
    expect(composerHeightFrom("120")).toBe(COMPOSER_DEFAULT);
    expect(composerHeightFrom(0)).toBe(COMPOSER_DEFAULT);
  });

  it("narrows the ceiling on a short window", () => {
    expect(clampComposerHeight(300, 200)).toBe(200);
    expect(clampComposerHeight(100, 200)).toBe(100);
    expect(clampComposerHeight(500, 10)).toBe(COMPOSER_MIN);
  });

  it("reads a stored number back", () => {
    expect(composerHeightFrom(200)).toBe(200);
    expect(composerHeightFrom(5000)).toBe(COMPOSER_MAX);
  });
});
