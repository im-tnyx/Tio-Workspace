import { router } from 'expo-router';
import { YouScreen } from '@/features/profile';
import { RootPage } from '@/shared/ui/RootPage';
import { copy } from '@/shared/i18n/en';

export default function YouRoute() {
  return <RootPage title={copy('you')}>
    <YouScreen onSettings={() => router.push('/settings')}
      onProgress={() => router.push('/progress')} />
  </RootPage>;
}
