import { router } from 'expo-router';
import { WorkoutHubScreen } from '@/features/workouts';
import { RootPage } from '@/shared/ui/RootPage';
import { copy } from '@/shared/i18n/en';

export default function WorkoutRoute() {
  return <RootPage title={copy('workout')}>
    <WorkoutHubScreen
      onWorkoutPreview={() => router.push('/workout/session')}
      onPlansPreview={() => router.push('/plans')}
      onHistoryPreview={() => router.push('/history')}
    />
  </RootPage>;
}
