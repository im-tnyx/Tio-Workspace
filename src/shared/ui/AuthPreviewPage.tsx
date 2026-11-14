import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppearance } from '@/shared/theme/AppearanceProvider';
import { spacing } from '@/shared/theme/tokens';
import { copy } from '@/shared/i18n/en';

// One fixed page per step. NO ScrollView or swipe scrolling; compact spacing
// and KeyboardAvoidingView keep the current single field/action in view.
export function AuthPreviewPage({ onBack, children }: {
  onBack: () => void; children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useAppearance();
  const [keyboardShown, setKeyboardShown] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardShown(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardShown(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  return <KeyboardAvoidingView
    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    style={{ flex: 1, backgroundColor: colors.background }}>
    <View style={{
      flex: 1, paddingTop: insets.top + (keyboardShown ? 0 : spacing.sm),
      paddingBottom: keyboardShown ? 0 : insets.bottom + spacing.sm,
      gap: keyboardShown ? spacing.sm : spacing.md,
    }}>
      <View style={{
        minHeight: 54, flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: spacing.lg,
      }}>
        <Pressable onPress={onBack} accessibilityRole="button"
          accessibilityLabel={copy('back')}
          style={({ pressed }) => ({
            minWidth: 48, minHeight: 48, alignItems: 'flex-start',
            justifyContent: 'center', opacity: pressed ? 0.65 : 1,
          })}>
          <Text accessibilityElementsHidden
            style={{ color: colors.text, fontSize: 32, lineHeight: 38 }}>{'←'}</Text>
        </Pressable>
      </View>
      <View style={{
        flex: 1, minHeight: 0, paddingHorizontal: spacing.lg,
        paddingTop: keyboardShown ? 0 : spacing.md,
      }}>
        {children}
      </View>
    </View>
  </KeyboardAvoidingView>;
}
