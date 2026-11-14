import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppearance } from '@/shared/theme/AppearanceProvider';
import { spacing } from '@/shared/theme/tokens';
import { TopBar } from './TopBar';

export function AuthPreviewPage({ title, onBack, children }: {
  title: string; onBack: () => void; children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useAppearance();
  return <View style={{
    flex: 1, paddingTop: insets.top + spacing.sm,
    paddingBottom: insets.bottom, backgroundColor: colors.background, gap: spacing.xl,
  }}>
    <TopBar title={title} onBack={onBack} />
    <View style={{ paddingHorizontal: spacing.lg }}>{children}</View>
  </View>;
}
