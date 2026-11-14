import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ROOT_TABS, validateTabs } from '../src/bootstrap/shell/tabRegistry.ts';
import { tabGeometry } from '../src/shared/navigation/tabTypes.ts';
import { DEFAULT_PREFERENCES, decodePreferences, resolveMode } from '../src/shared/theme/preferences.ts';
import { copy, formatNumber } from '../src/shared/i18n/en.ts';
import { canOpenShellPreview } from '../src/bootstrap/shell/shellPreviewAccess.ts';
import { canContinueAuthPreview, nextAuthPreviewStep, previousAuthPreviewStep } from '../src/features/onboarding/authPreviewSteps.ts';
import { authPreviewLayout, authPreviewMuted, controlSizes, radii, spacing } from '../src/shared/theme/tokens/index.ts';
import { BRAND_TYPING_INTERVAL_MS, BRAND_DOT_DIAMETER, BRAND_DOT_GAP, BRAND_DOT_FINAL_HOLD_MS, visibleTypingText } from '../src/shared/ui/typing.ts';

test('initial root navigation has four stable, distinct routes', () => {
  assert.deepEqual(ROOT_TABS.map(item => item.routeName), ['home', 'workout', 'library', 'you']);
  assert.doesNotThrow(() => validateTabs(ROOT_TABS));
  assert.throws(() => validateTabs([]));
  assert.throws(() => validateTabs([ROOT_TABS[0], ROOT_TABS[0]]));
});

test('future 3/4/5+/narrow bar layouts stay reachable with 64dp minimum width', () => {
  assert.deepEqual(tabGeometry(3, 360), { itemWidth: 120, scrollable: false });
  assert.deepEqual(tabGeometry(4, 360), { itemWidth: 90, scrollable: false });
  assert.deepEqual(tabGeometry(5, 360), { itemWidth: 72, scrollable: false });
  assert.deepEqual(tabGeometry(6, 320), { itemWidth: 64, scrollable: true });
  assert.throws(() => tabGeometry(0, 320));
  assert.throws(() => tabGeometry(1.5, 320));
});

test('appearance defaults to System/Glass and follows device mode', () => {
  assert.deepEqual(DEFAULT_PREFERENCES, { appearance: 'system', material: 'glass' });
  assert.equal(resolveMode('system', 'dark'), 'dark');
  assert.equal(resolveMode('system', 'light'), 'light');
  assert.equal(resolveMode('dark', 'light'), 'dark');
  assert.equal(resolveMode('light', 'dark'), 'light');
});

test('tampered/legacy preferences safely fall back to System/Glass', () => {
  assert.deepEqual(decodePreferences(null), DEFAULT_PREFERENCES);
  assert.deepEqual(decodePreferences({ appearance: 'rainbow', material: 'neon' }), DEFAULT_PREFERENCES);
  assert.deepEqual(decodePreferences({ appearance: 'dark', material: 'solid' }),
    { appearance: 'dark', material: 'solid' });
});

test('English-only catalog exposes root titles without a language picker', () => {
  for (const key of ['home', 'workout', 'library', 'you'] as const) {
    assert.ok(copy(key).length > 0);
  }
  assert.equal(copy('app'), 'Tnyx');
  assert.equal(formatNumber(1234, 'en'), '1,234');
});

test('Welcome entry and auth choice labels are centrally defined', () => {
  assert.equal(copy('brandTitle'), 'TNYX');
  assert.equal(copy('getStarted'), 'GET STARTED');
  assert.equal(copy('alreadyHaveAccount'), 'Already have an account?');
  assert.equal(copy('logIn'), 'Log in');
  assert.equal(copy('signIn'), 'Sign in');
  assert.equal(copy('signUp'), 'Sign up');
  assert.equal(copy('createAccount'), 'Create account');
  assert.equal(copy('email'), 'Email');
  assert.equal(copy('password'), 'Password');
  assert.equal(copy('signInIntro'), 'Sign in with your email and password.');
  assert.equal(copy('signInEnterEmail'), 'Enter your email');
  assert.equal(copy('enterPassword'), 'Enter your password');
  assert.match(copy('signInPreviewNotice'), /not available yet/);
  assert.match(copy('signInPreviewNotice'), /real password/);
  assert.match(copy('signUpPreviewNotice'), /not available yet/);
  assert.match(copy('signUpPreviewNotice'), /real password/);
});

test('auth UI preview progresses email to code to password without backend', () => {
  assert.equal(nextAuthPreviewStep('email'), 'otp');
  assert.equal(nextAuthPreviewStep('otp'), 'password');
  assert.equal(previousAuthPreviewStep('password'), 'otp');
  assert.equal(previousAuthPreviewStep('otp'), 'email');
  assert.equal(canContinueAuthPreview('email', 'tom@example.com'), true);
  assert.equal(canContinueAuthPreview('email', 'invalid-email'), false);
  assert.equal(canContinueAuthPreview('otp', '123456'), true);
  assert.equal(canContinueAuthPreview('otp', '12345'), false);
  assert.equal(canContinueAuthPreview('otp', 'abcdef'), false);
  assert.equal(canContinueAuthPreview('password', ''), false);
  assert.equal(canContinueAuthPreview('password', 'preview-only'), true);
  assert.equal(copy('emailPlaceholder'), 'tom@example.com');
  assert.match(copy('emailStepIntro'), /send you a verification code/);
  assert.match(copy('emailStepIntro'), /authentication is available/);
  assert.match(copy('otpPreviewNotice'), /No code was sent or verified/);
  assert.match(copy('emailPreviewNotice'), /No email or code will be sent/);
});

test('sign-in skips OTP; recovery previews confirm email, OTP, then new password', () => {
  assert.equal(nextAuthPreviewStep('email', 'sign-in'), 'password');
  assert.equal(previousAuthPreviewStep('password', 'sign-in'), 'email');
  assert.equal(nextAuthPreviewStep('email', 'sign-up'), 'otp');
  assert.equal(previousAuthPreviewStep('password', 'sign-up'), 'otp');
  assert.equal(nextAuthPreviewStep('reset-email', 'sign-in'), 'reset-otp');
  assert.equal(nextAuthPreviewStep('reset-otp', 'sign-in'), 'new-password');
  assert.equal(previousAuthPreviewStep('new-password', 'sign-in'), 'reset-otp');
  assert.equal(previousAuthPreviewStep('reset-otp', 'sign-in'), 'reset-email');
  assert.equal(previousAuthPreviewStep('reset-email', 'sign-in'), 'password');
  assert.equal(canContinueAuthPreview('reset-email', 'tom@example.com'), true);
  assert.equal(canContinueAuthPreview('reset-email', 'not-an-email'), false);
  assert.equal(canContinueAuthPreview('reset-otp', '123456'), true);
  assert.equal(canContinueAuthPreview('reset-otp', '1234'), false);
  assert.equal(canContinueAuthPreview('new-password', ''), false);
  assert.equal(canContinueAuthPreview('new-password', 'demo-only'), true);
  assert.equal(copy('forgotPassword'), 'Forgot password');
  assert.equal(copy('confirmEmail'), 'Confirm your email address');
  assert.match(copy('resetOtpPreviewNotice'), /No reset code was sent or verified/);
  assert.match(copy('resetPasswordComingLater'), /No password has been changed/);
  assert.match(copy('newPasswordPreviewNotice'), /Do not enter a real password/);
});

test('unverified users cannot reach the mock shell in release builds', () => {
  assert.equal(canOpenShellPreview(false), false);
  assert.equal(canOpenShellPreview(true), true);
});

test('app-wide button size and welcome bottom spacing are shared tokens', () => {
  assert.equal(controlSizes.buttonMinHeight, 42);
  assert.equal(controlSizes.onboardingButtonMinHeight, 46);
  assert.equal(authPreviewLayout.signInTitleMinHeight, 46);
  assert.equal(authPreviewLayout.signInTitleMinHeightCompact, 39);
  assert.equal(authPreviewLayout.footerNoticeMinHeight, 57);
  assert.equal(authPreviewLayout.authMiddleMinHeight, 0);
  assert.equal(controlSizes.buttonRadius, radii.pill);
  assert.equal(controlSizes.buttonHitSlopVertical, 3);
  assert.equal(spacing.lg, 16);
  assert.equal(spacing.xl, 24);
  assert.equal(radii.md, 16); // Other surfaces remain rounded.
});

test('post-Welcome auth uses persistent parent header and CTA, middle-only step content', () => {
  const page = readFileSync('src/shared/ui/AuthPreviewPage.tsx', 'utf8');
  const middle = readFileSync('src/features/onboarding/screens/AuthCredentialsScreen.tsx', 'utf8');
  const controller = readFileSync('src/features/onboarding/screens/AuthPreviewFlow.tsx', 'utf8');
  const welcome = readFileSync('src/features/onboarding/screens/WelcomeScreen.tsx', 'utf8');

  assert.match(page, /<KeyboardAvoidingView/);
  assert.match(page, /\{children\}/);
  assert.match(page, /<Button size="onboarding"/);
  assert.match(page, /label=\{footerLabel\}/);
  assert.match(page, /\{footerNotice\}/);
  assert.match(page, /footerNoticeMinHeight/);
  // 16pt side and bottom gutter uses the same semantic spacing token.
  // The hidden-keyboard inset is extra system-safe-area clearance.
  assert.match(page, /paddingHorizontal: spacing\.lg/);
  assert.match(page, /paddingBottom: keyboardVisible \? spacing\.lg : insets\.bottom \+ spacing\.lg/);
  // Removing temporary preview copy later must not remove CTA edge padding.
  assert.match(page, /footerNotice\?: string/);
  assert.match(page, /footerNotice \? <Text/);
  assert.doesNotMatch(middle, /<Button(?:\s|>)/);
  assert.doesNotMatch(middle, /\{footerNotice\}/);
  assert.match(controller, /footerDisabled=\{!canContinueAuthPreview/);
  assert.match(welcome, /actionPlacement="bottom"/);
});

test('both Sign in and Sign up routes use the same persistent auth parent', () => {
  const signIn = readFileSync('src/app/auth/sign-in.tsx', 'utf8');
  const signUp = readFileSync('src/app/auth/sign-up.tsx', 'utf8');
  const flow = readFileSync('src/features/onboarding/screens/AuthPreviewFlow.tsx', 'utf8');
  const page = readFileSync('src/shared/ui/AuthPreviewPage.tsx', 'utf8');
  const middle = readFileSync('src/features/onboarding/screens/AuthCredentialsScreen.tsx', 'utf8');
  const button = readFileSync('src/shared/ui/Button.tsx', 'utf8');

  assert.match(signIn, /<AuthPreviewFlow mode="sign-in"/);
  assert.match(signUp, /<AuthPreviewFlow mode="sign-up"/);
  assert.match(flow, /return <AuthPreviewPage/);
  assert.match(flow, /<AuthCredentialsScreen/);
  // The parent renders ONE persistent CTA. Step labels and disabled state
  // update through props; no sign-in-specific footer is ever mounted.
  assert.equal((page.match(/<Button size="onboarding"/g) || []).length, 1);
  assert.doesNotMatch(flow, /<Button(?:\s|>)/);
  assert.doesNotMatch(middle, /<Button(?:\s|>)/);
  // After Email validates, the same CTA keeps its visible appearance on the
  // empty Password step, even though interaction remains disabled until typed.
  assert.match(flow, /footerKeepAppearance=\{mode === 'sign-in' && step === 'password'\}/);
  assert.match(page, /disabledAppearance=\{footerKeepAppearance \? 'enabled' : 'muted'\}/);
  assert.match(button, /const visuallyDisabled = disabled && disabledAppearance !== 'enabled';/);
  assert.match(button, /disabled=\{disabled\} accessibilityState=\{\{ disabled \}\}/);
  // Same preview notice at both Sign-in steps prevents CTA height reflow.
  assert.match(flow, /mode === 'sign-up' \? 'emailPreviewNotice' : 'signInPreviewNotice'/);
});

test('auth-only disabled button and bare placeholder use soft shades', () => {
  assert.deepEqual(authPreviewMuted.dark, {
    disabledBackground: '#282828', disabledText: '#858585', placeholder: '#707070',
  });
  assert.deepEqual(authPreviewMuted.light, {
    disabledBackground: '#E8E8E8', disabledText: '#868686', placeholder: '#929292',
  });
});

test('brand typewriter reveals TNYX once and clamps beyond final text', () => {
  assert.equal(BRAND_TYPING_INTERVAL_MS, 165);
  assert.equal(BRAND_DOT_DIAMETER, 20);
  assert.equal(BRAND_DOT_GAP, 7);
  assert.equal(BRAND_DOT_FINAL_HOLD_MS, 240);
  assert.equal(visibleTypingText('TNYX', 0), '');
  assert.equal(visibleTypingText('TNYX', 1), 'T');
  assert.equal(visibleTypingText('TNYX', 3), 'TNY');
  assert.equal(visibleTypingText('TNYX', 4), 'TNYX');
  assert.equal(visibleTypingText('TNYX', 50), 'TNYX');
  assert.equal(visibleTypingText('TNYX', -10), '');
});
