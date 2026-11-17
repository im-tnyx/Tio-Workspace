import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyAuth17 } from './auth17-assertion.mjs';

const userId = 'synthetic-user';
const denied = { status: 400, ok: false, value: { error_code: 'current_password_required' } };
const updated = { status: 200, ok: true, value: { id: userId } };
const originalWorks = { status: 200, ok: true, value: { user: { id: userId }, access_token: 'synthetic' } };
const replacementWorks = { status: 200, ok: true, value: { user: { id: userId }, access_token: 'synthetic' } };
const invalid = { status: 400, ok: false, value: { error_code: 'invalid_credentials' } };

test('expected policy denial and unchanged password pass', () => {
  assert.equal(classifyAuth17(denied, originalWorks, invalid, userId).result, 'PASS');
});

test('direct password replacement fails the security requirement', () => {
  assert.equal(classifyAuth17(updated, invalid, replacementWorks, userId).result, 'FAIL');
});

test('verified replacement remains a failure despite an unexpected update body', () => {
  const unexpected = { status: 200, ok: true, value: {} };
  assert.equal(classifyAuth17(unexpected, invalid, replacementWorks, userId).result, 'FAIL');
});

for (const status of [429, 500, 503]) {
  test(`HTTP ${status} never passes`, () => {
    const outage = { status, ok: false, value: {} };
    assert.equal(classifyAuth17(outage, originalWorks, invalid, userId).result, 'INCONCLUSIVE');
  });
}

test('network failure is an error, not a pass', () => {
  assert.equal(classifyAuth17(null, originalWorks, invalid, userId).result, 'ERROR');
});

test('unrelated Auth denial never passes', () => {
  const unrelated = { status: 400, ok: false, value: { error_code: 'session_not_found' } };
  assert.equal(classifyAuth17(unrelated, originalWorks, invalid, userId).result, 'INCONCLUSIVE');
});

test('original password no longer working never passes', () => {
  assert.equal(classifyAuth17(denied, invalid, invalid, userId).result, 'INCONCLUSIVE');
});

test('unexpected response shape fails closed', () => {
  const malformed = { status: 400, ok: false, value: null };
  assert.equal(classifyAuth17(malformed, originalWorks, invalid, userId).result, 'ERROR');
});

test('replacement login infrastructure error never passes', () => {
  const throttled = { status: 429, ok: false, value: {} };
  assert.equal(classifyAuth17(denied, originalWorks, throttled, userId).result, 'INCONCLUSIVE');
});
