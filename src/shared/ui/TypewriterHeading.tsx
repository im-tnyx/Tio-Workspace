import { useEffect, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { AccessibilityInfo, Text, View, useWindowDimensions } from 'react-native';
import type { TextStyle } from 'react-native';
import { spacing } from '@/shared/theme/tokens';
import {
  BRAND_DOT_DIAMETER, BRAND_DOT_GAP, BRAND_DOT_FINAL_HOLD_MS,
  BRAND_TYPING_INTERVAL_MS, visibleTypingText,
} from './typing';

type Props = { title: string; textStyle: TextStyle };

export function TypewriterHeading({ title, textStyle }: Props) {
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const [count, setCount] = useState(0);
  const [cursorSettled, setCursorSettled] = useState(false);
  const { width } = useWindowDimensions();

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(value => { if (active) setReduceMotion(value); })
      .catch(() => { if (active) setReduceMotion(true); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { active = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    if (reduceMotion !== false || count >= title.length) return;
    const timer = setTimeout(() => {
      setCount(value => Math.min(title.length, value + 1));
    }, BRAND_TYPING_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [reduceMotion, count, title]);

  useEffect(() => {
    // Haptics are best-effort and follow OS/device support. Reduced Motion
    // instantly reveals the label without ticks, and errors never block UI.
    if (reduceMotion !== false || count === 0) return;
    const feedback = count === title.length
      ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft)
      : Haptics.selectionAsync();
    void feedback.catch(() => {});
  }, [count, reduceMotion, title.length]);

  useEffect(() => {
    if (reduceMotion !== false || count < title.length) return;
    const timer = setTimeout(() => setCursorSettled(true), BRAND_DOT_FINAL_HOLD_MS);
    return () => clearTimeout(timer);
  }, [count, reduceMotion, title.length]);

  const shown = reduceMotion === true ? title.length : count;
  const showCursor = reduceMotion === false && !cursorSettled;
  // Keep decorative brand typography predictable even at large system text
  // sizes. The accessible container separately announces the complete title.
  const preferredSize = typeof textStyle.fontSize === 'number' ? textStyle.fontSize : 54;
  const available = Math.max(1, width - spacing.lg * 2 - BRAND_DOT_DIAMETER - BRAND_DOT_GAP);
  const fontSize = Math.min(preferredSize, Math.max(24, available / Math.max(1, title.length * 0.9)));
  const wordStyle: TextStyle = {
    ...textStyle, fontSize, lineHeight: Math.ceil(fontSize * 1.2),
    includeFontPadding: false,
  };

  return <View accessible accessibilityRole="header" accessibilityLabel={title}
    style={{ width: '100%', alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ maxWidth: '100%', flexDirection: 'row', alignItems: 'center' }}>
      {/* Full title and cursor width are reserved, so animation never reflows. */}
      <Text accessible={false} importantForAccessibility="no"
        allowFontScaling={false} numberOfLines={1}
        style={[wordStyle, { opacity: 0 }]}>{title}</Text>
      <View style={{ width: BRAND_DOT_DIAMETER + BRAND_DOT_GAP,
        height: BRAND_DOT_DIAMETER, opacity: 0 }} />
      <View pointerEvents="none" style={{
        position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
        flexDirection: 'row', alignItems: 'center',
      }}>
        <Text accessible={false} importantForAccessibility="no"
          allowFontScaling={false} numberOfLines={1}
          style={wordStyle}>{visibleTypingText(title, shown)}</Text>
        {showCursor ? <View style={{
          width: BRAND_DOT_DIAMETER, height: BRAND_DOT_DIAMETER,
          borderRadius: BRAND_DOT_DIAMETER / 2,
          marginLeft: BRAND_DOT_GAP,
          backgroundColor: textStyle.color ?? '#FFFFFF',
        }} /> : null}
      </View>
    </View>
  </View>;
}
