export type ColorMode = 'light' | 'dark';
export type ColorTokens = {
  background: string; card: string; text: string; muted: string;
  border: string; primary: string; onPrimary: string; secondary: string;
  onSecondary: string; glassTint: string; focus: string;
};
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radii = { sm: 10, md: 16, lg: 22, pill: 999 } as const;

// Shared navigation chrome geometry (iOS pt / Android dp). Header min-height
// excludes the OS status-bar inset; both are deliberately theme-independent.
// Keep existing visual values while allowing all variants to change together.
export const topBarSizes = {
  minHeight: 54,
  backTouchTarget: 48,
  authBackIconFontSize: 32,
  authBackIconLineHeight: 38,
  authActionFontSize: 16,
  authActionFontWeight: '600' as const,
  authPressedOpacity: 0.65,
} as const;

/** Auth previews use deliberately low-emphasis empty-field and disabled CTA colors.
 * Keep these scoped: global button colors and Welcome CTA remain unchanged. */
export const authPreviewMuted: Record<ColorMode, {
  disabledBackground: string; disabledText: string; placeholder: string;
}> = {
  dark: { disabledBackground: '#282828', disabledText: '#858585', placeholder: '#707070' },
  light: { disabledBackground: '#E8E8E8', disabledText: '#868686', placeholder: '#929292' },
};

// Global button geometry. Keep visible size compact; enlarge the tappable
// area invisibly on Android (>= 48dp) and let large text expand the height.
export const controlSizes = {
  buttonMinHeight: 42,
  onboardingButtonMinHeight: 46,
  buttonRadius: radii.pill,
  buttonHitSlopVertical: 3,
} as const;

// Accessible password visibility control; also used on the borderless auth field.
// Keep icon geometry here rather than introducing raw sizes in reusable UI.
export const passwordEye = {
  touchTarget: 48,
  outlineWidth: 23,
  outlineHeight: 14,
  outlineStroke: 2,
  pupilSize: 7,
  slashLength: 27,
  slashThickness: 2,
} as const;

// Sign-in titles fit on one line and share the same fixed line slot.
// Avoid blank two-line title space pushing Email far below the heading.
export const authPreviewLayout = {
  signInTitleMinHeight: 46,
  signInTitleMinHeightCompact: 39,
  authMiddleMinHeight: 0,
  // Measured space left between header and keyboard-anchored footer.
  // Preserve the standard form until these responsive budget thresholds.
  compactAvailableHeight: 196,
  tightAvailableHeight: 112,
  // Same existing bare TextInput minimum. Emergency accessibility gate
  // estimates additional font growth without shrinking the input itself.
  activeInputMinHeight: 60,
} as const;
export const typography = {
  title: { fontSize: 34, lineHeight: 41, fontWeight: '700' as const },
  heading: { fontSize: 20, lineHeight: 27, fontWeight: '600' as const },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' as const },
  caption: { fontSize: 13, lineHeight: 19, fontWeight: '500' as const },
};
export const chromeMotion = { showThreshold: 96, hideThreshold: 40, durationMs: 180 } as const;
// Welcome's brand typing speed is owned by shared/ui/typing.ts (one-shot only).
export const palettes: Record<ColorMode, ColorTokens> = {
  light: {
    background: '#FFFFFF', card: '#F5F5F5', text: '#111111',
    muted: '#595959', border: '#E6E6E6', primary: '#111111',
    onPrimary: '#FFFFFF', secondary: '#EFEFEF', onSecondary: '#111111',
    glassTint: 'rgba(255,255,255,0.86)', focus: '#111111',
  },
  dark: {
    background: '#0B0D10', card: '#1B1D20', text: '#F7F7F7',
    muted: '#B2B2B2', border: '#34363B', primary: '#FFFFFF',
    onPrimary: '#111111', secondary: '#292B30', onSecondary: '#FFFFFF',
    glassTint: 'rgba(14,16,18,0.88)', focus: '#FFFFFF',
  },
};
