import { Dimensions, Text, View } from 'react-native';
import { useAppearance } from '@/shared/theme/AppearanceProvider';
import { copy } from '@/shared/i18n/en';
import { authPreviewLayout, spacing, typography } from '@/shared/theme/tokens';
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
  recoveryEmail: string;
  resetCode: string;
  newPassword: string;
  onChangeEmail: (value: string) => void;
  onChangeCode: (value: string) => void;
  onChangePassword: (value: string) => void;
  onChangeRecoveryEmail: (value: string) => void;
  onChangeResetCode: (value: string) => void;
  onChangeNewPassword: (value: string) => void;
  onSubmit: () => void;
};

// Shared, single-field-per-stage preview. No real OTP or credentials are sent.
export function AuthCredentialsScreen({
  mode, step, email, code, password, recoveryEmail, resetCode, newPassword,
  onChangeEmail, onChangeCode, onChangePassword,
  onChangeRecoveryEmail, onChangeResetCode, onChangeNewPassword, onSubmit,
}: Props) {
  const { colors } = useAppearance();
  // Physical screen height is stable while Android resizes for the keyboard.
  const compact = Dimensions.get('screen').height < 700;
  const signingUp = mode === 'sign-up';
  const primarySignIn = !signingUp && (step === 'email' || step === 'password');

  const title = step === 'email' ? copy(signingUp ? 'enterEmail' : 'signInEnterEmail')
    : step === 'reset-email' ? copy('confirmEmail')
    : step === 'otp' || step === 'reset-otp' ? copy('enterCode')
    : step === 'new-password' ? copy('createNewPassword')
    : copy(signingUp ? 'createPassword' : 'enterPassword');
  const description = step === 'email'
    ? (signingUp ? copy('emailStepIntro') : '')
    : step === 'reset-email' ? copy('confirmEmailIntro')
    : step === 'otp' ? copy('otpStepIntro')
    : step === 'reset-otp' ? copy('resetOtpIntro')
    : step === 'new-password' ? copy('newPasswordIntro')
    : signingUp ? copy('signUpPasswordIntro') : '';
  const notice = step === 'email' ? copy(signingUp ? 'emailPreviewNotice' : 'signInEmailPreviewNotice')
    : step === 'reset-email' ? copy('resetEmailPreviewNotice')
    : step === 'otp' ? copy('otpPreviewNotice')
    : step === 'reset-otp' ? copy('resetOtpPreviewNotice')
    : step === 'new-password' ? copy('newPasswordPreviewNotice')
    : copy(signingUp ? 'signUpPreviewNotice' : 'signInPreviewNotice');
  const value = step === 'email' ? email
    : step === 'reset-email' ? recoveryEmail
    : step === 'otp' ? code
    : step === 'reset-otp' ? resetCode
    : step === 'new-password' ? newPassword : password;

  return <View style={{ flex: 1, minHeight: 0, width: '100%', gap: compact ? spacing.md : spacing.xl }}>
    <View style={{ gap: spacing.sm }}>
      <Text accessibilityRole="header" style={[typography.title, {
        color: colors.text, fontSize: compact ? 32 : 38,
        lineHeight: compact ? 39 : 46,
        // Sign-in changes its heading in place; the email field stays put.
        minHeight: primarySignIn
          ? (compact ? authPreviewLayout.signInTitleMinHeightCompact
            : authPreviewLayout.signInTitleMinHeight)
          : undefined,
      }]}>{title}</Text>
      {description ? <Text style={[typography.body, { color: colors.muted, opacity: 0.76 }]}>
        {description}
      </Text> : null}
    </View>
    <View style={{ gap: spacing.sm }}>
      {primarySignIn ? <>
        {/* Keep this SAME controlled email TextField mounted across both
            stages. Only the heading changes and Password appears below. */}
        <TextField
          key="sign-in-email"
          autoFocus={step === 'email'}
          label={copy('email')} variant="bare"
          value={email} onChangeText={onChangeEmail}
          placeholder={copy('emailPlaceholder')}
          keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
          autoComplete="off" textContentType="none" returnKeyType="done"
        />
        {step === 'password' ? <TextField
          key="sign-in-password" autoFocus
          label={copy('password')} variant="bare"
          value={password} onChangeText={onChangePassword}
          placeholder={copy('passwordPlaceholder')} secureTextEntry
          autoCapitalize="none" autoCorrect={false}
          autoComplete="off" textContentType="none" returnKeyType="done"
        /> : null}
      </> : step === 'email' || step === 'reset-email' ? <TextField
        key={step} autoFocus
        label={copy('email')} variant="bare"
        value={step === 'email' ? email : recoveryEmail}
        onChangeText={step === 'email' ? onChangeEmail : onChangeRecoveryEmail}
        placeholder={step === 'email' ? copy('emailPlaceholder') : copy('email')}
        keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
        autoComplete="off" textContentType="none" returnKeyType="done"
      /> : step === 'otp' || step === 'reset-otp' ? <TextField
        key={step} autoFocus
        label={copy('verificationCode')} variant="bare"
        value={step === 'otp' ? code : resetCode}
        onChangeText={next => {
          const sixDigits = next.replace(/\D/g, '').slice(0, 6);
          if (step === 'otp') onChangeCode(sixDigits);
          else onChangeResetCode(sixDigits);
        }}
        placeholder={copy('otpPlaceholder')}
        keyboardType="number-pad" maxLength={6}
        autoComplete="off" textContentType="none" returnKeyType="done"
      /> : <>
        <TextField
          key={step} autoFocus
          label={copy('password')} variant="bare"
          value={step === 'new-password' ? newPassword : password}
          onChangeText={step === 'new-password' ? onChangeNewPassword : onChangePassword}
          placeholder={step === 'new-password' ? copy('newPasswordPlaceholder') : copy('passwordPlaceholder')}
          secureTextEntry autoCapitalize="none" autoCorrect={false}
          autoComplete="off" textContentType="none" returnKeyType="done"
        />
      </>}
    </View>
    <View style={{ marginTop: 'auto', gap: spacing.md, paddingTop: spacing.sm }}>
      {/* Keep the preview notice BELOW the button. It also restores
          comfortable separation between the CTA and keyboard. */}
      <Button size="onboarding"
        label={step === 'new-password' ? copy('resetPassword')
          : step === 'password' ? copy(signingUp ? 'signUp' : 'signIn') : copy('continue')}
        onPress={onSubmit}
        disabledTone="soft"
        disabled={!canContinueAuthPreview(step, value)}
      />
      <Text style={[typography.caption, { color: colors.muted, textAlign: 'center' }]}>
        {notice}
      </Text>
    </View>
  </View>;
}
