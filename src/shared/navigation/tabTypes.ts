import type { CopyKey } from '@/shared/i18n/en';

export type TabViewItem = { key: string; routeName: string; labelKey: CopyKey; glyph: string };

export function tabGeometry(count: number, width: number): { itemWidth: number; scrollable: boolean } {
  if (!Number.isInteger(count) || count < 1) throw new Error('Invalid tab count');
  const ideal = Math.max(0, width) / count;
  return { itemWidth: Math.max(64, ideal), scrollable: ideal < 64 };
}
