import { Pressable, Text, View } from 'react-native';
import { useAppearance } from '@/shared/theme/AppearanceProvider';
import { spacing, radii, typography } from '@/shared/theme/tokens';
type Option<T extends string> = { value: T; label: string };
type Props<T extends string> = {
  label: string; selected: T; options: readonly Option<T>[];
  onSelect: (value: T) => void;
};
export function ChoiceGroup<T extends string>({ label, selected, options, onSelect }: Props<T>) {
  const { colors } = useAppearance();
  return <View style={{ gap: spacing.sm }}>
    <Text style={[typography.heading, { color: colors.text }]}>{label}</Text>
    {options.map(item => {
      const active = selected === item.value;
      return <Pressable key={item.value} accessibilityRole="radio"
        accessibilityLabel={item.label} accessibilityState={{ checked: active }}
        onPress={() => onSelect(item.value)}
        style={({ pressed }) => ({
          minHeight: 48, borderRadius: radii.md, borderWidth: 1,
          borderColor: active ? colors.text : colors.border,
          backgroundColor: active ? colors.secondary : colors.card,
          paddingHorizontal: spacing.lg, flexDirection: 'row',
          alignItems: 'center', justifyContent: 'space-between',
          opacity: pressed ? 0.7 : 1,
        })}>
        <Text style={[typography.body, { color: colors.text }]}>{item.label}</Text>
        <Text accessibilityElementsHidden style={[typography.heading, { color: colors.text }]}>
          {active ? '✓' : ''}
        </Text>
      </Pressable>;
    })}
  </View>;
}
