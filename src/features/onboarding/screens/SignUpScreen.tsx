import { Text, View } from 'react-native';
import { useAppearance } from '@/shared/theme/AppearanceProvider';
import { copy } from '@/shared/i18n/en';
import { spacing, typography } from '@/shared/theme/tokens';
import { Button } from '@/shared/ui/Button';
import { TextField } from '@/shared/ui/TextField';

type Props = {
  email: string;
  password: string;
  onChangeEmail: (value: string) => void;
  onChangePassword: (value: string) => void;
  onSignUp: () => void;
};

// Presentational UI only. The route owns ephemeral form state; nothing is
// persisted, transmitted or used to create a real account in Phase 1.1.
export function SignUpScreen({
  email, password, onChangeEmail, onChangePassword, onSignUp,
}: Props) {
  const { colors } = useAppearance();
  return <View style={{ width: '100%', gap: spacing.xl }}>
    <View style={{ gap: spacing.sm }}>
      <Text accessibilityRole="header" style={[typography.title, { color: colors.text }]}>
        {copy('createAccount')}
      </Text>
      <Text style={[typography.body, { color: colors.muted }]}>
        {copy('signUpIntro')}
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
      <Button label={copy('signUp')} onPress={onSignUp} />
      <Text style={[typography.caption, { color: colors.muted, textAlign: 'center' }]}>
        {copy('signUpPreviewNotice')}
      </Text>
    </View>
  </View>;
}
