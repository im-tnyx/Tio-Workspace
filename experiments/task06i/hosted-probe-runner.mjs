// Hosted Probe Runner Specification & Harness for Task 06I-B1-H0-R1
// Prepares the opt-in, fail-closed hosted test runner for future authorized testing.
// Enforces strict safety gates:
// 1. Immutable forbidden list: Tio-world (oykupyiitspujzpwwvuj) and REAL project (bsfwzvgynwriswapxpsp) are permanently blocked.
// 2. Explicit target allowlist: only verified TEMP project allowed (via TIO_SUPABASE_TEMP_REF).
// 3. Separate authorization gate: requires both --live flag and TASK06I_HOSTED_PROBE_AUTHORIZED="true".
// 4. Default mode: DRY_RUN (zero network requests, zero Supabase mutations).
// 5. Secret redaction: zero tokens, keys, passwords, query parameters, or bearer credentials logged.
// 6. Test-only identities: restricted to reserved *.invalid / *.test domains.
// 7. Rate limiter: budget max 25 requests, 1000ms minimum interval throttling enforced via injectable scheduler.
// 8. Immediate STOP on ANY security failure (BYPASS, HOOK, or SESSION).
// 9. Zero fake LIVE success: missing dispatcher in LIVE mode immediately fails closed.
// 10. Zero automated project deletion and zero fallback to Tio-world.

import { PREFLIGHT_REQUIREMENTS } from './preflight-evaluator.mjs';

export const HARDCODED_REAL_REF = 'bsfwzvgynwriswapxpsp';
export const HARDCODED_TIO_WORLD_REF = 'oykupyiitspujzpwwvuj';

export const TIO_SUPABASE_REAL_REF = HARDCODED_REAL_REF;
export const TIO_SUPABASE_TEMP_REF = process.env.TIO_SUPABASE_TEMP_REF || '';

export const IMMUTABLE_FORBIDDEN_PROJECTS = Object.freeze(new Set([
  HARDCODED_TIO_WORLD_REF, // Tio-world: PERMANENT IMMUNITY
  HARDCODED_REAL_REF       // REAL Tio-Tnyx: protected production backend, permanently forbidden from test runs
]));

export const RESERVED_TEST_DOMAINS = ['.invalid', '.example', '.test', '.localhost'];

export const RATE_LIMIT_CONFIG = {
  maxTotalRequests: 25,
  minIntervalMs: 1000
};

/**
 * Sanitizes strings, objects, or arrays to redact secrets before logging or storage.
 * Handles JWTs, bearer headers, key/secret parameters, query strings, and nested data.
 * Resolves PRRT_kwDOVtCmZc66ij55.
 */
export function sanitizeData(data) {
  if (data === null || data === undefined) return data;

  if (typeof data === 'string') {
    return data
      // Redact Bearer authorization headers first
      .replace(/Bearer\s+[^\s"';,]+/gi, 'Bearer [REDACTED]')
      // Redact full JWTs (header.payload.signature)
      .replace(/eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, '[REDACTED_JWT]')
      // Redact URL query parameters (e.g. ?token=..., &password=...)
      .replace(/([?&](?:token|token_hash|secret|password|api_key|apikey|service_role)=)([^&\s]+)/gi, '$1[REDACTED]')
      // Redact key=value pairs in text
      .replace(/((?:api_key|apikey|secret|password|token_hash|token|service_role)\s*[:=]\s*['"]?)[^'"\s&,]+/gi, '$1[REDACTED]');
  }

  if (Array.isArray(data)) {
    return data.map(item => sanitizeData(item));
  }

  if (typeof data === 'object') {
    const sanitized = {};
    for (const [key, val] of Object.entries(data)) {
      const lower = key.toLowerCase();
      if (
        lower.includes('secret') ||
        lower.includes('password') ||
        lower.includes('token') ||
        lower.includes('key') ||
        lower.includes('authorization') ||
        lower.includes('bearer') ||
        lower.includes('credential')
      ) {
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
 * Resolves Phase D and PRRT_kwDOVtCmZc66i2Ff.
 */
export function validateTargetProject(projectRef, tempRef = TIO_SUPABASE_TEMP_REF) {
  if (!projectRef || typeof projectRef !== 'string' || !projectRef.trim()) {
    throw new Error('invalid_project_ref: target projectRef is required and cannot be empty');
  }

  const normRef = projectRef.trim().toLowerCase();

  // 1. Permanent immutable forbidden projects check (consults IMMUTABLE_FORBIDDEN_PROJECTS)
  if (IMMUTABLE_FORBIDDEN_PROJECTS.has(normRef)) {
    if (normRef === HARDCODED_TIO_WORLD_REF) {
      throw new Error(
        `CRITICAL_SECURITY_VIOLATION: Project '${normRef}' (Tio-world) is permanently forbidden and immune from testing!`
      );
    }
    throw new Error(
      `CRITICAL_SECURITY_VIOLATION: Project '${normRef}' is the protected REAL backend and is permanently forbidden from test targeting!`
    );
  }

  // 2. Extra guard: ensure env var cannot re-introduce any other forbidden ref
  const envRealRef = (process.env.TIO_SUPABASE_REAL_REF || '').trim().toLowerCase();
  if (envRealRef && normRef === envRealRef) {
    throw new Error(
      `CRITICAL_SECURITY_VIOLATION: Project '${normRef}' matches TIO_SUPABASE_REAL_REF and is permanently forbidden from test targeting!`
    );
  }

  // 3. Prevent configured tempRef from spoofing immutable forbidden projects
  const normTemp = (tempRef || TIO_SUPABASE_TEMP_REF || '').trim().toLowerCase();
  if (IMMUTABLE_FORBIDDEN_PROJECTS.has(normTemp)) {
    throw new Error(
      `CRITICAL_SECURITY_VIOLATION: Configured TEMP ref '${normTemp}' cannot be a protected or immune project!`
    );
  }

  // 4. Authorized TEMP testbed check
  if (!normTemp || normRef !== normTemp) {
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
 * Simulates or executes probe runner with rate-limiting, stop-on-failure, and secret sanitization.
 * Resolves PRRT_kwDOVtCmZc66ij5y, PRRT_kwDOVtCmZc66ij56, and PRRT_kwDOVtCmZc66iotG.
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
    const probeResult = await mockDispatcher(item, validatedRef);

    // Stop and fail on ANY requirement failure across BYPASS, HOOK, or SESSION (PRRT_kwDOVtCmZc66iotG)
    if (probeResult.passed === false) {
      aborted = true;
      abortReason = `CRITICAL_SECURITY_FAILURE: Case ${item.id} (${item.category}) failed check! Halting execution immediately.`;
    }

    results.push({
      id: item.id,
      category: item.category,
      target: item.target,
      outcome: probeResult,
      timestamp: new Date().toISOString()
    });
  }

  return {
    status: aborted ? 'HALTED_ON_FAILURE' : 'COMPLETED',
    mode: 'LIVE',
    projectRef: validatedRef,
    totalExecuted: results.length,
    requestCount,
    aborted,
    abortReason,
    results: sanitizeData(results)
  };
}
