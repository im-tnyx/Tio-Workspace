import { WelcomePanel } from '@/shared/ui/WelcomePanel';
import { copy } from '@/shared/i18n/en';

type Props = { onGetStarted: () => void; onLogIn: () => void };

export function WelcomeScreen({ onGetStarted, onLogIn }: Props) {
  return <WelcomePanel title={copy('brandTitle')} actionPlacement="bottom" animatedTitle
    actions={[{ label: copy('getStarted'), onPress: onGetStarted }]}
    bottomLink={{
      prompt: copy('alreadyHaveAccount'),
      label: copy('logIn'),
      onPress: onLogIn,
    }} />;
}
