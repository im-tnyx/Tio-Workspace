import { Text, View, useWindowDimensions } from 'react-native';
import { useAppearance } from '@/shared/theme/AppearanceProvider';
import { copy } from '@/shared/i18n/en';
import { spacing, typography } from '@/shared/theme/tokens';
import { Button } from '@/shared/ui/Button';
import { TextField } from '@/shared/ui/TextField';
import { canContinueAuthPreview } from '../authPreviewSteps';
import type { AuthPreviewStep } from '../authPreviewSteps';

export type AuthFormMode = 'sign-up' | 'sign-in';

type Props = {
  mode: AuthFormMode;
  step: AuthPreviewStep;
  email: string;
  code: string;
  password: string;
  onChangeEmail: (value: string) => void;
  onChangeCode: (value: string) => void;
  onChangePassword: (value: string) => void;
  onSubmit: () => void;
};

// Each stage is a UI preview; no email/OTP is sent or verified.
export function AuthCredentialsScreen({
  mode, step, email, code, password,
  onChangeEmail, onChangeCode, onChangePassword, onSubmit,
}: Props) {
  const { colors } = useAppearance();
  const { height } = useWindowDimensions();
  const compact = height < 700;
  const signingUp = mode === 'sign-up';
  const title = step === 'email' ? copy('enterEmail')
    : step === 'otp' ? copy('enterCode')
    : copy(signingUp ? 'createPassword' : 'enterPassword');
  const description = step === 'email' ? copy('emailStepIntro')
    : step === 'otp' ? copy('otpStepIntro')
    : copy(signingUp ? 'signUpPasswordIntro' : 'signInPasswordIntro');
  const notice = step === 'email' ? copy('emailPreviewNotice')
    : step === 'otp' ? copy('otpPreviewNotice')
    : copy(signingUp ? 'signUpPreviewNotice' : 'signInPreviewNotice');
  const value = step === 'email' ? email : step === 'otp' ? code : password;

  return <View style={{ flex: 1, minHeight: 0, width: '100%', gap: compact ? spacing.md : spacing.xl }}>
    <View style={{ gap: spacing.sm }}>
      <Text accessibilityRole="header" style={[typography.title, {
        color: colors.text, fontSize: compact ? 32 : 38,
        lineHeight: compact ? 39 : 46,
      }]}>{title}</Text>
      <Text style={[typography.body, { color: colors.muted, opacity: 0.76 }]}>{description}</Text>
    </View>
    <View>
      {step === 'email' ? <TextField
        key="email" autoFocus
        label={copy('email')} variant="bare"
        value={email} onChangeText={onChangeEmail}
        placeholder={copy('emailPlaceholder')}
        keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
        autoComplete="off" textContentType="none" returnKeyType="done"
      /> : step === 'otp' ? <TextField
        key="otp" autoFocus
        label={copy('verificationCode')} variant="bare"
        value={code}
        onChangeText={next => onChangeCode(next.replace(/\D/g, '').slice(0, 6))}
        placeholder={copy('otpPlaceholder')}
        keyboardType="number-pad" maxLength={6}
        autoComplete="off" textContentType="none" returnKeyType="done"
      /> : <TextField
        key="password" autoFocus
        label={copy('password')} variant="bare"
        value={password} onChangeText={onChangePassword}
        placeholder={copy('passwordPlaceholder')} secureTextEntry
        autoCapitalize="none" autoCorrect={false}
        autoComplete="off" textContentType="none" returnKeyType="done"
      />}
    </View>
    <View style={{ marginTop: 'auto', gap: spacing.md, paddingTop: spacing.sm }}>
      <Button
        label={step === 'password' ? copy(signingUp ? 'signUp' : 'signIn') : copy('continue')}
        onPress={onSubmit} disabled={!canContinueAuthPreview(step, value)}
      />
      <Text style={[typography.caption, { color: colors.muted, textAlign: 'center' }]}>
        {notice}
      </Text>
    </View>
  </View>;
}
