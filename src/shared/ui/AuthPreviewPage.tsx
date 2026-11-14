import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppearance } from '@/shared/theme/AppearanceProvider';
import { authPreviewLayout, spacing, typography } from '@/shared/theme/tokens';
import { Button } from './Button';
import { copy } from '@/shared/i18n/en';

// The header is OUTSIDE KeyboardAvoidingView and never changes its top inset.
// Only the form below it resizes when the keyboard is visible. No ScrollView.
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
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const keyboardVisibleRef = useRef(false);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    // Unlike keyboardDidShow, these fire BEFORE movement; animate our safe-area
    // padding together with the system keyboard and KeyboardAvoidingView.
    const show = Keyboard.addListener('keyboardWillShow', event => {
      // Email -> Password can change the keyboard layout without closing it.
      // Avoid scheduling a second JS animation for an already visible keyboard.
      if (keyboardVisibleRef.current) return;
      keyboardVisibleRef.current = true;
      Keyboard.scheduleLayoutAnimation(event);
      setKeyboardVisible(true);
    });
    const hide = Keyboard.addListener('keyboardWillHide', event => {
      if (!keyboardVisibleRef.current) return;
      keyboardVisibleRef.current = false;
      Keyboard.scheduleLayoutAnimation(event);
      setKeyboardVisible(false);
    });
    return () => { show.remove(); hide.remove(); };
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
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{
        flex: 1, minHeight: 0, paddingHorizontal: spacing.lg,
        paddingTop: spacing.xl,
        // Keep an equal 16pt logical gutter at the sides and bottom.
        // When the keyboard hides, allow for the system safe-area *in addition*
        // to that gutter; when it opens, the keyboard covers the home indicator.
        // iOS updates alongside keyboardWillShow/WillHide, not after animation.
        paddingBottom: keyboardVisible ? spacing.lg : insets.bottom + spacing.lg,
      }}>
        {/* Only this middle content updates between Email, OTP and Password. */}
        <View style={{ flex: 1, minHeight: authPreviewLayout.authMiddleMinHeight }}>
          {children}
        </View>
        {/* Persistent footer: stable temporary notice ABOVE the same CTA. */}
        <View style={{ gap: spacing.md, paddingTop: spacing.sm }}>
          {/* Three-line minimum slot keeps different preview messages from
              shifting the CTA as the Email and Password stages change. */}
          {footerNotice ? <Text style={[typography.caption, {
            color: colors.muted, textAlign: 'center',
            minHeight: authPreviewLayout.footerNoticeMinHeight,
          }]}>{footerNotice}</Text> : null}
          {/* Button is last: bottom and side gutters are both 16pt against
              the visible keyboard; hidden keyboard adds the safe-area inset. */}
          <Button size="onboarding"
            label={footerLabel} onPress={onFooterPress}
            disabledTone="soft" disabled={footerDisabled}
            disabledAppearance={footerKeepAppearance ? 'enabled' : 'muted'}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  </View>;
}
