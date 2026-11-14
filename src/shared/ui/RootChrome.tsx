import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { chromeMotion } from '@/shared/theme/tokens';
import { TopBar } from './TopBar';

type Chrome = { title: string; visible: boolean;
  activate: (name: string, retainedOffset: number) => void; onOffset: (offset: number) => void };
const Context = createContext<Chrome | null>(null);

export function RootChromeProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState('');
  const [visible, setVisible] = useState(false);
  const current = useRef(false);
  const activate = useCallback((name: string, retainedOffset: number) => {
    const shouldShow = retainedOffset >= chromeMotion.showThreshold;
    setTitle(name);
    current.current = shouldShow;
    setVisible(shouldShow);
  }, []);
  const onOffset = useCallback((offset: number) => {
    const next = offset >= chromeMotion.showThreshold ? true
      : offset <= chromeMotion.hideThreshold ? false : current.current;
    if (next !== current.current) { current.current = next; setVisible(next); }
  }, []);
  const value = useMemo(() => ({ title, visible, activate, onOffset }),
    [title, visible, activate, onOffset]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useRootChrome(): Chrome {
  const value = useContext(Context);
  if (!value) throw new Error('Missing RootChromeProvider');
  return value;
}
export function RootTopBar() {
  const { title, visible } = useRootChrome();
  const insets = useSafeAreaInsets();
  const [opacity] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(opacity, { toValue: visible ? 1 : 0,
      duration: chromeMotion.durationMs, useNativeDriver: true }).start();
  }, [visible, opacity]);
  return <Animated.View
    pointerEvents={visible ? 'box-none' : 'none'}
    accessibilityElementsHidden={!visible}
    importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
    style={{ position: 'absolute', left: 0, right: 0, top: insets.top, zIndex: 10,
      opacity, transform: [{ translateY: opacity.interpolate({
        inputRange: [0, 1], outputRange: [-10, 0],
      }) }] }}>
    <TopBar title={title} />
  </Animated.View>;
}
