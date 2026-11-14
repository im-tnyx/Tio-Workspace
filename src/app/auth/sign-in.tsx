import { useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { AuthCredentialsScreen } from '@/features/onboarding';
import { copy } from '@/shared/i18n/en';
import { AuthPreviewPage } from '@/shared/ui/AuthPreviewPage';

export default function SignInRoute() {
  // UI-preview state only. Do not save or transmit entered credentials.
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return <AuthPreviewPage title={copy('signIn')} onBack={() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }}>
    <AuthCredentialsScreen
      mode="sign-in"
      email={email}
      password={password}
      onChangeEmail={setEmail}
      onChangePassword={setPassword}
      onSubmit={() => Alert.alert(copy('signIn'), copy('authComingLater'))}
    />
  </AuthPreviewPage>;
}
