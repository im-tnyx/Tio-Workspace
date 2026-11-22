import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateCustomAccessTokenHook,
  classifyHookOutcome,
  evaluateSendEmailHook,
  classifySendEmailOutcome
} from './hook-allowlist-contract.mjs';

/**
 * Task 06I-B1-R2 Hook Allowlist Contract Tests
 *
 * NOTE: These tests verify the pure offline JavaScript contract parser, RFC 8176
 * AMR traversal, and fail-closed SQLSTATE 42501 exception logic. They demonstrate
 * specification compliance and do NOT constitute empirical proof of live SQL
 * execution on a hosted Supabase database.
 */

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

// R2-01 Negative Regression Tests: Mixed Password + Unknown / Disallowed AMR
test('R2-01: Mixed password and email/signup AMR is strictly denied', () => {
  const event = {
    user_id: 'd0407a9a-3f43-4e4b-9e20-5c3b5d38a0a4',
    authentication_method: 'password',
    claims: {
      sub: 'd0407a9a-3f43-4e4b-9e20-5c3b5d38a0a4',
      email: 'user@example.com',
      amr: [
        { method: 'password', timestamp: 1700000000 },
        { method: 'email/signup', timestamp: 1700000000 }
      ]
    }
  };
  const outcome = classifyHookOutcome(event);
  assert.equal(outcome.allowed, false);
  assert.equal(outcome.result, 'DENIED_FAIL_CLOSED');
  assert.match(outcome.error, /prohibited_amr_method_email\/signup_in_token_session/);
});

test('R2-01: Mixed password and sso/saml AMR is strictly denied', () => {
  const event = {
    user_id: 'd0407a9a-3f43-4e4b-9e20-5c3b5d38a0a4',
    authentication_method: 'token_refresh',
    claims: {
      sub: 'd0407a9a-3f43-4e4b-9e20-5c3b5d38a0a4',
      email: 'user@example.com',
      amr: [
        { method: 'password', timestamp: 1700000000 },
        { method: 'sso/saml', timestamp: 1700000000 }
      ]
    }
  };
  const outcome = classifyHookOutcome(event);
  assert.equal(outcome.allowed, false);
  assert.equal(outcome.result, 'DENIED_FAIL_CLOSED');
  assert.match(outcome.error, /prohibited_amr_method_sso\/saml_in_token_session/);
});

test('R2-01: Mixed password and email/change AMR is strictly denied', () => {
  const event = {
    user_id: 'd0407a9a-3f43-4e4b-9e20-5c3b5d38a0a4',
    authentication_method: 'token_refresh',
    claims: {
      sub: 'd0407a9a-3f43-4e4b-9e20-5c3b5d38a0a4',
      email: 'user@example.com',
      amr: [
        { method: 'password', timestamp: 1700000000 },
        { method: 'email/change', timestamp: 1700000000 }
      ]
    }
  };
  const outcome = classifyHookOutcome(event);
  assert.equal(outcome.allowed, false);
  assert.equal(outcome.result, 'DENIED_FAIL_CLOSED');
  assert.match(outcome.error, /prohibited_amr_method_email\/change_in_token_session/);
});

test('R2-01: Mixed password and completely unknown AMR method is strictly denied (catch-all allowlist)', () => {
  const event = {
    user_id: 'd0407a9a-3f43-4e4b-9e20-5c3b5d38a0a4',
    authentication_method: 'password',
    claims: {
      sub: 'd0407a9a-3f43-4e4b-9e20-5c3b5d38a0a4',
      email: 'user@example.com',
      amr: [
        { method: 'password', timestamp: 1700000000 },
        { method: 'unknown_future_auth_vector', timestamp: 1700000000 }
      ]
    }
  };
  const outcome = classifyHookOutcome(event);
  assert.equal(outcome.allowed, false);
  assert.equal(outcome.result, 'DENIED_FAIL_CLOSED');
  assert.match(outcome.error, /prohibited_amr_method_unknown_future_auth_vector_in_token_session/);
});

// R2-01 Malformed AMR element regression tests
test('R2-01: Non-object element in AMR array fails closed', () => {
  for (const badItem of ['password', 123, null, true, ['nested']]) {
    const event = {
      authentication_method: 'password',
      claims: {
        sub: 'd0407a9a-3f43-4e4b-9e20-5c3b5d38a0a4',
        amr: [{ method: 'password' }, badItem]
      }
    };
    const outcome = classifyHookOutcome(event);
    assert.equal(outcome.allowed, false);
    assert.equal(outcome.result, 'DENIED_FAIL_CLOSED');
    assert.match(outcome.error, /malformed_amr_element/);
  }
});

test('R2-01: AMR element missing string method property fails closed', () => {
  for (const badMethod of [undefined, null, 123, true, {}, []]) {
    const event = {
      authentication_method: 'password',
      claims: {
        sub: 'd0407a9a-3f43-4e4b-9e20-5c3b5d38a0a4',
        amr: [{ method: 'password' }, { method: badMethod, timestamp: 1700000000 }]
      }
    };
    const outcome = classifyHookOutcome(event);
    assert.equal(outcome.allowed, false);
    assert.equal(outcome.result, 'DENIED_FAIL_CLOSED');
    assert.match(outcome.error, /malformed_amr_method/);
  }
});

test('R2-01: AMR element with blank or whitespace method fails closed', () => {
  const event = {
    authentication_method: 'password',
    claims: {
      sub: 'd0407a9a-3f43-4e4b-9e20-5c3b5d38a0a4',
      amr: [{ method: 'password' }, { method: '   ' }]
    }
  };
  const outcome = classifyHookOutcome(event);
  assert.equal(outcome.allowed, false);
  assert.equal(outcome.result, 'DENIED_FAIL_CLOSED');
  assert.match(outcome.error, /malformed_amr_method/);
});

// R2-03 JWT Claim Handling: Dedicated Server-Owned Claim (Independent of user_metadata)
test('R2-03: Successfully adds amr_authenticated when user_metadata is absent from claims', () => {
  const event = {
    user_id: 'd0407a9a-3f43-4e4b-9e20-5c3b5d38a0a4',
    authentication_method: 'password',
    claims: {
      sub: 'd0407a9a-3f43-4e4b-9e20-5c3b5d38a0a4',
      email: 'user@example.com',
      role: 'authenticated',
      amr: [{ method: 'password', timestamp: 1700000000 }]
      // user_metadata explicitly absent
    }
  };
  const outcome = classifyHookOutcome(event);
  assert.equal(outcome.allowed, true);
  assert.equal(outcome.amr_authenticated, true);

  const evaluated = evaluateCustomAccessTokenHook(event);
  assert.equal(evaluated.claims.amr_authenticated, 'true');
  assert.equal(evaluated.claims.user_metadata, undefined);
});

test('R2-03: Successfully adds amr_authenticated when user_metadata is present', () => {
  const event = {
    user_id: 'd0407a9a-3f43-4e4b-9e20-5c3b5d38a0a4',
    authentication_method: 'password',
    claims: {
      sub: 'd0407a9a-3f43-4e4b-9e20-5c3b5d38a0a4',
      email: 'user@example.com',
      role: 'authenticated',
      amr: [{ method: 'password', timestamp: 1700000000 }],
      user_metadata: { custom_client_pref: 'dark' }
    }
  };
  const evaluated = evaluateCustomAccessTokenHook(event);
  assert.equal(evaluated.claims.amr_authenticated, 'true');
  assert.equal(evaluated.claims.user_metadata.custom_client_pref, 'dark');
});

test('R2-03: Successfully adds amr_authenticated when user_metadata is null or primitive', () => {
  const event = {
    user_id: 'd0407a9a-3f43-4e4b-9e20-5c3b5d38a0a4',
    authentication_method: 'password',
    claims: {
      sub: 'd0407a9a-3f43-4e4b-9e20-5c3b5d38a0a4',
      email: 'user@example.com',
      role: 'authenticated',
      amr: [{ method: 'password', timestamp: 1700000000 }],
      user_metadata: null
    }
  };
  const evaluated = evaluateCustomAccessTokenHook(event);
  assert.equal(evaluated.claims.amr_authenticated, 'true');
});

// Additional Boundary Tests
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

// R3-01 / R4-01 / R4-02: Send Email Hook Suppression & Parity Contract Tests
test('R4-01: Native recovery email dispatch is suppressed fail-closed (SQLSTATE 42501)', () => {
  const event = {
    user: { id: 'd0407a9a-3f43-4e4b-9e20-5c3b5d38a0a4', email: 'user@example.invalid' },
    email_data: {
      token: 'recovery-token-123456',
      token_hash: 'hash-abc',
      redirect_to: 'https://example.invalid/reset',
      email_action_type: 'recovery'
    }
  };
  assert.throws(() => evaluateSendEmailHook(event), (err) => {
    assert.match(err.message, /native_recovery_email_dispatch_suppressed/);
    assert.equal(err.code, '42501');
    return true;
  });
  const outcome = classifySendEmailOutcome(event);
  assert.equal(outcome.allowed, false);
  assert.equal(outcome.result, 'SUPPRESSED_FAIL_CLOSED');
  assert.equal(outcome.sqlstate, '42501');
});

test('R4-01: Native signup email dispatch is suppressed fail-closed (SQLSTATE 42501)', () => {
  const event = {
    user: { id: 'd0407a9a-3f43-4e4b-9e20-5c3b5d38a0a4', email: 'user@example.invalid' },
    email_data: {
      token: 'signup-token-123456',
      email_action_type: 'signup'
    }
  };
  assert.throws(() => evaluateSendEmailHook(event), (err) => {
    assert.match(err.message, /native_signup_email_dispatch_suppressed/);
    assert.equal(err.code, '42501');
    return true;
  });
});

test('R4-01: Native magiclink email dispatch is suppressed fail-closed (SQLSTATE 42501)', () => {
  const event = {
    user: { id: 'd0407a9a-3f43-4e4b-9e20-5c3b5d38a0a4', email: 'user@example.invalid' },
    email_data: {
      token: 'magic-token-123456',
      email_action_type: 'magiclink'
    }
  };
  assert.throws(() => evaluateSendEmailHook(event), (err) => {
    assert.match(err.message, /native_magiclink_email_dispatch_suppressed/);
    assert.equal(err.code, '42501');
    return true;
  });
});

test('R4-01: Native invite and email_change email dispatches are suppressed fail-closed (SQLSTATE 42501)', () => {
  for (const action of ['invite', 'email_change']) {
    const event = {
      user: { id: 'd0407a9a-3f43-4e4b-9e20-5c3b5d38a0a4', email: 'user@example.invalid' },
      email_data: {
        token: 'action-token-123456',
        email_action_type: action
      }
    };
    assert.throws(() => evaluateSendEmailHook(event), (err) => {
      assert.match(err.message, new RegExp(`native_${action}_email_dispatch_suppressed`));
      assert.equal(err.code, '42501');
      return true;
    });
  }
});

test('R4-01 / R4-02: Send Email Hook fails closed on null or non-object payload', () => {
  assert.throws(() => evaluateSendEmailHook(null), /invalid_hook_event/);
  assert.throws(() => evaluateSendEmailHook([]), /invalid_hook_event/);
  assert.throws(() => evaluateSendEmailHook('string-event'), /invalid_hook_event/);
});

test('R4-01 / R4-02: Send Email Hook fails closed on missing, null, or malformed email_data', () => {
  assert.throws(() => evaluateSendEmailHook({ user: {} }), /missing_email_data/);
  assert.throws(() => evaluateSendEmailHook({ user: {}, email_data: null }), /missing_email_data/);
  assert.throws(() => evaluateSendEmailHook({ user: {}, email_data: 'not-an-object' }), /missing_email_data/);
  assert.throws(() => evaluateSendEmailHook({ user: {}, email_data: [] }), /missing_email_data/);
});

test('R4-01 / R4-02: Send Email Hook fails closed on missing, blank, or whitespace email_action_type', () => {
  assert.throws(() => evaluateSendEmailHook({ user: {}, email_data: {} }), /missing_email_action_type/);
  assert.throws(() => evaluateSendEmailHook({ user: {}, email_data: { email_action_type: '' } }), /missing_email_action_type/);
  assert.throws(() => evaluateSendEmailHook({ user: {}, email_data: { email_action_type: '   ' } }), /missing_email_action_type/);
  assert.throws(() => evaluateSendEmailHook({ user: {}, email_data: { email_action_type: 123 } }), /missing_email_action_type/);
});

test('R4-02: Send Email Hook strictly rejects undocumented aliases (event.email and event.action_type)', () => {
  // event.email alias must NOT be accepted as email_data
  const aliasEvent1 = {
    user: { id: 'test' },
    email: { email_action_type: 'recovery' }
  };
  assert.throws(() => evaluateSendEmailHook(aliasEvent1), /missing_email_data/);

  // event.action_type alias must NOT be accepted as email_action_type
  const aliasEvent2 = {
    user: { id: 'test' },
    email_data: {},
    action_type: 'recovery'
  };
  assert.throws(() => evaluateSendEmailHook(aliasEvent2), /missing_email_action_type/);
});

test('R4-01 / R4-02: Unknown action types fail closed with SQLSTATE 42501', () => {
  const unknownEvent = {
    user: { id: 'd0407a9a-3f43-4e4b-9e20-5c3b5d38a0a4' },
    email_data: {
      email_action_type: 'unknown_vendor_action'
    }
  };
  assert.throws(() => evaluateSendEmailHook(unknownEvent), (err) => {
    assert.match(err.message, /unrecognized_email_action_type_unknown_vendor_action/);
    assert.equal(err.code, '42501');
    return true;
  });
  const outcome = classifySendEmailOutcome(unknownEvent);
  assert.equal(outcome.allowed, false);
  assert.equal(outcome.result, 'SUPPRESSED_FAIL_CLOSED');
  assert.equal(outcome.sqlstate, '42501');
});

test('R4-02: Permitted custom notification returns empty object {} matching SQL return value', () => {
  const customEvent = {
    user: { id: 'd0407a9a-3f43-4e4b-9e20-5c3b5d38a0a4' },
    email_data: {
      email_action_type: 'custom_notification'
    }
  };
  const result = evaluateSendEmailHook(customEvent);
  assert.deepEqual(result, {});

  const outcome = classifySendEmailOutcome(customEvent);
  assert.equal(outcome.allowed, true);
  assert.equal(outcome.result, 'ALLOWED');
  assert.deepEqual(outcome.response, {});
});
