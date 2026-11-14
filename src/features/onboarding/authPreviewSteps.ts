// UI-only sequence. Neither advancing to OTP nor to Password means that an
// email was sent, OTP was verified, or an account/session was created.
export type AuthPreviewStep = 'email' | 'otp' | 'password';

export function nextAuthPreviewStep(step: AuthPreviewStep): AuthPreviewStep {
  return step === 'email' ? 'otp' : 'password';
}

export function previousAuthPreviewStep(step: AuthPreviewStep): AuthPreviewStep {
  return step === 'password' ? 'otp' : 'email';
}

export function canContinueAuthPreview(step: AuthPreviewStep, value: string): boolean {
  if (step === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  if (step === 'otp') return /^\d{6}$/.test(value);
  return value.length > 0;
}
