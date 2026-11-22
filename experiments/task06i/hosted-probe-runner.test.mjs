import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateTargetProject,
  validateTestIdentity,
  determineRunnerMode,
  sanitizeData,
  redactSensitiveFields,
  planProbeExecution,
  runHostedProbeRunner,
  validateProbeOutcome,
  IMMUTABLE_FORBIDDEN_PROJECTS,
  HARDCODED_REAL_REF,
  HARDCODED_TIO_WORLD_REF,
  HARDCODED_TEMP_REF,
  DEFAULT_PROBE_TIMEOUT_MS,
  TIO_SUPABASE_REAL_REF,
  TIO_SUPABASE_TEMP_REF
} from './hosted-probe-runner.mjs';

const VALID_TEMP_REF = HARDCODED_TEMP_REF;

// ---------------------------------------------------------------------------
// R2-01: Immutable Forbidden Project Boundary Tests
// ---------------------------------------------------------------------------

test('1. Tio-world is permanently immune and rejected by target validator', () => {
  assert.throws(
    () => validateTargetProject('oykupyiitspujzpwwvuj', VALID_TEMP_REF),
    /CRITICAL_SECURITY_VIOLATION.*Tio-world.*permanently forbidden/
  );
});

test('2. REAL project (Tio-Tnyx) is protected and permanently forbidden from test targeting', () => {
  assert.throws(
    () => validateTargetProject('bsfwzvgynwriswapxpsp', VALID_TEMP_REF),
    /CRITICAL_SECURITY_VIOLATION.*protected REAL backend.*permanently forbidden/
  );
});

test('2b. REAL project and Tio-world cannot be bypassed via Set mutation, env override, or tempRef spoofing (PRRT_kwDOVtCmZc66i_Kb)', () => {
  // 1. Attempting mutation on IMMUTABLE_FORBIDDEN_PROJECTS throws TypeError
  assert.throws(
    () => IMMUTABLE_FORBIDDEN_PROJECTS.delete(HARDCODED_REAL_REF),
    /TypeError.*immutable/
  );
  assert.throws(
    () => IMMUTABLE_FORBIDDEN_PROJECTS.add('some-new-project'),
    /TypeError.*immutable/
  );
  assert.throws(
    () => IMMUTABLE_FORBIDDEN_PROJECTS.clear(),
    /TypeError.*immutable/
  );

  // 2. Target check still rejects even if caller passes REAL as both target and tempRef
  assert.throws(
    () => validateTargetProject('bsfwzvgynwriswapxpsp', 'bsfwzvgynwriswapxpsp'),
    /CRITICAL_SECURITY_VIOLATION.*protected REAL backend.*permanently forbidden/
  );
  assert.throws(
    () => validateTargetProject('oykupyiitspujzpwwvuj', 'oykupyiitspujzpwwvuj'),
    /CRITICAL_SECURITY_VIOLATION.*Tio-world.*permanently forbidden/
  );

  // 3. Configuring REAL or Tio-world as tempRef with arbitrary target is rejected
  assert.throws(
    () => validateTargetProject('some-other-target', 'bsfwzvgynwriswapxpsp'),
    /CRITICAL_SECURITY_VIOLATION.*Configured TEMP ref 'bsfwzvgynwriswapxpsp' cannot be a protected or immune project/
  );
  assert.throws(
    () => validateTargetProject('some-other-target', 'oykupyiitspujzpwwvuj'),
    /CRITICAL_SECURITY_VIOLATION.*Configured TEMP ref 'oykupyiitspujzpwwvuj' cannot be a protected or immune project/
  );

  // 4. Overriding process.env.TIO_SUPABASE_REAL_REF does not bypass hardcoded constants
  const originalEnv = process.env.TIO_SUPABASE_REAL_REF;
  try {
    process.env.TIO_SUPABASE_REAL_REF = 'arbitrary-dummy-project';
    assert.throws(
      () => validateTargetProject('bsfwzvgynwriswapxpsp', 'bsfwzvgynwriswapxpsp'),
      /CRITICAL_SECURITY_VIOLATION.*protected REAL backend/
    );
    // Also the new env ref is rejected
    assert.throws(
      () => validateTargetProject('arbitrary-dummy-project', 'arbitrary-dummy-project'),
      /CRITICAL_SECURITY_VIOLATION/
    );
  } finally {
    if (originalEnv === undefined) {
      delete process.env.TIO_SUPABASE_REAL_REF;
    } else {
      process.env.TIO_SUPABASE_REAL_REF = originalEnv;
    }
  }

  // 5. Hardcoded constants verified directly
  assert.equal(HARDCODED_REAL_REF, 'bsfwzvgynwriswapxpsp');
  assert.equal(HARDCODED_TIO_WORLD_REF, 'oykupyiitspujzpwwvuj');
  assert.ok(IMMUTABLE_FORBIDDEN_PROJECTS.has('bsfwzvgynwriswapxpsp'));
  assert.ok(IMMUTABLE_FORBIDDEN_PROJECTS.has('oykupyiitspujzpwwvuj'));
});

test('2c. LIVE mode runner rejects forbidden targets before any dispatcher call (PRRT_kwDOVtCmZc66i_Kb)', async () => {
  let dispatcherCalled = false;
  const mockDispatcher = async () => {
    dispatcherCalled = true;
    return { passed: true, status: 200 };
  };

  await assert.rejects(
    () => runHostedProbeRunner({
      projectRef: HARDCODED_REAL_REF,
      tempRef: VALID_TEMP_REF,
      argv: ['--live'],
      env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
      mockDispatcher
    }),
    /CRITICAL_SECURITY_VIOLATION.*protected REAL backend/
  );

  await assert.rejects(
    () => runHostedProbeRunner({
      projectRef: HARDCODED_TIO_WORLD_REF,
      tempRef: VALID_TEMP_REF,
      argv: ['--live'],
      env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
      mockDispatcher
    }),
    /CRITICAL_SECURITY_VIOLATION.*Tio-world/
  );

  assert.equal(dispatcherCalled, false);
});

test('3. Empty or unauthorized project refs are rejected (deny-by-default)', () => {
  assert.throws(
    () => validateTargetProject('', VALID_TEMP_REF),
    /invalid_project_ref.*required and cannot be empty/
  );
  assert.throws(
    () => validateTargetProject('randomunknownproject123', VALID_TEMP_REF),
    /unauthorized_target.*not the authorized TEMP testbed project/
  );
});

test('4. Configured TEMP testbed project is accepted', () => {
  const ref = validateTargetProject(VALID_TEMP_REF, VALID_TEMP_REF);
  assert.equal(ref, VALID_TEMP_REF);
});

test('4b. Verified owner TEMP project ref (wvdabiwbaavfggcmpizd) is accepted and configured by default', () => {
  assert.equal(HARDCODED_TEMP_REF, 'wvdabiwbaavfggcmpizd');
  assert.equal(TIO_SUPABASE_TEMP_REF, 'wvdabiwbaavfggcmpizd');
  // Target validation passes using default configured tempRef
  const ref = validateTargetProject('wvdabiwbaavfggcmpizd');
  assert.equal(ref, 'wvdabiwbaavfggcmpizd');
  // Even with default TEMP ref, REAL and Tio-world remain strictly rejected
  assert.throws(
    () => validateTargetProject(HARDCODED_REAL_REF),
    /CRITICAL_SECURITY_VIOLATION.*protected REAL backend/
  );
  assert.throws(
    () => validateTargetProject(HARDCODED_TIO_WORLD_REF),
    /CRITICAL_SECURITY_VIOLATION.*Tio-world/
  );
});

test('5. Real customer domains are rejected for test identity', () => {
  assert.throws(
    () => validateTestIdentity('user@gmail.com'),
    /security_violation.*real customer.*prohibited/
  );
  assert.throws(
    () => validateTestIdentity('admin@yahoo.co.in'),
    /security_violation.*real customer.*prohibited/
  );
});

test('6. Reserved test domains are accepted for test identity', () => {
  assert.equal(validateTestIdentity('test-01@domain.invalid'), true);
  assert.equal(validateTestIdentity('test-02@domain.test'), true);
  assert.equal(validateTestIdentity('test-03@domain.example'), true);
});

test('7. Runner mode defaults strictly to DRY_RUN', () => {
  assert.equal(determineRunnerMode([], {}), 'DRY_RUN');
  assert.equal(determineRunnerMode(['--live'], {}), 'DRY_RUN');
  assert.equal(determineRunnerMode([], { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' }), 'DRY_RUN');
});

test('8. Runner mode returns LIVE only when BOTH flag and env var are present', () => {
  assert.equal(
    determineRunnerMode(['--live'], { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' }),
    'LIVE'
  );
});

// ---------------------------------------------------------------------------
// R2-03: Serialized JSON Secret Redaction Tests
// ---------------------------------------------------------------------------

test('9. Secret sanitization redacts JWTs, Bearer headers, query params, and nested credentials (PRRT_kwDOVtCmZc66ij55)', () => {
  const rawString = 'GET /api?token=secret_token_123&password=my_password&safe=1 Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature123';
  const sanitizedString = sanitizeData(rawString);
  assert.match(sanitizedString, /\?token=\[REDACTED\]/);
  assert.match(sanitizedString, /&password=\[REDACTED\]/);
  assert.match(sanitizedString, /Bearer \[REDACTED\]/);
  assert.ok(!sanitizedString.includes('secret_token_123'));
  assert.ok(!sanitizedString.includes('my_password'));
  assert.ok(!sanitizedString.includes('signature123'));

  const sensitiveObj = {
    apiKey: 'sbp_1234567890abcdef',
    password: 'SuperSecretPassword!',
    authorization: 'Bearer token_abc_xyz',
    safeField: 'public_string_value',
    nested: {
      clientSecret: 'secret_nested_key',
      userTokens: 'secret_token_list',
      items: ['token=element_1', 'safe_element_2']
    }
  };

  const sanitized = sanitizeData(sensitiveObj);
  assert.equal(sanitized.apiKey, '[REDACTED]');
  assert.equal(sanitized.password, '[REDACTED]');
  assert.equal(sanitized.authorization, '[REDACTED]');
  assert.equal(sanitized.safeField, 'public_string_value');
  assert.equal(sanitized.nested.clientSecret, '[REDACTED]');
  assert.equal(sanitized.nested.userTokens, '[REDACTED]');
  assert.equal(sanitized.nested.items[0], 'token=[REDACTED]');
  assert.equal(sanitized.nested.items[1], 'safe_element_2');
});

test('9b. Serialized JSON string secrets are recursively redacted (PRRT_kwDOVtCmZc66i_Kf)', () => {
  // 1. Exact review comment example
  const jsonString = '{"password":"PRIVATE_VALUE","refresh_token":"REFRESH_PRIVATE"}';
  const sanitizedJson = sanitizeData(jsonString);

  assert.ok(!sanitizedJson.includes('PRIVATE_VALUE'), 'PRIVATE_VALUE must be absent from sanitized JSON');
  assert.ok(!sanitizedJson.includes('REFRESH_PRIVATE'), 'REFRESH_PRIVATE must be absent from sanitized JSON');
  assert.match(sanitizedJson, /"password":\s*"\[REDACTED\]"/);
  assert.match(sanitizedJson, /"refresh_token":\s*"\[REDACTED\]"/);

  // 2. Nested serialized JSON inside response body
  const responseWithSerializedBody = {
    status: 200,
    body: '{"access_token":"SUPER_SECRET_BEARER","user":{"service_role":"ROLE_KEY_SECRET","email":"test@tio.invalid"}}',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer SENSITIVE_TOKEN_123'
    }
  };

  const sanitizedResponse = sanitizeData(responseWithSerializedBody);
  const bodyParsed = JSON.parse(sanitizedResponse.body);

  assert.equal(bodyParsed.access_token, '[REDACTED]');
  assert.equal(bodyParsed.user.service_role, '[REDACTED]');
  assert.equal(bodyParsed.user.email, 'test@tio.invalid'); // Safe diagnostic field preserved
  assert.equal(sanitizedResponse.headers.authorization, '[REDACTED]');
  assert.ok(!JSON.stringify(sanitizedResponse).includes('SUPER_SECRET_BEARER'));
  assert.ok(!JSON.stringify(sanitizedResponse).includes('ROLE_KEY_SECRET'));
  assert.ok(!JSON.stringify(sanitizedResponse).includes('SENSITIVE_TOKEN_123'));

  // 3. Unparseable/malformed JSON string fail-closed redaction
  const malformedJson = '{"password": "MALFORMED_PASSWORD_VALUE", "unclosed": ';
  const sanitizedMalformed = sanitizeData(malformedJson);
  assert.ok(!sanitizedMalformed.includes('MALFORMED_PASSWORD_VALUE'));
  assert.match(sanitizedMalformed, /"password":\s*"\[REDACTED\]/);
});

// ---------------------------------------------------------------------------
// R2-02: Strict Probe Outcome Validation Tests
// ---------------------------------------------------------------------------

test('10. Dry-run mode produces full probe plan with zero network requests', async () => {
  const result = await runHostedProbeRunner({
    projectRef: VALID_TEMP_REF,
    tempRef: VALID_TEMP_REF,
    argv: [], // dry run
    env: {}
  });

  assert.equal(result.status, 'DRY_RUN_COMPLETED');
  assert.equal(result.mode, 'DRY_RUN');
  assert.equal(result.zeroNetworkRequestsDispatched, true);
  assert.equal(result.plan.totalProbes, 18);
});

test('11. LIVE mode fails closed when no authorized network dispatcher is provided (PRRT_kwDOVtCmZc66ij5y)', async () => {
  await assert.rejects(
    () => runHostedProbeRunner({
      projectRef: VALID_TEMP_REF,
      tempRef: VALID_TEMP_REF,
      argv: ['--live'],
      env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' }
      // mockDispatcher is intentionally omitted
    }),
    /NO_HOSTED_DISPATCHER.*synthetic placeholder execution prohibited/
  );
});

test('12. Throttling interval is enforced between consecutive requests and legitimate passing run completes (PRRT_kwDOVtCmZc66ij56 & PRRT_kwDOVtCmZc66i_Kd)', async () => {
  const sleepCalls = [];
  const mockSleep = async (ms) => {
    sleepCalls.push(ms);
  };

  let probeCount = 0;
  // Dispatcher returns legitimate statuses and affirmative observations for each respective requirement (PRRT_kwDOVtCmZc66jLk1 & PRRT_kwDOVtCmZc66jNbH)
  const mockDispatcher = async (item) => {
    probeCount++;
    if (item.id === 'BYPASS-01') {
      return { passed: true, status: 422, route_disabled: true, error_code: 'email_provider_disabled' };
    }
    if (item.id === 'BYPASS-02') {
      return { passed: true, status: 422, signup_disabled: true, error_code: 'signup_disabled' };
    }
    if (item.id === 'BYPASS-03' || item.id === 'BYPASS-04') {
      return { passed: true, status: 500, hook_rejected: true, error: 'hook_error: 42501' };
    }
    if (item.id === 'BYPASS-05') {
      return { passed: true, status: 500, recovery_suppressed: true, zero_email_delivered: true };
    }
    if (item.id === 'HOOK-01') {
      return { passed: true, status: 200, has_token: true, amr_authenticated: true, tokens: { access_token: 'fake.jwt.token' } };
    }
    if (item.id === 'HOOK-02') {
      return { passed: true, status: 200, has_token: true, amr_preserved: true, tokens: { access_token: 'fresh.jwt.token' } };
    }
    if (['HOOK-03', 'HOOK-04', 'HOOK-05', 'HOOK-06', 'HOOK-07'].includes(item.id)) {
      return { passed: true, status: 500, hook_rejected: true, error: 'hook_error: 42501' };
    }
    if (item.id === 'SESSION-01') {
      return { passed: true, status: 200, session_created: true, session_id: 'sess-test-123' };
    }
    if (item.id === 'SESSION-02') {
      return { passed: true, status: 200, session_revoked: true, remaining_sessions: 0 };
    }
    if (item.id === 'SESSION-03') {
      return {
        passed: true,
        status: 403,
        pre_reset_baseline_verified: true,
        reset_completed: true,
        session_id: 'sess-test-123',
        correlated_session_id: 'sess-test-123',
        pre_session_id: 'sess-test-123',
        same_session_correlated: true,
        error_code: 'session_not_found'
      };
    }
    if (item.id === 'SESSION-04' || item.id === 'SESSION-05') {
      return { passed: true, status: 200, stateless_linger_documented: true, note: 'stateless linger window verified and documented' };
    }
    if (item.id === 'SESSION-06') {
      return {
        passed: true,
        status: 403,
        pre_reset_baseline_verified: true,
        reset_completed: true,
        session_id: 'sess-test-123',
        correlated_session_id: 'sess-test-123',
        pre_session_id: 'sess-test-123',
        same_session_correlated: true,
        rejection_observed: true,
        error_code: 'AuthSessionMissingError'
      };
    }
    return { passed: false, status: 500, reason: 'unrecognized probe case' };
  };

  const result = await runHostedProbeRunner({
    projectRef: VALID_TEMP_REF,
    tempRef: VALID_TEMP_REF,
    argv: ['--live'],
    env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
    mockDispatcher,
    sleepFn: mockSleep
  });

  assert.equal(result.status, 'COMPLETED');
  assert.equal(probeCount, 18);
  assert.equal(result.totalExecuted, 18);
  assert.equal(result.aborted, false);
  // For 18 requests, interval throttling must be invoked 17 times with 1000ms
  assert.equal(sleepCalls.length, 17);
  assert.ok(sleepCalls.every(ms => ms === 1000));
});

test('13. Runner halts immediately on Token Hook failure (HOOK-01) (PRRT_kwDOVtCmZc66iotG)', async () => {
  let probeCallCount = 0;

  const mockDispatcher = async (item) => {
    probeCallCount++;
    if (item.id === 'HOOK-01') {
      return { passed: false, status: 500, message: 'HOOK-01 failed: token claims missing amr_authenticated' };
    }
    if (item.id === 'BYPASS-01') {
      return { passed: true, status: 422, route_disabled: true, error_code: 'email_provider_disabled' };
    }
    if (item.id === 'BYPASS-02') {
      return { passed: true, status: 422, signup_disabled: true, error_code: 'signup_disabled' };
    }
    if (item.id === 'BYPASS-03' || item.id === 'BYPASS-04') {
      return { passed: true, status: 500, hook_rejected: true, error: 'hook_error: 42501' };
    }
    if (item.id === 'BYPASS-05') {
      return { passed: true, status: 500, recovery_suppressed: true, zero_email_delivered: true };
    }
    return { passed: true, status: 200, has_token: true, amr_authenticated: true, tokens: { access_token: 'fake.jwt' } };
  };

  const result = await runHostedProbeRunner({
    projectRef: VALID_TEMP_REF,
    tempRef: VALID_TEMP_REF,
    argv: ['--live'],
    env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
    mockDispatcher,
    sleepFn: async () => {}
  });

  assert.equal(result.status, 'HALTED_ON_FAILURE');
  assert.equal(result.aborted, true);
  assert.match(result.abortReason, /CRITICAL_SECURITY_FAILURE: Case HOOK-01 \(Token Hook\)/);
  // BYPASS-01..05 ran (5 cases), then HOOK-01 ran and failed (case 6)
  assert.equal(probeCallCount, 6);
});

test('14. Runner halts immediately on Session & Consumer failure (SESSION-03) (PRRT_kwDOVtCmZc66iotG)', async () => {
  let probeCallCount = 0;

  const mockDispatcher = async (item) => {
    probeCallCount++;
    if (item.id === 'SESSION-03') {
      return { passed: false, status: 200, message: 'SESSION-03 failed: revoked token was accepted' };
    }
    if (item.id === 'BYPASS-01') {
      return { passed: true, status: 422, route_disabled: true, error_code: 'email_provider_disabled' };
    }
    if (item.id === 'BYPASS-02') {
      return { passed: true, status: 422, signup_disabled: true, error_code: 'signup_disabled' };
    }
    if (item.id === 'BYPASS-03' || item.id === 'BYPASS-04') {
      return { passed: true, status: 500, hook_rejected: true, error: 'hook_error: 42501' };
    }
    if (item.id === 'BYPASS-05') {
      return { passed: true, status: 500, recovery_suppressed: true, zero_email_delivered: true };
    }
    if (item.id === 'HOOK-01') {
      return { passed: true, status: 200, has_token: true, amr_authenticated: true, tokens: { access_token: 'fake.jwt' } };
    }
    if (item.id === 'HOOK-02') {
      return { passed: true, status: 200, has_token: true, amr_preserved: true, tokens: { access_token: 'fresh.jwt' } };
    }
    if (['HOOK-03', 'HOOK-04', 'HOOK-05', 'HOOK-06', 'HOOK-07'].includes(item.id)) {
      return { passed: true, status: 500, hook_rejected: true, error: 'hook_error: 42501' };
    }
    if (item.id === 'SESSION-01') {
      return { passed: true, status: 200, session_created: true, session_id: 'sess-1' };
    }
    if (item.id === 'SESSION-02') {
      return { passed: true, status: 200, session_revoked: true, remaining_sessions: 0 };
    }
    return { passed: true, status: 200, session_created: true, session_id: 'sess-default' };
  };

  const result = await runHostedProbeRunner({
    projectRef: VALID_TEMP_REF,
    tempRef: VALID_TEMP_REF,
    argv: ['--live'],
    env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
    mockDispatcher,
    sleepFn: async () => {}
  });

  assert.equal(result.status, 'HALTED_ON_FAILURE');
  assert.equal(result.aborted, true);
  assert.match(result.abortReason, /CRITICAL_SECURITY_FAILURE: Case SESSION-03 \(Session & Consumer\)/);
  // BYPASS (5) + HOOK (7) + SESSION-01, SESSION-02, SESSION-03 (3) = 15 total calls
  assert.equal(probeCallCount, 15);
});

// Negative tests for PRRT_kwDOVtCmZc66i_Kd
test('15. Outcome without passed boolean fails closed (PRRT_kwDOVtCmZc66i_Kd)', async () => {
  const item = { id: 'BYPASS-01', category: 'Native Bypass', target: 'POST /auth/v1/otp' };
  const rawOutcome = { status: 500 }; // Missing `passed` property

  const validated = validateProbeOutcome(item, rawOutcome);
  assert.equal(validated.passed, false);
  assert.match(validated.reason, /MISSING_OR_NON_BOOLEAN_PASSED/);

  // In runner execution, halts immediately and does not complete
  const result = await runHostedProbeRunner({
    projectRef: VALID_TEMP_REF,
    tempRef: VALID_TEMP_REF,
    argv: ['--live'],
    env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
    mockDispatcher: async () => ({ status: 500 }),
    sleepFn: async () => {}
  });

  assert.equal(result.status, 'HALTED_ON_FAILURE');
  assert.equal(result.aborted, true);
  assert.equal(result.totalExecuted, 1);
});

test('16. False passed:true on BYPASS-01 with status 200 is overridden to FAIL (PRRT_kwDOVtCmZc66i_Kd)', async () => {
  const item = { id: 'BYPASS-01', category: 'Native Bypass', target: 'POST /auth/v1/otp' };
  const rawOutcome = { status: 200, passed: true }; // Claiming pass despite HTTP 200

  const validated = validateProbeOutcome(item, rawOutcome);
  assert.equal(validated.passed, false);
  assert.match(validated.reason, /HTTP_STATUS_MISMATCH: BYPASS-01 received HTTP 200/);

  // In runner execution, halts immediately
  const result = await runHostedProbeRunner({
    projectRef: VALID_TEMP_REF,
    tempRef: VALID_TEMP_REF,
    argv: ['--live'],
    env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
    mockDispatcher: async () => ({ status: 200, passed: true }),
    sleepFn: async () => {}
  });

  assert.equal(result.status, 'HALTED_ON_FAILURE');
  assert.equal(result.aborted, true);
});

test('17. Invalid payload structure fails closed (PRRT_kwDOVtCmZc66i_Kd)', () => {
  const item = { id: 'BYPASS-01', category: 'Native Bypass' };
  assert.equal(validateProbeOutcome(item, null).passed, false);
  assert.equal(validateProbeOutcome(item, undefined).passed, false);
  assert.equal(validateProbeOutcome(item, 'string-error').passed, false);
  assert.equal(validateProbeOutcome(item, 12345).passed, false);
});

test('18. Dispatcher exceptions and timeouts fail closed immediately (PRRT_kwDOVtCmZc66i_Kd)', async () => {
  const mockDispatcher = async () => {
    throw new Error('Connection refused / timeout communicating with target');
  };

  const result = await runHostedProbeRunner({
    projectRef: VALID_TEMP_REF,
    tempRef: VALID_TEMP_REF,
    argv: ['--live'],
    env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
    mockDispatcher,
    sleepFn: async () => {}
  });

  assert.equal(result.status, 'HALTED_ON_FAILURE');
  assert.equal(result.aborted, true);
  assert.match(result.abortReason, /DISPATCHER_EXCEPTION: Connection refused \/ timeout/);
  assert.equal(result.totalExecuted, 1);
});

test('19. Partial execution never returns COMPLETED (PRRT_kwDOVtCmZc66i_Kd)', async () => {
  let callCount = 0;
  const mockDispatcher = async (item) => {
    callCount++;
    if (callCount === 3) {
      // Abort or fail on case 3
      return { passed: false, status: 500, reason: 'Simulated network drop' };
    }
    if (item.id === 'BYPASS-01') {
      return { passed: true, status: 422, route_disabled: true, error_code: 'email_provider_disabled' };
    }
    if (item.id === 'BYPASS-02') {
      return { passed: true, status: 422, signup_disabled: true, error_code: 'signup_disabled' };
    }
    return { passed: true, status: 500, hook_rejected: true, error: 'hook_error: 42501' };
  };

  const result = await runHostedProbeRunner({
    projectRef: VALID_TEMP_REF,
    tempRef: VALID_TEMP_REF,
    argv: ['--live'],
    env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
    mockDispatcher,
    sleepFn: async () => {}
  });

  assert.notEqual(result.status, 'COMPLETED');
  assert.equal(result.status, 'HALTED_ON_FAILURE');
  assert.equal(result.totalExecuted, 3);
  assert.equal(result.totalExpected, 18);
});

test('20. Missing evidence on HOOK-01 fails closed (PRRT_kwDOVtCmZc66i_Kd & PRRT_kwDOVtCmZc66jG6V)', () => {
  const item = { id: 'HOOK-01', category: 'Token Hook', target: 'Password Sign-In' };
  // Legitimate sign-in returned 200 but has_token is omitted or false
  assert.equal(validateProbeOutcome(item, { passed: true, status: 200 }).passed, false);
  assert.equal(validateProbeOutcome(item, { passed: true, status: 200, has_token: false }).passed, false);

  const hook02 = { id: 'HOOK-02', category: 'Token Hook', target: 'Password Token Refresh' };
  assert.equal(validateProbeOutcome(hook02, { passed: true, status: 200 }).passed, false);
  assert.equal(validateProbeOutcome(hook02, { passed: true, status: 200, has_token: false }).passed, false);
});

test('21. Serialized secrets are absent from final runner evidence (PRRT_kwDOVtCmZc66i_Kf)', async () => {
  const secretPassword = 'SUPER_CONFIDENTIAL_PASSWORD_123!';
  const secretRefreshToken = 'SUPER_SECRET_REFRESH_TOKEN_XYZ';

  const mockDispatcher = async () => {
    return {
      passed: true,
      status: 422,
      route_disabled: true,
      error_code: 'email_provider_disabled',
      body: JSON.stringify({
        password: secretPassword,
        refresh_token: secretRefreshToken,
        diagnostic: 'safe_diagnostic_info'
      })
    };
  };

  const result = await runHostedProbeRunner({
    projectRef: VALID_TEMP_REF,
    tempRef: VALID_TEMP_REF,
    argv: ['--live'],
    env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
    mockDispatcher,
    sleepFn: async () => {}
  });

  const serializedResults = JSON.stringify(result);
  assert.ok(!serializedResults.includes(secretPassword), 'Secret password must not exist in final runner results');
  assert.ok(!serializedResults.includes(secretRefreshToken), 'Secret refresh token must not exist in final runner results');
  assert.ok(serializedResults.includes('safe_diagnostic_info'), 'Harmless diagnostic info should be preserved');
});

test('22. Session cases fail closed without explicit evidence of session state (PRRT_kwDOVtCmZc66jG6V & PRRT_kwDOVtCmZc66jNbH)', () => {
  // SESSION-01 requires explicit session_created: true AND session row evidence
  const session01 = { id: 'SESSION-01', category: 'Session & Consumer' };
  assert.equal(validateProbeOutcome(session01, { passed: true, status: 200 }).passed, false);
  assert.equal(validateProbeOutcome(session01, { passed: true, status: 200, session_created: false }).passed, false);
  assert.equal(validateProbeOutcome(session01, { passed: true, status: 200, session_created: true }).passed, false);
  assert.equal(validateProbeOutcome(session01, { passed: true, status: 200, session_created: true, session_id: 'sess-1' }).passed, true);

  // SESSION-02 requires remaining_sessions: 0 AND session_revoked: true
  const session02 = { id: 'SESSION-02', category: 'Session & Consumer' };
  assert.equal(validateProbeOutcome(session02, { passed: true, status: 200 }).passed, false);
  assert.equal(validateProbeOutcome(session02, { passed: true, status: 200, remaining_sessions: 1 }).passed, false);
  assert.equal(validateProbeOutcome(session02, { passed: true, status: 200, remaining_sessions: 0 }).passed, false);
  assert.equal(validateProbeOutcome(session02, { passed: true, status: 200, remaining_sessions: 0, session_revoked: true }).passed, true);

  // SESSION-04 & SESSION-05 require stateless linger documentation/evidence (non-empty string or object)
  const session04 = { id: 'SESSION-04', category: 'Session & Consumer' };
  assert.equal(validateProbeOutcome(session04, { passed: true, status: 200 }).passed, false);
  assert.equal(validateProbeOutcome(session04, { passed: true, status: 200, stateless_linger_documented: true }).passed, false);
  assert.equal(validateProbeOutcome(session04, { passed: true, status: 200, stateless_linger_documented: true, note: '' }).passed, false);
  assert.equal(validateProbeOutcome(session04, { passed: true, status: 200, stateless_linger_documented: true, note: 'linger window verified' }).passed, true);
});

test('23. Top-level abortReason is sanitized against leaked secrets (PRRT_kwDOVtCmZc66jG6Y)', async () => {
  const secretKey = 'sbp_secret_sensitive_api_key_value_999';

  const mockDispatcher = async () => {
    throw new Error(`Dispatch failure with token: Bearer ${secretKey}`);
  };

  const result = await runHostedProbeRunner({
    projectRef: VALID_TEMP_REF,
    tempRef: VALID_TEMP_REF,
    argv: ['--live'],
    env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
    mockDispatcher,
    sleepFn: async () => {}
  });

  assert.equal(result.status, 'HALTED_ON_FAILURE');
  assert.ok(!result.abortReason.includes(secretKey), 'Secret key must be redacted in abortReason');
  assert.match(result.abortReason, /Bearer \[REDACTED\]/);
});

test('24. Per-probe timeout halts runner on never-settling Promise and aborts subsequent probes (PRRT_kwDOVtCmZc66jOw5)', async () => {
  let calls = 0;
  let receivedSignal = null;

  const neverSettlingDispatcher = async (item, { signal }) => {
    calls++;
    receivedSignal = signal;
    // Return a promise that never settles (neither resolves nor rejects)
    return new Promise(() => {});
  };

  const result = await runHostedProbeRunner({
    projectRef: HARDCODED_TEMP_REF,
    argv: ['--live'],
    env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
    mockDispatcher: neverSettlingDispatcher,
    probeTimeoutMs: 50, // fast bounded timeout for deterministic unit test
    sleepFn: async () => {}
  });

  assert.equal(result.status, 'HALTED_ON_FAILURE');
  assert.equal(result.aborted, true);
  assert.equal(calls, 1, 'Only one probe should dispatch; subsequent probes must be blocked');
  assert.ok(receivedSignal && receivedSignal.aborted, 'AbortSignal should be triggered on timeout');
  assert.match(result.abortReason, /PROBE_TIMEOUT/);
  assert.equal(result.results[0].outcome.passed, false);
  assert.match(result.results[0].outcome.reason, /PROBE_TIMEOUT/);
});

test('25. LIVE mode rejects caller-controlled tempRef spoofing and unapproved target refs (PRRT_kwDOVtCmZc66jOw4)', async () => {
  let dispatcherCalled = false;
  const mockDispatcher = async () => {
    dispatcherCalled = true;
    return { passed: true, status: 200 };
  };

  // Case A: Caller passes forged target and matching forged tempRef in LIVE mode
  await assert.rejects(
    () => runHostedProbeRunner({
      projectRef: 'forged-attacker-project',
      tempRef: 'forged-attacker-project',
      argv: ['--live'],
      env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
      mockDispatcher
    }),
    /CRITICAL_SECURITY_VIOLATION.*tempRef spoofing rejected/
  );

  // Case B: Caller passes forged target with default tempRef in LIVE mode
  await assert.rejects(
    () => runHostedProbeRunner({
      projectRef: 'forged-attacker-project',
      argv: ['--live'],
      env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
      mockDispatcher
    }),
    /unauthorized_target.*strictly requires approved owner TEMP project/
  );

  // Case C: Environment variable override cannot bypass approved TEMP ref in LIVE mode
  const originalEnv = process.env.TIO_SUPABASE_TEMP_REF;
  try {
    process.env.TIO_SUPABASE_TEMP_REF = 'forged-attacker-project';
    await assert.rejects(
      () => runHostedProbeRunner({
        projectRef: 'forged-attacker-project',
        argv: ['--live'],
        env: {
          TASK06I_HOSTED_PROBE_AUTHORIZED: 'true',
          TIO_SUPABASE_TEMP_REF: 'forged-attacker-project'
        },
        mockDispatcher
      }),
      /unauthorized_target.*strictly requires approved owner TEMP project/
    );
  } finally {
    if (originalEnv === undefined) {
      delete process.env.TIO_SUPABASE_TEMP_REF;
    } else {
      process.env.TIO_SUPABASE_TEMP_REF = originalEnv;
    }
  }

  assert.equal(dispatcherCalled, false, 'No dispatcher calls should occur on unauthorized target');
});

test('26. validateProbeOutcome rejects status 0, missing status, and false-positive booleans without evidence (PRRT_kwDOVtCmZc66jLk1 & PRRT_kwDOVtCmZc66jNbH)', () => {
  // SESSION-03 with status 0
  const session03 = { id: 'SESSION-03', category: 'Session & Consumer' };
  assert.equal(validateProbeOutcome(session03, { passed: true, status: 0 }).passed, false);
  assert.match(validateProbeOutcome(session03, { passed: true, status: 0 }).reason, /INVALID_HTTP_STATUS/);

  // SESSION-03 with missing status
  assert.equal(validateProbeOutcome(session03, { passed: true }).passed, false);

  // SESSION-03 with status 403 but missing rejection evidence
  assert.equal(validateProbeOutcome(session03, { passed: true, status: 403 }).passed, false);
  assert.match(validateProbeOutcome(session03, { passed: true, status: 403 }).reason, /MISSING_EVIDENCE/);

  // SESSION-03 requires valid same-session baseline, reset completion, correlation, and revocation-specific error
  assert.equal(validateProbeOutcome(session03, {
    passed: true,
    status: 403,
    pre_reset_baseline_verified: true,
    reset_completed: true,
    session_id: 'sess-test-123',
    correlated_session_id: 'sess-test-123',
    pre_session_id: 'sess-test-123',
    same_session_correlated: true,
    error_code: 'session_not_found'
  }).passed, true);

  // SESSION-06 with status 0
  const session06 = { id: 'SESSION-06', category: 'Session & Consumer' };
  assert.equal(validateProbeOutcome(session06, { passed: true, status: 0 }).passed, false);
  assert.equal(validateProbeOutcome(session06, { passed: true, status: 403 }).passed, false);
  assert.equal(validateProbeOutcome(session06, {
    passed: true,
    status: 403,
    pre_reset_baseline_verified: true,
    reset_completed: true,
    session_id: 'sess-test-123',
    correlated_session_id: 'sess-test-123',
    pre_session_id: 'sess-test-123',
    same_session_correlated: true,
    rejection_observed: true,
    error_code: 'AuthSessionMissingError'
  }).passed, true);

  // HOOK-01 with empty object or empty array for tokens
  const hook01 = { id: 'HOOK-01', category: 'Token Hook' };
  assert.equal(validateProbeOutcome(hook01, { passed: true, status: 200, has_token: true, tokens: {} }).passed, false);
  assert.equal(validateProbeOutcome(hook01, { passed: true, status: 200, has_token: true, tokens: [] }).passed, false);
  assert.equal(validateProbeOutcome(hook01, { passed: true, status: 200, has_token: true, tokens: { access_token: 'valid.token' }, amr_authenticated: true }).passed, true);

  // SESSION-04 with empty note / empty object evidence
  const session04 = { id: 'SESSION-04', category: 'Session & Consumer' };
  assert.equal(validateProbeOutcome(session04, { passed: true, status: 200, stateless_linger_documented: true, note: '' }).passed, false);
  assert.equal(validateProbeOutcome(session04, { passed: true, status: 200, stateless_linger_documented: true, evidence: {} }).passed, false);
  assert.equal(validateProbeOutcome(session04, { passed: true, status: 200, stateless_linger_documented: true, note: 'linger window verified' }).passed, true);

  // BYPASS-05 recovery suppression without affirmative evidence
  const bypass05 = { id: 'BYPASS-05', category: 'Native Bypass' };
  assert.equal(validateProbeOutcome(bypass05, { passed: true, status: 500 }).passed, false);
  assert.match(validateProbeOutcome(bypass05, { passed: true, status: 500 }).reason, /MISSING_EVIDENCE/);
  assert.equal(validateProbeOutcome(bypass05, { passed: true, status: 500, recovery_suppressed: true }).passed, true);
});

test('27. Complete returned report is recursively sanitized with zero credential leakage (PRRT_kwDOVtCmZc66jLk3)', async () => {
  const secretPassword = 'my-secret-synthetic-review-password';
  const secretToken = 'my-secret-synthetic-review-token';

  const mockDispatcher = async () => {
    const err = new Error(`request failed password=${secretPassword} access_token=${secretToken}`);
    throw err;
  };

  const result = await runHostedProbeRunner({
    projectRef: HARDCODED_TEMP_REF,
    argv: ['--live'],
    env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
    mockDispatcher,
    sleepFn: async () => {}
  });

  const serializedReport = JSON.stringify(result);
  assert.ok(!serializedReport.includes(secretPassword), 'Secret password must not exist anywhere in returned report');
  assert.ok(!serializedReport.includes(secretToken), 'Secret token must not exist anywhere in returned report');
  assert.match(result.abortReason, /password=\[REDACTED\]/);
  assert.match(result.abortReason, /access_token=\[REDACTED\]/);
});

test('28. Require actual session revocation proof and reject false-proof errors (SESSION-03 & SESSION-06) (PRRT_kwDOVtCmZc66jdT2)', () => {
  const session03 = { id: 'SESSION-03', category: 'Session & Consumer', target: 'User Endpoint' };

  // 1. Previously invalid JWT (error_code: bad_jwt) fails closed
  const badJwtOutcome = {
    passed: true,
    status: 401,
    error_code: 'bad_jwt',
    error: 'invalid JWT signature',
    pre_reset_baseline_verified: true,
    reset_completed: true,
    session_id: 'sess-test-1',
    same_session_correlated: true
  };
  const resBadJwt = validateProbeOutcome(session03, badJwtOutcome);
  assert.equal(resBadJwt.passed, false);
  assert.match(resBadJwt.reason, /FALSE_PROOF_REJECTED.*bad_jwt/);

  // 2. Expired JWT fails closed
  const expiredOutcome = {
    passed: true,
    status: 401,
    error_code: 'token_expired',
    error: 'session expired',
    pre_reset_baseline_verified: true,
    reset_completed: true,
    session_id: 'sess-test-1',
    same_session_correlated: true
  };
  const resExpired = validateProbeOutcome(session03, expiredOutcome);
  assert.equal(resExpired.passed, false);
  assert.match(resExpired.reason, /FALSE_PROOF_REJECTED.*token_expired/);

  // 3. Missing pre-reset baseline fails closed
  const missingBaseline = {
    passed: true,
    status: 403,
    reset_completed: true,
    session_id: 'sess-test-1',
    same_session_correlated: true,
    error_code: 'session_not_found'
  };
  const resMissingBase = validateProbeOutcome(session03, missingBaseline);
  assert.equal(resMissingBase.passed, false);
  assert.match(resMissingBase.reason, /MISSING_EVIDENCE.*pre-reset.*baseline/);

  // 4. Failed reset operation fails closed
  const failedReset = {
    passed: true,
    status: 403,
    pre_reset_baseline_verified: true,
    reset_completed: false,
    session_id: 'sess-test-1',
    same_session_correlated: true,
    error_code: 'session_not_found'
  };
  const resFailedReset = validateProbeOutcome(session03, failedReset);
  assert.equal(resFailedReset.passed, false);
  assert.match(resFailedReset.reason, /MISSING_EVIDENCE.*invalidation operation completed/);

  // 5. Correlation & pre-reset identity tests (PRRT_kwDOVtCmZc66joKl, PRRT_kwDOVtCmZc66kQA9)
  // 5a. Missing explicit pre-reset identity fails closed
  const noPreId03 = {
    passed: true,
    status: 403,
    pre_reset_baseline_verified: true,
    reset_completed: true,
    session_id: 'sess-B',
    same_session_correlated: true,
    error_code: 'session_not_found'
  };
  const resNoPreId03 = validateProbeOutcome(session03, noPreId03);
  assert.equal(resNoPreId03.passed, false);
  assert.match(resNoPreId03.reason, /SESSION_CORRELATION_MISMATCH.*requires an explicit pre-reset session identifier/);

  // 5b. session_id B, correlated_session_id B, pre_session_id A -> FAIL
  const resContradictoryPre03 = validateProbeOutcome(session03, {
    passed: true,
    status: 403,
    pre_reset_baseline_verified: true,
    reset_completed: true,
    session_id: 'sess-B',
    correlated_session_id: 'sess-B',
    pre_session_id: 'sess-A',
    same_session_correlated: true,
    error_code: 'session_not_found'
  });
  assert.equal(resContradictoryPre03.passed, false);
  assert.match(resContradictoryPre03.reason, /SESSION_CORRELATION_MISMATCH.*pre-reset session identifier 'sess-A' does not match post-reset session 'sess-B'/);

  // 5c. session_id B, correlated_session_id A, pre_session_id B -> FAIL
  const resContradictoryCorrelated03 = validateProbeOutcome(session03, {
    passed: true,
    status: 403,
    pre_reset_baseline_verified: true,
    reset_completed: true,
    session_id: 'sess-B',
    correlated_session_id: 'sess-A',
    pre_session_id: 'sess-B',
    same_session_correlated: true,
    error_code: 'session_not_found'
  });
  assert.equal(resContradictoryCorrelated03.passed, false);
  assert.match(resContradictoryCorrelated03.reason, /SESSION_CORRELATION_MISMATCH.*correlated_session_id 'sess-A' does not match post-reset session 'sess-B'/);

  // 5d. same_session_correlated: true with contradictory IDs -> FAIL
  const resContradictoryFlag03 = validateProbeOutcome(session03, {
    passed: true,
    status: 403,
    pre_reset_baseline_verified: true,
    reset_completed: true,
    session_id: 'sess-B',
    correlated_session_id: 'sess-A',
    same_session_correlated: true,
    error_code: 'session_not_found'
  });
  assert.equal(resContradictoryFlag03.passed, false);
  assert.match(resContradictoryFlag03.reason, /SESSION_CORRELATION_MISMATCH/);

  // 5e. Empty or malformed identifiers -> FAIL
  assert.equal(validateProbeOutcome(session03, {
    passed: true, status: 403, pre_reset_baseline_verified: true, reset_completed: true,
    session_id: 'sess-B', pre_session_id: '', error_code: 'session_not_found'
  }).passed, false);
  assert.equal(validateProbeOutcome(session03, {
    passed: true, status: 403, pre_reset_baseline_verified: true, reset_completed: true,
    session_id: 'sess-B', correlated_session_id: '', error_code: 'session_not_found'
  }).passed, false);
  assert.equal(validateProbeOutcome(session03, {
    passed: true, status: 403, pre_reset_baseline_verified: true, reset_completed: true,
    session_id: 'sess-B', pre_session_id: 123, error_code: 'session_not_found'
  }).passed, false);
  assert.equal(validateProbeOutcome(session03, {
    passed: true, status: 403, pre_reset_baseline_verified: true, reset_completed: true,
    session_id: '', pre_session_id: 'sess-B', error_code: 'session_not_found'
  }).passed, false);

  // 5f. same_session_correlated: false -> FAIL
  const resFalseFlag03 = validateProbeOutcome(session03, {
    passed: true,
    status: 403,
    pre_reset_baseline_verified: true,
    reset_completed: true,
    session_id: 'sess-B',
    pre_session_id: 'sess-B',
    same_session_correlated: false,
    error_code: 'session_not_found'
  });
  assert.equal(resFalseFlag03.passed, false);
  assert.match(resFalseFlag03.reason, /SESSION_CORRELATION_MISMATCH.*flag indicates session mismatch/);

  // 6. Generic 401/403 without revocation evidence fails closed
  const generic403 = {
    passed: true,
    status: 403,
    pre_reset_baseline_verified: true,
    reset_completed: true,
    session_id: 'sess-test-1',
    pre_session_id: 'sess-test-1',
    same_session_correlated: true,
    rejection_observed: true
    // omitted revocation_verified or error_code session_not_found
  };
  const resGeneric = validateProbeOutcome(session03, generic403);
  assert.equal(resGeneric.passed, false);
  assert.match(resGeneric.reason, /MISSING_EVIDENCE.*revocation-specific evidence/);

  // 7. Valid same-session before/after simulated revocation passes
  // 7a. session_id B, correlated_session_id B, pre_session_id B -> PASS
  const validRevocationAll = {
    passed: true,
    status: 403,
    pre_reset_baseline_verified: true,
    reset_completed: true,
    session_id: 'sess-test-1',
    correlated_session_id: 'sess-test-1',
    pre_session_id: 'sess-test-1',
    same_session_correlated: true,
    error_code: 'session_not_found',
    revocation_verified: true
  };
  const resValidAll = validateProbeOutcome(session03, validRevocationAll);
  assert.equal(resValidAll.passed, true);
  assert.equal(resValidAll.status, 403);

  // 7b. session_id B, pre_session_id B -> PASS
  const validRevocationPre = {
    passed: true,
    status: 403,
    pre_reset_baseline_verified: true,
    reset_completed: true,
    session_id: 'sess-test-1',
    pre_session_id: 'sess-test-1',
    error_code: 'session_not_found',
    revocation_verified: true
  };
  assert.equal(validateProbeOutcome(session03, validRevocationPre).passed, true);

  // 8. SESSION-06 affirmative revocation proof & correlation checks (PRRT_kwDOVtCmZc66jlyg, PRRT_kwDOVtCmZc66joKl, PRRT_kwDOVtCmZc66kQA9)
  const session06 = { id: 'SESSION-06', category: 'Session & Consumer', target: 'Edge Function' };

  // 8a. AuthSessionMissingError alone without pre-reset baseline fails closed
  const resEdgeAlone = validateProbeOutcome(session06, { passed: true, status: 403, error_code: 'AuthSessionMissingError' });
  assert.equal(resEdgeAlone.passed, false);
  assert.match(resEdgeAlone.reason, /MISSING_EVIDENCE.*pre-reset session baseline/);

  // 8b. Previously invalid JWT (bad_jwt) fails closed
  const resEdgeBadJwt = validateProbeOutcome(session06, {
    passed: true,
    status: 401,
    error_code: 'bad_jwt',
    pre_reset_baseline_verified: true,
    reset_completed: true,
    session_id: 'sess-edge-1',
    pre_session_id: 'sess-edge-1'
  });
  assert.equal(resEdgeBadJwt.passed, false);
  assert.match(resEdgeBadJwt.reason, /FALSE_PROOF_REJECTED.*bad_jwt/);

  // 8c. Expired JWT fails closed
  const resEdgeExpired = validateProbeOutcome(session06, {
    passed: true,
    status: 401,
    error_code: 'token_expired',
    pre_reset_baseline_verified: true,
    reset_completed: true,
    session_id: 'sess-edge-1',
    pre_session_id: 'sess-edge-1'
  });
  assert.equal(resEdgeExpired.passed, false);
  assert.match(resEdgeExpired.reason, /FALSE_PROOF_REJECTED.*token_expired/);

  // 8d. Missing pre-reset baseline fails closed
  const resEdgeNoBase = validateProbeOutcome(session06, {
    passed: true,
    status: 403,
    reset_completed: true,
    session_id: 'sess-edge-1',
    pre_session_id: 'sess-edge-1',
    error_code: 'AuthSessionMissingError'
  });
  assert.equal(resEdgeNoBase.passed, false);
  assert.match(resEdgeNoBase.reason, /MISSING_EVIDENCE.*pre-reset session baseline/);

  // 8e. Failed reset operation fails closed
  const resEdgeFailedReset = validateProbeOutcome(session06, {
    passed: true,
    status: 403,
    pre_reset_baseline_verified: true,
    reset_completed: false,
    session_id: 'sess-edge-1',
    pre_session_id: 'sess-edge-1',
    error_code: 'AuthSessionMissingError'
  });
  assert.equal(resEdgeFailedReset.passed, false);
  assert.match(resEdgeFailedReset.reason, /MISSING_EVIDENCE.*invalidation operation completed/);

  // 8f. Correlation & pre-reset identity tests on SESSION-06 (R6-01 & R6-02)
  // 8f-1. Missing explicit pre-reset identity fails closed
  const resEdgeNoPreId = validateProbeOutcome(session06, {
    passed: true,
    status: 403,
    pre_reset_baseline_verified: true,
    reset_completed: true,
    session_id: 'sess-B',
    same_session_correlated: true,
    error_code: 'AuthSessionMissingError'
  });
  assert.equal(resEdgeNoPreId.passed, false);
  assert.match(resEdgeNoPreId.reason, /SESSION_CORRELATION_MISMATCH.*requires an explicit pre-reset session identifier/);

  // 8f-2. session_id B, correlated_session_id B, pre_session_id A -> FAIL
  const resEdgeContradictoryPre = validateProbeOutcome(session06, {
    passed: true,
    status: 403,
    pre_reset_baseline_verified: true,
    reset_completed: true,
    session_id: 'sess-B',
    correlated_session_id: 'sess-B',
    pre_session_id: 'sess-A',
    same_session_correlated: true,
    error_code: 'AuthSessionMissingError'
  });
  assert.equal(resEdgeContradictoryPre.passed, false);
  assert.match(resEdgeContradictoryPre.reason, /SESSION_CORRELATION_MISMATCH.*pre-reset session identifier 'sess-A' does not match post-reset session 'sess-B'/);

  // 8f-3. session_id B, correlated_session_id A, pre_session_id B -> FAIL
  const resEdgeContradictoryCorrelated = validateProbeOutcome(session06, {
    passed: true,
    status: 403,
    pre_reset_baseline_verified: true,
    reset_completed: true,
    session_id: 'sess-B',
    correlated_session_id: 'sess-A',
    pre_session_id: 'sess-B',
    same_session_correlated: true,
    error_code: 'AuthSessionMissingError'
  });
  assert.equal(resEdgeContradictoryCorrelated.passed, false);
  assert.match(resEdgeContradictoryCorrelated.reason, /SESSION_CORRELATION_MISMATCH.*correlated_session_id 'sess-A' does not match post-reset session 'sess-B'/);

  // 8f-4. same_session_correlated: true with contradictory IDs -> FAIL
  const resEdgeContradictoryFlag = validateProbeOutcome(session06, {
    passed: true,
    status: 403,
    pre_reset_baseline_verified: true,
    reset_completed: true,
    session_id: 'sess-B',
    correlated_session_id: 'sess-A',
    same_session_correlated: true,
    error_code: 'AuthSessionMissingError'
  });
  assert.equal(resEdgeContradictoryFlag.passed, false);
  assert.match(resEdgeContradictoryFlag.reason, /SESSION_CORRELATION_MISMATCH/);

  // 8f-5. Empty or malformed identifiers -> FAIL
  assert.equal(validateProbeOutcome(session06, {
    passed: true, status: 403, pre_reset_baseline_verified: true, reset_completed: true,
    session_id: 'sess-B', pre_session_id: '', error_code: 'AuthSessionMissingError'
  }).passed, false);
  assert.equal(validateProbeOutcome(session06, {
    passed: true, status: 403, pre_reset_baseline_verified: true, reset_completed: true,
    session_id: 'sess-B', correlated_session_id: '', error_code: 'AuthSessionMissingError'
  }).passed, false);
  assert.equal(validateProbeOutcome(session06, {
    passed: true, status: 403, pre_reset_baseline_verified: true, reset_completed: true,
    session_id: 'sess-B', pre_session_id: 123, error_code: 'AuthSessionMissingError'
  }).passed, false);
  assert.equal(validateProbeOutcome(session06, {
    passed: true, status: 403, pre_reset_baseline_verified: true, reset_completed: true,
    session_id: '', pre_session_id: 'sess-B', error_code: 'AuthSessionMissingError'
  }).passed, false);

  // 8f-6. same_session_correlated: false -> FAIL
  const resEdgeFalseFlag = validateProbeOutcome(session06, {
    passed: true,
    status: 403,
    pre_reset_baseline_verified: true,
    reset_completed: true,
    session_id: 'sess-B',
    pre_session_id: 'sess-B',
    same_session_correlated: false,
    error_code: 'AuthSessionMissingError'
  });
  assert.equal(resEdgeFalseFlag.passed, false);
  assert.match(resEdgeFalseFlag.reason, /SESSION_CORRELATION_MISMATCH.*flag indicates session mismatch/);

  // 8g. Generic 403 without revocation evidence fails closed
  const resEdgeGeneric = validateProbeOutcome(session06, {
    passed: true,
    status: 403,
    pre_reset_baseline_verified: true,
    reset_completed: true,
    session_id: 'sess-edge-1',
    pre_session_id: 'sess-edge-1',
    same_session_correlated: true,
    rejection_observed: true
  });
  assert.equal(resEdgeGeneric.passed, false);
  assert.match(resEdgeGeneric.reason, /MISSING_EVIDENCE.*revocation-specific evidence/);

  // 8h. Valid same-session baseline, reset completion, correlation, and AuthSessionMissingError passes
  // (session_id B, correlated_session_id B, pre_session_id B -> PASS)
  const resEdgeValid = validateProbeOutcome(session06, {
    passed: true,
    status: 403,
    pre_reset_baseline_verified: true,
    reset_completed: true,
    session_id: 'sess-edge-1',
    correlated_session_id: 'sess-edge-1',
    pre_session_id: 'sess-edge-1',
    same_session_correlated: true,
    error_code: 'AuthSessionMissingError'
  });
  assert.equal(resEdgeValid.passed, true);
  assert.equal(resEdgeValid.status, 403);

  // 8i. Valid same-session baseline, reset completion, correlation, and rejection_observed with revocation_verified passes
  const resEdgeValid2 = validateProbeOutcome(session06, {
    passed: true,
    status: 401,
    pre_reset_baseline_verified: true,
    reset_completed: true,
    session_id: 'sess-edge-1',
    correlated_session_id: 'sess-edge-1',
    pre_session_id: 'sess-edge-1',
    same_session_correlated: true,
    rejection_observed: true,
    revocation_verified: true
  });
  assert.equal(resEdgeValid2.passed, true);
  assert.equal(resEdgeValid2.status, 401);

  // 8j. Auth API error code session_not_found fails closed on SESSION-06 (PRRT_kwDOVtCmZc66kR_R)
  const resEdgeSessionNotFound = validateProbeOutcome(session06, {
    passed: true,
    status: 403,
    pre_reset_baseline_verified: true,
    reset_completed: true,
    session_id: 'sess-edge-1',
    correlated_session_id: 'sess-edge-1',
    pre_session_id: 'sess-edge-1',
    same_session_correlated: true,
    error_code: 'session_not_found'
  });
  assert.equal(resEdgeSessionNotFound.passed, false);
  assert.match(resEdgeSessionNotFound.reason, /MISSING_EVIDENCE.*revocation-specific evidence/);
});

test('29. Quoted credentials with whitespace, ampersands, and escaped quotes are completely redacted (PRRT_kwDOVtCmZc66jdT4, PRRT_kwDOVtCmZc66joKm, PRRT_kwDOVtCmZc66kR_F, PRRT_kwDOVtCmZc66kR_N)', async () => {
  const secretWithLeadingSpace = ' synthetic-review-password';
  const secretWithAmpersand = 'alpha beta&gamma';
  const singleQuotedToken = 'synthetic access token';

  // 1. Direct unit tests on redactSensitiveFields parser
  assert.equal(redactSensitiveFields('password="my\\"secret\\"done"'), 'password="[REDACTED]"');
  assert.equal(redactSensitiveFields('password="my\\"secret'), 'password="[REDACTED]');
  assert.equal(redactSensitiveFields("access_token='my\\'token"), "access_token='[REDACTED]");
  assert.equal(redactSensitiveFields('details: password="my\\"secret and next'), 'details: password="[REDACTED]');

  // Compound secret keys (PRRT_kwDOVtCmZc66kR_F)
  assert.equal(redactSensitiveFields('client_secret="my-client-secret"'), 'client_secret="[REDACTED]"');
  assert.equal(redactSensitiveFields('id_token="my-id-token"'), 'id_token="[REDACTED]"');
  assert.equal(redactSensitiveFields("jwt_secret='my-jwt-secret'"), "jwt_secret='[REDACTED]'");
  assert.equal(redactSensitiveFields('auth_token=my-unquoted-token and more'), 'auth_token=[REDACTED] and more');
  assert.equal(redactSensitiveFields('payload: {"client_secret":"sec123","id_token":"tok456"}'), 'payload: {"client_secret":"[REDACTED]","id_token":"[REDACTED]"}');

  // Escaped quote parity & inner escaped quotes (PRRT_kwDOVtCmZc66kR_N)
  assert.equal(redactSensitiveFields('password=\\"my\\\\\\"inner\\\\\\"secret\\"'), 'password=\\"[REDACTED]\\"');
  assert.equal(redactSensitiveFields('password=\\"my\\\\\\"inner secret and more'), 'password=\\"[REDACTED]');

  // 2. Unit tests on sanitizeData string handling directly
  const s1 = `Error('request failed password="${secretWithLeadingSpace}"')`;
  assert.equal(sanitizeData(s1), 'Error(\'request failed password="[REDACTED]"\')');
  assert.ok(!sanitizeData(s1).includes(secretWithLeadingSpace));

  const s2 = `details: password="${secretWithAmpersand}" and next`;
  assert.equal(sanitizeData(s2), 'details: password="[REDACTED]" and next');
  assert.ok(!sanitizeData(s2).includes(secretWithAmpersand));

  const s3 = `header: access_token='${singleQuotedToken}'`;
  assert.equal(sanitizeData(s3), "header: access_token='[REDACTED]'");
  assert.ok(!sanitizeData(s3).includes(singleQuotedToken));

  const s4 = `Error('request failed password="${secretWithLeadingSpace}" access_token=\'${singleQuotedToken}\'')`;
  const sanitizedS4 = sanitizeData(s4);
  assert.ok(!sanitizedS4.includes(secretWithLeadingSpace));
  assert.ok(!sanitizedS4.includes(singleQuotedToken));

  // Escaped and unclosed quote tests (PRRT_kwDOVtCmZc66joKm)
  const s5 = 'password="my\\"secret"';
  assert.equal(sanitizeData(s5), 'password="[REDACTED]"');
  const s6 = 'password="my\\"secret';
  assert.equal(sanitizeData(s6), 'password="[REDACTED]');
  const s7 = "access_token='my\\'token";
  assert.equal(sanitizeData(s7), "access_token='[REDACTED]");

  // Compound secret keys & escaped quotes in sanitizeData (PRRT_kwDOVtCmZc66kR_F, PRRT_kwDOVtCmZc66kR_N)
  const sCompound = 'client_secret="sec123" and id_token="tok456"';
  assert.equal(sanitizeData(sCompound), 'client_secret="[REDACTED]" and id_token="[REDACTED]"');
  const sEscapedInner = 'Error: password=\\"my\\\\\\"secret\\"';
  assert.equal(sanitizeData(sEscapedInner), 'Error: password=\\"[REDACTED]\\"');
  const objCompound = { client_secret: 'sec123', nested: { id_token: 'tok456', ok: 'fine' } };
  const sanitizedObj = sanitizeData(objCompound);
  assert.equal(sanitizedObj.client_secret, '[REDACTED]');
  assert.equal(sanitizedObj.nested.id_token, '[REDACTED]');
  assert.equal(sanitizedObj.nested.ok, 'fine');

  // 3. End-to-end runner test with quoted exception from dispatcher
  const mockDispatcher = async () => {
    throw new Error(`request failed password="${secretWithLeadingSpace}" access_token='${singleQuotedToken}'`);
  };

  const result = await runHostedProbeRunner({
    projectRef: HARDCODED_TEMP_REF,
    argv: ['--live'],
    env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
    mockDispatcher,
    sleepFn: async () => {}
  });

  const serializedReport = JSON.stringify(result);
  assert.ok(!serializedReport.includes(secretWithLeadingSpace), 'Secret with leading whitespace must not exist in serialized report');
  assert.ok(!serializedReport.includes(singleQuotedToken), 'Secret token must not exist in serialized report');
  assert.equal(result.status, 'HALTED_ON_FAILURE');
  assert.match(result.abortReason, /password="\[REDACTED\]"/);
  assert.match(result.abortReason, /access_token='\[REDACTED\]'/);

  // 4. End-to-end runner test with unclosed escaped quote exception from dispatcher (PRRT_kwDOVtCmZc66joKm)
  const mockDispatcherUnclosed = async () => {
    throw new Error(`request failed password="unclosed\\"secret`);
  };

  const resultUnclosed = await runHostedProbeRunner({
    projectRef: HARDCODED_TEMP_REF,
    argv: ['--live'],
    env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
    mockDispatcher: mockDispatcherUnclosed,
    sleepFn: async () => {}
  });

  const serializedUnclosed = JSON.stringify(resultUnclosed);
  assert.ok(!serializedUnclosed.includes('unclosed\\"secret'), 'Unclosed secret password must not exist in serialized report');
  assert.equal(resultUnclosed.status, 'HALTED_ON_FAILURE');
  assert.match(resultUnclosed.abortReason, /password="\[REDACTED\]/);

  // 5. End-to-end runner test with compound/prefixed/camelCase secret keys in dispatcher exception (PRRT_kwDOVtCmZc66kYUU)
  const syntheticServiceKey = 'synthetic_service_role_secret_abc123';
  const syntheticClientSec = 'synthetic_client_secret_xyz789';
  const syntheticRefreshTok = 'synthetic_refresh_token_qwe456';

  const mockDispatcherCompound = async () => {
    throw new Error(`request failed SUPABASE_SERVICE_ROLE_KEY=${syntheticServiceKey} client_secret="${syntheticClientSec}" refreshToken=${syntheticRefreshTok}`);
  };

  const resultCompound = await runHostedProbeRunner({
    projectRef: HARDCODED_TEMP_REF,
    argv: ['--live'],
    env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
    mockDispatcher: mockDispatcherCompound,
    sleepFn: async () => {}
  });

  const serializedCompound = JSON.stringify(resultCompound);
  assert.ok(!serializedCompound.includes(syntheticServiceKey), 'SUPABASE_SERVICE_ROLE_KEY secret must not exist in serialized report');
  assert.ok(!serializedCompound.includes(syntheticClientSec), 'client_secret must not exist in serialized report');
  assert.ok(!serializedCompound.includes(syntheticRefreshTok), 'refreshToken must not exist in serialized report');
  assert.equal(resultCompound.status, 'HALTED_ON_FAILURE');
  assert.match(resultCompound.abortReason, /SUPABASE_SERVICE_ROLE_KEY=\[REDACTED\]/);
  assert.match(resultCompound.abortReason, /client_secret="\[REDACTED\]"/);
  assert.match(resultCompound.abortReason, /refreshToken=\[REDACTED\]/);
});

test('30. Timeout race evaluation confirms zero unhandled rejections and proper abort handling (PRRT_kwDOVtCmZc66jd3O)', async () => {
  const unhandled = [];
  const onUnhandled = (reason) => {
    unhandled.push(reason);
  };
  process.on('unhandledRejection', onUnhandled);

  try {
    const liveOptions = {
      projectRef: HARDCODED_TEMP_REF,
      argv: ['--live'],
      env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' }
    };

    // Case 1: Dispatcher resolves before timeout
    let abortFired1 = false;
    const res1 = await runHostedProbeRunner({
      ...liveOptions,
      probeTimeoutMs: 200,
      mockDispatcher: async (item, { signal }) => {
        signal.addEventListener('abort', () => { abortFired1 = true; });
        await new Promise(r => setTimeout(r, 20));
        return {
          passed: true,
          status: 403,
          route_disabled: true,
          evidence: { disabled: true }
        };
      }
    });
    assert.strictEqual(abortFired1, false, 'AbortSignal should not fire when dispatcher resolves first');
    assert.strictEqual(res1.status, 'HALTED_ON_FAILURE'); // Stops after BYPASS-01 because only BYPASS-01 matched
    assert.strictEqual(unhandled.length, 0);

    // Case 2: Dispatcher rejects before timeout
    const res2 = await runHostedProbeRunner({
      ...liveOptions,
      probeTimeoutMs: 200,
      mockDispatcher: async () => {
        throw new Error('NETWORK_FAILURE_IMMEDIATE');
      }
    });
    assert.strictEqual(res2.status, 'HALTED_ON_FAILURE');
    assert.strictEqual(res2.results.length, 1);
    assert.ok(res2.abortReason.includes('NETWORK_FAILURE_IMMEDIATE'));
    assert.strictEqual(unhandled.length, 0);

    // Case 3: Timeout fires first on non-settling promise
    let abortFired3 = false;
    const res3 = await runHostedProbeRunner({
      ...liveOptions,
      probeTimeoutMs: 50,
      mockDispatcher: (item, { signal }) => {
        signal.addEventListener('abort', () => { abortFired3 = true; });
        return new Promise(() => {}); // never settles
      }
    });
    assert.strictEqual(abortFired3, true, 'AbortSignal must be triggered on timeout');
    assert.strictEqual(res3.status, 'HALTED_ON_FAILURE');
    assert.match(res3.results[0].outcome.reason, /PROBE_TIMEOUT/);
    assert.strictEqual(res3.results.length, 1, 'Runner must not execute subsequent probes after timeout');
    assert.strictEqual(unhandled.length, 0);

    // Case 4: Dispatcher rejects AFTER timeout and abort (the reported race condition)
    let abortTriggered4 = false;
    let lateRejectionOccurred4 = false;

    const res4 = await runHostedProbeRunner({
      ...liveOptions,
      probeTimeoutMs: 50,
      mockDispatcher: (item, { signal }) => {
        return new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => {
            abortTriggered4 = true;
            // Simulate fetch AbortError thrown asynchronously after abort signal
            setTimeout(() => {
              lateRejectionOccurred4 = true;
              const err = new Error('AbortError: The operation was aborted');
              err.name = 'AbortError';
              reject(err);
            }, 30);
          });
        });
      }
    });

    assert.strictEqual(abortTriggered4, true, 'Abort was triggered');
    assert.strictEqual(res4.status, 'HALTED_ON_FAILURE');
    assert.strictEqual(res4.results.length, 1);

    // Wait to allow the late rejection to fire
    await new Promise(r => setTimeout(r, 100));
    assert.strictEqual(lateRejectionOccurred4, true, 'Late rejection actually fired');
    assert.strictEqual(unhandled.length, 0, 'No unhandledRejection must be emitted');
  } finally {
    process.removeListener('unhandledRejection', onUnhandled);
  }
});

test('31. Negative token-issuance probes reject top-level credentials and tokens fail-closed (PRRT_kwDOVtCmZc66kYUV)', async () => {
  const hook03 = { id: 'HOOK-03', category: 'Token Hook', target: 'Auth API' };
  const hook07 = { id: 'HOOK-07', category: 'Token Hook', target: 'Auth API' };
  const bypass01 = { id: 'BYPASS-01', category: 'Native Bypass', target: 'Auth API' };
  const bypass02 = { id: 'BYPASS-02', category: 'Native Bypass', target: 'Auth API' };
  const bypass03 = { id: 'BYPASS-03', category: 'Native Bypass', target: 'Auth API' };
  const bypass04 = { id: 'BYPASS-04', category: 'Native Bypass', target: 'Auth API' };

  // 1. HOOK-03 rejects top-level access_token even with rejection_observed: true and error status
  const resHook03 = validateProbeOutcome(hook03, {
    passed: true,
    status: 500,
    rejection_observed: true,
    access_token: 'synthetic-issued-token'
  });
  assert.equal(resHook03.passed, false);
  assert.match(resHook03.reason, /SECURITY_INVARIANT_VIOLATION.*HOOK-03 issued token.*access_token present/);

  // 2. HOOK-07 rejects top-level access_token
  const resHook07 = validateProbeOutcome(hook07, {
    passed: true,
    status: 500,
    rejection_observed: true,
    access_token: 'synthetic-issued-token'
  });
  assert.equal(resHook07.passed, false);
  assert.match(resHook07.reason, /SECURITY_INVARIANT_VIOLATION.*HOOK-07 issued token.*access_token present/);

  // 3. BYPASS-01 rejects top-level access_token
  const resBypass01 = validateProbeOutcome(bypass01, {
    passed: true,
    status: 403,
    route_disabled: true,
    access_token: 'synthetic-issued-token'
  });
  assert.equal(resBypass01.passed, false);
  assert.match(resBypass01.reason, /SECURITY_INVARIANT_VIOLATION.*BYPASS-01 issued tokens.*access_token present/);

  // 4. BYPASS-02 rejects top-level refresh_token
  const resBypass02 = validateProbeOutcome(bypass02, {
    passed: true,
    status: 403,
    signup_disabled: true,
    refresh_token: 'synthetic-refresh-token'
  });
  assert.equal(resBypass02.passed, false);
  assert.match(resBypass02.reason, /SECURITY_INVARIANT_VIOLATION.*BYPASS-02 created user or issued tokens.*refresh_token present/);

  // 5. BYPASS-03 rejects top-level token
  const resBypass03 = validateProbeOutcome(bypass03, {
    passed: true,
    status: 403,
    rejection_observed: true,
    token: 'synthetic-token'
  });
  assert.equal(resBypass03.passed, false);
  assert.match(resBypass03.reason, /SECURITY_INVARIANT_VIOLATION.*BYPASS-03 received HTTP 200 or tokens.*token present/);

  // 6. BYPASS-04 rejects nested tokens.access_token
  const resBypass04 = validateProbeOutcome(bypass04, {
    passed: true,
    status: 403,
    rejection_observed: true,
    tokens: { access_token: 'synthetic-token' }
  });
  assert.equal(resBypass04.passed, false);
  assert.match(resBypass04.reason, /SECURITY_INVARIANT_VIOLATION.*BYPASS-04 received HTTP 200 or tokens.*tokens\.access_token present/);

  // 7. Legitimate negative cases without credentials pass when affirmative rejection is observed
  const resValidHook03 = validateProbeOutcome(hook03, {
    passed: true,
    status: 500,
    rejection_observed: true,
    hook_rejected: true
  });
  assert.equal(resValidHook03.passed, true);

  const resValidBypass01 = validateProbeOutcome(bypass01, {
    passed: true,
    status: 403,
    route_disabled: true
  });
  assert.equal(resValidBypass01.passed, true);
});

test('32. Strict positive access token issuance proof for HOOK-01 and HOOK-02 (PRRT_kwDOVtCmZc66kiam)', async () => {
  const hook01 = { id: 'HOOK-01', category: 'Token Hook', target: 'Password Sign-In' };
  const hook02 = { id: 'HOOK-02', category: 'Token Hook', target: 'Password Token Refresh' };
  const hook03 = { id: 'HOOK-03', category: 'Token Hook', target: 'Auth API' };
  const bypass01 = { id: 'BYPASS-01', category: 'Native Bypass', target: 'Auth API' };

  // --- HOOK-01 Strict Positive Tests ---
  // 1a. has_token: true alone (without actual access_token) -> FAIL
  const resH1FlagOnly = validateProbeOutcome(hook01, {
    passed: true,
    status: 200,
    has_token: true,
    amr_authenticated: true
  });
  assert.equal(resH1FlagOnly.passed, false);
  assert.match(resH1FlagOnly.reason, /MISSING_EVIDENCE: HOOK-01 requires explicit, non-empty access_token string/);

  // 1b. Nonempty unrelated tokens object -> FAIL
  const resH1Unrelated = validateProbeOutcome(hook01, {
    passed: true,
    status: 200,
    tokens: { unrelated: 'some_payload', foo: 'bar' },
    amr_authenticated: true
  });
  assert.equal(resH1Unrelated.passed, false);
  assert.match(resH1Unrelated.reason, /MISSING_EVIDENCE: HOOK-01 requires explicit, non-empty access_token string/);

  // 1c. Empty tokens object -> FAIL
  const resH1EmptyObj = validateProbeOutcome(hook01, {
    passed: true,
    status: 200,
    tokens: {},
    amr_authenticated: true
  });
  assert.equal(resH1EmptyObj.passed, false);
  assert.match(resH1EmptyObj.reason, /MISSING_EVIDENCE: HOOK-01 requires explicit, non-empty access_token string/);

  // 1d. Empty tokens array -> FAIL
  const resH1EmptyArr = validateProbeOutcome(hook01, {
    passed: true,
    status: 200,
    tokens: [],
    amr_authenticated: true
  });
  assert.equal(resH1EmptyArr.passed, false);
  assert.match(resH1EmptyArr.reason, /MISSING_EVIDENCE: HOOK-01 requires explicit, non-empty access_token string/);

  // 1e. Whitespace-only access_token -> FAIL
  const resH1Whitespace = validateProbeOutcome(hook01, {
    passed: true,
    status: 200,
    access_token: '   \t  ',
    amr_authenticated: true
  });
  assert.equal(resH1Whitespace.passed, false);
  assert.match(resH1Whitespace.reason, /MISSING_EVIDENCE: HOOK-01 requires explicit, non-empty access_token string/);

  // 1f. Non-string (numeric) access_token -> FAIL
  const resH1Numeric = validateProbeOutcome(hook01, {
    passed: true,
    status: 200,
    access_token: 99999,
    amr_authenticated: true
  });
  assert.equal(resH1Numeric.passed, false);
  assert.match(resH1Numeric.reason, /MISSING_EVIDENCE: HOOK-01 requires explicit, non-empty access_token string/);

  // 1g. refresh_token only (top-level or nested) without access_token -> FAIL
  const resH1RefreshOnly = validateProbeOutcome(hook01, {
    passed: true,
    status: 200,
    refresh_token: 'valid.refresh.token',
    amr_authenticated: true
  });
  assert.equal(resH1RefreshOnly.passed, false);
  assert.match(resH1RefreshOnly.reason, /MISSING_EVIDENCE: HOOK-01 requires explicit, non-empty access_token string/);

  const resH1NestedRefreshOnly = validateProbeOutcome(hook01, {
    passed: true,
    status: 200,
    tokens: { refresh_token: 'valid.refresh.token' },
    amr_authenticated: true
  });
  assert.equal(resH1NestedRefreshOnly.passed, false);
  assert.match(resH1NestedRefreshOnly.reason, /MISSING_EVIDENCE: HOOK-01 requires explicit, non-empty access_token string/);

  // 1h. access_token present but AMR evidence missing -> FAIL
  const resH1MissingAmr = validateProbeOutcome(hook01, {
    passed: true,
    status: 200,
    access_token: 'valid.jwt.token'
  });
  assert.equal(resH1MissingAmr.passed, false);
  assert.match(resH1MissingAmr.reason, /MISSING_EVIDENCE: HOOK-01 expected verified amr_authenticated claim/);

  // 1i. Explicit nonempty access_token (top-level and nested) + AMR evidence -> PASS
  assert.equal(validateProbeOutcome(hook01, {
    passed: true,
    status: 200,
    access_token: 'valid.jwt.token',
    amr_authenticated: true
  }).passed, true);

  assert.equal(validateProbeOutcome(hook01, {
    passed: true,
    status: 200,
    tokens: { access_token: 'valid.jwt.token' },
    amr_authenticated: true
  }).passed, true);

  // --- HOOK-02 Strict Positive Tests ---
  // 2a. has_token: true alone -> FAIL
  const resH2FlagOnly = validateProbeOutcome(hook02, {
    passed: true,
    status: 200,
    has_token: true,
    amr_preserved: true
  });
  assert.equal(resH2FlagOnly.passed, false);
  assert.match(resH2FlagOnly.reason, /MISSING_EVIDENCE: HOOK-02 requires explicit, non-empty access_token string/);

  // 2b. Nonempty unrelated tokens object -> FAIL
  const resH2Unrelated = validateProbeOutcome(hook02, {
    passed: true,
    status: 200,
    tokens: { unrelated: 'some_payload' },
    amr_preserved: true
  });
  assert.equal(resH2Unrelated.passed, false);
  assert.match(resH2Unrelated.reason, /MISSING_EVIDENCE: HOOK-02 requires explicit, non-empty access_token string/);

  // 2c. Empty tokens object -> FAIL
  const resH2EmptyObj = validateProbeOutcome(hook02, {
    passed: true,
    status: 200,
    tokens: {},
    amr_preserved: true
  });
  assert.equal(resH2EmptyObj.passed, false);
  assert.match(resH2EmptyObj.reason, /MISSING_EVIDENCE: HOOK-02 requires explicit, non-empty access_token string/);

  // 2d. Whitespace-only access_token -> FAIL
  const resH2Whitespace = validateProbeOutcome(hook02, {
    passed: true,
    status: 200,
    tokens: { access_token: '   ' },
    amr_preserved: true
  });
  assert.equal(resH2Whitespace.passed, false);
  assert.match(resH2Whitespace.reason, /MISSING_EVIDENCE: HOOK-02 requires explicit, non-empty access_token string/);

  // 2e. refresh_token only -> FAIL
  const resH2RefreshOnly = validateProbeOutcome(hook02, {
    passed: true,
    status: 200,
    refresh_token: 'fresh.refresh.token',
    amr_preserved: true
  });
  assert.equal(resH2RefreshOnly.passed, false);
  assert.match(resH2RefreshOnly.reason, /MISSING_EVIDENCE: HOOK-02 requires explicit, non-empty access_token string/);

  // 2f. access_token present but AMR preservation evidence missing -> FAIL
  const resH2MissingAmr = validateProbeOutcome(hook02, {
    passed: true,
    status: 200,
    access_token: 'fresh.jwt.token'
  });
  assert.equal(resH2MissingAmr.passed, false);
  assert.match(resH2MissingAmr.reason, /MISSING_EVIDENCE: HOOK-02 expected verified AMR preservation/);

  // 2g. Explicit nonempty access_token (top-level and nested) + AMR preservation -> PASS
  assert.equal(validateProbeOutcome(hook02, {
    passed: true,
    status: 200,
    access_token: 'fresh.jwt.token',
    amr_preserved: true
  }).passed, true);

  assert.equal(validateProbeOutcome(hook02, {
    passed: true,
    status: 200,
    tokens: { access_token: 'fresh.jwt.token' },
    amr_preserved: true
  }).passed, true);

  // --- Negative BYPASS/HOOK tests must still fail closed when token issuance is observed ---
  // 3a. HOOK-03 fails on has_token: true
  assert.equal(validateProbeOutcome(hook03, {
    passed: true,
    status: 500,
    rejection_observed: true,
    has_token: true
  }).passed, false);

  // 3b. HOOK-03 fails on tokens object with unrelated keys
  assert.equal(validateProbeOutcome(hook03, {
    passed: true,
    status: 500,
    rejection_observed: true,
    tokens: { unrelated: 'x' }
  }).passed, false);

  // 3c. BYPASS-01 fails on has_token: true
  assert.equal(validateProbeOutcome(bypass01, {
    passed: true,
    status: 403,
    route_disabled: true,
    has_token: true
  }).passed, false);

  // --- Full simulated 18-case runner regression ---
  // Demonstrates that a false-positive HOOK-01 outcome (has_token: true + amr_authenticated: true but NO concrete access_token)
  // halts execution at case 6 and NEVER returns COMPLETED.
  let casesExecutedCount = 0;
  const mockDispatcherFalsePositive = async (item) => {
    casesExecutedCount++;
    if (item.id === 'BYPASS-01') {
      return { passed: true, status: 403, route_disabled: true };
    }
    if (item.id === 'BYPASS-02') {
      return { passed: true, status: 403, signup_disabled: true };
    }
    if (item.id === 'BYPASS-03' || item.id === 'BYPASS-04') {
      return { passed: true, status: 500, hook_rejected: true, error: 'hook_error: 42501' };
    }
    if (item.id === 'BYPASS-05') {
      return { passed: true, status: 500, recovery_suppressed: true, zero_email_delivered: true };
    }
    if (item.id === 'HOOK-01') {
      // False-positive outcome: claims has_token: true and amr_authenticated: true, but provides NO access_token string!
      return {
        passed: true,
        status: 200,
        has_token: true,
        tokens: { unrelated_key: 'no_token_here' },
        amr_authenticated: true
      };
    }
    // Subsequent cases should never be reached
    return { passed: true, status: 200 };
  };

  const resultFpHook01 = await runHostedProbeRunner({
    projectRef: HARDCODED_TEMP_REF,
    argv: ['--live'],
    env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
    mockDispatcher: mockDispatcherFalsePositive,
    sleepFn: async () => {}
  });

  assert.notEqual(resultFpHook01.status, 'COMPLETED', 'Runner must NEVER return COMPLETED on false-positive HOOK-01');
  assert.equal(resultFpHook01.status, 'HALTED_ON_FAILURE', 'Runner must halt immediately on failure');
  assert.equal(resultFpHook01.results.length, 6, 'Runner must halt at case 6 (HOOK-01) and not execute subsequent probes');
  assert.equal(casesExecutedCount, 6, 'Dispatcher must only be invoked for 6 probes');
  assert.match(
    resultFpHook01.abortReason,
    /CRITICAL_SECURITY_FAILURE: Case HOOK-01 \(Token Hook\) failed validation.*requires explicit, non-empty access_token string/
  );
});
