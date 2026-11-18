import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyConcurrent, classifyReplay, classifyNegative, classifyFiveWrong,
  classifyOldCodeInvalidation, classifyInvalidCode, classifyPasswordMutation,
  classifyResendTiming, safeStatus } from './assertions.mjs';

const id = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const email = 'unit@example.invalid';
const sid1 = '33333333-3333-4333-8333-333333333333';
const sid2 = '44444444-4444-4444-8444-444444444444';
const jwt = (sub = id, session_id = sid1) =>
  `x.${Buffer.from(JSON.stringify({ sub, session_id })).toString('base64url')}.x`;
const issued = (sid = sid1, userId = id) => ({ status: 200,
  value: { user: { id: userId, email }, access_token: jwt(userId, sid), refresh_token: 'synthetic-refresh' } });
const probe = (userId = id) => ({ status: 200, value: { id: userId } });
const denied = { status: 403, value: { error_code: 'otp_expired' } };
const generic = { status: 400, value: { error_code: 'invalid_credentials' } };
const unavailable = { status: 503, value: {} };

test('one validated session and one explicit rejection passes', () => {
  const result = classifyConcurrent([issued(), denied], id, email, [probe(), null]);
  assert.equal(result.result, 'PASS');
  assert.equal(result.validResponses, 1);
  assert.equal(result.probesValidated, 1);
  assert.equal(classifyReplay(issued(), denied, id, email, probe()), 'PASS');
});

test('two complete 200 responses with independent user probes fail', () => {
  const result = classifyConcurrent([issued(sid1), issued(sid2)], id, email, [probe(), probe()]);
  assert.equal(result.result, 'FAIL');
  assert.equal(result.validResponses, 2);
  assert.equal(result.sessionIdClaimComparison, 'different');
});

test('two 200 responses with one missing session remain inconclusive', () => {
  const partial = { status: 200, value: { user: { id, email }, access_token: jwt() } };
  assert.equal(classifyConcurrent([issued(), partial], id, email, [probe(), null]).result, 'INCONCLUSIVE');
});

test('wrong UUID with a complete response is a failure', () => {
  const result = classifyConcurrent([issued(), issued(sid2, otherId)], id, email, [probe(), probe(otherId)]);
  assert.equal(result.result, 'FAIL');
  assert.equal(result.wrongIdentity, true);
  const noClaims = issued(sid2, otherId);
  noClaims.value.access_token = 'opaque-token';
  assert.equal(classifyConcurrent([issued(), noClaims], id, email, [probe(), null]).result, 'FAIL');
});

test('missing refresh token cannot pass', () => {
  const partial = issued();
  delete partial.value.refresh_token;
  assert.equal(classifyConcurrent([partial, denied], id, email, [probe(), null]).result, 'INCONCLUSIVE');
});

test('same session ID still fails two authenticated responses', () => {
  const result = classifyConcurrent([issued(sid1), issued(sid1)], id, email, [probe(), probe()]);
  assert.equal(result.result, 'FAIL');
  assert.equal(result.sessionIdClaimComparison, 'same');
});

test('network error and timeout are ERROR, not security PASS', () => {
  for (const kind of ['network_error', 'timeout']) {
    assert.equal(classifyConcurrent([issued(), { kind, status: null, value: null }], id, email,
      [probe(), null]).result, 'ERROR');
  }
});

test('malformed JSON is ERROR', () => {
  assert.equal(classifyConcurrent([issued(), { kind: 'invalid_json', status: 200, value: null }],
    id, email, [probe(), null]).result, 'ERROR');
});

test('unavailable JWT session claims cannot pass', () => {
  const partial = issued();
  partial.value.access_token = 'malformed';
  assert.equal(classifyConcurrent([partial, denied], id, email, [probe(), null]).result, 'INCONCLUSIVE');
  const two = classifyConcurrent([partial, issued(sid2)], id, email, [probe(), probe()]);
  assert.equal(two.result, 'FAIL');
  assert.equal(two.sessionIdClaimComparison, 'unavailable');
});

test('missing independent GET /user proof cannot pass one-session case', () => {
  assert.equal(classifyConcurrent([issued(), denied], id, email, [unavailable, null]).result,
    'INCONCLUSIVE');
  assert.equal(classifyConcurrent([issued(), generic], id, email, [probe(), null]).result,
    'INCONCLUSIVE');
  assert.equal(classifyConcurrent([issued(), denied], id, email,
    [{ kind: 'timeout', status: null, value: null }, null]).result, 'INCONCLUSIVE');
});

test('GET /user identity mismatch fails even with a matching response UUID', () => {
  const result = classifyConcurrent([issued(), denied], id, email, [probe(otherId), null]);
  assert.equal(result.result, 'FAIL');
  assert.equal(result.wrongIdentity, true);
});

test('wrong and replay responses do not use generic errors as proof', () => {
  assert.equal(classifyNegative(denied), 'PASS');
  assert.equal(classifyNegative(generic), 'INCONCLUSIVE');
  assert.equal(classifyReplay(issued(), issued(sid2), id, email, probe()), 'FAIL');
  assert.equal(classifyFiveWrong(Array(5).fill(denied), issued(), id), 'FAIL');
});

test('five-wrong cooldown requires five recognized OTP rejections', () => {
  const rateLimited = { status: 429, value: { error_code: 'over_request_rate_limit' } };
  const cases = [
    {
      name: 'five recognized wrong then complete correct auth fails',
      wrong: Array(5).fill(denied),
      correct: issued(),
      expected: 'FAIL',
    },
    {
      name: '429 among five attempts is inconclusive even if correct succeeds',
      wrong: [denied, denied, rateLimited, denied, denied],
      correct: issued(),
      expected: 'INCONCLUSIVE',
    },
    {
      name: '503 among five attempts is inconclusive',
      wrong: [denied, denied, denied, unavailable, denied],
      correct: issued(),
      expected: 'INCONCLUSIVE',
    },
    {
      name: 'generic 4xx among five attempts is inconclusive',
      wrong: [denied, generic, denied, denied, denied],
      correct: issued(),
      expected: 'INCONCLUSIVE',
    },
    {
      name: 'missing wrong attempt is ERROR',
      wrong: [denied, denied, denied, denied, null],
      correct: issued(),
      expected: 'ERROR',
    },
    {
      name: 'timeout among wrong attempts is ERROR',
      wrong: [denied, denied, { kind: 'timeout', status: null, value: null }, denied, denied],
      correct: issued(),
      expected: 'ERROR',
    },
    {
      name: 'incomplete correct response never confirms cooldown FAIL',
      wrong: Array(5).fill(denied),
      correct: { status: 200, value: { user: { id, email }, access_token: jwt() } },
      expected: 'INCONCLUSIVE',
    },
    {
      name: 'recognized wrong then locked correct remains inconclusive not PASS',
      wrong: Array(5).fill(denied),
      correct: denied,
      expected: 'INCONCLUSIVE',
    },
    {
      name: 'wrong attempt that issued a session fails closed',
      wrong: [denied, denied, issued(), denied, denied],
      correct: denied,
      expected: 'FAIL',
    },
  ];
  for (const item of cases) {
    assert.equal(classifyFiveWrong(item.wrong, item.correct, id), item.expected, item.name);
  }
});

test('old-code invalidation fails independently of new-code verification', () => {
  const cases = [
    {
      name: 'old-code complete auth fails even when new-code is rejected',
      old: issued(sid1),
      next: denied,
      options: { distinctCodes: true },
      expected: 'FAIL',
    },
    {
      name: 'old rejected plus complete new success passes',
      old: denied,
      next: issued(sid2),
      options: { distinctCodes: true, newProbe: probe() },
      expected: 'PASS',
    },
    {
      name: 'old rejected without usable new positive control is inconclusive',
      old: denied,
      next: generic,
      options: { distinctCodes: true },
      expected: 'INCONCLUSIVE',
    },
    {
      name: 'indistinct codes are inconclusive',
      old: denied,
      next: issued(),
      options: { distinctCodes: false, newProbe: probe() },
      expected: 'INCONCLUSIVE',
    },
    {
      name: 'partial old response alone is inconclusive',
      old: { status: 200, value: { user: { id, email }, access_token: jwt() } },
      next: denied,
      options: { distinctCodes: true },
      expected: 'INCONCLUSIVE',
    },
    {
      name: 'partial old response with bearer proof fails',
      old: { status: 200, value: { user: { id, email }, access_token: jwt() } },
      next: denied,
      options: { distinctCodes: true, oldProbe: probe() },
      expected: 'FAIL',
    },
    {
      name: 'network failure on old verify is ERROR',
      old: { kind: 'network_error', status: null, value: null },
      next: issued(),
      options: { distinctCodes: true },
      expected: 'ERROR',
    },
    {
      name: '503 on new verify after old rejection is inconclusive',
      old: denied,
      next: unavailable,
      options: { distinctCodes: true },
      expected: 'INCONCLUSIVE',
    },
    {
      name: 'complete old auth still fails when old probe times out',
      old: issued(sid1),
      next: denied,
      options: { distinctCodes: true, oldProbe: { kind: 'timeout', status: null, value: null } },
      expected: 'FAIL',
    },
    {
      name: 'complete old auth still fails when new probe is invalid JSON',
      old: issued(sid1),
      next: denied,
      options: {
        distinctCodes: true,
        newProbe: { kind: 'invalid_json', status: 200, value: null },
      },
      expected: 'FAIL',
    },
  ];
  for (const item of cases) {
    assert.equal(
      classifyOldCodeInvalidation(item.old, item.next, id, email, item.options),
      item.expected,
      item.name,
    );
  }
});

test('authenticated replay with unexpected UUID fails closed', () => {
  assert.equal(classifyReplay(issued(), issued(sid2, otherId), id, email, probe()), 'FAIL');
  assert.equal(classifyReplay(issued(sid1, otherId), denied, id, email, probe(otherId)), 'FAIL');
  assert.equal(classifyReplay(issued(sid1, otherId), { kind: 'timeout' },
    id, email, probe(otherId)), 'FAIL');
  assert.equal(classifyConcurrent([issued(sid1, otherId), { kind: 'timeout' }], id, email,
    [probe(otherId), null]).result, 'FAIL');
  assert.equal(classifyReplay(issued(), { status: 200, value: { user: { id, email } } },
    id, email, probe()), 'INCONCLUSIVE');
  assert.equal(classifyReplay(issued(), { kind: 'invalid_json', status: 200, value: null },
    id, email, probe()), 'ERROR');
});

test('partial wrong-UUID responses never establish authenticated replay', () => {
  const partials = [
    { status: 200, value: { user: { id: otherId, email } } },
    { status: 200, value: { user: { id: otherId, email }, access_token: jwt(otherId) } },
    { status: 200, value: { user: { id: otherId, email }, refresh_token: 'synthetic-refresh' } },
  ];
  for (const partial of partials) {
    assert.equal(classifyReplay(partial, denied, id, email, null), 'INCONCLUSIVE');
    assert.equal(classifyReplay(denied, partial, id, email, null), 'INCONCLUSIVE');
    assert.equal(classifyConcurrent([partial, denied], id, email, [null, null]).result, 'INCONCLUSIVE');
    assert.equal(classifyConcurrent([denied, partial], id, email, [null, null]).result, 'INCONCLUSIVE');
    assert.equal(classifyConcurrent([issued(), partial], id, email, [probe(), null]).result,
      'INCONCLUSIVE');
  }
  assert.equal(classifyReplay(issued(), generic, id, email, probe()), 'INCONCLUSIVE');
  assert.equal(classifyReplay(partials[0], { kind: 'timeout' }, id, email, null), 'ERROR');
});

test('independent bearer proof makes partial wrong-UUID identity decisive', () => {
  const accessOnly = { status: 200, value: {
    user: { id: otherId, email }, access_token: jwt(otherId),
  } };
  assert.equal(classifyReplay(accessOnly, denied, id, email, probe(otherId)), 'FAIL');
  assert.equal(classifyConcurrent([accessOnly, denied], id, email,
    [probe(otherId), null]).result, 'FAIL');
  const refreshOnly = { status: 200, value: {
    user: { id: otherId, email }, refresh_token: 'synthetic-refresh',
  } };
  assert.equal(classifyReplay(refreshOnly, denied, id, email, probe(otherId)), 'INCONCLUSIVE');
});

test('unusable GET /user identities are inconclusive in both pair orders', () => {
  const probes = [
    { status: 200, value: {} },
    { status: 200, value: { id: null } },
    { status: 200, value: { id: '' } },
    { status: 200, value: { id: 42 } },
    { status: 200, value: { id: 'malformed' } },
    { status: 200, value: { user: { id } } },
    { status: 200, kind: 'invalid_json', value: null },
    { status: 401, value: {} },
    { status: 403, value: {} },
    { kind: 'timeout', status: null, value: null },
  ];
  for (const userProbe of probes) {
    assert.equal(classifyReplay(issued(), denied, id, email, userProbe), 'INCONCLUSIVE');
    assert.equal(classifyConcurrent([issued(), denied], id, email,
      [userProbe, null]).result, 'INCONCLUSIVE');
    assert.equal(classifyConcurrent([denied, issued()], id, email,
      [null, userProbe]).result, 'INCONCLUSIVE');
  }
});

test('valid GET /user UUIDs distinguish authentication from wrong identity', () => {
  assert.equal(classifyReplay(issued(), denied, id, email, probe()), 'PASS');
  assert.equal(classifyConcurrent([issued(), denied], id, email, [probe(), null]).result, 'PASS');
  assert.equal(classifyConcurrent([denied, issued()], id, email, [null, probe()]).result, 'PASS');
  assert.equal(classifyReplay(issued(), denied, id, email, probe(otherId)), 'FAIL');
  assert.equal(classifyConcurrent([issued(), denied], id, email,
    [probe(otherId), null]).result, 'FAIL');
  assert.equal(classifyConcurrent([denied, issued()], id, email,
    [null, probe(otherId)]).result, 'FAIL');
});

test('expected and verify UUIDs must be structurally valid', () => {
  const malformedVerify = issued();
  malformedVerify.value.user.id = 'malformed';
  assert.equal(classifyReplay(malformedVerify, denied, id, email, probe()), 'INCONCLUSIVE');
  assert.equal(classifyConcurrent([malformedVerify, denied], id, email,
    [probe(), null]).result, 'INCONCLUSIVE');
  assert.equal(classifyReplay(issued(), denied, 'malformed', email, probe()), 'INCONCLUSIVE');
  assert.equal(classifyConcurrent([issued(), denied], 'malformed', email,
    [probe(), null]).result, 'INCONCLUSIVE');
  assert.equal(classifyReplay(malformedVerify, denied, id, email, probe(otherId)), 'FAIL');
});

test('response errors and genuine OTP violations retain their verdicts', () => {
  const partial = { status: 200, value: { user: { id: otherId, email } } };
  const malformed = { status: 200, kind: 'invalid_json', value: null };
  const timeout = { kind: 'timeout', status: null, value: null };
  for (const response of [malformed, timeout]) {
    assert.equal(classifyReplay(partial, response, id, email, null), 'ERROR');
    assert.equal(classifyReplay(response, partial, id, email, null), 'ERROR');
    assert.equal(classifyConcurrent([partial, response], id, email, [null, null]).result, 'ERROR');
    assert.equal(classifyConcurrent([response, partial], id, email, [null, null]).result, 'ERROR');
  }
  assert.equal(classifyReplay(issued(), generic, id, email, probe()), 'INCONCLUSIVE');
  assert.equal(classifyConcurrent([issued(), generic], id, email, [probe(), null]).result,
    'INCONCLUSIVE');
  assert.equal(classifyReplay(issued(sid1, otherId), denied, id, email, probe(otherId)), 'FAIL');
  assert.equal(classifyConcurrent([issued(sid1, otherId), denied], id, email,
    [probe(otherId), null]).result, 'FAIL');
  assert.equal(classifyReplay(issued(sid1), issued(sid2), id, email, probe()), 'FAIL');
  assert.equal(classifyConcurrent([issued(sid1), issued(sid2)], id, email,
    [probe(), probe()]).result, 'FAIL');
  assert.equal(classifyConcurrent([issued(sid2), issued(sid1)], id, email,
    [probe(), probe()]).result, 'FAIL');
});

test('password-state evidence remains independent of OTP consumption', () => {
  const updated = { status: 200, value: {} };
  const mutation = { beforeGrant: issued(), beforeProbe: probe(), update: updated,
    oldGrant: generic, newGrant: issued(), id };
  assert.equal(classifyPasswordMutation(mutation), 'FAIL');
  assert.equal(classifyPasswordMutation({ ...mutation, beforeGrant: generic }), 'INCONCLUSIVE');
  assert.equal(classifyPasswordMutation({ ...mutation, beforeProbe: probe(otherId) }), 'INCONCLUSIVE');
  assert.equal(classifyPasswordMutation({ ...mutation, beforeGrant: { kind: 'timeout' } }), 'ERROR');
  assert.equal(classifyPasswordMutation({ ...mutation, update: unavailable }), 'INCONCLUSIVE');
});

test('AUTH-17 PASS requires documented current-password policy denial', () => {
  const base = {
    beforeGrant: issued(),
    beforeProbe: probe(),
    oldGrant: issued(),
    newGrant: generic,
    id,
  };
  const cases = [
    {
      name: 'current_password_required with intact old password passes',
      update: { status: 400, value: { error_code: 'current_password_required' } },
      expected: 'PASS',
    },
    {
      name: 'current_password_invalid with intact old password passes',
      update: { status: 400, value: { error_code: 'current_password_invalid' } },
      expected: 'PASS',
    },
    {
      name: 'session_not_found denial is inconclusive',
      update: { status: 403, value: { error_code: 'session_not_found' } },
      expected: 'INCONCLUSIVE',
    },
    {
      name: 'validation_failed denial is inconclusive',
      update: { status: 400, value: { error_code: 'validation_failed' } },
      expected: 'INCONCLUSIVE',
    },
    {
      name: 'generic 401 with arbitrary error_code is inconclusive',
      update: { status: 401, value: { error_code: 'bad_jwt' } },
      expected: 'INCONCLUSIVE',
    },
    {
      name: 'rate-limited update is inconclusive',
      update: { status: 429, value: { error_code: 'over_request_rate_limit' } },
      expected: 'INCONCLUSIVE',
    },
    {
      name: 'confirmed mutation path remains FAIL',
      update: { status: 200, value: {} },
      oldGrant: generic,
      newGrant: issued(),
      expected: 'FAIL',
    },
  ];
  for (const item of cases) {
    assert.equal(classifyPasswordMutation({
      ...base,
      update: item.update,
      ...(item.oldGrant ? { oldGrant: item.oldGrant } : {}),
      ...(item.newGrant ? { newGrant: item.newGrant } : {}),
    }), item.expected, item.name);
  }
});

test('wrong OTP authentication fails independently of later correct verify', () => {
  const cases = [
    {
      name: 'wrong OTP authenticated then correct rejected fails',
      wrong: issued(sid1),
      correct: denied,
      options: {},
      expected: 'FAIL',
    },
    {
      name: 'wrong rejected then correct authenticated passes',
      wrong: denied,
      correct: issued(sid2),
      options: { correctProbe: probe() },
      expected: 'PASS',
    },
    {
      name: 'wrong partial 200 alone is inconclusive',
      wrong: { status: 200, value: { user: { id, email }, access_token: jwt() } },
      correct: denied,
      options: {},
      expected: 'INCONCLUSIVE',
    },
    {
      name: 'wrong partial 200 with bearer proof fails',
      wrong: { status: 200, value: { user: { id, email }, access_token: jwt() } },
      correct: denied,
      options: { wrongProbe: probe() },
      expected: 'FAIL',
    },
    {
      name: 'wrong transport failure is ERROR',
      wrong: { kind: 'timeout', status: null, value: null },
      correct: issued(),
      options: {},
      expected: 'ERROR',
    },
    {
      name: 'infrastructure on correct after wrong rejection is inconclusive',
      wrong: denied,
      correct: unavailable,
      options: {},
      expected: 'INCONCLUSIVE',
    },
    {
      name: 'complete wrong auth still fails when wrong probe times out',
      wrong: issued(sid1),
      correct: denied,
      options: { wrongProbe: { kind: 'timeout', status: null, value: null } },
      expected: 'FAIL',
    },
    {
      name: 'complete wrong auth still fails when correct probe is invalid JSON',
      wrong: issued(sid1),
      correct: denied,
      options: { correctProbe: { kind: 'invalid_json', status: 200, value: null } },
      expected: 'FAIL',
    },
  ];
  for (const item of cases) {
    assert.equal(
      classifyInvalidCode(item.wrong, item.correct, id, email, item.options),
      item.expected,
      item.name,
    );
  }
});

test('resend timing uses HTTP dispatch/receipt before mail processing', () => {
  const first = { dispatchAt: 0, responseAt: 20, result: { status: 200, value: {} } };
  const early = { dispatchAt: 100, responseAt: 110,
    result: { status: 429, value: { error_code: 'over_email_send_rate_limit' } } };
  const later = { dispatchAt: 60050, responseAt: 60070, result: { status: 200, value: {} } };
  const result = classifyResendTiming(first, [early, later]);
  assert.equal(result.result, 'PASS');
  assert.equal(result.lowerBoundMs, 60030);
  assert.equal(result.exactBoundary, 'INCONCLUSIVE');
  assert.equal(classifyResendTiming(first, [early, { ...later, dispatchAt: 55000,
    responseAt: 55020 }]).result, 'FAIL');
  assert.equal(classifyResendTiming(first, [early, { ...later, dispatchAt: 59000,
    responseAt: 61000 }]).result, 'INCONCLUSIVE');
  assert.equal(classifyResendTiming(first, [{ ...early, responseAt: 50,
    dispatchAt: 10 }, later]).result, 'INCONCLUSIVE');
  assert.equal(classifyResendTiming({ ...first, result: { status: 200, kind: 'invalid_json' } },
    [early, later]).result, 'ERROR');
});

test('status output excludes response bodies and credential fields', () => {
  assert.equal(safeStatus({ status: 403, value: { error_code: 'otp_expired', access_token: 'synthetic' } }),
    '403/otp_expired');
  assert.equal(safeStatus({ kind: 'invalid_json', status: 200, value: null }), 'invalid_json');
});
