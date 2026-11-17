import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyHookDenial, classifyHookPasswordLogin } from './hook-denial-assertion.mjs';

const userId = 'synthetic-user';
const denied = { status: 500, ok: false, value: { error_code: 'unexpected_failure' } };
const allowed = { status: 200, ok: true,
  value: { user: { id: userId }, access_token: 'synthetic' } };
const denialEvent = { kind: 'token', userId, method: 'otp', denied: true, status: 500 };
const passwordEvent = { kind: 'token', userId, method: 'password', denied: false, status: 200 };

test('expected OTP hook rejection and same-request denial pass', () => {
  assert.equal(classifyHookDenial(denied, [denialEvent], 0, userId, 'otp').result, 'PASS');
});

test('expected recovery hook rejection uses its own user event', () => {
  const recoveryUser = 'recovery-user';
  const event = { ...denialEvent, userId: recoveryUser };
  assert.equal(classifyHookDenial(denied, [event], 0, recoveryUser, 'otp').result, 'PASS');
  assert.notEqual(classifyHookDenial(denied, [denialEvent], 0, recoveryUser, 'otp').result, 'PASS');
});

test('expected OTP refresh hook rejection uses token_refresh event', () => {
  const event = { ...denialEvent, method: 'token_refresh' };
  assert.equal(classifyHookDenial(denied, [event], 0, userId, 'token_refresh').result, 'PASS');
});

test('HTTP 429 without hook invocation is inconclusive', () => {
  const throttled = { status: 429, ok: false, value: { error_code: 'over_request_rate_limit' } };
  assert.equal(classifyHookDenial(throttled, [], 0, userId, 'otp').result, 'INCONCLUSIVE');
  assert.equal(classifyHookDenial(throttled, [denialEvent], 0, userId, 'otp').result, 'INCONCLUSIVE');
});

test('unrelated Auth 4xx is inconclusive even with a denied hook event', () => {
  const unrelated = { status: 403, ok: false, value: { error_code: 'session_not_found' } };
  assert.equal(classifyHookDenial(unrelated, [denialEvent], 0, userId, 'otp').result,
    'INCONCLUSIVE');
});

for (const status of [500, 503]) {
  test(`unrelated HTTP ${status} is inconclusive`, () => {
    const outage = { status, ok: false, value: { error_code: 'unexpected_failure' } };
    assert.equal(classifyHookDenial(outage, [], 0, userId, 'otp').result, 'INCONCLUSIVE');
  });
}

test('network failure is an error', () => {
  assert.equal(classifyHookDenial(null, [denialEvent], 0, userId, 'otp').result, 'ERROR');
});

test('wrong Auth error code is inconclusive despite a matching event', () => {
  const wrong = { status: 500, ok: false, value: { error_code: 'validation_failed' } };
  assert.equal(classifyHookDenial(wrong, [denialEvent], 0, userId, 'otp').result, 'INCONCLUSIVE');
});

test('earlier password hook event cannot prove a later denial', () => {
  assert.equal(classifyHookDenial(denied, [passwordEvent], 1, userId, 'otp').result, 'INCONCLUSIVE');
});

test('earlier denied hook event cannot prove a later denial', () => {
  assert.equal(classifyHookDenial(denied, [denialEvent], 1, userId, 'otp').result,
    'INCONCLUSIVE');
});

for (const [label, method] of [
  ['OTP verification', 'otp'], ['recovery verification', 'otp'],
  ['OTP refresh', 'token_refresh'],
]) {
  test(`${label} unexpectedly issuing a token fails`, () => {
    assert.equal(classifyHookDenial(allowed, [], 0, userId, method).result, 'FAIL');
  });
}

test('password login remains successful with its own allowed hook event', () => {
  assert.equal(classifyHookPasswordLogin(allowed, [passwordEvent], 0, userId).result, 'PASS');
});

test('unexpected response structure fails closed', () => {
  assert.equal(classifyHookDenial({ status: 500, ok: false, value: null },
    [denialEvent], 0, userId, 'otp').result, 'ERROR');
});
