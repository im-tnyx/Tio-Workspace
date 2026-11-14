import { PlaceholderScreen } from '@/features/placeholders';
import { NestedPage } from '@/shared/ui/NestedPage';
import { copy } from '@/shared/i18n/en';

export default function PlansRoute() {
  return <NestedPage title={copy('plans')}>
    <PlaceholderScreen label={copy('plans')} />
  </NestedPage>;
}
