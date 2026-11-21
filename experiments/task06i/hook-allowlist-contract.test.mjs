import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateCustomAccessTokenHook,
  classifyHookOutcome
} from './hook-allowlist-contract.mjs';

// Fixture 1: Valid Initial Password Authentication (ALLOWED)
test('Fixture 1: Valid initial password authentication is allowed', () => {
  const event = {
    user_id: 'd0407a9a-3f43-4e4b-9e20-5c3b5d38a0a4',
    authentication_method: 'password',
    claims: {
      sub: 'd0407a9a-3f43-4e4b-9e20-5c3b5d38a0a4',
      email: 'user@example.com',
      role: 'authenticated',
      amr: [{ method: 'password', timestamp: 1700000000 }]
    }
  };

  const outcome = classifyHookOutcome(event);
  assert.equal(outcome.allowed, true);
  assert.equal(outcome.result, 'ALLOWED');
  assert.equal(outcome.amr_authenticated, true);
});

// Fixture 2: Valid Token Refresh with Password-Origin AMR (ALLOWED)
test('Fixture 2: Valid token refresh with password-origin AMR is allowed', () => {
  const event = {
    user_id: 'd0407a9a-3f43-4e4b-9e20-5c3b5d38a0a4',
    authentication_method: 'token_refresh',
    claims: {
      sub: 'd0407a9a-3f43-4e4b-9e20-5c3b5d38a0a4',
      email: 'user@example.com',
      role: 'authenticated',
      amr: [{ method: 'password', timestamp: 1700000000 }]
    }
  };

  const outcome = classifyHookOutcome(event);
  assert.equal(outcome.allowed, true);
  assert.equal(outcome.result, 'ALLOWED');
  assert.equal(outcome.amr_authenticated, true);
});

// Fixture 3: Native Email OTP Authentication (DENIED - FAIL-CLOSED)
test('Fixture 3: Native email OTP authentication is denied fail-closed', () => {
  const event = {
    user_id: 'd0407a9a-3f43-4e4b-9e20-5c3b5d38a0a4',
    authentication_method: 'otp',
    claims: {
      sub: 'd0407a9a-3f43-4e4b-9e20-5c3b5d38a0a4',
      email: 'user@example.com',
      role: 'authenticated',
      amr: [{ method: 'otp', timestamp: 1700000000 }]
    }
  };

  const outcome = classifyHookOutcome(event);
  assert.equal(outcome.allowed, false);
  assert.equal(outcome.result, 'DENIED_FAIL_CLOSED');
  assert.equal(outcome.sqlstate, '42501');
  assert.match(outcome.error, /authentication_method_otp_not_permitted_by_policy/);
});

// Fixture 4: Native Recovery Authentication (DENIED - FAIL-CLOSED)
test('Fixture 4: Native recovery authentication is denied fail-closed', () => {
  const event = {
    user_id: 'd0407a9a-3f43-4e4b-9e20-5c3b5d38a0a4',
    authentication_method: 'recovery',
    claims: {
      sub: 'd0407a9a-3f43-4e4b-9e20-5c3b5d38a0a4',
      email: 'user@example.com',
      role: 'authenticated',
      amr: [{ method: 'recovery', timestamp: 1700000000 }]
    }
  };

  const outcome = classifyHookOutcome(event);
  assert.equal(outcome.allowed, false);
  assert.equal(outcome.result, 'DENIED_FAIL_CLOSED');
  assert.equal(outcome.sqlstate, '42501');
  assert.match(outcome.error, /authentication_method_recovery_not_permitted_by_policy/);
});

// Fixture 5: Native Magiclink Authentication (DENIED - FAIL-CLOSED)
test('Fixture 5: Native magiclink authentication is denied fail-closed', () => {
  const event = {
    user_id: 'd0407a9a-3f43-4e4b-9e20-5c3b5d38a0a4',
    authentication_method: 'magiclink',
    claims: {
      sub: 'd0407a9a-3f43-4e4b-9e20-5c3b5d38a0a4',
      email: 'user@example.com',
      role: 'authenticated',
      amr: [{ method: 'magiclink', timestamp: 1700000000 }]
    }
  };

  const outcome = classifyHookOutcome(event);
  assert.equal(outcome.allowed, false);
  assert.equal(outcome.result, 'DENIED_FAIL_CLOSED');
  assert.equal(outcome.sqlstate, '42501');
  assert.match(outcome.error, /authentication_method_magiclink_not_permitted_by_policy/);
});

// Fixture 6: Password Method Combined with Prohibited OTP AMR (DENIED - MIXED AMR)
test('Fixture 6: Password method combined with prohibited OTP AMR is denied (mixed AMR)', () => {
  const event = {
    user_id: 'd0407a9a-3f43-4e4b-9e20-5c3b5d38a0a4',
    authentication_method: 'password',
    claims: {
      sub: 'd0407a9a-3f43-4e4b-9e20-5c3b5d38a0a4',
      email: 'user@example.com',
      role: 'authenticated',
      amr: [
        { method: 'password', timestamp: 1700000000 },
        { method: 'otp', timestamp: 1700000000 }
      ]
    }
  };

  const outcome = classifyHookOutcome(event);
  assert.equal(outcome.allowed, false);
  assert.equal(outcome.result, 'DENIED_FAIL_CLOSED');
  assert.equal(outcome.sqlstate, '42501');
  assert.match(outcome.error, /prohibited_amr_method_otp_in_token_session/);
});

// Fixture 7: Token Refresh with Missing Claims Object (DENIED - MALFORMED)
test('Fixture 7: Token refresh with missing claims object is denied', () => {
  const event = {
    user_id: 'd0407a9a-3f43-4e4b-9e20-5c3b5d38a0a4',
    authentication_method: 'token_refresh'
  };

  const outcome = classifyHookOutcome(event);
  assert.equal(outcome.allowed, false);
  assert.equal(outcome.result, 'DENIED_FAIL_CLOSED');
  assert.equal(outcome.sqlstate, '42501');
  assert.match(outcome.error, /missing_or_malformed_claims/);
});

// Fixture 8: Token Refresh with Non-Array AMR (DENIED - MALFORMED)
test('Fixture 8: Token refresh with non-array AMR is denied', () => {
  const event = {
    user_id: 'd0407a9a-3f43-4e4b-9e20-5c3b5d38a0a4',
    authentication_method: 'token_refresh',
    claims: {
      sub: 'd0407a9a-3f43-4e4b-9e20-5c3b5d38a0a4',
      email: 'user@example.com',
      role: 'authenticated',
      amr: 'password'
    }
  };

  const outcome = classifyHookOutcome(event);
  assert.equal(outcome.allowed, false);
  assert.equal(outcome.result, 'DENIED_FAIL_CLOSED');
  assert.equal(outcome.sqlstate, '42501');
  assert.match(outcome.error, /missing_or_empty_amr/);
});

// Fixture 9: Token Refresh with Prohibited Recovery AMR (DENIED)
test('Fixture 9: Token refresh with prohibited recovery AMR is denied', () => {
  const event = {
    user_id: 'd0407a9a-3f43-4e4b-9e20-5c3b5d38a0a4',
    authentication_method: 'token_refresh',
    claims: {
      sub: 'd0407a9a-3f43-4e4b-9e20-5c3b5d38a0a4',
      email: 'user@example.com',
      role: 'authenticated',
      amr: [{ method: 'recovery', timestamp: 1700000000 }]
    }
  };

  const outcome = classifyHookOutcome(event);
  assert.equal(outcome.allowed, false);
  assert.equal(outcome.result, 'DENIED_FAIL_CLOSED');
  assert.equal(outcome.sqlstate, '42501');
  assert.match(outcome.error, /prohibited_amr_method_recovery_in_token_session/);
});

// Fixture 10: Unknown Authentication Method (DENIED - FAIL-CLOSED)
test('Fixture 10: Unknown authentication method is denied fail-closed', () => {
  const event = {
    user_id: 'd0407a9a-3f43-4e4b-9e20-5c3b5d38a0a4',
    authentication_method: 'custom_insecure_auth',
    claims: {
      sub: 'd0407a9a-3f43-4e4b-9e20-5c3b5d38a0a4',
      email: 'user@example.com',
      role: 'authenticated',
      amr: [{ method: 'password', timestamp: 1700000000 }]
    }
  };

  const outcome = classifyHookOutcome(event);
  assert.equal(outcome.allowed, false);
  assert.equal(outcome.result, 'DENIED_FAIL_CLOSED');
  assert.equal(outcome.sqlstate, '42501');
  assert.match(outcome.error, /authentication_method_custom_insecure_auth_not_permitted_by_policy/);
});

// Additional Boundary Tests: Missing event, empty AMR, malformed AMR item, string array AMR
test('Boundary: null or non-object event fails closed', () => {
  assert.throws(() => evaluateCustomAccessTokenHook(null), /invalid_hook_event/);
  assert.throws(() => evaluateCustomAccessTokenHook([]), /invalid_hook_event/);
});

test('Boundary: missing or blank authentication_method fails closed', () => {
  assert.throws(() => evaluateCustomAccessTokenHook({}), /missing_authentication_method/);
  assert.throws(() => evaluateCustomAccessTokenHook({ authentication_method: '   ' }), /missing_authentication_method/);
});

test('Boundary: empty AMR array fails closed', () => {
  const event = {
    authentication_method: 'password',
    claims: { amr: [] }
  };
  assert.throws(() => evaluateCustomAccessTokenHook(event), /missing_or_empty_amr/);
});

test('Boundary: string-array AMR (legacy format) fails closed under RFC 8176 parser', () => {
  const event = {
    authentication_method: 'password',
    claims: { amr: ['password'] }
  };
  assert.throws(() => evaluateCustomAccessTokenHook(event), /malformed_amr_element/);
});

test('Boundary: amr element missing string method property fails closed', () => {
  const event = {
    authentication_method: 'password',
    claims: { amr: [{ timestamp: 1700000000 }] }
  };
  assert.throws(() => evaluateCustomAccessTokenHook(event), /malformed_amr_method/);
});

test('Boundary: anonymous and invite authentication methods fail closed', () => {
  for (const method of ['anonymous', 'invite', 'email/signup', 'oauth', 'sso/saml']) {
    const event = {
      authentication_method: method,
      claims: { amr: [{ method, timestamp: 1700000000 }] }
    };
    const outcome = classifyHookOutcome(event);
    assert.equal(outcome.allowed, false);
    assert.equal(outcome.result, 'DENIED_FAIL_CLOSED');
  }
});
