import { PlaceholderScreen } from '@/features/placeholders';
import { NestedPage } from '@/shared/ui/NestedPage';
import { copy } from '@/shared/i18n/en';

export default function ExerciseRoute() {
  return <NestedPage title={copy('exerciseDetail')}>
    <PlaceholderScreen label={copy('exerciseDetail')} />
  </NestedPage>;
}
