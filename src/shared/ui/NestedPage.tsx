import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppearance } from '@/shared/theme/AppearanceProvider';
import { spacing } from '@/shared/theme/tokens';
import { TopBar } from './TopBar';

export function NestedPage({ title, children }: { title: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { colors } = useAppearance();
  return <View style={{ flex: 1, paddingTop: insets.top,
    paddingBottom: insets.bottom, backgroundColor: colors.background }}>
    <TopBar variant="nested" title={title} onBack={() => {
      if (router.canGoBack()) router.back(); else router.replace('/');
    }} />
    <ScrollView contentContainerStyle={{ padding: spacing.lg,
      paddingBottom: spacing.xxl, gap: spacing.lg }}>{children}</ScrollView>
  </View>;
}
