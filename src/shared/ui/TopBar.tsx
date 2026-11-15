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
          <Text accessibilityElementsHidden style={{
            color: colors.text,
            fontSize: topBarSizes.authBackIconFontSize,
            lineHeight: topBarSizes.authBackIconLineHeight,
          }}>{'←'}</Text>
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
