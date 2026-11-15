import { useEffect, useRef } from 'react';
import { Dimensions, Text, View, useWindowDimensions } from 'react-native';
import type { TextInputInstance } from 'react-native';
import { useAppearance } from '@/shared/theme/AppearanceProvider';
import { copy } from '@/shared/i18n/en';
import { authPreviewLayout, spacing, typography } from '@/shared/theme/tokens';
import { TextField } from '@/shared/ui/TextField';
import { useAuthAvailableHeight } from '@/shared/ui/AuthPreviewPage';
import { authDensity } from '@/shared/ui/authViewport';
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
};

// Shared, single-field-per-stage preview. No real OTP or credentials are sent.
export function AuthCredentialsScreen({
  mode, step, email, code, password, recoveryEmail, resetCode, newPassword,
  onChangeEmail, onChangeCode, onChangePassword,
  onChangeRecoveryEmail, onChangeResetCode, onChangeNewPassword,
}: Props) {
  const { colors } = useAppearance();
  const availableHeight = useAuthAvailableHeight();
  const { fontScale } = useWindowDimensions();
  const density = authDensity(availableHeight, fontScale);
  const tight = density === 'tight';
  // Preserve the existing phone-size style on ordinary screens, but respond
  // to measured available height when native keyboard shrinks the route.
  const compact = density !== 'regular' || Dimensions.get('screen').height < 700;
  const signingUp = mode === 'sign-up';
  const primarySignIn = !signingUp && (step === 'email' || step === 'password');
  const signInEmailInput = useRef<TextInputInstance>(null);
  const previousStep = useRef<AuthPreviewStep>(step);
  useEffect(() => {
    const prior = previousStep.current;
    previousStep.current = step;
    // autoFocus does not re-run for a retained input when returning from Password.
    if (!signingUp && prior === 'password' && step === 'email') {
      signInEmailInput.current?.focus();
    }
  }, [signingUp, step]);

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
  return <View style={{ flex: 1, minHeight: 0, width: '100%',
    gap: tight ? spacing.xs : primarySignIn ? spacing.lg : compact ? spacing.md : spacing.xl }}>
    {/* In a very short keyboard-open viewport the active field takes priority.
        Inputs still have accessible labels; Back restores the previous step.
        Never truncate the safety warning or the Continue CTA. */}
    {!tight ? <View style={{ gap: spacing.sm }}>
      <Text accessibilityRole="header"
        // The two sign-in headings share a single-line slot. Shrink long
        // labels on narrow screens instead of reserving a blank second line.
        numberOfLines={primarySignIn ? 1 : undefined}
        adjustsFontSizeToFit={primarySignIn}
        style={[typography.title, {
          color: colors.text, fontSize: compact ? 32 : 38,
          lineHeight: compact ? 39 : 46,
          minHeight: primarySignIn
            ? (compact ? authPreviewLayout.signInTitleMinHeightCompact
              : authPreviewLayout.signInTitleMinHeight)
            : undefined,
        }]}>{title}</Text>
      {description && density === 'regular' ? <Text style={[typography.body, { color: colors.muted, opacity: 0.76 }]}>
        {description}
      </Text> : null}
    </View> : null}
    <View style={{ gap: tight ? spacing.xs : spacing.sm }}>
      {primarySignIn ? <>
        {/* Keep this SAME controlled email TextField mounted across both
            stages. Only the heading changes and Password appears below. */}
        {/* Keep Email mounted for Back focus restoration, but take its visual
            row out of the tight Password stage's limited space. */}
        <View style={tight && step === 'password' ? { display: 'none' } : undefined}>
        <TextField
          key="sign-in-email"
          inputRef={signInEmailInput}
          autoFocus={step === 'email'}
          label={copy('email')} variant="bare"
          value={email} onChangeText={onChangeEmail}
          placeholder={copy('emailPlaceholder')}
          keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
          autoComplete="off" textContentType="none" returnKeyType="done"
        />
        </View>
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
  </View>;
}
