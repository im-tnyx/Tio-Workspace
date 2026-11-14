import { Stack } from 'expo-router';
import { AppearanceProvider, useAppearance } from '@/shared/theme/AppearanceProvider';

function AppStack() {
  const { colors } = useAppearance();
  return <Stack screenOptions={{ headerShown: false,
    contentStyle: { backgroundColor: colors.background } }} />;
}
export default function RootLayout() {
  return <AppearanceProvider><AppStack /></AppearanceProvider>;
}
