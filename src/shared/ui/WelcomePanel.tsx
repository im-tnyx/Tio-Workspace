import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { TypewriterHeading } from '@/shared/ui/TypewriterHeading';
import { useAppearance } from '@/shared/theme/AppearanceProvider';
import { spacing } from '@/shared/theme/tokens';

type Action = { label: string; onPress: () => void; variant?: 'primary' | 'secondary' };
type Props = {
  title: string;
  actions: readonly Action[];
  actionPlacement?: 'center' | 'bottom';
  animatedTitle?: boolean;
};

export function WelcomePanel({
  title, actions, actionPlacement = 'center', animatedTitle = false,
}: Props) {
  const { colors } = useAppearance();
  const insets = useSafeAreaInsets();
  const headingStyle = {
    color: colors.text, fontSize: 54, lineHeight: 65,
    fontWeight: '800' as const, letterSpacing: 5, textAlign: 'center' as const,
  };
  const heading = animatedTitle
    ? <TypewriterHeading title={title} textStyle={headingStyle} />
    : <Text accessibilityRole="header" style={headingStyle}>{title}</Text>;
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
        width: '100%', alignSelf: 'center',
        gap: spacing.md,
        // The CTA has matching 16pt side/bottom padding, plus the device safe area.
        paddingBottom: insets.bottom + spacing.lg,
      }}><Card>{buttons}</Card></View>
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
