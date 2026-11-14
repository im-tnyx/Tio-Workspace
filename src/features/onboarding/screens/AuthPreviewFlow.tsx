import { useState } from 'react';
import { Alert, Keyboard } from 'react-native';
import { AuthPreviewPage } from '@/shared/ui/AuthPreviewPage';
import { copy } from '@/shared/i18n/en';
import {
  canContinueAuthPreview, nextAuthPreviewStep, previousAuthPreviewStep,
} from '../authPreviewSteps';
import type { AuthPreviewStep } from '../authPreviewSteps';
import { AuthCredentialsScreen } from './AuthCredentialsScreen';
import type { AuthFormMode } from './AuthCredentialsScreen';

// Both routes share UI code, with different approved preview flows:
// Sign up: Email -> OTP demo -> Password.
// Sign in: Email -> Password. Forgot password: Confirm email -> OTP demo -> New password.
// All text remains in local memory; NO reset request, account action or OTP verification.
export function AuthPreviewFlow({ mode, onExit }: {
  mode: AuthFormMode; onExit: () => void;
}) {
  const [step, setStep] = useState<AuthPreviewStep>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const onBack = () => {
    if (step === 'email') {
      Keyboard.dismiss();
      setCode('');
      setPassword('');
      setResetCode('');
      setNewPassword('');
      onExit();
      return;
    }
    if (step === 'password') setPassword('');
    if (step === 'otp') setCode('');
    if (step === 'reset-otp') setResetCode('');
    if (step === 'new-password') setNewPassword('');
    // Keep the keyboard open between stages for automatic focus.
    setStep(previousAuthPreviewStep(step, mode));
  };

  const onForgotPassword = () => {
    // Prefill the confirm-email stage, but let the user correct the address.
    setRecoveryEmail(email);
    setResetCode('');
    setNewPassword('');
    setPassword('');
    setStep('reset-email');
  };

  const onContinue = () => {
    const value = step === 'email' ? email
      : step === 'otp' ? code
      : step === 'reset-email' ? recoveryEmail
      : step === 'reset-otp' ? resetCode
      : step === 'new-password' ? newPassword : password;
    if (!canContinueAuthPreview(step, value)) return;

    if (step === 'password') {
      Keyboard.dismiss();
      setPassword('');
      Alert.alert(copy(mode === 'sign-up' ? 'signUp' : 'signIn'), copy('authComingLater'));
      return;
    }
    if (step === 'new-password') {
      // No password is changed; the new value is never transmitted or stored.
      Keyboard.dismiss();
      setNewPassword('');
      Alert.alert(copy('resetPassword'), copy('resetPasswordComingLater'));
      return;
    }
    setStep(nextAuthPreviewStep(step, mode));
  };

  // Parent controls update their labels/state without remounting. Only
  // AuthCredentialsScreen renders stage-specific heading and inputs.
  const currentValue = step === 'email' ? email
    : step === 'reset-email' ? recoveryEmail
    : step === 'otp' ? code
    : step === 'reset-otp' ? resetCode
    : step === 'new-password' ? newPassword : password;
  const footerLabel = step === 'new-password' ? copy('resetPassword')
    : step === 'password' ? copy(mode === 'sign-up' ? 'signUp' : 'signIn')
    : copy('continue');
  const footerNotice = step === 'email'
    ? copy(mode === 'sign-up' ? 'emailPreviewNotice' : 'signInPreviewNotice')
    : step === 'reset-email' ? copy('resetEmailPreviewNotice')
    : step === 'otp' ? copy('otpPreviewNotice')
    : step === 'reset-otp' ? copy('resetOtpPreviewNotice')
    : step === 'new-password' ? copy('newPasswordPreviewNotice')
    : copy(mode === 'sign-up' ? 'signUpPreviewNotice' : 'signInPreviewNotice');

  return <AuthPreviewPage
    onBack={onBack}
    headerActionLabel={mode === 'sign-in' && step === 'password'
      ? copy('forgotPassword') : undefined}
    onHeaderAction={mode === 'sign-in' && step === 'password'
      ? onForgotPassword : undefined}
    footerLabel={footerLabel}
    footerNotice={footerNotice}
    footerDisabled={!canContinueAuthPreview(step, currentValue)}
    footerKeepAppearance={mode === 'sign-in' && step === 'password'}
    onFooterPress={onContinue}>
    <AuthCredentialsScreen
      mode={mode} step={step}
      email={email} code={code} password={password}
      recoveryEmail={recoveryEmail} resetCode={resetCode} newPassword={newPassword}
      onChangeEmail={setEmail} onChangeCode={setCode} onChangePassword={setPassword}
      onChangeRecoveryEmail={setRecoveryEmail}
      onChangeResetCode={setResetCode}
      onChangeNewPassword={setNewPassword}
    />
  </AuthPreviewPage>;
}
