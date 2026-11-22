// Pure offline preflight evaluator for Task 06I-B1-R2
// Evaluates the 18 preflight security requirements and enforces fail-closed classification and quota/target rules.

export const VALID_STATUSES = new Set([
  'VERIFIED PASS',
  'VERIFIED FAIL',
  'NOT TESTED',
  'BLOCKED',
  'REQUIRES OWNER APPROVAL'
]);

export const TARGET_STRATEGIES = new Set([
  'NEW_DISPOSABLE_PROJECT',
  'EXISTING_PROJECT_TESTBED'
]);

/**
 * Task 06I-B1-R2 18-point Security Matrix Specifications
 * Includes BYPASS-05 for direct recovery endpoint and hook failure/fallback.
 */
export const PREFLIGHT_REQUIREMENTS = [
  // 1. Native Bypass Tests (5 items)
  {
    id: 'BYPASS-01',
    category: 'Native Bypass',
    target: 'POST /auth/v1/otp',
    description: 'Direct native email OTP request rejected (422/email_provider_disabled)',
    documentedCapability: 'external_email_magic_link_disabled = true in Management API PATCH',
    expectedResponse: '422 Unprocessable Entity (email_provider_disabled)',
    hostedExecutionStatus: 'NOT TESTED',
    prerequisite: 'Disposable project with external_email_magic_link_disabled patched'
  },
  {
    id: 'BYPASS-02',
    category: 'Native Bypass',
    target: 'POST /auth/v1/signup',
    description: 'Direct native signup request rejected (422/signup_disabled)',
    documentedCapability: 'disable_signup = true in Management API PATCH',
    expectedResponse: '422 Unprocessable Entity (signup_disabled)',
    hostedExecutionStatus: 'NOT TESTED',
    prerequisite: 'Disposable project with disable_signup patched'
  },
  {
    id: 'BYPASS-03',
    category: 'Native Bypass',
    target: 'POST /auth/v1/verify (email & recovery)',
    description: 'Direct native OTP verification rejected by hook (500/hook_error; 0 token issued)',
    documentedCapability: 'Custom Access Token Hook fails closed on method otp or recovery',
    expectedResponse: '500 Error invoking access token hook (zero token issued)',
    hostedExecutionStatus: 'NOT TESTED',
    prerequisite: 'Custom Access Token Hook deployed to private_auth schema and registered/enabled via hook_custom_access_token_enabled'
  },
  {
    id: 'BYPASS-04',
    category: 'Native Bypass',
    target: 'Magic Link, Invite & Anonymous',
    description: 'Direct passwordless login, invite redemption, and anonymous session minting rejected',
    documentedCapability: 'Custom Access Token Hook rejects non-password authentication_method',
    expectedResponse: '500 Error invoking access token hook (zero token issued)',
    hostedExecutionStatus: 'NOT TESTED',
    prerequisite: 'Custom Access Token Hook deployed and registered/enabled via hook_custom_access_token_enabled'
  },
  {
    id: 'BYPASS-05',
    category: 'Native Bypass',
    target: 'POST /auth/v1/recover',
    description: 'Direct native password recovery request; Send Email Hook intercepts and raises SQLSTATE 42501 exception to abort recovery dispatch; zero recovery token delivered; Hosted Unverified',
    documentedCapability: 'Send Email Hook intercepts email_action_type = recovery and fails closed with SQLSTATE 42501',
    expectedResponse: 'HTTP 500 / error response or generic anti-enumeration response; zero recovery email/token delivered (Hosted Unverified)',
    hostedExecutionStatus: 'NOT TESTED',
    prerequisite: 'Send Email Hook deployed to private_auth schema and registered/enabled via hook_send_email_enabled'
  },

  // 2. Token Hook Tests (7 items)
  {
    id: 'HOOK-01',
    category: 'Token Hook',
    target: 'Password Sign-In',
    description: 'Legitimate password authentication succeeds and issues JWT with amr: [password]',
    documentedCapability: 'Custom Access Token Hook allows authentication_method = password',
    expectedResponse: '200 OK with valid JWT access token and user session',
    hostedExecutionStatus: 'NOT TESTED',
    prerequisite: 'Valid test user enrolled with password'
  },
  {
    id: 'HOOK-02',
    category: 'Token Hook',
    target: 'Password Token Refresh',
    description: 'Legitimate session refresh succeeds for session with password-origin AMR',
    documentedCapability: 'Custom Access Token Hook parses amr object-array on token_refresh',
    expectedResponse: '200 OK with fresh JWT access token',
    hostedExecutionStatus: 'NOT TESTED',
    prerequisite: 'Active password session'
  },
  {
    id: 'HOOK-03',
    category: 'Token Hook',
    target: 'OTP-Origin Token Denial',
    description: 'Token refresh or token issuance with OTP-origin AMR is rejected',
    documentedCapability: 'Custom Access Token Hook detects amr contains otp and aborts',
    expectedResponse: '500 Error invoking access token hook (SQLSTATE 42501)',
    hostedExecutionStatus: 'NOT TESTED',
    prerequisite: 'Simulated OTP session payload'
  },
  {
    id: 'HOOK-04',
    category: 'Token Hook',
    target: 'Recovery-Origin Token Denial',
    description: 'Token refresh or token issuance with recovery-origin AMR is rejected',
    documentedCapability: 'Custom Access Token Hook detects amr contains recovery and aborts',
    expectedResponse: '500 Error invoking access token hook (SQLSTATE 42501)',
    hostedExecutionStatus: 'NOT TESTED',
    prerequisite: 'Simulated recovery session payload'
  },
  {
    id: 'HOOK-05',
    category: 'Token Hook',
    target: 'Mixed AMR Rejection',
    description: 'Tokens containing password combined with disallowed methods (mixed AMR) rejected',
    documentedCapability: 'Full traversal of claims.amr rejects any disallowed method presence',
    expectedResponse: '500 Error invoking access token hook (SQLSTATE 42501)',
    hostedExecutionStatus: 'NOT TESTED',
    prerequisite: 'Simulated mixed AMR payload'
  },
  {
    id: 'HOOK-06',
    category: 'Token Hook',
    target: 'Malformed/Missing AMR Rejection',
    description: 'Tokens with missing claims, string-array AMR, or missing method property rejected',
    documentedCapability: 'Strict JSON schema and RFC 8176 object validation in hook PL/pgSQL',
    expectedResponse: '500 Error invoking access token hook (SQLSTATE 42501)',
    hostedExecutionStatus: 'NOT TESTED',
    prerequisite: 'Malformed payload'
  },
  {
    id: 'HOOK-07',
    category: 'Token Hook',
    target: 'Fail-Closed Exception Handling',
    description: 'Hook runtime errors, syntax errors, or unhandled exceptions fail closed (no token)',
    documentedCapability: 'Supabase GoTrue aborts session creation when hook returns non-200 / SQL error',
    expectedResponse: '500 Error invoking access token hook (transaction aborted)',
    hostedExecutionStatus: 'NOT TESTED',
    prerequisite: 'Intentional SQL exception in hook'
  },

  // 3. Session & Consumer Cutover Tests (6 items)
  {
    id: 'SESSION-01',
    category: 'Session & Consumer',
    target: 'Session Minting',
    description: 'Valid password sign-in creates durable row in auth.sessions',
    documentedCapability: 'GoTrue creates session record on password grant',
    expectedResponse: 'Session row present with matching user_id',
    hostedExecutionStatus: 'NOT TESTED',
    prerequisite: 'Password sign-in'
  },
  {
    id: 'SESSION-02',
    category: 'Session & Consumer',
    target: 'Server Password Reset & Session Invalidation',
    description: 'Admin API updateUserById with password invalidates all existing sessions in auth.sessions',
    documentedCapability: 'GoTrue deletes or revokes auth.sessions for user on admin password update',
    expectedResponse: 'Sessions deleted/revoked; count drops to 0',
    hostedExecutionStatus: 'NOT TESTED',
    prerequisite: 'Existing active session + service_role call'
  },
  {
    id: 'SESSION-03',
    category: 'Session & Consumer',
    target: 'Direct /auth/v1/user Revocation Rejection',
    description: 'GET/PUT /auth/v1/user using revoked JWT immediately rejected (403/session_not_found)',
    documentedCapability: 'GoTrue checks auth.sessions on every /user endpoint request',
    expectedResponse: '403 Forbidden (session_not_found)',
    hostedExecutionStatus: 'NOT TESTED',
    prerequisite: 'Revoked bearer token'
  },
  {
    id: 'SESSION-04',
    category: 'Session & Consumer',
    target: 'PostgREST Data API Linger Window',
    description: 'Probe PostgREST with revoked JWT to document stateless lingering window',
    documentedCapability: 'PostgREST validates JWT signature statelessly without querying auth.sessions; accepted until exp',
    expectedResponse: 'Documented behavior: accepted until exp; bounded by short jwt_exp (300s); key rotation is non-routine emergency measure',
    hostedExecutionStatus: 'NOT TESTED',
    prerequisite: 'Revoked bearer token against public table'
  },
  {
    id: 'SESSION-05',
    category: 'Session & Consumer',
    target: 'Storage API Linger Window',
    description: 'Probe Storage API with revoked JWT to document stateless lingering window',
    documentedCapability: 'Storage validates JWT signature statelessly without querying auth.sessions; accepted until exp',
    expectedResponse: 'Documented behavior: accepted until exp; bounded by short jwt_exp (300s); server-side authorization required for immediate revocation',
    hostedExecutionStatus: 'NOT TESTED',
    prerequisite: 'Revoked bearer token against storage object'
  },
  {
    id: 'SESSION-06',
    category: 'Session & Consumer',
    target: 'Edge Function auth.getUser() Rejection',
    description: 'Edge Function calling supabase.auth.getUser() immediately rejects revoked session',
    documentedCapability: 'auth.getUser() validates with GoTrue server-side and checks auth.sessions',
    expectedResponse: '403/AuthSessionMissingError inside Edge Function',
    hostedExecutionStatus: 'NOT TESTED',
    prerequisite: 'Edge Function deployment + revoked bearer token'
  }
];

export const EXPECTED_REQUIREMENT_IDS = new Set(PREFLIGHT_REQUIREMENTS.map(r => r.id));

/**
 * Validates the status classification of a requirement.
 */
export function validateRequirementStatus(status) {
  if (!VALID_STATUSES.has(status)) {
    throw new Error(`invalid_status: ${status}`);
  }
  return true;
}

/**
 * Validates the full set of requirements.
 * Rejects empty arrays, duplicate IDs, missing expected IDs, or unknown IDs.
 *
 * @param {Array<object>} requirements Requirements array
 * @returns {object} Validation result
 */
export function validateRequirementSet(requirements) {
  if (!Array.isArray(requirements) || requirements.length === 0) {
    throw new Error('invalid_requirements_input: requirements must be a non-empty array');
  }

  const seenIds = new Set();
  const duplicateIds = [];
  for (const req of requirements) {
    if (!req || typeof req !== 'object' || typeof req.id !== 'string') {
      throw new Error('invalid_requirement_shape: each requirement must be an object with string id');
    }
    validateRequirementStatus(req.hostedExecutionStatus);
    if (seenIds.has(req.id)) {
      duplicateIds.push(req.id);
    }
    seenIds.add(req.id);
  }

  if (duplicateIds.length > 0) {
    throw new Error(`duplicate_requirement_ids: duplicate IDs encountered: ${duplicateIds.join(', ')}`);
  }

  const missingExpected = [];
  for (const expId of EXPECTED_REQUIREMENT_IDS) {
    if (!seenIds.has(expId)) {
      missingExpected.push(expId);
    }
  }

  if (missingExpected.length > 0) {
    throw new Error(`missing_expected_requirements: expected requirement IDs missing: ${missingExpected.join(', ')}`);
  }

  const unknownIds = [];
  for (const id of seenIds) {
    if (!EXPECTED_REQUIREMENT_IDS.has(id)) {
      unknownIds.push(id);
    }
  }

  if (unknownIds.length > 0) {
    throw new Error(`unknown_requirement_ids: unrecognized requirement IDs: ${unknownIds.join(', ')}`);
  }

  return { valid: true, count: seenIds.size };
}

/**
 * Computes the overall preflight gate decision.
 * Separates quota availability from hosted target strategy and enforces fail-closed checks.
 *
 * @param {object} accountQuota Account project slot availability
 * @param {object} options Target strategy, approval, and authorization options
 * @param {Array<object>} requirements Requirements list with statuses
 * @returns {object} Decision object
 */
export function evaluatePreflightGate(accountQuota, options = {}, requirements = PREFLIGHT_REQUIREMENTS) {
  // Validate complete requirement set (throws on empty, duplicate, missing, or malformed input)
  validateRequirementSet(requirements);

  if (!accountQuota || typeof accountQuota !== 'object') {
    throw new Error('missing_account_quota: account quota must be provided');
  }

  const targetStrategy = options.targetStrategy || 'NEW_DISPOSABLE_PROJECT';
  if (!TARGET_STRATEGIES.has(targetStrategy)) {
    throw new Error(`invalid_target_strategy: ${targetStrategy}`);
  }

  const activeProjects = accountQuota.activeProjects ?? 0;
  const freeTierLimit = accountQuota.freeTierLimit ?? 2;
  const freeSlotsAvailable = Math.max(0, freeTierLimit - activeProjects);

  const pendingApprovals = [];
  const blockers = [];

  // Evaluate target strategy and quota separately
  if (targetStrategy === 'NEW_DISPOSABLE_PROJECT') {
    if (freeSlotsAvailable === 0) {
      blockers.push({
        code: 'QUOTA_EXHAUSTED',
        detail: `Supabase Free tier active quota exhausted (${activeProjects}/${freeTierLimit} active projects; paused projects do not consume active slots). Creating a new disposable project requires an available Free-tier slot. Zero spending policy strictly forbids paid Pro upgrade.`
      });
    }

    if (!options.ownerApproved) {
      pendingApprovals.push({
        code: 'DISPOSABLE_PROJECT_CREATION_GATE',
        detail: 'Owner approval required before creating tio-auth-proof-disposable or modifying hosted project configuration.'
      });
    }
  } else if (targetStrategy === 'EXISTING_PROJECT_TESTBED') {
    // Existing project testing does not require a new slot, but requires explicit target safety authorization
    if (!options.targetAuthorized) {
      blockers.push({
        code: 'NO_SAFE_HOSTED_TARGET',
        detail: 'Hosted testing against existing projects requires explicit target authorization and safety approval. Production project bsfwzvgynwriswapxpsp and Tio-world are strictly READ-ONLY. Deleting/regenerating production project is NOT approved.'
      });
    }
  }

  // Evaluate requirements status counts
  const verifiedPass = requirements.filter(r => r.hostedExecutionStatus === 'VERIFIED PASS');
  const verifiedFail = requirements.filter(r => r.hostedExecutionStatus === 'VERIFIED FAIL');
  const blockedReqs = requirements.filter(r => r.hostedExecutionStatus === 'BLOCKED');
  const notTestedReqs = requirements.filter(r => r.hostedExecutionStatus === 'NOT TESTED');
  const approvalReqs = requirements.filter(r => r.hostedExecutionStatus === 'REQUIRES OWNER APPROVAL');

  // Surface VERIFIED FAIL as blocking failure
  if (verifiedFail.length > 0) {
    blockers.push({
      code: 'REQUIREMENT_FAILURES',
      detail: `${verifiedFail.length} security requirements failed verification: ${verifiedFail.map(r => r.id).join(', ')}`
    });
  }

  // Surface BLOCKED requirements as blocking
  if (blockedReqs.length > 0) {
    blockers.push({
      code: 'REQUIREMENTS_BLOCKED',
      detail: `${blockedReqs.length} security requirements are blocked: ${blockedReqs.map(r => r.id).join(', ')}`
    });
  }

  let overallVerdict;
  if (blockers.length > 0) {
    overallVerdict = 'BLOCKED';
  } else if (pendingApprovals.length > 0 || approvalReqs.length > 0) {
    overallVerdict = 'REQUIRES OWNER APPROVAL';
  } else if (notTestedReqs.length > 0) {
    overallVerdict = 'READY FOR HOSTED EXECUTION';
  } else if (verifiedPass.length === EXPECTED_REQUIREMENT_IDS.size) {
    overallVerdict = 'ALL CHECKS PASSED';
  } else {
    overallVerdict = 'BLOCKED';
  }

  return {
    verdict: overallVerdict,
    targetStrategy,
    freeSlotsAvailable,
    activeProjects,
    freeTierLimit,
    blockers,
    pendingApprovals,
    counts: {
      total: requirements.length,
      verifiedPass: verifiedPass.length,
      verifiedFail: verifiedFail.length,
      blocked: blockedReqs.length,
      notTested: notTestedReqs.length,
      requiresOwnerApproval: approvalReqs.length
    },
    costPolicy: 'STRICT_ZERO_COST',
    productionAuthStatus: 'NO-GO'
  };
}
