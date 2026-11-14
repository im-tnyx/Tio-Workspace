import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
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
  // KeyboardAvoidingView owns iOS keyboard timing; avoid a second JS animation.
  // A constant outer safe-area inset keeps its measured frame stable.

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
    {/* iOS safe-area padding stays OUTSIDE KAV even when the keyboard opens. */}
    <View style={{ flex: 1, paddingBottom: Platform.OS === 'ios' ? insets.bottom : 0 }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{
        flex: 1, minHeight: 0, paddingHorizontal: spacing.lg,
        paddingTop: spacing.xl,
        // iOS: one constant 16pt bottom gutter; KAV handles IME position.
        // Android retains its prior safe-inset and system-resize behavior.
        paddingBottom: Platform.OS === 'ios' ? spacing.lg : insets.bottom + spacing.lg,
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
      </KeyboardAvoidingView>
    </View>
  </View>;
}
