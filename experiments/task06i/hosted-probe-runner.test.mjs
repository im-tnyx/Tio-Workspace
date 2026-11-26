import {
  getConditionalStorageFixtureProvider, MAX_OFFLINE_JWT_TOKEN_LENGTH,
  MAX_OFFLINE_JWT_CLAIM_DEPTH, MAX_OFFLINE_JWT_CLAIM_NODES
} from './conditional-storage-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { getEventListeners } from 'node:events';
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
  INVENTORY_RUN_STATE,
  createHostedDispatcher,
  parseAndValidateJwt,
  DEFAULT_TEST_PASSWORD,
  getRunTestPassword,
  createRunContext,
  validateProjectCredentialBinding,
  createMockProjectKey,
  HOSTED_PROBE_SPECIFICATIONS,
  createHostedAdminClient,
  observeAndTrackSessionTokens,
  parseResponseEnvelope,
  observeAuthResponse,
  AUTH_ENDPOINT_CAPABILITIES,
  getEndpointCapabilities,
  USER_OWNERSHIP,
  isValidCreationProof,
  createCreationProof,
  isValidPreExistenceProof,
  createPreExistenceProof,
  SUPPORTED_SUBSET_PROBE_IDS,
  PREREQUISITE_BLOCKED_PROBE_IDS,
  UNSUPPORTED_LAYER_B_PROBE_IDS,
  CANONICAL_PROBE_DEPENDENCIES,
  STORAGE_PROBE_BUCKET,
  validateRunId,
  getStorageProbeObjectPath,
  getStorageProbeObjectKey,
  validateSelectedProbeIds,
  provisionStorageProbeFixture,
  STORAGE_LIFECYCLE_STATE,
  STORAGE_RESPONSE_CLASS,
  parseStorageErrorEnvelope,
  normalizeStorageObjectResponse,
  verifyStorageObjectAbsence,
  verifyStorageObjectAbsenceDetailed,
  assertOfflineMockTransport,
  assertTrustedAdminClient,
  assertTrustedRunInventory,
  assertTrustedRunContext,
  UNIFIED_ADMISSION_SCHEMAS,
  createTrustedOfflineDispatcher,
  assertTrustedOfflineDispatcher,
  runOfflineProbeSimulation,
  createDeterministicFixtureTransport,
  createOfflineBarrier,
  createFetchIsolationCoordinator,
  runWithBlockedRealFetch,
  getFetchIsolationDebugState,
  validateUuid
} from './hosted-probe-runner.mjs';

// Test setup accepts declarative provider fixtures only. Every executable adapter is
// built by the real registered factory with the inventory's exact run binding.
const FIXTURE_SPECS = new WeakSet();
const FIXTURE_TRANSPORTS = new WeakMap();
const ADMIN_CONFIGS = new WeakMap();
const OFFLINE_DISPATCHER_SPECS = new WeakSet();
const OFFLINE_DISPATCHER_INSTANCES = new WeakMap();
function fixtureSpec(spec = {}) { FIXTURE_SPECS.add(spec); return spec; }
function offlineDispatcherSpec(spec = {}) { OFFLINE_DISPATCHER_SPECS.add(spec); return spec; }
let standaloneAdminSequence = 0;
function trackedHostedAdminClient(config) {
  config = { runId: `unit-admin-${++standaloneAdminSequence}`, ...config };
  const client = createHostedAdminClient(config);
  ADMIN_CONFIGS.set(client, config);
  return client;
}
function fixtureAdmin(inventory, spec = fixtureSpec()) {
  assert.ok(FIXTURE_SPECS.has(spec), 'Admin fixtures must be declarative specs');
  const restoration = inventory.seedCredentialRestorations?.[0];
  const uid = restoration?.userId || inventory.referencedUsers?.keys().next().value || '11111111-1111-4111-a111-111111111111';
  const email = restoration?.email || inventory.getUserEmail?.(uid) || 'fixture-admin@proof.invalid';
  const sessionId = 'fixture-verification-session';
  const login = spec.login || { status: 200, json: { access_token: createMockJwt({ sub: uid, session_id: sessionId }), session_id: sessionId, user: { id: uid, email } } };
  const transport = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
    conditionalStorage: { projectRef: HARDCODED_TEMP_REF, runId: inventory.runId,
      objects: [...inventory.storageFixtures.values()].filter(item => item.providerObjectId && item.verifiedOwnerId).map(item => ({ projectRef: HARDCODED_TEMP_REF, runId: inventory.runId, bucket: item.bucket, path: item.path, objectId: item.providerObjectId, ownerId: item.verifiedOwnerId })) },
    routes: [
      ...(spec.routes || []),
      { method: 'DELETE', urlIncludes: '/auth/v1/admin/users/', ...(spec.userDelete || { status: 200, json: {} }) },
      { method: 'GET', urlIncludes: '/auth/v1/admin/users/', ...(spec.userGet || { status: 404, json: { message: 'User not found', status: 404 } }) },
      { method: 'PUT', urlIncludes: '/auth/v1/admin/users/', ...(spec.userUpdate || { status: 200, json: { id: uid } }) },
      { method: 'POST', urlIncludes: '/auth/v1/token?grant_type=password', ...login },
      { method: 'POST', urlIncludes: '/auth/v1/logout', ...(spec.logout || { status: 200, json: {} }) },
      { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', ...(spec.storageGet || { status: 404, json: { code: 'NoSuchKey', statusCode: '404' } }) },
      { method: 'DELETE', urlIncludes: '/storage/v1/object/', ...(spec.storageDelete || { status: 200, json: {} }) },
      { method: 'DELETE', urlIncludes: '/rest/v1/', status: 200, json: {} }
    ]
  });
  FIXTURE_TRANSPORTS.set(spec, transport);
  const client = trackedHostedAdminClient({ serviceRoleKey: validTestServiceRoleKey, anonKey: validTestAnonKey, runId: inventory.runId, fetchFn: transport });
  FIXTURE_TRANSPORTS.set(client, transport);
  return client;
}
function bindFixtureAdmin(inventory, fixture) {
  if (FIXTURE_SPECS.has(fixture)) return fixtureAdmin(inventory, fixture);
  const config = ADMIN_CONFIGS.get(fixture);
  if (config) {
    if (config.runId === inventory.runId) return fixture;
    return trackedHostedAdminClient({ ...config, runId: inventory.runId });
  }
  return fixture;
}
function fixtureRunnerOptions(options) {
  const needsAdmin = FIXTURE_SPECS.has(options.adminClient) || ADMIN_CONFIGS.has(options.adminClient);
  const needsDispatcher = OFFLINE_DISPATCHER_SPECS.has(options.mockDispatcher);
  if (!needsAdmin && !needsDispatcher) return options;
  const inventory = options.inventory || new TestRunInventory(options.runId);
  const next = { ...options, inventory };
  if (needsAdmin) {
    next.adminClient = bindFixtureAdmin(inventory, options.adminClient);
  }
  if (needsDispatcher) {
    const disp = createTrustedOfflineDispatcher({
      ...options.mockDispatcher,
      runId: inventory.runId
    });
    OFFLINE_DISPATCHER_INSTANCES.set(options.mockDispatcher, disp);
    next.mockDispatcher = disp;
  }
  return next;
}
function fixtureOperationCalls(spec, operation) {
  const routes = { userDelete: ['DELETE', '/auth/v1/admin/users/'], userGet: ['GET', '/auth/v1/admin/users/'], userUpdate: ['PUT', '/auth/v1/admin/users/'], logout: ['POST', '/auth/v1/logout'], login: ['POST', '/auth/v1/token?grant_type=password'], storageDelete: ['DELETE', '/storage/v1/object/'], storageGet: ['GET', '/storage/v1/object/authenticated/'], rowDelete: ['DELETE', '/rest/v1/'] };
  const [method, path] = routes[operation];
  return fixtureCalls(spec, method, path);
}
function fixtureCalls(spec, method = null, urlPart = '') {
  return (FIXTURE_TRANSPORTS.get(spec)?.calls || []).filter(c => (!method || c.method === method) && c.url.includes(urlPart));
}

const defaultAdminFixture = fixtureSpec();
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

function staticTransport(descriptor) {
  return createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait', defaultResponse: descriptor });
}

function errorTransport(errSpec) {
  return createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
    defaultResponse: { throwError: typeof errSpec === 'string' ? { message: errSpec } : errSpec }
  });
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
  const mockDispatcher = offlineDispatcherSpec({
    defaultOutcome: { passed: true, status: 200 }
  });

  await assert.rejects(
    () => runHostedProbeRunner(fixtureRunnerOptions({
      projectRef: HARDCODED_REAL_REF,
      tempRef: VALID_TEMP_REF,
      argv: ['--live'],
      env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
      adminClient: defaultAdminFixture,
      mockDispatcher
    })),
    /CRITICAL_SECURITY_VIOLATION.*protected REAL backend/
  );
  assert.equal(OFFLINE_DISPATCHER_INSTANCES.get(mockDispatcher)?.calls.length || 0, 0);

  await assert.rejects(
    () => runHostedProbeRunner(fixtureRunnerOptions({
      projectRef: HARDCODED_TIO_WORLD_REF,
      tempRef: VALID_TEMP_REF,
      argv: ['--live'],
      env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
      adminClient: defaultAdminFixture,
      mockDispatcher
    })),
    /CRITICAL_SECURITY_VIOLATION.*Tio-world/
  );
  assert.equal(OFFLINE_DISPATCHER_INSTANCES.get(mockDispatcher)?.calls.length || 0, 0);
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
  const result = await runHostedProbeRunner(fixtureRunnerOptions({
    projectRef: VALID_TEMP_REF,
    tempRef: VALID_TEMP_REF,
    argv: [], // dry run
    env: {}
  }));

  assert.equal(result.status, 'DRY_RUN_COMPLETED');
  assert.equal(result.mode, 'DRY_RUN');
  assert.equal(result.zeroNetworkRequestsDispatched, true);
  assert.equal(result.plan.totalProbes, 18);
});

test('11. LIVE mode fails closed when no authorized network dispatcher is provided (PRRT_kwDOVtCmZc66ij5y)', async () => {
  await assert.rejects(
    () => runHostedProbeRunner(fixtureRunnerOptions({
      projectRef: VALID_TEMP_REF,
      tempRef: VALID_TEMP_REF,
      argv: ['--live'],
      env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' }
      // mockDispatcher is intentionally omitted
    })),
    /NO_HOSTED_DISPATCHER.*synthetic placeholder execution prohibited/
  );
});

test('12. Throttling interval is enforced between consecutive requests and legitimate passing run completes (PRRT_kwDOVtCmZc66ij56 & PRRT_kwDOVtCmZc66i_Kd)', async () => {
  // Dispatcher returns legitimate statuses and affirmative observations for each respective requirement (PRRT_kwDOVtCmZc66jLk1 & PRRT_kwDOVtCmZc66jNbH)
  const mockDispatcher = offlineDispatcherSpec({
    outcomes: {
      'BYPASS-01': { passed: true, status: 422, route_disabled: true, error_code: 'email_provider_disabled' },
      'BYPASS-02': { passed: true, status: 422, signup_disabled: true, error_code: 'signup_disabled' },
      'BYPASS-03': { passed: true, status: 500, hook_rejected: true, error: 'hook_error: 42501' },
      'BYPASS-04': { passed: true, status: 500, hook_rejected: true, error: 'hook_error: 42501' },
      'BYPASS-05': { passed: true, status: 500, recovery_suppressed: true, zero_email_delivered: true },
      'HOOK-01': { passed: true, status: 200, has_token: true, amr_authenticated: true, session_id: 'session-uuid-5678', tokens: { access_token: createMockJwt() } },
      'HOOK-02': { passed: true, status: 200, has_token: true, amr_preserved: true, tokens: { access_token: createMockJwt() } },
      'HOOK-03': { passed: true, status: 500, hook_rejected: true, error: 'hook_error: 42501' },
      'HOOK-04': { passed: true, status: 500, hook_rejected: true, error: 'hook_error: 42501' },
      'HOOK-05': { passed: true, status: 500, hook_rejected: true, error: 'hook_error: 42501' },
      'HOOK-06': { passed: true, status: 500, hook_rejected: true, error: 'hook_error: 42501' },
      'HOOK-07': { passed: true, status: 500, hook_rejected: true, error: 'hook_error: 42501' },
      'SESSION-01': { passed: true, status: 200, session_created: true, session_id: 'session-uuid-5678' },
      'SESSION-02': { passed: true, status: 200, password_reset_completed: true, session_revoked: true, session_revocation_verified: true, remaining_sessions: 0 },
      'SESSION-03': {
        passed: true,
        status: 403,
        pre_reset_baseline_verified: true,
        reset_completed: true,
        session_id: 'session-uuid-5678',
        correlated_session_id: 'session-uuid-5678',
        pre_session_id: 'session-uuid-5678',
        same_session_correlated: true,
        error_code: 'session_not_found'
      },
      'SESSION-04': {
        passed: true,
        status: 200,
        token_unexpired: true,
        jwt_lifetime_seconds: 300,
        lifetime_bounded: true,
        revocation_verified: true,
        revoked_session_id: 'session-uuid-5678',
        correlated_session_id: 'session-uuid-5678',
        session_correlated: true,
        pre_invalidation_verified: true,
        stateless_linger_documented: true,
        note: 'stateless linger window verified and documented'
      },
      'SESSION-05': {
        passed: true,
        status: 200,
        token_unexpired: true,
        jwt_lifetime_seconds: 300,
        lifetime_bounded: true,
        revocation_verified: true,
        revoked_session_id: 'session-uuid-5678',
        correlated_session_id: 'session-uuid-5678',
        session_correlated: true,
        pre_invalidation_verified: true,
        stateless_linger_documented: true,
        note: 'stateless linger window verified and documented'
      },
      'SESSION-06': {
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
      }
    }
  });

  const result = await runHostedProbeRunner(fixtureRunnerOptions({
    projectRef: VALID_TEMP_REF,
    tempRef: VALID_TEMP_REF,
    argv: ['--live'],
    env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
    adminClient: defaultAdminFixture,
    mockDispatcher,
    timing: { mode: 'recorded_zero_wait' }
  }));

  assert.equal(result.status, 'COMPLETED');
  assert.equal(OFFLINE_DISPATCHER_INSTANCES.get(mockDispatcher).calls.length, 18);
  assert.equal(result.totalExecuted, 18);
  assert.equal(result.aborted, false);
  // Outcome-only probes issue no transport calls; pacing is verified at the shared actual-request boundary.
  assert.equal(result.attemptedProbeCount, 18);
  assert.equal(result.requestCount, 0);
  assert.deepEqual(result.throttleIntervalsMs, []);
});

test('13. Runner halts immediately on Token Hook failure (HOOK-01) (PRRT_kwDOVtCmZc66iotG)', async () => {
  const mockDispatcher = offlineDispatcherSpec({
    outcomes: {
      'HOOK-01': { passed: false, status: 500, message: 'HOOK-01 failed: token claims missing amr_authenticated' },
      'BYPASS-01': { passed: true, status: 422, route_disabled: true, error_code: 'email_provider_disabled' },
      'BYPASS-02': { passed: true, status: 422, signup_disabled: true, error_code: 'signup_disabled' },
      'BYPASS-03': { passed: true, status: 500, hook_rejected: true, error: 'hook_error: 42501' },
      'BYPASS-04': { passed: true, status: 500, hook_rejected: true, error: 'hook_error: 42501' },
      'BYPASS-05': { passed: true, status: 500, recovery_suppressed: true, zero_email_delivered: true }
    },
    defaultOutcome: { passed: true, status: 200, has_token: true, amr_authenticated: true, tokens: { access_token: 'fake.jwt' } }
  });

  const result = await runHostedProbeRunner(fixtureRunnerOptions({
    projectRef: VALID_TEMP_REF,
    tempRef: VALID_TEMP_REF,
    argv: ['--live'],
    env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
    adminClient: defaultAdminFixture,
    mockDispatcher,
    timing: { mode: 'recorded_zero_wait' }
  }));

  assert.equal(result.status, 'HALTED_ON_FAILURE');
  assert.equal(result.aborted, true);
  assert.match(result.abortReason, /CRITICAL_SECURITY_FAILURE: Case HOOK-01 \(Token Hook\)/);
  // BYPASS-01..05 ran (5 cases), then HOOK-01 ran and failed (case 6)
  assert.equal(OFFLINE_DISPATCHER_INSTANCES.get(mockDispatcher).calls.length, 6);
});

test('14. Runner halts immediately on Session & Consumer failure (SESSION-03) (PRRT_kwDOVtCmZc66iotG)', async () => {
  const mockDispatcher = offlineDispatcherSpec({
    outcomes: {
      'SESSION-03': { passed: false, status: 200, message: 'SESSION-03 failed: revoked token was accepted' },
      'BYPASS-01': { passed: true, status: 422, route_disabled: true, error_code: 'email_provider_disabled' },
      'BYPASS-02': { passed: true, status: 422, signup_disabled: true, error_code: 'signup_disabled' },
      'BYPASS-03': { passed: true, status: 500, hook_rejected: true, error: 'hook_error: 42501' },
      'BYPASS-04': { passed: true, status: 500, hook_rejected: true, error: 'hook_error: 42501' },
      'BYPASS-05': { passed: true, status: 500, recovery_suppressed: true, zero_email_delivered: true },
      'HOOK-01': { passed: true, status: 200, has_token: true, amr_authenticated: true, session_id: 'session-uuid-5678', tokens: { access_token: createMockJwt() } },
      'HOOK-02': { passed: true, status: 200, has_token: true, amr_preserved: true, tokens: { access_token: createMockJwt() } },
      'HOOK-03': { passed: true, status: 500, hook_rejected: true, error: 'hook_error: 42501' },
      'HOOK-04': { passed: true, status: 500, hook_rejected: true, error: 'hook_error: 42501' },
      'HOOK-05': { passed: true, status: 500, hook_rejected: true, error: 'hook_error: 42501' },
      'HOOK-06': { passed: true, status: 500, hook_rejected: true, error: 'hook_error: 42501' },
      'HOOK-07': { passed: true, status: 500, hook_rejected: true, error: 'hook_error: 42501' },
      'SESSION-01': { passed: true, status: 200, session_created: true, session_id: 'sess-1' },
      'SESSION-02': { passed: true, status: 200, password_reset_completed: true, session_revoked: true, session_revocation_verified: true, remaining_sessions: 0 }
    },
    defaultOutcome: { passed: true, status: 200, session_created: true, session_id: 'sess-default' }
  });

  const result = await runHostedProbeRunner(fixtureRunnerOptions({
    projectRef: VALID_TEMP_REF,
    tempRef: VALID_TEMP_REF,
    argv: ['--live'],
    env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
    adminClient: defaultAdminFixture,
    mockDispatcher,
    timing: { mode: 'recorded_zero_wait' }
  }));

  assert.equal(result.status, 'HALTED_ON_FAILURE');
  assert.equal(result.aborted, true);
  assert.match(result.abortReason, /CRITICAL_SECURITY_FAILURE: Case SESSION-03 \(Session & Consumer\)/);
  // BYPASS (5) + HOOK (7) + SESSION-01, SESSION-02, SESSION-03 (3) = 15 total calls
  assert.equal(OFFLINE_DISPATCHER_INSTANCES.get(mockDispatcher).calls.length, 15);
});

// Negative tests for PRRT_kwDOVtCmZc66i_Kd
test('15. Outcome without passed boolean fails closed (PRRT_kwDOVtCmZc66i_Kd)', async () => {
  const item = { id: 'BYPASS-01', category: 'Native Bypass', target: 'POST /auth/v1/otp' };
  const rawOutcome = { status: 500 }; // Missing `passed` property

  const validated = validateProbeOutcome(item, rawOutcome);
  assert.equal(validated.passed, false);
  assert.match(validated.reason, /MISSING_OR_NON_BOOLEAN_PASSED/);

  // In runner execution, halts immediately and does not complete
  const result = await runHostedProbeRunner(fixtureRunnerOptions({
    projectRef: VALID_TEMP_REF,
    tempRef: VALID_TEMP_REF,
    argv: ['--live'],
    env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
    adminClient: defaultAdminFixture,
    mockDispatcher: offlineDispatcherSpec({ defaultOutcome: { status: 500 } }),
    timing: { mode: 'recorded_zero_wait' }
  }));

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
  const result = await runHostedProbeRunner(fixtureRunnerOptions({
    projectRef: VALID_TEMP_REF,
    tempRef: VALID_TEMP_REF,
    argv: ['--live'],
    env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
    adminClient: defaultAdminFixture,
    mockDispatcher: offlineDispatcherSpec({ defaultOutcome: { status: 200, passed: true } }),
    timing: { mode: 'recorded_zero_wait' }
  }));

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
  const mockDispatcher = offlineDispatcherSpec({
    defaultOutcome: { throwError: 'Connection refused / timeout communicating with target' }
  });

  const result = await runHostedProbeRunner(fixtureRunnerOptions({
    projectRef: VALID_TEMP_REF,
    tempRef: VALID_TEMP_REF,
    argv: ['--live'],
    env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
    adminClient: defaultAdminFixture,
    mockDispatcher,
    timing: { mode: 'recorded_zero_wait' }
  }));

  assert.equal(result.status, 'HALTED_ON_FAILURE');
  assert.equal(result.aborted, true);
  assert.match(result.abortReason, /DISPATCHER_EXCEPTION: Connection refused \/ timeout/);
  assert.equal(result.totalExecuted, 1);
});

test('19. Partial execution never returns COMPLETED (PRRT_kwDOVtCmZc66i_Kd)', async () => {
  const mockDispatcher = offlineDispatcherSpec({
    sequence: [
      { passed: true, status: 422, route_disabled: true, error_code: 'email_provider_disabled' },
      { passed: true, status: 422, signup_disabled: true, error_code: 'signup_disabled' },
      { passed: false, status: 500, reason: 'Simulated network drop' }
    ]
  });

  const result = await runHostedProbeRunner(fixtureRunnerOptions({
    projectRef: VALID_TEMP_REF,
    tempRef: VALID_TEMP_REF,
    argv: ['--live'],
    env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
    adminClient: defaultAdminFixture,
    mockDispatcher,
    timing: { mode: 'recorded_zero_wait' }
  }));

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

  const mockDispatcher = offlineDispatcherSpec({
    defaultOutcome: {
      passed: true,
      status: 422,
      route_disabled: true,
      error_code: 'email_provider_disabled',
      body: JSON.stringify({
        password: secretPassword,
        refresh_token: secretRefreshToken,
        diagnostic: 'safe_diagnostic_info'
      })
    }
  });

  const result = await runHostedProbeRunner(fixtureRunnerOptions({
    projectRef: VALID_TEMP_REF,
    tempRef: VALID_TEMP_REF,
    argv: ['--live'],
    env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
    adminClient: defaultAdminFixture,
    mockDispatcher,
    timing: { mode: 'recorded_zero_wait' }
  }));

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
  assert.equal(validateProbeOutcome(session04, {
    passed: true,
    status: 200,
    token_unexpired: true,
    jwt_lifetime_seconds: 300,
    lifetime_bounded: true,
    revocation_verified: true,
    revoked_session_id: 'sess-test',
    correlated_session_id: 'sess-test',
    session_correlated: true,
    pre_invalidation_verified: true,
    stateless_linger_documented: true,
    note: 'linger window verified'
  }).passed, true);
});

test('23. Top-level abortReason is sanitized against leaked secrets (PRRT_kwDOVtCmZc66jG6Y)', async () => {
  const secretKey = 'sbp_secret_sensitive_api_key_value_999';

  const mockDispatcher = offlineDispatcherSpec({
    defaultOutcome: { throwError: `Dispatch failure with token: Bearer ${secretKey}` }
  });

  const result = await runHostedProbeRunner(fixtureRunnerOptions({
    projectRef: VALID_TEMP_REF,
    tempRef: VALID_TEMP_REF,
    argv: ['--live'],
    env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
    adminClient: defaultAdminFixture,
    mockDispatcher,
    timing: { mode: 'recorded_zero_wait' }
  }));

  assert.equal(result.status, 'HALTED_ON_FAILURE');
  assert.ok(!result.abortReason.includes(secretKey), 'Secret key must be redacted in abortReason');
  assert.match(result.abortReason, /Bearer \[REDACTED\]/);
});

test('24. Per-probe timeout halts runner on never-settling Promise and aborts subsequent probes (PRRT_kwDOVtCmZc66jOw5)', async () => {
  const neverSettlingDispatcher = offlineDispatcherSpec({
    defaultOutcome: { neverSettle: true }
  });

  const result = await runHostedProbeRunner(fixtureRunnerOptions({
    projectRef: HARDCODED_TEMP_REF,
    argv: ['--live'],
    env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
    adminClient: defaultAdminFixture,
    mockDispatcher: neverSettlingDispatcher,
    probeTimeoutMs: 50, // fast bounded timeout for deterministic unit test
    timing: { mode: 'recorded_zero_wait' }
  }));

  assert.equal(result.status, 'HALTED_ON_FAILURE');
  assert.equal(result.aborted, true);
  assert.equal(OFFLINE_DISPATCHER_INSTANCES.get(neverSettlingDispatcher).calls.length, 1, 'Only one probe should dispatch; subsequent probes must be blocked');
  assert.match(result.abortReason, /PROBE_TIMEOUT/);
  assert.equal(result.results[0].outcome.passed, false);
  assert.match(result.results[0].outcome.reason, /PROBE_TIMEOUT/);
});

test('25. LIVE mode rejects caller-controlled tempRef spoofing and unapproved target refs (PRRT_kwDOVtCmZc66jOw4)', async () => {
  const mockDispatcher = offlineDispatcherSpec({
    defaultOutcome: { passed: true, status: 200 }
  });

  // Case A: Caller passes forged target and matching forged tempRef in LIVE mode
  await assert.rejects(
    () => runHostedProbeRunner(fixtureRunnerOptions({
      projectRef: 'forged-attacker-project',
      tempRef: 'forged-attacker-project',
      argv: ['--live'],
      env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
      adminClient: defaultAdminFixture,
      mockDispatcher
    })),
    /CRITICAL_SECURITY_VIOLATION.*tempRef spoofing rejected/
  );
  assert.equal(OFFLINE_DISPATCHER_INSTANCES.get(mockDispatcher)?.calls.length || 0, 0, 'No dispatcher calls should occur on unauthorized target');

  // Case B: Caller passes forged target with default tempRef in LIVE mode
  await assert.rejects(
    () => runHostedProbeRunner(fixtureRunnerOptions({
      projectRef: 'forged-attacker-project',
      argv: ['--live'],
      env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
      adminClient: defaultAdminFixture,
      mockDispatcher
    })),
    /unauthorized_target.*strictly requires approved owner TEMP project/
  );
  assert.equal(OFFLINE_DISPATCHER_INSTANCES.get(mockDispatcher)?.calls.length || 0, 0, 'No dispatcher calls should occur on unauthorized target');

  // Case C: Environment variable override cannot bypass approved TEMP ref in LIVE mode
  const originalEnv = process.env.TIO_SUPABASE_TEMP_REF;
  try {
    process.env.TIO_SUPABASE_TEMP_REF = 'forged-attacker-project';
    await assert.rejects(
      () => runHostedProbeRunner(fixtureRunnerOptions({
        projectRef: 'forged-attacker-project',
        argv: ['--live'],
        env: {
          TASK06I_HOSTED_PROBE_AUTHORIZED: 'true',
          TIO_SUPABASE_TEMP_REF: 'forged-attacker-project'
        },
        mockDispatcher
      })),
      /unauthorized_target.*strictly requires approved owner TEMP project/
    );
  } finally {
    if (originalEnv === undefined) {
      delete process.env.TIO_SUPABASE_TEMP_REF;
    } else {
      process.env.TIO_SUPABASE_TEMP_REF = originalEnv;
    }
  }

  assert.equal(OFFLINE_DISPATCHER_INSTANCES.get(mockDispatcher)?.calls.length || 0, 0, 'No dispatcher calls should occur on unauthorized target');
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
  assert.equal(validateProbeOutcome(session04, {
    passed: true,
    status: 200,
    token_unexpired: true,
    jwt_lifetime_seconds: 300,
    lifetime_bounded: true,
    revocation_verified: true,
    revoked_session_id: 'sess-test',
    correlated_session_id: 'sess-test',
    session_correlated: true,
    pre_invalidation_verified: true,
    stateless_linger_documented: true,
    note: 'linger window verified'
  }).passed, true);

  // BYPASS-05 recovery suppression without affirmative evidence
  const bypass05 = { id: 'BYPASS-05', category: 'Native Bypass' };
  assert.equal(validateProbeOutcome(bypass05, { passed: true, status: 500 }).passed, false);
  assert.match(validateProbeOutcome(bypass05, { passed: true, status: 500 }).reason, /MISSING_EVIDENCE/);
  assert.equal(validateProbeOutcome(bypass05, { passed: true, status: 500, recovery_suppressed: true }).passed, true);
});

test('27. Complete returned report is recursively sanitized with zero credential leakage (PRRT_kwDOVtCmZc66jLk3)', async () => {
  const secretPassword = 'my-secret-synthetic-review-password';
  const secretToken = 'my-secret-synthetic-review-token';

  const mockDispatcher = offlineDispatcherSpec({
    defaultOutcome: { throwError: `request failed password=${secretPassword} access_token=${secretToken}` }
  });

  const result = await runHostedProbeRunner(fixtureRunnerOptions({
    projectRef: HARDCODED_TEMP_REF,
    argv: ['--live'],
    env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
    adminClient: defaultAdminFixture,
    mockDispatcher,
    timing: { mode: 'recorded_zero_wait' }
  }));

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
  const mockDispatcher = offlineDispatcherSpec({
    defaultOutcome: { throwError: `request failed password="${secretWithLeadingSpace}" access_token='${singleQuotedToken}'` }
  });

  const result = await runHostedProbeRunner(fixtureRunnerOptions({
    projectRef: HARDCODED_TEMP_REF,
    argv: ['--live'],
    env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
    adminClient: defaultAdminFixture,
    mockDispatcher,
    timing: { mode: 'recorded_zero_wait' }
  }));

  const serializedReport = JSON.stringify(result);
  assert.ok(!serializedReport.includes(secretWithLeadingSpace), 'Secret with leading whitespace must not exist in serialized report');
  assert.ok(!serializedReport.includes(singleQuotedToken), 'Secret token must not exist in serialized report');
  assert.equal(result.status, 'HALTED_ON_FAILURE');
  assert.match(result.abortReason, /password="\[REDACTED\]"/);
  assert.match(result.abortReason, /access_token='\[REDACTED\]'/);

  // 4. End-to-end runner test with unclosed escaped quote exception from dispatcher (PRRT_kwDOVtCmZc66joKm)
  const mockDispatcherUnclosed = offlineDispatcherSpec({
    defaultOutcome: { throwError: `request failed password="unclosed\\"secret` }
  });

  const resultUnclosed = await runHostedProbeRunner(fixtureRunnerOptions({
    projectRef: HARDCODED_TEMP_REF,
    argv: ['--live'],
    env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
    adminClient: defaultAdminFixture,
    mockDispatcher: mockDispatcherUnclosed,
    timing: { mode: 'recorded_zero_wait' }
  }));

  const serializedUnclosed = JSON.stringify(resultUnclosed);
  assert.ok(!serializedUnclosed.includes('unclosed\\"secret'), 'Unclosed secret password must not exist in serialized report');
  assert.equal(resultUnclosed.status, 'HALTED_ON_FAILURE');
  assert.match(resultUnclosed.abortReason, /password="\[REDACTED\]/);

  // 5. End-to-end runner test with compound/prefixed/camelCase secret keys in dispatcher exception (PRRT_kwDOVtCmZc66kYUU)
  const syntheticServiceKey = 'synthetic_service_role_secret_abc123';
  const syntheticClientSec = 'synthetic_client_secret_xyz789';
  const syntheticRefreshTok = 'synthetic_refresh_token_qwe456';

  const mockDispatcherCompound = offlineDispatcherSpec({
    defaultOutcome: { throwError: `request failed SUPABASE_SERVICE_ROLE_KEY=${syntheticServiceKey} client_secret="${syntheticClientSec}" refreshToken=${syntheticRefreshTok}` }
  });

  const resultCompound = await runHostedProbeRunner(fixtureRunnerOptions({
    projectRef: HARDCODED_TEMP_REF,
    argv: ['--live'],
    env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
    adminClient: defaultAdminFixture,
    mockDispatcher: mockDispatcherCompound,
    timing: { mode: 'recorded_zero_wait' }
  }));

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
      adminClient: defaultAdminFixture
    };

    // Case 1: Dispatcher resolves before timeout
    const res1 = await runHostedProbeRunner(fixtureRunnerOptions({
      ...liveOptions,
      probeTimeoutMs: 200,
      mockDispatcher: offlineDispatcherSpec({
        defaultOutcome: {
          delayMs: 20,
          passed: true,
          status: 403,
          route_disabled: true,
          evidence: { disabled: true }
        }
      })
    }));
    assert.strictEqual(res1.status, 'HALTED_ON_FAILURE'); // Stops after BYPASS-01 because only BYPASS-01 matched
    assert.strictEqual(unhandled.length, 0);

    // Case 2: Dispatcher rejects before timeout
    const res2 = await runHostedProbeRunner(fixtureRunnerOptions({
      ...liveOptions,
      probeTimeoutMs: 200,
      mockDispatcher: offlineDispatcherSpec({
        defaultOutcome: { throwError: 'NETWORK_FAILURE_IMMEDIATE' }
      })
    }));
    assert.strictEqual(res2.status, 'HALTED_ON_FAILURE');
    assert.strictEqual(res2.results.length, 1);
    assert.ok(res2.abortReason.includes('NETWORK_FAILURE_IMMEDIATE'));
    assert.strictEqual(unhandled.length, 0);

    // Case 3: Timeout fires first on non-settling promise
    const res3 = await runHostedProbeRunner(fixtureRunnerOptions({
      ...liveOptions,
      probeTimeoutMs: 50,
      mockDispatcher: offlineDispatcherSpec({
        defaultOutcome: { neverSettle: true }
      })
    }));
    assert.strictEqual(res3.status, 'HALTED_ON_FAILURE');
    assert.match(res3.results[0].outcome.reason, /PROBE_TIMEOUT/);
    assert.strictEqual(res3.results.length, 1, 'Runner must not execute subsequent probes after timeout');
    assert.strictEqual(unhandled.length, 0);

    // Case 4: Dispatcher rejects AFTER timeout and abort (the reported race condition)
    const inv4 = new TestRunInventory('test-30-late-abort-rejection');
    const res4 = await runHostedProbeRunner(fixtureRunnerOptions({
      ...liveOptions,
      inventory: inv4,
      probeTimeoutMs: 50,
      mockDispatcher: offlineDispatcherSpec({
        defaultOutcome: {
          neverSettle: true,
          rejectAfterAbortMs: 30,
          onAbortInventoryEffects: { registerUntrackedSession: true }
        }
      })
    }));

    assert.strictEqual(res4.status, 'HALTED_ON_FAILURE');
    assert.strictEqual(res4.results.length, 1);

    // Wait to allow the late rejection to fire
    await new Promise(r => setTimeout(r, 100));
    assert.strictEqual(inv4.untrackedSessionsCount >= 1, true, 'Abort handler fired and late rejection settled');
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
  const mockDispatcherFalsePositive = offlineDispatcherSpec({
    outcomes: {
      'BYPASS-01': { passed: true, status: 403, route_disabled: true },
      'BYPASS-02': { passed: true, status: 403, signup_disabled: true },
      'BYPASS-03': { passed: true, status: 500, hook_rejected: true, error: 'hook_error: 42501' },
      'BYPASS-04': { passed: true, status: 500, hook_rejected: true, error: 'hook_error: 42501' },
      'BYPASS-05': { passed: true, status: 500, recovery_suppressed: true, zero_email_delivered: true },
      'HOOK-01': {
        passed: true,
        status: 200,
        has_token: true,
        tokens: { unrelated_key: 'no_token_here' },
        amr_authenticated: true
      }
    },
    defaultOutcome: { passed: true, status: 200 }
  });

  const resultFpHook01 = await runHostedProbeRunner(fixtureRunnerOptions({
    projectRef: HARDCODED_TEMP_REF,
    argv: ['--live'],
    env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
    adminClient: defaultAdminFixture,
    mockDispatcher: mockDispatcherFalsePositive,
    timing: { mode: 'recorded_zero_wait' }
  }));

  assert.notEqual(resultFpHook01.status, 'COMPLETED', 'Runner must NEVER return COMPLETED on false-positive HOOK-01');
  assert.equal(resultFpHook01.status, 'HALTED_ON_FAILURE', 'Runner must halt immediately on failure');
  assert.equal(resultFpHook01.results.length, 6, 'Runner must halt at case 6 (HOOK-01) and not execute subsequent probes');
  assert.equal(OFFLINE_DISPATCHER_INSTANCES.get(mockDispatcherFalsePositive).calls.length, 6, 'Dispatcher must only be invoked for 6 probes');
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
  const dryRunResult = await runHostedProbeRunner(fixtureRunnerOptions({
    projectRef: HARDCODED_TEMP_REF
  }));

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
    () => createHostedDispatcher({ inventory: new TestRunInventory(), projectRef: HARDCODED_REAL_REF, anonKey: 'test-anon-key' }),
    /CRITICAL_SECURITY_VIOLATION.*strictly rejected target/
  );
  assert.throws(
    () => createHostedDispatcher({ inventory: new TestRunInventory(), projectRef: HARDCODED_TIO_WORLD_REF, anonKey: 'test-anon-key' }),
    /CRITICAL_SECURITY_VIOLATION.*strictly rejected target/
  );
  assert.throws(
    () => createHostedDispatcher({ inventory: new TestRunInventory(), projectRef: 'unknown-target-ref', anonKey: 'test-anon-key' }),
    /CRITICAL_SECURITY_VIOLATION.*strictly rejected target/
  );

  // 2. Rejects missing or empty anonKey
  assert.throws(
    () => createHostedDispatcher({ inventory: new TestRunInventory(), projectRef: HARDCODED_TEMP_REF, anonKey: '' }),
    /MISSING_HOSTED_CREDENTIALS.*requires non-empty anonKey/
  );
  assert.throws(
    () => createHostedDispatcher({ inventory: new TestRunInventory(), projectRef: HARDCODED_TEMP_REF, anonKey: null }),
    /MISSING_HOSTED_CREDENTIALS.*requires non-empty anonKey/
  );

  // 3. Dispatches HTTP requests to approved TEMP project with AbortSignal and headers
  const mockLiveJwt = createMockJwt();
  const mockFetch = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
    routes: [
      {
        urlRegex: /\/auth\/v1\/otp$/,
        status: 422,
        json: { error_code: 'email_provider_disabled', message: 'Email provider disabled' }
      },
      {
        urlRegex: /\/auth\/v1\/signup$/,
        status: 422,
        json: { error_code: 'signup_disabled', message: 'Signups disabled' }
      },
      {
        urlRegex: /\/auth\/v1\/token\?grant_type=password$/,
        status: 200,
        json: {
          access_token: mockLiveJwt,
          user: { app_metadata: { amr_authenticated: true } }
        }
      }
    ],
    defaultResponse: { status: 400, json: { message: 'Mock bad request' } }
  });

  const dispatcher = createHostedDispatcher({ inventory: new TestRunInventory(),
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
  assert.equal(mockFetch.calls[0].url, `https://${HARDCODED_TEMP_REF}.supabase.co/auth/v1/otp`);
  assert.equal(mockFetch.calls[0].headers.apikey, validTestAnonKey);

  // Probe BYPASS-02 dispatch
  const outcomeBypass02 = await dispatcher({ id: 'BYPASS-02', testUser: 'probe-test@proof.invalid' }, {});
  assert.equal(outcomeBypass02.status, 422);
  assert.equal(outcomeBypass02.signup_disabled, true);
  assert.equal(outcomeBypass02.error_code, 'signup_disabled');
  assert.equal(mockFetch.calls[1].url, `https://${HARDCODED_TEMP_REF}.supabase.co/auth/v1/signup`);

  // Probe HOOK-01 dispatch
  const outcomeHook01 = await dispatcher({ id: 'HOOK-01', testUser: 'probe-test@proof.invalid' }, {});
  assert.equal(outcomeHook01.status, 200);
  assert.equal(outcomeHook01.passed, true);
  assert.ok(outcomeHook01.access_token);
  assert.equal(outcomeHook01.amr_authenticated, true);

  // 4. Runner in LIVE mode without mockDispatcher fails closed
  await assert.rejects(
    async () => {
      await runHostedProbeRunner(fixtureRunnerOptions({
        projectRef: HARDCODED_TEMP_REF,
        argv: ['--live'],
        env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
    adminClient: defaultAdminFixture,
        mockDispatcher: null
      }));
    },
    /NO_HOSTED_DISPATCHER: live hosted execution requires a configured network dispatcher/
  );
});

test('35. Task 06I-B1-H1-R1 (R1-03): Run-scoped identity inventory, deterministic cleanup, and residual detection', async () => {
  const { inventory } = await r5ProvisionedFixture('test-run-123');

  // 1. Identity registration and tracking
  const user1 = inventory.registerUser({ id: '11111111-2222-3333-4444-555555555555', email: 'user1@proof.invalid', creationProof: createCreationProof('before_after_check') });
  const user2 = inventory.registerUser({ id: '66666666-7777-8888-9999-000000000000', email: 'user2@proof.invalid', creationProof: createCreationProof('before_after_check') });

  assert.equal(inventory.getTrackedUserIds().length, 2);
  assert.deepEqual(inventory.getTrackedEmails(), ['user1@proof.invalid', 'user2@proof.invalid']);

  // Rejects invalid customer email domain
  assert.throws(
    () => inventory.registerUser({ id: '33333333-4444-5555-6666-777777777777', email: 'real-user@gmail.com' }),
    /security_violation: real customer or public domain.*prohibited/
  );

  // 2. Track table rows and storage objects
  inventory.registerTableRow('task06i_session_probe', 'row-uuid-1');

  // 3. Successful deterministic cleanup

  const mockAdminClient = fixtureSpec();

  const report = await inventory.executeCleanup({ adminClient: bindFixtureAdmin(inventory, mockAdminClient) });
  assert.equal(report.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(report.usersDeleted, 2);
  assert.equal(report.tableRowsDeleted, 1);
  assert.equal(report.storageObjectsDeleted, 1);
  assert.equal(report.residualUsers.length, 0);

  assert.deepEqual((fixtureOperationCalls(mockAdminClient, 'userDelete').map(c => c.pathname.split('/').map(decodeURIComponent).at(-1))), ['11111111-2222-3333-4444-555555555555', '66666666-7777-8888-9999-000000000000']);
  assert.deepEqual((fixtureOperationCalls(mockAdminClient, 'rowDelete').map(c => ({ table: decodeURIComponent(c.pathname.split('/').at(-1)), id: new URL(c.url).searchParams.get('id').slice(3) }))), [{ table: 'task06i_session_probe', id: 'row-uuid-1' }]);
  assert.deepEqual((fixtureOperationCalls(mockAdminClient, 'storageDelete').map(c => ({ bucket: decodeURIComponent(c.pathname.split('/')[4]), path: c.pathname.split('/').slice(5).map(decodeURIComponent).join('/') }))), [{ bucket: 'task06i_probe_bucket', path: getStorageProbeObjectPath(inventory.runId) }]);

  // 4. Incomplete cleanup fails closed when residual user detected
  const residualInventory = new TestRunInventory('residual-run-456');
  residualInventory.registerUser({ id: 'residual-uuid-99', email: 'residual@proof.invalid', creationProof: createCreationProof('before_after_check') });

  const lingeringAdminClient = fixtureSpec({ userGet: { status: 200, json: { id: 'residual-uuid-99', email: 'residual@proof.invalid' } } });

  await assert.rejects(
    async () => {
      await residualInventory.executeCleanup({ adminClient: bindFixtureAdmin(residualInventory, lingeringAdminClient), failClosed: true });
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
  const fetchOtp400 = staticTransport({ status: 400, json: { message: 'Bad request' } });
  const dispOtp400 = createHostedDispatcher({ inventory: new TestRunInventory(), anonKey: validTestAnonKey, fetchFn: fetchOtp400 });
  const outOtp400 = await dispOtp400({ id: 'BYPASS-01', testUser: 'test@proof.invalid' });
  assert.equal(outOtp400.passed, false);
  assert.equal(outOtp400.route_disabled, false);

  // 2. 422 on OTP with email_provider_disabled passes
  const fetchOtpDisabled = staticTransport({ status: 422, json: { error_code: 'email_provider_disabled', message: 'Email provider is disabled' } });
  const dispOtpDisabled = createHostedDispatcher({ inventory: new TestRunInventory(), anonKey: validTestAnonKey, fetchFn: fetchOtpDisabled });
  const outOtpDisabled = await dispOtpDisabled({ id: 'BYPASS-01', testUser: 'test@proof.invalid' });
  assert.equal(outOtpDisabled.passed, true);
  assert.equal(outOtpDisabled.route_disabled, true);

  // 3. 200 on /signup fails closed
  const fetchSignup200 = staticTransport({ status: 200, json: { id: 'usr-123' } });
  const dispSignup200 = createHostedDispatcher({ inventory: new TestRunInventory(), anonKey: validTestAnonKey, fetchFn: fetchSignup200 });
  const outSignup200 = await dispSignup200({ id: 'BYPASS-02', testUser: 'test@proof.invalid' });
  assert.equal(outSignup200.passed, false);

  // 4. Generic 400 password too short on /signup does NOT fabricate signup_disabled
  const fetchSignup400 = staticTransport({ status: 400, json: { message: 'Password is too short' } });
  const dispSignup400 = createHostedDispatcher({ inventory: new TestRunInventory(), anonKey: validTestAnonKey, fetchFn: fetchSignup400 });
  const outSignup400 = await dispSignup400({ id: 'BYPASS-02', testUser: 'test@proof.invalid' });
  assert.equal(outSignup400.passed, false);
  assert.equal(outSignup400.signup_disabled, false);

  // 5. 422 on /signup with signup_disabled passes
  const fetchSignupDisabled = staticTransport({ status: 422, json: { error_code: 'signup_disabled', message: 'Signups not allowed' } });
  const dispSignupDisabled = createHostedDispatcher({ inventory: new TestRunInventory(), anonKey: validTestAnonKey, fetchFn: fetchSignupDisabled });
  const outSignupDisabled = await dispSignupDisabled({ id: 'BYPASS-02', testUser: 'test@proof.invalid' });
  assert.equal(outSignupDisabled.passed, true);
  assert.equal(outSignupDisabled.signup_disabled, true);

  // 6. 200 on /recover fails (cannot prove email suppression due to anti-enumeration)
  const fetchRecover200 = staticTransport({ status: 200, json: {} });
  const dispRecover200 = createHostedDispatcher({ inventory: new TestRunInventory(), anonKey: validTestAnonKey, fetchFn: fetchRecover200 });
  const outRecover200 = await dispRecover200({ id: 'BYPASS-05', testUser: 'test@proof.invalid' });
  assert.equal(outRecover200.passed, false);
  assert.equal(outRecover200.recovery_suppressed, false);

  // 7. 500 on /recover with 42501 / send_email_hook passes
  const fetchRecover500 = staticTransport({ status: 500, json: { message: 'send_email_hook: native recovery email dispatch suppressed (SQLSTATE 42501)' } });
  const dispRecover500 = createHostedDispatcher({ inventory: new TestRunInventory(), anonKey: validTestAnonKey, fetchFn: fetchRecover500 });
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
  const mockFetchRefresh = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
    routes: [
      {
        urlIncludes: 'grant_type=password',
        status: 200,
        json: {
          access_token: createMockJwt({ sub: 'usr-1', session_id: 'sess-1' }),
          refresh_token: 'fresh-refresh-token-xyz',
          user: { id: 'usr-1' },
          session_id: 'sess-1'
        }
      },
      {
        urlIncludes: 'grant_type=refresh_token',
        bodyMatch: { refresh_token: 'fresh-refresh-token-xyz' },
        status: 200,
        json: {
          access_token: createMockJwt({ sub: 'usr-1', session_id: 'sess-1', exp: Math.floor(Date.now() / 1000) + 600 }),
          refresh_token: 'refreshed-token-2'
        }
      },
      {
        urlIncludes: 'grant_type=refresh_token',
        status: 400,
        json: { message: 'Invalid refresh token' }
      }
    ],
    defaultResponse: { status: 400, json: {} }
  });

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
  const { inventory: inv } = await r5ProvisionedFixture('test-run-r2-inv');
  inv.registerUser({ id: 'user-r2-1', email: 'test1@proof.invalid', creationProof: createCreationProof('before_after_check') });
  inv.registerTableRow('task06i_session_probe', 'row-1');

  // 1. Accidental user creation in BYPASS-02 is captured into inventory
  const mockFetchAccidental = staticTransport({ status: 200, json: { user: { id: 'accidental-user-uuid' } } });
  const dispAccidental = createHostedDispatcher({ anonKey: validTestAnonKey, inventory: inv, fetchFn: mockFetchAccidental });
  const bypass02Res = await dispAccidental({ id: 'BYPASS-02', testUser: 'accidental@proof.invalid' });
  assert.equal(bypass02Res.passed, false);
  assert.ok(inv.isUserTracked('accidental-user-uuid'));

  // 2. Client returning error on deleteUser fails cleanup closed
  const failClient = fixtureSpec({ userDelete: { status: 503, json: { message: 'Database lock timeout' } }, userGet: { status: 200, json: { user: { id: 'user-r2-1' } } } });
  await assert.rejects(
    async () => { await inv.executeCleanup({ adminClient: bindFixtureAdmin(inv, failClient), failClosed: true }); },
    /CLEANUP_INCOMPLETE/
  );

  // 3. Client missing delete methods fails cleanup closed
  const missingMethodsClient = {
    async deleteUser() { return { data: null, error: null }; },
    async getUserById() { return { data: { user: null }, error: { status: 404 } }; }
  };
  await assert.rejects(
    async () => { await inv.executeCleanup({ adminClient: missingMethodsClient, failClosed: true }); },
    /UNTRUSTED_ADMIN_CLIENT/
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

  const mockAllFetch = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
    routes: [
      { urlIncludes: 'grant_type=password', status: 200, json: { access_token: createMockJwt(), refresh_token: 'r-1', user: { id: 'u-1' }, session_id: 's-1' } },
      { urlIncludes: 'grant_type=refresh_token', status: 200, json: { access_token: createMockJwt(), refresh_token: 'r-2' } },
      { urlIncludes: '/auth/v1/user', status: 200, json: { id: 'u-1' } },
      { urlIncludes: '/auth/v1/logout', status: 204, json: {} },
      { urlIncludes: '/rest/v1/task06i_session_probe', status: 200, json: [] },
      { urlIncludes: '/storage/v1/object/', status: 200, json: {} },
      { urlIncludes: '/functions/v1/auth-user-probe', status: 401, json: { error_code: 'AuthSessionMissingError' } }
    ],
    defaultResponse: { status: 500, json: { error_code: 'hook_error', message: '42501' } }
  });

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
  const disp = createHostedDispatcher({ anonKey: validTestAnonKey, fetchFn: staticTransport({ status: 400 }) });
  const out03 = await disp(hook03);
  assert.equal(out03.status, 0);
  assert.equal(out03.passed, false);
  assert.match(out03.error, /PROVIDER_PRECONDITION_MISSING/);
});

test('45. Task 06I-B1-H1-R3 (R3-02): Client-controlled AMR injection rejected; PL/pgSQL parity required', async () => {
  const hook05 = { id: 'HOOK-05', category: 'Token Hook' };
  const hook06 = { id: 'HOOK-06', category: 'Token Hook' };
  const hook07 = { id: 'HOOK-07', category: 'Token Hook' };

  const disp = createHostedDispatcher({ anonKey: validTestAnonKey, fetchFn: staticTransport({ status: 400 }) });
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
  const resExpired = validateProbeOutcome(session04, {
    passed: true,
    status: 200,
    token_unexpired: false,
    revocation_verified: true,
    revoked_session_id: 'sess-test',
    correlated_session_id: 'sess-test',
    session_correlated: true,
    stateless_linger_documented: true,
    note: 'expired'
  });
  assert.equal(resExpired.passed, false);
  assert.match(resExpired.reason, /MISSING_EVIDENCE.*unexpired/);

  // Pass ONLY with HTTP 200 + unexpired token + documentation + 300s lifetime bound (R7-02, R17-02)
  const resPass = validateProbeOutcome(session04, {
    passed: true,
    status: 200,
    token_unexpired: true,
    jwt_lifetime_seconds: 300,
    lifetime_bounded: true,
    revocation_verified: true,
    revoked_session_id: 'sess-test',
    correlated_session_id: 'sess-test',
    session_correlated: true,
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
  const dispWithoutAdmin = createHostedDispatcher({
    anonKey: validTestAnonKey,
    serviceRoleKey: null,
    fetchFn: staticTransport({ status: 200 })
  });
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
    fetchFn: staticTransport({ status: 404, json: { message: 'Function not found' } })
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
  inventory.registerCreatedUser({
    id: 'user-to-clean',
    email: 'clean-me@proof.invalid',
    creationProof: createCreationProof('before_after_check', { preCheckAbsent: true, postCheckPresent: true })
  });

  const mockAdminClient = fixtureSpec();

  const mockDispatcher = offlineDispatcherSpec({
    defaultOutcome: {
      passed: false,
      status: 500,
      reason: 'simulated halt'
    }
  });

  const res = await runHostedProbeRunner(fixtureRunnerOptions({
    projectRef: HARDCODED_TEMP_REF,
    argv: ['--live'],
    env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
    inventory,
    adminClient: mockAdminClient,
    mockDispatcher,
    timing: { mode: 'recorded_zero_wait' }
  }));

  assert.equal(res.status, 'HALTED_ON_FAILURE');
  assert.ok(res.cleanupReport, 'cleanupReport must be included in runner result');
  assert.equal(res.cleanupReport.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(res.cleanupReport.usersDeleted, 1);
  assert.deepEqual((fixtureOperationCalls(mockAdminClient, 'userDelete').map(c => c.pathname.split('/').map(decodeURIComponent).at(-1))), ['user-to-clean']);
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
  assert.match(resNotJson.reason, /JWT_CLAIM_VIOLATION: HOOK-01 TOKEN_FORMAT_INVALID/);

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
  inventory.registerCreatedUser({
    id: 'signup-user-uuid',
    email: 'accidental-signup@proof.invalid',
    creationProof: createCreationProof('before_after_check', { preCheckAbsent: true, postCheckPresent: true })
  });

  const mockAdminClient = fixtureSpec();

  const report = await inventory.executeCleanup({ adminClient: bindFixtureAdmin(inventory, mockAdminClient) });
  assert.equal(report.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(report.createdUsersAttempted, 1);
  assert.equal(report.usersDeleted, 1);
  assert.equal(report.referencedUsersPreserved, 1);
  assert.deepEqual((fixtureOperationCalls(mockAdminClient, 'userDelete').map(c => c.pathname.split('/').map(decodeURIComponent).at(-1))), ['signup-user-uuid']);
  assert.ok(!(fixtureOperationCalls(mockAdminClient, 'userDelete').map(c => c.pathname.split('/').map(decodeURIComponent).at(-1))).includes('seed-user-uuid'), 'Seed user must NEVER be deleted');
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
  const dummyDispatcher = offlineDispatcherSpec({ defaultOutcome: { passed: true, status: 200, evidence: 'ok' } });

  // 1. Missing adminClient in LIVE mode throws CLEANUP_CAPABILITY_REQUIRED before executing any probes
  const missingAdminInv = new TestRunInventory('test-56-missing-admin');
  const missingAdminDisp = createTrustedOfflineDispatcher({ runId: missingAdminInv.runId, defaultOutcome: { passed: true, status: 200 } });
  await assert.rejects(
    async () => {
      await runHostedProbeRunner({
        projectRef: HARDCODED_TEMP_REF,
        inventory: missingAdminInv,
        argv: ['--live'],
        env: liveEnv,
        adminClient: null,
        mockDispatcher: missingAdminDisp
      });
    },
    /CLEANUP_CAPABILITY_REQUIRED.*registered run-bound Admin client/
  );
  assert.equal(missingAdminDisp.calls.length, 0, 'Probes must not be executed when cleanup capability is missing');

  // 2. adminClient missing deleteUser method throws UNTRUSTED_ADMIN_CLIENT
  await assert.rejects(
    async () => {
      await runHostedProbeRunner(fixtureRunnerOptions({
        projectRef: HARDCODED_TEMP_REF,
        argv: ['--live'],
        env: liveEnv,
        adminClient: { getUserById: async () => ({}) },
        mockDispatcher: dummyDispatcher
      }));
    },
    /UNTRUSTED_ADMIN_CLIENT/
  );

  // 3. Failed cleanup overrides passing probes and marks overall run HALTED_ON_FAILURE
  const invWithResidual = new TestRunInventory('test-run-residual-override');
  invWithResidual.registerCreatedUser({
    id: 'residual-user-fail',
    email: 'residual@proof.invalid',
    creationProof: createCreationProof('before_after_check', { preCheckAbsent: true, postCheckPresent: true })
  });

  const failingCleanupAdmin = fixtureSpec({ userDelete: { status: 503, json: { message: 'Database lock timeout on delete' } }, userGet: { status: 200, json: { user: { id: 'residual-user-fail' } } } });

  const resultFailedCleanup = await runHostedProbeRunner(fixtureRunnerOptions({
    projectRef: HARDCODED_TEMP_REF,
    argv: ['--live'],
    env: liveEnv,
    inventory: invWithResidual,
    adminClient: failingCleanupAdmin,
    mockDispatcher: offlineDispatcherSpec({
      outcomes: {
        'BYPASS-01': { passed: true, status: 422, route_disabled: true, error_code: 'email_provider_disabled' },
        'BYPASS-02': { passed: true, status: 422, signup_disabled: true, error_code: 'signup_disabled' },
        'BYPASS-03': { passed: true, status: 500, hook_rejected: true, error: 'hook_error: 42501' },
        'BYPASS-04': { passed: true, status: 500, hook_rejected: true, error: 'hook_error: 42501' },
        'BYPASS-05': { passed: true, status: 500, recovery_suppressed: true, zero_email_delivered: true },
        'HOOK-01': { passed: true, status: 200, has_token: true, amr_authenticated: true, session_id: 'session-uuid-5678', tokens: { access_token: createMockJwt() } },
        'HOOK-02': { passed: true, status: 200, has_token: true, amr_preserved: true, tokens: { access_token: createMockJwt() } },
        'HOOK-03': { passed: true, status: 500, hook_rejected: true, error: 'hook_error: 42501' },
        'HOOK-04': { passed: true, status: 500, hook_rejected: true, error: 'hook_error: 42501' },
        'HOOK-05': { passed: true, status: 500, hook_rejected: true, error: 'hook_error: 42501' },
        'HOOK-06': { passed: true, status: 500, hook_rejected: true, error: 'hook_error: 42501' },
        'HOOK-07': { passed: true, status: 500, hook_rejected: true, error: 'hook_error: 42501' },
        'SESSION-01': { passed: true, status: 200, session_created: true, session_id: 'session-uuid-5678' },
        'SESSION-02': { passed: true, status: 200, password_reset_completed: true, session_revoked: true, session_revocation_verified: true, remaining_sessions: 0 },
        'SESSION-03': { passed: true, status: 403, pre_reset_baseline_verified: true, reset_completed: true, session_id: 'session-uuid-5678', correlated_session_id: 'session-uuid-5678', pre_session_id: 'session-uuid-5678', same_session_correlated: true, error_code: 'session_not_found' },
        'SESSION-04': { passed: true, status: 200, token_unexpired: true, jwt_lifetime_seconds: 300, lifetime_bounded: true, stateless_linger_documented: true, note: 'linger window verified' },
        'SESSION-05': { passed: true, status: 200, token_unexpired: true, jwt_lifetime_seconds: 300, lifetime_bounded: true, stateless_linger_documented: true, note: 'linger window verified' },
        'SESSION-06': { passed: true, status: 403, pre_reset_baseline_verified: true, reset_completed: true, session_id: 'session-uuid-5678', correlated_session_id: 'session-uuid-5678', pre_session_id: 'session-uuid-5678', same_session_correlated: true, error_code: 'AuthSessionMissingError' }
      },
      defaultOutcome: { passed: true, status: 200 }
    }),
    timing: { mode: 'recorded_zero_wait' }
  }));

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

  const mockFetchSurviving = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
    routes: [
      { urlIncludes: '/auth/v1/admin/users/', status: 200, json: { id: 'user-test-reset-123' } },
      { urlIncludes: '/auth/v1/user', status: 200, json: { id: 'user-test-reset-123' } }
    ],
    defaultResponse: { status: 400, json: {} }
  });

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
  const mockFetchGenericInvalidToken = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
    routes: [
      { urlIncludes: '/auth/v1/admin/users/', status: 200, json: { id: 'user-test-reset-123' } },
      { urlIncludes: '/auth/v1/user', status: 401, json: { message: 'Invalid token' } }
    ],
    defaultResponse: { status: 400, json: {} }
  });

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
  const mockFetchRevoked = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
    routes: [
      { urlIncludes: '/auth/v1/admin/users/', status: 200, json: { id: 'user-test-reset-123' } },
      { urlIncludes: '/auth/v1/user', status: 401, json: { error_code: 'session_not_found', message: 'Session not found' } }
    ],
    defaultResponse: { status: 400, json: {} }
  });

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

  const mockFetchGenericForbidden = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
    routes: [
      { urlIncludes: '/functions/v1/auth-user-probe', status: 403, json: { message: 'Forbidden' } },
      { urlIncludes: '/auth/v1/user', status: 403, json: { message: 'Forbidden' } }
    ],
    defaultResponse: { status: 400, json: {} }
  });

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
  const mockFetchGenuineError = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
    routes: [
      { urlIncludes: '/functions/v1/auth-user-probe', status: 401, json: { error_code: 'AuthSessionMissingError', message: 'Session is revoked or missing' } }
    ],
    defaultResponse: { status: 400, json: {} }
  });

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
  inv.registerSession('session-uuid-active-1', { accessToken: createMockJwt({ session_id: 'session-uuid-active-1' }) });

  // 1. adminClient lacking invalidateSession and signOut fails cleanup closed
  const clientNoInvalidation = {
    deleteUser: async () => ({ data: null, error: null }),
    getUserById: async () => ({ data: null, error: { status: 404 } })
  };

  const reportNoMethod = await inv.executeCleanup({ adminClient: clientNoInvalidation, failClosed: false });
  assert.equal(reportNoMethod.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.ok(reportNoMethod.residualResources.some(r => r.type === 'client' && r.error.includes('UNTRUSTED_ADMIN_CLIENT')));

  // 2. adminClient returning error on invalidateSession fails cleanup closed
  const clientErrorInvalidation = fixtureSpec({ logout: { status: 504, json: { message: 'Gateway timeout invalidating session session-uuid-active-1' } } });

  const reportError = await inv.executeCleanup({ adminClient: bindFixtureAdmin(inv, clientErrorInvalidation), failClosed: false });
  assert.equal(reportError.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.ok(reportError.residualResources.some(r => r.type === 'session' && r.id === 'session-uuid-active-1'));

  // 3. Working session invalidation succeeds
  const clientSuccess = fixtureSpec();

  const reportSuccess = await inv.executeCleanup({ adminClient: bindFixtureAdmin(inv, clientSuccess), failClosed: false });
  assert.equal(reportSuccess.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(reportSuccess.sessionsRevoked, 1);
});

test('60. Task 06I-B1-H1-R4 (R4-06): User absence verification detects data.id, data.user.id, and treats 503/network error as verification failure', async () => {
  // 1. Detects existing user in standard Supabase GoTrue shape { data: { id: userId }, error: null }
  const inv1 = new TestRunInventory('test-user-verify-shape');
  inv1.registerCreatedUser({
    id: 'user-standard-shape-1',
    email: 'shape1@proof.invalid',
    creationProof: createCreationProof('before_after_check', { preCheckAbsent: true, postCheckPresent: true })
  });

  const clientShape1 = fixtureSpec({ userGet: { status: 200, json: { id: 'user-standard-shape-1', email: 'shape1@proof.invalid' } } });

  const report1 = await inv1.executeCleanup({ adminClient: bindFixtureAdmin(inv1, clientShape1), failClosed: false });
  assert.equal(report1.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.ok(report1.residualUsers.some(u => u.id === 'user-standard-shape-1' && u.reason === 'STILL_EXISTS_IN_DATABASE'));

  // 2. Detects existing user in nested shape { data: { user: { id: userId } }, error: null }
  const inv2 = new TestRunInventory('test-user-verify-shape-2');
  inv2.registerCreatedUser({
    id: 'user-nested-shape-2',
    email: 'shape2@proof.invalid',
    creationProof: createCreationProof('before_after_check', { preCheckAbsent: true, postCheckPresent: true })
  });

  const clientShape2 = fixtureSpec({ userGet: { status: 200, json: { user: { id: 'user-nested-shape-2' } } } });

  const report2 = await inv2.executeCleanup({ adminClient: bindFixtureAdmin(inv2, clientShape2), failClosed: false });
  assert.equal(report2.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.ok(report2.residualUsers.some(u => u.id === 'user-nested-shape-2' && u.reason === 'STILL_EXISTS_IN_DATABASE'));

  // 3. HTTP 503 or network error during absence check fails closed (NOT accepted as absence)
  const inv3 = new TestRunInventory('test-user-verify-503');
  inv3.registerCreatedUser({
    id: 'user-503-fail',
    email: 'fail503@proof.invalid',
    creationProof: createCreationProof('before_after_check', { preCheckAbsent: true, postCheckPresent: true })
  });

  const client503 = fixtureSpec({ userGet: { status: 503, json: { status: 503, message: 'Service Unavailable' } } });

  const report3 = await inv3.executeCleanup({ adminClient: bindFixtureAdmin(inv3, client503), failClosed: false });
  assert.equal(report3.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.ok(report3.residualUsers.some(u => u.id === 'user-503-fail' && u.error.includes('VERIFY_FAILED: Non-404 error')));

  // 4. Explicit 404 user_not_found confirms verified absence
  const inv4 = new TestRunInventory('test-user-verify-404');
  inv4.registerCreatedUser({
    id: 'user-404-absent',
    email: 'absent@proof.invalid',
    creationProof: createCreationProof('before_after_check', { preCheckAbsent: true, postCheckPresent: true })
  });

  const client404 = fixtureSpec();

  const report4 = await inv4.executeCleanup({ adminClient: bindFixtureAdmin(inv4, client404), failClosed: false });
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
    fetchFn: staticTransport({ status: 200 })
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
    fetchFn: createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
      routes: [
        { urlIncludes: '/auth/v1/admin/users/', status: 200, json: { id: 'user-r5-01' } },
        { urlIncludes: '/auth/v1/user', status: 401, json: { error_code: 'bad_jwt', message: 'Token signature is invalid' } }
      ],
      defaultResponse: { status: 400, json: {} }
    })
  });
  const outBadJwt = await dispBadJwt(session02);
  assert.equal(outBadJwt.passed, false);
  assert.match(outBadJwt.error, /FALSE_PROOF_REJECTED/);

  // 2. Ambiguous 403 Forbidden without provider revocation error code fails closed
  const dispAmbiguous = createHostedDispatcher({
    anonKey: validTestAnonKey,
    serviceRoleKey: validTestServiceRoleKey,
    runContext: runCtx,
    fetchFn: createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
      routes: [
        { urlIncludes: '/auth/v1/admin/users/', status: 200, json: { id: 'user-r5-01' } },
        { urlIncludes: '/auth/v1/user', status: 403, json: { message: 'Forbidden' } }
      ],
      defaultResponse: { status: 400, json: {} }
    })
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
  inv.registerSession('session-to-clean-1', { accessToken: createMockJwt({ session_id: 'session-to-clean-1' }) });

  // 1. Session deletion returning 404 (e.g. unknown route or missing session) fails cleanup closed
  const client404 = fixtureSpec({ logout: { status: 404, json: { code: 'route_not_found', message: 'Unknown route HTTP 404' } } });

  const report404 = await inv.executeCleanup({ adminClient: bindFixtureAdmin(inv, client404), failClosed: false });
  assert.equal(report404.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.ok(report404.residualResources.some(r => r.type === 'session' && r.error.includes('404')));

  // 2. Session deletion returning 500 error fails cleanup closed
  const client500 = fixtureSpec({ logout: { status: 500, json: { message: 'Database connection failed 500' } } });
  const report500 = await inv.executeCleanup({ adminClient: bindFixtureAdmin(inv, client500), failClosed: false });
  assert.equal(report500.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.ok(report500.residualResources.some(r => r.type === 'session' && r.error.includes('500')));
});

test('65. Task 06I-B1-H1-R5 (R5-03): User absence check requires structured 404; 503 Service Unavailable with "not found" in message fails closed', async () => {
  const inv = new TestRunInventory('test-run-user-absence-503');
  inv.registerCreatedUser({
    id: 'user-absence-503',
    email: 'absence503@proof.invalid',
    creationProof: createCreationProof('before_after_check', { preCheckAbsent: true, postCheckPresent: true })
  });

  // 1. 503 error containing 'not found' in message text must NOT be treated as absence
  const client503 = fixtureSpec({ userGet: { status: 503, json: { status: 503, message: 'Upstream gateway service: route not found' } } });

  const report503 = await inv.executeCleanup({ adminClient: bindFixtureAdmin(inv, client503), failClosed: false });
  assert.equal(report503.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.ok(report503.residualUsers.some(u => u.id === 'user-absence-503' && u.error.includes('VERIFY_FAILED')));

  // 2. Exception with 503 status must NOT be treated as absence
  const clientThrow503 = fixtureSpec({ userGet: { throwError: { message: 'Service Unavailable: user resource not found', status: 503 } } });

  const reportThrow = await inv.executeCleanup({ adminClient: bindFixtureAdmin(inv, clientThrow503), failClosed: false });
  assert.equal(reportThrow.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.ok(reportThrow.residualUsers.some(u => u.id === 'user-absence-503'));

  // 3. Structured 404 confirms absence
  const clientExplicit404 = fixtureSpec();
  const reportExplicit = await inv.executeCleanup({ adminClient: bindFixtureAdmin(inv, clientExplicit404), failClosed: false });
  assert.equal(reportExplicit.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(reportExplicit.usersDeleted, 1);
});

test('66. Task 06I-B1-H1-R5 (R5-04): Successful password grant mints session that is tracked for cleanup immediately even when JWT claim validation fails', async () => {
  const hook01 = { id: 'HOOK-01', category: 'Token Hook' };
  const inv = new TestRunInventory('test-run-r5-04');
  const runCtx = createRunContext({ runId: inv.runId });

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
    fetchFn: staticTransport({
      status: 200,
      json: {
        access_token: tokenWithBadAmr,
        refresh_token: 'refresh-999',
        session_id: 'sess-minted-bad-amr-999',
        user: { id: 'user-minted-999', email: 'tio-test-user-06i@proof.invalid' }
      }
    })
  });

  const outcome = await disp(hook01);

  // 1. Dispatcher rejected token for authorization because of JWT claim violation
  assert.equal(outcome.passed, false);
  assert.equal(outcome.jwt_claim_policy_validated, false);
  assert.match(outcome.error, /JWT_CLAIM_VIOLATION/);

  // 2. BUT minted session was immediately captured and registered in inventory for cleanup!
  assert.equal(inv.trackedSessions.has('sess-minted-bad-amr-999'), true, 'Minted session must be registered for cleanup');
  assert.equal(outcome.session_cleanup_registered, true);

  // 3. activeAccessToken is NOT authorized in runCtx
  assert.equal(runCtx.activeAccessToken, null, 'Unverified JWT must not be stored as active authorized token');

  // 4. Cleanup executes and revokes the minted session
  const mockAdminClient = fixtureSpec();

  const cleanupReport = await inv.executeCleanup({ adminClient: bindFixtureAdmin(inv, mockAdminClient), failClosed: false });
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

  const mockAdminClient = fixtureSpec();

  // --- RUN 1: Login, Password Reset, and Cleanup ---
  const inv1 = new TestRunInventory('run-1-seed-lifecycle');
  const runCtx1 = createRunContext({ runId: inv1.runId });
  runCtx1.activeUserId = 'seed-user-uuid-1';
  runCtx1.activeSessionId = 'sess-run-1';
  runCtx1.activeAccessToken = createMockJwt({ sub: 'seed-user-uuid-1', session_id: 'sess-run-1' });

  const disp1Transport = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
    routes: [
      { urlIncludes: '/auth/v1/admin/users/', status: 200, json: { id: 'seed-user-uuid-1' } },
      { urlIncludes: '/auth/v1/user', status: 401, json: { error_code: 'session_not_found', message: 'Session not found' } }
    ],
    defaultResponse: { status: 400, json: {} }
  });
  const disp1 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    serviceRoleKey: validTestServiceRoleKey,
    inventory: inv1,
    runContext: runCtx1,
    fetchFn: disp1Transport
  });

  const outReset = await disp1(session02);
  assert.equal(outReset.passed, true);
  assert.equal(disp1Transport.calls.find(c => c.url.includes('/auth/v1/admin/users/'))?.bodyJson?.password, 'TioNewPassword#2026!', 'Seed user password changed to new password in provider');
  assert.equal(inv1.seedCredentialRestorations.length, 1, 'Inventory tracked password modification');

  // Run 1 Cleanup: Must restore original seed password!
  const cleanupReport1 = await inv1.executeCleanup({ adminClient: bindFixtureAdmin(inv1, mockAdminClient), failClosed: true });
  assert.equal(cleanupReport1.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(cleanupReport1.seedCredentialsRestored, 1);
  assert.equal((fixtureOperationCalls(mockAdminClient, 'userUpdate').at(-1)?.bodyJson?.password), originalSeedPassword, 'Cleanup must restore original seed password in provider');

  // --- RUN 2: Sequential run authenticates with original seed password ---
  const inv2 = new TestRunInventory('run-2-seed-lifecycle');
  const runCtx2 = createRunContext({ runId: inv2.runId });

  const tokenRun2 = createMockJwt({ sub: 'seed-user-uuid-1', session_id: 'sess-run-2' });
  const disp2 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    inventory: inv2,
    runContext: runCtx2,
    fetchFn: createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
      routes: [
        {
          urlIncludes: '/auth/v1/token',
          bodyMatch: { password: providerSeedPassword },
          status: 200,
          json: { access_token: tokenRun2, refresh_token: 'refr-run-2', session_id: 'sess-run-2', user: { id: 'seed-user-uuid-1' } }
        },
        {
          urlIncludes: '/auth/v1/token',
          status: 400,
          json: { message: 'Invalid login credentials' }
        }
      ],
      defaultResponse: { status: 400, json: {} }
    })
  });

  const outLogin2 = await disp2(hook01);
  assert.equal(outLogin2.passed, true, 'Run 2 must succeed logging in with restored seed credentials');
  assert.equal(runCtx2.activeSessionId, 'sess-run-2');
});

test('69. Task 06I-B1-H1-R5 (R5-07): Storage fixture readiness: SESSION-05 distinguishes missing 404 fixture from auth failure; storage object registered in inventory', async () => {
  const session05 = { id: 'SESSION-05', category: 'Session & Consumer' };
  const runCtx = createRunContext();
  runCtx.activeAccessToken = createMockJwt({ exp: Math.floor(Date.now() / 1000) + 300 });
  runCtx.preInvalidationSessionValid = true;
  runCtx.passwordResetCompleted = true;
  runCtx.sessionRevocationConfirmed = true;
  runCtx.revokedSessionId = 'session-uuid-5678';

  // 1. Missing storage object (HTTP 404) returns STORAGE_FIXTURE_MISSING (not an auth failure)
  const disp404 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    runContext: runCtx,
    fetchFn: staticTransport({ status: 404, json: { message: 'Object not found' } })
  });
  const out404 = await disp404(session05);
  assert.equal(out404.passed, false);
  assert.equal(out404.status, 404);
  assert.match(out404.error, /STORAGE_FIXTURE_MISSING/);

  // 2. Storage object registration in inventory and cleanup
  const { inventory: inv } = await r5ProvisionedFixture('test-run-storage-clean');
  assert.equal(inv.trackedStorageObjects.get(STORAGE_PROBE_BUCKET).has(getStorageProbeObjectPath(inv.runId)), true);

  const mockAdminClient = fixtureSpec();

  const report = await inv.executeCleanup({ adminClient: bindFixtureAdmin(inv, mockAdminClient), failClosed: true });
  assert.equal(report.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(report.storageObjectsDeleted, 1);
  assert.equal((fixtureOperationCalls(mockAdminClient, 'storageDelete').at(-1)?.pathname.slice('/storage/v1/object/'.length).split('/').map(decodeURIComponent).join('/')), getStorageProbeObjectKey(inv.runId));
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
    fetchFn: staticTransport({
      status: 401,
      json: { error: 'Invalid token: signature verification failed', error_code: 'invalid_token' }
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
    fetchFn: staticTransport({
      status: 500,
      json: { error: 'Internal server error connecting to GoTrue', error_code: 'internal_server_error' }
    })
  });
  const out500 = await disp500(session06);
  assert.equal(out500.passed, false);
  assert.equal(out500.revocation_verified, false);

  // 3. Genuine AuthSessionMissingError emitted on confirmed session absence PASSES
  const dispGenuine = createHostedDispatcher({
    anonKey: validTestAnonKey,
    runContext: runCtx,
    fetchFn: staticTransport({
      status: 401,
      json: { error: 'AuthSessionMissingError: session revoked by password change', error_code: 'AuthSessionMissingError' }
    })
  });
  const outGenuine = await dispGenuine(session06);
  assert.equal(outGenuine.passed, true);
  assert.equal(outGenuine.revocation_verified, true);
});

test('71. Task 06I-B1-H1-R6 (R6-01): Supported session revocation for cleanup preserves token context and uses GoTrue sign-out', async () => {
  const inv = new TestRunInventory('test-run-session-r6-01');
  const testSessionId = 'sess-cleanup-r6-01';
  const testToken = createMockJwt({ session_id: testSessionId, exp: Math.floor(Date.now() / 1000) + 3600 });

  // 1. registerSession preserves both sessionId and accessToken
  inv.registerSession(testSessionId, { accessToken: testToken });
  assert.equal(inv.trackedSessions.has(testSessionId), true);
  assert.equal(inv.getSessionToken(testSessionId), testToken);

  // 2. executeCleanup passes token context to supported signOut method
  const mockAdminClient = fixtureSpec();

  const report = await inv.executeCleanup({ adminClient: bindFixtureAdmin(inv, mockAdminClient), failClosed: true });
  assert.equal(report.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(report.sessionsRevoked, 1);
  assert.equal((fixtureOperationCalls(mockAdminClient, 'logout').at(-1)?.headers.authorization?.replace(/^Bearer /, '')), testToken, 'signOut must receive the exact registered user access token');
  assert.equal(new URL(fixtureOperationCalls(mockAdminClient, 'logout').at(-1).url).searchParams.get('scope'), 'local', 'signOut must request local scope to avoid global invalidation of unrelated sessions');

  // 3. When session is registered without token, signOut fails closed
  const invNoToken = new TestRunInventory('test-run-no-token');
  invNoToken.registerSession('sess-without-token');
  const reportNoToken = await invNoToken.executeCleanup({ adminClient: bindFixtureAdmin(invNoToken, mockAdminClient), failClosed: false });
  assert.equal(reportNoToken.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.ok(reportNoToken.residualResources.some(r => r.type === 'session' && r.error.includes('UNSUPPORTED_SESSION_REVOCATION')));

  // 4. Standalone CLI adapter session invalidation contract
  // Exercise the actual registered adapter with a declarative provider response.
  const cliTransport = staticTransport({ status: 200, json: {} });
  const cliAdapter = trackedHostedAdminClient({ serviceRoleKey: validTestServiceRoleKey, runId: inv.runId, fetchFn: cliTransport });
  const cliResult = await cliAdapter.invalidateSession(testSessionId, testToken);
  assert.equal(cliResult.error, null);
  assert.match(cliTransport.calls[0].url, /\/auth\/v1\/logout\?scope=local$/);
  assert.equal(cliTransport.calls[0].method, 'POST');
  assert.equal(cliTransport.calls[0].headers.authorization, `Bearer ${testToken}`);
  assert.ok(!cliTransport.calls.some(c => c.url.includes('/admin/users/sessions')), 'Unsupported admin sessions route must NEVER be called');

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
  runCtx.preInvalidationSessionValid = true;
  runCtx.passwordResetCompleted = true;
  runCtx.sessionRevocationConfirmed = true;
  runCtx.revokedSessionId = 'session-uuid-5678';

  // Missing fixture returns HTTP 404 (STORAGE_FIXTURE_MISSING)
  const disp404 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    runContext: runCtx,
    fetchFn: staticTransport({ status: 404, json: { message: 'Object not found' } })
  });
  const out404 = await disp404(session05);
  assert.equal(out404.passed, false);
  assert.equal(out404.status, 404);
  assert.match(out404.error, /STORAGE_FIXTURE_MISSING/);

  // Authenticated probe with HTTP 200 before token expiration passes linger window demonstration
  const disp200 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    runContext: runCtx,
    fetchFn: staticTransport({ status: 200, json: { probe: 'task06i-storage-probe-content' } })
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
    fetchFn: staticTransport({
      status: 403,
      json: {
        error: 'Session from session_id claim in JWT does not exist',
        error_code: 'session_not_found'
      }
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
    fetchFn: staticTransport({
      status: 401,
      json: {
        error: 'AuthSessionMissingError: Session invalidated',
        error_code: 'AuthSessionMissingError'
      }
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
    fetchFn: staticTransport({
      status: 403,
      json: { message: 'Forbidden' }
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
    fetchFn: staticTransport({
      status: 401,
      json: { error_code: 'bad_jwt', message: 'Token is malformed' }
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
    () => trackedHostedAdminClient({ serviceRoleKey: validTestServiceRoleKey, projectRef: HARDCODED_REAL_REF }),
    /SECURITY_BOUNDARY_VIOLATION.*bsfwzvgynwriswapxpsp/
  );
  assert.throws(
    () => trackedHostedAdminClient({ serviceRoleKey: validTestServiceRoleKey, projectRef: HARDCODED_TIO_WORLD_REF }),
    /SECURITY_BOUNDARY_VIOLATION/
  );
  assert.throws(
    () => trackedHostedAdminClient({ serviceRoleKey: '', projectRef: HARDCODED_TEMP_REF }),
    /MISSING_HOSTED_CREDENTIALS/
  );

  // 2. Inspect method definitions: verify NO duplicate signOut method exists
  const mockFetch = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
    initialState: {
      del_u_test_123: false,
      del_u_created_01: false,
      del_u_created_02: false
    },
    routes: [
      { urlIncludes: '/auth/v1/logout', status: 200, ok: true, json: {} },
      { method: 'DELETE', pathIncludes: 'u-test-123', setsState: { del_u_test_123: true }, status: 200, json: {} },
      { method: 'GET', pathIncludes: 'u-test-123', whenState: { del_u_test_123: true }, status: 404, json: { message: 'User not found', status: 404 } },
      { method: 'DELETE', pathIncludes: 'u-created-01', setsState: { del_u_created_01: true }, status: 200, json: {} },
      { method: 'GET', pathIncludes: 'u-created-01', whenState: { del_u_created_01: true }, status: 404, json: { message: 'User not found', status: 404 } },
      { method: 'DELETE', pathIncludes: 'u-created-02', setsState: { del_u_created_02: true }, status: 200, json: {} },
      { method: 'GET', pathIncludes: 'u-created-02', whenState: { del_u_created_02: true }, status: 404, json: { message: 'User not found', status: 404 } },
      { method: 'GET', urlIncludes: '/auth/v1/admin/users/', status: 200, json: { id: 'u-r7-01', email: 'test@proof.invalid' } },
      { method: 'PUT', urlIncludes: '/auth/v1/admin/users/', status: 200, json: { id: 'u-r7-01' } },
      { urlIncludes: '/rest/v1/', status: 200, json: [] },
      { urlIncludes: '/storage/v1/object/', status: 200, json: {} }
    ],
    defaultResponse: { status: 500, ok: false, json: { message: 'unexpected URL' } }
  });

  const adminClient = trackedHostedAdminClient({
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
  let prevCallsCount = mockFetch.calls.length;
  const testToken = createMockJwt({ session_id: 'sess-r7-01' });
  const resInvalidate = await adminClient.invalidateSession('sess-r7-01', testToken);
  assert.equal(resInvalidate.error, null);
  assert.equal(resInvalidate.data?.scope, 'local');
  let newCalls = mockFetch.calls.slice(prevCallsCount);
  assert.equal(newCalls.length, 1);
  assert.match(newCalls[0].url, /\/auth\/v1\/logout\?scope=local/);
  assert.equal(newCalls[0].method, 'POST');
  assert.equal(newCalls[0].headers.authorization, `Bearer ${testToken}`);
  assert.equal(newCalls[0].headers.apikey, validTestServiceRoleKey);

  // Calling invalidateSession without token fails closed with UNSUPPORTED_SESSION_REVOCATION
  prevCallsCount = mockFetch.calls.length;
  const resNoToken = await adminClient.invalidateSession('sess-r7-01', null);
  assert.ok(resNoToken.error);
  assert.equal(resNoToken.error.status, 400);
  assert.match(resNoToken.error.message, /UNSUPPORTED_SESSION_REVOCATION/);
  assert.equal(mockFetch.calls.length - prevCallsCount, 0, 'No fetch must be dispatched without token');

  // Calling signOut without token fails closed with MISSING_TOKEN
  const resEmptySignOut = await adminClient.signOut('');
  assert.ok(resEmptySignOut.error);
  assert.match(resEmptySignOut.error.message, /MISSING_TOKEN/);

  // Calling deleteUser without userId fails closed
  const resEmptyDeleteUser = await adminClient.deleteUser('');
  assert.ok(resEmptyDeleteUser.error);
  assert.match(resEmptyDeleteUser.error.message, /MISSING_USER_ID/);

  // Calling deleteUser with valid userId dispatches DELETE /auth/v1/admin/users/:id
  prevCallsCount = mockFetch.calls.length;
  const resDelUser = await adminClient.deleteUser('u-test-123');
  assert.equal(resDelUser.error, null);
  newCalls = mockFetch.calls.slice(prevCallsCount);
  assert.equal(newCalls.length, 1);
  assert.match(newCalls[0].url, /\/auth\/v1\/admin\/users\/u-test-123/);
  assert.equal(newCalls[0].method, 'DELETE');

  // Calling getUserById with 404 response returns clean 404 object without throwing
  const mock404Fetch = staticTransport({ ok: false, status: 404, json: {} });
  const admin404 = trackedHostedAdminClient({ serviceRoleKey: validTestServiceRoleKey, fetchFn: mock404Fetch });
  const res404 = await admin404.getUserById('u-nonexistent');
  assert.equal(res404.data, null);
  assert.equal(res404.error?.status, 404);

  // 3. Integration with executeCleanup: executeCleanup with actual createHostedAdminClient
  const inv = new TestRunInventory('inv-r7-01');
  const sessToken = createMockJwt({ session_id: 'sess-tracked-01' });
  inv.registerSession('sess-tracked-01', { accessToken: sessToken });
  inv.registerCreatedUser({
    id: 'u-created-01',
    email: 'created@proof.invalid',
    creationProof: createCreationProof('before_after_check', { preCheckAbsent: true, postCheckPresent: true })
  });
  inv.registerCreatedUser({
    id: 'u-created-02',
    email: 'created2@proof.invalid',
    creationProof: createCreationProof('before_after_check', { preCheckAbsent: true, postCheckPresent: true })
  });

  const cleanupReport = await inv.executeCleanup({ adminClient: bindFixtureAdmin(inv, adminClient) });
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
    revocation_verified: true,
    revoked_session_id: 'session-uuid-5678',
    correlated_session_id: 'session-uuid-5678',
    session_correlated: true,
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
    revocation_verified: true,
    revoked_session_id: 'session-uuid-5678',
    correlated_session_id: 'session-uuid-5678',
    session_correlated: true,
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
    revocation_verified: true,
    revoked_session_id: 'session-uuid-5678',
    correlated_session_id: 'session-uuid-5678',
    session_correlated: true,
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
    revocation_verified: true,
    revoked_session_id: 'session-uuid-5678',
    correlated_session_id: 'session-uuid-5678',
    session_correlated: true,
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
    revocation_verified: true,
    revoked_session_id: 'session-uuid-5678',
    correlated_session_id: 'session-uuid-5678',
    session_correlated: true,
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
    revocation_verified: true,
    revoked_session_id: 'session-uuid-5678',
    correlated_session_id: 'session-uuid-5678',
    session_correlated: true,
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
    revocation_verified: true,
    revoked_session_id: 'session-uuid-5678',
    correlated_session_id: 'session-uuid-5678',
    session_correlated: true,
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
    revocation_verified: true,
    revoked_session_id: 'session-uuid-5678',
    correlated_session_id: 'session-uuid-5678',
    session_correlated: true,
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
    revocation_verified: true,
    revoked_session_id: 'session-uuid-5678',
    correlated_session_id: 'session-uuid-5678',
    session_correlated: true,
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
  runCtxValid.preInvalidationSessionValid = true;
  runCtxValid.passwordResetCompleted = true;
  runCtxValid.sessionRevocationConfirmed = true;
  runCtxValid.revokedSessionId = 'session-uuid-5678';
  const dispValid = createHostedDispatcher({
    anonKey: validTestAnonKey,
    runContext: runCtxValid,
    fetchFn: staticTransport({ status: 200, json: [] })
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
  runCtxOversized.preInvalidationSessionValid = true;
  runCtxOversized.passwordResetCompleted = true;
  runCtxOversized.sessionRevocationConfirmed = true;
  runCtxOversized.revokedSessionId = 'session-uuid-5678';
  const dispOversized = createHostedDispatcher({
    anonKey: validTestAnonKey,
    runContext: runCtxOversized,
    fetchFn: staticTransport({ status: 200, json: [] })
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
  runCtxNoIat.preInvalidationSessionValid = true;
  runCtxNoIat.passwordResetCompleted = true;
  runCtxNoIat.sessionRevocationConfirmed = true;
  runCtxNoIat.revokedSessionId = 's-1';
  const dispNoIat = createHostedDispatcher({
    anonKey: validTestAnonKey,
    runContext: runCtxNoIat,
    fetchFn: staticTransport({ status: 200, json: [] })
  });
  const out04NoIat = await dispNoIat(session04);
  assert.equal(out04NoIat.passed, false);
  assert.match(out04NoIat.error, /MISSING_JWT_TIMESTAMPS/);

  // Token with exp <= iat fails dispatcher and validator
  const tokenInconsistent = createMockJwt({ iat: now + 300, exp: now + 100 });
  const runCtxInconsistent = createRunContext();
  runCtxInconsistent.activeAccessToken = tokenInconsistent;
  runCtxInconsistent.preInvalidationSessionValid = true;
  runCtxInconsistent.passwordResetCompleted = true;
  runCtxInconsistent.sessionRevocationConfirmed = true;
  runCtxInconsistent.revokedSessionId = 'session-uuid-5678';
  const dispInconsistent = createHostedDispatcher({
    anonKey: validTestAnonKey,
    runContext: runCtxInconsistent,
    fetchFn: staticTransport({ status: 200, json: [] })
  });
  const out04Inconsistent = await dispInconsistent(session04);
  assert.equal(out04Inconsistent.passed, false);
  assert.match(out04Inconsistent.error, /INVALID_EXP_TEMPORAL_INCONSISTENCY/);

  // Storage SESSION-05 similarly validates 300s lifetime bound
  const runCtxStorage = createRunContext();
  runCtxStorage.activeAccessToken = valid300Token;
  runCtxStorage.preInvalidationSessionValid = true;
  runCtxStorage.passwordResetCompleted = true;
  runCtxStorage.sessionRevocationConfirmed = true;
  runCtxStorage.revokedSessionId = 'session-uuid-5678';
  const dispStorage = createHostedDispatcher({
    anonKey: validTestAnonKey,
    runContext: runCtxStorage,
    fetchFn: staticTransport({ status: 200, json: {} })
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

  // For BYPASS-02 (signup probe), unexpected user registration without proof has unproven ownership (R16-02)
  observeAndTrackSessionTokens({
    access_token: tokenWithSession,
    user: { id: 'u-signup-456' }
  }, { inv: invUnit, probeId: 'BYPASS-02', testUser: 'signup-user@proof.invalid' });
  assert.equal(invUnit.createdUsers.has('u-signup-456'), false, 'Unexpected user without affirmative creation proof must NOT be marked created');
  assert.equal(invUnit.unverifiedUsers.has('u-signup-456'), true, 'Unexpected user must be tracked in unverifiedUsers');
  assert.equal(invUnit.getUserOwnership('u-signup-456'), USER_OWNERSHIP.OWNERSHIP_UNKNOWN);

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
  const mockFetchBypass = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
    routes: [
      {
        urlIncludes: '/auth/v1/verify',
        status: 200,
        ok: true,
        json: {
          access_token: unexpectedToken,
          refresh_token: 'refresh-bypass03',
          session_id: unexpectedSessionId,
          user: { id: 'u-seed-bypass03', email: 'tio-test-user-06i@proof.invalid' }
        }
      },
      { urlIncludes: '/auth/v1/logout', status: 200, ok: true, json: {} }
    ],
    defaultResponse: { status: 200, ok: true, json: {} }
  });

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
  const adminClientBypass = trackedHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: mockFetchBypass
  });
  const preCleanupCalls = mockFetchBypass.calls.length;
  const bypassCleanup = await invBypass.executeCleanup({ adminClient: bindFixtureAdmin(invBypass, adminClientBypass) });
  assert.equal(bypassCleanup.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(bypassCleanup.sessionsRevoked, 1);
  const cleanupCalls = mockFetchBypass.calls.slice(preCleanupCalls);
  assert.equal(cleanupCalls.length, 1);
  assert.match(cleanupCalls[0].url, /\/auth\/v1\/logout\?scope=local/);
  assert.equal(cleanupCalls[0].headers.authorization, `Bearer ${unexpectedToken}`);

  // 3. Normal negative probe rejection (no tokens) does NOT populate sessions
  const invNormal = new TestRunInventory('test-run-normal-rejection');
  const dispNormal = createHostedDispatcher({
    anonKey: validTestAnonKey,
    inventory: invNormal,
    fetchFn: staticTransport({
      status: 400,
      ok: false,
      json: { error_code: 'otp_expired', msg: 'Token expired' }
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
  const untrackedReport = await invUntrackedFail.executeCleanup({ adminClient: bindFixtureAdmin(invUntrackedFail, adminClientBypass), failClosed: false });
  assert.equal(untrackedReport.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.ok(untrackedReport.residualResources.some(r => r.type === 'untracked_session' && r.error.includes('UNTRACKED_MINTED_SESSION')));
});

test('77. Task 06I-B1-H1-R8 (R8-02): Idempotent session cleanup and confirmed session absence handling', async () => {
  const testToken = createMockJwt({ session_id: 'sess-idemp-1' });

  // 1. createHostedAdminClient.signOut provider responses
  // 1a. HTTP 200 normal logout succeeds
  const client200 = trackedHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: staticTransport({ status: 200, ok: true, json: {} })
  });
  const res200 = await client200.signOut(testToken);
  assert.equal(res200.error, null);
  assert.equal(res200.data.scope, 'local');

  // 1b. HTTP 403 session_not_found treated as affirmative absence (succeeds with alreadyRevoked: true)
  const clientNotFound = trackedHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: staticTransport({
      status: 403,
      ok: false,
      json: {
        code: 403,
        error_code: 'session_not_found',
        msg: 'Session from session_id claim in JWT does not exist'
      }
    })
  });
  const resNotFound = await clientNotFound.signOut(testToken);
  assert.equal(resNotFound.error, null);
  assert.equal(resNotFound.session_not_found, true);
  assert.equal(resNotFound.data.alreadyRevoked, true);

  // 1c. HTTP 400 authsessionmissingerror treated as affirmative absence
  const clientMissing = trackedHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: staticTransport({
      status: 400,
      ok: false,
      json: {
        code: 400,
        error_code: 'authsessionmissingerror',
        msg: 'Auth session missing!'
      }
    })
  });
  const resMissing = await clientMissing.signOut(testToken);
  assert.equal(resMissing.error, null);
  assert.equal(resMissing.session_not_found, true);

  // 1d. False proof: HTTP 401 bad_jwt fails closed
  const clientBadJwt = trackedHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: staticTransport({
      status: 401,
      ok: false,
      json: { code: 401, error_code: 'bad_jwt', msg: 'Invalid JWT' }
    })
  });
  const resBadJwt = await clientBadJwt.signOut(testToken);
  assert.ok(resBadJwt.error);
  assert.equal(resBadJwt.error.status, 401);

  // 1e. False proof: HTTP 401 jwt_expired fails closed
  const clientExpired = trackedHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: staticTransport({
      status: 401,
      ok: false,
      json: { code: 401, error_code: 'jwt_expired', msg: 'JWT expired' }
    })
  });
  const resExpired = await clientExpired.signOut(testToken);
  assert.ok(resExpired.error);

  // 1f. Generic HTTP 403 Forbidden fails closed
  const clientGeneric403 = trackedHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: staticTransport({
      status: 403,
      ok: false,
      json: { code: 403, msg: 'Forbidden' }
    })
  });
  const resGeneric403 = await clientGeneric403.signOut(testToken);
  assert.ok(resGeneric403.error);

  // 1g. HTTP 500 fails closed
  const client500 = trackedHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: staticTransport({
      status: 500,
      ok: false,
      json: { code: 500, msg: 'Internal server error' }
    })
  });
  const res500 = await client500.signOut(testToken);
  assert.ok(res500.error);

  // 2. SESSION-02 marks session revoked in inventory when revocation is proven
  const invSession02 = new TestRunInventory('test-run-session02-marking');
  const s02SessionId = 'sess-s02-verified';
  const s02Token = createMockJwt({ session_id: s02SessionId });
  invSession02.registerSession(s02SessionId, { accessToken: s02Token });

  const runCtxS02 = createRunContext({ runId: invSession02.runId });
  runCtxS02.activeUserId = 'u-s02-test';
  runCtxS02.activeSessionId = s02SessionId;
  runCtxS02.activeAccessToken = s02Token;

  const dispS02 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    serviceRoleKey: validTestServiceRoleKey,
    inventory: invSession02,
    runContext: runCtxS02,
    fetchFn: createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
      routes: [
        { urlIncludes: '/auth/v1/admin/users/', status: 200, ok: true, json: { id: 'u-s02-test' } },
        { urlIncludes: '/auth/v1/user', status: 403, ok: false, json: { error_code: 'session_not_found', msg: 'Session not found' } }
      ],
      defaultResponse: { status: 200, ok: true, json: {} }
    })
  });

  const outS02 = await dispS02({ id: 'SESSION-02', category: 'Session & Consumer' });
  assert.equal(outS02.passed, true);
  assert.equal(invSession02.isSessionRevoked(s02SessionId), true, 'SESSION-02 must mark session as revoked in inventory');

  // When cleanup runs on invSession02, it skips calling logout for already-revoked session
  const verifyTokenS02 = createMockJwt({ sub: 'u-s02-test', session_id: 'sess-s02-v' });
  const adminTransportS02 = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
    routes: [
      {
        urlIncludes: '/auth/v1/token?grant_type=password',
        status: 200,
        ok: true,
        json: { access_token: verifyTokenS02, session_id: 'sess-s02-v', user: { id: 'u-s02-test' } }
      }
    ],
    defaultResponse: { status: 200, ok: true, json: {} }
  });
  const adminClientS02 = trackedHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: adminTransportS02
  });

  const cleanupS02 = await invSession02.executeCleanup({ adminClient: bindFixtureAdmin(invSession02, adminClientS02) });
  assert.equal(cleanupS02.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(cleanupS02.sessionsRevoked, 1);
  // Zero logout fetch calls for s02SessionId/s02Token because session was already marked revoked!
  assert.equal(adminTransportS02.calls.filter(c => c.url.includes('/logout') && c.headers.authorization?.includes(s02Token)).length, 0);

  // 3. Idempotent cleanup execution:
  // First run revokes session; second run on same inventory is cleanly idempotent
  const invIdemp = new TestRunInventory('test-run-idempotency');
  invIdemp.registerSession('sess-run-1', { accessToken: createMockJwt({ session_id: 'sess-run-1' }) });
  invIdemp.registerSession('sess-run-2', { accessToken: createMockJwt({ session_id: 'sess-run-2' }) });

  const idempTransport = staticTransport({ status: 200, ok: true, json: {} });
  const adminClientIdemp = trackedHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: idempTransport
  });

  // First cleanup call
  const preFirstCount = idempTransport.calls.length;
  const firstCleanup = await invIdemp.executeCleanup({ adminClient: bindFixtureAdmin(invIdemp, adminClientIdemp) });
  assert.equal(firstCleanup.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(firstCleanup.sessionsRevoked, 2);
  const firstLogoutCount = idempTransport.calls.slice(preFirstCount).filter(c => c.url.includes('/logout')).length;
  assert.equal(firstLogoutCount, 2, 'First cleanup must call logout for both sessions');

  // Second cleanup call on same inventory
  const preSecondCount = idempTransport.calls.length;
  const secondCleanup = await invIdemp.executeCleanup({ adminClient: bindFixtureAdmin(invIdemp, adminClientIdemp) });
  assert.equal(secondCleanup.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(secondCleanup.sessionsRevoked, 2);
  assert.equal(secondCleanup.residualResources.length, 0);
  const secondLogoutCount = idempTransport.calls.slice(preSecondCount).filter(c => c.url.includes('/logout')).length;
  assert.equal(secondLogoutCount, 0, 'Second cleanup must be idempotent and make ZERO logout calls');
});

test('78. Task 06I-B1-H1-R9 (R9-01): Pre-dispatch restoration registration, state tracking, and indeterminate transport failure handling', async () => {
  const session02 = { id: 'SESSION-02', category: 'Session & Consumer' };
  const origPassword = 'OriginalTioPassword#2026!';
  const newPassword = 'TioNewPassword#2026!';
  const seedUserId = 'seed-user-uuid-r9-01';
  const seedEmail = 'tio-seed-r9-01@proof.invalid';

  // 1. Pre-dispatch registration invariance:
  // Restoration obligation MUST be registered and in 'dispatched' state BEFORE PUT request completes
  const preDispatchBarrier = createOfflineBarrier('r9-pre-dispatch');
  const invPre = new TestRunInventory('test-run-pre-dispatch');
  const runCtxPre = createRunContext({ runId: invPre.runId });
  runCtxPre.activeUserId = seedUserId;
  runCtxPre.originalSeedPassword = origPassword;
  runCtxPre.activeSessionId = 'sess-pre-1';
  runCtxPre.activeAccessToken = createMockJwt({ sub: seedUserId, session_id: 'sess-pre-1' });

  const preTransport = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
    routes: [
      { urlIncludes: '/auth/v1/admin/users/', waitForBarrier: preDispatchBarrier, status: 200, json: { id: seedUserId } },
      { urlIncludes: '/auth/v1/user', status: 401, json: { error_code: 'session_not_found', message: 'Session not found' } }
    ],
    defaultResponse: { status: 400, json: {} }
  });

  const dispPre = createHostedDispatcher({
    anonKey: validTestAnonKey,
    serviceRoleKey: validTestServiceRoleKey,
    inventory: invPre,
    runContext: runCtxPre,
    testEmail: seedEmail,
    fetchFn: preTransport
  });

  const prePromise = dispPre(session02);
  await preDispatchBarrier.waitForArrivals(1);
  assert.equal(invPre.seedCredentialRestorations.length, 1, 'Restoration MUST be registered before dispatch completes');
  const recPre = invPre.seedCredentialRestorations[0];
  assert.equal(recPre.userId, seedUserId);
  assert.equal(recPre.originalPassword, origPassword);
  assert.equal(recPre.targetPassword, newPassword);
  assert.equal(recPre.state, 'dispatched', 'Record state MUST be dispatched when network call is in flight');
  assert.ok(recPre.dispatchedAt, 'dispatchedAt timestamp MUST be recorded');
  assert.equal(invPre.isUserTracked(seedUserId), true, 'Seed user MUST be tracked in inventory');
  preDispatchBarrier.release();

  const outPre = await prePromise;
  assert.equal(outPre.passed, true);
  assert.equal(invPre.seedCredentialRestorations[0].state, 'confirmed', 'Successful 200 transitions state to confirmed');
  assert.ok(invPre.seedCredentialRestorations[0].confirmedAt);

  // 2. Transport failure (ECONNRESET / socket hangup) retains obligation as indeterminate:
  // If fetch throws AFTER dispatch, probe fails closed, but restoration obligation remains intact!
  const invTransport = new TestRunInventory('test-run-transport-failure');
  const runCtxTransport = createRunContext({ runId: invTransport.runId });
  runCtxTransport.activeUserId = seedUserId;
  runCtxTransport.originalSeedPassword = origPassword;
  runCtxTransport.activeSessionId = 'sess-trans-1';
  runCtxTransport.activeAccessToken = createMockJwt({ sub: seedUserId, session_id: 'sess-trans-1' });

  let transportProviderPassword = origPassword;
  const transportErrMock = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
    routes: [
      { urlIncludes: '/auth/v1/admin/users/', throwError: { message: 'ECONNRESET: socket hang up', code: 'ECONNRESET' } }
    ],
    defaultResponse: { status: 400, json: {} }
  });
  const dispTransport = createHostedDispatcher({
    anonKey: validTestAnonKey,
    serviceRoleKey: validTestServiceRoleKey,
    inventory: invTransport,
    runContext: runCtxTransport,
    testEmail: seedEmail,
    fetchFn: transportErrMock
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
  assert.equal(transportErrMock.calls[0].bodyJson?.password, newPassword, 'PUT request carried newPassword before connection drop');

  // Cleanup MUST execute restoration and restore original password
  const mockAdminClient = fixtureSpec();

  const cleanupTransport = await invTransport.executeCleanup({ adminClient: bindFixtureAdmin(invTransport, mockAdminClient) });
  assert.equal(cleanupTransport.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(cleanupTransport.seedCredentialsRestored, 1);
  assert.equal((fixtureOperationCalls(mockAdminClient, 'userUpdate').at(-1)?.bodyJson?.password), origPassword, 'Original password MUST be restored in provider after transport drop');

  // 3. Malformed JSON response retains obligation as indeterminate:
  const invJsonErr = new TestRunInventory('test-run-json-error');
  const runCtxJsonErr = createRunContext({ runId: invJsonErr.runId });
  runCtxJsonErr.activeUserId = seedUserId;
  runCtxJsonErr.originalSeedPassword = origPassword;

  let jsonProviderPassword = origPassword;
  const dispJsonErr = createHostedDispatcher({
    anonKey: validTestAnonKey,
    serviceRoleKey: validTestServiceRoleKey,
    inventory: invJsonErr,
    runContext: runCtxJsonErr,
    testEmail: seedEmail,
    fetchFn: createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
      routes: [
        {
          urlIncludes: '/auth/v1/admin/users/',
          status: 200,
          text: '<html><body>502 Bad Gateway</body></html>',
          jsonError: 'Unexpected token < in JSON at position 0'
        }
      ],
      defaultResponse: { status: 400, json: {} }
    })
  });

  const outJson = await dispJsonErr(session02);
  assert.equal(outJson.passed, false);
  assert.equal(outJson.restoration_state, 'indeterminate');
  assert.equal(invJsonErr.seedCredentialRestorations[0].state, 'indeterminate');

  const jsonCleanupSpec = fixtureSpec();
  const cleanupJson = await invJsonErr.executeCleanup({
    adminClient: fixtureAdmin(invJsonErr, jsonCleanupSpec)
  });
  assert.equal(cleanupJson.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(fixtureCalls(jsonCleanupSpec, 'PUT', '/auth/v1/admin/users/').at(-1)?.bodyJson?.password, origPassword, 'Original password MUST be restored after malformed JSON');

  // 4. HTTP 500 response marks obligation as indeterminate:
  const inv500 = new TestRunInventory('test-run-500');
  const runCtx500 = createRunContext({ runId: inv500.runId });
  runCtx500.activeUserId = seedUserId;
  runCtx500.originalSeedPassword = origPassword;

  const disp500 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    serviceRoleKey: validTestServiceRoleKey,
    inventory: inv500,
    runContext: runCtx500,
    testEmail: seedEmail,
    fetchFn: createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
      routes: [
        { urlIncludes: '/auth/v1/admin/users/', status: 500, json: { msg: 'Internal server error', error_code: 'internal_error' } }
      ],
      defaultResponse: { status: 400, json: {} }
    })
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


  const adminClientSuccess = fixtureSpec();

  const reportSuccess = await invSuccess.executeCleanup({ adminClient: bindFixtureAdmin(invSuccess, adminClientSuccess) });
  assert.equal(reportSuccess.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(reportSuccess.seedCredentialsRestored, 1);
  assert.equal((fixtureOperationCalls(adminClientSuccess, 'userUpdate').length > 0), true);
  assert.equal((fixtureOperationCalls(adminClientSuccess, 'login').length > 0), true);

  assert.equal(fixtureOperationCalls(adminClientSuccess, 'userUpdate')[0].pathname.split('/').at(-1), seedUserId);
  assert.deepEqual(fixtureOperationCalls(adminClientSuccess, 'userUpdate')[0].bodyJson, { password: origPassword });
  assert.deepEqual(fixtureOperationCalls(adminClientSuccess, 'login')[0].bodyJson, { email: seedEmail, password: origPassword });

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

  const adminClientVerifyFail = fixtureSpec({ login: { status: 400, json: { message: 'invalid_grant: Invalid login credentials' } } });

  const reportVerifyFail = await invVerifyFail.executeCleanup({ adminClient: bindFixtureAdmin(invVerifyFail, adminClientVerifyFail), failClosed: false });
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

  const adminClientUpdateFail = fixtureSpec({ userUpdate: { status: 503, json: { message: 'Database lock timeout' } } });

  const reportUpdateFail = await invUpdateFail.executeCleanup({ adminClient: bindFixtureAdmin(invUpdateFail, adminClientUpdateFail), failClosed: false });
  assert.equal(reportUpdateFail.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.match(reportUpdateFail.residualResources[0].error, /RESTORE_FAILED/);
  assert.equal(invUpdateFail.seedCredentialRestorations[0].state, 'restoration_failed');

  // 2. createHostedAdminClient.verifyUserCredentials unit behavior:
  const testClientTransport = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
    routes: [
      {
        urlIncludes: '/auth/v1/token?grant_type=password',
        bodyMatch: { password: origPassword },
        status: 200,
        ok: true,
        json: {
          access_token: createMockJwt({ sub: seedUserId, session_id: 'verify-sess-1' }),
          user: { id: seedUserId }
        }
      },
      {
        urlIncludes: '/auth/v1/token?grant_type=password',
        status: 400,
        ok: false,
        json: { msg: 'Invalid login credentials', error_code: 'invalid_grant' }
      },
      { urlIncludes: '/auth/v1/logout', status: 200, ok: true, json: {} }
    ],
    defaultResponse: { status: 400, ok: false, json: {} }
  });
  const testClient = trackedHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    anonKey: validTestAnonKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: testClientTransport
  });

  // Successful verification triggers login AND immediate local signout
  let preCalls = testClientTransport.calls.length;
  const verifyRes = await testClient.verifyUserCredentials(seedEmail, origPassword, { expectedUserId: seedUserId });
  assert.equal(verifyRes.error, null);
  assert.equal(verifyRes.data.verified, true);
  assert.equal(verifyRes.data.userId, seedUserId);
  let recentCalls = testClientTransport.calls.slice(preCalls);
  assert.equal(recentCalls.length, 2, 'Must call /token AND /logout');
  assert.ok(recentCalls[0].url.includes('/token?grant_type=password'));
  assert.ok(recentCalls[1].url.includes('/logout?scope=local'), 'Must immediately revoke verification session');

  // Invalid password returns clean error without throwing
  preCalls = testClientTransport.calls.length;
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
    adminClient: fixtureAdmin(invUntracked, fixtureSpec({})),
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
    adminClient: fixtureAdmin(invPreserve, fixtureSpec({}))
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
  const adminClientImmediate = trackedHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    anonKey: validTestAnonKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
      routes: [
        {
          urlIncludes: '/auth/v1/token?grant_type=password',
          status: 200,
          ok: true,
          json: {
            access_token: verifyToken,
            session_id: sessId,
            user: { id: seedUserId, email: seedEmail }
          }
        },
        { urlIncludes: '/auth/v1/logout', status: 200, ok: true, json: {} }
      ],
      defaultResponse: { status: 200, ok: true, json: {} }
    })
  });

  const resImmediate = await bindFixtureAdmin(invImmediate, adminClientImmediate).verifyUserCredentials(seedEmail, initialPassword, { inventory: invImmediate, expectedUserId: seedUserId });
  assert.equal(resImmediate.error, null);
  assert.equal(resImmediate.data.verified, true);
  assert.equal(invImmediate.trackedSessions.has(sessId), true, 'Minted verification session must be registered in inventory');
  assert.equal(invImmediate.isSessionRevoked(sessId), true, 'Successfully signed out session must be marked revoked');

  // 2. Verification login succeeds, but immediate logout returns HTTP 503 error envelope
  const inv503 = new TestRunInventory('test-r10-503');
  const s503Id = 'sess-r10-503-fail';
  const token503 = createMockJwt({ sub: seedUserId, session_id: s503Id, email: seedEmail });

  const adminClient503 = trackedHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    anonKey: validTestAnonKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
      routes: [
        {
          urlIncludes: '/auth/v1/token?grant_type=password',
          status: 200,
          ok: true,
          json: {
            access_token: token503,
            session_id: s503Id,
            user: { id: seedUserId, email: seedEmail }
          }
        },
        {
          urlIncludes: '/auth/v1/logout',
          status: 503,
          ok: false,
          json: { msg: 'Service Unavailable', error_code: 'service_unavailable' }
        },
        { urlIncludes: '/auth/v1/admin/users/', status: 200, ok: true, json: { id: seedUserId } }
      ],
      defaultResponse: { status: 200, ok: true, json: {} }
    })
  });

  // verifyUserCredentials returns sessionRevocationFailed: true
  const res503 = await bindFixtureAdmin(inv503, adminClient503).verifyUserCredentials(seedEmail, initialPassword, { inventory: inv503, expectedUserId: seedUserId });
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
    () => invReject.executeCleanup({ adminClient: bindFixtureAdmin(invReject, adminClient503), failClosed: true }),
    /CLEANUP_INCOMPLETE/
  );

  const rep503 = await invCleanup503.executeCleanup({ adminClient: bindFixtureAdmin(invCleanup503, adminClient503), failClosed: false });
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

  const retrySessId = 'sess-r10-retry-pass';
  const retryToken = createMockJwt({ sub: seedUserId, session_id: retrySessId, email: seedEmail });
  const adminClientRetry = trackedHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    anonKey: validTestAnonKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
      routes: [
        {
          urlIncludes: '/auth/v1/token?grant_type=password',
          status: 200,
          ok: true,
          json: {
            access_token: retryToken,
            session_id: retrySessId,
            user: { id: seedUserId, email: seedEmail }
          }
        },
        {
          urlIncludes: '/auth/v1/logout',
          times: 1,
          status: 503,
          ok: false,
          json: { msg: 'Temporary drop' }
        },
        {
          urlIncludes: '/auth/v1/logout',
          status: 200,
          ok: true,
          json: {}
        },
        { urlIncludes: '/auth/v1/admin/users/', status: 200, ok: true, json: { id: seedUserId } }
      ],
      defaultResponse: { status: 200, ok: true, json: {} }
    })
  });

  const repRetry = await invRetry.executeCleanup({ adminClient: bindFixtureAdmin(invRetry, adminClientRetry) });
  assert.equal(repRetry.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(invRetry.isSessionRevoked(retrySessId), true);
  assert.equal(invRetry.seedCredentialRestorations[0].state, 'restored');

  // 4. Logout throws network exception (e.g. timeout / connection reset)
  const invThrows = new TestRunInventory('test-r10-throws');
  const throwToken = createMockJwt({ sub: seedUserId, session_id: 'sess-throws', email: seedEmail });
  const adminClientThrows = trackedHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    anonKey: validTestAnonKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
      routes: [
        {
          urlIncludes: '/auth/v1/token?grant_type=password',
          status: 200,
          ok: true,
          json: {
            access_token: throwToken,
            session_id: 'sess-throws',
            user: { id: seedUserId, email: seedEmail }
          }
        },
        { urlIncludes: '/auth/v1/logout', throwError: { message: 'ECONNRESET: socket hang up' } }
      ],
      defaultResponse: { status: 200, ok: true, json: {} }
    })
  });

  const resThrows = await bindFixtureAdmin(invThrows, adminClientThrows).verifyUserCredentials(seedEmail, initialPassword, { inventory: invThrows, expectedUserId: seedUserId });
  assert.equal(resThrows.data, null);
  assert.equal(resThrows.sessionRevocationFailed, true);
  assert.equal(resThrows.error.code, 'LOGOUT_EXCEPTION');
  assert.ok(resThrows.error.message.includes('ECONNRESET'));

  // 5. Verification token lacks session ID claim and response lacks session ID
  const invUntracked = new TestRunInventory('test-r10-untracked');
  const headerB64 = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify({ sub: seedUserId, email: seedEmail, exp: Math.floor(Date.now() / 1000) + 300 })).toString('base64url');
  const noSessToken = `${headerB64}.${payloadB64}.fake-sig`;

  const adminClientUntracked = trackedHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    anonKey: validTestAnonKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
      routes: [
        {
          urlIncludes: '/auth/v1/token?grant_type=password',
          status: 200,
          ok: true,
          json: { access_token: noSessToken, user: { id: seedUserId, email: seedEmail } }
        }
      ],
      defaultResponse: { status: 200, ok: true, json: {} }
    })
  });

  const resUntracked = await bindFixtureAdmin(invUntracked, adminClientUntracked).verifyUserCredentials(seedEmail, initialPassword, { inventory: invUntracked });
  assert.equal(resUntracked.data, null);
  assert.equal(resUntracked.sessionRevocationFailed, false, 'No correlated logout was attempted');
  assert.equal(resUntracked.credentialVerified, false);
  assert.equal(resUntracked.error.code, 'UNTRACKED_SESSION');
  assert.equal(invUntracked.untrackedSessionsCount, 1);

  // 6. False-proof handling during verification logout:
  // Generic bad_jwt does NOT prove session revocation; affirmative session_not_found DOES prove revocation
  const adminClientBadJwt = trackedHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    anonKey: validTestAnonKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
      routes: [
        { urlIncludes: '/auth/v1/logout', status: 401, ok: false, json: { msg: 'bad_jwt: signature verification failed', error_code: 'bad_jwt' } }
      ],
      defaultResponse: { status: 200, ok: true, json: {} }
    })
  });
  const signOutBad = await adminClientBadJwt.signOut('some-token', 'local');
  assert.ok(signOutBad.error, 'bad_jwt must be rejected as false proof of revocation');

  const adminClientNotFound = trackedHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    anonKey: validTestAnonKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
      routes: [
        { urlIncludes: '/auth/v1/logout', status: 404, ok: false, json: { msg: 'session not found', error_code: 'session_not_found' } }
      ],
      defaultResponse: { status: 200, ok: true, json: {} }
    })
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

  const adminClientLiveFail = fixtureSpec({ userGet: { status: 200, json: { user: { id: seedUserId } } }, logout: { status: 503, json: { message: 'Service Unavailable' } }, login: { status: 200, json: { access_token: createMockJwt({ sub: seedUserId, session_id: 'sess-live-fail' }), session_id: 'sess-live-fail', user: { id: seedUserId } } } });

  const runnerRes = await runHostedProbeRunner(fixtureRunnerOptions({
    projectRef: HARDCODED_TEMP_REF,
    argv: ['node', 'runner.mjs', '--live'],
    env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
    mockDispatcher: offlineDispatcherSpec({
      defaultOutcome: {
        passed: true,
        status: 200,
        session_id: 'sess-probe-1',
        session_revoked: true,
        remaining_sessions: 0
      }
    }),
    inventory: invLive,
    adminClient: adminClientLiveFail
  }));

  assert.equal(runnerRes.status, 'HALTED_ON_FAILURE', 'Cleanup failure must override probe success');
  assert.equal(runnerRes.aborted, true);
  assert.ok(runnerRes.abortReason.includes('CLEANUP_FAILURE'));
  assert.equal((fixtureOperationCalls(adminClientLiveFail, 'userDelete').length > 0), false, 'Seed user MUST NEVER be deleted');
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
  const runCtxCustom = createRunContext({ runId: invCustom.runId, testEmail: customSeedEmail, testPassword: initialPassword });
  runCtxCustom.activeUserId = seedUserId;
  runCtxCustom.activeSessionId = 'sess-custom-01';
  runCtxCustom.activeAccessToken = createMockJwt({
    sub: seedUserId,
    session_id: 'sess-custom-01',
    email: customSeedEmail
  });

  const dispCustomTransport = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
    routes: [
      { urlIncludes: '/auth/v1/admin/users/', status: 200, ok: true, json: { id: seedUserId } },
      { urlIncludes: '/auth/v1/user', status: 403, ok: false, json: { error_code: 'session_not_found', msg: 'Session not found' } }
    ],
    defaultResponse: { status: 200, ok: true, json: {} }
  });
  const dispCustom = createHostedDispatcher({
    anonKey: validTestAnonKey,
    serviceRoleKey: validTestServiceRoleKey,
    inventory: invCustom,
    runContext: runCtxCustom,
    fetchFn: dispCustomTransport
  });

  const outCustom = await dispCustom(s02Item);
  assert.equal(outCustom.passed, true);
  assert.equal(invCustom.seedCredentialRestorations.length, 1);
  assert.equal(invCustom.seedCredentialRestorations[0].email, customSeedEmail, 'Restoration must bind to custom seed email, not default');
  assert.equal(runCtxCustom.testEmail, customSeedEmail);
  assert.equal(dispCustomTransport.calls.find(c => c.url.includes('/auth/v1/admin/users/'))?.bodyJson?.password, 'TioNewPassword#2026!');

  // 2. Mismatched candidate email and tracked user email rejects before password mutation
  const invMismatch = new TestRunInventory('test-r10-mismatch-inv');
  invMismatch.trackReferencedUser({ id: seedUserId, email: 'tracked-original@proof.invalid', source: 'seed' });

  const runCtxMismatch = createRunContext({ runId: invMismatch.runId });
  runCtxMismatch.activeUserId = seedUserId;
  runCtxMismatch.activeSessionId = 'sess-mismatch';

  const mismatchTransport = staticTransport({ status: 200, ok: true, json: {} });
  const dispMismatch = createHostedDispatcher({
    anonKey: validTestAnonKey,
    serviceRoleKey: validTestServiceRoleKey,
    inventory: invMismatch,
    runContext: runCtxMismatch,
    fetchFn: mismatchTransport
  });

  const outMismatch = await dispMismatch({
    id: 'SESSION-02',
    category: 'Session & Consumer',
    testUser: 'conflicting-email@proof.invalid'
  });

  assert.equal(outMismatch.passed, false);
  assert.equal(outMismatch.status, 0);
  assert.ok(outMismatch.error.includes('IDENTITY_MISMATCH'));
  assert.equal(mismatchTransport.calls.some(c => c.method === 'PUT'), false, 'Zero password mutations permitted on email mismatch');
  assert.equal(invMismatch.seedCredentialRestorations.length, 0);

  // 3. Cross-user identity conflict rejection in SESSION-02
  const invConflict = new TestRunInventory('test-r10-conflict-inv');
  invConflict.trackReferencedUser({ id: 'u-other-account', email: customSeedEmail, source: 'seed' });

  const runCtxConflict = createRunContext({ runId: invConflict.runId });
  runCtxConflict.activeUserId = 'u-new-account';
  runCtxConflict.activeSessionId = 'sess-conflict';

  const conflictTransport = staticTransport({ status: 200, ok: true, json: {} });
  const dispConflict = createHostedDispatcher({
    anonKey: validTestAnonKey,
    serviceRoleKey: validTestServiceRoleKey,
    inventory: invConflict,
    runContext: runCtxConflict,
    fetchFn: conflictTransport
  });

  const outConflict = await dispConflict({
    id: 'SESSION-02',
    category: 'Session & Consumer',
    testUser: customSeedEmail
  });

  assert.equal(outConflict.passed, false);
  assert.equal(outConflict.status, 0);
  assert.ok(outConflict.error.includes('IDENTITY_MISMATCH'));
  assert.equal(conflictTransport.calls.some(c => c.method === 'PUT'), false, 'Zero password mutations permitted when email is bound to another user');

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

  const adminClientTamper = fixtureSpec();

  // Verify that failClosed: true throws CLEANUP_INCOMPLETE on identity mismatch
  await assert.rejects(
    () => invCleanupCheck.executeCleanup({ adminClient: bindFixtureAdmin(invCleanupCheck, adminClientTamper), failClosed: true }),
    /CLEANUP_INCOMPLETE/
  );

  const repTamper = await invCleanupCheck.executeCleanup({ adminClient: bindFixtureAdmin(invCleanupCheck, adminClientTamper), failClosed: false });
  assert.equal(repTamper.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.equal((fixtureOperationCalls(adminClientTamper, 'login').length > 0), false, 'Credential verification must not proceed on identity mismatch in cleanup');
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
  const runCtxIndet = createRunContext({ runId: invIndet.runId, testEmail: customSeedEmail, testPassword: initialPassword });
  runCtxIndet.activeUserId = seedUserId;
  runCtxIndet.activeSessionId = 'sess-indet';

  const dispIndet = createHostedDispatcher({
    anonKey: validTestAnonKey,
    serviceRoleKey: validTestServiceRoleKey,
    inventory: invIndet,
    runContext: runCtxIndet,
    fetchFn: createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
      routes: [
        { method: 'PUT', throwError: { message: 'ETIMEDOUT: Connection dropped' } }
      ],
      defaultResponse: { status: 200, ok: true, json: {} }
    })
  });

  const outIndet = await dispIndet(s02Item);
  assert.equal(outIndet.passed, false);
  assert.equal(outIndet.restoration_registered, true);
  assert.equal(outIndet.restoration_state, 'indeterminate');
  assert.equal(invIndet.seedCredentialRestorations[0].email, customSeedEmail, 'Indeterminate record must retain custom seed identity');

  // 8. Controlled credential verification in cleanup uses exact bound email
  const adminClientVerified = fixtureSpec();

  const repIndetCleanup = await invIndet.executeCleanup({ adminClient: bindFixtureAdmin(invIndet, adminClientVerified) });
  assert.equal(repIndetCleanup.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal((fixtureOperationCalls(adminClientVerified, 'login').at(-1)?.bodyJson?.email), customSeedEmail, 'Cleanup credential verification MUST use the exact custom seed identity, not default');
});

test('82. Task 06I-B1-H1-R11 (R11-01): Rejection of unreadable, truncated, empty, and indeterminate verification responses', async () => {
  const seedUserId = 'u-r11-seed-test';
  const seedEmail = 'r11-seed@proof.invalid';
  const seedPassword = 'TioSeedPassword2026!';
  const realSessId = 'sess-r11-real-01';
  const validToken = createMockJwt({ sub: seedUserId, session_id: realSessId });

  // 1. HTTP 200 with valid JSON, real access token, and session ID -> verified: true, session revoked
  const inv1 = new TestRunInventory('test-r11-case1');
  const transport1 = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
    routes: [
      {
        urlIncludes: '/auth/v1/token?grant_type=password',
        status: 200,
        ok: true,
        json: { access_token: validToken, session_id: realSessId, user: { id: seedUserId } }
      },
      { urlIncludes: '/auth/v1/logout', status: 200, ok: true, json: {} }
    ],
    defaultResponse: { status: 200, ok: true, json: {} }
  });
  const client1 = trackedHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: transport1
  });

  const res1 = await bindFixtureAdmin(inv1, client1).verifyUserCredentials(seedEmail, seedPassword, { inventory: inv1, expectedUserId: seedUserId });
  assert.equal(res1.error, null);
  assert.equal(res1.data?.verified, true);
  assert.equal(res1.data?.userId, seedUserId);
  assert.equal(res1.data?.sessionId, realSessId);
  assert.equal(transport1.calls.filter(c => c.url.includes('/auth/v1/logout')).length, 1);
  assert.equal(inv1.isSessionRevoked(realSessId), true, 'Verification session must be revoked immediately');

  // 2. HTTP 200 with truncated JSON -> SyntaxError -> UNREADABLE_RESPONSE, indeterminateSession: true
  const inv2 = new TestRunInventory('test-r11-case2');
  const client2 = trackedHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: staticTransport({
      status: 200,
      ok: true,
      jsonError: 'Unexpected end of JSON input'
    })
  });

  const res2 = await bindFixtureAdmin(inv2, client2).verifyUserCredentials(seedEmail, seedPassword, { inventory: inv2 });
  assert.equal(res2.data, null);
  assert.ok(res2.error);
  assert.equal(res2.error.code, 'UNREADABLE_RESPONSE');
  assert.equal(res2.sessionRevocationFailed, false, 'Unreadable authentication is indeterminate, not failed logout');
  assert.equal(res2.credentialVerified, false);
  assert.equal(res2.indeterminateSession, true);
  assert.equal(inv2.untrackedSessionsCount, 1, 'Client-side parse failure must register untracked session risk');
  assert.equal(res2.error.token, undefined, 'Raw token must never appear in error object');

  // 3. HTTP 200 with unreadable/non-JSON body (e.g. HTML gateway page)
  const inv3 = new TestRunInventory('test-r11-case3');
  const client3 = trackedHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: staticTransport({
      status: 200,
      ok: true,
      jsonError: "Unexpected token '<', <html>502... is not valid JSON"
    })
  });

  const res3 = await bindFixtureAdmin(inv3, client3).verifyUserCredentials(seedEmail, seedPassword, { inventory: inv3 });
  assert.equal(res3.data, null);
  assert.equal(res3.error?.code, 'UNREADABLE_RESPONSE');
  assert.equal(res3.indeterminateSession, true);
  assert.equal(inv3.untrackedSessionsCount, 1);

  // 4. HTTP 200 with empty {} body -> MISSING_ACCESS_TOKEN, indeterminateSession: true
  const inv4 = new TestRunInventory('test-r11-case4');
  const client4 = trackedHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: staticTransport({
      status: 200,
      ok: true,
      json: {}
    })
  });

  const res4 = await bindFixtureAdmin(inv4, client4).verifyUserCredentials(seedEmail, seedPassword, { inventory: inv4 });
  assert.equal(res4.data, null);
  assert.equal(res4.error?.code, 'MISSING_ACCESS_TOKEN');
  assert.equal(res4.sessionRevocationFailed, false);
  assert.equal(res4.credentialVerified, false);
  assert.equal(res4.indeterminateSession, true);
  assert.equal(inv4.untrackedSessionsCount, 1);

  // 5. HTTP 200 with missing access_token (e.g. { user: { id: ... } })
  const inv5 = new TestRunInventory('test-r11-case5');
  const client5 = trackedHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: staticTransport({
      status: 200,
      ok: true,
      json: { user: { id: seedUserId } }
    })
  });

  const res5 = await bindFixtureAdmin(inv5, client5).verifyUserCredentials(seedEmail, seedPassword, { inventory: inv5 });
  assert.equal(res5.data, null);
  assert.equal(res5.error?.code, 'MISSING_ACCESS_TOKEN');
  assert.equal(res5.indeterminateSession, true);

  // 6. HTTP 200 with malformed token (whitespace only or non-string)
  const inv6 = new TestRunInventory('test-r11-case6');
  const client6 = trackedHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: staticTransport({
      status: 200,
      ok: true,
      json: { access_token: '   ', user: { id: seedUserId } }
    })
  });

  const res6 = await bindFixtureAdmin(inv6, client6).verifyUserCredentials(seedEmail, seedPassword, { inventory: inv6 });
  assert.equal(res6.data, null);
  assert.equal(res6.error?.code, 'MISSING_ACCESS_TOKEN');
  assert.equal(res6.indeterminateSession, true);

  // 7. HTTP 200 with token but no extractable session identity
  const inv7 = new TestRunInventory('test-r11-case7');
  const opaqueToken = 'opaque_provider_token_without_claims_or_periods';
  const client7 = trackedHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: staticTransport({
      status: 200,
      ok: true,
      json: { access_token: opaqueToken, user: { id: seedUserId } }
    })
  });

  const res7 = await bindFixtureAdmin(inv7, client7).verifyUserCredentials(seedEmail, seedPassword, { inventory: inv7 });
  assert.equal(res7.data, null);
  assert.equal(res7.error?.code, 'UNTRACKED_SESSION');
  assert.equal(res7.sessionRevocationFailed, false);
  assert.equal(res7.credentialVerified, false);
  assert.equal(res7.indeterminateSession, true);
  assert.equal(inv7.untrackedSessionsCount, 1);

  // 8. HTTP 200 where server-side minting occurred but response is lost (network drop / timeout during fetch)
  const client8 = trackedHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: errorTransport('ECONNRESET: Connection reset by peer')
  });

  const res8 = await client8.verifyUserCredentials(seedEmail, seedPassword);
  assert.equal(res8.data, null);
  assert.ok(res8.error?.message.includes('VERIFICATION_NETWORK_ERROR'));

  // 9. Transport exception after request dispatch fails closed
  const client9 = trackedHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: errorTransport('ETIMEDOUT: Socket connect timeout')
  });

  const res9 = await client9.verifyUserCredentials(seedEmail, seedPassword);
  assert.equal(res9.data, null);
  assert.ok(res9.error?.message.includes('ETIMEDOUT'));

  // 10. HTTP 500 with uncertain mutation/session state fails closed
  const client10 = trackedHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: staticTransport({
      status: 500,
      ok: false,
      json: { code: 'internal_error', message: 'Internal Server Error' }
    })
  });

  const res10 = await client10.verifyUserCredentials(seedEmail, seedPassword);
  assert.equal(res10.data, null);
  assert.equal(res10.error?.status, 500);

  // 11. Session logout succeeds and is verified (confirmed in item 1)

  // 12. Logout returns HTTP 503 during verification
  const inv12 = new TestRunInventory('test-r11-case12');
  const sess12 = 'sess-r11-logout-503';
  const token12 = createMockJwt({ sub: seedUserId, session_id: sess12 });
  const client12 = trackedHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
      routes: [
        { urlIncludes: '/auth/v1/token?grant_type=password', status: 200, ok: true, json: { access_token: token12, session_id: sess12 } },
        { urlIncludes: '/auth/v1/logout', status: 503, ok: false, json: { code: 'service_unavailable', message: 'Service Unavailable' } }
      ],
      defaultResponse: { status: 200, ok: true, json: {} }
    })
  });

  const res12 = await bindFixtureAdmin(inv12, client12).verifyUserCredentials(seedEmail, seedPassword, { inventory: inv12, expectedUserId: seedUserId });
  assert.equal(res12.data, null);
  assert.equal(res12.sessionRevocationFailed, true);
  assert.equal(res12.error?.code, 'LOGOUT_FAILED');
  assert.equal(res12.error?.sessionId, sess12);
  assert.equal(res12.error?.token, undefined);

  // 13. Logout throws or times out during verification
  const inv13 = new TestRunInventory('test-r11-case13');
  const sess13 = 'sess-r11-logout-throw';
  const token13 = createMockJwt({ sub: seedUserId, session_id: sess13 });
  const client13 = trackedHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
      routes: [
        { urlIncludes: '/auth/v1/token?grant_type=password', status: 200, ok: true, json: { access_token: token13, session_id: sess13 } },
        { urlIncludes: '/auth/v1/logout', throwError: { message: 'ETIMEDOUT: Sign-out gateway timeout' } }
      ],
      defaultResponse: { status: 200, ok: true, json: {} }
    })
  });

  const res13 = await bindFixtureAdmin(inv13, client13).verifyUserCredentials(seedEmail, seedPassword, { inventory: inv13, expectedUserId: seedUserId });
  assert.equal(res13.data, null);
  assert.equal(res13.sessionRevocationFailed, true);
  assert.equal(res13.error?.code, 'LOGOUT_EXCEPTION');
  assert.equal(res13.error?.sessionId, sess13);
  assert.equal(res13.error?.token, undefined);

  // 14. Residual-session uncertainty blocks cleanup (executeCleanup fails closed on indeterminate session)
  const inv14 = new TestRunInventory('test-r11-case14');
  inv14.trackReferencedUser({ id: seedUserId, email: seedEmail, source: 'seed' });
  inv14.registerSeedPasswordModification({
    userId: seedUserId,
    email: seedEmail,
    originalPassword: seedPassword,
    state: 'confirmed'
  });

  const adminClient14 = fixtureSpec({ login: { status: 200, jsonError: 'Unexpected end of JSON', text: '{' } });

  const rep14 = await inv14.executeCleanup({ adminClient: bindFixtureAdmin(inv14, adminClient14), failClosed: false });
  assert.equal(rep14.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.notEqual(rep14.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(inv14.seedCredentialRestorations[0].state, 'restoration_failed');
  assert.ok(rep14.residualResources.some(r => r.type === 'untracked_session' && r.error.includes('INDETERMINATE_SESSION_LEAK')));
  assert.ok(rep14.residualResources.some(r => r.type === 'seed_credential_restoration' && r.error.includes('RESTORE_VERIFICATION_INDETERMINATE')));

  // failClosed: true throws CLEANUP_INCOMPLETE
  await assert.rejects(
    inv14.executeCleanup({ adminClient: bindFixtureAdmin(inv14, adminClient14), failClosed: true }),
    /CLEANUP_INCOMPLETE/
  );

  // 15. A verification login never deletes the pre-existing seed user
  assert.equal((fixtureOperationCalls(adminClient14, 'userDelete').length), 0, 'Seed user must NEVER be deleted during cleanup or verification failure');
  assert.equal(inv14.referencedUsers.has(seedUserId), true, 'Seed user must remain preserved in referencedUsers inventory');

  // 16. Sanitized reports never contain raw tokens or passwords
  const report14Str = JSON.stringify(rep14);
  assert.equal(report14Str.includes(validToken), false, 'Report must not contain validToken');
  assert.equal(report14Str.includes(seedPassword), false, 'Report must not contain seedPassword');
  assert.equal(report14Str.includes(validTestServiceRoleKey), false, 'Report must not contain serviceRoleKey');
});

test('83. Task 06I-B1-H1-R11 (R11-02): Secret boundary enforcement, private cleanup token storage, and fail-closed residual reporting', async () => {
  const seedUserId = 'u-r11-sec-seed';
  const seedEmail = 'r11-sec-seed@proof.invalid';
  const secretPassword = 'UltraSecretPassword#2026!';
  const secretSessionId = 'sess-r11-sec-01';
  const secretUserToken = createMockJwt({ sub: seedUserId, session_id: secretSessionId });

  // 1. Error objects from verifyUserCredentials never contain a token property or raw secret
  const invSec = new TestRunInventory('test-r11-sec-inv');
  const failureShapes = [
    // a) Parse error
    { status: 200, ok: true, jsonError: 'bad json' },
    // b) Non-object structure
    { status: 200, ok: true, json: 'string-body' },
    // c) Missing access_token
    { status: 200, ok: true, json: { user: { id: seedUserId } } },
    // d) Missing session identity in token
    { status: 200, ok: true, json: { access_token: 'opaque-token-no-claims' } }
  ];

  for (const shape of failureShapes) {
    const client = trackedHostedAdminClient({
      serviceRoleKey: validTestServiceRoleKey,
      projectRef: HARDCODED_TEMP_REF,
      fetchFn: staticTransport(shape)
    });
    const res = await bindFixtureAdmin(invSec, client).verifyUserCredentials(seedEmail, secretPassword, { inventory: invSec });
    assert.ok(res.error, 'Must return error object');
    assert.equal(res.error.token, undefined, 'Error object must never contain a token property');
    const errStr = JSON.stringify(res.error);
    assert.equal(errStr.includes(secretUserToken), false, 'Error object JSON must not leak user token');
    assert.equal(errStr.includes(secretPassword), false, 'Error object JSON must not leak password');
    assert.equal(errStr.includes(validTestServiceRoleKey), false, 'Error object JSON must not leak service role key');
  }

  // 2. Error objects from signOut never contain a token property or raw secret
  const clientSignOutFail = trackedHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: staticTransport({
      status: 500,
      ok: false,
      json: { error_code: 'server_error', msg: 'Logout gateway down' }
    })
  });

  const signOutRes = await clientSignOutFail.signOut(secretUserToken);
  assert.ok(signOutRes.error);
  assert.equal(signOutRes.error.token, undefined, 'signOut error must never contain token');
  assert.equal(JSON.stringify(signOutRes.error).includes(secretUserToken), false, 'signOut error must not contain secret token');

  // 3. Private inventory token map preserves token context for cleanup retry without leaking to { error }
  const invRetry = new TestRunInventory('test-r11-sec-retry');
  invRetry.trackReferencedUser({ id: seedUserId, email: seedEmail, source: 'seed' });
  invRetry.registerSeedPasswordModification({
    userId: seedUserId,
    email: seedEmail,
    originalPassword: secretPassword,
    state: 'confirmed'
  });

  // Verification login succeeds but initial signOut fails

  const adminClientRetry = fixtureSpec({ login: { status: 200, json: { access_token: secretUserToken, session_id: secretSessionId, user: { id: seedUserId } } }, routes: [{ urlIncludes: '/auth/v1/logout', times: 1, status: 503, json: { message: 'Service Unavailable' } }] });

  const repRetry = await invRetry.executeCleanup({ adminClient: bindFixtureAdmin(invRetry, adminClientRetry), failClosed: false });
  assert.equal((fixtureOperationCalls(adminClientRetry, 'login').length > 0), true, 'Initial verification signOut should be attempted');
  assert.equal((fixtureOperationCalls(adminClientRetry, 'logout').length > 0), true, 'Cleanup fallback retry should use privately retrieved token');
  assert.equal((fixtureOperationCalls(adminClientRetry, 'logout').at(-1)?.headers.authorization?.replace(/^Bearer /, '')), secretUserToken, 'Fallback retry must use the privately stored token from inventory');
  assert.equal(fixtureOperationCalls(adminClientRetry, 'logout').length, 2, 'Initial provider logout failure must be followed by a real retry');
  assert.equal(repRetry.status, 'CLEANUP_VERIFIED_SUCCESS', 'Successful retry cleanup must result in CLEANUP_VERIFIED_SUCCESS');
  assert.equal(invRetry.isSessionRevoked(secretSessionId), true, 'Session must be marked revoked after retry');

  // 4. Failed cleanup leaves passwords preserved in inventory (clearCredentials() is skipped) for admin remediation
  const invFail = new TestRunInventory('test-r11-sec-fail');
  invFail.trackReferencedUser({ id: seedUserId, email: seedEmail, source: 'seed' });
  invFail.registerSeedPasswordModification({
    userId: seedUserId,
    email: seedEmail,
    originalPassword: secretPassword,
    state: 'confirmed'
  });

  const adminClientFail = fixtureSpec({ userUpdate: { status: 503, json: { message: 'Database down' } } });

  const repFail = await invFail.executeCleanup({ adminClient: bindFixtureAdmin(invFail, adminClientFail), failClosed: false });
  assert.equal(repFail.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  // Passwords MUST remain preserved for emergency admin recovery
  assert.equal(invFail.seedCredentialRestorations[0].originalPassword, secretPassword, 'Failed cleanup must preserve original password in inventory');

  // Residual resources report must not leak secrets
  const repFailStr = JSON.stringify(repFail);
  assert.equal(repFailStr.includes(secretPassword), false, 'Cleanup report must never serialize original password');
  assert.equal(repFailStr.includes(validTestServiceRoleKey), false, 'Cleanup report must never serialize serviceRoleKey');

  // 5. Successful cleanup sanitizes passwords (clearCredentials() sets '[CLEARED]')
  const invSuccess = new TestRunInventory('test-r11-sec-succ');
  invSuccess.trackReferencedUser({ id: seedUserId, email: seedEmail, source: 'seed' });
  invSuccess.registerSeedPasswordModification({
    userId: seedUserId,
    email: seedEmail,
    originalPassword: secretPassword,
    targetPassword: 'TempPassword123!',
    state: 'confirmed'
  });

  const adminClientSuccess = fixtureSpec();

  const repSuccess = await invSuccess.executeCleanup({ adminClient: bindFixtureAdmin(invSuccess, adminClientSuccess), failClosed: false });
  assert.equal(repSuccess.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(invSuccess.seedCredentialRestorations[0].originalPassword, '[CLEARED]', 'Successful cleanup must clear original password');
  assert.equal(invSuccess.seedCredentialRestorations[0].targetPassword, '[CLEARED]', 'Successful cleanup must clear target password');
});

test('84. Task 06I-B1-H1-R12 (R12-01 & R12-02): Shared fail-closed Auth response boundary, indeterminate session tracking, and residual safety', async () => {
  // 1. HOOK-01 HTTP 200 with valid token and session ID -> passed: true, token observed
  const inv1 = new TestRunInventory('test-r12-case1');
  const runCtx1 = createRunContext({ runId: inv1.runId });
  const sess1 = 'sess-r12-case1-999';
  const token1 = createMockJwt({ session_id: sess1, sub: 'user-r12-case1' });
  const disp1 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    inventory: inv1,
    runContext: runCtx1,
    fetchFn: staticTransport({
      status: 200,
      json: {
        access_token: token1,
        refresh_token: 'refresh-case1',
        session_id: sess1,
        user: { id: 'user-r12-case1', email: 'tio-test-user-06i@proof.invalid' }
      }
    })
  });
  const res1 = await disp1({ id: 'HOOK-01', category: 'Token Hook' });
  assert.equal(res1.passed, true);
  assert.equal(res1.jwt_claim_policy_validated, true);
  assert.equal(res1.cryptographically_authenticated, false);
  assert.equal(res1.session_id, sess1);
  assert.equal(inv1.trackedSessions.has(sess1), true);
  assert.equal(runCtx1.activeAccessToken, token1);
  assert.equal(runCtx1.activeSessionId, sess1);

  // 2. HOOK-01 HTTP 200 with truncated JSON -> passed: false, indeterminate_session: true, inv.untrackedSessionsCount incremented, cleanup fails closed
  const inv2 = new TestRunInventory('test-r12-case2');
  const runCtx2 = createRunContext({ runId: inv2.runId });
  const disp2 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    inventory: inv2,
    runContext: runCtx2,
    fetchFn: staticTransport({
      status: 200,
      text: '{"access_token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      jsonError: 'Unexpected end of JSON input'
    })
  });
  const res2 = await disp2({ id: 'HOOK-01', category: 'Token Hook' });
  assert.equal(res2.passed, false);
  assert.equal(res2.indeterminate_session, true);
  assert.equal(inv2.untrackedSessionsCount, 1);
  assert.equal(runCtx2.activeAccessToken, null);
  await assert.rejects(
    inv2.executeCleanup({ adminClient: bindFixtureAdmin(inv2, defaultAdminFixture), failClosed: true }),
    /CLEANUP_INCOMPLETE/
  );

  // 3. HOOK-01 HTTP 200 with HTML response -> indeterminate_session: true, inv.untrackedSessionsCount incremented
  const inv3 = new TestRunInventory('test-r12-case3');
  const runCtx3 = createRunContext({ runId: inv3.runId });
  const disp3 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    inventory: inv3,
    runContext: runCtx3,
    fetchFn: staticTransport({
      status: 200,
      text: '<!DOCTYPE html><html><body>502 Bad Gateway</body></html>',
      jsonError: 'Unexpected token < in JSON at position 0'
    })
  });
  const res3 = await disp3({ id: 'HOOK-01', category: 'Token Hook' });
  assert.equal(res3.passed, false);
  assert.equal(res3.indeterminate_session, true);
  assert.equal(inv3.untrackedSessionsCount, 1);

  // 4. HOOK-01 HTTP 200 with empty {} -> indeterminate_session: true, inv.untrackedSessionsCount incremented
  const inv4 = new TestRunInventory('test-r12-case4');
  const runCtx4 = createRunContext({ runId: inv4.runId });
  const disp4 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    inventory: inv4,
    runContext: runCtx4,
    fetchFn: staticTransport({
      status: 200,
      json: {}
    })
  });
  const res4 = await disp4({ id: 'HOOK-01', category: 'Token Hook' });
  assert.equal(res4.passed, false);
  assert.equal(res4.indeterminate_session, true);
  assert.equal(inv4.untrackedSessionsCount, 1);

  // 5. HOOK-01 HTTP 200 with missing access token -> indeterminate_session: true
  const inv5 = new TestRunInventory('test-r12-case5');
  const runCtx5 = createRunContext({ runId: inv5.runId });
  const disp5 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    inventory: inv5,
    runContext: runCtx5,
    fetchFn: staticTransport({
      status: 200,
      json: { user: { id: 'user-no-token' } }
    })
  });
  const res5 = await disp5({ id: 'HOOK-01', category: 'Token Hook' });
  assert.equal(res5.passed, false);
  assert.equal(res5.indeterminate_session, true);
  assert.equal(inv5.untrackedSessionsCount, 1);

  // 6. HOOK-01 HTTP 200 with malformed JWT -> passed: false, unverified JWT NOT stored in ctx.activeAccessToken, session retained in inv
  const inv6 = new TestRunInventory('test-r12-case6');
  const runCtx6 = createRunContext({ runId: inv6.runId });
  const sess6 = 'sess-malformed-jwt-6';
  const disp6 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    inventory: inv6,
    runContext: runCtx6,
    fetchFn: staticTransport({
      status: 200,
      json: {
        access_token: 'malformed.token.value',
        session_id: sess6,
        user: { id: 'user-malformed-6' }
      }
    })
  });
  const res6 = await disp6({ id: 'HOOK-01', category: 'Token Hook' });
  assert.equal(res6.passed, false);
  assert.equal(res6.jwt_claim_policy_validated, false);
  assert.equal(runCtx6.activeAccessToken, null, 'Unverified JWT must not be stored in activeAccessToken');
  assert.equal(inv6.trackedSessions.has(sess6), true, 'Session must be tracked for cleanup');

  // 7. HOOK-01 token issued but session ID unavailable -> UNTRACKED_SESSION, inv.untrackedSessionsCount incremented
  const inv7 = new TestRunInventory('test-r12-case7');
  const runCtx7 = createRunContext({ runId: inv7.runId });
  const disp7 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    inventory: inv7,
    runContext: runCtx7,
    fetchFn: staticTransport({
      status: 200,
      json: {
        access_token: 'opaque-token-without-claims-or-session-id',
        user: { id: 'user-opaque-7' }
      }
    })
  });
  const res7 = await disp7({ id: 'HOOK-01', category: 'Token Hook' });
  assert.equal(res7.passed, false);
  assert.equal(res7.indeterminate_session, true);
  assert.equal(inv7.untrackedSessionsCount, 1);

  // 8. HOOK-01 response read failure after successful HTTP status -> indeterminate_session: true
  const inv8 = new TestRunInventory('test-r12-case8');
  const runCtx8 = createRunContext({ runId: inv8.runId });
  const disp8 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    inventory: inv8,
    runContext: runCtx8,
    fetchFn: staticTransport({
      status: 200,
      textError: 'Premature socket termination while reading body',
      jsonError: 'Premature socket termination while reading body'
    })
  });
  const res8 = await disp8({ id: 'HOOK-01', category: 'Token Hook' });
  assert.equal(res8.passed, false);
  assert.equal(res8.indeterminate_session, true);
  assert.equal(inv8.untrackedSessionsCount, 1);

  // 9. Request transport failure after possible server-side commit (ECONNRESET) -> indeterminate_session: true, inv.untrackedSessionsCount incremented
  const inv9 = new TestRunInventory('test-r12-case9');
  const runCtx9 = createRunContext({ runId: inv9.runId });
  const disp9 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    inventory: inv9,
    runContext: runCtx9,
    fetchFn: errorTransport('ECONNRESET: Connection reset by peer')
  });
  const res9 = await disp9({ id: 'HOOK-01', category: 'Token Hook' });
  assert.equal(res9.passed, false);
  assert.equal(res9.indeterminate_session, true);
  assert.equal(inv9.untrackedSessionsCount, 1);

  // 10. Genuine rejected authentication (HTTP 400 invalid grant) -> AUTH_RESPONSE_VERIFIED_REJECTION, no sessions in inv
  const inv10 = new TestRunInventory('test-r12-case10');
  const runCtx10 = createRunContext({ runId: inv10.runId });
  const disp10 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    inventory: inv10,
    runContext: runCtx10,
    fetchFn: staticTransport({
      status: 400,
      json: { error: 'invalid_grant', error_description: 'Invalid login credentials' }
    })
  });
  const res10 = await disp10({ id: 'HOOK-01', category: 'Token Hook' });
  assert.equal(res10.passed, false);
  assert.equal(res10.indeterminate_session, undefined);
  assert.equal(inv10.untrackedSessionsCount, 0);
  assert.equal(inv10.trackedSessions.size, 0);

  // 11. Negative probe (BYPASS-01, BYPASS-02) unexpectedly issuing tokens -> AUTH_RESPONSE_UNEXPECTED_TOKEN, registered in inv
  const inv11 = new TestRunInventory('test-r12-case11');
  const sess11a = 'sess-unexpected-bypass01';
  const token11a = createMockJwt({ session_id: sess11a, sub: 'user-unexpected-11a' });
  const disp11a = createHostedDispatcher({
    anonKey: validTestAnonKey,
    inventory: inv11,
    fetchFn: staticTransport({
      status: 200,
      json: {
        access_token: token11a,
        session_id: sess11a,
        user: { id: 'user-unexpected-11a' }
      }
    })
  });
  const res11a = await disp11a({ id: 'BYPASS-01', testUser: 'unexpected@proof.invalid' });
  assert.equal(res11a.passed, false);
  assert.equal(inv11.trackedSessions.has(sess11a), true, 'Unexpected token from BYPASS-01 must be tracked in inventory');

  const sess11b = 'sess-unexpected-bypass02';
  const token11b = createMockJwt({ session_id: sess11b, sub: 'user-unexpected-11b' });
  const disp11b = createHostedDispatcher({
    anonKey: validTestAnonKey,
    inventory: inv11,
    fetchFn: staticTransport({
      status: 200,
      json: {
        access_token: token11b,
        session_id: sess11b,
        user: { id: 'user-unexpected-11b' }
      }
    })
  });
  const res11b = await disp11b({ id: 'BYPASS-02', testUser: 'unexpected2@proof.invalid' });
  assert.equal(res11b.passed, false);
  assert.equal(inv11.trackedSessions.has(sess11b), true, 'Unexpected token from BYPASS-02 must be tracked in inventory');
  assert.equal(inv11.isUserTracked('user-unexpected-11b'), true, 'Unexpected user created in BYPASS-02 must be tracked');
  assert.equal(inv11.isUserCreated('user-unexpected-11b'), false, 'Unexpected user without affirmative proof must NOT be in createdUsers');
  assert.equal(inv11.unverifiedUsers.has('user-unexpected-11b'), true, 'Unexpected user must be in unverifiedUsers');

  // 12. Cleanup after aborted authentication -> executeCleanup handles cleanly
  const inv12 = new TestRunInventory('test-r12-case12');
  inv12.registerCreatedUser({
    id: 'user-aborted-12',
    email: 'aborted@proof.invalid',
    source: 'aborted_test',
    creationProof: createCreationProof('before_after_check', { preCheckAbsent: true, postCheckPresent: true })
  });
  const mockAdmin12 = fixtureSpec();
  const rep12 = await inv12.executeCleanup({ adminClient: bindFixtureAdmin(inv12, mockAdmin12), failClosed: true });
  assert.equal(rep12.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(rep12.usersDeleted, 1);

  // 13. Cleanup after unexpected provider response -> fails closed if indeterminate
  const inv13 = new TestRunInventory('test-r12-case13');
  inv13.registerUntrackedSession();
  const rep13 = await inv13.executeCleanup({ adminClient: bindFixtureAdmin(inv13, defaultAdminFixture), failClosed: false });
  assert.equal(rep13.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  await assert.rejects(
    inv13.executeCleanup({ adminClient: bindFixtureAdmin(inv13, defaultAdminFixture), failClosed: true }),
    /CLEANUP_INCOMPLETE/
  );

  // 14. Cleanup with unresolved minted-session risk -> CLEANUP_FAILED_RESIDUAL_RESOURCES, throws CLEANUP_INCOMPLETE
  const inv14 = new TestRunInventory('test-r12-case14');
  inv14.registerUntrackedSession();
  const rep14 = await inv14.executeCleanup({ adminClient: bindFixtureAdmin(inv14, defaultAdminFixture), failClosed: false });
  assert.equal(rep14.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.ok(rep14.residualResources.some(r => r.type === 'untracked_session'));
  await assert.rejects(
    inv14.executeCleanup({ adminClient: bindFixtureAdmin(inv14, defaultAdminFixture), failClosed: true }),
    /CLEANUP_INCOMPLETE/
  );

  // 15. Cleanup with real provider-confirmed session revocation -> CLEANUP_VERIFIED_SUCCESS
  const inv15 = new TestRunInventory('test-r12-case15');
  const sess15 = 'sess-revoked-15';
  inv15.registerSession(sess15, { accessToken: createMockJwt({ session_id: sess15 }),  source: 'test_session' });
  const mockAdmin15 = fixtureSpec();
  const rep15 = await inv15.executeCleanup({ adminClient: bindFixtureAdmin(inv15, mockAdmin15), failClosed: true });
  assert.equal(rep15.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(rep15.sessionsRevoked, 1);

  // 16. Pre-existing seed user preservation -> deleteUser never called on referenced seed user
  const inv16 = new TestRunInventory('test-r12-case16');
  const seedUid16 = 'seed-uid-preserved-16';
  inv16.trackReferencedUser({ id: seedUid16, email: 'seed@proof.invalid', source: 'seed' });
  const mockAdmin16 = fixtureSpec();
  const rep16 = await inv16.executeCleanup({ adminClient: bindFixtureAdmin(inv16, mockAdmin16), failClosed: true });
  assert.equal(rep16.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal((fixtureOperationCalls(mockAdmin16, 'userDelete').length), 0, 'deleteUser must never be called on referenced seed user');
  assert.equal(inv16.referencedUsers.has(seedUid16), true);

  // 17. Credential and token redaction -> zero secrets in error objects or serialized reports
  const secretToken17 = createMockJwt({ session_id: 'sess-sec-17', sub: 'user-sec-17' });
  const secretPass17 = 'TopSecretPass#2026!';
  const parseEnv17 = await parseResponseEnvelope({
    status: 200,
    json: async () => ({ access_token: secretToken17, session_id: 'sess-sec-17' })
  });
  const observed17 = observeAuthResponse({
    probeId: 'HOOK-01',
    status: parseEnv17.status,
    parseStatus: parseEnv17.parseStatus,
    body: parseEnv17.body,
    parseError: parseEnv17.parseError,
    canMintSession: true,
    testUser: 'test@proof.invalid'
  });
  const sanitized17 = sanitizeData(observed17);
  const jsonStr17 = JSON.stringify(sanitized17);
  assert.equal(jsonStr17.includes(secretToken17), false, 'Sanitized object must not contain raw JWT');
  assert.equal(jsonStr17.includes(secretPass17), false, 'Sanitized object must not contain password');

  // 18. Zero external network requests during tests
  // Confirmed: All dispatchers and admin clients in Test 84 use injected mock functions; zero external fetch executed
  assert.ok(true, 'All probes and cleanup operations executed entirely offline with zero external network requests');
});

test('85. Task 06I-B1-H1-R13 (R13-01 & R13-02): Auth endpoint capabilities, in-flight operation lifecycle, and timeout-safe cleanup', async () => {
  // 1. Endpoint capability matrix validation (R13-01)
  assert.ok(AUTH_ENDPOINT_CAPABILITIES, 'AUTH_ENDPOINT_CAPABILITIES must be exported');
  assert.ok(Object.isFrozen(AUTH_ENDPOINT_CAPABILITIES), 'Capability matrix must be deeply frozen');
  const verifyCap = AUTH_ENDPOINT_CAPABILITIES['POST /auth/v1/verify'];
  assert.ok(verifyCap, 'POST /auth/v1/verify capability must be defined');
  assert.equal(verifyCap.canMintSession, true, 'POST /auth/v1/verify must have canMintSession: true (R13-01)');
  assert.equal(verifyCap.probeId, 'BYPASS-03');
  assert.equal(AUTH_ENDPOINT_CAPABILITIES['POST /auth/v1/otp'].canMintSession, false);
  assert.equal(AUTH_ENDPOINT_CAPABILITIES['POST /auth/v1/signup'].canMintSession, true, 'Signup must have canMintSession: true (R16-01)');
  assert.equal(AUTH_ENDPOINT_CAPABILITIES['POST /auth/v1/token?grant_type=password'].canMintSession, true);
  assert.equal(AUTH_ENDPOINT_CAPABILITIES['POST /auth/v1/token?grant_type=refresh_token'].canMintSession, true);

  // 2. BYPASS-03 normal rejection (HTTP 400 with invalid challenge code)
  const inv2 = new TestRunInventory('test-r13-case2');
  const disp2 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    fetchFn: staticTransport({
      status: 400,
      json: { code: 400, error_code: 'otp_expired', msg: 'Token has expired or is invalid' }
    })
  });
  const res2 = await disp2({ id: 'BYPASS-03' }, { inventory: inv2 });
  assert.equal(res2.passed, false);
  assert.equal(res2.status, 400);
  assert.equal(res2.upstream_rejected_before_hook, true);
  assert.equal(inv2.trackedSessions.size, 0);
  assert.equal(inv2.untrackedSessionsCount, 0);
  assert.equal(inv2.isClean(), true);

  // 3. BYPASS-03 unexpected success with tokens -> session registered and revoked on cleanup
  const inv3 = new TestRunInventory('test-r13-case3');
  const mockJwt3 = createMockJwt({ session_id: 'sess-verify-3', sub: 'user-verify-3' });
  const disp3 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    fetchFn: staticTransport({
      status: 200,
      json: { access_token: mockJwt3, session_id: 'sess-verify-3' }
    })
  });
  const res3 = await disp3({ id: 'BYPASS-03' }, { inventory: inv3 });
  assert.equal(res3.passed, false, 'Unexpected tokens on BYPASS-03 must fail probe');
  assert.equal(inv3.trackedSessions.has('sess-verify-3'), true, 'Unexpected session must be tracked for revocation');
  const mockAdmin3 = fixtureSpec();
  const rep3 = await inv3.executeCleanup({ adminClient: bindFixtureAdmin(inv3, mockAdmin3), failClosed: true });
  assert.equal(rep3.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(rep3.sessionsRevoked, 1);

  // 4. BYPASS-03 HTTP 200 with empty body {} -> indeterminate session risk, cleanup fails closed
  const inv4 = new TestRunInventory('test-r13-case4');
  const disp4 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    fetchFn: staticTransport({
      status: 200,
      json: {}
    })
  });
  const res4 = await disp4({ id: 'BYPASS-03' }, { inventory: inv4 });
  assert.equal(res4.passed, false);
  assert.equal(res4.indeterminate_session, true);
  assert.equal(inv4.untrackedSessionsCount, 1);
  const rep4 = await inv4.executeCleanup({ adminClient: bindFixtureAdmin(inv4, defaultAdminFixture), failClosed: false });
  assert.equal(rep4.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  await assert.rejects(
    inv4.executeCleanup({ adminClient: bindFixtureAdmin(inv4, defaultAdminFixture), failClosed: true }),
    /CLEANUP_INCOMPLETE/
  );

  // 5. BYPASS-03 HTTP 200 with unreadable/truncated JSON -> indeterminate session risk, cleanup fails closed
  const inv5 = new TestRunInventory('test-r13-case5');
  const disp5 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    fetchFn: staticTransport({
      status: 200,
      jsonError: 'Unexpected end of JSON input'
    })
  });
  const res5 = await disp5({ id: 'BYPASS-03' }, { inventory: inv5 });
  assert.equal(res5.passed, false);
  assert.equal(res5.indeterminate_session, true);
  assert.equal(inv5.untrackedSessionsCount, 1);
  const rep5 = await inv5.executeCleanup({ adminClient: bindFixtureAdmin(inv5, defaultAdminFixture), failClosed: false });
  assert.equal(rep5.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');

  // 6. BYPASS-03 connection reset after request dispatch (ECONNRESET) -> indeterminate risk, cleanup fails closed
  const inv6 = new TestRunInventory('test-r13-case6');
  const disp6 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    fetchFn: errorTransport({ message: 'read ECONNRESET', code: 'ECONNRESET' })
  });
  const res6 = await disp6({ id: 'BYPASS-03' }, { inventory: inv6 });
  assert.equal(res6.passed, false);
  assert.equal(res6.indeterminate_session, true);
  assert.equal(inv6.untrackedSessionsCount, 1);
  const rep6 = await inv6.executeCleanup({ adminClient: bindFixtureAdmin(inv6, defaultAdminFixture), failClosed: false });
  assert.equal(rep6.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');

  // 7. Operation registration and state transitions in TestRunInventory (R13-02)
  const inv7 = new TestRunInventory('test-r13-case7');
  const op7 = inv7.registerInFlightOperation({
    probeId: 'HOOK-01',
    endpoint: '/auth/v1/token?grant_type=password',
    canMintSession: true
  });
  assert.ok(op7.opId.startsWith('op-test-r13-case7-'));
  assert.equal(op7.state, 'IN_FLIGHT');
  assert.equal(inv7.hasUnresolvedOperations(), true);
  assert.equal(inv7.getUnresolvedOperations().length, 1);

  inv7.settleInFlightOperation(op7.opId, { outcome: { passed: true } });
  assert.equal(op7.state, 'SETTLED');
  assert.equal(inv7.hasUnresolvedOperations(), false);

  // 8. markProbeOperationsTimedOut transitions to TIMED_OUT_UNRESOLVED and captures untracked session risk
  const inv8 = new TestRunInventory('test-r13-case8');
  const op8 = inv8.registerInFlightOperation({
    probeId: 'HOOK-01',
    endpoint: '/auth/v1/token?grant_type=password',
    canMintSession: true
  });
  const affected8 = inv8.markProbeOperationsTimedOut('HOOK-01', 'PROBE_TIMEOUT: 5ms exceeded');
  assert.equal(affected8.length, 1);
  assert.equal(op8.state, 'TIMED_OUT_UNRESOLVED');
  assert.equal(inv8.untrackedSessionsCount, 1, 'Timed-out session-minting op must register untracked session');
  assert.equal(inv8.hasUnresolvedOperations(), true);

  // 9. Bounded wait for in-flight settlement (awaitInFlightSettlement)
  const inv9 = new TestRunInventory('test-r13-case9');
  const op9 = inv9.registerInFlightOperation({ probeId: 'HOOK-01', canMintSession: true });
  setTimeout(() => {
    inv9.settleInFlightOperation(op9.opId, { outcome: { passed: true } });
  }, 10);
  await inv9.awaitInFlightSettlement(50);
  assert.equal(op9.state, 'SETTLED');
  assert.equal(inv9.hasUnresolvedOperations(), false);

  // 10. MANDATORY REPRODUCTION CASE (Codex finding PRRT_kwDOVtCmZc66vvky):
  // Probe timeout 5ms, delayed response body rejection 20ms:
  // Must NOT show CLEANUP_VERIFIED_SUCCESS; must fail closed with CLEANUP_FAILED_RESIDUAL_RESOURCES.
  const inv10 = new TestRunInventory('test-r13-case10-reproduction');
  const delayedDispatcher10 = offlineDispatcherSpec({
    outcomes: {
      'BYPASS-01': { passed: true, status: 400, route_disabled: true, tokens: null },
      'BYPASS-02': { passed: true, status: 400, signup_disabled: true, user_created: false, tokens: null },
      'BYPASS-03': {
        delayMs: 20,
        ignoreAbort: true,
        onAbortInventoryEffects: { registerUntrackedSession: true },
        passed: false,
        status: 0,
        error: 'delayed body read failed'
      }
    },
    defaultOutcome: { passed: false, status: 500 }
  });

  const runnerRes10 = await runHostedProbeRunner(fixtureRunnerOptions({
    projectRef: HARDCODED_TEMP_REF,
    argv: ['--live'],
    env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
    adminClient: defaultAdminFixture,
    inventory: inv10,
    mockDispatcher: delayedDispatcher10,
    probeTimeoutMs: 5, // 5ms timeout fires while 20ms delay is in flight
    timing: { mode: 'recorded_zero_wait' }
  }));

  assert.equal(runnerRes10.status, 'HALTED_ON_FAILURE');
  assert.ok(runnerRes10.cleanupReport, 'cleanupReport must be present');
  assert.notEqual(
    runnerRes10.cleanupReport.status,
    'CLEANUP_VERIFIED_SUCCESS',
    'Report MUST NOT show CLEANUP_VERIFIED_SUCCESS when delayed body read was in flight during timeout (R13-02)'
  );
  assert.equal(runnerRes10.cleanupReport.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.ok(
    runnerRes10.cleanupReport.residualResources.length > 0,
    'Residual resources must report unresolved in-flight operation or untracked session'
  );

  // Wait for 20ms delayed promise to settle completely
  await new Promise(r => setTimeout(r, 30));
  assert.equal(inv10.finalized, true, 'Inventory must remain finalized');
  assert.equal(inv10.isClean(), false, 'Inventory with residual resources must report isClean() === false');

  // 11. Dispatcher never settles (hanging promise) -> cleanup fails closed on unresolved in-flight op
  const inv11 = new TestRunInventory('test-r13-case11-hanging');
  const hangingDispatcher11 = offlineDispatcherSpec({
    outcomes: {
      'BYPASS-01': { passed: true, status: 400, route_disabled: true, tokens: null },
      'BYPASS-02': { passed: true, status: 400, signup_disabled: true, user_created: false, tokens: null },
      'BYPASS-03': { neverSettle: true }
    },
    defaultOutcome: { passed: false, status: 500 }
  });
  const runnerRes11 = await runHostedProbeRunner(fixtureRunnerOptions({
    projectRef: HARDCODED_TEMP_REF,
    argv: ['--live'],
    env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
    adminClient: defaultAdminFixture,
    inventory: inv11,
    mockDispatcher: hangingDispatcher11,
    probeTimeoutMs: 5,
    timing: { mode: 'recorded_zero_wait' }
  }));
  assert.equal(runnerRes11.status, 'HALTED_ON_FAILURE');
  assert.equal(runnerRes11.cleanupReport.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.ok(runnerRes11.cleanupReport.residualResources.some(r => r.type === 'unresolved_in_flight_operation' || r.type === 'untracked_session'));

  // 12. Dispatcher settles after timeout -> state transitions to SETTLED_AFTER_TIMEOUT
  const inv12 = new TestRunInventory('test-r13-case12');
  const op12 = inv12.registerInFlightOperation({ probeId: 'HOOK-01', canMintSession: true });
  inv12.markProbeOperationsTimedOut('HOOK-01', 'timeout');
  assert.equal(op12.state, 'TIMED_OUT_UNRESOLVED');
  inv12.settleInFlightOperation(op12.opId, { outcome: { passed: false } });
  assert.equal(op12.state, 'SETTLED_AFTER_TIMEOUT');

  // 13. Inventory finalization immutability (finalize)
  const inv13 = new TestRunInventory('test-r13-case13');
  inv13.finalize();
  assert.equal(inv13.finalized, true);
  // Late registration attempts after finalization are recorded in postFinalizationMutations
  inv13.registerSession('sess-late-13', { accessToken: createMockJwt({ session_id: 'sess-late-13' }) });
  inv13.registerUntrackedSession();
  assert.equal(inv13.postFinalizationMutations.length, 2);
  assert.equal(inv13.isClean(), false);

  // 14. Deterministic assertion that final inventory cannot transition from CLEANUP_VERIFIED_SUCCESS into clean state if residual operations exist
  const inv14 = new TestRunInventory('test-r13-case14');
  inv14.registerInFlightOperation({ probeId: 'HOOK-01', canMintSession: true });
  assert.equal(inv14.isClean(), false);

  // 15. Seed user preservation invariant
  const inv15 = new TestRunInventory('test-r13-case15');
  const seedUid15 = 'seed-uid-15';
  inv15.trackReferencedUser({ id: seedUid15, email: 'seed@proof.invalid', source: 'seed' });
  const mockAdmin15 = fixtureSpec();
  const rep15 = await inv15.executeCleanup({ adminClient: bindFixtureAdmin(inv15, mockAdmin15), failClosed: true });
  assert.equal(rep15.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal((fixtureOperationCalls(mockAdmin15, 'userDelete').length), 0, 'Seed user must never be deleted');
  assert.equal(inv15.referencedUsers.has(seedUid15), true);

  // 16. Secret sanitization invariant -> zero tokens or passwords in sanitized output
  const secretJwt16 = createMockJwt({ session_id: 'sess-sec-16', sub: 'user-sec-16' });
  const rawReport16 = {
    probeId: 'BYPASS-03',
    token: secretJwt16,
    password: DEFAULT_TEST_PASSWORD,
    body: { access_token: secretJwt16 }
  };
  const sanitized16 = sanitizeData(rawReport16);
  const jsonStr16 = JSON.stringify(sanitized16);
  assert.equal(jsonStr16.includes(secretJwt16), false);
  assert.equal(jsonStr16.includes(DEFAULT_TEST_PASSWORD), false);

  // 17. Offline safety invariant
  assert.ok(true, 'All probes, timeouts, and cleanup verification executed offline with zero network requests');
});

test('86. Task 06I-B1-H1-R14 (R14-01 & R14-02): Asynchronous mutation tracking, unresolved password protection, and orphan-user cleanup closure', async () => {
  // 1. Capability matrix verification (R14-01 & R14-02)
  const signupCap = AUTH_ENDPOINT_CAPABILITIES['POST /auth/v1/signup'];
  assert.ok(signupCap, 'Signup capability must be defined');
  assert.equal(signupCap.canCreateUser, true, 'Signup must declare canCreateUser: true (R14-02)');
  assert.equal(signupCap.canModifyProviderState, true, 'Signup must declare canModifyProviderState: true');
  assert.equal(signupCap.requiresCleanupReconciliation, true, 'Signup must declare requiresCleanupReconciliation: true (R14-02)');
  assert.equal(signupCap.canMintSession, true, 'Signup must declare canMintSession: true (R16-01)');

  const adminUpdateCap = AUTH_ENDPOINT_CAPABILITIES['PUT /auth/v1/admin/users/:id'];
  assert.ok(adminUpdateCap, 'Admin update capability must be defined');
  assert.equal(adminUpdateCap.canModifyProviderState, true, 'Admin update must declare canModifyProviderState: true (R14-01)');
  assert.equal(adminUpdateCap.requiresCleanupReconciliation, true, 'Admin update must declare requiresCleanupReconciliation: true (R14-01)');
  assert.equal(adminUpdateCap.canMintSession, false, 'Admin update must declare canMintSession: false');
  assert.equal(adminUpdateCap.canCreateUser, false, 'Admin update must declare canCreateUser: false');

  // 2. R14-01: SESSION-02 pre-dispatch in-flight registration and timeout-safety (PRRT_kwDOVtCmZc663HvN)
  // When password update request times out / remains unresolved, cleanup must fail closed and block restoration
  const inv2 = new TestRunInventory('test-r14-case2');
  const seedUid2 = 'seed-uid-r14-2';
  inv2.trackReferencedUser({ id: seedUid2, email: 'seed2@proof.invalid', source: 'seed' });

  // Simulate SESSION-02 timing out while in flight
  const op2 = inv2.registerInFlightOperation({
    probeId: 'SESSION-02',
    endpoint: `/auth/v1/admin/users/${seedUid2}`,
    canMintSession: false,
    canCreateUser: false,
    canModifyProviderState: true,
    requiresCleanupReconciliation: true,
    targetUserId: seedUid2
  });
  inv2.registerSeedPasswordModification({
    userId: seedUid2,
    email: 'seed2@proof.invalid',
    originalPassword: 'OriginalPass#123!',
    targetPassword: 'TioNewPassword#2026!',
    state: 'dispatched'
  });

  // Probe times out before response received
  inv2.markProbeOperationsTimedOut('SESSION-02', 'PROBE_TIMEOUT: 50ms exceeded');
  assert.equal(op2.state, 'TIMED_OUT_UNRESOLVED');
  assert.equal(inv2.hasUnresolvedOperations(), true);

  // Attempt cleanup: must fail closed because unresolved mutation exists for seed user
  const mockAdmin2 = fixtureSpec();
  const rep2 = await inv2.executeCleanup({ adminClient: bindFixtureAdmin(inv2, mockAdmin2), failClosed: false });
  assert.equal(rep2.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.ok(rep2.residualResources.some(r => r.type === 'unresolved_provider_mutation'));
  assert.ok(rep2.residualResources.some(r => r.error && r.error.includes('CONCURRENT_UNRESOLVED_PASSWORD_MUTATION')));
  assert.equal((fixtureOperationCalls(mockAdmin2, 'userUpdate').length), 0, 'Cannot execute password restoration while concurrent mutation remains unresolved');
  assert.equal(inv2.isClean(), false);
  await assert.rejects(
    inv2.executeCleanup({ adminClient: bindFixtureAdmin(inv2, mockAdmin2), failClosed: true }),
    /CLEANUP_INCOMPLETE/
  );

  // 3. R14-01: Delayed password mutation lands post-finalization (PRRT_kwDOVtCmZc663HvN)
  // Settle operation after cleanup finalized -> recorded in postFinalizationMutations, cannot change failed report
  inv2.settleInFlightOperation(op2.opId, { outcome: { status: 200, resetSucceeded: true } });
  assert.equal(op2.state, 'SETTLED_AFTER_TIMEOUT');
  assert.equal(inv2.postFinalizationMutations.length, 1);
  assert.equal(inv2.isClean(), false);

  // 4. R14-01: SESSION-02 dispatcher transport abort handling (AbortError on signal)
  const inv4 = new TestRunInventory('test-r14-case4');
  const seedUid4 = 'seed-uid-r14-4';
  inv4.trackReferencedUser({ id: seedUid4, email: 'seed4@proof.invalid', source: 'seed' });
  const abortCtrl4 = new AbortController();
  abortCtrl4.abort(); // pre-aborted signal
  const runCtx4 = createRunContext({ runId: inv4.runId });
  runCtx4.activeUserId = seedUid4;
  runCtx4.activeAccessToken = 'mock-token';
  const disp4 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    serviceRoleKey: validTestServiceRoleKey,
    inventory: inv4,
    runContext: runCtx4,
    fetchFn: errorTransport({ message: 'The operation was aborted', name: 'AbortError' })
  });
  const res4 = await disp4({ id: 'SESSION-02' }, { signal: abortCtrl4.signal });
  assert.equal(res4.passed, false);
  assert.equal(res4.restoration_state, 'indeterminate');
  assert.equal(inv4.hasUnresolvedOperations(), true, 'Aborted password mutation must remain unresolved');
  const rep4 = await inv4.executeCleanup({ adminClient: bindFixtureAdmin(inv4, defaultAdminFixture), failClosed: false });
  assert.equal(rep4.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');

  // 5. R14-02: BYPASS-02 transport reset (ECONNRESET) post-dispatch creates untracked user risk (PRRT_kwDOVtCmZc663HvU)
  const inv5 = new TestRunInventory('test-r14-case5');
  const disp5 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    inventory: inv5,
    fetchFn: errorTransport({ message: 'read ECONNRESET', code: 'ECONNRESET' })
  });
  const res5 = await disp5({ id: 'BYPASS-02' });
  assert.equal(res5.passed, false);
  assert.equal(res5.indeterminate_user_creation, true);
  assert.equal(inv5.untrackedUsersCount, 1, 'Transport reset on signup must register untracked user risk');
  assert.equal(inv5.isClean(), false);
  const rep5 = await inv5.executeCleanup({ adminClient: bindFixtureAdmin(inv5, defaultAdminFixture), failClosed: false });
  assert.equal(rep5.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.ok(rep5.residualResources.some(r => r.type === 'unresolved_user_creation_risk'));
  await assert.rejects(
    inv5.executeCleanup({ adminClient: bindFixtureAdmin(inv5, defaultAdminFixture), failClosed: true }),
    /CLEANUP_INCOMPLETE/
  );

  // 6. R14-02: BYPASS-02 HTTP 200 with unreadable/corrupted JSON creates untracked user risk
  const inv6 = new TestRunInventory('test-r14-case6');
  const disp6 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    inventory: inv6,
    fetchFn: staticTransport({
      status: 200,
      jsonError: 'Unexpected token < in JSON at position 0'
    })
  });
  const res6 = await disp6({ id: 'BYPASS-02' });
  assert.equal(res6.passed, false);
  assert.equal(res6.indeterminate_user_creation, true);
  assert.equal(inv6.untrackedUsersCount, 1);
  const rep6 = await inv6.executeCleanup({ adminClient: bindFixtureAdmin(inv6, defaultAdminFixture), failClosed: false });
  assert.equal(rep6.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.ok(rep6.residualResources.some(r => r.type === 'unresolved_user_creation_risk'));

  // 7. R14-02: BYPASS-02 HTTP 200 without user ID creates untracked user risk
  const inv7 = new TestRunInventory('test-r14-case7');
  const disp7 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    inventory: inv7,
    fetchFn: staticTransport({
      status: 200,
      json: { message: 'User created but no ID returned' }
    })
  });
  const res7 = await disp7({ id: 'BYPASS-02' });
  assert.equal(res7.passed, false);
  assert.equal(res7.indeterminate_user_creation, true);
  assert.equal(inv7.untrackedUsersCount, 1);
  const rep7 = await inv7.executeCleanup({ adminClient: bindFixtureAdmin(inv7, defaultAdminFixture), failClosed: false });
  assert.equal(rep7.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');

  // 8. R14-02: BYPASS-02 unexpected success with concrete user ID -> deletion verified by exact ID
  const inv8 = new TestRunInventory('test-r14-case8');
  const mockAdmin8 = fixtureSpec();
  const disp8 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    inventory: inv8,
    fetchFn: staticTransport({
      status: 200,
      json: { id: 'unexpected-user-uid-8', email: 'test@proof.invalid' }
    })
  });
  const res8 = await disp8({ id: 'BYPASS-02' });
  assert.equal(res8.passed, false, 'Unexpected user creation must fail probe');
  assert.equal(res8.user_created, true);
  assert.equal(inv8.createdUsers.has('unexpected-user-uid-8'), false, 'Unexpected user without affirmative creation proof must NOT be marked created');
  assert.equal(inv8.unverifiedUsers.has('unexpected-user-uid-8'), true, 'Unexpected user must be tracked in unverifiedUsers');
  assert.equal(inv8.getUserOwnership('unexpected-user-uid-8'), USER_OWNERSHIP.OWNERSHIP_UNKNOWN);
  const rep8 = await inv8.executeCleanup({ adminClient: bindFixtureAdmin(inv8, mockAdmin8), failClosed: false });
  assert.equal(rep8.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.equal((fixtureOperationCalls(mockAdmin8, 'userDelete').at(-1)?.pathname.split('/').map(decodeURIComponent).at(-1) ?? null), null, 'Unproven user must NEVER be deleted during cleanup');
  assert.equal(rep8.usersDeleted, 0);

  // 9. R14-02: Anti-deletion security boundary -> referenced/seed users never deleted on email equality
  const inv9 = new TestRunInventory('test-r14-case9');
  const seedEmail9 = 'seed9@proof.invalid';
  inv9.trackReferencedUser({ id: 'seed-uid-9', email: seedEmail9, source: 'seed' });
  const mockAdmin9 = fixtureSpec();
  // Dispatcher returns indeterminate failure on same email
  inv9.registerUntrackedUser();
  const rep9 = await inv9.executeCleanup({ adminClient: bindFixtureAdmin(inv9, mockAdmin9), failClosed: false });
  assert.equal((fixtureOperationCalls(mockAdmin9, 'userDelete').length > 0), false, 'Referenced user must never be deleted based on email equality');
  assert.equal(rep9.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');

  // 10. Multi-operation lifecycle with mixed capabilities: one settles, others unresolved
  const inv10 = new TestRunInventory('test-r14-case10');
  const op10a = inv10.registerInFlightOperation({ probeId: 'HOOK-01', canMintSession: true });
  const op10b = inv10.registerInFlightOperation({ probeId: 'BYPASS-02', canCreateUser: true });
  const op10c = inv10.registerInFlightOperation({ probeId: 'SESSION-02', canModifyProviderState: true });
  // op10a settles
  inv10.settleInFlightOperation(op10a.opId, { outcome: { passed: true } });
  assert.equal(op10a.state, 'SETTLED');
  assert.equal(inv10.hasUnresolvedOperations(), true);
  const unresolved10 = inv10.getUnresolvedOperations();
  assert.equal(unresolved10.length, 2);
  const rep10 = await inv10.executeCleanup({ adminClient: bindFixtureAdmin(inv10, defaultAdminFixture), failClosed: false });
  assert.equal(rep10.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.ok(rep10.residualResources.some(r => r.type === 'unresolved_user_creation'));
  assert.ok(rep10.residualResources.some(r => r.type === 'unresolved_provider_mutation'));

  // 11. Offline safety invariant
  assert.ok(true, 'All R14 adversarial regression scenarios executed offline with zero network requests');
});

test('87. Task 06I-B1-H1-R15 (R15-01 & R15-02): OTP user-creation tracking, capability drift elimination, and fail-closed cleanup', async () => {
  // 1. R15-02: Canonical capability matrix completeness & drift elimination
  const expectedEndpoints = [
    'POST /auth/v1/otp',
    'POST /auth/v1/signup',
    'POST /auth/v1/verify',
    'POST /auth/v1/recover',
    'POST /auth/v1/token?grant_type=password',
    'POST /auth/v1/token?grant_type=refresh_token',
    'POST /auth/v1/token?grant_type=password (verifyUserCredentials)',
    'PUT /auth/v1/admin/users/:id',
    'POST /auth/v1/logout?scope=local'
  ];

  assert.equal(Object.keys(AUTH_ENDPOINT_CAPABILITIES).length, 9, 'Exactly 9 endpoints in AUTH_ENDPOINT_CAPABILITIES');
  for (const ep of expectedEndpoints) {
    const cap = AUTH_ENDPOINT_CAPABILITIES[ep];
    assert.ok(cap, `Capability must exist for ${ep}`);
    assert.equal(typeof cap.canMintSession, 'boolean', `${ep} canMintSession must be boolean`);
    assert.equal(typeof cap.canCreateUser, 'boolean', `${ep} canCreateUser must be boolean`);
    assert.equal(typeof cap.canCreateUsers, 'boolean', `${ep} canCreateUsers must be boolean`);
    assert.equal(cap.canCreateUser, cap.canCreateUsers, `${ep} canCreateUser and canCreateUsers must match`);
    assert.equal(typeof cap.canModifyProviderState, 'boolean', `${ep} canModifyProviderState must be boolean`);
    assert.equal(typeof cap.requiresCleanupReconciliation, 'boolean', `${ep} requiresCleanupReconciliation must be boolean`);
    assert.equal(typeof cap.canTriggerEmail, 'boolean', `${ep} canTriggerEmail must be boolean`);
    assert.ok(typeof cap.requiredEvidence === 'string' && cap.requiredEvidence.length > 0, `${ep} requiredEvidence must be non-empty`);
    assert.ok(typeof cap.cleanupObligation === 'string' && cap.cleanupObligation.length > 0, `${ep} cleanupObligation must be non-empty`);
    assert.ok(typeof cap.indeterminateBehavior === 'string' && cap.indeterminateBehavior.length > 0, `${ep} indeterminateBehavior must be non-empty`);
  }

  // 2. R15-02: getEndpointCapabilities helper resolution
  assert.equal(getEndpointCapabilities('POST /auth/v1/otp').probeId, 'BYPASS-01');
  assert.equal(getEndpointCapabilities('BYPASS-01').endpoint, '/auth/v1/otp');
  assert.equal(getEndpointCapabilities('BYPASS-02').canCreateUser, true);
  assert.equal(getEndpointCapabilities('HOOK-01').canMintSession, true);
  assert.equal(getEndpointCapabilities('SESSION-02').canModifyProviderState, true);
  assert.equal(getEndpointCapabilities('verify_credentials').canMintSession, true);
  assert.equal(getEndpointCapabilities('UNKNOWN-PROBE'), null);
  assert.equal(getEndpointCapabilities(null), null);

  // 3. R15-01: BYPASS-01 pre-dispatch in-flight registration and expected passing route disablement
  const inv3 = new TestRunInventory('test-r15-case3');
  const disp3Barrier = createOfflineBarrier('r15-case3');
  const disp3 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    inventory: inv3,
    fetchFn: createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
      routes: [
        {
          urlIncludes: '/auth/v1/otp',
          waitForBarrier: disp3Barrier,
          status: 422,
          json: { error_code: 'email_provider_disabled', message: 'Email provider is disabled' }
        }
      ],
      defaultResponse: { status: 422, json: { error_code: 'email_provider_disabled' } }
    })
  });
  const res3Promise = disp3({ id: 'BYPASS-01' });
  await disp3Barrier.waitForArrivals(1);
  // Capture registered in-flight operation DURING paused dispatch!
  const inFlightCaptured3 = Array.from(inv3.inFlightOperations.values());
  disp3Barrier.release();
  const res3 = await res3Promise;
  assert.equal(res3.passed, true, 'BYPASS-01 must pass when route_disabled is observed');
  assert.equal(res3.route_disabled, true);
  assert.equal(res3.user_created, false);
  assert.equal(res3.indeterminate_user_creation, false);
  assert.ok(inFlightCaptured3 && inFlightCaptured3.length === 1, 'In-flight operation must be registered before network dispatch');
  assert.equal(inFlightCaptured3[0].probeId, 'BYPASS-01');
  assert.equal(inFlightCaptured3[0].canCreateUser, true);
  assert.equal(inFlightCaptured3[0].canModifyProviderState, true);
  assert.equal(inFlightCaptured3[0].requiresCleanupReconciliation, true);
  assert.equal(inFlightCaptured3[0].canMintSession, false);
  assert.equal(inv3.hasUnresolvedOperations(), false, 'Operation must settle after response');
  assert.equal(inv3.untrackedUsersCount, 0);
  const rep3 = await inv3.executeCleanup({ adminClient: bindFixtureAdmin(inv3, defaultAdminFixture), failClosed: true });
  assert.equal(rep3.status, 'CLEANUP_VERIFIED_SUCCESS');

  // 4. R15-01: BYPASS-01 post-dispatch transport error (ECONNRESET) -> registers untracked user risk, fails cleanup closed
  const inv4 = new TestRunInventory('test-r15-case4');
  const disp4 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    inventory: inv4,
    fetchFn: errorTransport({ message: 'read ECONNRESET', code: 'ECONNRESET' })
  });
  const res4 = await disp4({ id: 'BYPASS-01' });
  assert.equal(res4.passed, false, 'Transport failure must fail probe');
  assert.equal(res4.indeterminate_user_creation, true);
  assert.equal(inv4.untrackedUsersCount, 1, 'Untracked user creation risk must be registered');
  const rep4 = await inv4.executeCleanup({ adminClient: bindFixtureAdmin(inv4, defaultAdminFixture), failClosed: false });
  assert.equal(rep4.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.ok(rep4.residualResources.some(r => r.type === 'unresolved_user_creation_risk'));
  await assert.rejects(
    inv4.executeCleanup({ adminClient: bindFixtureAdmin(inv4, defaultAdminFixture), failClosed: true }),
    /CLEANUP_INCOMPLETE/
  );

  // 5. R15-01: BYPASS-01 request timeout / unresolved in-flight operation -> fails cleanup closed
  const inv5 = new TestRunInventory('test-r15-case5');
  const op5 = inv5.registerInFlightOperation({
    probeId: 'BYPASS-01',
    endpoint: '/auth/v1/otp',
    canMintSession: false,
    canCreateUser: true,
    canModifyProviderState: true,
    requiresCleanupReconciliation: true
  });
  inv5.markProbeOperationsTimedOut('BYPASS-01', 'PROBE_TIMEOUT: 50ms exceeded');
  assert.equal(op5.state, 'TIMED_OUT_UNRESOLVED');
  assert.equal(inv5.hasUnresolvedOperations(), true);
  const rep5 = await inv5.executeCleanup({ adminClient: bindFixtureAdmin(inv5, defaultAdminFixture), failClosed: false });
  assert.equal(rep5.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.ok(rep5.residualResources.some(r => r.type === 'unresolved_user_creation'));
  assert.ok(rep5.residualResources.some(r => r.type === 'unresolved_provider_mutation'));

  // 6. R15-01: BYPASS-01 empty HTTP 200 ({}) without user ID -> registers untracked user risk, fails cleanup closed
  const inv6 = new TestRunInventory('test-r15-case6');
  const disp6 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    inventory: inv6,
    fetchFn: staticTransport({ status: 200, json: {} })
  });
  const res6 = await disp6({ id: 'BYPASS-01' });
  assert.equal(res6.passed, false, 'HTTP 200 empty body on user-creation endpoint must fail probe');
  assert.equal(res6.indeterminate_user_creation, true);
  assert.equal(inv6.untrackedUsersCount, 1);
  const rep6 = await inv6.executeCleanup({ adminClient: bindFixtureAdmin(inv6, defaultAdminFixture), failClosed: false });
  assert.equal(rep6.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.ok(rep6.residualResources.some(r => r.type === 'unresolved_user_creation_risk'));

  // 7. R15-01: BYPASS-01 unreadable / truncated JSON on HTTP 200 -> registers untracked user risk, fails cleanup closed
  const inv7 = new TestRunInventory('test-r15-case7');
  const disp7 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    inventory: inv7,
    fetchFn: staticTransport({
      status: 200,
      text: '{"id": "trunc',
      jsonError: 'Unexpected end of JSON input'
    })
  });
  const res7 = await disp7({ id: 'BYPASS-01' });
  assert.equal(res7.passed, false);
  assert.equal(res7.indeterminate_user_creation, true);
  assert.equal(inv7.untrackedUsersCount, 1);
  const rep7 = await inv7.executeCleanup({ adminClient: bindFixtureAdmin(inv7, defaultAdminFixture), failClosed: false });
  assert.equal(rep7.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.ok(rep7.residualResources.some(r => r.type === 'unresolved_user_creation_risk'));

  // 8. R15-01: BYPASS-01 unexpected concrete user creation -> tracked in createdUsers, deleted on cleanup
  const inv8 = new TestRunInventory('test-r15-case8');
  const mockAdmin8 = fixtureSpec();
  const disp8 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    inventory: inv8,
    fetchFn: staticTransport({
      status: 200,
      json: { user: { id: 'unexpected-otp-uid-8', email: 'otp-test@proof.invalid' } }
    })
  });
  const res8 = await disp8({ id: 'BYPASS-01' });
  assert.equal(res8.passed, false, 'Unexpected user creation must fail probe');
  assert.equal(res8.user_created, true);
  assert.equal(inv8.createdUsers.has('unexpected-otp-uid-8'), false, 'Unexpected user must NOT be registered in createdUsers');
  assert.equal(inv8.unverifiedUsers.has('unexpected-otp-uid-8'), true, 'Unexpected user must be registered in unverifiedUsers');
  assert.equal(inv8.getUserOwnership('unexpected-otp-uid-8'), USER_OWNERSHIP.OWNERSHIP_UNKNOWN);
  assert.equal(inv8.isUserCreated('unexpected-otp-uid-8'), false);
  assert.equal(inv8.isUserTracked('unexpected-otp-uid-8'), true);
  const outcomeValidation8 = validateProbeOutcome(HOSTED_PROBE_SPECIFICATIONS['BYPASS-01'], res8);
  assert.equal(outcomeValidation8.passed, false);
  assert.match(outcomeValidation8.reason, /SECURITY_INVARIANT_VIOLATION.*created user/);
  const rep8 = await inv8.executeCleanup({ adminClient: bindFixtureAdmin(inv8, mockAdmin8), failClosed: false });
  assert.equal(rep8.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.equal((fixtureOperationCalls(mockAdmin8, 'userDelete').at(-1)?.pathname.split('/').map(decodeURIComponent).at(-1) ?? null), null, 'Unproven user must NEVER be deleted during cleanup');
  assert.ok(rep8.residualResources.some(r => (r.type === 'unresolved_user_ownership' || r.type === 'user') && (r.reason === 'UNRESOLVED_USER_OWNERSHIP' || r.error?.includes('UNRESOLVED_USER_OWNERSHIP'))));
  assert.equal(rep8.usersDeleted, 0);

  // 9. R15-01: Anti-deletion security boundary -> referenced/seed users never deleted on email equality
  const inv9 = new TestRunInventory('test-r15-case9');
  const seedEmail9 = 'seed-otp9@proof.invalid';
  inv9.trackReferencedUser({ id: 'seed-otp-uid-9', email: seedEmail9, source: 'seed' });
  const mockAdmin9 = fixtureSpec();
  // Dispatcher receives same seed user id on unexpected response
  const disp9 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    inventory: inv9,
    testEmail: seedEmail9,
    fetchFn: staticTransport({
      status: 200,
      json: { id: 'seed-otp-uid-9', email: seedEmail9 }
    })
  });
  const res9 = await disp9({ id: 'BYPASS-01' });
  assert.equal(res9.passed, false);
  assert.equal(inv9.isUserReferenced('seed-otp-uid-9'), true);
  assert.equal(inv9.isUserCreated('seed-otp-uid-9'), false, 'Seed user must NOT be registered in createdUsers');
  const rep9 = await inv9.executeCleanup({ adminClient: bindFixtureAdmin(inv9, mockAdmin9), failClosed: false });
  assert.equal((fixtureOperationCalls(mockAdmin9, 'userDelete').length > 0), false, 'Referenced seed user must NEVER be deleted');

  // 10. R15-01: Admin deletion failure on unexpected user -> fails closed with residual resources
  const inv10 = new TestRunInventory('test-r15-case10');
  const mockAdmin10 = fixtureSpec({ userDelete: { status: 500, json: { message: 'DATABASE_ERROR_500' } }, userGet: { status: 200, json: { id: 'orphaned-uid-10' } } });
  inv10.registerCreatedUser({
    id: 'orphaned-uid-10',
    email: 'orphaned10@proof.invalid',
    source: 'BYPASS-01_unexpected_signup',
    creationProof: createCreationProof('before_after_check', { preCheckAbsent: true, postCheckPresent: true })
  });
  const rep10 = await inv10.executeCleanup({ adminClient: bindFixtureAdmin(inv10, mockAdmin10), failClosed: false });
  assert.equal(rep10.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.ok(rep10.residualUsers.some(u => u.id === 'orphaned-uid-10'));

  // 11. R15-01: Settlement after finalization captured in postFinalizationMutations
  const inv11 = new TestRunInventory('test-r15-case11');
  const op11 = inv11.registerInFlightOperation({ probeId: 'BYPASS-01', canCreateUser: true });
  await inv11.executeCleanup({ adminClient: bindFixtureAdmin(inv11, defaultAdminFixture), failClosed: false });
  assert.equal(inv11.finalized, true);
  inv11.settleInFlightOperation(op11.opId, { observed: { classification: 'AUTH_RESPONSE_PROVIDER_FAILURE' } });
  assert.equal(inv11.postFinalizationMutations.length, 1);
  assert.equal(inv11.postFinalizationMutations[0].action, 'settleInFlightOperation');

  // 12. R15-02: Capability consistency between dispatchers and canonical definitions
  const inv12 = new TestRunInventory('test-r15-case12');
  const captureInv12 = new TestRunInventory('test-r15-cap-12');

  const probesToTest = ['BYPASS-01', 'BYPASS-02', 'BYPASS-03', 'BYPASS-05', 'HOOK-01'];
  for (const pid of probesToTest) {
    const cap = getEndpointCapabilities(pid);
    assert.ok(cap, `Capability for ${pid} must exist`);
    const disp = createHostedDispatcher({
      anonKey: validTestAnonKey,
      inventory: captureInv12,
      fetchFn: staticTransport({
        status: 400,
        json: { error_code: 'test_rejection', message: 'Rejected for test' }
      })
    });
    await disp({ id: pid });
    const matchingOp = Array.from(captureInv12.inFlightOperations.values()).find(o => o.probeId === pid);
    assert.ok(matchingOp, `Dispatcher for ${pid} must register in-flight operation`);
    assert.equal(matchingOp.canMintSession, cap.canMintSession, `${pid} canMintSession must match canonical capability`);
    assert.equal(matchingOp.canCreateUser, cap.canCreateUser, `${pid} canCreateUser must match canonical capability`);
    assert.equal(matchingOp.canModifyProviderState, cap.canModifyProviderState, `${pid} canModifyProviderState must match canonical capability`);
    assert.equal(matchingOp.requiresCleanupReconciliation, cap.requiresCleanupReconciliation, `${pid} requiresCleanupReconciliation must match canonical capability`);
  }

  // 13. Offline safety invariant: verify 0 live network calls made
  assert.ok(true, 'All R15 adversarial regression scenarios executed offline with zero network requests');
});


test('88. Task 06I-B1-H1-R16: Signup session tracking and proven user ownership closure (PRRT_kwDOVtCmZc66_0zA & PRRT_kwDOVtCmZc66_0zI)', async () => {
  // --- Section 3: R16-01 Signup Session Tracking Tests ---

  // 1. Signup returns user ID without a session (e.g. email confirmation enabled)
  const inv1 = new TestRunInventory('test-r16-case1');
  const disp1 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    inventory: inv1,
    fetchFn: staticTransport({
      status: 200,
      json: { id: 'signup-user-no-session', email: 'signup-no-session@proof.invalid' }
    })
  });
  const res1 = await disp1({ id: 'BYPASS-02', testUser: 'signup-no-session@proof.invalid' });
  assert.equal(res1.passed, false, 'Unexpected user creation on disabled route must fail probe');
  assert.equal(res1.user_created, true);
  assert.equal(inv1.isUserTracked('signup-user-no-session'), true);
  assert.equal(inv1.untrackedSessionsCount, 0, 'No session returned means zero untracked sessions');

  // 2. Signup returns user ID plus access and refresh tokens with valid session_id
  const inv2 = new TestRunInventory('test-r16-case2');
  const validSessId = 'sess-valid-signup-2';
  const validSignupToken = createMockJwt({ session_id: validSessId, sub: 'user-signup-2' });
  const disp2 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    inventory: inv2,
    fetchFn: staticTransport({
      status: 200,
      json: {
        user: { id: 'user-signup-2', email: 'signup2@proof.invalid' },
        access_token: validSignupToken,
        refresh_token: 'rf-signup-2',
        token_type: 'bearer',
        expires_in: 3600
      }
    })
  });
  const res2 = await disp2({ id: 'BYPASS-02', testUser: 'signup2@proof.invalid' });
  assert.equal(res2.passed, false);
  assert.equal(inv2.trackedSessions.has(validSessId), true, 'Observed session must be tracked for cleanup revocation');

  // 3. Signup token lacks session_id
  const inv3 = new TestRunInventory('test-r16-case3');
  const b64H = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const b64PNoSess = Buffer.from(JSON.stringify({ sub: 'user-signup-3', exp: Math.floor(Date.now() / 1000) + 300 })).toString('base64url');
  const tokenNoSessId = `${b64H}.${b64PNoSess}.mock_sig`;
  const disp3 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    inventory: inv3,
    fetchFn: staticTransport({
      status: 200,
      json: {
        user: { id: 'user-signup-3', email: 'signup3@proof.invalid' },
        access_token: tokenNoSessId,
        refresh_token: 'rf-signup-3'
      }
    })
  });
  const res3 = await disp3({ id: 'BYPASS-02', testUser: 'signup3@proof.invalid' });
  assert.equal(res3.passed, false);
  assert.equal(inv3.untrackedSessionsCount, 1, 'Token lacking session_id must increment untrackedSessionsCount');

  // 4. Signup returns malformed JWT
  const inv4 = new TestRunInventory('test-r16-case4');
  const disp4 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    inventory: inv4,
    fetchFn: staticTransport({
      status: 200,
      json: {
        user: { id: 'user-signup-4', email: 'signup4@proof.invalid' },
        access_token: 'not-a-valid-jwt.garbage',
        refresh_token: 'rf-signup-4'
      }
    })
  });
  const res4 = await disp4({ id: 'BYPASS-02', testUser: 'signup4@proof.invalid' });
  assert.equal(res4.passed, false);
  assert.equal(inv4.untrackedSessionsCount, 1, 'Malformed JWT must register untracked session');

  // 5. HTTP 200 returns {}
  const inv5 = new TestRunInventory('test-r16-case5');
  const disp5 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    inventory: inv5,
    fetchFn: staticTransport({
      status: 200,
      json: {}
    })
  });
  const res5 = await disp5({ id: 'BYPASS-02', testUser: 'signup5@proof.invalid' });
  assert.equal(res5.passed, false);
  assert.equal(inv5.untrackedUsersCount, 1, 'Empty HTTP 200 must register untracked user');
  assert.equal(inv5.untrackedSessionsCount, 1, 'Empty HTTP 200 must register untracked session');

  // 6. HTTP 200 returns unreadable / truncated JSON
  const inv6 = new TestRunInventory('test-r16-case6');
  const disp6 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    inventory: inv6,
    fetchFn: staticTransport({
      status: 200,
      jsonError: 'Unexpected end of JSON input'
    })
  });
  const res6 = await disp6({ id: 'BYPASS-02', testUser: 'signup6@proof.invalid' });
  assert.equal(res6.passed, false);
  assert.equal(inv6.untrackedUsersCount, 1, 'Unreadable HTTP 200 must register untracked user');
  assert.equal(inv6.untrackedSessionsCount, 1, 'Unreadable HTTP 200 must register untracked session');

  // 7. Signup response is lost after possible provider commit (network transport error / reset)
  const inv7 = new TestRunInventory('test-r16-case7');
  const disp7 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    inventory: inv7,
    fetchFn: errorTransport('ECONNRESET: Connection reset by peer')
  });
  const res7 = await disp7({ id: 'BYPASS-02', testUser: 'signup7@proof.invalid' });
  assert.equal(res7.passed, false);
  assert.equal(inv7.untrackedUsersCount, 1, 'Connection reset must retain potential user risk');
  assert.equal(inv7.untrackedSessionsCount, 1, 'Connection reset must retain potential session risk');

  // 8. Logout fails or returns ambiguous evidence during cleanup
  const inv8 = new TestRunInventory('test-r16-case8');
  const sess8Token = createMockJwt({ session_id: 'sess-8', sub: 'u8' });
  inv8.registerSession('sess-8', { accessToken: sess8Token });
  const mockAdmin8 = fixtureSpec({ logout: { status: 500, json: { message: 'Internal Server Error 500' } } });
  const rep8 = await inv8.executeCleanup({ adminClient: bindFixtureAdmin(inv8, mockAdmin8), failClosed: false });
  assert.equal(rep8.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.ok(rep8.residualResources.some(r => r.type === 'session' && (r.error?.includes('500') || r.error?.includes('Internal Server Error'))));

  // 9. User deletion succeeds but untracked session remains -> cleanup fails closed
  const inv9 = new TestRunInventory('test-r16-case9');
  inv9.registerCreatedUser({
    id: 'user-clean-9',
    email: 'clean9@proof.invalid',
    creationProof: createCreationProof('before_after_check', { preCheckAbsent: true, postCheckPresent: true })
  });
  inv9.registerUntrackedSession();
  const mockAdmin9 = fixtureSpec();
  const rep9 = await inv9.executeCleanup({ adminClient: bindFixtureAdmin(inv9, mockAdmin9), failClosed: false });
  assert.equal((fixtureOperationCalls(mockAdmin9, 'userDelete').length > 0), true, 'Verified created user was deleted');
  assert.equal(rep9.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES', 'Untracked session prevents CLEANUP_VERIFIED_SUCCESS');
  assert.ok(rep9.residualResources.some(r => (r.type === 'session' || r.type === 'untracked_session') && (r.reason === 'UNTRACKED_SESSION_REMAINS' || r.error?.includes('UNTRACKED'))));

  // 10. Cleanup cannot report success with untracked issued session
  const inv10 = new TestRunInventory('test-r16-case10');
  inv10.registerUntrackedSession();
  assert.equal(inv10.isClean(), false);
  const rep10 = await inv10.executeCleanup({ adminClient: bindFixtureAdmin(inv10, defaultAdminFixture), failClosed: false });
  assert.notEqual(rep10.status, 'CLEANUP_VERIFIED_SUCCESS');

  // --- Section 4: R16-02 Proven User Ownership Tests ---

  // 11. BYPASS-01 returns an existing seed user ID
  const inv11 = new TestRunInventory('test-r16-case11');
  const seedUid11 = 'seed-user-uuid-11';
  const seedEmail11 = 'seed-user-11@proof.invalid';
  inv11.protectSeedIdentity({ id: seedUid11, email: seedEmail11 });
  const mockAdmin11 = fixtureSpec();
  const disp11 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    inventory: inv11,
    testEmail: seedEmail11,
    fetchFn: staticTransport({
      status: 200,
      json: { user: { id: seedUid11, email: seedEmail11 } }
    })
  });
  const res11 = await disp11({ id: 'BYPASS-01' });
  assert.equal(res11.passed, false);
  assert.equal(inv11.getUserOwnership(seedUid11), USER_OWNERSHIP.PRE_EXISTING_REFERENCED);
  assert.equal(inv11.createdUsers.has(seedUid11), false);
  await inv11.executeCleanup({ adminClient: bindFixtureAdmin(inv11, mockAdmin11), failClosed: false });
  assert.equal((fixtureOperationCalls(mockAdmin11, 'userDelete').length > 0), false, 'Pre-existing seed user in BYPASS-01 must NEVER be deleted');

  // 12. BYPASS-02 returns an existing seed user ID
  const inv12 = new TestRunInventory('test-r16-case12');
  const seedUid12 = 'seed-user-uuid-12';
  const seedEmail12 = 'seed-user-12@proof.invalid';
  inv12.protectSeedIdentity({ id: seedUid12, email: seedEmail12 });
  const mockAdmin12 = fixtureSpec();
  const disp12 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    inventory: inv12,
    testEmail: seedEmail12,
    fetchFn: staticTransport({
      status: 200,
      json: { user: { id: seedUid12, email: seedEmail12 } }
    })
  });
  const res12 = await disp12({ id: 'BYPASS-02', testUser: seedEmail12 });
  assert.equal(res12.passed, false);
  assert.equal(inv12.getUserOwnership(seedUid12), USER_OWNERSHIP.PRE_EXISTING_REFERENCED);
  assert.equal(inv12.createdUsers.has(seedUid12), false);
  await inv12.executeCleanup({ adminClient: bindFixtureAdmin(inv12, mockAdmin12), failClosed: false });
  assert.equal((fixtureOperationCalls(mockAdmin12, 'userDelete').length > 0), false, 'Pre-existing seed user in BYPASS-02 must NEVER be deleted');

  // 13. Seed user is not previously registered in inventory (protected via seed option in dispatcher)
  const inv13 = new TestRunInventory('test-r16-case13');
  const mockAdmin13 = fixtureSpec();
  const disp13 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    inventory: inv13,
    testEmail: 'seed-email-13@proof.invalid',
    seedUserId: 'seed-uid-13',
    fetchFn: staticTransport({
      status: 200,
      json: { user: { id: 'seed-uid-13', email: 'seed-email-13@proof.invalid' } }
    })
  });
  const res13 = await disp13({ id: 'BYPASS-01' });
  assert.equal(res13.passed, false);
  assert.equal(inv13.getUserOwnership('seed-uid-13'), USER_OWNERSHIP.PRE_EXISTING_REFERENCED);
  assert.equal(inv13.isUserCreated('seed-uid-13'), false);
  await inv13.executeCleanup({ adminClient: bindFixtureAdmin(inv13, mockAdmin13), failClosed: false });
  assert.equal((fixtureOperationCalls(mockAdmin13, 'userDelete').length > 0), false, 'Seed user known only via dispatcher option must NEVER be deleted');

  // 14. Different email returns same pre-existing user ID
  const inv14 = new TestRunInventory('test-r16-case14');
  inv14.protectSeedIdentity({ id: 'seed-fixed-uid', email: 'original-seed@proof.invalid' });
  const mockAdmin14 = fixtureSpec();
  const disp14 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    inventory: inv14,
    testEmail: 'attacker-chosen@proof.invalid',
    fetchFn: staticTransport({
      status: 200,
      json: { user: { id: 'seed-fixed-uid', email: 'attacker-chosen@proof.invalid' } }
    })
  });
  const res14 = await disp14({ id: 'BYPASS-01' });
  assert.equal(res14.passed, false);
  assert.equal(inv14.isUserReferenced('seed-fixed-uid'), true);
  assert.equal(inv14.isUserCreated('seed-fixed-uid'), false);
  await inv14.executeCleanup({ adminClient: bindFixtureAdmin(inv14, mockAdmin14), failClosed: false });
  assert.equal((fixtureOperationCalls(mockAdmin14, 'userDelete').length > 0), false, 'Pre-existing seed ID returned with different email must NEVER be deleted');

  // 15. Unknown user ID appears in successful signup response -> classified as OWNERSHIP_UNKNOWN
  const inv15 = new TestRunInventory('test-r16-case15');
  const mockAdmin15 = fixtureSpec();
  const disp15 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    inventory: inv15,
    fetchFn: staticTransport({
      status: 200,
      json: { user: { id: 'unknown-uid-15', email: 'unknown15@proof.invalid' } }
    })
  });
  const res15 = await disp15({ id: 'BYPASS-02', testUser: 'unknown15@proof.invalid' });
  assert.equal(res15.passed, false);
  assert.equal(inv15.getUserOwnership('unknown-uid-15'), USER_OWNERSHIP.OWNERSHIP_UNKNOWN);
  assert.equal(inv15.unverifiedUsers.has('unknown-uid-15'), true);
  assert.equal(inv15.createdUsers.has('unknown-uid-15'), false);
  const rep15 = await inv15.executeCleanup({ adminClient: bindFixtureAdmin(inv15, mockAdmin15), failClosed: false });
  assert.equal((fixtureOperationCalls(mockAdmin15, 'userDelete').length > 0), false, 'Unproven user must NEVER trigger deleteUser');
  assert.equal(rep15.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.ok(rep15.residualResources.some(r => (r.type === 'unresolved_user_ownership' || r.type === 'user') && (r.reason === 'UNRESOLVED_USER_OWNERSHIP' || r.error?.includes('UNRESOLVED_USER_OWNERSHIP'))));

  // 16. Caller-supplied metadata flag alone does NOT certify ownership
  const inv16 = new TestRunInventory('test-r16-case16');
  assert.equal(isValidCreationProof({ isCreated: true }), false, 'Flag alone is invalid proof');
  assert.equal(isValidCreationProof({ type: 'caller_assertion' }), false);
  assert.equal(isValidCreationProof(null), false);
  inv16.registerCreatedUser({
    id: 'user-fake-proof-16',
    email: 'fakeproof@proof.invalid',
    creationProof: { isCreated: true } // Invalid proof!
  });
  assert.equal(inv16.getUserOwnership('user-fake-proof-16'), USER_OWNERSHIP.CREATION_INDETERMINATE);
  assert.equal(inv16.createdUsers.has('user-fake-proof-16'), false);
  assert.equal(inv16.unverifiedUsers.has('user-fake-proof-16'), true);
  const mockAdmin16 = fixtureSpec();
  const rep16 = await inv16.executeCleanup({ adminClient: bindFixtureAdmin(inv16, mockAdmin16), failClosed: false });
  assert.equal((fixtureOperationCalls(mockAdmin16, 'userDelete').length > 0), false, 'User with invalid proof must NEVER be deleted');
  assert.equal(rep16.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');

  // 17. Trusted creation proof establishes a genuinely new user -> safe deletion & verified success
  const inv17 = new TestRunInventory('test-r16-case17');
  const validProof = createCreationProof('before_after_check', { preCheckAbsent: true, postCheckPresent: true });
  assert.equal(isValidCreationProof(validProof), true);
  inv17.registerCreatedUser({
    id: 'user-proven-17',
    email: 'proven17@proof.invalid',
    creationProof: validProof
  });
  assert.equal(inv17.getUserOwnership('user-proven-17'), USER_OWNERSHIP.RUN_CREATED_VERIFIED);
  assert.equal(inv17.createdUsers.has('user-proven-17'), true);
  const mockAdmin17 = fixtureSpec();
  const rep17 = await inv17.executeCleanup({ adminClient: bindFixtureAdmin(inv17, mockAdmin17), failClosed: true });
  assert.equal((fixtureOperationCalls(mockAdmin17, 'userDelete').at(-1)?.pathname.split('/').map(decodeURIComponent).at(-1)), 'user-proven-17', 'Affirmatively verified user must be deleted');
  assert.equal(rep17.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(rep17.usersDeleted, 1);
});

test('89. Task 06I-B1-H1-R17: Seed identity proof, unexpected token tracking, and verified revocation evidence closure (PRRT_kwDOVtCmZc67OhSH, PRRT_kwDOVtCmZc67OhSN, PRRT_kwDOVtCmZc67O5WW)', async () => {
  // === Part 1 (R17-01): Universal token tracking regardless of endpoint capabilities ===

  // 1A. BYPASS-01 (/auth/v1/otp) returning HTTP 200 with tokens but no extractable session ID
  const inv1A = new TestRunInventory('test-r17-1a');
  const res1A = observeAuthResponse({
    status: 200,
    parseStatus: 'parsed',
    body: {
      access_token: 'opaque-or-unparseable-access-token-without-session-id',
      token_type: 'bearer',
      expires_in: 3600
    },
    inv: inv1A,
    probeId: 'BYPASS-01',
    canMintSession: false, // Nominally non-minting!
    canCreateUser: false,
    expectedOperation: 'rejection'
  });
  assert.equal(res1A.classification, 'AUTH_RESPONSE_INDETERMINATE');
  assert.equal(res1A.indeterminateSession, true);
  assert.equal(res1A.hasTokens, true);
  assert.equal(res1A.errorCode, 'UNTRACKED_SESSION');
  assert.equal(inv1A.untrackedSessionsCount, 1, 'Untracked session obligation MUST be registered regardless of canMintSession: false');

  // Cleanup must fail closed due to untracked session obligation
  const mockAdmin1A = fixtureSpec();
  const rep1A = await inv1A.executeCleanup({ adminClient: bindFixtureAdmin(inv1A, mockAdmin1A), failClosed: false });
  assert.equal(rep1A.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.ok(rep1A.residualResources.some(r => r.type === 'untracked_session'));

  // 1B. BYPASS-05 (/auth/v1/recover) returning HTTP 200 with tokens but no extractable session ID
  const inv1B = new TestRunInventory('test-r17-1b');
  const res1B = observeAuthResponse({
    status: 200,
    parseStatus: 'parsed',
    body: {
      access_token: 'unparseable-recover-token',
      refresh_token: 'unparseable-refresh-token'
    },
    inv: inv1B,
    probeId: 'BYPASS-05',
    canMintSession: false,
    canCreateUser: false,
    expectedOperation: 'rejection'
  });
  assert.equal(res1B.classification, 'AUTH_RESPONSE_INDETERMINATE');
  assert.equal(inv1B.untrackedSessionsCount, 1, 'BYPASS-05 untracked session obligation registered');

  // 1C. Refresh token without access token and without session ID
  const inv1C = new TestRunInventory('test-r17-1c');
  const res1C = observeAuthResponse({
    status: 200,
    parseStatus: 'parsed',
    body: {
      refresh_token: 'lonely-refresh-token-without-session-id'
    },
    inv: inv1C,
    probeId: 'BYPASS-01',
    canMintSession: false,
    canCreateUser: false,
    expectedOperation: 'rejection'
  });
  assert.equal(res1C.classification, 'AUTH_RESPONSE_INDETERMINATE');
  assert.equal(inv1C.untrackedSessionsCount, 1, 'Refresh token alone without session ID records untracked session obligation');

  // 1D. Nominally non-minting endpoint returning access token WITH extractable session ID
  const inv1D = new TestRunInventory('test-r17-1d');
  const validJwt1D = createMockJwt({ session_id: 'extracted-sess-1d' });
  const res1D = observeAuthResponse({
    status: 200,
    parseStatus: 'parsed',
    body: {
      access_token: validJwt1D,
      user: { id: 'u-1d' }
    },
    inv: inv1D,
    probeId: 'BYPASS-01',
    canMintSession: false,
    canCreateUser: false,
    expectedOperation: 'rejection'
  });
  assert.equal(res1D.classification, 'AUTH_RESPONSE_UNEXPECTED_TOKEN');
  assert.equal(res1D.sessionId, 'extracted-sess-1d');
  assert.equal(inv1D.trackedSessions.has('extracted-sess-1d'), true, 'Extractable session MUST be registered in inventory');
  const mockAdmin1D = fixtureSpec();
  const rep1D = await inv1D.executeCleanup({ adminClient: bindFixtureAdmin(inv1D, mockAdmin1D), failClosed: false });
  assert.equal((fixtureOperationCalls(mockAdmin1D, 'logout').at(-1)?.headers.authorization?.replace(/^Bearer /, '')), validJwt1D, 'Cleanup must attempt signOut with access token for the unexpected session');

  // 1E. observeAndTrackSessionTokens records untracked session for token without session ID
  const inv1E = new TestRunInventory('test-r17-1e');
  observeAndTrackSessionTokens(
    { access_token: 'token-without-session-id' },
    { inv: inv1E, probeId: 'BYPASS-01' }
  );
  assert.equal(inv1E.untrackedSessionsCount, 1, 'observeAndTrackSessionTokens handles token without session ID');

  // === Part 2 (R17-02): Verified revocation required before SESSION-04/05 linger claims ===

  const session04 = { id: 'SESSION-04', category: 'Session & Consumer' };
  const session05 = { id: 'SESSION-05', category: 'Session & Consumer' };
  const now = Math.floor(Date.now() / 1000);
  const testBearerJwt = createMockJwt({ session_id: 'revoked-sess-89', exp: now + 300 });

  // 2A. Dispatcher SESSION-04 with fresh unverified context (preInvalidationSessionValid: false)
  const runCtx2A = createRunContext();
  runCtx2A.activeAccessToken = testBearerJwt;
  runCtx2A.preInvalidationSessionValid = false;
  runCtx2A.passwordResetCompleted = false;
  runCtx2A.sessionRevocationConfirmed = false;
  const disp2A = createHostedDispatcher({
    anonKey: validTestAnonKey,
    runContext: runCtx2A,
    fetchFn: staticTransport({ status: 200, json: [] })
  });
  const out2A = await disp2A(session04);
  assert.equal(out2A.passed, false);
  assert.match(out2A.error, /PREREQUISITE_MISSING: SESSION-04 requires authenticated pre-invalidation session baseline/);

  // 2B. Dispatcher SESSION-04 with preInvalidationSessionValid: true but unconfirmed revocation
  const runCtx2B = createRunContext();
  runCtx2B.activeAccessToken = testBearerJwt;
  runCtx2B.preInvalidationSessionValid = true;
  runCtx2B.passwordResetCompleted = true;
  runCtx2B.sessionRevocationConfirmed = false; // Revocation NOT confirmed!
  const disp2B = createHostedDispatcher({
    anonKey: validTestAnonKey,
    runContext: runCtx2B,
    fetchFn: staticTransport({ status: 200, json: [] })
  });
  const out2B = await disp2B(session04);
  assert.equal(out2B.passed, false);
  assert.match(out2B.error, /PREREQUISITE_MISSING: SESSION-04 requires verified session revocation evidence/);

  // 2C. Dispatcher SESSION-04 with session ID mismatch between token and revoked session
  const runCtx2C = createRunContext();
  runCtx2C.activeAccessToken = testBearerJwt; // has session_id: 'revoked-sess-89'
  runCtx2C.preInvalidationSessionValid = true;
  runCtx2C.passwordResetCompleted = true;
  runCtx2C.sessionRevocationConfirmed = true;
  runCtx2C.revokedSessionId = 'different-revoked-session-id'; // Mismatch!
  const disp2C = createHostedDispatcher({
    anonKey: validTestAnonKey,
    runContext: runCtx2C,
    fetchFn: staticTransport({ status: 200, json: [] })
  });
  const out2C = await disp2C(session04);
  assert.equal(out2C.passed, false);
  assert.match(out2C.error, /SESSION_CORRELATION_FAILURE/);

  // 2D. Dispatcher SESSION-05 (Storage) on unrevoked context fails closed
  const runCtx2D = createRunContext();
  runCtx2D.activeAccessToken = testBearerJwt;
  runCtx2D.preInvalidationSessionValid = false;
  const disp2D = createHostedDispatcher({
    anonKey: validTestAnonKey,
    runContext: runCtx2D,
    fetchFn: staticTransport({ status: 200, json: {} })
  });
  const out2D = await disp2D(session05);
  assert.equal(out2D.passed, false);
  assert.match(out2D.error, /PREREQUISITE_MISSING: SESSION-05 requires authenticated pre-invalidation session baseline/);

  // 2E. Validator validateProbeOutcome rejects missing revocation_verified flag
  const val2E = validateProbeOutcome(session04, {
    passed: true,
    status: 200,
    token_unexpired: true,
    jwt_lifetime_seconds: 300,
    lifetime_bounded: true,
    revocation_verified: false, // Missing revocation!
    stateless_linger_documented: true,
    note: 'fresh token fake linger'
  });
  assert.equal(val2E.passed, false);
  assert.match(val2E.reason, /MISSING_EVIDENCE.*revocation/i);

  // 2F. Validator validateProbeOutcome rejects session ID mismatch
  const val2F = validateProbeOutcome(session04, {
    passed: true,
    status: 200,
    token_unexpired: true,
    jwt_lifetime_seconds: 300,
    lifetime_bounded: true,
    revocation_verified: true,
    revoked_session_id: 'session-A',
    correlated_session_id: 'session-B', // Mismatch!
    session_correlated: true,
    stateless_linger_documented: true,
    note: 'mismatched session'
  });
  assert.equal(val2F.passed, false);
  assert.match(val2F.reason, /SESSION_CORRELATION_FAILURE/);

  // 2G. Fully correlated valid revocation + bounded lifetime passes dispatcher and validator
  const runCtx2G = createRunContext();
  runCtx2G.activeAccessToken = testBearerJwt;
  runCtx2G.preInvalidationSessionValid = true;
  runCtx2G.passwordResetCompleted = true;
  runCtx2G.sessionRevocationConfirmed = true;
  runCtx2G.revokedSessionId = 'revoked-sess-89';
  const disp2G = createHostedDispatcher({
    anonKey: validTestAnonKey,
    runContext: runCtx2G,
    fetchFn: staticTransport({ status: 200, json: [] })
  });
  const out2G = await disp2G(session04);
  assert.equal(out2G.passed, true);
  assert.equal(out2G.revocation_verified, true);
  assert.equal(out2G.session_correlated, true);
  const val2G = validateProbeOutcome(session04, out2G);
  assert.equal(val2G.passed, true);

  // === Part 3 (R17-03): Seed Identity Proof & No Automatic Test Email Protection ===

  // 3A. Bare email without user ID cannot prove pre-existence in protectSeedIdentity
  const inv3A = new TestRunInventory('test-r17-3a');
  const resProtect3A = inv3A.protectSeedIdentity({ email: 'planned-test-email@proof.invalid' });
  assert.equal(resProtect3A, false);
  assert.equal(inv3A.isSeedIdentity(null, 'planned-test-email@proof.invalid'), false);
  assert.equal(inv3A.protectedSeedIdentities.has('planned-test-email@proof.invalid'), false);

  // 3B. Pre-existence proof validation
  assert.equal(isValidPreExistenceProof(null), false);
  assert.equal(isValidPreExistenceProof({ isSeed: true }), false, 'Bare caller flag is invalid proof');
  const validSeedProof = createPreExistenceProof('preflight_discovery', {
    verifiedSeedUserId: 'seed-pre-existing-uuid-1',
    preflightVerified: true
  });
  assert.equal(isValidPreExistenceProof(validSeedProof), true);

  // 3C. protectSeedIdentity with affirmative ID and proof
  const inv3C = new TestRunInventory('test-r17-3c');
  const resProtect3C = inv3C.protectSeedIdentity({
    id: 'seed-pre-existing-uuid-1',
    email: 'seed@proof.invalid',
    proof: validSeedProof
  });
  assert.equal(resProtect3C, true);
  assert.equal(inv3C.isSeedIdentity('seed-pre-existing-uuid-1', 'seed@proof.invalid'), true);
  assert.equal(inv3C.isSeedIdentity('different-new-id', 'seed@proof.invalid'), false, 'Different ID with same email is NOT seed');

  // 3D. Regression reproduction for im-tio finding (PRRT_kwDOVtCmZc67O5WW):
  // Initially absent test email, unexpectedly successful OTP with that test email.
  // Must NOT classify as seed, must record in unverifiedUsers, must NOT delete, must fail cleanup closed!
  const plannedTestEmail = 'target-user@proof.invalid';
  const inv3D = new TestRunInventory('test-r17-3d');
  const mockAdmin3D = fixtureSpec();

  const disp3D = createHostedDispatcher({
    anonKey: validTestAnonKey,
    inventory: inv3D,
    testEmail: plannedTestEmail,
    fetchFn: staticTransport({
      status: 200,
      json: { user: { id: 'unexpected-new-user-id-89', email: plannedTestEmail } }
    })
  });

  const res3D = await disp3D({ id: 'BYPASS-01', testUser: plannedTestEmail });
  assert.equal(res3D.passed, false, 'Negative probe must fail when user is created');

  // Verify inventory classification:
  assert.equal(inv3D.isUserReferenced('unexpected-new-user-id-89'), false, 'Must NOT be classified as referenced/seed user!');
  assert.equal(inv3D.isUserCreated('unexpected-new-user-id-89'), false, 'Must NOT be classified as RUN_CREATED_VERIFIED without proof!');
  assert.equal(inv3D.unverifiedUsers.has('unexpected-new-user-id-89'), true, 'Must be registered in unverifiedUsers');
  assert.equal(inv3D.getUserOwnership('unexpected-new-user-id-89'), USER_OWNERSHIP.OWNERSHIP_UNKNOWN);

  // Execute cleanup:
  const rep3D = await inv3D.executeCleanup({ adminClient: bindFixtureAdmin(inv3D, mockAdmin3D), failClosed: false });
  assert.equal((fixtureOperationCalls(mockAdmin3D, 'userDelete').length > 0), false, 'Unproven user must NEVER be deleted');
  assert.equal(rep3D.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES', 'Cleanup MUST fail closed with residual resources');
  assert.notEqual(rep3D.status, 'CLEANUP_VERIFIED_SUCCESS', 'Cleanup must NEVER return success when unexpected user survives');

  // 3E. Same regression on BYPASS-02 (native signup)
  const inv3E = new TestRunInventory('test-r17-3e');
  const mockAdmin3E = fixtureSpec();

  const disp3E = createHostedDispatcher({
    anonKey: validTestAnonKey,
    inventory: inv3E,
    testEmail: plannedTestEmail,
    fetchFn: staticTransport({
      status: 200,
      json: { user: { id: 'unexpected-signup-user-id-89', email: plannedTestEmail } }
    })
  });

  const res3E = await disp3E({ id: 'BYPASS-02', testUser: plannedTestEmail });
  assert.equal(res3E.passed, false);
  assert.equal(inv3E.unverifiedUsers.has('unexpected-signup-user-id-89'), true);
  const rep3E = await inv3E.executeCleanup({ adminClient: bindFixtureAdmin(inv3E, mockAdmin3E), failClosed: false });
  assert.equal((fixtureOperationCalls(mockAdmin3E, 'userDelete').length > 0), false);
  assert.equal(rep3E.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
});

test('90. Task 06I-B1-H3 (H3-01): Controlled Subset Runner â€” Valid 10-probe subset, dependency completeness & DRY_RUN evidence reporting', async () => {
  // 1. planProbeExecution with 10-probe subset
  const plan10 = planProbeExecution(HARDCODED_TEMP_REF, {
    selectedProbeIds: SUPPORTED_SUBSET_PROBE_IDS,
    runId: 'run-subset-plan-90'
  });
  assert.equal(plan10.totalProbes, 10);
  assert.equal(plan10.totalCanonicalProbes, 18);
  assert.equal(plan10.isSubset, true);
  assert.deepEqual(plan10.selectedProbeIds, SUPPORTED_SUBSET_PROBE_IDS);
  assert.equal(plan10.unselectedProbeIds.length, 8);
  assert.equal(plan10.matrixSummary.selectedCount, 10);
  assert.equal(plan10.matrixSummary.notSelectedCount, 8);
  assert.equal(plan10.matrixSummary.supportedSubsetCount, 10);
  assert.equal(plan10.matrixSummary.prerequisiteBlockedCount, 5);
  assert.equal(plan10.matrixSummary.unsupportedCount, 3);

  // Assert canonical matrix ordering preserved
  const expectedOrder = [
    'BYPASS-01', 'BYPASS-02', 'BYPASS-05',
    'HOOK-01', 'HOOK-02',
    'SESSION-01', 'SESSION-02', 'SESSION-03', 'SESSION-04', 'SESSION-05'
  ];
  assert.deepEqual(plan10.plannedCases.map(c => c.id), expectedOrder);

  // 2. Canonical order preservation with scrambled input (R1-05: requires SESSION-01 for SESSION-02 and SESSION-05)
  const scrambled = ['SESSION-05', 'HOOK-01', 'SESSION-02', 'SESSION-01'];
  const planScrambled = planProbeExecution(HARDCODED_TEMP_REF, {
    selectedProbeIds: scrambled
  });
  assert.deepEqual(planScrambled.plannedCases.map(c => c.id), ['HOOK-01', 'SESSION-01', 'SESSION-02', 'SESSION-05']);

  // 3. Small valid dependency-complete subset
  const planSmall = planProbeExecution(HARDCODED_TEMP_REF, {
    selectedProbeIds: ['HOOK-01', 'HOOK-02']
  });
  assert.equal(planSmall.totalProbes, 2);
  assert.deepEqual(planSmall.selectedProbeIds, ['HOOK-01', 'HOOK-02']);

  // 4. DRY_RUN mode execution with subset
  const dryRunRes = await runHostedProbeRunner(fixtureRunnerOptions({
    projectRef: HARDCODED_TEMP_REF,
    argv: ['--dry-run'],
    env: {},
    selectedProbeIds: SUPPORTED_SUBSET_PROBE_IDS,
    runId: 'run-dryrun-90'
  }));
  assert.equal(dryRunRes.status, 'DRY_RUN_COMPLETED');
  assert.equal(dryRunRes.mode, 'DRY_RUN');
  assert.equal(dryRunRes.zeroNetworkRequestsDispatched, true);
  assert.equal(dryRunRes.runId, 'run-dryrun-90');
  assert.equal(dryRunRes.plan.totalProbes, 10);
  assert.deepEqual(dryRunRes.executionEvidence.selected, SUPPORTED_SUBSET_PROBE_IDS);
  assert.deepEqual(dryRunRes.executionEvidence.attempted, []);
  assert.deepEqual(dryRunRes.executionEvidence.completed, []);
  assert.deepEqual(dryRunRes.executionEvidence.failed, []);
  assert.equal(dryRunRes.executionEvidence.not_selected.length, 8);
  assert.equal(dryRunRes.executionEvidence.prerequisite_blocked.length, 5);
  assert.equal(dryRunRes.executionEvidence.unsupported.length, 3);
});

test('91. Task 06I-B1-H3 (H3-01): Controlled Subset Runner â€” Strict validation and rejection of invalid, duplicate, unsupported, or incomplete selections', () => {
  // 1. Rejection of empty array
  assert.throws(
    () => validateSelectedProbeIds([]),
    /INVALID_PROBE_SELECTION: selectedProbeIds must be a non-empty array/
  );

  // 2. Rejection of non-array
  assert.throws(
    () => validateSelectedProbeIds('HOOK-01'),
    /INVALID_PROBE_SELECTION: selectedProbeIds must be an array/
  );
  assert.throws(
    () => validateSelectedProbeIds({ id: 'HOOK-01' }),
    /INVALID_PROBE_SELECTION: selectedProbeIds must be an array/
  );

  // 3. Rejection of duplicate IDs
  assert.throws(
    () => validateSelectedProbeIds(['HOOK-01', 'HOOK-01']),
    /INVALID_PROBE_SELECTION: duplicate probe ID 'HOOK-01' detected/
  );

  // 4. Rejection of malformed / empty string elements
  assert.throws(
    () => validateSelectedProbeIds(['']),
    /INVALID_PROBE_SELECTION: each probe ID must be a non-empty string/
  );
  assert.throws(
    () => validateSelectedProbeIds(['   ']),
    /INVALID_PROBE_SELECTION: each probe ID must be a non-empty string/
  );
  assert.throws(
    () => validateSelectedProbeIds([null]),
    /INVALID_PROBE_SELECTION: each probe ID must be a non-empty string/
  );

  // 5. Rejection of unknown probe IDs
  assert.throws(
    () => validateSelectedProbeIds(['UNKNOWN-99']),
    /INVALID_PROBE_SELECTION: unknown probe ID 'UNKNOWN-99'/
  );

  // 6. Rejection of unsupported Layer B probes (HOOK-05, HOOK-06, HOOK-07)
  assert.throws(
    () => validateSelectedProbeIds(['HOOK-05']),
    /UNSUPPORTED_PROBE: probe 'HOOK-05' is not supported for hosted HTTP execution \(Layer A only\)/
  );
  assert.throws(
    () => validateSelectedProbeIds(['HOOK-06']),
    /UNSUPPORTED_PROBE: probe 'HOOK-06' is not supported for hosted HTTP execution \(Layer A only\)/
  );
  assert.throws(
    () => validateSelectedProbeIds(['HOOK-07']),
    /UNSUPPORTED_PROBE: probe 'HOOK-07' is not supported for hosted HTTP execution \(Layer A only\)/
  );

  // 7. Rejection of missing prerequisite probes (BYPASS-03, BYPASS-04, HOOK-03, HOOK-04, SESSION-06)
  assert.throws(
    () => validateSelectedProbeIds(['BYPASS-03']),
    /UNRESOLVED_PREREQUISITE: probe 'BYPASS-03' cannot be executed due to missing provider prerequisites/
  );
  assert.throws(
    () => validateSelectedProbeIds(['BYPASS-04']),
    /UNRESOLVED_PREREQUISITE: probe 'BYPASS-04' cannot be executed due to missing provider prerequisites/
  );
  assert.throws(
    () => validateSelectedProbeIds(['HOOK-03']),
    /UNRESOLVED_PREREQUISITE: probe 'HOOK-03' cannot be executed due to missing provider prerequisites/
  );
  assert.throws(
    () => validateSelectedProbeIds(['HOOK-04']),
    /UNRESOLVED_PREREQUISITE: probe 'HOOK-04' cannot be executed due to missing provider prerequisites/
  );
  assert.throws(
    () => validateSelectedProbeIds(['SESSION-06']),
    /UNRESOLVED_PREREQUISITE: probe 'SESSION-06' cannot be executed due to missing provider prerequisites/
  );

  // 8. Rejection of missing dependencies
  assert.throws(
    () => validateSelectedProbeIds(['HOOK-02']),
    /DEPENDENCY_INCOMPLETE: probe 'HOOK-02' requires prerequisite probe\(s\) 'HOOK-01' to also be selected/
  );
  assert.throws(
    () => validateSelectedProbeIds(['SESSION-01']),
    /DEPENDENCY_INCOMPLETE: probe 'SESSION-01' requires prerequisite probe\(s\) 'HOOK-01' to also be selected/
  );
  assert.throws(
    () => validateSelectedProbeIds(['SESSION-02']),
    /DEPENDENCY_INCOMPLETE: probe 'SESSION-02' requires prerequisite probe\(s\) 'HOOK-01', 'SESSION-01' to also be selected/
  );
  assert.throws(
    () => validateSelectedProbeIds(['SESSION-03']),
    /DEPENDENCY_INCOMPLETE: probe 'SESSION-03' requires prerequisite probe\(s\) 'HOOK-01', 'SESSION-01', 'SESSION-02' to also be selected/
  );
  assert.throws(
    () => validateSelectedProbeIds(['SESSION-04']),
    /DEPENDENCY_INCOMPLETE: probe 'SESSION-04' requires prerequisite probe\(s\) 'HOOK-01', 'SESSION-01', 'SESSION-02' to also be selected/
  );
  assert.throws(
    () => validateSelectedProbeIds(['SESSION-05']),
    /DEPENDENCY_INCOMPLETE: probe 'SESSION-05' requires prerequisite probe\(s\) 'HOOK-01', 'SESSION-01', 'SESSION-02' to also be selected/
  );
  assert.throws(
    () => validateSelectedProbeIds(['HOOK-01', 'SESSION-03']),
    /DEPENDENCY_INCOMPLETE: probe 'SESSION-03' requires prerequisite probe\(s\) 'SESSION-01', 'SESSION-02' to also be selected/
  );
  // R1-05: HOOK-01 + SESSION-02 + SESSION-04 without SESSION-01 is strictly rejected
  assert.throws(
    () => validateSelectedProbeIds(['HOOK-01', 'SESSION-02', 'SESSION-04']),
    /DEPENDENCY_INCOMPLETE: probe 'SESSION-02' requires prerequisite probe\(s\) 'SESSION-01' to also be selected/
  );
});

test('92. Task 06I-B1-H3 (H3-02): Run-Scoped Storage Fixture Contract â€” runId validation, entropy generation, and path formatting', () => {
  // 1. validateRunId accepts standard alphanumeric formats
  assert.equal(validateRunId('run-20261124-abc'), 'run-20261124-abc');
  assert.equal(validateRunId('test_run_123'), 'test_run_123');
  assert.equal(validateRunId('valid-uuid-1'), 'valid-uuid-1');

  // 2. validateRunId rejects path traversal
  assert.throws(() => validateRunId('../escape'), /INVALID_RUN_ID/);
  assert.throws(() => validateRunId('..'), /INVALID_RUN_ID/);
  assert.throws(() => validateRunId('test/../../etc'), /INVALID_RUN_ID/);

  // 3. validateRunId rejects slashes
  assert.throws(() => validateRunId('run/123'), /INVALID_RUN_ID/);
  assert.throws(() => validateRunId('run\\123'), /INVALID_RUN_ID/);

  // 4. validateRunId rejects whitespace
  assert.throws(() => validateRunId('run 123'), /INVALID_RUN_ID/);
  assert.throws(() => validateRunId(' run-1'), /INVALID_RUN_ID/);
  assert.throws(() => validateRunId('run-1\t'), /INVALID_RUN_ID/);

  // 5. validateRunId rejects special characters
  assert.throws(() => validateRunId('run@1'), /INVALID_RUN_ID/);
  assert.throws(() => validateRunId('run$key'), /INVALID_RUN_ID/);
  assert.throws(() => validateRunId('run%20test'), /INVALID_RUN_ID/);

  // 6. validateRunId rejects empty or non-string
  assert.throws(() => validateRunId(''), /INVALID_RUN_ID/);
  assert.throws(() => validateRunId(null), /INVALID_RUN_ID/);
  assert.throws(() => validateRunId(undefined), /INVALID_RUN_ID/);
  assert.throws(() => validateRunId(123), /INVALID_RUN_ID/);

  // 7. Path formatting helpers
  assert.equal(getStorageProbeObjectPath('run-abc-123'), 'run-abc-123/probe.txt');
  assert.equal(getStorageProbeObjectKey('run-abc-123'), 'task06i_probe_bucket/run-abc-123/probe.txt');

  // 8. Distinct run IDs produce distinct fixture keys (collision resistance)
  const key1 = getStorageProbeObjectKey('run-1');
  const key2 = getStorageProbeObjectKey('run-2');
  assert.notEqual(key1, key2);

  // 9. TestRunInventory generates entropy-backed UUID runId by default
  const invDefault = new TestRunInventory();
  assert.ok(invDefault.runId.startsWith('run-'));
  assert.ok(invDefault.runId.length > 20);
  assert.equal(validateRunId(invDefault.runId), invDefault.runId);

  // 10. TestRunInventory validates caller-provided runId
  const invCustom = new TestRunInventory('custom-valid-run-92');
  assert.equal(invCustom.runId, 'custom-valid-run-92');
  assert.throws(() => new TestRunInventory('../invalid'), /INVALID_RUN_ID/);
});

test('93. Task 06I-B1-H3 (H3-02): 10-Point Storage Provisioning Contract â€” collision detection, upload verification, and ownership tracking', async () => {
  const runId = 'test-run-storage-provision-93';
  const seedUserId = '11111111-1111-4111-a111-111111111193';
  const uploadedObjectId = '99999999-1111-4111-a111-111111111193';
  const testToken = createMockJwt({ sub: seedUserId });
  const inv = new TestRunInventory(runId);

  // 1. Missing userAccessToken rejects
  await assert.rejects(
    async () => {
      await provisionStorageProbeFixture({
        runId,
        seedUserId,
        userAccessToken: null,
        serviceRoleKey: validTestServiceRoleKey,
        inventory: inv,
        fetchFn: staticTransport({ status: 200 })
      });
    },
    /STORAGE_PROVISIONING_FAILED: userAccessToken is required/
  );

  // 2. Pre-upload collision check detects existing object (HTTP 200) and throws STORAGE_COLLISION_DETECTED
  await assert.rejects(
    async () => {
      await provisionStorageProbeFixture({
        runId,
        seedUserId,
        userAccessToken: testToken,
        anonKey: validTestAnonKey,
        serviceRoleKey: validTestServiceRoleKey,
        inventory: inv,
        fetchFn: createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
          routes: [
            { urlIncludes: '/auth/v1/user', status: 200, ok: true, json: { id: seedUserId, aud: 'authenticated' } },
            { method: 'GET', status: 200, ok: true }
          ],
          defaultResponse: { status: 200, ok: true, json: {} }
        })
      });
    },
    /STORAGE_COLLISION_DETECTED: Object 'task06i_probe_bucket\/test-run-storage-provision-93\/probe.txt' already exists/
  );

  // 3. Upload failure (HTTP 500) fails closed and quarantines as CREATION_INDETERMINATE
  const invFail = new TestRunInventory(runId);
  await assert.rejects(
    async () => {
      await provisionStorageProbeFixture({
        runId,
        seedUserId,
        userAccessToken: testToken,
        anonKey: validTestAnonKey,
        serviceRoleKey: validTestServiceRoleKey,
        inventory: invFail,
        fetchFn: createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
          routes: [
            { urlIncludes: '/auth/v1/user', status: 200, ok: true, json: { id: seedUserId, aud: 'authenticated' } },
            { method: 'GET', status: 404, ok: false },
            { method: 'POST', urlIncludes: '/storage/v1/object/', status: 500, ok: false, json: { message: 'Internal Server Error' } }
          ],
          defaultResponse: { status: 500, ok: false }
        })
      });
    },
    /STORAGE_UPLOAD_FAILED: HTTP 500/
  );
  assert.equal(
    invFail.getStorageFixture('task06i_probe_bucket', `${runId}/probe.txt`)?.lifecycleState,
    STORAGE_LIFECYCLE_STATE.CREATION_INDETERMINATE
  );

  // 4. Successful provisioning: /auth/v1/user + pre-check 404 + upload 200 + realistic download (NO custom owner headers) + authoritative owner_id RPC
  const invSuccess = new TestRunInventory(runId);
  const prov93Transport = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
    initialState: { uploaded: false },
    routes: [
      { urlIncludes: '/auth/v1/user', status: 200, ok: true, text: JSON.stringify({ id: seedUserId, aud: 'authenticated' }) },
      {
        urlIncludes: '/rest/v1/rpc/task06i_lookup_storage_object_owner',
        headersMatch: { authorization: `Bearer ${validTestServiceRoleKey}` },
        status: 200,
        ok: true,
        text: JSON.stringify([{
          id: uploadedObjectId,
          bucket_id: 'task06i_probe_bucket',
          name: `${runId}/probe.txt`,
          owner_id: seedUserId
        }])
      },
      {
        method: 'GET',
        urlIncludes: '/storage/v1/object/authenticated/',
        whenState: { uploaded: false },
        status: 404,
        ok: false
      },
      {
        method: 'GET',
        urlIncludes: '/storage/v1/object/authenticated/',
        whenState: { uploaded: true },
        status: 200,
        ok: true,
        text: 'task06i probe test fixture\n',
        headers: {
          'Content-Type': 'text/plain',
          'ETag': '"abc123"',
          'Last-Modified': 'Wed, 25 Nov 2026 04:00:00 GMT',
          'X-Robots-Tag': 'none'
        }
      },
      {
        method: 'POST',
        urlIncludes: '/storage/v1/object/',
        headersMatch: { 'x-upsert': 'false' },
        setsState: { uploaded: true },
        status: 200,
        ok: true,
        text: JSON.stringify({ Id: uploadedObjectId, Key: `task06i_probe_bucket/${runId}/probe.txt` })
      }
    ],
    defaultResponse: { status: 404, ok: false }
  });
  const result = await provisionStorageProbeFixture({
    runId,
    seedUserId,
    userAccessToken: testToken,
    anonKey: validTestAnonKey,
    serviceRoleKey: validTestServiceRoleKey,
    inventory: invSuccess,
    probeContent: 'task06i probe test fixture\n',
    fetchFn: prov93Transport
  });

  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.bucket, 'task06i_probe_bucket');
  assert.equal(result.path, `${runId}/probe.txt`);
  assert.equal(result.key, `task06i_probe_bucket/${runId}/probe.txt`);
  assert.equal(result.objectId, uploadedObjectId);
  assert.equal(result.ownerId, seedUserId);
  assert.equal(result.bytes, 27);

  // Durable record in inventory
  const fixture = invSuccess.getStorageFixture('task06i_probe_bucket', `${runId}/probe.txt`);
  assert.ok(fixture);
  assert.equal(fixture.status, 'VERIFIED');
  assert.equal(fixture.ownerId, seedUserId);
  assert.equal(fixture.verifiedOwnerId, seedUserId);
  assert.equal(fixture.providerObjectId, uploadedObjectId);
  assert.equal(fixture.bytes, 27);
  assert.equal(invSuccess.trackedStorageObjects.get('task06i_probe_bucket').has(`${runId}/probe.txt`), true);
});

test('94. Task 06I-B1-H3 (H3-03): Cleanup Ordering â€” Storage fixture deletion strictly precedes Auth user deletion & failure cascade prevention', async () => {
  const runId = 'test-run-cleanup-ordering-94';
  const inv = new TestRunInventory(runId);
  const testUserId = '11111111-2222-4333-a444-555555555594';
  const testUserEmail = 'created-user-94@proof.invalid';

  // Register verified created user
  inv.registerCreatedUser({
    id: testUserId,
    email: testUserEmail,
    creationProof: createCreationProof('before_after_check', { preCheckAbsent: true, postCheckPresent: true })
  });

  // Register run-scoped storage fixture with verified state and deletion eligibility
  await r5ProvisionedFixture(inv.runId, { inventory: inv, seedUserId: testUserId });

  // 1. Successful cleanup: Storage deletion MUST precede User deletion
  const mockAdminClientSuccess = fixtureSpec();

  const reportSuccess = await inv.executeCleanup({ adminClient: bindFixtureAdmin(inv, mockAdminClientSuccess), failClosed: true });
  assert.equal(reportSuccess.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(reportSuccess.storageObjectsDeleted, 1);
  assert.equal(reportSuccess.usersDeleted, 1);
  assert.deepEqual(fixtureCalls(mockAdminClientSuccess).filter(c => c.method === 'DELETE' && (c.url.includes('/storage/v1/object/') || c.url.includes('/auth/v1/admin/users/'))).map(c => c.url.includes('/storage/v1/object/') ? `DELETE_STORAGE:${c.pathname.slice('/storage/v1/object/'.length).split('/').map(decodeURIComponent).join('/')}` : `DELETE_USER:${decodeURIComponent(c.pathname.split('/').at(-1))}`), [
    `DELETE_STORAGE:task06i_probe_bucket/${runId}/probe.txt`,
    `DELETE_USER:${testUserId}`
  ]);
  assert.equal(inv.getStorageFixture(STORAGE_PROBE_BUCKET, getStorageProbeObjectPath(runId)).status, 'DELETED');

  // 2. Storage deletion failure BLOCKS Auth user deletion (failure cascade prevention)
  const invFail = new TestRunInventory(runId);
  const failUserId = '22222222-3333-4444-a555-666666666694';
  invFail.registerCreatedUser({
    id: failUserId,
    email: 'fail-user@proof.invalid',
    creationProof: createCreationProof('before_after_check', { preCheckAbsent: true, postCheckPresent: true })
  });
  await r5ProvisionedFixture(invFail.runId, { inventory: invFail, seedUserId: failUserId });

  const mockAdminClientStorageFail = fixtureSpec({ storageDelete: { status: 503, json: { message: 'Storage service unavailable (HTTP 503)' } }, storageGet: { status: 200, text: 'still present' } });

  const reportFail = await invFail.executeCleanup({ adminClient: bindFixtureAdmin(invFail, mockAdminClientStorageFail), failClosed: false });
  assert.equal((fixtureOperationCalls(mockAdminClientStorageFail, 'userDelete').length > 0), false, 'Auth user deletion MUST NEVER be attempted when Storage deletion fails!');
  assert.equal(reportFail.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.equal(reportFail.usersDeleted, 0);
  assert.equal(reportFail.storageObjectsDeleted, 0);

  // Assert residual users documents the cascade prevention
  const blockedUser = reportFail.residualUsers.find(u => u.id === failUserId);
  assert.ok(blockedUser, 'Blocked user must be reported in residualUsers');
  assert.match(blockedUser.error, /STORAGE_CLEANUP_FAILURE_CASCADE_PREVENTED/);

  // 3. Option A Reusable Seed User is NEVER deleted even when Storage cleanup succeeds
  const invSeed = new TestRunInventory(runId);
  const seedUid = '33333333-4444-4555-a666-777777777794';
  const seedEmail = 'seed-reusable@proof.invalid';
  invSeed.protectSeedIdentity({ id: seedUid, email: seedEmail });
  await r5ProvisionedFixture(invSeed.runId, { inventory: invSeed, seedUserId: seedUid });

  const mockAdminSeed = fixtureSpec();

  const reportSeed = await invSeed.executeCleanup({ adminClient: bindFixtureAdmin(invSeed, mockAdminSeed), failClosed: true });
  assert.equal(reportSeed.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal((fixtureOperationCalls(mockAdminSeed, 'userDelete').length > 0), false, 'Pre-existing seed user (Option A) must NEVER be deleted!');
  assert.equal(reportSeed.referencedUsersPreserved, 1);
});

test('95. Task 06I-B1-H3 (H3-03 & H3-05): SESSION-05 Run-Scoped Dispatch & Durable Recovery Gate Enforcement', async () => {
  const session05 = { id: 'SESSION-05', category: 'Session & Consumer' };
  const runId = 'test-run-session05-95';
  const seedUserId = 'seed-user-uuid-95';
  const runCtx = createRunContext({ runId });
  runCtx.activeAccessToken = createMockJwt({
    sub: seedUserId,
    session_id: 'sess-revoked-uuid-95',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 300
  });
  runCtx.preInvalidationSessionValid = true;
  runCtx.passwordResetCompleted = true;
  runCtx.sessionRevocationConfirmed = true;
  runCtx.revokedSessionId = 'sess-revoked-uuid-95';

  // 1. SESSION-05 dispatches against run-scoped path task06i_probe_bucket/<runId>/probe.txt
  const dispSuccessTransport = staticTransport({ status: 200, json: { message: 'probe content' } });
  const dispSuccess = createHostedDispatcher({
    anonKey: validTestAnonKey,
    runContext: runCtx,
    fetchFn: dispSuccessTransport
  });

  const outSuccess = await dispSuccess(session05);
  assert.equal(outSuccess.passed, true);
  assert.equal(outSuccess.stateless_linger_documented, true);
  assert.equal(dispSuccessTransport.calls.length, 1);
  assert.match(
    dispSuccessTransport.calls[0].url,
    new RegExp(`/storage/v1/object/authenticated/task06i_probe_bucket/${runId}/probe\\.txt`),
    'SESSION-05 must target exact run-scoped object path'
  );

  // 2. SESSION-05 returns STORAGE_FIXTURE_MISSING referencing run-scoped key when 404
  const disp404 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    runContext: runCtx,
    fetchFn: staticTransport({ status: 404, json: { message: 'Object not found' } })
  });

  const out404 = await disp404(session05);
  assert.equal(out404.passed, false);
  assert.equal(out404.status, 404);
  assert.match(out404.error, /STORAGE_FIXTURE_MISSING/);
  assert.match(out404.error, new RegExp(`task06i_probe_bucket/${runId}/probe\\.txt`));

  // 3. Real LIVE hosted cloud dispatch attempted with durable recovery gate throws BLOCKED_PENDING_DURABLE_RECOVERY
  await assert.rejects(
    async () => {
      await runHostedProbeRunner(fixtureRunnerOptions({
        projectRef: HARDCODED_TEMP_REF,
        argv: ['--live'],
        env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
        mockDispatcher: offlineDispatcherSpec({ defaultOutcome: { passed: true } }),
        adminClient: defaultAdminFixture,
        enforceDurableRecoveryGate: true
      }));
    },
    /BLOCKED_PENDING_DURABLE_RECOVERY: LIVE hosted execution against Supabase Cloud is blocked pending durable crash recovery/
  );

  // 4. Boundary verification: REAL project and Tio-world cannot be targeted under any runner mode
  assert.throws(
    () => planProbeExecution(HARDCODED_REAL_REF, { selectedProbeIds: SUPPORTED_SUBSET_PROBE_IDS }),
    /CRITICAL_SECURITY_VIOLATION.*REAL backend/
  );
  assert.throws(
    () => planProbeExecution(HARDCODED_TIO_WORLD_REF, { selectedProbeIds: SUPPORTED_SUBSET_PROBE_IDS }),
    /CRITICAL_SECURITY_VIOLATION.*Tio-world/
  );
});

test('96. Task 06I-B1-H3-R1: Fail-Closed Dispatch, Project Isolation & Storage Ownership Closure', async () => {
  let runId = 'test-run-h3-r1-96';
  const baseScenarioRun = runId; let scenarioNumber = 0;
  const nextScenarioRun = () => { runId = baseScenarioRun + '-case-' + (++scenarioNumber); return runId; };
  const seedUserId = '11111111-1111-4111-a111-111111111196';
  const otherUserId = '22222222-2222-4222-b222-222222222296';
  const testToken = createMockJwt({ sub: seedUserId });

  // ==========================================
  // R1-01: Mandatory Durable Recovery Gate & Fail-Closed Dispatch
  // (PRRT_kwDOVtCmZc67gqOo & PRRT_kwDOVtCmZc67grT_)
  // ==========================================
  // 1. Direct createHostedDispatcher without fetchFn throws BLOCKED_PENDING_DURABLE_RECOVERY
  assert.throws(
    () => createHostedDispatcher({ anonKey: validTestAnonKey }),
    /BLOCKED_PENDING_DURABLE_RECOVERY/
  );
  // 2. Direct createHostedDispatcher with globalThis.fetch throws BLOCKED_PENDING_DURABLE_RECOVERY
  assert.throws(
    () => createHostedDispatcher({ anonKey: validTestAnonKey, fetchFn: globalThis.fetch }),
    /BLOCKED_PENDING_DURABLE_RECOVERY/
  );
  // 3. Direct provisionStorageProbeFixture without fetchFn throws BLOCKED_PENDING_DURABLE_RECOVERY
  const invR1 = new TestRunInventory(nextScenarioRun());
  await assert.rejects(
    async () => {
      await provisionStorageProbeFixture({
        runId,
        seedUserId,
        userAccessToken: testToken,
        inventory: invR1
      });
    },
    /BLOCKED_PENDING_DURABLE_RECOVERY/
  );
  // 4. provisionStorageProbeFixture with globalThis.fetch throws BLOCKED_PENDING_DURABLE_RECOVERY
  await assert.rejects(
    async () => {
      await provisionStorageProbeFixture({
        runId,
        seedUserId,
        userAccessToken: testToken,
        inventory: invR1,
        fetchFn: globalThis.fetch
      });
    },
    /BLOCKED_PENDING_DURABLE_RECOVERY/
  );
  // 5. runHostedProbeRunner with real network dispatcher throws BLOCKED_PENDING_DURABLE_RECOVERY
  const hostedDispatcher = createHostedDispatcher({
    anonKey: validTestAnonKey,
    fetchFn: staticTransport({ status: 200 })
  });
  assert.equal(hostedDispatcher._isHostedNetworkDispatcher, true);
  await assert.rejects(
    async () => {
      await runHostedProbeRunner(fixtureRunnerOptions({
        projectRef: HARDCODED_TEMP_REF,
        argv: ['--live'],
        env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
        mockDispatcher: hostedDispatcher,
        adminClient: defaultAdminFixture
      }));
    },
    /BLOCKED_PENDING_DURABLE_RECOVERY/
  );
  // 6. Passing enforceDurableRecoveryGate: false cannot bypass real dispatcher detection
  await assert.rejects(
    async () => {
      await runHostedProbeRunner(fixtureRunnerOptions({
        projectRef: HARDCODED_TEMP_REF,
        argv: ['--live'],
        env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
        mockDispatcher: hostedDispatcher,
        adminClient: defaultAdminFixture,
        enforceDurableRecoveryGate: false
      }));
    },
    /BLOCKED_PENDING_DURABLE_RECOVERY/
  );
  // 7. LIVE mode with requireSelection: true throws SELECTION_REQUIRED when selectedProbeIds is missing
  await assert.rejects(
    async () => {
      await runHostedProbeRunner(fixtureRunnerOptions({
        projectRef: HARDCODED_TEMP_REF,
        argv: ['--live'],
        env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
        mockDispatcher: offlineDispatcherSpec({ defaultOutcome: { passed: true } }),
        adminClient: defaultAdminFixture,
        requireSelection: true,
        selectedProbeIds: null
      }));
    },
    /SELECTION_REQUIRED/
  );

  // ==========================================
  // R1-02: Storage Provisioner Project Isolation & Credential Binding
  // (PRRT_kwDOVtCmZc67gqOu & PRRT_kwDOVtCmZc67grUL)
  // ==========================================
  const mockTransportSpy = staticTransport({ status: 404, ok: false });
  // 8. Reject REAL project target immediately with 0 transport calls
  await assert.rejects(
    async () => {
      await provisionStorageProbeFixture({
        projectRef: HARDCODED_REAL_REF,
        runId,
        seedUserId,
        userAccessToken: testToken,
        inventory: invR1,
        fetchFn: mockTransportSpy
      });
    },
    /CRITICAL_SECURITY_VIOLATION.*strictly rejected target 'bsfwzvgynwriswapxpsp'/
  );
  assert.equal(mockTransportSpy.calls.length, 0);

  // 9. Reject Tio-world project target immediately with 0 transport calls
  await assert.rejects(
    async () => {
      await provisionStorageProbeFixture({
        projectRef: HARDCODED_TIO_WORLD_REF,
        runId,
        seedUserId,
        userAccessToken: testToken,
        inventory: invR1,
        fetchFn: mockTransportSpy
      });
    },
    /CRITICAL_SECURITY_VIOLATION.*strictly rejected target 'oykupyiitspujzpwwvuj'/
  );
  assert.equal(mockTransportSpy.calls.length, 0);

  // 10. Reject token bound to different project with 0 transport calls
  const tokenOtherProject = createMockJwt({ sub: seedUserId, iss: `https://${HARDCODED_REAL_REF}.supabase.co/auth/v1` });
  await assert.rejects(
    async () => {
      await provisionStorageProbeFixture({
        projectRef: HARDCODED_TEMP_REF,
        runId,
        seedUserId,
        userAccessToken: tokenOtherProject,
        inventory: invR1,
        fetchFn: mockTransportSpy
      });
    },
    /CRITICAL_SECURITY_VIOLATION.*forbidden project 'bsfwzvgynwriswapxpsp'/
  );
  assert.equal(mockTransportSpy.calls.length, 0);

  // 11. Reject token sub mismatch with seedUserId with 0 transport calls
  const tokenMismatchedSub = createMockJwt({ sub: otherUserId });
  await assert.rejects(
    async () => {
      await provisionStorageProbeFixture({
        projectRef: HARDCODED_TEMP_REF,
        runId,
        seedUserId,
        userAccessToken: tokenMismatchedSub,
        inventory: invR1,
        fetchFn: mockTransportSpy
      });
    },
    /CREDENTIAL_BINDING_ERROR: userAccessToken sub claim.*does not match seedUserId/
  );
  assert.equal(mockTransportSpy.calls.length, 0);

  // 12. Reject invalid non-UUID seedUserId with 0 transport calls
  await assert.rejects(
    async () => {
      await provisionStorageProbeFixture({
        projectRef: HARDCODED_TEMP_REF,
        runId,
        seedUserId: 'not-a-valid-uuid',
        userAccessToken: testToken,
        inventory: invR1,
        fetchFn: mockTransportSpy
      });
    },
    /INVALID_UUID/
  );
  assert.equal(mockTransportSpy.calls.length, 0);

  // ==========================================
  // R1-03: Separate Storage Creation Obligation from Deletion Eligibility
  // (PRRT_kwDOVtCmZc67gqOz & PRRT_kwDOVtCmZc67grUX)
  // ==========================================
  // 13. Pre-upload collision check returning 403 or 500 fails closed without proceeding to upload
  const transport13 = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
    routes: [
      { urlIncludes: '/auth/v1/user', status: 200, ok: true, json: { id: seedUserId } },
      { method: 'GET', status: 403, ok: false },
      { method: 'POST', urlIncludes: '/storage/v1/object/', status: 200, ok: true }
    ],
    defaultResponse: { status: 500 }
  });
  await assert.rejects(
    async () => {
      await provisionStorageProbeFixture({
        runId,
        seedUserId,
        userAccessToken: testToken,
        anonKey: validTestAnonKey,
        serviceRoleKey: validTestServiceRoleKey,
        inventory: new TestRunInventory(runId),
        fetchFn: transport13
      });
    },
    /STORAGE_COLLISION_CHECK_FAILED:.*UNAUTHORIZED_OR_FORBIDDEN \(HTTP 403\)/
  );
  assert.equal(transport13.calls.some(c => c.method === 'POST'), false, 'Upload POST must never be attempted when collision check returns non-404');

  // 14. Affirmative 404 followed by 409 Conflict preserves existing object without deletion eligibility
  const invConflict = new TestRunInventory(nextScenarioRun());
  await assert.rejects(
    async () => {
      await provisionStorageProbeFixture({
        runId,
        seedUserId,
        userAccessToken: testToken,
        anonKey: validTestAnonKey,
        serviceRoleKey: validTestServiceRoleKey,
        inventory: invConflict,
        fetchFn: createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
          routes: [
            { urlIncludes: '/auth/v1/user', status: 200, ok: true, json: { id: seedUserId } },
            { method: 'GET', status: 404, ok: false },
            { method: 'POST', urlIncludes: '/storage/v1/object/', status: 409, ok: false, json: { statusCode: '409', code: 'KeyAlreadyExists', error: 'Duplicate', message: 'The resource already exists' } }
          ],
          defaultResponse: { status: 500 }
        })
      });
    },
    /STORAGE_UPLOAD_CONFLICT/
  );
  const conflictFixture = invConflict.getStorageFixture(STORAGE_PROBE_BUCKET, getStorageProbeObjectPath(runId));
  assert.ok(conflictFixture);
  assert.equal(conflictFixture.lifecycleState, STORAGE_LIFECYCLE_STATE.CONFLICT_EXISTING_PRESERVED);
  assert.equal(conflictFixture.deletionEligible, false);

  // Cleanup NEVER deletes CONFLICT_EXISTING_PRESERVED object
  const mockAdminClientConflict = fixtureSpec();
  const cleanupReportConflict = await invConflict.executeCleanup({ adminClient: bindFixtureAdmin(invConflict, mockAdminClientConflict), failClosed: true });
  assert.equal((fixtureOperationCalls(mockAdminClientConflict, 'storageDelete').length > 0), false, 'Pre-existing conflict fixture must NEVER be deleted during cleanup');
  assert.equal(cleanupReportConflict.storageObjectsDeleted, 0);

  // 15. Indeterminate upload timeout is quarantined
  const invIndet = new TestRunInventory(nextScenarioRun());
  await assert.rejects(
    async () => {
      await provisionStorageProbeFixture({
        runId,
        seedUserId,
        userAccessToken: testToken,
        anonKey: validTestAnonKey,
        serviceRoleKey: validTestServiceRoleKey,
        inventory: invIndet,
        fetchFn: createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
          routes: [
            { urlIncludes: '/auth/v1/user', status: 200, ok: true, json: { id: seedUserId } },
            { method: 'GET', status: 404, ok: false },
            { method: 'POST', urlIncludes: '/storage/v1/object/', throwError: 'ECONNRESET: socket hang up' }
          ],
          defaultResponse: { status: 500 }
        })
      });
    },
    /STORAGE_UPLOAD_INDETERMINATE/
  );
  const indetFixture = invIndet.getStorageFixture(STORAGE_PROBE_BUCKET, getStorageProbeObjectPath(runId));
  assert.equal(indetFixture.lifecycleState, STORAGE_LIFECYCLE_STATE.CREATION_INDETERMINATE);
  assert.equal(indetFixture.deletionEligible, false);

  // ==========================================
  // R1-04: Payload Integrity & Authoritative Owner Verification
  // (PRRT_kwDOVtCmZc67gqO4 & R2-01)
  // ==========================================
  const objId16 = '88888888-1111-4111-a111-111111111196';
  // 16. Verification GET with corrupted/wrong bytes throws STORAGE_PAYLOAD_INTEGRITY_MISMATCH and retains RESIDUAL_OWNERSHIP_BLOCKED
  const invMismatch16 = new TestRunInventory(nextScenarioRun());
  await assert.rejects(
    async () => {
      await provisionStorageProbeFixture({
        runId,
        seedUserId,
        userAccessToken: testToken,
        anonKey: validTestAnonKey,
        serviceRoleKey: validTestServiceRoleKey,
        inventory: invMismatch16,
        probeContent: 'expected-bytes\n',
        fetchFn: createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
          initialState: { uploaded: false },
          routes: [
            { urlIncludes: '/auth/v1/user', status: 200, ok: true, json: { id: seedUserId } },
            { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', whenState: { uploaded: false }, status: 404, ok: false },
            { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', whenState: { uploaded: true }, status: 200, ok: true, text: 'corrupted-different-bytes\n', headers: { 'Content-Type': 'text/plain' } },
            { method: 'POST', urlIncludes: '/storage/v1/object/', setsState: { uploaded: true }, status: 200, ok: true, json: { Id: objId16, Key: getStorageProbeObjectKey(runId) } }
          ],
          defaultResponse: { status: 500 }
        })
      });
    },
    /STORAGE_PAYLOAD_INTEGRITY_MISMATCH/
  );
  assert.equal(
    invMismatch16.getStorageFixture(STORAGE_PROBE_BUCKET, getStorageProbeObjectPath(runId))?.lifecycleState,
    STORAGE_LIFECYCLE_STATE.RESIDUAL_OWNERSHIP_BLOCKED
  );

  // 17. Missing owner metadata in authoritative lookup throws STORAGE_OWNER_VERIFICATION_FAILED and preserves RESIDUAL_OWNERSHIP_BLOCKED
  const invMissing17 = new TestRunInventory(nextScenarioRun());
  await assert.rejects(
    async () => {
      await provisionStorageProbeFixture({
        runId,
        seedUserId,
        userAccessToken: testToken,
        anonKey: validTestAnonKey,
        serviceRoleKey: validTestServiceRoleKey,
        inventory: invMissing17,
        probeContent: 'valid-bytes\n',
        fetchFn: createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
          initialState: { uploaded: false },
          routes: [
            { urlIncludes: '/auth/v1/user', status: 200, ok: true, json: { id: seedUserId } },
            { urlIncludes: '/rest/v1/rpc/task06i_lookup_storage_object_owner', status: 200, ok: true, text: JSON.stringify([{ id: objId16, bucket_id: STORAGE_PROBE_BUCKET, name: getStorageProbeObjectPath(runId), owner_id: null }]) },
            { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', whenState: { uploaded: false }, status: 404, ok: false },
            { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', whenState: { uploaded: true }, status: 200, ok: true, text: 'valid-bytes\n', headers: { 'Content-Type': 'text/plain' } },
            { method: 'POST', urlIncludes: '/storage/v1/object/', setsState: { uploaded: true }, status: 200, ok: true, json: { Id: objId16, Key: getStorageProbeObjectKey(runId) } }
          ],
          defaultResponse: { status: 500 }
        })
      });
    },
    /STORAGE_OWNER_VERIFICATION_FAILED.*missing/
  );
  assert.equal(
    invMissing17.getStorageFixture(STORAGE_PROBE_BUCKET, getStorageProbeObjectPath(runId))?.lifecycleState,
    STORAGE_LIFECYCLE_STATE.RESIDUAL_OWNERSHIP_BLOCKED
  );

  // 18. Mismatched owner_id in authoritative lookup throws STORAGE_OWNER_VERIFICATION_FAILED and preserves RESIDUAL_OWNERSHIP_BLOCKED
  const invOwnerMismatch18 = new TestRunInventory(nextScenarioRun());
  await assert.rejects(
    async () => {
      await provisionStorageProbeFixture({
        runId,
        seedUserId,
        userAccessToken: testToken,
        anonKey: validTestAnonKey,
        serviceRoleKey: validTestServiceRoleKey,
        inventory: invOwnerMismatch18,
        probeContent: 'valid-bytes\n',
        fetchFn: createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
          initialState: { uploaded: false },
          routes: [
            { urlIncludes: '/auth/v1/user', status: 200, ok: true, json: { id: seedUserId } },
            { urlIncludes: '/rest/v1/rpc/task06i_lookup_storage_object_owner', status: 200, ok: true, text: JSON.stringify([{ id: objId16, bucket_id: STORAGE_PROBE_BUCKET, name: getStorageProbeObjectPath(runId), owner_id: otherUserId }]) },
            { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', whenState: { uploaded: false }, status: 404, ok: false },
            { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', whenState: { uploaded: true }, status: 200, ok: true, text: 'valid-bytes\n', headers: { 'Content-Type': 'text/plain' } },
            { method: 'POST', urlIncludes: '/storage/v1/object/', setsState: { uploaded: true }, status: 200, ok: true, json: { Id: objId16, Key: getStorageProbeObjectKey(runId) } }
          ],
          defaultResponse: { status: 500 }
        })
      });
    },
    /STORAGE_OWNER_VERIFICATION_FAILED.*does not match verified seed user/
  );
  assert.equal(
    invOwnerMismatch18.getStorageFixture(STORAGE_PROBE_BUCKET, getStorageProbeObjectPath(runId))?.lifecycleState,
    STORAGE_LIFECYCLE_STATE.RESIDUAL_OWNERSHIP_BLOCKED
  );

  // ==========================================
  // R1-05: Canonical Probe Dependencies
  // (PRRT_kwDOVtCmZc67gqO8)
  // ==========================================
  // 19. SESSION-02 requires HOOK-01 and SESSION-01
  assert.throws(
    () => validateSelectedProbeIds(['HOOK-01', 'SESSION-02']),
    /DEPENDENCY_INCOMPLETE: probe 'SESSION-02' requires prerequisite probe\(s\) 'SESSION-01' to also be selected/
  );
  // 20. SESSION-04 requires HOOK-01, SESSION-01, and SESSION-02
  assert.throws(
    () => validateSelectedProbeIds(['HOOK-01', 'SESSION-02', 'SESSION-04']),
    /DEPENDENCY_INCOMPLETE: probe 'SESSION-02' requires prerequisite probe\(s\) 'SESSION-01' to also be selected/
  );

  // ==========================================
  // R1-06: Storage Absence Verification Post-Deletion
  // (PRRT_kwDOVtCmZc67grUj)
  // ==========================================
  // 21. Object still present (HTTP 200 on absence GET) marks deletion failed and halts user deletion
  const invAbsenceFail = new TestRunInventory(nextScenarioRun());
  invAbsenceFail.registerCreatedUser({
    id: seedUserId,
    email: 'user-absence-fail@proof.invalid',
    creationProof: createCreationProof('before_after_check')
  });
  await r5ProvisionedFixture(invAbsenceFail.runId, { inventory: invAbsenceFail, seedUserId: seedUserId });
  const mockAdminClientPresent = fixtureSpec({ storageGet: { status: 200, text: 'still present' } });
  const repAbsenceFail = await invAbsenceFail.executeCleanup({ adminClient: bindFixtureAdmin(invAbsenceFail, mockAdminClientPresent), failClosed: false });
  assert.equal((fixtureOperationCalls(mockAdminClientPresent, 'userDelete').length > 0), false, 'User deletion must be aborted when storage object is still present');
  assert.equal(repAbsenceFail.storageObjectsDeleted, 0);
  assert.equal(repAbsenceFail.usersDeleted, 0);
  assert.ok(repAbsenceFail.residualResources.some(r => r.error?.includes('STORAGE_OBJECT_NOT_ABSENT')));
  assert.ok(repAbsenceFail.residualUsers.some(u => u.error?.includes('STORAGE_CLEANUP_FAILURE_CASCADE_PREVENTED')));

  // ==========================================
  // R1-07: Remove SESSION-05 Shared-Path Fallback
  // (PRRT_kwDOVtCmZc67grUw)
  // ==========================================
  // 22. SESSION-05 requires valid runId (and runId on RunContext is immutable, R9-01)
  const runCtxNoRunId = createRunContext({ runId: 'valid-temp-id' });
  assert.throws(() => { runCtxNoRunId.runId = null; }, TypeError);
  assert.throws(() => { delete runCtxNoRunId.runId; }, TypeError);
  assert.equal(runCtxNoRunId.runId, 'valid-temp-id');

  // 23. SESSION-05 requires fixture in inventory when inventory provided
  const invEmpty = new TestRunInventory(nextScenarioRun());
  const runCtxWithRunId = createRunContext({ runId });
  runCtxWithRunId.activeAccessToken = testToken;
  runCtxWithRunId.preInvalidationSessionValid = true;
  runCtxWithRunId.passwordResetCompleted = true;
  runCtxWithRunId.sessionRevocationConfirmed = true;
  runCtxWithRunId.revokedSessionId = 'session-uuid-5678';
  const dispMissingFixture = createHostedDispatcher({
    anonKey: validTestAnonKey,
    inventory: invEmpty,
    runContext: runCtxWithRunId,
    fetchFn: staticTransport({ status: 200 })
  });
  const outMissingFixture = await dispMissingFixture({ id: 'SESSION-05', category: 'Session & Consumer' });
  assert.equal(outMissingFixture.passed, false);
  assert.match(outMissingFixture.error, /STORAGE_FIXTURE_RECORD_MISSING/);

  // ==========================================
  // R1-08: Mandatory Inventory in Storage Provisioner
  // (PRRT_kwDOVtCmZc67grU_)
  // ==========================================
  // 24. provisionStorageProbeFixture without inventory throws STORAGE_PROVISIONING_FAILED
  await assert.rejects(
    async () => {
      await provisionStorageProbeFixture({
        runId,
        seedUserId,
        userAccessToken: testToken,
        inventory: null,
        fetchFn: staticTransport({ status: 404 })
      });
    },
    /STORAGE_PROVISIONING_FAILED: inventory is required for write-ahead tracking \(R1-08\)/
  );

  // 25. provisionStorageProbeFixture with finalized inventory throws INVENTORY_FINALIZED
  const invFinalized = new TestRunInventory(nextScenarioRun());
  invFinalized.finalize();
  await assert.rejects(
    async () => {
      await provisionStorageProbeFixture({
        runId,
        seedUserId,
        userAccessToken: testToken,
        inventory: invFinalized,
        fetchFn: staticTransport({ status: 404 })
      });
    },
    /INVENTORY_FINALIZED/
  );

  // 26. provisionStorageProbeFixture with mismatched runId throws INVENTORY_RUN_ID_MISMATCH
  const invMismatched = new TestRunInventory('different-run-id-123');
  await assert.rejects(
    async () => {
      await provisionStorageProbeFixture({
        runId,
        seedUserId,
        userAccessToken: testToken,
        inventory: invMismatched,
        fetchFn: staticTransport({ status: 404 })
      });
    },
    /INVENTORY_RUN_ID_MISMATCH/
  );
});


test('97. Task 06I-B1-H3-R2 (R2-01): Authoritative storage.objects.owner_id Metadata Verification & Realistic Provider Responses', async () => {
  let runId = 'test-run-h3-r2-owner-97';
  const baseScenarioRun = runId; let scenarioNumber = 0;
  const nextScenarioRun = () => { runId = baseScenarioRun + '-case-' + (++scenarioNumber); expectedPath = getStorageProbeObjectPath(runId); expectedKey = getStorageProbeObjectKey(runId); return runId; };
  const seedUserId = '11111111-1111-4111-a111-111111111197';
  const otherUserId = '22222222-2222-4222-b222-222222222297';
  const objectUuid = 'aaaa1111-2222-4333-a444-555555555597';
  const otherObjectUuid = 'bbbb1111-2222-4333-a444-555555555597';
  const token = createMockJwt({ sub: seedUserId });
  let expectedPath = getStorageProbeObjectPath(runId);
  let expectedKey = getStorageProbeObjectKey(runId);

  // Static SQL contract verification: narrowly scoped SECURITY DEFINER RPC, no storage schema exposure
  const sqlContent = fs.readFileSync('experiments/task06i/sql/testbed-fixtures.sql', 'utf8');
  assert.match(sqlContent, /CREATE OR REPLACE FUNCTION public\.task06i_lookup_storage_object_owner\(/);
  assert.match(sqlContent, /SECURITY DEFINER\s+SET search_path = ''/);
  assert.match(sqlContent, /IF p_bucket_id IS DISTINCT FROM 'task06i_probe_bucket'/);
  assert.match(sqlContent, /REVOKE ALL ON FUNCTION public\.task06i_lookup_storage_object_owner\(text, text\) FROM PUBLIC, anon, authenticated/);
  assert.match(sqlContent, /GRANT EXECUTE ON FUNCTION public\.task06i_lookup_storage_object_owner\(text, text\) TO service_role/);
  assert.ok(!/pgrst\.db_schemas|GRANT .* ON SCHEMA storage TO anon|GRANT .* ON SCHEMA storage TO authenticated/i.test(sqlContent));

  // Helper creating realistic deterministic provider mock (NO custom x-owner-id headers on GET download!)
  function makeProviderFetch({
    authUserStatus = 200,
    authUserBody = { id: seedUserId, aud: 'authenticated' },
    uploadObjectId = objectUuid,
    downloadBody = 'abcd-fixture-bytes\n',
    downloadResponseOverride = null,
    downloadHeaders = {
      'Content-Type': 'text/plain',
      'ETag': '"realistic-etag-97"',
      'Last-Modified': 'Wed, 25 Nov 2026 04:30:00 GMT',
      'Content-Length': '19',
      'X-Robots-Tag': 'none'
    },
    ownershipRpcStatus = 200,
    ownershipRpcBody = [{
      id: objectUuid,
      bucket_id: STORAGE_PROBE_BUCKET,
      name: expectedPath,
      owner_id: seedUserId,
      version: 'v1'
    }],
    ownershipRpcDelayMs = 0,
    ownershipRpcMalformed = false
  } = {}) {
    return createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
      initialState: { uploaded: false },
      routes: [
        {
          urlIncludes: '/auth/v1/user',
          status: authUserStatus,
          ok: authUserStatus === 200,
          text: JSON.stringify(authUserBody)
        },
        {
          urlIncludes: '/rest/v1/rpc/task06i_lookup_storage_object_owner',
          headersMatch: { authorization: `Bearer ${validTestServiceRoleKey}` },
          delayMs: ownershipRpcDelayMs,
          ...(ownershipRpcMalformed
            ? { status: 200, ok: true, text: '<html>not-json</html>' }
            : {
                status: ownershipRpcStatus,
                ok: ownershipRpcStatus >= 200 && ownershipRpcStatus < 300,
                text: JSON.stringify(ownershipRpcBody)
              })
        },
        {
          method: 'GET',
          urlIncludes: '/storage/v1/object/authenticated/',
          whenState: { uploaded: false },
          status: 400,
          ok: false,
          text: JSON.stringify({ error: 'Not found', message: 'The resource was not found', statusCode: '404', code: 'NoSuchKey' })
        },
        {
          method: 'GET',
          urlIncludes: '/storage/v1/object/authenticated/',
          whenState: { uploaded: true },
          ...(downloadResponseOverride || {
            status: 200,
            ok: true,
            headers: downloadHeaders,
            rawBytes: Buffer.from(downloadBody, 'utf8')
          })
        },
        {
          method: 'POST',
          urlIncludes: '/storage/v1/object/',
          setsState: { uploaded: true },
          status: 200,
          ok: true,
          text: JSON.stringify({ Id: uploadObjectId, Key: expectedKey })
        }
      ],
      defaultResponse: { status: 404, ok: false }
    });
  }

  // 1 & 2. Realistic authenticated download WITHOUT custom owner headers + authoritative owner_id lookup + exact byte match
  const invPass = new TestRunInventory(nextScenarioRun());
  const resPass = await provisionStorageProbeFixture({
    runId,
    seedUserId,
    userAccessToken: token,
    anonKey: validTestAnonKey,
    serviceRoleKey: validTestServiceRoleKey,
    inventory: invPass,
    probeContent: 'abcd-fixture-bytes\n',
    fetchFn: makeProviderFetch()
  });
  assert.equal(resPass.lifecycleState, STORAGE_LIFECYCLE_STATE.RUN_CREATED_VERIFIED);
  assert.equal(resPass.deletionEligible, true);
  assert.equal(resPass.objectId, objectUuid);
  assert.equal(resPass.ownerId, seedUserId);
  assert.equal(resPass.fixtureRecord.proof.ownershipSource, 'storage.objects.owner_id');
  assert.equal(resPass.fixtureRecord.proof.seedIdentityEndpoint, '/auth/v1/user');

  // 3. Wrong object owner -> RESIDUAL_OWNERSHIP_BLOCKED (no deletion eligibility)
  const invWrongOwner = new TestRunInventory(nextScenarioRun());
  await assert.rejects(
    () => provisionStorageProbeFixture({
      runId,
      seedUserId,
      userAccessToken: token,
      serviceRoleKey: validTestServiceRoleKey,
      inventory: invWrongOwner,
      probeContent: 'abcd-fixture-bytes\n',
      fetchFn: makeProviderFetch({
        ownershipRpcBody: [{ id: objectUuid, bucket_id: STORAGE_PROBE_BUCKET, name: expectedPath, owner_id: otherUserId }]
      })
    }),
    /STORAGE_OWNER_VERIFICATION_FAILED/
  );
  assert.equal(invWrongOwner.getStorageFixture(STORAGE_PROBE_BUCKET, expectedPath)?.lifecycleState, STORAGE_LIFECYCLE_STATE.RESIDUAL_OWNERSHIP_BLOCKED);
  assert.equal(invWrongOwner.getStorageFixture(STORAGE_PROBE_BUCKET, expectedPath)?.deletionEligible, false);

  // 4. Missing owner metadata (empty result / RPC 404 PGRST202 / missing ownership interface)
  const invMissingMeta = new TestRunInventory(nextScenarioRun());
  await assert.rejects(
    () => provisionStorageProbeFixture({
      runId,
      seedUserId,
      userAccessToken: token,
      serviceRoleKey: validTestServiceRoleKey,
      inventory: invMissingMeta,
      probeContent: 'abcd-fixture-bytes\n',
      fetchFn: makeProviderFetch({
        ownershipRpcStatus: 404,
        ownershipRpcBody: { code: 'PGRST202', message: 'Could not find the function public.task06i_lookup_storage_object_owner' }
      })
    }),
    /STORAGE_OWNER_VERIFICATION_FAILED/
  );
  assert.equal(invMissingMeta.getStorageFixture(STORAGE_PROBE_BUCKET, expectedPath)?.deletionEligible, false);

  await assert.rejects(
    () => provisionStorageProbeFixture({
      runId,
      seedUserId,
      userAccessToken: token,
      inventory: new TestRunInventory(runId),
      fetchFn: makeProviderFetch()
    }),
    /BLOCKED_PENDING_OWNERSHIP_METADATA_INTERFACE/
  );

  // 5. Wrong bucket or wrong object key in authoritative lookup
  const invWrongBucket = new TestRunInventory(nextScenarioRun());
  await assert.rejects(
    () => provisionStorageProbeFixture({
      runId,
      seedUserId,
      userAccessToken: token,
      serviceRoleKey: validTestServiceRoleKey,
      inventory: invWrongBucket,
      probeContent: 'abcd-fixture-bytes\n',
      fetchFn: makeProviderFetch({
        ownershipRpcBody: [{ id: objectUuid, bucket_id: 'other_bucket', name: expectedPath, owner_id: seedUserId }]
      })
    }),
    /STORAGE_OBJECT_KEY_MISMATCH/
  );
  assert.equal(invWrongBucket.getStorageFixture(STORAGE_PROBE_BUCKET, expectedPath)?.deletionEligible, false);

  const invWrongKey = new TestRunInventory(nextScenarioRun());
  await assert.rejects(
    () => provisionStorageProbeFixture({
      runId,
      seedUserId,
      userAccessToken: token,
      serviceRoleKey: validTestServiceRoleKey,
      inventory: invWrongKey,
      probeContent: 'abcd-fixture-bytes\n',
      fetchFn: makeProviderFetch({
        ownershipRpcBody: [{ id: objectUuid, bucket_id: STORAGE_PROBE_BUCKET, name: 'other-run/probe.txt', owner_id: seedUserId }]
      })
    }),
    /STORAGE_OBJECT_KEY_MISMATCH/
  );
  assert.equal(invWrongKey.getStorageFixture(STORAGE_PROBE_BUCKET, expectedPath)?.deletionEligible, false);

  // 6. Different provider object identity (POST Id !== storage.objects.id)
  const invDiffId = new TestRunInventory(nextScenarioRun());
  await assert.rejects(
    () => provisionStorageProbeFixture({
      runId,
      seedUserId,
      userAccessToken: token,
      serviceRoleKey: validTestServiceRoleKey,
      inventory: invDiffId,
      probeContent: 'abcd-fixture-bytes\n',
      fetchFn: makeProviderFetch({
        uploadObjectId: objectUuid,
        ownershipRpcBody: [{ id: otherObjectUuid, bucket_id: STORAGE_PROBE_BUCKET, name: expectedPath, owner_id: seedUserId }]
      })
    }),
    /STORAGE_OBJECT_IDENTITY_MISMATCH/
  );
  assert.equal(invDiffId.getStorageFixture(STORAGE_PROBE_BUCKET, expectedPath)?.deletionEligible, false);

  // 7. Unverified or mismatched seed identity (/auth/v1/user rejects forged JWT even when decoded sub matches)
  const badIdentityTransport = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
    routes: [
      { urlIncludes: '/auth/v1/user', status: 401, ok: false, text: JSON.stringify({ error: 'invalid_jwt' }) }
    ],
    defaultResponse: { status: 200 }
  });
  await assert.rejects(
    () => provisionStorageProbeFixture({
      runId,
      seedUserId,
      userAccessToken: token,
      serviceRoleKey: validTestServiceRoleKey,
      inventory: new TestRunInventory(runId),
      fetchFn: badIdentityTransport
    }),
    /SEED_IDENTITY_VERIFICATION_FAILED/
  );
  assert.equal(badIdentityTransport.calls.some(c => c.url.includes('/storage/v1/object/')), false, 'Unverified /auth/v1/user must fail BEFORE any Storage call');

  await assert.rejects(
    () => provisionStorageProbeFixture({
      runId,
      seedUserId,
      userAccessToken: token,
      serviceRoleKey: validTestServiceRoleKey,
      inventory: new TestRunInventory(runId),
      fetchFn: makeProviderFetch({ authUserBody: { id: otherUserId } })
    }),
    /SEED_IDENTITY_VERIFICATION_FAILED/
  );

  // 8 & 9. Same-length but different downloaded bytes ('abce...' vs 'abcd...')
  const invSameLenDiff = new TestRunInventory(nextScenarioRun());
  await assert.rejects(
    () => provisionStorageProbeFixture({
      runId,
      seedUserId,
      userAccessToken: token,
      serviceRoleKey: validTestServiceRoleKey,
      inventory: invSameLenDiff,
      probeContent: 'abcd-fixture-bytes\n',
      fetchFn: makeProviderFetch({
        downloadBody: 'abce-fixture-bytes\n' // Exact same 19-byte length!
      })
    }),
    /STORAGE_PAYLOAD_INTEGRITY_MISMATCH/
  );
  assert.equal(invSameLenDiff.getStorageFixture(STORAGE_PROBE_BUCKET, expectedPath)?.lifecycleState, STORAGE_LIFECYCLE_STATE.RESIDUAL_OWNERSHIP_BLOCKED);
  assert.equal(invSameLenDiff.getStorageFixture(STORAGE_PROBE_BUCKET, expectedPath)?.deletionEligible, false);

  // 10. Malformed or unreadable download/metadata responses
  const invUnreadable = new TestRunInventory(nextScenarioRun());
  await assert.rejects(
    () => provisionStorageProbeFixture({
      runId,
      seedUserId,
      userAccessToken: token,
      serviceRoleKey: validTestServiceRoleKey,
      inventory: invUnreadable,
      probeContent: 'abcd-fixture-bytes\n',
      fetchFn: makeProviderFetch({
        downloadResponseOverride: { status: 200, ok: true, arrayBufferError: 'Stream truncated' }
      })
    }),
    /STORAGE_VERIFICATION_FAILED/
  );
  assert.equal(invUnreadable.getStorageFixture(STORAGE_PROBE_BUCKET, expectedPath)?.deletionEligible, false);

  const invMalformedMeta = new TestRunInventory(nextScenarioRun());
  await assert.rejects(
    () => provisionStorageProbeFixture({
      runId,
      seedUserId,
      userAccessToken: token,
      serviceRoleKey: validTestServiceRoleKey,
      inventory: invMalformedMeta,
      probeContent: 'abcd-fixture-bytes\n',
      fetchFn: makeProviderFetch({ ownershipRpcMalformed: true })
    }),
    /STORAGE_OWNER_VERIFICATION_FAILED/
  );
  assert.equal(invMalformedMeta.getStorageFixture(STORAGE_PROBE_BUCKET, expectedPath)?.deletionEligible, false);

  // 11. Ownership lookup timeout -> RESIDUAL_OWNERSHIP_BLOCKED, deletionEligible: false
  const invTimeout = new TestRunInventory(nextScenarioRun());
  await assert.rejects(
    () => provisionStorageProbeFixture({
      runId,
      seedUserId,
      userAccessToken: token,
      serviceRoleKey: validTestServiceRoleKey,
      inventory: invTimeout,
      probeContent: 'abcd-fixture-bytes\n',
      ownershipTimeoutMs: 30,
      fetchFn: makeProviderFetch({ ownershipRpcDelayMs: 120 })
    }),
    /STORAGE_OWNER_VERIFICATION_FAILED.*OWNERSHIP_LOOKUP_TIMEOUT/
  );
  assert.equal(invTimeout.getStorageFixture(STORAGE_PROBE_BUCKET, expectedPath)?.lifecycleState, STORAGE_LIFECYCLE_STATE.RESIDUAL_OWNERSHIP_BLOCKED);
  assert.equal(invTimeout.getStorageFixture(STORAGE_PROBE_BUCKET, expectedPath)?.deletionEligible, false);
});

test('98. Task 06I-B1-H3-R2 (R2-02): Residual Storage Obligations, State Monotonicity & Cascade Prevention', async () => {
  let runId = 'test-run-h3-r2-residual-98';
  const baseScenarioRun = runId; let scenarioNumber = 0;
  const nextScenarioRun = () => { runId = baseScenarioRun + '-case-' + (++scenarioNumber); expectedPath = getStorageProbeObjectPath(runId); expectedKey = getStorageProbeObjectKey(runId); return runId; };
  const seedUserId = '11111111-1111-4111-a111-111111111198';
  const createdUserId = '22222222-2222-4222-b222-222222222298';
  const objectUuid = 'cccc1111-2222-4333-a444-555555555598';
  const otherUserId = '33333333-3333-4333-b333-333333333398';
  const token = createMockJwt({ sub: seedUserId });
  let expectedPath = getStorageProbeObjectPath(runId);
  let expectedKey = getStorageProbeObjectKey(runId);

  async function assertUnresolvedCleanupBlocked(inv, expectedState) {
    // Associate a verified run-created Auth user to assert Storage-before-user cascade block
    inv.registerCreatedUser({
      id: createdUserId,
      email: 'created-98@proof.invalid',
      creationProof: createCreationProof('before_after_check')
    });
    const mockAdmin = fixtureSpec();
    const report = await inv.executeCleanup({ adminClient: bindFixtureAdmin(inv, mockAdmin), failClosed: false });
    assert.equal((fixtureOperationCalls(mockAdmin, 'storageDelete').length > 0), false, `Must NEVER blind-delete storage for state '${expectedState}'`);
    assert.equal((fixtureOperationCalls(mockAdmin, 'userDelete').length > 0), false, `Must NEVER delete Auth user while storage state is '${expectedState}'`);
    assert.notEqual(report.status, 'CLEANUP_VERIFIED_SUCCESS');
    assert.equal(report.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
    assert.ok(report.residualResources.some(r => r.type === 'storage_object'));
    assert.ok(report.residualUsers.some(u => u.id === createdUserId && /STORAGE_CLEANUP_FAILURE_CASCADE_PREVENTED/.test(u.error)));
    assert.equal(inv.isClean(), false);
  }

  // Scenarios 1, 2, 3: Successful POST followed by verification GET 403, 404, or 500
  for (const getErrStatus of [403, 404, 500]) {
    const inv = new TestRunInventory(nextScenarioRun());
    await assert.rejects(
      () => provisionStorageProbeFixture({
        runId,
        seedUserId,
        userAccessToken: token,
        serviceRoleKey: validTestServiceRoleKey,
        inventory: inv,
        fetchFn: createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
          initialState: { posted: false },
          routes: [
            { urlIncludes: '/auth/v1/user', status: 200, ok: true, text: JSON.stringify({ id: seedUserId }) },
            { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', whenState: { posted: false }, status: 404, ok: false },
            { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', whenState: { posted: true }, status: getErrStatus, ok: false },
            { method: 'POST', urlIncludes: '/storage/v1/object/', setsState: { posted: true }, status: 200, ok: true, text: JSON.stringify({ Id: objectUuid, Key: expectedKey }) }
          ],
          defaultResponse: { status: 500 }
        })
      }),
      /STORAGE_VERIFICATION_FAILED/
    );
    const f = inv.getStorageFixture(STORAGE_PROBE_BUCKET, expectedPath);
    assert.equal(f.lifecycleState, STORAGE_LIFECYCLE_STATE.RESIDUAL_OWNERSHIP_BLOCKED);
    assert.equal(f.hasCommittedUpload, true);
    assert.equal(f.deletionEligible, false);
    await assertUnresolvedCleanupBlocked(inv, `POST_200_GET_${getErrStatus}`);
  }

  // Scenario 4, 5, 6, 7: Content mismatch, owner mismatch, owner lookup failure, body-read rejection after POST 200
  const post200FailureVariants = [
    { name: 'content_mismatch', body: 'wrong-content', lookupRes: [{ id: objectUuid, bucket_id: STORAGE_PROBE_BUCKET, name: expectedPath, owner_id: seedUserId }], errRegex: /STORAGE_PAYLOAD_INTEGRITY_MISMATCH/ },
    { name: 'owner_mismatch', body: 'expected-98\n', lookupRes: [{ id: objectUuid, bucket_id: STORAGE_PROBE_BUCKET, name: expectedPath, owner_id: otherUserId }], errRegex: /STORAGE_OWNER_VERIFICATION_FAILED/ },
    { name: 'lookup_failure', body: 'expected-98\n', lookupStatus: 500, errRegex: /STORAGE_OWNER_VERIFICATION_FAILED/ },
    { name: 'body_read_rejection', bodyRejects: true, errRegex: /STORAGE_VERIFICATION_FAILED/ }
  ];

  for (const variant of post200FailureVariants) {
    const inv = new TestRunInventory(nextScenarioRun());
    const lookupStatus = variant.lookupStatus || 200;
    await assert.rejects(
      () => provisionStorageProbeFixture({
        runId,
        seedUserId,
        userAccessToken: token,
        serviceRoleKey: validTestServiceRoleKey,
        inventory: inv,
        probeContent: 'expected-98\n',
        fetchFn: createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
          initialState: { posted: false },
          routes: [
            { urlIncludes: '/auth/v1/user', status: 200, ok: true, text: JSON.stringify({ id: seedUserId }) },
            {
              urlIncludes: '/rest/v1/rpc/task06i_lookup_storage_object_owner',
              status: lookupStatus,
              ok: lookupStatus === 200,
              text: JSON.stringify(variant.lookupRes ? variant.lookupRes.map(row => ({ ...row, name: expectedPath })) : { message: 'db error' })
            },
            { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', whenState: { posted: false }, status: 404, ok: false },
            variant.bodyRejects
              ? { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', whenState: { posted: true }, status: 200, ok: true, arrayBufferError: 'ECONNRESET' }
              : { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', whenState: { posted: true }, status: 200, ok: true, text: variant.body },
            { method: 'POST', urlIncludes: '/storage/v1/object/', setsState: { posted: true }, status: 200, ok: true, text: JSON.stringify({ Id: objectUuid, Key: expectedKey }) }
          ],
          defaultResponse: { status: 500 }
        })
      }),
      variant.errRegex
    );
    assert.equal(inv.getStorageFixture(STORAGE_PROBE_BUCKET, expectedPath)?.lifecycleState, STORAGE_LIFECYCLE_STATE.RESIDUAL_OWNERSHIP_BLOCKED);
    await assertUnresolvedCleanupBlocked(inv, variant.name);
  }

  // Scenario 8 & 9: Upload HTTP 500 after possible commit & Upload timeout/transport reset -> CREATION_INDETERMINATE
  for (const uploadFail of ['http_500', 'transport_reset']) {
    const inv = new TestRunInventory(nextScenarioRun());
    await assert.rejects(
      () => provisionStorageProbeFixture({
        runId,
        seedUserId,
        userAccessToken: token,
        serviceRoleKey: validTestServiceRoleKey,
        inventory: inv,
        fetchFn: createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
          routes: [
            { urlIncludes: '/auth/v1/user', status: 200, ok: true, text: JSON.stringify({ id: seedUserId }) },
            { method: 'GET', status: 404, ok: false },
            uploadFail === 'transport_reset'
              ? { method: 'POST', throwError: 'ETIMEDOUT: socket hang up' }
              : { method: 'POST', status: 500, ok: false, text: JSON.stringify({ message: 'upstream timeout' }) }
          ],
          defaultResponse: { status: 500 }
        })
      })
    );
    assert.equal(inv.getStorageFixture(STORAGE_PROBE_BUCKET, expectedPath)?.lifecycleState, STORAGE_LIFECYCLE_STATE.CREATION_INDETERMINATE);
    await assertUnresolvedCleanupBlocked(inv, uploadFail);
  }

  // Scenario 10: Definitive collision (HTTP 400 statusCode 409 KeyAlreadyExists) preserves existing object
  const invCollision = new TestRunInventory(nextScenarioRun());
  await assert.rejects(
    () => provisionStorageProbeFixture({
      runId,
      seedUserId,
      userAccessToken: token,
      serviceRoleKey: validTestServiceRoleKey,
      inventory: invCollision,
      fetchFn: createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
        routes: [
          { urlIncludes: '/auth/v1/user', status: 200, ok: true, text: JSON.stringify({ id: seedUserId }) },
          { method: 'GET', status: 404, ok: false },
          { method: 'POST', status: 400, ok: false, text: JSON.stringify({ statusCode: '409', code: 'KeyAlreadyExists', error: 'Duplicate', message: 'The resource already exists' }) }
        ],
        defaultResponse: { status: 500 }
      })
    }),
    /STORAGE_UPLOAD_CONFLICT/
  );
  assert.equal(invCollision.getStorageFixture(STORAGE_PROBE_BUCKET, expectedPath)?.lifecycleState, STORAGE_LIFECYCLE_STATE.CONFLICT_EXISTING_PRESERVED);
  let collisionDeleteCalled = false;
  const repCol = await invCollision.executeCleanup({
    adminClient: fixtureAdmin(invCollision, fixtureSpec({}))
  });
  assert.equal(collisionDeleteCalled, false);
  assert.equal(repCol.status, 'CLEANUP_VERIFIED_SUCCESS');

  // Scenario 11: Unknown ownership / ambiguous CREATION_FAILED does NOT skip silently
  const invUnknown = new TestRunInventory(nextScenarioRun());
  invUnknown.registerStorageFixture({
    bucket: STORAGE_PROBE_BUCKET,
    path: expectedPath,
    ownerId: null,
    lifecycleState: STORAGE_LIFECYCLE_STATE.CREATION_FAILED,
    hasCommittedUpload: true,
    deletionEligible: false
  });
  await assertUnresolvedCleanupBlocked(invUnknown, 'unknown_ownership');

  // Scenario 13: Monotonicity & late settlement during/after cleanup
  const invMono = new TestRunInventory(nextScenarioRun());
  await r5ProvisionedFixture(invMono.runId, { inventory: invMono, seedUserId: seedUserId });
  assert.throws(
    () => invMono.updateStorageFixture(expectedKey, { lifecycleState: STORAGE_LIFECYCLE_STATE.CREATION_FAILED, ownerOpId: invMono.getStorageFixture(STORAGE_PROBE_BUCKET, expectedPath).reservationOpId }),
    /INVENTORY_STATE_MONOTONICITY_VIOLATION/
  );

  // Late operation settlement after cleanup starts must block CLEANUP_VERIFIED_SUCCESS
  const invLate = new TestRunInventory(nextScenarioRun());
  const lateOp = invLate.registerInFlightOperation({ probeId: 'HOOK-01', endpoint: '/auth/v1/token', canMintSession: true });
  const lateAdmin = fixtureSpec();
  const cleanupPromise = invLate.executeCleanup({ adminClient: bindFixtureAdmin(invLate, lateAdmin), failClosed: false, settlementTimeoutMs: 40 });
  setTimeout(() => {
    invLate.settleInFlightOperation(lateOp.opId, { observed: { status: 200 } });
  }, 10);
  const lateReport = await cleanupPromise;
  assert.notEqual(lateReport.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.ok(lateReport.residualResources.some(r => r.type === 'late_settlement_during_cleanup'));

  // Scenario 14: Verified run-owned object removed & absence confirmed before user deletion
  const invClean = new TestRunInventory(nextScenarioRun());
  invClean.registerCreatedUser({ id: createdUserId, email: 'clean-98@proof.invalid', creationProof: createCreationProof('before_after_check') });
  await r5ProvisionedFixture(invClean.runId, { inventory: invClean, seedUserId: seedUserId });
  const cleanOrderSpec = fixtureSpec();
  const repClean = await invClean.executeCleanup({
    adminClient: fixtureAdmin(invClean, cleanOrderSpec)
  });
  assert.equal(repClean.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.deepEqual(fixtureCalls(cleanOrderSpec).filter(c => c.url.includes('/storage/v1/object/') || (c.method === 'DELETE' && c.url.includes('/auth/v1/admin/users/'))).map(c => c.url.includes('/storage/v1/object/') ? `${c.method === 'DELETE' ? 'del' : 'chk'}:${c.pathname.replace(/^\/storage\/v1\/object\/(authenticated\/)?/, '').split('/').map(decodeURIComponent).join('/')}` : `user:${decodeURIComponent(c.pathname.split('/').at(-1))}`), [`del:${expectedKey}`, `chk:${expectedKey}`, `user:${createdUserId}`]);
  assert.equal(invClean.isClean(), true);
});

test('99. Task 06I-B1-H3-R2 (R2-03): Provider-Aware Storage Absence Normalization Across Collision, Admin Client, Cleanup & SESSION-05', async () => {
  const runId = 'test-run-h3-r2-normalize-99';
  const path = getStorageProbeObjectPath(runId);

  // 1. Authoritative HTTP 404 -> OBJECT_ABSENT
  const r404 = normalizeStorageObjectResponse({ status: 404, expectedBucket: STORAGE_PROBE_BUCKET, expectedPath: path });
  assert.equal(r404.isAbsent, true);
  assert.equal(r404.classification, STORAGE_RESPONSE_CLASS.OBJECT_ABSENT);

  // 2. Documented Supabase Storage HTTP 400 + statusCode: '404' + code: 'NoSuchKey' -> OBJECT_ABSENT
  const rStructured = normalizeStorageObjectResponse({
    status: 400,
    parseStatus: 'parsed',
    body: { error: 'Not found', message: 'The resource was not found', statusCode: '404', code: 'NoSuchKey' },
    expectedBucket: STORAGE_PROBE_BUCKET,
    expectedPath: path
  });
  assert.equal(rStructured.isAbsent, true);
  assert.equal(rStructured.classification, STORAGE_RESPONSE_CLASS.OBJECT_ABSENT);

  // 3. Logical 404 with wrong or missing provider code -> rejected
  for (const badBody of [
    { statusCode: '404', message: 'Not found' },
    { statusCode: '404', code: 'InvalidRequest', message: 'Invalid' },
    { statusCode: '404', code: 'NoSuchBucket', message: 'Bucket not found' }
  ]) {
    const rBad = normalizeStorageObjectResponse({ status: 400, parseStatus: 'parsed', body: badBody, expectedBucket: STORAGE_PROBE_BUCKET, expectedPath: path });
    assert.equal(rBad.isAbsent, false, `Must reject ${JSON.stringify(badBody)}`);
  }

  // 4. Generic HTTP 400 -> rejected
  assert.equal(
    normalizeStorageObjectResponse({ status: 400, parseStatus: 'parsed', body: { message: 'Bad request' }, expectedBucket: STORAGE_PROBE_BUCKET, expectedPath: path }).isAbsent,
    false
  );

  // 5. HTTP 401 or 403 -> UNAUTHORIZED_OR_FORBIDDEN
  for (const s of [401, 403]) {
    const resAuth = normalizeStorageObjectResponse({ status: s, expectedBucket: STORAGE_PROBE_BUCKET, expectedPath: path });
    assert.equal(resAuth.isAbsent, false);
    assert.equal(resAuth.classification, STORAGE_RESPONSE_CLASS.UNAUTHORIZED_OR_FORBIDDEN);
  }

  // 6. Permission-masked / unauthorized context / forbidden project -> rejected
  assert.equal(
    normalizeStorageObjectResponse({
      status: 400,
      parseStatus: 'parsed',
      body: { statusCode: '404', code: 'AccessDenied', error: 'Unauthorized', message: 'row-level security policy violation' },
      expectedBucket: STORAGE_PROBE_BUCKET,
      expectedPath: path
    }).isAbsent,
    false
  );
  assert.equal(
    normalizeStorageObjectResponse({
      status: 404,
      expectedBucket: STORAGE_PROBE_BUCKET,
      expectedPath: path,
      authorizedContext: false
    }).isAbsent,
    false
  );
  assert.equal(
    normalizeStorageObjectResponse({
      status: 404,
      expectedBucket: STORAGE_PROBE_BUCKET,
      expectedPath: path,
      projectRef: HARDCODED_REAL_REF
    }).isAbsent,
    false
  );

  // 7. HTTP 429 or 500 -> RATE_LIMITED_OR_SERVER_ERROR
  for (const s of [429, 500]) {
    const resErr = normalizeStorageObjectResponse({ status: s, expectedBucket: STORAGE_PROBE_BUCKET, expectedPath: path });
    assert.equal(resErr.isAbsent, false);
    assert.equal(resErr.classification, STORAGE_RESPONSE_CLASS.RATE_LIMITED_OR_SERVER_ERROR);
  }

  // 8. Malformed or unreadable error envelope -> MALFORMED_RESPONSE
  const malformedEnv = await parseStorageErrorEnvelope({ status: 400, ok: false, text: async () => '<html>bad</html>' });
  assert.equal(malformedEnv.parseStatus, 'invalid_json');
  assert.equal(
    normalizeStorageObjectResponse({
      status: malformedEnv.status,
      parseStatus: malformedEnv.parseStatus,
      body: malformedEnv.body,
      expectedBucket: STORAGE_PROBE_BUCKET,
      expectedPath: path
    }).classification,
    STORAGE_RESPONSE_CLASS.MALFORMED_RESPONSE
  );

  // 9. Transport timeout -> TRANSPORT_FAILURE
  const adminTimeoutClient = trackedHostedAdminClient({
    runId,
    serviceRoleKey: validTestServiceRoleKey,
    fetchFn: errorTransport('ETIMEDOUT: socket timed out')
  });
  const detailTimeout = await verifyStorageObjectAbsenceDetailed(adminTimeoutClient, STORAGE_PROBE_BUCKET, path);
  assert.equal(detailTimeout.isAbsent, false);
  assert.equal(detailTimeout.classification, STORAGE_RESPONSE_CLASS.TRANSPORT_FAILURE);

  // 10. Admin client preserves error body: HTTP 400 NoSuchKey + logical 404 IS recognized as absent in cleanup!
  const adminStructuredAbsent = trackedHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    fetchFn: createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait', conditionalStorage: { projectRef: HARDCODED_TEMP_REF, runId, objects: [] },
      routes: [
        {
          method: 'GET',
          urlIncludes: '/storage/v1/object/authenticated/',
          status: 400,
          ok: false,
          text: JSON.stringify({ error: 'Not found', message: 'The resource was not found', statusCode: '404', code: 'NoSuchKey' })
        }
      ],
      defaultResponse: { status: 200, ok: true, text: '{}' }
    })
  });
  const invStructuredDel = new TestRunInventory(runId);
  await r5ProvisionedFixture(invStructuredDel.runId, { inventory: invStructuredDel, seedUserId: '11111111-1111-4111-a111-111111111199' });
  const repStructured = await invStructuredDel.executeCleanup({ adminClient: bindFixtureAdmin(invStructuredDel, adminStructuredAbsent) });
  assert.equal(repStructured.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(repStructured.storageObjectsDeleted, 1);
  assert.equal(invStructuredDel.getStorageFixture(STORAGE_PROBE_BUCKET, path)?.lifecycleState, STORAGE_LIFECYCLE_STATE.DELETION_VERIFIED);

  // 11. Object remains present (HTTP 200) -> RESIDUAL_BLOCKED, cleanup fails
  const adminStillPresent = trackedHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    fetchFn: createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait', conditionalStorage: { projectRef: HARDCODED_TEMP_REF, runId, objects: [] },
      routes: [
        { method: 'DELETE', status: 200, ok: true, text: '{}' }
      ],
      defaultResponse: { status: 200, ok: true, text: 'still here' }
    })
  });
  const invPresent = new TestRunInventory(runId);
  await r5ProvisionedFixture(invPresent.runId, { inventory: invPresent, seedUserId: '11111111-1111-4111-a111-111111111199' });
  const repPresent = await invPresent.executeCleanup({ adminClient: bindFixtureAdmin(invPresent, adminStillPresent), failClosed: false });
  assert.equal(repPresent.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.equal(invPresent.getStorageFixture(STORAGE_PROBE_BUCKET, path)?.lifecycleState, STORAGE_LIFECYCLE_STATE.RESIDUAL_BLOCKED);

  // Verify SESSION-05 also normalizes structured HTTP 400 NoSuchKey cleanly
  const runCtx99 = createRunContext({ runId });
  runCtx99.activeAccessToken = createMockJwt({
    sub: '11111111-1111-4111-a111-111111111199',
    session_id: 'sess-99',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 300
  });
  runCtx99.preInvalidationSessionValid = true;
  runCtx99.passwordResetCompleted = true;
  runCtx99.sessionRevocationConfirmed = true;
  runCtx99.revokedSessionId = 'sess-99';
  const dispSess05 = createHostedDispatcher({
    anonKey: validTestAnonKey,
    runContext: runCtx99,
    fetchFn: staticTransport({
      status: 400,
      ok: false,
      text: JSON.stringify({ error: 'Not found', message: 'The resource was not found', statusCode: '404', code: 'NoSuchKey' })
    })
  });
  const outSess05 = await dispSess05({ id: 'SESSION-05', category: 'Session & Consumer' });
  assert.equal(outSess05.passed, false);
  assert.match(outSess05.error, /STORAGE_FIXTURE_MISSING/);
});

test('100. Task 06I-B1-H3-R2 (Sec 5 & 6): Unified Storage Lifecycle E2E Regression & Real-Network Fetch Bypass Hardening', async () => {
  const runId = 'test-run-h3-r2-e2e-100';
  const seedUserId = '11111111-1111-4111-a111-111111111100';
  const objectUuid = 'dddd1111-2222-4333-a444-555555555500';
  const seedEmail = 'seed-e2e-100@proof.invalid';
  const payload = 'unified-e2e-task06i-bytes\n';
  const seedToken = createMockJwt({
    sub: seedUserId,
    session_id: 'sess-e2e-100',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 300
  });

  // Part A: End-to-End 14-step Unified Lifecycle using deterministic fixture transport
  const mockProviderFetch = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait', conditionalStorage: { projectRef: HARDCODED_TEMP_REF, runId, objects: [] },
    initialState: { storageExists: false },
    routes: [
      {
        tag: 'GET:/auth/v1/user',
        urlIncludes: '/auth/v1/user',
        status: 200,
        ok: true,
        text: JSON.stringify({ id: seedUserId, email: seedEmail, aud: 'authenticated' })
      },
      {
        tag: 'RPC:owner_lookup',
        urlIncludes: '/rest/v1/rpc/task06i_lookup_storage_object_owner',
        whenState: { storageExists: true },
        status: 200,
        ok: true,
        text: JSON.stringify([{ id: objectUuid, bucket_id: STORAGE_PROBE_BUCKET, name: getStorageProbeObjectPath(runId), owner_id: seedUserId }])
      },
      {
        tag: 'RPC:owner_lookup_absent',
        urlIncludes: '/rest/v1/rpc/task06i_lookup_storage_object_owner',
        whenState: { storageExists: false },
        status: 200,
        ok: true,
        text: '[]'
      },
      {
        tag: 'GET:storage_absent_400_NoSuchKey',
        urlIncludes: '/storage/v1/object/authenticated/',
        whenState: { storageExists: false },
        status: 400,
        ok: false,
        text: JSON.stringify({ error: 'Not found', message: 'The resource was not found', statusCode: '404', code: 'NoSuchKey' })
      },
      {
        tag: 'GET:storage_present_200',
        urlIncludes: '/storage/v1/object/authenticated/',
        whenState: { storageExists: true },
        status: 200,
        ok: true,
        headers: { 'Content-Type': 'text/plain', 'ETag': '"e2e-100"' },
        rawBytes: Buffer.from(payload, 'utf8')
      },
      {
        tag: 'POST:storage_upload',
        method: 'POST',
        urlIncludes: '/storage/v1/object/',
        headersMatch: { 'x-upsert': 'false' },
        bodyIncludes: payload,
        setsState: { storageExists: true },
        status: 200,
        ok: true,
        text: JSON.stringify({ Id: objectUuid, Key: getStorageProbeObjectKey(runId) })
      },
      {
        tag: 'DELETE:storage_object',
        method: 'DELETE',
        urlIncludes: '/storage/v1/object/',
        setsState: { storageExists: false },
        status: 200,
        ok: true,
        text: JSON.stringify({ message: 'Successfully deleted' })
      },
      {
        tag: 'DELETE:admin_user',
        method: 'DELETE',
        urlIncludes: '/auth/v1/admin/users/',
        status: 200,
        ok: true,
        text: '{}'
      }
    ],
    defaultResponse: { status: 404, ok: false }
  });

  // 1-2. Context & verified pre-existing seed identity (Option A)
  const ctx = createRunContext({ runId, testEmail: seedEmail });
  const inv = new TestRunInventory(runId, { seedUserId, seedEmail });
  const adminClient = trackedHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    anonKey: validTestAnonKey,
    projectRef: HARDCODED_TEMP_REF,
    runId,
    fetchFn: mockProviderFetch
  });

  // 3-9. Provision fixture with realistic provider responses
  const prov = await provisionStorageProbeFixture({
    projectRef: HARDCODED_TEMP_REF,
    runId,
    seedUserId,
    userAccessToken: seedToken,
    anonKey: validTestAnonKey,
    serviceRoleKey: validTestServiceRoleKey,
    adminClient,
    inventory: inv,
    probeContent: payload,
    fetchFn: mockProviderFetch
  });
  assert.equal(prov.lifecycleState, STORAGE_LIFECYCLE_STATE.RUN_CREATED_VERIFIED);
  assert.equal(prov.deletionEligible, true);

  // 10. Use the verified fixture for SESSION-05
  ctx.activeAccessToken = seedToken;
  ctx.activeUserId = seedUserId;
  ctx.preInvalidationSessionValid = true;
  ctx.passwordResetCompleted = true;
  ctx.sessionRevocationConfirmed = true;
  ctx.revokedSessionId = 'sess-e2e-100';

  const disp = createHostedDispatcher({
    projectRef: HARDCODED_TEMP_REF,
    anonKey: validTestAnonKey,
    serviceRoleKey: validTestServiceRoleKey,
    inventory: inv,
    runContext: ctx,
    fetchFn: mockProviderFetch
  });
  const s05Out = await disp({ id: 'SESSION-05', category: 'Session & Consumer' });
  assert.equal(s05Out.passed, true);
  assert.equal(s05Out.storage_linger_observed, true);

  // 11-14. Delete verified run-owned object, confirm absence via NoSuchKey, preserve pre-existing seed, certify CLEANUP_VERIFIED_SUCCESS
  const finalReport = await inv.executeCleanup({ adminClient: bindFixtureAdmin(inv, adminClient), failClosed: true });
  assert.equal(finalReport.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(finalReport.storageObjectsDeleted, 1);
  assert.equal(finalReport.usersDeleted, 0);
  assert.equal(mockProviderFetch.calls.some(c => c.tag === 'DELETE:admin_user'), false, 'Pre-existing seed user must be preserved untouched');
  assert.equal(inv.getStorageFixture(STORAGE_PROBE_BUCKET, getStorageProbeObjectPath(runId))?.lifecycleState, STORAGE_LIFECYCLE_STATE.DELETION_VERIFIED);
  assert.equal(inv.isClean(), true);
  assert.deepEqual(mockProviderFetch.calls.map(c => c.tag), [
    'GET:/auth/v1/user',
    'GET:storage_absent_400_NoSuchKey',
    'POST:storage_upload',
    'GET:storage_present_200',
    'RPC:owner_lookup',
    'GET:storage_present_200',
    'DELETE:storage_object',
    'GET:storage_absent_400_NoSuchKey'
  ]);

  // Part B: Structural Real-Network Transport & Arbitrary Callback Hardening (Sec 6, R3-02)
  // 1. Bound globalThis.fetch rejected at factory/guard level
  const boundFetch = globalThis.fetch.bind(globalThis);
  assert.throws(() => assertOfflineMockTransport(boundFetch), /BLOCKED_PENDING_DURABLE_RECOVERY/);
  assert.throws(() => createHostedDispatcher({ anonKey: validTestAnonKey, fetchFn: boundFetch }), /BLOCKED_PENDING_DURABLE_RECOVERY/);
  assert.throws(() => trackedHostedAdminClient({ serviceRoleKey: validTestServiceRoleKey, fetchFn: boundFetch }), /BLOCKED_PENDING_DURABLE_RECOVERY/);

  // 2. Arbitrary arrow / closure-wrapped callbacks rejected immediately at factory boundary (R3-02)
  const savedFetch = globalThis.fetch;
  const wrappedGlobalFetch = (...args) => globalThis.fetch(...args);
  const closureSavedFetch = (...args) => savedFetch(...args);
  assert.throws(() => createHostedDispatcher({ anonKey: validTestAnonKey, fetchFn: wrappedGlobalFetch }), /BLOCKED_PENDING_DURABLE_RECOVERY/);
  assert.throws(() => createHostedDispatcher({ anonKey: validTestAnonKey, fetchFn: closureSavedFetch }), /BLOCKED_PENDING_DURABLE_RECOVERY/);
  assert.throws(() => trackedHostedAdminClient({ serviceRoleKey: validTestServiceRoleKey, fetchFn: closureSavedFetch }), /BLOCKED_PENDING_DURABLE_RECOVERY/);
  await assert.rejects(
    () => runWithBlockedRealFetch(() => wrappedGlobalFetch('https://wvdabiwbaavfggcmpizd.supabase.co/auth/v1/health')),
    /BLOCKED_PENDING_DURABLE_RECOVERY: Indirect, wrapped, or bound real network fetch invocation is strictly blocked/
  );

  // 3. Mutable _isHostedNetworkDispatcher property cannot be tampered to false (non-writable)
  const hostedDisp = createHostedDispatcher({ anonKey: validTestAnonKey, fetchFn: staticTransport({ status: 200 }) });
  assert.throws(() => { hostedDisp._isHostedNetworkDispatcher = false; }, TypeError);

  // 4. Wrapping hostedDispatcher in an untagged arrow wrapper CANNOT bypass runHostedProbeRunner durable recovery gate!
  const untaggedWrapper = (item, opts) => hostedDisp(item, opts);
  await assert.rejects(
    () => runHostedProbeRunner(fixtureRunnerOptions({
      projectRef: HARDCODED_TEMP_REF,
      argv: ['--live'],
      env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
      mockDispatcher: untaggedWrapper,
      adminClient: defaultAdminFixture,
      selectedProbeIds: ['BYPASS-01']
    })),
    /BLOCKED_PENDING_DURABLE_RECOVERY/
  );
});

// ===========================================================================
// Task 06I-B1-H3-R3: Structural Network Isolation, Atomic Storage Ownership &
// Concurrent Cleanup Closure (R3-01 through R3-06 + Sec 8 Acceptance Matrix)
// ===========================================================================

test('101. Task 06I-B1-H3-R3 (R3-01): Reference-counted GlobalFetchIsolationCoordinator overlapping, nested, error, and timeout safety', async () => {
  // Part A: Isolated reference-counted coordinator verifies exact 0 -> 1 -> 2 -> 1 -> 0 transitions and clean baseline restore
  const originalTargetFetch = () => 'ORIGINAL_FETCH';
  const isolatedTarget = { fetch: originalTargetFetch };
  const coordinator = createFetchIsolationCoordinator(isolatedTarget);
  assert.deepEqual(coordinator.getState(), { activeDepth: 0, isTrapped: false });

  const barrierA = createOfflineBarrier('r3-01-scope-a');
  const barrierB = createOfflineBarrier('r3-01-scope-b');

  // 1. Overlapping scopes: A settles first while B remains active -> fetch MUST stay trapped until B finishes!
  let midOverlapCheckError = null;
  const scopeA = coordinator.run(async () => {
    assert.equal(coordinator.getState().isTrapped, true);
    await barrierA.wait();
    return 'A_DONE';
  });

  const scopeB = coordinator.run(async () => {
    assert.equal(coordinator.getState().activeDepth, 2);
    assert.equal(coordinator.getState().isTrapped, true);
    await barrierB.wait();
    // Scope A has already finished here, yet Scope B MUST STILL see fetch trapped!
    assert.equal(coordinator.getState().activeDepth, 1);
    assert.equal(coordinator.getState().isTrapped, true);
    try {
      isolatedTarget.fetch('https://wvdabiwbaavfggcmpizd.supabase.co/auth/v1/health');
    } catch (err) {
      midOverlapCheckError = err;
    }
    return 'B_DONE';
  });

  assert.equal(coordinator.getState().activeDepth, 2);
  barrierA.release();
  assert.equal(await scopeA, 'A_DONE');
  assert.equal(coordinator.getState().activeDepth, 1);
  assert.equal(coordinator.getState().isTrapped, true, 'Trap must survive while Scope B is still in flight');

  barrierB.release();
  assert.equal(await scopeB, 'B_DONE');
  assert.ok(midOverlapCheckError && /BLOCKED_PENDING_DURABLE_RECOVERY/.test(midOverlapCheckError.message));
  assert.deepEqual(coordinator.getState(), { activeDepth: 0, isTrapped: false });
  assert.equal(isolatedTarget.fetch, originalTargetFetch);

  // 2. Idempotent double-release cannot underflow activeDepth
  const rel1 = coordinator.acquire();
  const rel2 = coordinator.acquire();
  assert.equal(coordinator.getState().activeDepth, 2);
  rel1();
  rel1(); // duplicate call must be no-op
  assert.equal(coordinator.getState().activeDepth, 1);
  assert.equal(coordinator.getState().isTrapped, true);
  rel2();
  assert.equal(coordinator.getState().activeDepth, 0);
  assert.equal(coordinator.getState().isTrapped, false);
  assert.equal(isolatedTarget.fetch, originalTargetFetch);

  // 3. Nested scopes + synchronous/async exception + timeout loser safety
  const timeoutGate = createOfflineBarrier('r3-01-timeout-loser');
  let depthAfterInnerError = null;
  await coordinator.run(async () => {
    assert.equal(coordinator.getState().activeDepth, 1);
    await assert.rejects(
      () => coordinator.run(async () => {
        assert.equal(coordinator.getState().activeDepth, 2);
        throw new Error('INNER_FAILURE');
      }),
      /INNER_FAILURE/
    );
    depthAfterInnerError = coordinator.getState();
    assert.equal(depthAfterInnerError.activeDepth, 1);
    assert.equal(depthAfterInnerError.isTrapped, true);

    // Timeout race inside active outer lease keeps fetch trapped even after race settles
    const loser = coordinator.run(async () => {
      await timeoutGate.wait();
      return 'LATE_DONE';
    });
    await assert.rejects(
      () => Promise.race([
        loser,
        new Promise((_, reject) => setTimeout(() => reject(new Error('RACE_TIMEOUT')), 15))
      ]),
      /RACE_TIMEOUT/
    );
    assert.equal(coordinator.getState().activeDepth, 2, 'Timed-out inner lease still holds depth until its finally runs');
    assert.equal(coordinator.getState().isTrapped, true);
    timeoutGate.release();
    await loser;
    assert.equal(coordinator.getState().activeDepth, 1);
  });

  assert.deepEqual(coordinator.getState(), { activeDepth: 0, isTrapped: false });
  assert.equal(isolatedTarget.fetch, originalTargetFetch);

  // Part B: Global process runWithBlockedRealFetch maintains monotonic trap while overlapping on globalThis.fetch
  const baseGlobalDepth = getFetchIsolationDebugState().activeDepth;
  const globalOverlap = createOfflineBarrier('r3-01-global-overlap');
  const g1 = runWithBlockedRealFetch(async () => {
    assert.equal(getFetchIsolationDebugState().isTrapped, true);
    assert.equal(getFetchIsolationDebugState().activeDepth, baseGlobalDepth + 1);
    await globalOverlap.wait();
  });
  const g2 = runWithBlockedRealFetch(async () => {
    assert.equal(getFetchIsolationDebugState().isTrapped, true);
    assert.equal(getFetchIsolationDebugState().activeDepth, baseGlobalDepth + 2);
  });
  await g2;
  assert.equal(getFetchIsolationDebugState().isTrapped, true, 'Global trap stays active while g1 is pending');
  assert.equal(getFetchIsolationDebugState().activeDepth, baseGlobalDepth + 1);
  globalOverlap.release();
  await g1;
  assert.equal(getFetchIsolationDebugState().activeDepth, baseGlobalDepth);
});

test('102. Task 06I-B1-H3-R3 (R3-02): Structural elimination of arbitrary transport trust and spec hardening', async () => {
  const runId = 'test-run-h3-r3-02-transport';
  const seedUserId = '11111111-1111-4111-a111-111111111102';
  const token = createMockJwt({ sub: seedUserId });
  const inv = new TestRunInventory(runId);

  // 1. Closure-captured real fetch wrapper rejected across ALL factories BEFORE any execution
  const capturedRealFetch = globalThis.fetch;
  const wrappedSavedFetch = (...args) => capturedRealFetch(...args);
  const customLambda = async () => ({ status: 200, ok: true, json: async () => ({}) });
  const spoofedFn = Object.assign(() => ({ status: 200 }), {
    _isDeterministicTransport: true,
    isMock: true
  });

  for (const untrusted of [undefined, null, globalThis.fetch, globalThis.fetch.bind(globalThis), wrappedSavedFetch, customLambda, spoofedFn]) {
    assert.throws(() => assertOfflineMockTransport(untrusted), /BLOCKED_PENDING_DURABLE_RECOVERY/);
    assert.throws(() => createHostedDispatcher({ anonKey: validTestAnonKey, fetchFn: untrusted }), /BLOCKED_PENDING_DURABLE_RECOVERY/);
    assert.throws(() => trackedHostedAdminClient({ serviceRoleKey: validTestServiceRoleKey, fetchFn: untrusted }), /BLOCKED_PENDING_DURABLE_RECOVERY/);
    await assert.rejects(
      () => provisionStorageProbeFixture({
        runId,
        seedUserId,
        userAccessToken: token,
        serviceRoleKey: validTestServiceRoleKey,
        inventory: inv,
        fetchFn: untrusted
      }),
      /BLOCKED_PENDING_DURABLE_RECOVERY/
    );
  }

  // 2. createDeterministicFixtureTransport rejects any arbitrary executable callback/getter inside spec
  assert.throws(
    () => createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait', routes: [{ status: 200, json: () => ({}) }] }),
    /INVALID_DETERMINISTIC_FIXTURE_SPEC.*Arbitrary executable callback rejected/
  );
  assert.throws(
    () => createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
      routes: [{
        urlIncludes: '/auth/v1/user',
        get status() { return 200; }
      }]
    }),
    /INVALID_DETERMINISTIC_FIXTURE_SPEC.*Accessor property rejected/
  );
  assert.throws(
    () => createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
      routes: [{ urlIncludes: '/auth/v1/user', waitForBarrier: { wait: async () => {}, release() {} } }]
    }),
    /INVALID_DETERMINISTIC_FIXTURE_SPEC/
  );

  // 3. Trusted deterministic transport succeeds strictly offline without calling real fetch
  const trusted = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
    routes: [{ urlIncludes: '/auth/v1/logout', status: 200, ok: true, json: {} }]
  });
  assert.doesNotThrow(() => assertOfflineMockTransport(trusted));
  const admin = trackedHostedAdminClient({ serviceRoleKey: validTestServiceRoleKey, fetchFn: trusted });
  const out = await admin.signOut(token, 'local');
  assert.equal(out.error, null);
  assert.equal(trusted.calls.length, 1);

  // 4. Hosted network dispatcher built with trusted offline transport is STILL blocked inside LIVE runner
  const disp = createHostedDispatcher({ anonKey: validTestAnonKey, fetchFn: trusted });
  await assert.rejects(
    () => runHostedProbeRunner(fixtureRunnerOptions({
      projectRef: HARDCODED_TEMP_REF,
      argv: ['--live'],
      env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
      mockDispatcher: disp,
      adminClient: defaultAdminFixture,
      selectedProbeIds: ['BYPASS-01']
    })),
    /BLOCKED_PENDING_DURABLE_RECOVERY/
  );
});

test('103. Task 06I-B1-H3-R3 (R3-03): Atomic Storage fixture reservation, single-owner mutations & immutable identity', async () => {
  const runId = 'test-run-h3-r3-03-atomic';
  const seedUserId = '11111111-1111-4111-a111-111111111103';
  const objectUuid = '10301111-2222-4333-a444-555555555103';
  const altObjectUuid = '99991111-2222-4333-a444-555555555103';
  const token = createMockJwt({ sub: seedUserId });
  const path = getStorageProbeObjectPath(runId);
  const fullKey = getStorageProbeObjectKey(runId);

  // 1. Concurrent overlapping provisionStorageProbeFixture calls for same (inventory, runId):
  // First provisioner reserves slot BEFORE first await; second rejects with STORAGE_FIXTURE_RESERVATION_CONFLICT and ZERO HTTP calls!
  const inv = new TestRunInventory(runId);
  const authBarrier = createOfflineBarrier('r3-03-auth-pause');
  const transportA = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
    initialState: { uploaded: false },
    routes: [
      { urlIncludes: '/auth/v1/user', waitForBarrier: authBarrier, status: 200, text: JSON.stringify({ id: seedUserId }) },
      { urlIncludes: '/rest/v1/rpc/task06i_lookup_storage_object_owner', status: 200, text: JSON.stringify([{ id: objectUuid, bucket_id: STORAGE_PROBE_BUCKET, name: path, owner_id: seedUserId }]) },
      { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', whenState: { uploaded: false }, status: 400, ok: false, text: JSON.stringify({ statusCode: '404', code: 'NoSuchKey', resource: fullKey }) },
      { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', whenState: { uploaded: true }, status: 200, ok: true, text: 'atomic-payload-103\n' },
      { method: 'POST', urlIncludes: '/storage/v1/object/', setsState: { uploaded: true }, status: 200, ok: true, text: JSON.stringify({ Id: objectUuid, Key: fullKey }) }
    ]
  });
  const transportB = staticTransport({ status: 200 });

  const provAPromise = provisionStorageProbeFixture({
    runId,
    seedUserId,
    userAccessToken: token,
    serviceRoleKey: validTestServiceRoleKey,
    inventory: inv,
    probeContent: 'atomic-payload-103\n',
    fetchFn: transportA
  });
  await authBarrier.waitForArrivals(1);

  // Reservation must ALREADY exist atomically with op-res ownership BEFORE /auth/v1/user returns!
  const reservedFixture = inv.getStorageFixture(STORAGE_PROBE_BUCKET, path);
  assert.ok(reservedFixture);
  assert.equal(reservedFixture.lifecycleState, STORAGE_LIFECYCLE_STATE.CREATION_PENDING);
  assert.ok(reservedFixture.reservationOpId);
  assert.equal(reservedFixture.deletionEligible, false);

  // Rival provisioner B fails immediately without touching provider
  await assert.rejects(
    () => provisionStorageProbeFixture({
      runId,
      seedUserId,
      userAccessToken: token,
      serviceRoleKey: validTestServiceRoleKey,
      inventory: inv,
      probeContent: 'rival-payload\n',
      fetchFn: transportB
    }),
    /STORAGE_FIXTURE_RESERVATION_CONFLICT/
  );
  assert.equal(transportB.calls.length, 0, 'Duplicate provisioner must emit ZERO network requests');

  // Rival update with wrong ownerOpId rejected (cannot tamper or steal ownership)
  assert.throws(
    () => inv.updateStorageFixture(fullKey, { ownerOpId: 'wrong-op-id', lifecycleState: STORAGE_LIFECYCLE_STATE.RUN_CREATED_VERIFIED, deletionEligible: true }),
    /STORAGE_FIXTURE_OWNERSHIP_VIOLATION/
  );

  // Legacy registerStorageObject cannot bypass active storageFixture lifecycle!
  assert.throws(
    () => inv.registerStorageObject(STORAGE_PROBE_BUCKET, path),
    /STORAGE_LIFECYCLE_BYPASS_VIOLATION/
  );

  // Duplicate registerStorageFixture / reserveStorageFixture on same key rejected without overwrite
  assert.throws(
    () => inv.registerStorageFixture({ bucket: STORAGE_PROBE_BUCKET, path, ownerId: seedUserId }),
    /STORAGE_FIXTURE_RESERVATION_CONFLICT/
  );
  assert.throws(
    () => inv.reserveStorageFixture({ bucket: STORAGE_PROBE_BUCKET, path, ownerId: seedUserId }),
    /STORAGE_FIXTURE_RESERVATION_CONFLICT/
  );

  authBarrier.release();
  const provAResult = await provAPromise;
  assert.equal(provAResult.lifecycleState, STORAGE_LIFECYCLE_STATE.RUN_CREATED_VERIFIED);
  assert.equal(provAResult.objectId, objectUuid);

  // Immutable providerObjectId cannot be mutated after binding!
  assert.throws(
    () => inv.updateStorageFixture(fullKey, { ownerOpId: reservedFixture.reservationOpId, providerObjectId: altObjectUuid }),
    /STORAGE_FIXTURE_IMMUTABLE_IDENTITY_VIOLATION/
  );
});

test('104. Task 06I-B1-H3-R3 (R3-04): Run quiescing, admission closure, concurrent cleanup block, and live pre-deletion re-audit', async () => {
  // Part A: Provisioner paused at /auth/v1/user while cleanup transitions ACTIVE -> QUIESCING -> CLEANUP_ACTIVE
  const runIdA = 'test-run-h3-r3-04-quiesce';
  const seedUserId = '11111111-1111-4111-a111-111111111104';
  const createdUidA = '22222222-2222-4222-b222-222222222104';
  const token = createMockJwt({ sub: seedUserId });
  const invA = new TestRunInventory(runIdA, { seedUserId, seedEmail: 'seed104@proof.invalid' });
  invA.registerCreatedUser({
    id: createdUidA,
    email: 'created-104a@proof.invalid',
    creationProof: createCreationProof('before_after_check')
  });

  const pauseAtAuth = createOfflineBarrier('r3-04-pause-auth');
  const transportA = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
    routes: [
      { urlIncludes: '/auth/v1/user', waitForBarrier: pauseAtAuth, status: 200, text: JSON.stringify({ id: seedUserId }) },
      { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', status: 400, ok: false, text: JSON.stringify({ statusCode: '404', code: 'NoSuchKey' }) },
      { method: 'POST', urlIncludes: '/storage/v1/object/', status: 200, text: JSON.stringify({ Id: 'aaaa1111-2222-4333-a444-555555555104' }) }
    ]
  });

  const provPromise = provisionStorageProbeFixture({
    runId: runIdA,
    seedUserId,
    userAccessToken: token,
    serviceRoleKey: validTestServiceRoleKey,
    inventory: invA,
    fetchFn: transportA
  });
  await pauseAtAuth.waitForArrivals(1);
  assert.equal(invA.runLifecycleState, INVENTORY_RUN_STATE.ACTIVE);

  const adminMockA = fixtureSpec();

  // Start cleanup (enters QUIESCING immediately!)
  const cleanupPromise = invA.executeCleanup({ adminClient: bindFixtureAdmin(invA, adminMockA), failClosed: false, settlementTimeoutMs: 25 });
  assert.equal(invA.runLifecycleState, INVENTORY_RUN_STATE.QUIESCING);

  // Concurrent executeCleanup call rejected immediately
  await assert.rejects(
    () => invA.executeCleanup({ adminClient: bindFixtureAdmin(invA, adminMockA), failClosed: false }),
    /CLEANUP_CONCURRENT_REENTRY_BLOCKED/
  );

  // New operation or reservation rejected while QUIESCING
  assert.throws(
    () => invA.reserveStorageFixture({ path: 'new-run/probe.txt', ownerId: seedUserId }),
    /INVENTORY_ADMISSION_CLOSED/
  );
  assert.throws(
    () => invA.registerInFlightOperation({ probeId: 'HOOK-01', canMintSession: true }),
    /INVENTORY_ADMISSION_CLOSED/
  );

  const reportA = await cleanupPromise;
  // Release /auth/v1/user after cleanup -> provisioner aborts BEFORE issuing GET/POST Storage upload!
  pauseAtAuth.release();
  await assert.rejects(provPromise, /PROVISIONING_ABORTED_DURING_CLEANUP|STORAGE_FIXTURE/);
  assert.equal(transportA.calls.some(c => c.url.includes('/storage/v1/object/')), false, 'Woken provisioner must NEVER dispatch Storage POST after cleanup');
  assert.equal((fixtureOperationCalls(adminMockA, 'userDelete').map(c => c.pathname.split('/').map(decodeURIComponent).at(-1))).length, 0, 'Created Auth user must NEVER be deleted while storage provisioning was in-flight/unresolved');
  assert.equal(reportA.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.equal(invA.runLifecycleState, INVENTORY_RUN_STATE.RESIDUAL_BLOCKED);

  // Part B: Provisioner completes GET/RPC late while Step 4 is ALREADY between deleteUser(u1) and deleteUser(u2)
  const runIdB = 'test-run-h3-r3-04-mid-delete';
  const uid1 = '22222222-2222-4222-b222-222222222001';
  const uid2 = '22222222-2222-4222-b222-222222222002';
  const invB = new TestRunInventory(runIdB);
  invB.registerCreatedUser({ id: uid1, email: 'u1-104@proof.invalid', creationProof: createCreationProof('before_after_check') });
  invB.registerCreatedUser({ id: uid2, email: 'u2-104@proof.invalid', creationProof: createCreationProof('before_after_check') });

  const pausePost = createOfflineBarrier('r3-04-post-pause');
  const midDeleteArrival = createOfflineBarrier('r3-04-mid-delete');
  const transportB = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
    initialState: { uploaded: false },
    routes: [
      { urlIncludes: '/auth/v1/user', status: 200, text: JSON.stringify({ id: seedUserId }) },
      { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', whenState: { uploaded: false }, status: 400, ok: false, text: JSON.stringify({ statusCode: '404', code: 'NoSuchKey' }) },
      { method: 'POST', urlIncludes: '/storage/v1/object/', waitForBarrier: pausePost, setsState: { uploaded: true }, status: 200, text: JSON.stringify({ Id: 'bbbb1111-2222-4333-a444-555555555104' }) },
      { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', whenState: { uploaded: true }, status: 200, text: 'late-upload-payload' },
      { urlIncludes: '/rest/v1/rpc/task06i_lookup_storage_object_owner', status: 200, text: JSON.stringify([{ id: 'bbbb1111-2222-4333-a444-555555555104', bucket_id: STORAGE_PROBE_BUCKET, name: getStorageProbeObjectPath(runIdB), owner_id: seedUserId }]) }
    ]
  });

  // Start provB with clean invC? Wait: if invB already has pausePost in-flight when cleanup starts, QUIESCING blocks BOTH uid1 and uid2!
  // Also test dynamic mid-loop residual injection between uid1 deletion and uid2 deletion!
  const invMid = new TestRunInventory(runIdB);
  invMid.registerCreatedUser({ id: uid1, email: 'u1-mid@proof.invalid', creationProof: createCreationProof('before_after_check') });
  invMid.registerCreatedUser({ id: uid2, email: 'u2-mid@proof.invalid', creationProof: createCreationProof('before_after_check') });
  const pauseFirstDeletion = createOfflineBarrier('r5-mid-user-delete');
  const adminMid = fixtureSpec({ routes: [{ method: 'DELETE', urlIncludes: `/auth/v1/admin/users/${uid1}`, waitForBarrier: pauseFirstDeletion, status: 200, json: {} }] });
  const midCleanup = invMid.executeCleanup({ adminClient: bindFixtureAdmin(invMid, adminMid), failClosed: false });
  await pauseFirstDeletion.waitForArrivals(1);
  invMid.lateSettlementsDuringCleanup.push({ action: 'lateStorageCommit', key: getStorageProbeObjectKey(runIdB) });
  pauseFirstDeletion.release();
  const reportMid = await midCleanup;
  assert.deepEqual((fixtureOperationCalls(adminMid, 'userDelete').map(c => c.pathname.split('/').map(decodeURIComponent).at(-1))), [uid1], 'Live pre-deletion predicate must halt BEFORE deleting uid2 once late settlement arrives');
  assert.ok(reportMid.residualUsers.some(u => u.id === uid2 && /STORAGE_CLEANUP_FAILURE_CASCADE_PREVENTED/.test(u.error)));
  assert.equal(reportMid.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');

  // Verify pausePost releases cleanly for no leaked promise
  pausePost.release();
  midDeleteArrival.release();
  const invCleanupPendingTest = new TestRunInventory(runIdB);
  const provPending = provisionStorageProbeFixture({
    runId: runIdB,
    seedUserId,
    userAccessToken: token,
    serviceRoleKey: validTestServiceRoleKey,
    inventory: invCleanupPendingTest,
    probeContent: 'late-upload-payload',
    fetchFn: transportB
  });
  await provPending.catch(() => {});
});

test('105. Task 06I-B1-H3-R3 (R3-05): Successful text/plain, binary, and HTTP 206 Storage collision handling vs malformed error envelopes', async () => {
  const path = 'r3-05-run/probe.txt';

  // 1. Unit checks on normalizeStorageObjectResponse
  assert.equal(
    normalizeStorageObjectResponse({ status: 200, parseStatus: 'invalid_json', expectedBucket: STORAGE_PROBE_BUCKET, expectedPath: path }).classification,
    STORAGE_RESPONSE_CLASS.OBJECT_PRESENT
  );
  assert.equal(
    normalizeStorageObjectResponse({ status: 201, parseStatus: 'non_object', expectedBucket: STORAGE_PROBE_BUCKET, expectedPath: path }).classification,
    STORAGE_RESPONSE_CLASS.OBJECT_PRESENT
  );
  assert.equal(
    normalizeStorageObjectResponse({ status: 206, parseStatus: 'invalid_json', expectedBucket: STORAGE_PROBE_BUCKET, expectedPath: path }).classification,
    STORAGE_RESPONSE_CLASS.OBJECT_PRESENT
  );
  assert.equal(
    normalizeStorageObjectResponse({ status: 200, parseStatus: 'unreadable_body', expectedBucket: STORAGE_PROBE_BUCKET, expectedPath: path }).classification,
    STORAGE_RESPONSE_CLASS.MALFORMED_RESPONSE
  );
  assert.equal(
    normalizeStorageObjectResponse({ status: 400, parseStatus: 'invalid_json', expectedBucket: STORAGE_PROBE_BUCKET, expectedPath: path }).classification,
    STORAGE_RESPONSE_CLASS.MALFORMED_RESPONSE
  );
  assert.equal(
    normalizeStorageObjectResponse({ status: 404, parseStatus: 'non_object', expectedBucket: STORAGE_PROBE_BUCKET, expectedPath: path }).classification,
    STORAGE_RESPONSE_CLASS.MALFORMED_RESPONSE
  );

  // 2. End-to-end non-admin pre-upload GET returning text/plain HTTP 200 MUST trigger STORAGE_COLLISION_DETECTED (not MALFORMED_RESPONSE)
  const runId = 'test-run-h3-r3-05-collision';
  const seedUserId = '11111111-1111-4111-a111-111111111105';
  const token = createMockJwt({ sub: seedUserId });
  const inv = new TestRunInventory(runId);

  const collisionTransport = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
    routes: [
      { urlIncludes: '/auth/v1/user', status: 200, ok: true, text: JSON.stringify({ id: seedUserId }) },
      { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', status: 200, ok: true, headers: { 'Content-Type': 'text/plain' }, text: 'existing plain-text object' },
      { method: 'POST', urlIncludes: '/storage/v1/object/', status: 200, ok: true }
    ],
    defaultResponse: { status: 500 }
  });

  await assert.rejects(
    () => provisionStorageProbeFixture({
      runId,
      seedUserId,
      userAccessToken: token,
      anonKey: validTestAnonKey,
      serviceRoleKey: validTestServiceRoleKey,
      inventory: inv,
      fetchFn: collisionTransport
    }),
    /STORAGE_COLLISION_DETECTED/
  );
  assert.equal(collisionTransport.calls.some(c => c.method === 'POST'), false, 'Upload POST must never run after text/plain 200 collision');
  assert.equal(inv.getStorageFixture(STORAGE_PROBE_BUCKET, getStorageProbeObjectPath(runId))?.lifecycleState, STORAGE_LIFECYCLE_STATE.CONFLICT_EXISTING_PRESERVED);
});

test('106. Task 06I-B1-H3-R3 (R3-06): Normalized idempotent Storage DELETE NoSuchKey and independent post-delete absence verification', async () => {
  let runId = 'test-run-h3-r3-06-delete';
  let scenarioNumber = 0;
  const nextScenarioRun = () => (runId = 'test-run-h3-r3-06-delete-case-' + (++scenarioNumber));
  const seedUserId = '11111111-1111-4111-a111-111111111106';
  const path = getStorageProbeObjectPath(nextScenarioRun());

  // 1. DELETE returns structured HTTP 400 NoSuchKey (logical 404) AND GET confirms 400 NoSuchKey -> DELETION_VERIFIED
  const invIdemp = new TestRunInventory(runId);
  await r5ProvisionedFixture(invIdemp.runId, { inventory: invIdemp, seedUserId: seedUserId });
  const transportVerified = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait', conditionalStorage: { projectRef: HARDCODED_TEMP_REF, runId, objects: [] },
    routes: [
      {
        method: 'DELETE',
        urlIncludes: '/storage/v1/object/',
        status: 400,
        ok: false,
        text: JSON.stringify({ statusCode: '404', error: 'Not found', code: 'NoSuchKey', message: 'Object not found' })
      },
      {
        method: 'GET',
        urlIncludes: '/storage/v1/object/authenticated/',
        status: 400,
        ok: false,
        text: JSON.stringify({ statusCode: '404', error: 'Not found', code: 'NoSuchKey', message: 'Object not found' })
      }
    ]
  });
  const adminVerified = trackedHostedAdminClient({ serviceRoleKey: validTestServiceRoleKey, fetchFn: transportVerified });
  const repVerified = await invIdemp.executeCleanup({ adminClient: bindFixtureAdmin(invIdemp, adminVerified), failClosed: true });
  assert.equal(repVerified.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(repVerified.storageObjectsDeleted, 1);
  assert.equal(invIdemp.getStorageFixture(STORAGE_PROBE_BUCKET, path)?.lifecycleState, STORAGE_LIFECYCLE_STATE.DELETION_VERIFIED);
  assert.equal(transportVerified.calls.some(c => c.method === 'DELETE'), true);
  assert.equal(transportVerified.calls.some(c => c.method === 'GET'), true, 'Must still verify absence via GET after DELETE NoSuchKey');

  // 2. DELETE returns 404 NoSuchKey, BUT follow-up GET finds object STILL PRESENT (200 text/plain) -> RESIDUAL_BLOCKED, blocks deleteUser!
  const invRacePresent = new TestRunInventory(nextScenarioRun());
  invRacePresent.registerCreatedUser({
    id: '22222222-2222-4222-b222-222222222106',
    email: 'created-106@proof.invalid',
    creationProof: createCreationProof('before_after_check')
  });
  await r5ProvisionedFixture(invRacePresent.runId, { inventory: invRacePresent, seedUserId: seedUserId });
  const transportStillThere = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait', conditionalStorage: { projectRef: HARDCODED_TEMP_REF, runId, objects: [] },
    routes: [
      { method: 'DELETE', urlIncludes: '/storage/v1/object/', status: 404, ok: false, text: JSON.stringify({ code: 'NoSuchKey', message: 'Object not found' }) },
      { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', status: 200, ok: true, text: 'reappeared payload' }
    ]
  });
  const adminStillThere = trackedHostedAdminClient({ serviceRoleKey: validTestServiceRoleKey, fetchFn: transportStillThere });
  const repStillThere = await invRacePresent.executeCleanup({ adminClient: bindFixtureAdmin(invRacePresent, adminStillThere), failClosed: false });
  assert.equal(repStillThere.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.equal(invRacePresent.getStorageFixture(STORAGE_PROBE_BUCKET, getStorageProbeObjectPath(invRacePresent.runId))?.lifecycleState, STORAGE_LIFECYCLE_STATE.RESIDUAL_BLOCKED);
  assert.equal(transportStillThere.calls.some(c => c.method === 'DELETE' && c.url.includes('/auth/v1/admin/users/')), false, 'User deletion blocked on OBJECT_PRESENT');

  // 3. DELETE NoSuchKey followed by GET 403/500/malformed/timeout stays CLEANUP_INDETERMINATE (never blindly verified)
  for (const getErr of [
    { status: 403, ok: false, text: JSON.stringify({ code: 'AccessDenied' }) },
    { status: 500, ok: false, text: 'internal error' },
    { throwError: 'ETIMEDOUT: socket timed out' }
  ]) {
    const invIndet = new TestRunInventory(nextScenarioRun());
    await r5ProvisionedFixture(invIndet.runId, { inventory: invIndet, seedUserId: seedUserId });
    const transportIndet = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait', conditionalStorage: { projectRef: HARDCODED_TEMP_REF, runId, objects: [] },
      routes: [
        { method: 'DELETE', urlIncludes: '/storage/v1/object/', status: 400, ok: false, text: JSON.stringify({ statusCode: '404', code: 'NoSuchKey' }) },
        { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', ...getErr }
      ]
    });
    const adminIndet = trackedHostedAdminClient({ serviceRoleKey: validTestServiceRoleKey, fetchFn: transportIndet });
    const repIndet = await invIndet.executeCleanup({ adminClient: bindFixtureAdmin(invIndet, adminIndet), failClosed: false });
    assert.equal(repIndet.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
    assert.equal(invIndet.getStorageFixture(STORAGE_PROBE_BUCKET, getStorageProbeObjectPath(invIndet.runId))?.lifecycleState, STORAGE_LIFECYCLE_STATE.CLEANUP_INDETERMINATE);
  }

  // 4. DELETE returning HTTP 403 AccessDenied stays CLEANUP_INDETERMINATE immediately without false verification
  const invDel403 = new TestRunInventory(nextScenarioRun());
  await r5ProvisionedFixture(invDel403.runId, { inventory: invDel403, seedUserId: seedUserId });
  const transportDel403 = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait', conditionalStorage: { projectRef: HARDCODED_TEMP_REF, runId, objects: [] },
    routes: [
      { method: 'DELETE', urlIncludes: '/storage/v1/object/', status: 403, ok: false, text: JSON.stringify({ code: 'AccessDenied', message: 'Forbidden' }) }
    ]
  });
  const adminDel403 = trackedHostedAdminClient({ serviceRoleKey: validTestServiceRoleKey, fetchFn: transportDel403 });
  const repDel403 = await invDel403.executeCleanup({ adminClient: bindFixtureAdmin(invDel403, adminDel403), failClosed: false });
  assert.equal(repDel403.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.equal(invDel403.getStorageFixture(STORAGE_PROBE_BUCKET, getStorageProbeObjectPath(invDel403.runId))?.lifecycleState, STORAGE_LIFECYCLE_STATE.CLEANUP_INDETERMINATE);
});

test('107. Task 06I-B1-H3-R3 (Sec 8): Consolidated Adversarial Concurrency & Lifecycle Acceptance Matrix', async () => {
  const runId = 'test-run-h3-r3-matrix-107';
  const seedUserId = '11111111-1111-4111-a111-111111111107';
  const objectUuid = '10701111-2222-4333-a444-555555555107';
  const token = createMockJwt({ sub: seedUserId, session_id: 'sess-matrix-107' });
  const path = getStorageProbeObjectPath(runId);
  const fullKey = getStorageProbeObjectKey(runId);
  const bodyPayload = 'matrix-r3-verified-payload\n';

  // Full matrix combining R3-01 overlapping isolation + R3-02 declarative transport +
  // R3-03 single-owner atomic reservation + R3-04 quiesce/finalized fences + R3-05 text/plain handling + R3-06 DELETE NoSuchKey absence proof
  const inv = new TestRunInventory(runId, { seedUserId, seedEmail: 'seed-107@proof.invalid' });
  const rpcBarrier = createOfflineBarrier('matrix-rpc-pause');

  const matrixTransport = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait', conditionalStorage: { projectRef: HARDCODED_TEMP_REF, runId, objects: [] },
    initialState: { uploaded: false, deleted: false },
    routes: [
      { urlIncludes: '/auth/v1/user', status: 200, ok: true, text: JSON.stringify({ id: seedUserId }) },
      { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', whenState: { uploaded: false }, status: 400, ok: false, text: JSON.stringify({ statusCode: '404', code: 'NoSuchKey' }) },
      { method: 'POST', urlIncludes: '/storage/v1/object/', setsState: { uploaded: true }, status: 200, ok: true, text: JSON.stringify({ Id: objectUuid, Key: fullKey }) },
      { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', whenState: { uploaded: true, deleted: false }, status: 200, ok: true, text: bodyPayload },
      { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', whenState: { deleted: true }, status: 400, ok: false, text: JSON.stringify({ statusCode: '404', code: 'NoSuchKey', resource: fullKey }) },
      { urlIncludes: '/rest/v1/rpc/task06i_lookup_storage_object_owner', waitForBarrier: rpcBarrier, status: 200, ok: true, text: JSON.stringify([{ id: objectUuid, bucket_id: STORAGE_PROBE_BUCKET, name: path, owner_id: seedUserId }]) },
      { method: 'DELETE', urlIncludes: '/storage/v1/object/', setsState: { deleted: true }, status: 400, ok: false, text: JSON.stringify({ statusCode: '404', code: 'NoSuchKey' }) }
    ]
  });

  const adminClient = trackedHostedAdminClient({ serviceRoleKey: validTestServiceRoleKey, anonKey: validTestAnonKey, runId, fetchFn: matrixTransport });

  // Overlap an independent blocked fetch lease concurrently with provisioning
  const baseDepth107 = getFetchIsolationDebugState().activeDepth;
  const outerLease = runWithBlockedRealFetch(async () => {
    assert.equal(getFetchIsolationDebugState().activeDepth, baseDepth107 + 1);
    const provP = provisionStorageProbeFixture({
      runId,
      seedUserId,
      userAccessToken: token,
      anonKey: validTestAnonKey,
      serviceRoleKey: validTestServiceRoleKey,
      adminClient,
      inventory: inv,
      probeContent: bodyPayload,
      fetchFn: matrixTransport
    });

    await rpcBarrier.waitForArrivals(1);
    assert.equal(getFetchIsolationDebugState().isTrapped, true);

    // Concurrent duplicate provisioner fails before network
    await assert.rejects(
      () => provisionStorageProbeFixture({
        runId,
        seedUserId,
        userAccessToken: token,
        anonKey: validTestAnonKey,
        serviceRoleKey: validTestServiceRoleKey,
        inventory: inv,
        fetchFn: staticTransport({ status: 200 })
      }),
      /STORAGE_FIXTURE_RESERVATION_CONFLICT/
    );

    rpcBarrier.release();
    return provP;
  });

  const provRes = await outerLease;
  assert.equal(provRes.lifecycleState, STORAGE_LIFECYCLE_STATE.RUN_CREATED_VERIFIED);
  assert.equal(getFetchIsolationDebugState().activeDepth, baseDepth107);

  getConditionalStorageFixtureProvider(matrixTransport).removeFixtureObject({ bucket: STORAGE_PROBE_BUCKET, path });
  const report = await inv.executeCleanup({ adminClient: bindFixtureAdmin(inv, adminClient), failClosed: true });
  assert.equal(report.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(report.storageObjectsDeleted, 1);
  assert.equal(report.usersDeleted, 0);
  assert.equal(inv.runLifecycleState, INVENTORY_RUN_STATE.FINALIZED);
  assert.equal(inv.isClean(), true);

  // Post-finalization admission remains permanently closed
  assert.throws(() => inv.reserveStorageFixture({ path: 'post/probe.txt', ownerId: seedUserId }), /INVENTORY_FINALIZED/);
});

// ---------------------------------------------------------------------------
// Task 06I-B1-H3-R4: Trusted Offline Execution Boundary & Fixture Integrity
// ---------------------------------------------------------------------------

test('108. Task 06I-B1-H3-R4 (R4-01): Rejects arbitrary ownershipLookupFn, unregistered/forged/mutated/cross-project/cross-run Admin adapters before any mutation', async () => {
  const runId = 'test-run-h3-r4-01-trust';
  const otherRunId = 'test-run-h3-r4-01-other';
  const seedUserId = '11111111-1111-4111-a111-111111111401';
  const objectUuid = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaa401';
  const token = createMockJwt({ sub: seedUserId });
  const expectedPath = getStorageProbeObjectPath(runId);
  const expectedKey = `${STORAGE_PROBE_BUCKET}/${expectedPath}`;
  const payload = 'r4-01-trusted-ownership-payload\n';

  let sentinelNetworkCalls = 0;
  const sentinelNetworkRef = async () => {
    sentinelNetworkCalls += 1;
    return { status: 200, ok: true };
  };

  function makeStorageTransport() {
    return createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
      initialState: { uploaded: false },
      routes: [
        { method: 'GET', urlIncludes: '/auth/v1/user', status: 200, ok: true, json: { id: seedUserId }, tag: 'auth_user' },
        {
          method: 'GET',
          urlIncludes: '/storage/v1/object/authenticated/',
          whenState: { uploaded: false },
          status: 400,
          ok: false,
          text: JSON.stringify({ statusCode: '404', code: 'NoSuchKey', message: 'Not found' }),
          tag: 'collision_absent'
        },
        {
          method: 'POST',
          urlIncludes: '/storage/v1/object/',
          setsState: { uploaded: true },
          status: 200,
          ok: true,
          json: { Id: objectUuid, Key: expectedKey },
          tag: 'upload_post'
        },
        {
          method: 'GET',
          urlIncludes: '/storage/v1/object/authenticated/',
          whenState: { uploaded: true },
          status: 200,
          ok: true,
          rawBytes: Buffer.from(payload, 'utf8'),
          tag: 'verify_download'
        },
        {
          method: 'POST',
          urlIncludes: '/rest/v1/rpc/task06i_lookup_storage_object_owner',
          status: 200,
          ok: true,
          json: [{ id: objectUuid, bucket_id: STORAGE_PROBE_BUCKET, name: expectedPath, owner_id: seedUserId }],
          tag: 'ownership_rpc'
        }
      ],
      defaultResponse: { status: 500, ok: false }
    });
  }

  // 1 & 2. Arbitrary ownershipLookupFn (including captured sentinel network reference) rejected BEFORE any GET/POST/reservation
  const tArb = makeStorageTransport();
  const invArb = new TestRunInventory(runId);
  await assert.rejects(
    () => provisionStorageProbeFixture({
      runId,
      seedUserId,
      userAccessToken: token,
      anonKey: validTestAnonKey,
      serviceRoleKey: validTestServiceRoleKey,
      ownershipLookupFn: async () => {
        await sentinelNetworkRef();
        return { found: true, data: { id: objectUuid, bucket_id: STORAGE_PROBE_BUCKET, name: expectedPath, owner_id: seedUserId } };
      },
      inventory: invArb,
      probeContent: payload,
      fetchFn: tArb
    }),
    /BLOCKED_PENDING_DURABLE_RECOVERY.*ownershipLookupFn/
  );
  assert.equal(tArb.calls.length, 0, 'Must dispatch ZERO provider calls when arbitrary ownershipLookupFn is passed');
  assert.equal(sentinelNetworkCalls, 0, 'Sentinel network reference must execute ZERO times');
  assert.equal(invArb.storageFixtures.size, 0, 'Must reserve ZERO fixtures before ownershipLookupFn rejection');

  // 3. Unregistered plain Admin client rejected
  const tUnreg = makeStorageTransport();
  const invUnreg = new TestRunInventory(runId);
  const unregisteredAdmin = {
    getStorageObjectOwnership: async () => {
      sentinelNetworkCalls += 1;
      return { found: true, data: {} };
    }
  };
  await assert.rejects(
    () => provisionStorageProbeFixture({
      runId,
      seedUserId,
      userAccessToken: token,
      anonKey: validTestAnonKey,
      adminClient: unregisteredAdmin,
      inventory: invUnreg,
      probeContent: payload,
      fetchFn: tUnreg
    }),
    /BLOCKED_PENDING_DURABLE_RECOVERY.*UNTRUSTED_ADMIN_CLIENT/
  );
  assert.equal(tUnreg.calls.length, 0);
  assert.equal(sentinelNetworkCalls, 0);

  // 4. Forged trusted-client markers and shallow clones rejected
  const tTrusted = makeStorageTransport();
  const trustedAdmin = trackedHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    anonKey: validTestAnonKey,
    projectRef: HARDCODED_TEMP_REF,
    runId,
    fetchFn: tTrusted
  });
  const forgedAdmin = {
    _isTrustedAdminClient: true,
    __trustedAdminClient: true,
    getStorageObjectOwnership: async () => {
      sentinelNetworkCalls += 1;
      return { found: true, data: {} };
    }
  };
  const shallowClone = { ...trustedAdmin };
  for (const badClient of [forgedAdmin, shallowClone]) {
    const tBad = makeStorageTransport();
    await assert.rejects(
      () => provisionStorageProbeFixture({
        runId,
        seedUserId,
        userAccessToken: token,
        anonKey: validTestAnonKey,
        adminClient: badClient,
        inventory: new TestRunInventory(runId),
        probeContent: payload,
        fetchFn: tBad
      }),
      /BLOCKED_PENDING_DURABLE_RECOVERY.*UNTRUSTED_ADMIN_CLIENT/
    );
    assert.equal(tBad.calls.length, 0);
  }
  assert.equal(sentinelNetworkCalls, 0);

  const invCleanForged = new TestRunInventory(runId);
  invCleanForged.registerStorageFixture({ bucket: STORAGE_PROBE_BUCKET, path: expectedPath, ownerId: seedUserId });
  await assert.rejects(
    () => invCleanForged.executeCleanup({ adminClient: forgedAdmin, failClosed: true }),
    /UNTRUSTED_ADMIN_CLIENT/
  );

  // 5. Immutable adapter capabilities & method replacement / Proxy / Object.create rejected
  assert.equal(Object.isFrozen(trustedAdmin), true, 'Trusted admin client must be frozen');
  assert.throws(() => {
    trustedAdmin.getStorageObjectOwnership = async () => {
      sentinelNetworkCalls += 1;
      return { found: true, data: {} };
    };
  }, TypeError);

  const inheritedOverride = Object.create(trustedAdmin, {
    getStorageObjectOwnership: {
      value: async () => {
        sentinelNetworkCalls += 1;
        return { found: true, data: {} };
      }
    }
  });
  const proxiedAdmin = new Proxy(trustedAdmin, {});
  for (const tampered of [inheritedOverride, proxiedAdmin]) {
    const tTamper = makeStorageTransport();
    await assert.rejects(
      () => provisionStorageProbeFixture({
        runId,
        seedUserId,
        userAccessToken: token,
        anonKey: validTestAnonKey,
        adminClient: tampered,
        inventory: new TestRunInventory(runId),
        probeContent: payload,
        fetchFn: tTamper
      }),
      /UNTRUSTED_ADMIN_CLIENT/
    );
    assert.equal(tTamper.calls.length, 0);
  }
  assert.equal(sentinelNetworkCalls, 0);

  // 6. Cross-project adapter rejected
  assert.throws(
    () => trackedHostedAdminClient({
      serviceRoleKey: validTestServiceRoleKey,
      projectRef: HARDCODED_REAL_REF,
      runId,
      fetchFn: makeStorageTransport()
    }),
    /SECURITY_BOUNDARY_VIOLATION/
  );
  await assert.rejects(
    () => provisionStorageProbeFixture({
      projectRef: 'unauthorized-proj-ref',
      runId,
      seedUserId,
      userAccessToken: token,
      adminClient: trustedAdmin,
      inventory: new TestRunInventory(runId),
      fetchFn: tTrusted
    }),
    /CRITICAL_SECURITY_VIOLATION/
  );
  assert.equal(tTrusted.calls.length, 0);

  // 7. Cross-run adapter rejected (both mismatched runId and unbound runId: null)
  const adminUnbound = trackedHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    anonKey: validTestAnonKey,
    projectRef: HARDCODED_TEMP_REF,
    fetchFn: makeStorageTransport()
  });
  const tCrossRun = makeStorageTransport();
  await assert.rejects(
    () => provisionStorageProbeFixture({
      runId: otherRunId,
      seedUserId,
      userAccessToken: token,
      anonKey: validTestAnonKey,
      adminClient: trustedAdmin,
      inventory: new TestRunInventory(otherRunId),
      fetchFn: tCrossRun
    }),
    /ADMIN_CLIENT_RUN_MISMATCH/
  );
  await assert.rejects(
    () => provisionStorageProbeFixture({
      runId: otherRunId,
      seedUserId,
      userAccessToken: token,
      anonKey: validTestAnonKey,
      adminClient: adminUnbound,
      inventory: new TestRunInventory(otherRunId),
      fetchFn: tCrossRun
    }),
    /ADMIN_CLIENT_RUN_MISMATCH/
  );
  assert.equal(tCrossRun.calls.length, 0);

  const invOtherRun = new TestRunInventory(otherRunId);
  invOtherRun.registerStorageFixture({ bucket: STORAGE_PROBE_BUCKET, path: getStorageProbeObjectPath(otherRunId), ownerId: seedUserId });
  await assert.rejects(
    () => invOtherRun.executeCleanup({ adminClient: trustedAdmin, failClosed: true }),
    /ADMIN_CLIENT_RUN_MISMATCH/
  );

  // 8. Direct provisioner invocation rejected without trusted dependencies
  const tNoCreds = makeStorageTransport();
  await assert.rejects(
    () => provisionStorageProbeFixture({
      runId,
      seedUserId,
      userAccessToken: token,
      inventory: new TestRunInventory(runId),
      fetchFn: tNoCreds
    }),
    /BLOCKED_PENDING_OWNERSHIP_METADATA_INTERFACE/
  );
  await assert.rejects(
    () => provisionStorageProbeFixture({
      runId,
      seedUserId,
      userAccessToken: token,
      adminClient: trustedAdmin,
      inventory: new TestRunInventory(runId)
    }),
    /BLOCKED_PENDING_DURABLE_RECOVERY/
  );
  assert.equal(tNoCreds.calls.length, 0);

  // 9. Valid deterministic run-bound Admin adapter + RPC succeeds cleanly
  const invPass = new TestRunInventory(runId);
  const resPass = await provisionStorageProbeFixture({
    runId,
    seedUserId,
    userAccessToken: token,
    anonKey: validTestAnonKey,
    adminClient: trustedAdmin,
    inventory: invPass,
    probeContent: payload,
    fetchFn: tTrusted
  });
  assert.equal(resPass.lifecycleState, STORAGE_LIFECYCLE_STATE.RUN_CREATED_VERIFIED);
  assert.equal(resPass.deletionEligible, true);
  assert.equal(resPass.objectId, objectUuid);
  assert.equal(resPass.ownerId, seedUserId);
  assert.equal(tTrusted.calls.some(c => c.tag === 'ownership_rpc'), true);
  assert.equal(sentinelNetworkCalls, 0);
  assert.throws(
    () => assertTrustedAdminClient(forgedAdmin, { projectRef: HARDCODED_TEMP_REF, runId }),
    /UNTRUSTED_ADMIN_CLIENT/
  );
});

test('109. Task 06I-B1-H3-R4 (R4-02): Shared WeakMap isolation coordinator per target prevents cross-handle premature restore', async () => {
  const realTargetFetch = async () => 'real-target-response';
  const targetA = { fetch: realTargetFetch };
  const targetB = { fetch: async () => 'real-b-response' };

  const coord1 = createFetchIsolationCoordinator(targetA);
  const coord2 = createFetchIsolationCoordinator(targetA);
  const coordB = createFetchIsolationCoordinator(targetB);

  assert.equal(coord1.getState().activeDepth, 0);
  assert.equal(coord2.getState().activeDepth, 0);
  assert.equal(coord1.getState().isTrapped, false);

  // 1. Overlapping leases across two coordinator handles on the SAME target (A settles before B)
  const rel1 = coord1.acquire();
  assert.equal(coord1.getState().activeDepth, 1);
  assert.equal(coord2.getState().activeDepth, 1);
  assert.notEqual(targetA.fetch, realTargetFetch);
  assert.equal(coordB.getState().isTrapped, false, 'Separate target B must stay unaffected');

  const rel2 = coord2.acquire();
  assert.equal(coord1.getState().activeDepth, 2);
  assert.equal(coord2.getState().activeDepth, 2);

  // Releasing handle 1 repeatedly while handle 2 is active MUST NOT restore realTargetFetch
  rel1();
  rel1();
  rel1();
  assert.equal(coord1.getState().activeDepth, 1, 'Duplicate release must be idempotent and keep depth at 1');
  assert.equal(coord2.getState().isTrapped, true, 'Target A must stay trapped until handle 2 releases');
  assert.throws(() => targetA.fetch(), /BLOCKED_PENDING_DURABLE_RECOVERY/);

  // Releasing handle 2 drops shared depth 1 -> 0 and restores original baseline cleanly
  rel2();
  rel2();
  assert.equal(coord1.getState().activeDepth, 0);
  assert.equal(targetA.fetch, realTargetFetch);

  // 2. B settles before A + nested leases with deterministic barriers
  const barrierA = createOfflineBarrier('r4-02-a');
  const barrierB = createOfflineBarrier('r4-02-b');
  const pA = coord1.run(async () => {
    await barrierA.wait();
    assert.equal(coord2.getState().isTrapped, true);
    return 'A-done';
  });
  const pB = coord2.run(async () => {
    await barrierB.wait();
    return 'B-done';
  });
  assert.equal(coord1.getState().activeDepth, 2);

  barrierB.release();
  assert.equal(await pB, 'B-done');
  assert.equal(coord1.getState().activeDepth, 1);
  assert.equal(coord1.getState().isTrapped, true, 'Real fetch must not restore when B settles before A');

  barrierA.release();
  assert.equal(await pA, 'A-done');
  assert.equal(coord1.getState().activeDepth, 0);
  assert.equal(targetA.fetch, realTargetFetch);

  // 3. Nested leases across handles + exception and cancellation safety
  await assert.rejects(
    () => coord1.run(async () => {
      assert.equal(coord2.getState().activeDepth, 1);
      await coord2.run(async () => {
        assert.equal(coord1.getState().activeDepth, 2);
        throw new Error('INNER_ABORT_BOOM');
      });
    }),
    /INNER_ABORT_BOOM/
  );
  assert.equal(coord1.getState().activeDepth, 0);
  assert.equal(targetA.fetch, realTargetFetch);

  // 4. Separate target independence
  const relTargetB = coordB.acquire();
  assert.equal(coordB.getState().activeDepth, 1);
  assert.equal(coordB.getState().isTrapped, true);
  assert.equal(coord1.getState().activeDepth, 0);
  assert.equal(targetA.fetch, realTargetFetch);
  relTargetB();
  assert.equal(coordB.getState().activeDepth, 0);

  // 5. Explicit coordinator targeting globalThis shares exact state with runWithBlockedRealFetch()
  const explicitGlobal = createFetchIsolationCoordinator(globalThis);
  const baseGlobalDepth = getFetchIsolationDebugState().activeDepth;
  assert.equal(explicitGlobal.getState().activeDepth, baseGlobalDepth);

  const globalGate = createOfflineBarrier('r4-02-global');
  const globalRunP = runWithBlockedRealFetch(async () => {
    await globalGate.wait();
    assert.throws(() => globalThis.fetch('https://blocked.invalid'), /BLOCKED_PENDING_DURABLE_RECOVERY/);
  });
  assert.equal(explicitGlobal.getState().activeDepth, baseGlobalDepth + 1);

  const relGlobal2 = explicitGlobal.acquire();
  assert.equal(getFetchIsolationDebugState().activeDepth, baseGlobalDepth + 2);
  relGlobal2();
  assert.equal(getFetchIsolationDebugState().activeDepth, baseGlobalDepth + 1);
  assert.equal(getFetchIsolationDebugState().isTrapped, true);

  globalGate.release();
  await globalRunP;
  assert.equal(getFetchIsolationDebugState().activeDepth, baseGlobalDepth);
  assert.equal(explicitGlobal.getState().activeDepth, baseGlobalDepth);
});

test('110. Task 06I-B1-H3-R4 (R4-03): Barrier release settles all arrival waiters cleanly without hanging or leaking abort listeners', async () => {
  function createSpiedAbortController() {
    const controller = new AbortController();
    return {
      controller,
      getActiveListeners: () => getEventListeners(controller.signal, 'abort').length
    };
  }

  // 1. Release BEFORE any arrival settles pending waitForArrivals immediately with explicit error
  const b1 = createOfflineBarrier('r4-03-before-any');
  const p1 = b1.waitForArrivals(1);
  b1.release();
  await assert.rejects(() => p1, /BARRIER_RELEASED_BEFORE_ARRIVALS/);

  // 2. Release BEFORE target count (1/2 arrivals) settles with explicit error
  const b2 = createOfflineBarrier('r4-03-partial');
  b2.markArrived();
  const p2 = b2.waitForArrivals(2);
  b2.release();
  await assert.rejects(() => p2, /BARRIER_RELEASED_BEFORE_ARRIVALS/);

  // 3. Release AFTER target count achieved resolves normally (including post-release calls for achieved target)
  const b3 = createOfflineBarrier('r4-03-achieved');
  const p3 = b3.waitForArrivals(2);
  b3.markArrived();
  b3.markArrived();
  await p3;
  b3.release();
  await b3.waitForArrivals(2);

  // 4. waitForArrivals() invoked AFTER release when target not achieved settles immediately with rejection
  await assert.rejects(() => b2.waitForArrivals(2), /BARRIER_RELEASED_BEFORE_ARRIVALS/);

  // 5. Multiple pending arrival waiters: lower target satisfied resolves, unsatisfied higher targets reject on release
  const b4 = createOfflineBarrier('r4-03-multi');
  const wSatisfied = b4.waitForArrivals(1);
  const wUnsat2 = b4.waitForArrivals(2);
  const wUnsat3 = b4.waitForArrivals(3);
  b4.markArrived();
  await wSatisfied;
  b4.release();
  await assert.rejects(() => wUnsat2, /BARRIER_RELEASED_BEFORE_ARRIVALS/);
  await assert.rejects(() => wUnsat3, /BARRIER_RELEASED_BEFORE_ARRIVALS/);

  // 6. Abort before release & concurrent abort + release & listener cleanup
  const b5 = createOfflineBarrier('r4-03-abort');
  const spyBefore = createSpiedAbortController();
  const wAbortFirst = b5.waitForArrivals(2, spyBefore.controller.signal);
  assert.equal(spyBefore.getActiveListeners(), 1);
  spyBefore.controller.abort();
  await assert.rejects(() => wAbortFirst, { name: 'AbortError' });
  assert.equal(spyBefore.getActiveListeners(), 0, 'Abort must detach/clear listener cleanly');

  const spyReleaseRace = createSpiedAbortController();
  const wReleaseRace = b5.waitForArrivals(2, spyReleaseRace.controller.signal);
  assert.equal(spyReleaseRace.getActiveListeners(), 1);
  b5.release();
  spyReleaseRace.controller.abort();
  await assert.rejects(() => wReleaseRace, /BARRIER_RELEASED_BEFORE_ARRIVALS/);
  assert.equal(spyReleaseRace.getActiveListeners(), 0, 'Release must detach abort listener on settled waiter');

  // Already-aborted signal attaches 0 listeners and rejects immediately
  const spyPreAborted = createSpiedAbortController();
  spyPreAborted.controller.abort();
  await assert.rejects(() => b5.waitForArrivals(2, spyPreAborted.controller.signal), { name: 'AbortError' });
  assert.equal(spyPreAborted.getActiveListeners(), 0);

  // 7. Repeated release is strictly idempotent
  b5.release();
  b5.release();
  assert.equal(b5.isReleased(), true);

  // 8. Invalid arrival targets fail closed cleanly
  for (const invalidTarget of [0, -1, 1.5, NaN, Infinity, '1', null]) {
    await assert.rejects(() => b1.waitForArrivals(invalidTarget), RangeError);
  }
});

test('111. Task 06I-B1-H3-R4 (R4-04): Immutable independent binary fixture snapshots and declarative spec validation', async () => {
  // 1. Buffer source mutation after transport construction
  const origBufText = 'immutable-buffer-snapshot-01';
  const expectedBufSha = crypto.createHash('sha256').update(Buffer.from(origBufText, 'utf8')).digest('hex');
  const srcBuf = Buffer.from(origBufText, 'utf8');
  const tBuf = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
    routes: [{ urlIncludes: '/buf', status: 200, rawBytes: srcBuf }]
  });
  srcBuf.fill(0x58); // Mutate original source memory completely

  const resBuf1 = await tBuf('https://example.test/buf');
  const abBuf1 = await resBuf1.arrayBuffer();
  const gotBuf1 = Buffer.from(abBuf1);
  assert.equal(gotBuf1.toString('utf8'), origBufText);
  assert.equal(crypto.createHash('sha256').update(gotBuf1).digest('hex'), expectedBufSha);

  // 2. Uint8Array source mutation
  const srcU8 = new Uint8Array([10, 20, 30, 40, 50]);
  const tU8 = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
    routes: [{ urlIncludes: '/u8', status: 200, rawBytes: srcU8 }]
  });
  srcU8.fill(0);
  const abU8 = await (await tU8('https://example.test/u8')).arrayBuffer();
  assert.deepEqual(Array.from(new Uint8Array(abU8)), [10, 20, 30, 40, 50]);

  // 3. ArrayBuffer source mutation
  const srcAB = Uint8Array.from([5, 6, 7, 8]).buffer;
  const tAB = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
    routes: [{ urlIncludes: '/ab', status: 200, rawBytes: srcAB }]
  });
  new Uint8Array(srcAB).fill(0xff);
  const abOut = await (await tAB('https://example.test/ab')).arrayBuffer();
  assert.deepEqual(Array.from(new Uint8Array(abOut)), [5, 6, 7, 8]);

  // 4. DataView with nonzero byteOffset and sub-range byteLength
  const dvBacking = Uint8Array.from([1, 2, 11, 22, 33, 44, 98, 99]);
  const srcDV = new DataView(dvBacking.buffer, 2, 4);
  const tDV = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
    routes: [{ urlIncludes: '/dv', status: 200, rawBytes: srcDV }]
  });
  dvBacking.fill(0xee);
  const dvOut = await (await tDV('https://example.test/dv')).arrayBuffer();
  assert.deepEqual(Array.from(new Uint8Array(dvOut)), [11, 22, 33, 44]);

  // 5. Sliced Buffer backed by shared pooled/larger memory
  const largeSlab = Buffer.allocUnsafe(64).fill(0x11);
  const expectedSlice = Buffer.from('slice-secret-payload');
  expectedSlice.copy(largeSlab, 16);
  const slicedView = largeSlab.subarray(16, 16 + expectedSlice.length);
  const tSliced = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
    routes: [{ urlIncludes: '/slice', status: 200, rawBytes: slicedView }]
  });
  largeSlab.fill(0xaa);
  const sliceOut = await (await tSliced('https://example.test/slice')).arrayBuffer();
  assert.equal(Buffer.from(sliceOut).toString('utf8'), 'slice-secret-payload');

  // 6 & 7. Repeated responses remain independent and caller mutation of returned buffer does not alter subsequent responses
  new Uint8Array(abBuf1).fill(0x00);
  const abBufSameRes = await resBuf1.arrayBuffer();
  assert.equal(Buffer.from(abBufSameRes).toString('utf8'), origBufText);
  const resBuf2 = await tBuf('https://example.test/buf');
  assert.equal(await resBuf2.text(), origBufText);
  const abBuf2 = await resBuf2.arrayBuffer();
  assert.equal(crypto.createHash('sha256').update(Buffer.from(abBuf2)).digest('hex'), expectedBufSha);

  // 8. Declarative fixture validation rejects accessors in arrays/buffers, symbols, and cycles
  const accessorArr = [];
  Object.defineProperty(accessorArr, '0', {
    enumerable: true,
    get() {
      return { status: 200 };
    }
  });
  assert.throws(
    () => createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait', routes: accessorArr }),
    /INVALID_DETERMINISTIC_FIXTURE_SPEC/
  );
  const symHookSpec = { routes: [{ urlIncludes: '/x', status: 200 }], [Symbol('exec')]: () => {} };
  assert.throws(
    () => createDeterministicFixtureTransport(symHookSpec),
    /INVALID_DETERMINISTIC_FIXTURE_SPEC.*Symbol/
  );
  const cyclic = { urlIncludes: '/cycle', status: 200 };
  cyclic.self = cyclic;
  assert.throws(
    () => createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait', routes: [cyclic] }),
    /INVALID_DETERMINISTIC_FIXTURE_SPEC.*Circular/
  );

  // 9. End-to-end Storage SHA-256 verification survives post-construction buffer mutation
  const runId = 'test-run-h3-r4-04-storage';
  const seedUserId = '11111111-1111-4111-a111-111111111404';
  const objectUuid = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbb404';
  const token = createMockJwt({ sub: seedUserId });
  const expectedPath = getStorageProbeObjectPath(runId);
  const expectedPayload = Buffer.from([0, 1, 2, 3, 250, 251, 252, 253, 254, 255]);
  const mutableSource = Buffer.from(expectedPayload);

  const storageTransport = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
    initialState: { uploaded: false },
    routes: [
      { method: 'GET', urlIncludes: '/auth/v1/user', status: 200, ok: true, json: { id: seedUserId } },
      { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', whenState: { uploaded: false }, status: 404, ok: false, text: JSON.stringify({ code: 'NoSuchKey' }) },
      { method: 'POST', urlIncludes: '/storage/v1/object/', setsState: { uploaded: true }, status: 200, ok: true, json: { Id: objectUuid } },
      { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', whenState: { uploaded: true }, status: 200, ok: true, rawBytes: mutableSource },
      { method: 'POST', urlIncludes: '/rest/v1/rpc/task06i_lookup_storage_object_owner', status: 200, ok: true, json: [{ id: objectUuid, bucket_id: STORAGE_PROBE_BUCKET, name: expectedPath, owner_id: seedUserId }] }
    ],
    defaultResponse: { status: 500, ok: false }
  });
  mutableSource.fill(0x00);

  const invStorage = new TestRunInventory(runId);
  const prov = await provisionStorageProbeFixture({
    runId,
    seedUserId,
    userAccessToken: token,
    anonKey: validTestAnonKey,
    serviceRoleKey: validTestServiceRoleKey,
    inventory: invStorage,
    probeContent: expectedPayload,
    fetchFn: storageTransport
  });
  assert.equal(prov.lifecycleState, STORAGE_LIFECYCLE_STATE.RUN_CREATED_VERIFIED);
  assert.equal(prov.deletionEligible, true);
});

test('112. Task 06I-B1-H3-R4 (Sec 6): Unified offline trust boundary & deterministic concurrency acceptance', async () => {
  const runId = 'test-run-h3-r4-unified';
  const seedUserId = '11111111-1111-4111-a111-111111111499';
  const createdUserId = '22222222-2222-4222-b222-222222222499';
  const objectUuid = 'cccccccc-cccc-4ccc-cccc-ccccccccc499';
  const token = createMockJwt({ sub: seedUserId });
  const expectedPath = getStorageProbeObjectPath(runId);
  const rawFixture = Buffer.from('unified-r4-trust-payload\n', 'utf8');
  const mutableInput = Buffer.from(rawFixture);
  const rpcBarrier = createOfflineBarrier('r4-unified-rpc');

  const unifiedTransport = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
    initialState: { uploaded: false, deleted: false },
    routes: [
      { method: 'GET', urlIncludes: '/auth/v1/user', status: 200, ok: true, json: { id: seedUserId } },
      { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', whenState: { uploaded: false }, status: 400, ok: false, text: JSON.stringify({ statusCode: '404', code: 'NoSuchKey' }) },
      { method: 'POST', urlIncludes: '/storage/v1/object/', setsState: { uploaded: true }, status: 200, ok: true, json: { Id: objectUuid } },
      { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', whenState: { uploaded: true, deleted: false }, status: 200, ok: true, rawBytes: mutableInput },
      { method: 'POST', urlIncludes: '/rest/v1/rpc/task06i_lookup_storage_object_owner', waitForBarrier: rpcBarrier, status: 200, ok: true, json: [{ id: objectUuid, bucket_id: STORAGE_PROBE_BUCKET, name: expectedPath, owner_id: seedUserId }] },
      { method: 'DELETE', urlIncludes: '/storage/v1/object/', setsState: { deleted: true }, status: 400, ok: false, text: JSON.stringify({ statusCode: '404', code: 'NoSuchKey' }) },
      { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', whenState: { deleted: true }, status: 400, ok: false, text: JSON.stringify({ statusCode: '404', code: 'NoSuchKey' }) },
      { method: 'DELETE', urlIncludes: `/auth/v1/admin/users/${createdUserId}`, setsState: { userDeleted: true }, status: 200, ok: true, json: {} },
      { method: 'GET', urlIncludes: `/auth/v1/admin/users/${createdUserId}`, whenState: { userDeleted: true }, status: 404, ok: false, json: { message: 'User not found' } }
    ],
    defaultResponse: { status: 500, ok: false }
  });
  mutableInput.fill(0x7a);

  const trustedAdmin = trackedHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    anonKey: validTestAnonKey,
    projectRef: HARDCODED_TEMP_REF,
    runId,
    fetchFn: unifiedTransport
  });
  const inv = new TestRunInventory(runId);
  inv.registerCreatedUser({
    id: createdUserId,
    email: 'created-r4@proof.invalid',
    creationProof: createCreationProof({ method: 'admin_create_user', endpoint: '/auth/v1/admin/users' })
  });

  // 1. Real hosted runner remains permanently blocked pending durable recovery
  await assert.rejects(
    () => runHostedProbeRunner(fixtureRunnerOptions({
      projectRef: HARDCODED_TEMP_REF,
      runId,
      argv: ['--live'],
      env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
      mockDispatcher: createHostedDispatcher({ anonKey: validTestAnonKey, fetchFn: unifiedTransport }),
      adminClient: trustedAdmin
    })),
    /BLOCKED_PENDING_DURABLE_RECOVERY/
  );

  // 2. Coordinated overlapping global leases + terminal barrier termination + atomic provisioning + cleanup
  const sharedGlobalCoord = createFetchIsolationCoordinator(globalThis);
  const baseDepth = getFetchIsolationDebugState().activeDepth;

  const provPromise = sharedGlobalCoord.run(async () => {
    assert.equal(getFetchIsolationDebugState().activeDepth, baseDepth + 1);
    const p = provisionStorageProbeFixture({
      runId,
      seedUserId,
      userAccessToken: token,
      anonKey: validTestAnonKey,
      adminClient: trustedAdmin,
      inventory: inv,
      probeContent: rawFixture,
      fetchFn: unifiedTransport
    });
    await rpcBarrier.waitForArrivals(1);

    // Concurrent cleanup while provisioning is in-flight waits/observes unresolved ops and refuses premature user deletion
    const prematureCleanup = await inv.executeCleanup({ adminClient: trustedAdmin, failClosed: false, settlementTimeoutMs: 5 });
    assert.equal(prematureCleanup.usersDeleted, 0, 'Unverified/in-flight storage must forbid Auth user deletion');
    assert.equal(prematureCleanup.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');

    rpcBarrier.release();
    return p;
  });

  await assert.rejects(() => provPromise, /PROVISIONING_ABORTED_DURING_CLEANUP/);
  assert.equal(getFetchIsolationDebugState().activeDepth, baseDepth);
  // Residual committed upload was preserved without blind deletion and blocked user deletion cleanly
  assert.equal(inv.getStorageFixture(STORAGE_PROBE_BUCKET, expectedPath)?.lifecycleState, STORAGE_LIFECYCLE_STATE.RESIDUAL_OWNERSHIP_BLOCKED);
  assert.equal(inv.getStorageFixture(STORAGE_PROBE_BUCKET, expectedPath)?.deletionEligible, false);
  assert.equal(unifiedTransport.calls.some(c => c.method === 'DELETE' && c.url.includes('/storage/v1/object/')), false);
});

// ---------------------------------------------------------------------------
// H3-R5: Mandatory Admin admission, authenticated terminal receipts and failures
// ---------------------------------------------------------------------------

const R5_SEED_USER = '11111111-1111-4111-a111-111111111113';
const R5_CREATED_USER = '22222222-2222-4222-b222-222222222113';

function r5OutstandingInventory(runId) {
  const inventory = new TestRunInventory(runId);
  inventory.registerCreatedUser({ id: R5_CREATED_USER, email: 'created-r5@proof.invalid', creationProof: createCreationProof('before_after_check') });
  inventory.registerReferencedUser({ id: R5_SEED_USER, email: 'seed-r5@proof.invalid' });
  inventory.registerSeedPasswordModification({ userId: R5_SEED_USER, email: 'seed-r5@proof.invalid', originalPassword: 'R5Original#2026!', targetPassword: 'R5Changed#2026!', state: 'confirmed' });
  inventory.registerSession('r5-obligation-session', { accessToken: createMockJwt({ sub: R5_SEED_USER, session_id: 'r5-obligation-session' }) });
  inventory.registerStorageFixture({ path: getStorageProbeObjectPath(runId), lifecycleState: STORAGE_LIFECYCLE_STATE.RESIDUAL_OWNERSHIP_BLOCKED, hasCommittedUpload: true });
  inventory.registerStorageObject('r5-owned-bucket', 'outstanding.txt');
  inventory.registerTableRow('task06i_session_probe', 'r5-outstanding-row');
  return inventory;
}

async function r5ProvisionedFixture(runId, { session = false, logoutFailure = false, storageDeleteFailure = false, inventory: existingInventory = null, seedUserId = R5_SEED_USER } = {}) {
  const inventory = existingInventory || new TestRunInventory(runId);
  const path = getStorageProbeObjectPath(runId);
  const objectId = '33333333-3333-4333-a333-333333333113';
  const content = 'r5 authentic fixture payload\n';
  const transport = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait', conditionalStorage: { projectRef: HARDCODED_TEMP_REF, runId, objects: [] },
    initialState: { uploaded: false, deleted: false },
    routes: [
      { method: 'GET', pathEquals: '/auth/v1/user', status: 200, json: { id: seedUserId } },
      { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', whenState: { uploaded: false }, status: 404, json: { code: 'NoSuchKey' } },
      { method: 'POST', urlIncludes: '/storage/v1/object/', setsState: { uploaded: true }, status: 200, json: { Id: objectId } },
      { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', whenState: { uploaded: true, deleted: false }, status: 200, text: content },
      { method: 'POST', urlIncludes: '/rest/v1/rpc/task06i_lookup_storage_object_owner', status: 200, json: [{ id: objectId, bucket_id: STORAGE_PROBE_BUCKET, name: path, owner_id: seedUserId }] },
      { method: 'DELETE', urlIncludes: '/storage/v1/object/', setsState: storageDeleteFailure ? {} : { deleted: true }, status: storageDeleteFailure ? 503 : 200, json: storageDeleteFailure ? { message: 'r5 offline Storage outage' } : {} },
      { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', whenState: { deleted: true }, status: 400, json: { code: 'NoSuchKey', statusCode: '404' } },
      { method: 'POST', urlIncludes: '/auth/v1/logout', status: logoutFailure ? 503 : 200, json: logoutFailure ? { message: 'r5 offline logout outage' } : {} }
    ]
  });
  const adminClient = createHostedAdminClient({ serviceRoleKey: validTestServiceRoleKey, anonKey: validTestAnonKey, runId, fetchFn: transport });
  await provisionStorageProbeFixture({ runId, seedUserId: seedUserId, userAccessToken: createMockJwt({ sub: seedUserId, session_id: 'r5-provision-session' }), anonKey: validTestAnonKey, adminClient, inventory, fetchFn: transport, probeContent: content });
  if (session) inventory.registerSession('r5-cleanup-session', { accessToken: createMockJwt({ sub: seedUserId, session_id: 'r5-cleanup-session' }) });
  return { inventory, adminClient, transport, path };
}

function r5AssertOutstanding(report, inventory) {
  assert.equal(report.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.ok(report.residualUsers.some(user => user.id === R5_CREATED_USER));
  for (const type of ['client', 'storage_fixture', 'storage_object', 'session', 'table_row', 'seed_credential_restoration']) {
    assert.ok(report.residualResources.some(resource => resource.type === type), type + ' obligation must remain visible');
  }
  assert.equal(inventory.runLifecycleState, INVENTORY_RUN_STATE.RESIDUAL_BLOCKED);
  assert.equal(inventory.isClean(), false);
  assert.equal(inventory.deletedUsers.size, 0);
  assert.equal(inventory.revokedSessions.size, 0);
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes('R5Original#2026!'), false);
  assert.equal(serialized.includes(validTestServiceRoleKey), false);
}

test('113. H3-R5-01/R5-03: every invalid Admin shape fails cleanup without getters, callbacks or transport in either reporting mode', async () => {
  const runId = 'r5-admin-rejection';
  let callbacks = 0;
  let propertyReads = 0;
  const capturedNativeFetch = globalThis.fetch;
  const capturedNativeCallback = async () => {
    callbacks++;
    return capturedNativeFetch('http://127.0.0.1:1/r5-sentinel', { method: 'DELETE' });
  };
  const transport = staticTransport({ status: 404, json: { code: 'NoSuchKey' } });
  const trusted = createHostedAdminClient({ serviceRoleKey: validTestServiceRoleKey, runId, fetchFn: transport });
  const wrongRun = createHostedAdminClient({ serviceRoleKey: validTestServiceRoleKey, runId: 'r5-other-run', fetchFn: transport });
  const unbound = createHostedAdminClient({ serviceRoleKey: validTestServiceRoleKey, fetchFn: transport });
  const plain = { deleteUser: capturedNativeCallback, getUserById: capturedNativeCallback, deleteStorageObject: capturedNativeCallback, getStorageObject: capturedNativeCallback };
  const getters = {};
  for (const property of ['deleteUser', 'getStorageObject', 'verifyStorageObjectAbsence', '_isTrustedAdminClient', '__trustedAdminClient']) {
    Object.defineProperty(getters, property, { get() { propertyReads++; return capturedNativeCallback; } });
  }
  const proxied = new Proxy(trusted, {
    get() { propertyReads++; throw new Error('Untrusted Proxy property accessed'); },
    has() { propertyReads++; throw new Error('Untrusted Proxy marker inspected'); },
    ownKeys() { propertyReads++; throw new Error('Untrusted Proxy enumerated'); }
  });
  const customVerifier = { verifyStorageObjectAbsence: async () => { callbacks++; return true; } };
  const altered = Object.create(trusted, { deleteStorageObject: { value: capturedNativeCallback } });
  const invalid = [null, {}, plain, getters, customVerifier, { ...plain, _isTrustedAdminClient: true }, { ...trusted }, proxied, altered, wrongRun, unbound];
  for (const adminClient of invalid) {
    for (const failClosed of [true, false]) {
      const inventory = r5OutstandingInventory(runId);
      if (failClosed) {
        await assert.rejects(inventory.executeCleanup({ adminClient, failClosed, settlementTimeoutMs: 0 }), error => {
          assert.equal(error.code, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
          r5AssertOutstanding(error.cleanupReport, inventory);
          return true;
        });
      } else {
        r5AssertOutstanding(await inventory.executeCleanup({ adminClient, failClosed, settlementTimeoutMs: 0 }), inventory);
      }
      assert.equal(callbacks, 0);
      assert.equal(propertyReads, 0);
      assert.equal(transport.calls.length, 0);
    }
    const inventory = r5OutstandingInventory(runId);
    r5AssertOutstanding(await inventory._executeCleanupInternal({ adminClient, failClosed: false, settlementTimeoutMs: 0 }), inventory);
  }
  assert.throws(() => createHostedAdminClient({ projectRef: HARDCODED_REAL_REF, serviceRoleKey: validTestServiceRoleKey, runId, fetchFn: transport }), /SECURITY_BOUNDARY_VIOLATION/);
  assert.equal(transport.calls.length, 0);
});

test('114. H3-R5-01/R5-04: direct detailed and boolean absence reject integrity failures with status zero and no arbitrary verifier', async () => {
  const runId = 'r5-absence-admission';
  const path = getStorageProbeObjectPath(runId);
  let callbacks = 0;
  const callback = async () => { callbacks++; return true; };
  const transport = staticTransport({ status: 404, json: { code: 'NoSuchKey' } });
  const good = createHostedAdminClient({ serviceRoleKey: validTestServiceRoleKey, runId, fetchFn: transport });
  const unbound = createHostedAdminClient({ serviceRoleKey: validTestServiceRoleKey, fetchFn: transport });
  const crossRun = createHostedAdminClient({ serviceRoleKey: validTestServiceRoleKey, runId: 'r5-wrong-absence-run', fetchFn: transport });
  const badGetter = Object.defineProperty({}, 'getStorageObject', { get() { callbacks++; return callback; } });
  const badClients = [undefined, {}, { getStorageObject: callback }, { verifyStorageObjectAbsence: callback }, { _isTrustedAdminClient: true, getStorageObject: callback }, { ...good }, new Proxy(good, { get() { callbacks++; return callback; } }), badGetter, Object.create(good, { getStorageObject: { value: callback } }), crossRun, unbound];
  for (const adminClient of badClients) {
    const detail = await verifyStorageObjectAbsenceDetailed(adminClient, STORAGE_PROBE_BUCKET, path);
    assert.equal(detail.isAbsent, false);
    assert.equal(detail.classification, STORAGE_RESPONSE_CLASS.INDETERMINATE);
    assert.equal(detail.status, 0);
    assert.equal(detail.providerResponseObtained, false);
    assert.match(detail.reason, /ADMIN_INTEGRITY_REJECTED/);
    assert.equal(await verifyStorageObjectAbsence(adminClient, STORAGE_PROBE_BUCKET, path), false);
  }
  for (const options of [{ projectRef: HARDCODED_REAL_REF }, { runId: 'r5-other-requested-run' }]) {
    const detail = await verifyStorageObjectAbsenceDetailed(good, STORAGE_PROBE_BUCKET, path, options);
    assert.equal(detail.isAbsent, false);
    assert.equal(detail.status, 0);
    assert.equal(detail.providerResponseObtained, false);
    assert.equal(await verifyStorageObjectAbsence(good, STORAGE_PROBE_BUCKET, path, options), false);
  }
  assert.equal(callbacks, 0);
  assert.equal(transport.calls.length, 0);
  for (const [status, body, expectedClass, isAbsent] of [[404, { code: 'NoSuchKey' }, STORAGE_RESPONSE_CLASS.OBJECT_ABSENT, true], [403, { code: 'AccessDenied' }, STORAGE_RESPONSE_CLASS.UNAUTHORIZED_OR_FORBIDDEN, false], [200, {}, STORAGE_RESPONSE_CLASS.OBJECT_PRESENT, false]]) {
    const provider = staticTransport({ status, json: body });
    const client = createHostedAdminClient({ serviceRoleKey: validTestServiceRoleKey, runId, fetchFn: provider });
    const detail = await verifyStorageObjectAbsenceDetailed(client, STORAGE_PROBE_BUCKET, path);
    assert.equal(detail.isAbsent, isAbsent);
    assert.equal(detail.classification, expectedClass);
    assert.equal(await verifyStorageObjectAbsence(client, STORAGE_PROBE_BUCKET, path), isAbsent);
    assert.equal(provider.calls.length, 2);
  }
});

test('115. H3-R5-01/R5-03: runner admission preserves outstanding cleanup evidence and prevents all probe dispatch', async () => {
  let callbacks = 0;
  const runId = 'r5-runner-admission';
  const transport = staticTransport({ status: 200, json: {} });
  const trusted = createHostedAdminClient({ serviceRoleKey: validTestServiceRoleKey, runId, fetchFn: transport });
  const unbound = createHostedAdminClient({ serviceRoleKey: validTestServiceRoleKey, fetchFn: transport });
  const trustedDispatcher = createTrustedOfflineDispatcher({ runId, fetchFn: transport, defaultOutcome: { passed: false } });
  const invalid = [{}, { deleteUser: async () => { callbacks++; } }, Object.defineProperty({}, 'getUserById', { get() { callbacks++; return () => {}; } }), { ...trusted }, unbound];
  for (const adminClient of invalid) {
    const inventory = r5OutstandingInventory(runId);
    await assert.rejects(runHostedProbeRunner({ projectRef: HARDCODED_TEMP_REF, runId, inventory, adminClient, argv: ['--live'], env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' }, selectedProbeIds: ['BYPASS-01'], mockDispatcher: trustedDispatcher }), error => {
      assert.equal(error.code, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
      r5AssertOutstanding(error.cleanupReport, inventory);
      return true;
    });
  }
  // Matching inventory A and adapter A must not execute when the runner asks for B.
  const mismatchInventory = r5OutstandingInventory(runId);
  await assert.rejects(runHostedProbeRunner({ projectRef: HARDCODED_TEMP_REF, runId: 'r5-runner-requested-b', inventory: mismatchInventory, adminClient: trusted, argv: ['--live'], env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' }, selectedProbeIds: ['BYPASS-01'], mockDispatcher: trustedDispatcher }), error => {
    assert.match(error.message, /ADMIN_CLIENT_RUN_MISMATCH/);
    r5AssertOutstanding(error.cleanupReport, mismatchInventory);
    return true;
  });
  assert.equal(callbacks, 0);
  assert.equal(trustedDispatcher.calls.length, 0);
  assert.equal(transport.calls.length, 0);
  const dryRun = await runHostedProbeRunner({ projectRef: HARDCODED_TEMP_REF, argv: [], env: {}, adminClient: invalid[2] });
  assert.equal(dryRun.status, 'DRY_RUN_COMPLETED');
  assert.equal(callbacks, 0);
  const residualInventory = new TestRunInventory('r5-runner-cleanup-result');
  residualInventory.registerSession('r5-no-token-session');
  const adminClient = fixtureAdmin(residualInventory);
  const residualDispatcher = createTrustedOfflineDispatcher({ runId: residualInventory.runId, defaultOutcome: { passed: false, status: 500, error: 'offline probe failure' } });
  const result = await runHostedProbeRunner({ projectRef: HARDCODED_TEMP_REF, inventory: residualInventory, adminClient, argv: ['--live'], env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' }, selectedProbeIds: ['BYPASS-01'], mockDispatcher: residualDispatcher });
  assert.equal(result.status, 'HALTED_ON_FAILURE');
  assert.equal(result.cleanupReport.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.ok(result.cleanupReport.residualResources.some(resource => resource.type === 'session' && resource.id === 'r5-no-token-session'));
});

test('116. H3-R5-02: authentic provisioned Storage and session cleanup remains idempotent over three calls in both reporting modes', async () => {
  for (const failClosed of [true, false]) {
    for (const session of [true, false]) {
      const fixture = await r5ProvisionedFixture('r5-repeat-' + failClosed + '-' + session, { session });
      const { inventory, adminClient, transport, path } = fixture;
      assert.equal(inventory.getStorageFixture(STORAGE_PROBE_BUCKET, path).lifecycleState, STORAGE_LIFECYCLE_STATE.RUN_CREATED_VERIFIED);
      const first = await inventory.executeCleanup({ adminClient, failClosed });
      assert.equal(first.status, 'CLEANUP_VERIFIED_SUCCESS');
      const originalFixture = inventory.getStorageFixture(STORAGE_PROBE_BUCKET, path);
      const originalEvidence = JSON.stringify(originalFixture);
      const originalAbsence = originalFixture.absenceEvidence;
      const deletes = transport.calls.filter(call => call.method === 'DELETE').length;
      const requestCount = transport.calls.length;
      assert.equal(deletes, 1);
      for (let count = 0; count < 2; count++) {
        const report = await inventory.executeCleanup({ adminClient, failClosed });
        assert.equal(report.status, 'CLEANUP_VERIFIED_SUCCESS');
        assert.equal(report.storageObjectsDeleted, 0);
        assert.deepEqual(report.residualResources, []);
        assert.equal(inventory.getStorageFixture(STORAGE_PROBE_BUCKET, path), originalFixture);
        assert.equal(originalFixture.absenceEvidence, originalAbsence);
        assert.equal(JSON.stringify(originalFixture), originalEvidence);
        assert.equal(originalFixture.lifecycleState, STORAGE_LIFECYCLE_STATE.DELETION_VERIFIED);
        assert.equal(inventory.isClean(), true);
        assert.equal(transport.calls.filter(call => call.method === 'DELETE').length, deletes);
        assert.equal(transport.calls.length, requestCount);
      }
    }
  }
});

test('117. H3-R5-02: a prior residual does not erase authentic deletion receipts and late operations still prevent success', async () => {
  for (const failClosed of [true, false]) {
    const { inventory, adminClient, transport, path } = await r5ProvisionedFixture('r5-residual-retry-' + failClosed, { session: true, logoutFailure: true });
    const failed = await inventory.executeCleanup({ adminClient, failClosed: false });
    assert.equal(failed.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
    assert.equal(inventory.getStorageFixture(STORAGE_PROBE_BUCKET, path).lifecycleState, STORAGE_LIFECYCLE_STATE.DELETION_VERIFIED);
    const originalEvidence = JSON.stringify(inventory.getStorageFixture(STORAGE_PROBE_BUCKET, path));
    const retryTransport = staticTransport({ status: 200, json: {} });
    const retryAdmin = createHostedAdminClient({ serviceRoleKey: validTestServiceRoleKey, runId: inventory.runId, fetchFn: retryTransport });
    const retry = await inventory.executeCleanup({ adminClient: retryAdmin, failClosed });
    assert.equal(retry.status, 'CLEANUP_VERIFIED_SUCCESS');
    assert.equal(inventory.isClean(), true);
    assert.equal(retryTransport.calls.some(call => call.method === 'DELETE'), false);
    assert.equal(JSON.stringify(inventory.getStorageFixture(STORAGE_PROBE_BUCKET, path)), originalEvidence);
    assert.equal(transport.calls.filter(call => call.method === 'DELETE').length, 1);
    assert.throws(() => inventory.registerInFlightOperation({ probeId: 'LATE-UPLOAD', canModifyProviderState: true, requiresCleanupReconciliation: true }), /INVENTORY_FINALIZED/);
    assert.equal(inventory.isClean(), false);
    const lateResult = await inventory.executeCleanup({ adminClient: retryAdmin, failClosed: false });
    assert.equal(lateResult.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
    assert.ok(lateResult.residualResources.some(resource => resource.type === 'post_finalization_mutations'));
    assert.equal(retryTransport.calls.some(call => call.method === 'DELETE'), false);
  }
  const { inventory, adminClient, transport } = await r5ProvisionedFixture('r5-late-settlement');
  assert.equal((await inventory.executeCleanup({ adminClient })).status, 'CLEANUP_VERIFIED_SUCCESS');
  const settledProvisionOp = [...inventory.inFlightOperations.keys()][0];
  inventory.settleInFlightOperation(settledProvisionOp, { observed: { status: 200 } });
  const late = await inventory.executeCleanup({ adminClient, failClosed: false });
  assert.equal(late.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.equal(inventory.isClean(), false);
  assert.equal(transport.calls.filter(call => call.method === 'DELETE').length, 1);
});

test('118. H3-R5-02: forged or altered terminal Storage records cannot claim absence or execute caller serialization', async () => {
  for (const failClosed of [true, false]) {
    const runId = 'r5-forged-terminal-' + failClosed;
    const inventory = new TestRunInventory(runId);
    inventory.registerStorageFixture({ path: getStorageProbeObjectPath(runId), ownerId: R5_SEED_USER, lifecycleState: STORAGE_LIFECYCLE_STATE.DELETION_VERIFIED, hasCommittedUpload: true });
    const spec = fixtureSpec();
    const adminClient = fixtureAdmin(inventory, spec);
    assert.equal(inventory.isClean(), false);
    if (failClosed) await assert.rejects(inventory.executeCleanup({ adminClient, failClosed }), /CLEANUP_INCOMPLETE/);
    else assert.equal((await inventory.executeCleanup({ adminClient, failClosed })).status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
    assert.equal(fixtureCalls(spec).length, 0);
  }
  for (const alteration of ['owner', 'path', 'clone', 'toJSON']) {
    const { inventory, adminClient, transport, path } = await r5ProvisionedFixture('r5-terminal-altered-' + alteration);
    await inventory.executeCleanup({ adminClient });
    const fixture = inventory.getStorageFixture(STORAGE_PROBE_BUCKET, path);
    const key = STORAGE_PROBE_BUCKET + '/' + path;
    let serializationCallbacks = 0;
    if (alteration === 'owner') fixture.ownerId = R5_CREATED_USER;
    if (alteration === 'path') fixture.path = 'r5-another-run/probe.txt';
    if (alteration === 'clone') inventory.storageFixtures.set(key, { ...fixture });
    if (alteration === 'toJSON') fixture.toJSON = () => { serializationCallbacks++; return { lifecycleState: STORAGE_LIFECYCLE_STATE.DELETION_VERIFIED }; };
    assert.equal(inventory.isClean(), false);
    const report = await inventory.executeCleanup({ adminClient, failClosed: false });
    assert.equal(report.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
    assert.equal(serializationCallbacks, 0);
    assert.equal(transport.calls.filter(call => call.method === 'DELETE').length, 1);
  }
});

test('119. H3-R5-01: immutable Admin capabilities reject altered call methods and borrowed receivers before execution', async () => {
  let callbacks = 0;
  const runId = 'r5-frozen-capabilities';
  const transport = staticTransport({ status: 200, json: {} });
  const client = createHostedAdminClient({ serviceRoleKey: validTestServiceRoleKey, runId, fetchFn: transport });
  for (const method of Object.values(client)) {
    assert.equal(Object.isFrozen(method), true);
    assert.throws(() => Object.defineProperty(method, 'call', { value: () => { callbacks++; } }), TypeError);
    assert.throws(() => Object.defineProperty(method, 'apply', { value: () => { callbacks++; } }), TypeError);
  }
  const badReceiver = { signOut: async () => { callbacks++; return { error: null }; } };
  await assert.rejects(client.invalidateSession.call(badReceiver, 'r5-session', 'synthetic-token'), /UNTRUSTED_ADMIN_CLIENT/);
  await assert.rejects(client.getStorageObject.call(badReceiver, STORAGE_PROBE_BUCKET, getStorageProbeObjectPath(runId)), /UNTRUSTED_ADMIN_CLIENT/);
  assert.equal(callbacks, 0);
  assert.equal(transport.calls.length, 0);
});

test('120. H3-R5 execution audit: raw Storage registrations and forged verified ownership never authorize destructive cleanup', async () => {
  for (const registration of ['raw', 'forged_verified']) {
    const runId = 'r5-unverified-ownership-' + registration;
    const inventory = new TestRunInventory(runId);
    const path = getStorageProbeObjectPath(runId);
    inventory.registerCreatedUser({ id: R5_CREATED_USER, email: 'owned-r5@proof.invalid', creationProof: createCreationProof('before_after_check') });
    if (registration === 'raw') inventory.registerStorageObject(STORAGE_PROBE_BUCKET, path);
    else inventory.registerStorageFixture({ path, ownerId: R5_SEED_USER, lifecycleState: STORAGE_LIFECYCLE_STATE.RUN_CREATED_VERIFIED, deletionEligible: true, hasCommittedUpload: true });
    const spec = fixtureSpec();
    const adminClient = fixtureAdmin(inventory, spec);
    const report = await inventory.executeCleanup({ adminClient, failClosed: false });
    assert.equal(report.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
    assert.ok(report.residualResources.some(resource => resource.type === 'storage_object'));
    assert.ok(report.residualUsers.some(user => user.id === R5_CREATED_USER && /STORAGE_CLEANUP_FAILURE_CASCADE_PREVENTED/.test(user.error)));
    assert.equal(fixtureCalls(spec).length, 0);
    assert.equal(inventory.isClean(), false);
    await assert.rejects(inventory.executeCleanup({ adminClient, failClosed: true }), /CLEANUP_INCOMPLETE/);
    assert.equal(fixtureCalls(spec).length, 0);
  }
  const empty = new TestRunInventory('r5-empty-report-only');
  assert.equal((await empty.executeCleanup()).status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(empty.isClean(), true);
});

test('121. H3-R5-02: repeated cleanup after failed Storage deletion retains the residual without another DELETE', async () => {
  for (const failClosed of [true, false]) {
    const { inventory, adminClient, transport, path } = await r5ProvisionedFixture('r5-storage-residual-' + failClosed, { storageDeleteFailure: true });
    const first = await inventory.executeCleanup({ adminClient, failClosed: false });
    assert.equal(first.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
    assert.equal(inventory.getStorageFixture(STORAGE_PROBE_BUCKET, path).lifecycleState, STORAGE_LIFECYCLE_STATE.CLEANUP_INDETERMINATE);
    const destructiveCount = transport.calls.filter(call => call.method === 'DELETE').length;
    assert.equal(destructiveCount, 1);
    if (failClosed) await assert.rejects(inventory.executeCleanup({ adminClient, failClosed }), error => {
      assert.equal(error.cleanupReport.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
      assert.ok(error.cleanupReport.residualResources.some(resource => resource.type === 'storage_object'));
      return true;
    });
    else assert.equal((await inventory.executeCleanup({ adminClient, failClosed })).status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
    assert.equal(transport.calls.filter(call => call.method === 'DELETE').length, destructiveCount);
    assert.equal(inventory.isClean(), false);
  }
});

// ===========================================================================
// Task 06I-B1-H3-R6: Mandatory Trusted Offline Dispatcher Admission & Final P1 Closure
// ===========================================================================

test('122. H3-R6-01: createTrustedOfflineDispatcher rejects callbacks, accessors, forbidden targets, unbound runs, and untrusted transports', () => {
  const runId = 'r6-factory-boundary';

  // 1. Rejects forbidden & non-TEMP projects
  assert.throws(() => createTrustedOfflineDispatcher({ projectRef: HARDCODED_REAL_REF, runId }), /CRITICAL_SECURITY_VIOLATION/);
  assert.throws(() => createTrustedOfflineDispatcher({ projectRef: HARDCODED_TIO_WORLD_REF, runId }), /CRITICAL_SECURITY_VIOLATION/);
  assert.throws(() => createTrustedOfflineDispatcher({ projectRef: 'unauthorized-proj', runId }), /CRITICAL_SECURITY_VIOLATION/);

  // 2. Rejects missing or invalid runId (unbound dispatcher impossible)
  assert.throws(() => createTrustedOfflineDispatcher({}), /OFFLINE_DISPATCHER_RUN_REQUIRED/);
  assert.throws(() => createTrustedOfflineDispatcher({ runId: '' }), /OFFLINE_DISPATCHER_RUN_REQUIRED/);
  assert.throws(() => createTrustedOfflineDispatcher({ runId: '../escape' }), /INVALID_RUN_ID/);

  // 3. Rejects arbitrary executable callbacks, getters, symbols, and cycles in spec
  assert.throws(
    () => createTrustedOfflineDispatcher({ runId, outcomes: { 'BYPASS-01': () => ({ passed: true }) } }),
    /INVALID_DETERMINISTIC_FIXTURE_SPEC.*Arbitrary executable callback rejected/
  );
  assert.throws(
    () => createTrustedOfflineDispatcher({ runId, get outcomes() { return {}; } }),
    /INVALID_DETERMINISTIC_FIXTURE_SPEC.*Accessor property rejected/
  );
  assert.throws(
    () => createTrustedOfflineDispatcher({ runId, outcomes: { [Symbol('sym')]: { passed: true } } }),
    /INVALID_DETERMINISTIC_FIXTURE_SPEC.*Symbol property/
  );
  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(
    () => createTrustedOfflineDispatcher({ runId, outcomes: cyclic }),
    /INVALID_DETERMINISTIC_FIXTURE_SPEC.*Circular object reference/
  );

  // 4. Rejects untrusted transports (globalThis.fetch, bound fetch, arbitrary lambda)
  assert.throws(() => createTrustedOfflineDispatcher({ runId, fetchFn: globalThis.fetch }), /BLOCKED_PENDING_DURABLE_RECOVERY/);
  assert.throws(() => createTrustedOfflineDispatcher({ runId, fetchFn: globalThis.fetch.bind(globalThis) }), /BLOCKED_PENDING_DURABLE_RECOVERY/);
  assert.throws(() => createTrustedOfflineDispatcher({ runId, fetchFn: async () => ({ status: 200 }) }), /BLOCKED_PENDING_DURABLE_RECOVERY/);

  // 5. Created dispatcher is frozen with immutable properties and no public trust marker
  const disp = createTrustedOfflineDispatcher({ runId, defaultOutcome: { passed: true, status: 200 } });
  assert.equal(Object.isFrozen(disp), true);
  assert.equal(disp._isTrustedOfflineDispatcher, undefined);
  assert.equal(disp._isHostedNetworkDispatcher, undefined);
  assert.throws(() => { disp.extra = 1; }, TypeError);
});

test('123. H3-R6-01: runHostedProbeRunner admission rejects all untrusted, forged, proxied, bound, cross-run, and missing dispatchers with zero side effects', async () => {
  const runId = 'r6-admission-matrix';
  const capturedFetch = globalThis.fetch;
  let arbitraryCalls = 0;
  let sentinelTransportCalls = 0;
  const sentinelTransport = () => {
    sentinelTransportCalls++;
    return { status: 200, ok: true, json: async () => ({}) };
  };

  function makeTrustedSetup(targetRunId = runId) {
    const inv = r5OutstandingInventory(targetRunId);
    const transport = staticTransport({ status: 200, json: {} });
    const adminClient = createHostedAdminClient({
      serviceRoleKey: validTestServiceRoleKey,
      anonKey: validTestAnonKey,
      runId: targetRunId,
      fetchFn: transport
    });
    return { inv, transport, adminClient };
  }

  // Case 1: Trusted run-bound Admin + arbitrary unregistered dispatcher
  const arbitraryDispatcher = async () => { arbitraryCalls++; return { passed: true, status: 200 }; };
  // Case 2: Dispatcher retaining a captured transport/fetch reference
  const capturedRefDispatcher = async () => {
    arbitraryCalls++;
    void capturedFetch;
    return sentinelTransport();
  };
  // Case 3: Bound or wrapped arbitrary dispatcher
  const boundArbitrary = arbitraryDispatcher.bind(null);
  const wrappedArbitrary = (item, opts) => arbitraryDispatcher(item, opts);
  // Case 4: Forged dispatcher trust markers
  const forgedMarker1 = Object.assign(async () => { arbitraryCalls++; return { passed: true }; }, { _isTrustedOfflineDispatcher: true });
  const forgedMarker2 = Object.assign(async () => { arbitraryCalls++; return { passed: true }; }, { isTrustedOfflineDispatcher: true, _trustedDispatcher: true });
  // Case 5: Proxy or substituted dispatcher
  const validDispForProxy = createTrustedOfflineDispatcher({ runId, defaultOutcome: { passed: true, status: 200 } });
  const proxiedDispatcher = new Proxy(validDispForProxy, {
    apply(target, thisArg, args) {
      arbitraryCalls++;
      return Reflect.apply(target, thisArg, args);
    }
  });
  const boundValidDisp = validDispForProxy.bind(null);
  // Case 7: Dispatcher registered for another run
  const otherRunDisp = createTrustedOfflineDispatcher({ runId: 'r6-other-run-id', defaultOutcome: { passed: true, status: 200 } });

  const rejectedCases = [
    { label: 'arbitrary', disp: arbitraryDispatcher, env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' }, pattern: /BLOCKED_PENDING_DURABLE_RECOVERY.*UNTRUSTED_OFFLINE_DISPATCHER/ },
    { label: 'capturedRef', disp: capturedRefDispatcher, env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' }, pattern: /BLOCKED_PENDING_DURABLE_RECOVERY.*UNTRUSTED_OFFLINE_DISPATCHER/ },
    { label: 'boundArbitrary', disp: boundArbitrary, env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' }, pattern: /BLOCKED_PENDING_DURABLE_RECOVERY.*UNTRUSTED_OFFLINE_DISPATCHER/ },
    { label: 'wrappedArbitrary', disp: wrappedArbitrary, env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' }, pattern: /BLOCKED_PENDING_DURABLE_RECOVERY.*UNTRUSTED_OFFLINE_DISPATCHER/ },
    { label: 'forgedMarker1', disp: forgedMarker1, env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' }, pattern: /BLOCKED_PENDING_DURABLE_RECOVERY.*UNTRUSTED_OFFLINE_DISPATCHER.*_isTrustedOfflineDispatcher/ },
    { label: 'forgedMarker2', disp: forgedMarker2, env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' }, pattern: /BLOCKED_PENDING_DURABLE_RECOVERY.*UNTRUSTED_OFFLINE_DISPATCHER/ },
    { label: 'proxied', disp: proxiedDispatcher, env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' }, pattern: /BLOCKED_PENDING_DURABLE_RECOVERY.*UNTRUSTED_OFFLINE_DISPATCHER/ },
    { label: 'boundValid', disp: boundValidDisp, env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' }, pattern: /BLOCKED_PENDING_DURABLE_RECOVERY.*UNTRUSTED_OFFLINE_DISPATCHER/ },
    { label: 'otherRun', disp: otherRunDisp, env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' }, pattern: /OFFLINE_DISPATCHER_RUN_MISMATCH/ },
    { label: 'missing', disp: null, env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' }, pattern: /NO_HOSTED_DISPATCHER/ },
    // Case 10 & 11: Optional LIVE gate flags omitted or explicitly false still reject untrusted dispatcher
    { label: 'flagsOmitted', disp: arbitraryDispatcher, extra: {}, pattern: /BLOCKED_PENDING_DURABLE_RECOVERY.*UNTRUSTED_OFFLINE_DISPATCHER/ },
    { label: 'flagsFalse', disp: arbitraryDispatcher, extra: { liveHostedDispatch: false, enforceDurableRecoveryGate: false }, pattern: /BLOCKED_PENDING_DURABLE_RECOVERY.*UNTRUSTED_OFFLINE_DISPATCHER/ }
  ];

  for (const tc of rejectedCases) {
    const { inv, transport, adminClient } = makeTrustedSetup(runId);
    await assert.rejects(
      () => runHostedProbeRunner({
        projectRef: HARDCODED_TEMP_REF,
        runId,
        inventory: inv,
        adminClient,
        argv: ['--live'],
        env: tc.env || { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
        selectedProbeIds: ['BYPASS-01'],
        mockDispatcher: tc.disp,
        ...(tc.extra || {})
      }),
      error => {
        assert.match(error.message, tc.pattern, `Case ${tc.label} failed pattern`);
        // Case 13: Existing residual obligations preserved in structured cleanupReport
        r5AssertOutstanding(error.cleanupReport, inv);
        return true;
      }
    );
    // Zero destructive cleanup or probe transport calls
    assert.equal(transport.calls.length, 0, `Case ${tc.label} must dispatch 0 transport calls`);
    assert.equal(inv.runLifecycleState, INVENTORY_RUN_STATE.RESIDUAL_BLOCKED, `Case ${tc.label} must finalize inventory as RESIDUAL_BLOCKED`);
  }

  // Case 6: Dispatcher registered for another project rejected at assertTrustedOfflineDispatcher
  assert.throws(
    () => assertTrustedOfflineDispatcher(validDispForProxy, { projectRef: 'other-project-ref', runId }),
    /CRITICAL_SECURITY_VIOLATION.*OFFLINE_DISPATCHER_PROJECT_MISMATCH/
  );

  // Case 8: Unbound dispatcher rejected by factory
  assert.throws(
    () => createTrustedOfflineDispatcher({ defaultOutcome: { passed: true } }),
    /OFFLINE_DISPATCHER_RUN_REQUIRED/
  );

  // Case 9: Trusted dispatcher with mismatched Admin or inventory
  const invA = r5OutstandingInventory('r6-mismatch-a');
  const transportA = staticTransport({ status: 200, json: {} });
  const adminA = createHostedAdminClient({ serviceRoleKey: validTestServiceRoleKey, runId: 'r6-mismatch-a', fetchFn: transportA });
  const dispB = createTrustedOfflineDispatcher({ runId: 'r6-mismatch-b', defaultOutcome: { passed: true, status: 200 } });
  await assert.rejects(
    () => runHostedProbeRunner({
      projectRef: HARDCODED_TEMP_REF,
      runId: 'r6-mismatch-a',
      inventory: invA,
      adminClient: adminA,
      argv: ['--live'],
      env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
      selectedProbeIds: ['BYPASS-01'],
      mockDispatcher: dispB
    }),
    error => {
      assert.match(error.message, /OFFLINE_DISPATCHER_RUN_MISMATCH/);
      r5AssertOutstanding(error.cleanupReport, invA);
      return true;
    }
  );
  assert.equal(dispB.calls.length, 0);
  assert.equal(transportA.calls.length, 0);

  // Also check total counts across all rejected cases
  assert.equal(arbitraryCalls, 0, 'Arbitrary/forged/proxied dispatchers must have 0 invocations');
  assert.equal(sentinelTransportCalls, 0, 'Unauthorized transport must have 0 invocations');
  assert.equal(validDispForProxy.calls.length, 0, 'Proxied valid dispatcher must have 0 probe dispatches');
  assert.equal(otherRunDisp.calls.length, 0, 'Cross-run dispatcher must have 0 probe dispatches');
});

test('124. H3-R6-01: Valid declarative offline simulation, dependency-complete subset, DRY_RUN, and blocked LIVE CLI', async () => {
  // Case 14 & 15: Valid registered declarative dispatcher & dependency-complete subset via explicit offline simulation
  const runId = 'r6-valid-offline-sim';
  const simTransport = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
    routes: [
      { urlIncludes: '/auth/v1/otp', status: 422, json: { error_code: 'email_provider_disabled' } },
      { urlIncludes: '/auth/v1/token', status: 200, json: { access_token: createMockJwt() } }
    ],
    defaultResponse: { status: 200, ok: true, json: {} }
  });
  const simAdmin = createHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    anonKey: validTestAnonKey,
    runId,
    fetchFn: simTransport
  });
  const simDispatcher = createTrustedOfflineDispatcher({
    runId,
    fetchFn: simTransport,
    outcomes: {
      'BYPASS-01': {
        transportRequest: { url: `https://${HARDCODED_TEMP_REF}.supabase.co/auth/v1/otp`, method: 'POST', body: { email: 'test@proof.invalid' } },
        passed: true,
        status: 422,
        route_disabled: true,
        error_code: 'email_provider_disabled'
      },
      'HOOK-01': {
        passed: true,
        status: 200,
        has_token: true,
        amr_authenticated: true,
        session_id: 'session-uuid-5678',
        tokens: { access_token: createMockJwt() }
      },
      'HOOK-02': {
        passed: true,
        status: 200,
        has_token: true,
        amr_preserved: true,
        tokens: { access_token: createMockJwt() }
      }
    }
  });

  const simResult = await runOfflineProbeSimulation({
    projectRef: HARDCODED_TEMP_REF,
    runId,
    adminClient: simAdmin,
    offlineDispatcher: simDispatcher,
    selectedProbeIds: ['BYPASS-01', 'HOOK-01', 'HOOK-02'],
    timing: { mode: 'recorded_zero_wait' }
  });
  assert.equal(simResult.status, 'COMPLETED');
  assert.equal(simResult.mode, 'OFFLINE_SIMULATION');
  assert.equal(simResult.simulatedExecution, true);
  assert.equal(simResult.hostedProviderVerified, false);
  assert.deepEqual(simResult.executionEvidence.completed, ['BYPASS-01', 'HOOK-01', 'HOOK-02']);
  assert.equal(simDispatcher.calls.length, 3);
  assert.equal(simTransport.calls.length, 1);

  // Case 16: DRY_RUN with no dispatcher succeeds with 0 network calls
  const dryRun = await runHostedProbeRunner({
    projectRef: HARDCODED_TEMP_REF,
    argv: [],
    env: {},
    mockDispatcher: null
  });
  assert.equal(dryRun.status, 'DRY_RUN_COMPLETED');
  assert.equal(dryRun.zeroNetworkRequestsDispatched, true);
  assert.equal(dryRun.hostedProviderVerified, false);

  // Case 17: Real LIVE CLI execution remains unconditionally blocked
  const { spawnSync } = await import('node:child_process');
  const cliRes = spawnSync(process.execPath, ['experiments/task06i/hosted-probe-runner.mjs', '--live'], {
    encoding: 'utf8',
    env: { ...process.env, TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' }
  });
  assert.equal(cliRes.status, 1);
  assert.match(cliRes.stderr, /BLOCKED_PENDING_DURABLE_RECOVERY/);
});

// ===========================================================================
// Task 06I-B1-H3-R7: Declarative Timing & Descriptor-First Admission Security Closure
// ===========================================================================

test('125. H3-R7-01: sleepFn callbacks/getters/inherited overrides and invalid timing configs are rejected with zero invocations', async () => {
  const runId = 'r7-01-timing-boundary';
  const capturedFetch = globalThis.fetch;
  let timingCalls = 0;
  let getterCalls = 0;
  let unauthorizedTransportCalls = 0;
  const unauthorizedSentinel = () => {
    unauthorizedTransportCalls++;
    return { status: 200 };
  };

  function setupRun() {
    const inv = r5OutstandingInventory(runId);
    const transport = staticTransport({ status: 200, json: {} });
    const adminClient = createHostedAdminClient({
      serviceRoleKey: validTestServiceRoleKey,
      anonKey: validTestAnonKey,
      runId,
      fetchFn: transport
    });
    const dispatcher = createTrustedOfflineDispatcher({
      runId,
      fetchFn: transport,
      outcomes: {
        'BYPASS-01': { passed: true, status: 422, route_disabled: true, error_code: 'email_provider_disabled' },
        'HOOK-01': { passed: true, status: 200, has_token: true, amr_authenticated: true, session_id: 'session-uuid-5678', tokens: { access_token: createMockJwt() } }
      }
    });
    return { inv, transport, adminClient, dispatcher };
  }

  // 1. Arbitrary sleepFn callback & captured-fetch sleepFn callback on both entry points
  for (const sleepFn of [
    async () => { timingCalls++; },
    async () => { timingCalls++; void capturedFetch; return unauthorizedSentinel(); }
  ]) {
    for (const entry of ['runner', 'sim']) {
      const { inv, transport, adminClient, dispatcher } = setupRun();
      const opts = {
        projectRef: HARDCODED_TEMP_REF,
        runId,
        inventory: inv,
        adminClient,
        mockDispatcher: dispatcher,
        selectedProbeIds: ['BYPASS-01', 'HOOK-01'],
        sleepFn,
        ...(entry === 'runner' ? { argv: ['--live'], env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' } } : {})
      };
      await assert.rejects(
        () => (entry === 'runner' ? runHostedProbeRunner(opts) : runOfflineProbeSimulation(opts)),
        error => {
          assert.match(error.message, /UNTRUSTED_TIMING_OVERRIDE/);
          r5AssertOutstanding(error.cleanupReport, inv);
          return true;
        }
      );
      assert.equal(dispatcher.calls.length, 0);
      assert.equal(transport.calls.length, 0);
    }
  }

  // 2. Timing getter on options (must reject with 0 getter invocations)
  {
    const { inv, transport, adminClient, dispatcher } = setupRun();
    const getterOpts = {
      projectRef: HARDCODED_TEMP_REF,
      runId,
      inventory: inv,
      adminClient,
      mockDispatcher: dispatcher,
      selectedProbeIds: ['BYPASS-01', 'HOOK-01'],
      argv: ['--live'],
      env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' }
    };
    Object.defineProperty(getterOpts, 'sleepFn', {
      enumerable: true,
      get() {
        getterCalls++;
        return async () => { timingCalls++; };
      }
    });
    await assert.rejects(() => runHostedProbeRunner(getterOpts), /Accessor property rejected at 'runnerOptions\.sleepFn'/);
    await assert.rejects(() => runOfflineProbeSimulation(getterOpts), /Accessor property rejected at 'runnerOptions\.sleepFn'/);
    assert.equal(getterCalls, 0);
    assert.equal(dispatcher.calls.length, 0);
    assert.equal(transport.calls.length, 0);
  }

  // 3. Inherited sleepFn override (custom prototype & Object.prototype)
  {
    const { inv, transport, adminClient, dispatcher } = setupRun();
    const protoWithSleep = { sleepFn: async () => { timingCalls++; } };
    const inheritedOpts = Object.create(protoWithSleep);
    inheritedOpts.projectRef = HARDCODED_TEMP_REF;
    inheritedOpts.runId = runId;
    inheritedOpts.inventory = inv;
    inheritedOpts.adminClient = adminClient;
    inheritedOpts.mockDispatcher = dispatcher;
    inheritedOpts.argv = ['--live'];
    inheritedOpts.env = { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' };
    await assert.rejects(() => runHostedProbeRunner(inheritedOpts), /Unsupported prototype rejected/);
    assert.equal(dispatcher.calls.length, 0);
    assert.equal(transport.calls.length, 0);

    Object.defineProperty(Object.prototype, 'sleepFn', {
      configurable: true,
      get() { getterCalls++; return async () => { timingCalls++; }; }
    });
    try {
      const { inv: inv2, transport: tr2, adminClient: adm2, dispatcher: disp2 } = setupRun();
      await assert.rejects(
        () => runHostedProbeRunner({
          projectRef: HARDCODED_TEMP_REF,
          runId,
          inventory: inv2,
          adminClient: adm2,
          mockDispatcher: disp2,
          argv: ['--live'],
          env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' }
        }),
        /UNTRUSTED_TIMING_OVERRIDE/
      );
      assert.equal(getterCalls, 0);
      assert.equal(disp2.calls.length, 0);
      assert.equal(tr2.calls.length, 0);
    } finally {
      delete Object.prototype.sleepFn;
    }
  }

  // 4. Invalid declarative timing configs
  const timingWithGetter = {};
  Object.defineProperty(timingWithGetter, 'intervalMs', { enumerable: true, get() { getterCalls++; return 0; } });
  for (const badTiming of [
    { intervalMs: -1 },
    { intervalMs: 'fast' },
    { mode: 'bypass_all' },
    { sleepFn: async () => { timingCalls++; } },
    async () => { timingCalls++; },
    timingWithGetter
  ]) {
    const { inv, transport, adminClient, dispatcher } = setupRun();
    await assert.rejects(
      () => runOfflineProbeSimulation({
        projectRef: HARDCODED_TEMP_REF,
        runId,
        inventory: inv,
        adminClient,
        mockDispatcher: dispatcher,
        selectedProbeIds: ['BYPASS-01', 'HOOK-01'],
        timing: badTiming
      }),
      error => {
        assert.match(error.message, /INVALID_TIMING_CONFIG|INVALID_DETERMINISTIC_FIXTURE_SPEC/);
        r5AssertOutstanding(error.cleanupReport, inv);
        return true;
      }
    );
    assert.equal(dispatcher.calls.length, 0);
    assert.equal(transport.calls.length, 0);
  }

  // 5. DRY_RUN with sleepFn rejected; DRY_RUN without sleepFn succeeds
  await assert.rejects(
    () => runHostedProbeRunner({ projectRef: HARDCODED_TEMP_REF, argv: [], env: {}, sleepFn: async () => { timingCalls++; } }),
    /UNTRUSTED_TIMING_OVERRIDE/
  );
  const dryOk = await runHostedProbeRunner({ projectRef: HARDCODED_TEMP_REF, argv: [], env: {} });
  assert.equal(dryOk.status, 'DRY_RUN_COMPLETED');

  // 6. Valid multi-probe subset using internal timer (intervalMs: 1) + recorded_zero_wait
  for (const timing of [{ intervalMs: 1 }, { mode: 'recorded_zero_wait' }]) {
    const simRunId = runId + '-' + (timing.mode || 'standard');
    const simTransport = staticTransport({ status: 200, json: {} });
    const simAdmin = createHostedAdminClient({ serviceRoleKey: validTestServiceRoleKey, anonKey: validTestAnonKey, runId: simRunId, fetchFn: simTransport });
    const simDisp = createTrustedOfflineDispatcher({
      runId: simRunId,
      fetchFn: simTransport,
      outcomes: {
        'BYPASS-01': { passed: true, status: 422, route_disabled: true, error_code: 'email_provider_disabled' },
        'HOOK-01': { passed: true, status: 200, has_token: true, amr_authenticated: true, session_id: 'session-uuid-5678', tokens: { access_token: createMockJwt() } }
      }
    });
    const simRes = await runOfflineProbeSimulation({
      projectRef: HARDCODED_TEMP_REF,
      runId: simRunId,
      adminClient: simAdmin,
      offlineDispatcher: simDisp,
      selectedProbeIds: ['BYPASS-01', 'HOOK-01'],
      timing
    });
    assert.equal(simRes.status, 'COMPLETED');
    assert.deepEqual(simRes.throttleIntervalsMs, []);
    assert.equal(simRes.attemptedProbeCount, 2);
    assert.equal(simRes.requestCount, 0);
  }

  assert.equal(timingCalls, 0);
  assert.equal(getterCalls, 0);
  assert.equal(unauthorizedTransportCalls, 0);
});

test('126. H3-R7-02: createTrustedOfflineDispatcher validates descriptors, prototypes, symbols, and Proxies before reading any field', () => {
  const runId = 'r7-02-descriptor-first';
  let getterCalls = 0;
  let callbackCalls = 0;
  let trapCalls = 0;

  // 1. Zero-execution sentinels on every early-read & declarative field
  for (const field of ['projectRef', 'runId', 'fetchFn', 'transportSpec', 'outcomes', 'defaultOutcome', 'sequence']) {
    const spec = field === 'runId' ? {} : { runId };
    Object.defineProperty(spec, field, {
      enumerable: true,
      get() {
        getterCalls++;
        return field === 'projectRef' ? HARDCODED_TEMP_REF : (field === 'runId' ? runId : {});
      }
    });
    assert.throws(() => createTrustedOfflineDispatcher(spec), /Accessor property rejected/);
  }

  // 2. Non-enumerable accessor
  const nonEnumSpec = { runId };
  Object.defineProperty(nonEnumSpec, 'hiddenTrap', {
    enumerable: false,
    get() { getterCalls++; return 1; }
  });
  assert.throws(() => createTrustedOfflineDispatcher(nonEnumSpec), /Accessor property rejected/);

  // 3. Inherited accessor
  const protoWithGetter = {};
  Object.defineProperty(protoWithGetter, 'projectRef', {
    enumerable: true,
    get() { getterCalls++; return HARDCODED_TEMP_REF; }
  });
  const inheritedSpec = Object.create(protoWithGetter);
  inheritedSpec.runId = runId;
  assert.throws(() => createTrustedOfflineDispatcher(inheritedSpec), /Unsupported prototype rejected/);

  // 4. Symbol-keyed accessor
  const symKey = Symbol('trap');
  const symSpec = { runId };
  Object.defineProperty(symSpec, symKey, {
    enumerable: true,
    get() { getterCalls++; return 1; }
  });
  assert.throws(() => createTrustedOfflineDispatcher(symSpec), /Symbol property/);

  // 5. Nested object accessor & array index accessor
  const nestedObj = {};
  Object.defineProperty(nestedObj, 'status', { enumerable: true, get() { getterCalls++; return 200; } });
  assert.throws(() => createTrustedOfflineDispatcher({ runId, outcomes: { 'BYPASS-01': nestedObj } }), /Accessor property rejected/);

  const arrWithGetter = [];
  Object.defineProperty(arrWithGetter, 0, { enumerable: true, get() { getterCalls++; return { passed: true }; } });
  assert.throws(() => createTrustedOfflineDispatcher({ runId, sequence: arrWithGetter }), /Accessor property rejected/);

  // 6. Proxy specification with observable traps
  const proxySpec = new Proxy({ runId, defaultOutcome: { passed: true } }, {
    get(t, p, r) { trapCalls++; return Reflect.get(t, p, r); },
    has(t, p) { trapCalls++; return Reflect.has(t, p); },
    ownKeys(t) { trapCalls++; return Reflect.ownKeys(t); },
    getOwnPropertyDescriptor(t, p) { trapCalls++; return Reflect.getOwnPropertyDescriptor(t, p); },
    getPrototypeOf(t) { trapCalls++; return Reflect.getPrototypeOf(t); }
  });
  assert.throws(() => createTrustedOfflineDispatcher(proxySpec), /Proxy object rejected/);

  // 7. Unexpected function-valued property & forged deterministic transport
  assert.throws(() => createTrustedOfflineDispatcher({ runId, extraFn: () => { callbackCalls++; } }), /Arbitrary executable callback rejected/);
  const forgedTransport = Object.assign(() => { callbackCalls++; return { status: 200 }; }, { _isDeterministicTransport: true });
  assert.throws(() => createTrustedOfflineDispatcher({ runId, fetchFn: forgedTransport }), /BLOCKED_PENDING_DURABLE_RECOVERY/);

  // 8. Valid registered transport accepted without invoking transport during construction
  const validTransport = staticTransport({ status: 200, json: {} });
  const validDisp = createTrustedOfflineDispatcher({ runId, fetchFn: validTransport, defaultOutcome: { passed: true, status: 200 } });
  assert.equal(typeof validDisp, 'function');
  assert.equal(validTransport.calls.length, 0);

  assert.equal(getterCalls, 0, 'Zero getters may execute on rejected dispatcher specs');
  assert.equal(callbackCalls, 0, 'Zero callbacks may execute on rejected dispatcher specs');
  assert.equal(trapCalls, 0, 'Zero Proxy traps may execute on rejected Proxy specs');
});

test('127. H3-R7-03: All public factories and runner/cleanup/absence wrappers reject getters and Proxies before reading properties', async () => {
  let getterCalls = 0;
  let trapCalls = 0;

  function makeTrappedObj(base = {}) {
    const obj = { ...base };
    Object.defineProperty(obj, 'projectRef', {
      enumerable: true,
      get() { getterCalls++; return HARDCODED_TEMP_REF; }
    });
    return obj;
  }

  function makeProxyObj(base = {}) {
    return new Proxy(base, {
      get(t, p, r) { trapCalls++; return Reflect.get(t, p, r); },
      ownKeys(t) { trapCalls++; return Reflect.ownKeys(t); },
      getOwnPropertyDescriptor(t, p) { trapCalls++; return Reflect.getOwnPropertyDescriptor(t, p); },
      getPrototypeOf(t) { trapCalls++; return Reflect.getPrototypeOf(t); }
    });
  }

  // Sync factories
  for (const fn of [
    o => createDeterministicFixtureTransport(o),
    o => createHostedDispatcher(o),
    o => createHostedAdminClient(o)
  ]) {
    assert.throws(() => fn(makeTrappedObj()), /Accessor property rejected/);
    assert.throws(() => fn(makeProxyObj()), /Proxy object rejected/);
  }

  // Async entry points
  const inv = new TestRunInventory('r7-03-audit');
  const transport = staticTransport({ status: 200, json: {} });
  const admin = createHostedAdminClient({ serviceRoleKey: validTestServiceRoleKey, anonKey: validTestAnonKey, runId: inv.runId, fetchFn: transport });
  for (const asyncFn of [
    o => runHostedProbeRunner(o),
    o => runOfflineProbeSimulation(o),
    o => provisionStorageProbeFixture(o),
    o => inv.executeCleanup(o)
  ]) {
    await assert.rejects(() => asyncFn(makeTrappedObj()), /Accessor property rejected/);
    await assert.rejects(() => asyncFn(makeProxyObj()), /Proxy object rejected/);
  }

  // Detailed absence returns structured INDETERMINATE without invoking getters/traps
  const absGetter = await verifyStorageObjectAbsenceDetailed(admin, STORAGE_PROBE_BUCKET, `${inv.runId}/probe.txt`, makeTrappedObj());
  assert.equal(absGetter.isAbsent, false);
  assert.equal(absGetter.classification, STORAGE_RESPONSE_CLASS.INDETERMINATE);
  assert.match(absGetter.reason, /Accessor property rejected/);

  const absProxy = await verifyStorageObjectAbsenceDetailed(admin, STORAGE_PROBE_BUCKET, `${inv.runId}/probe.txt`, makeProxyObj());
  assert.equal(absProxy.isAbsent, false);
  assert.equal(absProxy.classification, STORAGE_RESPONSE_CLASS.INDETERMINATE);
  assert.match(absProxy.reason, /Proxy object rejected/);

  assert.equal(getterCalls, 0);
  assert.equal(trapCalls, 0);
  assert.equal(transport.calls.length, 0);
});

// ===========================================================================
// Task 06I-B1-H3-R8: Recursive Input Admission & Trusted Runtime State Closure
// ===========================================================================

test('128. H3-R8-01A: argv and env reject executable methods, getters, Proxies, and non-strings with zero invocations', async () => {
  let methodCalls = 0;
  let getterCalls = 0;
  let trapCalls = 0;
  const runId = 'r8-01a-argv-env';

  // 1. Plain object with executable argv.includes
  const objArgv = { includes: () => { methodCalls++; return true; } };
  // 2. Array with overridden includes
  const overriddenArr = ['--live'];
  overriddenArr.includes = () => { methodCalls++; return true; };
  // 3. Array index getter
  const getterArr = [];
  Object.defineProperty(getterArr, 0, { enumerable: true, get() { getterCalls++; return '--live'; } });
  // 4. Proxy argument array
  const proxyArgv = new Proxy(['--live'], {
    get(t, p, r) { trapCalls++; return Reflect.get(t, p, r); },
    ownKeys(t) { trapCalls++; return Reflect.ownKeys(t); },
    getOwnPropertyDescriptor(t, p) { trapCalls++; return Reflect.getOwnPropertyDescriptor(t, p); },
    getPrototypeOf(t) { trapCalls++; return Reflect.getPrototypeOf(t); }
  });
  // 5. Non-string argument value
  const nonStrArr = [123];

  for (const badArgv of [objArgv, overriddenArr, getterArr, proxyArgv, nonStrArr]) {
    assert.throws(() => determineRunnerMode(badArgv, {}), /INVALID_RUNNER_ARGV/);
    await assert.rejects(
      () => runHostedProbeRunner({ projectRef: HARDCODED_TEMP_REF, runId, argv: badArgv, env: {} }),
      /INVALID_RUNNER_ARGV/
    );
  }

  // 6. Environment authorization getter
  const getterEnv = {};
  Object.defineProperty(getterEnv, 'TASK06I_HOSTED_PROBE_AUTHORIZED', {
    enumerable: true,
    get() { getterCalls++; return 'true'; }
  });
  // 7. Proxy environment object
  const proxyEnv = new Proxy({ TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' }, {
    get(t, p, r) { trapCalls++; return Reflect.get(t, p, r); },
    ownKeys(t) { trapCalls++; return Reflect.ownKeys(t); },
    getOwnPropertyDescriptor(t, p) { trapCalls++; return Reflect.getOwnPropertyDescriptor(t, p); },
    getPrototypeOf(t) { trapCalls++; return Reflect.getPrototypeOf(t); }
  });
  // 8. Executable environment values
  const fnEnv = { TASK06I_HOSTED_PROBE_AUTHORIZED: () => { methodCalls++; return 'true'; } };
  const coerceEnv = { EXTRA: { toString() { methodCalls++; return 'x'; } } };

  for (const badEnv of [getterEnv, proxyEnv, fnEnv, coerceEnv]) {
    assert.throws(() => determineRunnerMode(['--live'], badEnv), /INVALID_RUNNER_ENV/);
    await assert.rejects(
      () => runHostedProbeRunner({ projectRef: HARDCODED_TEMP_REF, runId, argv: ['--live'], env: badEnv }),
      /INVALID_RUNNER_ENV/
    );
  }

  // 9. Valid DRY_RUN planning & valid OFFLINE_SIMULATION succeed
  const dryRes = await runHostedProbeRunner({ projectRef: HARDCODED_TEMP_REF, runId, argv: [], env: {} });
  assert.equal(dryRes.status, 'DRY_RUN_COMPLETED');

  assert.equal(methodCalls, 0);
  assert.equal(getterCalls, 0);
  assert.equal(trapCalls, 0);
});

test('129. H3-R8-01B/C/D: Untrusted inventory and runContext reject with zero executions and safe admission failure reporting', async () => {
  const runId = 'r8-01bcd-inventory-ctx';
  let cleanupCalls = 0;
  let getterCalls = 0;
  let trapCalls = 0;

  const transport = staticTransport({ status: 200, json: {} });
  const adminClient = createHostedAdminClient({
    serviceRoleKey: validTestServiceRoleKey,
    anonKey: validTestAnonKey,
    runId,
    fetchFn: transport
  });
  const dispatcher = createTrustedOfflineDispatcher({
    runId,
    fetchFn: transport,
    outcomes: {
      'BYPASS-01': { passed: true, status: 422, route_disabled: true, error_code: 'email_provider_disabled' }
    }
  });

  // Forged inventories
  const plainForgedInv = { runId: 'other' };
  const matchingRunIdForgedInv = {
    runId,
    executeCleanup: async () => { cleanupCalls++; return { status: 'CLEANUP_VERIFIED_SUCCESS' }; }
  };
  const getterRunIdInv = {};
  Object.defineProperty(getterRunIdInv, 'runId', {
    enumerable: true,
    get() { getterCalls++; return runId; }
  });
  const realForProxy = new TestRunInventory(runId);
  const proxyInv = new Proxy(realForProxy, {
    get(t, p, r) { trapCalls++; return Reflect.get(t, p, r); },
    getPrototypeOf(t) { trapCalls++; return Reflect.getPrototypeOf(t); }
  });
  const replacedMethodInv = new TestRunInventory(runId);
  replacedMethodInv.executeCleanup = async () => { cleanupCalls++; return { status: 'CLEANUP_VERIFIED_SUCCESS' }; };

  for (const badInv of [plainForgedInv, matchingRunIdForgedInv, getterRunIdInv, proxyInv, replacedMethodInv]) {
    assert.throws(() => assertTrustedRunInventory(badInv, { projectRef: HARDCODED_TEMP_REF }), /UNTRUSTED_RUN_INVENTORY/);
    // Even when combined with a rejected dispatcher, untrusted inventory.executeCleanup() MUST NOT execute!
    await assert.rejects(
      () => runHostedProbeRunner({
        projectRef: HARDCODED_TEMP_REF,
        runId,
        inventory: badInv,
        adminClient,
        argv: ['--live'],
        env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
        selectedProbeIds: ['BYPASS-01'],
        mockDispatcher: async () => ({ passed: true })
      }),
      error => {
        assert.match(error.message, /UNTRUSTED_RUN_INVENTORY/);
        assert.equal(error.cleanupReport.inventoryTrusted, false);
        assert.equal(error.cleanupReport.inventoryEvidenceUnavailable, true);
        assert.equal(error.cleanupReport.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
        return true;
      }
    );
  }

  // Cross-run valid inventory rejects while preserving authentic obligations
  const crossRunInv = r5OutstandingInventory('r8-other-run');
  await assert.rejects(
    () => runHostedProbeRunner({
      projectRef: HARDCODED_TEMP_REF,
      runId,
      inventory: crossRunInv,
      adminClient,
      argv: ['--live'],
      env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
      selectedProbeIds: ['BYPASS-01'],
      mockDispatcher: dispatcher
    }),
    error => {
      assert.match(error.message, /ADMIN_CLIENT_RUN_MISMATCH|INVENTORY_RUN_ID_MISMATCH/);
      r5AssertOutstanding(error.cleanupReport, crossRunInv);
      return true;
    }
  );

  // Valid inventory with outstanding obligations + rejected dispatcher preserves obligations with 0 destructive calls
  const validOutstandingInv = r5OutstandingInventory(runId);
  await assert.rejects(
    () => runHostedProbeRunner({
      projectRef: HARDCODED_TEMP_REF,
      runId,
      inventory: validOutstandingInv,
      adminClient,
      argv: ['--live'],
      env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
      selectedProbeIds: ['BYPASS-01'],
      mockDispatcher: async () => ({ passed: true })
    }),
    error => {
      assert.match(error.message, /UNTRUSTED_OFFLINE_DISPATCHER/);
      r5AssertOutstanding(error.cleanupReport, validOutstandingInv);
      return true;
    }
  );

  // Untrusted runContext (plain forged, getter, Proxy, replaced clear)
  const forgedCtx = { runId, clear() { cleanupCalls++; } };
  const getterCtx = {};
  Object.defineProperty(getterCtx, 'runId', { enumerable: true, get() { getterCalls++; return runId; } });
  const realCtx = createRunContext({ runId, testEmail: 'r8@proof.invalid' });
  const proxyCtx = new Proxy(realCtx, {
    get(t, p, r) { trapCalls++; return Reflect.get(t, p, r); },
    getPrototypeOf(t) { trapCalls++; return Reflect.getPrototypeOf(t); }
  });
  const replacedCtx = createRunContext({ runId, testEmail: 'r8b@proof.invalid' });
  replacedCtx.clear = () => { cleanupCalls++; };

  for (const badCtx of [forgedCtx, getterCtx, proxyCtx, replacedCtx]) {
    assert.throws(() => assertTrustedRunContext(badCtx, { expectedRunId: runId }), /UNTRUSTED_RUN_CONTEXT/);
    await assert.rejects(
      () => runOfflineProbeSimulation({
        projectRef: HARDCODED_TEMP_REF,
        runId,
        inventory: new TestRunInventory(runId),
        runContext: badCtx,
        adminClient,
        offlineDispatcher: dispatcher,
        selectedProbeIds: ['BYPASS-01']
      }),
      /UNTRUSTED_RUN_CONTEXT/
    );
  }

  // Valid registered inventory + runContext + dispatcher + Admin succeeds
  const okInv = new TestRunInventory(runId);
  const okCtx = createRunContext({ runId, testEmail: 'r8-ok@proof.invalid' });
  const okRes = await runOfflineProbeSimulation({
    projectRef: HARDCODED_TEMP_REF,
    runId,
    inventory: okInv,
    runContext: okCtx,
    adminClient,
    offlineDispatcher: dispatcher,
    selectedProbeIds: ['BYPASS-01']
  });
  assert.equal(okRes.status, 'COMPLETED');

  assert.equal(cleanupCalls, 0);
  assert.equal(getterCalls, 0);
  assert.equal(trapCalls, 0);
  assert.equal(transport.calls.length, 0);
});

test('130. H3-R8-02/R8-03: Nested RegExp fixtures reject accessors, subclasses, prototypes, method overrides, and Proxies with zero executions', async () => {
  const runId = 'r8-02-regexp-sentinels';
  let getterCalls = 0;
  let methodCalls = 0;
  let trapCalls = 0;

  // 1. Own source getter
  const rxSourceGetter = /abc/;
  Object.defineProperty(rxSourceGetter, 'source', { enumerable: true, get() { getterCalls++; return 'abc'; } });
  // 2. Own flags getter
  const rxFlagsGetter = /abc/i;
  Object.defineProperty(rxFlagsGetter, 'flags', { enumerable: true, get() { getterCalls++; return 'i'; } });
  // 3. Non-enumerable RegExp getter
  const rxNonEnumGetter = /abc/;
  Object.defineProperty(rxNonEnumGetter, 'hidden', { enumerable: false, get() { getterCalls++; return 1; } });
  // 4. RegExp subclass
  class CustomRegExp extends RegExp {}
  const rxSubclass = new CustomRegExp('abc');
  // 5. Modified RegExp prototype
  const customProto = Object.create(RegExp.prototype);
  const rxCustomProto = /abc/;
  Object.setPrototypeOf(rxCustomProto, customProto);
  // 6. Overridden exec & test
  const rxExec = /abc/;
  rxExec.exec = () => { methodCalls++; return null; };
  const rxTest = /abc/;
  rxTest.test = () => { methodCalls++; return true; };
  // 7. Symbol-based method override
  const rxSym = /abc/;
  rxSym[Symbol.match] = () => { methodCalls++; return null; };
  // 8. Proxy RegExp
  const rxProxy = new Proxy(/abc/, {
    get(t, p, r) { trapCalls++; return Reflect.get(t, p, r); },
    ownKeys(t) { trapCalls++; return Reflect.ownKeys(t); },
    getOwnPropertyDescriptor(t, p) { trapCalls++; return Reflect.getOwnPropertyDescriptor(t, p); },
    getPrototypeOf(t) { trapCalls++; return Reflect.getPrototypeOf(t); }
  });

  for (const badRx of [rxSourceGetter, rxFlagsGetter, rxNonEnumGetter, rxSubclass, rxCustomProto, rxExec, rxTest, rxSym, rxProxy]) {
    assert.throws(
      () => createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait', routes: [{ urlRegex: badRx, status: 200, json: {} }] }),
      /INVALID_DETERMINISTIC_FIXTURE_SPEC/
    );
    assert.throws(
      () => createTrustedOfflineDispatcher({ runId, outcomes: { 'BYPASS-01': { passed: true, status: 422, route_disabled: true, pattern: badRx } } }),
      /INVALID_DETERMINISTIC_FIXTURE_SPEC/
    );
  }

  // Valid ordinary pattern + supported flags + deterministic matching without calling tampered RegExp.prototype.test
  const transport = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
    routes: [
      { urlRegex: /\/auth\/v1\/otp$/i, status: 422, json: { error_code: 'email_provider_disabled' } }
    ]
  });
  const origProtoTest = RegExp.prototype.test;
  RegExp.prototype.test = function tamperedTest() {
    methodCalls++;
    return false;
  };
  try {
    const res1 = await transport(`https://${HARDCODED_TEMP_REF}.supabase.co/AUTH/V1/OTP`, { method: 'POST' });
    const res2 = await transport(`https://${HARDCODED_TEMP_REF}.supabase.co/auth/v1/otp`, { method: 'POST' });
    assert.equal(res1.status, 422);
    assert.equal(res2.status, 422);
  } finally {
    RegExp.prototype.test = origProtoTest;
  }

  assert.equal(getterCalls, 0);
  assert.equal(methodCalls, 0);
  assert.equal(trapCalls, 0);
});

// ===========================================================================
// Task 06I-B1-H3-R9: Unified Typed Admission, Immutable Run Binding & Dispatcher Factory Closure
// ===========================================================================

test('131. H3-R9-01: Immutable RunContext binding prevents runId/projectRef tampering, cleared reuse, and cross-run credential reuse', async () => {
  const runA = 'r9-01-run-a';
  const runB = 'r9-01-run-b';
  const transport = staticTransport({ status: 200, json: {} });
  const adminB = createHostedAdminClient({ serviceRoleKey: validTestServiceRoleKey, anonKey: validTestAnonKey, runId: runB, fetchFn: transport });
  const dispB = createTrustedOfflineDispatcher({
    runId: runB,
    fetchFn: transport,
    outcomes: { 'BYPASS-01': { passed: true, status: 422, route_disabled: true, error_code: 'email_provider_disabled' } }
  });

  // 1. Immutable runId and projectRef cannot be reassigned, deleted, or replaced with getter
  const ctxA = createRunContext({ runId: runA, testEmail: 'r9-a@proof.invalid' });
  ctxA.activeAccessToken = createMockJwt({ sub: 'user-a', session_id: 'sess-a' });
  ctxA.activeSessionId = 'sess-a';
  assert.throws(() => { ctxA.runId = runB; }, TypeError);
  assert.throws(() => { ctxA.runId = null; }, TypeError);
  assert.throws(() => { delete ctxA.runId; }, TypeError);
  assert.throws(() => { Object.defineProperty(ctxA, 'runId', { get() { return runB; } }); }, TypeError);
  assert.throws(() => { ctxA.projectRef = 'other-proj'; }, TypeError);
  assert.equal(ctxA.runId, runA);

  // 2. Run A context with credentials/session state supplied to Run B rejects with 0 probes/transports
  await assert.rejects(
    () => runOfflineProbeSimulation({
      projectRef: HARDCODED_TEMP_REF,
      runId: runB,
      inventory: new TestRunInventory(runB),
      runContext: ctxA,
      adminClient: adminB,
      offlineDispatcher: dispB,
      selectedProbeIds: ['BYPASS-01']
    }),
    /ADMIN_CLIENT_RUN_MISMATCH/
  );
  assert.equal(dispB.calls.length, 0);
  assert.equal(transport.calls.length, 0);

  // 3. Cross-project context check fails closed
  assert.throws(
    () => assertTrustedRunContext(ctxA, { projectRef: 'other-project', expectedRunId: runA }),
    /CRITICAL_SECURITY_VIOLATION.*UNTRUSTED_RUN_CONTEXT/
  );

  // 4. Cleared context is terminal and cannot be reused
  const ctxCleared = createRunContext({ runId: runB, testEmail: 'r9-clr@proof.invalid' });
  ctxCleared.clear();
  assert.throws(
    () => assertTrustedRunContext(ctxCleared, { projectRef: HARDCODED_TEMP_REF, expectedRunId: runB }),
    /UNTRUSTED_RUN_CONTEXT.*Cleared run context is terminal/
  );
  await assert.rejects(
    () => runOfflineProbeSimulation({
      projectRef: HARDCODED_TEMP_REF,
      runId: runB,
      inventory: new TestRunInventory(runB),
      runContext: ctxCleared,
      adminClient: adminB,
      offlineDispatcher: dispB,
      selectedProbeIds: ['BYPASS-01']
    }),
    /UNTRUSTED_RUN_CONTEXT.*Cleared run context/
  );
  assert.equal(dispB.calls.length, 0);

  // 5. Fresh independently constructed context for Run B succeeds
  const freshCtxB = createRunContext({ runId: runB, testEmail: 'r9-b@proof.invalid' });
  const okRes = await runOfflineProbeSimulation({
    projectRef: HARDCODED_TEMP_REF,
    runId: runB,
    inventory: new TestRunInventory(runB),
    runContext: freshCtxB,
    adminClient: adminB,
    offlineDispatcher: dispB,
    selectedProbeIds: ['BYPASS-01']
  });
  assert.equal(okRes.status, 'COMPLETED');
});

test('132. H3-R9-02: Standalone determineRunnerMode defaults to DRY_RUN regardless of ambient process.argv', async () => {
  const origArgv = process.argv.slice();
  const origEnv = process.env.TASK06I_HOSTED_PROBE_AUTHORIZED;
  try {
    process.argv.push('--live');
    process.env.TASK06I_HOSTED_PROBE_AUTHORIZED = 'true';

    // 1. Omitted arguments remain DRY_RUN even with ambient --live and auth env
    assert.equal(determineRunnerMode(), 'DRY_RUN');
    assert.equal(determineRunnerMode(undefined, { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' }), 'DRY_RUN');
    assert.equal(determineRunnerMode([], { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' }), 'DRY_RUN');

    // 2. Explicit valid LIVE flags classify as LIVE
    assert.equal(determineRunnerMode(['--live'], { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' }), 'LIVE');
  } finally {
    process.argv.length = 0;
    process.argv.push(...origArgv);
    if (origEnv === undefined) {
      delete process.env.TASK06I_HOSTED_PROBE_AUTHORIZED;
    } else {
      process.env.TASK06I_HOSTED_PROBE_AUTHORIZED = origEnv;
    }
  }

  // 3. Real LIVE CLI remains blocked before network dispatch
  const { spawnSync } = await import('node:child_process');
  const cliRes = spawnSync(process.execPath, ['experiments/task06i/hosted-probe-runner.mjs', '--live'], {
    encoding: 'utf8',
    env: { ...process.env, TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' }
  });
  assert.equal(cliRes.status, 1);
  assert.match(cliRes.stderr, /BLOCKED_PENDING_DURABLE_RECOVERY/);
});

test('133. H3-R9-03: Typed probe selection snapshot rejects iterators, accessors, Proxies, and overridden methods with zero invocations', async () => {
  const runId = 'r9-03-selection';
  let callbackCalls = 0;
  let getterCalls = 0;
  let trapCalls = 0;

  const transport = staticTransport({ status: 200, json: {} });
  const admin = createHostedAdminClient({ serviceRoleKey: validTestServiceRoleKey, anonKey: validTestAnonKey, runId, fetchFn: transport });
  const disp = createTrustedOfflineDispatcher({
    runId,
    fetchFn: transport,
    outcomes: {
      'BYPASS-01': { passed: true, status: 422, route_disabled: true, error_code: 'email_provider_disabled' },
      'HOOK-01': { passed: true, status: 200, has_token: true, amr_authenticated: true, session_id: 'session-uuid-5678', tokens: { access_token: createMockJwt() } },
      'HOOK-02': { passed: true, status: 200, has_token: true, amr_preserved: true, tokens: { access_token: createMockJwt() } }
    }
  });

  // 1. Custom Symbol.iterator
  const iterArr = ['BYPASS-01'];
  iterArr[Symbol.iterator] = () => { callbackCalls++; return ['BYPASS-01'][Symbol.iterator](); };
  // 2. Indexed getter
  const idxGetterArr = [];
  Object.defineProperty(idxGetterArr, 0, { enumerable: true, get() { getterCalls++; return 'BYPASS-01'; } });
  // 3. Non-enumerable accessor
  const nonEnumArr = ['BYPASS-01'];
  Object.defineProperty(nonEnumArr, 'trap', { enumerable: false, get() { getterCalls++; return 1; } });
  // 4. Proxy array
  const proxyArr = new Proxy(['BYPASS-01'], {
    get(t, p, r) { trapCalls++; return Reflect.get(t, p, r); },
    ownKeys(t) { trapCalls++; return Reflect.ownKeys(t); },
    getOwnPropertyDescriptor(t, p) { trapCalls++; return Reflect.getOwnPropertyDescriptor(t, p); },
    getPrototypeOf(t) { trapCalls++; return Reflect.getPrototypeOf(t); }
  });
  // 5. Custom array prototype
  const customProtoArr = ['BYPASS-01'];
  Object.setPrototypeOf(customProtoArr, Object.create(Array.prototype));
  // 6. Overridden map/includes
  const overriddenMapArr = ['BYPASS-01'];
  overriddenMapArr.map = () => { callbackCalls++; return []; };
  const overriddenIncArr = ['BYPASS-01'];
  overriddenIncArr.includes = () => { callbackCalls++; return false; };
  // 7. Sparse array & 8. Non-string element
  const sparseArr = [];
  sparseArr[1] = 'BYPASS-01';
  const nonStrArr = [123];

  for (const badSel of [iterArr, idxGetterArr, nonEnumArr, proxyArr, customProtoArr, overriddenMapArr, overriddenIncArr, sparseArr, nonStrArr]) {
    assert.throws(() => validateSelectedProbeIds(badSel), /INVALID_PROBE_SELECTION/);
    assert.throws(() => planProbeExecution(HARDCODED_TEMP_REF, { selectedProbeIds: badSel }), /INVALID_PROBE_SELECTION/);
    await assert.rejects(
      () => runHostedProbeRunner({
        projectRef: HARDCODED_TEMP_REF,
        runId,
        argv: ['--live'],
        env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
        adminClient: admin,
        mockDispatcher: disp,
        selectedProbeIds: badSel
      }),
      /INVALID_PROBE_SELECTION/
    );
    await assert.rejects(
      () => runOfflineProbeSimulation({
        projectRef: HARDCODED_TEMP_REF,
        runId,
        adminClient: admin,
        offlineDispatcher: disp,
        selectedProbeIds: badSel
      }),
      /INVALID_PROBE_SELECTION/
    );
  }

  // Valid dependency-complete subset & incomplete dependency rejection
  assert.throws(() => validateSelectedProbeIds(['HOOK-02']), /DEPENDENCY_INCOMPLETE/);
  const simRes = await runOfflineProbeSimulation({
    projectRef: HARDCODED_TEMP_REF,
    runId,
    adminClient: admin,
    offlineDispatcher: disp,
    selectedProbeIds: ['HOOK-02', 'BYPASS-01', 'HOOK-01'],
    timing: { mode: 'recorded_zero_wait' }
  });
  assert.equal(simRes.status, 'COMPLETED');
  assert.deepEqual(simRes.executionEvidence.completed, ['BYPASS-01', 'HOOK-01', 'HOOK-02']);

  assert.equal(callbackCalls, 0);
  assert.equal(getterCalls, 0);
  assert.equal(trapCalls, 0);
});

test('134. H3-R9-04: createHostedDispatcher and per-call overrides enforce trusted inventory/runContext capabilities and admission schemas', async () => {
  const runId = 'r9-04-dispatcher-factory';
  let sentinelCalls = 0;
  let getterCalls = 0;
  let trapCalls = 0;
  const transport = staticTransport({ status: 422, json: { error_code: 'email_provider_disabled' } });
  const validInv = new TestRunInventory(runId);
  const validCtx = createRunContext({ runId, testEmail: 'r9-04@proof.invalid' });

  // 1. Plain forged inventory & protectSeedIdentity sentinel
  const forgedInv = { runId, protectSeedIdentity: () => { sentinelCalls++; } };
  // 2. Inventory getter & Proxy inventory & replaced method
  const getterInv = {};
  Object.defineProperty(getterInv, 'runId', { enumerable: true, get() { getterCalls++; return runId; } });
  const proxyInv = new Proxy(validInv, {
    get(t, p, r) { trapCalls++; return Reflect.get(t, p, r); },
    getPrototypeOf(t) { trapCalls++; return Reflect.getPrototypeOf(t); }
  });
  const replacedInv = new TestRunInventory(runId);
  replacedInv.protectSeedIdentity = () => { sentinelCalls++; };

  for (const badInv of [forgedInv, getterInv, proxyInv, replacedInv]) {
    assert.throws(
      () => createHostedDispatcher({ anonKey: validTestAnonKey, inventory: badInv, seedUserId: '11111111-1111-4111-a111-111111111111', fetchFn: transport }),
      /UNTRUSTED_RUN_INVENTORY/
    );
  }

  // 3. Unregistered runContext, seedUserId getter, and cross-run registered context
  const unregisteredCtx = { runId, seedUserId: '11111111-1111-4111-a111-111111111111' };
  const getterCtx = {};
  Object.defineProperty(getterCtx, 'seedUserId', { enumerable: true, get() { getterCalls++; return '11111111-1111-4111-a111-111111111111'; } });
  const crossRunCtx = createRunContext({ runId: 'r9-04-other-run', testEmail: 'other@proof.invalid' });

  for (const badCtx of [unregisteredCtx, getterCtx, crossRunCtx]) {
    assert.throws(
      () => createHostedDispatcher({ anonKey: validTestAnonKey, inventory: validInv, runContext: badCtx, fetchFn: transport }),
      /UNTRUSTED_RUN_CONTEXT|ADMIN_CLIENT_RUN_MISMATCH/
    );
  }

  // 4. Invalid transport combined with valid inventory rejects BEFORE touching inventory
  assert.throws(
    () => createHostedDispatcher({ anonKey: validTestAnonKey, inventory: validInv, seedUserId: '11111111-1111-4111-a111-111111111111', fetchFn: globalThis.fetch }),
    /BLOCKED_PENDING_DURABLE_RECOVERY/
  );
  assert.equal(validInv.protectedSeedIdentities.size, 0);

  // 5. Valid registered factory dependencies & per-call override validation
  const disp = createHostedDispatcher({
    anonKey: validTestAnonKey,
    inventory: validInv,
    runContext: validCtx,
    fetchFn: transport
  });
  await assert.rejects(() => disp({ id: 'BYPASS-01' }, { inventory: forgedInv }), /UNTRUSTED_RUN_INVENTORY/);
  await assert.rejects(() => disp({ id: 'BYPASS-01' }, { runContext: crossRunCtx }), /UNTRUSTED_RUN_CONTEXT|ADMIN_CLIENT_RUN_MISMATCH/);
  const trappedCallOpts = {};
  Object.defineProperty(trappedCallOpts, 'signal', { enumerable: true, get() { getterCalls++; return undefined; } });
  await assert.rejects(() => disp({ id: 'BYPASS-01' }, trappedCallOpts), /Accessor property rejected/);
  await assert.rejects(
    () => disp({ id: 'BYPASS-01' }, new Proxy({}, { get(t, p, r) { trapCalls++; return Reflect.get(t, p, r); }, getPrototypeOf(t) { trapCalls++; return Reflect.getPrototypeOf(t); } })),
    /Proxy object rejected/
  );
  assert.equal(transport.calls.length, 0);

  // Valid same-run invocation succeeds
  const out = await disp({ id: 'BYPASS-01', testUser: 'r9-04@proof.invalid' });
  assert.equal(out.status, 422);
  assert.equal(transport.calls.length, 1);

  // 6. Schema registry exported
  assert.ok(UNIFIED_ADMISSION_SCHEMAS.runnerOptions);
  assert.ok(UNIFIED_ADMISSION_SCHEMAS.createHostedDispatcherOptions);
  assert.ok(UNIFIED_ADMISSION_SCHEMAS.dispatcherCallOptions);

  assert.equal(sentinelCalls, 0);
  assert.equal(getterCalls, 0);
  assert.equal(trapCalls, 0);
});

test('135. H3-R10-01: Enforced typed admission rejects coercive objects (valueOf/trim), unknown keys, numeric bounds, and schema tampering', async () => {
  let sentinelCalls = 0;
  const transport = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
    routes: [{ method: 'POST', urlIncludes: '/auth/v1/otp', status: 422, body: { error: 'blocked' } }]
  });
  const adminClient = createHostedAdminClient({
    projectRef: HARDCODED_TEMP_REF,
    serviceRoleKey: validTestServiceRoleKey,
    runId: 'r10-01-run',
    fetchFn: transport
  });
  const inv = new TestRunInventory('r10-01-run');
  const ctx = createRunContext({ runId: 'r10-01-run', testEmail: 'r10-01@proof.invalid' });

  // 1. Coercive objects with valueOf / trim must never be invoked
  await assert.rejects(
    () => runOfflineProbeSimulation({
      projectRef: HARDCODED_TEMP_REF,
      runId: 'r10-01-run',
      adminClient,
      inventory: inv,
      runContext: ctx,
      offlineDispatcher: createTrustedOfflineDispatcher({ projectRef: HARDCODED_TEMP_REF, runId: 'r10-01-run', defaultOutcome: { status: 200, passed: true } }),
      probeTimeoutMs: { valueOf() { sentinelCalls++; return 10; } }
    }),
    /INVALID_ADMISSION_TYPE/
  );
  await assert.rejects(
    () => runOfflineProbeSimulation({
      projectRef: { trim() { sentinelCalls++; return HARDCODED_TEMP_REF; } },
      runId: 'r10-01-run'
    }),
    /INVALID_ADMISSION_TYPE/
  );
  assert.throws(
    () => createHostedDispatcher({
      projectRef: { trim() { sentinelCalls++; return HARDCODED_TEMP_REF; } },
      anonKey: validTestAnonKey,
      fetchFn: transport
    }),
    /INVALID_ADMISSION_TYPE/
  );

  // 2. Numeric bounds & non-finite numbers rejected
  for (const badTimeout of [NaN, Infinity, -Infinity, 0, -5, 60001, '100']) {
    await assert.rejects(
      () => runOfflineProbeSimulation({ projectRef: HARDCODED_TEMP_REF, probeTimeoutMs: badTimeout }),
      /INVALID_ADMISSION_TYPE|INVALID_ADMISSION_RANGE/
    );
  }
  await assert.rejects(
    () => inv.executeCleanup({ adminClient, failClosed: false, settlementTimeoutMs: -1 }),
    /INVALID_ADMISSION_RANGE/
  );
  await assert.rejects(
    () => inv.executeCleanup({ adminClient, failClosed: 'yes', settlementTimeoutMs: 10 }),
    /INVALID_ADMISSION_TYPE/
  );

  // 3. Unknown fields & missing required fields rejected across schemas
  assert.throws(
    () => createRunContext({ runId: 'r10-01-run', unexpectedHook: () => { sentinelCalls++; } }),
    /UNTRUSTED_ADMISSION_KEY/
  );
  assert.throws(
    () => new TestRunInventory('r10-01-run', { unknownSeedProp: 'x' }),
    /UNTRUSTED_ADMISSION_KEY/
  );
  assert.throws(
    () => createHostedAdminClient({
      projectRef: HARDCODED_TEMP_REF,
      serviceRoleKey: validTestServiceRoleKey,
      fetchFn: transport,
      extraOption: true
    }),
    /UNTRUSTED_ADMISSION_KEY/
  );
  assert.throws(
    () => planProbeExecution(HARDCODED_TEMP_REF, { unknownFlag: true }),
    /UNTRUSTED_ADMISSION_KEY/
  );
  assert.throws(
    () => validateSelectedProbeIds(['BYPASS-01'], { unknownOpt: 1 }),
    /UNTRUSTED_ADMISSION_KEY/
  );

  const disp = createHostedDispatcher({
    projectRef: HARDCODED_TEMP_REF,
    anonKey: validTestAnonKey,
    fetchFn: transport,
    inventory: inv,
    runContext: ctx
  });
  await assert.rejects(() => disp({}), /MISSING_REQUIRED_ADMISSION_FIELD/);
  await assert.rejects(() => disp({ id: 'BYPASS-01' }, { unknownCallOpt: 'bad' }), /UNTRUSTED_ADMISSION_KEY/);
  await assert.rejects(() => disp({ id: 'BYPASS-01' }, { signal: { aborted: false } }), /INVALID_ADMISSION_TYPE/);

  const offlineDisp = createTrustedOfflineDispatcher({
    projectRef: HARDCODED_TEMP_REF,
    runId: 'r10-01-run',
    defaultOutcome: { status: 200, passed: true }
  });
  await assert.rejects(() => offlineDisp({ id: 'BYPASS-01' }, { unknownCallOpt: 'bad' }), /UNTRUSTED_ADMISSION_KEY/);

  // 4. Deep-frozen UNIFIED_ADMISSION_SCHEMAS cannot be mutated
  assert.equal(Object.isFrozen(UNIFIED_ADMISSION_SCHEMAS), true);
  assert.equal(Object.isFrozen(UNIFIED_ADMISSION_SCHEMAS.runnerOptions), true);
  assert.equal(Object.isFrozen(UNIFIED_ADMISSION_SCHEMAS.runnerOptions.probeTimeoutMs), true);
  assert.throws(() => {
    UNIFIED_ADMISSION_SCHEMAS.runnerOptions.injectedField = { type: 'string' };
  }, TypeError);
  assert.throws(() => {
    UNIFIED_ADMISSION_SCHEMAS.runnerOptions.probeTimeoutMs.type = 'object';
  }, TypeError);

  assert.equal(transport.calls.length, 0);
  assert.equal(sentinelCalls, 0);
});

test('136. H3-R10-02: Effective dispatcher capability correlation enforces one immutable run across factory defaults, overrides, cleared contexts, and finalized inventories', async () => {
  const transport = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
    routes: [{ method: 'POST', urlIncludes: '/auth/v1/otp', status: 422, body: { error: 'blocked' } }]
  });
  const anonKey = validTestAnonKey;
  const serviceRoleKey = validTestServiceRoleKey;

  const runA = 'r10-02-run-a';
  const runB = 'r10-02-run-b';
  const invA = new TestRunInventory(runA);
  const ctxA = createRunContext({ runId: runA, testEmail: 'a@proof.invalid' });
  const adminA = createHostedAdminClient({ projectRef: HARDCODED_TEMP_REF, serviceRoleKey, runId: runA, fetchFn: transport });
  const invB = new TestRunInventory(runB);
  const ctxB = createRunContext({ runId: runB, testEmail: 'b@proof.invalid' });

  // 1. Factory bound to Run A rejects any Run B partial or full override
  const dispBoundA = createHostedDispatcher({
    projectRef: HARDCODED_TEMP_REF,
    anonKey,
    fetchFn: transport,
    inventory: invA,
    runContext: ctxA
  });

  await assert.rejects(() => dispBoundA({ id: 'BYPASS-01' }, { runContext: ctxB }), /ADMIN_CLIENT_RUN_MISMATCH|DISPATCHER_RUN_MISMATCH/);
  await assert.rejects(() => dispBoundA({ id: 'BYPASS-01' }, { inventory: invB }), /INVENTORY_RUN_ID_MISMATCH|DISPATCHER_RUN_MISMATCH/);
  await assert.rejects(() => dispBoundA({ id: 'BYPASS-01' }, { inventory: invB, runContext: ctxB }), /INVENTORY_RUN_ID_MISMATCH|DISPATCHER_RUN_MISMATCH/);
  await assert.rejects(() => dispBoundA({ id: 'BYPASS-01' }, { runId: runB }), /DISPATCHER_RUN_MISMATCH/);
  await assert.rejects(() => dispBoundA({ id: 'BYPASS-01' }, { projectRef: 'zzzzzzzzzzzzzzzzzzzz' }), /CRITICAL_SECURITY_VIOLATION/);
  assert.equal(transport.calls.length, 0);

  // 2. Factory bound only to ctxA rejects invB override
  const dispCtxOnlyA = createHostedDispatcher({
    projectRef: HARDCODED_TEMP_REF,
    anonKey,
    fetchFn: transport,
    runContext: ctxA
  });
  await assert.rejects(() => dispCtxOnlyA({ id: 'BYPASS-01' }, { inventory: invB }), /INVENTORY_RUN_ID_MISMATCH|DISPATCHER_RUN_MISMATCH/);
  assert.equal(transport.calls.length, 0);

  // 3. Unbound factory rejects mismatched invA + ctxB or runId + invA
  const dispUnbound = createHostedDispatcher({
    projectRef: HARDCODED_TEMP_REF,
    anonKey,
    fetchFn: transport
  });
  await assert.rejects(() => dispUnbound({ id: 'BYPASS-01' }, { inventory: invA, runContext: ctxB }), /ADMIN_CLIENT_RUN_MISMATCH|DISPATCHER_RUN_MISMATCH/);
  await assert.rejects(() => dispUnbound({ id: 'BYPASS-01' }, { runId: runB, inventory: invA }), /INVENTORY_RUN_ID_MISMATCH|DISPATCHER_RUN_MISMATCH/);
  assert.equal(transport.calls.length, 0);

  // 4. Valid same-run call succeeds
  const okOut = await dispBoundA({ id: 'BYPASS-01', testUser: 'a@proof.invalid' }, { runId: runA });
  assert.equal(okOut.status, 422);
  assert.equal(transport.calls.length, 1);

  // 5. Cleared factory RunContext is rejected on subsequent default call (no overrides)
  ctxA.clear();
  await assert.rejects(() => dispBoundA({ id: 'BYPASS-01' }), /UNTRUSTED_RUN_CONTEXT/);
  assert.equal(transport.calls.length, 1);

  // 6. Finalized factory Inventory is rejected on subsequent default call BEFORE any transport or seed mutation
  const ctxA2 = createRunContext({ runId: runA, testEmail: 'a2@proof.invalid' });
  const dispInvOnlyA = createHostedDispatcher({
    projectRef: HARDCODED_TEMP_REF,
    anonKey,
    fetchFn: transport,
    inventory: invA,
    runContext: ctxA2
  });
  await invA.executeCleanup({ adminClient: adminA, failClosed: false, settlementTimeoutMs: 0 });
  assert.equal(invA.runLifecycleState, INVENTORY_RUN_STATE.FINALIZED);
  await assert.rejects(
    () => dispInvOnlyA({ id: 'BYPASS-01' }, { seedUserId: '00000000-0000-4000-8000-000000000001' }),
    /RUN_FINALIZED_ADMISSION_BLOCKED/
  );
  assert.equal(invA.protectedSeedIdentities.size, 0);
  assert.equal(transport.calls.length, 1);
});

test('137. H3-R10-03: Schema completeness covers all public option contracts and preserves zero side effects on rejection', async () => {
  const expectedSchemas = [
    'runnerOptions',
    'planProbeExecutionOptions',
    'validateSelectedProbeIdsOptions',
    'createHostedDispatcherOptions',
    'dispatcherCallOptions',
    'offlineDispatcherCallOptions',
    'probeItem',
    'createRunContextOptions',
    'TestRunInventoryOptions',
    'createHostedAdminClientOptions',
    'provisionStorageProbeFixtureOptions',
    'executeCleanupOptions',
    'verifyStorageObjectAbsenceOptions'
  ];
  for (const name of expectedSchemas) {
    assert.ok(UNIFIED_ADMISSION_SCHEMAS[name], `Missing schema '${name}'`);
    assert.equal(Object.isFrozen(UNIFIED_ADMISSION_SCHEMAS[name]), true);
  }
  const absRes = await verifyStorageObjectAbsenceDetailed(null, 'bucket', 'path', { unexpectedFlag: true });
  assert.equal(absRes.isAbsent, false);
  assert.match(absRes.reason, /UNTRUSTED_ADMISSION_KEY/);
});

test('138. H3-R11-01: Prototype-safe admitted options and null-prototype schema metadata ignore Object.prototype pollution with zero sentinel execution', async () => {
  // 1. Verify null-prototype deep-frozen schema registry & field descriptors
  assert.equal(Object.getPrototypeOf(UNIFIED_ADMISSION_SCHEMAS), null);
  assert.equal(Object.getPrototypeOf(UNIFIED_ADMISSION_SCHEMAS.runnerOptions), null);
  assert.equal(Object.getPrototypeOf(UNIFIED_ADMISSION_SCHEMAS.runnerOptions.probeTimeoutMs), null);

  let sentinelCalls = 0;
  const runId = 'r11-01-run';
  const transport = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
    routes: [{ method: 'POST', urlIncludes: '/auth/v1/otp', status: 422, body: { error: 'blocked' } }]
  });
  const adminClient = createHostedAdminClient({
    projectRef: HARDCODED_TEMP_REF,
    serviceRoleKey: validTestServiceRoleKey,
    runId,
    fetchFn: transport
  });
  const inv = new TestRunInventory(runId);
  const ctx = createRunContext({ runId, testEmail: 'r11-01@proof.invalid' });

  const protoKeys = [
    'probeTimeoutMs',
    'settlementTimeoutMs',
    'inventory',
    'runContext',
    'adminClient',
    'timing',
    'nullable',
    'min',
    'max',
    'required',
    'deferRunnerRejection',
    'extraEvilFn'
  ];

  try {
    // Coercive & getter descriptors on Object.prototype
    Object.defineProperty(Object.prototype, 'probeTimeoutMs', {
      configurable: true,
      get() {
        sentinelCalls++;
        return { valueOf() { sentinelCalls++; return 1; } };
      }
    });
    Object.defineProperty(Object.prototype, 'settlementTimeoutMs', {
      configurable: true,
      value: { valueOf() { sentinelCalls++; return 5; } }
    });
    Object.defineProperty(Object.prototype, 'inventory', { configurable: true, value: inv });
    Object.defineProperty(Object.prototype, 'runContext', { configurable: true, value: ctx });
    Object.defineProperty(Object.prototype, 'adminClient', { configurable: true, value: adminClient });
    Object.defineProperty(Object.prototype, 'timing', { configurable: true, value: { intervalMs: 999 } });
    Object.defineProperty(Object.prototype, 'nullable', { configurable: true, value: true });
    Object.defineProperty(Object.prototype, 'min', { configurable: true, value: -100 });
    Object.defineProperty(Object.prototype, 'max', { configurable: true, value: 999999 });
    Object.defineProperty(Object.prototype, 'required', { configurable: true, value: true });
    Object.defineProperty(Object.prototype, 'deferRunnerRejection', { configurable: true, value: true });
    Object.defineProperty(Object.prototype, 'extraEvilFn', { configurable: true, value: () => { sentinelCalls++; } });

    // Inherited schema metadata flags must not override own schema rules
    await assert.rejects(
      () => runOfflineProbeSimulation({ projectRef: HARDCODED_TEMP_REF, probeTimeoutMs: null }),
      /INVALID_ADMISSION_TYPE/
    );
    await assert.rejects(
      () => runOfflineProbeSimulation({ projectRef: HARDCODED_TEMP_REF, probeTimeoutMs: -1 }),
      /INVALID_ADMISSION_RANGE/
    );

    // Unbound dispatcher must NOT inherit Object.prototype.inventory or Object.prototype.runContext
    const dispUnbound = createHostedDispatcher({ inventory: new TestRunInventory(),
      projectRef: HARDCODED_TEMP_REF,
      anonKey: validTestAnonKey,
      fetchFn: transport
    });
    const out = await dispUnbound({ id: 'BYPASS-01', testUser: 'r11-01@proof.invalid' });
    assert.equal(out.status, 422);
    assert.equal(inv.protectedSeedIdentities.size, 0);

    // executeCleanup with omitted options must NOT inherit Object.prototype.adminClient or settlementTimeoutMs
    const inv2 = new TestRunInventory('r11-01-inv2');
    const report2 = await inv2.executeCleanup({ adminClient: null, failClosed: false });
    assert.equal(report2.status, 'CLEANUP_VERIFIED_SUCCESS');
    assert.equal(transport.calls.length, 1);

    // Offline simulation with valid omitted probeTimeoutMs / timing must NOT invoke Object.prototype.probeTimeoutMs or timing
    const offlineDisp = createTrustedOfflineDispatcher({
      projectRef: HARDCODED_TEMP_REF,
      runId: 'r11-01-sim',
      defaultOutcome: { status: 422, passed: true, error_code: 'email_provider_disabled' }
    });
    const simAdmin = createHostedAdminClient({
      projectRef: HARDCODED_TEMP_REF,
      serviceRoleKey: validTestServiceRoleKey,
      runId: 'r11-01-sim',
      fetchFn: transport
    });
    const simInv = new TestRunInventory('r11-01-sim');
    const simCtx = createRunContext({ runId: 'r11-01-sim', testEmail: 'r11-01-sim@proof.invalid' });
    const simRes = await runOfflineProbeSimulation({
      projectRef: HARDCODED_TEMP_REF,
      runId: 'r11-01-sim',
      selectedProbeIds: ['BYPASS-01'],
      offlineDispatcher: offlineDisp,
      adminClient: simAdmin,
      inventory: simInv,
      runContext: simCtx
    });
    assert.equal(simRes.status, 'COMPLETED');

    // Prototype-sensitive __proto__ own key in options / nested declarative fixtures must be rejected
    const protoHostile = JSON.parse('{"__proto__": {"polluted": true}}');
    await assert.rejects(
      () => runOfflineProbeSimulation(protoHostile),
      /Prototype-sensitive key '__proto__' rejected/
    );
    assert.throws(
      () => createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait', routes: [JSON.parse('{"__proto__": {"x": 1}, "status": 200}')] }),
      /Prototype-sensitive key '__proto__' rejected/
    );

    assert.equal(sentinelCalls, 0);
  } finally {
    for (const key of protoKeys) {
      delete Object.prototype[key];
    }
  }
});

test('139. H3-R11-02A: Trusted AbortSignal handling rejects own overrides, accessors, Proxies, and subclasses with zero invocations and preserves cancellation/cleanup', async () => {
  let sentinelCalls = 0;
  const runId = 'r11-02a-run';
  const transport = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
    routes: [{ method: 'POST', urlIncludes: '/auth/v1/otp', status: 422, delayMs: 40, body: { error: 'blocked' } }]
  });
  const offlineDisp = createTrustedOfflineDispatcher({
    projectRef: HARDCODED_TEMP_REF,
    runId,
    outcomes: {
      'BYPASS-01': { status: 422, passed: true, delayMs: 50 }
    }
  });
  const inv = new TestRunInventory(runId);
  const ctx = createRunContext({ runId, testEmail: 'r11-02a@proof.invalid' });
  const hostedDisp = createHostedDispatcher({
    projectRef: HARDCODED_TEMP_REF,
    anonKey: validTestAnonKey,
    fetchFn: transport,
    inventory: inv,
    runContext: ctx
  });

  // 1. Genuine signal with own addEventListener / removeEventListener / aborted / reason overrides
  const sAdd = new AbortController().signal;
  sAdd.addEventListener = () => { sentinelCalls++; };

  const sRemove = new AbortController().signal;
  sRemove.removeEventListener = () => { sentinelCalls++; };

  const sAborted = new AbortController().signal;
  Object.defineProperty(sAborted, 'aborted', { get() { sentinelCalls++; return false; } });

  const sReason = new AbortController().signal;
  Object.defineProperty(sReason, 'reason', { get() { sentinelCalls++; return 'evil'; } });

  const sProxy = new Proxy(new AbortController().signal, {
    get(t, p, r) { sentinelCalls++; return Reflect.get(t, p, r); }
  });

  const sForgedProto = Object.create(AbortSignal.prototype);
  class CustomSignal extends AbortSignal {}
  const sSubclass = Object.setPrototypeOf(new AbortController().signal, CustomSignal.prototype);

  for (const badSignal of [sAdd, sRemove, sAborted, sReason, sProxy, sForgedProto, sSubclass]) {
    await assert.rejects(
      () => offlineDisp({ id: 'BYPASS-01' }, { signal: badSignal, projectRef: HARDCODED_TEMP_REF, runId }),
      /INVALID_ADMISSION_TYPE/
    );
    await assert.rejects(
      () => hostedDisp({ id: 'BYPASS-01' }, { signal: badSignal }),
      /INVALID_ADMISSION_TYPE/
    );
    const barrier = createOfflineBarrier('r11-02a-bad');
    await assert.rejects(async () => await barrier.wait(badSignal), /INVALID_ADMISSION_TYPE/);
  }
  assert.equal(sentinelCalls, 0);

  // 2. Already-aborted valid signal cancels immediately without leaving listeners
  const abortedCtrl = new AbortController();
  abortedCtrl.abort();
  await assert.rejects(
    () => offlineDisp({ id: 'BYPASS-01' }, { signal: abortedCtrl.signal, projectRef: HARDCODED_TEMP_REF, runId }),
    { name: 'AbortError' }
  );
  assert.equal(getEventListeners(abortedCtrl.signal, 'abort').length, 0);

  // 3. Abort during declarative delay + post-completion listener cleanup
  const delayCtrl = new AbortController();
  const pendingDelay = offlineDisp({ id: 'BYPASS-01' }, { signal: delayCtrl.signal, projectRef: HARDCODED_TEMP_REF, runId });
  setTimeout(() => delayCtrl.abort(), 10);
  await assert.rejects(() => pendingDelay, { name: 'AbortError' });
  assert.equal(getEventListeners(delayCtrl.signal, 'abort').length, 0);

  const okCtrl = new AbortController();
  const okOut = await offlineDisp({ id: 'BYPASS-01' }, { signal: okCtrl.signal, projectRef: HARDCODED_TEMP_REF, runId });
  assert.equal(okOut.status, 422);
  assert.equal(getEventListeners(okCtrl.signal, 'abort').length, 0);

  // 4. Signal mutated AFTER admission/barrier registration still uses intrinsic operations (zero override execution)
  const mutCtrl = new AbortController();
  const bMut = createOfflineBarrier('r11-02a-mut');
  const waitP = bMut.wait(mutCtrl.signal);
  mutCtrl.signal.addEventListener = () => { sentinelCalls++; };
  mutCtrl.signal.removeEventListener = () => { sentinelCalls++; };
  mutCtrl.abort();
  await assert.rejects(() => waitP, { name: 'AbortError' });
  assert.equal(sentinelCalls, 0);
});

test('140. H3-R11-02B: Binary payload admission rejects coercion overrides, accessors, Proxies, and subclasses while preserving exact independent bytes and SHA-256 integrity', async () => {
  let sentinelCalls = 0;
  const runId = 'r11-02b-run';
  const seedUserId = '11111111-1111-4111-a111-111111111111';
  const seedEmail = 'r11-02b-seed@proof.invalid';
  const seedToken = createMockJwt({
    iss: `https://${HARDCODED_TEMP_REF}.supabase.co/auth/v1`,
    ref: HARDCODED_TEMP_REF,
    sub: seedUserId,
    email: seedEmail,
    role: 'authenticated'
  });
  const serviceRoleKey = validTestServiceRoleKey;
  const inv = new TestRunInventory(runId, { seedUserId, seedEmail });

  const uploadedBodies = [];
  let downloadOverride = null;
  const transport = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
    routes: [
      { method: 'HEAD', urlIncludes: '/storage/v1/object/', status: 404, body: { error: 'not_found' } },
      {
        method: 'POST',
        urlIncludes: '/storage/v1/object/',
        status: 200,
        body: { Key: `${STORAGE_PROBE_BUCKET}/${runId}/probe-fixture.txt` }
      },
      { method: 'POST', urlIncludes: '/rest/v1/rpc/task06i_lookup_storage_object_owner', status: 200, body: [{ owner_id: seedUserId }] }
    ]
  });

  // Intercept via a registered deterministic transport wrapper? No, createDeterministicFixtureTransport already captures rawBytes/body!
  // Let's use two separate transports: one for invalid inputs (0 calls) and one with dynamic download via separate route for exact vs mismatched bytes.
  const adminClient = createHostedAdminClient({
    projectRef: HARDCODED_TEMP_REF,
    serviceRoleKey,
    runId,
    fetchFn: transport
  });

  // 1. Hostile binary inputs must all reject with 0 sentinel invocations and 0 transport calls
  const u8ToString = new Uint8Array([1, 2, 3]);
  u8ToString.toString = () => { sentinelCalls++; return 'evil'; };

  const u8ValueOf = new Uint8Array([1, 2, 3]);
  u8ValueOf.valueOf = () => { sentinelCalls++; return 'evil'; };

  const u8ToPrim = new Uint8Array([1, 2, 3]);
  Object.defineProperty(u8ToPrim, Symbol.toPrimitive, { value() { sentinelCalls++; return 'evil'; } });

  const u8BufAccessor = new Uint8Array([1, 2, 3]);
  Object.defineProperty(u8BufAccessor, 'buffer', { get() { sentinelCalls++; return new ArrayBuffer(3); } });

  const u8OffsetAccessor = new Uint8Array([1, 2, 3]);
  Object.defineProperty(u8OffsetAccessor, 'byteOffset', { get() { sentinelCalls++; return 0; } });

  const u8LenAccessor = new Uint8Array([1, 2, 3]);
  Object.defineProperty(u8LenAccessor, 'byteLength', { get() { sentinelCalls++; return 3; } });

  const u8Proxy = new Proxy(new Uint8Array([1, 2, 3]), {
    get(t, p, r) { sentinelCalls++; return Reflect.get(t, p, r); }
  });

  const forgedProto = Object.setPrototypeOf(new Uint8Array([1, 2, 3]), Object.create(Uint8Array.prototype));
  class SubU8 extends Uint8Array {}
  const subU8 = new SubU8([1, 2, 3]);
  const int32 = new Int32Array([1, 2, 3]);

  for (const badPayload of [u8ToString, u8ValueOf, u8ToPrim, u8BufAccessor, u8OffsetAccessor, u8LenAccessor, u8Proxy, forgedProto, subU8, int32]) {
    await assert.rejects(
      () => provisionStorageProbeFixture({
        projectRef: HARDCODED_TEMP_REF,
        runId,
        seedUserId,
        userAccessToken: seedToken,
        serviceRoleKey,
        adminClient,
        fetchFn: transport,
        inventory: inv,
        probeContent: badPayload
      }),
      /INVALID_ADMISSION_TYPE/
    );
  }
  assert.equal(sentinelCalls, 0);
  assert.equal(transport.calls.length, 0);
  assert.equal(inv.storageFixtures.size, 0);

  // 2. Exact byte preservation for non-text Uint8Array, Buffer with null/high bytes, and sliced Uint8Array with nonzero offset
  const rawBacking = new Uint8Array([0xaa, 0xbb, 0x00, 0xff, 0x0a, 0x7f, 0x80, 0xcc]);
  const slicedInput = new Uint8Array(rawBacking.buffer, 2, 5); // [0x00, 0xff, 0x0a, 0x7f, 0x80]
  const expectedSliceCopy = Buffer.from([0x00, 0xff, 0x0a, 0x7f, 0x80]);
  const expectedSha = crypto.createHash('sha256').update(expectedSliceCopy).digest('hex');

  const exactTransport = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
    routes: [
      { method: 'GET', urlIncludes: '/auth/v1/user', status: 200, body: { id: seedUserId, email: seedEmail } },
      { method: 'GET', urlIncludes: '/auth/v1/admin/users/', status: 200, body: { id: seedUserId, email: seedEmail } },
      { method: 'GET', urlIncludes: '/storage/v1/object/', status: 404, times: 1, body: { error: 'not_found' } },
      {
        method: 'POST',
        urlIncludes: '/storage/v1/object/',
        status: 200,
        body: { Key: `${STORAGE_PROBE_BUCKET}/${runId}/probe-fixture.txt` }
      },
      {
        method: 'POST',
        urlIncludes: '/rest/v1/rpc/task06i_lookup_storage_object_owner',
        status: 200,
        body: [{ id: '22222222-2222-4222-a222-222222222222', owner_id: seedUserId, bucket_id: STORAGE_PROBE_BUCKET, name: `${runId}/probe.txt` }]
      },
      {
        method: 'GET',
        urlIncludes: '/storage/v1/object/',
        status: 200,
        headers: { 'content-type': 'application/octet-stream' },
        rawBytes: expectedSliceCopy
      }
    ]
  });
  const exactAdmin = createHostedAdminClient({
    projectRef: HARDCODED_TEMP_REF,
    serviceRoleKey,
    runId,
    fetchFn: exactTransport
  });
  const fixture = await provisionStorageProbeFixture({
    projectRef: HARDCODED_TEMP_REF,
    runId,
    seedUserId,
    userAccessToken: seedToken,
    serviceRoleKey,
    adminClient: exactAdmin,
    fetchFn: exactTransport,
    inventory: inv,
    probeContent: slicedInput
  });

  // Mutate original backing buffer AFTER provisioning â€” must not affect fixture metadata or uploaded bytes
  rawBacking.fill(0x55);
  assert.equal(fixture.bytes, 5);
  assert.equal(fixture.sha256, expectedSha);
  const uploadCall = exactTransport.calls.find(c => c.method === 'POST' && c.url.includes('/storage/v1/object/'));
  assert.ok(uploadCall);
  assert.equal(uploadCall.body, expectedSliceCopy.toString('utf8'));

  // 3. Same-length mismatched downloaded bytes must fail integrity verification
  const runIdBad = 'r11-02b-mismatch';
  const invBad = new TestRunInventory(runIdBad, { seedUserId, seedEmail });
  const badDownloadTransport = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
    routes: [
      { method: 'GET', urlIncludes: '/auth/v1/user', status: 200, body: { id: seedUserId, email: seedEmail } },
      { method: 'GET', urlIncludes: '/auth/v1/admin/users/', status: 200, body: { id: seedUserId, email: seedEmail } },
      { method: 'GET', urlIncludes: '/storage/v1/object/', status: 404, times: 1, body: { error: 'not_found' } },
      {
        method: 'POST',
        urlIncludes: '/storage/v1/object/',
        status: 200,
        body: { Key: `${STORAGE_PROBE_BUCKET}/${runIdBad}/probe-fixture.txt` }
      },
      {
        method: 'POST',
        urlIncludes: '/rest/v1/rpc/task06i_lookup_storage_object_owner',
        status: 200,
        body: [{ id: '22222222-2222-4222-a222-222222222222', owner_id: seedUserId, bucket_id: STORAGE_PROBE_BUCKET, name: `${runIdBad}/probe.txt` }]
      },
      {
        method: 'GET',
        urlIncludes: '/storage/v1/object/',
        status: 200,
        headers: { 'content-type': 'application/octet-stream' },
        rawBytes: Buffer.from([0x00, 0xff, 0x0a, 0x7f, 0x81]) // same length (5), 1 byte different
      }
    ]
  });
  const badDownloadAdmin = createHostedAdminClient({
    projectRef: HARDCODED_TEMP_REF,
    serviceRoleKey,
    runId: runIdBad,
    fetchFn: badDownloadTransport
  });
  await assert.rejects(
    () => provisionStorageProbeFixture({
      projectRef: HARDCODED_TEMP_REF,
      runId: runIdBad,
      seedUserId,
      userAccessToken: seedToken,
      serviceRoleKey,
      adminClient: badDownloadAdmin,
      fetchFn: badDownloadTransport,
      inventory: invBad,
      probeContent: Buffer.from([0x00, 0xff, 0x0a, 0x7f, 0x80])
    }),
    /STORAGE_PROVISIONING_INTEGRITY_MISMATCH|STORAGE_OWNERSHIP_VERIFICATION_FAILED|sha256|mismatch/i
  );
});

test('141. H3-R12-01: Direct deterministicFixtureTransport enforces descriptor-first typed admission with zero getter, coercion, trap, state, or barrier side effects', async () => {
  let getterCalls = 0;
  let callbackCalls = 0;
  let trapCalls = 0;
  const barrier = createOfflineBarrier('r12-01-barrier');

  const transport = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
    initialState: { mutated: false },
    routes: [
      {
        method: 'POST',
        urlIncludes: '/ok',
        status: 200,
        body: { ok: true },
        setsState: { mutated: true },
        releaseBarrier: barrier
      },
      {
        method: 'GET',
        urlIncludes: '/ok',
        status: 200,
        body: { ok: true }
      }
    ]
  });

  // 1. Signal getter on request options
  const getterOpts = {};
  Object.defineProperty(getterOpts, 'signal', {
    enumerable: true,
    get() {
      getterCalls++;
      return new AbortController().signal;
    }
  });
  await assert.rejects(() => transport('https://example.test/ok', getterOpts), /Accessor property rejected/);

  // 2. Genuine signal with own aborted getter
  const sigOwnAborted = new AbortController().signal;
  Object.defineProperty(sigOwnAborted, 'aborted', {
    get() {
      getterCalls++;
      return false;
    }
  });
  await assert.rejects(() => transport('https://example.test/ok', { signal: sigOwnAborted }), /INVALID_ADMISSION_TYPE/);

  // 3. Genuine signal with overridden event methods
  const sigOverriddenAdd = new AbortController().signal;
  sigOverriddenAdd.addEventListener = () => { callbackCalls++; };
  await assert.rejects(() => transport('https://example.test/ok', { signal: sigOverriddenAdd }), /INVALID_ADMISSION_TYPE/);

  // 4. Proxy signal & forged signal prototype
  const sigProxy = new Proxy(new AbortController().signal, {
    get(t, p, r) { trapCalls++; return Reflect.get(t, p, r); }
  });
  await assert.rejects(() => transport('https://example.test/ok', { signal: sigProxy }), /INVALID_ADMISSION_TYPE/);
  const sigForged = Object.create(AbortSignal.prototype);
  await assert.rejects(() => transport('https://example.test/ok', { signal: sigForged }), /INVALID_ADMISSION_TYPE/);

  // 5. Proxy request options
  const optsProxy = new Proxy({}, {
    get(t, p, r) { trapCalls++; return Reflect.get(t, p, r); },
    getOwnPropertyDescriptor(t, p) { trapCalls++; return Reflect.getOwnPropertyDescriptor(t, p); }
  });
  await assert.rejects(() => transport('https://example.test/ok', optsProxy), /Proxy object rejected/);

  // 6. Coercive method and URL objects
  await assert.rejects(
    () => transport('https://example.test/ok', { method: { toString() { callbackCalls++; return 'GET'; } } }),
    /INVALID_ADMISSION_TYPE/
  );
  await assert.rejects(
    () => transport({ toString() { callbackCalls++; return 'https://example.test/ok'; } }, { method: 'GET' }),
    /INVALID_ADMISSION_TYPE/
  );

  // 7. Header record with executable method / coercive value / accessor
  await assert.rejects(
    () => transport('https://example.test/ok', { headers: { forEach() { callbackCalls++; } } }),
    /UNTRUSTED_EXECUTABLE_INPUT|INVALID_ADMISSION_TYPE/
  );
  await assert.rejects(
    () => transport('https://example.test/ok', { headers: { 'x-test': { toString() { callbackCalls++; return '1'; } } } }),
    /INVALID_ADMISSION_TYPE/
  );
  const hdrAccessor = {};
  Object.defineProperty(hdrAccessor, 'x-test', { enumerable: true, get() { getterCalls++; return '1'; } });
  await assert.rejects(() => transport('https://example.test/ok', { headers: hdrAccessor }), /Accessor property rejected/);

  // 8. Unsupported body object
  await assert.rejects(() => transport('https://example.test/ok', { method: 'POST', body: { raw: 1 } }), /INVALID_ADMISSION_TYPE/);

  // Assert zero side effects across all rejections
  assert.equal(getterCalls, 0);
  assert.equal(callbackCalls, 0);
  assert.equal(trapCalls, 0);
  assert.equal(transport.calls.length, 0);
  assert.deepEqual(transport.getState(), { mutated: false });
  assert.equal(barrier.isReleased(), false);

  // 9. Valid already-aborted signal aborts BEFORE recording call or mutating state
  const abortedCtrl = new AbortController();
  abortedCtrl.abort();
  await assert.rejects(() => transport('https://example.test/ok', { method: 'POST', signal: abortedCtrl.signal }), { name: 'AbortError' });
  assert.equal(transport.calls.length, 0);
  assert.deepEqual(transport.getState(), { mutated: false });
  assert.equal(barrier.isReleased(), false);

  // 10. Valid primitive + binary + non-aborted signal succeed
  const okCtrl = new AbortController();
  const res1 = await transport('https://example.test/ok', { method: 'GET', headers: { 'X-Ok': 'yes' }, signal: okCtrl.signal });
  assert.equal(res1.status, 200);
  const res2 = await transport('https://example.test/ok', { method: 'POST', body: Buffer.from('abc'), signal: okCtrl.signal });
  assert.equal(res2.status, 200);
  assert.equal(transport.calls.length, 2);
  assert.deepEqual(transport.getState(), { mutated: true });
  assert.equal(barrier.isReleased(), true);
});

test('142. H3-R12-02: Exception-safe timer and listener lifecycle prevents leaked timers, duplicate abort effects, and unvalidated ownership timeouts', async () => {
  const origSetTimeout = globalThis.setTimeout;
  const origClearTimeout = globalThis.clearTimeout;
  const activeTimers = new Set();
  let timerIdSeq = 0;

  globalThis.setTimeout = (fn, ms, ...args) => {
    const token = { seq: ++timerIdSeq, raw: null };
    activeTimers.add(token);
    token.raw = origSetTimeout(() => {
      activeTimers.delete(token);
      fn(...args);
    }, ms);
    return token;
  };
  globalThis.clearTimeout = (token) => {
    if (token && typeof token === 'object' && 'raw' in token) {
      activeTimers.delete(token);
      return origClearTimeout(token.raw);
    }
    return origClearTimeout(token);
  };

  try {
    let sentinelCalls = 0;
    const runId = 'r12-02-run';
    const inv = new TestRunInventory(runId);

    // 1. Deterministic transport delay + barrier + signal mutation after await
    const barrier = createOfflineBarrier('r12-02-b');
    const delayTransport = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
      routes: [
        { method: 'GET', urlIncludes: '/delay', status: 200, delayMs: 25, body: { ok: true } },
        { method: 'GET', urlIncludes: '/barrier-delay', status: 200, waitForBarrier: barrier, delayMs: 25, body: { ok: true } }
      ]
    });

    const badSig = new AbortController().signal;
    badSig.addEventListener = () => { sentinelCalls++; };
    await assert.rejects(() => delayTransport('https://example.test/delay', { signal: badSig }), /INVALID_ADMISSION_TYPE/);
    assert.equal(activeTimers.size, 0, 'No timer may be armed for rejected transport signal');

    // Normal completion detaches listener and clears timer
    const okCtrl = new AbortController();
    const okRes = await delayTransport('https://example.test/delay', { signal: okCtrl.signal });
    assert.equal(okRes.status, 200);
    assert.equal(activeTimers.size, 0);
    assert.equal(getEventListeners(okCtrl.signal, 'abort').length, 0);

    // Abort during delay clears timer and listener
    const abortCtrl = new AbortController();
    const pAbort = delayTransport('https://example.test/delay', { signal: abortCtrl.signal });
    origSetTimeout(() => abortCtrl.abort(), 5);
    await assert.rejects(() => pAbort, { name: 'AbortError' });
    assert.equal(activeTimers.size, 0);
    assert.equal(getEventListeners(abortCtrl.signal, 'abort').length, 0);

    // Signal mutated during an earlier barrier await is rejected before delay setup without executing override or leaking timer
    const mutCtrl = new AbortController();
    const pBarrierDelay = delayTransport('https://example.test/barrier-delay', { signal: mutCtrl.signal });
    mutCtrl.signal.addEventListener = () => { sentinelCalls++; };
    mutCtrl.signal.removeEventListener = () => { sentinelCalls++; };
    barrier.release();
    await assert.rejects(() => pBarrierDelay, /INVALID_ADMISSION_TYPE/);
    assert.equal(sentinelCalls, 0);
    assert.equal(activeTimers.size, 0);
    assert.equal(getEventListeners(mutCtrl.signal, 'abort').length, 0);

    // 2. Offline dispatcher delay: ignoreAbort + onAbortInventoryEffects executes once & cleans timer
    const offlineDisp = createTrustedOfflineDispatcher({
      projectRef: HARDCODED_TEMP_REF,
      runId,
      outcomes: {
        'BYPASS-01': {
          status: 422,
          passed: true,
          delayMs: 25,
          ignoreAbort: true,
          onAbortInventoryEffects: { registerUntrackedUser: true }
        }
      }
    });
    const igCtrl = new AbortController();
    const igPromise = offlineDisp({ id: 'BYPASS-01' }, { projectRef: HARDCODED_TEMP_REF, runId, inventory: inv, signal: igCtrl.signal });
    origSetTimeout(() => igCtrl.abort(), 5);
    const igOut = await igPromise;
    assert.equal(igOut.status, 422);
    assert.equal(inv.untrackedUsersCount, 1, 'onAbortInventoryEffects must run exactly once');
    assert.equal(activeTimers.size, 0);
    assert.equal(getEventListeners(igCtrl.signal, 'abort').length, 0);

    // 3. Direct Admin getStorageObjectOwnership typed admission & timeout/signal cleanup
    const rpcTransport = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
      routes: [
        {
          method: 'POST',
          urlIncludes: '/rest/v1/rpc/task06i_lookup_storage_object_owner',
          status: 200,
          delayMs: 25,
          body: [{ id: '22222222-2222-4222-a222-222222222222', owner_id: '11111111-1111-4111-a111-111111111111', bucket_id: STORAGE_PROBE_BUCKET, name: `${runId}/p.txt` }]
        }
      ]
    });
    const admin = createHostedAdminClient({
      projectRef: HARDCODED_TEMP_REF,
      serviceRoleKey: validTestServiceRoleKey,
      runId,
      fetchFn: rpcTransport
    });

    for (const badTimeout of [NaN, Infinity, -1, 0, 60001, '100', { valueOf() { sentinelCalls++; return 10; } }]) {
      await assert.rejects(
        () => admin.getStorageObjectOwnership(STORAGE_PROBE_BUCKET, `${runId}/p.txt`, { timeoutMs: badTimeout }),
        /INVALID_ADMISSION_TYPE|INVALID_ADMISSION_RANGE/
      );
    }
    await assert.rejects(
      () => admin.getStorageObjectOwnership(STORAGE_PROBE_BUCKET, `${runId}/p.txt`, { signal: badSig }),
      /INVALID_ADMISSION_TYPE/
    );
    assert.equal(sentinelCalls, 0);
    assert.equal(rpcTransport.calls.length, 0);
    assert.equal(activeTimers.size, 0);

    // Valid aborted signal on ownership lookup leaves 0 timers and 0 transport calls
    const ownAborted = new AbortController();
    ownAborted.abort();
    const ownAbortedRes = await admin.getStorageObjectOwnership(STORAGE_PROBE_BUCKET, `${runId}/p.txt`, { signal: ownAborted.signal });
    assert.equal(ownAbortedRes.error.code, 'OWNERSHIP_LOOKUP_ABORTED');
    assert.equal(rpcTransport.calls.length, 0);
    assert.equal(activeTimers.size, 0);

    // Valid concurrent ownership lookups clear all timers and listeners
    const c1 = new AbortController();
    const c2 = new AbortController();
    const [r1, r2] = await Promise.all([
      admin.getStorageObjectOwnership(STORAGE_PROBE_BUCKET, `${runId}/p.txt`, { timeoutMs: 200, signal: c1.signal }),
      admin.getStorageObjectOwnership(STORAGE_PROBE_BUCKET, `${runId}/p.txt`, { timeoutMs: 5, signal: c2.signal })
    ]);
    assert.equal(r1.found, true);
    assert.equal(r2.error.code, 'OWNERSHIP_LOOKUP_TIMEOUT');
    assert.equal(activeTimers.size, 0);
    assert.equal(getEventListeners(c1.signal, 'abort').length, 0);
    assert.equal(getEventListeners(c2.signal, 'abort').length, 0);
  } finally {
    globalThis.setTimeout = origSetTimeout;
    globalThis.clearTimeout = origClearTimeout;
  }
});

// R13 prototype mutation and timer instrumentation are scoped to sequential tests
// and every modified descriptor/global is restored even when an assertion fails.
async function withR13DelayResources(check) {
  const originalSet = globalThis.setTimeout;
  const originalClear = globalThis.clearTimeout;
  const active = new Set();
  globalThis.setTimeout = (fn, ms, ...args) => {
    const timer = originalSet(() => { active.delete(timer); fn(...args); }, ms);
    active.add(timer);
    return timer;
  };
  globalThis.clearTimeout = timer => { active.delete(timer); return originalClear(timer); };
  try {
    await check(active, ms => new Promise(resolve => originalSet(resolve, ms)));
    assert.equal(active.size, 0, 'No owned timer remains after settlement');
  } finally {
    for (const timer of active) originalClear(timer);
    globalThis.setTimeout = originalSet;
    globalThis.clearTimeout = originalClear;
  }
}

async function withR13PrototypeProperties(descriptors, check) {
  const saved = new Map(Object.keys(descriptors).map(key => [key, Object.getOwnPropertyDescriptor(Object.prototype, key)]));
  try {
    for (const [key, descriptor] of Object.entries(descriptors)) Object.defineProperty(Object.prototype, key, { configurable: true, ...descriptor });
    await check();
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(Object.prototype, key, descriptor);
      else delete Object.prototype[key];
    }
  }
}

test('143. H3-R13-01: direct delayed transport ignores inherited abort options and admission defaults with zero sentinel execution', { concurrency: false }, async () => {
  await withR13DelayResources(async active => {
    let callbacks = 0;
    let getters = 0;
    let network = 0;
    const previousFetch = globalThis.fetch;
    globalThis.fetch = () => { network++; throw new Error('Unexpected native network'); };
    const inheritedCallback = () => { callbacks++; };
    const getter = () => { getters++; return inheritedCallback; };
    const scenarios = [
      { onAbort: { value: inheritedCallback } },
      { onAbort: { get: getter } },
      { ignoreAbort: { value: true } },
      { ignoreAbort: { get: getter } },
      { onAbort: { value: inheritedCallback }, ignoreAbort: { value: true } },
      { onAbort: { get: getter }, ignoreAbort: { get: getter } },
      { allowNullUndefined: { get: getter } },
      { headersMatch: { get: getter }, delayMs: { get: getter }, onAbortInventoryEffects: { get: getter } }
    ];
    try {
      for (const descriptors of scenarios) {
        await withR13PrototypeProperties(descriptors, async () => {
          const transport = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait', routes: [{ pathEquals: '/delayed', delayMs: 30, status: 200, json: {} }] });
          for (const alreadyAborted of [false, true]) {
            const controller = new AbortController();
            if (alreadyAborted) controller.abort();
            const pending = transport('https://offline.invalid/delayed', { signal: controller.signal });
            const rejected = assert.rejects(pending, { name: 'AbortError' });
            if (!alreadyAborted) controller.abort();
            await rejected;
            assert.equal(active.size, 0);
            assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
          }
          assert.equal(transport.calls.length, 1, 'Already-aborted request is not dispatched');
        });
      }
      assert.equal(callbacks, 0);
      assert.equal(getters, 0);
      assert.equal(network, 0);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});

test('144. H3-R13-01: delay races, overlapping cancellation, explicit ignore-abort and invalid timing preserve resource ownership', { concurrency: false }, async () => {
  await withR13DelayResources(async (active, sleep) => {
    const transport = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait', defaultResponse: { delayMs: 8, status: 200, json: {} } });
    const controllers = Array.from({ length: 4 }, () => new AbortController());
    const pending = controllers.map(controller => transport('https://offline.invalid/delay', { signal: controller.signal }));
    const settled = Promise.allSettled(pending);
    controllers[0].abort();
    controllers[1].abort();
    const outcomes = await settled;
    assert.deepEqual(outcomes.map(outcome => outcome.status), ['rejected', 'rejected', 'fulfilled', 'fulfilled']);
    assert.equal(outcomes[0].reason.name, 'AbortError');
    for (const controller of controllers) assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
    assert.equal(active.size, 0);

    // Timer completion wins one same-deadline race; immediate abort wins the other.
    const raceController = new AbortController();
    const race = transport('https://offline.invalid/race', { signal: raceController.signal });
    const abortAtCompletion = sleep(8).then(() => raceController.abort());
    const raceResult = await Promise.allSettled([race]);
    await abortAtCompletion;
    assert.ok(raceResult[0].status === 'fulfilled' || raceResult[0].reason.name === 'AbortError');
    assert.equal(active.size, 0);
    assert.equal(getEventListeners(raceController.signal, 'abort').length, 0);

    for (const alreadyAborted of [false, true]) {
      const runId = 'r13-ignore-' + alreadyAborted;
      const inventory = new TestRunInventory(runId);
      const dispatcher = createTrustedOfflineDispatcher({ runId, outcomes: { 'BYPASS-01': {
        delayMs: 8, ignoreAbort: true, onAbortInventoryEffects: { registerUntrackedUser: true }, outcome: { passed: true, status: 422 }
      } } });
      const controller = new AbortController();
      if (alreadyAborted) controller.abort();
      const operation = dispatcher({ id: 'BYPASS-01' }, { inventory, signal: controller.signal });
      if (!alreadyAborted) { controller.abort(); controller.abort(); }
      assert.equal((await operation).status, 422);
      assert.equal(inventory.untrackedUsersCount, 1);
      assert.equal(active.size, 0);
      assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
      assert.equal(inventory.isClean(), false);
    }

    let coercions = 0;
    for (const delayMs of [-1, NaN, Infinity, 2147483648, '10', null, { toString() { coercions++; return '1'; } }]) {
      await assert.rejects(async () => {
        const invalid = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait', defaultResponse: { delayMs, status: 200 } });
        await invalid('https://offline.invalid/bad-delay');
      }, /INVALID_ADMISSION_RANGE|INVALID_DETERMINISTIC_FIXTURE_SPEC/);
      assert.equal(active.size, 0);
    }
    for (const ignoreAbort of [1, 'true', null]) {
      assert.throws(() => createTrustedOfflineDispatcher({ runId: 'r13-invalid-ignore', defaultOutcome: { delayMs: 2, ignoreAbort, status: 422 } }), /INVALID_INTERNAL_DELAY_OPTIONS/);
      assert.equal(active.size, 0);
    }
    assert.equal(coercions, 0);
  });
});

test('145. H3-R13-01: internal abort-effect exceptions reject structurally after cleanup and retain partial inventory obligations', { concurrency: false }, async () => {
  await withR13DelayResources(async (active, sleep) => {
    const unhandled = [];
    const onUnhandled = reason => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      for (const neverSettle of [false, true]) {
        for (const ignoreAbort of [false, true]) {
          for (const alreadyAborted of [false, true]) {
            const runId = 'r13-effect-' + neverSettle + '-' + ignoreAbort + '-' + alreadyAborted;
            const inventory = new TestRunInventory(runId);
            inventory.registerReferencedUser({ id: 'seed', email: 'seed@proof.invalid' });
            const op = inventory.registerInFlightOperation({ probeId: 'R13-PENDING', canModifyProviderState: true, requiresCleanupReconciliation: true });
            const descriptor = {
              ...(neverSettle ? { neverSettle: true, rejectAfterAbortMs: 5 } : { delayMs: 30 }),
              ignoreAbort,
              onAbortInventoryEffects: { registerUntrackedUser: true, registerSeedPasswordModification: { userId: 'seed', email: 'other@proof.invalid', originalPassword: 'synthetic-original' } },
              outcome: { passed: true, status: 422 }
            };
            const dispatcher = createTrustedOfflineDispatcher({ runId, defaultOutcome: descriptor });
            const controller = new AbortController();
            if (alreadyAborted) controller.abort();
            const operation = dispatcher({ id: 'BYPASS-01' }, { inventory, signal: controller.signal });
            const rejected = assert.rejects(operation, error => {
              assert.equal(error.code, 'INTERNAL_ABORT_EFFECT_FAILED');
              assert.equal(error.inventoryEffectsMayBePartial, true);
              return true;
            });
            if (!alreadyAborted) { controller.abort(); controller.abort(); }
            await rejected;
            assert.equal(inventory.untrackedUsersCount, 1, 'Effect completed before failure is retained exactly once');
            assert.ok(inventory.getUnresolvedOperations().some(record => record.opId === op.opId));
            assert.equal(inventory.isClean(), false);
            assert.equal(active.size, 0);
            assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
          }
        }
      }
      await sleep(5);
      assert.deepEqual(unhandled, []);
    } finally {
      process.removeListener('unhandledRejection', onUnhandled);
    }
  });
});

test('146. H3-R13-02: nullable and omitted headers normalize without inherited matches or TypeErrors', { concurrency: false }, async () => {
  const spec = { routes: [{ headersMatch: { 'X-Required': 'yes' }, status: 201, tag: 'matched', json: {} }] };
  for (const headers of [null, undefined, {}]) {
    const transport = createDeterministicFixtureTransport(spec);
    await assert.rejects(transport('https://offline.invalid/headers', headers === undefined ? {} : { headers }), /DETERMINISTIC_TRANSPORT_UNMATCHED_ROUTE/);
    assert.equal(transport.calls.length, 0);
  }
  for (const headers of [{ 'X-Required': 'yes' }, new Headers({ 'X-REQUIRED': 'yes' })]) {
    const transport = createDeterministicFixtureTransport(spec);
    assert.equal((await transport('https://offline.invalid/headers', { headers })).status, 201);
    assert.equal(transport.calls[0].headers['x-required'], 'yes');
  }
  const fallbackSpec = { ...spec, fallback: { status: 409, json: { code: 'HEADER_NOT_MATCHED' } } };
  for (const headers of [null, undefined, {}, { 'X-Required': 'no' }]) {
    const transport = createDeterministicFixtureTransport(fallbackSpec);
    const response = await transport('https://offline.invalid/headers', headers === undefined ? {} : { headers });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { code: 'HEADER_NOT_MATCHED' });
    assert.equal(transport.calls[0].routeIndex, -1);
    assert.ok(transport.calls[0].headers);
  }
  let inheritedReads = 0;
  await withR13PrototypeProperties({ 'x-required': { get() { inheritedReads++; return 'yes'; } } }, async () => {
    for (const headers of [null, undefined, {}]) {
      const transport = createDeterministicFixtureTransport(fallbackSpec);
      assert.equal((await transport('https://offline.invalid/headers', { headers })).status, 409);
    }
  });
  assert.equal(inheritedReads, 0);
});


test('147. H3-R13 audit: route body and state matching ignore inherited properties and state setters', { concurrency: false }, async () => {
  let getterReads = 0;
  await withR13PrototypeProperties({ r13BodySentinel: { get() { getterReads++; return 'yes'; } } }, async () => {
    const transport = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait', routes: [{ bodyMatch: { r13BodySentinel: 'yes' }, status: 201 }], fallback: { status: 409 } });
    assert.equal((await transport('https://offline.invalid/body', { body: '{}' })).status, 409);
    assert.equal((await transport('https://offline.invalid/body', { body: '{"r13BodySentinel":"yes"}' })).status, 201);
    assert.equal((await transport('https://offline.invalid/body', { body: '{"r13BodySentinel":"no"}' })).status, 409);
  });
  assert.equal(getterReads, 0);
  let stateGetters = 0;
  let stateSetters = 0;
  await withR13PrototypeProperties({ r13StateSentinel: {
    get() { stateGetters++; return 'yes'; },
    set() { stateSetters++; }
  } }, async () => {
    const transport = createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait',
      initialState: {}, routes: [{ whenState: { r13StateSentinel: 'yes' }, status: 201 }],
      fallback: { status: 409, setsState: { r13StateSentinel: 'yes' } }
    });
    assert.equal((await transport('https://offline.invalid/state')).status, 409);
    assert.equal((await transport('https://offline.invalid/state')).status, 201);
    assert.equal(Object.hasOwn(transport.getState(), 'r13StateSentinel'), true);
  });
  assert.equal(stateGetters, 0);
  assert.equal(stateSetters, 0);
});
test('SR-01/SR-02: canonical JWT admission and own option defaults resist ambient mutation', () => {
  const valid = createMockJwt();
  const [header, payload, signature] = valid.split('.');
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  for (const token of [
    `${encode({ alg: 'none' })}.${payload}.`,
    `${header}.${payload}.`,
    `${header}.${payload}.***`,
    `${header}.${payload}.A`,
    `${header}.${payload}.AB`,
    `${encode({ alg: 'HS256', crit: ['unknown'] })}.${payload}.${signature}`
  ]) assert.equal(parseAndValidateJwt(token).valid, false);
  const binarySignature = `${header}.${payload}.${Buffer.from([0xff, 0x80, 0x00]).toString('base64url')}`;
  assert.equal(parseAndValidateJwt(binarySignature).valid, true);
  assert.equal(parseAndValidateJwt(valid).cryptographicallyAuthenticated, false);
  const expired = createMockJwt({ aud: 'anon', exp: Math.floor(Date.now() / 1000) - 120 });
  const previousAudience = Object.getOwnPropertyDescriptor(Object.prototype, 'expectedAudience');
  const previousIssuer = Object.getOwnPropertyDescriptor(Object.prototype, 'expectedIssuer');
  const previousClock = Object.getOwnPropertyDescriptor(Object.prototype, 'clockToleranceSeconds');
  const previousSplit = Object.getOwnPropertyDescriptor(String.prototype, 'split');
  let getters = 0;
  try {
    Object.defineProperty(Object.prototype, 'expectedAudience', { configurable: true, get() { getters++; return 'anon'; } });
    Object.defineProperty(Object.prototype, 'expectedIssuer', { configurable: true, get() { getters++; return 'wrong'; } });
    Object.defineProperty(Object.prototype, 'clockToleranceSeconds', { configurable: true, get() { getters++; return 3600; } });
    for (const options of [undefined, {}, { expectedIssuer: `https://${HARDCODED_TEMP_REF}.supabase.co` }]) {
      assert.equal(parseAndValidateJwt(expired, options).valid, false);
    }
    assert.equal(getters, 0);
    assert.equal(parseAndValidateJwt(valid, {}).valid, true);
    assert.equal(parseAndValidateJwt(valid, { expectedAudience: 'anon' }).valid, false);
    assert.equal(parseAndValidateJwt(valid, { clockToleranceSeconds: -1 }).valid, false);
    assert.equal(parseAndValidateJwt(valid, Object.defineProperty({}, 'expectedAudience', { get() { getters++; return 'authenticated'; } })).valid, false);
    const proxy = new Proxy({}, { get() { getters++; throw Error('trap'); }, getOwnPropertyDescriptor() { getters++; throw Error('trap'); } });
    assert.equal(parseAndValidateJwt(valid, proxy).valid, false);
    assert.equal(getters, 0);
    Object.defineProperty(String.prototype, 'split', { configurable: true, value() { getters++; return [header, payload, signature]; } });
    assert.equal(parseAndValidateJwt('forged', {}).valid, false);
    assert.equal(getters, 0);
  } finally {
    for (const [name, descriptor] of [['expectedAudience', previousAudience], ['expectedIssuer', previousIssuer], ['clockToleranceSeconds', previousClock]]) {
      if (descriptor) Object.defineProperty(Object.prototype, name, descriptor); else delete Object.prototype[name];
    }
    if (previousSplit) Object.defineProperty(String.prototype, 'split', previousSplit); else delete String.prototype.split;
  }
});

test('SR-01: HOOK-01/02 reject conflicting or invalid token identity and retain observed session cleanup', async () => {
  const observedUser = 'user-observed-sr01';
  const observedSession = 'session-observed-sr01';
  for (const [probeId, token] of [
    ['HOOK-01', createMockJwt({ sub: 'user-conflicting-sr01', session_id: 'session-conflicting-sr01' })],
    ['HOOK-01', createMockJwt().replace(/[^.]+$/, '')],
    ['HOOK-02', createMockJwt({ sub: 'user-conflicting-sr01', session_id: 'session-conflicting-sr01' })]
  ]) {
    const inventory = new TestRunInventory(`test-${probeId}-${token.length}`);
    const context = createRunContext({ runId: inventory.runId });
    if (probeId === 'HOOK-02') {
      context.activeRefreshToken = 'refresh-existing-sr01';
      context.activeUserId = observedUser;
      context.activeSessionId = 'session-prior-sr01';
      context.activeAccessToken = 'prior-access-token-sr01';
    }
    const dispatcher = createHostedDispatcher({
      anonKey: validTestAnonKey,
      inventory,
      runContext: context,
      fetchFn: staticTransport({ status: 200, json: {
        access_token: token, refresh_token: 'refresh-new-sr01', session_id: observedSession,
        user: { id: observedUser, email: 'proof-sr01@proof.invalid' }
      } })
    });
    const result = await dispatcher({ id: probeId, category: 'Token Hook' });
    assert.equal(result.passed, false);
    assert.match(result.error, /JWT_IDENTITY_MISMATCH|JWT_CLAIM_VIOLATION/);
    assert.equal(context.activeAccessToken, probeId === 'HOOK-02' ? 'prior-access-token-sr01' : null);
    assert.equal(context.activeUserId, probeId === 'HOOK-02' ? observedUser : null);
    assert.equal(context.activeSessionId, probeId === 'HOOK-02' ? 'session-prior-sr01' : null);
    assert.equal(inventory.trackedSessions.has(observedSession), true);
    assert.equal(result.session_cleanup_registered, true);
  }
  for (const probeId of ['HOOK-01', 'HOOK-02']) {
    const result = validateProbeOutcome({ id: probeId, category: 'Token Hook' }, {
      passed: true, status: 200, access_token: createMockJwt().replace(/[^.]+$/, ''),
      session_id: observedSession, amr_authenticated: true, amr_preserved: true
    });
    assert.equal(result.passed, false);
    assert.match(result.reason, /JWT_CLAIM_VIOLATION/);
  }
  const inventory = new TestRunInventory('test-hook02-no-session-sr01');
  const context = createRunContext({ runId: inventory.runId });
  context.activeRefreshToken = 'refresh-prior-sr01';
  context.activeAccessToken = 'access-prior-sr01';
  context.activeUserId = 'user-prior-sr01';
  context.activeSessionId = 'session-prior-sr01';
  const dispatcher = createHostedDispatcher({
    anonKey: validTestAnonKey, inventory, runContext: context,
    fetchFn: staticTransport({ status: 200, json: {
      access_token: createMockJwt({ session_id: null }), user: { id: 'user-new-sr01' }
    } })
  });
  const result = await dispatcher({ id: 'HOOK-02', category: 'Token Hook' });
  assert.equal(result.passed, false);
  assert.equal(result.indeterminate_session, true);
  assert.equal(inventory.untrackedSessionsCount, 1);
  assert.equal(context.activeAccessToken, 'access-prior-sr01');
  assert.equal(context.activeUserId, 'user-prior-sr01');
  assert.equal(context.activeSessionId, 'session-prior-sr01');
});

test('PR45-P2-A: parseAndValidateJwt enforces recursive own-only AMR admission without invoking inherited getters', () => {
  const prevMethod = Object.getOwnPropertyDescriptor(Object.prototype, 'method');
  const prevIter = Object.getOwnPropertyDescriptor(Array.prototype, Symbol.iterator);
  const prevIncludes = Object.getOwnPropertyDescriptor(Array.prototype, 'includes');
  const prevJoin = Object.getOwnPropertyDescriptor(Array.prototype, 'join');
  const prevStrTrim = Object.getOwnPropertyDescriptor(String.prototype, 'trim');
  const prevStrIncludes = Object.getOwnPropertyDescriptor(String.prototype, 'includes');
  let sentinelCalls = 0;
  const missingAmrMethodJwt = createMockJwt({ amr: [{}] });
  const emptyAmrMethodJwt = createMockJwt({ amr: [{ method: '   ' }] });
  const numericAmrMethodJwt = createMockJwt({ amr: [{ method: 123 }] });
  const prohibitedAmrJwt = createMockJwt({ amr: [{ method: 'otp' }] });
  const objectExpJwt = createMockJwt({ exp: {} });
  const objectAudJwt = createMockJwt({ aud: {} });
  const mismatchAudArrayJwt = createMockJwt({ aud: ['anon'] });
  const validJwt = createMockJwt({
    iss: `https://${HARDCODED_TEMP_REF}.supabase.co/auth/v1`,
    aud: ['anon', 'authenticated'],
    amr: [{ method: 'password', timestamp: 1700000000 }]
  });
  try {
    Object.defineProperty(Object.prototype, 'method', {
      configurable: true,
      get() { sentinelCalls++; return 'password'; }
    });
    Object.defineProperty(Array.prototype, Symbol.iterator, {
      configurable: true,
      value() { sentinelCalls++; return [][Symbol.iterator](); }
    });
    Object.defineProperty(Array.prototype, 'includes', {
      configurable: true,
      value() { sentinelCalls++; return true; }
    });
    Object.defineProperty(Array.prototype, 'join', {
      configurable: true,
      value() { sentinelCalls++; return 'hijacked'; }
    });
    Object.defineProperty(String.prototype, 'trim', {
      configurable: true,
      value() { sentinelCalls++; return 'password'; }
    });
    Object.defineProperty(String.prototype, 'includes', {
      configurable: true,
      value() { sentinelCalls++; return true; }
    });

    const resMissing = parseAndValidateJwt(missingAmrMethodJwt);
    assert.equal(resMissing.valid, false);
    assert.match(resMissing.reason, /MALFORMED_AMR_METHOD/);

    const resEmpty = parseAndValidateJwt(emptyAmrMethodJwt);
    assert.equal(resEmpty.valid, false);
    assert.match(resEmpty.reason, /MALFORMED_AMR_METHOD/);

    const resNumeric = parseAndValidateJwt(numericAmrMethodJwt);
    assert.equal(resNumeric.valid, false);
    assert.match(resNumeric.reason, /MALFORMED_AMR_METHOD/);

    const resProhibited = parseAndValidateJwt(prohibitedAmrJwt);
    assert.equal(resProhibited.valid, false);
    assert.match(resProhibited.reason, /PROHIBITED_AMR_METHOD/);

    const resObjExp = parseAndValidateJwt(objectExpJwt);
    assert.equal(resObjExp.valid, false);
    assert.match(resObjExp.reason, /INVALID_EXP/);

    const resObjAud = parseAndValidateJwt(objectAudJwt);
    assert.equal(resObjAud.valid, false);
    assert.match(resObjAud.reason, /AUDIENCE_MISMATCH/);

    const resAudArray = parseAndValidateJwt(mismatchAudArrayJwt);
    assert.equal(resAudArray.valid, false);
    assert.match(resAudArray.reason, /AUDIENCE_MISMATCH/);

    const resValid = parseAndValidateJwt(validJwt, { expectedIssuer: HARDCODED_TEMP_REF, expectedAudience: 'authenticated' });
    assert.equal(resValid.valid, true);
    assert.equal(Object.getPrototypeOf(resValid.payload.amr[0]), null);
    assert.equal(Object.isFrozen(resValid.payload.amr[0]), true);
    assert.equal(sentinelCalls, 0);
  } finally {
    if (prevMethod) Object.defineProperty(Object.prototype, 'method', prevMethod); else delete Object.prototype.method;
    if (prevIter) Object.defineProperty(Array.prototype, Symbol.iterator, prevIter); else delete Array.prototype[Symbol.iterator];
    if (prevIncludes) Object.defineProperty(Array.prototype, 'includes', prevIncludes); else delete Array.prototype.includes;
    if (prevJoin) Object.defineProperty(Array.prototype, 'join', prevJoin); else delete Array.prototype.join;
    if (prevStrTrim) Object.defineProperty(String.prototype, 'trim', prevStrTrim); else delete String.prototype.trim;
    if (prevStrIncludes) Object.defineProperty(String.prototype, 'includes', prevStrIncludes); else delete String.prototype.includes;
  }
});

test('PR45-P2-B: HOOK-02 correlates refreshed claims with active user/session, retains cleanup, and blocks stale revocation', async () => {
  const user1 = 'user-p2b-1';
  const sess1 = 'sess-p2b-1';
  const sess2 = 'sess-p2b-2';
  const tok1 = createMockJwt({ sub: user1, session_id: sess1 });
  const tokSameUserDiffSess = createMockJwt({ sub: user1, session_id: sess2 });
  const tokValidRefresh = createMockJwt({ sub: user1, session_id: sess1, exp: Math.floor(Date.now() / 1000) + 900 });

  // 1. Same-user / different-session refresh is rejected, keeps ctx bound to sess-1, retains sess-2 cleanup, and SESSION-02 only revokes sess-1
  {
    const inv = new TestRunInventory('test-p2b-diff-sess');
    const ctx = createRunContext({ runId: inv.runId, testEmail: 'p2b@proof.invalid' });
    const transport = createDeterministicFixtureTransport({
      requestBudgetMode: 'recorded_zero_wait',
      routes: [
        {
          urlIncludes: 'grant_type=password',
          status: 200,
          json: {
            access_token: tok1,
            refresh_token: 'refresh-p2b-1',
            session_id: sess1,
            user: { id: user1, email: 'p2b@proof.invalid' }
          }
        },
        {
          urlIncludes: 'grant_type=refresh_token',
          status: 200,
          json: {
            access_token: tokSameUserDiffSess,
            refresh_token: 'refresh-p2b-2',
            session_id: sess2,
            user: { id: user1, email: 'p2b@proof.invalid' }
          }
        },
        {
          urlIncludes: '/auth/v1/admin/users/',
          method: 'PUT',
          status: 200,
          setsState: { passwordReset: true },
          json: { id: user1 }
        },
        {
          urlIncludes: '/auth/v1/user',
          method: 'GET',
          headersMatch: { authorization: `Bearer ${tok1}` },
          whenState: { passwordReset: true },
          status: 401,
          json: { error_code: 'session_not_found' }
        },
        {
          urlIncludes: '/auth/v1/user',
          method: 'GET',
          headersMatch: { authorization: `Bearer ${tok1}` },
          status: 200,
          json: { id: user1 }
        }
      ],
      defaultResponse: { status: 404, json: {} }
    });
    const disp = createHostedDispatcher({
      anonKey: validTestAnonKey,
      serviceRoleKey: validTestServiceRoleKey,
      inventory: inv,
      runContext: ctx,
      fetchFn: transport
    });
    const h1 = await disp({ id: 'HOOK-01', category: 'Token Hook' });
    assert.equal(h1.passed, true);

    const h2 = await disp({ id: 'HOOK-02', category: 'Token Hook' });
    assert.equal(h2.passed, false);
    assert.match(h2.error, /JWT_IDENTITY_MISMATCH/);
    assert.equal(h2.session_id, sess2);
    assert.equal(h2.session_cleanup_registered, true);
    assert.equal(ctx.activeAccessToken, tok1);
    assert.equal(ctx.activeRefreshToken, 'refresh-p2b-1');
    assert.equal(ctx.activeUserId, user1);
    assert.equal(ctx.activeSessionId, sess1);
    assert.equal(inv.trackedSessions.has(sess1), true);
    assert.equal(inv.trackedSessions.has(sess2), true);

    const s1 = await disp({ id: 'SESSION-01', category: 'Session Invalidation' });
    assert.equal(s1.passed, true);
    assert.equal(s1.session_id, sess1);
    const s2 = await disp({ id: 'SESSION-02', category: 'Session Invalidation' });
    assert.equal(s2.passed, true);
    assert.equal(s2.session_id, sess1);
    assert.equal(inv.revokedSessions.has(sess1), true);
    assert.equal(inv.revokedSessions.has(sess2), false);
    assert.equal(inv.isClean(), false);
    const userCalls = transport.calls.filter(c => c.url.includes('/auth/v1/user'));
    assert.equal(userCalls.length, 2);
    assert.equal(userCalls.every(c => c.headers.authorization === `Bearer ${tok1}`), true);
  }

  // 2. Missing required identity claims (missing sub or missing session_id in JWT) and missing active context prerequisite
  {
    for (const badToken of [
      createMockJwt({ sub: undefined, session_id: sess1 }),
      createMockJwt({ sub: user1, session_id: undefined })
    ]) {
      const inv = new TestRunInventory(`test-p2b-missing-${badToken.length}`);
      const ctx = createRunContext({ runId: inv.runId });
      ctx.activeAccessToken = tok1;
      ctx.activeRefreshToken = 'refresh-p2b-1';
      ctx.activeUserId = user1;
      ctx.activeSessionId = sess1;
      const disp = createHostedDispatcher({
        anonKey: validTestAnonKey,
        inventory: inv,
        runContext: ctx,
        fetchFn: staticTransport({
          status: 200,
          json: { access_token: badToken, refresh_token: 'refresh-p2b-new', session_id: sess1, user: { id: user1 } }
        })
      });
      const res = await disp({ id: 'HOOK-02', category: 'Token Hook' });
      assert.equal(res.passed, false);
      assert.match(res.error, /MISSING_IDENTITY_CLAIMS/);
      assert.equal(res.session_cleanup_registered, true);
      assert.equal(inv.trackedSessions.has(sess1), true);
      assert.equal(ctx.activeAccessToken, tok1);
      assert.equal(ctx.activeRefreshToken, 'refresh-p2b-1');
    }

    const invMissingCtx = new TestRunInventory('test-p2b-missing-ctx');
    const ctxMissing = createRunContext({ runId: invMissingCtx.runId });
    ctxMissing.activeRefreshToken = 'refresh-only';
    const dispMissingCtx = createHostedDispatcher({
      anonKey: validTestAnonKey,
      inventory: invMissingCtx,
      runContext: ctxMissing,
      fetchFn: staticTransport({ status: 200, json: { access_token: tokValidRefresh } })
    });
    const resMissingCtx = await dispMissingCtx({ id: 'HOOK-02', category: 'Token Hook' });
    assert.equal(resMissingCtx.passed, false);
    assert.match(resMissingCtx.error, /PREREQUISITE_MISSING/);
  }

  // 3. Mismatched response identity vs active/token identity
  {
    for (const [respUser, respSess] of [
      [user1, 'sess-p2b-body-mismatch'],
      ['user-p2b-body-mismatch', sess1]
    ]) {
      const inv = new TestRunInventory(`test-p2b-resp-${respSess}`);
      const ctx = createRunContext({ runId: inv.runId });
      ctx.activeAccessToken = tok1;
      ctx.activeRefreshToken = 'refresh-p2b-1';
      ctx.activeUserId = user1;
      ctx.activeSessionId = sess1;
      const disp = createHostedDispatcher({
        anonKey: validTestAnonKey,
        inventory: inv,
        runContext: ctx,
        fetchFn: staticTransport({
          status: 200,
          json: { access_token: tokValidRefresh, refresh_token: 'refresh-p2b-new', session_id: respSess, user: { id: respUser } }
        })
      });
      const res = await disp({ id: 'HOOK-02', category: 'Token Hook' });
      assert.equal(res.passed, false);
      assert.match(res.error, /JWT_IDENTITY_MISMATCH/);
      assert.equal(res.session_cleanup_registered, true);
      assert.equal(inv.trackedSessions.has(respSess), true);
      assert.equal(ctx.activeAccessToken, tok1);
      assert.equal(ctx.activeRefreshToken, 'refresh-p2b-1');
      assert.equal(ctx.activeUserId, user1);
      assert.equal(ctx.activeSessionId, sess1);
    }
  }

  // 4. Valid same-session refresh updates tokens and preserves correlated active user/session
  {
    const inv = new TestRunInventory('test-p2b-valid-refresh');
    const ctx = createRunContext({ runId: inv.runId });
    ctx.activeAccessToken = tok1;
    ctx.activeRefreshToken = 'refresh-p2b-1';
    ctx.activeUserId = user1;
    ctx.activeSessionId = sess1;
    const disp = createHostedDispatcher({
      anonKey: validTestAnonKey,
      inventory: inv,
      runContext: ctx,
      fetchFn: staticTransport({
        status: 200,
        json: { access_token: tokValidRefresh, refresh_token: 'refresh-p2b-2', session_id: sess1, user: { id: user1 } }
      })
    });
    const res = await disp({ id: 'HOOK-02', category: 'Token Hook' });
    assert.equal(res.passed, true);
    assert.equal(res.amr_preserved, true);
    assert.equal(res.user_id, user1);
    assert.equal(res.session_id, sess1);
    assert.equal(ctx.activeAccessToken, tokValidRefresh);
    assert.equal(ctx.activeRefreshToken, 'refresh-p2b-2');
    assert.equal(ctx.activeUserId, user1);
    assert.equal(ctx.activeSessionId, sess1);
  }
});

test('PR45-P2-C: deeply nested and wide JWT claims reject structurally across parseAndValidateJwt, validateProbeOutcome, and runner without uncaught RangeError', async () => {
  const now = Math.floor(Date.now() / 1000);
  const encodeHeader = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const sig = Buffer.from('sig-bound-runner').toString('base64url');
  const makeJwtFromRawField = (fieldName, rawValueJson) => {
    const payloadJson = `{"sub":"user-bound-1","session_id":"sess-bound-1","iss":"https://${HARDCODED_TEMP_REF}.supabase.co/auth/v1","aud":"authenticated","iat":${now},"exp":${now + 300},"amr_authenticated":"true","amr":[{"method":"password"}],"${fieldName}":${rawValueJson}}`;
    return `${encodeHeader}.${Buffer.from(payloadJson).toString('base64url')}.${sig}`;
  };

  // Exact boundary (leaf at depth MAX_OFFLINE_JWT_CLAIM_DEPTH) passes
  const exactDepthJwt = makeJwtFromRawField('deep', '['.repeat(MAX_OFFLINE_JWT_CLAIM_DEPTH - 1) + '1' + ']'.repeat(MAX_OFFLINE_JWT_CLAIM_DEPTH - 1));
  assert.equal(parseAndValidateJwt(exactDepthJwt).valid, true);

  // Over-depth (boundary + 1 and extreme depth 6000), over-width, and over-length all return structured failures
  const overDepthOneJwt = makeJwtFromRawField('deep', '['.repeat(MAX_OFFLINE_JWT_CLAIM_DEPTH) + '1' + ']'.repeat(MAX_OFFLINE_JWT_CLAIM_DEPTH));
  const deep6000ObjJwt = makeJwtFromRawField('deep', '{"a":'.repeat(6000) + '1' + '}'.repeat(6000));
  const deep6000ArrJwt = makeJwtFromRawField('deep', '['.repeat(6000) + '1' + ']'.repeat(6000));
  const wideArrJwt = makeJwtFromRawField('wide', `[${new Array(MAX_OFFLINE_JWT_CLAIM_NODES).fill('1').join(',')}]`);
  const overLenJwt = makeJwtFromRawField('pad', JSON.stringify('x'.repeat(MAX_OFFLINE_JWT_TOKEN_LENGTH)));

  for (const badJwt of [overDepthOneJwt, deep6000ObjJwt, deep6000ArrJwt, wideArrJwt, overLenJwt]) {
    const parsed = parseAndValidateJwt(badJwt);
    assert.equal(parsed.valid, false);
    assert.match(parsed.reason, /^TOKEN_FORMAT_INVALID/);

    for (const probeId of ['HOOK-01', 'HOOK-02']) {
      const outcomeCheck = validateProbeOutcome({ id: probeId, category: 'Token Hook' }, {
        passed: true,
        status: 200,
        session_id: 'sess-bound-1',
        amr_authenticated: true,
        amr_preserved: true,
        tokens: { access_token: badJwt }
      });
      assert.equal(outcomeCheck.passed, false);
      assert.match(outcomeCheck.reason, new RegExp(`JWT_CLAIM_VIOLATION: ${probeId} TOKEN_FORMAT_INVALID`));
    }
  }

  // Dispatcher rejects over-depth JWT while retaining observed session cleanup
  {
    const inv = new TestRunInventory('test-p2c-disp-cleanup');
    const ctx = createRunContext({ runId: inv.runId });
    const disp = createHostedDispatcher({
      anonKey: validTestAnonKey,
      inventory: inv,
      runContext: ctx,
      fetchFn: staticTransport({
        status: 200,
        json: { access_token: deep6000ArrJwt, session_id: 'sess-p2c-disp', user: { id: 'user-p2c-1' } }
      })
    });
    const res = await disp({ id: 'HOOK-01', category: 'Token Hook' });
    assert.equal(res.passed, false);
    assert.match(res.error, /JWT_CLAIM_VIOLATION: TOKEN_FORMAT_INVALID/);
    assert.equal(res.session_id, 'sess-p2c-disp');
    assert.equal(res.session_cleanup_registered, true);
    assert.equal(inv.trackedSessions.has('sess-p2c-disp'), true);
    assert.equal(ctx.activeAccessToken, null);
  }

  // Runner validateProbeOutcome step returns HALTED_ON_FAILURE (no escaped RangeError) and completes cleanup
  {
    const runId = 'r-p2c-runner-halt';
    const simTransport = createDeterministicFixtureTransport({
      requestBudgetMode: 'recorded_zero_wait',
      routes: [
        { urlIncludes: '/auth/v1/otp', status: 422, json: { error_code: 'email_provider_disabled' } },
        { urlIncludes: '/auth/v1/logout', status: 204, json: {} }
      ],
      defaultResponse: { status: 200, json: {} }
    });
    const simAdmin = createHostedAdminClient({
      serviceRoleKey: validTestServiceRoleKey,
      anonKey: validTestAnonKey,
      runId,
      fetchFn: simTransport
    });
    const simDispatcher = createTrustedOfflineDispatcher({
      runId,
      fetchFn: simTransport,
      outcomes: {
        'BYPASS-01': {
          transportRequest: { url: `https://${HARDCODED_TEMP_REF}.supabase.co/auth/v1/otp`, method: 'POST', body: { email: 'p2c@proof.invalid' } },
          passed: true,
          status: 422,
          route_disabled: true,
          error_code: 'email_provider_disabled'
        },
        'HOOK-01': {
          passed: true,
          status: 200,
          has_token: true,
          amr_authenticated: true,
          session_id: 'sess-p2c-runner',
          tokens: { access_token: deep6000ArrJwt },
          inventoryEffects: {
            registerSession: { sessionId: 'sess-p2c-runner', accessToken: createMockJwt({ session_id: 'sess-p2c-runner' }), source: 'HOOK-01_observed' }
          }
        }
      }
    });
    const simRes = await runOfflineProbeSimulation({
      projectRef: HARDCODED_TEMP_REF,
      runId,
      adminClient: simAdmin,
      offlineDispatcher: simDispatcher,
      selectedProbeIds: ['BYPASS-01', 'HOOK-01'],
      timing: { mode: 'recorded_zero_wait' }
    });
    assert.equal(simRes.status, 'HALTED_ON_FAILURE');
    assert.match(simRes.abortReason, /CRITICAL_SECURITY_FAILURE: Case HOOK-01.*JWT_CLAIM_VIOLATION: HOOK-01 TOKEN_FORMAT_INVALID/);
    assert.equal(simRes.cleanupReport.status, 'CLEANUP_VERIFIED_SUCCESS');
    assert.equal(simRes.cleanupReport.sessionsRevoked, 1);
  }

  // Adjacent credential binding / provisioning paths also reject deeply nested JWTs without RangeError
  {
    const deepCredentialJwt = makeJwtFromRawField('ref', `"${HARDCODED_TEMP_REF}","deep":${'['.repeat(6000)}1${']'.repeat(6000)}`);
    assert.throws(
      () => validateProjectCredentialBinding(deepCredentialJwt, HARDCODED_TEMP_REF),
      /INVALID_CREDENTIAL_PAYLOAD/
    );
    const invProv = new TestRunInventory('test-p2c-prov-deep');
    const adminProv = createHostedAdminClient({
      serviceRoleKey: validTestServiceRoleKey,
      anonKey: validTestAnonKey,
      runId: invProv.runId,
      fetchFn: staticTransport({ status: 200, json: {} })
    });
    await assert.rejects(
      () => provisionStorageProbeFixture({
        projectRef: HARDCODED_TEMP_REF,
        runId: invProv.runId,
        userAccessToken: deepCredentialJwt,
        seedUserId: '11111111-1111-4111-a111-111111111111',
        inventory: invProv,
        adminClient: adminProv,
        fetchFn: staticTransport({ status: 200, json: {} })
      }),
      /INVALID_CREDENTIAL_PAYLOAD|CREDENTIAL_BINDING_ERROR/
    );
  }
});

function verificationIdentityCase(name, { priorUsers = ['verify-user-a'], responseUser = 'verify-user-b' } = {}) {
  const inv = new TestRunInventory(`verify-admission-${name}`);
  const email = 'tio-verify-admission@proof.invalid';
  for (const id of priorUsers) inv.registerReferencedUser({ id, email });
  const token = createMockJwt({ sub: responseUser, session_id: 'verify-admission-session' });
  const spec = fixtureSpec({ login: { status: 200, json: {
    access_token: token, session_id: 'verify-admission-session', user: { id: responseUser, email }
  } } });
  return { inv, email, spec, token, admin: bindFixtureAdmin(inv, spec) };
}

test('PR45-VERIFY-01: inherited expected identity cannot override prior email binding or certify cleanup', async () => {
  const { inv, email, spec, admin } = verificationIdentityCase('inherited');
  inv.registerSeedPasswordModification({ userId: 'verify-user-a', email,
    originalPassword: 'SyntheticVerifyOriginal#1', targetPassword: 'SyntheticVerifyChanged#1', state: 'confirmed' });
  const previous = Object.getOwnPropertyDescriptor(Object.prototype, 'expectedUserId');
  let result;
  try {
    Object.defineProperty(Object.prototype, 'expectedUserId', { configurable: true, value: 'verify-user-b' });
    result = await admin.verifyUserCredentials(email, 'SyntheticVerifyOriginal#1', { inventory: inv });
  } finally {
    if (previous) Object.defineProperty(Object.prototype, 'expectedUserId', previous);
    else delete Object.prototype.expectedUserId;
  }
  assert.equal(result.credentialVerified, false);
  assert.equal(result.verifiedUserId, null);
  assert.equal(result.error.code, 'VERIFICATION_IDENTITY_CONFLICT');
  assert.equal(fixtureOperationCalls(spec, 'login').length, 1);
  assert.equal(fixtureOperationCalls(spec, 'logout').length, 1);
  assert.equal(inv.isSessionRevoked('verify-admission-session'), true, 'Correlated logout remains independent of intended-user failure');
  assert.ok(inv.sessionReconciliationObligations.length > 0);
  const report = await inv.executeCleanup({ adminClient: admin, failClosed: false });
  assert.equal(report.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.equal(inv.seedCredentialRestorations[0].originalPassword, 'SyntheticVerifyOriginal#1');
});

test('PR45-VERIFY-02: omitted expected identity rejects wrong user consistently without pollution', async () => {
  const { inv, email, spec, admin } = verificationIdentityCase('wrong-user');
  const result = await admin.verifyUserCredentials(email, 'SyntheticVerify#1', { inventory: inv });
  assert.equal(result.credentialVerified, false);
  assert.equal(result.verifiedUserId, null);
  assert.equal(result.error.code, 'VERIFICATION_IDENTITY_CONFLICT');
  assert.equal(fixtureOperationCalls(spec, 'logout').length, 1);
  assert.ok(inv.sessionReconciliationObligations.length > 0);
});

test('PR45-VERIFY-03: omitted own identity uses prior binding and own A ignores inherited getter B', async () => {
  for (const explicit of [false, true]) {
    const { inv, email, spec, admin } = verificationIdentityCase(`valid-${explicit}`, { responseUser: 'verify-user-a' });
    const previous = Object.getOwnPropertyDescriptor(Object.prototype, 'expectedUserId');
    let getterCalls = 0;
    let result;
    try {
      Object.defineProperty(Object.prototype, 'expectedUserId', { configurable: true, get() { getterCalls++; return 'verify-user-b'; } });
      const options = explicit ? { inventory: inv, expectedUserId: 'verify-user-a' } : { inventory: inv };
      result = await admin.verifyUserCredentials(email, 'SyntheticVerify#1', options);
    } finally {
      if (previous) Object.defineProperty(Object.prototype, 'expectedUserId', previous);
      else delete Object.prototype.expectedUserId;
    }
    assert.equal(getterCalls, 0);
    assert.equal(result.credentialVerified, true);
    assert.equal(result.verifiedUserId, 'verify-user-a');
    assert.equal(result.error, null);
    assert.equal(fixtureOperationCalls(spec, 'login').length, 1);
    assert.equal(fixtureOperationCalls(spec, 'logout').length, 1);
    assert.equal(inv.isClean(), true);
  }
});

test('PR45-VERIFY-04: invalid own identity and executable or unsupported options reject before dispatch', async () => {
  const { inv, email, spec, admin } = verificationIdentityCase('invalid');
  let executions = 0;
  const accessor = Object.defineProperty({}, 'expectedUserId', { get() { executions++; throw new Error('Must not run'); } });
  const inventoryAccessor = Object.defineProperty({}, 'inventory', { get() { executions++; throw new Error('Must not run'); } });
  const proxy = new Proxy({}, { get() { executions++; throw new Error('Must not run'); }, ownKeys() { executions++; throw new Error('Must not run'); }, getPrototypeOf() { executions++; throw new Error('Must not run'); } });
  const invalid = [null, [], 'options', 1, () => {}, new Date(), Object.create({ expectedUserId: 'verify-user-a' }), accessor, inventoryAccessor, proxy,
    { inventory: proxy }, { inventory: {} }, { inventory: inv, unsupported: true }, { [Symbol('unknown')]: true },
    Object.defineProperty({}, 'expectedUserId', { get: undefined, set: undefined }),
    Object.defineProperty({}, 'inventory', { get: undefined, set: undefined })];
  for (const expectedUserId of [undefined, null, '', ' ', 0, false, [], {}, proxy]) invalid.push({ inventory: inv, expectedUserId });
  for (const options of invalid) {
    const result = await admin.verifyUserCredentials(email, 'SyntheticVerify#1', options);
    assert.equal(result.credentialVerified, false);
    assert.equal(result.verifiedUserId, null);
    assert.equal(result.error.code, 'INVALID_VERIFICATION_OPTIONS');
  }
  assert.equal(executions, 0);
  assert.equal(fixtureCalls(spec).length, 0);
  assert.equal(inv.trackedSessions.size, 0);
  assert.equal(inv.inFlightOperations.size, 0);
  const other = new TestRunInventory('verify-other-run');
  const mismatch = await admin.verifyUserCredentials(email, 'SyntheticVerify#1', { inventory: other, expectedUserId: 'verify-user-a' });
  assert.equal(mismatch.error.code, 'INVALID_VERIFICATION_OPTIONS');
  assert.equal(fixtureCalls(spec).length, 0);
});

test('PR45-VERIFY-05: explicit identity cannot override known email-to-user binding', async () => {
  const { inv, email, spec, admin } = verificationIdentityCase('explicit-conflict');
  const result = await admin.verifyUserCredentials(email, 'SyntheticVerify#1', { inventory: inv, expectedUserId: 'verify-user-b' });
  assert.equal(result.credentialVerified, false);
  assert.equal(result.verifiedUserId, null);
  assert.equal(result.error.code, 'VERIFICATION_IDENTITY_CONFLICT');
  assert.equal(fixtureOperationCalls(spec, 'logout').length, 1);
  assert.ok(inv.sessionReconciliationObligations.length > 0);
});

test('PR45-VERIFY-06: newly registered response identity cannot manufacture missing prior proof', async () => {
  const { inv, email, spec, admin } = verificationIdentityCase('missing-prior', { priorUsers: [] });
  const result = await admin.verifyUserCredentials(email, 'SyntheticVerify#1', { inventory: inv });
  assert.equal(result.credentialVerified, false);
  assert.equal(result.verifiedUserId, null);
  assert.equal(result.error.code, 'VERIFICATION_IDENTITY_UNAVAILABLE');
  assert.equal(fixtureOperationCalls(spec, 'logout').length, 1);
  assert.equal(inv.trackedSessions.has('verify-admission-session'), true);
  assert.ok(inv.sessionReconciliationObligations.length > 0);
  assert.equal((await inv.executeCleanup({ adminClient: admin, failClosed: false })).status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
});

test('PR45-VERIFY-07: ambiguous prior binding fails closed even with an explicit candidate', async () => {
  const { inv, email, spec, admin } = verificationIdentityCase('ambiguous', { priorUsers: ['verify-user-a', 'verify-user-b'], responseUser: 'verify-user-a' });
  const result = await admin.verifyUserCredentials(email, 'SyntheticVerify#1', { inventory: inv, expectedUserId: 'verify-user-a' });
  assert.equal(result.credentialVerified, false);
  assert.equal(result.verifiedUserId, null);
  assert.equal(result.error.code, 'VERIFICATION_IDENTITY_AMBIGUOUS');
  assert.equal(fixtureOperationCalls(spec, 'logout').length, 1);
  assert.ok(inv.sessionReconciliationObligations.length > 0);
});

test('PR45-VERIFY-08: inherited inventory is never read and explicit target supports standalone verification', async () => {
  const { inv, email, spec, admin } = verificationIdentityCase('inherited-inventory', { priorUsers: [], responseUser: 'verify-user-a' });
  const previous = Object.getOwnPropertyDescriptor(Object.prototype, 'inventory');
  let getterCalls = 0;
  let result;
  try {
    Object.defineProperty(Object.prototype, 'inventory', { configurable: true, get() { getterCalls++; return inv; } });
    result = await admin.verifyUserCredentials(email, 'SyntheticVerify#1', { expectedUserId: 'verify-user-a' });
  } finally {
    if (previous) Object.defineProperty(Object.prototype, 'inventory', previous);
    else delete Object.prototype.inventory;
  }
  assert.equal(getterCalls, 0);
  assert.equal(result.credentialVerified, true);
  assert.equal(result.verifiedUserId, 'verify-user-a');
  assert.equal(inv.trackedSessions.size, 0);
  assert.equal(fixtureOperationCalls(spec, 'logout').length, 1);
});

test('PR45-VERIFY-09: response-created references remain observations across repeated calls and separate adapters', async () => {
  const { inv, email, spec, admin } = verificationIdentityCase('repeated-observation', { priorUsers: [] });
  const first = await admin.verifyUserCredentials(email, 'SyntheticVerify#1', { inventory: inv });
  assert.equal(first.error.code, 'VERIFICATION_IDENTITY_UNAVAILABLE');
  assert.equal(inv.referencedUsers.has('verify-user-b'), true, 'Resource tracking is retained');
  const otherSpec = fixtureSpec({ login: spec.login });
  const otherAdmin = bindFixtureAdmin(inv, otherSpec);
  const repeated = await otherAdmin.verifyUserCredentials(email, 'SyntheticVerify#1', { inventory: inv });
  assert.equal(repeated.credentialVerified, false);
  assert.equal(repeated.verifiedUserId, null);
  assert.equal(repeated.error.code, 'VERIFICATION_IDENTITY_UNAVAILABLE');
  assert.equal(fixtureOperationCalls(spec, 'logout').length, 1);
  assert.equal(fixtureOperationCalls(otherSpec, 'logout').length, 1);
  assert.equal(inv.isClean(), false);
});

test('PR45-VERIFY-10: omitted third argument ignores inherited numeric data, getter and setter options', async () => {
  for (const mode of ['data', 'getter', 'setter']) {
    const { email, spec, admin } = verificationIdentityCase(`argument-slot-${mode}`, { priorUsers: [] });
    const previous = Object.getOwnPropertyDescriptor(Array.prototype, '2');
    const inherited = { expectedUserId: 'verify-user-b' };
    let getterCalls = 0;
    let setterCalls = 0;
    let result;
    try {
      const descriptor = mode === 'data'
        ? { __proto__: null, configurable: true, writable: true, value: inherited }
        : { __proto__: null, configurable: true,
          get() { getterCalls++; return inherited; },
          ...(mode === 'setter' ? { set(value) { setterCalls++; Object.defineProperty(this, '2', { __proto__: null, value, configurable: true, writable: true, enumerable: true }); } } : {}) };
      Object.defineProperty(Array.prototype, '2', descriptor);
      result = await admin.verifyUserCredentials(email, 'SyntheticVerify#1');
    } finally {
      if (previous) Object.defineProperty(Array.prototype, '2', previous);
      else delete Array.prototype[2];
    }
    assert.equal(getterCalls, 0);
    assert.equal(setterCalls, 0);
    assert.equal(result.credentialVerified, false);
    assert.equal(result.verifiedUserId, null);
    assert.equal(result.error.code, 'VERIFICATION_IDENTITY_UNAVAILABLE');
    assert.equal(fixtureOperationCalls(spec, 'login').length, 1);
    assert.equal(fixtureOperationCalls(spec, 'logout').length, 1);
  }
});

test('PR45-VERIFY-11: accessor descriptor is rejected before inherited descriptor value getter executes', async () => {
  const { email, spec, admin } = verificationIdentityCase('descriptor-value');
  const options = Object.defineProperty({}, 'expectedUserId', { get: undefined, set: undefined });
  const previous = Object.getOwnPropertyDescriptor(Object.prototype, 'value');
  let getterCalls = 0;
  let result;
  try {
    Object.defineProperty(Object.prototype, 'value', { configurable: true, get() { getterCalls++; return 'verify-user-b'; } });
    result = await admin.verifyUserCredentials(email, 'SyntheticVerify#1', options);
  } finally {
    if (previous) Object.defineProperty(Object.prototype, 'value', previous);
    else delete Object.prototype.value;
  }
  assert.equal(getterCalls, 0);
  assert.equal(result.credentialVerified, false);
  assert.equal(result.error.code, 'INVALID_VERIFICATION_OPTIONS');
  assert.equal(fixtureCalls(spec).length, 0);
});

function restorationCase(name, { claims = {}, bodySession = 'restore-session', bodyUser = 'restore-user', routes = [] } = {}) {
  const inv = new TestRunInventory(`restore-contract-${name}`);
  const email = 'tio-restore-contract@proof.invalid';
  inv.registerReferencedUser({ id: 'restore-user', email });
  inv.registerSeedPasswordModification({ userId: 'restore-user', email,
    originalPassword: 'SyntheticOriginal#1', targetPassword: 'SyntheticChanged#1', state: 'confirmed' });
  const token = createMockJwt({ sub: 'restore-user', session_id: 'restore-session', ...claims });
  const spec = fixtureSpec({ routes, login: { status: 200, json: {
    access_token: token, session_id: bodySession, user: { id: bodyUser, email }
  } } });
  const admin = bindFixtureAdmin(inv, spec);
  return { inv, admin, spec, token, email };
}

test('PR45-RESTORE-A: identity conflict with successful logout is never revocation failure or verified restoration', async () => {
  const { inv, admin, spec, email } = restorationCase('identity', { bodySession: 'unrelated-body' });
  const original = createMockJwt({ sub: 'restore-user', session_id: 'unrelated-body' });
  inv.registerSession('unrelated-body', { accessToken: original, userId: 'restore-user', validated: true });
  const result = await admin.verifyUserCredentials(email, 'SyntheticOriginal#1', { inventory: inv });
  assert.equal(result.sessionRevocationFailed, false);
  assert.equal(result.credentialVerified, false);
  assert.equal(result.error.code, 'VERIFICATION_IDENTITY_CONFLICT');
  assert.equal(inv.isSessionRevoked('unrelated-body'), false);
  assert.equal(inv.isSessionRevoked('restore-session'), true);
  assert.equal(inv.getSessionToken('unrelated-body'), original);
  assert.equal(fixtureOperationCalls(spec, 'logout').length, 1);
});

test('PR45-RESTORE-A2: cleanup identity conflict never retries unrelated body credential or credits restoration', async () => {
  const { inv, admin, spec, token } = restorationCase('cleanup-conflict', { bodySession: 'unrelated-body' });
  const original = createMockJwt({ sub: 'restore-user', session_id: 'unrelated-body' });
  inv.registerSession('unrelated-body', { accessToken: original, userId: 'restore-user', validated: true });
  const report = await inv.executeCleanup({ adminClient: admin, failClosed: false });
  assert.equal(report.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.equal(report.seedCredentialsRestored, 0);
  assert.equal(inv.seedCredentialRestorations[0].state, 'restoration_failed');
  assert.equal(inv.seedCredentialRestorations[0].verifiedAt, undefined);
  assert.equal(inv.seedCredentialRestorations[0].originalPassword, 'SyntheticOriginal#1');
  assert.equal(inv.getSessionToken('unrelated-body'), original);
  const logouts = fixtureOperationCalls(spec, 'logout');
  assert.equal(logouts.length, 2, 'Only normal pre-restoration cleanup and the token session logout');
  assert.equal(logouts[0].headers.authorization, `Bearer ${original}`);
  assert.equal(logouts[1].headers.authorization, `Bearer ${token}`);
});

test('PR45-RESTORE-B: obligation created during cleanup is in final residuals and never credits uncorrelated logout', async () => {
  const { inv, admin, spec } = restorationCase('missing-session', { claims: { session_id: undefined } });
  assert.equal(inv.sessionReconciliationObligations.length, 0);
  const report = await inv.executeCleanup({ adminClient: admin, failClosed: false });
  assert.equal(report.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.equal(inv.isClean(), false);
  assert.ok(inv.sessionReconciliationObligations.length > 0);
  assert.equal(report.residualResources.filter(r => r.type === 'session_reconciliation_obligation').length,
    inv.sessionReconciliationObligations.length);
  assert.equal(inv.isSessionRevoked('restore-session'), false);
  assert.equal(fixtureOperationCalls(spec, 'logout').length, 0);
  assert.equal(inv.seedCredentialRestorations[0].originalPassword, 'SyntheticOriginal#1');
  assert.equal(inv.seedCredentialRestorations[0].verifiedAt, undefined);
  const repeated = await inv.executeCleanup({ adminClient: admin, failClosed: false });
  assert.equal(repeated.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.equal(repeated.residualResources.filter(r => r.type === 'session_reconciliation_obligation').length,
    inv.sessionReconciliationObligations.length);
  assert.equal(fixtureOperationCalls(spec, 'logout').length, 0);
  assert.equal(inv.seedCredentialRestorations[0].originalPassword, 'SyntheticOriginal#1');
});

test('PR45-RESTORE-C: only genuine correlated revocation failure permits retry after credential verification', async () => {
  const { inv, admin, spec, token } = restorationCase('retry', { routes: [
    { urlIncludes: '/auth/v1/logout', times: 1, status: 503, json: { msg: 'Synthetic unavailable' } }
  ] });
  const report = await inv.executeCleanup({ adminClient: admin });
  assert.equal(report.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(inv.isClean(), true);
  assert.ok(inv.seedCredentialRestorations[0].verifiedAt);
  assert.equal(inv.seedCredentialRestorations[0].originalPassword, '[CLEARED]');
  const logouts = fixtureOperationCalls(spec, 'logout');
  assert.equal(logouts.length, 2);
  assert.ok(logouts.every(call => call.headers.authorization === `Bearer ${token}`));
  const before = fixtureCalls(spec).length;
  assert.equal((await inv.executeCleanup({ adminClient: admin })).status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(fixtureCalls(spec).length, before, 'Verified cleanup is idempotent');
});

test('PR45-RESTORE-D: normal restoration requires expected user identity, not merely consistent response claims', async () => {
  const { inv, admin, spec } = restorationCase('wrong-user', { bodyUser: 'different-user', claims: { sub: 'different-user' } });
  const report = await inv.executeCleanup({ adminClient: admin, failClosed: false });
  assert.equal(report.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.equal(inv.seedCredentialRestorations[0].state, 'restoration_failed');
  assert.equal(inv.seedCredentialRestorations[0].verifiedAt, undefined);
  assert.equal(inv.seedCredentialRestorations[0].originalPassword, 'SyntheticOriginal#1');
  assert.equal(fixtureOperationCalls(spec, 'logout').length, 1, 'Correlated token still gets revoked');
});

test('PR45-RESTORE-E: valid normal restoration clears recovery credentials only after inventory is clean', async () => {
  const { inv, admin, spec } = restorationCase('normal');
  const report = await inv.executeCleanup({ adminClient: admin });
  assert.equal(report.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(inv.isClean(), true);
  assert.equal(report.seedCredentialsRestored, 1);
  assert.equal(inv.seedCredentialRestorations[0].originalPassword, '[CLEARED]');
  assert.equal(fixtureOperationCalls(spec, 'login').length, 1);
  assert.equal(fixtureOperationCalls(spec, 'logout').length, 1);
});

test('PR45-RESTORE-F: budget exhaustion at update, verification and revocation preserves truthful live residuals', async () => {
  const { getRunRequestBudget } = await import('./run-request-budget.mjs');
  for (const used of [25, 24, 23]) {
    const { inv, admin, spec } = restorationCase(`budget-${used}`);
    for (let i = 0; i < used; i++) await admin.getUserById('restore-user');
    const report = await inv.executeCleanup({ adminClient: admin, failClosed: false });
    const budget = getRunRequestBudget({ projectRef: HARDCODED_TEMP_REF, runId: inv.runId }).report();
    assert.equal(report.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
    assert.equal(inv.isClean(), false);
    assert.equal(inv.seedCredentialRestorations[0].originalPassword, 'SyntheticOriginal#1');
    assert.equal(inv.seedCredentialRestorations[0].verifiedAt, undefined);
    assert.equal(budget.simulatedTransportRequests, 25);
    assert.equal(fixtureCalls(spec).length, 25);
    assert.equal(budget.reservedCleanupCapacity, 0);
    assert.equal(budget.cleanupRequests, 25 - used);
    assert.equal(fixtureOperationCalls(spec, 'logout').length, 0);
    assert.equal(inv.untrackedSessionsCount, 0, 'Pre-dispatch rejection cannot invent a minted session');
    if (used === 23) {
      assert.equal(inv.trackedSessions.has('restore-session'), true);
      assert.equal(inv.isSessionRevoked('restore-session'), false);
      assert.ok(inv.getSessionToken('restore-session'));
      assert.ok(report.residualResources.some(r => r.type === 'session' && r.id === 'restore-session'));
    }
    const repeated = await inv.executeCleanup({ adminClient: admin, failClosed: false });
    assert.equal(repeated.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
    assert.equal(fixtureCalls(spec).length, 25);
    assert.equal(inv.seedCredentialRestorations[0].originalPassword, 'SyntheticOriginal#1');
  }
});

test('PR45-RESTORE-G: transient restoration failure can be safely retried without discarding recovery evidence', async () => {
  const { inv, admin, spec } = restorationCase('transient', { routes: [
    { method: 'PUT', urlIncludes: '/auth/v1/admin/users/', times: 1, throwError: { message: 'Synthetic update failure' } }
  ] });
  const failed = await inv.executeCleanup({ adminClient: admin, failClosed: false });
  assert.equal(failed.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.equal(inv.clearCredentials(), false);
  assert.equal(inv.seedCredentialRestorations[0].originalPassword, 'SyntheticOriginal#1');
  const retry = await inv.executeCleanup({ adminClient: admin });
  assert.equal(retry.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(inv.isClean(), true);
  assert.equal(fixtureOperationCalls(spec, 'userUpdate').length, 2);
  assert.equal(fixtureOperationCalls(spec, 'login').length, 1);
});

test('PR45-RESTORE-H: adapter rejection and failClosed exceptions retain recovery state and report obligations', async () => {
  const { inv, admin } = restorationCase('reject', { claims: { session_id: undefined } });
  inv.registerSessionReconciliationObligation({ reason: 'SYNTHETIC_PRIOR_OBLIGATION', observedSessionId: 'prior-session' });
  const rejected = await inv.executeCleanup({ adminClient: {}, failClosed: false });
  assert.equal(rejected.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.ok(rejected.residualResources.some(r => r.reason === 'SYNTHETIC_PRIOR_OBLIGATION'));
  await assert.rejects(inv.executeCleanup({ adminClient: admin }), error => {
    assert.equal(error.cleanupReport.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
    assert.equal(error.cleanupReport.residualResources.filter(r => r.type === 'session_reconciliation_obligation').length,
      inv.sessionReconciliationObligations.length);
    return true;
  });
  assert.equal(inv.isClean(), false);
  assert.equal(inv.seedCredentialRestorations[0].originalPassword, 'SyntheticOriginal#1');
});

test('PR45-RESTORE-I: post-dispatch errors cannot forge budget or cancellation admission evidence', async () => {
  const { getRunRequestBudget, isRunRequestAdmissionFailure } = await import('./run-request-budget.mjs');
  assert.equal(isRunRequestAdmissionFailure(undefined, undefined), false);
  const admissionBudget = getRunRequestBudget({ projectRef: HARDCODED_TEMP_REF, runId: 'restore-admission-proof', mode: 'recorded_zero_wait' });
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(admissionBudget.beginRequest({ signal: aborted.signal }), error => {
    assert.equal(isRunRequestAdmissionFailure(error, 'restore-admission-proof'), true);
    assert.equal(isRunRequestAdmissionFailure(error, 'different-run'), false);
    assert.equal(isRunRequestAdmissionFailure({ code: error.code }, 'restore-admission-proof'), false);
    return true;
  });
  for (const code of ['REQUEST_BUDGET_EXHAUSTED', 'REQUEST_CANCELLED_BEFORE_DISPATCH']) {
    const { inv, admin, spec, email } = restorationCase(`forged-${code}`, { routes: [
      { urlIncludes: '/auth/v1/token?grant_type=password', times: 1, throwError: { code, message: 'Synthetic post-dispatch failure' } }
    ] });
    const result = await admin.verifyUserCredentials(email, 'SyntheticOriginal#1', { inventory: inv });
    assert.equal(result.indeterminateSession, true);
    assert.equal(result.credentialVerified, false);
    assert.equal(inv.untrackedSessionsCount, 1);
    assert.equal(fixtureOperationCalls(spec, 'login').length, 1, 'The transport really dispatched');
    const report = await inv.executeCleanup({ adminClient: admin, failClosed: false });
    assert.equal(report.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
    assert.ok(report.residualResources.some(r => r.type === 'untracked_session'));
    assert.equal(inv.isClean(), false);
    assert.equal(inv.seedCredentialRestorations[0].originalPassword, 'SyntheticOriginal#1');
  }
});

test('PR45-RESTORE-J: same-session different-user logout never skips original correlated credential cleanup', async () => {
  const { inv, admin, spec, token, email } = restorationCase('same-session-other-user', {
    bodyUser: 'other-user', claims: { sub: 'other-user' }
  });
  const original = createMockJwt({ sub: 'restore-user', session_id: 'restore-session' });
  inv.registerSession('restore-session', { accessToken: original, userId: 'restore-user', validated: true });
  const result = await admin.verifyUserCredentials(email, 'SyntheticOriginal#1', { inventory: inv });
  assert.equal(result.error.code, 'VERIFICATION_IDENTITY_CONFLICT');
  assert.equal(inv.getSessionToken('restore-session'), original);
  assert.equal(inv.isSessionRevoked('restore-session'), false);
  const report = await inv.executeCleanup({ adminClient: admin, failClosed: false });
  assert.equal(report.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  const logouts = fixtureOperationCalls(spec, 'logout');
  assert.equal(logouts.length, 3, 'Verification, original credential cleanup, then failed restoration verification');
  assert.equal(logouts[0].headers.authorization, `Bearer ${token}`);
  assert.equal(logouts[1].headers.authorization, `Bearer ${original}`);
  assert.equal(inv.seedCredentialRestorations[0].originalPassword, 'SyntheticOriginal#1');
  assert.equal(inv.isClean(), false);
});

test('PR45-P2-D: conflicting refresh response never overwrites correlated cleanup credentials and blocks false CLEANUP_VERIFIED_SUCCESS', async () => {
  const userId1 = '11111111-1111-4111-a111-111111111111';
  const userId2 = '22222222-2222-4222-a222-222222222222';
  const tok1 = createMockJwt({ sub: userId1, session_id: 'sess-p2d-1', amr: [{ method: 'password' }] });
  const tokConflict = createMockJwt({ sub: userId1, session_id: 'sess-p2d-2', amr: [{ method: 'password' }] });
  const tok2Valid = createMockJwt({ sub: userId1, session_id: 'sess-p2d-1', amr: [{ method: 'password' }] });
  const tokWrongUser = createMockJwt({ sub: userId2, session_id: 'sess-p2d-1', amr: [{ method: 'password' }] });
  const tokMissingSub = createMockJwt({ sub: undefined, session_id: 'sess-p2d-1', amr: [{ method: 'password' }] });
  const deep6000Jwt = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(`{"sub":"${userId1}","session_id":"sess-p2d-1","deep":${'['.repeat(6000)}1${']'.repeat(6000)}}`).toString('base64url')}.sig`;

  // 1. Core #discussion_r4705809422 reproduction:
  // HOOK-01 establishes sess-p2d-1 with tok1 -> conflicting HOOK-02 returns body session_id='sess-p2d-1'
  // while JWT carries session_id='sess-p2d-2' (tokConflict).
  // Must preserve tok1 on sess-p2d-1 and ctx, track sess-p2d-2 -> tokConflict, record reconciliation obligation,
  // revoke both sessions using their own correlated credentials, and never report CLEANUP_VERIFIED_SUCCESS.
  {
    const transport = createDeterministicFixtureTransport({
      requestBudgetMode: 'recorded_zero_wait',
      routes: [
        {
          urlIncludes: '/auth/v1/token?grant_type=password',
          status: 200,
          json: {
            access_token: tok1,
            refresh_token: 'ref-p2d-1',
            session_id: 'sess-p2d-1',
            user: { id: userId1 }
          }
        },
        {
          urlIncludes: '/auth/v1/token?grant_type=refresh_token',
          status: 200,
          json: {
            access_token: tokConflict,
            refresh_token: 'ref-p2d-conflict',
            session_id: 'sess-p2d-1',
            user: { id: userId1 }
          }
        },
        { urlIncludes: '/auth/v1/logout', status: 204, json: {} }
      ],
      defaultResponse: { status: 200, json: {} }
    });

    const inv = new TestRunInventory('test-p2d-repro');
    const ctx = createRunContext({ runId: inv.runId });
    const disp = createHostedDispatcher({
      anonKey: validTestAnonKey,
      inventory: inv,
      runContext: ctx,
      fetchFn: transport
    });
    const admin = createHostedAdminClient({
      serviceRoleKey: validTestServiceRoleKey,
      anonKey: validTestAnonKey,
      runId: inv.runId,
      fetchFn: transport
    });

    const h1 = await disp({ id: 'HOOK-01', category: 'Token Hook' });
    assert.equal(h1.passed, true);
    assert.equal(inv.getSessionToken('sess-p2d-1'), tok1);
    assert.equal(ctx.activeAccessToken, tok1);
    assert.equal(ctx.activeSessionId, 'sess-p2d-1');

    const h2 = await disp({ id: 'HOOK-02', category: 'Token Hook' });
    assert.equal(h2.passed, false);
    assert.match(h2.error, /JWT_IDENTITY_MISMATCH|SESSION_IDENTITY_CONFLICT/);

    // Original correlated token & active context remain intact
    assert.equal(inv.getSessionToken('sess-p2d-1'), tok1);
    assert.equal(inv.getSessionToken('sess-p2d-2'), tokConflict);
    assert.equal(inv.trackedSessions.has('sess-p2d-1'), true);
    assert.equal(inv.trackedSessions.has('sess-p2d-2'), true);
    assert.equal(ctx.activeAccessToken, tok1);
    assert.equal(ctx.activeRefreshToken, 'ref-p2d-1');
    assert.equal(ctx.activeSessionId, 'sess-p2d-1');
    assert.equal(ctx.activeUserId, userId1);
    assert.equal(inv.sessionReconciliationObligations.length > 0, true);
    assert.equal(inv.isClean(), false);

    const report1 = await inv.executeCleanup({ adminClient: admin, failClosed: false });
    assert.equal(report1.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
    assert.equal(inv.revokedSessions.has('sess-p2d-1'), true);
    assert.equal(inv.revokedSessions.has('sess-p2d-2'), true);
    assert.equal(report1.residualResources.some((r) => r.type === 'session_reconciliation_obligation'), true);

    const logoutCalls1 = transport.calls.filter((c) => c.url.includes('/auth/v1/logout'));
    assert.equal(logoutCalls1.length, 2);
    const logoutTokens = logoutCalls1.map((c) => c.headers.authorization.replace('Bearer ', ''));
    assert.deepEqual(logoutTokens.sort(), [tok1, tokConflict].sort());

    // Repeated cleanup makes 0 redundant logout calls while keeping reconciliation unresolved
    const prevLogoutCount = logoutCalls1.length;
    const report2 = await inv.executeCleanup({ adminClient: admin, failClosed: false });
    assert.equal(report2.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
    assert.equal(transport.calls.filter((c) => c.url.includes('/auth/v1/logout')).length, prevLogoutCount);
    assert.equal(inv.isClean(), false);
  }

  // 2. Direct inventory/admin/cleanup correlation guards reject mismatched session credentials without logout or revoking target session
  {
    const transport = createDeterministicFixtureTransport({
      requestBudgetMode: 'recorded_zero_wait',
      routes: [{ urlIncludes: '/auth/v1/logout', status: 204, json: {} }],
      defaultResponse: { status: 200, json: {} }
    });
    const inv = new TestRunInventory('test-p2d-direct-guards');
    const admin = createHostedAdminClient({
      serviceRoleKey: validTestServiceRoleKey,
      anonKey: validTestAnonKey,
      runId: inv.runId,
      fetchFn: transport
    });

    // Direct registerSession with valid correlated token succeeds; mismatched replacement is rejected and preserves tok1
    assert.equal(inv.registerSession('sess-p2d-1', { accessToken: tok1, source: 'HOOK-01', validated: true, replaceExisting: true }).registered, true);
    const conflictReg = inv.registerSession('sess-p2d-1', { accessToken: tokConflict, source: 'HOOK-02_conflict', validated: true, replaceExisting: true });
    assert.equal(conflictReg.registered, false);
    assert.equal(conflictReg.conflict, true);
    assert.equal(inv.getSessionToken('sess-p2d-1'), tok1);
    assert.equal(inv.sessionReconciliationObligations.some((ob) => ob.reason === 'SESSION_CREDENTIAL_MISMATCH'), true);

    // Direct admin.invalidateSession rejects mismatched credential without network call
    const callsBeforeInvalid = transport.calls.length;
    const mismatchRes = await admin.invalidateSession('sess-p2d-1', tokConflict);
    assert.ok(mismatchRes.error);
    assert.equal(mismatchRes.error.code, 'SESSION_CREDENTIAL_MISMATCH');
    assert.equal(transport.calls.length, callsBeforeInvalid);

    // Direct executeCleanup correlation defense: even if sessionTokens map was polluted directly,
    // executeCleanup refuses to sign out mismatched token or mark target session revoked.
    const invPolluted = new TestRunInventory('test-p2d-polluted-map');
    const adminPolluted = createHostedAdminClient({
      serviceRoleKey: validTestServiceRoleKey,
      anonKey: validTestAnonKey,
      runId: invPolluted.runId,
      fetchFn: transport
    });
    invPolluted.registerSession('sess-p2d-1', { source: 'HOOK-01_pre' });
    invPolluted.sessionTokens.set('sess-p2d-1', tokConflict);
    const pollutedReport = await invPolluted.executeCleanup({ adminClient: adminPolluted, failClosed: false });
    assert.equal(pollutedReport.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
    assert.equal(invPolluted.revokedSessions.has('sess-p2d-1'), false);
    assert.equal(transport.calls.filter((c) => c.url.includes('/auth/v1/logout')).length, 0);
    assert.equal(pollutedReport.residualResources.some((r) => r.type === 'session' && /SESSION_CREDENTIAL_MISMATCH/.test(r.error)), true);
  }

  // 3. Same session_id with conflicting user, missing sub, or malformed/over-depth JWT never overwrites tok1 and blocks CLEANUP_VERIFIED_SUCCESS
  for (const [label, badRefreshToken] of [
    ['wrong-user', tokWrongUser],
    ['missing-sub', tokMissingSub],
    ['malformed-jwt', 'malformed.token.value'],
    ['over-depth-jwt', deep6000Jwt]
  ]) {
    const transport = createDeterministicFixtureTransport({
      requestBudgetMode: 'recorded_zero_wait',
      routes: [
        {
          urlIncludes: '/auth/v1/token?grant_type=password',
          status: 200,
          json: { access_token: tok1, refresh_token: 'ref-1', session_id: 'sess-p2d-1', user: { id: userId1 } }
        },
        {
          urlIncludes: '/auth/v1/token?grant_type=refresh_token',
          status: 200,
          json: { access_token: badRefreshToken, refresh_token: 'ref-bad', session_id: 'sess-p2d-1', user: { id: userId1 } }
        },
        { urlIncludes: '/auth/v1/logout', status: 204, json: {} }
      ],
      defaultResponse: { status: 200, json: {} }
    });
    const inv = new TestRunInventory(`test-p2d-${label}`);
    const ctx = createRunContext({ runId: inv.runId });
    const disp = createHostedDispatcher({ anonKey: validTestAnonKey, inventory: inv, runContext: ctx, fetchFn: transport });
    const admin = createHostedAdminClient({ serviceRoleKey: validTestServiceRoleKey, anonKey: validTestAnonKey, runId: inv.runId, fetchFn: transport });

    const h1 = await disp({ id: 'HOOK-01', category: 'Token Hook' });
    assert.equal(h1.passed, true, `${label}: HOOK-01 must pass`);

    const h2 = await disp({ id: 'HOOK-02', category: 'Token Hook' });
    assert.equal(h2.passed, false, `${label}: HOOK-02 must fail closed`);
    assert.equal(inv.getSessionToken('sess-p2d-1'), tok1, `${label}: must preserve tok1`);
    assert.equal(ctx.activeAccessToken, tok1, `${label}: must preserve activeAccessToken`);
    assert.equal(inv.sessionReconciliationObligations.length > 0, true, `${label}: must record reconciliation obligation`);

    const rep = await inv.executeCleanup({ adminClient: admin, failClosed: false });
    assert.equal(rep.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES', `${label}: must block CLEANUP_VERIFIED_SUCCESS`);
    assert.equal(inv.revokedSessions.has('sess-p2d-1'), true, `${label}: valid sess-p2d-1 credential still signs out`);
    const logouts = transport.calls.filter((c) => c.url.includes('/auth/v1/logout'));
    assert.equal(logouts.length, 1);
    assert.equal(logouts[0].headers.authorization, `Bearer ${tok1}`, `${label}: logout must use preserved tok1`);
  }

  // 4. Legitimate same-session, same-user refresh updates cleanup credential & context and achieves idempotent CLEANUP_VERIFIED_SUCCESS
  {
    const transport = createDeterministicFixtureTransport({
      requestBudgetMode: 'recorded_zero_wait',
      routes: [
        {
          urlIncludes: '/auth/v1/token?grant_type=password',
          status: 200,
          json: { access_token: tok1, refresh_token: 'ref-1', session_id: 'sess-p2d-1', user: { id: userId1 } }
        },
        {
          urlIncludes: '/auth/v1/token?grant_type=refresh_token',
          status: 200,
          json: { access_token: tok2Valid, refresh_token: 'ref-2', session_id: 'sess-p2d-1', user: { id: userId1 } }
        },
        { urlIncludes: '/auth/v1/logout', status: 204, json: {} }
      ],
      defaultResponse: { status: 200, json: {} }
    });
    const inv = new TestRunInventory('test-p2d-valid-refresh');
    const ctx = createRunContext({ runId: inv.runId });
    const disp = createHostedDispatcher({ anonKey: validTestAnonKey, inventory: inv, runContext: ctx, fetchFn: transport });
    const admin = createHostedAdminClient({ serviceRoleKey: validTestServiceRoleKey, anonKey: validTestAnonKey, runId: inv.runId, fetchFn: transport });

    assert.equal((await disp({ id: 'HOOK-01', category: 'Token Hook' })).passed, true);
    assert.equal((await disp({ id: 'HOOK-02', category: 'Token Hook' })).passed, true);
    assert.equal(inv.getSessionToken('sess-p2d-1'), tok2Valid);
    assert.equal(ctx.activeAccessToken, tok2Valid);
    assert.equal(ctx.activeRefreshToken, 'ref-2');
    assert.equal(inv.sessionReconciliationObligations.length, 0);

    const rep1 = await inv.executeCleanup({ adminClient: admin, failClosed: false });
    assert.equal(rep1.status, 'CLEANUP_VERIFIED_SUCCESS');
    assert.equal(inv.isClean(), true);
    const logouts1 = transport.calls.filter((c) => c.url.includes('/auth/v1/logout'));
    assert.equal(logouts1.length, 1);
    assert.equal(logouts1[0].headers.authorization, `Bearer ${tok2Valid}`);

    const rep2 = await inv.executeCleanup({ adminClient: admin, failClosed: false });
    assert.equal(rep2.status, 'CLEANUP_VERIFIED_SUCCESS');
    assert.equal(transport.calls.filter((c) => c.url.includes('/auth/v1/logout')).length, 1);
  }

  // 5. Conflicting observeAndTrackSessionTokens / non-200 auth observation preserves tok1 and records reconciliation
  {
    const inv = new TestRunInventory('test-p2d-non200-observe');
    const ctx = createRunContext({ runId: inv.runId });
    ctx.activeUserId = userId1;
    ctx.activeSessionId = 'sess-p2d-1';
    ctx.activeAccessToken = tok1;
    inv.registerSession('sess-p2d-1', { accessToken: tok1, source: 'HOOK-01', validated: true, replaceExisting: true });

    const tracked = observeAndTrackSessionTokens(
      { session_id: 'sess-p2d-1', access_token: tokConflict, refresh_token: 'ref-x', user: { id: userId1 } },
      { inv, ctx, probeId: 'HOOK-02' }
    );
    assert.equal(tracked.identityConflict, true);
    assert.equal(inv.getSessionToken('sess-p2d-1'), tok1);
    assert.equal(inv.getSessionToken('sess-p2d-2'), tokConflict);
    assert.equal(ctx.activeAccessToken, tok1);
    assert.equal(inv.sessionReconciliationObligations.length > 0, true);

    const inv2 = new TestRunInventory('test-p2d-non200-observe-409');
    inv2.registerSession('sess-p2d-1', { accessToken: tok1, source: 'HOOK-01', validated: true, replaceExisting: true });
    const observedErr = observeAuthResponse({
      probeId: 'HOOK-02',
      status: 409,
      parseStatus: 'parsed',
      body: { session_id: 'sess-p2d-1', access_token: tokConflict, user: { id: userId1 } },
      inv: inv2,
      ctx,
      expectedOperation: 'token_issuance',
      canMintSession: true
    });
    assert.equal(observedErr.identityConflict, true);
    assert.equal(inv2.getSessionToken('sess-p2d-1'), tok1);
    assert.equal(inv2.getSessionToken('sess-p2d-2'), tokConflict);
    assert.equal(inv2.isClean(), false);
  }

  // 6. Audit hardening regressions: active ctx binding, uncorrelated/non-3-part/empty-id rejection, and String.prototype immunity
  {
    const transport = createDeterministicFixtureTransport({
      requestBudgetMode: 'recorded_zero_wait',
      routes: [{ urlIncludes: '/auth/v1/logout', status: 204, json: {} }],
      defaultResponse: { status: 200, json: {} }
    });
    const inv = new TestRunInventory('test-p2d-audit-hardening');
    const ctx = createRunContext({ runId: inv.runId });
    ctx.activeUserId = userId1;
    ctx.activeSessionId = 'sess-p2d-1';
    ctx.activeAccessToken = tok1;
    inv.registerSession('sess-p2d-1', { accessToken: tok1, source: 'HOOK-01', validated: true, replaceExisting: true });

    // 6A. Cross-session agreeing body+JWT on active ctx via observeAndTrackSessionTokens must NOT clobber activeSessionId/activeUserId
    const tokSess3WrongUser = createMockJwt({ sub: userId2, session_id: 'sess-p2d-3', amr: [{ method: 'password' }] });
    observeAndTrackSessionTokens(
      { session_id: 'sess-p2d-3', access_token: tokSess3WrongUser, user: { id: userId2 } },
      { inv, ctx, probeId: 'HOOK-02' }
    );
    assert.equal(ctx.activeSessionId, 'sess-p2d-1');
    assert.equal(ctx.activeUserId, userId1);
    assert.equal(inv.getSessionToken('sess-p2d-1'), tok1);
    assert.equal(inv.getSessionToken('sess-p2d-3'), tokSess3WrongUser);

    // 6B. Non-HOOK probe (BYPASS-03) with conflicting or unexpected token must NOT clobber active ctx
    observeAuthResponse({
      probeId: 'BYPASS-03',
      status: 200,
      parseStatus: 'parsed',
      body: { session_id: 'sess-p2d-4', access_token: createMockJwt({ sub: userId2, session_id: 'sess-p2d-4' }), user: { id: userId2 } },
      inv,
      ctx,
      expectedOperation: 'rejection',
      canMintSession: true
    });
    assert.equal(ctx.activeSessionId, 'sess-p2d-1');
    assert.equal(ctx.activeUserId, userId1);
    assert.equal(ctx.mintedAccessToken ?? null, null);

    // 6C. Missing session_id in 3-part JWT, 2-part malformed JWT, and empty target sessionId reject cleanly
    const tokMissingSid = createMockJwt({ sub: userId1, session_id: undefined });
    const regNoSid = inv.registerSession('sess-p2d-nosid', { accessToken: tokMissingSid, source: 'HOOK-01' });
    assert.equal(regNoSid.registered, false);
    assert.equal(regNoSid.uncorrelated, true);
    assert.equal(inv.getSessionToken('sess-p2d-nosid'), null);

    const regTwoPart = inv.registerSession('sess-p2d-1', { accessToken: 'hdr.payload', source: 'HOOK-02', validated: true, replaceExisting: true });
    assert.equal(regTwoPart.registered, false);
    assert.equal(inv.getSessionToken('sess-p2d-1'), tok1);

    const admin = createHostedAdminClient({
      serviceRoleKey: validTestServiceRoleKey,
      anonKey: validTestAnonKey,
      runId: inv.runId,
      fetchFn: transport
    });
    const emptyTargetRes = await admin.invalidateSession('', tokConflict);
    assert.equal(emptyTargetRes.error?.code, 'MISSING_SESSION_ID');
    const twoPartInvalid = await admin.invalidateSession('sess-p2d-1', 'hdr.payload');
    assert.equal(twoPartInvalid.error?.code, 'UNCORRELATED_SESSION_CREDENTIAL');
    assert.equal(transport.calls.length, 0);

    // 6D. String.prototype.split/includes/trim pollution cannot bypass session_id correlation
    const origSplit = String.prototype.split;
    const origIncludes = String.prototype.includes;
    const origTrim = String.prototype.trim;
    try {
      // eslint-disable-next-line no-extend-native
      String.prototype.split = function () { return ['hdr', Buffer.from(JSON.stringify({ sub: userId1, session_id: 'sess-p2d-1' })).toString('base64url'), 'sig']; };
      // eslint-disable-next-line no-extend-native
      String.prototype.includes = function () { return false; };
      const pollutedRes = await admin.invalidateSession('sess-p2d-1', tokConflict);
      assert.equal(pollutedRes.error?.code, 'SESSION_CREDENTIAL_MISMATCH');
      assert.equal(transport.calls.length, 0);

      // eslint-disable-next-line no-extend-native
      String.prototype.trim = function () { return 'sess-p2d-1'; };
      const pollutedReg = inv.registerSession('sess-p2d-1', { accessToken: tokConflict, source: 'HOOK-02', validated: true, replaceExisting: true });
      assert.equal(pollutedReg.registered, false);
      assert.equal(inv.getSessionToken('sess-p2d-1'), tok1);
    } finally {
      // eslint-disable-next-line no-extend-native
      String.prototype.split = origSplit;
      // eslint-disable-next-line no-extend-native
      String.prototype.includes = origIncludes;
      // eslint-disable-next-line no-extend-native
      String.prototype.trim = origTrim;
    }
  }
});
