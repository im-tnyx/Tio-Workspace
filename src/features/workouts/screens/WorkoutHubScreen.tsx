import { Button } from '@/shared/ui/Button';
import { InfoCard } from '@/shared/ui/InfoCard';
import { copy } from '@/shared/i18n/en';

type Props = {
  onWorkoutPreview: () => void;
  onPlansPreview: () => void;
  onHistoryPreview: () => void;
};
export function WorkoutHubScreen({ onWorkoutPreview, onPlansPreview, onHistoryPreview }: Props) {
  return <>
    <InfoCard title={copy('plans')} body={copy('noPlan')} />
    <Button label={copy('previewWorkout')} onPress={onWorkoutPreview} />
    <Button label={copy('previewPlans')} variant="secondary" onPress={onPlansPreview} />
    <Button label={copy('previewHistory')} variant="secondary" onPress={onHistoryPreview} />
    <InfoCard title={copy('history')} body={copy('noActivity')} />
  </>;
}
