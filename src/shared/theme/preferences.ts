import type { ColorMode } from './tokens';
export type AppearanceChoice = 'system' | 'light' | 'dark';
export type MaterialChoice = 'glass' | 'solid';
export type ShellPreferences = { appearance: AppearanceChoice; material: MaterialChoice };
export const UI_PREFERENCE_KEY = 'tnyx.shell.appearance.v1';
export const DEFAULT_PREFERENCES: ShellPreferences = { appearance: 'system', material: 'glass' };

export function decodePreferences(raw: unknown): ShellPreferences {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_PREFERENCES };
  const x = raw as Partial<ShellPreferences>;
  return {
    appearance: x.appearance === 'light' || x.appearance === 'dark' ? x.appearance : 'system',
    material: x.material === 'solid' ? 'solid' : 'glass',
  };
}
export function resolveMode(preference: AppearanceChoice, systemMode: ColorMode | null): ColorMode {
  return preference === 'system' ? (systemMode === 'dark' ? 'dark' : 'light') : preference;
}
