import { ScrollView, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TabViewItem } from '@/shared/navigation/tabTypes';
import { tabGeometry } from '@/shared/navigation/tabTypes';
import { copy } from '@/shared/i18n/en';
import { useAppearance } from '@/shared/theme/AppearanceProvider';
import { spacing, typography } from '@/shared/theme/tokens';
import { SurfaceMaterial } from './SurfaceMaterial';

export function BottomTabBar({ tabs, selectedRoute, onSelect }: {
  tabs: readonly TabViewItem[]; selectedRoute: string;
  onSelect: (tab: TabViewItem) => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colors } = useAppearance();
  const metrics = tabGeometry(tabs.length, width);
  return <SurfaceMaterial testID="root-bottom-bar" style={{ width: '100%',
    borderTopWidth: 1, paddingTop: spacing.sm,
    paddingBottom: Math.max(insets.bottom, spacing.sm) }}>
    <ScrollView horizontal scrollEnabled={metrics.scrollable} showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
      {tabs.map(tab => {
        const selected = tab.routeName === selectedRoute;
        return <Pressable key={tab.key} onPress={() => onSelect(tab)}
          accessibilityRole="tab" accessibilityLabel={copy(tab.labelKey)}
          accessibilityState={{ selected }}
          style={({ pressed }) => ({
            width: metrics.itemWidth, minHeight: 50, alignItems: 'center',
            justifyContent: 'center', gap: 2, opacity: pressed ? 0.7 : 1,
          })}>
          <Text style={{ color: selected ? colors.text : colors.muted,
            fontWeight: selected ? '700' : '400', fontSize: 23 }}>{tab.glyph}</Text>
          <Text numberOfLines={1} style={[typography.caption, {
            color: selected ? colors.text : colors.muted,
            fontWeight: selected ? '700' : '500',
          }]}>{copy(tab.labelKey)}</Text>
          <View style={{ height: 2, width: 28, backgroundColor: selected ? colors.text : 'transparent' }} />
        </Pressable>;
      })}
    </ScrollView>
  </SurfaceMaterial>;
}
