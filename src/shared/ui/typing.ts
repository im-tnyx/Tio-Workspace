// A short, one-shot brand reveal. No blinking or looping after completion.
export const BRAND_TYPING_INTERVAL_MS = 165;
export const BRAND_DOT_DIAMETER = 20;
export const BRAND_DOT_GAP = 7;
export const BRAND_DOT_FINAL_HOLD_MS = 240;

export function visibleTypingText(text: string, count: number): string {
  if (!Number.isFinite(count)) return text;
  return text.slice(0, Math.max(0, Math.min(text.length, Math.floor(count))));
}
