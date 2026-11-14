import { Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/shared/ui/Button';
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
  const android = Platform.OS === 'android';
  const { height } = useWindowDimensions();
  // Welcome is a fixed, non-scrolling screen. Scale down its decorative
  // heading on short devices while keeping the action area reachable.
  const compactWelcome = actionPlacement === 'bottom' && height < 620;
  // iOS doesn't expose its physical display corner radius here. Use the
  // home-indicator inset to approximate its smoother, deeper lower corners.
  const iosBottomCornerRadius = Math.max(36, Math.min(54, insets.bottom + 14));
  const headingStyle = {
    color: colors.text, fontSize: compactWelcome ? 40 : 54,
    lineHeight: compactWelcome ? 48 : 65,
    fontWeight: '800' as const, letterSpacing: compactWelcome ? 3 : 5,
    textAlign: 'center' as const,
  };
  const heading = animatedTitle
    ? <TypewriterHeading title={title} textStyle={headingStyle} />
    : <Text accessibilityRole="header" style={headingStyle}>{title}</Text>;
  const buttons = actions.map(action => <Button
    key={action.label} label={action.label}
    onPress={action.onPress} variant={action.variant} />);
  const bottomActions = <View style={{ gap: spacing.sm }}>
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
  </View>;

  return <View style={{ flex: 1, backgroundColor: colors.background }}>
    {actionPlacement === 'bottom' ? <>
      <View style={{
        flex: 1, minHeight: 0, justifyContent: 'center', alignItems: 'center',
        paddingHorizontal: spacing.lg, paddingTop: insets.top + spacing.sm,
      }}>{heading}</View>
      {android ? <View style={{
        backgroundColor: colors.card,
        borderTopLeftRadius: 32, borderTopRightRadius: 32,
        borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1,
        borderColor: colors.border,
        paddingTop: spacing.lg, paddingHorizontal: spacing.lg,
        // Sheet reaches the screen bottom; inset is INSIDE the surface,
        // so buttons remain above gesture/3-button navigation controls.
        paddingBottom: insets.bottom + spacing.sm,
      }}>{bottomActions}</View> : <View style={{
        // Only a 4pt outer gap. Keep the iOS safe area inside the rounded card.
        paddingHorizontal: spacing.sm, paddingBottom: spacing.xs,
      }}>
        <View style={{
          backgroundColor: colors.card,
          // Match iOS's continuous screen-corner curve rather than a
          // circular 32pt radius; keep the existing 8pt/4pt outer spacing.
          borderCurve: 'continuous',
          borderTopLeftRadius: 38, borderTopRightRadius: 38,
          borderBottomLeftRadius: iosBottomCornerRadius,
          borderBottomRightRadius: iosBottomCornerRadius,
          borderWidth: 1, borderColor: colors.border,
          overflow: 'hidden',
          paddingTop: spacing.lg, paddingHorizontal: spacing.lg,
          paddingBottom: insets.bottom + spacing.sm,
        }}>{bottomActions}</View>
      </View>}
    </> : <ScrollView style={{ flex: 1 }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        flexGrow: 1, justifyContent: 'center', alignItems: 'center',
        paddingHorizontal: spacing.lg,
        paddingTop: insets.top + spacing.lg,
        paddingBottom: insets.bottom + spacing.lg,
      }}>
      <View style={{
        width: '100%', maxWidth: 330,
        alignItems: 'center', gap: 48,
      }}>
        {heading}
        <View style={{ width: '100%', gap: spacing.md }}>{buttons}</View>
      </View>
    </ScrollView>}
  </View>;
}
