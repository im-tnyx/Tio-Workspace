import { Pressable, Text } from 'react-native';
import { useAppearance } from '@/shared/theme/AppearanceProvider';
import { controlSizes, spacing, typography } from '@/shared/theme/tokens';
type Props = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  /** Auth-only low-emphasis disabled treatment; other Buttons keep the default. */
  disabledTone?: 'soft';
};
export function Button({
  label, onPress, variant = 'primary', disabled = false, disabledTone,
}: Props) {
  const { colors, mode } = useAppearance();
  const primary = variant === 'primary';
  const softDisabled = disabled && disabledTone === 'soft';
  const backgroundColor = softDisabled
    ? mode === 'dark' ? '#282828' : '#E8E8E8'
    : primary ? colors.primary : colors.secondary;
  const foregroundColor = softDisabled
    ? mode === 'dark' ? '#858585' : '#868686'
    : primary ? colors.onPrimary : colors.onSecondary;
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
    hitSlop={{ top: controlSizes.buttonHitSlopVertical, bottom: controlSizes.buttonHitSlopVertical }}
    disabled={disabled} accessibilityState={{ disabled }} style={({ pressed }) => ({
      minHeight: controlSizes.buttonMinHeight, justifyContent: 'center', alignItems: 'center',
      paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
      borderRadius: controlSizes.buttonRadius,
      backgroundColor,
      opacity: softDisabled ? 1 : disabled ? 0.45 : pressed ? 0.7 : 1,
    })}>
    <Text style={[typography.body, { color: foregroundColor,
      fontWeight: '700', textAlign: 'center' }]}>{label}</Text>
  </Pressable>;
}
