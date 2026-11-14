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

// Shared controller for both preview routes; all data is ephemeral.
// IMPORTANT: advancing a stage is NOT OTP verification or authentication.
export function AuthPreviewFlow({ mode, onExit }: {
  mode: AuthFormMode; onExit: () => void;
}) {
  const [step, setStep] = useState<AuthPreviewStep>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');

  const onBack = () => {
    if (step === 'email') {
      Keyboard.dismiss();
      setCode('');
      setPassword('');
      onExit();
      return;
    }
    if (step === 'password') setPassword('');
    if (step === 'otp') setCode('');
    setStep(previousAuthPreviewStep(step));
  };

  const onContinue = () => {
    const value = step === 'email' ? email : step === 'otp' ? code : password;
    if (!canContinueAuthPreview(step, value)) return;
    if (step === 'password') {
      Keyboard.dismiss();
      // Never transmit credentials, mark a fake OTP verified, or enter the app.
      setPassword('');
      Alert.alert(copy(mode === 'sign-up' ? 'signUp' : 'signIn'), copy('authComingLater'));
      return;
    }
    // Don't dismiss the keyboard between steps. The keyed next input
    // autofocuses so its email/numeric/password keyboard is ready immediately.
    setStep(nextAuthPreviewStep(step));
  };

  return <AuthPreviewPage onBack={onBack}>
    <AuthCredentialsScreen
      mode={mode} step={step}
      email={email} code={code} password={password}
      onChangeEmail={setEmail} onChangeCode={setCode} onChangePassword={setPassword}
      onSubmit={onContinue}
    />
  </AuthPreviewPage>;
}
