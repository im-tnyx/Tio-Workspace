export type ColorMode = 'light' | 'dark';
export type ColorTokens = {
  background: string; card: string; text: string; muted: string;
  border: string; primary: string; onPrimary: string; secondary: string;
  onSecondary: string; glassTint: string; focus: string;
};
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radii = { sm: 10, md: 16, lg: 22, pill: 999 } as const;
// Global button geometry. Keep visible size compact; enlarge the tappable
// area invisibly on Android (>= 48dp) and let large text expand the height.
export const controlSizes = {
  buttonMinHeight: 42,
  buttonRadius: radii.pill,
  buttonHitSlopVertical: 3,
} as const;
export const typography = {
  title: { fontSize: 34, lineHeight: 41, fontWeight: '700' as const },
  heading: { fontSize: 20, lineHeight: 27, fontWeight: '600' as const },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' as const },
  caption: { fontSize: 13, lineHeight: 19, fontWeight: '500' as const },
};
export const chromeMotion = { showThreshold: 96, hideThreshold: 40, durationMs: 180 } as const;
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
