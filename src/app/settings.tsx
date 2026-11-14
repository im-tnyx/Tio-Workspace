import { AppearanceScreen } from '@/features/settings';
import { copy } from '@/shared/i18n/en';
import { useAppearance } from '@/shared/theme/AppearanceProvider';
import { NestedPage } from '@/shared/ui/NestedPage';
import { PreviewGate } from '@/bootstrap/shell/PreviewGate';

export default function SettingsRoute() {
  const { appearance, material, setAppearance, setMaterial } = useAppearance();
  return <PreviewGate><NestedPage title={copy('settings')}>
    <AppearanceScreen appearance={appearance} material={material}
      onAppearance={setAppearance} onMaterial={setMaterial} />
  </NestedPage></PreviewGate>;
}
