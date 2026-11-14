import { router } from 'expo-router';
import { AuthUnavailableScreen } from '@/features/onboarding';
import { copy } from '@/shared/i18n/en';
import { AuthPreviewPage } from '@/shared/ui/AuthPreviewPage';

export default function SignInRoute() {
  return <AuthPreviewPage title={copy('signIn')} onBack={() => router.back()}>
    <AuthUnavailableScreen title={copy('signIn')} />
  </AuthPreviewPage>;
}
