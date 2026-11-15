import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Keyboard, Platform, Pressable, Text, View } from 'react-native';
import type { KeyboardEvent, ViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppearance } from '@/shared/theme/AppearanceProvider';
import { spacing, typography } from '@/shared/theme/tokens';
import { Button } from './Button';
import { copy } from '@/shared/i18n/en';
import { keyboardOverlap } from './authKeyboardGeometry';

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
  const rootRef = useRef<ViewInstance>(null);
  const [rootBottomY, setRootBottomY] = useState<number | null>(null);
  const [keyboardTopY, setKeyboardTopY] = useState<number | null>(null);

  const measureRootBottom = useCallback(() => {
    rootRef.current?.measureInWindow((_x, y, _width, height) => {
      if (height <= 0) return;
      const bottom = y + height;
      setRootBottomY(previous => previous === bottom ? previous : bottom);
    });
  }, []);

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

  return <View ref={rootRef} onLayout={measureRootBottom}
    style={{ flex: 1, backgroundColor: colors.background }}>
    <View style={{
      paddingTop: insets.top + spacing.sm,
      paddingHorizontal: spacing.lg,
      minHeight: insets.top + spacing.sm + 54,
      justifyContent: 'flex-end',
    }}>
      <View style={{ minHeight: 54, flexDirection: 'row',
        alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable onPress={onBack} accessibilityRole="button"
          accessibilityLabel={copy('back')}
          style={({ pressed }) => ({
            minWidth: 48, minHeight: 48, alignSelf: 'flex-start',
            justifyContent: 'center', opacity: pressed ? 0.65 : 1,
          })}>
          <Text accessibilityElementsHidden style={{
            color: colors.text, fontSize: 32, lineHeight: 38,
          }}>{'←'}</Text>
        </Pressable>
        {headerActionLabel && onHeaderAction ? <Pressable
          onPress={onHeaderAction} accessibilityRole="button"
          accessibilityLabel={headerActionLabel}
          style={({ pressed }) => ({
            minHeight: 48, justifyContent: 'center',
            opacity: pressed ? 0.65 : 1,
          })}>
          <Text style={{ color: colors.text, fontSize: 16,
            fontWeight: '600' }}>{headerActionLabel}</Text>
        </Pressable> : null}
      </View>
    </View>

    {/* Only the stage-specific content updates. No scroll is introduced. */}
    <View style={{
      flex: 1, minHeight: 0, paddingHorizontal: spacing.lg,
      paddingTop: spacing.xl,
    }}>
      {keyboardListenersReady ? children : null}
    </View>

    {/* Shared footer for Sign in, Sign up and password recovery. It stays
        anchored to the visible route rather than the physical device screen. */}
    <View style={{
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
