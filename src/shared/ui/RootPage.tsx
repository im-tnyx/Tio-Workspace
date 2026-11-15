import { useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppearance } from '@/shared/theme/AppearanceProvider';
import { spacing, typography } from '@/shared/theme/tokens';
import { useRootChrome } from './RootChrome';

export function RootPage({ title, children }: { title: string; children: ReactNode }) {
  const { colors } = useAppearance();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { activate, onOffset } = useRootChrome();
  const retainedOffset = useRef(0);
  useFocusEffect(useCallback(() => { activate(title, retainedOffset.current); }, [activate, title]));
  return <ScrollView style={{ backgroundColor: colors.background }}
    contentContainerStyle={{ paddingHorizontal: spacing.lg,
      paddingTop: insets.top + spacing.xl, minHeight: height + 170,
      paddingBottom: spacing.xxl }}
    scrollEventThrottle={16} onScroll={e => {
      const y = e.nativeEvent.contentOffset.y;
      retainedOffset.current = y;
      onOffset(y);
    }}>
    <Text style={[typography.title, { color: colors.text,
      marginBottom: spacing.xl }]}>{title}</Text>
    <View style={{ gap: spacing.lg }}>{children}</View>
  </ScrollView>;
}
