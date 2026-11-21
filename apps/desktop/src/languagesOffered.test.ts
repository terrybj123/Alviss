import { describe, expect, it } from "vitest";
import { APP_LANGUAGES, OFFERED_LANGUAGES, offeredLanguage } from "@plainva/ui";

/**
 * Which languages this build offers (2026-11-21), and what an OS locale may
 * resolve to. `APP_LANGUAGES` stays the asset registry — every bundle still
 * exists, is tested for parity and is loadable — while the picker shows the
 * five below.
 */
describe("the offered languages", () => {
  it("lists English, Chinese, German, French and Japanese in that order", () => {
    expect(OFFERED_LANGUAGES.map((l) => l.code)).toEqual(["en", "zh-CN", "de", "fr", "ja"]);
  });

  it("marks the machine translations as beta", () => {
    expect(OFFERED_LANGUAGES.filter((l) => l.beta).map((l) => l.code)).toEqual(["fr", "ja"]);
    expect(OFFERED_LANGUAGES.filter((l) => !l.beta).map((l) => l.code)).toEqual(["en", "zh-CN", "de"]);
  });

  it("keeps every bundle in the registry", () => {
    expect(APP_LANGUAGES).toHaveLength(10);
  });

  it("resolves an OS locale into the offered set, else English", () => {
    expect(offeredLanguage("de-DE")).toBe("de");
    expect(offeredLanguage("de-AT")).toBe("de");
    expect(offeredLanguage("fr-CA")).toBe("fr");
    expect(offeredLanguage("ja-JP")).toBe("ja");
    expect(offeredLanguage("zh-Hans-CN")).toBe("zh-CN");
    expect(offeredLanguage("es-ES")).toBe("en");
    expect(offeredLanguage("pt-BR")).toBe("en");
    expect(offeredLanguage(null)).toBe("en");
  });
});
