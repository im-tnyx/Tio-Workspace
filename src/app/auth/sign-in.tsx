import { router } from 'expo-router';
import { AuthPreviewFlow } from '@/features/onboarding';

export default function SignInRoute() {
  return <AuthPreviewFlow mode="sign-in" onExit={() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }} />;
}
