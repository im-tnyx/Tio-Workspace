import { Button } from '@/shared/ui/Button';
import { InfoCard } from '@/shared/ui/InfoCard';
import { copy } from '@/shared/i18n/en';

type Props = { onWorkoutPreview: () => void };
export function HomeScreen({ onWorkoutPreview }: Props) {
  return <>
    <InfoCard title={copy('welcome')} body={copy('intro')} />
    <Button label={copy('previewWorkout')} onPress={onWorkoutPreview} />
    <InfoCard title={copy('history')} body={copy('noActivity')} />
    <InfoCard title={copy('plans')} body={copy('noPlan')} />
  </>;
}
