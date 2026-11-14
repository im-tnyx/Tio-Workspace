import { useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { SignUpScreen } from '@/features/onboarding';
import { copy } from '@/shared/i18n/en';
import { AuthPreviewPage } from '@/shared/ui/AuthPreviewPage';

export default function SignUpRoute() {
  // UI-preview values live only in memory on this route, with no account API
  // or persistence. Replace with the approved auth flow in a future phase.
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return <AuthPreviewPage title={copy('signUp')} onBack={() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }}>
    <SignUpScreen
      email={email}
      password={password}
      onChangeEmail={setEmail}
      onChangePassword={setPassword}
      onSignUp={() => Alert.alert(copy('signUp'), copy('authComingLater'))}
    />
  </AuthPreviewPage>;
}
