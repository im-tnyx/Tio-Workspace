import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/shared/ui/Button';
import { useAppearance } from '@/shared/theme/AppearanceProvider';
import { spacing } from '@/shared/theme/tokens';

type Action = { label: string; onPress: () => void; variant?: 'primary' | 'secondary' };
type Props = {
  title: string;
  actions: readonly Action[];
  actionPlacement?: 'center' | 'bottom';
};

export function WelcomePanel({ title, actions, actionPlacement = 'center' }: Props) {
  const { colors } = useAppearance();
  const insets = useSafeAreaInsets();
  const heading = <Text accessibilityRole="header" style={{
    color: colors.text, fontSize: 54, lineHeight: 65,
    fontWeight: '800', letterSpacing: 5, textAlign: 'center',
  }}>{title}</Text>;
  const buttons = actions.map(action => <Button
    key={action.label} label={action.label}
    onPress={action.onPress} variant={action.variant} />);

  return <View style={{
    flex: 1, backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
  }}>
    {actionPlacement === 'bottom' ? <>
      <View style={{
        flex: 1, justifyContent: 'center', alignItems: 'center',
        paddingTop: insets.top,
      }}>{heading}</View>
      <View style={{
        width: '100%', maxWidth: 400, alignSelf: 'center',
        gap: spacing.md,
        // Keep the CTA 24pt/dp above the safe-area boundary on every iPhone.
        paddingBottom: insets.bottom + spacing.xl,
      }}>{buttons}</View>
    </> : <View style={{
      flex: 1, alignItems: 'center', justifyContent: 'center',
      paddingTop: insets.top, paddingBottom: insets.bottom,
    }}>
      <View style={{ width: '100%', maxWidth: 330,
        alignItems: 'center', gap: 48 }}>
        {heading}
        <View style={{ width: '100%', gap: spacing.md }}>{buttons}</View>
      </View>
    </View>}
  </View>;
}
