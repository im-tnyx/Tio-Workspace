import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useAppearance, useNativeGlass } from '@/shared/theme/AppearanceProvider';
type Props = { children: ReactNode; style?: StyleProp<ViewStyle>; testID?: string };
export function SurfaceMaterial({ children, style, testID }: Props) {
  const { colors, mode } = useAppearance();
  const glass = useNativeGlass();
  return <View testID={testID} style={[
    { overflow: 'hidden', backgroundColor: glass ? colors.glassTint : colors.background,
      borderColor: colors.border }, style,
  ]}>
    {glass ? <BlurView intensity={40} tint={mode === 'dark' ? 'dark' : 'light'}
      style={StyleSheet.absoluteFill} /> : null}
    {children}
  </View>;
}
