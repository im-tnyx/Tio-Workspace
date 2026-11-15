import { authPreviewLayout } from '../theme/tokens/index.ts';

// Pure viewport budget. Returns null until native onLayout measurements exist.
// The keyboard overlap must be the measured route/IME overlap, not screen height.
export function authAvailableHeight(
  rootHeight: number | null,
  headerHeight: number | null,
  footerHeight: number | null,
  keyboardClearance: number,
  footerGutter: number,
  formTopPadding: number,
): number | null {
  if (rootHeight === null || headerHeight === null || footerHeight === null)
    return null;
  return Math.max(0, rootHeight - headerHeight - footerHeight
    - keyboardClearance - footerGutter - formTopPadding);
}

export type AuthDensity = 'regular' | 'compact' | 'tight';

// Normal presentation stays unchanged; compact modes are only activated when
// the measured viewport cannot contain the standard heading/field geometry.
export function authDensity(availableHeight: number | null, fontScale: number): AuthDensity {
  if (availableHeight === null) return 'regular';
  const scale = Math.max(1, Number.isFinite(fontScale) ? fontScale : 1);
  if (availableHeight < authPreviewLayout.tightAvailableHeight * scale) return 'tight';
  if (availableHeight < authPreviewLayout.compactAvailableHeight * scale) return 'compact';
  return 'regular';
}

/**
 * The fixed no-scroll auth preview cannot guarantee that every very short
 * keyboard-open viewport can show both a full-size input and the CTA.
 * Expose a reachable top-bar escape action rather than allowing a trapped IME.
 * This is a fallback, not a substitute for physical dynamic-type QA.
 */
export function needsKeyboardDismiss(
  availableHeight: number | null,
  fontScale: number,
  keyboardVisible: boolean,
): boolean {
  if (!keyboardVisible || availableHeight === null) return false;
  const scale = Math.max(1, Number.isFinite(fontScale) ? fontScale : 1);
  return availableHeight < authPreviewLayout.activeInputMinHeight * scale;
}

// The abbreviated visual safety warning is a last-resort narrow-screen mode.
// Crucially, wide Android layouts must not enter this measurement-driven mode
// when the IME opens: doing so can cause unnecessary TextInput focus reflows.
export function needsCompactKeyboardNotice(
  availableHeight: number | null, fontScale: number,
  keyboardVisible: boolean, viewportWidth: number,
): boolean {
  return Number.isFinite(viewportWidth) && viewportWidth > 0
    && viewportWidth <= authPreviewLayout.extremeCompactMaxWidth
    && needsKeyboardDismiss(availableHeight, fontScale, keyboardVisible);
}
