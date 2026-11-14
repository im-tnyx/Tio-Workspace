import { router } from 'expo-router';
import { AuthUnavailableScreen } from '@/features/onboarding';
import { copy } from '@/shared/i18n/en';
import { AuthPreviewPage } from '@/shared/ui/AuthPreviewPage';

export default function SignUpRoute() {
  return <AuthPreviewPage title={copy('signUp')} onBack={() => {
    if (router.canGoBack()) router.back();
    else router.replace('/auth');
  }}>
    <AuthUnavailableScreen title={copy('signUp')} />
  </AuthPreviewPage>;
}
