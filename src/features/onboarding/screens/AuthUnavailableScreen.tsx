import { InfoCard } from '@/shared/ui/InfoCard';
import { copy } from '@/shared/i18n/en';

export function AuthUnavailableScreen({ title }: { title: string }) {
  return <InfoCard title={title} body={copy('authComingLater')} />;
}
