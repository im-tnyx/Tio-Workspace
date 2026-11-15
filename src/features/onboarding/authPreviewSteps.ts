// These are visual-only stages: advancing is NOT email ownership verification,
// password recovery, authentication, or permission to enter the app.
export type AuthPreviewStep =
  | 'email' | 'otp' | 'password'
  | 'reset-email' | 'reset-otp' | 'new-password';
export type AuthPreviewMode = 'sign-up' | 'sign-in';

export function nextAuthPreviewStep(
  step: AuthPreviewStep, mode: AuthPreviewMode = 'sign-up',
): AuthPreviewStep {
  if (step === 'email') return mode === 'sign-in' ? 'password' : 'otp';
  if (step === 'otp') return 'password';
  if (step === 'reset-email') return 'reset-otp';
  if (step === 'reset-otp') return 'new-password';
  return step;
}

export function previousAuthPreviewStep(
  step: AuthPreviewStep, mode: AuthPreviewMode = 'sign-up',
): AuthPreviewStep {
  if (step === 'password') return mode === 'sign-in' ? 'email' : 'otp';
  if (step === 'otp') return 'email';
  if (step === 'reset-email') return 'password';
  if (step === 'reset-otp') return 'reset-email';
  if (step === 'new-password') return 'reset-otp';
  return 'email';
}

export function canContinueAuthPreview(step: AuthPreviewStep, value: string): boolean {
  if (step === 'email' || step === 'reset-email')
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  if (step === 'otp' || step === 'reset-otp') return /^\d{6}$/.test(value);
  return value.length > 0;
}
