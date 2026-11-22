import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateTargetProject,
  validateTestIdentity,
  determineRunnerMode,
  sanitizeData,
  planProbeExecution,
  runHostedProbeRunner,
  validateProbeOutcome,
  IMMUTABLE_FORBIDDEN_PROJECTS,
  HARDCODED_REAL_REF,
  HARDCODED_TIO_WORLD_REF,
  HARDCODED_TEMP_REF,
  TIO_SUPABASE_REAL_REF,
  TIO_SUPABASE_TEMP_REF
} from './hosted-probe-runner.mjs';

const VALID_TEMP_REF = 'temp-auth-testbed-12345';

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
  // Dispatcher returns legitimate statuses for each respective requirement
  const mockDispatcher = async (item) => {
    probeCount++;
    if (item.id === 'HOOK-01' || item.id === 'HOOK-02') {
      return { passed: true, status: 200, has_token: true };
    }
    if (item.id === 'SESSION-01') {
      return { passed: true, status: 200, session_created: true };
    }
    if (item.id === 'SESSION-02') {
      return { passed: true, status: 200, remaining_sessions: 0 };
    }
    if (item.id === 'SESSION-04' || item.id === 'SESSION-05') {
      return { passed: true, status: 200, note: 'stateless linger window documented' };
    }
    if (item.id === 'SESSION-03' || item.id === 'SESSION-06') {
      return { passed: true, status: 403 };
    }
    if (item.id === 'BYPASS-01' || item.id === 'BYPASS-02') {
      return { passed: true, status: 422 };
    }
    // BYPASS-03..05, HOOK-03..07
    return { passed: true, status: 500 };
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
    if (item.id.startsWith('BYPASS-')) {
      return { passed: true, status: item.id === 'BYPASS-01' || item.id === 'BYPASS-02' ? 422 : 500 };
    }
    return { passed: true, status: 200, has_token: true };
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
    if (item.id.startsWith('BYPASS-')) {
      return { passed: true, status: item.id === 'BYPASS-01' || item.id === 'BYPASS-02' ? 422 : 500 };
    }
    if (item.id.startsWith('HOOK-')) {
      const isPasswordSuccess = item.id === 'HOOK-01' || item.id === 'HOOK-02';
      return { passed: true, status: isPasswordSuccess ? 200 : 500, has_token: isPasswordSuccess };
    }
    return { passed: true, status: 200, session_created: true };
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
    return { passed: true, status: item.id.startsWith('BYPASS-') ? 422 : 200 };
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

test('20. Missing evidence on HOOK-01 fails closed (PRRT_kwDOVtCmZc66i_Kd)', () => {
  const item = { id: 'HOOK-01', category: 'Token Hook', target: 'Password Sign-In' };
  // Legitimate sign-in returned 200 but has_token: false
  const outcome = { passed: true, status: 200, has_token: false };
  const validated = validateProbeOutcome(item, outcome);
  assert.equal(validated.passed, false);
  assert.match(validated.reason, /MISSING_EVIDENCE: HOOK-01/);
});

test('21. Serialized secrets are absent from final runner evidence (PRRT_kwDOVtCmZc66i_Kf)', async () => {
  const secretPassword = 'SUPER_CONFIDENTIAL_PASSWORD_123!';
  const secretRefreshToken = 'SUPER_SECRET_REFRESH_TOKEN_XYZ';

  const mockDispatcher = async () => {
    return {
      passed: true,
      status: 422,
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
