import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useAppearance } from '@/shared/theme/AppearanceProvider';
import { radii, spacing } from '@/shared/theme/tokens';
export function Card({ children }: { children: ReactNode }) {
  const { colors } = useAppearance();
  return <View style={{ padding: spacing.lg, borderRadius: radii.lg,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    gap: spacing.sm }}>{children}</View>;
}
