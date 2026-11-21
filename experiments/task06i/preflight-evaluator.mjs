// Pure offline preflight evaluator for Task 06I-B1
// Evaluates the 17 preflight security requirements and enforces classification rules.

export const VALID_STATUSES = new Set([
  'VERIFIED PASS',
  'VERIFIED FAIL',
  'NOT TESTED',
  'BLOCKED',
  'REQUIRES OWNER APPROVAL'
]);

/**
 * Task 06I-B1 17-point Security Matrix Specifications
 */
export const PREFLIGHT_REQUIREMENTS = [
  // 1. Native Bypass Tests (4 items)
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
    prerequisite: 'Custom Access Token Hook deployed to private_auth schema'
  },
  {
    id: 'BYPASS-04',
    category: 'Native Bypass',
    target: 'Magic Link, Invite & Anonymous',
    description: 'Direct passwordless login, invite redemption, and anonymous session minting rejected',
    documentedCapability: 'Custom Access Token Hook rejects non-password authentication_method',
    expectedResponse: '500 Error invoking access token hook (zero token issued)',
    hostedExecutionStatus: 'NOT TESTED',
    prerequisite: 'Custom Access Token Hook deployed'
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
 * Computes the overall preflight gate decision.
 *
 * @param {object} accountQuota Account project slot availability
 * @param {boolean} ownerApproved Has owner granted explicit approval for disposable project creation
 * @param {Array<object>} requirements Requirements list with statuses
 * @returns {object} Decision object
 */
export function evaluatePreflightGate(accountQuota, ownerApproved, requirements = PREFLIGHT_REQUIREMENTS) {
  if (!accountQuota || typeof accountQuota !== 'object') {
    throw new Error('missing_account_quota: account quota must be provided');
  }

  const activeProjects = accountQuota.activeProjects ?? 0;
  const freeTierLimit = accountQuota.freeTierLimit ?? 2;
  const freeSlotsAvailable = Math.max(0, freeTierLimit - activeProjects);

  const pendingApprovals = [];
  const blockers = [];

  if (freeSlotsAvailable === 0) {
    blockers.push({
      code: 'QUOTA_EXHAUSTED',
      detail: `Supabase Free tier active quota exhausted (${activeProjects}/${freeTierLimit} active projects; paused projects do not consume active slots). Owner policy enforces $0 cost; Tio-world is strictly off-limits.`
    });
  }

  if (!ownerApproved) {
    pendingApprovals.push({
      code: 'DISPOSABLE_PROJECT_CREATION_GATE',
      detail: 'Owner approval required before creating tio-auth-proof-disposable or modifying hosted project configuration.'
    });
  }

  // Count requirements
  const notTestedCount = requirements.filter(r => r.hostedExecutionStatus === 'NOT TESTED').length;

  let overallVerdict;
  if (blockers.length > 0 || pendingApprovals.length > 0) {
    overallVerdict = 'REQUIRES OWNER APPROVAL';
  } else if (notTestedCount > 0) {
    overallVerdict = 'READY FOR HOSTED EXECUTION';
  } else {
    overallVerdict = 'EVALUATION COMPLETE';
  }

  return {
    verdict: overallVerdict,
    freeSlotsAvailable,
    activeProjects,
    freeTierLimit,
    blockers,
    pendingApprovals,
    notTestedCount,
    totalRequirements: requirements.length,
    productionAuthStatus: 'NO-GO'
  };
}
