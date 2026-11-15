import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Keyboard, Platform, Text, View, useWindowDimensions } from 'react-native';
import type { KeyboardEvent, LayoutChangeEvent, ViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppearance } from '@/shared/theme/AppearanceProvider';
import { authPreviewLayout, spacing, typography } from '@/shared/theme/tokens';
import { Button } from './Button';
import { TopBar } from './TopBar';
import { keyboardOverlap } from './authKeyboardGeometry';
import { authAvailableHeight, needsKeyboardDismiss } from './authViewport';
import { copy } from '@/shared/i18n/en';

const AuthAvailableHeightContext = createContext<number | null>(null);
export function useAuthAvailableHeight(): number | null {
  return useContext(AuthAvailableHeightContext);
}

// Shared fixed, non-scrolling auth page. Its persistent CTA is positioned from
// the actual root-view bottom in window coordinates, not physical screen height.
export function AuthPreviewPage({
  onBack, children, headerActionLabel, onHeaderAction,
  footerLabel, footerDisabled, footerKeepAppearance = false, footerNotice, onFooterPress,
}: {
  onBack: () => void; children: ReactNode;
  headerActionLabel?: string; onHeaderAction?: () => void;
  footerLabel: string; footerDisabled: boolean; footerKeepAppearance?: boolean;
  footerNotice?: string;
  onFooterPress: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useAppearance();
  const { fontScale } = useWindowDimensions();
  const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible());
  // Track only visibility, never a second keyboard position/inset source.
  // Android's adjustResize supplies the viewport height; iOS keeps the
  // existing measured root and keyboardWillChangeFrame geometry.
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const rootRef = useRef<ViewInstance>(null);
  const [rootBottomY, setRootBottomY] = useState<number | null>(null);
  const [rootHeight, setRootHeight] = useState<number | null>(null);
  const [headerHeight, setHeaderHeight] = useState<number | null>(null);
  const [footerHeight, setFooterHeight] = useState<number | null>(null);
  const [keyboardTopY, setKeyboardTopY] = useState<number | null>(null);

  const measureRootBottom = useCallback(() => {
    rootRef.current?.measureInWindow((_x, y, _width, height) => {
      if (height <= 0) return;
      const bottom = y + height;
      setRootBottomY(previous => previous === bottom ? previous : bottom);
    });
  }, []);

  const onRootLayout = useCallback((event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    setRootHeight(previous => previous === height ? previous : height);
    measureRootBottom();
  }, [measureRootBottom]);

  // Register listeners before mounting auto-focused TextInputs: otherwise
  // initial keyboardWillShow may be missed on iOS.
  const [keyboardListenersReady, setKeyboardListenersReady] =
    useState(Platform.OS !== 'ios');
  const lastKeyboardTopY = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (Platform.OS !== 'ios') return;
    const update = (screenY: number | null, event?: KeyboardEvent) => {
      if (lastKeyboardTopY.current === screenY) return;
      lastKeyboardTopY.current = screenY;
      if (event) Keyboard.scheduleLayoutAnimation(event);
      setKeyboardTopY(screenY);
      measureRootBottom();
    };

    const willShow = Keyboard.addListener('keyboardWillShow', event => {
      update(event.endCoordinates.screenY, event);
    });
    const willChange = Keyboard.addListener('keyboardWillChangeFrame', event => {
      update(event.endCoordinates.screenY, event);
    });
    const didShow = Keyboard.addListener('keyboardDidShow', event => {
      update(event.endCoordinates.screenY);
    });
    const willHide = Keyboard.addListener('keyboardWillHide', event => {
      update(null, event);
    });
    const didHide = Keyboard.addListener('keyboardDidHide', () => update(null));

    // Defer autofocus until listeners are installed. Reconcile keyboards that
    // were already visible on return to this route.
    const readyFrame = requestAnimationFrame(() => {
      measureRootBottom();
      const currentMetrics = Keyboard.metrics();
      if (currentMetrics) update(currentMetrics.screenY);
      setKeyboardListenersReady(true);
    });
    return () => {
      cancelAnimationFrame(readyFrame);
      willShow.remove(); willChange.remove(); didShow.remove();
      willHide.remove(); didHide.remove();
    };
  }, [measureRootBottom]);

  // An iOS keyboard can resize the native-stack route before JS is notified.
  // Compare keyboard screenY with the route's ACTUAL bottom. If the route has
  // already shrunk to the keyboard edge, overlap is zero (no double-lifting).
  const keyboardClearance = keyboardTopY === null || rootBottomY === null
    ? insets.bottom : keyboardOverlap(rootBottomY, keyboardTopY);
  const rawAvailableHeight = authAvailableHeight(
    rootHeight, headerHeight, footerHeight, keyboardClearance,
    spacing.lg, spacing.sm);
  const compactForm = rawAvailableHeight !== null
    && rawAvailableHeight < authPreviewLayout.compactAvailableHeight;
  const formTopPadding = compactForm ? spacing.sm : spacing.xl;
  const availableHeight = authAvailableHeight(
    rootHeight, headerHeight, footerHeight, keyboardClearance,
    spacing.lg, formTopPadding);
  // Only when the keyboard consumes even the active field's minimum height,
  // the existing shared TopBar offers a way to dismiss it and reveal the
  // full form/CTA without violating the owner's no-scroll layout requirement.
  const showKeyboardEscape = needsKeyboardDismiss(
    availableHeight, fontScale, keyboardVisible);

  return <View ref={rootRef} onLayout={onRootLayout}
    style={{ flex: 1, backgroundColor: colors.background }}>
    {/* Shared TopBar owns the exact same 54pt, plain icon-only auth header.
        Keyboard inset calculation and CTA placement remain untouched. */}
    <View onLayout={event => {
      const height = event.nativeEvent.layout.height;
      setHeaderHeight(previous => previous === height ? previous : height);
    }}>
      <TopBar variant="auth" onBack={onBack} safeAreaTop={insets.top}
        actionLabel={showKeyboardEscape ? copy('hideKeyboard') : headerActionLabel}
        onAction={showKeyboardEscape ? Keyboard.dismiss : onHeaderAction} />
    </View>

    {/* Only the stage-specific content updates. No scroll is introduced. */}
    <View style={{
      flex: 1, minHeight: 0, paddingHorizontal: spacing.lg,
      paddingTop: formTopPadding,
    }}>
      <AuthAvailableHeightContext.Provider value={availableHeight}>
        {keyboardListenersReady ? children : null}
      </AuthAvailableHeightContext.Provider>
    </View>

    {/* Shared footer for Sign in, Sign up and password recovery. It stays
        anchored to the visible route rather than the physical device screen. */}
    <View onLayout={event => {
      const height = event.nativeEvent.layout.height;
      setFooterHeight(previous => previous === height ? previous : height);
    }} style={{
      position: 'absolute', left: spacing.lg, right: spacing.lg,
      bottom: keyboardClearance + spacing.lg, gap: spacing.sm,
    }}>
      {footerNotice ? <Text style={[typography.caption, {
        color: colors.muted, textAlign: 'center',
      }]}>{footerNotice}</Text> : null}
      <Button size="onboarding" label={footerLabel} onPress={onFooterPress}
        disabledTone="soft" disabled={footerDisabled}
        disabledAppearance={footerKeepAppearance ? 'enabled' : 'muted'}
      />
    </View>
  </View>;
}
