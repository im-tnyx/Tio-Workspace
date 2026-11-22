import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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
  TIO_SUPABASE_TEMP_REF,
  BREVO_AUDIT_BASELINE,
  TestRunInventory,
  createHostedDispatcher,
  parseAndValidateJwt,
  DEFAULT_TEST_PASSWORD,
  getRunTestPassword,
  createRunContext,
  validateProjectCredentialBinding,
  createMockProjectKey,
  HOSTED_PROBE_SPECIFICATIONS
} from './hosted-probe-runner.mjs';

const defaultMockAdminClient = {
  deleteUser: async (id) => ({ data: { user: { id } }, error: null }),
  getUserById: async (id) => ({ data: null, error: { status: 404, message: 'User not found' } }),
  invalidateSession: async (id) => ({ data: { id }, error: null }),
  signOut: async (id) => ({ data: { id }, error: null })
};
const validTestAnonKey = createMockProjectKey(HARDCODED_TEMP_REF, 'anon');
const validTestServiceRoleKey = createMockProjectKey(HARDCODED_TEMP_REF, 'service_role');

function createMockJwt(claims = {}) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: 'user-uuid-1234',
    session_id: 'session-uuid-5678',
    iss: `https://${HARDCODED_TEMP_REF}.supabase.co/auth/v1`,
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 300,
    amr_authenticated: 'true',
    amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }],
    ...claims
  };
  const b64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
  const b64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = Buffer.from('mock_test_signature').toString('base64url');
  return `${b64Header}.${b64Payload}.${signature}`;
}

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
    adminClient: defaultMockAdminClient,
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
    adminClient: defaultMockAdminClient,
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
      return { passed: true, status: 200, has_token: true, amr_authenticated: true, session_id: 'session-uuid-5678', tokens: { access_token: createMockJwt() } };
    }
    if (item.id === 'HOOK-02') {
      return { passed: true, status: 200, has_token: true, amr_preserved: true, tokens: { access_token: createMockJwt() } };
    }
    if (['HOOK-03', 'HOOK-04', 'HOOK-05', 'HOOK-06', 'HOOK-07'].includes(item.id)) {
      return { passed: true, status: 500, hook_rejected: true, error: 'hook_error: 42501' };
    }
    if (item.id === 'SESSION-01') {
      return { passed: true, status: 200, session_created: true, session_id: 'session-uuid-5678' };
    }
    if (item.id === 'SESSION-02') {
      return { passed: true, status: 200, password_reset_completed: true, session_revoked: true, session_revocation_verified: true, remaining_sessions: 0 };
    }
    if (item.id === 'SESSION-03') {
      return {
        passed: true,
        status: 403,
        pre_reset_baseline_verified: true,
        reset_completed: true,
        session_id: 'session-uuid-5678',
        correlated_session_id: 'session-uuid-5678',
        pre_session_id: 'session-uuid-5678',
        same_session_correlated: true,
        error_code: 'session_not_found'
      };
    }
    if (item.id === 'SESSION-04' || item.id === 'SESSION-05') {
      return { passed: true, status: 200, token_unexpired: true, stateless_linger_documented: true, note: 'stateless linger window verified and documented' };
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
    adminClient: defaultMockAdminClient,
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
    adminClient: defaultMockAdminClient,
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
      return { passed: true, status: 200, has_token: true, amr_authenticated: true, session_id: 'session-uuid-5678', tokens: { access_token: createMockJwt() } };
    }
    if (item.id === 'HOOK-02') {
      return { passed: true, status: 200, has_token: true, amr_preserved: true, tokens: { access_token: createMockJwt() } };
    }
    if (['HOOK-03', 'HOOK-04', 'HOOK-05', 'HOOK-06', 'HOOK-07'].includes(item.id)) {
      return { passed: true, status: 500, hook_rejected: true, error: 'hook_error: 42501' };
    }
    if (item.id === 'SESSION-01') {
      return { passed: true, status: 200, session_created: true, session_id: 'sess-1' };
    }
    if (item.id === 'SESSION-02') {
      return { passed: true, status: 200, password_reset_completed: true, session_revoked: true, session_revocation_verified: true, remaining_sessions: 0 };
    }
    return { passed: true, status: 200, session_created: true, session_id: 'sess-default' };
  };

  const result = await runHostedProbeRunner({
    projectRef: VALID_TEMP_REF,
    tempRef: VALID_TEMP_REF,
    argv: ['--live'],
    env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
    adminClient: defaultMockAdminClient,
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
    adminClient: defaultMockAdminClient,
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
    adminClient: defaultMockAdminClient,
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
    adminClient: defaultMockAdminClient,
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
    adminClient: defaultMockAdminClient,
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
    adminClient: defaultMockAdminClient,
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

  // SESSION-02 requires remaining_sessions: 0 AND session_revoked: true AND password_reset_completed: true
  const session02 = { id: 'SESSION-02', category: 'Session & Consumer' };
  assert.equal(validateProbeOutcome(session02, { passed: true, status: 200 }).passed, false);
  assert.equal(validateProbeOutcome(session02, { passed: true, status: 200, remaining_sessions: 1 }).passed, false);
  assert.equal(validateProbeOutcome(session02, { passed: true, status: 200, remaining_sessions: 0 }).passed, false);
  assert.equal(validateProbeOutcome(session02, { passed: true, status: 200, remaining_sessions: 0, session_revoked: true, password_reset_completed: true, session_revocation_verified: true }).passed, true);

  // SESSION-04 & SESSION-05 require stateless linger documentation/evidence, status 200, and unexpired token
  const session04 = { id: 'SESSION-04', category: 'Session & Consumer' };
  assert.equal(validateProbeOutcome(session04, { passed: true, status: 200 }).passed, false);
  assert.equal(validateProbeOutcome(session04, { passed: true, status: 200, stateless_linger_documented: true }).passed, false);
  assert.equal(validateProbeOutcome(session04, { passed: true, status: 200, token_unexpired: true, stateless_linger_documented: true, note: '' }).passed, false);
  assert.equal(validateProbeOutcome(session04, { passed: true, status: 200, token_unexpired: true, stateless_linger_documented: true, note: 'linger window verified' }).passed, true);
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
    adminClient: defaultMockAdminClient,
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
    adminClient: defaultMockAdminClient,
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
    adminClient: defaultMockAdminClient,
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
    adminClient: defaultMockAdminClient,
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
  assert.equal(validateProbeOutcome(hook01, { passed: true, status: 200, has_token: true, tokens: { access_token: createMockJwt() }, session_id: 'session-uuid-5678', amr_authenticated: true }).passed, true);

  // SESSION-04 with empty note / empty object evidence
  const session04 = { id: 'SESSION-04', category: 'Session & Consumer' };
  assert.equal(validateProbeOutcome(session04, { passed: true, status: 200 }).passed, false);
  assert.equal(validateProbeOutcome(session04, { passed: true, status: 200, stateless_linger_documented: true }).passed, false);
  assert.equal(validateProbeOutcome(session04, { passed: true, status: 200, token_unexpired: true, stateless_linger_documented: true, note: '' }).passed, false);
  assert.equal(validateProbeOutcome(session04, { passed: true, status: 200, token_unexpired: true, stateless_linger_documented: true, evidence: {} }).passed, false);
  assert.equal(validateProbeOutcome(session04, { passed: true, status: 200, token_unexpired: true, stateless_linger_documented: true, note: 'linger window verified' }).passed, true);

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
    adminClient: defaultMockAdminClient,
    adminClient: defaultMockAdminClient,
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
    adminClient: defaultMockAdminClient,
    adminClient: defaultMockAdminClient,
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
    adminClient: defaultMockAdminClient,
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
    adminClient: defaultMockAdminClient,
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
      env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
      adminClient: defaultMockAdminClient
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
    session_id: 'session-uuid-5678',
    access_token: createMockJwt({ amr_authenticated: undefined })
  });
  assert.equal(resH1MissingAmr.passed, false);
  assert.match(resH1MissingAmr.reason, /MISSING_AMR_AUTHENTICATED|MISSING_EVIDENCE/);

  // 1i. Explicit nonempty access_token (top-level and nested) + AMR evidence -> PASS
  assert.equal(validateProbeOutcome(hook01, {
    passed: true,
    status: 200,
    session_id: 'session-uuid-5678',
    access_token: createMockJwt(),
    amr_authenticated: true
  }).passed, true);

  assert.equal(validateProbeOutcome(hook01, {
    passed: true,
    status: 200,
    session_id: 'session-uuid-5678',
    tokens: { access_token: createMockJwt() },
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
    access_token: createMockJwt({ amr_authenticated: undefined })
  });
  assert.equal(resH2MissingAmr.passed, false);
  assert.match(resH2MissingAmr.reason, /MISSING_AMR_AUTHENTICATED|MISSING_EVIDENCE/);

  // 2g. Explicit nonempty access_token (top-level and nested) + AMR preservation -> PASS
  assert.equal(validateProbeOutcome(hook02, {
    passed: true,
    status: 200,
    access_token: createMockJwt(),
    amr_preserved: true
  }).passed, true);

  assert.equal(validateProbeOutcome(hook02, {
    passed: true,
    status: 200,
    tokens: { access_token: createMockJwt() },
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
    adminClient: defaultMockAdminClient,
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

// ---------------------------------------------------------------------------
// Task 06I-B1-H1: Hosted Security Preflight & Environment Readiness Tests
// ---------------------------------------------------------------------------

test('33. Task 06I-B1-H1: Hosted security preflight, Brevo audit baseline, and planned matrix readiness', async () => {
  // 1. Approved disposable TEMP project ref check
  assert.equal(HARDCODED_TEMP_REF, 'wvdabiwbaavfggcmpizd', 'HARDCODED_TEMP_REF must match owner-created TEMP project');
  assert.notEqual(HARDCODED_TEMP_REF, HARDCODED_REAL_REF, 'TEMP ref must not equal protected REAL project');
  assert.notEqual(HARDCODED_TEMP_REF, HARDCODED_TIO_WORLD_REF, 'TEMP ref must not equal immune Tio-world project');

  // 2. Brevo sender & domain readiness audit baseline check
  assert.equal(BREVO_AUDIT_BASELINE.plan, 'Free');
  assert.equal(BREVO_AUDIT_BASELINE.dailyQuota, 300);
  assert.equal(BREVO_AUDIT_BASELINE.smtpRelayEnabled, true);
  assert.equal(BREVO_AUDIT_BASELINE.authenticatedSendingDomains, 0);
  assert.equal(BREVO_AUDIT_BASELINE.readinessStatus, 'UNAUTHENTICATED_SENDER_DOMAIN_BLOCKED');
  assert.match(BREVO_AUDIT_BASELINE.deliveryPolicy, /SQLSTATE 42501/);

  // 3. Planned 18-case matrix structure and coverage
  const plan = planProbeExecution(HARDCODED_TEMP_REF);
  assert.equal(plan.totalProbes, 18, 'Must plan exactly 18 discrete probes');
  assert.equal(plan.projectRef, HARDCODED_TEMP_REF);
  assert.equal(plan.mode, 'PLANNED');

  const categories = plan.plannedCases.reduce((acc, c) => {
    acc[c.category] = (acc[c.category] || 0) + 1;
    return acc;
  }, {});

  assert.equal(categories['Native Bypass'], 5, 'Must contain 5 Native Bypass cases (BYPASS-01..05)');
  assert.equal(categories['Token Hook'], 7, 'Must contain 7 Token Hook cases (HOOK-01..07)');
  assert.equal(categories['Session & Consumer'], 6, 'Must contain 6 Session & Consumer cases (SESSION-01..06)');

  for (const c of plan.plannedCases) {
    assert.ok(c.id, 'Case must have an ID');
    assert.ok(c.category, 'Case must have a category');
    assert.ok(c.target, 'Case must have a target');
    assert.ok(c.expectedResponse, 'Case must specify expectedResponse');
    assert.ok(c.testUser, 'Case must have a testUser');
  }

  // 4. Default DRY_RUN execution safety contract
  const dryRunResult = await runHostedProbeRunner({
    projectRef: HARDCODED_TEMP_REF
  });

  assert.equal(dryRunResult.status, 'DRY_RUN_COMPLETED');
  assert.equal(dryRunResult.mode, 'DRY_RUN');
  assert.equal(dryRunResult.projectRef, HARDCODED_TEMP_REF);
  assert.equal(dryRunResult.zeroNetworkRequestsDispatched, true);
  assert.equal(dryRunResult.plan.totalProbes, 18);
});

// ---------------------------------------------------------------------------
// Task 06I-B1-H1-R1: Security Review Remediation Tests (R1-01, R1-03, R1-04)
// ---------------------------------------------------------------------------

test('34. Task 06I-B1-H1-R1 (R1-01): LIVE dispatcher contract, boundary checks, and error handling', async () => {
  // 1. Rejects forbidden projects
  assert.throws(
    () => createHostedDispatcher({ projectRef: HARDCODED_REAL_REF, anonKey: 'test-anon-key' }),
    /CRITICAL_SECURITY_VIOLATION.*strictly rejected target/
  );
  assert.throws(
    () => createHostedDispatcher({ projectRef: HARDCODED_TIO_WORLD_REF, anonKey: 'test-anon-key' }),
    /CRITICAL_SECURITY_VIOLATION.*strictly rejected target/
  );
  assert.throws(
    () => createHostedDispatcher({ projectRef: 'unknown-target-ref', anonKey: 'test-anon-key' }),
    /CRITICAL_SECURITY_VIOLATION.*strictly rejected target/
  );

  // 2. Rejects missing or empty anonKey
  assert.throws(
    () => createHostedDispatcher({ projectRef: HARDCODED_TEMP_REF, anonKey: '' }),
    /MISSING_HOSTED_CREDENTIALS.*requires non-empty anonKey/
  );
  assert.throws(
    () => createHostedDispatcher({ projectRef: HARDCODED_TEMP_REF, anonKey: null }),
    /MISSING_HOSTED_CREDENTIALS.*requires non-empty anonKey/
  );

  // 3. Dispatches HTTP requests to approved TEMP project with AbortSignal and headers
  const dispatchedRequests = [];
  const mockFetch = async (url, init) => {
    dispatchedRequests.push({ url, init });
    if (url.endsWith('/auth/v1/otp')) {
      return {
        status: 422,
        json: async () => ({ error_code: 'email_provider_disabled', message: 'Email provider disabled' })
      };
    }
    if (url.endsWith('/auth/v1/signup')) {
      return {
        status: 422,
        json: async () => ({ error_code: 'signup_disabled', message: 'Signups disabled' })
      };
    }
    const mockLiveJwt = createMockJwt();
    if (url.endsWith('/auth/v1/token?grant_type=password')) {
      return {
        status: 200,
        json: async () => ({
          access_token: mockLiveJwt,
          user: { app_metadata: { amr_authenticated: true } }
        })
      };
    }
    return { status: 400, json: async () => ({ message: 'Mock bad request' }) };
  };

  const dispatcher = createHostedDispatcher({
    projectRef: HARDCODED_TEMP_REF,
    anonKey: validTestAnonKey,
    fetchFn: mockFetch
  });

  assert.equal(typeof dispatcher, 'function');

  // Probe BYPASS-01 dispatch
  const outcomeBypass01 = await dispatcher({ id: 'BYPASS-01', testUser: 'probe-test@proof.invalid' }, {});
  assert.equal(outcomeBypass01.status, 422);
  assert.equal(outcomeBypass01.route_disabled, true);
  assert.equal(outcomeBypass01.error_code, 'email_provider_disabled');
  assert.equal(dispatchedRequests[0].url, `https://${HARDCODED_TEMP_REF}.supabase.co/auth/v1/otp`);
  assert.equal(dispatchedRequests[0].init.headers.apikey, validTestAnonKey);

  // Probe BYPASS-02 dispatch
  const outcomeBypass02 = await dispatcher({ id: 'BYPASS-02', testUser: 'probe-test@proof.invalid' }, {});
  assert.equal(outcomeBypass02.status, 422);
  assert.equal(outcomeBypass02.signup_disabled, true);
  assert.equal(outcomeBypass02.error_code, 'signup_disabled');
  assert.equal(dispatchedRequests[1].url, `https://${HARDCODED_TEMP_REF}.supabase.co/auth/v1/signup`);

  // Probe HOOK-01 dispatch
  const outcomeHook01 = await dispatcher({ id: 'HOOK-01', testUser: 'probe-test@proof.invalid' }, {});
  assert.equal(outcomeHook01.status, 200);
  assert.equal(outcomeHook01.passed, true);
  assert.ok(outcomeHook01.access_token);
  assert.equal(outcomeHook01.amr_authenticated, true);

  // 4. Runner in LIVE mode without mockDispatcher fails closed
  await assert.rejects(
    async () => {
      await runHostedProbeRunner({
        projectRef: HARDCODED_TEMP_REF,
        argv: ['--live'],
        env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
    adminClient: defaultMockAdminClient,
        mockDispatcher: null
      });
    },
    /NO_HOSTED_DISPATCHER: live hosted execution requires a configured network dispatcher/
  );
});

test('35. Task 06I-B1-H1-R1 (R1-03): Run-scoped identity inventory, deterministic cleanup, and residual detection', async () => {
  const inventory = new TestRunInventory('test-run-123');

  // 1. Identity registration and tracking
  const user1 = inventory.registerUser({ id: '11111111-2222-3333-4444-555555555555', email: 'user1@proof.invalid' });
  const user2 = inventory.registerUser({ id: '66666666-7777-8888-9999-000000000000', email: 'user2@proof.invalid' });

  assert.equal(inventory.getTrackedUserIds().length, 2);
  assert.deepEqual(inventory.getTrackedEmails(), ['user1@proof.invalid', 'user2@proof.invalid']);

  // Rejects invalid customer email domain
  assert.throws(
    () => inventory.registerUser({ id: '33333333-4444-5555-6666-777777777777', email: 'real-user@gmail.com' }),
    /security_violation: real customer or public domain.*prohibited/
  );

  // 2. Track table rows and storage objects
  inventory.registerTableRow('task06i_session_probe', 'row-uuid-1');
  inventory.registerStorageObject('task06i_probe_bucket', 'test.txt');

  // 3. Successful deterministic cleanup
  const deletedUsers = [];
  const deletedRows = [];
  const deletedStorage = [];

  const mockAdminClient = {
    async deleteUser(userId) {
      deletedUsers.push(userId);
      return { success: true };
    },
    async deleteTableRow(table, id) {
      deletedRows.push({ table, id });
      return { success: true };
    },
    async deleteStorageObject(bucket, path) {
      deletedStorage.push({ bucket, path });
      return { success: true };
    },
    async getUserById(userId) {
      // Affirmative post-cleanup check: user does not exist
      return { notFound: true };
    }
  };

  const report = await inventory.executeCleanup({ adminClient: mockAdminClient });
  assert.equal(report.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(report.usersDeleted, 2);
  assert.equal(report.tableRowsDeleted, 1);
  assert.equal(report.storageObjectsDeleted, 1);
  assert.equal(report.residualUsers.length, 0);

  assert.deepEqual(deletedUsers, ['11111111-2222-3333-4444-555555555555', '66666666-7777-8888-9999-000000000000']);
  assert.deepEqual(deletedRows, [{ table: 'task06i_session_probe', id: 'row-uuid-1' }]);
  assert.deepEqual(deletedStorage, [{ bucket: 'task06i_probe_bucket', path: 'test.txt' }]);

  // 4. Incomplete cleanup fails closed when residual user detected
  const residualInventory = new TestRunInventory('residual-run-456');
  residualInventory.registerUser({ id: 'residual-uuid-99', email: 'residual@proof.invalid' });

  const lingeringAdminClient = {
    async deleteUser(userId) {
      // Simulate failed deletion or partial DB write
      return { success: false };
    },
    async getUserById(userId) {
      // User still found in database!
      return { id: userId, email: 'residual@proof.invalid', notFound: false };
    }
  };

  await assert.rejects(
    async () => {
      await residualInventory.executeCleanup({ adminClient: lingeringAdminClient, failClosed: true });
    },
    /CLEANUP_INCOMPLETE: 1 synthetic user\(s\) remain in database after cleanup/
  );
});

test('36. Task 06I-B1-H1-R1 (R1-04): Evidence classification audit distinguishes hook parity from hosted outcomes', () => {
  const plan = planProbeExecution(HARDCODED_TEMP_REF);
  assert.equal(plan.totalProbes, 18);

  // Every probe in the plan is staged for execution; hosted verification is 0
  for (const c of plan.plannedCases) {
    assert.match(c.plannedAction, /Execute probe against.*on TEMP project wvdabiwbaavfggcmpizd/);
    assert.ok(c.expectedResponse);
  }

  // Verify that Brevo audit status is distinct and unverified
  assert.equal(BREVO_AUDIT_BASELINE.authenticatedSendingDomains, 0);
  assert.equal(BREVO_AUDIT_BASELINE.readinessStatus, 'UNAUTHENTICATED_SENDER_DOMAIN_BLOCKED');
});

test('37. Task 06I-B1-H1-R2 (R2-01): False-positive bypass probe prevention', async () => {
  // 1. Generic 400 on OTP rejected, route_disabled must be false
  const fetchOtp400 = async () => ({ status: 400, json: async () => ({ message: 'Bad request' }) });
  const dispOtp400 = createHostedDispatcher({ anonKey: validTestAnonKey, fetchFn: fetchOtp400 });
  const outOtp400 = await dispOtp400({ id: 'BYPASS-01', testUser: 'test@proof.invalid' });
  assert.equal(outOtp400.passed, false);
  assert.equal(outOtp400.route_disabled, false);

  // 2. 422 on OTP with email_provider_disabled passes
  const fetchOtpDisabled = async () => ({ status: 422, json: async () => ({ error_code: 'email_provider_disabled', message: 'Email provider is disabled' }) });
  const dispOtpDisabled = createHostedDispatcher({ anonKey: validTestAnonKey, fetchFn: fetchOtpDisabled });
  const outOtpDisabled = await dispOtpDisabled({ id: 'BYPASS-01', testUser: 'test@proof.invalid' });
  assert.equal(outOtpDisabled.passed, true);
  assert.equal(outOtpDisabled.route_disabled, true);

  // 3. 200 on /signup fails closed
  const fetchSignup200 = async () => ({ status: 200, json: async () => ({ id: 'usr-123' }) });
  const dispSignup200 = createHostedDispatcher({ anonKey: validTestAnonKey, fetchFn: fetchSignup200 });
  const outSignup200 = await dispSignup200({ id: 'BYPASS-02', testUser: 'test@proof.invalid' });
  assert.equal(outSignup200.passed, false);

  // 4. Generic 400 password too short on /signup does NOT fabricate signup_disabled
  const fetchSignup400 = async () => ({ status: 400, json: async () => ({ message: 'Password is too short' }) });
  const dispSignup400 = createHostedDispatcher({ anonKey: validTestAnonKey, fetchFn: fetchSignup400 });
  const outSignup400 = await dispSignup400({ id: 'BYPASS-02', testUser: 'test@proof.invalid' });
  assert.equal(outSignup400.passed, false);
  assert.equal(outSignup400.signup_disabled, false);

  // 5. 422 on /signup with signup_disabled passes
  const fetchSignupDisabled = async () => ({ status: 422, json: async () => ({ error_code: 'signup_disabled', message: 'Signups not allowed' }) });
  const dispSignupDisabled = createHostedDispatcher({ anonKey: validTestAnonKey, fetchFn: fetchSignupDisabled });
  const outSignupDisabled = await dispSignupDisabled({ id: 'BYPASS-02', testUser: 'test@proof.invalid' });
  assert.equal(outSignupDisabled.passed, true);
  assert.equal(outSignupDisabled.signup_disabled, true);

  // 6. 200 on /recover fails (cannot prove email suppression due to anti-enumeration)
  const fetchRecover200 = async () => ({ status: 200, json: async () => ({}) });
  const dispRecover200 = createHostedDispatcher({ anonKey: validTestAnonKey, fetchFn: fetchRecover200 });
  const outRecover200 = await dispRecover200({ id: 'BYPASS-05', testUser: 'test@proof.invalid' });
  assert.equal(outRecover200.passed, false);
  assert.equal(outRecover200.recovery_suppressed, false);

  // 7. 500 on /recover with 42501 / send_email_hook passes
  const fetchRecover500 = async () => ({ status: 500, json: async () => ({ message: 'send_email_hook: native recovery email dispatch suppressed (SQLSTATE 42501)' }) });
  const dispRecover500 = createHostedDispatcher({ anonKey: validTestAnonKey, fetchFn: fetchRecover500 });
  const outRecover500 = await dispRecover500({ id: 'BYPASS-05', testUser: 'test@proof.invalid' });
  assert.equal(outRecover500.passed, true);
  assert.equal(outRecover500.recovery_suppressed, true);
});

test('38. Task 06I-B1-H1-R2 (R2-02): JWT claim extraction & AMR verification', () => {
  // 1. Valid JWT with server-owned claims.amr_authenticated passes
  const validJwt = createMockJwt();
  const validCheck = parseAndValidateJwt(validJwt);
  assert.equal(validCheck.valid, true);

  // 2. JWT missing claims.amr_authenticated fails
  const missingAmrAuthJwt = createMockJwt({ amr_authenticated: undefined });
  const missingAmrAuthCheck = parseAndValidateJwt(missingAmrAuthJwt);
  assert.equal(missingAmrAuthCheck.valid, false);
  assert.match(missingAmrAuthCheck.reason, /MISSING_AMR_AUTHENTICATED/);

  // 3. JWT with prohibited AMR method (otp) fails
  const prohibitedAmrJwt = createMockJwt({ amr: [{ method: 'otp' }] });
  const prohibitedAmrCheck = parseAndValidateJwt(prohibitedAmrJwt);
  assert.equal(prohibitedAmrCheck.valid, false);
  assert.match(prohibitedAmrCheck.reason, /PROHIBITED_AMR_METHOD/);

  // 4. Token validation rejects client-editable user_metadata or app_metadata spoofing
  const itemHook01 = { id: 'HOOK-01', category: 'Token Hook', target: 'Password Sign-In' };
  const spoofOutcome = validateProbeOutcome(itemHook01, {
    passed: true,
    status: 200,
    access_token: missingAmrAuthJwt,
    amr_source: 'user_metadata',
    amr_authenticated: true
  });
  assert.equal(spoofOutcome.passed, false);
  assert.match(spoofOutcome.reason, /JWT_CLAIM_VIOLATION|SECURITY_INVARIANT_VIOLATION/);

  // 5. parseAndValidateJwt rejects empty, non-3-part, and expired tokens
  assert.equal(parseAndValidateJwt('').valid, false);
  assert.equal(parseAndValidateJwt('not.a.valid.jwt.token').valid, false);
  const expiredJwt = createMockJwt({ exp: Math.floor(Date.now() / 1000) - 300 });
  assert.match(parseAndValidateJwt(expiredJwt).reason, /TOKEN_EXPIRED/);
});

test('39. Task 06I-B1-H1-R2 (R2-03): Run-scoped refresh token propagation & AMR preservation in HOOK-02', async () => {
  const runCtx = createRunContext();
  const mockFetchRefresh = async (url, init) => {
    if (url.includes('grant_type=password')) {
      return {
        status: 200,
        json: async () => ({
          access_token: createMockJwt(),
          refresh_token: 'fresh-refresh-token-xyz',
          user: { id: 'usr-1' },
          session_id: 'sess-1'
        })
      };
    }
    if (url.includes('grant_type=refresh_token')) {
      const body = JSON.parse(init.body);
      if (body.refresh_token === 'fresh-refresh-token-xyz') {
        return {
          status: 200,
          json: async () => ({
            access_token: createMockJwt({ exp: Math.floor(Date.now() / 1000) + 600 }),
            refresh_token: 'refreshed-token-2'
          })
        };
      }
      return { status: 400, json: async () => ({ message: 'Invalid refresh token' }) };
    }
    return { status: 400, json: async () => ({}) };
  };

  const dispWithCtx = createHostedDispatcher({ anonKey: validTestAnonKey, runContext: runCtx, fetchFn: mockFetchRefresh });

  // 1. HOOK-02 without activeRefreshToken returns 400 PREREQUISITE_MISSING
  const h2Missing = await dispWithCtx({ id: 'HOOK-02' });
  assert.equal(h2Missing.passed, false);
  assert.equal(h2Missing.status, 400);
  assert.match(h2Missing.error, /PREREQUISITE_MISSING/);

  // 2. HOOK-01 logs in and sets activeRefreshToken in runContext
  const h1Res = await dispWithCtx({ id: 'HOOK-01' });
  assert.equal(h1Res.passed, true);
  assert.equal(runCtx.activeRefreshToken, 'fresh-refresh-token-xyz');

  // 3. HOOK-02 propagates activeRefreshToken and validates AMR preservation
  const h2Res = await dispWithCtx({ id: 'HOOK-02' });
  assert.equal(h2Res.passed, true);
  assert.equal(h2Res.amr_preserved, true);
  assert.equal(runCtx.activeRefreshToken, 'refreshed-token-2');

  // 4. Credential cleanup clears sensitive state
  runCtx.clear();
  assert.equal(runCtx.activeRefreshToken, null);
  assert.equal(runCtx.activeAccessToken, null);
  assert.equal(runCtx.testPassword, null);
});

test('40. Task 06I-B1-H1-R2 (R2-04 & R2-05): Inventory integration and robust cleanup failure detection', async () => {
  const inv = new TestRunInventory('test-run-r2-inv');
  inv.registerUser({ id: 'user-r2-1', email: 'test1@proof.invalid' });
  inv.registerTableRow('task06i_session_probe', 'row-1');
  inv.registerStorageObject('task06i_probe_bucket', 'file-1.txt');

  // 1. Accidental user creation in BYPASS-02 is captured into inventory
  const mockFetchAccidental = async () => ({ status: 200, json: async () => ({ user: { id: 'accidental-user-uuid' } }) });
  const dispAccidental = createHostedDispatcher({ anonKey: validTestAnonKey, inventory: inv, fetchFn: mockFetchAccidental });
  const bypass02Res = await dispAccidental({ id: 'BYPASS-02', testUser: 'accidental@proof.invalid' });
  assert.equal(bypass02Res.passed, false);
  assert.ok(inv.isUserTracked('accidental-user-uuid'));

  // 2. Client returning error on deleteUser fails cleanup closed
  const failClient = {
    async deleteUser() { return { data: null, error: { message: 'Database lock timeout' } }; },
    async deleteTableRow() { return { data: null, error: null }; },
    async deleteStorageObject() { return { data: null, error: null }; },
    async getUserById() { return { data: { user: { id: 'user-r2-1' } }, error: null }; }
  };
  await assert.rejects(
    async () => { await inv.executeCleanup({ adminClient: failClient, failClosed: true }); },
    /CLEANUP_INCOMPLETE/
  );

  // 3. Client missing delete methods fails cleanup closed
  const missingMethodsClient = {
    async deleteUser() { return { data: null, error: null }; },
    async getUserById() { return { data: { user: null }, error: { status: 404 } }; }
  };
  await assert.rejects(
    async () => { await inv.executeCleanup({ adminClient: missingMethodsClient, failClosed: true }); },
    /CLEANUP_INCOMPLETE/
  );

  // 4. Missing adminClient when resources are tracked fails closed
  await assert.rejects(
    async () => { await inv.executeCleanup({ adminClient: null, failClosed: true }); },
    /CLEANUP_CLIENT_REQUIRED/
  );
});

test('41. Task 06I-B1-H1-R2 (R2-06 & R2-09): Static check for canonical private_auth hooks and type-safe Storage RLS', async () => {
  const fixturesPath = 'experiments/task06i/sql/testbed-fixtures.sql';
  const fixturesSql = fs.readFileSync(fixturesPath, 'utf8');

  // Verify hooks are in private_auth schema, NOT public (R2-06)
  assert.ok(fixturesSql.includes('private_auth.custom_access_token_hook'), 'Must define private_auth.custom_access_token_hook');
  assert.ok(fixturesSql.includes('private_auth.send_email_hook'), 'Must define private_auth.send_email_hook');
  assert.ok(!fixturesSql.includes('CREATE OR REPLACE FUNCTION public.custom_access_token_hook'), 'Must NOT define hooks in public schema');
  assert.ok(!fixturesSql.includes('CREATE OR REPLACE FUNCTION public.send_email_hook'), 'Must NOT define hooks in public schema');

  // Verify Storage RLS policy uses type-safe owner_id = (auth.uid())::text (R2-09)
  assert.ok(fixturesSql.includes('owner_id = (auth.uid())::text'), 'Must use type-safe owner_id = (auth.uid())::text');
  assert.ok(!fixturesSql.includes('auth.uid() = owner'), 'Must NOT use deprecated auth.uid() = owner');
});

test('42. Task 06I-B1-H1-R2 (R2-07): Standard test password consistency across provisioning, seed spec, and login', () => {
  const fixturesPath = 'experiments/task06i/sql/testbed-fixtures.sql';
  const fixturesSql = fs.readFileSync(fixturesPath, 'utf8');

  // Consistent password across runner and seed specification
  assert.equal(getRunTestPassword(), DEFAULT_TEST_PASSWORD);
  assert.ok(fixturesSql.includes(DEFAULT_TEST_PASSWORD), 'testbed-fixtures.sql must document the exact default test password');
});

test('43. Task 06I-B1-H1-R2 (R2-08): All 18 LIVE probes dispatchers implemented with real endpoints', async () => {
  const allProbes = [
    'BYPASS-01', 'BYPASS-02', 'BYPASS-03', 'BYPASS-04', 'BYPASS-05',
    'HOOK-01', 'HOOK-02', 'HOOK-03', 'HOOK-04', 'HOOK-05', 'HOOK-06', 'HOOK-07',
    'SESSION-01', 'SESSION-02', 'SESSION-03', 'SESSION-04', 'SESSION-05', 'SESSION-06'
  ];

  const mockAllFetch = async (url) => {
    if (url.includes('grant_type=password')) {
      return { status: 200, json: async () => ({ access_token: createMockJwt(), refresh_token: 'r-1', user: { id: 'u-1' }, session_id: 's-1' }) };
    }
    if (url.includes('grant_type=refresh_token')) {
      return { status: 200, json: async () => ({ access_token: createMockJwt(), refresh_token: 'r-2' }) };
    }
    if (url.includes('/auth/v1/user')) {
      return { status: 200, json: async () => ({ id: 'u-1' }) };
    }
    if (url.includes('/auth/v1/logout')) {
      return { status: 204, json: async () => ({}) };
    }
    if (url.includes('/rest/v1/task06i_session_probe')) {
      return { status: 200, json: async () => ([]) };
    }
    if (url.includes('/storage/v1/object/')) {
      return { status: 200, json: async () => ({}) };
    }
    if (url.includes('/functions/v1/auth-user-probe')) {
      return { status: 401, json: async () => ({ error_code: 'AuthSessionMissingError' }) };
    }
    return { status: 500, json: async () => ({ error_code: 'hook_error', message: '42501' }) };
  };

  const allCtx = createRunContext();
  const allDisp = createHostedDispatcher({ anonKey: validTestAnonKey, serviceRoleKey: validTestServiceRoleKey, runContext: allCtx, fetchFn: mockAllFetch });
  for (const id of allProbes) {
    const outcome = await allDisp({ id, testUser: 'test@proof.invalid' });
    assert.notEqual(outcome.status, 501, `Probe ${id} must not return 501`);
  }
});

// ---------------------------------------------------------------------------
// Task 06I-B1-H1-R3: Hosted Evidence Integrity & Security Boundary Tests
// ---------------------------------------------------------------------------

test('44. Task 06I-B1-H1-R3 (R3-01): OTP probes reject unsupported_grant_type as hook proof', async () => {
  const hook03 = { id: 'HOOK-03', category: 'Token Hook' };
  const hook04 = { id: 'HOOK-04', category: 'Token Hook' };

  // 1. validateProbeOutcome rejects unsupported_grant_type as false proof
  const resOtp = validateProbeOutcome(hook03, {
    passed: true,
    status: 400,
    error_code: 'unsupported_grant_type',
    error: 'unsupported grant_type otp'
  });
  assert.equal(resOtp.passed, false);
  assert.match(resOtp.reason, /FALSE_PROOF_REJECTED.*unsupported_grant_type/);

  const resRec = validateProbeOutcome(hook04, {
    passed: true,
    status: 400,
    error: 'unsupported_grant_type'
  });
  assert.equal(resRec.passed, false);
  assert.match(resRec.reason, /FALSE_PROOF_REJECTED.*unsupported_grant_type/);

  // 2. Dispatcher returns PROVIDER_PRECONDITION_MISSING
  const disp = createHostedDispatcher({ anonKey: validTestAnonKey, fetchFn: async () => ({ status: 400 }) });
  const out03 = await disp(hook03);
  assert.equal(out03.status, 0);
  assert.equal(out03.passed, false);
  assert.match(out03.error, /PROVIDER_PRECONDITION_MISSING/);
});

test('45. Task 06I-B1-H1-R3 (R3-02): Client-controlled AMR injection rejected; PL/pgSQL parity required', async () => {
  const hook05 = { id: 'HOOK-05', category: 'Token Hook' };
  const hook06 = { id: 'HOOK-06', category: 'Token Hook' };
  const hook07 = { id: 'HOOK-07', category: 'Token Hook' };

  const disp = createHostedDispatcher({ anonKey: validTestAnonKey, fetchFn: async () => ({ status: 400 }) });
  for (const item of [hook05, hook06, hook07]) {
    const out = await disp(item);
    assert.equal(out.status, 0);
    assert.equal(out.passed, false);
    assert.match(out.error, /BLOCKED_UNSUPPORTED: HOOK-0[567] cannot be triggered via HTTP client body parameters/);
  }

  // Specifications declare Layer A PL/pgSQL contract parity
  assert.equal(HOSTED_PROBE_SPECIFICATIONS['HOOK-05'].evidenceSource, 'PLPGSQL_FUNCTION_EXECUTION_42501');
  assert.equal(HOSTED_PROBE_SPECIFICATIONS['HOOK-06'].evidenceSource, 'PLPGSQL_FUNCTION_EXECUTION_42501');
  assert.equal(HOSTED_PROBE_SPECIFICATIONS['HOOK-07'].evidenceSource, 'PLPGSQL_TRANSACTION_ABORT_500');
});

test('46. Task 06I-B1-H1-R3 (R3-03): JWT linger evidence rejects contradictory outcomes (401, 404, expired tokens)', () => {
  const session04 = { id: 'SESSION-04', category: 'Session & Consumer' };
  const session05 = { id: 'SESSION-05', category: 'Session & Consumer' };

  // HTTP 401 is rejection, NOT linger proof
  const res401 = validateProbeOutcome(session04, { passed: true, status: 401, stateless_linger_documented: true, note: 'got 401' });
  assert.equal(res401.passed, false);
  assert.match(res401.reason, /HTTP_STATUS_MISMATCH: SESSION-04 expected HTTP 200/);

  // HTTP 404 is missing fixture, NOT linger proof
  const res404 = validateProbeOutcome(session05, { passed: true, status: 404, stateless_linger_documented: true, note: 'got 404' });
  assert.equal(res404.passed, false);
  assert.match(res404.reason, /HTTP_STATUS_MISMATCH: SESSION-05 expected HTTP 200/);

  // Expired token (token_unexpired !== true) fails closed
  const resExpired = validateProbeOutcome(session04, { passed: true, status: 200, token_unexpired: false, stateless_linger_documented: true, note: 'expired' });
  assert.equal(resExpired.passed, false);
  assert.match(resExpired.reason, /MISSING_EVIDENCE.*unexpired/);

  // Pass ONLY with HTTP 200 + unexpired token + documentation
  const resPass = validateProbeOutcome(session04, {
    passed: true,
    status: 200,
    token_unexpired: true,
    stateless_linger_documented: true,
    note: 'HTTP 200 signature-verified access within bounded 300s exp'
  });
  assert.equal(resPass.passed, true);
});

test('47. Task 06I-B1-H1-R3 (R3-04): Password reset strictly requires Admin privileges; logout fallback rejected', async () => {
  const session02 = { id: 'SESSION-02', category: 'Session & Consumer' };

  // Logout fallback fails closed
  const resFallback = validateProbeOutcome(session02, {
    passed: true,
    status: 200,
    logout_fallback: true,
    remaining_sessions: 0,
    session_revoked: true
  });
  assert.equal(resFallback.passed, false);
  assert.match(resFallback.reason, /SECURITY_INVARIANT_VIOLATION: SESSION-02 used logout fallback/);

  // Dispatcher requires serviceRoleKey for admin password reset
  const dispWithoutAdmin = createHostedDispatcher({ anonKey: validTestAnonKey, serviceRoleKey: null });
  const outNoAdmin = await dispWithoutAdmin(session02);
  assert.equal(outNoAdmin.passed, false);
  assert.match(outNoAdmin.error, /TIO_TEMP_SERVICE_ROLE_KEY/);
});

test('48. Task 06I-B1-H1-R3 (R3-05): Session identity correlation rejects user IDs and placeholder strings', async () => {
  const session01 = { id: 'SESSION-01', category: 'Session & Consumer' };
  const session03 = { id: 'SESSION-03', category: 'Session & Consumer' };
  const session06 = { id: 'SESSION-06', category: 'Session & Consumer' };

  // SESSION-01 rejects 'sess-default'
  const resDefault01 = validateProbeOutcome(session01, { passed: true, status: 200, session_created: true, session_id: 'sess-default' });
  assert.equal(resDefault01.passed, false);
  assert.match(resDefault01.reason, /placeholder rejected/);

  // SESSION-03 rejects 'sess-default'
  const resDefault03 = validateProbeOutcome(session03, {
    passed: true,
    status: 401,
    pre_reset_baseline_verified: true,
    reset_completed: true,
    session_id: 'sess-default',
    correlated_session_id: 'sess-default',
    error_code: 'session_not_found'
  });
  assert.equal(resDefault03.passed, false);
  assert.match(resDefault03.reason, /placeholder rejected/);

  // SESSION-06 reports PROVIDER_PRECONDITION_MISSING when Edge Function returns 404
  const runCtx = createRunContext();
  runCtx.activeAccessToken = 'token-abc';
  runCtx.activeSessionId = 'sess-valid-uuid';
  const disp = createHostedDispatcher({
    anonKey: validTestAnonKey,
    runContext: runCtx,
    fetchFn: async () => ({ status: 404, json: async () => ({ message: 'Function not found' }) })
  });
  const out06 = await disp(session06, { runContext: runCtx });
  assert.equal(out06.status, 404);
  assert.equal(out06.passed, false);
  assert.match(out06.error, /PROVIDER_PRECONDITION_MISSING: Edge Function auth-user-probe is not deployed/);
});

test('49. Task 06I-B1-H1-R3 (R3-06): Bypass verify probes distinguish upstream rejection from hook rejection', () => {
  const bypass03 = { id: 'BYPASS-03', category: 'Native Bypass' };
  const bypass04 = { id: 'BYPASS-04', category: 'Native Bypass' };

  // Fake OTP returning 400 otp_expired before hook
  const resOtpExpired = validateProbeOutcome(bypass03, { passed: true, status: 400, error_code: 'otp_expired' });
  assert.equal(resOtpExpired.passed, false);
  assert.match(resOtpExpired.reason, /FALSE_PROOF_REJECTED.*upstream GoTrue pre-validation/);

  // Magic link returning 404 before hook
  const res404 = validateProbeOutcome(bypass04, { passed: true, status: 404, error: 'Not Found' });
  assert.equal(res404.passed, false);
  assert.match(res404.reason, /FALSE_PROOF_REJECTED.*upstream GoTrue pre-validation/);

  // Affirmative hook rejection passes
  const resHook = validateProbeOutcome(bypass03, { passed: true, status: 500, hook_rejected: true, error: 'hook_error: 42501' });
  assert.equal(resHook.passed, true);
});

test('50. Task 06I-B1-H1-R3 (R3-07): Cleanup execution lifecycle in try/finally with partial failure detection', async () => {
  const inventory = new TestRunInventory('test-run-cleanup-lifecycle');
  inventory.registerCreatedUser({ id: 'user-to-clean', email: 'clean-me@proof.invalid' });

  let deletedUserIds = [];
  const mockAdminClient = {
    async deleteUser(userId) {
      deletedUserIds.push(userId);
      return { data: { user: { id: userId } }, error: null };
    },
    async getUserById() {
      return { data: null, error: { status: 404, message: 'User not found' } };
    }
  };

  const mockDispatcher = async () => ({
    passed: false,
    status: 500,
    reason: 'simulated halt'
  });

  const res = await runHostedProbeRunner({
    projectRef: HARDCODED_TEMP_REF,
    argv: ['--live'],
    env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
    adminClient: defaultMockAdminClient,
    inventory,
    adminClient: mockAdminClient,
    mockDispatcher,
    sleepFn: async () => {}
  });

  assert.equal(res.status, 'HALTED_ON_FAILURE');
  assert.ok(res.cleanupReport, 'cleanupReport must be included in runner result');
  assert.equal(res.cleanupReport.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(res.cleanupReport.usersDeleted, 1);
  assert.deepEqual(deletedUserIds, ['user-to-clean']);
});

test('51. Task 06I-B1-H1-R3 (R3-08): Strict JWT parsing without bypass; non-JSON or malformed tokens fail closed', () => {
  const hook01 = { id: 'HOOK-01', category: 'Token Hook' };

  // 1. Non-JSON payload base64 fails closed
  const notJsonToken = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from('not-json').toString('base64url')}.sig`;
  const resNotJson = validateProbeOutcome(hook01, {
    passed: true,
    status: 200,
    session_id: 'session-uuid-5678',
    access_token: notJsonToken,
    amr_authenticated: true
  });
  assert.equal(resNotJson.passed, false);
  assert.match(resNotJson.reason, /JWT_CLAIM_VIOLATION: HOOK-01 TOKEN_PARSE_ERROR/);

  // 2. Missing dot-separated parts fails closed
  const resFormat = validateProbeOutcome(hook01, {
    passed: true,
    status: 200,
    session_id: 'session-uuid-5678',
    access_token: 'one.two',
    amr_authenticated: true
  });
  assert.equal(resFormat.passed, false);
  assert.match(resFormat.reason, /JWT_CLAIM_VIOLATION: HOOK-01 TOKEN_FORMAT_INVALID/);

  // 3. Valid parsed JWT passes
  const validToken = createMockJwt();
  const resValid = validateProbeOutcome(hook01, {
    passed: true,
    status: 200,
    session_id: 'session-uuid-5678',
    access_token: validToken
  });
  assert.equal(resValid.passed, true);
});

test('52. Task 06I-B1-H1-R3 (R3-09): Pre-existing seed user survives cleanup; only createdThisRun deleted', async () => {
  const inventory = new TestRunInventory('test-run-seed-preservation');

  // Pre-existing seed user from HOOK-01 login
  inventory.registerReferencedUser({ id: 'seed-user-uuid', email: 'tio-test-user-06i@proof.invalid' });
  // Accidental user created in this run
  inventory.registerCreatedUser({ id: 'signup-user-uuid', email: 'accidental-signup@proof.invalid' });

  const deletedUsers = [];
  const mockAdminClient = {
    async deleteUser(userId) {
      deletedUsers.push(userId);
      return { data: { user: { id: userId } }, error: null };
    },
    async getUserById(userId) {
      if (deletedUsers.includes(userId)) {
        return { data: null, error: { status: 404 } };
      }
      return { data: { user: { id: userId } }, error: null };
    }
  };

  const report = await inventory.executeCleanup({ adminClient: mockAdminClient });
  assert.equal(report.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(report.createdUsersAttempted, 1);
  assert.equal(report.usersDeleted, 1);
  assert.equal(report.referencedUsersPreserved, 1);
  assert.deepEqual(deletedUsers, ['signup-user-uuid']);
  assert.ok(!deletedUsers.includes('seed-user-uuid'), 'Seed user must NEVER be deleted');
});

test('53. Task 06I-B1-H1-R3 (R3-10): Credential boundary validation rejects generic keys and production keys for TEMP', () => {
  // Helper to make a mock Supabase key JWT
  const makeKey = (ref, role = 'anon') => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ ref, role, iss: 'supabase' })).toString('base64url');
    return `${header}.${payload}.sig`;
  };

  // Valid TEMP key accepted
  const tempKey = makeKey(HARDCODED_TEMP_REF);
  assert.equal(validateProjectCredentialBinding(tempKey, HARDCODED_TEMP_REF), true);

  // REAL key rejected with critical security violation
  const realKey = makeKey(HARDCODED_REAL_REF);
  assert.throws(
    () => validateProjectCredentialBinding(realKey, HARDCODED_TEMP_REF),
    /CRITICAL_SECURITY_VIOLATION.*forbidden project/
  );

  // Tio-world key rejected with critical security violation
  const tioWorldKey = makeKey(HARDCODED_TIO_WORLD_REF);
  assert.throws(
    () => validateProjectCredentialBinding(tioWorldKey, HARDCODED_TEMP_REF),
    /CRITICAL_SECURITY_VIOLATION.*forbidden project/
  );

  // Key bound to another project ref fails closed
  const otherKey = makeKey('otherprojectrefxyz');
  assert.throws(
    () => validateProjectCredentialBinding(otherKey, HARDCODED_TEMP_REF),
    /CREDENTIAL_TARGET_MISMATCH/
  );
});

test('54. Layer B 18-case readiness matrix taxonomy validation', () => {
  const specs = Object.values(HOSTED_PROBE_SPECIFICATIONS);
  assert.equal(specs.length, 18, 'Must declare exactly 18 probe specifications');

  const implementedOffline = specs.filter(s => s.readinessStatus === 'IMPLEMENTED_OFFLINE_TESTED');
  const providerPrecondition = specs.filter(s => s.readinessStatus === 'PROVIDER_PRECONDITION_MISSING');
  const blockedUnsupported = specs.filter(s => s.readinessStatus === 'BLOCKED_UNSUPPORTED');
  const hostedVerified = specs.filter(s => s.hostedStatus === 'HOSTED_VERIFIED');

  assert.equal(implementedOffline.length, 10, 'Must have 10 IMPLEMENTED_OFFLINE_TESTED');
  assert.equal(providerPrecondition.length, 5, 'Must have 5 PROVIDER_PRECONDITION_MISSING');
  assert.equal(blockedUnsupported.length, 3, 'Must have 3 BLOCKED_UNSUPPORTED');
  assert.equal(hostedVerified.length, 0, 'Must have 0 HOSTED_VERIFIED before live execution approval');
});

test('55. Task 06I-B1-H1-R4 (R4-01): Credential binding check fails closed on undecodable JWTs, opaque keys, missing ref/iss, and forged project claims', () => {
  // 1. Opaque keys or malformed part counts throw OPAQUE_CREDENTIAL_UNSUPPORTED
  assert.throws(
    () => validateProjectCredentialBinding('sb_publishable_someopaqueapikey123', HARDCODED_TEMP_REF),
    /OPAQUE_CREDENTIAL_UNSUPPORTED/
  );
  assert.throws(
    () => validateProjectCredentialBinding('random-opaque-string', HARDCODED_TEMP_REF),
    /OPAQUE_CREDENTIAL_UNSUPPORTED/
  );
  assert.throws(
    () => validateProjectCredentialBinding('part1.part2', HARDCODED_TEMP_REF),
    /OPAQUE_CREDENTIAL_UNSUPPORTED/
  );

  // 2. Undecodable base64url payload throws MALFORMED_CREDENTIAL_JWT
  assert.throws(
    () => validateProjectCredentialBinding('header.!!!invalid-base64!!!.sig', HARDCODED_TEMP_REF),
    /MALFORMED_CREDENTIAL_JWT/
  );

  // 3. JWT without ref or iss throws CREDENTIAL_PROJECT_UNBOUND
  const unboundPayload = Buffer.from(JSON.stringify({ role: 'anon', foo: 'bar' })).toString('base64url');
  const unboundHeader = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  assert.throws(
    () => validateProjectCredentialBinding(`${unboundHeader}.${unboundPayload}.sig`, HARDCODED_TEMP_REF),
    /CREDENTIAL_PROJECT_UNBOUND/
  );

  // 4. JWT bound to forbidden REAL project throws CRITICAL_SECURITY_VIOLATION
  const realKey = createMockProjectKey(HARDCODED_REAL_REF);
  assert.throws(
    () => validateProjectCredentialBinding(realKey, HARDCODED_TEMP_REF),
    /CRITICAL_SECURITY_VIOLATION.*forbidden project/
  );

  // 5. JWT bound to forbidden Tio-world project throws CRITICAL_SECURITY_VIOLATION
  const tioWorldKey = createMockProjectKey(HARDCODED_TIO_WORLD_REF);
  assert.throws(
    () => validateProjectCredentialBinding(tioWorldKey, HARDCODED_TEMP_REF),
    /CRITICAL_SECURITY_VIOLATION.*forbidden project/
  );

  // 6. JWT bound to mismatched project throws CREDENTIAL_TARGET_MISMATCH
  const mismatchedKey = createMockProjectKey('mismatchedref999');
  assert.throws(
    () => validateProjectCredentialBinding(mismatchedKey, HARDCODED_TEMP_REF),
    /CREDENTIAL_TARGET_MISMATCH/
  );

  // 7. Legitimate key bound to expected TEMP project succeeds
  const validKey = createMockProjectKey(HARDCODED_TEMP_REF);
  assert.equal(validateProjectCredentialBinding(validKey, HARDCODED_TEMP_REF), true);
});

test('56. Task 06I-B1-H1-R4 (R4-02): LIVE runner fails preflight if cleanup capability is missing; failed cleanup overrides probe success', async () => {
  const liveEnv = { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' };
  const dummyDispatcher = async () => ({ passed: true, status: 200, evidence: 'ok' });

  // 1. Missing adminClient in LIVE mode throws CLEANUP_CAPABILITY_REQUIRED before executing any probes
  let probesExecuted = false;
  await assert.rejects(
    async () => {
      await runHostedProbeRunner({
        projectRef: HARDCODED_TEMP_REF,
        argv: ['--live'],
        env: liveEnv,
        adminClient: null,
        mockDispatcher: async () => {
          probesExecuted = true;
          return { passed: true, status: 200 };
        }
      });
    },
    /CLEANUP_CAPABILITY_REQUIRED.*LIVE mode requires verified adminClient/
  );
  assert.equal(probesExecuted, false, 'Probes must not be executed when cleanup capability is missing');

  // 2. adminClient missing deleteUser method throws CLEANUP_CAPABILITY_REQUIRED
  await assert.rejects(
    async () => {
      await runHostedProbeRunner({
        projectRef: HARDCODED_TEMP_REF,
        argv: ['--live'],
        env: liveEnv,
        adminClient: { getUserById: async () => ({}) },
        mockDispatcher: dummyDispatcher
      });
    },
    /CLEANUP_CAPABILITY_REQUIRED.*adminClient must implement deleteUser and getUserById methods/
  );

  // 3. Failed cleanup overrides passing probes and marks overall run HALTED_ON_FAILURE
  const invWithResidual = new TestRunInventory('test-run-residual-override');
  invWithResidual.registerCreatedUser({ id: 'residual-user-fail', email: 'residual@proof.invalid' });

  const failingCleanupAdmin = {
    deleteUser: async () => ({ data: null, error: { message: 'Database lock timeout on delete' } }),
    getUserById: async () => ({ data: { user: { id: 'residual-user-fail' } }, error: null }),
    invalidateSession: async () => ({ data: null, error: null }),
    signOut: async () => ({ data: null, error: null })
  };

  const resultFailedCleanup = await runHostedProbeRunner({
    projectRef: HARDCODED_TEMP_REF,
    argv: ['--live'],
    env: liveEnv,
    inventory: invWithResidual,
    adminClient: failingCleanupAdmin,
    mockDispatcher: async (item) => {
      // Return passing outcomes for each probe
      if (item.id === 'BYPASS-01') return { passed: true, status: 422, route_disabled: true, error_code: 'email_provider_disabled' };
      if (item.id === 'BYPASS-02') return { passed: true, status: 422, signup_disabled: true, error_code: 'signup_disabled' };
      if (item.id === 'BYPASS-03' || item.id === 'BYPASS-04') return { passed: true, status: 500, hook_rejected: true, error: 'hook_error: 42501' };
      if (item.id === 'BYPASS-05') return { passed: true, status: 500, recovery_suppressed: true, zero_email_delivered: true };
      if (item.id === 'HOOK-01') return { passed: true, status: 200, has_token: true, amr_authenticated: true, session_id: 'session-uuid-5678', tokens: { access_token: createMockJwt() } };
      if (item.id === 'HOOK-02') return { passed: true, status: 200, has_token: true, amr_preserved: true, tokens: { access_token: createMockJwt() } };
      if (['HOOK-03', 'HOOK-04', 'HOOK-05', 'HOOK-06', 'HOOK-07'].includes(item.id)) return { passed: true, status: 500, hook_rejected: true, error: 'hook_error: 42501' };
      if (item.id === 'SESSION-01') return { passed: true, status: 200, session_created: true, session_id: 'session-uuid-5678' };
      if (item.id === 'SESSION-02') return { passed: true, status: 200, password_reset_completed: true, session_revoked: true, session_revocation_verified: true, remaining_sessions: 0 };
      if (item.id === 'SESSION-03') return { passed: true, status: 403, pre_reset_baseline_verified: true, reset_completed: true, session_id: 'session-uuid-5678', correlated_session_id: 'session-uuid-5678', pre_session_id: 'session-uuid-5678', same_session_correlated: true, error_code: 'session_not_found' };
      if (item.id === 'SESSION-04' || item.id === 'SESSION-05') return { passed: true, status: 200, token_unexpired: true, stateless_linger_documented: true, note: 'linger window verified' };
      if (item.id === 'SESSION-06') return { passed: true, status: 403, pre_reset_baseline_verified: true, reset_completed: true, session_id: 'session-uuid-5678', correlated_session_id: 'session-uuid-5678', pre_session_id: 'session-uuid-5678', same_session_correlated: true, error_code: 'AuthSessionMissingError' };
      return { passed: true, status: 200 };
    },
    sleepFn: async () => {}
  });

  assert.equal(resultFailedCleanup.status, 'HALTED_ON_FAILURE');
  assert.equal(resultFailedCleanup.aborted, true);
  assert.match(resultFailedCleanup.abortReason, /CLEANUP_FAILURE.*Residual users/i);
  assert.equal(resultFailedCleanup.cleanupReport.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
});

test('57. Task 06I-B1-H1-R4 (R4-03): Password reset in SESSION-02 requires affirmative proof of session revocation; surviving session fails closed', async () => {
  const session02 = { id: 'SESSION-02', category: 'Session & Consumer' };

  // 1. Password reset succeeded (HTTP 200) but remaining_sessions is 1 (session survived!) -> fails closed
  const resSurviving = validateProbeOutcome(session02, {
    passed: true,
    status: 200,
    password_reset_completed: true,
    session_revoked: false,
    remaining_sessions: 1,
    session_revocation_verified: false
  });
  assert.equal(resSurviving.passed, false);
  assert.match(resSurviving.reason, /SESSION_FAILURE: SESSION-02 requires affirmative proof of session revocation/);

  // 2. Password reset succeeded without session_revocation_verified -> fails closed
  const resUnverified = validateProbeOutcome(session02, {
    passed: true,
    status: 200,
    password_reset_completed: true,
    session_revoked: true,
    remaining_sessions: 0,
    session_revocation_verified: false
  });
  assert.equal(resUnverified.passed, false);
  assert.match(resUnverified.reason, /SESSION_FAILURE: SESSION-02 requires affirmative proof of session revocation/);

  // 3. createHostedDispatcher detects surviving session regression when pre-reset token still succeeds with HTTP 200
  const runCtx = createRunContext();
  runCtx.activeUserId = 'user-test-reset-123';
  runCtx.activeAccessToken = createMockJwt();

  const mockFetchSurviving = async (url) => {
    if (url.includes('/auth/v1/admin/users/')) {
      return { status: 200, json: async () => ({ id: 'user-test-reset-123' }) };
    }
    if (url.includes('/auth/v1/user')) {
      // Session survived! Still returns 200!
      return { status: 200, json: async () => ({ id: 'user-test-reset-123' }) };
    }
    return { status: 400, json: async () => ({}) };
  };

  const dispSurviving = createHostedDispatcher({
    anonKey: validTestAnonKey,
    serviceRoleKey: validTestServiceRoleKey,
    runContext: runCtx,
    fetchFn: mockFetchSurviving
  });

  const outSurviving = await dispSurviving(session02);
  assert.equal(outSurviving.passed, false);
  assert.equal(outSurviving.remaining_sessions, 1);
  assert.equal(outSurviving.session_revoked, false);
  assert.match(outSurviving.error, /SECURITY_REGRESSION.*session was not revoked/);

  // 4. When /auth/v1/user returns 401 on pre-reset token, session revocation is verified
  const mockFetchRevoked = async (url) => {
    if (url.includes('/auth/v1/admin/users/')) {
      return { status: 200, json: async () => ({ id: 'user-test-reset-123' }) };
    }
    if (url.includes('/auth/v1/user')) {
      return { status: 401, json: async () => ({ message: 'Invalid token' }) };
    }
    return { status: 400, json: async () => ({}) };
  };

  const dispRevoked = createHostedDispatcher({
    anonKey: validTestAnonKey,
    serviceRoleKey: validTestServiceRoleKey,
    runContext: runCtx,
    fetchFn: mockFetchRevoked
  });

  const outRevoked = await dispRevoked(session02);
  assert.equal(outRevoked.passed, true);
  assert.equal(outRevoked.remaining_sessions, 0);
  assert.equal(outRevoked.session_revoked, true);
  assert.equal(outRevoked.session_revocation_verified, true);
});

test('58. Task 06I-B1-H1-R4 (R4-04): SESSION-06 and SESSION-03 reject generic 401/403 Forbidden without provider-observed revocation error', async () => {
  const session06 = { id: 'SESSION-06', category: 'Session & Consumer' };
  const session03 = { id: 'SESSION-03', category: 'Session & Consumer' };

  // 1. Generic 403 Forbidden without AuthSessionMissingError does NOT pass in createHostedDispatcher for SESSION-06
  const runCtx = createRunContext();
  runCtx.activeAccessToken = createMockJwt();
  runCtx.activeSessionId = 'sess-active-6';
  runCtx.preInvalidationSessionValid = true;
  runCtx.passwordResetCompleted = true;

  const mockFetchGenericForbidden = async (url) => {
    if (url.includes('/functions/v1/auth-user-probe')) {
      return { status: 403, json: async () => ({ message: 'Forbidden' }) };
    }
    if (url.includes('/auth/v1/user')) {
      return { status: 403, json: async () => ({ message: 'Forbidden' }) };
    }
    return { status: 400, json: async () => ({}) };
  };

  const disp = createHostedDispatcher({
    anonKey: validTestAnonKey,
    runContext: runCtx,
    fetchFn: mockFetchGenericForbidden
  });

  const out06 = await disp(session06);
  assert.equal(out06.passed, false, 'Generic 403 Forbidden must not pass SESSION-06');
  assert.equal(out06.revocation_verified, false);
  assert.notEqual(out06.error_code, 'AuthSessionMissingError', 'Must not synthesize AuthSessionMissingError');
  assert.equal(out06.error, 'Forbidden');

  // 2. Generic 403 Forbidden in SESSION-03 does NOT pass
  const out03 = await disp(session03);
  assert.equal(out03.passed, false, 'Generic 403 Forbidden must not pass SESSION-03');
  assert.equal(out03.revocation_verified, false);
  assert.notEqual(out03.error_code, 'session_not_found', 'Must not synthesize session_not_found');

  // 3. Genuine AuthSessionMissingError in SESSION-06 passes
  const mockFetchGenuineError = async (url) => {
    if (url.includes('/functions/v1/auth-user-probe')) {
      return { status: 401, json: async () => ({ error_code: 'AuthSessionMissingError', message: 'Session is revoked or missing' }) };
    }
    return { status: 400, json: async () => ({}) };
  };

  const dispGenuine = createHostedDispatcher({
    anonKey: validTestAnonKey,
    runContext: runCtx,
    fetchFn: mockFetchGenuineError
  });

  const outGenuine06 = await dispGenuine(session06);
  assert.equal(outGenuine06.passed, true);
  assert.equal(outGenuine06.error_code, 'AuthSessionMissingError');
  assert.equal(outGenuine06.revocation_verified, true);
});

test('59. Task 06I-B1-H1-R4 (R4-05): Session cleanup fails closed when session invalidation method is missing or returns error', async () => {
  const inv = new TestRunInventory('test-run-session-cleanup');
  inv.registerSession('session-uuid-active-1');

  // 1. adminClient lacking invalidateSession and signOut fails cleanup closed
  const clientNoInvalidation = {
    deleteUser: async () => ({ data: null, error: null }),
    getUserById: async () => ({ data: null, error: { status: 404 } })
  };

  const reportNoMethod = await inv.executeCleanup({ adminClient: clientNoInvalidation, failClosed: false });
  assert.equal(reportNoMethod.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.ok(reportNoMethod.residualResources.some(r => r.type === 'sessions' && r.error.includes('MISSING_SESSION_INVALIDATION_METHOD')));

  // 2. adminClient returning error on invalidateSession fails cleanup closed
  const clientErrorInvalidation = {
    deleteUser: async () => ({ data: null, error: null }),
    getUserById: async () => ({ data: null, error: { status: 404 } }),
    invalidateSession: async (id) => ({ data: null, error: { message: `Gateway timeout invalidating session ${id}` } })
  };

  const reportError = await inv.executeCleanup({ adminClient: clientErrorInvalidation, failClosed: false });
  assert.equal(reportError.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.ok(reportError.residualResources.some(r => r.type === 'session' && r.id === 'session-uuid-active-1'));

  // 3. Working session invalidation succeeds
  const clientSuccess = {
    deleteUser: async () => ({ data: null, error: null }),
    getUserById: async () => ({ data: null, error: { status: 404 } }),
    invalidateSession: async (id) => ({ data: { id }, error: null })
  };

  const reportSuccess = await inv.executeCleanup({ adminClient: clientSuccess, failClosed: false });
  assert.equal(reportSuccess.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(reportSuccess.sessionsRevoked, 1);
});

test('60. Task 06I-B1-H1-R4 (R4-06): User absence verification detects data.id, data.user.id, and treats 503/network error as verification failure', async () => {
  // 1. Detects existing user in standard Supabase GoTrue shape { data: { id: userId }, error: null }
  const inv1 = new TestRunInventory('test-user-verify-shape');
  inv1.registerCreatedUser({ id: 'user-standard-shape-1', email: 'shape1@proof.invalid' });

  const clientShape1 = {
    deleteUser: async () => ({ data: null, error: null }),
    getUserById: async () => ({ data: { id: 'user-standard-shape-1', email: 'shape1@proof.invalid' }, error: null })
  };

  const report1 = await inv1.executeCleanup({ adminClient: clientShape1, failClosed: false });
  assert.equal(report1.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.ok(report1.residualUsers.some(u => u.id === 'user-standard-shape-1' && u.reason === 'STILL_EXISTS_IN_DATABASE'));

  // 2. Detects existing user in nested shape { data: { user: { id: userId } }, error: null }
  const inv2 = new TestRunInventory('test-user-verify-shape-2');
  inv2.registerCreatedUser({ id: 'user-nested-shape-2', email: 'shape2@proof.invalid' });

  const clientShape2 = {
    deleteUser: async () => ({ data: null, error: null }),
    getUserById: async () => ({ data: { user: { id: 'user-nested-shape-2' } }, error: null })
  };

  const report2 = await inv2.executeCleanup({ adminClient: clientShape2, failClosed: false });
  assert.equal(report2.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.ok(report2.residualUsers.some(u => u.id === 'user-nested-shape-2' && u.reason === 'STILL_EXISTS_IN_DATABASE'));

  // 3. HTTP 503 or network error during absence check fails closed (NOT accepted as absence)
  const inv3 = new TestRunInventory('test-user-verify-503');
  inv3.registerCreatedUser({ id: 'user-503-fail', email: 'fail503@proof.invalid' });

  const client503 = {
    deleteUser: async () => ({ data: null, error: null }),
    getUserById: async () => ({ data: null, error: { status: 503, message: 'Service Unavailable' } })
  };

  const report3 = await inv3.executeCleanup({ adminClient: client503, failClosed: false });
  assert.equal(report3.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.ok(report3.residualUsers.some(u => u.id === 'user-503-fail' && u.error.includes('VERIFY_FAILED: Non-404 error')));

  // 4. Explicit 404 user_not_found confirms verified absence
  const inv4 = new TestRunInventory('test-user-verify-404');
  inv4.registerCreatedUser({ id: 'user-404-absent', email: 'absent@proof.invalid' });

  const client404 = {
    deleteUser: async () => ({ data: null, error: null }),
    getUserById: async () => ({ data: null, error: { status: 404, message: 'User not found' } })
  };

  const report4 = await inv4.executeCleanup({ adminClient: client404, failClosed: false });
  assert.equal(report4.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(report4.usersDeleted, 1);
  assert.equal(report4.residualUsers.length, 0);
});

test('61. Task 06I-B1-H1-R4 (R4-07): JWT AMR validation strictly matches SQL hook allowlist (rejects missing AMR, string arrays, and mixed/unknown methods)', () => {
  // 1. Missing amr claim fails closed
  const noAmrJwt = createMockJwt({ amr: undefined });
  const resNoAmr = parseAndValidateJwt(noAmrJwt);
  assert.equal(resNoAmr.valid, false);
  assert.match(resNoAmr.reason, /MISSING_AMR/);

  // 2. Empty amr array fails closed
  const emptyAmrJwt = createMockJwt({ amr: [] });
  const resEmptyAmr = parseAndValidateJwt(emptyAmrJwt);
  assert.equal(resEmptyAmr.valid, false);
  assert.match(resEmptyAmr.reason, /MALFORMED_AMR/);

  // 3. String array ['password'] is rejected (must be JSON object array matching RFC 8176)
  const stringAmrJwt = createMockJwt({ amr: ['password'] });
  const resStringAmr = parseAndValidateJwt(stringAmrJwt);
  assert.equal(resStringAmr.valid, false);
  assert.match(resStringAmr.reason, /MALFORMED_AMR_ELEMENT.*strings prohibited/);

  // 4. Unknown method [{ method: 'webauthn' }] fails closed
  const unknownAmrJwt = createMockJwt({ amr: [{ method: 'webauthn' }] });
  const resUnknownAmr = parseAndValidateJwt(unknownAmrJwt);
  assert.equal(resUnknownAmr.valid, false);
  assert.match(resUnknownAmr.reason, /PROHIBITED_AMR_METHOD.*only 'password' allowed/);

  // 5. Mixed methods [{ method: 'password' }, { method: 'otp' }] fail closed
  const mixedAmrJwt = createMockJwt({ amr: [{ method: 'password' }, { method: 'otp' }] });
  const resMixedAmr = parseAndValidateJwt(mixedAmrJwt);
  assert.equal(resMixedAmr.valid, false);
  assert.match(resMixedAmr.reason, /PROHIBITED_AMR_METHOD.*only 'password' allowed/);

  // 6. Valid RFC 8176 object array [{ method: 'password' }] succeeds
  const validAmrJwt = createMockJwt({ amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }] });
  const resValid = parseAndValidateJwt(validAmrJwt);
  assert.equal(resValid.valid, true);
});

test('62. Task 06I-B1-H1-R4 (R4-08): Send Email Hook suppression (42501) cannot be accepted as Custom Access Token Hook proof in BYPASS-04', async () => {
  const bypass04 = { id: 'BYPASS-04', category: 'Native Bypass' };

  // 1. createHostedDispatcher returns PROVIDER_PRECONDITION_MISSING because email suppression prevents obtaining redemption token
  const disp = createHostedDispatcher({
    anonKey: validTestAnonKey,
    fetchFn: async () => ({ status: 200 })
  });

  const outcome = await disp(bypass04);
  assert.equal(outcome.passed, false);
  assert.equal(outcome.hook_rejected, false);
  assert.equal(outcome.email_suppressed, true);
  assert.match(outcome.error, /PROVIDER_PRECONDITION_MISSING.*email delivery is suppressed/);

  // 2. validateProbeOutcome rejects outcomes claiming Send Email Hook suppression as access token hook proof
  const resSuppressionClaim = validateProbeOutcome(bypass04, {
    passed: true,
    status: 500,
    hook_rejected: true,
    email_suppressed: true,
    error: 'send_email_hook: native magiclink email dispatch suppressed'
  });
  assert.equal(resSuppressionClaim.passed, false);
  assert.match(resSuppressionClaim.reason, /FALSE_PROOF_REJECTED.*BYPASS-04 email hook suppression cannot be accepted as proof/);
});
