import { Text, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';
import { useAppearance } from '@/shared/theme/AppearanceProvider';
import { radii, spacing, typography } from '@/shared/theme/tokens';

// One reusable field for email, password and future form screens. Existing
// callers can keep using label/value/onChangeText without additional props.
type Props = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  editable?: boolean;
  variant?: 'outlined' | 'bare';
} & Pick<TextInputProps,
  'keyboardType' | 'autoCapitalize' | 'autoCorrect' | 'autoComplete'
  | 'secureTextEntry' | 'returnKeyType' | 'textContentType' | 'maxLength'>;

export function TextField({
  label, value, onChangeText, placeholder, editable = true,
  variant = 'outlined', ...inputProps
}: Props) {
  const { colors, mode } = useAppearance();
  return <View style={{ gap: spacing.sm }}>
    {variant === 'outlined' ? <Text style={[typography.caption, { color: colors.text }]}>{label}</Text> : null}
    <TextInput
      {...inputProps}
      value={value}
      onChangeText={onChangeText}
      editable={editable}
      placeholder={placeholder}
      placeholderTextColor={variant === 'bare' ? (mode === 'dark' ? '#858585' : '#767676') : colors.muted}
      accessibilityLabel={label}
      style={[typography.body, variant === 'bare' ? {
        // Reference-inspired borderless input: no filled box, line or card.
        // Keep the field's label available to assistive technologies.
        minHeight: 60, paddingHorizontal: 0, paddingVertical: spacing.sm,
        fontSize: 27, lineHeight: 34, color: colors.text,
        backgroundColor: 'transparent', borderWidth: 0,
      } : {
        minHeight: 48, paddingHorizontal: spacing.md,
        borderRadius: radii.md, borderWidth: 1, borderColor: colors.border,
        backgroundColor: colors.card, color: colors.text,
      }]}
    />
  </View>;
}
