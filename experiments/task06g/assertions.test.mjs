import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyConcurrent, classifyReplay, classifyNegative, classifyFiveWrong,
  classifyRecoveryControl, classifyOldCodeInvalidation, classifyInvalidCode,
  classifyPurposeCrossing, classifyPasswordMutation, classifyResendTiming,
  safeStatus } from './assertions.mjs';

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

test('OTP replay bearer proof makes access-only second verify decisive', () => {
  const accessOnly = (userId = id, sid = sid2) => ({
    status: 200, value: { user: { id: userId, email }, access_token: jwt(userId, sid) },
  });
  const timeout = { kind: 'timeout', status: null, value: null };
  const noTokens = { status: 200, value: { user: { id, email } } };

  // Review 4609996529 matrix.
  assert.equal(classifyReplay(issued(), denied, id, email, probe()), 'PASS',
    'first complete + recognized rejection with first positive control');
  assert.equal(classifyReplay(issued(), issued(sid2), id, email, probe()), 'FAIL',
    'first complete + second complete');
  assert.equal(classifyReplay(issued(), accessOnly(), id, email, probe(), probe()), 'FAIL',
    'first complete + second access-only matching bearer');
  assert.equal(classifyReplay(issued(), accessOnly(otherId), id, email, probe(), probe(otherId)),
    'FAIL', 'first complete + second access-only different UUID');
  assert.equal(classifyReplay(issued(), accessOnly(), id, email, probe(), denied), 'INCONCLUSIVE',
    'rejected second bearer is not authentication success');
  assert.equal(classifyReplay(issued(), accessOnly(), id, email, probe(), null), 'INCONCLUSIVE',
    'unavailable second bearer probe');
  assert.equal(classifyReplay(issued(), accessOnly(), id, email, probe(), timeout), 'INCONCLUSIVE',
    'second probe transport without decisive auth evidence');
  assert.equal(classifyReplay(issued(), noTokens, id, email, probe(), null), 'INCONCLUSIVE',
    'HTTP 200 without usable tokens is not PASS');
  assert.equal(classifyReplay(issued(), denied, id, email, null), 'INCONCLUSIVE',
    'missing first positive control cannot claim single-use PASS');
  assert.equal(classifyReplay(issued(), denied, id, email, { status: 503, value: {} }),
    'INCONCLUSIVE', 'failed first probe cannot PASS');
  // Decisive authenticated replay remains FAIL once second bearer is confirmed.
  assert.equal(classifyReplay(issued(), accessOnly(), id, email, probe(), probe()), 'FAIL',
    'confirmed authenticated replay remains FAIL');

  assert.equal(classifyReplay(issued(), accessOnly(), 'not-a-uuid', email, probe(), probe()),
    'INCONCLUSIVE', 'malformed expected UUID');
  assert.equal(classifyReplay({
    status: 200,
    value: { user: { id: 'not-a-uuid', email }, access_token: jwt(), refresh_token: 'r' },
  }, denied, id, email, probe()), 'INCONCLUSIVE', 'malformed first response UUID');
  assert.equal(classifyReplay(issued(), timeout, id, email, probe()), 'ERROR',
    'second verify transport timeout');
  assert.equal(classifyReplay(issued(), { kind: 'invalid_json', status: 200, value: null },
    id, email, probe()), 'ERROR', 'second invalid JSON');
  assert.equal(classifyReplay(timeout, denied, id, email, null), 'ERROR',
    'first verify transport timeout');
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

test('concurrent dual bearer authentication fails even without refresh tokens', () => {
  const accessOnly = (userId = id, sid = sid2) => ({
    status: 200, value: { user: { id: userId, email }, access_token: jwt(userId, sid) },
  });
  // Review 4609380598: complete + access-only with matching /user probes = single-use FAIL.
  const mixed = classifyConcurrent([issued(), accessOnly()], id, email, [probe(), probe()]);
  assert.equal(mixed.result, 'FAIL', 'complete + access-only matching bearers');
  assert.equal(mixed.bearersAuthenticated, 2);
  assert.equal(mixed.validResponses, 1);

  const bothAccess = classifyConcurrent(
    [accessOnly(id, sid1), accessOnly(id, sid2)], id, email, [probe(), probe()]);
  assert.equal(bothAccess.result, 'FAIL', 'two access-only matching bearers');
  assert.equal(bothAccess.bearersAuthenticated, 2);
  assert.equal(bothAccess.validResponses, 0);

  // Same decoded session claim still fails when both bearers authenticate.
  const sameClaim = classifyConcurrent(
    [issued(sid1), accessOnly(id, sid1)], id, email, [probe(), probe()]);
  assert.equal(sameClaim.result, 'FAIL');

  // One bearer success + rejection keeps the stricter one-winner PASS path.
  assert.equal(classifyConcurrent([issued(), denied], id, email, [probe(), null]).result, 'PASS');

  // Rejected / unavailable probes must not be fabricated as successes.
  assert.equal(classifyConcurrent([issued(), accessOnly()], id, email, [probe(), denied]).result,
    'INCONCLUSIVE', 'rejected second probe');
  assert.equal(classifyConcurrent([issued(), accessOnly()], id, email, [probe(), null]).result,
    'INCONCLUSIVE', 'unavailable second probe');
  assert.equal(classifyConcurrent(
    [accessOnly(), accessOnly(id, sid1)], id, email, [null, probe()]).result,
  'INCONCLUSIVE', 'one unavailable access-only probe');

  // Different UUID remains a separate identity failure.
  const crossed = classifyConcurrent(
    [issued(), accessOnly(otherId)], id, email, [probe(), probe(otherId)]);
  assert.equal(crossed.result, 'FAIL');
  assert.equal(crossed.wrongIdentity, true);

  // Partial response without usable bearer stays inconclusive beside one winner.
  const partialNoToken = { status: 200, value: { user: { id, email } } };
  assert.equal(classifyConcurrent([issued(), partialNoToken], id, email, [probe(), null]).result,
    'INCONCLUSIVE');
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
  assert.equal(classifyFiveWrong(Array(5).fill(denied), issued(), id).result, 'FAIL');
  assert.equal(classifyFiveWrong(Array(5).fill(denied), issued(), id).kind, 'cooldown_bypass');
});

test('wrong-purpose bearer proof is a decisive FAIL without refresh token', () => {
  const accessOnly = { status: 200, value: { user: { id, email }, access_token: jwt() } };
  const timeout = { kind: 'timeout', status: null, value: null };
  const malformedProbe = { status: 200, value: { id: 'not-a-uuid' } };
  const missingProbeId = { status: 200, value: {} };
  // Review 4608876817 reproduction: access token + matching bearer probe, no refresh.
  assert.equal(classifyNegative(accessOnly), 'INCONCLUSIVE');
  assert.equal(classifyPurposeCrossing(accessOnly, {
    expectedId: id, expectedEmail: email, probe: probe(),
  }), 'FAIL', 'signup→recovery access-only bearer');
  assert.equal(classifyPurposeCrossing(accessOnly, {
    expectedId: id, expectedEmail: email, probe: probe(),
  }), 'FAIL', 'recovery→email access-only bearer');
  assert.equal(classifyPurposeCrossing(accessOnly, {
    expectedId: id, expectedEmail: email, probe: probe(),
  }), 'FAIL', 'recovery→magiclink access-only bearer');

  assert.equal(classifyPurposeCrossing(denied, {
    expectedId: id, expectedEmail: email, probe: null, positiveControlValidated: true,
  }), 'PASS', 'explicit rejection with positive control');
  assert.equal(classifyPurposeCrossing(denied, {
    expectedId: id, expectedEmail: email, probe: null, positiveControlValidated: false,
  }), 'INCONCLUSIVE', 'rejection without positive control');

  assert.equal(classifyPurposeCrossing(accessOnly, {
    expectedId: id, expectedEmail: email, probe: null,
  }), 'INCONCLUSIVE', 'HTTP 200 without usable bearer evidence');
  assert.equal(classifyPurposeCrossing(accessOnly, {
    expectedId: id, expectedEmail: email, probe: missingProbeId,
  }), 'INCONCLUSIVE', 'probe 200 missing UUID');
  assert.equal(classifyPurposeCrossing(accessOnly, {
    expectedId: id, expectedEmail: email, probe: malformedProbe,
  }), 'INCONCLUSIVE', 'probe 200 malformed UUID');

  assert.equal(classifyPurposeCrossing(accessOnly, {
    expectedId: id, expectedEmail: email, probe: probe(otherId),
  }), 'FAIL', 'authenticated bearer for a different UUID');
  assert.equal(classifyPurposeCrossing({
    status: 200,
    value: { user: { id: otherId, email }, access_token: jwt(otherId), refresh_token: 'r' },
  }, {
    expectedId: id, expectedEmail: email, probe: probe(otherId),
  }), 'FAIL', 'complete wrong-identity purpose crossing');

  assert.equal(classifyPurposeCrossing(accessOnly, {
    expectedId: id, expectedEmail: email, probe: probe(),
    positiveControlValidated: false,
  }), 'FAIL', 'confirmed auth before missing positive control');
  // Confirmed authentication remains FAIL even when a later control times out.
  assert.equal(classifyPurposeCrossing(accessOnly, {
    expectedId: id, expectedEmail: email, probe: probe(),
    positiveControlValidated: false,
  }), 'FAIL');
  assert.equal(classifyPurposeCrossing(issued(), {
    expectedId: id, expectedEmail: email, probe: timeout,
  }), 'FAIL', 'complete verify body still fails when probe times out');

  assert.equal(classifyPurposeCrossing(accessOnly, {
    expectedId: id, expectedEmail: email, probe: timeout,
  }), 'ERROR', 'probe timeout without decisive authentication evidence');
  assert.equal(classifyPurposeCrossing({ kind: 'invalid_json', status: 200, value: null }, {
    expectedId: id, expectedEmail: email, probe: null, positiveControlValidated: true,
  }), 'ERROR', 'malformed verify cannot PASS');
  assert.equal(classifyPurposeCrossing(generic, {
    expectedId: id, expectedEmail: email, probe: null, positiveControlValidated: true,
  }), 'INCONCLUSIVE', 'generic 4xx is not a recognized OTP rejection PASS');
});

test('five-wrong cooldown requires five recognized OTP rejections', () => {
  const rateLimited = { status: 429, value: { error_code: 'over_request_rate_limit' } };
  const cases = [
    {
      name: 'five recognized wrong then expected-UUID auth is cooldown bypass',
      wrong: Array(5).fill(denied),
      correct: issued(),
      expected: 'FAIL',
      kind: 'cooldown_bypass',
    },
    {
      name: 'five recognized wrong then different-UUID complete session is wrong_identity',
      wrong: Array(5).fill(denied),
      correct: issued(sid2, otherId),
      expected: 'FAIL',
      kind: 'wrong_identity',
    },
    {
      name: 'correct response missing UUID is inconclusive',
      wrong: Array(5).fill(denied),
      correct: { status: 200, value: {
        user: { email }, access_token: jwt(), refresh_token: 'synthetic-refresh',
      } },
      expected: 'INCONCLUSIVE',
      kind: 'incomplete_correct',
    },
    {
      name: 'correct response malformed UUID is inconclusive',
      wrong: Array(5).fill(denied),
      correct: { status: 200, value: {
        user: { id: 'not-a-uuid', email }, access_token: jwt(), refresh_token: 'synthetic-refresh',
      } },
      expected: 'INCONCLUSIVE',
      kind: 'incomplete_correct',
    },
    {
      name: '429 among five attempts is inconclusive even if correct succeeds',
      wrong: [denied, denied, rateLimited, denied, denied],
      correct: issued(),
      expected: 'INCONCLUSIVE',
      kind: 'unrecognized_wrong',
    },
    {
      name: '429 among wrong then different-UUID complete session is wrong_identity',
      wrong: [denied, denied, rateLimited, denied, denied],
      correct: issued(sid2, otherId),
      expected: 'FAIL',
      kind: 'wrong_identity',
    },
    {
      name: '503 among five attempts is inconclusive',
      wrong: [denied, denied, denied, unavailable, denied],
      correct: issued(),
      expected: 'INCONCLUSIVE',
      kind: 'unrecognized_wrong',
    },
    {
      name: 'generic 4xx among five attempts is inconclusive',
      wrong: [denied, generic, denied, denied, denied],
      correct: issued(),
      expected: 'INCONCLUSIVE',
      kind: 'unrecognized_wrong',
    },
    {
      name: 'generic 4xx among wrong then different-UUID session is wrong_identity',
      wrong: [denied, generic, denied, denied, denied],
      correct: issued(sid2, otherId),
      expected: 'FAIL',
      kind: 'wrong_identity',
    },
    {
      name: 'missing wrong attempt is ERROR',
      wrong: [denied, denied, denied, denied, null],
      correct: issued(),
      expected: 'ERROR',
      kind: 'transport',
    },
    {
      name: 'timeout among wrong attempts is ERROR',
      wrong: [denied, denied, { kind: 'timeout', status: null, value: null }, denied, denied],
      correct: issued(),
      expected: 'ERROR',
      kind: 'transport',
    },
    {
      name: 'timeout among wrong then different-UUID session is wrong_identity',
      wrong: [denied, denied, { kind: 'timeout', status: null, value: null }, denied, denied],
      correct: issued(sid2, otherId),
      expected: 'FAIL',
      kind: 'wrong_identity',
    },
    {
      name: 'correct transport error is ERROR',
      wrong: Array(5).fill(denied),
      correct: { kind: 'timeout', status: null, value: null },
      expected: 'ERROR',
      kind: 'transport',
    },
    {
      name: 'incomplete correct response never confirms cooldown FAIL',
      wrong: Array(5).fill(denied),
      correct: { status: 200, value: { user: { id, email }, access_token: jwt() } },
      expected: 'INCONCLUSIVE',
      kind: 'incomplete_correct',
    },
    {
      name: 'matching-UUID incomplete auth evidence stays incomplete',
      wrong: Array(5).fill(denied),
      correct: { status: 200, value: { user: { id, email }, access_token: jwt() } },
      expected: 'INCONCLUSIVE',
      kind: 'incomplete_correct',
      probe: null,
    },
    {
      name: 'malformed expected UUID cannot prove wrong_identity',
      wrong: Array(5).fill(denied),
      correct: issued(sid2, otherId),
      expected: 'INCONCLUSIVE',
      kind: 'incomplete_correct',
      expectedId: 'not-a-uuid',
    },
    {
      name: 'recognized wrong then locked correct remains inconclusive not PASS',
      wrong: Array(5).fill(denied),
      correct: denied,
      expected: 'INCONCLUSIVE',
      kind: 'incomplete_correct',
    },
    {
      name: 'wrong attempt that issued a session fails closed',
      wrong: [denied, denied, issued(), denied, denied],
      correct: denied,
      expected: 'FAIL',
      kind: 'wrong_code_auth',
    },
    {
      name: 'complete wrong-code authentication survives later timeout',
      wrong: [denied, denied, issued(), denied, denied],
      correct: { kind: 'timeout', status: null, value: null },
      expected: 'FAIL',
      kind: 'wrong_code_auth',
    },
    {
      name: 'wrong-identity authentication is still decisive',
      wrong: [denied, denied, issued(sid1, otherId), denied, denied],
      correct: { kind: 'timeout', status: null, value: null },
      expected: 'FAIL',
      kind: 'wrong_code_auth',
    },
    {
      name: 'one token alone does not prove wrong-code authentication',
      wrong: [denied, denied, { status: 200,
        value: { user: { id, email }, access_token: jwt() } }, denied, denied],
      correct: issued(),
      expected: 'INCONCLUSIVE',
      kind: 'unrecognized_wrong',
    },
    {
      name: 'partial wrong response followed by timeout is ERROR',
      wrong: [denied, denied, { status: 200,
        value: { user: { id, email }, refresh_token: 'synthetic-refresh' } }, denied, denied],
      correct: { kind: 'timeout', status: null, value: null },
      expected: 'ERROR',
      kind: 'transport',
    },
  ];
  for (const item of cases) {
    const expectedId = Object.hasOwn(item, 'expectedId') ? item.expectedId : id;
    const options = Object.hasOwn(item, 'probe') ? { correctProbe: item.probe } : {};
    const classified = classifyFiveWrong(item.wrong, item.correct, expectedId, options);
    assert.equal(classified.result, item.expected, item.name);
    assert.equal(classified.kind, item.kind, `${item.name} kind`);
  }
});

test('wrong-code access-only bearer fails before cooldown short-circuits', () => {
  const accessOnly = (userId = id) => ({
    status: 200, value: { user: { id: userId, email }, access_token: jwt(userId) },
  });
  const rateLimited = { status: 429, value: { error_code: 'over_request_rate_limit' } };
  const timeout = { kind: 'timeout', status: null, value: null };
  const probes = Array(5).fill(null);

  // Review 4609372937: access-only wrong-code + matching bearer = wrong_code_auth.
  const wrongAuth = classifyFiveWrong(
    [denied, denied, accessOnly(id), denied, denied],
    issued(),
    id,
    { wrongProbes: [null, null, probe(id), null, null], correctProbe: probe() },
  );
  assert.equal(wrongAuth.result, 'FAIL', 'access-only wrong-code matching bearer');
  assert.equal(wrongAuth.kind, 'wrong_code_auth');

  const wrongIdentity = classifyFiveWrong(
    [denied, accessOnly(otherId), denied, denied, denied],
    { kind: 'timeout', status: null, value: null },
    id,
    { wrongProbes: [null, probe(otherId), null, null, null] },
  );
  assert.equal(wrongIdentity.result, 'FAIL', 'wrong-code wrong-UUID bearer before transport');
  assert.equal(wrongIdentity.kind, 'wrong_identity');

  // Partial tokens without probe stay inconclusive / transport as before.
  const partialNoProbe = classifyFiveWrong(
    [denied, denied, accessOnly(id), denied, denied],
    issued(),
    id,
    { wrongProbes: probes, correctProbe: probe() },
  );
  assert.equal(partialNoProbe.result, 'INCONCLUSIVE');
  assert.equal(partialNoProbe.kind, 'unrecognized_wrong');

  // Later correct transport cannot hide earlier wrong-code bearer auth.
  const hides = classifyFiveWrong(
    [denied, denied, accessOnly(id), denied, denied],
    timeout,
    id,
    { wrongProbes: [null, null, probe(id), null, null] },
  );
  assert.equal(hides.result, 'FAIL');
  assert.equal(hides.kind, 'wrong_code_auth');

  // 429/generic among wrong attempts still block cooldown_bypass without five recognized.
  const unrecognized = classifyFiveWrong(
    [denied, denied, rateLimited, denied, denied],
    issued(),
    id,
    { wrongProbes: probes, correctProbe: probe() },
  );
  assert.equal(unrecognized.result, 'INCONCLUSIVE');
  assert.equal(unrecognized.kind, 'unrecognized_wrong');
});

test('access-only correct bearer proves cooldown bypass or wrong_identity', () => {
  const accessOnly = (userId = id) => ({
    status: 200, value: { user: { id: userId, email }, access_token: jwt(userId) },
  });
  const rateLimited = { status: 429, value: { error_code: 'over_request_rate_limit' } };
  const timeout = { kind: 'timeout', status: null, value: null };

  // Review 4609116465: five recognized + access-only matching bearer = cooldown bypass.
  const matching = classifyFiveWrong(Array(5).fill(denied), accessOnly(id), id, {
    correctProbe: probe(id),
  });
  assert.equal(matching.result, 'FAIL', 'matching access-only bearer after five recognized');
  assert.equal(matching.kind, 'cooldown_bypass');

  // Access-only wrong UUID bearer is wrong_identity even without five recognized.
  const crossed = classifyFiveWrong([denied, denied, rateLimited, denied, denied],
    accessOnly(otherId), id, { correctProbe: probe(otherId) });
  assert.equal(crossed.result, 'FAIL', 'wrong-UUID bearer before unrecognized short-circuit');
  assert.equal(crossed.kind, 'wrong_identity');

  const timedOutWrong = classifyFiveWrong(
    [denied, denied, timeout, denied, denied], accessOnly(otherId), id,
    { correctProbe: probe(otherId) });
  assert.equal(timedOutWrong.result, 'FAIL', 'wrong-UUID bearer before transport short-circuit');
  assert.equal(timedOutWrong.kind, 'wrong_identity');

  // Missing/ambiguous probe evidence stays inconclusive (not a false cooldown FAIL).
  const noProbe = classifyFiveWrong(Array(5).fill(denied), accessOnly(id), id);
  assert.equal(noProbe.result, 'INCONCLUSIVE');
  assert.equal(noProbe.kind, 'incomplete_correct');

  const probeTimeout = classifyFiveWrong(Array(5).fill(denied), accessOnly(id), id, {
    correctProbe: timeout,
  });
  assert.equal(probeTimeout.result, 'INCONCLUSIVE', 'probe transport is not a security violation');
  assert.equal(probeTimeout.kind, 'incomplete_correct');

  // Matching UUID after unrecognized wrong attempts is still not cooldown proof.
  const unrecognizedMatching = classifyFiveWrong(
    [denied, denied, rateLimited, denied, denied], accessOnly(id), id,
    { correctProbe: probe(id) });
  assert.equal(unrecognizedMatching.result, 'INCONCLUSIVE');
  assert.equal(unrecognizedMatching.kind, 'unrecognized_wrong');
});

test('recovery same-purpose control fails on confirmed wrong UUID', () => {
  const accessOnly = (userId = id) => ({
    status: 200, value: { user: { id: userId, email }, access_token: jwt(userId) },
  });
  const timeout = { kind: 'timeout', status: null, value: null };
  // Review 4609116473: complete wrong-UUID recovery session + bearer = FAIL.
  assert.equal(classifyRecoveryControl(issued(sid2, otherId), id, email, probe(otherId)), 'FAIL',
    'complete wrong-UUID recovery session');
  assert.equal(classifyRecoveryControl(accessOnly(otherId), id, email, probe(otherId)), 'FAIL',
    'access-only wrong-UUID bearer evidence');
  assert.equal(classifyRecoveryControl(issued(), id, email, probe()), 'PASS',
    'matching UUID with complete evidence');
  assert.equal(classifyRecoveryControl(issued(sid2, otherId), 'not-a-uuid', email, probe(otherId)),
    'INCONCLUSIVE', 'malformed expected UUID is not wrong_identity');
  assert.equal(classifyRecoveryControl({
    status: 200,
    value: { user: { id: 'not-a-uuid', email }, access_token: jwt(), refresh_token: 'r' },
  }, id, email, probe()), 'INCONCLUSIVE', 'malformed response UUID');
  assert.equal(classifyRecoveryControl(issued(), id, email, null), 'INCONCLUSIVE',
    'unavailable probe cannot PASS');
  assert.equal(classifyRecoveryControl(accessOnly(id), id, email, probe()), 'INCONCLUSIVE',
    'access-only matching UUID without refresh is incomplete control');
  assert.equal(classifyRecoveryControl(timeout, id, email, null), 'ERROR',
    'verify transport remains ERROR');
});

test('recovery purpose isolation requires rejection plus recovery positive control', () => {
  const accessOnly = { status: 200, value: { user: { id, email }, access_token: jwt() } };
  const timeout = { kind: 'timeout', status: null, value: null };
  assert.equal(classifyPurposeCrossing(denied, {
    expectedId: id, expectedEmail: email, probe: null, positiveControlValidated: true,
  }), 'PASS', 'wrong-purpose rejection + recovery control');
  assert.equal(classifyPurposeCrossing(accessOnly, {
    expectedId: id, expectedEmail: email, probe: probe(), positiveControlValidated: false,
  }), 'FAIL', 'wrong-purpose authenticated bearer without refresh');
  assert.equal(classifyPurposeCrossing(issued(), {
    expectedId: id, expectedEmail: email, probe: probe(), positiveControlValidated: false,
  }), 'FAIL', 'wrong-purpose complete session');
  assert.equal(classifyPurposeCrossing(issued(sid2, otherId), {
    expectedId: id, expectedEmail: email, probe: probe(otherId), positiveControlValidated: false,
  }), 'FAIL', 'wrong-purpose different UUID');
  assert.equal(classifyPurposeCrossing(denied, {
    expectedId: id, expectedEmail: email, probe: null, positiveControlValidated: false,
  }), 'INCONCLUSIVE', 'rejection without successful recovery control');
  assert.equal(classifyPurposeCrossing(accessOnly, {
    expectedId: id, expectedEmail: email, probe: probe(),
  }), 'FAIL', 'confirmed wrong-purpose auth before later control error');
  assert.equal(classifyPurposeCrossing(denied, {
    expectedId: id, expectedEmail: email, probe: null, positiveControlValidated: false,
  }), 'INCONCLUSIVE', 'malformed recovery identity leaves control invalid');
  assert.equal(classifyPurposeCrossing({ kind: 'invalid_json', status: 200, value: null }, {
    expectedId: id, expectedEmail: email, probe: timeout, positiveControlValidated: true,
  }), 'ERROR');
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
  assert.equal(classifyPasswordMutation(mutation).result, 'FAIL');
  assert.equal(classifyPasswordMutation(mutation).kind, 'password_mutation_bypass');
  assert.equal(classifyPasswordMutation({ ...mutation, beforeGrant: generic }).result, 'INCONCLUSIVE');
  assert.equal(classifyPasswordMutation({ ...mutation, beforeGrant: generic }).kind,
    'inconclusive_control');
  // Review 4610490579 defect reproduction: wrong baseline probe must FAIL, not INCONCLUSIVE.
  const wrongProbe = classifyPasswordMutation({ ...mutation, beforeProbe: probe(otherId) });
  assert.equal(wrongProbe.result, 'FAIL', 'baseline probe different UUID was previously INCONCLUSIVE');
  assert.equal(wrongProbe.kind, 'identity_violation');
  assert.equal(classifyPasswordMutation({ ...mutation, beforeGrant: { kind: 'timeout' } }).result,
    'ERROR');
  assert.equal(classifyPasswordMutation({ ...mutation, update: unavailable }).result, 'INCONCLUSIVE');
});

test('password grants for a different UUID fail as identity violations', () => {
  const updated = { status: 200, value: {} };
  const base = { beforeGrant: issued(), beforeProbe: probe(), update: updated, id };
  // Review 4609372951: complete other-UUID grant is FAIL, not INCONCLUSIVE.
  assert.equal(classifyPasswordMutation({
    ...base, oldGrant: issued(sid1, otherId), newGrant: generic,
  }).result, 'FAIL', 'old-grant wrong UUID');
  assert.equal(classifyPasswordMutation({
    ...base, oldGrant: issued(sid1, otherId), newGrant: generic,
  }).kind, 'identity_violation');
  assert.equal(classifyPasswordMutation({
    ...base, oldGrant: generic, newGrant: issued(sid2, otherId),
  }).result, 'FAIL', 'new-grant wrong UUID');
  // Later transport cannot mask decisive wrong-UUID grant evidence.
  assert.equal(classifyPasswordMutation({
    ...base,
    update: { kind: 'timeout', status: null, value: null },
    oldGrant: issued(sid1, otherId),
    newGrant: generic,
  }).result, 'FAIL', 'wrong UUID before update transport error');
  // Malformed / missing identity is not confirmed cross-identity auth.
  assert.equal(classifyPasswordMutation({
    ...base,
    oldGrant: { status: 200, value: {
      user: { id: 'not-a-uuid', email }, access_token: jwt(), refresh_token: 'r',
    } },
    newGrant: generic,
  }).result, 'INCONCLUSIVE', 'malformed grant UUID');
  assert.equal(classifyPasswordMutation({
    ...base, oldGrant: generic, newGrant: generic, id: 'not-a-uuid',
  }).result, 'INCONCLUSIVE', 'malformed expected UUID');
  // Correct matching-UUID mutation path remains FAIL; PASS path preserved elsewhere.
  assert.equal(classifyPasswordMutation({
    ...base, oldGrant: generic, newGrant: issued(),
  }).result, 'FAIL', 'matching-UUID mutation evidence');
  assert.equal(classifyPasswordMutation({
    ...base, oldGrant: generic, newGrant: issued(),
  }).kind, 'password_mutation_bypass');
  assert.equal(classifyPasswordMutation({
    ...base, oldGrant: { status: null, value: null }, newGrant: issued(),
  }).result, 'INCONCLUSIVE', 'unavailable old grant');
  assert.equal(classifyPasswordMutation({
    ...base,
    oldGrant: { kind: 'timeout', status: null, value: null },
    newGrant: issued(),
  }).result, 'ERROR', 'old-grant transport failure');
});

test('AUTH-17 baseline identity violations fail before positive-control short-circuit', () => {
  const updated = { status: 200, value: {} };
  const timeout = { kind: 'timeout', status: null, value: null };
  const accessOnly = (userId = id) => ({
    status: 200, value: { user: { id: userId, email }, access_token: jwt(userId) },
  });
  const rest = { update: updated, oldGrant: generic, newGrant: issued(), id };

  // Review 4610490579 matrix.
  const grantOther = classifyPasswordMutation({
    beforeGrant: issued(sid1, otherId), beforeProbe: probe(otherId), ...rest,
  });
  assert.equal(grantOther.result, 'FAIL', 'baseline grant different UUID');
  assert.equal(grantOther.kind, 'identity_violation');

  const probeOther = classifyPasswordMutation({
    beforeGrant: issued(), beforeProbe: probe(otherId), ...rest,
  });
  assert.equal(probeOther.result, 'FAIL', 'grant expected UUID but bearer different UUID');
  assert.equal(probeOther.kind, 'identity_violation');

  const bothOther = classifyPasswordMutation({
    beforeGrant: issued(sid2, otherId), beforeProbe: probe(otherId), ...rest,
  });
  assert.equal(bothOther.result, 'FAIL', 'grant and probe both different UUID');
  assert.equal(bothOther.kind, 'identity_violation');

  const accessWrong = classifyPasswordMutation({
    beforeGrant: accessOnly(otherId), beforeProbe: probe(otherId), ...rest,
  });
  assert.equal(accessWrong.result, 'FAIL', 'access-only baseline wrong-UUID bearer');
  assert.equal(accessWrong.kind, 'identity_violation');

  const missing = classifyPasswordMutation({
    beforeGrant: { status: 200, value: { user: { email }, access_token: jwt(), refresh_token: 'r' } },
    beforeProbe: null, ...rest,
  });
  assert.equal(missing.result, 'INCONCLUSIVE', 'missing baseline UUID without bearer proof');
  assert.equal(missing.kind, 'inconclusive_control');

  const malformed = classifyPasswordMutation({
    beforeGrant: {
      status: 200,
      value: { user: { id: 'not-a-uuid', email }, access_token: jwt(), refresh_token: 'r' },
    },
    beforeProbe: probe(), ...rest,
  });
  assert.equal(malformed.result, 'INCONCLUSIVE', 'malformed UUID is not identity_violation');
  assert.equal(malformed.kind, 'inconclusive_control');

  const probeTimeout = classifyPasswordMutation({
    beforeGrant: issued(), beforeProbe: timeout, ...rest,
  });
  assert.equal(probeTimeout.result, 'ERROR', 'probe timeout without decisive wrong-identity');
  assert.equal(probeTimeout.kind, 'transport');

  // Wrong-identity survives later transport on mutation steps.
  const preserved = classifyPasswordMutation({
    beforeGrant: issued(sid1, otherId),
    beforeProbe: probe(otherId),
    update: timeout,
    oldGrant: generic,
    newGrant: issued(),
    id,
  });
  assert.equal(preserved.result, 'FAIL');
  assert.equal(preserved.kind, 'identity_violation');

  // Matching baseline continues into normal AUTH-17 mutation classification.
  const matching = classifyPasswordMutation({
    beforeGrant: issued(), beforeProbe: probe(), ...rest,
  });
  assert.equal(matching.result, 'FAIL');
  assert.equal(matching.kind, 'password_mutation_bypass');
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
      kind: 'current_password_enforced',
    },
    {
      name: 'current_password_invalid with intact old password passes',
      update: { status: 400, value: { error_code: 'current_password_invalid' } },
      expected: 'PASS',
      kind: 'current_password_enforced',
    },
    {
      name: 'session_not_found denial is inconclusive',
      update: { status: 403, value: { error_code: 'session_not_found' } },
      expected: 'INCONCLUSIVE',
      kind: 'inconclusive_control',
    },
    {
      name: 'validation_failed denial is inconclusive',
      update: { status: 400, value: { error_code: 'validation_failed' } },
      expected: 'INCONCLUSIVE',
      kind: 'inconclusive_control',
    },
    {
      name: 'generic 401 with arbitrary error_code is inconclusive',
      update: { status: 401, value: { error_code: 'bad_jwt' } },
      expected: 'INCONCLUSIVE',
      kind: 'inconclusive_control',
    },
    {
      name: 'rate-limited update is inconclusive',
      update: { status: 429, value: { error_code: 'over_request_rate_limit' } },
      expected: 'INCONCLUSIVE',
      kind: 'inconclusive_control',
    },
    {
      name: 'confirmed mutation path remains FAIL',
      update: { status: 200, value: {} },
      oldGrant: generic,
      newGrant: issued(),
      expected: 'FAIL',
      kind: 'password_mutation_bypass',
    },
  ];
  for (const item of cases) {
    const classified = classifyPasswordMutation({
      ...base,
      update: item.update,
      ...(item.oldGrant ? { oldGrant: item.oldGrant } : {}),
      ...(item.newGrant ? { newGrant: item.newGrant } : {}),
    });
    assert.equal(classified.result, item.expected, item.name);
    assert.equal(classified.kind, item.kind, `${item.name} kind`);
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

test('decisive wrong-code evidence precedes later transport failures', () => {
  const timeout = { kind: 'timeout', status: null, value: null };
  const malformed = { kind: 'invalid_json', status: 200, value: null };
  const partial = { status: 200, value: { user: { id, email }, access_token: jwt() } };
  const cases = [
    ['complete auth, later timeout', issued(), timeout, {}, 'FAIL'],
    ['complete auth, later malformed JSON', issued(), malformed, {}, 'FAIL'],
    ['complete auth, wrong probe timeout', issued(), denied, { wrongProbe: timeout }, 'FAIL'],
    ['partial auth, validated bearer, later timeout', partial, timeout,
      { wrongProbe: probe() }, 'FAIL'],
    ['partial auth, no bearer proof, later timeout', partial, timeout, {}, 'ERROR'],
    ['partial auth, probe timeout', partial, denied, { wrongProbe: timeout }, 'ERROR'],
    ['rejection, later timeout', denied, timeout, {}, 'ERROR'],
    ['rejection, later malformed JSON', denied, malformed, {}, 'ERROR'],
    ['rejection, correct probe timeout', denied, issued(),
      { correctProbe: timeout }, 'ERROR'],
    ['rejection, validated correct auth', denied, issued(),
      { correctProbe: probe() }, 'PASS'],
    ['rejection, unprobed correct auth', denied, issued(), {}, 'INCONCLUSIVE'],
    ['rejection, incomplete correct auth', denied, partial, {}, 'INCONCLUSIVE'],
    ['generic 4xx, validated correct auth', generic, issued(),
      { correctProbe: probe() }, 'INCONCLUSIVE'],
    ['authenticated wrong UUID, later timeout', issued(sid1, otherId), timeout, {}, 'FAIL'],
    ['missing wrong UUID, no probe, later timeout',
      { status: 200, value: { user: { email }, access_token: jwt(),
        refresh_token: 'synthetic-refresh' } }, timeout, {}, 'ERROR'],
    ['malformed wrong UUID, validated bearer, later timeout',
      { status: 200, value: { user: { id: 'invalid', email }, access_token: jwt() } },
      timeout, { wrongProbe: probe() }, 'FAIL'],
  ];
  for (const [name, wrong, correct, options, expected] of cases) {
    assert.equal(classifyInvalidCode(wrong, correct, id, email, options), expected, name);
  }
  const bearerWithoutId = { status: 200,
    value: { user: { email }, access_token: jwt() } };
  assert.equal(classifyInvalidCode(bearerWithoutId, timeout, '', email,
    { wrongProbe: probe() }), 'FAIL', 'caller fallback ID absent but bearer is authenticated');
  assert.equal(classifyInvalidCode({ status: 200, value: {
    user: { id: 'malformed', email }, access_token: jwt(),
  } }, timeout, 'malformed', email, { wrongProbe: probe() }), 'FAIL',
  'caller fallback ID malformed but bearer is authenticated');
  assert.equal(classifyInvalidCode(denied, timeout, '', email,
    { wrongProbe: probe() }), 'ERROR', 'rejected response cannot borrow an unrelated probe');
  const malformedLaterId = { status: 200,
    value: { user: { id: 'malformed', email } } };
  assert.equal(classifyInvalidCode(issued(), malformedLaterId, 'malformed', email), 'FAIL',
    'later malformed ID cannot hide complete wrong-code authentication');
});

test('decisive old-code evidence precedes later transport failures', () => {
  const timeout = { kind: 'timeout', status: null, value: null };
  const malformed = { kind: 'invalid_json', status: 200, value: null };
  const partial = { status: 200, value: { user: { id, email }, access_token: jwt() } };
  const cases = [
    ['complete old auth, new timeout', issued(), timeout, {}, 'FAIL'],
    ['complete old auth, new malformed JSON', issued(), malformed, {}, 'FAIL'],
    ['complete old auth, old probe timeout', issued(), denied,
      { oldProbe: timeout }, 'FAIL'],
    ['partial old auth, bearer validated, new timeout', partial, timeout,
      { oldProbe: probe() }, 'FAIL'],
    ['partial old auth, new timeout', partial, timeout, {}, 'ERROR'],
    ['old rejected, new timeout', denied, timeout, {}, 'ERROR'],
    ['old rejected, new probe timeout', denied, issued(),
      { newProbe: timeout }, 'ERROR'],
    ['old rejected, new validated', denied, issued(),
      { newProbe: probe() }, 'PASS'],
    ['old rejected, new unprobed', denied, issued(), {}, 'INCONCLUSIVE'],
    ['old rejected, new incomplete', denied, partial, {}, 'INCONCLUSIVE'],
    ['generic old 4xx, new validated', generic, issued(),
      { newProbe: probe() }, 'INCONCLUSIVE'],
    ['wrong old UUID, new timeout', issued(sid1, otherId), timeout, {}, 'FAIL'],
    ['missing old UUID, no bearer proof, new timeout',
      { status: 200, value: { user: { email }, access_token: jwt(),
        refresh_token: 'synthetic-refresh' } }, timeout, {}, 'ERROR'],
    ['old rejected, wrong new identity', denied, issued(sid2, otherId), {}, 'FAIL'],
  ];
  for (const [name, old, next, options, expected] of cases) {
    assert.equal(classifyOldCodeInvalidation(old, next, id, email,
      { distinctCodes: true, ...options }), expected, name);
  }
  const bearerWithoutId = { status: 200,
    value: { user: { email }, access_token: jwt() } };
  assert.equal(classifyOldCodeInvalidation(bearerWithoutId, timeout, '', email,
    { distinctCodes: true, oldProbe: probe() }), 'FAIL',
  'caller fallback ID absent but old bearer is authenticated');
  assert.equal(classifyOldCodeInvalidation({ status: 200, value: {
    user: { id: 'malformed', email }, access_token: jwt(),
  } }, timeout, 'malformed', email, { distinctCodes: true, oldProbe: probe() }), 'FAIL',
  'caller fallback ID malformed but old bearer is authenticated');
  assert.equal(classifyOldCodeInvalidation(denied, timeout, '', email,
    { distinctCodes: true, oldProbe: probe() }), 'ERROR',
  'rejected old response cannot borrow an unrelated probe');
  const malformedLaterId = { status: 200,
    value: { user: { id: 'malformed', email } } };
  assert.equal(classifyOldCodeInvalidation(issued(), malformedLaterId, 'malformed', email,
    { distinctCodes: true }), 'FAIL',
  'later malformed ID cannot hide complete old-code authentication');
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
