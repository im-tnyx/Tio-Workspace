import { router } from 'expo-router';
import { HomeScreen } from '@/features/home';
import { RootPage } from '@/shared/ui/RootPage';
import { copy } from '@/shared/i18n/en';

export default function HomeRoute() {
  return <RootPage title={copy('home')}>
    <HomeScreen onWorkoutPreview={() => router.push('/workout/session')} />
  </RootPage>;
}
