import { WelcomePanel } from '@/shared/ui/WelcomePanel';
import { copy } from '@/shared/i18n/en';

type Props = { onSignIn: () => void; onSignUp: () => void };
export function AuthChoiceScreen({ onSignIn, onSignUp }: Props) {
  return <WelcomePanel title={copy('brandTitle')}
    actions={[
      { label: copy('signIn'), onPress: onSignIn },
      { label: copy('signUp'), onPress: onSignUp, variant: 'secondary' },
    ]} />;
}
