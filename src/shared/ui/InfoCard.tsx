import { Text } from 'react-native';
import { useAppearance } from '@/shared/theme/AppearanceProvider';
import { typography } from '@/shared/theme/tokens';
import { Card } from './Card';

export function InfoCard({ title, body }: { title: string; body: string }) {
  const { colors } = useAppearance();
  return <Card>
    <Text style={[typography.heading, { color: colors.text }]}>{title}</Text>
    <Text style={[typography.body, { color: colors.muted }]}>{body}</Text>
  </Card>;
}
