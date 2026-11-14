import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppearance } from '@/shared/theme/AppearanceProvider';
import { spacing, typography } from '@/shared/theme/tokens';
import { copy } from '@/shared/i18n/en';

// Auth forms must remain reachable on short screens and when the keyboard opens.
export function AuthPreviewPage({ title, onBack, children }: {
  title: string; onBack: () => void; children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useAppearance();
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    style={{ flex: 1, backgroundColor: colors.background }}>
    <View style={{
      flex: 1, paddingTop: insets.top + spacing.sm, gap: spacing.xl,
    }}>
      {/* Plain auth-only header; keep the shared TopBar unchanged for other routes. */}
      <View style={{
        minHeight: 54, flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: spacing.lg, gap: spacing.sm,
      }}>
        <Pressable onPress={onBack} accessibilityRole="button"
          accessibilityLabel={copy('back')}
          style={({ pressed }) => ({
            minWidth: 48, minHeight: 48, alignItems: 'flex-start',
            justifyContent: 'center', opacity: pressed ? 0.65 : 1,
          })}>
          <Text accessibilityElementsHidden
            style={{ color: colors.text, fontSize: 32, lineHeight: 38 }}>{'‹'}</Text>
        </Pressable>
        <Text numberOfLines={1}
          style={[typography.heading, { color: colors.text, flex: 1 }]}>
          {title}
        </Text>
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1, paddingHorizontal: spacing.lg,
          paddingBottom: insets.bottom + spacing.xl,
        }}
        keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </View>
  </KeyboardAvoidingView>;
}
