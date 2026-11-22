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
    tokenObserved: true,
    token: tokenCandidate
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
    // Reject upstream GoTrue pre-validation errors before reaching custom_access_token_hook (R3-06)
    const errCode = (rawOutcome.error_code || '').toLowerCase();
    const errMsg = (rawOutcome.error || '').toLowerCase();
    if (errCode === 'otp_expired' || errMsg.includes('otp_expired') || status === 404) {
      return {
        passed: false,
        status,
        reason: `FALSE_PROOF_REJECTED: ${item.id} rejected due to upstream GoTrue pre-validation ('${rawOutcome.error_code || rawOutcome.error || status}') before reaching custom_access_token_hook (R3-06)`
      };
    }
    // Reject email-hook suppression as proof of access-token-hook rejection (R4-08)
    if (item.id === 'BYPASS-04') {
      const isEmailSuppression =
        rawOutcome.email_suppressed === true ||
        errMsg.includes('send_email_hook') ||
        errMsg.includes('email dispatch suppressed') ||
        errMsg.includes('email delivery');
      if (isEmailSuppression) {
        return {
          passed: false,
          status,
          reason: 'FALSE_PROOF_REJECTED: BYPASS-04 email hook suppression cannot be accepted as proof of Custom Access Token Hook rejection (R4-08)'
        };
      }
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
    // Reject client-editable metadata spoofing (PRRT_kwDOVtCmZc66lOOM)
    if (rawOutcome.amr_source === 'user_metadata' || rawOutcome.amr_source === 'app_metadata') {
      return {
        passed: false,
        status,
        reason: 'SECURITY_INVARIANT_VIOLATION: HOOK-01 amr_authenticated cannot be sourced from client-editable user_metadata or app_metadata'
      };
    }
    // Strict JWT claims parsing and validation without bypass (PRRT_kwDOVtCmZc66lo-t, R3-08)
    const jwtCheck = parseAndValidateJwt(tokenValidation.token);
    if (!jwtCheck.valid) {
      return {
        passed: false,
        status,
        reason: `JWT_CLAIM_VIOLATION: HOOK-01 ${jwtCheck.reason}`
      };
    }
    // Require genuine session_id (placeholder strings like 'sess-default' or user_id are strictly prohibited, R3-05)
    const candidateSessionId = rawOutcome.session_id || jwtCheck.payload?.session_id;
    if (!isNonEmptyString(candidateSessionId) || candidateSessionId.startsWith('sess-default')) {
      return {
        passed: false,
        status,
        reason: 'MISSING_EVIDENCE: HOOK-01 requires genuine session_id identifier in token or outcome (R3-05)'
      };
    }
    const hasAmrEvidence =
      rawOutcome.amr_authenticated === true ||
      jwtCheck.payload?.amr_authenticated === 'true' ||
      jwtCheck.payload?.amr_authenticated === true ||
      (Array.isArray(jwtCheck.payload?.amr) && jwtCheck.payload.amr.some(a => (typeof a === 'string' ? a : a?.method) === 'password'));
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
    // Strict JWT claims parsing and validation without bypass (PRRT_kwDOVtCmZc66lo-t, R3-08)
    const jwtCheck = parseAndValidateJwt(tokenValidation.token);
    if (!jwtCheck.valid) {
      return {
        passed: false,
        status,
        reason: `JWT_CLAIM_VIOLATION: HOOK-02 ${jwtCheck.reason}`
      };
    }
    const hasAmrPreserved =
      rawOutcome.amr_preserved === true ||
      jwtCheck.payload?.amr_authenticated === 'true' ||
      jwtCheck.payload?.amr_authenticated === true;
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
    // Reject generic GoTrue errors that do not prove hook execution (R3-01, R3-02)
    const errCode = (rawOutcome.error_code || '').toLowerCase();
    const errMsg = (rawOutcome.error || '').toLowerCase();
    if (errCode === 'unsupported_grant_type' || errMsg.includes('unsupported_grant_type')) {
      return {
        passed: false,
        status,
        reason: `FALSE_PROOF_REJECTED: ${item.id} rejected due to 'unsupported_grant_type'. GoTrue token endpoint rejected request before custom_access_token_hook execution (R3-01)`
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
    const sessionId = rawOutcome.session_id;
    if (!isNonEmptyString(sessionId) || sessionId.startsWith('sess-default')) {
      return {
        passed: false,
        status,
        reason: 'SESSION_FAILURE: SESSION-01 requires verified session creation with genuine session_id (placeholder rejected, R3-05)'
      };
    }
    const hasSessionEvidence =
      rawOutcome.session_created === true &&
      (typeof rawOutcome.sessions_count === 'number' ? rawOutcome.sessions_count >= 1 : true);
    if (!hasSessionEvidence) {
      return {
        passed: false,
        status,
        reason: 'SESSION_FAILURE: SESSION-01 expected verified session creation with explicit session row'
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
    // Reject logout fallback (R3-04)
    if (rawOutcome.logout_fallback === true) {
      return {
        passed: false,
        status,
        reason: 'SECURITY_INVARIANT_VIOLATION: SESSION-02 used logout fallback instead of admin password reset (R3-04)'
      };
    }
    const hasResetEvidence = rawOutcome.password_reset_completed === true || rawOutcome.reset_completed === true;
    if (!hasResetEvidence) {
      return {
        passed: false,
        status,
        reason: 'SESSION_FAILURE: SESSION-02 requires explicit password reset completion (R3-04)'
      };
    }
    // Strict session revocation verification: require affirmative provider evidence (R4-03)
    const hasRevocationEvidence =
      rawOutcome.remaining_sessions === 0 &&
      (rawOutcome.session_revoked === true || rawOutcome.sessions_invalidated === true) &&
      (rawOutcome.session_revocation_verified === true || rawOutcome.invalidation_completed === true);
    if (!hasRevocationEvidence) {
      return {
        passed: false,
        status,
        reason: `SESSION_FAILURE: SESSION-02 requires affirmative proof of session revocation after password update (got remaining_sessions: ${rawOutcome.remaining_sessions}, session_revoked: ${rawOutcome.session_revoked}). Surviving sessions fail closed (R4-03).`
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

  if (!isNonEmptyString(sessionId) || sessionId.startsWith('sess-default')) {
    return {
      passed: false,
      status,
      reason: `SESSION_CORRELATION_MISMATCH: ${item.id} requires a valid, non-empty session_id identifier (placeholder rejected, R3-05)`
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
    // Stateless linger window documentation check (PRRT_kwDOVtCmZc66jNbH, R3-03)
    if (status !== 200) {
      return {
        passed: false,
        status,
        reason: `HTTP_STATUS_MISMATCH: ${item.id} expected HTTP 200 demonstrating stateless signature-based access, got ${status} (401 rejection or 404 missing fixture does not prove linger, R3-03)`
      };
    }
    if (rawOutcome.token_unexpired !== true) {
      return {
        passed: false,
        status,
        reason: `MISSING_EVIDENCE: ${item.id} requires token to be unexpired (now < exp) during linger window demonstration (R3-03)`
      };
    }
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
      (outcome) => {
        const errCode = outcome.error_code || '';
        const errMsg = (outcome.error || '').toLowerCase();
        // Provider-observed revocation error (R4-04): Accept AuthSessionMissingError
        return (
          errCode === 'AuthSessionMissingError' ||
          errMsg.includes('authsessionmissingerror') ||
          (outcome.revocation_verified === true && (outcome.session_revoked === true || outcome.rejection_observed === true) && errCode !== 'session_not_found')
        );
      }
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
 * Distinguishes createdThisRun resources (eligible for deletion) from pre-existing fixture references (NEVER deleted).
 * Tracks exact UUIDs, emails, sessions, database rows, and storage objects.
 * Handles Supabase Admin { data, error } responses and verifies post-cleanup absence of residual resources.
 * Resolves PRRT_kwDOVtCmZc66lEzi, PRRT_kwDOVtCmZc66lOOS, PRRT_kwDOVtCmZc66lOOU, and PRRT_kwDOVtCmZc66lq3S.
 */
export class TestRunInventory {
  constructor(runId = null) {
    this.runId = runId || `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.createdUsers = new Map(); // Users affirmatively created in THIS run -> deletion eligible
    this.referencedUsers = new Map(); // Pre-existing / seeded users authenticated -> NEVER deleted (R3-09)
    this.trackedSessions = new Set(); // Session IDs
    this.trackedTableRows = new Map(); // table -> Set(id)
    this.trackedStorageObjects = new Map(); // bucket -> Set(path)
  }

  // Backward-compatible getter: returns combined map of tracked users
  get trackedUsers() {
    return new Map([...this.referencedUsers, ...this.createdUsers]);
  }

  /**
   * Registers a user created during this run (e.g. accidental signup from BYPASS-02).
   * Deletion eligible upon cleanup.
   */
  registerCreatedUser({ id, email, source = 'test_signup' } = {}) {
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      throw new Error('registerCreatedUser requires non-empty string id');
    }
    if (!email || typeof email !== 'string' || email.trim().length === 0) {
      throw new Error('registerCreatedUser requires non-empty string email');
    }
    validateTestIdentity(email);
    const normEmail = email.trim().toLowerCase();
    const record = { id: id.trim(), email: normEmail, source, createdAt: new Date().toISOString() };
    this.createdUsers.set(record.id, record);
    return record;
  }

  /**
   * Registers a pre-existing fixture or seed user referenced during login (e.g. HOOK-01).
   * Tracked for audit and correlation, but NEVER deleted during cleanup (R3-09).
   */
  registerReferencedUser({ id, email, source = 'test_login' } = {}) {
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      throw new Error('registerReferencedUser requires non-empty string id');
    }
    if (!email || typeof email !== 'string' || email.trim().length === 0) {
      throw new Error('registerReferencedUser requires non-empty string email');
    }
    validateTestIdentity(email);
    const normEmail = email.trim().toLowerCase();
    const record = { id: id.trim(), email: normEmail, source, referencedAt: new Date().toISOString() };
    this.referencedUsers.set(record.id, record);
    return record;
  }

  // Backward-compatible alias: registerUser defaults to registerCreatedUser
  registerUser(userObj) {
    return this.registerCreatedUser(userObj);
  }

  registerSession(sessionId) {
    if (sessionId && typeof sessionId === 'string' && sessionId.trim().length > 0) {
      this.trackedSessions.add(sessionId.trim());
    }
  }

  registerTableRow(table, id) {
    if (!table || !id || typeof table !== 'string' || typeof id !== 'string') {
      throw new Error('registerTableRow requires table and id');
    }
    const t = table.trim();
    const rowId = id.trim();
    if (!this.trackedTableRows.has(t)) {
      this.trackedTableRows.set(t, new Set());
    }
    this.trackedTableRows.get(t).add(rowId);
  }

  registerStorageObject(bucket, path) {
    if (!bucket || !path || typeof bucket !== 'string' || typeof path !== 'string') {
      throw new Error('registerStorageObject requires bucket and path');
    }
    const b = bucket.trim();
    const p = path.trim();
    if (!this.trackedStorageObjects.has(b)) {
      this.trackedStorageObjects.set(b, new Set());
    }
    this.trackedStorageObjects.get(b).add(p);
  }

  isUserTracked(userId) {
    const id = (userId || '').trim();
    return this.createdUsers.has(id) || this.referencedUsers.has(id);
  }

  isUserCreated(userId) {
    return this.createdUsers.has((userId || '').trim());
  }

  isUserReferenced(userId) {
    return this.referencedUsers.has((userId || '').trim());
  }

  getTrackedUserIds() {
    return Array.from(new Set([...this.createdUsers.keys(), ...this.referencedUsers.keys()]));
  }

  getCreatedUserIds() {
    return Array.from(this.createdUsers.keys());
  }

  getReferencedUserIds() {
    return Array.from(this.referencedUsers.keys());
  }

  getTrackedEmails() {
    const emails = [
      ...Array.from(this.createdUsers.values()).map(u => u.email),
      ...Array.from(this.referencedUsers.values()).map(u => u.email)
    ];
    return Array.from(new Set(emails));
  }

  getSummary() {
    return {
      runId: this.runId,
      createdUsersCount: this.createdUsers.size,
      referencedUsersCount: this.referencedUsers.size,
      trackedUsersCount: this.createdUsers.size + this.referencedUsers.size,
      trackedSessionsCount: this.trackedSessions.size,
      trackedTableRowsCount: Array.from(this.trackedTableRows.values()).reduce((acc, s) => acc + s.size, 0),
      trackedStorageObjectsCount: Array.from(this.trackedStorageObjects.values()).reduce((acc, s) => acc + s.size, 0)
    };
  }

  /**
   * Deterministic cleanup routine: deletes ONLY createdThisRun resources by ID.
   * Pre-existing referencedUsers are NEVER deleted (R3-09).
   * Handles Supabase Admin { data, error } responses.
   * Verifies absence of residual resources and fails closed if residual resources remain.
   * Resolves PRRT_kwDOVtCmZc66lOOU, PRRT_kwDOVtCmZc66lo-q, and PRRT_kwDOVtCmZc66lq3S.
   */
  async executeCleanup({ adminClient, failClosed = true } = {}) {
    const report = {
      runId: this.runId,
      createdUsersAttempted: this.createdUsers.size,
      usersDeleted: 0,
      referencedUsersPreserved: this.referencedUsers.size,
      preservedUsers: Array.from(this.referencedUsers.keys()),
      tableRowsDeleted: 0,
      storageObjectsDeleted: 0,
      sessionsRevoked: 0,
      residualUsers: [],
      residualResources: [],
      status: 'CLEANUP_PENDING'
    };

    const hasCleanupEligibleItems =
      this.createdUsers.size > 0 ||
      this.trackedTableRows.size > 0 ||
      this.trackedStorageObjects.size > 0 ||
      this.trackedSessions.size > 0;

    if (!hasCleanupEligibleItems) {
      report.status = 'CLEANUP_VERIFIED_SUCCESS';
      return report;
    }

    if (!adminClient) {
      report.residualResources.push({ type: 'client', error: 'MISSING_ADMIN_CLIENT' });
      report.status = 'CLEANUP_FAILED_RESIDUAL_RESOURCES';
      if (failClosed) {
        throw new Error('CLEANUP_CLIENT_REQUIRED: executeCleanup requires authenticated adminClient when resources are tracked');
      }
      return report;
    }

    // 1. Delete tracked table rows by exact ID
    for (const [table, ids] of this.trackedTableRows.entries()) {
      if (ids.size > 0 && typeof adminClient.deleteTableRow !== 'function') {
        report.residualResources.push({ type: 'table_rows', table, count: ids.size, error: 'MISSING_DELETE_TABLE_ROW_METHOD' });
      } else {
        for (const id of ids) {
          try {
            const res = await adminClient.deleteTableRow(table, id);
            if (res && res.error) {
              report.residualResources.push({ type: 'table_row', table, id, error: res.error.message || String(res.error) });
            } else {
              report.tableRowsDeleted++;
            }
          } catch (err) {
            report.residualResources.push({ type: 'table_row', table, id, error: err.message });
          }
        }
      }
    }

    // 2. Delete tracked storage objects by exact path
    for (const [bucket, paths] of this.trackedStorageObjects.entries()) {
      if (paths.size > 0 && typeof adminClient.deleteStorageObject !== 'function') {
        report.residualResources.push({ type: 'storage_objects', bucket, count: paths.size, error: 'MISSING_DELETE_STORAGE_OBJECT_METHOD' });
      } else {
        for (const path of paths) {
          try {
            const res = await adminClient.deleteStorageObject(bucket, path);
            if (res && res.error) {
              report.residualResources.push({ type: 'storage_object', bucket, path, error: res.error.message || String(res.error) });
            } else {
              report.storageObjectsDeleted++;
            }
          } catch (err) {
            report.residualResources.push({ type: 'storage_object', bucket, path, error: err.message });
          }
        }
      }
    }

    // 3. Invalidate tracked sessions if client provides session invalidation (R4-05)
    if (this.trackedSessions.size > 0 && typeof adminClient.invalidateSession !== 'function' && typeof adminClient.signOut !== 'function') {
      report.residualResources.push({
        type: 'sessions',
        count: this.trackedSessions.size,
        error: 'MISSING_SESSION_INVALIDATION_METHOD: adminClient lacks invalidateSession or signOut method'
      });
    } else {
      for (const sessionId of this.trackedSessions) {
        try {
          let res;
          if (typeof adminClient.invalidateSession === 'function') {
            res = await adminClient.invalidateSession(sessionId);
          } else if (typeof adminClient.signOut === 'function') {
            res = await adminClient.signOut(sessionId);
          }
          if (res && res.error) {
            report.residualResources.push({ type: 'session', id: sessionId, error: res.error.message || String(res.error) });
          } else {
            report.sessionsRevoked++;
          }
        } catch (err) {
          report.residualResources.push({ type: 'session', id: sessionId, error: err.message });
        }
      }
    }

    // 4. Delete ONLY created users by exact user ID (referencedUsers are preserved!)
    if (this.createdUsers.size > 0 && typeof adminClient.deleteUser !== 'function') {
      report.residualResources.push({ type: 'users', count: this.createdUsers.size, error: 'MISSING_DELETE_USER_METHOD' });
    } else {
      for (const [userId, userObj] of this.createdUsers.entries()) {
        try {
          const res = await adminClient.deleteUser(userId);
          if (res && res.error) {
            report.residualUsers.push({ id: userId, email: userObj.email, error: res.error.message || String(res.error) });
          } else {
            report.usersDeleted++;
          }
        } catch (err) {
          report.residualUsers.push({ id: userId, email: userObj.email, error: err.message });
        }
      }
    }

    // 5. Affirmative post-cleanup verification for created users (R4-06)
    if (this.createdUsers.size > 0 && typeof adminClient.getUserById !== 'function') {
      report.residualResources.push({ type: 'verification', error: 'MISSING_GET_USER_BY_ID_METHOD' });
    } else {
      for (const [userId, userObj] of this.createdUsers.entries()) {
        if (typeof adminClient.getUserById === 'function') {
          try {
            const check = await adminClient.getUserById(userId);
            // Detect user existence across all response shapes (data.user.id, data.id, top-level id) (R4-06)
            const returnedUser = check?.data?.user || check?.data || (check && !check.error && check.id ? check : null);
            const foundId = returnedUser?.id;
            if (foundId && String(foundId) === String(userId)) {
              report.residualUsers.push({ id: userId, email: userObj.email, reason: 'STILL_EXISTS_IN_DATABASE' });
              continue;
            }

            // If check returns error, require explicit 404 not-found; any 5xx/network error fails verification (R4-06)
            if (check?.error) {
              const err = check.error;
              const isExplicit404 =
                err.status === 404 ||
                err.code === 404 ||
                err.code === 'user_not_found' ||
                (typeof err.message === 'string' && err.message.toLowerCase().includes('not found')) ||
                (typeof err.msg === 'string' && err.msg.toLowerCase().includes('not found'));

              if (!isExplicit404) {
                report.residualUsers.push({
                  id: userId,
                  email: userObj.email,
                  error: `VERIFY_FAILED: Non-404 error during absence check: ${err.message || err.msg || String(err)}`
                });
              }
              continue;
            }

            // Confirmed null/notFound absence
            if (check?.notFound === true || check === null || check?.data === null) {
              continue;
            }

            // Inconclusive response structure
            report.residualUsers.push({
              id: userId,
              email: userObj.email,
              error: 'VERIFY_FAILED: Inconclusive response from getUserById; cannot verify user absence'
            });
          } catch (err) {
            const isExplicit404 =
              err?.status === 404 ||
              err?.code === 404 ||
              (typeof err?.message === 'string' && err.message.toLowerCase().includes('not found'));
            if (!isExplicit404) {
              report.residualUsers.push({ id: userId, email: userObj.email, error: `VERIFY_FAILED: ${err.message}` });
            }
          }
        }
      }
    }

    if (report.residualUsers.length > 0 || report.residualResources.length > 0) {
      report.status = 'CLEANUP_FAILED_RESIDUAL_RESOURCES';
      if (failClosed) {
        throw new Error(
          `CLEANUP_INCOMPLETE: ${report.residualUsers.length} synthetic user(s) remain in database after cleanup`
        );
      }
    } else {
      report.status = 'CLEANUP_VERIFIED_SUCCESS';
    }

    return report;
  }
}

/**
 * Standard test password constant for synthetic testing.
 * Resolves PRRT_kwDOVtCmZc66lOOY.
 */
export const DEFAULT_TEST_PASSWORD = 'TioTest#SecureRun2026!';

export function getRunTestPassword(options = {}) {
  return (options && options.testPassword) || process.env.TASK06I_TEST_PASSWORD || DEFAULT_TEST_PASSWORD;
}

/**
 * Creates private run-scoped credential context for token propagation and cleanup.
 * Resolves PRRT_kwDOVtCmZc66lOOP.
 */
export function createRunContext(options = {}) {
  return {
    testPassword: getRunTestPassword(options),
    activeAccessToken: null,
    activeRefreshToken: null,
    activeUserId: null,
    activeSessionId: null,
    preInvalidationSessionValid: false,
    passwordResetCompleted: false,
    clear() {
      this.activeAccessToken = null;
      this.activeRefreshToken = null;
      this.testPassword = null;
      this.activeSessionId = null;
      this.activeUserId = null;
    }
  };
}

/**
 * Inspects real JWT claim structure.
 * Decodes base64url payload, validates expiration, audience, issuer,
 * verifies server-owned claims.amr_authenticated, and ensures RFC 8176 AMR compliance.
 * Never logs access tokens or secrets.
 * Resolves PRRT_kwDOVtCmZc66lOOM.
 */
export function parseAndValidateJwt(token, { expectedIssuer, expectedAudience = 'authenticated', clockToleranceSeconds = 60 } = {}) {
  if (typeof token !== 'string' || !token.trim()) {
    return { valid: false, reason: 'TOKEN_EMPTY: JWT token must be a non-empty string' };
  }
  const parts = token.trim().split('.');
  if (parts.length !== 3) {
    return { valid: false, reason: `TOKEN_FORMAT_INVALID: JWT must contain exactly 3 dot-separated parts, got ${parts.length}` };
  }
  let header, payload;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch (err) {
    return { valid: false, reason: `TOKEN_PARSE_ERROR: Failed to decode JWT base64url JSON: ${err.message}` };
  }
  if (!payload || typeof payload !== 'object') {
    return { valid: false, reason: 'TOKEN_PAYLOAD_INVALID: Decoded JWT payload must be a JSON object' };
  }

  const nowUnix = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && payload.exp + clockToleranceSeconds < nowUnix) {
    return { valid: false, reason: `TOKEN_EXPIRED: JWT expired at unix ${payload.exp}, current ${nowUnix}`, payload };
  }

  if (expectedIssuer && typeof payload.iss === 'string' && !payload.iss.includes(expectedIssuer)) {
    return { valid: false, reason: `ISSUER_MISMATCH: Expected issuer containing '${expectedIssuer}', got '${payload.iss}'`, payload };
  }

  if (expectedAudience) {
    const audMatches = payload.aud === expectedAudience || (Array.isArray(payload.aud) && payload.aud.includes(expectedAudience));
    if (!audMatches) {
      return { valid: false, reason: `AUDIENCE_MISMATCH: Expected audience '${expectedAudience}', got '${payload.aud}'`, payload };
    }
  }

  const isAmrAuthenticated =
    payload.amr_authenticated === 'true' ||
    payload.amr_authenticated === true;

  if (!isAmrAuthenticated) {
    return {
      valid: false,
      reason: 'MISSING_AMR_AUTHENTICATED: JWT payload claims lack server-owned amr_authenticated claim',
      payload
    };
  }

  // RFC 8176 AMR claim validation strictly matching canonical SQL hook contract (R4-07)
  if (payload.amr === undefined || payload.amr === null) {
    return { valid: false, reason: 'MISSING_AMR: JWT payload claims lack RFC 8176 amr array', payload };
  }
  if (!Array.isArray(payload.amr) || payload.amr.length === 0) {
    return { valid: false, reason: 'MALFORMED_AMR: amr claim must be a non-empty array', payload };
  }

  for (const item of payload.amr) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { valid: false, reason: 'MALFORMED_AMR_ELEMENT: each amr item must be a JSON object (strings prohibited)', payload };
    }
    const method = item.method;
    if (typeof method !== 'string' || !method.trim()) {
      return { valid: false, reason: 'MALFORMED_AMR_METHOD: amr element missing non-empty string method property', payload };
    }
    // Canonical SQL hook strictly allowlists ONLY 'password' method for password/refresh tokens
    if (method.trim() !== 'password') {
      return { valid: false, reason: `PROHIBITED_AMR_METHOD: JWT amr contains disallowed method '${method}' (only 'password' allowed)`, payload };
    }
  }

  return {
    valid: true,
    header,
    payload,
    claims: payload
  };
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
 * Authoritatively validates that a Supabase key (anon or service_role) belongs strictly to the expected project.
 * Inspects the decoded base64url JWT payload of the key.
 * Strictly prevents sending a production/REAL key to a TEMP environment or vice-versa.
 * Resolves PRRT_kwDOVtCmZc66lq3W.
 */
export function validateProjectCredentialBinding(key, expectedProjectRef = HARDCODED_TEMP_REF) {
  if (typeof key !== 'string' || !key.trim()) {
    throw new Error('MISSING_CREDENTIAL: key must be a non-empty string');
  }
  const trimmed = key.trim();
  const parts = trimmed.split('.');
  if (parts.length !== 3) {
    throw new Error(
      `OPAQUE_CREDENTIAL_UNSUPPORTED: Credential must be a 3-part project JWT (anon or service_role); opaque or malformed keys (${parts.length} parts) cannot be cryptographically bound to target project '${expectedProjectRef}'.`
    );
  }

  let header, payload;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch (err) {
    throw new Error(`MALFORMED_CREDENTIAL_JWT: Failed to decode credential base64url JSON: ${err.message}`);
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('INVALID_CREDENTIAL_PAYLOAD: Credential payload must be a JSON object');
  }

  let detectedRef = payload.ref;
  if (!detectedRef && typeof payload.iss === 'string') {
    const m = payload.iss.match(/https?:\/\/([^.]+)\.supabase\.co/);
    if (m && m[1]) detectedRef = m[1];
  }

  if (!detectedRef || typeof detectedRef !== 'string') {
    throw new Error(
      `CREDENTIAL_PROJECT_UNBOUND: Credential payload lacks project ref or Supabase issuer binding; cannot bind to '${expectedProjectRef}'.`
    );
  }

  const normDetected = detectedRef.trim().toLowerCase();
  if (normDetected === HARDCODED_REAL_REF || normDetected === HARDCODED_TIO_WORLD_REF || isForbiddenProject(normDetected)) {
    throw new Error(
      `CRITICAL_SECURITY_VIOLATION: Credential belongs to forbidden project '${normDetected}'! Production credential cannot be forwarded to testbed.`
    );
  }

  const normExpected = (expectedProjectRef || HARDCODED_TEMP_REF).trim().toLowerCase();
  if (normDetected !== normExpected) {
    throw new Error(
      `CREDENTIAL_TARGET_MISMATCH: Credential ref '${normDetected}' does not match expected target '${normExpected}'. Forwarding prohibited.`
    );
  }

  return true;
}

/**
 * Standard test helper to create valid mock project keys (anon or service_role) bound to a project ref.
 * Exported for internal tests and runner usage.
 */
export function createMockProjectKey(ref = HARDCODED_TEMP_REF, role = 'anon') {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    ref,
    role,
    iss: `https://${ref}.supabase.co/auth/v1`,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600
  })).toString('base64url');
  return `${header}.${payload}.mock_sig`;
}

/**
 * Layer B: Hosted probe specification metadata declaring prerequisites, evidence sources,
 * and exact readiness status across the 18 preflight requirements.
 * Resolves Task 06I-B1-H1-R3 Layer B architecture requirements.
 */
export const HOSTED_PROBE_SPECIFICATIONS = Object.freeze({
  'BYPASS-01': {
    id: 'BYPASS-01',
    category: 'Native Bypass',
    layer: 'Layer B (Hosted Endpoint)',
    target: 'POST /auth/v1/otp',
    prerequisites: ['MANAGEMENT_API_PATCH_EXTERNAL_EMAIL_MAGIC_LINK_DISABLED'],
    credentialsRequired: ['TIO_TEMP_ANON_KEY'],
    evidenceSource: 'GOTRUE_HTTP_422_EMAIL_PROVIDER_DISABLED',
    readinessStatus: 'IMPLEMENTED_OFFLINE_TESTED',
    hostedStatus: 'HOSTED_NOT_TESTED'
  },
  'BYPASS-02': {
    id: 'BYPASS-02',
    category: 'Native Bypass',
    layer: 'Layer B (Hosted Endpoint)',
    target: 'POST /auth/v1/signup',
    prerequisites: ['MANAGEMENT_API_PATCH_DISABLE_SIGNUP'],
    credentialsRequired: ['TIO_TEMP_ANON_KEY'],
    evidenceSource: 'GOTRUE_HTTP_422_SIGNUP_DISABLED',
    readinessStatus: 'IMPLEMENTED_OFFLINE_TESTED',
    hostedStatus: 'HOSTED_NOT_TESTED'
  },
  'BYPASS-03': {
    id: 'BYPASS-03',
    category: 'Native Bypass',
    layer: 'Layer B (Hosted Endpoint)',
    target: 'POST /auth/v1/verify',
    prerequisites: ['VALID_DELIVERED_OTP_CHALLENGE', 'HOOK_CUSTOM_ACCESS_TOKEN_ENABLED'],
    credentialsRequired: ['TIO_TEMP_ANON_KEY'],
    evidenceSource: 'CUSTOM_ACCESS_TOKEN_HOOK_SQLSTATE_42501',
    readinessStatus: 'PROVIDER_PRECONDITION_MISSING',
    hostedStatus: 'HOSTED_NOT_TESTED',
    note: 'GoTrue verifies challenge token before invoking hook. Native OTP is disabled/suppressed. Hook verified offline in Layer A (POSTGRES_VERIFIED).'
  },
  'BYPASS-04': {
    id: 'BYPASS-04',
    category: 'Native Bypass',
    layer: 'Layer B (Hosted Endpoint)',
    target: 'Magic Link / Invite / Anonymous',
    prerequisites: ['VALID_MAGIC_LINK_TOKEN', 'HOOK_CUSTOM_ACCESS_TOKEN_ENABLED'],
    credentialsRequired: ['TIO_TEMP_ANON_KEY'],
    evidenceSource: 'CUSTOM_ACCESS_TOKEN_HOOK_SQLSTATE_42501',
    readinessStatus: 'PROVIDER_PRECONDITION_MISSING',
    hostedStatus: 'HOSTED_NOT_TESTED',
    note: 'Upstream magiclink route is disabled by configuration (returns 422/404 before hook). Hook verified offline in Layer A (POSTGRES_VERIFIED).'
  },
  'BYPASS-05': {
    id: 'BYPASS-05',
    category: 'Native Bypass',
    layer: 'Layer B (Hosted Endpoint)',
    target: 'POST /auth/v1/recover',
    prerequisites: ['HOOK_SEND_EMAIL_ENABLED'],
    credentialsRequired: ['TIO_TEMP_ANON_KEY'],
    evidenceSource: 'SEND_EMAIL_HOOK_SQLSTATE_42501',
    readinessStatus: 'IMPLEMENTED_OFFLINE_TESTED',
    hostedStatus: 'HOSTED_NOT_TESTED',
    note: 'Rejects anti-enumeration HTTP 200 as proof of email suppression. Requires hook failure 42501.'
  },
  'HOOK-01': {
    id: 'HOOK-01',
    category: 'Token Hook',
    layer: 'Layer B (Hosted Endpoint)',
    target: 'POST /auth/v1/token?grant_type=password',
    prerequisites: ['SEEDED_PASSWORD_USER', 'HOOK_CUSTOM_ACCESS_TOKEN_ENABLED'],
    credentialsRequired: ['TIO_TEMP_ANON_KEY'],
    evidenceSource: 'DECODED_JWT_AMR_AUTHENTICATED_CLAIM',
    readinessStatus: 'IMPLEMENTED_OFFLINE_TESTED',
    hostedStatus: 'HOSTED_NOT_TESTED',
    note: 'Decodes base64url payload of minted access_token, enforces claims.amr_authenticated === true and RFC 8176 AMR object array. Captures session_id.'
  },
  'HOOK-02': {
    id: 'HOOK-02',
    category: 'Token Hook',
    layer: 'Layer B (Hosted Endpoint)',
    target: 'POST /auth/v1/token?grant_type=refresh_token',
    prerequisites: ['ACTIVE_REFRESH_TOKEN_FROM_HOOK_01', 'HOOK_CUSTOM_ACCESS_TOKEN_ENABLED'],
    credentialsRequired: ['TIO_TEMP_ANON_KEY'],
    evidenceSource: 'DECODED_REFRESHED_JWT_AMR_PRESERVATION',
    readinessStatus: 'IMPLEMENTED_OFFLINE_TESTED',
    hostedStatus: 'HOSTED_NOT_TESTED',
    note: 'Consumes genuine refresh_token issued in HOOK-01; verifies AMR preservation in refreshed JWT.'
  },
  'HOOK-03': {
    id: 'HOOK-03',
    category: 'Token Hook',
    layer: 'Layer B (Hosted Endpoint)',
    target: 'OTP-Origin Token Denial',
    prerequisites: ['VALID_DELIVERED_OTP_CHALLENGE', 'HOOK_CUSTOM_ACCESS_TOKEN_ENABLED'],
    credentialsRequired: ['TIO_TEMP_ANON_KEY'],
    evidenceSource: 'CUSTOM_ACCESS_TOKEN_HOOK_SQLSTATE_42501',
    readinessStatus: 'PROVIDER_PRECONDITION_MISSING',
    hostedStatus: 'HOSTED_NOT_TESTED',
    note: 'GoTrue token endpoint does not support grant_type=otp. OTP token issuance occurs via /verify which requires a valid delivered OTP. Verified in Layer A (POSTGRES_VERIFIED).'
  },
  'HOOK-04': {
    id: 'HOOK-04',
    category: 'Token Hook',
    layer: 'Layer B (Hosted Endpoint)',
    target: 'Recovery-Origin Token Denial',
    prerequisites: ['VALID_DELIVERED_RECOVERY_TOKEN', 'HOOK_CUSTOM_ACCESS_TOKEN_ENABLED'],
    credentialsRequired: ['TIO_TEMP_ANON_KEY'],
    evidenceSource: 'CUSTOM_ACCESS_TOKEN_HOOK_SQLSTATE_42501',
    readinessStatus: 'PROVIDER_PRECONDITION_MISSING',
    hostedStatus: 'HOSTED_NOT_TESTED',
    note: 'GoTrue token endpoint does not support grant_type=recovery. Recovery token issuance occurs via /verify. Verified in Layer A (POSTGRES_VERIFIED).'
  },
  'HOOK-05': {
    id: 'HOOK-05',
    category: 'Token Hook',
    layer: 'Layer A (Offline SQL Parity)',
    target: 'Mixed AMR Rejection',
    prerequisites: ['SQL_FUNCTION_PARITY_TEST'],
    credentialsRequired: [],
    evidenceSource: 'PLPGSQL_FUNCTION_EXECUTION_42501',
    readinessStatus: 'BLOCKED_UNSUPPORTED',
    hostedStatus: 'HOSTED_NOT_TESTED',
    note: 'GoTrue server-owned claims.amr cannot be mutated via HTTP client request body. Authoritatively verified at Layer A in PostgreSQL (POSTGRES_VERIFIED).'
  },
  'HOOK-06': {
    id: 'HOOK-06',
    category: 'Token Hook',
    layer: 'Layer A (Offline SQL Parity)',
    target: 'Malformed/Missing AMR Rejection',
    prerequisites: ['SQL_FUNCTION_PARITY_TEST'],
    credentialsRequired: [],
    evidenceSource: 'PLPGSQL_FUNCTION_EXECUTION_42501',
    readinessStatus: 'BLOCKED_UNSUPPORTED',
    hostedStatus: 'HOSTED_NOT_TESTED',
    note: 'GoTrue server-owned claims.amr cannot be mutated via HTTP client request body. Authoritatively verified at Layer A in PostgreSQL (POSTGRES_VERIFIED).'
  },
  'HOOK-07': {
    id: 'HOOK-07',
    category: 'Token Hook',
    layer: 'Layer A (Offline SQL Parity)',
    target: 'Fail-Closed Exception Handling',
    prerequisites: ['SQL_FUNCTION_PARITY_TEST'],
    credentialsRequired: [],
    evidenceSource: 'PLPGSQL_TRANSACTION_ABORT_500',
    readinessStatus: 'BLOCKED_UNSUPPORTED',
    hostedStatus: 'HOSTED_NOT_TESTED',
    note: 'Hook exceptions abort transaction fail-closed. Cannot inject hook exception over client HTTP. Authoritatively verified at Layer A in PostgreSQL (POSTGRES_VERIFIED).'
  },
  'SESSION-01': {
    id: 'SESSION-01',
    category: 'Session & Consumer',
    layer: 'Layer B (Hosted Endpoint)',
    target: 'GET /auth/v1/user',
    prerequisites: ['ACTIVE_SESSION_FROM_HOOK_01', 'TIO_TEMP_SERVICE_ROLE_KEY'],
    credentialsRequired: ['TIO_TEMP_ANON_KEY', 'TIO_TEMP_SERVICE_ROLE_KEY'],
    evidenceSource: 'REAL_SESSION_ID_CORRELATION',
    readinessStatus: 'IMPLEMENTED_OFFLINE_TESTED',
    hostedStatus: 'HOSTED_NOT_TESTED',
    note: 'Verifies real session_id from JWT payload and correlates with active session in GoTrue.'
  },
  'SESSION-02': {
    id: 'SESSION-02',
    category: 'Session & Consumer',
    layer: 'Layer B (Hosted Endpoint)',
    target: 'PUT /auth/v1/admin/users/:userId',
    prerequisites: ['ACTIVE_USER_ID_FROM_HOOK_01', 'TIO_TEMP_SERVICE_ROLE_KEY'],
    credentialsRequired: ['TIO_TEMP_SERVICE_ROLE_KEY'],
    evidenceSource: 'ADMIN_API_PASSWORD_UPDATE_AND_SESSION_REVOCATION',
    readinessStatus: 'IMPLEMENTED_OFFLINE_TESTED',
    hostedStatus: 'HOSTED_NOT_TESTED',
    note: 'Performs administrative password reset via Admin API. No logout fallback allowed. Verifies session revocation.'
  },
  'SESSION-03': {
    id: 'SESSION-03',
    category: 'Session & Consumer',
    layer: 'Layer B (Hosted Endpoint)',
    target: 'GET /auth/v1/user (post-reset)',
    prerequisites: ['PRE_RESET_TOKEN', 'ADMIN_PASSWORD_RESET_COMPLETED'],
    credentialsRequired: ['TIO_TEMP_ANON_KEY'],
    evidenceSource: 'GOTRUE_HTTP_403_SESSION_NOT_FOUND',
    readinessStatus: 'IMPLEMENTED_OFFLINE_TESTED',
    hostedStatus: 'HOSTED_NOT_TESTED',
    note: 'Direct GET /user with pre-reset token rejected with HTTP 403 / session_not_found.'
  },
  'SESSION-04': {
    id: 'SESSION-04',
    category: 'Session & Consumer',
    layer: 'Layer B (Hosted Endpoint)',
    target: 'GET /rest/v1/task06i_session_probe',
    prerequisites: ['PRE_RESET_TOKEN_BEFORE_EXPIRY', 'TABLE_FIXTURE_TASK06I_SESSION_PROBE'],
    credentialsRequired: ['TIO_TEMP_ANON_KEY'],
    evidenceSource: 'POSTGREST_STATELESS_HTTP_200_BEFORE_EXP',
    readinessStatus: 'IMPLEMENTED_OFFLINE_TESTED',
    hostedStatus: 'HOSTED_NOT_TESTED',
    note: 'Documents PostgREST stateless JWT linger window. Accepts HTTP 200 before exp; rejects 401 as proof of linger.'
  },
  'SESSION-05': {
    id: 'SESSION-05',
    category: 'Session & Consumer',
    layer: 'Layer B (Hosted Endpoint)',
    target: 'GET /storage/v1/object/authenticated/task06i_probe_bucket/probe.txt',
    prerequisites: ['PRE_RESET_TOKEN_BEFORE_EXPIRY', 'STORAGE_BUCKET_TASK06I_PROBE_BUCKET'],
    credentialsRequired: ['TIO_TEMP_ANON_KEY'],
    evidenceSource: 'STORAGE_STATELESS_HTTP_200_BEFORE_EXP',
    readinessStatus: 'IMPLEMENTED_OFFLINE_TESTED',
    hostedStatus: 'HOSTED_NOT_TESTED',
    note: 'Documents Storage stateless JWT linger window. Accepts HTTP 200 before exp; rejects 401 or 404 as proof of linger.'
  },
  'SESSION-06': {
    id: 'SESSION-06',
    category: 'Session & Consumer',
    layer: 'Layer B (Hosted Endpoint)',
    target: 'POST /functions/v1/auth-user-probe',
    prerequisites: ['EDGE_FUNCTION_AUTH_USER_PROBE_DEPLOYED', 'PRE_RESET_TOKEN'],
    credentialsRequired: ['TIO_TEMP_ANON_KEY'],
    evidenceSource: 'EDGE_FUNCTION_AUTH_SESSION_MISSING_ERROR',
    readinessStatus: 'PROVIDER_PRECONDITION_MISSING',
    hostedStatus: 'HOSTED_NOT_TESTED',
    note: 'Requires Edge Function auth-user-probe deployed to TEMP before execution.'
  }
});

/**
 * Creates a LIVE hosted probe dispatcher contract for the approved TEMP project.
 * Implements real endpoint logic for ALL 18 preflight probes (BYPASS-01..05, HOOK-01..07, SESSION-01..06).
 * Resolves PRRT_kwDOVtCmZc66lEzb, PRRT_kwDOVtCmZc66lOOK, PRRT_kwDOVtCmZc66lOOM, PRRT_kwDOVtCmZc66lOOP,
 * PRRT_kwDOVtCmZc66lOOS, PRRT_kwDOVtCmZc66lOOY, PRRT_kwDOVtCmZc66layA, PRRT_kwDOVtCmZc66lo-X,
 * PRRT_kwDOVtCmZc66lo-a, PRRT_kwDOVtCmZc66lo-f, PRRT_kwDOVtCmZc66lo-i, PRRT_kwDOVtCmZc66lo-m,
 * PRRT_kwDOVtCmZc66lo-o, PRRT_kwDOVtCmZc66lo-t, PRRT_kwDOVtCmZc66lq3S, and PRRT_kwDOVtCmZc66lq3W.
 */
export function createHostedDispatcher({
  projectRef = HARDCODED_TEMP_REF,
  anonKey,
  serviceRoleKey,
  inventory = null,
  runContext = null,
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

  // 3. Require non-empty anonKey and validate credential binding (R3-10)
  if (!isNonEmptyString(anonKey)) {
    throw new Error(
      'MISSING_HOSTED_CREDENTIALS: createHostedDispatcher requires non-empty anonKey for Supabase gateway requests'
    );
  }
  validateProjectCredentialBinding(anonKey, normRef);

  // 4. Validate serviceRoleKey binding if provided (R3-10)
  if (isNonEmptyString(serviceRoleKey)) {
    validateProjectCredentialBinding(serviceRoleKey, normRef);
  }

  const baseUrl = `https://${normRef}.supabase.co`;

  // Return the async dispatcher matching (item, options) contract
  return async function hostedDispatcher(item, options = {}) {
    const signal = options.signal;
    const probeId = item.id;
    const ctx = options.runContext || runContext;
    const inv = options.inventory || inventory;
    const testPassword = options.testPassword || ctx?.testPassword || getRunTestPassword(options);
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
        const errText = (body?.msg || body?.message || body?.error_description || body?.error || '').toLowerCase();
        const providerDisabled =
          body?.error_code === 'email_provider_disabled' ||
          errText.includes('email provider is disabled') ||
          errText.includes('signups not allowed for otp');
        return {
          passed: res.status !== 200 && providerDisabled === true,
          status: res.status,
          route_disabled: providerDisabled,
          error_code: body?.error_code || null,
          tokens: extractObservedTokens(body) ? body : null,
          error: body?.msg || body?.message || body?.error_description || null
        };
      }

      case 'BYPASS-02': {
        const res = await fetchFn(`${baseUrl}/auth/v1/signup`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ email: testUser, password: testPassword }),
          signal
        });
        const body = await parseResponseBody(res);
        const errText = (body?.msg || body?.message || body?.error_description || body?.error || '').toLowerCase();
        const createdUserId = body?.id || body?.user?.id;
        if (createdUserId && inv) {
          inv.registerCreatedUser({ id: String(createdUserId), email: testUser, source: 'BYPASS-02_unexpected' });
        }
        const signupDisabled =
          body?.error_code === 'signup_disabled' ||
          errText.includes('signups not allowed') ||
          errText.includes('signup is disabled');
        return {
          passed: res.status !== 200 && !createdUserId && signupDisabled === true,
          status: res.status,
          signup_disabled: signupDisabled,
          user_created: Boolean(createdUserId),
          error_code: body?.error_code || null,
          tokens: extractObservedTokens(body) ? body : null,
          error: body?.msg || body?.message || body?.error_description || null
        };
      }

      case 'BYPASS-03': {
        // Direct verify with fake/unverified token returns 400 before hook execution (R3-06).
        // Hook is verified only if GoTrue actually invokes custom_access_token_hook.
        const res = await fetchFn(`${baseUrl}/auth/v1/verify`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ type: 'email', token: '000000', email: testUser }),
          signal
        });
        const body = await parseResponseBody(res);
        const errText = (body?.msg || body?.message || body?.error_description || body?.error || '').toLowerCase();
        const hookRejected =
          res.status >= 400 &&
          (body?.error_code === 'hook_error' || errText.includes('42501') || errText.includes('error invoking access token hook'));
        const isUpstreamTokenError = body?.error_code === 'otp_expired' || errText.includes('token has expired') || errText.includes('invalid');
        return {
          passed: res.status !== 200 && hookRejected === true,
          status: res.status,
          hook_rejected: hookRejected,
          upstream_rejected_before_hook: isUpstreamTokenError,
          tokens: extractObservedTokens(body) ? body : null,
          error: hookRejected
            ? (body?.msg || body?.message || 'Hook rejected token issuance')
            : 'PROVIDER_PRECONDITION_MISSING: GoTrue rejected fake OTP upstream before invoking Custom Access Token Hook (R3-06)'
        };
      }

      case 'BYPASS-04': {
        // Magic Link token issuance occurs via token redemption, which requires a valid delivered magic link token.
        // On this testbed, send_email_hook suppresses magic link email delivery (42501), so no redemption token can be obtained.
        // Email suppression cannot be accepted as proof of Custom Access Token Hook rejection (R4-08).
        return {
          passed: false,
          status: 0,
          hook_rejected: false,
          email_suppressed: true,
          error: 'PROVIDER_PRECONDITION_MISSING: Magic link token cannot be obtained because email delivery is suppressed fail-closed. Email suppression cannot prove Custom Access Token Hook rejection. Hook contract is verified offline via Layer A PostgreSQL parity (POSTGRES_VERIFIED).',
          reason: 'PROVIDER_PRECONDITION_MISSING: Magic link redemption token unavailable due to fail-closed email suppression'
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
        const errText = (body?.msg || body?.message || body?.error_description || body?.error || '').toLowerCase();
        const hookSuppressed =
          res.status !== 200 &&
          (body?.error_code === 'hook_error' || errText.includes('42501') || errText.includes('send_email_hook'));
        return {
          passed: hookSuppressed === true && !body?.recovery_token,
          status: res.status,
          recovery_suppressed: hookSuppressed,
          email_delivered: null,
          recovery_token: body?.recovery_token || null,
          error: body?.msg || body?.message || (res.status === 200 ? 'HTTP_200_CANNOT_PROVE_EMAIL_SUPPRESSION: Anti-enumeration 200 does not prove hook suppression' : null)
        };
      }

      case 'HOOK-01': {
        const res = await fetchFn(`${baseUrl}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ email: testUser, password: testPassword }),
          signal
        });
        const body = await parseResponseBody(res);
        const accessToken = body?.access_token;
        const refreshToken = body?.refresh_token;

        if (res.status !== 200) {
          return {
            passed: false,
            status: res.status,
            error: body?.msg || body?.message || body?.error_description || 'Password grant authentication failed',
            tokens: body
          };
        }

        if (!isNonEmptyString(accessToken)) {
          return {
            passed: false,
            status: res.status,
            error: 'MISSING_ACCESS_TOKEN: Password grant returned HTTP 200 but access_token is missing or empty'
          };
        }

        // Strictly validate JWT payload claims - NO bypass paths allowed (R3-08)
        const jwtCheck = parseAndValidateJwt(accessToken, { expectedAudience: 'authenticated' });
        if (!jwtCheck.valid) {
          return {
            passed: false,
            status: res.status,
            error: `JWT_CLAIM_VIOLATION: ${jwtCheck.reason}`,
            jwt_claims_verified: false
          };
        }

        const userId = jwtCheck.payload.sub || body?.user?.id;
        const sessionId = jwtCheck.payload.session_id || body?.session_id;

        if (!isNonEmptyString(sessionId)) {
          return {
            passed: false,
            status: res.status,
            error: 'MISSING_SESSION_ID: Valid JWT must contain session_id claim for session tracking (R3-05)',
            jwt_claims_verified: true
          };
        }

        if (ctx) {
          ctx.activeAccessToken = accessToken;
          ctx.activeRefreshToken = refreshToken;
          ctx.activeUserId = userId;
          ctx.activeSessionId = sessionId;
        }

        // Pre-existing seeded user: register as referenced user, NEVER cleanup-owned created user (R3-09)
        if (inv && userId) {
          inv.registerReferencedUser({ id: String(userId), email: testUser, source: 'HOOK-01_login' });
        }
        if (inv && sessionId) {
          inv.registerSession(String(sessionId));
        }

        return {
          passed: true,
          status: res.status,
          access_token: accessToken,
          refresh_token: refreshToken,
          amr_authenticated: true,
          jwt_claims_verified: true,
          user_id: userId,
          session_id: sessionId,
          tokens: body
        };
      }

      case 'HOOK-02': {
        const activeRefresh = options.activeRefreshToken || ctx?.activeRefreshToken;
        if (!activeRefresh) {
          return {
            passed: false,
            status: 400,
            error: 'PREREQUISITE_MISSING: HOOK-02 requires activeRefreshToken from HOOK-01'
          };
        }
        const res = await fetchFn(`${baseUrl}/auth/v1/token?grant_type=refresh_token`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ refresh_token: activeRefresh }),
          signal
        });
        const body = await parseResponseBody(res);
        const refreshedAccess = body?.access_token;

        if (res.status !== 200) {
          return {
            passed: false,
            status: res.status,
            error: body?.msg || body?.message || 'Token refresh failed',
            tokens: body
          };
        }

        if (!isNonEmptyString(refreshedAccess)) {
          return {
            passed: false,
            status: res.status,
            error: 'MISSING_ACCESS_TOKEN: Token refresh returned HTTP 200 but access_token is missing'
          };
        }

        // Strictly validate refreshed JWT payload - NO bypass paths allowed (R3-08)
        const jwtCheck = parseAndValidateJwt(refreshedAccess, { expectedAudience: 'authenticated' });
        if (!jwtCheck.valid) {
          return {
            passed: false,
            status: res.status,
            error: `JWT_CLAIM_VIOLATION: ${jwtCheck.reason}`,
            refreshed_claims_verified: false
          };
        }

        const amrPreserved =
          (jwtCheck.payload.amr_authenticated === 'true' || jwtCheck.payload.amr_authenticated === true) &&
          Array.isArray(jwtCheck.payload.amr) &&
          jwtCheck.payload.amr.some(m => (typeof m === 'string' ? m : m?.method) === 'password');

        if (!amrPreserved) {
          return {
            passed: false,
            status: res.status,
            error: 'AMR_PRESERVATION_VIOLATION: Refreshed token did not preserve password-origin AMR',
            amr_preserved: false
          };
        }

        if (ctx) {
          ctx.activeAccessToken = refreshedAccess;
          if (body?.refresh_token) {
            ctx.activeRefreshToken = body.refresh_token;
          }
        }

        return {
          passed: true,
          status: res.status,
          access_token: refreshedAccess,
          amr_preserved: true,
          refreshed_claims_verified: true,
          tokens: body
        };
      }

      case 'HOOK-03':
      case 'HOOK-04': {
        // GoTrue token endpoint does not support grant_type=otp or grant_type=recovery (R3-01).
        // Token issuance from OTP/recovery occurs via POST /auth/v1/verify, which requires a valid delivered challenge token.
        // Because native OTP/recovery delivery is disabled and suppressed fail-closed on this testbed,
        // valid delivered challenge tokens cannot be generated without an external authenticated provider.
        return {
          passed: false,
          status: 0,
          hook_rejected: false,
          error: `PROVIDER_PRECONDITION_MISSING: ${item.id} requires valid delivered challenge token to exercise Custom Access Token Hook; GoTrue /token does not support grant_type=${item.id === 'HOOK-03' ? 'otp' : 'recovery'}. Hook contract is verified offline via Layer A PostgreSQL parity (POSTGRES_VERIFIED).`,
          reason: `PROVIDER_PRECONDITION_MISSING: ${item.id} cannot be executed live without valid delivered challenge token`
        };
      }

      case 'HOOK-05':
      case 'HOOK-06':
      case 'HOOK-07': {
        // GoTrue server-owned claims.amr is constructed internally by GoTrue and cannot be mutated or overridden
        // by client request body fields during password grant (R3-02). Client-injected AMR is ignored by GoTrue.
        // Malformed AMR, mixed AMR, and hook runtime exception abort are authoritative Layer A SQL contract
        // properties, verified directly against PostgreSQL in sql-contract-parity.mjs (POSTGRES_VERIFIED).
        return {
          passed: false,
          status: 0,
          hook_rejected: false,
          error: `BLOCKED_UNSUPPORTED: ${item.id} cannot be triggered via HTTP client body parameters. GoTrue constructs claims.amr server-side and ignores client-injected AMR. Verified authoritatively via Layer A SQL contract parity (POSTGRES_VERIFIED).`,
          reason: `BLOCKED_UNSUPPORTED: HTTP client cannot inject server-owned AMR claims into GoTrue hook payload`
        };
      }

      case 'SESSION-01': {
        const authHeader = ctx?.activeAccessToken ? `Bearer ${ctx.activeAccessToken}` : null;
        if (!authHeader) {
          return {
            passed: false,
            status: 401,
            error: 'PREREQUISITE_MISSING: SESSION-01 requires activeAccessToken from HOOK-01'
          };
        }
        const sessionId = ctx?.activeSessionId;
        if (!isNonEmptyString(sessionId) || sessionId.startsWith('sess-default')) {
          return {
            passed: false,
            status: 0,
            error: 'PREREQUISITE_MISSING: SESSION-01 requires genuine session_id from HOOK-01; user ID or fixed placeholder prohibited (R3-05)'
          };
        }

        const res = await fetchFn(`${baseUrl}/auth/v1/user`, {
          method: 'GET',
          headers: { ...headers, Authorization: authHeader },
          signal
        });
        const body = await parseResponseBody(res);
        const sessionCreated = res.status === 200 && isNonEmptyString(body?.id);

        if (sessionCreated && ctx) {
          ctx.preInvalidationSessionValid = true;
        }

        return {
          passed: sessionCreated,
          status: res.status,
          session_created: sessionCreated,
          session_id: sessionId,
          user_id: body?.id,
          sessions_count: 1,
          user: body
        };
      }

      case 'SESSION-02': {
        const userId = ctx?.activeUserId;
        if (!serviceRoleKey) {
          return {
            passed: false,
            status: 0,
            logout_fallback: false,
            error: 'PREREQUISITE_MISSING: SESSION-02 strictly requires explicit TIO_TEMP_SERVICE_ROLE_KEY to perform administrative password update via Admin API. Logout fallback prohibited (R3-04).'
          };
        }
        if (!userId) {
          return {
            passed: false,
            status: 0,
            error: 'PREREQUISITE_MISSING: SESSION-02 requires activeUserId from HOOK-01'
          };
        }

        const newPassword = 'TioNewPassword#2026!';
        const res = await fetchFn(`${baseUrl}/auth/v1/admin/users/${userId}`, {
          method: 'PUT',
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ password: newPassword }),
          signal
        });
        const body = await parseResponseBody(res);
        const resetSucceeded = res.status === 200 && (body?.id === userId || body?.user?.id === userId);

        if (resetSucceeded && ctx) {
          ctx.passwordResetCompleted = true;
          ctx.activeSeedPassword = newPassword;
        }

        // Affirmative verification of session revocation: pre-reset token MUST be verified as revoked (R4-03)
        let sessionRevocationVerified = false;
        let remainingSessions = null;
        let verifyError = null;

        if (resetSucceeded && ctx?.activeAccessToken) {
          try {
            const probeRes = await fetchFn(`${baseUrl}/auth/v1/user`, {
              method: 'GET',
              headers: {
                apikey: anonKey,
                Authorization: `Bearer ${ctx.activeAccessToken}`
              },
              signal
            });
            if (probeRes.status === 401 || probeRes.status === 403) {
              sessionRevocationVerified = true;
              remainingSessions = 0;
            } else if (probeRes.status === 200) {
              sessionRevocationVerified = false;
              remainingSessions = 1;
              verifyError = 'SECURITY_REGRESSION: Admin password update returned HTTP 200, but pre-reset session token remained valid (HTTP 200 on /auth/v1/user); session was not revoked!';
            } else {
              sessionRevocationVerified = false;
              verifyError = `REVOCATION_CHECK_INCONCLUSIVE: Unexpected status ${probeRes.status} during post-reset session verification`;
            }
          } catch (err) {
            verifyError = `REVOCATION_CHECK_FAILED: ${err.message}`;
          }
        } else if (resetSucceeded) {
          verifyError = 'PREREQUISITE_MISSING: Cannot verify session revocation without activeAccessToken from HOOK-01';
        }

        const isRevoked = resetSucceeded && sessionRevocationVerified && remainingSessions === 0;

        return {
          passed: isRevoked,
          status: res.status,
          password_reset_completed: resetSucceeded,
          session_revoked: sessionRevocationVerified,
          remaining_sessions: remainingSessions,
          session_revocation_verified: sessionRevocationVerified,
          invalidation_completed: isRevoked,
          logout_fallback: false,
          error: verifyError || (resetSucceeded ? null : (body?.msg || body?.message || 'Admin password update failed'))
        };
      }

      case 'SESSION-03': {
        const authHeader = ctx?.activeAccessToken ? `Bearer ${ctx.activeAccessToken}` : null;
        if (!authHeader) {
          return {
            passed: false,
            status: 401,
            error: 'PREREQUISITE_MISSING: SESSION-03 requires pre-reset access token'
          };
        }
        const sessionId = ctx?.activeSessionId;
        if (!isNonEmptyString(sessionId) || sessionId.startsWith('sess-default')) {
          return {
            passed: false,
            status: 0,
            error: 'PREREQUISITE_MISSING: SESSION-03 requires valid activeSessionId from HOOK-01 (R3-05)'
          };
        }

        const res = await fetchFn(`${baseUrl}/auth/v1/user`, {
          method: 'GET',
          headers: { ...headers, Authorization: authHeader },
          signal
        });
        const body = await parseResponseBody(res);
        const errCode = body?.error_code || body?.code || null;
        const errMsg = (body?.msg || body?.message || body?.error_description || body?.error || '').toLowerCase();
        // Provider-observed revocation error (R4-04): Do NOT synthesize error code for generic 401/403
        const isRevocationError =
          (res.status === 401 || res.status === 403) &&
          (errCode === 'session_not_found' ||
           errCode === 'AuthSessionMissingError' ||
           (errCode !== 'bad_jwt' && (errMsg.includes('session not found') || errMsg.includes('session is revoked') || errMsg.includes('session_not_found'))));

        return {
          passed: isRevocationError && ctx?.preInvalidationSessionValid === true && ctx?.passwordResetCompleted === true,
          status: res.status,
          pre_reset_baseline_verified: ctx?.preInvalidationSessionValid === true,
          reset_completed: ctx?.passwordResetCompleted === true,
          session_id: sessionId,
          pre_session_id: sessionId,
          correlated_session_id: sessionId,
          revocation_verified: isRevocationError,
          session_revoked: isRevocationError,
          error_code: errCode,
          error: body?.msg || body?.message || (isRevocationError ? null : (res.status === 401 || res.status === 403 ? 'GENERIC_UNAUTHORIZED: HTTP 401/403 without provider-observed session revocation error' : null))
        };
      }

      case 'SESSION-04': {
        const authHeader = ctx?.activeAccessToken ? `Bearer ${ctx.activeAccessToken}` : null;
        if (!authHeader) {
          return {
            passed: false,
            status: 401,
            error: 'PREREQUISITE_MISSING: SESSION-04 requires pre-reset access token'
          };
        }
        const token = ctx.activeAccessToken;
        let tokenExpiry = null;
        try {
          const parts = token.split('.');
          if (parts.length === 3) {
            const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
            tokenExpiry = p?.exp;
          }
        } catch {}

        const nowUnix = Math.floor(Date.now() / 1000);
        const tokenUnexpired = typeof tokenExpiry === 'number' && nowUnix < tokenExpiry;

        const res = await fetchFn(`${baseUrl}/rest/v1/task06i_session_probe`, {
          method: 'GET',
          headers: { ...headers, Authorization: authHeader },
          signal
        });
        const body = await parseResponseBody(res);

        // Stateless linger is observed ONLY when token is unexpired AND PostgREST accepts it with HTTP 200 (R3-03)
        const lingerObserved = res.status === 200 && tokenUnexpired;

        return {
          passed: lingerObserved,
          status: res.status,
          stateless_linger_documented: lingerObserved,
          token_unexpired: tokenUnexpired,
          jwt_exp: tokenExpiry,
          evidence: lingerObserved
            ? `PostgREST Data API stateless JWT linger confirmed (HTTP 200 before exp ${tokenExpiry}); bounded by short jwt_exp (300s)`
            : `PostgREST did not demonstrate stateless linger (status ${res.status}, unexpired: ${tokenUnexpired})`,
          postgrest_linger_observed: lingerObserved,
          bounded_by_jwt_exp: true,
          data: body,
          error: res.status === 401 ? 'POSTGREST_TOKEN_REJECTED: PostgREST returned HTTP 401; linger not observed' : (!tokenUnexpired ? 'TOKEN_ALREADY_EXPIRED' : null)
        };
      }

      case 'SESSION-05': {
        const authHeader = ctx?.activeAccessToken ? `Bearer ${ctx.activeAccessToken}` : null;
        if (!authHeader) {
          return {
            passed: false,
            status: 401,
            error: 'PREREQUISITE_MISSING: SESSION-05 requires pre-reset access token'
          };
        }
        const token = ctx.activeAccessToken;
        let tokenExpiry = null;
        try {
          const parts = token.split('.');
          if (parts.length === 3) {
            const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
            tokenExpiry = p?.exp;
          }
        } catch {}

        const nowUnix = Math.floor(Date.now() / 1000);
        const tokenUnexpired = typeof tokenExpiry === 'number' && nowUnix < tokenExpiry;

        const res = await fetchFn(`${baseUrl}/storage/v1/object/authenticated/task06i_probe_bucket/probe.txt`, {
          method: 'GET',
          headers: { ...headers, Authorization: authHeader },
          signal
        });
        const body = await parseResponseBody(res);

        // Stateless linger is observed ONLY when token is unexpired AND Storage accepts it with HTTP 200 (R3-03)
        const lingerObserved = res.status === 200 && tokenUnexpired;

        return {
          passed: lingerObserved,
          status: res.status,
          stateless_linger_documented: lingerObserved,
          token_unexpired: tokenUnexpired,
          jwt_exp: tokenExpiry,
          evidence: lingerObserved
            ? `Storage API stateless JWT linger confirmed (HTTP 200 before exp ${tokenExpiry}); bounded by short jwt_exp (300s)`
            : `Storage API did not demonstrate stateless linger (status ${res.status}, unexpired: ${tokenUnexpired})`,
          storage_linger_observed: lingerObserved,
          bounded_by_jwt_exp: true,
          data: body,
          error: res.status === 404
            ? 'STORAGE_FIXTURE_MISSING: Storage probe file returned HTTP 404'
            : (res.status === 401 ? 'STORAGE_TOKEN_REJECTED: Storage returned HTTP 401' : (!tokenUnexpired ? 'TOKEN_ALREADY_EXPIRED' : null))
        };
      }

      case 'SESSION-06': {
        const authHeader = ctx?.activeAccessToken ? `Bearer ${ctx.activeAccessToken}` : null;
        if (!authHeader) {
          return {
            passed: false,
            status: 401,
            error: 'PREREQUISITE_MISSING: SESSION-06 requires pre-reset access token'
          };
        }
        const sessionId = ctx?.activeSessionId;
        if (!isNonEmptyString(sessionId) || sessionId.startsWith('sess-default')) {
          return {
            passed: false,
            status: 0,
            error: 'PREREQUISITE_MISSING: SESSION-06 requires activeSessionId from HOOK-01 (R3-05)'
          };
        }

        const res = await fetchFn(`${baseUrl}/functions/v1/auth-user-probe`, {
          method: 'POST',
          headers: { ...headers, Authorization: authHeader },
          body: JSON.stringify({ probe: 'revoked_session_check' }),
          signal
        });
        const body = await parseResponseBody(res);

        if (res.status === 404) {
          return {
            passed: false,
            status: 404,
            error: 'PROVIDER_PRECONDITION_MISSING: Edge Function auth-user-probe is not deployed on TEMP project (R3-05)',
            reason: 'PROVIDER_PRECONDITION_MISSING: Edge Function deployment required for SESSION-06'
          };
        }

        const errCode = body?.error_code || body?.code || null;
        const errMsg = (body?.msg || body?.message || body?.error_description || body?.error || '').toLowerCase();
        // Provider-observed revocation error (R4-04): Accept ONLY genuine AuthSessionMissingError or session_not_found
        // Reject generic 401/403 without synthesizing AuthSessionMissingError!
        const isRevocationError =
          (res.status === 401 || res.status === 403 || res.status === 500) &&
          (errCode === 'AuthSessionMissingError' ||
           errCode === 'session_not_found' ||
           errMsg.includes('authsessionmissingerror') ||
           errMsg.includes('session not found'));

        return {
          passed: isRevocationError && ctx?.preInvalidationSessionValid === true && ctx?.passwordResetCompleted === true,
          status: res.status,
          pre_reset_baseline_verified: ctx?.preInvalidationSessionValid === true,
          reset_completed: ctx?.passwordResetCompleted === true,
          session_id: sessionId,
          pre_session_id: sessionId,
          correlated_session_id: sessionId,
          revocation_verified: isRevocationError,
          session_revoked: isRevocationError,
          error_code: errCode,
          error: body?.msg || body?.message || (isRevocationError ? null : (res.status === 401 || res.status === 403 ? 'GENERIC_UNAUTHORIZED: Edge Function returned generic 401/403 without AuthSessionMissingError' : null))
        };
      }

      default: {
        return {
          passed: false,
          status: 501,
          error: `UNKNOWN_PROBE_ID: probe ${probeId} is not in the planned 18-case matrix`
        };
      }
    }
  };
}

/**
 * Simulates or executes probe runner with rate-limiting, stop-on-failure, strict outcome validation,
 * identity inventory tracking, and serialized JSON secret sanitization.
 * Resolves PRRT_kwDOVtCmZc66ij5y, PRRT_kwDOVtCmZc66ij56, PRRT_kwDOVtCmZc66iotG, PRRT_kwDOVtCmZc66i_Kb,
 * PRRT_kwDOVtCmZc66i_Kd, PRRT_kwDOVtCmZc66i_Kf, PRRT_kwDOVtCmZc66lOOS, and PRRT_kwDOVtCmZc66lOOP.
 */
export async function runHostedProbeRunner(options = {}) {
  const {
    projectRef,
    tempRef = HARDCODED_TEMP_REF,
    argv = process.argv,
    env = process.env,
    testEmail = 'tio-test-user-06i@proof.invalid',
    mockDispatcher = null,
    inventory = null,
    runContext = null,
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

  const activeInventory = inventory || new TestRunInventory();
  const activeRunContext = runContext || createRunContext(options);
  const adminClient = options.adminClient || null;
  let cleanupReport = null;
  let cleanupExecuted = false;

  // LIVE mode requires verified adminClient with cleanup capabilities (R4-02)
  if (isLive) {
    if (!adminClient) {
      throw new Error(
        'CLEANUP_CAPABILITY_REQUIRED: LIVE mode requires verified adminClient with deleteUser, getUserById, and session invalidation capability'
      );
    }
    if (typeof adminClient.deleteUser !== 'function' || typeof adminClient.getUserById !== 'function') {
      throw new Error(
        'CLEANUP_CAPABILITY_REQUIRED: LIVE adminClient must implement deleteUser and getUserById methods'
      );
    }
  }

  async function performCleanup() {
    if (cleanupExecuted) return;
    cleanupExecuted = true;
    if (isLive && activeInventory && adminClient) {
      try {
        cleanupReport = await activeInventory.executeCleanup({ adminClient, failClosed: false });
      } catch (err) {
        cleanupReport = {
          status: 'CLEANUP_FAILED',
          error: err.message
        };
      }
    }
  }

  try {
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
        const dispatchPromise = Promise.resolve(
          mockDispatcher(item, {
            signal: controller.signal,
            projectRef: validatedRef,
            inventory: activeInventory,
            runContext: activeRunContext,
            testPassword: activeRunContext.testPassword,
            activeRefreshToken: activeRunContext.activeRefreshToken
          })
        );
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

    // Execute cleanup at end of test run (PRRT_kwDOVtCmZc66lo-q, R3-07, R4-02)
    await performCleanup();

    // In LIVE mode, cleanup failure must override probe success (R4-02)
    const cleanupSuccess = !isLive || (cleanupReport && cleanupReport.status === 'CLEANUP_VERIFIED_SUCCESS');
    if (isLive && !cleanupSuccess) {
      aborted = true;
      abortReason = `CLEANUP_FAILURE: Test run cleanup did not verify complete resource removal. Status: ${cleanupReport?.status || 'UNKNOWN'}. Residual users: ${cleanupReport?.residualUsers?.length || 0}, Residual resources: ${cleanupReport?.residualResources?.length || 0}. Error: ${cleanupReport?.error || 'Unverified cleanup'}`;
    }

    // Status is COMPLETED only if zero cases failed, all planned cases executed, and cleanup verified
    const allCasesExecuted = results.length === plan.plannedCases.length;
    const allPassed = !aborted && allCasesExecuted && cleanupSuccess && results.every(r => r.outcome && r.outcome.passed === true);

    return sanitizeData({
      status: allPassed ? 'COMPLETED' : 'HALTED_ON_FAILURE',
      mode: 'LIVE',
      projectRef: validatedRef,
      totalExecuted: results.length,
      totalExpected: plan.plannedCases.length,
      requestCount,
      aborted,
      abortReason: abortReason,
      cleanupReport: cleanupReport,
      inventorySummary: activeInventory.getSummary(),
      results: results
    });
  } finally {
    // Clear run-scoped credential state after execution (PRRT_kwDOVtCmZc66lOOP)
    activeRunContext.clear();
    // Ensure cleanup always executes even on unexpected exceptions (PRRT_kwDOVtCmZc66lo-q, R3-07)
    await performCleanup();
  }
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

    // Prohibit generic keys for LIVE TEMP testing to prevent accidental production key leakage (PRRT_kwDOVtCmZc66lq3W, R3-10)
    if (process.env.SUPABASE_ANON_KEY && !process.env.TIO_TEMP_ANON_KEY) {
      console.error('GENERIC_KEY_PROHIBITED: Generic SUPABASE_ANON_KEY is forbidden for LIVE TEMP testing. Set TIO_TEMP_ANON_KEY explicitly (R3-10).');
      process.exit(1);
    }
    if (process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.TIO_TEMP_SERVICE_ROLE_KEY) {
      console.error('GENERIC_KEY_PROHIBITED: Generic SUPABASE_SERVICE_ROLE_KEY is forbidden for LIVE TEMP testing. Set TIO_TEMP_SERVICE_ROLE_KEY explicitly (R3-10).');
      process.exit(1);
    }

    const anonKey = process.env.TIO_TEMP_ANON_KEY;
    if (!anonKey) {
      console.error('MISSING_HOSTED_CREDENTIALS: LIVE mode against TEMP project requires TIO_TEMP_ANON_KEY (R3-10). None found in environment.');
      process.exit(1);
    }

    const serviceRoleKey = process.env.TIO_TEMP_SERVICE_ROLE_KEY;

    // Validate project credential binding for anonKey and serviceRoleKey
    try {
      validateProjectCredentialBinding(anonKey, HARDCODED_TEMP_REF);
      if (serviceRoleKey) {
        validateProjectCredentialBinding(serviceRoleKey, HARDCODED_TEMP_REF);
      }
    } catch (err) {
      console.error('CREDENTIAL_BINDING_ERROR:', err.message);
      process.exit(1);
    }

    const inventory = new TestRunInventory();
    const runContext = createRunContext({
      testPassword: process.env.TASK06I_TEST_PASSWORD
    });

    const liveDispatcher = createHostedDispatcher({
      projectRef: HARDCODED_TEMP_REF,
      anonKey,
      serviceRoleKey,
      inventory,
      runContext
    });

    if (!serviceRoleKey) {
      console.error('MISSING_HOSTED_CREDENTIALS: LIVE mode against TEMP project strictly requires TIO_TEMP_SERVICE_ROLE_KEY to construct adminClient for resource cleanup and SESSION-02 (R4-02).');
      process.exit(1);
    }

    const adminClient = {
      async deleteUser(userId) {
        const res = await fetch(`https://${HARDCODED_TEMP_REF}.supabase.co/auth/v1/admin/users/${userId}`, {
          method: 'DELETE',
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`
          }
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          return { error: body?.msg || body?.message || `HTTP_${res.status}` };
        }
        return { data: { user: { id: userId } }, error: null };
      },
      async getUserById(userId) {
        const res = await fetch(`https://${HARDCODED_TEMP_REF}.supabase.co/auth/v1/admin/users/${userId}`, {
          method: 'GET',
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`
          }
        });
        if (res.status === 404) return { data: null, error: { message: 'User not found', status: 404 } };
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          return { data: null, error: body };
        }
        const data = await res.json();
        return { data, error: null };
      },
      async invalidateSession(sessionId) {
        const res = await fetch(`https://${HARDCODED_TEMP_REF}.supabase.co/auth/v1/admin/users/sessions/${sessionId}`, {
          method: 'DELETE',
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`
          }
        });
        if (res.status === 404) return { data: null, error: null };
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          return { error: body?.msg || body?.message || `HTTP_${res.status}` };
        }
        return { data: { id: sessionId }, error: null };
      },
      async signOut(sessionId) {
        return this.invalidateSession(sessionId);
      }
    };

    runHostedProbeRunner({
      projectRef: HARDCODED_TEMP_REF,
      argv,
      env: process.env,
      inventory,
      runContext,
      adminClient,
      mockDispatcher: liveDispatcher
    }).then(res => {
      console.log(`[HOSTED PROBE RUNNER] Mode: ${res.mode} | Status: ${res.status} | Project: ${res.projectRef} | Executed: ${res.totalExecuted}`);
      console.log(JSON.stringify(res, null, 2));
      if (res.status !== 'COMPLETED' || (res.cleanupReport && res.cleanupReport.status !== 'CLEANUP_VERIFIED_SUCCESS')) {
        process.exit(1);
      }
    }).catch(err => {
      console.error('CRITICAL_LIVE_RUNNER_ERROR:', err.message);
      process.exit(1);
    });
  }
}
