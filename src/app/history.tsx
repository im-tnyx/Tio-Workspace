import { PlaceholderScreen } from '@/features/placeholders';
import { NestedPage } from '@/shared/ui/NestedPage';
import { PreviewGate } from '@/bootstrap/shell/PreviewGate';
import { copy } from '@/shared/i18n/en';

export default function HistoryRoute() {
  return <PreviewGate><NestedPage title={copy('history')}>
    <PlaceholderScreen label={copy('history')} />
  </NestedPage></PreviewGate>;
}
