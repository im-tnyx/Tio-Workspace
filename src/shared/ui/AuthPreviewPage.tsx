import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Dimensions, Keyboard, Platform, Text, View, useWindowDimensions } from 'react-native';
import type { KeyboardEvent, LayoutChangeEvent, ViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppearance } from '@/shared/theme/AppearanceProvider';
import { authPreviewLayout, spacing, typography } from '@/shared/theme/tokens';
import { Button } from './Button';
import { TopBar } from './TopBar';
import { androidKeyboardClearance, keyboardOverlap } from './authKeyboardGeometry';
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
  // A single measured keyboard-top position owns footer clearance on BOTH
  // platforms. Expo edge-to-edge Android may not shrink its route for IME.
  const rootRef = useRef<ViewInstance>(null);
  const [rootBottomY, setRootBottomY] = useState<number | null>(null);
  const [rootHeight, setRootHeight] = useState<number | null>(null);
  // Capture the largest route height seen before/after keyboard resize.
  // A native adjustResize route is already shorter; do not lift it twice.
  const [unobstructedRootHeight, setUnobstructedRootHeight] =
    useState<number | null>(null);
  const [headerHeight, setHeaderHeight] = useState<number | null>(null);
  const [footerHeight, setFooterHeight] = useState<number | null>(null);
  const [keyboardTopY, setKeyboardTopY] = useState<number | null>(null);
  const [androidKeyboardHeight, setAndroidKeyboardHeight] = useState(0);

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
    setUnobstructedRootHeight(previous =>
      previous === null ? height : Math.max(previous, height));
    measureRootBottom();
  }, [measureRootBottom]);

  // Always subscribe before native autoFocus on both iOS and Android.
  const [keyboardListenersReady, setKeyboardListenersReady] = useState(false);
  const lastKeyboardTopY = useRef<number | null>(null);

  useLayoutEffect(() => {
    const updateKeyboardFrame = (screenY: number | null, event?: KeyboardEvent) => {
      if (lastKeyboardTopY.current === screenY) return;
      lastKeyboardTopY.current = screenY;
      // Pre-animation layout synchronization is provided by iOS Will events.
      // Android's only available events are DidShow/DidHide.
      if (Platform.OS === 'ios' && event) Keyboard.scheduleLayoutAnimation(event);
      setKeyboardTopY(screenY);
      measureRootBottom();
    };

    // Android's initial keyboard event may fire on native mount. Subscribe
    // before the auto-focused children are rendered, never in a passive effect.
    const didShow = Keyboard.addListener('keyboardDidShow', event => {
      setKeyboardVisible(true);
      // Android screenY and measureInWindow can have different system-bar
      // origins. Keep the native reported keyboard HEIGHT as well, so a
      // missing status-bar offset cannot leave the CTA behind Gboard.
      if (Platform.OS === 'android')
        setAndroidKeyboardHeight(event.endCoordinates.height);
      updateKeyboardFrame(event.endCoordinates.screenY);
    });
    const didHide = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false);
      if (Platform.OS === 'android') setAndroidKeyboardHeight(0);
      updateKeyboardFrame(null);
    });
    // Only iOS supports pre-animation keyboard frame notifications.
    const willShow = Platform.OS === 'ios'
      ? Keyboard.addListener('keyboardWillShow', event => {
        updateKeyboardFrame(event.endCoordinates.screenY, event);
      }) : null;
    const willChange = Platform.OS === 'ios'
      ? Keyboard.addListener('keyboardWillChangeFrame', event => {
        updateKeyboardFrame(event.endCoordinates.screenY, event);
      }) : null;
    const willHide = Platform.OS === 'ios'
      ? Keyboard.addListener('keyboardWillHide', event => {
        updateKeyboardFrame(null, event);
      }) : null;

    // Reconcile a pre-existing keyboard, then permit initial TextInput mount.
    const readyFrame = requestAnimationFrame(() => {
      measureRootBottom();
      setKeyboardVisible(Keyboard.isVisible());
      // Reconcile an already-open keyboard on BOTH platforms, not just iOS.
      // This also recovers a missed Android DidShow event on navigation return.
      const currentMetrics = Keyboard.metrics();
      if (currentMetrics) {
        if (Platform.OS === 'android')
          setAndroidKeyboardHeight(currentMetrics.height);
        updateKeyboardFrame(currentMetrics.screenY);
      }
      setKeyboardListenersReady(true);
    });
    return () => {
      cancelAnimationFrame(readyFrame);
      didShow.remove(); didHide.remove();
      willShow?.remove(); willChange?.remove(); willHide?.remove();
    };
  }, [measureRootBottom]);

  // iOS uses the already-tested same-window measurement. On Android,
  // measureInWindow may omit the top system bar while keyboard.screenY uses
  // physical screen coordinates. Use the larger of the old overlap and the
  // independent keyboard-height estimate, subtracting any observed native
  // route resize. The footer clears the ENTIRE IME including Gboard toolbar.
  const keyboardClearance = keyboardTopY === null || rootBottomY === null
    ? insets.bottom : Platform.OS === 'android'
      ? Math.max(keyboardOverlap(rootBottomY, keyboardTopY),
        androidKeyboardClearance({
          screenHeight: Dimensions.get('screen').height,
          keyboardTopY, keyboardHeight: androidKeyboardHeight,
          rootRestHeight: unobstructedRootHeight,
          rootCurrentHeight: rootHeight,
          bottomInset: insets.bottom,
        }))
      : keyboardOverlap(rootBottomY, keyboardTopY);
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
