import { router } from 'expo-router';
import { WelcomeScreen } from '@/features/onboarding';

export default function WelcomeRoute() {
  return <WelcomeScreen
    onGetStarted={() => router.push('/auth')}
    onLogIn={() => router.push('/auth/sign-in')}
  />;
}
