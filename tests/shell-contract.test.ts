import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ROOT_TABS, validateTabs } from '../src/bootstrap/shell/tabRegistry.ts';
import { tabGeometry } from '../src/shared/navigation/tabTypes.ts';
import { DEFAULT_PREFERENCES, decodePreferences, resolveMode } from '../src/shared/theme/preferences.ts';
import { copy, formatNumber } from '../src/shared/i18n/en.ts';
import { canOpenShellPreview } from '../src/bootstrap/shell/shellPreviewAccess.ts';
import { canContinueAuthPreview, nextAuthPreviewStep, previousAuthPreviewStep } from '../src/features/onboarding/authPreviewSteps.ts';
import { androidKeyboardClearance, keyboardOverlap } from '../src/shared/ui/authKeyboardGeometry.ts';
import { authAvailableHeight, authDensity, needsKeyboardDismiss } from '../src/shared/ui/authViewport.ts';
import { authPreviewLayout, authPreviewMuted, controlSizes, radii, spacing, topBarSizes } from '../src/shared/theme/tokens/index.ts';
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
  assert.equal(authPreviewLayout.authMiddleMinHeight, 0);
  assert.equal(controlSizes.buttonRadius, radii.pill);
  assert.equal(controlSizes.buttonHitSlopVertical, 3);
  assert.equal(spacing.lg, 16);
  assert.equal(spacing.xl, 24);
  assert.equal(radii.md, 16); // Other surfaces remain rounded.
});

test('all implemented navigation headers share token-driven TopBar variants', () => {
  const topBar = readFileSync('src/shared/ui/TopBar.tsx', 'utf8');
  const root = readFileSync('src/shared/ui/RootChrome.tsx', 'utf8');
  const nested = readFileSync('src/shared/ui/NestedPage.tsx', 'utf8');
  const auth = readFileSync('src/shared/ui/AuthPreviewPage.tsx', 'utf8');
  const tokens = readFileSync('src/shared/theme/tokens/index.ts', 'utf8');

  assert.equal(topBarSizes.minHeight, 54); // preserves existing 54pt header size
  assert.equal(topBarSizes.backTouchTarget, 48);
  assert.match(tokens, /export const topBarSizes/);
  assert.match(root, /<TopBar variant="root" title=\{title\}/);
  assert.match(nested, /<TopBar variant="nested" title=\{title\}/);
  assert.match(auth, /<TopBar variant="auth" onBack=\{onBack\}/);
  assert.match(auth, /safeAreaTop=\{insets\.top\}/);
  // The normal auth action remains available unless a very short keyboard-open
  // viewport needs the accessible Hide keyboard escape.
  assert.match(auth, /actionLabel=\{showKeyboardEscape \? copy\('hideKeyboard'\) : headerActionLabel\}/);
  assert.match(auth, /onAction=\{showKeyboardEscape \? Keyboard\.dismiss : onHeaderAction\}/);
  assert.match(topBar, /props\.variant === 'auth'/);
  assert.match(topBar, /minHeight: topBarSizes\.minHeight/);
  assert.match(topBar, /minHeight: props\.safeAreaTop \+ spacing\.sm \+ topBarSizes\.minHeight/);
  assert.match(topBar, /minWidth: topBarSizes\.backTouchTarget/);
  assert.match(topBar, /minHeight: topBarSizes\.backTouchTarget/);
  assert.match(topBar, /actionLabel\?: string/);
  assert.doesNotMatch(topBar, /minHeight:\s*54\b/);
  assert.doesNotMatch(auth, /minHeight:\s*(?:insets\.top\s*\+\s*)?54\b/);
  // Preserve plain icon-only auth header, but remove platform-dependent glyph.
  assert.match(topBar, /<BackArrowIcon color=\{colors\.text\} \/>/);
  assert.match(topBar, /function BackArrowIcon\(/);
  assert.doesNotMatch(topBar, /\{'←'\}/);
  assert.equal(topBarSizes.authBackIcon.size, 32);
  assert.equal(topBarSizes.authBackIcon.stroke, 2.5);
  assert.match(topBar, /width: icon\.size, height: icon\.size/);
  assert.match(topBar, /<SurfaceMaterial/);
  assert.match(auth, /keyboardOverlap\(rootBottomY, keyboardTopY\)/);
  assert.doesNotMatch(auth, /<ScrollView|KeyboardAvoidingView/);
  // Welcome and optional auth choice intentionally remain headerless.
  const welcome = readFileSync('src/features/onboarding/screens/WelcomeScreen.tsx', 'utf8');
  const choice = readFileSync('src/features/onboarding/screens/AuthChoiceScreen.tsx', 'utf8');
  assert.doesNotMatch(welcome, /TopBar/);
  assert.doesNotMatch(choice, /TopBar/);
});

test('post-Welcome auth uses persistent parent header and CTA, middle-only step content', () => {
  const page = readFileSync('src/shared/ui/AuthPreviewPage.tsx', 'utf8');
  const middle = readFileSync('src/features/onboarding/screens/AuthCredentialsScreen.tsx', 'utf8');
  const controller = readFileSync('src/features/onboarding/screens/AuthPreviewFlow.tsx', 'utf8');
  const welcome = readFileSync('src/features/onboarding/screens/WelcomeScreen.tsx', 'utf8');

  assert.doesNotMatch(page, /<KeyboardAvoidingView/);
  assert.match(page, /keyboardListenersReady \? children : null/);
  assert.match(page, /<Button size="onboarding"/);
  assert.match(page, /label=\{footerLabel\}/);
  assert.match(page, /\{footerNotice\}/);
  assert.doesNotMatch(page, /footerNoticeMinHeight/);
  // Temporary warning comes BEFORE the CTA so the bottom edge is 16pt away.
  assert.ok(page.indexOf('{footerNotice ? <Text') < page.indexOf('<Button size="onboarding"'));
  assert.doesNotMatch(page, /<ScrollView/);
  // Native keyboard listeners must exist before autoFocus mounts an input.
  assert.match(page, /useLayoutEffect\(\(\) =>/);
  assert.match(page, /Keyboard\.addListener\('keyboardWillShow'/);
  assert.match(page, /Keyboard\.addListener\('keyboardWillChangeFrame'/);
  assert.match(page, /Keyboard\.addListener\('keyboardDidShow'/);
  assert.match(page, /Keyboard\.addListener\('keyboardDidHide'/);
  assert.ok(page.indexOf("Keyboard.addListener('keyboardDidShow'") <
    page.indexOf('setKeyboardListenersReady(true)'));
  assert.match(page, /const currentMetrics = Keyboard\.metrics\(\)/);
  assert.match(page, /Keyboard\.scheduleLayoutAnimation\(event\)/);
  assert.match(page, /keyboardOverlap\(rootBottomY, keyboardTopY\)/);
  assert.match(page, /ref=\{rootRef\} onLayout=\{onRootLayout\}/);
  assert.match(page, /measureInWindow\(/);
  // Android alone may use physical screen height to correct the native
  // window-vs-screen keyboard coordinate origin; iOS retains root overlap.
  assert.match(page, /screenHeight: Dimensions\.get\('screen'\)\.height/);
  assert.match(page, /androidKeyboardClearance\(\{/);
  // The fixed footer never double-adds keyboard height if the native route
  // already ended at the keyboard's upper edge.
  assert.match(page, /position: 'absolute', left: spacing\.lg, right: spacing\.lg/);
  assert.match(page, /bottom: keyboardClearance \+ spacing\.lg/);
  assert.match(page, /gap: spacing\.sm/);
  assert.match(page, /paddingHorizontal: spacing\.lg/);
  // Removing temporary preview copy later must not remove CTA edge padding.
  assert.match(page, /footerNotice\?: string/);
  assert.match(page, /footerNotice \? <Text/);
  assert.doesNotMatch(middle, /<Button(?:\s|>)/);
  assert.doesNotMatch(middle, /\{footerNotice\}/);
  assert.match(controller, /footerDisabled=\{!canContinueAuthPreview/);
  assert.match(welcome, /actionPlacement="bottom"/);
});

test('Android edge-to-edge keyboard position lifts the auth footer without double offset', () => {
  const page = readFileSync('src/shared/ui/AuthPreviewPage.tsx', 'utf8');

  // A full-height edge-to-edge Android route extends UNDER the IME.
  assert.equal(keyboardOverlap(850, 555), 295);
  // The same route might instead have been resized by Android's window.
  assert.equal(keyboardOverlap(555, 555), 0);
  assert.equal(keyboardOverlap(690, 555), 135);
  // On Android DidShow now updates the actual footer position, not merely
  // the Hide keyboard visibility flag.
  assert.match(page, /const didShow = Keyboard\.addListener\('keyboardDidShow', event => \{\s*setKeyboardVisible\(true\);[\s\S]*?updateKeyboardFrame\(event\.endCoordinates\.screenY\);/);
  assert.match(page, /const didHide = Keyboard\.addListener\('keyboardDidHide', \(\) => \{\s*setKeyboardVisible\(false\);[\s\S]*?updateKeyboardFrame\(null\);/);
  assert.match(page, /const currentMetrics = Keyboard\.metrics\(\);\s*if \(currentMetrics\) \{[\s\S]*?updateKeyboardFrame\(currentMetrics\.screenY\);/);
  assert.match(page, /bottom: keyboardClearance \+ spacing\.lg/);
  assert.doesNotMatch(page, /if \(Platform\.OS === 'ios'\) updateKeyboardFrame/);
});

test('Android screenshot: keyboard CTA clearance uses native height and compensates window-origin mismatch', () => {
  const code = readFileSync('src/shared/ui/AuthPreviewPage.tsx', 'utf8');
  // Native window-origin mismatch: direct root-bottom vs screenY overlap
  // is too small. Keyboard depth corrects it without a magic 40dp margin.
  assert.equal(keyboardOverlap(794, 555), 239);
  assert.equal(androidKeyboardClearance({
    screenHeight: 850, keyboardTopY: 555, keyboardHeight: 271,
    rootRestHeight: 760, rootCurrentHeight: 760, bottomInset: 25,
  }), 270);
  // If Android already shrinks root by the full usable keyboard depth,
  // do not apply that inset a second time.
  assert.equal(androidKeyboardClearance({
    screenHeight: 850, keyboardTopY: 555, keyboardHeight: 271,
    rootRestHeight: 760, rootCurrentHeight: 490, bottomInset: 25,
  }), 0);
  // Partial resize, Gboard height change, hidden and invalid metrics.
  assert.equal(androidKeyboardClearance({
    screenHeight: 850, keyboardTopY: 555, keyboardHeight: 271,
    rootRestHeight: 760, rootCurrentHeight: 700, bottomInset: 25,
  }), 210);
  assert.equal(androidKeyboardClearance({
    screenHeight: 850, keyboardTopY: 850, keyboardHeight: 0,
    rootRestHeight: 760, rootCurrentHeight: 760, bottomInset: 25,
  }), 0);
  assert.equal(androidKeyboardClearance({
    screenHeight: 0, keyboardTopY: Number.NaN, keyboardHeight: 0,
    rootRestHeight: null, rootCurrentHeight: null, bottomInset: 25,
  }), 0);
  assert.match(code, /setAndroidKeyboardHeight\(event\.endCoordinates\.height\)/);
  assert.match(code, /setAndroidKeyboardHeight\(currentMetrics\.height\)/);
  assert.match(code, /unobstructedRootHeight/);
  assert.match(code, /androidKeyboardClearance\(\{/);
  assert.match(code, /Math\.max\(keyboardOverlap\(rootBottomY, keyboardTopY\)/);
  assert.match(code, /bottom: keyboardClearance \+ spacing\.lg/);
  assert.doesNotMatch(code, /<ScrollView|KeyboardAvoidingView/);
});

test('Android registers keyboard visibility listeners before initial autoFocus', () => {
  const page = readFileSync('src/shared/ui/AuthPreviewPage.tsx', 'utf8');
  assert.match(page, /const \[keyboardListenersReady, setKeyboardListenersReady\] = useState\(false\)/);
  assert.match(page, /setKeyboardVisible\(Keyboard\.isVisible\(\)\)/);
  assert.ok(page.indexOf("Keyboard.addListener('keyboardDidShow'") <
    page.indexOf('setKeyboardListenersReady(true)'));
  assert.ok(page.indexOf("Keyboard.addListener('keyboardDidHide'") <
    page.indexOf('setKeyboardListenersReady(true)'));
  assert.match(page, /keyboardListenersReady \? children : null/);
  assert.doesNotMatch(page, /useEffect\(\(\) => \{\s*const show = Keyboard/);
  assert.match(page, /Platform\.OS === 'ios'\s*\? Keyboard\.addListener\('keyboardWillShow'/);
});

test('auth form adapts to measured keyboard space without scrolling or clipping the CTA', () => {
  const page = readFileSync('src/shared/ui/AuthPreviewPage.tsx', 'utf8');
  const form = readFileSync('src/features/onboarding/screens/AuthCredentialsScreen.tsx', 'utf8');
  const helper = readFileSync('src/shared/ui/authViewport.ts', 'utf8');

  // Full-height viewport: normal title/description/input.
  assert.equal(authAvailableHeight(844, 114, 94, 0, 16, 24), 596);
  assert.equal(authDensity(596, 1), 'regular');
  // Small native keyboard-open viewport: keep CTA's measured height reserved.
  assert.equal(authAvailableHeight(568, 108, 94, 265, 16, 8), 77);
  assert.equal(authDensity(77, 1), 'tight');
  assert.equal(authDensity(160, 1), 'compact');
  assert.equal(authDensity(220, 1), 'regular');
  // Accessibility text scaling triggers compaction sooner.
  assert.equal(authDensity(215, 1.4), 'compact');
  assert.equal(authDensity(135, 1.4), 'tight');
  assert.equal(authDensity(null, 2), 'regular');
  // Emergency keyboard dismissal is offered only when the active input cannot
  // fit at its minimum usable height; regular layout and other header actions
  // remain unchanged when the keyboard is hidden or space is sufficient.
  assert.equal(authPreviewLayout.activeInputMinHeight, 60);
  assert.equal(needsKeyboardDismiss(45, 1, true), true);
  assert.equal(needsKeyboardDismiss(60, 1, true), false);
  assert.equal(needsKeyboardDismiss(75, 1.5, true), true);
  assert.equal(needsKeyboardDismiss(120, 1.5, true), false);
  assert.equal(needsKeyboardDismiss(0, 1, false), false);
  assert.equal(needsKeyboardDismiss(null, 2, true), false);
  assert.equal(needsKeyboardDismiss(80, Number.NaN, true), false);
  assert.equal(authAvailableHeight(null, 100, 90, 250, 16, 8), null);
  assert.equal(authAvailableHeight(180, 130, 90, 250, 16, 8), 0);
  assert.match(helper, /Math\.max\(0, rootHeight - headerHeight - footerHeight/);

  assert.match(page, /setHeaderHeight/);
  assert.match(page, /setFooterHeight/);
  assert.match(page, /AuthAvailableHeightContext\.Provider value=\{availableHeight\}/);
  assert.match(page, /paddingTop: formTopPadding/);
  assert.match(page, /Keyboard\.addListener\('keyboardDidShow'/);
  assert.match(page, /Keyboard\.addListener\('keyboardDidHide'/);
  assert.match(page, /needsKeyboardDismiss\(/);
  assert.match(page, /showKeyboardEscape \? copy\('hideKeyboard'\) : headerActionLabel/);
  assert.match(page, /showKeyboardEscape \? Keyboard\.dismiss : onHeaderAction/);
  assert.equal(copy('hideKeyboard'), 'Hide keyboard');
  const textField = readFileSync('src/shared/ui/TextField.tsx', 'utf8');
  assert.match(textField, /minHeight: authPreviewLayout\.activeInputMinHeight/);
  assert.match(form, /const density = authDensity\(availableHeight, fontScale\)/);
  assert.match(form, /!tight \? <View/);
  assert.match(form, /tight && step === 'password' \? \{ display: 'none' \}/);
  assert.match(form, /inputRef=\{signInEmailInput\}/);
  assert.doesNotMatch(page, /<ScrollView/);
  assert.doesNotMatch(form, /<ScrollView/);
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
  // One persistent safety notice prevents text-height reflow between steps.
  assert.match(flow, /footerNotice = copy\('authPreviewSafetyNotice'\)/);
  assert.match(copy('authPreviewSafetyNotice'), /No email or code is sent/);
  assert.match(copy('authPreviewSafetyNotice'), /Do not enter a real password/);
});

test('keyboard frame geometry handles visible and hidden iPhone keyboards', () => {
  assert.equal(keyboardOverlap(852, 540), 312);
  // Native stack may shrink the route to the keyboard top BEFORE the event.
  assert.equal(keyboardOverlap(540, 540), 0);
  // An intermediate native resize must subtract only its actual overlap.
  assert.equal(keyboardOverlap(680, 540), 140);
  assert.equal(keyboardOverlap(852, 852), 0);
  assert.equal(keyboardOverlap(852, 880), 0);
  assert.equal(keyboardOverlap(852, 0), 852);
  assert.equal(keyboardOverlap(852, -100), 852);
  assert.equal(keyboardOverlap(852, Number.NaN), 0);
  assert.equal(keyboardOverlap(0, 100), 0);
});

test('Password fields have a right-side accessible eye toggle only for secure input', () => {
  const field = readFileSync('src/shared/ui/TextField.tsx', 'utf8');
  const screen = readFileSync('src/features/onboarding/screens/AuthCredentialsScreen.tsx', 'utf8');
  assert.match(field, /secureTextEntry=\{secureTextEntry && !passwordVisible\}/);
  assert.match(field, /secureTextEntry \? <Pressable/);
  assert.match(field, /onPress=\{\(\) => setPasswordVisible\(current => !current\)\}/);
  assert.match(field, /accessibilityLabel=\{passwordVisible \? copy\('hidePassword'\) : copy\('showPassword'\)\}/);
  assert.match(field, /ref=\{inputRef\}/);
  assert.match(field, /passwordEye\.touchTarget/);
  assert.match(screen, /placeholder=\{copy\('passwordPlaceholder'\)\} secureTextEntry/);
  assert.match(screen, /secureTextEntry autoCapitalize="none"/);
  assert.equal(copy('showPassword'), 'Show password');
  assert.equal(copy('hidePassword'), 'Hide password');
});

test('Sign-in Password to Email restores focus on the mounted Email field', () => {
  const screen = readFileSync('src/features/onboarding/screens/AuthCredentialsScreen.tsx', 'utf8');
  const field = readFileSync('src/shared/ui/TextField.tsx', 'utf8');
  assert.match(screen, /prior === 'password' && step === 'email'/);
  assert.match(screen, /signInEmailInput\.current\?\.focus\(\)/);
  assert.match(screen, /inputRef=\{signInEmailInput\}/);
  assert.match(field, /ref=\{inputRef\}/);
});

test('Android system Back follows the same auth-step Back handler', () => {
  const flow = readFileSync('src/features/onboarding/screens/AuthPreviewFlow.tsx', 'utf8');
  assert.match(flow, /useFocusEffect\(useCallback/);
  assert.match(flow, /BackHandler\.addEventListener\('hardwareBackPress'/);
  assert.match(flow, /onBack\(\);\s*return true;/);
  assert.match(flow, /subscription\.remove\(\)/);
  assert.match(flow, /previousAuthPreviewStep\(step, mode\)/);
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
