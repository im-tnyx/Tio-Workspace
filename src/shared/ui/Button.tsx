import { Pressable, Text } from 'react-native';
import { useAppearance } from '@/shared/theme/AppearanceProvider';
import { authPreviewMuted, controlSizes, spacing, typography } from '@/shared/theme/tokens';
type Props = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  /** Auth-only low-emphasis disabled treatment; other Buttons keep the default. */
  disabledTone?: 'soft';
  /** Preserve a staged auth CTA's visible styling while still disabling interaction. */
  disabledAppearance?: 'muted' | 'enabled';
  size?: 'app' | 'onboarding';
};
export function Button({
  label, onPress, variant = 'primary', disabled = false, disabledTone,
  disabledAppearance = 'muted', size = 'app',
}: Props) {
  const { colors, mode } = useAppearance();
  const primary = variant === 'primary';
  const visuallyDisabled = disabled && disabledAppearance !== 'enabled';
  const softDisabled = visuallyDisabled && disabledTone === 'soft';
  const backgroundColor = softDisabled
    ? authPreviewMuted[mode].disabledBackground
    : primary ? colors.primary : colors.secondary;
  const foregroundColor = softDisabled
    ? authPreviewMuted[mode].disabledText
    : primary ? colors.onPrimary : colors.onSecondary;
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
    hitSlop={{ top: controlSizes.buttonHitSlopVertical, bottom: controlSizes.buttonHitSlopVertical }}
    disabled={disabled} accessibilityState={{ disabled }} style={({ pressed }) => ({
      minHeight: size === 'onboarding' ? controlSizes.onboardingButtonMinHeight : controlSizes.buttonMinHeight,
      justifyContent: 'center', alignItems: 'center',
      paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
      borderRadius: controlSizes.buttonRadius,
      backgroundColor,
      opacity: softDisabled ? 1 : visuallyDisabled ? 0.45 : pressed ? 0.7 : 1,
    })}>
    <Text style={[typography.body, { color: foregroundColor,
      fontWeight: '700', textAlign: 'center' }]}>{label}</Text>
  </Pressable>;
}
