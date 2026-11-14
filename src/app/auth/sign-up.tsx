import { router } from 'expo-router';
import { AuthPreviewFlow } from '@/features/onboarding';

export default function SignUpRoute() {
  return <AuthPreviewFlow mode="sign-up" onExit={() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }} />;
}
