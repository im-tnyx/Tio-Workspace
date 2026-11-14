import { Text, TextInput, View } from 'react-native';
import { useAppearance } from '@/shared/theme/AppearanceProvider';
import { radii, spacing, typography } from '@/shared/theme/tokens';
type Props = { label: string; value: string; onChangeText: (text: string) => void;
  placeholder?: string; editable?: boolean };
export function TextField({ label, value, onChangeText, placeholder, editable = true }: Props) {
  const { colors } = useAppearance();
  return <View style={{ gap: spacing.sm }}>
    <Text style={[typography.caption, { color: colors.text }]}>{label}</Text>
    <TextInput value={value} onChangeText={onChangeText} editable={editable}
      placeholder={placeholder} placeholderTextColor={colors.muted} accessibilityLabel={label}
      style={[typography.body, { minHeight: 48, paddingHorizontal: spacing.md,
        borderRadius: radii.md, borderWidth: 1, borderColor: colors.border,
        backgroundColor: colors.card, color: colors.text }]} />
  </View>;
}
