// Keyboard event endCoordinates.screenY is an absolute screen position.
export function keyboardOverlap(screenHeight: number, keyboardScreenY: number): number {
  if (!Number.isFinite(screenHeight) || !Number.isFinite(keyboardScreenY)
    || screenHeight <= 0) return 0;
  return Math.min(screenHeight, Math.max(0, screenHeight - keyboardScreenY));
}
