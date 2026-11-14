import { router } from 'expo-router';
import { AuthChoiceScreen } from '@/features/onboarding';

export default function AuthChoiceRoute() {
  return <AuthChoiceScreen
    onSignIn={() => router.push('/auth/sign-in')}
    onSignUp={() => router.push('/auth/sign-up')}
  />;
}
