import { PlaceholderScreen } from '@/features/placeholders';
import { NestedPage } from '@/shared/ui/NestedPage';
import { copy } from '@/shared/i18n/en';

export default function HistoryRoute() {
  return <NestedPage title={copy('history')}>
    <PlaceholderScreen label={copy('history')} />
  </NestedPage>;
}
