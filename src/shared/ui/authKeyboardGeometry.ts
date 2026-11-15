// The bottom of the actual auth route and the keyboard's top are measured in
// the same native window/screen coordinate system. Do not subtract from the
// physical device height: native navigation may already resize the route.
export function keyboardOverlap(viewBottomY: number, keyboardScreenY: number): number {
  if (!Number.isFinite(viewBottomY) || !Number.isFinite(keyboardScreenY)
    || viewBottomY <= 0) return 0;
  return Math.min(viewBottomY, Math.max(0, viewBottomY - keyboardScreenY));
}

/**
 * Android edge-to-edge can leave the root at full height while Gboard covers
 * the CTA. RN's keyboard.screenY (physical screen) and View.measureInWindow
 * (app-window) may have different system-bar origins. Prefer native keyboard
 * depth, remove the bottom navigation inset already excluded by the route,
 * and subtract any native route shrink to avoid double-lifting on adjustResize.
 * All arguments are device-independent dp, never image pixels.
 */
export function androidKeyboardClearance({
  screenHeight, keyboardTopY, keyboardHeight,
  rootRestHeight, rootCurrentHeight, bottomInset,
}: {
  screenHeight: number; keyboardTopY: number; keyboardHeight: number;
  rootRestHeight: number | null; rootCurrentHeight: number | null;
  bottomInset: number;
}): number {
  if (!Number.isFinite(screenHeight) || !Number.isFinite(keyboardTopY)
    || screenHeight <= 0) return 0;
  const fullImeDepth = Math.max(0,
    screenHeight - keyboardTopY,
    Number.isFinite(keyboardHeight) ? keyboardHeight : 0);
  const nativeResize = rootRestHeight !== null && rootCurrentHeight !== null
    ? Math.max(0, rootRestHeight - rootCurrentHeight) : 0;
  return Math.max(0, fullImeDepth - Math.max(0, bottomInset) - nativeResize);
}
