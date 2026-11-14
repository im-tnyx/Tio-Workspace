import type { AppearanceChoice, MaterialChoice } from '@/shared/theme/preferences';
import { copy } from '@/shared/i18n/en';
import { ChoiceGroup } from '@/shared/ui/ChoiceGroup';
import { InfoCard } from '@/shared/ui/InfoCard';

type Props = {
  appearance: AppearanceChoice;
  material: MaterialChoice;
  onAppearance: (value: AppearanceChoice) => void;
  onMaterial: (value: MaterialChoice) => void;
};
const themeChoices: readonly { value: AppearanceChoice; label: string }[] = [
  { value: 'system', label: copy('system') },
  { value: 'light', label: copy('light') },
  { value: 'dark', label: copy('dark') },
];
const materialChoices: readonly { value: MaterialChoice; label: string }[] = [
  { value: 'glass', label: copy('glass') },
  { value: 'solid', label: copy('solid') },
];
export function AppearanceScreen({ appearance, material, onAppearance, onMaterial }: Props) {
  return <>
    <InfoCard title={copy('appearance')} body={copy('appearanceDescription')} />
    <ChoiceGroup label={copy('theme')} selected={appearance}
      options={themeChoices} onSelect={onAppearance} />
    <ChoiceGroup label={copy('material')} selected={material}
      options={materialChoices} onSelect={onMaterial} />
    <InfoCard title={copy('app')} body={copy('previewOnly')} />
  </>;
}
