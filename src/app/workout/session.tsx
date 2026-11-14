import { PlaceholderScreen } from '@/features/placeholders';
import { NestedPage } from '@/shared/ui/NestedPage';
import { copy } from '@/shared/i18n/en';

export default function SessionRoute() {
  return <NestedPage title={copy('activeWorkout')}>
    <PlaceholderScreen label={copy('activeWorkout')} />
  </NestedPage>;
}
