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
} & Pick<TextInputProps,
  'keyboardType' | 'autoCapitalize' | 'autoCorrect' | 'autoComplete'
  | 'secureTextEntry' | 'returnKeyType' | 'textContentType'>;

export function TextField({
  label, value, onChangeText, placeholder, editable = true, ...inputProps
}: Props) {
  const { colors } = useAppearance();
  return <View style={{ gap: spacing.sm }}>
    <Text style={[typography.caption, { color: colors.text }]}>{label}</Text>
    <TextInput
      {...inputProps}
      value={value}
      onChangeText={onChangeText}
      editable={editable}
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      accessibilityLabel={label}
      style={[typography.body, {
        minHeight: 48, paddingHorizontal: spacing.md,
        borderRadius: radii.md, borderWidth: 1, borderColor: colors.border,
        backgroundColor: colors.card, color: colors.text,
      }]}
    />
  </View>;
}
