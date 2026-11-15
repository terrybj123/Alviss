/**
 * How wide the docked chat may get (2026-11-15).
 *
 * The divider drags like the sidebar's, but the chat is a reading-width column,
 * not a document view: below the minimum the message bubbles wrap every other
 * word, above the maximum there is no room left for the note it talks about.
 */
export const CHAT_PANEL_MIN = 300;
export const CHAT_PANEL_MAX = 760;
export const CHAT_PANEL_DEFAULT = 400;

/** Where the chosen width is remembered, per window. */
export const CHAT_WIDTH_KEY = "alviss-chat-panel-width";

/** Clamps a dragged or stored width into the allowed range. */
export function clampChatWidth(raw: number): number {
  if (!Number.isFinite(raw)) return CHAT_PANEL_DEFAULT;
  return Math.max(CHAT_PANEL_MIN, Math.min(CHAT_PANEL_MAX, Math.round(raw)));
}

/**
 * A stored width, or the default when nothing was chosen yet. `Number(null)`
 * is 0 and `Number("")` is 0, and 0 is not a width the panel can have — both
 * mean "nobody dragged it".
 */
export function chatWidthFrom(stored: string | null): number {
  if (stored === null || stored.trim() === "") return CHAT_PANEL_DEFAULT;
  return clampChatWidth(Number(stored));
}
