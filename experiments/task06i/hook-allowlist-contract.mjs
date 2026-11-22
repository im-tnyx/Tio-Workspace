// Pure offline specification and assertion evaluator for Task 06I-B1
// Simulates and verifies the Custom Access Token Hook allowlist contract (Task 06I-A Section 4.2 / R13 & Task 06I-B1-R2).
// Implements exact provider event schema parsing and RFC 8176 object-array AMR traversal.

export const DISALLOWED_AUTH_METHODS = new Set([
  'otp',
  'recovery',
  'magiclink',
  'signup',
  'email/signup',
  'invite',
  'anonymous',
  'oauth',
  'sso',
  'sso/saml',
  'totp',
  'email_change',
  'email/change'
]);

/**
 * Custom Access Token Hook specification evaluator.
 * Mirrors private_auth.custom_access_token_hook(event jsonb) SQL function.
 * Enforces strict allowlist: ONLY method 'password' is permitted in AMR.
 * Any other method (known disallowed or unknown/unrecognized) immediately fails closed.
 *
 * @param {object} event Provider hook input event
 * @returns {object} Modified event if allowed
 * @throws {Error} Fail-closed exception with SQLSTATE 42501 if denied or malformed
 */
export function evaluateCustomAccessTokenHook(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    const err = new Error('invalid_hook_event: event must be a non-null JSON object');
    err.code = '42501';
    throw err;
  }

  const authMethod = event.authentication_method;
  if (typeof authMethod !== 'string' || !authMethod.trim()) {
    const err = new Error('missing_authentication_method: top-level authentication_method is required');
    err.code = '42501';
    throw err;
  }

  if (authMethod !== 'password' && authMethod !== 'token_refresh') {
    const err = new Error(`authentication_method_${authMethod}_not_permitted_by_policy`);
    err.code = '42501';
    throw err;
  }

  const claims = event.claims;
  if (!claims || typeof claims !== 'object' || Array.isArray(claims)) {
    const err = new Error('missing_or_malformed_claims: claims must be a non-null JSON object');
    err.code = '42501';
    throw err;
  }

  const amr = claims.amr;
  if (!Array.isArray(amr) || amr.length === 0) {
    const err = new Error('missing_or_empty_amr: amr must be a non-empty array of objects');
    err.code = '42501';
    throw err;
  }

  let hasPasswordOrigin = false;
  for (const item of amr) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      const err = new Error('malformed_amr_element: amr elements must be objects conforming to RFC 8176');
      err.code = '42501';
      throw err;
    }

    const method = item.method;
    if (typeof method !== 'string' || !method.trim()) {
      const err = new Error('malformed_amr_method: amr object missing string method property');
      err.code = '42501';
      throw err;
    }

    if (method === 'password') {
      hasPasswordOrigin = true;
    } else {
      // Strict allowlist: Any non-password method (whether in DISALLOWED_AUTH_METHODS or completely unknown)
      // immediately triggers SQLSTATE 42501 fail-closed rejection.
      const err = new Error(`prohibited_amr_method_${method}_in_token_session`);
      err.code = '42501';
      throw err;
    }
  }

  if (!hasPasswordOrigin) {
    const err = new Error('missing_password_origin: session lacks verified password authentication method in amr');
    err.code = '42501';
    throw err;
  }

  // Hook succeeds: add dedicated server-owned authorization claim directly under claims
  // (does not rely on client-editable or optionally missing user_metadata)
  const modifiedClaims = {
    ...claims,
    amr_authenticated: 'true'
  };

  return {
    ...event,
    claims: modifiedClaims
  };
}

export const SUPPRESSED_EMAIL_ACTIONS = new Set([
  'recovery',
  'signup',
  'magiclink',
  'invite',
  'email_change'
]);

export const PERMITTED_EMAIL_ACTIONS = new Set([
  'custom_notification'
]);

/**
 * Send Email Hook specification evaluator.
 * Mirrors private_auth.send_email_hook(event jsonb) SQL function.
 * Enforces strict email suppression for native recovery, signup, magiclink, invite, and email_change endpoints.
 * Strictly validates that email_data is a non-null JSON object and email_action_type is a non-blank string.
 * Disallows undocumented aliases (e.g. event.email or event.action_type).
 * Fails closed with SQLSTATE 42501 on malformed payloads, suppressed native actions, or unknown action types.
 *
 * @param {object} event Provider hook input event
 * @returns {object} Response object ({}) matching '{}'::jsonb if allowed
 * @throws {Error} Fail-closed exception with SQLSTATE 42501 if suppressed, unrecognized, or malformed
 */
export function evaluateSendEmailHook(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    const err = new Error('invalid_hook_event: event must be a non-null JSON object');
    err.code = '42501';
    throw err;
  }

  const emailData = event.email_data;
  if (!emailData || typeof emailData !== 'object' || Array.isArray(emailData)) {
    const err = new Error('missing_email_data: event must contain email_data object');
    err.code = '42501';
    throw err;
  }

  const actionType = emailData.email_action_type;
  if (typeof actionType !== 'string' || !actionType.trim()) {
    const err = new Error('missing_email_action_type: email_data must specify a non-empty string email_action_type');
    err.code = '42501';
    throw err;
  }

  const normalizedAction = actionType.trim();

  // Strict suppression list: native recovery, signup, magiclink, invite, and email_change dispatch
  if (SUPPRESSED_EMAIL_ACTIONS.has(normalizedAction)) {
    const err = new Error(`native_${normalizedAction}_email_dispatch_suppressed_by_security_policy`);
    err.code = '42501';
    throw err;
  }

  // Explicit allowlist: permitted future custom notification actions
  if (PERMITTED_EMAIL_ACTIONS.has(normalizedAction)) {
    return {};
  }

  // Fail-closed on all unknown or unsupported action types
  const err = new Error(`unrecognized_email_action_type_${normalizedAction}`);
  err.code = '42501';
  throw err;
}

/**
 * Classifies the outcome of a provider hook evaluation against security requirements.
 */
export function classifyHookOutcome(event) {
  try {
    const result = evaluateCustomAccessTokenHook(event);
    return {
      allowed: true,
      error: null,
      result: 'ALLOWED',
      amr_authenticated: result.claims?.amr_authenticated === 'true'
    };
  } catch (err) {
    return {
      allowed: false,
      error: err.message,
      sqlstate: err.code || 'UNKNOWN',
      result: 'DENIED_FAIL_CLOSED'
    };
  }
}

/**
 * Classifies the outcome of a send email hook evaluation.
 */
export function classifySendEmailOutcome(event) {
  try {
    const result = evaluateSendEmailHook(event);
    return {
      allowed: true,
      error: null,
      result: 'ALLOWED',
      response: result
    };
  } catch (err) {
    return {
      allowed: false,
      error: err.message,
      sqlstate: err.code || 'UNKNOWN',
      result: 'SUPPRESSED_FAIL_CLOSED'
    };
  }
}
