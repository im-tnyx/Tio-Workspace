import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AccessibilityInfo, Platform, useColorScheme } from 'react-native';
import { decodePreferences, DEFAULT_PREFERENCES, resolveMode, UI_PREFERENCE_KEY } from './preferences';
import type { AppearanceChoice, MaterialChoice, ShellPreferences } from './preferences';
import { palettes } from './tokens';
import type { ColorMode, ColorTokens } from './tokens';

type AppearanceContextValue = {
  appearance: AppearanceChoice; material: MaterialChoice; effectiveMaterial: MaterialChoice;
  mode: ColorMode; colors: ColorTokens;
  setAppearance: (value: AppearanceChoice) => void;
  setMaterial: (value: MaterialChoice) => void;
};
const Context = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<ShellPreferences>(DEFAULT_PREFERENCES);
  const [loaded, setLoaded] = useState(false);
  const [reduceTransparency, setReduceTransparency] = useState(false);
  const preferenceWriteQueue = useRef<Promise<void>>(Promise.resolve());
  const osMode = useColorScheme();

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(UI_PREFERENCE_KEY).then((raw) => {
      if (!active || raw === null) return;
      try { setPrefs(decodePreferences(JSON.parse(raw) as unknown)); }
      catch { setPrefs(DEFAULT_PREFERENCES); }
    }).catch(() => {}).finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then(setReduceTransparency).catch(() => setReduceTransparency(true));
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduceTransparency);
    return () => sub.remove();
  }, []);

  // Persist only hydrated, committed UI preferences. Queue writes in order so
  // a rapidly selected older Theme/Material cannot overwrite the latest one.
  // No account, identity or workout data is ever stored by this provider.
  useEffect(() => {
    if (!loaded) return;
    const serialized = JSON.stringify(prefs);
    preferenceWriteQueue.current = preferenceWriteQueue.current
      .catch(() => {})
      .then(() => AsyncStorage.setItem(UI_PREFERENCE_KEY, serialized))
      .catch(() => {});
  }, [loaded, prefs]);

  const update = useCallback((patch: Partial<ShellPreferences>) => {
    setPrefs((previous) => ({ ...previous, ...patch }));
  }, []);
  const setAppearance = useCallback((x: AppearanceChoice) => update({ appearance: x }), [update]);
  const setMaterial = useCallback((x: MaterialChoice) => update({ material: x }), [update]);
  const mode = resolveMode(prefs.appearance, osMode === 'dark' ? 'dark' : 'light');

  useEffect(() => {
    // Android's root background must follow the same resolved palette as
    // the edge-to-edge content. Three-button OS contrast scrims may remain
    // in Expo Go; this does not control the host app's native window flags.
    if (Platform.OS !== 'android') return;
    void SystemUI.setBackgroundColorAsync(palettes[mode].background).catch(() => {});
  }, [mode]);

  const value = useMemo<AppearanceContextValue>(() => ({
    appearance: prefs.appearance, material: prefs.material,
    effectiveMaterial: reduceTransparency ? 'solid' : prefs.material,
    mode, colors: palettes[mode], setAppearance, setMaterial,
  }), [prefs, reduceTransparency, mode, setAppearance, setMaterial]);
  if (!loaded) return null;
  return <Context.Provider value={value}>
    <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
    {children}
  </Context.Provider>;
}
export function useAppearance(): AppearanceContextValue {
  const x = useContext(Context);
  if (!x) throw new Error('Missing AppearanceProvider');
  return x;
}
export function useNativeGlass(): boolean {
  const { effectiveMaterial } = useAppearance();
  // Android SDK 58 blur needs an explicit BlurTargetView: until native QA,
  // use a legible opaque fallback without changing saved Glass preference.
  return effectiveMaterial === 'glass' && Platform.OS === 'ios';
}
