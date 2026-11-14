import { WelcomePanel } from '@/shared/ui/WelcomePanel';
import { copy } from '@/shared/i18n/en';

export function WelcomeScreen({ onGetStarted }: { onGetStarted: () => void }) {
  return <WelcomePanel title={copy('brandTitle')}
    actions={[{ label: copy('getStarted'), onPress: onGetStarted }]} />;
}
