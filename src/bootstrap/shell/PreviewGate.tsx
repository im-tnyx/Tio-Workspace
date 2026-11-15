import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';
import { canOpenShellPreview } from './shellPreviewAccess';

export function PreviewGate({ children }: { children: ReactNode }) {
  if (!canOpenShellPreview(__DEV__)) return <Redirect href="/" />;
  return <>{children}</>;
}
