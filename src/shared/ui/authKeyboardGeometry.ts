// The bottom of the actual auth route and the keyboard's top are measured in
// the same native window/screen coordinate system. Do not subtract from the
// physical device height: native navigation may already resize the route.
export function keyboardOverlap(viewBottomY: number, keyboardScreenY: number): number {
  if (!Number.isFinite(viewBottomY) || !Number.isFinite(keyboardScreenY)
    || viewBottomY <= 0) return 0;
  return Math.min(viewBottomY, Math.max(0, viewBottomY - keyboardScreenY));
}
