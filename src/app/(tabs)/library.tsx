import { router } from 'expo-router';
import { LibraryScreen } from '@/features/library';
import { RootPage } from '@/shared/ui/RootPage';
import { copy } from '@/shared/i18n/en';

export default function LibraryRoute() {
  return <RootPage title={copy('library')}>
    <LibraryScreen onExercisePreview={() => router.push('/exercise')} />
  </RootPage>;
}
