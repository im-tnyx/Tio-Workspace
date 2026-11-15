import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Dimensions, Keyboard, Platform, Pressable, Text, View } from 'react-native';
import type { KeyboardEvent, KeyboardMetrics } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppearance } from '@/shared/theme/AppearanceProvider';
import { spacing, typography } from '@/shared/theme/tokens';
import { Button } from './Button';
import { copy } from '@/shared/i18n/en';
import { keyboardOverlap } from './authKeyboardGeometry';

// The header is fixed and the auth screen never scrolls. The footer is anchored
// independently of the changing form, and follows native keyboard-frame events.
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
  const [keyboardInset, setKeyboardInset] = useState(0);
  // iOS TextInput autoFocus runs on native mount, before a passive effect can
  // subscribe to the initial keyboard event. Mount inputs only AFTER listeners.
  const [keyboardListenersReady, setKeyboardListenersReady] =
    useState(Platform.OS !== 'ios');
  const lastKeyboardInset = useRef(0);

  useLayoutEffect(() => {
    if (Platform.OS !== 'ios') return;
    const insetFromFrame = (frame: KeyboardMetrics) => {
      const overlap = keyboardOverlap(
        Dimensions.get('screen').height, frame.screenY);
      return overlap > 0 ? Math.max(overlap, frame.height) : 0;
    };
    const update = (inset: number, event?: KeyboardEvent) => {
      if (lastKeyboardInset.current === inset) return;
      lastKeyboardInset.current = inset;
      if (event) Keyboard.scheduleLayoutAnimation(event);
      setKeyboardInset(inset);
    };

    // Will notifications animate the footer together with the system keyboard.
    // The DidShow callback is a recovery path if a Will event is not delivered.
    const willShow = Keyboard.addListener('keyboardWillShow', event => {
      update(insetFromFrame(event.endCoordinates), event);
    });
    const willChange = Keyboard.addListener('keyboardWillChangeFrame', event => {
      update(insetFromFrame(event.endCoordinates), event);
    });
    const didShow = Keyboard.addListener('keyboardDidShow', event => {
      update(insetFromFrame(event.endCoordinates));
    });
    const willHide = Keyboard.addListener('keyboardWillHide', event => {
      update(0, event);
    });
    const didHide = Keyboard.addListener('keyboardDidHide', () => update(0));

    // Covers an already-visible keyboard when returning to this route.
    const currentMetrics = Keyboard.metrics();
    if (currentMetrics) update(insetFromFrame(currentMetrics));
    // The next render mounts auto-focused TextFields only after subscriptions.
    setKeyboardListenersReady(true);
    return () => {
      willShow.remove(); willChange.remove(); didShow.remove();
      willHide.remove(); didHide.remove();
    };
  }, []);

  return <View style={{ flex: 1, backgroundColor: colors.background }}>
    <View style={{
      paddingTop: insets.top + spacing.sm,
      paddingHorizontal: spacing.lg,
      minHeight: insets.top + spacing.sm + 54,
      justifyContent: 'flex-end',
    }}>
      <View style={{ minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable onPress={onBack} accessibilityRole="button"
          accessibilityLabel={copy('back')}
          style={({ pressed }) => ({
            minWidth: 48, minHeight: 48, alignSelf: 'flex-start',
            justifyContent: 'center', opacity: pressed ? 0.65 : 1,
          })}>
          <Text accessibilityElementsHidden
            style={{ color: colors.text, fontSize: 32, lineHeight: 38 }}>{'←'}</Text>
        </Pressable>
        {headerActionLabel && onHeaderAction ? <Pressable
          onPress={onHeaderAction} accessibilityRole="button"
          accessibilityLabel={headerActionLabel}
          style={({ pressed }) => ({
            minHeight: 48, justifyContent: 'center',
            opacity: pressed ? 0.65 : 1,
          })}>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
            {headerActionLabel}
          </Text>
        </Pressable> : null}
      </View>
    </View>

    {/* Form content can change stages without unmounting the persistent footer.
        No ScrollView; input autoFocus cannot race the listener subscription. */}
    <View style={{
      flex: 1, minHeight: 0, paddingHorizontal: spacing.lg,
      paddingTop: spacing.xl,
    }}>
      {keyboardListenersReady ? children : null}
    </View>

    {/* Absolute footer is always anchored above the keyboard regardless of
        the size of Email/OTP/Password middle content. Same 16pt side/bottom
        gutters and 8pt temporary warning-to-button gap. */}
    <View style={{
      position: 'absolute', left: spacing.lg, right: spacing.lg,
      bottom: Math.max(keyboardInset, insets.bottom) + spacing.lg,
      gap: spacing.sm,
    }}>
      {footerNotice ? <Text style={[typography.caption, {
        color: colors.muted, textAlign: 'center',
      }]}>{footerNotice}</Text> : null}
      <Button size="onboarding"
        label={footerLabel} onPress={onFooterPress}
        disabledTone="soft" disabled={footerDisabled}
        disabledAppearance={footerKeepAppearance ? 'enabled' : 'muted'}
      />
    </View>
  </View>;
}
