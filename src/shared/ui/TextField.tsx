import { Pressable, Text, TextInput, View } from 'react-native';
import type { TextInputInstance, TextInputProps } from 'react-native';
import { useState } from 'react';
import type { Ref } from 'react';
import { useAppearance } from '@/shared/theme/AppearanceProvider';
import { authPreviewMuted, passwordEye, radii, spacing, typography } from '@/shared/theme/tokens';
import { copy } from '@/shared/i18n/en';

// Draw a neutral eye/eye-slash with RN primitives: no extra native package.
// Icon has a generous, accessible touch target independent of visual size.
function PasswordEyeIcon({ revealed, color }: { revealed: boolean; color: string }) {
  return <View pointerEvents="none" style={{
    width: passwordEye.touchTarget, height: passwordEye.touchTarget,
    justifyContent: 'center', alignItems: 'center',
  }}>
    <View style={{
      width: passwordEye.outlineWidth, height: passwordEye.outlineHeight,
      borderWidth: passwordEye.outlineStroke, borderColor: color,
      borderRadius: radii.pill, justifyContent: 'center', alignItems: 'center',
    }}>
      <View style={{
        width: passwordEye.pupilSize, height: passwordEye.pupilSize,
        borderRadius: radii.pill, backgroundColor: color,
      }} />
    </View>
    {!revealed ? <View style={{
      position: 'absolute', width: passwordEye.slashLength,
      height: passwordEye.slashThickness, backgroundColor: color,
      transform: [{ rotate: '-45deg' }],
    }} /> : null}
  </View>;
}

// One reusable field for email, password and future form screens. Existing
// callers can keep using label/value/onChangeText without additional props.
type Props = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  editable?: boolean;
  variant?: 'outlined' | 'bare';
  inputRef?: Ref<TextInputInstance>;
} & Pick<TextInputProps,
  'keyboardType' | 'autoCapitalize' | 'autoCorrect' | 'autoComplete'
  | 'secureTextEntry' | 'returnKeyType' | 'textContentType' | 'maxLength' | 'autoFocus'>;

export function TextField({
  label, value, onChangeText, placeholder, editable = true,
  variant = 'outlined', inputRef, secureTextEntry = false, ...inputProps
}: Props) {
  const { colors, mode } = useAppearance();
  const [passwordVisible, setPasswordVisible] = useState(false);
  return <View style={{ gap: spacing.sm }}>
    {variant === 'outlined' ? <Text style={[typography.caption, { color: colors.text }]}>{label}</Text> : null}
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <TextInput
      ref={inputRef}
      {...inputProps}
      secureTextEntry={secureTextEntry && !passwordVisible}
      value={value}
      onChangeText={onChangeText}
      editable={editable}
      placeholder={placeholder}
      placeholderTextColor={variant === 'bare' ? authPreviewMuted[mode].placeholder : colors.muted}
      accessibilityLabel={label}
      underlineColorAndroid="transparent"
      style={[typography.body, { flex: 1 }, variant === 'bare' ? {
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
      {secureTextEntry ? <Pressable
        accessibilityRole="button"
        accessibilityLabel={passwordVisible ? copy('hidePassword') : copy('showPassword')}
        accessibilityState={{ disabled: !editable }}
        onPress={() => setPasswordVisible(current => !current)}
        disabled={!editable}
        style={({ pressed }) => ({
          minWidth: passwordEye.touchTarget, minHeight: passwordEye.touchTarget,
          alignItems: 'center', justifyContent: 'center',
          opacity: pressed ? 0.7 : 1,
        })}>
        <PasswordEyeIcon revealed={passwordVisible} color={colors.muted} />
      </Pressable> : null}
    </View>
  </View>;
}
