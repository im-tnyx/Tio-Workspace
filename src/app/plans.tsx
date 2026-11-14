import { PlaceholderScreen } from '@/features/placeholders';
import { NestedPage } from '@/shared/ui/NestedPage';
import { PreviewGate } from '@/bootstrap/shell/PreviewGate';
import { copy } from '@/shared/i18n/en';

export default function PlansRoute() {
  return <PreviewGate><NestedPage title={copy('plans')}>
    <PlaceholderScreen label={copy('plans')} />
  </NestedPage></PreviewGate>;
}
