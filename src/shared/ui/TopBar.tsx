import { Pressable, Text } from 'react-native';
import { useAppearance } from '@/shared/theme/AppearanceProvider';
import { radii, spacing, typography } from '@/shared/theme/tokens';
import { copy } from '@/shared/i18n/en';
import { SurfaceMaterial } from './SurfaceMaterial';

export function TopBar({ title, onBack }: { title: string; onBack?: () => void }) {
  const { colors } = useAppearance();
  return <SurfaceMaterial style={{ minHeight: 54, borderRadius: radii.lg,
    marginHorizontal: spacing.md, borderWidth: 1, flexDirection: 'row',
    alignItems: 'center', paddingHorizontal: spacing.md, gap: spacing.md }}>
    {onBack && <Pressable onPress={onBack} accessibilityRole="button"
      accessibilityLabel={copy('back')}
      style={{ minWidth: 48, minHeight: 48, justifyContent: 'center' }}>
      <Text style={[typography.body, { color: colors.text }]}>{'‹  ' + copy('back')}</Text>
    </Pressable>}
    <Text numberOfLines={1} style={[typography.heading, { color: colors.text, flex: 1 }]}>
      {title}
    </Text>
  </SurfaceMaterial>;
}
