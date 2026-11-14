// MVP copy lives centrally. Future language resources can replace this catalog.
export const en = {
  brandTitle: 'TNYX', getStarted: 'GET STARTED',
  signIn: 'Sign in', signUp: 'Sign up',
  authComingLater: 'Authentication is not available in this preview. No account can be created or accessed.',
  app: 'Tnyx', home: 'Home', workout: 'Workout', library: 'Library', you: 'You',
  welcome: 'Make every rep count.',
  intro: 'A focused space for training. This preview does not save workouts.',
  previewWorkout: 'Preview workout', previewPlans: 'Plan preview',
  previewHistory: 'History preview', previewExercise: 'Exercise preview',
  noActivity: 'Your workout history will appear in a later phase.',
  noPlan: 'Your workout programs will appear here.',
  libraryDescription: 'The curated exercise library will arrive with workout features.',
  youDescription: 'Your progress and preferences, all in one place.',
  settings: 'Settings', progress: 'Progress', appearance: 'Appearance',
  appearanceDescription: 'Only visual preferences are stored on this device.',
  theme: 'Theme', material: 'Material', system: 'System', light: 'Light',
  dark: 'Dark', glass: 'Glass', solid: 'Solid', back: 'Back',
  previewOnly: 'UI preview only. No account or workout data is saved.',
  detailDescription: 'This screen will be implemented in a later approved phase.',
  exerciseDetail: 'Exercise detail', activeWorkout: 'Active workout',
  plans: 'Programs', history: 'History',
} as const;
export type CopyKey = keyof typeof en;
export function copy(key: CopyKey): string { return en[key]; }
export function formatNumber(value: number, locale = 'en'): string {
  return new Intl.NumberFormat(locale).format(value);
}
