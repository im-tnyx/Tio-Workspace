import { InfoCard } from '@/shared/ui/InfoCard';
import { copy } from '@/shared/i18n/en';

export function PlaceholderScreen({ label }: { label: string }) {
  return <>
    <InfoCard title={label} body={copy('detailDescription')} />
    <InfoCard title={copy('previewOnly')} body={copy('noActivity')} />
  </>;
}
