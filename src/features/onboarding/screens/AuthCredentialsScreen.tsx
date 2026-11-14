import { Text, View } from 'react-native';
import { useAppearance } from '@/shared/theme/AppearanceProvider';
import { copy } from '@/shared/i18n/en';
import { spacing, typography } from '@/shared/theme/tokens';
import { Button } from '@/shared/ui/Button';
import { TextField } from '@/shared/ui/TextField';

export type AuthFormMode = 'sign-up' | 'sign-in';

type Props = {
  mode: AuthFormMode;
  email: string;
  password: string;
  onChangeEmail: (value: string) => void;
  onChangePassword: (value: string) => void;
  onSubmit: () => void;
};

// One presentational credential form for Sign up and Sign in. The routes hold
// transient input state; neither path sends, validates or stores credentials.
export function AuthCredentialsScreen({
  mode, email, password, onChangeEmail, onChangePassword, onSubmit,
}: Props) {
  const { colors } = useAppearance();
  const signingUp = mode === 'sign-up';

  return <View style={{ width: '100%', gap: spacing.xl }}>
    <View style={{ gap: spacing.sm }}>
      <Text accessibilityRole="header" style={[typography.title, { color: colors.text }]}>
        {copy(signingUp ? 'createAccount' : 'signIn')}
      </Text>
      <Text style={[typography.body, { color: colors.muted }]}>
        {copy(signingUp ? 'signUpIntro' : 'signInIntro')}
      </Text>
    </View>
    <View style={{ gap: spacing.lg }}>
      <TextField
        label={copy('email')}
        value={email}
        onChangeText={onChangeEmail}
        placeholder={copy('emailPlaceholder')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        textContentType="none"
        returnKeyType="next"
      />
      <TextField
        label={copy('password')}
        value={password}
        onChangeText={onChangePassword}
        placeholder={copy('passwordPlaceholder')}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        textContentType="none"
        returnKeyType="done"
      />
    </View>
    <View style={{ gap: spacing.md }}>
      <Button label={copy(signingUp ? 'signUp' : 'signIn')} onPress={onSubmit} />
      <Text style={[typography.caption, { color: colors.muted, textAlign: 'center' }]}>
        {copy(signingUp ? 'signUpPreviewNotice' : 'signInPreviewNotice')}
      </Text>
    </View>
  </View>;
}
