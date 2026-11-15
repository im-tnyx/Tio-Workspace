import { Pressable, Text, View } from 'react-native';
import { useAppearance } from '@/shared/theme/AppearanceProvider';
import { radii, spacing, topBarSizes, typography } from '@/shared/theme/tokens';
import { copy } from '@/shared/i18n/en';
import { SurfaceMaterial } from './SurfaceMaterial';

type TopBarProps = {
  actionLabel?: string;
  onAction?: () => void;
} & (
  | { variant: 'root'; title: string; onBack?: never; safeAreaTop?: never }
  | { variant: 'nested'; title: string; onBack: () => void; safeAreaTop?: never }
  | { variant: 'auth'; title?: never; onBack: () => void; safeAreaTop: number }
);

// Stable-width 32dp/pt arrow composed of platform-independent RN strokes.
// Keep the 48dp/pt button touch target and spoken Back label in TopBar.
function BackArrowIcon({ color }: { color: string }) {
  const icon = topBarSizes.authBackIcon;
  return <View pointerEvents="none" accessible={false} style={{
    width: icon.size, height: icon.size,
  }}>
    <View style={{
      position: 'absolute',
      left: icon.shaftX, top: icon.shaftY,
      width: icon.shaftWidth, height: icon.stroke,
      backgroundColor: color, borderRadius: radii.pill,
    }} />
    <View style={{
      position: 'absolute',
      left: icon.headX, top: icon.headY,
      width: icon.headSize, height: icon.headSize,
      borderLeftWidth: icon.stroke, borderTopWidth: icon.stroke,
      borderColor: color, transform: [{ rotate: '-45deg' }],
    }} />
  </View>;
}

// One shared header with three visual contexts. The auth variant deliberately
// remains plain, borderless and title-free; its large title belongs to the form.
export function TopBar(props: TopBarProps) {
  const { colors } = useAppearance();

  if (props.variant === 'auth') {
    return <View style={{
      paddingTop: props.safeAreaTop + spacing.sm,
      paddingHorizontal: spacing.lg,
      minHeight: props.safeAreaTop + spacing.sm + topBarSizes.minHeight,
      justifyContent: 'flex-end',
    }}>
      <View style={{
        minHeight: topBarSizes.minHeight, flexDirection: 'row',
        alignItems: 'center', justifyContent: 'space-between',
      }}>
        <Pressable onPress={props.onBack} accessibilityRole="button"
          accessibilityLabel={copy('back')}
          style={({ pressed }) => ({
            minWidth: topBarSizes.backTouchTarget,
            minHeight: topBarSizes.backTouchTarget,
            alignSelf: 'flex-start', justifyContent: 'center',
            opacity: pressed ? topBarSizes.authPressedOpacity : 1,
          })}>
          <BackArrowIcon color={colors.text} />
        </Pressable>
        {props.actionLabel && props.onAction ? <Pressable
          onPress={props.onAction} accessibilityRole="button"
          accessibilityLabel={props.actionLabel}
          style={({ pressed }) => ({
            minHeight: topBarSizes.backTouchTarget,
            justifyContent: 'center',
            opacity: pressed ? topBarSizes.authPressedOpacity : 1,
          })}>
          <Text style={{
            color: colors.text,
            fontSize: topBarSizes.authActionFontSize,
            fontWeight: topBarSizes.authActionFontWeight,
          }}>{props.actionLabel}</Text>
        </Pressable> : null}
      </View>
    </View>;
  }

  return <SurfaceMaterial style={{
    minHeight: topBarSizes.minHeight, borderRadius: radii.lg,
    marginHorizontal: spacing.md, borderWidth: 1, flexDirection: 'row',
    alignItems: 'center', paddingHorizontal: spacing.md, gap: spacing.md,
  }}>
    {props.onBack && <Pressable onPress={props.onBack} accessibilityRole="button"
      accessibilityLabel={copy('back')}
      style={{
        minWidth: topBarSizes.backTouchTarget,
        minHeight: topBarSizes.backTouchTarget,
        justifyContent: 'center',
      }}>
      <Text style={[typography.body, { color: colors.text }]}>
        {'‹  ' + copy('back')}
      </Text>
    </Pressable>}
    <Text numberOfLines={1} style={[typography.heading, {
      color: colors.text, flex: 1,
    }]}>{props.title}</Text>
    {props.actionLabel && props.onAction ? <Pressable
      onPress={props.onAction} accessibilityRole="button"
      accessibilityLabel={props.actionLabel}
      style={{
        minHeight: topBarSizes.backTouchTarget, justifyContent: 'center',
      }}>
      <Text style={[typography.body, { color: colors.text }]}>
        {props.actionLabel}
      </Text>
    </Pressable> : null}
  </SurfaceMaterial>;
}
