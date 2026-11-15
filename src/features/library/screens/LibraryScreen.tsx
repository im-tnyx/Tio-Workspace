import { Button } from '@/shared/ui/Button';
import { InfoCard } from '@/shared/ui/InfoCard';
import { copy } from '@/shared/i18n/en';

export function LibraryScreen({ onExercisePreview }: { onExercisePreview: () => void }) {
  return <>
    <InfoCard title={copy('library')} body={copy('libraryDescription')} />
    <Button label={copy('previewExercise')} onPress={onExercisePreview} />
    <InfoCard title={copy('plans')} body={copy('previewOnly')} />
  </>;
}
