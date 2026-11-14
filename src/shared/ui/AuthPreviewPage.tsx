import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppearance } from '@/shared/theme/AppearanceProvider';
import { spacing } from '@/shared/theme/tokens';
import { TopBar } from './TopBar';

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
      <TopBar title={title} onBack={onBack} />
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
