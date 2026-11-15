// Preview shell only. There is no account/session service in Phase 1.1.
// A non-development build MUST NOT expose the workout shell via deep links.
export function canOpenShellPreview(isDevelopmentBuild: boolean): boolean {
  return isDevelopmentBuild === true;
}
