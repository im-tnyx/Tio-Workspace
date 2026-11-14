import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Dimensions, Keyboard, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppearance } from '@/shared/theme/AppearanceProvider';
import { authPreviewLayout, spacing, typography } from '@/shared/theme/tokens';
import { Button } from './Button';
import { copy } from '@/shared/i18n/en';
import { keyboardOverlap } from './authKeyboardGeometry';

// Fixed header and non-scrolling form. iOS CTA follows one native keyboard
// frame event source rather than two competing keyboard avoidance mechanisms.
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
  // One positioning owner: keyboard frame event supplies native animation
  // timing and the precise bottom inset. No separate avoidance wrapper.
  const [keyboardInset, setKeyboardInset] = useState(() =>
    Platform.OS === 'ios' ? Keyboard.metrics()?.height ?? 0 : 0);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const frame = Keyboard.addListener('keyboardWillChangeFrame', event => {
      Keyboard.scheduleLayoutAnimation(event);
      setKeyboardInset(keyboardOverlap(
        Dimensions.get('screen').height, event.endCoordinates.screenY));
    });
    // Only a fallback if the native WillChangeFrame event was missed.
    const hidden = Keyboard.addListener('keyboardDidHide', () => setKeyboardInset(0));
    return () => { frame.remove(); hidden.remove(); };
  }, []);

  return <View style={{ flex: 1, backgroundColor: colors.background }}>
    {/* Fixed back arrow: identical safe-area position before/after focus. */}
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
    <View style={{
      flex: 1, minHeight: 0, paddingHorizontal: spacing.lg,
      paddingTop: spacing.xl,
      // Keyboard overlap already includes the home-indicator region.
      // Preserve the same 16pt edge gutter on both sides and below the CTA.
      paddingBottom: (Platform.OS === 'ios'
        ? (keyboardInset > 0 ? keyboardInset : insets.bottom)
        : insets.bottom) + spacing.lg,
    }}>
        {/* Only this middle content updates between Email, OTP and Password. */}
        <View style={{ flex: 1, minHeight: authPreviewLayout.authMiddleMinHeight }}>
          {children}
        </View>
        {/* Persistent footer: stable temporary notice ABOVE the same CTA. */}
        <View style={{ gap: spacing.sm, paddingTop: spacing.sm }}>
          {/* One unchanged warning in every mock step; no blank height slot. */}
          {footerNotice ? <Text style={[typography.caption, {
            color: colors.muted, textAlign: 'center',
          }]}>{footerNotice}</Text> : null}
          {/* CTA stays last with the 16pt horizontal/bottom design gutter. */}
          <Button size="onboarding"
            label={footerLabel} onPress={onFooterPress}
            disabledTone="soft" disabled={footerDisabled}
            disabledAppearance={footerKeepAppearance ? 'enabled' : 'muted'}
          />
        </View>
    </View>
  </View>;
}
