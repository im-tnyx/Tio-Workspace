import { PlaceholderScreen } from '@/features/placeholders';
import { NestedPage } from '@/shared/ui/NestedPage';
import { copy } from '@/shared/i18n/en';

export default function ProgressRoute() {
  return <NestedPage title={copy('progress')}>
    <PlaceholderScreen label={copy('progress')} />
  </NestedPage>;
}
