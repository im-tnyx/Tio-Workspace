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
  HOSTED_PROBE_SPECIFICATIONS,
  createHostedAdminClient,
  observeAndTrackSessionTokens
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
  const now = Math.floor(Date.now() / 1000);
  const exp = claims.exp !== undefined ? claims.exp : now + 300;
  const iat = claims.iat !== undefined ? claims.iat : (typeof exp === 'number' ? exp - 300 : now);
  const payload = {
    sub: 'user-uuid-1234',
    session_id: 'session-uuid-5678',
    iss: `https://${HARDCODED_TEMP_REF}.supabase.co/auth/v1`,
    aud: 'authenticated',
    iat,
    exp,
    amr_authenticated: 'true',
    amr: [{ method: 'password', timestamp: typeof iat === 'number' ? iat : now }],
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
      return { passed: true, status: 200, token_unexpired: true, jwt_lifetime_seconds: 300, lifetime_bounded: true, stateless_linger_documented: true, note: 'stateless linger window verified and documented' };
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
  assert.equal(validateProbeOutcome(session04, { passed: true, status: 200, token_unexpired: true, jwt_lifetime_seconds: 300, lifetime_bounded: true, stateless_linger_documented: true, note: 'linger window verified' }).passed, true);
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
  assert.equal(validateProbeOutcome(session04, { passed: true, status: 200, token_unexpired: true, jwt_lifetime_seconds: 300, lifetime_bounded: true, stateless_linger_documented: true, note: 'linger window verified' }).passed, true);

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

  // 8j. Genuine provider-observed session_not_found passes on SESSION-06 when correlation & baseline present (R6-03, PRRT_kwDOVtCmZc66rvnS)
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
  assert.equal(resEdgeSessionNotFound.passed, true);
  assert.equal(resEdgeSessionNotFound.status, 403);

  // 8k. Generic 403/401 Forbidden without provider-observed revocation code fails closed (R6-03)
  const resEdgeGenericForbidden = validateProbeOutcome(session06, {
    passed: true,
    status: 403,
    pre_reset_baseline_verified: true,
    reset_completed: true,
    session_id: 'sess-edge-1',
    correlated_session_id: 'sess-edge-1',
    pre_session_id: 'sess-edge-1',
    same_session_correlated: true,
    error: 'Forbidden'
  });
  assert.equal(resEdgeGenericForbidden.passed, false);
  assert.match(resEdgeGenericForbidden.reason, /MISSING_EVIDENCE/);
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

  // Pass ONLY with HTTP 200 + unexpired token + documentation + 300s lifetime bound (R7-02)
  const resPass = validateProbeOutcome(session04, {
    passed: true,
    status: 200,
    token_unexpired: true,
    jwt_lifetime_seconds: 300,
    lifetime_bounded: true,
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
      if (item.id === 'SESSION-04' || item.id === 'SESSION-05') return { passed: true, status: 200, token_unexpired: true, jwt_lifetime_seconds: 300, lifetime_bounded: true, stateless_linger_documented: true, note: 'linger window verified' };
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

  // 4. When /auth/v1/user returns generic 401 (e.g. 'Invalid token') without session_not_found, fails closed (R5-01)
  const mockFetchGenericInvalidToken = async (url) => {
    if (url.includes('/auth/v1/admin/users/')) {
      return { status: 200, json: async () => ({ id: 'user-test-reset-123' }) };
    }
    if (url.includes('/auth/v1/user')) {
      return { status: 401, json: async () => ({ message: 'Invalid token' }) };
    }
    return { status: 400, json: async () => ({}) };
  };

  const dispGeneric = createHostedDispatcher({
    anonKey: validTestAnonKey,
    serviceRoleKey: validTestServiceRoleKey,
    runContext: runCtx,
    fetchFn: mockFetchGenericInvalidToken
  });

  const outGeneric = await dispGeneric(session02);
  assert.equal(outGeneric.passed, false, 'Generic Invalid token cannot pass SESSION-02 (R5-01)');
  assert.equal(outGeneric.session_revoked, false);
  assert.match(outGeneric.error, /FALSE_PROOF_REJECTED/);

  // 5. When /auth/v1/user returns affirmative session_not_found provider error, session revocation is verified
  const mockFetchRevoked = async (url) => {
    if (url.includes('/auth/v1/admin/users/')) {
      return { status: 200, json: async () => ({ id: 'user-test-reset-123' }) };
    }
    if (url.includes('/auth/v1/user')) {
      return { status: 401, json: async () => ({ error_code: 'session_not_found', message: 'Session not found' }) };
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
  assert.equal(outRevoked.revocation_error_code, 'session_not_found');
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

test('63. Task 06I-B1-H1-R5 (R5-01): SESSION-02 rejects generic 401/403, bad_jwt, expired token, and ambiguous errors; strictly requires affirmative session_not_found', async () => {
  const session02 = { id: 'SESSION-02', category: 'Session & Consumer' };
  const runCtx = createRunContext();
  runCtx.activeAccessToken = createMockJwt();
  runCtx.activeUserId = 'user-r5-01';
  runCtx.activeSessionId = 'sess-r5-01';

  // 1. bad_jwt is rejected as FALSE_PROOF_REJECTED
  const dispBadJwt = createHostedDispatcher({
    anonKey: validTestAnonKey,
    serviceRoleKey: validTestServiceRoleKey,
    runContext: runCtx,
    fetchFn: async (url) => {
      if (url.includes('/auth/v1/admin/users/')) return { status: 200, json: async () => ({ id: 'user-r5-01' }) };
      if (url.includes('/auth/v1/user')) return { status: 401, json: async () => ({ error_code: 'bad_jwt', message: 'Token signature is invalid' }) };
      return { status: 400, json: async () => ({}) };
    }
  });
  const outBadJwt = await dispBadJwt(session02);
  assert.equal(outBadJwt.passed, false);
  assert.match(outBadJwt.error, /FALSE_PROOF_REJECTED/);

  // 2. Ambiguous 403 Forbidden without provider revocation error code fails closed
  const dispAmbiguous = createHostedDispatcher({
    anonKey: validTestAnonKey,
    serviceRoleKey: validTestServiceRoleKey,
    runContext: runCtx,
    fetchFn: async (url) => {
      if (url.includes('/auth/v1/admin/users/')) return { status: 200, json: async () => ({ id: 'user-r5-01' }) };
      if (url.includes('/auth/v1/user')) return { status: 403, json: async () => ({ message: 'Forbidden' }) };
      return { status: 400, json: async () => ({}) };
    }
  });
  const outAmbiguous = await dispAmbiguous(session02);
  assert.equal(outAmbiguous.passed, false);
  assert.match(outAmbiguous.error, /AMBIGUOUS_REJECTION/);

  // 3. validateProbeOutcome rejects false-proof outcome
  const resBadJwt = validateProbeOutcome(session02, {
    passed: true,
    status: 200,
    password_reset_completed: true,
    session_revoked: true,
    remaining_sessions: 0,
    session_revocation_verified: true,
    error_code: 'bad_jwt'
  });
  assert.equal(resBadJwt.passed, false);
  assert.match(resBadJwt.reason, /FALSE_PROOF_REJECTED/);

  // 4. validateProbeOutcome rejects ambiguous rejection
  const resAmbiguous = validateProbeOutcome(session02, {
    passed: true,
    status: 200,
    password_reset_completed: true,
    session_revoked: true,
    remaining_sessions: 0,
    session_revocation_verified: true,
    error_code: 'generic_forbidden'
  });
  assert.equal(resAmbiguous.passed, false);
  assert.match(resAmbiguous.reason, /MISSING_EVIDENCE/);

  // 5. Affirmative session_not_found passes validation
  const resAffirmative = validateProbeOutcome(session02, {
    passed: true,
    status: 200,
    password_reset_completed: true,
    session_revoked: true,
    remaining_sessions: 0,
    session_revocation_verified: true,
    session_id: 'sess-r5-01',
    pre_session_id: 'sess-r5-01',
    error_code: 'session_not_found'
  });
  assert.equal(resAffirmative.passed, true);
});

test('64. Task 06I-B1-H1-R5 (R5-02): Session cleanup rejects HTTP 404 from session deletion endpoint; unknown route or missing method fails closed', async () => {
  const inv = new TestRunInventory('test-run-session-404');
  inv.registerSession('session-to-clean-1');

  // 1. Session deletion returning 404 (e.g. unknown route or missing session) fails cleanup closed
  const client404 = {
    deleteUser: async () => ({ data: null, error: null }),
    getUserById: async () => ({ data: null, error: { status: 404 } }),
    invalidateSession: async () => ({ error: { status: 404, message: 'Endpoint or session not found (HTTP 404)' } })
  };

  const report404 = await inv.executeCleanup({ adminClient: client404, failClosed: false });
  assert.equal(report404.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.ok(report404.residualResources.some(r => r.type === 'session' && r.error.includes('404')));

  // 2. Session deletion returning 500 error fails cleanup closed
  const client500 = {
    deleteUser: async () => ({ data: null, error: null }),
    getUserById: async () => ({ data: null, error: { status: 404 } }),
    invalidateSession: async () => ({ error: { status: 500, message: 'Database connection failed 500' } })
  };
  const report500 = await inv.executeCleanup({ adminClient: client500, failClosed: false });
  assert.equal(report500.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.ok(report500.residualResources.some(r => r.type === 'session' && r.error.includes('500')));
});

test('65. Task 06I-B1-H1-R5 (R5-03): User absence check requires structured 404; 503 Service Unavailable with "not found" in message fails closed', async () => {
  const inv = new TestRunInventory('test-run-user-absence-503');
  inv.registerCreatedUser({ id: 'user-absence-503', email: 'absence503@proof.invalid' });

  // 1. 503 error containing 'not found' in message text must NOT be treated as absence
  const client503 = {
    deleteUser: async () => ({ data: null, error: null }),
    getUserById: async () => ({
      data: null,
      error: { status: 503, message: 'Upstream gateway service: route not found' }
    })
  };

  const report503 = await inv.executeCleanup({ adminClient: client503, failClosed: false });
  assert.equal(report503.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.ok(report503.residualUsers.some(u => u.id === 'user-absence-503' && u.error.includes('VERIFY_FAILED')));

  // 2. Exception with 503 status must NOT be treated as absence
  const clientThrow503 = {
    deleteUser: async () => ({ data: null, error: null }),
    getUserById: async () => {
      const err = new Error('Service Unavailable: user resource not found');
      err.status = 503;
      throw err;
    }
  };

  const reportThrow = await inv.executeCleanup({ adminClient: clientThrow503, failClosed: false });
  assert.equal(reportThrow.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.ok(reportThrow.residualUsers.some(u => u.id === 'user-absence-503'));

  // 3. Structured 404 confirms absence
  const clientExplicit404 = {
    deleteUser: async () => ({ data: null, error: null }),
    getUserById: async () => ({ data: null, error: { status: 404, message: 'User not found' } })
  };
  const reportExplicit = await inv.executeCleanup({ adminClient: clientExplicit404, failClosed: false });
  assert.equal(reportExplicit.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(reportExplicit.usersDeleted, 1);
});

test('66. Task 06I-B1-H1-R5 (R5-04): Successful password grant mints session that is tracked for cleanup immediately even when JWT claim validation fails', async () => {
  const hook01 = { id: 'HOOK-01', category: 'Token Hook' };
  const inv = new TestRunInventory('test-run-r5-04');
  const runCtx = createRunContext();

  // Create JWT with malformed AMR (string array ['password']) that fails parseAndValidateJwt
  const tokenWithBadAmr = createMockJwt({
    session_id: 'sess-minted-bad-amr-999',
    sub: 'user-minted-999',
    amr: ['password'] // Invalid RFC 8176 element (string instead of object)
  });

  const disp = createHostedDispatcher({
    anonKey: validTestAnonKey,
    inventory: inv,
    runContext: runCtx,
    fetchFn: async () => ({
      status: 200,
      json: async () => ({
        access_token: tokenWithBadAmr,
        refresh_token: 'refresh-999',
        session_id: 'sess-minted-bad-amr-999',
        user: { id: 'user-minted-999', email: 'tio-test-user-06i@proof.invalid' }
      })
    })
  });

  const outcome = await disp(hook01);

  // 1. Dispatcher rejected token for authorization because of JWT claim violation
  assert.equal(outcome.passed, false);
  assert.equal(outcome.jwt_claims_verified, false);
  assert.match(outcome.error, /JWT_CLAIM_VIOLATION/);

  // 2. BUT minted session was immediately captured and registered in inventory for cleanup!
  assert.equal(inv.trackedSessions.has('sess-minted-bad-amr-999'), true, 'Minted session must be registered for cleanup');
  assert.equal(outcome.session_cleanup_registered, true);

  // 3. activeAccessToken is NOT authorized in runCtx
  assert.equal(runCtx.activeAccessToken, null, 'Unverified JWT must not be stored as active authorized token');

  // 4. Cleanup executes and revokes the minted session
  const mockAdminClient = {
    deleteUser: async () => ({ data: null, error: null }),
    getUserById: async () => ({ data: null, error: { status: 404 } }),
    invalidateSession: async (id) => ({ data: { id }, error: null })
  };

  const cleanupReport = await inv.executeCleanup({ adminClient: mockAdminClient, failClosed: false });
  assert.equal(cleanupReport.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(cleanupReport.sessionsRevoked, 1);
});

test('67. Task 06I-B1-H1-R5 (R5-05): Mandatory JWT expiration: missing exp, string exp, NaN, Infinity, and exp < iat fail closed', () => {
  // 1. Missing exp claim fails closed
  const noExpJwt = createMockJwt({ exp: undefined });
  const resNoExp = parseAndValidateJwt(noExpJwt);
  assert.equal(resNoExp.valid, false);
  assert.match(resNoExp.reason, /MISSING_EXP/);

  // 2. Null exp claim fails closed
  const nullExpJwt = createMockJwt({ exp: null });
  const resNullExp = parseAndValidateJwt(nullExpJwt);
  assert.equal(resNullExp.valid, false);
  assert.match(resNullExp.reason, /MISSING_EXP/);

  // 3. String exp fails closed
  const stringExpJwt = createMockJwt({ exp: '1893456000' });
  const resStringExp = parseAndValidateJwt(stringExpJwt);
  assert.equal(resStringExp.valid, false);
  assert.match(resStringExp.reason, /INVALID_EXP/);

  // 4. NaN / Infinity exp fails closed
  const nanExpJwt = createMockJwt({ exp: NaN });
  const resNanExp = parseAndValidateJwt(nanExpJwt);
  assert.equal(resNanExp.valid, false);
  assert.match(resNanExp.reason, /MISSING_EXP|INVALID_EXP/);

  // 5. Temporal inconsistency: exp earlier than iat fails closed
  const now = Math.floor(Date.now() / 1000);
  const inconsistentJwt = createMockJwt({ iat: now + 500, exp: now + 100 });
  const resInconsistent = parseAndValidateJwt(inconsistentJwt);
  assert.equal(resInconsistent.valid, false);
  assert.match(resInconsistent.reason, /TEMPORAL_INCONSISTENCY/);

  // 6. Valid finite exp with temporal consistency passes
  const validExpJwt = createMockJwt({ iat: now - 10, exp: now + 3600 });
  const resValid = parseAndValidateJwt(validExpJwt);
  assert.equal(resValid.valid, true);
});

test('68. Task 06I-B1-H1-R5 (R5-06): Seed credential lifecycle: password reset modifies seed user; cleanup restores original seed password; sequential run can authenticate', async () => {
  const session02 = { id: 'SESSION-02', category: 'Session & Consumer' };
  const hook01 = { id: 'HOOK-01', category: 'Token Hook' };

  // Track provider user database state across runs
  let providerSeedPassword = DEFAULT_TEST_PASSWORD;
  const originalSeedPassword = providerSeedPassword;

  const mockAdminClient = {
    deleteUser: async () => ({ data: null, error: null }),
    getUserById: async () => ({ data: null, error: { status: 404 } }),
    invalidateSession: async (id) => ({ data: { id }, error: null }),
    updateUserById: async (userId, attrs) => {
      if (attrs.password) {
        providerSeedPassword = attrs.password;
      }
      return { data: { id: userId }, error: null };
    }
  };

  // --- RUN 1: Login, Password Reset, and Cleanup ---
  const inv1 = new TestRunInventory('run-1-seed-lifecycle');
  const runCtx1 = createRunContext();
  runCtx1.activeUserId = 'seed-user-uuid-1';
  runCtx1.activeSessionId = 'sess-run-1';
  runCtx1.activeAccessToken = createMockJwt({ sub: 'seed-user-uuid-1', session_id: 'sess-run-1' });

  const disp1 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    serviceRoleKey: validTestServiceRoleKey,
    inventory: inv1,
    runContext: runCtx1,
    fetchFn: async (url, opts) => {
      if (url.includes('/auth/v1/admin/users/')) {
        const body = JSON.parse(opts.body);
        providerSeedPassword = body.password;
        return { status: 200, json: async () => ({ id: 'seed-user-uuid-1' }) };
      }
      if (url.includes('/auth/v1/user')) {
        return { status: 401, json: async () => ({ error_code: 'session_not_found', message: 'Session not found' }) };
      }
      return { status: 400, json: async () => ({}) };
    }
  });

  const outReset = await disp1(session02);
  assert.equal(outReset.passed, true);
  assert.equal(providerSeedPassword, 'TioNewPassword#2026!', 'Seed user password changed to new password in provider');
  assert.equal(inv1.seedCredentialRestorations.length, 1, 'Inventory tracked password modification');

  // Run 1 Cleanup: Must restore original seed password!
  const cleanupReport1 = await inv1.executeCleanup({ adminClient: mockAdminClient, failClosed: true });
  assert.equal(cleanupReport1.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(cleanupReport1.seedCredentialsRestored, 1);
  assert.equal(providerSeedPassword, originalSeedPassword, 'Cleanup must restore original seed password in provider');

  // --- RUN 2: Sequential run authenticates with original seed password ---
  const inv2 = new TestRunInventory('run-2-seed-lifecycle');
  const runCtx2 = createRunContext();

  const disp2 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    inventory: inv2,
    runContext: runCtx2,
    fetchFn: async (url, opts) => {
      if (url.includes('/auth/v1/token')) {
        const creds = JSON.parse(opts.body);
        if (creds.password === providerSeedPassword) {
          const token = createMockJwt({ sub: 'seed-user-uuid-1', session_id: 'sess-run-2' });
          return {
            status: 200,
            json: async () => ({ access_token: token, refresh_token: 'refr-run-2', session_id: 'sess-run-2', user: { id: 'seed-user-uuid-1' } })
          };
        }
        return { status: 400, json: async () => ({ message: 'Invalid login credentials' }) };
      }
      return { status: 400, json: async () => ({}) };
    }
  });

  const outLogin2 = await disp2(hook01);
  assert.equal(outLogin2.passed, true, 'Run 2 must succeed logging in with restored seed credentials');
  assert.equal(runCtx2.activeSessionId, 'sess-run-2');
});

test('69. Task 06I-B1-H1-R5 (R5-07): Storage fixture readiness: SESSION-05 distinguishes missing 404 fixture from auth failure; storage object registered in inventory', async () => {
  const session05 = { id: 'SESSION-05', category: 'Session & Consumer' };
  const runCtx = createRunContext();
  runCtx.activeAccessToken = createMockJwt({ exp: Math.floor(Date.now() / 1000) + 300 });

  // 1. Missing storage object (HTTP 404) returns STORAGE_FIXTURE_MISSING (not an auth failure)
  const disp404 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    runContext: runCtx,
    fetchFn: async () => ({ status: 404, json: async () => ({ message: 'Object not found' }) })
  });
  const out404 = await disp404(session05);
  assert.equal(out404.passed, false);
  assert.equal(out404.status, 404);
  assert.match(out404.error, /STORAGE_FIXTURE_MISSING/);

  // 2. Storage object registration in inventory and cleanup
  const inv = new TestRunInventory('test-run-storage-clean');
  inv.registerStorageObject('task06i_probe_bucket', 'probe.txt');
  assert.equal(inv.trackedStorageObjects.get('task06i_probe_bucket').has('probe.txt'), true);

  let deletedPath = null;
  const mockAdminClient = {
    deleteUser: async () => ({ data: null, error: null }),
    getUserById: async () => ({ data: null, error: { status: 404 } }),
    deleteStorageObject: async (bucket, path) => {
      deletedPath = `${bucket}/${path}`;
      return { data: { message: 'Deleted' }, error: null };
    }
  };

  const report = await inv.executeCleanup({ adminClient: mockAdminClient, failClosed: true });
  assert.equal(report.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(report.storageObjectsDeleted, 1);
  assert.equal(deletedPath, 'task06i_probe_bucket/probe.txt');
});

test('70. Task 06I-B1-H1-R5 (R5-08): Edge Function contract rejects false revocation proof: generic invalid_token or provider error does not synthesize AuthSessionMissingError and fails SESSION-06', async () => {
  const session06 = { id: 'SESSION-06', category: 'Session & Consumer' };
  const runCtx = createRunContext();
  runCtx.activeAccessToken = createMockJwt();
  runCtx.activeSessionId = 'sess-r5-08';
  runCtx.preInvalidationSessionValid = true;
  runCtx.passwordResetCompleted = true;

  // 1. Edge Function returning generic invalid_token must FAIL SESSION-06
  const dispGeneric = createHostedDispatcher({
    anonKey: validTestAnonKey,
    runContext: runCtx,
    fetchFn: async () => ({
      status: 401,
      json: async () => ({ error: 'Invalid token: signature verification failed', error_code: 'invalid_token' })
    })
  });
  const outGeneric = await dispGeneric(session06);
  assert.equal(outGeneric.passed, false);
  assert.equal(outGeneric.revocation_verified, false);
  assert.match(outGeneric.error, /FALSE_PROOF_REJECTED/);

  // 2. Edge Function returning transient 500 database error must FAIL SESSION-06
  const disp500 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    runContext: runCtx,
    fetchFn: async () => ({
      status: 500,
      json: async () => ({ error: 'Internal server error connecting to GoTrue', error_code: 'internal_server_error' })
    })
  });
  const out500 = await disp500(session06);
  assert.equal(out500.passed, false);
  assert.equal(out500.revocation_verified, false);

  // 3. Genuine AuthSessionMissingError emitted on confirmed session absence PASSES
  const dispGenuine = createHostedDispatcher({
    anonKey: validTestAnonKey,
    runContext: runCtx,
    fetchFn: async () => ({
      status: 401,
      json: async () => ({ error: 'AuthSessionMissingError: session revoked by password change', error_code: 'AuthSessionMissingError' })
    })
  });
  const outGenuine = await dispGenuine(session06);
  assert.equal(outGenuine.passed, true);
  assert.equal(outGenuine.revocation_verified, true);
});

test('71. Task 06I-B1-H1-R6 (R6-01): Supported session revocation for cleanup preserves token context and uses GoTrue sign-out', async () => {
  const inv = new TestRunInventory('test-run-session-r6-01');
  const testToken = createMockJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
  const testSessionId = 'sess-cleanup-r6-01';

  // 1. registerSession preserves both sessionId and accessToken
  inv.registerSession(testSessionId, { accessToken: testToken });
  assert.equal(inv.trackedSessions.has(testSessionId), true);
  assert.equal(inv.getSessionToken(testSessionId), testToken);

  // 2. executeCleanup passes token context to supported signOut method
  let invokedToken = null;
  let invokedScope = null;
  const mockAdminClient = {
    deleteUser: async () => ({ data: null, error: null }),
    getUserById: async () => ({ data: null, error: { status: 404 } }),
    signOut: async (token, scope) => {
      invokedToken = token;
      invokedScope = scope;
      return { data: { scope }, error: null };
    }
  };

  const report = await inv.executeCleanup({ adminClient: mockAdminClient, failClosed: true });
  assert.equal(report.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(report.sessionsRevoked, 1);
  assert.equal(invokedToken, testToken, 'signOut must receive the exact registered user access token');
  assert.equal(invokedScope, 'local', 'signOut must request local scope to avoid global invalidation of unrelated sessions');

  // 3. When session is registered without token, signOut fails closed
  const invNoToken = new TestRunInventory('test-run-no-token');
  invNoToken.registerSession('sess-without-token');
  const reportNoToken = await invNoToken.executeCleanup({ adminClient: mockAdminClient, failClosed: false });
  assert.equal(reportNoToken.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.ok(reportNoToken.residualResources.some(r => r.type === 'session' && r.error.includes('MISSING_TOKEN_CONTEXT')));

  // 4. Standalone CLI adapter session invalidation contract
  let fetchUrl = null;
  let fetchMethod = null;
  let fetchAuthHeader = null;
  const mockFetch = async (url, opts) => {
    fetchUrl = url;
    fetchMethod = opts.method;
    fetchAuthHeader = opts.headers?.Authorization;
    return {
      ok: true,
      status: 200,
      json: async () => ({})
    };
  };

  // Re-create the CLI adapter signOut logic with mockFetch
  const testServiceKey = 'test-service-key-r6-01';
  const cliAdapter = {
    async signOut(token, scope = 'local') {
      if (!token || typeof token !== 'string' || !token.trim()) {
        return { error: { message: 'MISSING_TOKEN: signOut requires non-empty user access token' } };
      }
      const res = await mockFetch(`https://${HARDCODED_TEMP_REF}.supabase.co/auth/v1/logout?scope=${encodeURIComponent(scope)}`, {
        method: 'POST',
        headers: {
          apikey: testServiceKey,
          Authorization: `Bearer ${token.trim()}`,
          'Content-Type': 'application/json'
        }
      });
      if (!res.ok) {
        return { error: `HTTP_${res.status}` };
      }
      return { data: { scope }, error: null };
    },
    async invalidateSession(sessionId, token) {
      if (!token) {
        return {
          error: {
            status: 400,
            message: `UNSUPPORTED_SESSION_REVOCATION: GoTrue lacks an admin session-by-id deletion endpoint; access token context is required for targeted local sign-out of session '${sessionId}' (R6-01)`
          }
        };
      }
      return this.signOut(token, 'local');
    }
  };

  const cliResult = await cliAdapter.invalidateSession(testSessionId, testToken);
  assert.equal(cliResult.error, null);
  assert.match(fetchUrl, /\/auth\/v1\/logout\?scope=local$/);
  assert.equal(fetchMethod, 'POST');
  assert.equal(fetchAuthHeader, `Bearer ${testToken}`);
  assert.ok(!fetchUrl.includes('/admin/users/sessions'), 'Unsupported admin sessions route must NEVER be called');

  // Without token, CLI adapter fails closed
  const cliNoTokenResult = await cliAdapter.invalidateSession(testSessionId, null);
  assert.ok(cliNoTokenResult.error !== null);
  assert.match(cliNoTokenResult.error.message, /UNSUPPORTED_SESSION_REVOCATION/);
});

test('72. Task 06I-B1-H1-R6 (R6-02): Real Storage object provisioning contract and SESSION-05 baseline verification', async () => {
  // 1. Static contract verification on sql/testbed-fixtures.sql
  const sqlContent = fs.readFileSync('experiments/task06i/sql/testbed-fixtures.sql', 'utf8');
  assert.match(sqlContent, /STRICTLY PROHIBITED as a fixture alternative/, 'Direct SQL insert must be strictly prohibited');
  assert.match(sqlContent, /POST \/storage\/v1\/object\/task06i_probe_bucket\/probe\.txt/, 'Genuine Storage API upload must be specified');
  assert.match(sqlContent, /Establish pre-revocation baseline verification/, 'Pre-revocation baseline verification must be required');
  assert.match(sqlContent, /DELETE \/storage\/v1\/object\/task06i_probe_bucket\/probe\.txt/, 'Cleanup via Storage API must be specified');
  assert.ok(!sqlContent.includes('INSERT INTO storage.objects (id, bucket_id, name, owner_id, metadata)'), 'Option B direct SQL metadata insert must be removed');

  // 2. SESSION-05 dispatcher correctly distinguishes missing fixture from linger
  const session05 = { id: 'SESSION-05', category: 'Session & Consumer' };
  const runCtx = createRunContext();
  runCtx.activeAccessToken = createMockJwt({ exp: Math.floor(Date.now() / 1000) + 300 });

  // Missing fixture returns HTTP 404 (STORAGE_FIXTURE_MISSING)
  const disp404 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    runContext: runCtx,
    fetchFn: async () => ({ status: 404, json: async () => ({ message: 'Object not found' }) })
  });
  const out404 = await disp404(session05);
  assert.equal(out404.passed, false);
  assert.equal(out404.status, 404);
  assert.match(out404.error, /STORAGE_FIXTURE_MISSING/);

  // Authenticated probe with HTTP 200 before token expiration passes linger window demonstration
  const disp200 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    runContext: runCtx,
    fetchFn: async () => ({ status: 200, json: async () => ({ probe: 'task06i-storage-probe-content' }) })
  });
  const out200 = await disp200(session05);
  assert.equal(out200.passed, true);
  assert.equal(out200.status, 200);
  assert.equal(out200.stateless_linger_documented, true);

  const val200 = validateProbeOutcome(session05, out200);
  assert.equal(val200.passed, true);
  assert.equal(val200.status, 200);
});

test('73. Task 06I-B1-H1-R6 (R6-03): SESSION-06 accepts genuine provider-observed session_not_found evidence and rejects generic errors', async () => {
  const session06 = { id: 'SESSION-06', category: 'Session & Consumer' };
  const runCtx = createRunContext();
  runCtx.activeAccessToken = createMockJwt();
  runCtx.activeSessionId = 'sess-r6-03';
  runCtx.preInvalidationSessionValid = true;
  runCtx.passwordResetCompleted = true;

  // 1. Dispatcher observing genuine session_not_found from Edge Function
  const dispSessionNotFound = createHostedDispatcher({
    anonKey: validTestAnonKey,
    runContext: runCtx,
    fetchFn: async () => ({
      status: 403,
      json: async () => ({
        error: 'Session from session_id claim in JWT does not exist',
        error_code: 'session_not_found'
      })
    })
  });
  const outSessionNotFound = await dispSessionNotFound(session06);
  assert.equal(outSessionNotFound.passed, true);
  assert.equal(outSessionNotFound.revocation_verified, true);
  assert.equal(outSessionNotFound.error_code, 'session_not_found');

  // Validator accepts genuine session_not_found with full evidence chain
  const valSessionNotFound = validateProbeOutcome(session06, outSessionNotFound);
  assert.equal(valSessionNotFound.passed, true, 'SESSION-06 must PASS on genuine provider session_not_found (R6-03)');
  assert.equal(valSessionNotFound.status, 403);

  // 2. Dispatcher observing genuine AuthSessionMissingError
  const dispAuthMissing = createHostedDispatcher({
    anonKey: validTestAnonKey,
    runContext: runCtx,
    fetchFn: async () => ({
      status: 401,
      json: async () => ({
        error: 'AuthSessionMissingError: Session invalidated',
        error_code: 'AuthSessionMissingError'
      })
    })
  });
  const outAuthMissing = await dispAuthMissing(session06);
  assert.equal(outAuthMissing.passed, true);
  const valAuthMissing = validateProbeOutcome(session06, outAuthMissing);
  assert.equal(valAuthMissing.passed, true);

  // 3. Generic 403 Forbidden without provider revocation error code must FAIL closed
  const dispGeneric403 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    runContext: runCtx,
    fetchFn: async () => ({
      status: 403,
      json: async () => ({ message: 'Forbidden' })
    })
  });
  const outGeneric403 = await dispGeneric403(session06);
  assert.equal(outGeneric403.passed, false, 'Dispatcher must fail on generic 403 without revocation error code');
  const valGeneric403 = validateProbeOutcome(session06, outGeneric403);
  assert.equal(valGeneric403.passed, false);

  // If generic 403 is falsely claimed as passed: true, validator independently fails closed with MISSING_EVIDENCE
  const valSpoofed403 = validateProbeOutcome(session06, {
    ...outGeneric403,
    passed: true,
    error: 'Forbidden'
  });
  assert.equal(valSpoofed403.passed, false);
  assert.match(valSpoofed403.reason, /MISSING_EVIDENCE/);

  // 4. False proof (bad_jwt) must FAIL closed
  const dispBadJwt = createHostedDispatcher({
    anonKey: validTestAnonKey,
    runContext: runCtx,
    fetchFn: async () => ({
      status: 401,
      json: async () => ({ error_code: 'bad_jwt', message: 'Token is malformed' })
    })
  });
  const outBadJwt = await dispBadJwt(session06);
  assert.equal(outBadJwt.passed, false);
  const valBadJwt = validateProbeOutcome(session06, outBadJwt);
  assert.equal(valBadJwt.passed, false);
  assert.match(valBadJwt.reason, /FALSE_PROOF_REJECTED/);
});

// ---------------------------------------------------------------------------
// Task 06I-B1-H1-R7: Session Cleanup & JWT Lifetime Evidence Closure
// ---------------------------------------------------------------------------

test('74. Task 06I-B1-H1-R7 (R7-01): createHostedAdminClient adapter implements session revocation, user lifecycle, and resource cleanup without duplicate method shadowing', async () => {
  // 1. Factory security boundaries: strictly permitted only against HARDCODED_TEMP_REF
  assert.throws(
    () => createHostedAdminClient({ serviceRoleKey: validTestServiceRoleKey, projectRef: HARDCODED_REAL_REF }),
    /SECURITY_BOUNDARY_VIOLATION.*bsfwzvgynwriswapxpsp/
  );
  assert.throws(
    () => createHostedAdminClient({ serviceRoleKey: validTestServiceRoleKey, projectRef: HARDCODED_TIO_WORLD_REF }),
    /SECURITY_BOUNDARY_VIOLATION/
  );
  assert.throws(
    () => createHostedAdminClient({ serviceRoleKey: '', projectRef: HARDCODED_TEMP_REF }),
    /MISSING_HOSTED_CREDENTIALS/
  );

  // 2. Inspect method definitions: verify NO duplicate signOut method exists
  const calls = [];
  const deletedUsers = new Set();
  const mockFetch = async (url, opts) => {
    calls.push({ url, method: opts?.method, headers: opts?.headers, body: opts?.body });
    if (url.includes('/auth/v1/logout')) {
      return { ok: true, status: 200, json: async () => ({}) };
    }
    if (url.includes('/auth/v1/admin/users/')) {
      const userIdMatch = url.match(/\/auth\/v1\/admin\/users\/([^?]+)/);
      const targetUserId = userIdMatch ? decodeURIComponent(userIdMatch[1]) : null;
      if (opts?.method === 'DELETE') {
        if (targetUserId) deletedUsers.add(targetUserId);
        return { ok: true, status: 200, json: async () => ({}) };
      }
      if (opts?.method === 'GET') {
        if (targetUserId && deletedUsers.has(targetUserId)) {
          return { ok: false, status: 404, json: async () => ({ message: 'User not found', status: 404 }) };
        }
        return { ok: true, status: 200, json: async () => ({ id: targetUserId || 'u-r7-01', email: 'test@proof.invalid' }) };
      }
      if (opts?.method === 'PUT') {
        return { ok: true, status: 200, json: async () => ({ id: targetUserId || 'u-r7-01' }) };
      }
    }
    if (url.includes('/rest/v1/')) {
      return { ok: true, status: 200, json: async () => ([]) };
    }
    if (url.includes('/storage/v1/object/')) {
      return { ok: true, status: 200, json: async () => ({}) };
    }
    return { ok: false, status: 500, json: async () => ({ message: 'unexpected URL' }) };
  };

  const adminClient = createHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: mockFetch
  });

  // Verify all required methods exist as functions
  assert.equal(typeof adminClient.deleteUser, 'function');
  assert.equal(typeof adminClient.getUserById, 'function');
  assert.equal(typeof adminClient.signOut, 'function');
  assert.equal(typeof adminClient.invalidateSession, 'function');
  assert.equal(typeof adminClient.updateUserById, 'function');
  assert.equal(typeof adminClient.deleteTableRow, 'function');
  assert.equal(typeof adminClient.deleteStorageObject, 'function');

  // Verify signOut takes (token, scope) and is NOT shadowed by (sessionId)
  // Calling invalidateSession(sessionId, token) must invoke signOut(token, 'local')
  calls.length = 0;
  const testToken = createMockJwt();
  const resInvalidate = await adminClient.invalidateSession('sess-r7-01', testToken);
  assert.equal(resInvalidate.error, null);
  assert.equal(resInvalidate.data?.scope, 'local');
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/auth\/v1\/logout\?scope=local/);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].headers.Authorization, `Bearer ${testToken}`);
  assert.equal(calls[0].headers.apikey, validTestServiceRoleKey);

  // Calling invalidateSession without token fails closed with UNSUPPORTED_SESSION_REVOCATION
  calls.length = 0;
  const resNoToken = await adminClient.invalidateSession('sess-r7-01', null);
  assert.ok(resNoToken.error);
  assert.equal(resNoToken.error.status, 400);
  assert.match(resNoToken.error.message, /UNSUPPORTED_SESSION_REVOCATION/);
  assert.equal(calls.length, 0, 'No fetch must be dispatched without token');

  // Calling signOut without token fails closed with MISSING_TOKEN
  const resEmptySignOut = await adminClient.signOut('');
  assert.ok(resEmptySignOut.error);
  assert.match(resEmptySignOut.error.message, /MISSING_TOKEN/);

  // Calling deleteUser without userId fails closed
  const resEmptyDeleteUser = await adminClient.deleteUser('');
  assert.ok(resEmptyDeleteUser.error);
  assert.match(resEmptyDeleteUser.error.message, /MISSING_USER_ID/);

  // Calling deleteUser with valid userId dispatches DELETE /auth/v1/admin/users/:id
  calls.length = 0;
  const resDelUser = await adminClient.deleteUser('u-test-123');
  assert.equal(resDelUser.error, null);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/auth\/v1\/admin\/users\/u-test-123/);
  assert.equal(calls[0].method, 'DELETE');

  // Calling getUserById with 404 response returns clean 404 object without throwing
  const mock404Fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
  const admin404 = createHostedAdminClient({ serviceRoleKey: validTestServiceRoleKey, fetchFn: mock404Fetch });
  const res404 = await admin404.getUserById('u-nonexistent');
  assert.equal(res404.data, null);
  assert.equal(res404.error?.status, 404);

  // 3. Integration with executeCleanup: executeCleanup with actual createHostedAdminClient
  const inv = new TestRunInventory('inv-r7-01');
  const sessToken = createMockJwt();
  inv.registerSession('sess-tracked-01', { accessToken: sessToken });
  inv.registerCreatedUser({ id: 'u-created-01', email: 'created@proof.invalid' });
  inv.registerCreatedUser({ id: 'u-created-02', email: 'created2@proof.invalid' });

  calls.length = 0;
  const cleanupReport = await inv.executeCleanup({ adminClient });
  assert.equal(cleanupReport.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(cleanupReport.sessionsRevoked, 1);
  assert.equal(cleanupReport.usersDeleted, 2);
  assert.equal(cleanupReport.residualResources.length, 0);
  assert.equal(cleanupReport.residualUsers.length, 0);
});

test('75. Task 06I-B1-H1-R7 (R7-02): 300-second JWT lifetime contract enforcement in SESSION-04 and SESSION-05', async () => {
  const session04 = { id: 'SESSION-04', category: 'Session & Consumer' };
  const session05 = { id: 'SESSION-05', category: 'Session & Consumer' };
  const now = Math.floor(Date.now() / 1000);

  // 1. validateProbeOutcome contract tests:
  // Approved 300s token lifetime PASSES
  const pass300 = validateProbeOutcome(session04, {
    passed: true,
    status: 200,
    token_unexpired: true,
    jwt_lifetime_seconds: 300,
    lifetime_bounded: true,
    stateless_linger_documented: true,
    note: 'verified 300s linger'
  });
  assert.equal(pass300.passed, true);

  // Shorter bounded lifetime (e.g. 120s) PASSES
  const pass120 = validateProbeOutcome(session05, {
    passed: true,
    status: 200,
    token_unexpired: true,
    jwt_lifetime_seconds: 120,
    lifetime_bounded: true,
    stateless_linger_documented: true,
    note: 'verified 120s linger'
  });
  assert.equal(pass120.passed, true);

  // Oversized 301s token FAILS with EXCESSIVE_JWT_LIFETIME
  const fail301 = validateProbeOutcome(session04, {
    passed: true,
    status: 200,
    token_unexpired: true,
    jwt_lifetime_seconds: 301,
    lifetime_bounded: false,
    stateless_linger_documented: true,
    note: '301s token'
  });
  assert.equal(fail301.passed, false);
  assert.match(fail301.reason, /EXCESSIVE_JWT_LIFETIME: SESSION-04 token lifetime \(301s\) exceeds approved 300s bound/);

  // Oversized 86400s (24h) token FAILS with EXCESSIVE_JWT_LIFETIME (PRRT_kwDOVtCmZc66r92y reproduction)
  const fail86400 = validateProbeOutcome(session04, {
    passed: true,
    status: 200,
    token_unexpired: true,
    jwt_lifetime_seconds: 86400,
    lifetime_bounded: false,
    stateless_linger_documented: true,
    note: '24h token'
  });
  assert.equal(fail86400.passed, false);
  assert.match(fail86400.reason, /EXCESSIVE_JWT_LIFETIME: SESSION-04 token lifetime \(86400s\) exceeds approved 300s bound/);

  // Missing jwt_lifetime_seconds FAILS with MISSING_EVIDENCE
  const failMissingLifetime = validateProbeOutcome(session04, {
    passed: true,
    status: 200,
    token_unexpired: true,
    lifetime_bounded: true,
    stateless_linger_documented: true,
    note: 'missing lifetime'
  });
  assert.equal(failMissingLifetime.passed, false);
  assert.match(failMissingLifetime.reason, /MISSING_EVIDENCE: SESSION-04 requires valid numeric jwt_lifetime_seconds/);

  // Non-finite jwt_lifetime_seconds (NaN) FAILS
  const failNanLifetime = validateProbeOutcome(session04, {
    passed: true,
    status: 200,
    token_unexpired: true,
    jwt_lifetime_seconds: NaN,
    lifetime_bounded: true,
    stateless_linger_documented: true,
    note: 'nan lifetime'
  });
  assert.equal(failNanLifetime.passed, false);
  assert.match(failNanLifetime.reason, /MISSING_EVIDENCE: SESSION-04 requires valid numeric jwt_lifetime_seconds/);

  // Zero or negative lifetime FAILS with INVALID_JWT_LIFETIME
  const failZeroLifetime = validateProbeOutcome(session04, {
    passed: true,
    status: 200,
    token_unexpired: true,
    jwt_lifetime_seconds: 0,
    lifetime_bounded: true,
    stateless_linger_documented: true,
    note: 'zero lifetime'
  });
  assert.equal(failZeroLifetime.passed, false);
  assert.match(failZeroLifetime.reason, /INVALID_JWT_LIFETIME: SESSION-04 token lifetime must be strictly positive/);

  // lifetime_bounded === false FAILS with MISSING_EVIDENCE
  const failUnbounded = validateProbeOutcome(session04, {
    passed: true,
    status: 200,
    token_unexpired: true,
    jwt_lifetime_seconds: 300,
    lifetime_bounded: false,
    stateless_linger_documented: true,
    note: 'unbounded flag'
  });
  assert.equal(failUnbounded.passed, false);
  assert.match(failUnbounded.reason, /MISSING_EVIDENCE: SESSION-04 requires affirmative lifetime_bounded flag/);

  // Expired token (token_unexpired: false) with 300s lifetime FAILS
  const failExpired = validateProbeOutcome(session04, {
    passed: true,
    status: 200,
    token_unexpired: false,
    jwt_lifetime_seconds: 300,
    lifetime_bounded: true,
    stateless_linger_documented: true,
    note: 'expired token'
  });
  assert.equal(failExpired.passed, false);
  assert.match(failExpired.reason, /MISSING_EVIDENCE: SESSION-04 requires token to be unexpired/);

  // 2. Dispatcher integration tests:
  // Token with valid 300s lifetime passes both dispatcher and validator
  const valid300Token = createMockJwt({ iat: now, exp: now + 300 });
  const runCtxValid = createRunContext();
  runCtxValid.activeAccessToken = valid300Token;
  const dispValid = createHostedDispatcher({
    anonKey: validTestAnonKey,
    runContext: runCtxValid,
    fetchFn: async () => ({ status: 200, json: async () => ([]) })
  });
  const out04Valid = await dispValid(session04);
  assert.equal(out04Valid.passed, true);
  assert.equal(out04Valid.lifetime_bounded, true);
  assert.equal(out04Valid.jwt_lifetime_seconds, 300);
  const val04Valid = validateProbeOutcome(session04, out04Valid);
  assert.equal(val04Valid.passed, true);

  // Token with oversized 86400s (24h) lifetime fails dispatcher and validator
  const oversizedToken = createMockJwt({ iat: now, exp: now + 86400 });
  const runCtxOversized = createRunContext();
  runCtxOversized.activeAccessToken = oversizedToken;
  const dispOversized = createHostedDispatcher({
    anonKey: validTestAnonKey,
    runContext: runCtxOversized,
    fetchFn: async () => ({ status: 200, json: async () => ([]) })
  });
  const out04Oversized = await dispOversized(session04);
  assert.equal(out04Oversized.passed, false);
  assert.equal(out04Oversized.lifetime_bounded, false);
  assert.equal(out04Oversized.jwt_lifetime_seconds, 86400);
  assert.match(out04Oversized.error, /EXCESSIVE_JWT_LIFETIME/);
  const val04Oversized = validateProbeOutcome(session04, out04Oversized);
  assert.equal(val04Oversized.passed, false);

  // Token missing iat fails dispatcher and validator
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payloadNoIat = Buffer.from(JSON.stringify({
    sub: 'u-1',
    session_id: 's-1',
    iss: `https://${HARDCODED_TEMP_REF}.supabase.co/auth/v1`,
    aud: 'authenticated',
    exp: now + 300
  })).toString('base64url');
  const sig = Buffer.from('mock_sig').toString('base64url');
  const tokenNoIat = `${header}.${payloadNoIat}.${sig}`;

  const runCtxNoIat = createRunContext();
  runCtxNoIat.activeAccessToken = tokenNoIat;
  const dispNoIat = createHostedDispatcher({
    anonKey: validTestAnonKey,
    runContext: runCtxNoIat,
    fetchFn: async () => ({ status: 200, json: async () => ([]) })
  });
  const out04NoIat = await dispNoIat(session04);
  assert.equal(out04NoIat.passed, false);
  assert.match(out04NoIat.error, /MISSING_JWT_TIMESTAMPS/);

  // Token with exp <= iat fails dispatcher and validator
  const tokenInconsistent = createMockJwt({ iat: now + 300, exp: now + 100 });
  const runCtxInconsistent = createRunContext();
  runCtxInconsistent.activeAccessToken = tokenInconsistent;
  const dispInconsistent = createHostedDispatcher({
    anonKey: validTestAnonKey,
    runContext: runCtxInconsistent,
    fetchFn: async () => ({ status: 200, json: async () => ([]) })
  });
  const out04Inconsistent = await dispInconsistent(session04);
  assert.equal(out04Inconsistent.passed, false);
  assert.match(out04Inconsistent.error, /INVALID_EXP_TEMPORAL_INCONSISTENCY/);

  // Storage SESSION-05 similarly validates 300s lifetime bound
  const runCtxStorage = createRunContext();
  runCtxStorage.activeAccessToken = valid300Token;
  const dispStorage = createHostedDispatcher({
    anonKey: validTestAnonKey,
    runContext: runCtxStorage,
    fetchFn: async () => ({ status: 200, json: async () => ({}) })
  });
  const out05Valid = await dispStorage(session05);
  assert.equal(out05Valid.passed, true);
  assert.equal(out05Valid.jwt_lifetime_seconds, 300);
  assert.equal(out05Valid.lifetime_bounded, true);
  const val05Valid = validateProbeOutcome(session05, out05Valid);
  assert.equal(val05Valid.passed, true);

  // Storage SESSION-05 with 24h token fails
  runCtxStorage.activeAccessToken = oversizedToken;
  const out05Oversized = await dispStorage(session05);
  assert.equal(out05Oversized.passed, false);
  assert.match(out05Oversized.error, /EXCESSIVE_JWT_LIFETIME/);
});

test('76. Task 06I-B1-H1-R8 (R8-01): Unexpected session tracking captures session identity and cleanup obligations across negative probes', async () => {
  // 1. observeAndTrackSessionTokens helper unit validation
  const emptyObs = observeAndTrackSessionTokens(null);
  assert.equal(emptyObs.hasTokens, false);
  assert.equal(emptyObs.sessionId, null);

  const invUnit = new TestRunInventory('test-run-r8-01-unit');
  const tokenWithSession = createMockJwt({ session_id: 'sess-observed-123', sub: 'u-observed-123' });
  const obsWithToken = observeAndTrackSessionTokens({
    access_token: tokenWithSession,
    refresh_token: 'refresh-abc'
  }, { inv: invUnit, probeId: 'BYPASS-03', testUser: 'seed-user@proof.invalid' });

  assert.equal(obsWithToken.hasTokens, true);
  assert.equal(obsWithToken.sessionId, 'sess-observed-123');
  assert.equal(obsWithToken.userId, 'u-observed-123');
  assert.equal(invUnit.trackedSessions.has('sess-observed-123'), true);
  assert.equal(invUnit.sessionTokens.get('sess-observed-123'), tokenWithSession);
  // Negative probe with seed user registers referencedUser, NOT createdUser (R3-09, R8-01)
  assert.equal(invUnit.referencedUsers.has('u-observed-123'), true);
  assert.equal(invUnit.createdUsers.has('u-observed-123'), false);

  // For BYPASS-02 (signup probe), unexpected user registration is deletion eligible (createdUsers)
  observeAndTrackSessionTokens({
    access_token: tokenWithSession,
    user: { id: 'u-signup-456' }
  }, { inv: invUnit, probeId: 'BYPASS-02', testUser: 'signup-user@proof.invalid' });
  assert.equal(invUnit.createdUsers.has('u-signup-456'), true);

  // Untracked session: token present but session ID unextractable
  const rawTokenWithoutClaims = 'header.e30.signature'; // payload is {}
  const obsUntracked = observeAndTrackSessionTokens({
    access_token: rawTokenWithoutClaims
  }, { inv: invUnit, probeId: 'BYPASS-03', testUser: 'seed-user@proof.invalid' });
  assert.equal(obsUntracked.hasTokens, true);
  assert.equal(obsUntracked.sessionId, null);
  assert.equal(invUnit.untrackedSessionsCount, 1);

  // 2. Dispatcher negative probe (BYPASS-03) unexpectedly receiving tokens:
  // Fails as security invariant violation, records session in inventory, and cleanup revokes it
  const invBypass = new TestRunInventory('test-run-bypass03-unexpected');
  const unexpectedSessionId = 'sess-bypass03-minted';
  const unexpectedToken = createMockJwt({ session_id: unexpectedSessionId, sub: 'u-seed-bypass03' });
  const calls = [];
  const mockFetchBypass = async (url, opts) => {
    calls.push({ url, method: opts.method || 'GET', headers: opts.headers });
    if (url.includes('/auth/v1/verify')) {
      // Unexpectedly returns HTTP 200 with tokens
      return {
        status: 200,
        ok: true,
        json: async () => ({
          access_token: unexpectedToken,
          refresh_token: 'refresh-bypass03',
          session_id: unexpectedSessionId,
          user: { id: 'u-seed-bypass03', email: 'tio-test-user-06i@proof.invalid' }
        })
      };
    }
    if (url.includes('/auth/v1/logout')) {
      return { status: 200, ok: true, json: async () => ({}) };
    }
    return { status: 200, ok: true, json: async () => ({}) };
  };

  const dispBypass = createHostedDispatcher({
    anonKey: validTestAnonKey,
    inventory: invBypass,
    fetchFn: mockFetchBypass
  });

  const bypassOutcome = await dispBypass({ id: 'BYPASS-03', category: 'Auth Bypass & Registration' });
  assert.equal(bypassOutcome.passed, false, 'Probe must fail when tokens are unexpectedly issued');
  assert.ok(bypassOutcome.tokens, 'Observed tokens must be preserved in outcome');
  assert.match(bypassOutcome.error, /SECURITY_INVARIANT_VIOLATION/);

  // Verify session was tracked in inventory despite probe failure!
  assert.equal(invBypass.trackedSessions.has(unexpectedSessionId), true);
  assert.equal(invBypass.sessionTokens.get(unexpectedSessionId), unexpectedToken);
  assert.equal(invBypass.referencedUsers.has('u-seed-bypass03'), true);
  assert.equal(invBypass.createdUsers.size, 0, 'Seed user must NOT be registered as created user');

  // Verify cleanup revokes the unexpectedly minted session via logout
  const adminClientBypass = createHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: mockFetchBypass
  });
  calls.length = 0;
  const bypassCleanup = await invBypass.executeCleanup({ adminClient: adminClientBypass });
  assert.equal(bypassCleanup.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(bypassCleanup.sessionsRevoked, 1);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/auth\/v1\/logout\?scope=local/);
  assert.equal(calls[0].headers.Authorization, `Bearer ${unexpectedToken}`);

  // 3. Normal negative probe rejection (no tokens) does NOT populate sessions
  const invNormal = new TestRunInventory('test-run-normal-rejection');
  const dispNormal = createHostedDispatcher({
    anonKey: validTestAnonKey,
    inventory: invNormal,
    fetchFn: async () => ({
      status: 400,
      ok: false,
      json: async () => ({ error_code: 'otp_expired', msg: 'Token expired' })
    })
  });
  const normalOutcome = await dispNormal({ id: 'BYPASS-03', category: 'Auth Bypass & Registration' });
  assert.equal(normalOutcome.passed, false);
  assert.equal(invNormal.trackedSessions.size, 0);
  assert.equal(invNormal.untrackedSessionsCount, 0);
  assert.equal(invNormal.createdUsers.size, 0);
  assert.equal(invNormal.referencedUsers.size, 0);

  // 4. Untracked minted session fails cleanup closed
  const invUntrackedFail = new TestRunInventory('test-run-untracked-fail');
  invUntrackedFail.registerUntrackedSession();
  const untrackedReport = await invUntrackedFail.executeCleanup({ adminClient: adminClientBypass, failClosed: false });
  assert.equal(untrackedReport.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.ok(untrackedReport.residualResources.some(r => r.type === 'untracked_session' && r.error.includes('UNTRACKED_MINTED_SESSION')));
});

test('77. Task 06I-B1-H1-R8 (R8-02): Idempotent session cleanup and confirmed session absence handling', async () => {
  const calls = [];
  const testToken = createMockJwt({ session_id: 'sess-idemp-1' });

  // 1. createHostedAdminClient.signOut provider responses
  // 1a. HTTP 200 normal logout succeeds
  const client200 = createHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: async () => ({ status: 200, ok: true, json: async () => ({}) })
  });
  const res200 = await client200.signOut(testToken);
  assert.equal(res200.error, null);
  assert.equal(res200.data.scope, 'local');

  // 1b. HTTP 403 session_not_found treated as affirmative absence (succeeds with alreadyRevoked: true)
  const clientNotFound = createHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: async () => ({
      status: 403,
      ok: false,
      json: async () => ({
        code: 403,
        error_code: 'session_not_found',
        msg: 'Session from session_id claim in JWT does not exist'
      })
    })
  });
  const resNotFound = await clientNotFound.signOut(testToken);
  assert.equal(resNotFound.error, null);
  assert.equal(resNotFound.session_not_found, true);
  assert.equal(resNotFound.data.alreadyRevoked, true);

  // 1c. HTTP 400 authsessionmissingerror treated as affirmative absence
  const clientMissing = createHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: async () => ({
      status: 400,
      ok: false,
      json: async () => ({
        code: 400,
        error_code: 'authsessionmissingerror',
        msg: 'Auth session missing!'
      })
    })
  });
  const resMissing = await clientMissing.signOut(testToken);
  assert.equal(resMissing.error, null);
  assert.equal(resMissing.session_not_found, true);

  // 1d. False proof: HTTP 401 bad_jwt fails closed
  const clientBadJwt = createHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: async () => ({
      status: 401,
      ok: false,
      json: async () => ({ code: 401, error_code: 'bad_jwt', msg: 'Invalid JWT' })
    })
  });
  const resBadJwt = await clientBadJwt.signOut(testToken);
  assert.ok(resBadJwt.error);
  assert.equal(resBadJwt.error.status, 401);

  // 1e. False proof: HTTP 401 jwt_expired fails closed
  const clientExpired = createHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: async () => ({
      status: 401,
      ok: false,
      json: async () => ({ code: 401, error_code: 'jwt_expired', msg: 'JWT expired' })
    })
  });
  const resExpired = await clientExpired.signOut(testToken);
  assert.ok(resExpired.error);

  // 1f. Generic HTTP 403 Forbidden fails closed
  const clientGeneric403 = createHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: async () => ({
      status: 403,
      ok: false,
      json: async () => ({ code: 403, msg: 'Forbidden' })
    })
  });
  const resGeneric403 = await clientGeneric403.signOut(testToken);
  assert.ok(resGeneric403.error);

  // 1g. HTTP 500 fails closed
  const client500 = createHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: async () => ({
      status: 500,
      ok: false,
      json: async () => ({ code: 500, msg: 'Internal server error' })
    })
  });
  const res500 = await client500.signOut(testToken);
  assert.ok(res500.error);

  // 2. SESSION-02 marks session revoked in inventory when revocation is proven
  const invSession02 = new TestRunInventory('test-run-session02-marking');
  const s02SessionId = 'sess-s02-verified';
  const s02Token = createMockJwt({ session_id: s02SessionId });
  invSession02.registerSession(s02SessionId, { accessToken: s02Token });

  const runCtxS02 = createRunContext();
  runCtxS02.activeUserId = 'u-s02-test';
  runCtxS02.activeSessionId = s02SessionId;
  runCtxS02.activeAccessToken = s02Token;

  const dispS02 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    serviceRoleKey: validTestServiceRoleKey,
    inventory: invSession02,
    runContext: runCtxS02,
    fetchFn: async (url, opts) => {
      calls.push({ url, method: opts.method || 'GET' });
      if (url.includes('/auth/v1/admin/users/')) {
        return { status: 200, ok: true, json: async () => ({ id: 'u-s02-test' }) };
      }
      if (url.includes('/auth/v1/user')) {
        // Post-reset check affirmatively proves revocation
        return {
          status: 403,
          ok: false,
          json: async () => ({ error_code: 'session_not_found', msg: 'Session not found' })
        };
      }
      return { status: 200, ok: true, json: async () => ({}) };
    }
  });

  const outS02 = await dispS02({ id: 'SESSION-02', category: 'Session & Consumer' });
  assert.equal(outS02.passed, true);
  assert.equal(invSession02.isSessionRevoked(s02SessionId), true, 'SESSION-02 must mark session as revoked in inventory');

  // When cleanup runs on invSession02, it skips calling logout for already-revoked session
  calls.length = 0;
  const adminClientS02 = createHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: async (url, opts) => {
      calls.push({ url, method: opts.method || 'GET' });
      return { status: 200, ok: true, json: async () => ({}) };
    }
  });

  const cleanupS02 = await invSession02.executeCleanup({ adminClient: adminClientS02 });
  assert.equal(cleanupS02.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(cleanupS02.sessionsRevoked, 1);
  // Zero logout fetch calls because session was already marked revoked!
  assert.equal(calls.filter(c => c.url.includes('/logout')).length, 0);

  // 3. Idempotent cleanup execution:
  // First run revokes session; second run on same inventory is cleanly idempotent
  const invIdemp = new TestRunInventory('test-run-idempotency');
  invIdemp.registerSession('sess-run-1', { accessToken: createMockJwt({ session_id: 'sess-run-1' }) });
  invIdemp.registerSession('sess-run-2', { accessToken: createMockJwt({ session_id: 'sess-run-2' }) });

  calls.length = 0;
  const adminClientIdemp = createHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: async (url, opts) => {
      calls.push({ url, method: opts.method || 'GET' });
      return { status: 200, ok: true, json: async () => ({}) };
    }
  });

  // First cleanup call
  const firstCleanup = await invIdemp.executeCleanup({ adminClient: adminClientIdemp });
  assert.equal(firstCleanup.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(firstCleanup.sessionsRevoked, 2);
  const firstLogoutCount = calls.filter(c => c.url.includes('/logout')).length;
  assert.equal(firstLogoutCount, 2, 'First cleanup must call logout for both sessions');

  // Second cleanup call on same inventory
  calls.length = 0;
  const secondCleanup = await invIdemp.executeCleanup({ adminClient: adminClientIdemp });
  assert.equal(secondCleanup.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(secondCleanup.sessionsRevoked, 2);
  assert.equal(secondCleanup.residualResources.length, 0);
  const secondLogoutCount = calls.filter(c => c.url.includes('/logout')).length;
  assert.equal(secondLogoutCount, 0, 'Second cleanup must be idempotent and make ZERO logout calls');
});

test('78. Task 06I-B1-H1-R9 (R9-01): Pre-dispatch restoration registration, state tracking, and indeterminate transport failure handling', async () => {
  const session02 = { id: 'SESSION-02', category: 'Session & Consumer' };
  const origPassword = 'OriginalTioPassword#2026!';
  const newPassword = 'TioNewPassword#2026!';
  const seedUserId = 'seed-user-uuid-r9-01';
  const seedEmail = 'tio-seed-r9-01@proof.invalid';

  // 1. Pre-dispatch registration invariance:
  // Restoration obligation MUST be registered and in 'dispatched' state BEFORE PUT request proceeds
  let preDispatchVerified = false;
  let providerPassword = origPassword;

  const invPre = new TestRunInventory('test-run-pre-dispatch');
  const runCtxPre = createRunContext();
  runCtxPre.activeUserId = seedUserId;
  runCtxPre.originalSeedPassword = origPassword;
  runCtxPre.activeSessionId = 'sess-pre-1';
  runCtxPre.activeAccessToken = createMockJwt({ sub: seedUserId, session_id: 'sess-pre-1' });

  const dispPre = createHostedDispatcher({
    anonKey: validTestAnonKey,
    serviceRoleKey: validTestServiceRoleKey,
    inventory: invPre,
    runContext: runCtxPre,
    testEmail: seedEmail,
    fetchFn: async (url, opts) => {
      if (url.includes('/auth/v1/admin/users/')) {
        // Assert pre-dispatch state inside fetchFn BEFORE any mutation or response!
        assert.equal(invPre.seedCredentialRestorations.length, 1, 'Restoration MUST be registered before dispatch');
        const rec = invPre.seedCredentialRestorations[0];
        assert.equal(rec.userId, seedUserId);
        assert.equal(rec.originalPassword, origPassword);
        assert.equal(rec.targetPassword, newPassword);
        assert.equal(rec.state, 'dispatched', 'Record state MUST be dispatched when network call begins');
        assert.ok(rec.dispatchedAt, 'dispatchedAt timestamp MUST be recorded');
        assert.equal(invPre.isUserTracked(seedUserId), true, 'Seed user MUST be tracked in inventory');
        preDispatchVerified = true;

        const body = JSON.parse(opts.body);
        providerPassword = body.password;
        return { status: 200, json: async () => ({ id: seedUserId }) };
      }
      if (url.includes('/auth/v1/user')) {
        return { status: 401, json: async () => ({ error_code: 'session_not_found', message: 'Session not found' }) };
      }
      return { status: 400, json: async () => ({}) };
    }
  });

  const outPre = await dispPre(session02);
  assert.equal(preDispatchVerified, true, 'Pre-dispatch verification MUST be observed');
  assert.equal(outPre.passed, true);
  assert.equal(invPre.seedCredentialRestorations[0].state, 'confirmed', 'Successful 200 transitions state to confirmed');
  assert.ok(invPre.seedCredentialRestorations[0].confirmedAt);

  // 2. Transport failure (ECONNRESET / socket hangup) retains obligation as indeterminate:
  // If fetch throws AFTER dispatch, probe fails closed, but restoration obligation remains intact!
  const invTransport = new TestRunInventory('test-run-transport-failure');
  const runCtxTransport = createRunContext();
  runCtxTransport.activeUserId = seedUserId;
  runCtxTransport.originalSeedPassword = origPassword;
  runCtxTransport.activeSessionId = 'sess-trans-1';
  runCtxTransport.activeAccessToken = createMockJwt({ sub: seedUserId, session_id: 'sess-trans-1' });

  // Simulate provider having updated password, but transport throwing ECONNRESET on client response
  let transportProviderPassword = origPassword;
  const dispTransport = createHostedDispatcher({
    anonKey: validTestAnonKey,
    serviceRoleKey: validTestServiceRoleKey,
    inventory: invTransport,
    runContext: runCtxTransport,
    testEmail: seedEmail,
    fetchFn: async (url, opts) => {
      if (url.includes('/auth/v1/admin/users/')) {
        // Provider updates password in its database
        const body = JSON.parse(opts.body);
        transportProviderPassword = body.password;
        // Client-side socket drops
        const connErr = new Error('ECONNRESET: socket hang up');
        connErr.code = 'ECONNRESET';
        throw connErr;
      }
      return { status: 400, json: async () => ({}) };
    }
  });

  const outTransport = await dispTransport(session02);
  assert.equal(outTransport.passed, false, 'Probe must fail when transport throws');
  assert.equal(outTransport.status, 0);
  assert.match(outTransport.error, /DISPATCH_EXCEPTION/);
  assert.match(outTransport.error, /ECONNRESET/);
  assert.equal(outTransport.restoration_registered, true);
  assert.equal(outTransport.restoration_state, 'indeterminate');

  // Verify inventory retained the restoration obligation in indeterminate state
  assert.equal(invTransport.seedCredentialRestorations.length, 1);
  const transRec = invTransport.seedCredentialRestorations[0];
  assert.equal(transRec.state, 'indeterminate');
  assert.ok(transRec.indeterminateAt);
  assert.match(transRec.error, /ECONNRESET/);
  assert.equal(transportProviderPassword, newPassword, 'Provider database was mutated before drop');

  // Cleanup MUST execute restoration and restore original password
  const mockAdminClient = {
    deleteUser: async () => ({ data: null, error: null }),
    getUserById: async () => ({ data: null, error: { status: 404 } }),
    invalidateSession: async (id) => ({ data: { id }, error: null }),
    updateUserById: async (uid, attrs) => {
      if (attrs.password) {
        transportProviderPassword = attrs.password;
      }
      return { data: { id: uid }, error: null };
    }
  };

  const cleanupTransport = await invTransport.executeCleanup({ adminClient: mockAdminClient });
  assert.equal(cleanupTransport.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(cleanupTransport.seedCredentialsRestored, 1);
  assert.equal(transportProviderPassword, origPassword, 'Original password MUST be restored in provider after transport drop');

  // 3. Malformed JSON response retains obligation as indeterminate:
  const invJsonErr = new TestRunInventory('test-run-json-error');
  const runCtxJsonErr = createRunContext();
  runCtxJsonErr.activeUserId = seedUserId;
  runCtxJsonErr.originalSeedPassword = origPassword;

  let jsonProviderPassword = origPassword;
  const dispJsonErr = createHostedDispatcher({
    anonKey: validTestAnonKey,
    serviceRoleKey: validTestServiceRoleKey,
    inventory: invJsonErr,
    runContext: runCtxJsonErr,
    testEmail: seedEmail,
    fetchFn: async (url, opts) => {
      if (url.includes('/auth/v1/admin/users/')) {
        const body = JSON.parse(opts.body);
        jsonProviderPassword = body.password;
        return {
          status: 200,
          text: async () => '<html><body>502 Bad Gateway</body></html>',
          json: async () => { throw new SyntaxError('Unexpected token < in JSON at position 0'); }
        };
      }
      return { status: 400, json: async () => ({}) };
    }
  });

  const outJson = await dispJsonErr(session02);
  assert.equal(outJson.passed, false);
  assert.equal(outJson.restoration_state, 'indeterminate');
  assert.equal(invJsonErr.seedCredentialRestorations[0].state, 'indeterminate');

  const cleanupJson = await invJsonErr.executeCleanup({
    adminClient: {
      ...mockAdminClient,
      updateUserById: async (uid, attrs) => {
        if (attrs.password) jsonProviderPassword = attrs.password;
        return { data: { id: uid }, error: null };
      }
    }
  });
  assert.equal(cleanupJson.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(jsonProviderPassword, origPassword, 'Original password MUST be restored after malformed JSON');

  // 4. HTTP 500 response marks obligation as indeterminate:
  const inv500 = new TestRunInventory('test-run-500');
  const runCtx500 = createRunContext();
  runCtx500.activeUserId = seedUserId;
  runCtx500.originalSeedPassword = origPassword;

  let http500ProviderPassword = origPassword;
  const disp500 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    serviceRoleKey: validTestServiceRoleKey,
    inventory: inv500,
    runContext: runCtx500,
    testEmail: seedEmail,
    fetchFn: async (url, opts) => {
      if (url.includes('/auth/v1/admin/users/')) {
        http500ProviderPassword = JSON.parse(opts.body).password;
        return {
          status: 500,
          json: async () => ({ msg: 'Internal server error', error_code: 'internal_error' })
        };
      }
      return { status: 400, json: async () => ({}) };
    }
  });

  const out500 = await disp500(session02);
  assert.equal(out500.passed, false);
  assert.equal(inv500.seedCredentialRestorations[0].state, 'indeterminate');
  assert.equal(inv500.seedCredentialRestorations[0].lastStatus, 500);

  // 5. Earliest initial password is preserved across repeated registrations:
  const invEarliest = new TestRunInventory('test-run-earliest-pass');
  invEarliest.registerSeedPasswordModification({
    userId: 'u-earliest',
    originalPassword: 'InitialSecret#1',
    targetPassword: 'SecondPassword#2',
    state: 'pending'
  });
  invEarliest.registerSeedPasswordModification({
    userId: 'u-earliest',
    originalPassword: 'MutatedPassword#2',
    targetPassword: 'ThirdPassword#3',
    state: 'dispatched'
  });

  assert.equal(invEarliest.seedCredentialRestorations.length, 1, 'Only one restoration record per userId');
  const recEarliest = invEarliest.seedCredentialRestorations[0];
  assert.equal(recEarliest.originalPassword, 'InitialSecret#1', 'Initial/earliest password MUST be preserved');
  assert.equal(recEarliest.targetPassword, 'ThirdPassword#3', 'Latest target password is updated');
  assert.equal(recEarliest.state, 'dispatched');
});

test('79. Task 06I-B1-H1-R9 (R9-02): Controlled authentication verification, adversarial cleanup failures, credential sanitization, and security boundaries', async () => {
  const seedUserId = 'seed-user-uuid-r9-02';
  const seedEmail = 'tio-seed-r9-02@proof.invalid';
  const origPassword = 'OriginalSecret#2026!';

  // 1. Controlled authentication verification in executeCleanup:
  // a) Verification succeeds: cleanup succeeds, record restored and verified, credentials sanitized
  const invSuccess = new TestRunInventory('test-verify-success');
  invSuccess.registerReferencedUser({ id: seedUserId, email: seedEmail });
  invSuccess.registerSeedPasswordModification({
    userId: seedUserId,
    email: seedEmail,
    originalPassword: origPassword,
    targetPassword: 'Mutated#1',
    state: 'confirmed'
  });

  let updateCalled = false;
  let verifyCalled = false;
  let signOutCalled = false;

  const adminClientSuccess = {
    deleteUser: async () => ({ data: null, error: null }),
    getUserById: async () => ({ data: null, error: { status: 404 } }),
    invalidateSession: async (id) => ({ data: { id }, error: null }),
    updateUserById: async (uid, attrs) => {
      assert.equal(uid, seedUserId);
      assert.equal(attrs.password, origPassword);
      updateCalled = true;
      return { data: { id: uid }, error: null };
    },
    verifyUserCredentials: async (email, password) => {
      assert.equal(email, seedEmail);
      assert.equal(password, origPassword);
      verifyCalled = true;
      return { data: { verified: true, userId: seedUserId }, error: null };
    }
  };

  const reportSuccess = await invSuccess.executeCleanup({ adminClient: adminClientSuccess });
  assert.equal(reportSuccess.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(reportSuccess.seedCredentialsRestored, 1);
  assert.equal(updateCalled, true);
  assert.equal(verifyCalled, true);

  const restoredItem = invSuccess.seedCredentialRestorations[0];
  assert.equal(restoredItem.state, 'restored');
  assert.ok(restoredItem.restoredAt);
  assert.ok(restoredItem.verifiedAt);
  // Credentials sanitized after verified cleanup
  assert.equal(restoredItem.originalPassword, '[CLEARED]');
  assert.equal(restoredItem.targetPassword, '[CLEARED]');

  // b) Verification fails: invalid credentials reported, cleanup fails closed
  const invVerifyFail = new TestRunInventory('test-verify-fail');
  invVerifyFail.registerReferencedUser({ id: seedUserId, email: seedEmail });
  invVerifyFail.registerSeedPasswordModification({
    userId: seedUserId,
    email: seedEmail,
    originalPassword: origPassword,
    targetPassword: 'Mutated#2',
    state: 'confirmed'
  });

  const adminClientVerifyFail = {
    ...adminClientSuccess,
    verifyUserCredentials: async () => {
      return { data: null, error: { message: 'invalid_grant: Invalid login credentials', status: 400 } };
    }
  };

  const reportVerifyFail = await invVerifyFail.executeCleanup({ adminClient: adminClientVerifyFail, failClosed: false });
  assert.equal(reportVerifyFail.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.equal(reportVerifyFail.residualResources.length, 1);
  assert.match(reportVerifyFail.residualResources[0].error, /RESTORE_VERIFICATION_FAILED/);
  assert.equal(invVerifyFail.seedCredentialRestorations[0].state, 'restoration_failed');

  // c) Restoration API failure: updateUserById returns error
  const invUpdateFail = new TestRunInventory('test-update-fail');
  invUpdateFail.registerReferencedUser({ id: seedUserId, email: seedEmail });
  invUpdateFail.registerSeedPasswordModification({
    userId: seedUserId,
    email: seedEmail,
    originalPassword: origPassword,
    targetPassword: 'Mutated#3',
    state: 'confirmed'
  });

  const adminClientUpdateFail = {
    ...adminClientSuccess,
    updateUserById: async () => {
      return { data: null, error: { message: 'Database lock timeout' } };
    }
  };

  const reportUpdateFail = await invUpdateFail.executeCleanup({ adminClient: adminClientUpdateFail, failClosed: false });
  assert.equal(reportUpdateFail.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.match(reportUpdateFail.residualResources[0].error, /RESTORE_FAILED/);
  assert.equal(invUpdateFail.seedCredentialRestorations[0].state, 'restoration_failed');

  // 2. createHostedAdminClient.verifyUserCredentials unit behavior:
  const calls = [];
  const testClient = createHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    anonKey: validTestAnonKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: async (url, opts) => {
      calls.push({ url, method: opts.method, body: opts.body ? JSON.parse(opts.body) : null });
      if (url.includes('/auth/v1/token?grant_type=password')) {
        const body = JSON.parse(opts.body);
        if (body.password === origPassword) {
          return {
            status: 200,
            ok: true,
            json: async () => ({
              access_token: createMockJwt({ sub: seedUserId, session_id: 'verify-sess-1' }),
              user: { id: seedUserId }
            })
          };
        }
        return {
          status: 400,
          ok: false,
          json: async () => ({ msg: 'Invalid login credentials', error_code: 'invalid_grant' })
        };
      }
      if (url.includes('/auth/v1/logout')) {
        return { status: 200, ok: true, json: async () => ({}) };
      }
      return { status: 400, ok: false, json: async () => ({}) };
    }
  });

  // Successful verification triggers login AND immediate local signout
  calls.length = 0;
  const verifyRes = await testClient.verifyUserCredentials(seedEmail, origPassword);
  assert.equal(verifyRes.error, null);
  assert.equal(verifyRes.data.verified, true);
  assert.equal(verifyRes.data.userId, seedUserId);
  assert.equal(calls.length, 2, 'Must call /token AND /logout');
  assert.ok(calls[0].url.includes('/token?grant_type=password'));
  assert.ok(calls[1].url.includes('/logout?scope=local'), 'Must immediately revoke verification session');

  // Invalid password returns clean error without throwing
  calls.length = 0;
  const badVerifyRes = await testClient.verifyUserCredentials(seedEmail, 'WrongPassword!');
  assert.equal(badVerifyRes.data, null);
  assert.ok(badVerifyRes.error);
  assert.equal(badVerifyRes.error.status, 400);

  // Parameter validation
  const noEmailRes = await testClient.verifyUserCredentials('', 'pass');
  assert.match(noEmailRes.error.message, /MISSING_EMAIL/);
  const noPassRes = await testClient.verifyUserCredentials(seedEmail, '');
  assert.match(noPassRes.error.message, /MISSING_PASSWORD/);

  // 3. Untracked users cannot be modified by restoration (security boundary):
  const invUntracked = new TestRunInventory('test-untracked-user');
  // Inject restoration obligation for untracked user directly
  invUntracked.seedCredentialRestorations.push({
    userId: 'untracked-victim-id',
    email: 'untracked@proof.invalid',
    originalPassword: 'Secret#1',
    state: 'pending'
  });

  let untrackedUpdateCalled = false;
  const reportUntracked = await invUntracked.executeCleanup({
    adminClient: {
      ...adminClientSuccess,
      updateUserById: async () => {
        untrackedUpdateCalled = true;
        return { data: { id: 'untracked-victim-id' }, error: null };
      }
    },
    failClosed: false
  });

  assert.equal(untrackedUpdateCalled, false, 'Restoration MUST NEVER modify untracked users in database');
  assert.equal(reportUntracked.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.match(reportUntracked.residualResources[0].error, /SECURITY_BOUNDARY_VIOLATION/);

  // 4. Seed user identity is preserved; restoration never deletes user:
  let deleteCalledForSeed = false;
  const invPreserve = new TestRunInventory('test-preserve-seed');
  invPreserve.registerReferencedUser({ id: seedUserId, email: seedEmail });
  invPreserve.registerSeedPasswordModification({
    userId: seedUserId,
    email: seedEmail,
    originalPassword: origPassword,
    state: 'restored' // already restored
  });

  const reportPreserve = await invPreserve.executeCleanup({
    adminClient: {
      ...adminClientSuccess,
      deleteUser: async (uid) => {
        if (uid === seedUserId) deleteCalledForSeed = true;
        return { data: null, error: null };
      }
    }
  });

  assert.equal(deleteCalledForSeed, false, 'Seed user MUST NEVER be deleted by cleanup');
  assert.equal(reportPreserve.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(reportPreserve.referencedUsersPreserved, 1);

  // 5. Credential sanitization (clearCredentials):
  const invSanitize = new TestRunInventory('test-sanitize');
  invSanitize.registerSeedPasswordModification({
    userId: seedUserId,
    email: seedEmail,
    originalPassword: 'PlainPassword123!',
    targetPassword: 'NewPassword123!',
    state: 'restored'
  });
  invSanitize.clearCredentials();
  const summary = invSanitize.getSummary();
  assert.equal(JSON.stringify(summary).includes('PlainPassword123!'), false, 'Summary MUST NOT contain passwords');
  assert.equal(JSON.stringify(summary).includes('NewPassword123!'), false);
  assert.equal(invSanitize.seedCredentialRestorations[0].originalPassword, '[CLEARED]');
  assert.equal(invSanitize.seedCredentialRestorations[0].targetPassword, '[CLEARED]');
});

test('80. Task 06I-B1-H1-R10 (R10-01): Verification session lifecycle, invalidation failure detection, inventory registration, and fail-closed cleanup', async () => {
  const seedEmail = 'tio-r10-01@proof.invalid';
  const seedUserId = 'u-r10-seed-01';
  const initialPassword = 'InitialSeedPassword#2026!';
  const sessId = 'sess-r10-verify-123';
  const verifyToken = createMockJwt({
    sub: seedUserId,
    session_id: sessId,
    email: seedEmail
  });

  // 1. Verification session is registered in inventory immediately upon token issuance
  const invImmediate = new TestRunInventory('test-r10-immediate');
  const adminClientImmediate = createHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    anonKey: validTestAnonKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: async (url, opts) => {
      if (url.includes('/auth/v1/token?grant_type=password')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            access_token: verifyToken,
            session_id: sessId,
            user: { id: seedUserId, email: seedEmail }
          })
        };
      }
      if (url.includes('/auth/v1/logout')) {
        return { status: 200, ok: true, json: async () => ({}) };
      }
      return { status: 200, ok: true, json: async () => ({}) };
    }
  });

  const resImmediate = await adminClientImmediate.verifyUserCredentials(seedEmail, initialPassword, { inventory: invImmediate });
  assert.equal(resImmediate.error, null);
  assert.equal(resImmediate.data.verified, true);
  assert.equal(invImmediate.trackedSessions.has(sessId), true, 'Minted verification session must be registered in inventory');
  assert.equal(invImmediate.isSessionRevoked(sessId), true, 'Successfully signed out session must be marked revoked');

  // 2. Verification login succeeds, but immediate logout returns HTTP 503 error envelope
  const inv503 = new TestRunInventory('test-r10-503');
  const s503Id = 'sess-r10-503-fail';
  const token503 = createMockJwt({ sub: seedUserId, session_id: s503Id, email: seedEmail });

  const adminClient503 = createHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    anonKey: validTestAnonKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: async (url, opts) => {
      if (url.includes('/auth/v1/token?grant_type=password')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            access_token: token503,
            session_id: s503Id,
            user: { id: seedUserId, email: seedEmail }
          })
        };
      }
      if (url.includes('/auth/v1/logout')) {
        return {
          status: 503,
          ok: false,
          json: async () => ({ msg: 'Service Unavailable', error_code: 'service_unavailable' })
        };
      }
      if (url.includes('/auth/v1/admin/users/')) {
        return { status: 200, ok: true, json: async () => ({ id: seedUserId }) };
      }
      return { status: 200, ok: true, json: async () => ({}) };
    }
  });

  // verifyUserCredentials returns sessionRevocationFailed: true
  const res503 = await adminClient503.verifyUserCredentials(seedEmail, initialPassword, { inventory: inv503 });
  assert.equal(res503.data, null);
  assert.equal(res503.sessionRevocationFailed, true);
  assert.equal(res503.error.code, 'LOGOUT_FAILED');
  assert.equal(inv503.trackedSessions.has(s503Id), true);
  assert.equal(inv503.isSessionRevoked(s503Id), false);

  // When executeCleanup runs with persistent 503 logout failure, cleanup fails closed with residual session
  const invCleanup503 = new TestRunInventory('test-r10-cleanup-503');
  invCleanup503.trackReferencedUser({ id: seedUserId, email: seedEmail, source: 'seed' });
  invCleanup503.registerSeedPasswordModification({
    userId: seedUserId,
    email: seedEmail,
    originalPassword: initialPassword,
    targetPassword: 'NewPassword#1',
    state: 'confirmed'
  });

  // Verify that failClosed: true throws CLEANUP_INCOMPLETE on residual session
  const invReject = new TestRunInventory('test-r10-reject');
  invReject.trackReferencedUser({ id: seedUserId, email: seedEmail, source: 'seed' });
  invReject.registerSeedPasswordModification({
    userId: seedUserId,
    email: seedEmail,
    originalPassword: initialPassword,
    targetPassword: 'NewPassword#1',
    state: 'confirmed'
  });
  await assert.rejects(
    () => invReject.executeCleanup({ adminClient: adminClient503, failClosed: true }),
    /CLEANUP_INCOMPLETE/
  );

  const rep503 = await invCleanup503.executeCleanup({ adminClient: adminClient503, failClosed: false });
  assert.equal(rep503.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  const sessionResidual = rep503.residualResources.find(r => r.type === 'session');
  assert.ok(sessionResidual, 'Residual session resource must be reported on logout failure');
  assert.ok(sessionResidual.error.includes('VERIFICATION_SESSION_LEAK'));
  assert.equal(invCleanup503.seedCredentialRestorations[0].state, 'restoration_failed');

  // 3. Fallback retry recovers when initial logout fails but retry succeeds
  const invRetry = new TestRunInventory('test-r10-retry');
  invRetry.trackReferencedUser({ id: seedUserId, email: seedEmail, source: 'seed' });
  invRetry.registerSeedPasswordModification({
    userId: seedUserId,
    email: seedEmail,
    originalPassword: initialPassword,
    targetPassword: 'NewPassword#1',
    state: 'confirmed'
  });

  let logoutAttempt = 0;
  const retrySessId = 'sess-r10-retry-pass';
  const retryToken = createMockJwt({ sub: seedUserId, session_id: retrySessId, email: seedEmail });
  const adminClientRetry = createHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    anonKey: validTestAnonKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: async (url, opts) => {
      if (url.includes('/auth/v1/token?grant_type=password')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            access_token: retryToken,
            session_id: retrySessId,
            user: { id: seedUserId, email: seedEmail }
          })
        };
      }
      if (url.includes('/auth/v1/logout')) {
        logoutAttempt++;
        if (logoutAttempt === 1) {
          // First attempt during verifyUserCredentials fails
          return { status: 503, ok: false, json: async () => ({ msg: 'Temporary drop' }) };
        }
        // Second attempt (fallback retry during executeCleanup) succeeds
        return { status: 200, ok: true, json: async () => ({}) };
      }
      if (url.includes('/auth/v1/admin/users/')) {
        return { status: 200, ok: true, json: async () => ({ id: seedUserId }) };
      }
      return { status: 200, ok: true, json: async () => ({}) };
    }
  });

  const repRetry = await invRetry.executeCleanup({ adminClient: adminClientRetry });
  assert.equal(repRetry.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(invRetry.isSessionRevoked(retrySessId), true);
  assert.equal(invRetry.seedCredentialRestorations[0].state, 'restored');

  // 4. Logout throws network exception (e.g. timeout / connection reset)
  const invThrows = new TestRunInventory('test-r10-throws');
  const throwToken = createMockJwt({ sub: seedUserId, session_id: 'sess-throws', email: seedEmail });
  const adminClientThrows = createHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    anonKey: validTestAnonKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: async (url, opts) => {
      if (url.includes('/auth/v1/token?grant_type=password')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            access_token: throwToken,
            session_id: 'sess-throws',
            user: { id: seedUserId, email: seedEmail }
          })
        };
      }
      if (url.includes('/auth/v1/logout')) {
        throw new Error('ECONNRESET: socket hang up');
      }
      return { status: 200, ok: true, json: async () => ({}) };
    }
  });

  const resThrows = await adminClientThrows.verifyUserCredentials(seedEmail, initialPassword, { inventory: invThrows });
  assert.equal(resThrows.data, null);
  assert.equal(resThrows.sessionRevocationFailed, true);
  assert.equal(resThrows.error.code, 'LOGOUT_EXCEPTION');
  assert.ok(resThrows.error.message.includes('ECONNRESET'));

  // 5. Verification token lacks session ID claim and response lacks session ID
  const invUntracked = new TestRunInventory('test-r10-untracked');
  const headerB64 = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify({ sub: seedUserId, email: seedEmail, exp: Math.floor(Date.now() / 1000) + 300 })).toString('base64url');
  const noSessToken = `${headerB64}.${payloadB64}.fake-sig`;

  const adminClientUntracked = createHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    anonKey: validTestAnonKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: async (url, opts) => {
      if (url.includes('/auth/v1/token?grant_type=password')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            access_token: noSessToken,
            user: { id: seedUserId, email: seedEmail }
          })
        };
      }
      return { status: 200, ok: true, json: async () => ({}) };
    }
  });

  const resUntracked = await adminClientUntracked.verifyUserCredentials(seedEmail, initialPassword, { inventory: invUntracked });
  assert.equal(resUntracked.data, null);
  assert.equal(resUntracked.sessionRevocationFailed, true);
  assert.equal(resUntracked.error.code, 'UNTRACKED_SESSION');
  assert.equal(invUntracked.untrackedSessionsCount, 1);

  // 6. False-proof handling during verification logout:
  // Generic bad_jwt does NOT prove session revocation; affirmative session_not_found DOES prove revocation
  const adminClientBadJwt = createHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    anonKey: validTestAnonKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: async (url, opts) => {
      if (url.includes('/auth/v1/logout')) {
        return {
          status: 401,
          ok: false,
          json: async () => ({ msg: 'bad_jwt: signature verification failed', error_code: 'bad_jwt' })
        };
      }
      return { status: 200, ok: true, json: async () => ({}) };
    }
  });
  const signOutBad = await adminClientBadJwt.signOut('some-token', 'local');
  assert.ok(signOutBad.error, 'bad_jwt must be rejected as false proof of revocation');

  const adminClientNotFound = createHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    anonKey: validTestAnonKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: async (url, opts) => {
      if (url.includes('/auth/v1/logout')) {
        return {
          status: 404,
          ok: false,
          json: async () => ({ msg: 'session not found', error_code: 'session_not_found' })
        };
      }
      return { status: 200, ok: true, json: async () => ({}) };
    }
  });
  const signOutFound = await adminClientNotFound.signOut('some-token', 'local');
  assert.equal(signOutFound.error, null);
  assert.equal(signOutFound.session_not_found, true);

  // 7. Verification session logout failure overrides probe success in LIVE runner
  const invLive = new TestRunInventory('test-r10-live');
  invLive.trackReferencedUser({ id: seedUserId, email: seedEmail, source: 'seed' });
  invLive.registerSeedPasswordModification({
    userId: seedUserId,
    email: seedEmail,
    originalPassword: initialPassword,
    targetPassword: 'NewPassword#1',
    state: 'confirmed'
  });
  let deleteCalledForSeed = false;

  const adminClientLiveFail = {
    deleteUser: async (uid) => {
      if (uid === seedUserId) deleteCalledForSeed = true;
      return { data: { user: { id: uid } }, error: null };
    },
    getUserById: async (uid) => {
      if (uid === seedUserId) return { data: { user: { id: uid } }, error: null };
      return { data: null, error: { status: 404, message: 'User not found' } };
    },
    updateUserById: async (uid, attrs) => ({ data: { user: { id: uid } }, error: null }),
    signOut: async () => ({
      data: null,
      error: { status: 503, message: 'Service Unavailable' }
    }),
    verifyUserCredentials: async () => ({
      data: null,
      error: { message: 'VERIFICATION_SESSION_REVOCATION_FAILED: 503', sessionId: 'sess-live-fail', token: 'token-live-fail' },
      sessionRevocationFailed: true
    })
  };

  const runnerRes = await runHostedProbeRunner({
    projectRef: HARDCODED_TEMP_REF,
    argv: ['node', 'runner.mjs', '--live'],
    env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
    mockDispatcher: async (item) => ({
      passed: true,
      status: 200,
      session_id: 'sess-probe-1',
      session_revoked: true,
      remaining_sessions: 0
    }),
    inventory: invLive,
    adminClient: adminClientLiveFail
  });

  assert.equal(runnerRes.status, 'HALTED_ON_FAILURE', 'Cleanup failure must override probe success');
  assert.equal(runnerRes.aborted, true);
  assert.ok(runnerRes.abortReason.includes('CLEANUP_FAILURE'));
  assert.equal(deleteCalledForSeed, false, 'Seed user MUST NEVER be deleted');
  // Passwords MUST NOT be cleared on failed cleanup so admin can remediate
  assert.notEqual(invLive.seedCredentialRestorations[0]?.originalPassword, '[CLEARED]');
});

test('81. Task 06I-B1-H1-R10 (R10-02): Exact identity binding, seed user correlation, and mismatch rejection', async () => {
  const customSeedEmail = 'custom-seed-user@proof.invalid';
  const seedUserId = 'u-r10-custom-seed';
  const initialPassword = 'CustomSeedPassword#2026!';

  // 1. Custom test user propagation from planProbeExecution through SESSION-02
  const customPlan = planProbeExecution(HARDCODED_TEMP_REF, { testEmail: customSeedEmail });
  const s02Item = customPlan.plannedCases.find(c => c.id === 'SESSION-02');
  assert.equal(s02Item.testUser, customSeedEmail, 'planProbeExecution must set testUser to custom seed email');

  const invCustom = new TestRunInventory('test-r10-custom-inv');
  const runCtxCustom = createRunContext({ testEmail: customSeedEmail, testPassword: initialPassword });
  runCtxCustom.activeUserId = seedUserId;
  runCtxCustom.activeSessionId = 'sess-custom-01';
  runCtxCustom.activeAccessToken = createMockJwt({
    sub: seedUserId,
    session_id: 'sess-custom-01',
    email: customSeedEmail
  });

  let adminPutBody = null;
  const dispCustom = createHostedDispatcher({
    anonKey: validTestAnonKey,
    serviceRoleKey: validTestServiceRoleKey,
    inventory: invCustom,
    runContext: runCtxCustom,
    fetchFn: async (url, opts) => {
      if (url.includes('/auth/v1/admin/users/')) {
        adminPutBody = JSON.parse(opts.body);
        return { status: 200, ok: true, json: async () => ({ id: seedUserId }) };
      }
      if (url.includes('/auth/v1/user')) {
        return { status: 403, ok: false, json: async () => ({ error_code: 'session_not_found', msg: 'Session not found' }) };
      }
      return { status: 200, ok: true, json: async () => ({}) };
    }
  });

  const outCustom = await dispCustom(s02Item);
  assert.equal(outCustom.passed, true);
  assert.equal(invCustom.seedCredentialRestorations.length, 1);
  assert.equal(invCustom.seedCredentialRestorations[0].email, customSeedEmail, 'Restoration must bind to custom seed email, not default');
  assert.equal(runCtxCustom.testEmail, customSeedEmail);
  assert.equal(adminPutBody?.password, 'TioNewPassword#2026!');

  // 2. Mismatched candidate email and tracked user email rejects before password mutation
  const invMismatch = new TestRunInventory('test-r10-mismatch-inv');
  invMismatch.trackReferencedUser({ id: seedUserId, email: 'tracked-original@proof.invalid', source: 'seed' });

  const runCtxMismatch = createRunContext();
  runCtxMismatch.activeUserId = seedUserId;
  runCtxMismatch.activeSessionId = 'sess-mismatch';

  let mutationDispatched = false;
  const dispMismatch = createHostedDispatcher({
    anonKey: validTestAnonKey,
    serviceRoleKey: validTestServiceRoleKey,
    inventory: invMismatch,
    runContext: runCtxMismatch,
    fetchFn: async (url, opts) => {
      if (opts.method === 'PUT') mutationDispatched = true;
      return { status: 200, ok: true, json: async () => ({}) };
    }
  });

  const outMismatch = await dispMismatch({
    id: 'SESSION-02',
    category: 'Session & Consumer',
    testUser: 'conflicting-email@proof.invalid'
  });

  assert.equal(outMismatch.passed, false);
  assert.equal(outMismatch.status, 0);
  assert.ok(outMismatch.error.includes('IDENTITY_MISMATCH'));
  assert.equal(mutationDispatched, false, 'Zero password mutations permitted on email mismatch');
  assert.equal(invMismatch.seedCredentialRestorations.length, 0);

  // 3. Cross-user identity conflict rejection in SESSION-02
  const invConflict = new TestRunInventory('test-r10-conflict-inv');
  invConflict.trackReferencedUser({ id: 'u-other-account', email: customSeedEmail, source: 'seed' });

  const runCtxConflict = createRunContext();
  runCtxConflict.activeUserId = 'u-new-account';
  runCtxConflict.activeSessionId = 'sess-conflict';

  mutationDispatched = false;
  const dispConflict = createHostedDispatcher({
    anonKey: validTestAnonKey,
    serviceRoleKey: validTestServiceRoleKey,
    inventory: invConflict,
    runContext: runCtxConflict,
    fetchFn: async (url, opts) => {
      if (opts.method === 'PUT') mutationDispatched = true;
      return { status: 200, ok: true, json: async () => ({}) };
    }
  });

  const outConflict = await dispConflict({
    id: 'SESSION-02',
    category: 'Session & Consumer',
    testUser: customSeedEmail
  });

  assert.equal(outConflict.passed, false);
  assert.equal(outConflict.status, 0);
  assert.ok(outConflict.error.includes('IDENTITY_MISMATCH'));
  assert.equal(mutationDispatched, false, 'Zero password mutations permitted when email is bound to another user');

  // 4. registerSeedPasswordModification identity correlation and conflict rejection
  const invReg = new TestRunInventory('test-r10-reg');
  invReg.trackReferencedUser({ id: seedUserId, email: customSeedEmail, source: 'seed' });

  // Matching registration succeeds
  invReg.registerSeedPasswordModification({
    userId: seedUserId,
    email: customSeedEmail,
    originalPassword: initialPassword,
    state: 'pending'
  });
  assert.equal(invReg.seedCredentialRestorations.length, 1);

  // Mismatched registration throws IDENTITY_MISMATCH
  assert.throws(
    () => invReg.registerSeedPasswordModification({
      userId: seedUserId,
      email: 'different@proof.invalid',
      originalPassword: initialPassword
    }),
    /IDENTITY_MISMATCH/
  );

  // Binding same unrestored email to different user ID throws IDENTITY_MISMATCH
  assert.throws(
    () => invReg.registerSeedPasswordModification({
      userId: 'u-different-id',
      email: customSeedEmail,
      originalPassword: initialPassword
    }),
    /IDENTITY_MISMATCH/
  );

  // 5. Exact identity correlation check in executeCleanup
  const invCleanupCheck = new TestRunInventory('test-r10-cleanup-check');
  invCleanupCheck.trackReferencedUser({ id: seedUserId, email: customSeedEmail, source: 'seed' });
  // Intentionally tamper with restoration record email to simulate corrupted state
  invCleanupCheck.seedCredentialRestorations.push({
    userId: seedUserId,
    email: 'corrupted-tampered@proof.invalid',
    originalPassword: initialPassword,
    state: 'confirmed'
  });

  let cleanupResetCalled = false;
  const adminClientTamper = {
    getUserById: async () => ({ data: { user: { id: seedUserId } }, error: null }),
    deleteUser: async () => ({ data: null, error: null }),
    signOut: async () => ({ data: null, error: null }),
    updateUserById: async () => ({ data: { user: { id: seedUserId } }, error: null }),
    verifyUserCredentials: async () => {
      cleanupResetCalled = true;
      return { data: { verified: true }, error: null };
    }
  };

  // Verify that failClosed: true throws CLEANUP_INCOMPLETE on identity mismatch
  await assert.rejects(
    () => invCleanupCheck.executeCleanup({ adminClient: adminClientTamper, failClosed: true }),
    /CLEANUP_INCOMPLETE/
  );

  const repTamper = await invCleanupCheck.executeCleanup({ adminClient: adminClientTamper, failClosed: false });
  assert.equal(repTamper.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.equal(cleanupResetCalled, false, 'Credential verification must not proceed on identity mismatch in cleanup');
  assert.equal(invCleanupCheck.seedCredentialRestorations[0].state, 'restoration_failed');
  assert.ok(repTamper.residualResources[0].error.includes('IDENTITY_MISMATCH'));

  // 6. Case-insensitive email comparison and normalization
  const invCase = new TestRunInventory('test-r10-case');
  invCase.trackReferencedUser({ id: seedUserId, email: 'Case.User@PROOF.INVALID', source: 'seed' });
  // Should not throw because normalized comparison matches
  invCase.registerSeedPasswordModification({
    userId: seedUserId,
    email: 'case.user@proof.invalid',
    originalPassword: initialPassword,
    state: 'pending'
  });
  assert.equal(invCase.seedCredentialRestorations[0].email, 'case.user@proof.invalid');

  // 7. Indeterminate password update preserves verified custom identity
  const invIndet = new TestRunInventory('test-r10-indet');
  const runCtxIndet = createRunContext({ testEmail: customSeedEmail, testPassword: initialPassword });
  runCtxIndet.activeUserId = seedUserId;
  runCtxIndet.activeSessionId = 'sess-indet';

  const dispIndet = createHostedDispatcher({
    anonKey: validTestAnonKey,
    serviceRoleKey: validTestServiceRoleKey,
    inventory: invIndet,
    runContext: runCtxIndet,
    fetchFn: async (url, opts) => {
      if (opts.method === 'PUT') throw new Error('ETIMEDOUT: Connection dropped');
      return { status: 200, ok: true, json: async () => ({}) };
    }
  });

  const outIndet = await dispIndet(s02Item);
  assert.equal(outIndet.passed, false);
  assert.equal(outIndet.restoration_registered, true);
  assert.equal(outIndet.restoration_state, 'indeterminate');
  assert.equal(invIndet.seedCredentialRestorations[0].email, customSeedEmail, 'Indeterminate record must retain custom seed identity');

  // 8. Controlled credential verification in cleanup uses exact bound email
  let verifiedEmailUsed = null;
  const adminClientVerified = {
    getUserById: async () => ({ data: { user: { id: seedUserId } }, error: null }),
    deleteUser: async () => ({ data: null, error: null }),
    signOut: async () => ({ data: null, error: null }),
    updateUserById: async () => ({ data: { user: { id: seedUserId } }, error: null }),
    verifyUserCredentials: async (email, pass) => {
      verifiedEmailUsed = email;
      return { data: { verified: true }, error: null };
    }
  };

  const repIndetCleanup = await invIndet.executeCleanup({ adminClient: adminClientVerified });
  assert.equal(repIndetCleanup.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(verifiedEmailUsed, customSeedEmail, 'Cleanup credential verification MUST use the exact custom seed identity, not default');
});
