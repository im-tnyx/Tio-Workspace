import type { CopyKey } from '@/shared/i18n/en';
export type TabDefinition = { key: string;
  routeName: 'index' | 'workout' | 'library' | 'you'; labelKey: CopyKey; glyph: string };
export const ROOT_TABS: readonly TabDefinition[] = [
  { key: 'home', routeName: 'index', labelKey: 'home', glyph: '⌂' },
  { key: 'workout', routeName: 'workout', labelKey: 'workout', glyph: '▣' },
  { key: 'library', routeName: 'library', labelKey: 'library', glyph: '▤' },
  { key: 'you', routeName: 'you', labelKey: 'you', glyph: '○' },
] as const;
export function validateTabs(tabs: readonly TabDefinition[]): void {
  if (tabs.length === 0) throw new Error('At least one root tab is required');
  const keys = new Set<string>(); const routes = new Set<string>();
  for (const tab of tabs) {
    if (!tab.key || !tab.routeName || keys.has(tab.key) || routes.has(tab.routeName))
      throw new Error('Root tabs require unique keys and routes');
    keys.add(tab.key); routes.add(tab.routeName);
  }
}
export function tabGeometry(count: number, width: number): { itemWidth: number; scrollable: boolean } {
  if (!Number.isInteger(count) || count < 1) throw new Error('Invalid tab count');
  const ideal = Math.max(0, width) / count;
  return { itemWidth: Math.max(64, ideal), scrollable: ideal < 64 };
}
