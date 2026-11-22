import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  evaluateNativeRouteDisablement,
  evaluateHookFailureSemantics,
  MockAuthSessionStore,
  evaluateJwtConsumerAccess
} from './security-harness.mjs';
import {
  evaluateCustomAccessTokenHook,
  evaluateSendEmailHook,
  classifyHookOutcome,
  classifySendEmailOutcome
} from './hook-allowlist-contract.mjs';
import { verifyParityMatrix, executeJsCase, isDeepEqual } from './sql-contract-parity.mjs';

test('1. Native OTP route disablement contract (BYPASS-01)', () => {
  // Disablement active: returns 422 email_provider_disabled
  const disabled = evaluateNativeRouteDisablement('/auth/v1/otp', { external_email_magic_link_disabled: true });
  assert.equal(disabled.allowed, false);
  assert.equal(disabled.status, 422);
  assert.equal(disabled.code, 'email_provider_disabled');

  // Magiclink route follows identical provider flag
  const mlDisabled = evaluateNativeRouteDisablement('/auth/v1/magiclink', { external_email_magic_link_disabled: true });
  assert.equal(mlDisabled.allowed, false);
  assert.equal(mlDisabled.status, 422);
  assert.equal(mlDisabled.code, 'email_provider_disabled');

  // Insecure configuration flags violation
  const open = evaluateNativeRouteDisablement('/auth/v1/otp', { external_email_magic_link_disabled: false });
  assert.equal(open.allowed, true);
  assert.equal(open.status, 200);
});

test('2. Native signup route disablement contract (BYPASS-02)', () => {
  // Disablement active: returns 422 signup_disabled
  const disabled = evaluateNativeRouteDisablement('/auth/v1/signup', { disable_signup: true });
  assert.equal(disabled.allowed, false);
  assert.equal(disabled.status, 422);
  assert.equal(disabled.code, 'signup_disabled');

  // Insecure configuration
  const open = evaluateNativeRouteDisablement('/auth/v1/signup', { disable_signup: false });
  assert.equal(open.allowed, true);
  assert.equal(open.status, 200);
});

test('3. Custom Access Token Hook authorization (HOOK-01)', () => {
  const event = {
    user_id: '123e4567-e89b-12d3-a456-426614174000',
    authentication_method: 'password',
    claims: {
      sub: '123e4567-e89b-12d3-a456-426614174000',
      amr: [{ method: 'password', timestamp: 1700000000 }]
    }
  };

  const outcome = classifyHookOutcome(event);
  assert.equal(outcome.allowed, true);
  assert.equal(outcome.result, 'ALLOWED');
  assert.equal(outcome.amr_authenticated, true);
});

test('4. Send Email Hook recovery suppression (BYPASS-05)', () => {
  const recoveryEvent = {
    user_id: '123e4567-e89b-12d3-a456-426614174000',
    email_data: {
      email_action_type: 'recovery',
      token_hash: 'secret_hash_xyz'
    }
  };

  const outcome = classifySendEmailOutcome(recoveryEvent);
  assert.equal(outcome.allowed, false);
  assert.equal(outcome.result, 'SUPPRESSED_FAIL_CLOSED');
  assert.equal(outcome.sqlstate, '42501');
  assert.match(outcome.error, /native_recovery_email_dispatch_suppressed/);
});

test('5. Password-origin JWT acceptance (HOOK-01, SESSION-01)', () => {
  const store = new MockAuthSessionStore();
  const session = store.createSession('user-abc-123', 'password');
  assert.equal(session.userId, 'user-abc-123');
  assert.equal(session.revoked, false);

  const check = store.validateSessionForUserEndpoint(session.id);
  assert.equal(check.allowed, true);
  assert.equal(check.status, 200);
});

test('6. Token refresh AMR preservation (HOOK-02)', () => {
  const refreshEvent = {
    user_id: '123e4567-e89b-12d3-a456-426614174000',
    authentication_method: 'token_refresh',
    claims: {
      sub: '123e4567-e89b-12d3-a456-426614174000',
      amr: [{ method: 'password', timestamp: 1700000000 }]
    }
  };

  const outcome = classifyHookOutcome(refreshEvent);
  assert.equal(outcome.allowed, true);
  assert.equal(outcome.amr_authenticated, true);
});

test('7. Missing, malformed, and unknown AMR rejection (HOOK-06)', () => {
  // Empty AMR
  assert.throws(
    () => evaluateCustomAccessTokenHook({
      user_id: 'u1',
      authentication_method: 'password',
      claims: { amr: [] }
    }),
    err => err.code === '42501'
  );

  // Non-array AMR
  assert.throws(
    () => evaluateCustomAccessTokenHook({
      user_id: 'u1',
      authentication_method: 'password',
      claims: { amr: 'password' }
    }),
    err => err.code === '42501'
  );

  // Unknown method
  assert.throws(
    () => evaluateCustomAccessTokenHook({
      user_id: 'u1',
      authentication_method: 'password',
      claims: { amr: [{ method: 'hardware_token' }] }
    }),
    err => err.code === '42501'
  );
});

test('8. Mixed password + unauthorized AMR rejection (HOOK-05)', () => {
  const mixedMethods = ['otp', 'recovery', 'magiclink', 'signup', 'sso/saml', 'anonymous'];
  for (const method of mixedMethods) {
    assert.throws(
      () => evaluateCustomAccessTokenHook({
        user_id: 'u1',
        authentication_method: 'password',
        claims: {
          amr: [
            { method: 'password' },
            { method }
          ]
        }
      }),
      err => err.code === '42501',
      `Expected failure for mixed method ${method}`
    );
  }
});

test('9. Invalid Send Email Hook payload rejection (BYPASS-05)', () => {
  // Malformed event
  assert.throws(() => evaluateSendEmailHook(null), err => err.code === '42501');
  assert.throws(() => evaluateSendEmailHook([]), err => err.code === '42501');

  // Missing email_data
  assert.throws(() => evaluateSendEmailHook({ user_id: 'u1' }), err => err.code === '42501');

  // Blank or whitespace-padded email_action_type
  assert.throws(() => evaluateSendEmailHook({ email_data: { email_action_type: '' } }), err => err.code === '42501');
  assert.throws(() => evaluateSendEmailHook({ email_data: { email_action_type: ' recovery ' } }), err => err.code === '42501');

  // Undocumented aliases rejected
  assert.throws(() => evaluateSendEmailHook({ action_type: 'recovery', email_data: null }), err => err.code === '42501');
});

test('10. Hook error and timeout behavior (HOOK-07)', () => {
  const timeoutOutcome = evaluateHookFailureSemantics('TIMEOUT');
  assert.equal(timeoutOutcome.httpStatus, 500);
  assert.equal(timeoutOutcome.transactionAborted, true);
  assert.equal(timeoutOutcome.tokensIssued, 0);
  assert.equal(timeoutOutcome.failClosed, true);

  const exceptionOutcome = evaluateHookFailureSemantics('SQL_EXCEPTION_42501');
  assert.equal(exceptionOutcome.httpStatus, 500);
  assert.equal(exceptionOutcome.transactionAborted, true);
  assert.equal(exceptionOutcome.tokensIssued, 0);

  const networkOutcome = evaluateHookFailureSemantics('NETWORK_OR_UNREACHABLE');
  assert.equal(networkOutcome.httpStatus, 500);
  assert.equal(networkOutcome.transactionAborted, true);
  assert.equal(networkOutcome.tokensIssued, 0);
});

test('11. Revoked Auth-session behavior (SESSION-02, SESSION-03)', () => {
  const store = new MockAuthSessionStore();
  const session1 = store.createSession('user-target', 'password');
  const session2 = store.createSession('user-target', 'password');

  // Both active
  assert.equal(store.validateSessionForUserEndpoint(session1.id).allowed, true);
  assert.equal(store.validateSessionForUserEndpoint(session2.id).allowed, true);

  // Admin password reset revokes all sessions
  const resetRes = store.adminUpdateUserPassword('user-target', 'NewSecurePass123!');
  assert.equal(resetRes.success, true);
  assert.equal(resetRes.revokedSessionsCount, 2);

  // Subsequent check returns 403 session_not_found immediately
  const check1 = store.validateSessionForUserEndpoint(session1.id);
  assert.equal(check1.allowed, false);
  assert.equal(check1.status, 403);
  assert.equal(check1.error, 'session_not_found');

  const check2 = store.validateSessionForUserEndpoint(session2.id);
  assert.equal(check2.allowed, false);
  assert.equal(check2.status, 403);
  assert.equal(check2.error, 'session_not_found');
});

test('12. JWT consumer differences across Auth, Data API, Storage, and Edge Functions (SESSION-04, 05, 06)', () => {
  const store = new MockAuthSessionStore();
  const session = store.createSession('user-consumer-test', 'password');
  store.adminUpdateUserPassword('user-consumer-test', 'NewPass!'); // revoked in database!

  const now = Math.floor(Date.now() / 1000);
  const unexpiredRevokedJwt = {
    sessionId: session.id,
    userId: 'user-consumer-test',
    signatureValid: true,
    exp: now + 240 // 4 minutes remaining
  };

  // Consumer 1: Auth API (/auth/v1/user) - stateful database check -> REJECTS IMMEDIATELY (403)
  const authRes = evaluateJwtConsumerAccess({
    consumer: 'AUTH_API_USER_ENDPOINT',
    jwt: unexpiredRevokedJwt,
    currentTime: now,
    sessionStore: store
  });
  assert.equal(authRes.allowed, false);
  assert.equal(authRes.status, 403);
  assert.equal(authRes.lingeringRisk, false);

  // Consumer 2: PostgREST Data API - stateless signature check -> ACCEPTS UNTIL EXP (residual validity window)
  const postgrestRes = evaluateJwtConsumerAccess({
    consumer: 'POSTGREST_DATA_API',
    jwt: unexpiredRevokedJwt,
    currentTime: now
  });
  assert.equal(postgrestRes.allowed, true);
  assert.equal(postgrestRes.lingeringRisk, true);
  assert.match(postgrestRes.mitigation, /jwt_exp: 300s/);

  // Consumer 3: Storage API - stateless signature check -> ACCEPTS UNTIL EXP
  const storageRes = evaluateJwtConsumerAccess({
    consumer: 'STORAGE_API',
    jwt: unexpiredRevokedJwt,
    currentTime: now
  });
  assert.equal(storageRes.allowed, true);
  assert.equal(storageRes.lingeringRisk, true);

  // Consumer 4: Edge Function calling supabase.auth.getUser() -> REJECTS IMMEDIATELY (403)
  const edgeGetUserRes = evaluateJwtConsumerAccess({
    consumer: 'EDGE_FUNCTION_AUTH_GET_USER',
    jwt: unexpiredRevokedJwt,
    currentTime: now,
    sessionStore: store
  });
  assert.equal(edgeGetUserRes.allowed, false);
  assert.equal(edgeGetUserRes.status, 403);
  assert.equal(edgeGetUserRes.lingeringRisk, false);
});

test('13. SQL/JS Parity matrix evaluates with 100% agreement when Docker is available', () => {
  const parity = verifyParityMatrix();
  if (parity.dockerAvailable) {
    assert.equal(parity.status, 'POSTGRES_VERIFIED');
    assert.equal(parity.totalCases, 18);
    assert.equal(parity.passedParity, 18);
    assert.equal(parity.grantsVerification.verified, true);
    assert.equal(parity.grantsVerification.grants.supabase_auth_admin.custom_access_token_hook, true);
    assert.equal(parity.grantsVerification.grants.anon.custom_access_token_hook, false);
    assert.equal(parity.grantsVerification.grants.public.custom_access_token_hook, false);
  } else {
    assert.equal(parity.status, 'POSTGRES_NOT_EXECUTED');
    assert.equal(parity.passedParity, 0);
  }
});

test('14. Parity comparator detects deliberate successful-result output mismatches (PRRT_kwDOVtCmZc66iotM)', () => {
  const baselineAllowedOutput = {
    user_id: '11111111-1111-1111-1111-111111111111',
    authentication_method: 'password',
    claims: {
      sub: '11111111-1111-1111-1111-111111111111',
      amr: [{ method: 'password', timestamp: 1700000000 }],
      amr_authenticated: 'true'
    }
  };

  // Mismatch 1: dropped claim
  const droppedClaimOutput = {
    user_id: '11111111-1111-1111-1111-111111111111',
    authentication_method: 'password',
    claims: {
      amr: [{ method: 'password', timestamp: 1700000000 }],
      amr_authenticated: 'true'
    }
  };
  assert.equal(isDeepEqual(baselineAllowedOutput, droppedClaimOutput), false);

  // Mismatch 2: wrong claim value
  const wrongClaimOutput = {
    ...baselineAllowedOutput,
    claims: {
      ...baselineAllowedOutput.claims,
      amr_authenticated: 'false'
    }
  };
  assert.equal(isDeepEqual(baselineAllowedOutput, wrongClaimOutput), false);

  // Mismatch 3: Send Email Hook non-empty response instead of {}
  assert.equal(isDeepEqual({}, { unexpected_field: true }), false);
});

test('15. Parity matrix status calculation distinguishes POSTGRES_VERIFIED from PARITY_FAILED and POSTGRES_NOT_EXECUTED (PRRT_kwDOVtCmZc66jLk5)', () => {
  const parity = verifyParityMatrix();
  if (parity.dockerAvailable) {
    if (parity.passedParity === parity.totalCases && parity.totalCases > 0) {
      assert.equal(parity.status, 'POSTGRES_VERIFIED');
    } else {
      assert.equal(parity.status, 'PARITY_FAILED');
    }
  } else {
    assert.equal(parity.status, 'POSTGRES_NOT_EXECUTED');
    assert.equal(parity.passedParity, 0);
  }
});

test('16. Standalone CLI parity command sets nonzero exit code on mismatch or incomplete execution (PRRT_kwDOVtCmZc66jLk5)', () => {
  const res = spawnSync(process.execPath, ['experiments/task06i/sql-contract-parity.mjs'], {
    encoding: 'utf8',
    timeout: 30000
  });

  if (res.stdout && res.stdout.includes('Status: POSTGRES_VERIFIED')) {
    assert.equal(res.status, 0);
    assert.match(res.stdout, /Cases Evaluated: 18, Matched Parity: 18/);
  } else {
    assert.notEqual(res.status, 0, 'Exit code must be nonzero when parity is not verified');
    assert.match(res.stderr, /ERROR: Standalone contract parity check failed/);
  }
});
