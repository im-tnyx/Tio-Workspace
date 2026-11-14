import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { TypewriterHeading } from '@/shared/ui/TypewriterHeading';
import { useAppearance } from '@/shared/theme/AppearanceProvider';
import { spacing, typography } from '@/shared/theme/tokens';

type Action = { label: string; onPress: () => void; variant?: 'primary' | 'secondary' };
type BottomLink = { prompt: string; label: string; onPress: () => void };
type Props = {
  title: string;
  actions: readonly Action[];
  actionPlacement?: 'center' | 'bottom';
  animatedTitle?: boolean;
  bottomLink?: BottomLink;
};

export function WelcomePanel({
  title, actions, actionPlacement = 'center', animatedTitle = false, bottomLink,
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
      }}><Card>
        {buttons}
        {bottomLink ? <View style={{
          flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
          alignItems: 'center',
        }}>
          <Text style={[typography.body, { color: colors.muted }]}>{bottomLink.prompt}{' '}</Text>
          <Pressable onPress={bottomLink.onPress} accessibilityRole="link"
            accessibilityLabel={bottomLink.label}
            style={({ pressed }) => ({
              minHeight: 48, minWidth: 48, justifyContent: 'center', alignItems: 'center',
              opacity: pressed ? 0.7 : 1,
            })}>
            <Text style={[typography.body, {
              color: colors.text, fontWeight: '700', textDecorationLine: 'underline',
            }]}>{bottomLink.label}</Text>
          </Pressable>
        </View> : null}
      </Card></View>
    </> : <ScrollView
      style={{ flex: 1 }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        flexGrow: 1, justifyContent: 'center', alignItems: 'center',
        paddingTop: insets.top + spacing.lg,
        paddingBottom: insets.bottom + spacing.lg,
      }}>
      <View style={{ width: '100%', maxWidth: 330,
        alignItems: 'center', gap: 48 }}>
        {heading}
        <View style={{ width: '100%', gap: spacing.md }}>{buttons}</View>
      </View>
    </ScrollView>}
  </View>;
}
