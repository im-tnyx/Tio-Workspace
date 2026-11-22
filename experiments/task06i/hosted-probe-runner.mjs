// Hosted Probe Runner Specification & Harness for Task 06I-B1-H0-R2
// Prepares the opt-in, fail-closed hosted test runner for future authorized testing.
// Enforces strict safety gates:
// 1. Immutable forbidden project boundary: Tio-world (oykupyiitspujzpwwvuj) and REAL project (bsfwzvgynwriswapxpsp)
//    are permanently blocked via hardcoded constants and private immutable lookup.
//    Caller-controlled env vars, tempRef parameters, exports, object mutations or Set operations CANNOT disable protection.
// 2. Explicit target allowlist: only verified TEMP project allowed (via TIO_SUPABASE_TEMP_REF); deny-by-default for unknown refs.
// 3. Separate authorization gate: requires both --live flag and TASK06I_HOSTED_PROBE_AUTHORIZED="true".
// 4. Default mode: DRY_RUN (zero network requests, zero Supabase mutations).
// 5. Serialized JSON secret redaction: structured JSON strings are parsed and recursively sanitized;
//    Bearer headers, JWTs, query params, passwords, refresh/access tokens, service_role keys, and credentials are redacted.
// 6. Test-only identities: restricted to reserved *.invalid / *.test domains.
// 7. Rate limiter: budget max 25 requests, 1000ms minimum interval throttling enforced via injectable scheduler.
// 8. Strict probe outcome validation: independent requirement-specific expectation validation,
//    dispatcher exception/timeout handling, fail-closed on non-boolean/missing passed, status mismatch rejection,
//    immediate halt on any failure, and COMPLETED never returned on partial/failed execution.
// 9. Zero fake LIVE success: missing dispatcher in LIVE mode immediately fails closed.
// 10. Zero automated project deletion and zero fallback to Tio-world.

import { PREFLIGHT_REQUIREMENTS } from './preflight-evaluator.mjs';

export const HARDCODED_REAL_REF = 'bsfwzvgynwriswapxpsp';
export const HARDCODED_TIO_WORLD_REF = 'oykupyiitspujzpwwvuj';
export const HARDCODED_TEMP_REF = 'wvdabiwbaavfggcmpizd';
export const DEFAULT_PROBE_TIMEOUT_MS = 5000;

export const TIO_SUPABASE_REAL_REF = HARDCODED_REAL_REF;
export const TIO_SUPABASE_TEMP_REF = process.env.TIO_SUPABASE_TEMP_REF || HARDCODED_TEMP_REF;

// Internal private immutable array — cannot be mutated from outside
const INTERNAL_FORBIDDEN_REFS = Object.freeze([
  HARDCODED_TIO_WORLD_REF, // Tio-world: PERMANENT IMMUNITY
  HARDCODED_REAL_REF       // REAL Tio-Tnyx: protected production backend
]);

/**
 * Authoritative, non-bypassable forbidden project check.
 * Direct hardcoded constant string comparisons guarantee immunity from Set mutation,
 * prototype pollution, env overrides, or export tampering.
 */
function isForbiddenProject(ref) {
  if (!ref || typeof ref !== 'string') return false;
  const norm = ref.trim().toLowerCase();
  if (norm === HARDCODED_TIO_WORLD_REF || norm === HARDCODED_REAL_REF) {
    return true;
  }
  for (const forbidden of INTERNAL_FORBIDDEN_REFS) {
    if (norm === forbidden) return true;
  }
  const envRealRef = (process.env.TIO_SUPABASE_REAL_REF || '').trim().toLowerCase();
  if (envRealRef && norm === envRealRef) {
    return true;
  }
  return false;
}

/**
 * Immutable lookup interface exported for consumers/tests.
 * Mutation methods like delete, add, or clear either do not exist or throw errors.
 * validateTargetProject does NOT rely on this object for authoritative security decisions.
 */
export const IMMUTABLE_FORBIDDEN_PROJECTS = Object.freeze({
  has(ref) {
    return isForbiddenProject(ref);
  },
  includes(ref) {
    return isForbiddenProject(ref);
  },
  delete() {
    throw new TypeError('IMMUTABLE_FORBIDDEN_PROJECTS is immutable; deletion prohibited');
  },
  add() {
    throw new TypeError('IMMUTABLE_FORBIDDEN_PROJECTS is immutable; addition prohibited');
  },
  clear() {
    throw new TypeError('IMMUTABLE_FORBIDDEN_PROJECTS is immutable; clear prohibited');
  },
  [Symbol.iterator]() {
    return INTERNAL_FORBIDDEN_REFS[Symbol.iterator]();
  },
  get size() {
    return INTERNAL_FORBIDDEN_REFS.length;
  }
});

export const RESERVED_TEST_DOMAINS = ['.invalid', '.example', '.test', '.localhost'];

export const RATE_LIMIT_CONFIG = {
  maxTotalRequests: 25,
  minIntervalMs: 1000
};

const SENSITIVE_KEY_SUBSTRINGS = [
  'secret',
  'password',
  'token',
  'key',
  'authorization',
  'bearer',
  'credential',
  'service_role',
  'refresh_token',
  'access_token',
  'apikey',
  'api_key'
];

/**
 * Sanitizes strings, objects, or arrays to redact secrets before logging or storage.
 * Handles structured JSON strings, JWTs, bearer headers, key/secret parameters, query strings,
 * nested objects/arrays, and serialized response bodies.
 * Resolves PRRT_kwDOVtCmZc66ij55 and PRRT_kwDOVtCmZc66i_Kf.
 */
export function sanitizeData(data) {
  if (data === null || data === undefined) return data;

  if (typeof data === 'string') {
    const trimmed = data.trim();
    // 1. If string is structured JSON (starts with { or [), parse and recursively sanitize
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed === 'object' && parsed !== null) {
          const sanitizedObj = sanitizeData(parsed);
          return JSON.stringify(sanitizedObj);
        }
      } catch {
        // Not valid JSON, proceed to fail-closed string regex redaction
      }
    }

    // 2. Comprehensive string redactions
    return data
      // Redact Bearer authorization headers
      .replace(/Bearer\s+[^\s"';,]+/gi, 'Bearer [REDACTED]')
      // Redact full JWTs (header.payload.signature)
      .replace(/eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, '[REDACTED_JWT]')
      // Redact URL query parameters
      .replace(/([?&](?:token|token_hash|secret|password|api_key|apikey|service_role|refresh_token|access_token)=)([^&\s]+)/gi, '$1[REDACTED]')
      // Redact JSON-style or key=value sensitive fields in text (stopping at quotes, whitespace, commas, brackets, or &)
      .replace(/((?:["']?(?:api_key|apikey|secret|password|token_hash|token|service_role|refresh_token|access_token|authorization|credential)["']?)\s*[:=]\s*["']?)(?!(?:Bearer\s+)?\[REDACTED\])[^"',\s}&]+/gi, '$1[REDACTED]');
  }

  if (Array.isArray(data)) {
    return data.map(item => sanitizeData(item));
  }

  if (typeof data === 'object') {
    const sanitized = {};
    for (const [key, val] of Object.entries(data)) {
      const lower = key.toLowerCase();
      const isSensitive = SENSITIVE_KEY_SUBSTRINGS.some(term => lower.includes(term));
      if (isSensitive) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeData(val);
      }
    }
    return sanitized;
  }

  return data;
}

/**
 * Validates that an email address strictly uses reserved test-only domains.
 */
export function validateTestIdentity(email) {
  if (typeof email !== 'string' || !email.includes('@')) {
    throw new Error('invalid_test_identity: email must be a valid email string');
  }

  const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase();
  const isReserved = RESERVED_TEST_DOMAINS.some(suffix => domain.endsWith(suffix));

  if (!isReserved) {
    throw new Error(
      `security_violation: real customer or public domain '${domain}' prohibited. Must use a reserved test domain (*.invalid, *.example, *.test)`
    );
  }

  return true;
}

/**
 * Validates target project against security invariants and strict separation of REAL vs TEMP.
 * REAL project (bsfwzvgynwriswapxpsp) and Tio-world (oykupyiitspujzpwwvuj) are permanently forbidden.
 * In LIVE mode, strictly enforces approved owner TEMP project HARDCODED_TEMP_REF and rejects spoofing.
 * Resolves Phase D, PRRT_kwDOVtCmZc66i2Ff, PRRT_kwDOVtCmZc66i_Kb, and PRRT_kwDOVtCmZc66jOw4.
 */
export function validateTargetProject(projectRef, tempRef = HARDCODED_TEMP_REF, isLive = false, options = {}) {
  if (!projectRef || typeof projectRef !== 'string' || !projectRef.trim()) {
    throw new Error('invalid_project_ref: target projectRef is required and cannot be empty');
  }

  const normRef = projectRef.trim().toLowerCase();

  // 1. Direct hardcoded immunity check: Tio-world
  if (normRef === HARDCODED_TIO_WORLD_REF) {
    throw new Error(
      `CRITICAL_SECURITY_VIOLATION: Project '${normRef}' (Tio-world) is permanently forbidden and immune from testing!`
    );
  }

  // 2. Direct hardcoded protection check: REAL project
  if (normRef === HARDCODED_REAL_REF) {
    throw new Error(
      `CRITICAL_SECURITY_VIOLATION: Project '${normRef}' is the protected REAL backend and is permanently forbidden from test targeting!`
    );
  }

  // 3. Fallback to private immutable lookup
  if (isForbiddenProject(normRef)) {
    throw new Error(
      `CRITICAL_SECURITY_VIOLATION: Project '${normRef}' is permanently forbidden from test targeting!`
    );
  }

  // 4. LIVE Target Enforcement (PRRT_kwDOVtCmZc66jOw4)
  if (isLive) {
    // In LIVE mode, caller-controlled tempRef spoofing is unconditionally rejected
    if (tempRef && typeof tempRef === 'string') {
      const normTemp = tempRef.trim().toLowerCase();
      if (normTemp !== HARDCODED_TEMP_REF) {
        throw new Error(
          `CRITICAL_SECURITY_VIOLATION: Caller-controlled tempRef spoofing rejected! LIVE probes require approved TEMP ref '${HARDCODED_TEMP_REF}', received '${normTemp}'.`
        );
      }
    }

    if (normRef !== HARDCODED_TEMP_REF) {
      throw new Error(
        `unauthorized_target: LIVE target validation strictly requires approved owner TEMP project '${HARDCODED_TEMP_REF}'. Project '${normRef}' is not authorized for live probes.`
      );
    }

    return HARDCODED_TEMP_REF;
  }

  // 5. Non-LIVE (DRY_RUN or Isolated Test Seam) Target Validation
  const effectiveTemp = (tempRef || HARDCODED_TEMP_REF || '').trim().toLowerCase();
  if (effectiveTemp === HARDCODED_TIO_WORLD_REF || effectiveTemp === HARDCODED_REAL_REF || isForbiddenProject(effectiveTemp)) {
    throw new Error(
      `CRITICAL_SECURITY_VIOLATION: Configured TEMP ref '${effectiveTemp}' cannot be a protected or immune project!`
    );
  }

  if (options.allowIsolatedTestRef && !isLive) {
    // Confinable to explicitly isolated test mode only (PRRT_kwDOVtCmZc66jOw4)
    if (normRef !== effectiveTemp) {
      throw new Error(
        `unauthorized_target: Project '${normRef}' does not match isolated test ref '${effectiveTemp}'`
      );
    }
    return normRef;
  }

  // Normal non-live validation defaults to approved TEMP ref
  if (normRef !== HARDCODED_TEMP_REF && normRef !== effectiveTemp) {
    throw new Error(
      `unauthorized_target: Project '${normRef}' is not the authorized TEMP testbed project`
    );
  }

  return normRef;
}

/**
 * Determines runner execution mode.
 * Defaults strictly to DRY_RUN unless explicit --live flag AND env var are present.
 */
export function determineRunnerMode(argv = [], env = process.env) {
  const hasLiveFlag = argv.includes('--live');
  const hasAuthEnv = env.TASK06I_HOSTED_PROBE_AUTHORIZED === 'true';

  if (hasLiveFlag && hasAuthEnv) {
    return 'LIVE';
  }

  return 'DRY_RUN';
}

/**
 * Plans probe execution for the 18 preflight requirements.
 */
export function planProbeExecution(projectRef, options = {}) {
  const tempRef = options.tempRef || HARDCODED_TEMP_REF;
  const validatedRef = validateTargetProject(projectRef, tempRef, false, {
    allowIsolatedTestRef: options.allowIsolatedTestRef
  });
  const testUser = options.testEmail || `test-probe-${Date.now()}@auth-proof.invalid`;
  validateTestIdentity(testUser);

  const plannedCases = PREFLIGHT_REQUIREMENTS.map(req => ({
    id: req.id,
    category: req.category,
    target: req.target,
    expectedResponse: req.expectedResponse,
    plannedAction: `Execute probe against ${req.target} on TEMP project ${validatedRef}`,
    testUser
  }));

  return {
    projectRef: validatedRef,
    mode: 'PLANNED',
    testUser,
    totalProbes: plannedCases.length,
    plannedCases
  };
}

function isNonEmptyObject(val) {
  return val !== null && typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length > 0;
}

function isNonEmptyString(val) {
  return typeof val === 'string' && val.trim().length > 0;
}

function isValidHttpErrorStatus(status) {
  return typeof status === 'number' && Number.isInteger(status) && status >= 400 && status < 600;
}

/**
 * Independently validates probe dispatcher outcome against canonical requirement contract.
 * Enforces:
 * 1. Output must be a non-null object with explicit boolean `passed`.
 * 2. Status must be a positive integer (status 0 or missing status is invalid).
 * 3. Route disablement (BYPASS-01..04) strictly rejects HTTP 200 and token issuance, requires affirmative observation.
 * 4. Recovery suppression (BYPASS-05) strictly rejects email or token delivery, requires affirmative suppression proof.
 * 5. Token hooks (HOOK-01..07) and sessions (SESSION-01..06) strictly require non-empty affirmative observations.
 * 6. Empty objects/arrays/strings are rejected as proof.
 * Resolves PRRT_kwDOVtCmZc66i_Kd, PRRT_kwDOVtCmZc66jLk1, and PRRT_kwDOVtCmZc66jNbH.
 */
export function validateProbeOutcome(item, rawOutcome) {
  if (rawOutcome === null || rawOutcome === undefined || typeof rawOutcome !== 'object') {
    return {
      passed: false,
      status: 0,
      reason: 'INVALID_PAYLOAD_STRUCTURE: probe outcome must be a non-null object'
    };
  }

  if (typeof rawOutcome.passed !== 'boolean') {
    return {
      passed: false,
      status: typeof rawOutcome.status === 'number' ? rawOutcome.status : 0,
      reason: 'MISSING_OR_NON_BOOLEAN_PASSED: outcome.passed must be an explicit boolean'
    };
  }

  // If dispatcher reported failure, fail closed immediately
  if (rawOutcome.passed === false) {
    return {
      passed: false,
      status: typeof rawOutcome.status === 'number' ? rawOutcome.status : 0,
      reason: rawOutcome.error || rawOutcome.reason || 'DISPATCHER_REPORTED_FAILURE',
      evidence: rawOutcome.evidence || null
    };
  }

  // Dispatcher reported passed: true. Independently audit against canonical requirement expectations.
  const status = typeof rawOutcome.status === 'number' ? rawOutcome.status : 0;

  // Status must be a valid positive integer. Status 0 or missing status is invalid. (PRRT_kwDOVtCmZc66jLk1)
  if (status <= 0 || !Number.isInteger(status)) {
    return {
      passed: false,
      status,
      reason: `INVALID_HTTP_STATUS: probe ${item.id} requires a valid positive HTTP status, got ${status}`
    };
  }

  // 1. Native Bypass Requirements
  if (item.id === 'BYPASS-01') {
    // Native email OTP must be disabled (422/404/405/400/403/500). HTTP 200 is a critical violation!
    if (status === 200) {
      return {
        passed: false,
        status,
        reason: 'HTTP_STATUS_MISMATCH: BYPASS-01 received HTTP 200; native email OTP endpoint must be disabled'
      };
    }
    if (!isValidHttpErrorStatus(status)) {
      return {
        passed: false,
        status,
        reason: `INVALID_HTTP_STATUS: BYPASS-01 expected HTTP 4xx/5xx error status, got ${status}`
      };
    }
    if (rawOutcome.tokens || rawOutcome.has_token === true) {
      return {
        passed: false,
        status,
        reason: 'SECURITY_INVARIANT_VIOLATION: BYPASS-01 issued tokens on disabled route'
      };
    }
    const hasAffirmativeEvidence =
      rawOutcome.route_disabled === true ||
      rawOutcome.rejection_observed === true ||
      rawOutcome.error_code === 'email_provider_disabled' ||
      (isNonEmptyString(rawOutcome.error) && rawOutcome.error.includes('email_provider_disabled'));
    if (!hasAffirmativeEvidence) {
      return {
        passed: false,
        status,
        reason: 'MISSING_EVIDENCE: BYPASS-01 requires affirmative observation of route disablement (route_disabled: true or error_code)'
      };
    }
  }

  if (item.id === 'BYPASS-02') {
    // Native signup must be disabled (422/404/405/400/403/500). HTTP 200 is a critical violation!
    if (status === 200) {
      return {
        passed: false,
        status,
        reason: 'HTTP_STATUS_MISMATCH: BYPASS-02 received HTTP 200; native signup endpoint must be disabled'
      };
    }
    if (!isValidHttpErrorStatus(status)) {
      return {
        passed: false,
        status,
        reason: `INVALID_HTTP_STATUS: BYPASS-02 expected HTTP 4xx/5xx error status, got ${status}`
      };
    }
    if (rawOutcome.tokens || rawOutcome.has_token === true || rawOutcome.user_created === true) {
      return {
        passed: false,
        status,
        reason: 'SECURITY_INVARIANT_VIOLATION: BYPASS-02 created user or issued tokens on disabled route'
      };
    }
    const hasAffirmativeEvidence =
      rawOutcome.signup_disabled === true ||
      rawOutcome.rejection_observed === true ||
      rawOutcome.error_code === 'signup_disabled' ||
      (isNonEmptyString(rawOutcome.error) && rawOutcome.error.includes('signup_disabled'));
    if (!hasAffirmativeEvidence) {
      return {
        passed: false,
        status,
        reason: 'MISSING_EVIDENCE: BYPASS-02 requires affirmative observation of signup disablement (signup_disabled: true or error_code)'
      };
    }
  }

  if (item.id === 'BYPASS-03' || item.id === 'BYPASS-04') {
    // Direct native verify or magic link / invite / anonymous session must be rejected (500/400/403)
    if (status === 200 || rawOutcome.tokens || rawOutcome.has_token === true) {
      return {
        passed: false,
        status,
        reason: `SECURITY_INVARIANT_VIOLATION: ${item.id} received HTTP 200 or tokens on unauthorized route`
      };
    }
    if (!isValidHttpErrorStatus(status)) {
      return {
        passed: false,
        status,
        reason: `INVALID_HTTP_STATUS: ${item.id} expected HTTP 4xx/5xx error status, got ${status}`
      };
    }
    const hasAffirmativeEvidence =
      rawOutcome.hook_rejected === true ||
      rawOutcome.rejection_observed === true ||
      (isNonEmptyString(rawOutcome.error) && (rawOutcome.error.includes('hook_error') || rawOutcome.error.includes('42501')));
    if (!hasAffirmativeEvidence) {
      return {
        passed: false,
        status,
        reason: `MISSING_EVIDENCE: ${item.id} requires affirmative observation of hook rejection (hook_rejected: true)`
      };
    }
  }

  if (item.id === 'BYPASS-05') {
    // Native recovery suppression: zero recovery token or recovery email dispatched (PRRT_kwDOVtCmZc66jLk1)
    if (rawOutcome.recovery_email_delivered === true || rawOutcome.email_delivered === true || rawOutcome.recovery_token) {
      return {
        passed: false,
        status,
        reason: 'SECURITY_INVARIANT_VIOLATION: BYPASS-05 recovery email or token delivered'
      };
    }
    const hasAffirmativeEvidence =
      rawOutcome.recovery_suppressed === true ||
      (rawOutcome.email_suppressed === true && rawOutcome.zero_email_delivered === true) ||
      rawOutcome.hook_rejected === true;
    if (!hasAffirmativeEvidence) {
      return {
        passed: false,
        status,
        reason: 'MISSING_EVIDENCE: BYPASS-05 requires affirmative observation of recovery suppression (recovery_suppressed: true)'
      };
    }
  }

  // 2. Token Hook Requirements (HOOK-01..07)
  if (item.id === 'HOOK-01') {
    // Valid password sign-in must succeed with HTTP 200 and issue token with amr_authenticated
    if (status !== 200) {
      return {
        passed: false,
        status,
        reason: `HTTP_STATUS_MISMATCH: HOOK-01 expected HTTP 200, got ${status}`
      };
    }
    const hasValidToken =
      (isNonEmptyObject(rawOutcome.tokens) && isNonEmptyString(rawOutcome.tokens.access_token)) ||
      (isNonEmptyObject(rawOutcome.tokens) && rawOutcome.has_token === true) ||
      isNonEmptyString(rawOutcome.access_token);
    if (!hasValidToken) {
      return {
        passed: false,
        status,
        reason: 'MISSING_EVIDENCE: HOOK-01 expected explicit, non-empty token issuance (tokens.access_token) for valid password sign-in'
      };
    }
    const hasAmrEvidence =
      rawOutcome.amr_authenticated === true ||
      (Array.isArray(rawOutcome.amr) && rawOutcome.amr.includes('password')) ||
      (rawOutcome.tokens && isNonEmptyString(rawOutcome.tokens.amr) && rawOutcome.tokens.amr.includes('password'));
    if (!hasAmrEvidence) {
      return {
        passed: false,
        status,
        reason: 'MISSING_EVIDENCE: HOOK-01 expected verified amr_authenticated claim'
      };
    }
  }

  if (item.id === 'HOOK-02') {
    // Token refresh with password-origin AMR must succeed with HTTP 200 and issue fresh token
    if (status !== 200) {
      return {
        passed: false,
        status,
        reason: `HTTP_STATUS_MISMATCH: HOOK-02 expected HTTP 200, got ${status}`
      };
    }
    const hasValidToken =
      (isNonEmptyObject(rawOutcome.tokens) && isNonEmptyString(rawOutcome.tokens.access_token)) ||
      (isNonEmptyObject(rawOutcome.tokens) && rawOutcome.has_token === true) ||
      isNonEmptyString(rawOutcome.access_token);
    if (!hasValidToken) {
      return {
        passed: false,
        status,
        reason: 'MISSING_EVIDENCE: HOOK-02 expected explicit, non-empty token issuance (tokens.access_token) for token refresh'
      };
    }
    const hasAmrPreserved = rawOutcome.amr_preserved === true || rawOutcome.amr_authenticated === true;
    if (!hasAmrPreserved) {
      return {
        passed: false,
        status,
        reason: 'MISSING_EVIDENCE: HOOK-02 expected verified AMR preservation (amr_preserved: true)'
      };
    }
  }

  if (['HOOK-03', 'HOOK-04', 'HOOK-05', 'HOOK-06', 'HOOK-07'].includes(item.id)) {
    // Disallowed AMR / hook failure cases must reject token issuance (500/400/403)
    if (status === 200 || rawOutcome.has_token === true || rawOutcome.tokens) {
      return {
        passed: false,
        status,
        reason: `SECURITY_INVARIANT_VIOLATION: ${item.id} issued token or returned HTTP 200 on disallowed AMR / hook failure`
      };
    }
    if (!isValidHttpErrorStatus(status)) {
      return {
        passed: false,
        status,
        reason: `INVALID_HTTP_STATUS: ${item.id} expected HTTP 4xx/5xx error status, got ${status}`
      };
    }
    const hasAffirmativeEvidence =
      rawOutcome.hook_rejected === true ||
      rawOutcome.rejection_observed === true ||
      (isNonEmptyString(rawOutcome.error) && (rawOutcome.error.includes('42501') || rawOutcome.error.includes('hook_error') || rawOutcome.error.includes('aborted')));
    if (!hasAffirmativeEvidence) {
      return {
        passed: false,
        status,
        reason: `MISSING_EVIDENCE: ${item.id} requires affirmative observation of hook rejection (hook_rejected: true)`
      };
    }
  }

  // 3. Session & Consumer Requirements (SESSION-01..06)
  if (item.id === 'SESSION-01') {
    if (status !== 200) {
      return {
        passed: false,
        status,
        reason: `HTTP_STATUS_MISMATCH: SESSION-01 expected HTTP 200, got ${status}`
      };
    }
    const hasSessionEvidence =
      rawOutcome.session_created === true &&
      (isNonEmptyString(rawOutcome.session_id) || (typeof rawOutcome.sessions_count === 'number' && rawOutcome.sessions_count >= 1) || isNonEmptyObject(rawOutcome.session));
    if (!hasSessionEvidence) {
      return {
        passed: false,
        status,
        reason: 'SESSION_FAILURE: SESSION-01 expected verified session creation with explicit session row (session_id or sessions_count >= 1)'
      };
    }
  }

  if (item.id === 'SESSION-02') {
    if (status !== 200) {
      return {
        passed: false,
        status,
        reason: `HTTP_STATUS_MISMATCH: SESSION-02 expected HTTP 200, got ${status}`
      };
    }
    const hasRevocationEvidence =
      typeof rawOutcome.remaining_sessions === 'number' &&
      rawOutcome.remaining_sessions === 0 &&
      (rawOutcome.session_revoked === true || rawOutcome.sessions_invalidated === true);
    if (!hasRevocationEvidence) {
      return {
        passed: false,
        status,
        reason: `SESSION_FAILURE: SESSION-02 expected verified session revocation (remaining_sessions: 0 and session_revoked: true), got remaining: ${rawOutcome.remaining_sessions}`
      };
    }
  }

  if (item.id === 'SESSION-03') {
    // Revoked token at /auth/v1/user must be rejected (401/403/404) (PRRT_kwDOVtCmZc66jLk1)
    if (status === 200) {
      return {
        passed: false,
        status,
        reason: 'SECURITY_INVARIANT_VIOLATION: SESSION-03 accepted revoked token with HTTP 200'
      };
    }
    if (![401, 403, 404].includes(status)) {
      return {
        passed: false,
        status,
        reason: `HTTP_STATUS_MISMATCH: SESSION-03 expected HTTP 401, 403, or 404 on revoked token, got ${status}`
      };
    }
    const hasRejectionEvidence =
      rawOutcome.rejection_observed === true ||
      rawOutcome.revocation_verified === true ||
      (isNonEmptyString(rawOutcome.error_code) && (rawOutcome.error_code === 'session_not_found' || rawOutcome.error_code === 'bad_jwt')) ||
      (isNonEmptyString(rawOutcome.error) && rawOutcome.error.includes('session'));
    if (!hasRejectionEvidence) {
      return {
        passed: false,
        status,
        reason: 'MISSING_EVIDENCE: SESSION-03 requires affirmative observation of server revocation rejection (rejection_observed: true or error_code)'
      };
    }
  }

  if (item.id === 'SESSION-04' || item.id === 'SESSION-05') {
    // Stateless linger window documentation check (PRRT_kwDOVtCmZc66jNbH)
    const hasNonEmptyLingerEvidence =
      rawOutcome.stateless_linger_documented === true &&
      (isNonEmptyString(rawOutcome.evidence) || isNonEmptyString(rawOutcome.note) || isNonEmptyObject(rawOutcome.documentation));
    if (!hasNonEmptyLingerEvidence) {
      return {
        passed: false,
        status,
        reason: `MISSING_EVIDENCE: ${item.id} requires affirmative, non-empty stateless linger window documentation/evidence`
      };
    }
  }

  if (item.id === 'SESSION-06') {
    // Edge Function must reject revoked session (401/403/500) (PRRT_kwDOVtCmZc66jLk1)
    if (status === 200) {
      return {
        passed: false,
        status,
        reason: 'SECURITY_INVARIANT_VIOLATION: SESSION-06 accepted revoked session in Edge Function with HTTP 200'
      };
    }
    if (![401, 403, 500].includes(status)) {
      return {
        passed: false,
        status,
        reason: `HTTP_STATUS_MISMATCH: SESSION-06 expected HTTP 401, 403, or 500 rejection, got ${status}`
      };
    }
    const hasRejectionEvidence =
      rawOutcome.rejection_observed === true ||
      rawOutcome.revocation_verified === true ||
      (isNonEmptyString(rawOutcome.error_code) && rawOutcome.error_code === 'AuthSessionMissingError') ||
      (isNonEmptyString(rawOutcome.error) && rawOutcome.error.includes('AuthSessionMissingError'));
    if (!hasRejectionEvidence) {
      return {
        passed: false,
        status,
        reason: 'MISSING_EVIDENCE: SESSION-06 requires affirmative observation of Edge Function session rejection (rejection_observed: true or AuthSessionMissingError)'
      };
    }
  }

  return {
    passed: true,
    status,
    evidence: rawOutcome.evidence || rawOutcome.body || rawOutcome.note || null,
    reason: rawOutcome.reason || 'Requirement verified successfully'
  };
}

/**
 * Simulates or executes probe runner with rate-limiting, stop-on-failure, strict outcome validation,
 * and serialized JSON secret sanitization.
 * Resolves PRRT_kwDOVtCmZc66ij5y, PRRT_kwDOVtCmZc66ij56, PRRT_kwDOVtCmZc66iotG, PRRT_kwDOVtCmZc66i_Kb,
 * PRRT_kwDOVtCmZc66i_Kd, and PRRT_kwDOVtCmZc66i_Kf.
 */
export async function runHostedProbeRunner(options = {}) {
  const {
    projectRef,
    tempRef = HARDCODED_TEMP_REF,
    argv = process.argv,
    env = process.env,
    testEmail = 'tio-test-user-06i@proof.invalid',
    mockDispatcher = null,
    sleepFn = (ms) => new Promise(r => setTimeout(r, ms)),
    probeTimeoutMs = DEFAULT_PROBE_TIMEOUT_MS
  } = options;

  const mode = determineRunnerMode(argv, env);
  const isLive = mode === 'LIVE';
  const validatedRef = validateTargetProject(projectRef, tempRef, isLive, {
    allowIsolatedTestRef: options.allowIsolatedTestRef && !isLive
  });
  validateTestIdentity(testEmail);

  const plan = planProbeExecution(validatedRef, { testEmail, tempRef });
  const results = [];
  let aborted = false;
  let abortReason = null;
  let requestCount = 0;

  if (mode === 'DRY_RUN') {
    return sanitizeData({
      status: 'DRY_RUN_COMPLETED',
      mode: 'DRY_RUN',
      projectRef: validatedRef,
      zeroNetworkRequestsDispatched: true,
      message: 'Dry-run executed successfully. Zero HTTP requests sent to Supabase Cloud.',
      plan: plan
    });
  }

  // LIVE mode validation: Require an authorized network dispatcher. Zero fake passes. (PRRT_kwDOVtCmZc66ij5y)
  if (typeof mockDispatcher !== 'function') {
    throw new Error(
      'NO_HOSTED_DISPATCHER: live hosted execution requires a configured network dispatcher; synthetic placeholder execution prohibited'
    );
  }

  // LIVE probe loop with bounded timeout and abort signal (PRRT_kwDOVtCmZc66jOw5)
  for (let i = 0; i < plan.plannedCases.length; i++) {
    const item = plan.plannedCases[i];
    if (aborted) break;

    // Budget enforcement
    if (requestCount >= RATE_LIMIT_CONFIG.maxTotalRequests) {
      aborted = true;
      abortReason = `Rate limit budget exceeded (${RATE_LIMIT_CONFIG.maxTotalRequests} requests)`;
      break;
    }

    // Interval throttling enforcement (PRRT_kwDOVtCmZc66ij56)
    if (i > 0 && RATE_LIMIT_CONFIG.minIntervalMs > 0) {
      await sleepFn(RATE_LIMIT_CONFIG.minIntervalMs);
    }

    requestCount++;

    // Enforce bounded per-probe deadline with AbortController (PRRT_kwDOVtCmZc66jOw5)
    const controller = new AbortController();
    let timeoutTimer;

    const timeoutPromise = new Promise((_, reject) => {
      timeoutTimer = setTimeout(() => {
        controller.abort();
        const timeoutErr = new Error(`PROBE_TIMEOUT: probe ${item.id} exceeded deadline of ${probeTimeoutMs}ms`);
        timeoutErr.code = 'ETIMEDOUT';
        reject(timeoutErr);
      }, probeTimeoutMs);
    });

    let rawOutcome;
    try {
      const dispatchPromise = Promise.resolve(mockDispatcher(item, { signal: controller.signal, projectRef: validatedRef }));
      rawOutcome = await Promise.race([dispatchPromise, timeoutPromise]);
    } catch (err) {
      const isTimeout = err?.code === 'ETIMEDOUT' || (typeof err?.message === 'string' && err.message.includes('PROBE_TIMEOUT'));
      rawOutcome = {
        passed: false,
        status: 0,
        error: isTimeout ? `PROBE_TIMEOUT: probe ${item.id} timed out before settling (${probeTimeoutMs}ms)` : `DISPATCHER_EXCEPTION: ${err?.message || String(err)}`,
        reason: isTimeout ? `PROBE_TIMEOUT: probe ${item.id} exceeded deadline of ${probeTimeoutMs}ms` : `DISPATCHER_EXCEPTION: ${err?.message || String(err)}`
      };
    } finally {
      clearTimeout(timeoutTimer);
    }

    // Strict outcome validation against canonical requirement contract (PRRT_kwDOVtCmZc66i_Kd, PRRT_kwDOVtCmZc66jLk1, PRRT_kwDOVtCmZc66jNbH)
    const validatedOutcome = validateProbeOutcome(item, rawOutcome);

    // Stop and fail on ANY requirement failure across BYPASS, HOOK, or SESSION (PRRT_kwDOVtCmZc66iotG)
    if (validatedOutcome.passed !== true) {
      aborted = true;
      abortReason = `CRITICAL_SECURITY_FAILURE: Case ${item.id} (${item.category}) failed validation! Reason: ${validatedOutcome.reason}`;
    }

    results.push({
      id: item.id,
      category: item.category,
      target: item.target,
      outcome: validatedOutcome,
      timestamp: new Date().toISOString()
    });
  }

  // Status is COMPLETED only if zero cases failed and all planned cases executed
  const allCasesExecuted = results.length === plan.plannedCases.length;
  const allPassed = !aborted && allCasesExecuted && results.every(r => r.outcome && r.outcome.passed === true);

  return sanitizeData({
    status: allPassed ? 'COMPLETED' : 'HALTED_ON_FAILURE',
    mode: 'LIVE',
    projectRef: validatedRef,
    totalExecuted: results.length,
    totalExpected: plan.plannedCases.length,
    requestCount,
    aborted,
    abortReason: abortReason,
    results: results
  });
}
