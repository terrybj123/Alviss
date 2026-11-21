/**
 * Central app-language registry (Gesamtplan Sprachen 2026-07-04). One entry per
 * supported UI language; the BCP-47 code doubles as the locale JSON basename
 * (src/locales/<code>.json) and the user-guide folder name (docs/user/<code>/).
 *
 * Adding a language = one entry here + the locale JSON (i18n.ts picks it up
 * automatically) + templates.<code>.ts (optional, falls back to English) +
 * the docs/user/<code>/ guide. Conventions: docs/engineering/Translation_Glossary.md.
 */

export interface AppLanguage {
  /** BCP-47 tag; equals the locale JSON basename and the docs/user folder. */
  code: string;
  /** Native self-name — shown untranslated in the language picker. */
  nativeName: string;
  /**
   * True while the translation is machine-made and has not been reviewed by a
   * native speaker. The picker says so; nothing is hidden (2026-11-21).
   */
  beta?: boolean;
}

export const APP_LANGUAGES: AppLanguage[] = [
  { code: "en", nativeName: "English" },
  { code: "de", nativeName: "Deutsch" },
  { code: "fr", nativeName: "Français", beta: true },
  { code: "es", nativeName: "Español" },
  { code: "pt-BR", nativeName: "Português (Brasil)" },
  { code: "it", nativeName: "Italiano" },
  { code: "nl", nativeName: "Nederlands" },
  { code: "pl", nativeName: "Polski" },
  { code: "zh-CN", nativeName: "简体中文" },
  { code: "ja", nativeName: "日本語", beta: true },
];

export const DEFAULT_LANGUAGE = "en";

/**
 * The UI languages this build OFFERS, in the order the picker shows them:
 * English (source), Simplified Chinese (written by hand), German (the upstream
 * author's own language), French and Japanese (machine translations, marked
 * beta). `APP_LANGUAGES` stays the asset registry — the parity tests, the
 * date-fns loaders and the vault templates still know every bundle — while this
 * list is what the picker shows and what an OS locale may resolve to.
 */
export const OFFERED_LANGUAGES: AppLanguage[] = ["en", "zh-CN", "de", "fr", "ja"].map(
  (code) => APP_LANGUAGES.find((l) => l.code === code)!,
);

/** Clamps any language tag to one this build offers; English otherwise. */
export function offeredLanguage(tag: string | null | undefined): string {
  const match = matchAppLanguage(tag);
  return OFFERED_LANGUAGES.some((l) => l.code === match) ? match : DEFAULT_LANGUAGE;
}

/**
 * Maps an arbitrary language tag (OS locale, stored setting, i18n.language) to
 * a supported code: exact match first (case-insensitive), then primary-subtag
 * match ("pt-PT" → "pt-BR", "zh" → "zh-CN"), else English.
 */
export function matchAppLanguage(tag: string | null | undefined): string {
  if (!tag) return DEFAULT_LANGUAGE;
  const lower = tag.toLowerCase();
  const exact = APP_LANGUAGES.find((l) => l.code.toLowerCase() === lower);
  if (exact) return exact.code;
  const primary = lower.split("-")[0];
  const byPrefix = APP_LANGUAGES.find((l) => l.code.toLowerCase().split("-")[0] === primary);
  return byPrefix ? byPrefix.code : DEFAULT_LANGUAGE;
}
