import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Text, View, useWindowDimensions } from 'react-native';
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
  // iOS retains its measured keyboard-frame positioning. Android uses a
  // platform KeyboardAvoidingView (padding): Expo edge-to-edge windows do
  // not resize automatically and JS screen/window geometry was unreliable.
  const rootRef = useRef<ViewInstance>(null);
  const [rootBottomY, setRootBottomY] = useState<number | null>(null);
  const [rootHeight, setRootHeight] = useState<number | null>(null);
  const [headerHeight, setHeaderHeight] = useState<number | null>(null);
  const [footerHeight, setFooterHeight] = useState<number | null>(null);
  // Keep a separate baseline measurement of the FULL footer warning. Once
  // its visual copy is abbreviated, the smaller current footer must not
  // flip the adaptive decision back and cause a render-measure loop.
  const [fullFooterHeight, setFullFooterHeight] = useState<number | null>(null);
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

    // Keep Android visibility for the emergency Hide keyboard action.
    // Only iOS updates JS keyboard frame geometry; Android's KAV owns its
    // entire keyboard-to-footer movement, avoiding competing position offsets.
    const didShow = Keyboard.addListener('keyboardDidShow', event => {
      setKeyboardVisible(true);
      if (Platform.OS === 'ios') updateKeyboardFrame(event.endCoordinates.screenY);
    });
    const didHide = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false);
      if (Platform.OS === 'ios') updateKeyboardFrame(null);
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
      // Only iOS uses measured frame positioning. Android's KAV manages
      // keyboard padding, and Keyboard.isVisible() drives its escape action.
      if (Platform.OS === 'ios') {
        const currentMetrics = Keyboard.metrics();
        if (currentMetrics) updateKeyboardFrame(currentMetrics.screenY);
      }
      setKeyboardListenersReady(true);
    });
    return () => {
      cancelAnimationFrame(readyFrame);
      didShow.remove(); didHide.remove();
      willShow?.remove(); willChange?.remove(); willHide?.remove();
    };
  }, [measureRootBottom]);

  // iOS keeps the existing measured-frame clearance. Android KAV already
  // clears the opened IME: never add the Android navigation-bar safe inset
  // ON TOP of that clearance. At rest, retain the system bar protection.
  const keyboardClearance = Platform.OS === 'ios'
    ? keyboardTopY !== null && rootBottomY !== null
      ? keyboardOverlap(rootBottomY, keyboardTopY) : insets.bottom
    : keyboardVisible ? 0 : insets.bottom;
  const rawAvailableHeight = authAvailableHeight(
    rootHeight, headerHeight, footerHeight, keyboardClearance,
    spacing.lg, spacing.sm);
  const compactForm = rawAvailableHeight !== null
    && rawAvailableHeight < authPreviewLayout.compactAvailableHeight;
  const formTopPadding = compactForm ? spacing.sm : spacing.xl;
  const availableHeight = authAvailableHeight(
    rootHeight, headerHeight, footerHeight, keyboardClearance,
    spacing.lg, formTopPadding);
  // Derive the keyboard-open squeeze decision from the *full notice*
  // baseline rather than the shorter displayed footer. This avoids an
  // expand/collapse loop without synchronously setting state in an effect.
  const fullNoticeAvailableHeight = authAvailableHeight(
    rootHeight, headerHeight, fullFooterHeight, keyboardClearance,
    spacing.lg, formTopPadding);
  const smallKeyboardNotice = needsKeyboardDismiss(
    fullNoticeAvailableHeight, fontScale, keyboardVisible);
  const showKeyboardEscape = smallKeyboardNotice || needsKeyboardDismiss(
    availableHeight, fontScale, keyboardVisible);
  // Do not re-expand headings when abbreviated copy frees footer space.
  const formContentBudget = smallKeyboardNotice
    ? fullNoticeAvailableHeight : availableHeight;

  const root = <View ref={rootRef} onLayout={onRootLayout}
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

    {/* The footer is absolute. Reserve its measured footprint *inside* the
        flex form when the keyboard is open; otherwise a large TextInput can
        paint on top of the warning despite the compact density mode. */}
    <View style={{
      flex: 1, minHeight: 0, paddingHorizontal: spacing.lg,
      paddingTop: formTopPadding,
      paddingBottom: keyboardVisible && footerHeight !== null
        ? footerHeight + keyboardClearance + spacing.lg : undefined,
      overflow: keyboardVisible ? 'hidden' : 'visible',
    }}>
      <AuthAvailableHeightContext.Provider value={formContentBudget}>
        {keyboardListenersReady ? children : null}
      </AuthAvailableHeightContext.Provider>
    </View>

    {/* Shared footer for Sign in, Sign up and password recovery. It stays
        anchored to the visible route rather than the physical device screen. */}
    <View onLayout={event => {
      const height = event.nativeEvent.layout.height;
      setFooterHeight(previous => previous === height ? previous : height);
      if (!smallKeyboardNotice)
        setFullFooterHeight(previous => previous === height ? previous : height);
    }} style={{
      position: 'absolute', left: spacing.lg, right: spacing.lg,
      bottom: keyboardClearance + spacing.lg, gap: spacing.sm,
    }}>
      {footerNotice ? <Text
        accessibilityLabel={footerNotice}
        numberOfLines={smallKeyboardNotice ? 1 : undefined}
        style={[typography.caption, {
          color: colors.muted, textAlign: 'center',
        }]}>{smallKeyboardNotice ? copy('authPreviewCompactNotice') : footerNotice}</Text> : null}
      <Button size="onboarding" label={footerLabel} onPress={onFooterPress}
        disabledTone="soft" disabled={footerDisabled}
        disabledAppearance={footerKeepAppearance ? 'enabled' : 'muted'}
      />
    </View>
  </View>;

  // Android KAV wraps the full auth route, not a child below a native
  // navigation header. Its correct vertical offset is the RN default 0.
  // A negative safe-area offset lifted less and caused the whole Continue
  // button to disappear beneath Gboard in owner-confirmed device screenshots.
  // The footer handles the bottom system inset ONLY when keyboard is hidden.
  // iOS retains its separate, already-working frame-based layout.
  return Platform.OS === 'android'
    ? <KeyboardAvoidingView behavior="padding"
        style={{ flex: 1 }}>{root}</KeyboardAvoidingView>
    : root;
}
