import assert from 'node:assert/strict';
import test from 'node:test';
import { ROOT_TABS, tabGeometry, validateTabs } from '../src/app/navigation/tabRegistry.ts';
import { DEFAULT_PREFERENCES, decodePreferences, resolveMode } from '../src/shared/theme/preferences.ts';
import { copy, formatNumber } from '../src/shared/i18n/en.ts';
import { canOpenShellPreview } from '../src/app/navigation/shellPreviewAccess.ts';

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
  assert.equal(copy('signIn'), 'Sign in');
  assert.equal(copy('signUp'), 'Sign up');
});

test('unverified users cannot reach the mock shell in release builds', () => {
  assert.equal(canOpenShellPreview(false), false);
  assert.equal(canOpenShellPreview(true), true);
});
