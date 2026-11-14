import { useEffect, useState } from 'react';
import { AccessibilityInfo, Text, View } from 'react-native';
import type { TextStyle } from 'react-native';
import { BRAND_TYPING_INTERVAL_MS, visibleTypingText } from './typing';

type Props = { title: string; textStyle: TextStyle };

export function TypewriterHeading({ title, textStyle }: Props) {
  // Wait for the platform setting before starting motion. Reduced-motion users
  // see the full brand immediately, and screen readers always hear full TNYX.
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(value => { if (mounted) setReduceMotion(value); })
      .catch(() => { if (mounted) setReduceMotion(true); });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { mounted = false; sub.remove(); };
  }, []);

  useEffect(() => {
    if (reduceMotion !== false || count >= title.length) return;
    const timer = setTimeout(() => setCount(value => Math.min(title.length, value + 1)),
      BRAND_TYPING_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [reduceMotion, count, title]);

  const shown = reduceMotion === true ? title.length : count;
  const finished = shown >= title.length;
  return <View accessible accessibilityRole="header" accessibilityLabel={title}
    style={{ alignItems: 'center', justifyContent: 'center' }}>
    {/* Reserve the final text's size so letters do not shift surrounding layout. */}
    <Text accessible={false} importantForAccessibility="no"
      style={[textStyle, { opacity: 0 }]}>{title}</Text>
    <Text accessible={false} importantForAccessibility="no"
      style={[textStyle, { position: 'absolute', left: 0, right: 0, textAlign: 'center' }]}>
      {visibleTypingText(title, shown)}{!finished && reduceMotion !== true ? '▍' : ''}
    </Text>
  </View>;
}
