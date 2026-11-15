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
