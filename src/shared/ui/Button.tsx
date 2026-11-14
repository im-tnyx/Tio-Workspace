import { Pressable, Text } from 'react-native';
import { useAppearance } from '@/shared/theme/AppearanceProvider';
import { radii, spacing, typography } from '@/shared/theme/tokens';
type Props = { label: string; onPress: () => void; variant?: 'primary' | 'secondary'; disabled?: boolean };
export function Button({ label, onPress, variant = 'primary', disabled = false }: Props) {
  const { colors } = useAppearance();
  const primary = variant === 'primary';
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
    disabled={disabled} style={({ pressed }) => ({
      minHeight: 48, justifyContent: 'center', alignItems: 'center',
      paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radii.md,
      backgroundColor: primary ? colors.primary : colors.secondary,
      opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
    })}>
    <Text style={[typography.body, { color: primary ? colors.onPrimary : colors.onSecondary,
      fontWeight: '700', textAlign: 'center' }]}>{label}</Text>
  </Pressable>;
}
