/**
 * How tall the chat composer may get (2026-11-15).
 *
 * A question worth asking is often three paragraphs and a table that has to be
 * pasted: one line was the wrong shape. The composer starts at two lines, drags
 * between a single line's worth and enough to type a page, and remembers what
 * the reader chose.
 */
export const COMPOSER_MIN = 56;
export const COMPOSER_MAX = 360;
export const COMPOSER_DEFAULT = 84;

/** Where the chosen height is remembered. */
export const COMPOSER_KEY = "alviss.llm.composer";

/**
 * Clamps a dragged or stored height into the allowed range. `max` narrows the
 * ceiling on a short window: a composer may never leave the conversation a
 * strip, however far the bar is dragged.
 */
export function clampComposerHeight(raw: number, max: number = COMPOSER_MAX): number {
  if (!Number.isFinite(raw)) return COMPOSER_DEFAULT;
  const ceiling = Math.max(COMPOSER_MIN, Math.min(COMPOSER_MAX, Math.round(max)));
  return Math.max(COMPOSER_MIN, Math.min(ceiling, Math.round(raw)));
}

/** A stored height, or the default when nobody dragged it yet. */
export function composerHeightFrom(stored: unknown): number {
  if (typeof stored !== "number" || stored <= 0) return COMPOSER_DEFAULT;
  return clampComposerHeight(stored);
}
