import { View, Text } from 'react-native';
import { Button } from '@/shared/ui/Button';
import { useAppearance } from '@/shared/theme/AppearanceProvider';
import { spacing } from '@/shared/theme/tokens';

type Action = { label: string; onPress: () => void; variant?: 'primary' | 'secondary' };
export function WelcomePanel({ title, actions }: { title: string; actions: readonly Action[] }) {
  const { colors } = useAppearance();
  return <View style={{
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: colors.background, paddingHorizontal: spacing.xl,
  }}>
    <View style={{ width: '100%', maxWidth: 330, alignItems: 'center', gap: 48 }}>
      <Text accessibilityRole="header" style={{
        color: colors.text, fontSize: 54, lineHeight: 65,
        fontWeight: '800', letterSpacing: 5, textAlign: 'center',
      }}>{title}</Text>
      <View style={{ width: '100%', gap: spacing.md }}>
        {actions.map(action => <Button key={action.label} label={action.label}
          onPress={action.onPress} variant={action.variant} />)}
      </View>
    </View>
  </View>;
}
