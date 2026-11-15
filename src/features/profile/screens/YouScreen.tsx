import { Button } from '@/shared/ui/Button';
import { InfoCard } from '@/shared/ui/InfoCard';
import { copy } from '@/shared/i18n/en';

type Props = { onSettings: () => void; onProgress: () => void };
export function YouScreen({ onSettings, onProgress }: Props) {
  return <>
    <InfoCard title={copy('you')} body={copy('youDescription')} />
    <Button label={copy('progress')} onPress={onProgress} />
    <Button label={copy('settings')} onPress={onSettings} variant="secondary" />
    <InfoCard title={copy('app')} body={copy('previewOnly')} />
  </>;
}
