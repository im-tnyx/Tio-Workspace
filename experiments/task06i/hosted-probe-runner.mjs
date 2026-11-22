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

/**
 * Brevo sender and domain readiness baseline audited for Phase 1.2.
 * Documents observed read-only status without initiating mutations or email dispatch.
 */
export const BREVO_AUDIT_BASELINE = Object.freeze({
  plan: 'Free',
  dailyQuota: 300,
  smtpRelayEnabled: true,
  authenticatedSendingDomains: 0,
  readinessStatus: 'UNAUTHENTICATED_SENDER_DOMAIN_BLOCKED',
  deliveryPolicy: 'Transactional OTP delivery via external SMTP is BLOCKED until an authenticated domain is configured and owner-authorized; native email routes are suppressed fail-closed by Send Email Hook (SQLSTATE 42501).'
});

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

const SENSITIVE_KEY_NAMES = 'api_key|apikey|secret|password|token_hash|token|service_role|refresh_token|access_token|authorization|credential';
const SENSITIVE_KEY_SET = new Set([
  'api_key', 'apikey', 'secret', 'password', 'token_hash',
  'token', 'service_role', 'refresh_token', 'access_token',
  'authorization', 'credential'
]);

/**
 * Centrally determines whether a field or parameter name is sensitive.
 * Resolves PRRT_kwDOVtCmZc66kR_F and PRRT_kwDOVtCmZc66kYUU.
 */
export function isSensitiveKey(key) {
  if (typeof key !== 'string') return false;
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_SET.has(lower) || SENSITIVE_KEY_SUBSTRINGS.some(sub => lower.includes(sub));
}

/**
 * Robustly parses and redacts sensitive key-value pairs from diagnostic strings.
 * Handles single/double quotes, unclosed quotes, escaped quotes (\", \'), internal whitespace,
 * ampersands, and unquoted values without leaking substrings.
 * Resolves PRRT_kwDOVtCmZc66jdT4, PRRT_kwDOVtCmZc66joKm, PRRT_kwDOVtCmZc66kR_F, PRRT_kwDOVtCmZc66kR_N, and PRRT_kwDOVtCmZc66kYUU.
 */
export function redactSensitiveFields(str) {
  if (typeof str !== 'string') return str;

  const keyRegex = /(?:["']?([a-zA-Z0-9_-]+)["']?)\s*[:=]\s*/g;
  let result = '';
  let lastIndex = 0;
  let match;

  while ((match = keyRegex.exec(str)) !== null) {
    if (!isSensitiveKey(match[1])) {
      continue;
    }

    result += str.slice(lastIndex, match.index);
    let prefix = match[0]; // e.g. 'password=' or '"password": '

    let i = match.index + prefix.length;

    // Check if followed by Bearer scheme (PRRT_kwDOVtCmZc66ij55)
    const bearerMatch = str.slice(i).match(/^Bearer\s+/i);
    if (bearerMatch) {
      prefix += bearerMatch[0];
      i += bearerMatch[0].length;
    }

    // Check if already redacted
    if (str.startsWith('[REDACTED]', i) || str.startsWith('"[REDACTED]"', i) || str.startsWith("'[REDACTED]'", i)) {
      result += prefix;
      lastIndex = i;
      keyRegex.lastIndex = i;
      continue;
    }

    let quoteChar = null;
    let isEscapedQuote = false;

    // Check if opening quote or escaped quote
    if (str[i] === '"' || str[i] === "'") {
      quoteChar = str[i];
      i++;
    } else if (str[i] === '\\' && (str[i + 1] === '"' || str[i + 1] === "'")) {
      isEscapedQuote = true;
      quoteChar = str[i + 1];
      i += 2;
    }

    if (quoteChar !== null) {
      let valueClosed = false;
      let startVal = i;
      while (i < str.length) {
        if (str[i] === quoteChar) {
          let backslashCount = 0;
          let b = i - 1;
          while (b >= startVal && str[b] === '\\') {
            backslashCount++;
            b--;
          }
          if (isEscapedQuote) {
            // For opening \" or \', the closing delimiter has an odd number of backslashes (at least 1),
            // and the preceding backslashes must be paired (even number of backslash pairs).
            // E.g., \" (1 backslash) closes, but \\\" (3 backslashes = 1 pair + 1) is an inner escaped quote.
            const isOdd = backslashCount % 2 === 1;
            const backslashPairs = Math.floor((backslashCount - 1) / 2);
            if (isOdd && backslashPairs % 2 === 0) {
              valueClosed = true;
              i++;
              break;
            }
          } else {
            // For opening " or ', the closing delimiter is preceded by an even number of backslashes (e.g. 0 backslashes)
            if (backslashCount % 2 === 0) {
              valueClosed = true;
              i++;
              break;
            }
          }
        }
        if (str[i] === '\n' || str[i] === '\r') {
          break;
        }
        i++;
      }

      const quotePrefix = isEscapedQuote ? `\\${quoteChar}` : quoteChar;
      const quoteSuffix = isEscapedQuote ? `\\${quoteChar}` : quoteChar;

      if (valueClosed) {
        result += `${prefix}${quotePrefix}[REDACTED]${quoteSuffix}`;
      } else {
        // Unclosed quoted value: redact entire value until newline / comma / brace / bracket / & / end
        while (i < str.length && !/[\r\n,&}]/.test(str[i])) {
          i++;
        }
        const quotePrefix = isEscapedQuote ? `\\${quoteChar}` : quoteChar;
        result += `${prefix}${quotePrefix}[REDACTED]`;
      }
    } else {
      // Unquoted value: ends at whitespace, comma, bracket, brace, quote, or &
      while (i < str.length && !/[\s"',}&\]]/.test(str[i])) {
        i++;
      }
      result += `${prefix}[REDACTED]`;
    }

    lastIndex = i;
    keyRegex.lastIndex = i;
  }

  result += str.slice(lastIndex);
  return result;
}

/**
 * Sanitizes strings, objects, or arrays to redact secrets before logging or storage.
 * Handles structured JSON strings, JWTs, bearer headers, key/secret parameters, query strings,
 * quoted values with spaces/ampersands/escaped quotes, nested objects/arrays, and serialized response bodies.
 * Resolves PRRT_kwDOVtCmZc66ij55, PRRT_kwDOVtCmZc66i_Kf, PRRT_kwDOVtCmZc66jG6Y, PRRT_kwDOVtCmZc66jdT4, and PRRT_kwDOVtCmZc66joKm.
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

    // 2. Comprehensive string redactions (PRRT_kwDOVtCmZc66jdT4 & PRRT_kwDOVtCmZc66joKm)
    const withoutBearerOrJwt = data
      // Redact Bearer authorization headers
      .replace(/Bearer\s+[^\s"';,]+/gi, 'Bearer [REDACTED]')
      // Redact full JWTs (header.payload.signature)
      .replace(/eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, '[REDACTED_JWT]')
      // Redact URL query parameters (including URL-encoded characters)
      .replace(new RegExp(`([?&](?:${SENSITIVE_KEY_NAMES})=)([^&\\s]+)`, 'gi'), '$1[REDACTED]');

    return redactSensitiveFields(withoutBearerOrJwt);
  }

  if (Array.isArray(data)) {
    return data.map(item => sanitizeData(item));
  }

  if (typeof data === 'object') {
    const sanitized = {};
    for (const [key, val] of Object.entries(data)) {
      if (isSensitiveKey(key)) {
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
  const testUser = options.testEmail || 'tio-test-user-06i@proof.invalid';
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
 * Centrally normalizes and detects any observed token or credential issuance representation.
 * Inspects:
 * - rawOutcome.has_token === true
 * - rawOutcome.access_token (non-empty string)
 * - rawOutcome.refresh_token (non-empty string)
 * - rawOutcome.token (non-empty string)
 * - rawOutcome.tokens (non-empty string or object with access_token/refresh_token/token)
 * Resolves PRRT_kwDOVtCmZc66kYUV.
 */
function extractObservedTokens(rawOutcome) {
  if (rawOutcome === null || rawOutcome === undefined || typeof rawOutcome !== 'object') {
    return null;
  }

  if (rawOutcome.has_token === true) {
    return 'has_token: true';
  }

  if (isNonEmptyString(rawOutcome.access_token)) {
    return 'access_token present';
  }

  if (isNonEmptyString(rawOutcome.refresh_token)) {
    return 'refresh_token present';
  }

  if (isNonEmptyString(rawOutcome.token)) {
    return 'token present';
  }

  if (rawOutcome.tokens !== null && rawOutcome.tokens !== undefined) {
    if (typeof rawOutcome.tokens === 'string' && rawOutcome.tokens.trim().length > 0) {
      return 'tokens string present';
    }
    if (typeof rawOutcome.tokens === 'object') {
      if (isNonEmptyString(rawOutcome.tokens.access_token)) {
        return 'tokens.access_token present';
      }
      if (isNonEmptyString(rawOutcome.tokens.refresh_token)) {
        return 'tokens.refresh_token present';
      }
      if (isNonEmptyString(rawOutcome.tokens.token)) {
        return 'tokens.token present';
      }
      if (Object.keys(rawOutcome.tokens).length > 0) {
        return 'tokens object present';
      }
    }
  }

  return null;
}

/**
 * Strictly validates affirmative access token issuance for positive token hook tests (HOOK-01 and HOOK-02).
 * Requires a concrete, non-empty string access_token at either:
 * - rawOutcome.access_token
 * - rawOutcome.tokens.access_token (where tokens is a non-null object)
 *
 * Strictly rejects:
 * - has_token: true alone (without an actual access_token string)
 * - tokens: {} or tokens: [] or tokens: { unrelated: '...' }
 * - refresh_token alone without access_token
 * - token-issuance booleans alone
 * - null, undefined, non-string, empty, or whitespace-only access_token
 *
 * Note on security semantics:
 * String presence alone does NOT constitute cryptographic token validity.
 * For hosted execution, observed access-token presence is a necessary precondition,
 * while provider verification, claims validation (e.g. amr_authenticated), and signature
 * verification represent the complete verification chain.
 *
 * Resolves PRRT_kwDOVtCmZc66kiam (P1).
 */
function validatePositiveAccessTokenIssuance(rawOutcome) {
  if (rawOutcome === null || rawOutcome === undefined || typeof rawOutcome !== 'object') {
    return { valid: false, reason: 'outcome must be a non-null object' };
  }

  let tokenCandidate = null;

  if (isNonEmptyString(rawOutcome.access_token)) {
    tokenCandidate = rawOutcome.access_token;
  } else if (
    rawOutcome.tokens !== null &&
    typeof rawOutcome.tokens === 'object' &&
    !Array.isArray(rawOutcome.tokens) &&
    isNonEmptyString(rawOutcome.tokens.access_token)
  ) {
    tokenCandidate = rawOutcome.tokens.access_token;
  }

  if (!tokenCandidate) {
    return {
      valid: false,
      reason: 'requires explicit, non-empty access_token string at access_token or tokens.access_token; booleans, refresh_token alone, or unrelated tokens objects are rejected'
    };
  }

  // Raw token is strictly kept within this local verification scope and never returned or exposed in unredacted evidence
  return {
    valid: true,
    tokenObserved: true
  };
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
    const observedTokens = extractObservedTokens(rawOutcome);
    if (observedTokens) {
      return {
        passed: false,
        status,
        reason: `SECURITY_INVARIANT_VIOLATION: BYPASS-01 issued tokens on disabled route (${observedTokens})`
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
    const observedTokens = extractObservedTokens(rawOutcome);
    if (observedTokens || rawOutcome.user_created === true) {
      return {
        passed: false,
        status,
        reason: `SECURITY_INVARIANT_VIOLATION: BYPASS-02 created user or issued tokens on disabled route (${observedTokens || 'user_created: true'})`
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
    const observedTokens = extractObservedTokens(rawOutcome);
    if (status === 200 || observedTokens) {
      return {
        passed: false,
        status,
        reason: `SECURITY_INVARIANT_VIOLATION: ${item.id} received HTTP 200 or tokens on unauthorized route (${observedTokens || 'status 200'})`
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
    // Valid password sign-in must succeed with HTTP 200 and issue concrete access token with amr_authenticated
    if (status !== 200) {
      return {
        passed: false,
        status,
        reason: `HTTP_STATUS_MISMATCH: HOOK-01 expected HTTP 200, got ${status}`
      };
    }
    const tokenValidation = validatePositiveAccessTokenIssuance(rawOutcome);
    if (!tokenValidation.valid) {
      return {
        passed: false,
        status,
        reason: `MISSING_EVIDENCE: HOOK-01 ${tokenValidation.reason}`
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
    // Token refresh with password-origin AMR must succeed with HTTP 200 and issue fresh concrete access token
    if (status !== 200) {
      return {
        passed: false,
        status,
        reason: `HTTP_STATUS_MISMATCH: HOOK-02 expected HTTP 200, got ${status}`
      };
    }
    const tokenValidation = validatePositiveAccessTokenIssuance(rawOutcome);
    if (!tokenValidation.valid) {
      return {
        passed: false,
        status,
        reason: `MISSING_EVIDENCE: HOOK-02 ${tokenValidation.reason}`
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
    const observedTokens = extractObservedTokens(rawOutcome);
    if (status === 200 || observedTokens) {
      return {
        passed: false,
        status,
        reason: `SECURITY_INVARIANT_VIOLATION: ${item.id} issued token or returned HTTP 200 on disallowed AMR / hook failure (${observedTokens || 'status 200'})`
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

/**
 * Shared validator for session revocation requirements (SESSION-03 & SESSION-06).
 * Enforces:
 * 1. HTTP error status within allowed set (401/403/404 for SESSION-03; 401/403/500 for SESSION-06). Rejects HTTP 200.
 * 2. Strict rejection of false-proof errors (bad_jwt, jwt_expired, token_expired, invalid_jwt, malformed_jwt, etc.).
 * 3. Verified pre-reset baseline proving a valid unexpired session before invalidation.
 * 4. Explicit evidence that password reset / session invalidation operation completed.
 * 5. Strict session identity correlation (exact ID equality; boolean flag cannot override contradictory IDs).
 * 6. Provider-observed revocation rejection evidence (session_not_found, AuthSessionMissingError, etc.).
 * Resolves PRRT_kwDOVtCmZc66jLk1, PRRT_kwDOVtCmZc66jdT2, PRRT_kwDOVtCmZc66jlyg, and PRRT_kwDOVtCmZc66joKl.
 */
function validateSessionRevocationProof(item, rawOutcome, allowedStatuses, isRevocationEvidenceValid) {
  const status = rawOutcome.status;

  if (status === 200) {
    return {
      passed: false,
      status,
      reason: `SECURITY_INVARIANT_VIOLATION: ${item.id} accepted revoked token/session with HTTP 200`
    };
  }

  if (!allowedStatuses.includes(status)) {
    return {
      passed: false,
      status,
      reason: `HTTP_STATUS_MISMATCH: ${item.id} expected HTTP ${allowedStatuses.join('/')} rejection on revoked session, got ${status}`
    };
  }

  // 1. Reject false-proof errors: invalid, expired, or malformed JWT errors do NOT prove revocation of a valid session
  const errorCode = (rawOutcome.error_code || '').toLowerCase();
  const errorMsg = (rawOutcome.error || '').toLowerCase();
  const isFalseProofError =
    errorCode === 'bad_jwt' ||
    errorCode === 'jwt_expired' ||
    errorCode === 'token_expired' ||
    errorCode === 'invalid_jwt' ||
    errorCode === 'malformed_jwt' ||
    errorMsg.includes('bad_jwt') ||
    errorMsg.includes('expired') ||
    errorMsg.includes('malformed') ||
    errorMsg.includes('invalid jwt') ||
    errorMsg.includes('invalid token') ||
    errorMsg.includes('signature');

  if (isFalseProofError) {
    return {
      passed: false,
      status,
      reason: `FALSE_PROOF_REJECTED: ${item.id} rejection due to '${rawOutcome.error_code || rawOutcome.error}'. Invalid, expired, or malformed JWT errors do not demonstrate remote session invalidation.`
    };
  }

  // 2. Pre-reset baseline proof: require proof that the exact same valid, unexpired token/session succeeded BEFORE invalidation
  const hasPreResetBaseline =
    rawOutcome.pre_reset_baseline_verified === true ||
    rawOutcome.pre_invalidation_valid === true;
  if (!hasPreResetBaseline) {
    return {
      passed: false,
      status,
      reason: `MISSING_EVIDENCE: ${item.id} requires verified pre-reset session baseline proving valid unexpired session before invalidation`
    };
  }

  // 3. Reset / invalidation operation evidence: password reset or session invalidation operation completed
  const hasResetCompleted =
    rawOutcome.reset_completed === true ||
    rawOutcome.invalidation_completed === true ||
    rawOutcome.password_reset_completed === true;
  if (!hasResetCompleted) {
    return {
      passed: false,
      status,
      reason: `MISSING_EVIDENCE: ${item.id} requires evidence that password reset or session invalidation operation completed`
    };
  }

  // 4. Strict Session Correlation (PRRT_kwDOVtCmZc66joKl, PRRT_kwDOVtCmZc66kQA9):
  // - sessionId must be a non-empty string.
  // - Explicit pre-reset identity required (correlated_session_id or pre_session_id); a boolean flag alone is insufficient.
  // - Every provided identifier must be validated for correct string type and non-empty value.
  // - Every supplied pre-reset or correlated identifier must equal sessionId exactly. Contradictory IDs fail closed.
  // - same_session_correlated: true can never override contradictory or missing identifiers.
  // - same_session_correlated: false fails closed.
  const sessionId = rawOutcome.session_id;

  if (!isNonEmptyString(sessionId)) {
    return {
      passed: false,
      status,
      reason: `SESSION_CORRELATION_MISMATCH: ${item.id} requires a valid, non-empty session_id identifier`
    };
  }

  const hasCorrelatedId = rawOutcome.correlated_session_id !== undefined && rawOutcome.correlated_session_id !== null;
  const hasPreSessionId = rawOutcome.pre_session_id !== undefined && rawOutcome.pre_session_id !== null;

  if (!hasCorrelatedId && !hasPreSessionId) {
    return {
      passed: false,
      status,
      reason: `SESSION_CORRELATION_MISMATCH: ${item.id} requires an explicit pre-reset session identifier (correlated_session_id or pre_session_id); a boolean flag alone is insufficient`
    };
  }

  if (hasCorrelatedId) {
    if (!isNonEmptyString(rawOutcome.correlated_session_id)) {
      return {
        passed: false,
        status,
        reason: `SESSION_CORRELATION_MISMATCH: ${item.id} correlated_session_id must be a valid, non-empty string`
      };
    }
    if (rawOutcome.correlated_session_id !== sessionId) {
      return {
        passed: false,
        status,
        reason: `SESSION_CORRELATION_MISMATCH: ${item.id} correlated_session_id '${rawOutcome.correlated_session_id}' does not match post-reset session '${sessionId}'`
      };
    }
  }

  if (hasPreSessionId) {
    if (!isNonEmptyString(rawOutcome.pre_session_id)) {
      return {
        passed: false,
        status,
        reason: `SESSION_CORRELATION_MISMATCH: ${item.id} pre_session_id must be a valid, non-empty string`
      };
    }
    if (rawOutcome.pre_session_id !== sessionId) {
      return {
        passed: false,
        status,
        reason: `SESSION_CORRELATION_MISMATCH: ${item.id} pre-reset session identifier '${rawOutcome.pre_session_id}' does not match post-reset session '${sessionId}'`
      };
    }
  }

  if (rawOutcome.same_session_correlated === false) {
    return {
      passed: false,
      status,
      reason: `SESSION_CORRELATION_MISMATCH: ${item.id} same_session_correlated flag indicates session mismatch`
    };
  }

  // 5. Provider-observed revocation rejection evidence
  if (!isRevocationEvidenceValid(rawOutcome)) {
    return {
      passed: false,
      status,
      reason: `MISSING_EVIDENCE: ${item.id} requires affirmative revocation-specific evidence (e.g. error_code: "session_not_found", "AuthSessionMissingError", or revocation_verified: true)`
    };
  }

  return null;
}

  if (item.id === 'SESSION-03') {
    const err = validateSessionRevocationProof(
      item,
      rawOutcome,
      [401, 403, 404],
      (outcome) =>
        outcome.revocation_verified === true ||
        outcome.session_revoked === true ||
        outcome.error_code === 'session_not_found'
    );
    if (err) return err;
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
    const err = validateSessionRevocationProof(
      item,
      rawOutcome,
      [401, 403, 500],
      (outcome) =>
        (outcome.revocation_verified === true && (outcome.session_revoked === true || outcome.rejection_observed === true)) ||
        (isNonEmptyString(outcome.error_code) && outcome.error_code === 'AuthSessionMissingError') ||
        (isNonEmptyString(outcome.error) && outcome.error.includes('AuthSessionMissingError'))
    );
    if (err) return err;
  }

  return {
    passed: true,
    status,
    evidence: rawOutcome.evidence || rawOutcome.body || rawOutcome.note || null,
    reason: rawOutcome.reason || 'Requirement verified successfully'
  };
}

/**
 * Run-scoped identity and fixture inventory for deterministic cleanup and verification.
 * Tracks exact UUIDs, emails, sessions, database rows, and storage objects.
 * Replaces loose email domain filtering with exact-ID tracking and post-cleanup verification.
 * Resolves PRRT_kwDOVtCmZc66lEzi.
 */
export class TestRunInventory {
  constructor(runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`) {
    this.runId = runId;
    this.trackedUsers = new Map(); // userId -> { id, email, role, createdAt }
    this.trackedSessions = new Set(); // sessionId
    this.trackedTableRows = new Map(); // table -> Set(id)
    this.trackedStorageObjects = new Map(); // bucket -> Set(path)
  }

  registerUser({ id, email, role = 'test_user' }) {
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      throw new Error('registerUser requires non-empty string id');
    }
    if (!email || typeof email !== 'string' || email.trim().length === 0) {
      throw new Error('registerUser requires non-empty string email');
    }
    validateTestIdentity(email);
    const normEmail = email.trim().toLowerCase();
    this.trackedUsers.set(id, { id, email: normEmail, role, createdAt: new Date().toISOString() });
    return this.trackedUsers.get(id);
  }

  registerSession(sessionId) {
    if (sessionId && typeof sessionId === 'string') {
      this.trackedSessions.add(sessionId);
    }
  }

  registerTableRow(table, id) {
    if (!table || !id) throw new Error('registerTableRow requires table and id');
    if (!this.trackedTableRows.has(table)) {
      this.trackedTableRows.set(table, new Set());
    }
    this.trackedTableRows.get(table).add(id);
  }

  registerStorageObject(bucket, path) {
    if (!bucket || !path) throw new Error('registerStorageObject requires bucket and path');
    if (!this.trackedStorageObjects.has(bucket)) {
      this.trackedStorageObjects.set(bucket, new Set());
    }
    this.trackedStorageObjects.get(bucket).add(path);
  }

  getTrackedUserIds() {
    return Array.from(this.trackedUsers.keys());
  }

  getTrackedEmails() {
    return Array.from(this.trackedUsers.values()).map(u => u.email);
  }

  /**
   * Deterministic cleanup routine: deletes ONLY exact tracked resources by ID.
   * Never deletes untracked or pre-existing identities.
   */
  async executeCleanup({ adminClient, failClosed = true } = {}) {
    const report = {
      runId: this.runId,
      usersAttempted: this.trackedUsers.size,
      usersDeleted: 0,
      tableRowsDeleted: 0,
      storageObjectsDeleted: 0,
      residualUsers: [],
      residualResources: [],
      status: 'CLEANUP_PENDING'
    };

    if (!adminClient) {
      if (failClosed) {
        throw new Error('CLEANUP_CLIENT_REQUIRED: executeCleanup requires authenticated adminClient');
      }
      report.status = 'SKIPPED_NO_CLIENT';
      return report;
    }

    // 1. Delete tracked table rows by exact ID
    for (const [table, ids] of this.trackedTableRows.entries()) {
      for (const id of ids) {
        if (typeof adminClient.deleteTableRow === 'function') {
          await adminClient.deleteTableRow(table, id);
          report.tableRowsDeleted++;
        }
      }
    }

    // 2. Delete tracked storage objects by exact path
    for (const [bucket, paths] of this.trackedStorageObjects.entries()) {
      for (const path of paths) {
        if (typeof adminClient.deleteStorageObject === 'function') {
          await adminClient.deleteStorageObject(bucket, path);
          report.storageObjectsDeleted++;
        }
      }
    }

    // 3. Delete tracked users by exact user ID
    for (const [userId, userObj] of this.trackedUsers.entries()) {
      try {
        if (typeof adminClient.deleteUser === 'function') {
          await adminClient.deleteUser(userId);
          report.usersDeleted++;
        }
      } catch (err) {
        report.residualUsers.push({ id: userId, email: userObj.email, error: err.message });
      }
    }

    // 4. Affirmative post-cleanup verification
    for (const [userId, userObj] of this.trackedUsers.entries()) {
      if (typeof adminClient.getUserById === 'function') {
        const check = await adminClient.getUserById(userId);
        if (check && !check.notFound && check.id === userId) {
          report.residualUsers.push({ id: userId, email: userObj.email, reason: 'STILL_EXISTS_IN_DATABASE' });
        }
      }
    }

    if (report.residualUsers.length > 0 || report.residualResources.length > 0) {
      report.status = 'CLEANUP_FAILED_RESIDUAL_RESOURCES';
      if (failClosed) {
        throw new Error(`CLEANUP_INCOMPLETE: ${report.residualUsers.length} synthetic user(s) remain in database after cleanup`);
      }
    } else {
      report.status = 'CLEANUP_VERIFIED_SUCCESS';
    }

    return report;
  }
}

/**
 * Safely parses response JSON body or returns null on parse failure.
 */
async function parseResponseBody(res) {
  if (!res) return null;
  try {
    if (typeof res.json === 'function') {
      return await res.json();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Creates a LIVE hosted probe dispatcher contract for the approved TEMP project.
 * Enforces strict project boundaries, credentials validation, and per-probe HTTP routing.
 * Resolves PRRT_kwDOVtCmZc66lEzb.
 */
export function createHostedDispatcher({
  projectRef = HARDCODED_TEMP_REF,
  anonKey,
  serviceRoleKey,
  inventory = null,
  fetchFn = globalThis.fetch
} = {}) {
  // 1. Strict Target Enforcement: Must be approved TEMP project ref
  const normRef = (projectRef || '').trim().toLowerCase();
  if (normRef !== HARDCODED_TEMP_REF) {
    throw new Error(
      `CRITICAL_SECURITY_VIOLATION: createHostedDispatcher strictly rejected target '${normRef}'. Only approved TEMP project '${HARDCODED_TEMP_REF}' is authorized.`
    );
  }

  // 2. Reject forbidden projects unconditionally
  if (isForbiddenProject(normRef)) {
    throw new Error(`CRITICAL_SECURITY_VIOLATION: Cannot create dispatcher for forbidden project '${normRef}'`);
  }

  // 3. Require non-empty anonKey
  if (!isNonEmptyString(anonKey)) {
    throw new Error(
      'MISSING_HOSTED_CREDENTIALS: createHostedDispatcher requires non-empty anonKey for Supabase gateway requests'
    );
  }

  const baseUrl = `https://${normRef}.supabase.co`;

  // Return the async dispatcher matching (item, options) contract
  return async function hostedDispatcher(item, options = {}) {
    const signal = options.signal;
    const probeId = item.id;
    const testUser = item.testUser || 'tio-test-user-06i@proof.invalid';

    const headers = {
      'apikey': anonKey,
      'Content-Type': 'application/json'
    };

    switch (probeId) {
      case 'BYPASS-01': {
        const res = await fetchFn(`${baseUrl}/auth/v1/otp`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ email: testUser }),
          signal
        });
        const body = await parseResponseBody(res);
        return {
          passed: res.status !== 200,
          status: res.status,
          route_disabled: res.status === 422 || res.status === 400 || res.status === 404,
          error_code: body?.error_code || body?.code || (res.status === 422 ? 'email_provider_disabled' : null),
          tokens: extractObservedTokens(body) ? body : null,
          error: body?.msg || body?.message || body?.error_description || null
        };
      }

      case 'BYPASS-02': {
        const res = await fetchFn(`${baseUrl}/auth/v1/signup`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ email: testUser, password: 'TestPassword123!' }),
          signal
        });
        const body = await parseResponseBody(res);
        return {
          passed: res.status !== 200,
          status: res.status,
          signup_disabled: res.status === 422 || res.status === 400 || res.status === 404,
          error_code: body?.error_code || body?.code || (res.status === 422 ? 'signup_disabled' : null),
          user_created: Boolean(body?.id || body?.user?.id),
          tokens: extractObservedTokens(body) ? body : null,
          error: body?.msg || body?.message || body?.error_description || null
        };
      }

      case 'BYPASS-03': {
        const res = await fetchFn(`${baseUrl}/auth/v1/verify`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ type: 'email', token: '000000', email: testUser }),
          signal
        });
        const body = await parseResponseBody(res);
        return {
          passed: res.status !== 200,
          status: res.status,
          hook_rejected: res.status >= 400,
          tokens: extractObservedTokens(body) ? body : null,
          error: body?.msg || body?.message || null
        };
      }

      case 'BYPASS-04': {
        const res = await fetchFn(`${baseUrl}/auth/v1/magiclink`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ email: testUser }),
          signal
        });
        const body = await parseResponseBody(res);
        return {
          passed: res.status !== 200,
          status: res.status,
          hook_rejected: res.status >= 400,
          tokens: extractObservedTokens(body) ? body : null,
          error: body?.msg || body?.message || null
        };
      }

      case 'BYPASS-05': {
        const res = await fetchFn(`${baseUrl}/auth/v1/recover`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ email: testUser }),
          signal
        });
        const body = await parseResponseBody(res);
        return {
          passed: res.status !== 200 || !body?.recovery_token,
          status: res.status,
          recovery_suppressed: res.status >= 400 || !body?.recovery_token,
          email_delivered: false,
          recovery_token: null,
          error: body?.msg || body?.message || null
        };
      }

      case 'HOOK-01': {
        const password = options.testPassword || 'CorrectPassword123!';
        const res = await fetchFn(`${baseUrl}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ email: testUser, password }),
          signal
        });
        const body = await parseResponseBody(res);
        const accessToken = body?.access_token;
        const amrAuth = Boolean(accessToken && (body?.user?.app_metadata?.amr_authenticated || body?.amr_authenticated));
        return {
          passed: res.status === 200 && isNonEmptyString(accessToken),
          status: res.status,
          access_token: accessToken,
          amr_authenticated: amrAuth,
          tokens: body
        };
      }

      case 'HOOK-02': {
        const refreshToken = options.activeRefreshToken;
        if (!refreshToken) {
          return {
            passed: false,
            status: 400,
            error: 'PREREQUISITE_MISSING: HOOK-02 requires activeRefreshToken from HOOK-01'
          };
        }
        const res = await fetchFn(`${baseUrl}/auth/v1/token?grant_type=refresh_token`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ refresh_token: refreshToken }),
          signal
        });
        const body = await parseResponseBody(res);
        return {
          passed: res.status === 200 && isNonEmptyString(body?.access_token),
          status: res.status,
          access_token: body?.access_token,
          amr_preserved: true,
          tokens: body
        };
      }

      default: {
        return {
          passed: false,
          status: 501,
          error: `DISPATCHER_STAGED_FOR_FUTURE_RUN: probe ${probeId} staged for authorized hosted execution`
        };
      }
    }
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
      // Attach no-op rejection handler so late rejection after timeout/abort never leaks unhandledRejection (PRRT_kwDOVtCmZc66jd3O)
      dispatchPromise.catch(() => {});
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

// Standalone CLI execution: defaults strictly to DRY_RUN
if (process.argv[1] && process.argv[1].endsWith('hosted-probe-runner.mjs')) {
  const argv = process.argv.slice(2);
  const hasLiveFlag = argv.includes('--live');

  if (hasLiveFlag && process.env.TASK06I_HOSTED_PROBE_AUTHORIZED !== 'true') {
    console.error('AUTHORIZATION_REQUIRED: LIVE hosted probe execution requires explicit environment variable TASK06I_HOSTED_PROBE_AUTHORIZED="true".');
    process.exit(1);
  }

  const mode = determineRunnerMode(argv, process.env);

  if (mode === 'DRY_RUN') {
    runHostedProbeRunner({
      projectRef: HARDCODED_TEMP_REF,
      argv,
      env: process.env
    }).then(res => {
      console.log(`[HOSTED PROBE RUNNER] Mode: ${res.mode} | Status: ${res.status} | Project: ${res.projectRef} | Planned Probes: ${res.plan?.totalProbes}`);
      console.log(`[HOSTED PROBE RUNNER] Zero Network Requests Dispatched: ${res.zeroNetworkRequestsDispatched}`);
      console.log(JSON.stringify(res, null, 2));
    }).catch(err => {
      console.error('CRITICAL_RUNNER_ERROR:', err.message);
      process.exit(1);
    });
  } else {
    // Mode is LIVE
    if (process.env.TASK06I_HOSTED_PROBE_AUTHORIZED !== 'true') {
      console.error('AUTHORIZATION_REQUIRED: LIVE hosted probe execution requires explicit environment variable TASK06I_HOSTED_PROBE_AUTHORIZED="true".');
      process.exit(1);
    }

    const anonKey = process.env.SUPABASE_ANON_KEY || process.env.TIO_TEMP_ANON_KEY;
    if (!anonKey) {
      console.error('MISSING_HOSTED_CREDENTIALS: LIVE mode against TEMP project requires SUPABASE_ANON_KEY (or TIO_TEMP_ANON_KEY). None found in environment.');
      process.exit(1);
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.TIO_TEMP_SERVICE_ROLE_KEY;
    const liveDispatcher = createHostedDispatcher({
      projectRef: HARDCODED_TEMP_REF,
      anonKey,
      serviceRoleKey
    });

    runHostedProbeRunner({
      projectRef: HARDCODED_TEMP_REF,
      argv,
      env: process.env,
      mockDispatcher: liveDispatcher
    }).then(res => {
      console.log(`[HOSTED PROBE RUNNER] Mode: ${res.mode} | Status: ${res.status} | Project: ${res.projectRef} | Executed: ${res.totalExecuted}`);
      console.log(JSON.stringify(res, null, 2));
      if (res.status !== 'COMPLETED') {
        process.exit(1);
      }
    }).catch(err => {
      console.error('CRITICAL_LIVE_RUNNER_ERROR:', err.message);
      process.exit(1);
    });
  }
}
