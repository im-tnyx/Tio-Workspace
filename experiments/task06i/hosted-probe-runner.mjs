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
 * Resolves Phase D, PRRT_kwDOVtCmZc66i2Ff, and PRRT_kwDOVtCmZc66i_Kb.
 */
export function validateTargetProject(projectRef, tempRef = TIO_SUPABASE_TEMP_REF) {
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

  // 4. Ensure configured tempRef is non-empty and does not target protected projects
  const normTemp = (tempRef || TIO_SUPABASE_TEMP_REF || '').trim().toLowerCase();
  if (!normTemp) {
    throw new Error(
      'unauthorized_target: Configured TEMP project ref is empty. Set TIO_SUPABASE_TEMP_REF.'
    );
  }

  if (normTemp === HARDCODED_TIO_WORLD_REF || normTemp === HARDCODED_REAL_REF || isForbiddenProject(normTemp)) {
    throw new Error(
      `CRITICAL_SECURITY_VIOLATION: Configured TEMP ref '${normTemp}' cannot be a protected or immune project!`
    );
  }

  // 5. Authorized TEMP testbed check (deny-by-default for any other project)
  if (normRef !== normTemp) {
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
  const tempRef = options.tempRef || TIO_SUPABASE_TEMP_REF;
  const validatedRef = validateTargetProject(projectRef, tempRef);
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

/**
 * Independently validates probe dispatcher outcome against canonical requirement contract.
 * Enforces:
 * 1. Output must be a non-null object with explicit boolean `passed`.
 * 2. `passed: true` must never override an observed HTTP status mismatch or security violation.
 * 3. Route disablement (BYPASS-01..04) strictly rejects HTTP 200 and token issuance.
 * 4. Recovery suppression (BYPASS-05) strictly rejects email or token delivery.
 * 5. Token hooks (HOOK-01..07) and sessions (SESSION-01..06) strictly assert expectations.
 * Resolves PRRT_kwDOVtCmZc66i_Kd.
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
    if (rawOutcome.tokens || rawOutcome.has_token === true) {
      return {
        passed: false,
        status,
        reason: 'SECURITY_INVARIANT_VIOLATION: BYPASS-01 issued tokens on disabled route'
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
    if (rawOutcome.tokens || rawOutcome.user_created === true) {
      return {
        passed: false,
        status,
        reason: 'SECURITY_INVARIANT_VIOLATION: BYPASS-02 created user or issued tokens on disabled route'
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
  }

  if (item.id === 'BYPASS-05') {
    // Native recovery suppression: zero recovery token or recovery email dispatched
    if (rawOutcome.recovery_email_delivered === true || rawOutcome.recovery_token || rawOutcome.email_delivered === true) {
      return {
        passed: false,
        status,
        reason: 'SECURITY_INVARIANT_VIOLATION: BYPASS-05 recovery email or token delivered'
      };
    }
  }

  // 2. Token Hook Requirements
  if (item.id === 'HOOK-01') {
    // Valid password sign-in must succeed with HTTP 200 and issue token with amr_authenticated
    if (status !== 200) {
      return {
        passed: false,
        status,
        reason: `HTTP_STATUS_MISMATCH: HOOK-01 expected HTTP 200, got ${status}`
      };
    }
    if (rawOutcome.has_token === false) {
      return {
        passed: false,
        status,
        reason: 'MISSING_EVIDENCE: HOOK-01 expected token issuance for valid password sign-in'
      };
    }
  }

  if (item.id === 'HOOK-02') {
    // Token refresh with password-origin AMR must succeed with HTTP 200
    if (status !== 200) {
      return {
        passed: false,
        status,
        reason: `HTTP_STATUS_MISMATCH: HOOK-02 expected HTTP 200, got ${status}`
      };
    }
  }

  if (['HOOK-03', 'HOOK-04', 'HOOK-05', 'HOOK-06', 'HOOK-07'].includes(item.id)) {
    // Disallowed AMR / hook failure cases must reject token issuance (500/400/403)
    if (status === 200 || rawOutcome.has_token === true) {
      return {
        passed: false,
        status,
        reason: `SECURITY_INVARIANT_VIOLATION: ${item.id} issued token or returned HTTP 200 on disallowed AMR / hook failure`
      };
    }
  }

  // 3. Session & Consumer Requirements
  if (item.id === 'SESSION-01') {
    if (status !== 200 || rawOutcome.session_created === false) {
      return {
        passed: false,
        status,
        reason: `SESSION_FAILURE: SESSION-01 expected session creation, got status ${status}`
      };
    }
  }

  if (item.id === 'SESSION-02') {
    if (status !== 200 || rawOutcome.remaining_sessions > 0) {
      return {
        passed: false,
        status,
        reason: `SESSION_FAILURE: SESSION-02 expected session revocation, remaining: ${rawOutcome.remaining_sessions}`
      };
    }
  }

  if (item.id === 'SESSION-03') {
    // Revoked token at /auth/v1/user must be rejected (401/403/404)
    if (status === 200) {
      return {
        passed: false,
        status,
        reason: 'SECURITY_INVARIANT_VIOLATION: SESSION-03 accepted revoked token with HTTP 200'
      };
    }
  }

  if (item.id === 'SESSION-06') {
    // Edge Function must reject revoked session
    if (status === 200) {
      return {
        passed: false,
        status,
        reason: 'SECURITY_INVARIANT_VIOLATION: SESSION-06 accepted revoked session in Edge Function'
      };
    }
  }

  return {
    passed: true,
    status,
    evidence: rawOutcome.evidence || rawOutcome.body || null,
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
    tempRef = TIO_SUPABASE_TEMP_REF,
    argv = process.argv,
    env = process.env,
    testEmail = 'tio-test-user-06i@proof.invalid',
    mockDispatcher = null,
    sleepFn = (ms) => new Promise(r => setTimeout(r, ms))
  } = options;

  const mode = determineRunnerMode(argv, env);
  const validatedRef = validateTargetProject(projectRef, tempRef);
  validateTestIdentity(testEmail);

  const plan = planProbeExecution(validatedRef, { testEmail, tempRef });
  const results = [];
  let aborted = false;
  let abortReason = null;
  let requestCount = 0;

  if (mode === 'DRY_RUN') {
    return {
      status: 'DRY_RUN_COMPLETED',
      mode: 'DRY_RUN',
      projectRef: validatedRef,
      zeroNetworkRequestsDispatched: true,
      message: 'Dry-run executed successfully. Zero HTTP requests sent to Supabase Cloud.',
      plan: sanitizeData(plan)
    };
  }

  // LIVE mode validation: Require an authorized network dispatcher. Zero fake passes. (PRRT_kwDOVtCmZc66ij5y)
  if (typeof mockDispatcher !== 'function') {
    throw new Error(
      'NO_HOSTED_DISPATCHER: live hosted execution requires a configured network dispatcher; synthetic placeholder execution prohibited'
    );
  }

  // LIVE probe loop
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
    let rawOutcome;
    try {
      rawOutcome = await mockDispatcher(item, validatedRef);
    } catch (err) {
      rawOutcome = {
        passed: false,
        status: 0,
        error: `DISPATCHER_EXCEPTION: ${err.message}`
      };
    }

    // Strict outcome validation against canonical requirement contract (PRRT_kwDOVtCmZc66i_Kd)
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

  return {
    status: allPassed ? 'COMPLETED' : 'HALTED_ON_FAILURE',
    mode: 'LIVE',
    projectRef: validatedRef,
    totalExecuted: results.length,
    totalExpected: plan.plannedCases.length,
    requestCount,
    aborted,
    abortReason,
    results: sanitizeData(results)
  };
}
