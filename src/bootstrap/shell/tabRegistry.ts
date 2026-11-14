import type { TabViewItem } from '@/shared/navigation/tabTypes';
export type TabDefinition = TabViewItem & { routeName: 'home' | 'workout' | 'library' | 'you' };
export const ROOT_TABS: readonly TabDefinition[] = [
  { key: 'home', routeName: 'home', labelKey: 'home', glyph: '⌂' },
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
