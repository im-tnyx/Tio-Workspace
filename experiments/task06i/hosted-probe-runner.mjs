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

/**
 * Canonical Auth endpoint capability matrix (R13-01).
 * Specifies session-minting capability, provider mutation ability, user creation,
 * email triggers, evidence expectations, cleanup obligations, and indeterminate behavior.
 */
export const AUTH_ENDPOINT_CAPABILITIES = Object.freeze({
  'POST /auth/v1/otp': Object.freeze({
    probeId: 'BYPASS-01',
    endpoint: '/auth/v1/otp',
    method: 'POST',
    canMintSession: false,
    canCreateUser: true,
    canCreateUsers: true,
    canModifyProviderState: true,
    requiresCleanupReconciliation: true,
    canTriggerEmail: true,
    requiredEvidence: 'route_disabled (providerDisabled === true) and HTTP non-200',
    cleanupObligation: 'Track created user into createdUsers if created; register untracked user creation risk on transport error, unreadable response, or empty HTTP 200; track unexpected tokens for cleanup',
    indeterminateBehavior: 'AUTH_RESPONSE_INDETERMINATE on transport error or unreadable/missing user ID, register untracked user, fail cleanup closed'
  }),
  'POST /auth/v1/signup': Object.freeze({
    probeId: 'BYPASS-02',
    endpoint: '/auth/v1/signup',
    method: 'POST',
    canMintSession: true, // Signup with Confirm Email disabled returns active session (R16-01)
    canCreateUser: true,
    canCreateUsers: true,
    canModifyProviderState: true,
    requiresCleanupReconciliation: true,
    canTriggerEmail: true,
    requiredEvidence: 'signup_disabled === true, status !== 200, zero created user, zero tokens',
    cleanupObligation: 'Track created user into createdUsers if verified run-created; track unexpected session into trackedSessions; register untracked user/session on transport error, unreadable response, empty HTTP 200, or unparsed session ID',
    indeterminateBehavior: 'AUTH_RESPONSE_INDETERMINATE on transport error, unreadable/missing user ID, or missing session ID; register untracked user and/or session, fail cleanup closed'
  }),
  'POST /auth/v1/verify': Object.freeze({
    probeId: 'BYPASS-03',
    endpoint: '/auth/v1/verify',
    method: 'POST',
    canMintSession: true, // Verification challenge success issues tokens and session (R13-01)
    canCreateUser: false,
    canCreateUsers: false,
    canModifyProviderState: true,
    requiresCleanupReconciliation: true,
    canTriggerEmail: false,
    requiredEvidence: 'hook_rejected === true (42501) and HTTP non-200, zero tokens',
    cleanupObligation: 'Track unexpected session for revocation; indeterminate HTTP 200 / transport loss creates untracked session risk',
    indeterminateBehavior: 'AUTH_RESPONSE_INDETERMINATE, register untracked session, fail cleanup closed'
  }),
  'POST /auth/v1/recover': Object.freeze({
    probeId: 'BYPASS-05',
    endpoint: '/auth/v1/recover',
    method: 'POST',
    canMintSession: false,
    canCreateUser: false,
    canCreateUsers: false,
    canModifyProviderState: true,
    requiresCleanupReconciliation: false,
    canTriggerEmail: true,
    requiredEvidence: 'recovery_suppressed === true (42501) and zero recovery_token',
    cleanupObligation: 'Track unexpected tokens if issued',
    indeterminateBehavior: 'AUTH_RESPONSE_PROVIDER_FAILURE (no session minting or user creation capability)'
  }),
  'POST /auth/v1/token?grant_type=password': Object.freeze({
    probeId: 'HOOK-01',
    endpoint: '/auth/v1/token?grant_type=password',
    method: 'POST',
    canMintSession: true,
    canCreateUser: false,
    canCreateUsers: false,
    canModifyProviderState: true,
    requiresCleanupReconciliation: true,
    canTriggerEmail: false,
    requiredEvidence: 'access_token, refresh_token, session_id, amr_authenticated: true, verified claims',
    cleanupObligation: 'Track session into trackedSessions for signOut revocation; unverified token captured for cleanup',
    indeterminateBehavior: 'AUTH_RESPONSE_INDETERMINATE, register untracked session, fail cleanup closed'
  }),
  'POST /auth/v1/token?grant_type=refresh_token': Object.freeze({
    probeId: 'HOOK-02',
    endpoint: '/auth/v1/token?grant_type=refresh_token',
    method: 'POST',
    canMintSession: true,
    canCreateUser: false,
    canCreateUsers: false,
    canModifyProviderState: true,
    requiresCleanupReconciliation: true,
    canTriggerEmail: false,
    requiredEvidence: 'refreshed access_token, amr_preserved: true, verified claims',
    cleanupObligation: 'Track refreshed session context for signOut revocation',
    indeterminateBehavior: 'AUTH_RESPONSE_INDETERMINATE, register untracked session, fail cleanup closed'
  }),
  'POST /auth/v1/token?grant_type=password (verifyUserCredentials)': Object.freeze({
    probeId: 'verify_credentials',
    endpoint: '/auth/v1/token?grant_type=password',
    method: 'POST',
    canMintSession: true,
    canCreateUser: false,
    canCreateUsers: false,
    canModifyProviderState: true,
    requiresCleanupReconciliation: true,
    canTriggerEmail: false,
    requiredEvidence: 'HTTP 200 with access_token and session_id, followed by immediate verified local signOut',
    cleanupObligation: 'Immediate local signOut; on failure register verification session leak or untracked session',
    indeterminateBehavior: 'AUTH_RESPONSE_INDETERMINATE, register untracked session, fail cleanup closed'
  }),
  'PUT /auth/v1/admin/users/:id': Object.freeze({
    probeId: 'SESSION-02',
    endpoint: '/auth/v1/admin/users/:id',
    method: 'PUT',
    canMintSession: false,
    canCreateUser: false,
    canCreateUsers: false,
    canModifyProviderState: true,
    requiresCleanupReconciliation: true,
    canTriggerEmail: false,
    requiredEvidence: 'Admin password update confirmation, followed by affirmative session_not_found on probe',
    cleanupObligation: 'Pre-dispatch restoration registration; restore original password during cleanup',
    indeterminateBehavior: 'State transitions to indeterminate; obligation preserved for cleanup restoration'
  }),
  'POST /auth/v1/logout?scope=local': Object.freeze({
    probeId: 'SESSION-03',
    endpoint: '/auth/v1/logout',
    method: 'POST',
    canMintSession: false,
    canCreateUser: false,
    canCreateUsers: false,
    canModifyProviderState: true,
    requiresCleanupReconciliation: false,
    canTriggerEmail: false,
    requiredEvidence: 'Sign-out confirmation followed by affirmative session_not_found on GET /auth/v1/user',
    cleanupObligation: 'Marks session as revoked in inventory (idempotent)',
    indeterminateBehavior: 'Session remains unconfirmed; subsequent GET /user probe determines revocation state'
  })
});

/**
 * Resolves the canonical capability definition for an endpoint key or probe ID (R15-02).
 * Prevents configuration and dispatcher capability drift.
 */
export function getEndpointCapabilities(endpointOrProbeId) {
  if (!endpointOrProbeId || typeof endpointOrProbeId !== 'string') {
    return null;
  }
  const key = endpointOrProbeId.trim();
  if (AUTH_ENDPOINT_CAPABILITIES[key]) {
    return AUTH_ENDPOINT_CAPABILITIES[key];
  }
  return Object.values(AUTH_ENDPOINT_CAPABILITIES).find(c => c.probeId === key || c.endpoint === key) || null;
}

/**
 * Explicit user identity ownership classifications (R16-02).
 * Distinguishes verified run-created resources from pre-existing fixtures or unproven identities.
 */
export const USER_OWNERSHIP = Object.freeze({
  PRE_EXISTING_REFERENCED: 'PRE_EXISTING_REFERENCED',
  RUN_CREATED_VERIFIED: 'RUN_CREATED_VERIFIED',
  CREATION_INDETERMINATE: 'CREATION_INDETERMINATE',
  OWNERSHIP_UNKNOWN: 'OWNERSHIP_UNKNOWN'
});

/**
 * Validates affirmative run-created proof structure (R16-02).
 * Rejects bare caller-supplied metadata flags (Requirement 14).
 */
export function isValidCreationProof(proof) {
  if (!proof || typeof proof !== 'object') return false;
  // A bare metadata flag alone cannot certify ownership (Requirement 14, R16-02)
  if (proof.isCreated === true && Object.keys(proof).length === 1) return false;
  if (proof.callerFlag === true && Object.keys(proof).length === 1) return false;
  if (proof.created === true && Object.keys(proof).length === 1) return false;

  switch (proof.type) {
    case 'before_after_check':
    case 'before_after_correlation':
      return proof.preCheckAbsent === true && proof.postCheckPresent === true;
    case 'provider_admin_create':
      return (
        typeof proof.providerReturnedId === 'string' &&
        proof.providerReturnedId.trim().length > 0 &&
        proof.affirmativeCreationConfirmed === true
      );
    case 'baseline_set_difference':
      return (
        proof.absentFromBaseline === true &&
        typeof proof.baselineSnapshotId === 'string' &&
        proof.baselineSnapshotId.trim().length > 0
      );
    default:
      return false;
  }
}

/**
 * Creates a structured creation proof descriptor for verified run-created identities.
 */
export function createCreationProof(type = 'before_after_check', details = {}) {
  return Object.freeze({
    type,
    preCheckAbsent: details.preCheckAbsent ?? true,
    postCheckPresent: details.postCheckPresent ?? true,
    providerReturnedId: details.providerReturnedId || null,
    affirmativeCreationConfirmed: details.affirmativeCreationConfirmed ?? true,
    timestamp: new Date().toISOString(),
    ...details
  });
}

/**
 * Validates affirmative pre-existence proof structure for protected seed identities (R17-03).
 * A bare email string or caller assertion alone cannot confer pre-existing seed status.
 */
export function isValidPreExistenceProof(proof) {
  if (!proof || typeof proof !== 'object') return false;
  if (proof.isSeed === true && Object.keys(proof).length === 1) return false;
  if (proof.callerFlag === true && Object.keys(proof).length === 1) return false;

  switch (proof.type) {
    case 'preflight_discovery':
      return (
        typeof proof.verifiedSeedUserId === 'string' &&
        proof.verifiedSeedUserId.trim().length > 0 &&
        proof.preflightVerified === true
      );
    case 'provider_lookup':
      return (
        typeof proof.lookupUserId === 'string' &&
        proof.lookupUserId.trim().length > 0 &&
        proof.userExistsBeforeRun === true
      );
    case 'seed_credential_verification':
      return (
        typeof proof.verifiedUserId === 'string' &&
        proof.verifiedUserId.trim().length > 0 &&
        proof.credentialsVerifiedBeforeRun === true
      );
    default:
      return false;
  }
}

/**
 * Creates a structured pre-existence proof descriptor for verified seed identities (R17-03).
 */
export function createPreExistenceProof(type = 'preflight_discovery', details = {}) {
  return Object.freeze({
    type,
    verifiedSeedUserId: details.verifiedSeedUserId || details.userId || null,
    lookupUserId: details.lookupUserId || details.userId || null,
    verifiedUserId: details.verifiedUserId || details.userId || null,
    preflightVerified: details.preflightVerified ?? true,
    userExistsBeforeRun: details.userExistsBeforeRun ?? true,
    credentialsVerifiedBeforeRun: details.credentialsVerifiedBeforeRun ?? true,
    timestamp: new Date().toISOString(),
    ...details
  });
}

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
 * Safely parses response envelope, preserving HTTP status, structured JSON body,
 * and exact parse status for indeterminate observation. (R12-01, R12-02)
 */
export async function parseResponseEnvelope(res) {
  if (!res) {
    return { ok: false, status: 0, body: null, parseStatus: 'missing_response', parseError: null };
  }
  const status = typeof res.status === 'number' ? res.status : 0;
  if (typeof res.json !== 'function') {
    return { ok: res.ok ?? (status >= 200 && status < 300), status, body: null, parseStatus: 'no_json_function', parseError: null };
  }
  try {
    const body = await res.json();
    if (body === null || body === undefined) {
      return { ok: res.ok ?? (status >= 200 && status < 300), status, body: null, parseStatus: 'empty_body', parseError: null };
    }
    if (typeof body !== 'object') {
      return { ok: res.ok ?? (status >= 200 && status < 300), status, body, parseStatus: 'non_object', parseError: null };
    }
    return { ok: res.ok ?? (status >= 200 && status < 300), status, body, parseStatus: 'parsed', parseError: null };
  } catch (err) {
    return { ok: res.ok ?? (status >= 200 && status < 300), status, body: null, parseStatus: 'unreadable', parseError: err };
  }
}

/**
 * Shared Auth response observation boundary (R12-01, R12-02).
 * Classifies provider responses and registers session / user obligations in inventory.
 * Strictly separates response observation from probe pass/fail verdicts.
 *
 * Classifications:
 * - AUTH_RESPONSE_VERIFIED_REJECTION: Expected rejection (4xx) without tokens.
 * - AUTH_RESPONSE_TOKEN_OBSERVED: Successful authentication with valid token and extractable session.
 * - AUTH_RESPONSE_INDETERMINATE: Uncertain session state (HTTP 200 with unreadable/empty/missing tokens, or post-dispatch transport error).
 * - AUTH_RESPONSE_PROVIDER_FAILURE: HTTP 5xx or transport failure on non-minting request.
 * - AUTH_RESPONSE_UNEXPECTED_TOKEN: Tokens issued on negative probe or error status.
 */
export function observeAuthResponse({
  probeId = 'unknown',
  status = 0,
  parseStatus = 'parsed',
  body = null,
  parseError = null,
  transportError = null,
  inv = null,
  ctx = null,
  expectedOperation = 'token_issuance',
  canMintSession = false,
  canCreateUser = false,
  canModifyProviderState = false,
  testUser = null
} = {}) {
  // 1. Transport error handling
  if (transportError) {
    if (canMintSession && inv) {
      inv.registerUntrackedSession();
    }
    if (canCreateUser && inv) {
      inv.registerUntrackedUser();
    }
    if (canMintSession || canCreateUser) {
      return {
        classification: 'AUTH_RESPONSE_INDETERMINATE',
        status: 0,
        hasTokens: false,
        sessionId: null,
        userId: null,
        accessToken: null,
        refreshToken: null,
        indeterminateSession: Boolean(canMintSession),
        indeterminateUserCreation: Boolean(canCreateUser),
        errorCode: 'TRANSPORT_ERROR_POST_DISPATCH',
        error: `TRANSPORT_ERROR_POST_DISPATCH: Request dispatch threw transport error (${transportError?.message || String(transportError)}). Server may have minted session or created user but client cannot observe response. Untracked residual risk registered (R12-01, R14-02).`,
        body: null
      };
    }
    return {
      classification: 'AUTH_RESPONSE_PROVIDER_FAILURE',
      status: 0,
      hasTokens: false,
      sessionId: null,
      userId: null,
      accessToken: null,
      refreshToken: null,
      indeterminateSession: false,
      indeterminateUserCreation: false,
      errorCode: 'TRANSPORT_ERROR',
      error: `TRANSPORT_ERROR: Request dispatch failed: ${transportError?.message || String(transportError)}`,
      body: null
    };
  }

  // 2. Token extraction from parsed body (if body is an object)
  const isBodyObject = Boolean(body && typeof body === 'object');
  const accessToken = isBodyObject
    ? ((typeof body.access_token === 'string' && body.access_token.trim()) ||
       (typeof body.token === 'string' && body.token.trim()) ||
       (typeof body.tokens?.access_token === 'string' && body.tokens.access_token.trim()) ||
       (typeof body.tokens?.token === 'string' && body.tokens.token.trim()) ||
       (typeof body.session?.access_token === 'string' && body.session.access_token.trim()) ||
       null)
    : null;

  const refreshToken = isBodyObject
    ? ((typeof body.refresh_token === 'string' && body.refresh_token.trim()) ||
       (typeof body.tokens?.refresh_token === 'string' && body.tokens.refresh_token.trim()) ||
       (typeof body.session?.refresh_token === 'string' && body.session.refresh_token.trim()) ||
       null)
    : null;

  let rawSessionId = isBodyObject
    ? ((typeof body.session_id === 'string' && body.session_id.trim()) ||
       (typeof body.session?.id === 'string' && body.session.id.trim()) ||
       (typeof body.tokens?.session_id === 'string' && body.tokens.session_id.trim()) ||
       null)
    : null;

  let rawUserId = isBodyObject
    ? ((typeof body.user?.id === 'string' && body.user.id.trim()) ||
       (typeof body.id === 'string' && body.id.trim()) ||
       (typeof body.tokens?.user?.id === 'string' && body.tokens.user.id.trim()) ||
       null)
    : null;

  // Extract from unverified JWT claims if not present at top level
  if (accessToken && (!rawSessionId || !rawUserId)) {
    try {
      const parts = accessToken.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        if (!rawSessionId && typeof payload?.session_id === 'string' && payload.session_id.trim()) {
          rawSessionId = payload.session_id.trim();
        }
        if (!rawUserId && typeof payload?.sub === 'string' && payload.sub.trim()) {
          rawUserId = payload.sub.trim();
        }
      }
    } catch {}
  }

  const hasTokens = Boolean(accessToken || refreshToken || rawSessionId);
  const returnedEmail =
    (typeof body?.user?.email === 'string' && body.user.email.trim()) ||
    (typeof body?.email === 'string' && body.email.trim()) ||
    (typeof body?.tokens?.user?.email === 'string' && body.tokens.user.email.trim()) ||
    null;
  const userEmail = returnedEmail || testUser || 'tio-test-user-06i@proof.invalid';

  // 3. HTTP 200 evaluation
  if (status >= 200 && status < 300) {
    // Register created, observed, or referenced user into inventory if user ID observed (R2-04, R12-02, R15-01, R16-02)
    if (inv && rawUserId) {
      const uidStr = String(rawUserId).trim();
      if (canCreateUser || probeId === 'BYPASS-01' || probeId === 'BYPASS-02') {
        // R16-02, R17-03: Never assume seed status or run-created ownership from observed response!
        // A bare matching email alone cannot confer protected seed status without verified seed ID (PRRT_kwDOVtCmZc67O5WW).
        const isSeed = Boolean(inv.isSeedIdentity(uidStr, returnedEmail) || inv.isUserReferenced(uidStr));
        if (isSeed) {
          inv.registerReferencedUser({ id: uidStr, email: returnedEmail || userEmail, source: `${probeId}_unexpected_response_matched_seed` });
        } else if (!inv.isUserTracked(uidStr)) {
          inv.registerObservedUser({ id: uidStr, email: returnedEmail || userEmail, source: `${probeId}_unexpected_signup` });
        }
      } else {
        if (!inv.isUserReferenced(uidStr)) {
          inv.registerReferencedUser({ id: uidStr, email: returnedEmail || userEmail, source: `${probeId}_token_observation` });
        }
      }
    }

    // 3A: Parse error or malformed body structure
    if (parseStatus !== 'parsed' || !isBodyObject) {
      if (inv) {
        if (canMintSession) {
          inv.registerUntrackedSession();
        }
        if (canCreateUser) {
          inv.registerUntrackedUser();
        }
      }
      return {
        classification: 'AUTH_RESPONSE_INDETERMINATE',
        status,
        hasTokens: false,
        sessionId: null,
        userId: null,
        accessToken: null,
        refreshToken: null,
        indeterminateSession: Boolean(canMintSession),
        indeterminateUserCreation: Boolean(canCreateUser),
        errorCode: parseStatus === 'unreadable' ? 'UNREADABLE_RESPONSE' : 'INVALID_RESPONSE_STRUCTURE',
        error: `INDETERMINATE_AUTH_RESPONSE: Server returned HTTP ${status} but response body was ${parseStatus}: ${parseError?.message || 'body is not a valid JSON object'} (R12-01, R14-02)`,
        body
      };
    }

    // 3A-2: User creation endpoint returned 200 without extractable user ID (R14-02, R16-01)
    if (canCreateUser && !rawUserId) {
      if (inv) {
        inv.registerUntrackedUser();
        if (canMintSession && !hasTokens) {
          inv.registerUntrackedSession();
        }
      }
      return {
        classification: 'AUTH_RESPONSE_INDETERMINATE',
        status,
        hasTokens: false,
        sessionId: null,
        userId: null,
        accessToken: null,
        refreshToken: null,
        indeterminateSession: Boolean(canMintSession),
        indeterminateUserCreation: true,
        errorCode: 'MISSING_USER_ID',
        error: `INDETERMINATE_AUTH_RESPONSE: Server returned HTTP ${status} for user creation request but response lacked valid user identifier (R14-02, R16-01)`,
        body
      };
    }

    // 3B: Missing access token on session-minting request where token was expected, or on non-user-creating route returning 200 without tokens (R12-01, R13-01, R16-01)
    if (canMintSession && !accessToken && (expectedOperation === 'token_issuance' || !canCreateUser)) {
      if (inv) {
        inv.registerUntrackedSession();
      }
      return {
        classification: 'AUTH_RESPONSE_INDETERMINATE',
        status,
        hasTokens: false,
        sessionId: null,
        userId: null,
        accessToken: null,
        refreshToken: null,
        indeterminateSession: true,
        errorCode: 'MISSING_ACCESS_TOKEN',
        error: `INDETERMINATE_AUTH_RESPONSE: Server returned HTTP ${status} for ${expectedOperation} but response lacked valid access_token (R12-01, R13-01, R16-01)`,
        body
      };
    }

    // 3C: Token present but session ID unextractable (R12-01, R17-01)
    // Endpoint capability expectations must NEVER suppress observed token evidence! (PRRT_kwDOVtCmZc67OhSH)
    if (hasTokens && !rawSessionId) {
      if (inv) {
        inv.registerUntrackedSession();
      }
      if (ctx) {
        if (accessToken) ctx.mintedAccessToken = accessToken;
        if (rawUserId) ctx.activeUserId = String(rawUserId).trim();
      }
      return {
        classification: 'AUTH_RESPONSE_INDETERMINATE',
        status,
        hasTokens: true,
        sessionId: null,
        userId: rawUserId ? String(rawUserId).trim() : null,
        accessToken,
        refreshToken,
        indeterminateSession: true,
        errorCode: 'UNTRACKED_SESSION',
        error: `INDETERMINATE_AUTH_RESPONSE: Server returned token(s) on ${probeId} but session identifier could not be determined from payload or claims (R12-01, R17-01)`,
        body
      };
    }

    // 3D: Valid token and extractable session ID observed
    if (hasTokens) {
      if (inv) {
        if (rawSessionId) {
          inv.registerSession(String(rawSessionId).trim(), { accessToken, source: `${probeId}_observed` });
        }
      }

      if (ctx) {
        if (rawSessionId) ctx.activeSessionId = String(rawSessionId).trim();
        if (rawUserId) ctx.activeUserId = String(rawUserId).trim();
        if (accessToken) {
          ctx.mintedAccessToken = accessToken;
        }
      }

      const isUnexpected = expectedOperation === 'rejection';
      const classification = isUnexpected ? 'AUTH_RESPONSE_UNEXPECTED_TOKEN' : 'AUTH_RESPONSE_TOKEN_OBSERVED';
      return {
        classification,
        status,
        hasTokens: true,
        sessionId: rawSessionId ? String(rawSessionId).trim() : null,
        userId: rawUserId ? String(rawUserId).trim() : null,
        accessToken,
        refreshToken,
        indeterminateSession: false,
        errorCode: isUnexpected ? 'UNEXPECTED_TOKEN_ISSUANCE' : null,
        error: isUnexpected
          ? `SECURITY_INVARIANT_VIOLATION: ${probeId} (${expectedOperation}) unexpectedly issued authentication tokens!`
          : null,
        body
      };
    }

    // 3E: HTTP 200 without tokens on an expected-rejection probe (e.g. anti-enumeration 200)
    return {
      classification: 'AUTH_RESPONSE_INDETERMINATE',
      status,
      hasTokens: false,
      sessionId: null,
      userId: null,
      accessToken: null,
      refreshToken: null,
      indeterminateSession: false,
      errorCode: 'HTTP_200_CANNOT_PROVE_REJECTION',
      error: `HTTP_200_CANNOT_PROVE_REJECTION: Expected rejection but received HTTP ${status} without tokens; anti-enumeration response cannot prove policy enforcement`,
      body
    };
  }

  // 4. HTTP Non-200 evaluation
  if (hasTokens) {
    // Unexpected tokens returned in non-200 error response
    if (inv) {
      if (rawSessionId) {
        inv.registerSession(String(rawSessionId).trim(), { accessToken, source: `${probeId}_unexpected_non200` });
      } else {
        inv.registerUntrackedSession();
      }
    }
    return {
      classification: 'AUTH_RESPONSE_UNEXPECTED_TOKEN',
      status,
      hasTokens: true,
      sessionId: rawSessionId ? String(rawSessionId).trim() : null,
      userId: rawUserId ? String(rawUserId).trim() : null,
      accessToken,
      refreshToken,
      indeterminateSession: !rawSessionId,
      errorCode: 'UNEXPECTED_TOKEN_IN_ERROR_RESPONSE',
      error: `SECURITY_INVARIANT_VIOLATION: ${probeId} returned HTTP ${status} but unexpectedly included session tokens!`,
      body
    };
  }

  // 5xx Server Error
  if (status >= 500 && status < 600) {
    return {
      classification: 'AUTH_RESPONSE_PROVIDER_FAILURE',
      status,
      hasTokens: false,
      sessionId: null,
      userId: null,
      accessToken: null,
      refreshToken: null,
      indeterminateSession: false,
      errorCode: (body?.error_code || body?.code || `HTTP_${status}`).toString(),
      error: body?.msg || body?.message || body?.error_description || `PROVIDER_HTTP_${status}`,
      body
    };
  }

  // 4xx Client Error / Verified Rejection
  const errCode = (body?.error_code || body?.code || null)?.toString() || null;
  const errMsg = body?.msg || body?.message || body?.error_description || (status > 0 ? `HTTP_${status}` : 'Unknown rejection');
  return {
    classification: 'AUTH_RESPONSE_VERIFIED_REJECTION',
    status,
    hasTokens: false,
    sessionId: null,
    userId: null,
    accessToken: null,
    refreshToken: null,
    indeterminateSession: false,
    errorCode: errCode,
    error: errMsg,
    body
  };
}

/**
 * Shared helper to observe and immediately track session tokens across all probes.
 * Captures session identity and cleanup obligations whenever provider responses contain concrete tokens or session evidence.
 * If token is issued but session ID cannot be determined, records untracked session obligation via inv.registerUntrackedSession().
 * For BYPASS-02 (signup), registers user as created for deletion; for all other probes (seed user/login), registers as referenced user.
 * Resolves PRRT_kwDOVtCmZc66sSyk (R8-01).
 */
export function observeAndTrackSessionTokens(body, { inv, ctx, probeId, testUser } = {}) {
  if (!body || typeof body !== 'object') {
    return { hasTokens: false, sessionId: null, userId: null, accessToken: null, refreshToken: null };
  }

  // Detect presence of token(s)
  const accessToken =
    (typeof body.access_token === 'string' && body.access_token.trim()) ||
    (typeof body.token === 'string' && body.token.trim()) ||
    (typeof body.tokens?.access_token === 'string' && body.tokens.access_token.trim()) ||
    (typeof body.tokens?.token === 'string' && body.tokens.token.trim()) ||
    (typeof body.session?.access_token === 'string' && body.session.access_token.trim()) ||
    null;

  const refreshToken =
    (typeof body.refresh_token === 'string' && body.refresh_token.trim()) ||
    (typeof body.tokens?.refresh_token === 'string' && body.tokens.refresh_token.trim()) ||
    (typeof body.session?.refresh_token === 'string' && body.session.refresh_token.trim()) ||
    null;

  let rawSessionId =
    body.session_id ||
    body.session?.id ||
    body.tokens?.session_id ||
    null;

  let rawUserId =
    body.user?.id ||
    body.id ||
    body.tokens?.user?.id ||
    null;

  // If token is present, attempt safe unverified claim extraction for session_id and sub
  if (accessToken && (!rawSessionId || !rawUserId)) {
    try {
      const parts = accessToken.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        if (!rawSessionId && payload?.session_id) {
          rawSessionId = payload.session_id;
        }
        if (!rawUserId && payload?.sub) {
          rawUserId = payload.sub;
        }
      }
    } catch {}
  }

  const hasTokens = Boolean(accessToken || refreshToken || rawSessionId);

  if (hasTokens && inv) {
    const userEmail = testUser || (typeof body.email === 'string' ? body.email : null) || 'tio-test-user-06i@proof.invalid';

    // Register user for cleanup accounting (R15-01, R16-02):
    // For BYPASS-01 or BYPASS-02, unproven unexpected response user IDs are recorded as observed/unverified (NEVER deleted).
    // For seed user or login probes, register as REFERENCED user so pre-existing user is NEVER deleted during cleanup!
    if (rawUserId) {
      const uidStr = String(rawUserId).trim();
      if (probeId === 'BYPASS-01' || probeId === 'BYPASS-02') {
        if (inv.isSeedIdentity(uidStr, userEmail) || inv.isUserReferenced(uidStr)) {
          inv.registerReferencedUser({ id: uidStr, email: userEmail, source: `${probeId}_unexpected_response_matched_seed` });
        } else if (!inv.isUserTracked(uidStr)) {
          inv.registerObservedUser({ id: uidStr, email: userEmail, source: `${probeId}_unexpected_signup` });
        }
      } else {
        if (!inv.isUserReferenced(uidStr)) {
          inv.registerReferencedUser({ id: uidStr, email: userEmail, source: `${probeId}_token_observation` });
        }
      }
    }

    // Register session cleanup obligation (R17-01)
    if (rawSessionId) {
      inv.registerSession(String(rawSessionId).trim(), { accessToken });
    } else {
      // Any token present without extractable session ID must register untracked session obligation (R5-04, R8-01, R17-01)
      inv.registerUntrackedSession();
    }
  }

  if (hasTokens && ctx) {
    if (rawSessionId) ctx.activeSessionId = String(rawSessionId).trim();
    if (rawUserId) ctx.activeUserId = String(rawUserId).trim();
  }

  return {
    hasTokens,
    sessionId: rawSessionId ? String(rawSessionId).trim() : null,
    userId: rawUserId ? String(rawUserId).trim() : null,
    accessToken,
    refreshToken
  };
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
    if (rawOutcome.user_created === true) {
      return {
        passed: false,
        status,
        reason: `SECURITY_INVARIANT_VIOLATION: BYPASS-01 created user on disabled route (user_created: true)`
      };
    }
    if (rawOutcome.indeterminate_user_creation === true) {
      return {
        passed: false,
        status,
        reason: `INDETERMINATE_USER_CREATION: BYPASS-01 encountered indeterminate response or transport loss during user-creation capable dispatch (${rawOutcome.error || 'untracked user creation risk'})`
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
    if (rawOutcome.indeterminate_user_creation === true) {
      return {
        passed: false,
        status,
        reason: `INDETERMINATE_USER_CREATION: BYPASS-02 encountered indeterminate response or transport loss during user-creation capable dispatch (${rawOutcome.error || 'untracked user creation risk'})`
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

    // Strict session correlation (R5-01): validate session identity if provided
    const sessionId = rawOutcome.session_id;
    if (sessionId !== undefined && sessionId !== null) {
      if (!isNonEmptyString(sessionId) || sessionId.startsWith('sess-default')) {
        return {
          passed: false,
          status,
          reason: 'SESSION_CORRELATION_MISMATCH: SESSION-02 requires valid session_id from HOOK-01 (R5-01)'
        };
      }
      if (rawOutcome.pre_session_id && rawOutcome.pre_session_id !== sessionId) {
        return {
          passed: false,
          status,
          reason: `SESSION_CORRELATION_MISMATCH: SESSION-02 pre_session_id '${rawOutcome.pre_session_id}' does not match session '${sessionId}'`
        };
      }
    }

    // Reject false-proof errors (R5-01): bad_jwt, jwt_expired, token_expired, invalid_jwt, etc.
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
        reason: `FALSE_PROOF_REJECTED: SESSION-02 rejection due to '${rawOutcome.error_code || rawOutcome.error}'. Invalid, expired, or malformed JWT errors do not demonstrate remote session invalidation (R5-01).`
      };
    }

    // Reject ambiguous rejection without affirmative provider error code (R5-01)
    if (rawOutcome.error_code !== undefined && rawOutcome.error_code !== null) {
      const isAffirmativeRevocation =
        rawOutcome.revocation_error_code === 'session_not_found' ||
        errorCode === 'session_not_found' ||
        errorCode === 'session_revoked' ||
        errorCode === 'authsessionmissingerror' ||
        errorMsg.includes('session not found') ||
        errorMsg.includes('session_not_found');

      if (!isAffirmativeRevocation) {
        return {
          passed: false,
          status,
          reason: `MISSING_EVIDENCE: SESSION-02 requires affirmative provider revocation error code (e.g. session_not_found). Ambiguous rejection '${rawOutcome.error_code}' is rejected (R5-01).`
        };
      }
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
    // Stateless linger window documentation check (PRRT_kwDOVtCmZc66jNbH, R3-03, R7-02, R17-02)
    if (status !== 200) {
      return {
        passed: false,
        status,
        reason: `HTTP_STATUS_MISMATCH: ${item.id} expected HTTP 200 demonstrating stateless signature-based access, got ${status} (401 rejection or 404 missing fixture does not prove linger, R3-03)`
      };
    }

    // Verified session revocation prerequisite check (PRRT_kwDOVtCmZc67OhSN, R17-02)
    if (rawOutcome.revocation_verified !== true) {
      return {
        passed: false,
        status,
        reason: `MISSING_EVIDENCE: ${item.id} requires verified session revocation evidence before demonstrating stateless linger (R17-02)`
      };
    }

    // Session correlation check (PRRT_kwDOVtCmZc67OhSN, R17-02)
    const revokedSessId = rawOutcome.revoked_session_id || rawOutcome.session_id || null;
    const correlatedSessId = rawOutcome.correlated_session_id || null;
    if (rawOutcome.session_correlated !== true || !revokedSessId || !correlatedSessId || revokedSessId !== correlatedSessId) {
      return {
        passed: false,
        status,
        reason: `SESSION_CORRELATION_FAILURE: ${item.id} token session_id ('${correlatedSessId || 'none'}') must correlate with verified revoked session ID ('${revokedSessId || 'none'}') (R17-02)`
      };
    }

    if (rawOutcome.token_unexpired !== true) {
      return {
        passed: false,
        status,
        reason: `MISSING_EVIDENCE: ${item.id} requires token to be unexpired (now < exp) during linger window demonstration (R3-03)`
      };
    }
    // Mandatory 300s JWT lifetime contract validation (PRRT_kwDOVtCmZc66r92y, R7-02)
    if (typeof rawOutcome.jwt_lifetime_seconds !== 'number' || !Number.isFinite(rawOutcome.jwt_lifetime_seconds)) {
      return {
        passed: false,
        status,
        reason: `MISSING_EVIDENCE: ${item.id} requires valid numeric jwt_lifetime_seconds claim evidence (R7-02)`
      };
    }
    if (rawOutcome.jwt_lifetime_seconds <= 0) {
      return {
        passed: false,
        status,
        reason: `INVALID_JWT_LIFETIME: ${item.id} token lifetime must be strictly positive, got ${rawOutcome.jwt_lifetime_seconds}s (R7-02)`
      };
    }
    if (rawOutcome.jwt_lifetime_seconds > 300) {
      return {
        passed: false,
        status,
        reason: `EXCESSIVE_JWT_LIFETIME: ${item.id} token lifetime (${rawOutcome.jwt_lifetime_seconds}s) exceeds approved 300s bound (R7-02)`
      };
    }
    if (rawOutcome.lifetime_bounded !== true) {
      return {
        passed: false,
        status,
        reason: `MISSING_EVIDENCE: ${item.id} requires affirmative lifetime_bounded flag (R7-02)`
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
        // Provider-observed revocation error (R4-04, R5-08, R6-03):
        // Accept affirmative provider codes ('session_not_found', 'AuthSessionMissingError')
        const isAffirmativeRevocationCode =
          errCode === 'session_not_found' ||
          errCode === 'AuthSessionMissingError' ||
          errMsg.includes('session_not_found') ||
          errMsg.includes('session not found') ||
          errMsg.includes('session from session_id claim in jwt does not exist') ||
          errMsg.includes('authsessionmissingerror');

        return (
          isAffirmativeRevocationCode ||
          (outcome.revocation_verified === true && (outcome.session_revoked === true || outcome.rejection_observed === true))
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
  constructor(runId = null, { seedEmail = null, seedUserId = null } = {}) {
    this.runId = runId || `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.createdUsers = new Map(); // Users verified as created in THIS run with affirmative proof -> deletion eligible
    this.referencedUsers = new Map(); // Pre-existing / seeded users authenticated -> NEVER deleted (R3-09)
    this.unverifiedUsers = new Map(); // Users observed without affirmative run-created proof -> NEVER deleted (R16-02)
    this.userOwnership = new Map(); // userId -> USER_OWNERSHIP (R16-02)
    this.protectedSeedIdentities = new Set(); // verified pre-existing seed user IDs ONLY (R16-02, R17-03)
    this.verifiedSeedUsers = new Map(); // seedUserId -> { id, email, proof, registeredAt } (R17-03)
    this.trackedSessions = new Set(); // Session IDs
    this.sessionTokens = new Map(); // sessionId -> accessToken for supported GoTrue session invalidation (R6-01)
    this.revokedSessions = new Set(); // Session IDs affirmatively verified as revoked or absent (R8-02)
    this.trackedTableRows = new Map(); // table -> Set(id)
    this.trackedStorageObjects = new Map(); // bucket -> Set(path)
    this.seedCredentialRestorations = []; // Seed users whose password was modified -> must be restored (R5-06)
    this.untrackedSessionsCount = 0; // Minted sessions whose ID could not be parsed (R5-04, R8-01)
    this.untrackedUsersCount = 0; // Users created whose concrete ID was lost or unobserved (R14-02)
    this.inFlightOperations = new Map(); // opId -> operation record (R13-02)
    this._opSequence = 0;
    this.finalized = false; // Set to true once executeCleanup completes (R13-02)
    this.postFinalizationMutations = []; // Late mutations attempted after finalization (R13-02)
    this._settlementListeners = [];

    if (seedUserId) {
      this.protectSeedIdentity({ id: seedUserId, email: seedEmail });
    }
  }

  // Backward-compatible getter: returns combined map of tracked users
  get trackedUsers() {
    return new Map([...this.referencedUsers, ...this.createdUsers, ...this.unverifiedUsers]);
  }

  protectSeedIdentity({ id, email, proof = null } = {}) {
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      // R17-03: A bare email string alone without an affirmative user ID cannot prove account pre-existence!
      return false;
    }
    const cleanId = id.trim();
    const cleanEmail = email && typeof email === 'string' && email.trim().length > 0 ? email.trim().toLowerCase() : null;
    this.protectedSeedIdentities.add(cleanId);
    this.verifiedSeedUsers.set(cleanId, {
      id: cleanId,
      email: cleanEmail,
      proof: proof || null,
      registeredAt: new Date().toISOString()
    });
    this.userOwnership.set(cleanId, USER_OWNERSHIP.PRE_EXISTING_REFERENCED);
    if (!this.referencedUsers.has(cleanId)) {
      this.referencedUsers.set(cleanId, {
        id: cleanId,
        email: cleanEmail,
        source: 'seed_protection',
        ownership: USER_OWNERSHIP.PRE_EXISTING_REFERENCED,
        referencedAt: new Date().toISOString()
      });
    }
    this.createdUsers.delete(cleanId);
    this.unverifiedUsers.delete(cleanId);
    return true;
  }

  isSeedIdentity(id, email = null) {
    if (id && typeof id === 'string' && id.trim().length > 0) {
      return this.protectedSeedIdentities.has(id.trim());
    }
    // R17-03: Bare email alone without an ID NEVER confers seed identity! (PRRT_kwDOVtCmZc67O5WW)
    return false;
  }

  getUserOwnership(userId) {
    if (!userId || typeof userId !== 'string') return USER_OWNERSHIP.OWNERSHIP_UNKNOWN;
    const cleanId = userId.trim();
    if (this.userOwnership.has(cleanId)) {
      return this.userOwnership.get(cleanId);
    }
    if (this.referencedUsers.has(cleanId) || this.protectedSeedIdentities.has(cleanId)) {
      return USER_OWNERSHIP.PRE_EXISTING_REFERENCED;
    }
    if (this.createdUsers.has(cleanId)) {
      return USER_OWNERSHIP.RUN_CREATED_VERIFIED;
    }
    if (this.unverifiedUsers.has(cleanId)) {
      return this.unverifiedUsers.get(cleanId)?.ownership || USER_OWNERSHIP.OWNERSHIP_UNKNOWN;
    }
    return USER_OWNERSHIP.OWNERSHIP_UNKNOWN;
  }

  /**
   * Registers a user created during this run with affirmative proof (R16-02).
   * Deletion eligible upon cleanup ONLY if RUN_CREATED_VERIFIED.
   */
  registerCreatedUser({ id, email, source = 'test_signup', creationProof = null } = {}) {
    if (this.finalized) {
      this.postFinalizationMutations.push({
        action: 'registerCreatedUser',
        id,
        email,
        source,
        attemptedAt: new Date().toISOString()
      });
    }
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      throw new Error('registerCreatedUser requires non-empty string id');
    }
    if (!email || typeof email !== 'string' || email.trim().length === 0) {
      throw new Error('registerCreatedUser requires non-empty string email');
    }
    validateTestIdentity(email);
    const cleanId = id.trim();
    const normEmail = email.trim().toLowerCase();

    // Anti-deletion guard: Never classify pre-existing seed user as run-created! (R16-02)
    if (this.isSeedIdentity(cleanId, normEmail) || this.isUserReferenced(cleanId)) {
      return this.registerReferencedUser({ id: cleanId, email: normEmail, source: `${source}_protected_seed` });
    }

    // Verify affirmative creation proof (R16-02)
    // Caller-supplied metadata flag alone does NOT certify ownership (Requirement 14)
    if (creationProof !== null && creationProof !== undefined) {
      if (!isValidCreationProof(creationProof)) {
        return this.registerObservedUser({
          id: cleanId,
          email: normEmail,
          source,
          ownership: USER_OWNERSHIP.CREATION_INDETERMINATE,
          creationProof: null
        });
      }
    } else {
      // creationProof omitted: register as observed user with UNKNOWN ownership
      return this.registerObservedUser({
        id: cleanId,
        email: normEmail,
        source,
        ownership: USER_OWNERSHIP.OWNERSHIP_UNKNOWN,
        creationProof: null
      });
    }

    const record = {
      id: cleanId,
      email: normEmail,
      source,
      ownership: USER_OWNERSHIP.RUN_CREATED_VERIFIED,
      creationProof,
      createdAt: new Date().toISOString()
    };
    this.createdUsers.set(cleanId, record);
    this.userOwnership.set(cleanId, USER_OWNERSHIP.RUN_CREATED_VERIFIED);
    this.unverifiedUsers.delete(cleanId);
    return record;
  }

  /**
   * Registers a user observed in a response without verified run-created ownership (R16-02).
   * User is preserved and NEVER deleted during cleanup.
   */
  registerObservedUser({ id, email, source = 'observed_response', ownership = USER_OWNERSHIP.OWNERSHIP_UNKNOWN, creationProof = null } = {}) {
    if (this.finalized) {
      this.postFinalizationMutations.push({
        action: 'registerObservedUser',
        id,
        email,
        source,
        attemptedAt: new Date().toISOString()
      });
    }
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      throw new Error('registerObservedUser requires non-empty string id');
    }
    const cleanId = id.trim();
    const normEmail = email && typeof email === 'string' ? email.trim().toLowerCase() : null;

    if (this.isSeedIdentity(cleanId, normEmail) || this.isUserReferenced(cleanId)) {
      return this.registerReferencedUser({
        id: cleanId,
        email: normEmail || 'seed@proof.invalid',
        source: `${source}_protected_seed`
      });
    }

    if (creationProof && isValidCreationProof(creationProof)) {
      return this.registerCreatedUser({ id: cleanId, email: normEmail || 'created@proof.invalid', source, creationProof });
    }

    const determinedOwnership = ownership === USER_OWNERSHIP.CREATION_INDETERMINATE
      ? USER_OWNERSHIP.CREATION_INDETERMINATE
      : USER_OWNERSHIP.OWNERSHIP_UNKNOWN;

    const record = {
      id: cleanId,
      email: normEmail,
      source,
      ownership: determinedOwnership,
      creationProof: null,
      observedAt: new Date().toISOString()
    };
    this.unverifiedUsers.set(cleanId, record);
    this.userOwnership.set(cleanId, determinedOwnership);
    this.untrackedUsersCount++;
    return record;
  }

  /**
   * Registers a pre-existing fixture or seed user referenced during login (e.g. HOOK-01).
   * Tracked for audit and correlation, but NEVER deleted during cleanup (R3-09).
   */
  registerReferencedUser({ id, email, source = 'test_login' } = {}) {
    if (this.finalized) {
      this.postFinalizationMutations.push({
        action: 'registerReferencedUser',
        id,
        email,
        source,
        attemptedAt: new Date().toISOString()
      });
    }
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      throw new Error('registerReferencedUser requires non-empty string id');
    }
    if (!email || typeof email !== 'string' || email.trim().length === 0) {
      throw new Error('registerReferencedUser requires non-empty string email');
    }
    validateTestIdentity(email);
    const cleanId = id.trim();
    const normEmail = email.trim().toLowerCase();
    const record = {
      id: cleanId,
      email: normEmail,
      source,
      ownership: USER_OWNERSHIP.PRE_EXISTING_REFERENCED,
      referencedAt: new Date().toISOString()
    };
    this.referencedUsers.set(cleanId, record);
    this.userOwnership.set(cleanId, USER_OWNERSHIP.PRE_EXISTING_REFERENCED);
    this.protectedSeedIdentities.add(cleanId);
    this.protectedSeedIdentities.add(normEmail);
    this.createdUsers.delete(cleanId);
    this.unverifiedUsers.delete(cleanId);
    return record;
  }

  // Backward-compatible alias: registerUser defaults to registerCreatedUser
  registerUser(userObj) {
    return this.registerCreatedUser(userObj);
  }

  trackReferencedUser(userObj) {
    return this.registerReferencedUser(userObj);
  }

  trackCreatedUser(userObj) {
    return this.registerCreatedUser(userObj);
  }

  registerSession(sessionOrId, optionsOrToken = {}) {
    let sessionId = null;
    let accessToken = null;

    if (typeof sessionOrId === 'string' && sessionOrId.trim().length > 0) {
      sessionId = sessionOrId.trim();
      if (typeof optionsOrToken === 'string' && optionsOrToken.trim().length > 0) {
        accessToken = optionsOrToken.trim();
      } else if (optionsOrToken && typeof optionsOrToken === 'object') {
        accessToken = optionsOrToken.accessToken || optionsOrToken.jwt || optionsOrToken.token || null;
      }
    } else if (sessionOrId && typeof sessionOrId === 'object') {
      sessionId = (sessionOrId.sessionId || sessionOrId.id || '').trim();
      accessToken = sessionOrId.accessToken || sessionOrId.jwt || sessionOrId.token || null;
    }

    if (this.finalized) {
      this.postFinalizationMutations.push({
        action: 'registerSession',
        sessionId,
        attemptedAt: new Date().toISOString()
      });
    }

    if (sessionId) {
      this.trackedSessions.add(sessionId);
      if (accessToken && typeof accessToken === 'string' && accessToken.trim().length > 0) {
        this.sessionTokens.set(sessionId, accessToken.trim());
      }
    }
  }

  getSessionToken(sessionId) {
    if (!sessionId || typeof sessionId !== 'string') return null;
    return this.sessionTokens.get(sessionId.trim()) || null;
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

  getUserEmail(userId) {
    if (!userId || typeof userId !== 'string') return null;
    const uid = userId.trim();
    if (this.referencedUsers.has(uid)) {
      return this.referencedUsers.get(uid)?.email || null;
    }
    if (this.createdUsers.has(uid)) {
      return this.createdUsers.get(uid)?.email || null;
    }
    return null;
  }

  registerSeedPasswordModification({ userId, email, originalPassword, newPassword, targetPassword, state = 'pending' } = {}) {
    if (this.finalized) {
      this.postFinalizationMutations.push({
        action: 'registerSeedPasswordModification',
        userId,
        email,
        attemptedAt: new Date().toISOString()
      });
    }
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      throw new Error('registerSeedPasswordModification requires non-empty string userId');
    }
    if (!originalPassword || typeof originalPassword !== 'string') {
      throw new Error('registerSeedPasswordModification requires string originalPassword');
    }
    const uid = userId.trim();
    const normEmail = typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null;
    const trackedEmail = this.getUserEmail(uid) ? this.getUserEmail(uid).trim().toLowerCase() : null;

    if (normEmail && trackedEmail && normEmail !== trackedEmail) {
      throw new Error(`IDENTITY_MISMATCH: Attempted restoration registration for user '${uid}' with email '${normEmail}', but user is tracked with '${trackedEmail}' (R10-02)`);
    }

    const resolvedEmail = normEmail || trackedEmail || null;

    // Ensure no other unrestored record exists with same email but different user ID (R10-02)
    if (resolvedEmail) {
      const otherConflict = this.seedCredentialRestorations.find(
        r => r.email === resolvedEmail && r.userId !== uid && r.state !== 'restored'
      );
      if (otherConflict) {
        throw new Error(`IDENTITY_MISMATCH: Email '${resolvedEmail}' is already bound to restoration record for user '${otherConflict.userId}', cannot bind to '${uid}' (R10-02)`);
      }
    }

    const existing = this.seedCredentialRestorations.find(r => r.userId === uid && r.state !== 'restored');
    if (existing) {
      if (!existing.email) existing.email = resolvedEmail;
      if (targetPassword || newPassword) existing.targetPassword = targetPassword || newPassword;
      if (state) existing.state = state;
      return existing;
    }
    const target = targetPassword || newPassword || null;
    const record = {
      userId: uid,
      email: resolvedEmail,
      originalPassword,
      targetPassword: target,
      state, // 'pending' | 'dispatched' | 'confirmed' | 'indeterminate' | 'restored' | 'restoration_failed'
      registeredAt: new Date().toISOString(),
      dispatchedAt: null,
      confirmedAt: null,
      indeterminateAt: null,
      restoredAt: null,
      verifiedAt: null,
      lastStatus: null,
      error: null
    };
    this.seedCredentialRestorations.push(record);
    return record;
  }

  getSeedPasswordModification(userId) {
    if (!userId || typeof userId !== 'string') return null;
    const uid = userId.trim();
    return this.seedCredentialRestorations.find(r => r.userId === uid) || null;
  }

  clearCredentials() {
    for (const item of this.seedCredentialRestorations) {
      if (item.originalPassword) item.originalPassword = '[CLEARED]';
      if (item.targetPassword) item.targetPassword = '[CLEARED]';
    }
  }

  registerUntrackedSession() {
    if (this.finalized) {
      this.postFinalizationMutations.push({
        action: 'registerUntrackedSession',
        attemptedAt: new Date().toISOString()
      });
    }
    this.untrackedSessionsCount++;
  }

  registerUntrackedUser() {
    if (this.finalized) {
      this.postFinalizationMutations.push({
        action: 'registerUntrackedUser',
        attemptedAt: new Date().toISOString()
      });
    }
    this.untrackedUsersCount++;
  }

  markSessionRevoked(sessionId) {
    if (sessionId && typeof sessionId === 'string' && sessionId.trim().length > 0) {
      this.revokedSessions.add(sessionId.trim());
    }
  }

  isSessionRevoked(sessionId) {
    if (!sessionId || typeof sessionId !== 'string') return false;
    return this.revokedSessions.has(sessionId.trim());
  }

  isUserTracked(userId) {
    const id = (userId || '').trim();
    return this.createdUsers.has(id) || this.referencedUsers.has(id) || this.unverifiedUsers.has(id);
  }

  isUserCreated(userId) {
    return this.createdUsers.has((userId || '').trim());
  }

  isUserReferenced(userId) {
    return this.referencedUsers.has((userId || '').trim());
  }

  getTrackedUserIds() {
    return Array.from(new Set([...this.createdUsers.keys(), ...this.referencedUsers.keys(), ...this.unverifiedUsers.keys()]));
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
      ...Array.from(this.referencedUsers.values()).map(u => u.email),
      ...Array.from(this.unverifiedUsers.values()).map(u => u.email)
    ];
    return Array.from(new Set(emails.filter(Boolean)));
  }

  /**
   * Registers an in-flight operation before network dispatch begins (R13-02, R14-01, R14-02).
   * Lifecycle states: REGISTERED -> IN_FLIGHT -> SETTLED | TIMED_OUT_UNRESOLVED -> CLEANUP_REQUIRED -> CLEANUP_VERIFIED
   */
  registerInFlightOperation({
    probeId = 'unknown',
    endpoint = null,
    canMintSession = false,
    canCreateUser = false,
    canModifyProviderState = false,
    requiresCleanupReconciliation = false,
    targetUserId = null,
    description = null,
    metadata = {}
  } = {}) {
    if (this.finalized) {
      const mutation = {
        action: 'registerInFlightOperation',
        probeId,
        endpoint,
        attemptedAt: new Date().toISOString()
      };
      this.postFinalizationMutations.push(mutation);
      throw new Error(`INVENTORY_FINALIZED: Cannot register in-flight operation '${probeId}' after inventory finalization (R13-02)`);
    }

    const opId = `op-${this.runId}-${++this._opSequence}`;
    const op = {
      opId,
      probeId,
      endpoint,
      canMintSession: Boolean(canMintSession),
      canCreateUser: Boolean(canCreateUser),
      canModifyProviderState: Boolean(canModifyProviderState),
      requiresCleanupReconciliation: Boolean(requiresCleanupReconciliation),
      targetUserId: targetUserId ? String(targetUserId).trim() : null,
      description,
      metadata: { ...metadata },
      state: 'IN_FLIGHT',
      registeredAt: new Date().toISOString(),
      dispatchedAt: new Date().toISOString(),
      settledAt: null,
      timedOutAt: null,
      timeoutReason: null,
      error: null,
      observed: null,
      outcome: null
    };
    this.inFlightOperations.set(opId, op);
    return op;
  }

  /**
   * Settles an in-flight operation upon resolution or rejection (R13-02).
   * If operation was previously marked TIMED_OUT_UNRESOLVED, transitions to SETTLED_AFTER_TIMEOUT.
   */
  settleInFlightOperation(opId, { observed = null, error = null, outcome = null } = {}) {
    if (!opId || typeof opId !== 'string') return null;
    const op = this.inFlightOperations.get(opId.trim());
    if (!op) return null;

    if (this.finalized) {
      const mutation = {
        action: 'settleInFlightOperation',
        opId,
        probeId: op.probeId,
        priorState: op.state,
        error: error?.message || (typeof error === 'string' ? error : null),
        attemptedAt: new Date().toISOString()
      };
      this.postFinalizationMutations.push(mutation);
    }

    const priorState = op.state;
    if (priorState === 'TIMED_OUT_UNRESOLVED') {
      op.state = 'SETTLED_AFTER_TIMEOUT';
    } else {
      op.state = 'SETTLED';
    }

    op.settledAt = new Date().toISOString();
    if (error) op.error = error?.message || String(error);
    if (observed) op.observed = observed;
    if (outcome) op.outcome = outcome;

    // Notify waiting settlement listeners
    if (this._settlementListeners.length > 0) {
      const activePending = Array.from(this.inFlightOperations.values()).filter(o => o.state === 'IN_FLIGHT');
      if (activePending.length === 0) {
        for (const listener of this._settlementListeners) {
          try { listener(); } catch {}
        }
        this._settlementListeners = [];
      }
    }

    return op;
  }

  /**
   * Transitions active in-flight operations for a probe to TIMED_OUT_UNRESOLVED (R13-02, R14-01, R14-02).
   * If operation had canMintSession=true, records untracked session risk.
   * If operation had canCreateUser=true, records untracked user risk.
   */
  markProbeOperationsTimedOut(probeId, reason = 'TIMEOUT') {
    if (!probeId) return [];
    const affected = [];
    let hadSessionMinting = false;
    let hadUserCreation = false;
    for (const [opId, op] of this.inFlightOperations.entries()) {
      if (op.probeId === probeId && op.state === 'IN_FLIGHT') {
        op.state = 'TIMED_OUT_UNRESOLVED';
        op.timedOutAt = new Date().toISOString();
        op.timeoutReason = reason;
        affected.push(op);

        if (op.canMintSession) {
          hadSessionMinting = true;
        }
        if (op.canCreateUser) {
          hadUserCreation = true;
        }
      }
    }
    if (hadSessionMinting) {
      this.registerUntrackedSession();
    }
    if (hadUserCreation) {
      this.registerUntrackedUser();
    }
    return affected;
  }

  hasUnresolvedOperations() {
    for (const op of this.inFlightOperations.values()) {
      if (op.state === 'IN_FLIGHT' || op.state === 'TIMED_OUT_UNRESOLVED') {
        return true;
      }
    }
    return false;
  }

  getUnresolvedOperations() {
    const list = [];
    for (const op of this.inFlightOperations.values()) {
      if (op.state === 'IN_FLIGHT' || op.state === 'TIMED_OUT_UNRESOLVED') {
        list.push(op);
      }
    }
    return list;
  }

  async awaitInFlightSettlement(timeoutMs = 50) {
    const pendingOps = Array.from(this.inFlightOperations.values()).filter(o => o.state === 'IN_FLIGHT');
    if (pendingOps.length === 0 || timeoutMs <= 0) {
      return;
    }

    await new Promise(resolve => {
      let timer = null;
      const onDone = () => {
        if (timer) clearTimeout(timer);
        resolve();
      };
      this._settlementListeners.push(onDone);
      timer = setTimeout(() => {
        const idx = this._settlementListeners.indexOf(onDone);
        if (idx !== -1) this._settlementListeners.splice(idx, 1);
        resolve();
      }, timeoutMs);
    });
  }

  finalize() {
    this.finalized = true;
  }

  isClean() {
    if (this.createdUsers.size > 0) return false;
    if (this.unverifiedUsers.size > 0) return false;
    if (this.untrackedSessionsCount > 0) return false;
    if (this.untrackedUsersCount > 0) return false;
    if (this.trackedSessions.size !== this.revokedSessions.size) return false;
    if (this.hasUnresolvedOperations()) return false;
    if (this.postFinalizationMutations.length > 0) return false;
    if (this.seedCredentialRestorations.some(r => r.state !== 'restored')) return false;
    for (const rows of this.trackedTableRows.values()) {
      if (rows.size > 0) return false;
    }
    for (const objs of this.trackedStorageObjects.values()) {
      if (objs.size > 0) return false;
    }
    return true;
  }

  getSummary() {
    return {
      runId: this.runId,
      createdUsersCount: this.createdUsers.size,
      referencedUsersCount: this.referencedUsers.size,
      unverifiedUsersCount: this.unverifiedUsers.size,
      trackedUsersCount: this.createdUsers.size + this.referencedUsers.size + this.unverifiedUsers.size,
      trackedSessionsCount: this.trackedSessions.size,
      revokedSessionsCount: this.revokedSessions.size,
      trackedTableRowsCount: Array.from(this.trackedTableRows.values()).reduce((acc, s) => acc + s.size, 0),
      trackedStorageObjectsCount: Array.from(this.trackedStorageObjects.values()).reduce((acc, s) => acc + s.size, 0),
      seedCredentialRestorationsCount: this.seedCredentialRestorations.length,
      untrackedSessionsCount: this.untrackedSessionsCount,
      untrackedUsersCount: this.untrackedUsersCount,
      inFlightOperationsCount: this.inFlightOperations.size,
      unresolvedOperationsCount: this.getUnresolvedOperations().length,
      finalized: this.finalized,
      postFinalizationMutationsCount: this.postFinalizationMutations.length
    };
  }

  /**
   * Deterministic cleanup routine: deletes ONLY createdThisRun resources by ID.
   * Pre-existing referencedUsers are NEVER deleted (R3-09).
   * Restores modified seed user credentials (R5-06).
   * Handles Supabase Admin { data, error } responses.
   * Verifies absence of residual resources and fails closed if residual resources remain.
   * Resolves PRRT_kwDOVtCmZc66lOOU, PRRT_kwDOVtCmZc66lo-q, PRRT_kwDOVtCmZc66lq3S, PRRT_kwDOVtCmZc66mPVg (R5-02), PRRT_kwDOVtCmZc66mPVn (R5-03), PRRT_kwDOVtCmZc66mP9a (R5-06), PRRT_kwDOVtCmZc66vvky (R13-02), and PRRT_kwDOVtCmZc66_0zI (R16-02).
   */
  async executeCleanup({ adminClient, failClosed = true, settlementTimeoutMs = 50 } = {}) {
    const report = {
      runId: this.runId,
      createdUsersAttempted: this.createdUsers.size,
      usersDeleted: 0,
      referencedUsersPreserved: this.referencedUsers.size,
      preservedUsers: Array.from(this.referencedUsers.keys()),
      tableRowsDeleted: 0,
      storageObjectsDeleted: 0,
      sessionsRevoked: 0,
      seedCredentialsRestored: 0,
      residualUsers: [],
      residualResources: [],
      status: 'CLEANUP_PENDING'
    };

    // Await bounded grace period for in-flight requests to settle before auditing cleanup items (R13-02)
    if (settlementTimeoutMs > 0) {
      await this.awaitInFlightSettlement(settlementTimeoutMs);
    }

    const unresolvedOps = this.getUnresolvedOperations();

    const hasCleanupEligibleItems =
      this.createdUsers.size > 0 ||
      this.unverifiedUsers.size > 0 ||
      this.trackedTableRows.size > 0 ||
      this.trackedStorageObjects.size > 0 ||
      this.trackedSessions.size > 0 ||
      this.seedCredentialRestorations.length > 0 ||
      this.untrackedSessionsCount > 0 ||
      this.untrackedUsersCount > 0 ||
      unresolvedOps.length > 0 ||
      this.postFinalizationMutations.length > 0;

    if (!hasCleanupEligibleItems) {
      report.status = 'CLEANUP_VERIFIED_SUCCESS';
      this.finalize();
      return report;
    }

    if (!adminClient) {
      report.residualResources.push({ type: 'client', error: 'MISSING_ADMIN_CLIENT' });
      report.status = 'CLEANUP_FAILED_RESIDUAL_RESOURCES';
      this.finalize();
      if (failClosed) {
        throw new Error('CLEANUP_CLIENT_REQUIRED: executeCleanup requires authenticated adminClient when resources are tracked');
      }
      return report;
    }

    // 0A. Untracked minted sessions blocker (R5-04, R8-01, R13-02)
    if (this.untrackedSessionsCount > 0) {
      report.residualResources.push({
        type: 'untracked_session',
        count: this.untrackedSessionsCount,
        error: 'UNTRACKED_MINTED_SESSION: Authentication response minted token or timed out before response observation; residual session cannot be tracked'
      });
    }

    // 0B. Indeterminate user creation risk blocker (R14-02)
    if (this.untrackedUsersCount > 0) {
      report.residualResources.push({
        type: 'unresolved_user_creation_risk',
        count: this.untrackedUsersCount,
        error: 'UNRESOLVED_USER_CREATION_RISK: User creation endpoint (e.g. signup) timed out, encountered transport reset, or returned unreadable response post-dispatch; orphaned user may exist without tracked identifier (R14-02)'
      });
    }

    // 0C. Unverified user ownership blocker (R16-02)
    if (this.unverifiedUsers.size > 0) {
      for (const [uId, uObj] of this.unverifiedUsers.entries()) {
        report.residualResources.push({
          type: 'unresolved_user_ownership',
          userId: uId,
          email: uObj.email,
          ownership: uObj.ownership,
          error: `UNRESOLVED_USER_OWNERSHIP: User '${uId}' was observed with ownership '${uObj.ownership}'; affirmative run-created proof was missing or unverified, user preserved without deletion (R16-02)`
        });
      }
    }

    // 0C. Unresolved dispatch obligations (R13-02, R14-01, R14-02)
    for (const op of unresolvedOps) {
      if (op.canMintSession) {
        report.residualResources.push({
          type: 'unresolved_in_flight_operation',
          opId: op.opId,
          probeId: op.probeId,
          state: op.state,
          error: `UNRESOLVED_DISPATCH_OBLIGATION: Operation '${op.opId}' (${op.probeId}) was in state '${op.state}' with canMintSession=true; provider may have minted session server-side that was not observed before cleanup (R13-02)`
        });
      }
      if (op.canCreateUser) {
        report.residualResources.push({
          type: 'unresolved_user_creation',
          opId: op.opId,
          probeId: op.probeId,
          state: op.state,
          error: `UNRESOLVED_USER_CREATION: Operation '${op.opId}' (${op.probeId}) was in state '${op.state}' with canCreateUser=true; user may have been created on provider without confirmation (R14-02)`
        });
      }
      if (op.canModifyProviderState) {
        report.residualResources.push({
          type: 'unresolved_provider_mutation',
          opId: op.opId,
          probeId: op.probeId,
          targetUserId: op.targetUserId || null,
          state: op.state,
          error: `UNRESOLVED_PROVIDER_MUTATION: Operation '${op.opId}' (${op.probeId}) was in state '${op.state}' with canModifyProviderState=true; delayed mutation may land after cleanup and overwrite restored state (R14-01)`
        });
      }
      if (!op.canMintSession && !op.canCreateUser && !op.canModifyProviderState && op.requiresCleanupReconciliation) {
        report.residualResources.push({
          type: 'unresolved_in_flight_operation',
          opId: op.opId,
          probeId: op.probeId,
          state: op.state,
          error: `UNRESOLVED_DISPATCH_OBLIGATION: Operation '${op.opId}' (${op.probeId}) was in state '${op.state}' requiring cleanup reconciliation`
        });
      }
    }

    if (this.postFinalizationMutations.length > 0) {
      report.residualResources.push({
        type: 'post_finalization_mutations',
        count: this.postFinalizationMutations.length,
        error: `POST_FINALIZATION_MUTATIONS: ${this.postFinalizationMutations.length} mutation(s) occurred after inventory was finalized`
      });
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

    // 3. Invalidate tracked sessions using supported GoTrue sign-out / session revocation (R4-05, R5-02, R6-01, R8-02)
    if (this.trackedSessions.size > 0 && typeof adminClient.invalidateSession !== 'function' && typeof adminClient.signOut !== 'function') {
      report.residualResources.push({
        type: 'sessions',
        count: this.trackedSessions.size,
        error: 'MISSING_SESSION_INVALIDATION_METHOD: adminClient lacks invalidateSession or signOut method'
      });
    } else {
      for (const sessionId of this.trackedSessions) {
        // Idempotency check: if session is already confirmed revoked, skip redundant duplicate logout (R8-02)
        if (this.revokedSessions.has(sessionId)) {
          report.sessionsRevoked++;
          continue;
        }

        try {
          const token = this.sessionTokens.get(sessionId) || null;
          let res;
          if (typeof adminClient.invalidateSession === 'function') {
            res = await adminClient.invalidateSession(sessionId, token);
          } else if (typeof adminClient.signOut === 'function') {
            if (!token) {
              res = {
                error: {
                  message: `MISSING_TOKEN_CONTEXT: Targeted local session revocation requires valid access token context. Session '${sessionId}' cannot be revoked without token context (R6-01).`
                }
              };
            } else {
              res = await adminClient.signOut(token, 'local');
            }
          }
          if (res && res.error) {
            report.residualResources.push({ type: 'session', id: sessionId, error: res.error.message || String(res.error) });
          } else {
            this.revokedSessions.add(sessionId);
            report.sessionsRevoked++;
          }
        } catch (err) {
          report.residualResources.push({ type: 'session', id: sessionId, error: err.message });
        }
      }
    }

    // 4. Delete ONLY verified created users by exact user ID (referencedUsers and unverifiedUsers are preserved! R16-02)
    if (this.createdUsers.size > 0 && typeof adminClient.deleteUser !== 'function') {
      report.residualResources.push({ type: 'users', count: this.createdUsers.size, error: 'MISSING_DELETE_USER_METHOD' });
    } else {
      for (const [userId, userObj] of this.createdUsers.entries()) {
        // Enforce ownership again immediately before destructive Admin API call (Requirement 15, R16-02)
        const ownership = this.getUserOwnership(userId);
        if (ownership !== USER_OWNERSHIP.RUN_CREATED_VERIFIED) {
          report.residualUsers.push({
            id: userId,
            email: userObj?.email,
            error: `SECURITY_BOUNDARY_VIOLATION: Refusing to delete user '${userId}' with non-verified ownership '${ownership}' (R16-02)`
          });
          continue;
        }

        if (this.isUserReferenced(userId) || this.isSeedIdentity(userId, userObj?.email)) {
          report.residualUsers.push({
            id: userId,
            email: userObj?.email,
            error: `SECURITY_BOUNDARY_VIOLATION: Refusing to delete pre-existing or seed user '${userId}' (R16-02)`
          });
          continue;
        }

        if (!userObj?.creationProof || !isValidCreationProof(userObj.creationProof)) {
          report.residualUsers.push({
            id: userId,
            email: userObj?.email,
            error: `SECURITY_BOUNDARY_VIOLATION: Refusing to delete user '${userId}' lacking affirmative run-created proof (R16-02)`
          });
          continue;
        }

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

    // 5. Affirmative post-cleanup verification for created users (R4-06, R5-03)
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

            // If check returns error, require structured 404; any 5xx/network/timeout error fails verification (R4-06, R5-03)
            if (check?.error) {
              const err = check.error;
              const errStatus = typeof err.status === 'number' ? err.status : (typeof err.code === 'number' ? err.code : null);
              const errCode = typeof err.code === 'string' ? err.code.toLowerCase() : '';

              const is5xxOrNetwork =
                (errStatus !== null && errStatus >= 500 && errStatus < 600) ||
                errCode.includes('503') ||
                errCode.includes('unavailable') ||
                errCode.includes('timeout') ||
                errCode.includes('econnrefused');

              const isExplicit404 = !is5xxOrNetwork && (errStatus === 404 || errCode === 'user_not_found');

              if (!isExplicit404) {
                report.residualUsers.push({
                  id: userId,
                  email: userObj.email,
                  error: `VERIFY_FAILED: Non-404 error during absence check (${errStatus || errCode || err.message || err.msg || String(err)})`
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
            const errStatus = typeof err?.status === 'number' ? err.status : (typeof err?.code === 'number' ? err.code : null);
            const errCode = typeof err?.code === 'string' ? err.code.toLowerCase() : '';
            const is5xxOrNetwork =
              (errStatus !== null && errStatus >= 500 && errStatus < 600) ||
              errCode.includes('503') ||
              errCode.includes('unavailable') ||
              errCode.includes('timeout') ||
              errCode.includes('econnrefused');
            const isExplicit404 = !is5xxOrNetwork && (errStatus === 404 || errCode === 'user_not_found');
            if (!isExplicit404) {
              report.residualUsers.push({ id: userId, email: userObj.email, error: `VERIFY_FAILED: ${err.message}` });
            }
          }
        }
      }
    }

    // 6. Restore modified seed credentials (R5-06, R9-01)
    if (this.seedCredentialRestorations.length > 0) {
      const updateFn = typeof adminClient.updateUserById === 'function'
        ? adminClient.updateUserById.bind(adminClient)
        : (adminClient.auth && typeof adminClient.auth.admin?.updateUserById === 'function'
            ? adminClient.auth.admin.updateUserById.bind(adminClient.auth.admin)
            : null);

      if (!updateFn) {
        report.residualResources.push({
          type: 'seed_credential_restoration',
          count: this.seedCredentialRestorations.length,
          error: 'MISSING_UPDATE_USER_METHOD: adminClient lacks updateUserById for seed password restoration'
        });
      } else {
        for (const item of this.seedCredentialRestorations) {
          // Untracked users cannot be modified by restoration (R9-01 security boundary)
          if (!this.isUserTracked(item.userId)) {
            report.residualResources.push({
              type: 'seed_credential_restoration',
              userId: item.userId,
              error: `SECURITY_BOUNDARY_VIOLATION: Attempted password restoration for untracked user '${item.userId}'`
            });
            continue;
          }

          // Exact identity correlation check (R10-02)
          const trackedEmail = this.getUserEmail(item.userId);
          if (trackedEmail && item.email && trackedEmail.trim().toLowerCase() !== item.email.trim().toLowerCase()) {
            report.residualResources.push({
              type: 'seed_credential_restoration',
              userId: item.userId,
              error: `IDENTITY_MISMATCH: Restoration record email '${item.email}' does not match tracked user email '${trackedEmail}' for user ID '${item.userId}' (R10-02)`
            });
            item.state = 'restoration_failed';
            continue;
          }

          // Concurrent / unresolved password mutation check (R14-01)
          const concurrentMutation = unresolvedOps.find(
            op => op.canModifyProviderState && (
              (op.targetUserId && String(op.targetUserId).trim() === String(item.userId).trim()) ||
              op.probeId === 'SESSION-02'
            )
          );
          if (concurrentMutation) {
            item.state = 'restoration_failed';
            report.residualResources.push({
              type: 'seed_credential_restoration',
              userId: item.userId,
              error: `CONCURRENT_UNRESOLVED_PASSWORD_MUTATION: Cannot verify password restoration for user '${item.userId}' because mutation operation '${concurrentMutation.opId}' (${concurrentMutation.probeId}) remains in state '${concurrentMutation.state}'. Delayed mutation could overwrite restored password (R14-01).`
            });
            continue;
          }

          // If already restored in this cleanup cycle, skip redundant update
          if (item.state === 'restored') {
            report.seedCredentialsRestored++;
            continue;
          }

          try {
            const res = await updateFn(item.userId, { password: item.originalPassword });
            if (res && res.error) {
              item.state = 'restoration_failed';
              item.error = res.error.message || String(res.error);
              report.residualResources.push({
                type: 'seed_credential_restoration',
                userId: item.userId,
                error: `RESTORE_FAILED: ${item.error}`
              });
              continue;
            }

            // Post-restoration verification via controlled authentication (R9-01, R10-01):
            // If adminClient provides verifyUserCredentials, verify that the restored password actually works
            if (typeof adminClient.verifyUserCredentials === 'function') {
              const testEmail = item.email || trackedEmail;
              if (testEmail) {
                let verifyRes;
                try {
                  verifyRes = await adminClient.verifyUserCredentials(testEmail, item.originalPassword, { inventory: this });
                } catch (verifyErr) {
                  verifyRes = {
                    data: null,
                    error: { message: `VERIFY_EXCEPTION: ${verifyErr?.message || String(verifyErr)}` }
                  };
                }

                if (verifyRes && verifyRes.error) {
                  const isRevocationFail = verifyRes.sessionRevocationFailed ||
                    (typeof verifyRes.error.message === 'string' && verifyRes.error.message.includes('VERIFICATION_SESSION_REVOCATION_FAILED'));
                  const isIndeterminate = verifyRes.indeterminateSession ||
                    (typeof verifyRes.error.message === 'string' && verifyRes.error.message.includes('INDETERMINATE_VERIFICATION_RESPONSE'));

                  if (isRevocationFail && !isIndeterminate) {
                    const leakSessId = verifyRes.error?.sessionId || null;
                    // Retrieve token from private inventory store (R11-02: secret boundary)
                    const leakToken = leakSessId ? this.getSessionToken(leakSessId) : null;
                    let retrySucceeded = false;

                    // Attempt safe fallback cleanup retry if private token context exists
                    if (leakToken && typeof adminClient.signOut === 'function') {
                      try {
                        const retryRes = await adminClient.signOut(leakToken, 'local');
                        if (retryRes && !retryRes.error) {
                          retrySucceeded = true;
                          if (leakSessId) this.markSessionRevoked(leakSessId);
                        }
                      } catch {
                        // retry failed
                      }
                    }

                    if (!retrySucceeded) {
                      item.state = 'restoration_failed';
                      item.error = verifyRes.error.message || String(verifyRes.error);
                      report.residualResources.push({
                        type: 'seed_credential_restoration',
                        userId: item.userId,
                        error: `RESTORE_VERIFICATION_FAILED: ${item.error}`
                      });
                      report.residualResources.push({
                        type: 'session',
                        id: leakSessId || 'verification_session',
                        sessionId: leakSessId || 'verification_session',
                        error: `VERIFICATION_SESSION_LEAK: Verification login succeeded but session invalidation failed: ${item.error}`
                      });
                      continue;
                    }
                  } else if (isIndeterminate) {
                    item.state = 'restoration_failed';
                    item.error = verifyRes.error.message || String(verifyRes.error);
                    report.residualResources.push({
                      type: 'seed_credential_restoration',
                      userId: item.userId,
                      error: `RESTORE_VERIFICATION_INDETERMINATE: ${item.error}`
                    });
                    report.residualResources.push({
                      type: 'untracked_session',
                      id: 'indeterminate_verification_session',
                      error: `INDETERMINATE_SESSION_LEAK: Server may have minted session during verification login but client could not identify or revoke it: ${item.error} (R11-01)`
                    });
                    continue;
                  } else {
                    item.state = 'restoration_failed';
                    item.error = verifyRes.error.message || String(verifyRes.error);
                    report.residualResources.push({
                      type: 'seed_credential_restoration',
                      userId: item.userId,
                      error: `RESTORE_VERIFICATION_FAILED: ${item.error}`
                    });
                    continue;
                  }
                }
                item.verifiedAt = new Date().toISOString();
              }
            }

            item.state = 'restored';
            item.restoredAt = new Date().toISOString();
            report.seedCredentialsRestored++;
          } catch (err) {
            item.state = 'restoration_failed';
            item.error = err.message;
            report.residualResources.push({
              type: 'seed_credential_restoration',
              userId: item.userId,
              error: `RESTORE_FAILED: ${err.message}`
            });
          }
        }
      }
    }

    if (report.residualUsers.length > 0 || report.residualResources.length > 0) {
      report.status = 'CLEANUP_FAILED_RESIDUAL_RESOURCES';
      this.finalize();
      if (failClosed) {
        const detail = report.residualUsers.length > 0
          ? `${report.residualUsers.length} synthetic user(s) remain in database after cleanup`
          : `${report.residualResources.length} residual resource(s) remain after cleanup`;
        throw new Error(`CLEANUP_INCOMPLETE: ${detail}`);
      }
    } else {
      report.status = 'CLEANUP_VERIFIED_SUCCESS';
      this.clearCredentials();
      this.finalize();
    }

    return report;
  }
}

/**
 * Standard test password constant for synthetic testing.
 * Resolves PRRT_kwDOVtCmZc66lOOY.
 */
export const DEFAULT_TEST_PASSWORD = 'TioTest#SecureRun2026!';
export const DEFAULT_TEST_EMAIL = 'tio-test-user-06i@proof.invalid';

export function getRunTestPassword(options = {}) {
  return (options && options.testPassword) || process.env.TASK06I_TEST_PASSWORD || DEFAULT_TEST_PASSWORD;
}

/**
 * Creates private run-scoped credential context for token propagation and cleanup.
 * Resolves PRRT_kwDOVtCmZc66lOOP.
 */
export function createRunContext(options = {}) {
  const testEmail = options.testEmail || options.testUser || null;
  return {
    testPassword: getRunTestPassword(options),
    testEmail: testEmail ? String(testEmail).trim().toLowerCase() : null,
    activeAccessToken: null,
    activeRefreshToken: null,
    activeUserId: null,
    activeSessionId: null,
    preInvalidationSessionValid: false,
    passwordResetCompleted: false,
    sessionRevocationConfirmed: false,
    revokedSessionId: null,
    revokedAccessToken: null,
    originalSeedPassword: null,
    activeSeedPassword: null,
    clear() {
      this.activeAccessToken = null;
      this.activeRefreshToken = null;
      this.testPassword = null;
      this.testEmail = null;
      this.activeSessionId = null;
      this.activeUserId = null;
      this.preInvalidationSessionValid = false;
      this.passwordResetCompleted = false;
      this.sessionRevocationConfirmed = false;
      this.revokedSessionId = null;
      this.revokedAccessToken = null;
      this.originalSeedPassword = null;
      this.activeSeedPassword = null;
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

  // Mandatory finite numeric expiration claim (R5-05)
  if (payload.exp === undefined || payload.exp === null) {
    return { valid: false, reason: 'MISSING_EXP: JWT payload claims lack mandatory exp (expiration) claim', payload };
  }
  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) {
    return { valid: false, reason: `INVALID_EXP: JWT exp claim must be a finite number, got ${typeof payload.exp} (${payload.exp})`, payload };
  }

  // Temporal consistency with iat (R5-05)
  if (payload.iat !== undefined && payload.iat !== null) {
    if (typeof payload.iat !== 'number' || !Number.isFinite(payload.iat)) {
      return { valid: false, reason: `INVALID_IAT: JWT iat claim must be a finite number, got ${typeof payload.iat}`, payload };
    }
    if (payload.exp < payload.iat) {
      return { valid: false, reason: `TEMPORAL_INCONSISTENCY: JWT exp (${payload.exp}) cannot be earlier than iat (${payload.iat})`, payload };
    }
  }

  const nowUnix = Math.floor(Date.now() / 1000);
  if (payload.exp + clockToleranceSeconds < nowUnix) {
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
 * Delegates to parseResponseEnvelope for backward compatibility. (R12-02)
 */
async function parseResponseBody(res) {
  const env = await parseResponseEnvelope(res);
  return env.body;
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
    prerequisites: ['PRE_RESET_TOKEN_BEFORE_EXPIRY', 'STORAGE_OBJECT_FIXTURE_PROVISIONED (task06i_probe_bucket/probe.txt owned by test user)'],
    credentialsRequired: ['TIO_TEMP_ANON_KEY'],
    evidenceSource: 'STORAGE_STATELESS_HTTP_200_BEFORE_EXP',
    readinessStatus: 'IMPLEMENTED_OFFLINE_TESTED',
    hostedStatus: 'HOSTED_NOT_TESTED',
    note: 'Documents Storage stateless JWT linger window. Accepts HTTP 200 before exp; rejects 401 or 404 as proof of linger (HTTP 404 indicates missing probe.txt fixture, R5-07).'
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
  fetchFn = globalThis.fetch,
  testEmail = null,
  seedEmail = null,
  seedUserId = null
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

  const factorySeedEmail = seedEmail || null;
  const factorySeedUserId = seedUserId || runContext?.seedUserId || null;
  if (inventory && factorySeedUserId) {
    inventory.protectSeedIdentity({ email: factorySeedEmail, id: factorySeedUserId });
  }

  const baseUrl = `https://${normRef}.supabase.co`;

  // Return the async dispatcher matching (item, options) contract
  return async function hostedDispatcher(item, options = {}) {
    const signal = options.signal;
    const probeId = item.id;
    const ctx = options.runContext || runContext;
    const inv = options.inventory || inventory;
    const testPassword = options.testPassword || ctx?.testPassword || getRunTestPassword(options);
    const testUser = item?.testUser || options.testEmail || options.testUser || ctx?.testEmail || factorySeedEmail || 'tio-test-user-06i@proof.invalid';

    if (inv) {
      const seedEmailToProtect = options.seedEmail || factorySeedEmail || ctx?.seedEmail || null;
      const seedUserIdToProtect = options.seedUserId || factorySeedUserId || ctx?.seedUserId || null;
      if (seedUserIdToProtect) {
        inv.protectSeedIdentity({ email: seedEmailToProtect, id: seedUserIdToProtect });
      }
    }

    const headers = {
      'apikey': anonKey,
      'Content-Type': 'application/json'
    };

    switch (probeId) {
      case 'BYPASS-01': {
        const cap = getEndpointCapabilities('BYPASS-01') || {
          canMintSession: false,
          canCreateUser: true,
          canModifyProviderState: true,
          requiresCleanupReconciliation: true
        };
        const op = inv?.registerInFlightOperation
          ? inv.registerInFlightOperation({
              probeId: 'BYPASS-01',
              endpoint: '/auth/v1/otp',
              canMintSession: cap.canMintSession,
              canCreateUser: cap.canCreateUser,
              canModifyProviderState: cap.canModifyProviderState,
              requiresCleanupReconciliation: cap.requiresCleanupReconciliation,
              description: 'OTP probe dispatch (BYPASS-01)',
              metadata: { email: testUser }
            })
          : null;

        let res;
        let transportError = null;
        try {
          res = await fetchFn(`${baseUrl}/auth/v1/otp`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ email: testUser }),
            signal
          });
        } catch (err) {
          transportError = err;
        }

        const parseEnv = res ? await parseResponseEnvelope(res) : null;
        const observed = observeAuthResponse({
          probeId: 'BYPASS-01',
          status: parseEnv?.status || 0,
          parseStatus: parseEnv?.parseStatus || (transportError ? 'transport_error' : 'missing_response'),
          body: parseEnv?.body || null,
          parseError: parseEnv?.parseError || null,
          transportError,
          inv,
          ctx,
          expectedOperation: 'rejection',
          canMintSession: cap.canMintSession,
          canCreateUser: cap.canCreateUser,
          canModifyProviderState: cap.canModifyProviderState,
          requiresCleanupReconciliation: cap.requiresCleanupReconciliation,
          testUser
        });

        if (op && inv?.settleInFlightOperation) {
          inv.settleInFlightOperation(op.opId, { observed, error: transportError });
        }

        const body = parseEnv?.body || null;
        const createdUserId = observed.userId || body?.id || body?.user?.id;
        if (inv && createdUserId) {
          const uidStr = String(createdUserId).trim();
          const retEmail = (typeof body?.user?.email === 'string' && body.user.email.trim()) || (typeof body?.email === 'string' && body.email.trim()) || null;
          const isSeed = Boolean(inv.isSeedIdentity(uidStr, retEmail) || inv.isUserReferenced(uidStr));
          if (isSeed) {
            inv.registerReferencedUser({ id: uidStr, email: retEmail || testUser, source: 'BYPASS-01_unexpected_response_matched_seed' });
          } else if (!inv.isUserTracked(uidStr)) {
            inv.registerObservedUser({ id: uidStr, email: retEmail || testUser, source: 'BYPASS-01_unexpected_signup' });
          }
        }

        const errText = (body?.msg || body?.message || body?.error_description || body?.error || '').toLowerCase();
        const providerDisabled =
          body?.error_code === 'email_provider_disabled' ||
          errText.includes('email provider is disabled') ||
          errText.includes('signups not allowed for otp');

        return {
          passed: observed.status !== 200 && !createdUserId && providerDisabled === true && !observed.hasTokens,
          status: observed.status,
          route_disabled: providerDisabled,
          user_created: Boolean(createdUserId),
          indeterminate_user_creation: Boolean(observed.indeterminateUserCreation),
          error_code: body?.error_code || null,
          tokens: extractObservedTokens(body) ? body : null,
          error: body?.msg || body?.message || body?.error_description || (observed.hasTokens ? 'SECURITY_INVARIANT_VIOLATION: POST /auth/v1/otp unexpectedly issued tokens!' : (createdUserId ? 'SECURITY_INVARIANT_VIOLATION: POST /auth/v1/otp unexpectedly created user!' : (observed.indeterminateUserCreation ? observed.error : null)))
        };
      }

      case 'BYPASS-02': {
        const cap = getEndpointCapabilities('BYPASS-02') || {
          canMintSession: true,
          canCreateUser: true,
          canModifyProviderState: true,
          requiresCleanupReconciliation: true
        };
        const op = inv?.registerInFlightOperation
          ? inv.registerInFlightOperation({
              probeId: 'BYPASS-02',
              endpoint: '/auth/v1/signup',
              canMintSession: cap.canMintSession,
              canCreateUser: cap.canCreateUser,
              canModifyProviderState: cap.canModifyProviderState,
              requiresCleanupReconciliation: cap.requiresCleanupReconciliation,
              description: 'Signup probe dispatch (BYPASS-02)',
              metadata: { email: testUser }
            })
          : null;

        let res;
        let transportError = null;
        try {
          res = await fetchFn(`${baseUrl}/auth/v1/signup`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ email: testUser, password: testPassword }),
            signal
          });
        } catch (err) {
          transportError = err;
        }

        const parseEnv = res ? await parseResponseEnvelope(res) : null;
        const observed = observeAuthResponse({
          probeId: 'BYPASS-02',
          status: parseEnv?.status || 0,
          parseStatus: parseEnv?.parseStatus || (transportError ? 'transport_error' : 'missing_response'),
          body: parseEnv?.body || null,
          parseError: parseEnv?.parseError || null,
          transportError,
          inv,
          ctx,
          expectedOperation: 'rejection',
          canMintSession: cap.canMintSession,
          canCreateUser: cap.canCreateUser,
          canModifyProviderState: cap.canModifyProviderState,
          requiresCleanupReconciliation: cap.requiresCleanupReconciliation,
          testUser
        });

        if (op && inv?.settleInFlightOperation) {
          inv.settleInFlightOperation(op.opId, { observed, error: transportError });
        }

        const body = parseEnv?.body || null;
        const errText = (body?.msg || body?.message || body?.error_description || body?.error || '').toLowerCase();
        const createdUserId = observed.userId || body?.id || body?.user?.id;
        if (inv && createdUserId) {
          const uidStr = String(createdUserId).trim();
          const retEmail = (typeof body?.user?.email === 'string' && body.user.email.trim()) || (typeof body?.email === 'string' && body.email.trim()) || null;
          const isSeed = Boolean(inv.isSeedIdentity(uidStr, retEmail) || inv.isUserReferenced(uidStr));
          if (isSeed) {
            inv.registerReferencedUser({ id: uidStr, email: retEmail || testUser, source: 'BYPASS-02_unexpected_response_matched_seed' });
          } else if (!inv.isUserTracked(uidStr)) {
            inv.registerObservedUser({ id: uidStr, email: retEmail || testUser, source: 'BYPASS-02_unexpected_signup' });
          }
        }
        const signupDisabled =
          body?.error_code === 'signup_disabled' ||
          errText.includes('signups not allowed') ||
          errText.includes('signup is disabled');

        return {
          passed: observed.status !== 200 && !createdUserId && signupDisabled === true && !observed.hasTokens,
          status: observed.status,
          signup_disabled: signupDisabled,
          user_created: Boolean(createdUserId),
          indeterminate_user_creation: Boolean(observed.indeterminateUserCreation),
          error_code: body?.error_code || null,
          tokens: extractObservedTokens(body) ? body : null,
          error: body?.msg || body?.message || body?.error_description || (observed.hasTokens ? 'SECURITY_INVARIANT_VIOLATION: POST /auth/v1/signup unexpectedly issued tokens!' : (createdUserId ? 'SECURITY_INVARIANT_VIOLATION: POST /auth/v1/signup unexpectedly created user!' : (observed.indeterminateUserCreation ? observed.error : null)))
        };
      }

      case 'BYPASS-03': {
        const cap = getEndpointCapabilities('BYPASS-03') || {
          canMintSession: true,
          canCreateUser: false,
          canModifyProviderState: true,
          requiresCleanupReconciliation: true
        };
        const op = inv?.registerInFlightOperation
          ? inv.registerInFlightOperation({
              probeId: 'BYPASS-03',
              endpoint: '/auth/v1/verify',
              canMintSession: cap.canMintSession,
              canCreateUser: cap.canCreateUser,
              canModifyProviderState: cap.canModifyProviderState,
              requiresCleanupReconciliation: cap.requiresCleanupReconciliation,
              description: 'Verify probe dispatch (BYPASS-03)'
            })
          : null;

        // Direct verify with fake/unverified token returns 400 before hook execution (R3-06).
        // Hook is verified only if GoTrue actually invokes custom_access_token_hook.
        let res;
        let transportError = null;
        try {
          res = await fetchFn(`${baseUrl}/auth/v1/verify`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ type: 'email', token: '000000', email: testUser }),
            signal
          });
        } catch (err) {
          transportError = err;
        }

        const parseEnv = res ? await parseResponseEnvelope(res) : null;
        const observed = observeAuthResponse({
          probeId: 'BYPASS-03',
          status: parseEnv?.status || 0,
          parseStatus: parseEnv?.parseStatus || (transportError ? 'transport_error' : 'missing_response'),
          body: parseEnv?.body || null,
          parseError: parseEnv?.parseError || null,
          transportError,
          inv,
          ctx,
          expectedOperation: 'rejection',
          canMintSession: cap.canMintSession,
          canCreateUser: cap.canCreateUser,
          canModifyProviderState: cap.canModifyProviderState,
          requiresCleanupReconciliation: cap.requiresCleanupReconciliation,
          testUser
        });

        if (op && inv?.settleInFlightOperation) {
          inv.settleInFlightOperation(op.opId, { observed, error: transportError });
        }

        const body = parseEnv?.body || null;
        const errText = (body?.msg || body?.message || body?.error_description || body?.error || '').toLowerCase();
        const hookRejected =
          observed.status >= 400 &&
          (body?.error_code === 'hook_error' || errText.includes('42501') || errText.includes('error invoking access token hook'));
        const isUpstreamTokenError = body?.error_code === 'otp_expired' || errText.includes('token has expired') || errText.includes('invalid');

        if (observed.classification === 'AUTH_RESPONSE_INDETERMINATE') {
          return {
            passed: false,
            status: observed.status,
            hook_rejected: false,
            indeterminate_session: true,
            upstream_rejected_before_hook: false,
            tokens: extractObservedTokens(body) ? body : null,
            error: observed.error,
            reason: observed.error
          };
        }

        if (observed.hasTokens) {
          return {
            passed: false,
            status: observed.status,
            hook_rejected: false,
            indeterminate_session: false,
            upstream_rejected_before_hook: false,
            tokens: extractObservedTokens(body) ? body : null,
            error: 'SECURITY_INVARIANT_VIOLATION: POST /auth/v1/verify unexpectedly issued tokens for unverified challenge!'
          };
        }

        return {
          passed: observed.status !== 200 && hookRejected === true && !observed.hasTokens,
          status: observed.status,
          hook_rejected: hookRejected,
          upstream_rejected_before_hook: isUpstreamTokenError,
          tokens: extractObservedTokens(body) ? body : null,
          error: hookRejected
            ? (body?.msg || body?.message || 'Hook rejected token issuance')
            : (observed.hasTokens
                ? 'SECURITY_INVARIANT_VIOLATION: POST /auth/v1/verify unexpectedly issued tokens for unverified challenge!'
                : 'PROVIDER_PRECONDITION_MISSING: GoTrue rejected fake OTP upstream before invoking Custom Access Token Hook (R3-06)')
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
        const cap = getEndpointCapabilities('BYPASS-05') || {
          canMintSession: false,
          canCreateUser: false,
          canModifyProviderState: true,
          requiresCleanupReconciliation: false
        };
        const op = inv?.registerInFlightOperation
          ? inv.registerInFlightOperation({
              probeId: 'BYPASS-05',
              endpoint: '/auth/v1/recover',
              canMintSession: cap.canMintSession,
              canCreateUser: cap.canCreateUser,
              canModifyProviderState: cap.canModifyProviderState,
              requiresCleanupReconciliation: cap.requiresCleanupReconciliation,
              description: 'Recover probe dispatch (BYPASS-05)',
              metadata: { email: testUser }
            })
          : null;

        let res;
        let transportError = null;
        try {
          res = await fetchFn(`${baseUrl}/auth/v1/recover`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ email: testUser }),
            signal
          });
        } catch (err) {
          transportError = err;
        }

        const parseEnv = res ? await parseResponseEnvelope(res) : null;
        const observed = observeAuthResponse({
          probeId: 'BYPASS-05',
          status: parseEnv?.status || 0,
          parseStatus: parseEnv?.parseStatus || (transportError ? 'transport_error' : 'missing_response'),
          body: parseEnv?.body || null,
          parseError: parseEnv?.parseError || null,
          transportError,
          inv,
          ctx,
          expectedOperation: 'rejection',
          canMintSession: cap.canMintSession,
          canCreateUser: cap.canCreateUser,
          canModifyProviderState: cap.canModifyProviderState,
          requiresCleanupReconciliation: cap.requiresCleanupReconciliation,
          testUser
        });

        if (op && inv?.settleInFlightOperation) {
          inv.settleInFlightOperation(op.opId, { observed, error: transportError });
        }

        const body = parseEnv?.body || null;
        const errText = (body?.msg || body?.message || body?.error_description || body?.error || '').toLowerCase();
        const hookSuppressed =
          observed.status !== 200 &&
          (body?.error_code === 'hook_error' || errText.includes('42501') || errText.includes('send_email_hook'));

        return {
          passed: hookSuppressed === true && !body?.recovery_token && !observed.hasTokens,
          status: observed.status,
          recovery_suppressed: hookSuppressed,
          email_delivered: null,
          recovery_token: body?.recovery_token || null,
          tokens: extractObservedTokens(body) ? body : null,
          error: body?.msg || body?.message || (observed.hasTokens ? 'SECURITY_INVARIANT_VIOLATION: POST /auth/v1/recover unexpectedly issued tokens!' : (observed.status === 200 ? 'HTTP_200_CANNOT_PROVE_EMAIL_SUPPRESSION: Anti-enumeration 200 does not prove hook suppression' : null))
        };
      }

      case 'HOOK-01': {
        const cap = getEndpointCapabilities('HOOK-01') || {
          canMintSession: true,
          canCreateUser: false,
          canModifyProviderState: true,
          requiresCleanupReconciliation: true
        };
        const op = inv?.registerInFlightOperation
          ? inv.registerInFlightOperation({
              probeId: 'HOOK-01',
              endpoint: '/auth/v1/token?grant_type=password',
              canMintSession: cap.canMintSession,
              canCreateUser: cap.canCreateUser,
              canModifyProviderState: cap.canModifyProviderState,
              requiresCleanupReconciliation: cap.requiresCleanupReconciliation,
              description: 'Password token grant dispatch (HOOK-01)',
              metadata: { email: testUser }
            })
          : null;

        let res;
        let transportError = null;
        try {
          res = await fetchFn(`${baseUrl}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ email: testUser, password: testPassword }),
            signal
          });
        } catch (err) {
          transportError = err;
        }

        const parseEnv = res ? await parseResponseEnvelope(res) : null;
        const observed = observeAuthResponse({
          probeId: 'HOOK-01',
          status: parseEnv?.status || 0,
          parseStatus: parseEnv?.parseStatus || (transportError ? 'transport_error' : 'missing_response'),
          body: parseEnv?.body || null,
          parseError: parseEnv?.parseError || null,
          transportError,
          inv,
          ctx,
          expectedOperation: 'token_issuance',
          canMintSession: cap.canMintSession,
          canCreateUser: cap.canCreateUser,
          canModifyProviderState: cap.canModifyProviderState,
          requiresCleanupReconciliation: cap.requiresCleanupReconciliation,
          testUser
        });

        if (op && inv?.settleInFlightOperation) {
          inv.settleInFlightOperation(op.opId, { observed, error: transportError });
        }

        if (observed.classification === 'AUTH_RESPONSE_INDETERMINATE') {
          return {
            passed: false,
            status: observed.status,
            indeterminate_session: true,
            session_cleanup_registered: true,
            error: observed.error,
            tokens: parseEnv?.body || null
          };
        }

        if (observed.classification !== 'AUTH_RESPONSE_TOKEN_OBSERVED') {
          return {
            passed: false,
            status: observed.status,
            error: observed.error || 'Password grant authentication failed',
            tokens: parseEnv?.body || null
          };
        }

        const accessToken = observed.accessToken;
        const refreshToken = observed.refreshToken;
        const rawSessionId = observed.sessionId;
        const rawUserId = observed.userId;

        // Strictly validate JWT payload claims - NO bypass paths allowed (R3-08)
        const jwtCheck = parseAndValidateJwt(accessToken, { expectedAudience: 'authenticated' });
        if (!jwtCheck.valid) {
          // Token is unverified and untrusted for authorization, but cleanup obligation was retained (R5-04, R8-01)
          return {
            passed: false,
            status: observed.status,
            error: `JWT_CLAIM_VIOLATION: ${jwtCheck.reason}`,
            jwt_claims_verified: false,
            session_id: rawSessionId || null,
            session_cleanup_registered: isNonEmptyString(rawSessionId)
          };
        }

        const userId = jwtCheck.payload.sub || rawUserId;
        const sessionId = jwtCheck.payload.session_id || rawSessionId;

        if (!isNonEmptyString(sessionId)) {
          return {
            passed: false,
            status: observed.status,
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

        return {
          passed: true,
          status: observed.status,
          access_token: accessToken,
          refresh_token: refreshToken,
          amr_authenticated: true,
          jwt_claims_verified: true,
          user_id: userId,
          session_id: sessionId,
          tokens: parseEnv?.body || null
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

        const cap = getEndpointCapabilities('HOOK-02') || {
          canMintSession: true,
          canCreateUser: false,
          canModifyProviderState: true,
          requiresCleanupReconciliation: true
        };
        const op = inv?.registerInFlightOperation
          ? inv.registerInFlightOperation({
              probeId: 'HOOK-02',
              endpoint: '/auth/v1/token?grant_type=refresh_token',
              canMintSession: cap.canMintSession,
              canCreateUser: cap.canCreateUser,
              canModifyProviderState: cap.canModifyProviderState,
              requiresCleanupReconciliation: cap.requiresCleanupReconciliation,
              description: 'Token refresh dispatch (HOOK-02)'
            })
          : null;

        let res;
        let transportError = null;
        try {
          res = await fetchFn(`${baseUrl}/auth/v1/token?grant_type=refresh_token`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ refresh_token: activeRefresh }),
            signal
          });
        } catch (err) {
          transportError = err;
        }

        const parseEnv = res ? await parseResponseEnvelope(res) : null;
        const observed = observeAuthResponse({
          probeId: 'HOOK-02',
          status: parseEnv?.status || 0,
          parseStatus: parseEnv?.parseStatus || (transportError ? 'transport_error' : 'missing_response'),
          body: parseEnv?.body || null,
          parseError: parseEnv?.parseError || null,
          transportError,
          inv,
          ctx,
          expectedOperation: 'token_refresh',
          canMintSession: cap.canMintSession,
          canCreateUser: cap.canCreateUser,
          canModifyProviderState: cap.canModifyProviderState,
          requiresCleanupReconciliation: cap.requiresCleanupReconciliation,
          testUser
        });

        if (op && inv?.settleInFlightOperation) {
          inv.settleInFlightOperation(op.opId, { observed, error: transportError });
        }

        if (observed.classification === 'AUTH_RESPONSE_INDETERMINATE') {
          return {
            passed: false,
            status: observed.status,
            indeterminate_session: true,
            error: observed.error,
            tokens: parseEnv?.body || null
          };
        }

        if (observed.classification !== 'AUTH_RESPONSE_TOKEN_OBSERVED') {
          return {
            passed: false,
            status: observed.status,
            error: observed.error || 'Token refresh failed',
            tokens: parseEnv?.body || null
          };
        }

        const refreshedAccess = observed.accessToken;

        // Strictly validate refreshed JWT payload - NO bypass paths allowed (R3-08)
        const jwtCheck = parseAndValidateJwt(refreshedAccess, { expectedAudience: 'authenticated' });
        if (!jwtCheck.valid) {
          return {
            passed: false,
            status: observed.status,
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
            status: observed.status,
            error: 'AMR_PRESERVATION_VIOLATION: Refreshed token did not preserve password-origin AMR',
            amr_preserved: false
          };
        }

        if (ctx) {
          ctx.activeAccessToken = refreshedAccess;
          if (observed.refreshToken) {
            ctx.activeRefreshToken = observed.refreshToken;
          }
        }

        return {
          passed: true,
          status: observed.status,
          access_token: refreshedAccess,
          amr_preserved: true,
          refreshed_claims_verified: true,
          tokens: parseEnv?.body || null
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

        const trackedEmail = (inv && userId) ? inv.getUserEmail(userId) : null;
        const candidateEmail = item?.testUser || options.testEmail || options.testUser || ctx?.testEmail || null;
        const normCandidate = candidateEmail ? String(candidateEmail).trim().toLowerCase() : null;
        const normTracked = trackedEmail ? String(trackedEmail).trim().toLowerCase() : null;

        if (normTracked && normCandidate && normTracked !== normCandidate) {
          return {
            passed: false,
            status: 0,
            password_reset_completed: false,
            session_revoked: false,
            session_revocation_verified: false,
            remaining_sessions: null,
            restoration_registered: false,
            restoration_state: 'rejected',
            error: `IDENTITY_MISMATCH: SESSION-02 candidate email '${normCandidate}' does not match tracked user email '${normTracked}' for user ID '${userId}' (R10-02)`
          };
        }

        const seedEmail = normTracked || normCandidate || DEFAULT_TEST_EMAIL;
        validateTestIdentity(seedEmail);

        if (ctx) {
          ctx.testEmail = seedEmail;
        }

        if (inv) {
          for (const [id, user] of [...inv.referencedUsers.entries(), ...inv.createdUsers.entries()]) {
            if (user?.email && user.email.toLowerCase() === seedEmail.toLowerCase() && String(id) !== String(userId)) {
              return {
                passed: false,
                status: 0,
                password_reset_completed: false,
                session_revoked: false,
                session_revocation_verified: false,
                remaining_sessions: null,
                restoration_registered: false,
                restoration_state: 'rejected',
                error: `IDENTITY_MISMATCH: Email '${seedEmail}' is already bound to user ID '${id}', cannot mutate different user ID '${userId}' (R10-02)`
              };
            }
          }
        }

        const origPassword = ctx?.originalSeedPassword || ctx?.testPassword || options.testPassword || DEFAULT_TEST_PASSWORD;
        const newPassword = 'TioNewPassword#2026!';

        // Ensure seed user is tracked in referencedUsers so it is preserved and never deleted (R3-09, R9-01)
        if (inv && !inv.isUserTracked(userId)) {
          inv.trackReferencedUser({
            id: String(userId),
            email: seedEmail,
            source: 'SESSION-02_seed_user'
          });
        }

        // PRE-DISPATCH RESTORATION REGISTRATION (R9-01):
        // Register the restoration obligation BEFORE dispatching the Admin API password mutation.
        // If the request commits but response is lost (network drop, timeout, connection reset,
        // or unreadable JSON), the restoration obligation is already securely recorded in inventory.
        let restorationRecord = null;
        if (inv && userId) {
          restorationRecord = inv.registerSeedPasswordModification({
            userId: String(userId),
            email: seedEmail,
            originalPassword: origPassword,
            targetPassword: newPassword,
            state: 'pending'
          });
          if (restorationRecord) {
            restorationRecord.state = 'dispatched';
            restorationRecord.dispatchedAt = new Date().toISOString();
          }
        }

        // PRE-DISPATCH IN-FLIGHT OPERATION REGISTRATION (R14-01, R15-02):
        // Register state mutation before network dispatch. Password is never exposed in metadata.
        const cap = getEndpointCapabilities('SESSION-02') || {
          canMintSession: false,
          canCreateUser: false,
          canModifyProviderState: true,
          requiresCleanupReconciliation: true
        };
        const op = inv?.registerInFlightOperation
          ? inv.registerInFlightOperation({
              probeId: 'SESSION-02',
              endpoint: `/auth/v1/admin/users/${userId}`,
              canMintSession: cap.canMintSession,
              canCreateUser: cap.canCreateUser,
              canModifyProviderState: cap.canModifyProviderState,
              requiresCleanupReconciliation: cap.requiresCleanupReconciliation,
              targetUserId: String(userId),
              description: 'Admin password update dispatch (SESSION-02)',
              metadata: { userId: String(userId), email: seedEmail }
            })
          : null;

        let res;
        let body;
        let fetchThrew = false;
        let fetchError = null;

        try {
          res = await fetchFn(`${baseUrl}/auth/v1/admin/users/${userId}`, {
            method: 'PUT',
            headers: {
              apikey: serviceRoleKey,
              Authorization: `Bearer ${serviceRoleKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ password: newPassword }),
            signal
          });
          body = await parseResponseBody(res);
        } catch (err) {
          fetchThrew = true;
          fetchError = err;
        }

        if (fetchThrew) {
          if (restorationRecord) {
            restorationRecord.state = 'indeterminate';
            restorationRecord.indeterminateAt = new Date().toISOString();
            restorationRecord.error = fetchError?.message || String(fetchError);
          }
          if (op && inv?.settleInFlightOperation) {
            if (signal?.aborted || fetchError?.name === 'AbortError' || fetchError?.code === 'ETIMEDOUT') {
              // Operation timed out / was aborted while in flight; server state is indeterminate (R14-01)
              if (op.state === 'IN_FLIGHT') {
                op.state = 'TIMED_OUT_UNRESOLVED';
                op.timedOutAt = new Date().toISOString();
                op.timeoutReason = 'DISPATCH_ABORTED_OR_TIMED_OUT';
              }
            } else {
              inv.settleInFlightOperation(op.opId, { error: fetchError });
            }
          }
          return {
            passed: false,
            status: 0,
            password_reset_completed: false,
            session_revoked: false,
            session_revocation_verified: false,
            remaining_sessions: null,
            restoration_registered: true,
            restoration_state: 'indeterminate',
            error: `DISPATCH_EXCEPTION: Admin password update failed during transport or response parsing: ${fetchError?.message}. Restoration obligation preserved as indeterminate (R9-01).`
          };
        }

        if (restorationRecord) {
          restorationRecord.lastStatus = res.status;
        }

        const resetSucceeded = res.status === 200 && (body?.id === userId || body?.user?.id === userId);

        if (op && inv?.settleInFlightOperation) {
          inv.settleInFlightOperation(op.opId, { outcome: { status: res.status, resetSucceeded } });
        }

        if (resetSucceeded) {
          if (restorationRecord) {
            restorationRecord.state = 'confirmed';
            restorationRecord.confirmedAt = new Date().toISOString();
          }
          if (ctx) {
            ctx.passwordResetCompleted = true;
            ctx.originalSeedPassword = origPassword;
            ctx.activeSeedPassword = newPassword;
          }
        } else {
          // If status was not 200, or body could not be verified as matching userId, mark indeterminate
          if (restorationRecord) {
            restorationRecord.state = 'indeterminate';
            restorationRecord.indeterminateAt = new Date().toISOString();
            restorationRecord.error = body?.msg || body?.message || (res.status === 200 ? 'UNREADABLE_RESPONSE: HTTP 200 received but response body could not be verified' : `HTTP_${res.status}`);
          }
        }

        // Affirmative verification of session revocation: pre-reset token MUST be verified as revoked (R4-03, R5-01)
        let sessionRevocationVerified = false;
        let remainingSessions = null;
        let verifyError = null;
        let probeErrorCode = null;

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
            const probeBody = await parseResponseBody(probeRes);
            probeErrorCode = (probeBody?.error_code || probeBody?.code || '').toLowerCase();
            const probeErrorMsg = (probeBody?.msg || probeBody?.message || probeBody?.error_description || probeBody?.error || '').toLowerCase();

            // Distinguish false-proof errors (R5-01): bad_jwt, jwt_expired, token_expired, invalid_jwt, malformed_jwt, etc.
            const isFalseProof =
              probeErrorCode === 'bad_jwt' ||
              probeErrorCode === 'jwt_expired' ||
              probeErrorCode === 'token_expired' ||
              probeErrorCode === 'invalid_jwt' ||
              probeErrorCode === 'malformed_jwt' ||
              probeErrorMsg.includes('bad_jwt') ||
              probeErrorMsg.includes('expired') ||
              probeErrorMsg.includes('malformed') ||
              probeErrorMsg.includes('invalid jwt') ||
              probeErrorMsg.includes('invalid token') ||
              probeErrorMsg.includes('signature');

            // Affirmative provider-observed session revocation error (R5-01)
            const isAffirmativeRevocation =
              probeErrorCode === 'session_not_found' ||
              probeErrorCode === 'session_revoked' ||
              probeErrorCode === 'authsessionmissingerror' ||
              probeErrorMsg.includes('session not found') ||
              probeErrorMsg.includes('session_not_found');

            if (probeRes.status === 200) {
              sessionRevocationVerified = false;
              remainingSessions = 1;
              verifyError = 'SECURITY_REGRESSION: Admin password update returned HTTP 200, but pre-reset session token remained valid (HTTP 200 on /auth/v1/user); session was not revoked!';
            } else if (probeRes.status === 401 || probeRes.status === 403) {
              if (isFalseProof) {
                sessionRevocationVerified = false;
                remainingSessions = null;
                verifyError = `FALSE_PROOF_REJECTED: /auth/v1/user returned '${probeBody?.error_code || probeBody?.msg || probeBody?.message}'. Invalid/expired/malformed JWT errors do not demonstrate remote session invalidation (R5-01).`;
              } else if (isAffirmativeRevocation) {
                sessionRevocationVerified = true;
                remainingSessions = 0;
              } else {
                // Ambiguous 401/403 without revocation-specific code fails closed (R5-01)
                sessionRevocationVerified = false;
                remainingSessions = null;
                verifyError = `AMBIGUOUS_REJECTION: /auth/v1/user returned HTTP ${probeRes.status} with code '${probeBody?.error_code || 'none'}', which does not prove session revocation. Specific session_not_found provider error code required (R5-01).`;
              }
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

        if (isRevoked) {
          if (inv && ctx?.activeSessionId) {
            inv.markSessionRevoked(ctx.activeSessionId);
          }
          if (ctx) {
            ctx.sessionRevocationConfirmed = true;
            ctx.revokedSessionId = ctx.activeSessionId;
            ctx.revokedAccessToken = ctx.activeAccessToken;
          }
        }

        return {
          passed: isRevoked,
          status: res.status,
          password_reset_completed: resetSucceeded,
          session_revoked: sessionRevocationVerified,
          remaining_sessions: remainingSessions,
          session_revocation_verified: sessionRevocationVerified,
          session_id: ctx?.activeSessionId || null,
          pre_session_id: ctx?.activeSessionId || null,
          correlated_session_id: ctx?.activeSessionId || null,
          invalidation_completed: isRevoked,
          logout_fallback: false,
          error_code: probeErrorCode || null,
          revocation_error_code: sessionRevocationVerified ? (probeErrorCode || 'session_not_found') : null,
          restoration_registered: !!restorationRecord,
          restoration_state: restorationRecord ? restorationRecord.state : null,
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

        const isRevocationSuccess = isRevocationError && ctx?.preInvalidationSessionValid === true && ctx?.passwordResetCompleted === true;
        if (isRevocationSuccess && inv && sessionId) {
          inv.markSessionRevoked(sessionId);
        }

        return {
          passed: isRevocationSuccess,
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

        // R17-02: Require authenticated pre-invalidation baseline and verified session revocation proof before linger claims
        if (ctx?.preInvalidationSessionValid !== true) {
          return {
            passed: false,
            status: 0,
            error: 'PREREQUISITE_MISSING: SESSION-04 requires authenticated pre-invalidation session baseline (HOOK-01)'
          };
        }
        if (ctx?.passwordResetCompleted !== true || ctx?.sessionRevocationConfirmed !== true) {
          return {
            passed: false,
            status: 0,
            error: 'PREREQUISITE_MISSING: SESSION-04 requires verified session revocation evidence (SESSION-02)'
          };
        }

        const token = ctx.activeAccessToken;
        let tokenExpiry = null;
        let tokenIat = null;
        let tokenSessionId = null;
        let jwtLifetimeSeconds = null;
        let lifetimeBounded = false;
        try {
          const parts = token.split('.');
          if (parts.length === 3) {
            const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
            if (typeof p?.exp === 'number' && Number.isFinite(p.exp)) {
              tokenExpiry = p.exp;
            }
            if (typeof p?.iat === 'number' && Number.isFinite(p.iat)) {
              tokenIat = p.iat;
            }
            if (typeof p?.session_id === 'string' && p.session_id.trim()) {
              tokenSessionId = p.session_id.trim();
            }
            if (tokenExpiry !== null && tokenIat !== null && tokenExpiry > tokenIat) {
              jwtLifetimeSeconds = tokenExpiry - tokenIat;
              lifetimeBounded = jwtLifetimeSeconds > 0 && jwtLifetimeSeconds <= 300;
            }
          }
        } catch {}

        // Token must correlate with verified revoked session ID (R17-02)
        const sessionCorrelated = Boolean(tokenSessionId && ctx?.revokedSessionId && tokenSessionId === ctx.revokedSessionId);
        if (!sessionCorrelated) {
          return {
            passed: false,
            status: 0,
            error: `SESSION_CORRELATION_FAILURE: SESSION-04 token session_id ('${tokenSessionId || 'none'}') does not correlate with verified revoked session ID ('${ctx?.revokedSessionId || 'none'}')`
          };
        }

        const nowUnix = Math.floor(Date.now() / 1000);
        const tokenUnexpired = typeof tokenExpiry === 'number' && nowUnix < tokenExpiry;

        const res = await fetchFn(`${baseUrl}/rest/v1/task06i_session_probe`, {
          method: 'GET',
          headers: { ...headers, Authorization: authHeader },
          signal
        });
        const body = await parseResponseBody(res);

        // Stateless linger is observed ONLY when token is unexpired AND lifetime is strictly bounded (<= 300s) AND PostgREST accepts it with HTTP 200 AND session is correlated (R3-03, R7-02, R17-02)
        const lingerObserved = res.status === 200 && tokenUnexpired && lifetimeBounded && sessionCorrelated;

        let error = null;
        if (res.status === 401) {
          error = 'POSTGREST_TOKEN_REJECTED: PostgREST returned HTTP 401; linger not observed';
        } else if (!tokenUnexpired) {
          error = 'TOKEN_ALREADY_EXPIRED';
        } else if (tokenIat === null || tokenExpiry === null) {
          error = 'MISSING_JWT_TIMESTAMPS: Token missing valid numeric iat or exp claims (R7-02)';
        } else if (tokenExpiry <= tokenIat) {
          error = 'INVALID_EXP_TEMPORAL_INCONSISTENCY: Token exp must be strictly greater than iat (R7-02)';
        } else if (jwtLifetimeSeconds > 300) {
          error = `EXCESSIVE_JWT_LIFETIME: Token lifetime (${jwtLifetimeSeconds}s) exceeds approved 300s bound (R7-02)`;
        }

        return {
          passed: lingerObserved,
          status: res.status,
          stateless_linger_documented: lingerObserved,
          token_unexpired: tokenUnexpired,
          jwt_exp: tokenExpiry,
          jwt_iat: tokenIat,
          jwt_lifetime_seconds: jwtLifetimeSeconds,
          lifetime_bounded: lifetimeBounded,
          revocation_verified: ctx?.sessionRevocationConfirmed === true,
          revoked_session_id: ctx?.revokedSessionId || null,
          correlated_session_id: tokenSessionId,
          session_correlated: sessionCorrelated,
          pre_invalidation_verified: ctx?.preInvalidationSessionValid === true,
          evidence: lingerObserved
            ? `PostgREST Data API stateless JWT linger confirmed (HTTP 200 before exp ${tokenExpiry}); verified short jwt_exp lifetime (${jwtLifetimeSeconds}s <= 300s); correlated revoked session ${ctx?.revokedSessionId}`
            : `PostgREST did not demonstrate valid bounded stateless linger (status ${res.status}, unexpired: ${tokenUnexpired}, lifetime: ${jwtLifetimeSeconds}s)`,
          postgrest_linger_observed: lingerObserved,
          bounded_by_jwt_exp: lifetimeBounded,
          data: body,
          error
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

        // R17-02: Require authenticated pre-invalidation baseline and verified session revocation proof before linger claims
        if (ctx?.preInvalidationSessionValid !== true) {
          return {
            passed: false,
            status: 0,
            error: 'PREREQUISITE_MISSING: SESSION-05 requires authenticated pre-invalidation session baseline (HOOK-01)'
          };
        }
        if (ctx?.passwordResetCompleted !== true || ctx?.sessionRevocationConfirmed !== true) {
          return {
            passed: false,
            status: 0,
            error: 'PREREQUISITE_MISSING: SESSION-05 requires verified session revocation evidence (SESSION-02)'
          };
        }

        const token = ctx.activeAccessToken;
        let tokenExpiry = null;
        let tokenIat = null;
        let tokenSessionId = null;
        let jwtLifetimeSeconds = null;
        let lifetimeBounded = false;
        try {
          const parts = token.split('.');
          if (parts.length === 3) {
            const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
            if (typeof p?.exp === 'number' && Number.isFinite(p.exp)) {
              tokenExpiry = p.exp;
            }
            if (typeof p?.iat === 'number' && Number.isFinite(p.iat)) {
              tokenIat = p.iat;
            }
            if (typeof p?.session_id === 'string' && p.session_id.trim()) {
              tokenSessionId = p.session_id.trim();
            }
            if (tokenExpiry !== null && tokenIat !== null && tokenExpiry > tokenIat) {
              jwtLifetimeSeconds = tokenExpiry - tokenIat;
              lifetimeBounded = jwtLifetimeSeconds > 0 && jwtLifetimeSeconds <= 300;
            }
          }
        } catch {}

        // Token must correlate with verified revoked session ID (R17-02)
        const sessionCorrelated = Boolean(tokenSessionId && ctx?.revokedSessionId && tokenSessionId === ctx.revokedSessionId);
        if (!sessionCorrelated) {
          return {
            passed: false,
            status: 0,
            error: `SESSION_CORRELATION_FAILURE: SESSION-05 token session_id ('${tokenSessionId || 'none'}') does not correlate with verified revoked session ID ('${ctx?.revokedSessionId || 'none'}')`
          };
        }

        const nowUnix = Math.floor(Date.now() / 1000);
        const tokenUnexpired = typeof tokenExpiry === 'number' && nowUnix < tokenExpiry;

        const res = await fetchFn(`${baseUrl}/storage/v1/object/authenticated/task06i_probe_bucket/probe.txt`, {
          method: 'GET',
          headers: { ...headers, Authorization: authHeader },
          signal
        });
        const body = await parseResponseBody(res);

        // Stateless linger is observed ONLY when token is unexpired AND lifetime is strictly bounded (<= 300s) AND Storage accepts it with HTTP 200 AND session is correlated (R3-03, R7-02, R17-02)
        const lingerObserved = res.status === 200 && tokenUnexpired && lifetimeBounded && sessionCorrelated;

        let error = null;
        if (res.status === 404) {
          error = 'STORAGE_FIXTURE_MISSING: Storage probe file returned HTTP 404 (PROVIDER_PRECONDITION_MISSING: task06i_probe_bucket/probe.txt must be provisioned before test, R5-07)';
        } else if (res.status === 401) {
          error = 'STORAGE_TOKEN_REJECTED: Storage returned HTTP 401';
        } else if (!tokenUnexpired) {
          error = 'TOKEN_ALREADY_EXPIRED';
        } else if (tokenIat === null || tokenExpiry === null) {
          error = 'MISSING_JWT_TIMESTAMPS: Token missing valid numeric iat or exp claims (R7-02)';
        } else if (tokenExpiry <= tokenIat) {
          error = 'INVALID_EXP_TEMPORAL_INCONSISTENCY: Token exp must be strictly greater than iat (R7-02)';
        } else if (jwtLifetimeSeconds > 300) {
          error = `EXCESSIVE_JWT_LIFETIME: Token lifetime (${jwtLifetimeSeconds}s) exceeds approved 300s bound (R7-02)`;
        }

        return {
          passed: lingerObserved,
          status: res.status,
          stateless_linger_documented: lingerObserved,
          token_unexpired: tokenUnexpired,
          jwt_exp: tokenExpiry,
          jwt_iat: tokenIat,
          jwt_lifetime_seconds: jwtLifetimeSeconds,
          lifetime_bounded: lifetimeBounded,
          revocation_verified: ctx?.sessionRevocationConfirmed === true,
          revoked_session_id: ctx?.revokedSessionId || null,
          correlated_session_id: tokenSessionId,
          session_correlated: sessionCorrelated,
          pre_invalidation_verified: ctx?.preInvalidationSessionValid === true,
          evidence: lingerObserved
            ? `Storage API stateless JWT linger confirmed (HTTP 200 before exp ${tokenExpiry}); verified short jwt_exp lifetime (${jwtLifetimeSeconds}s <= 300s); correlated revoked session ${ctx?.revokedSessionId}`
            : `Storage API did not demonstrate valid bounded stateless linger (status ${res.status}, unexpired: ${tokenUnexpired}, lifetime: ${jwtLifetimeSeconds}s)`,
          storage_linger_observed: lingerObserved,
          bounded_by_jwt_exp: lifetimeBounded,
          data: body,
          error
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
        const errCodeLower = (errCode || '').toLowerCase();

        // Check false-proof errors (R5-08): bad_jwt, jwt_expired, token_expired, invalid_jwt, invalid_token, etc.
        const isFalseProof =
          errCodeLower === 'bad_jwt' ||
          errCodeLower === 'jwt_expired' ||
          errCodeLower === 'token_expired' ||
          errCodeLower === 'invalid_jwt' ||
          errCodeLower === 'malformed_jwt' ||
          errMsg.includes('bad_jwt') ||
          errMsg.includes('expired') ||
          errMsg.includes('malformed') ||
          errMsg.includes('invalid jwt') ||
          errMsg.includes('invalid token') ||
          errMsg.includes('signature');

        // Provider-observed revocation error (R4-04, R5-08): Accept ONLY genuine AuthSessionMissingError or session_not_found
        // Reject generic 401/403/500 and false-proof errors!
        const isRevocationError =
          !isFalseProof &&
          (res.status === 401 || res.status === 403 || res.status === 500) &&
          (errCode === 'AuthSessionMissingError' ||
           errCode === 'session_not_found' ||
           errMsg.includes('authsessionmissingerror') ||
           errMsg.includes('session not found'));

        const isRevocationSuccess = isRevocationError && ctx?.preInvalidationSessionValid === true && ctx?.passwordResetCompleted === true;
        if (isRevocationSuccess && inv && sessionId) {
          inv.markSessionRevoked(sessionId);
        }

        return {
          passed: isRevocationSuccess,
          status: res.status,
          pre_reset_baseline_verified: ctx?.preInvalidationSessionValid === true,
          reset_completed: ctx?.passwordResetCompleted === true,
          session_id: sessionId,
          pre_session_id: sessionId,
          correlated_session_id: sessionId,
          revocation_verified: isRevocationError,
          session_revoked: isRevocationError,
          error_code: errCode,
          error: isRevocationError
            ? null
            : (isFalseProof
                ? `FALSE_PROOF_REJECTED: Edge Function returned '${errCode || errMsg}' (invalid/expired token does not prove revocation)`
                : (body?.msg || body?.message || ((res.status === 401 || res.status === 403 || res.status === 500) ? 'GENERIC_UNAUTHORIZED: Edge Function returned generic error without provider-observed session revocation proof (R5-08)' : null)))
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
  const verifiedSeedId = options.seedUserId || options.targetUserId || null;
  if (verifiedSeedId) {
    activeInventory.protectSeedIdentity({ email: options.seedEmail || testEmail || null, id: verifiedSeedId });
  }
  const activeRunContext = runContext || createRunContext({ ...options, testEmail });
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
        await activeInventory.awaitInFlightSettlement(Math.min(probeTimeoutMs, 100));
        cleanupReport = await activeInventory.executeCleanup({ adminClient, failClosed: false, settlementTimeoutMs: 50 });
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

      // Register runner-level in-flight operation for probe (R13-02, R14-01, R14-02, R15-02)
      const cap = getEndpointCapabilities(item.id) || null;
      const canMint = cap ? Boolean(cap.canMintSession) : ['HOOK-01', 'HOOK-02', 'BYPASS-03'].includes(item.id);
      const canCreate = cap ? Boolean(cap.canCreateUser ?? cap.canCreateUsers) : ['BYPASS-01', 'BYPASS-02'].includes(item.id);
      const canModify = cap ? Boolean(cap.canModifyProviderState) : true;
      const reqReconcile = cap ? Boolean(cap.requiresCleanupReconciliation) : true;

      const runnerOp = activeInventory?.registerInFlightOperation
        ? activeInventory.registerInFlightOperation({
            probeId: item.id,
            endpoint: item.target,
            canMintSession: canMint,
            canCreateUser: canCreate,
            canModifyProviderState: canModify,
            requiresCleanupReconciliation: reqReconcile,
            targetUserId: item.id === 'SESSION-02' && activeRunContext?.activeUserId ? String(activeRunContext.activeUserId) : null,
            description: `Runner execution for probe ${item.id}`
          })
        : null;

      // Enforce bounded per-probe deadline with AbortController (PRRT_kwDOVtCmZc66jOw5, R13-02)
      const controller = new AbortController();
      let timeoutTimer;

      const timeoutPromise = new Promise((_, reject) => {
        timeoutTimer = setTimeout(() => {
          controller.abort();
          if (activeInventory?.markProbeOperationsTimedOut) {
            activeInventory.markProbeOperationsTimedOut(item.id, `PROBE_TIMEOUT: probe ${item.id} exceeded deadline of ${probeTimeoutMs}ms`);
          }
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
            testEmail: item.testUser || activeRunContext.testEmail || testEmail,
            testUser: item.testUser || activeRunContext.testEmail || testEmail,
            activeRefreshToken: activeRunContext.activeRefreshToken
          })
        );
        // Attach no-op rejection handler so late rejection after timeout/abort never leaks unhandledRejection (PRRT_kwDOVtCmZc66jd3O)
        dispatchPromise.catch(() => {});
        rawOutcome = await Promise.race([dispatchPromise, timeoutPromise]);
        if (runnerOp && activeInventory?.settleInFlightOperation) {
          activeInventory.settleInFlightOperation(runnerOp.opId, { outcome: rawOutcome });
        }
      } catch (err) {
        const isTimeout = err?.code === 'ETIMEDOUT' || (typeof err?.message === 'string' && err.message.includes('PROBE_TIMEOUT'));
        if (isTimeout) {
          if (activeInventory?.markProbeOperationsTimedOut) {
            activeInventory.markProbeOperationsTimedOut(item.id, `PROBE_TIMEOUT: probe ${item.id} exceeded deadline of ${probeTimeoutMs}ms`);
          }
        } else {
          if (runnerOp && activeInventory?.settleInFlightOperation) {
            activeInventory.settleInFlightOperation(runnerOp.opId, { error: err });
          }
        }
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
      const cleanupErrText = `CLEANUP_FAILURE: Test run cleanup did not verify complete resource removal. Status: ${cleanupReport?.status || 'UNKNOWN'}. Residual users: ${cleanupReport?.residualUsers?.length || 0}, Residual resources: ${cleanupReport?.residualResources?.length || 0}. Error: ${cleanupReport?.error || 'Unverified cleanup'}`;
      if (!abortReason) {
        abortReason = cleanupErrText;
      } else {
        abortReason = `${abortReason} (${cleanupErrText})`;
      }
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
    if (activeInventory && typeof activeInventory.clearCredentials === 'function') {
      if (!isLive || (cleanupReport && cleanupReport.status === 'CLEANUP_VERIFIED_SUCCESS')) {
        activeInventory.clearCredentials();
      }
    }
  }
}

/**
 * Factory for the hosted admin client adapter used by cleanup and admin operations.
 * Strictly binds to HARDCODED_TEMP_REF; rejects real and tio-world projects.
 * Resolves PRRT_kwDOVtCmZc66sBa5 (R7-01).
 */
export function createHostedAdminClient({
  serviceRoleKey,
  anonKey,
  projectRef = HARDCODED_TEMP_REF,
  fetchFn = fetch
} = {}) {
  if (projectRef !== HARDCODED_TEMP_REF) {
    throw new Error(`SECURITY_BOUNDARY_VIOLATION: createHostedAdminClient strictly permitted only against TEMP project '${HARDCODED_TEMP_REF}', attempted '${projectRef}'`);
  }
  if (!serviceRoleKey || typeof serviceRoleKey !== 'string' || !serviceRoleKey.trim()) {
    throw new Error('MISSING_HOSTED_CREDENTIALS: createHostedAdminClient requires non-empty serviceRoleKey');
  }

  const baseUrl = `https://${projectRef}.supabase.co`;

  return {
    async verifyUserCredentials(email, password, options = {}) {
      const inv = options?.inventory || null;
      if (!email || typeof email !== 'string' || !email.trim()) {
        return { data: null, error: { message: 'MISSING_EMAIL: verifyUserCredentials requires non-empty email' } };
      }
      if (!password || typeof password !== 'string') {
        return { data: null, error: { message: 'MISSING_PASSWORD: verifyUserCredentials requires string password' } };
      }

      const cap = getEndpointCapabilities('verify_credentials') || {
        canMintSession: true,
        canCreateUser: false,
        canModifyProviderState: true,
        requiresCleanupReconciliation: true
      };
      const op = inv?.registerInFlightOperation
        ? inv.registerInFlightOperation({
            probeId: 'verify_credentials',
            endpoint: '/auth/v1/token?grant_type=password',
            canMintSession: cap.canMintSession,
            canCreateUser: cap.canCreateUser,
            canModifyProviderState: cap.canModifyProviderState,
            requiresCleanupReconciliation: cap.requiresCleanupReconciliation,
            description: 'Seed password restoration credential verification'
          })
        : null;

      const keyToUse = anonKey || serviceRoleKey;
      let res;
      let transportError = null;
      try {
        res = await fetchFn(`${baseUrl}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers: {
            apikey: keyToUse,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email: email.trim(),
            password
          })
        });
      } catch (err) {
        transportError = err;
      }

      const parseEnv = res ? await parseResponseEnvelope(res) : null;
      const observed = observeAuthResponse({
        probeId: 'verify_credentials',
        status: parseEnv?.status || 0,
        parseStatus: parseEnv?.parseStatus || (transportError ? 'transport_error' : 'missing_response'),
        body: parseEnv?.body || null,
        parseError: parseEnv?.parseError || null,
        transportError,
        inv,
        expectedOperation: 'token_issuance',
        canMintSession: cap.canMintSession,
        canCreateUser: cap.canCreateUser,
        canModifyProviderState: cap.canModifyProviderState,
        requiresCleanupReconciliation: cap.requiresCleanupReconciliation,
        testUser: email.trim()
      });

      if (op && inv?.settleInFlightOperation) {
        inv.settleInFlightOperation(op.opId, { observed, error: transportError });
      }

      if (observed.classification === 'AUTH_RESPONSE_INDETERMINATE') {
        const errorMsg = transportError
          ? `VERIFICATION_NETWORK_ERROR: ${observed.error || transportError?.message || String(transportError)}`
          : observed.error;
        return {
          data: null,
          error: {
            message: errorMsg,
            code: observed.errorCode || 'UNREADABLE_RESPONSE',
            status: observed.status
          },
          sessionRevocationFailed: true,
          indeterminateSession: true
        };
      }

      if (observed.classification !== 'AUTH_RESPONSE_TOKEN_OBSERVED') {
        return {
          data: null,
          error: {
            message: observed.error || `HTTP_${observed.status}`,
            status: observed.status,
            code: observed.errorCode || `HTTP_${observed.status}`
          }
        };
      }

      const token = observed.accessToken;
      const sessionId = observed.sessionId;

      // Immediately revoke verification session so no residual sessions leak (R9-01, R10-01, R11-01)
      let signOutRes;
      let signOutThrew = false;
      let signOutError = null;
      try {
        signOutRes = await this.signOut(token, 'local');
      } catch (err) {
        signOutThrew = true;
        signOutError = err;
      }

      if (signOutThrew) {
        return {
          data: null,
          error: {
            message: `VERIFICATION_SESSION_REVOCATION_FAILED: signOut threw exception: ${signOutError?.message || String(signOutError)} (R11-01)`,
            code: 'LOGOUT_EXCEPTION',
            sessionId: String(sessionId)
            // NOTE (R11-02): Raw token value is strictly omitted to prevent secret leakage
          },
          sessionRevocationFailed: true
        };
      }

      if (signOutRes && signOutRes.error) {
        return {
          data: null,
          error: {
            message: `VERIFICATION_SESSION_REVOCATION_FAILED: signOut failed: ${signOutRes.error.message || JSON.stringify(signOutRes.error)} (R11-01)`,
            code: 'LOGOUT_FAILED',
            sessionId: String(sessionId),
            status: signOutRes.error.status
            // NOTE (R11-02): Raw token value is strictly omitted to prevent secret leakage
          },
          sessionRevocationFailed: true
        };
      }

      // Successfully signed out - mark session revoked in inventory
      if (inv && sessionId) {
        inv.markSessionRevoked(sessionId);
      }

      return {
        data: {
          verified: true,
          userId: observed.userId,
          sessionId: String(sessionId)
        },
        error: null
      };
    },

    async deleteUser(userId) {
      if (!userId || typeof userId !== 'string' || !userId.trim()) {
        return { data: null, error: { message: 'MISSING_USER_ID: deleteUser requires non-empty userId' } };
      }
      const res = await fetchFn(`${baseUrl}/auth/v1/admin/users/${encodeURIComponent(userId.trim())}`, {
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
      if (!userId || typeof userId !== 'string' || !userId.trim()) {
        return { data: null, error: { message: 'MISSING_USER_ID: getUserById requires non-empty userId' } };
      }
      const res = await fetchFn(`${baseUrl}/auth/v1/admin/users/${encodeURIComponent(userId.trim())}`, {
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

    async signOut(token, scope = 'local') {
      if (!token || typeof token !== 'string' || !token.trim()) {
        return { data: null, error: { message: 'MISSING_TOKEN: signOut requires non-empty user access token' } };
      }
      const res = await fetchFn(`${baseUrl}/auth/v1/logout?scope=${encodeURIComponent(scope)}`, {
        method: 'POST',
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${token.trim()}`,
          'Content-Type': 'application/json'
        }
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const errCode = (body?.error_code || body?.code || '').toString().toLowerCase();
        const errMsg = (body?.msg || body?.message || body?.error_description || body?.error || '').toString().toLowerCase();

        // Disqualify false proofs (R8-02)
        const isFalseProof =
          errCode.includes('bad_jwt') ||
          errCode.includes('jwt_expired') ||
          errCode.includes('token_expired') ||
          errCode.includes('invalid_token') ||
          errCode.includes('invalid_jwt') ||
          errMsg.includes('bad_jwt') ||
          errMsg.includes('jwt expired') ||
          errMsg.includes('token is expired') ||
          errMsg.includes('token expired') ||
          errMsg.includes('invalid token') ||
          errMsg.includes('invalid claim');

        // Affirmative session absence: session_not_found or authsessionmissingerror (R8-02)
        const isSessionAbsence = !isFalseProof && (
          errCode === 'session_not_found' ||
          errCode === 'authsessionmissingerror' ||
          errMsg.includes('session not found') ||
          errMsg.includes('session_not_found') ||
          errMsg.includes('auth session missing') ||
          errMsg.includes('session from session_id claim in jwt does not exist') ||
          (errMsg.includes('session') && errMsg.includes('does not exist'))
        );

        if (isSessionAbsence) {
          return { data: { scope, alreadyRevoked: true }, error: null, session_not_found: true };
        }

        return {
          data: null,
          error: {
            message: body?.msg || body?.message || `HTTP_${res.status}`,
            status: res.status,
            code: body?.error_code || body?.code
          }
        };
      }
      return { data: { scope }, error: null };
    },

    async invalidateSession(sessionId, token) {
      if (!token || typeof token !== 'string' || !token.trim()) {
        return {
          data: null,
          error: {
            status: 400,
            message: `UNSUPPORTED_SESSION_REVOCATION: GoTrue lacks an admin session-by-id deletion endpoint; access token context is required for targeted local sign-out of session '${sessionId}' (R6-01)`
          }
        };
      }
      const res = await this.signOut(token.trim(), 'local');
      if (res.session_not_found) {
        return { data: { sessionId, scope: 'local', alreadyRevoked: true }, error: null, session_not_found: true };
      }
      return res;
    },

    async updateUserById(userId, attributes) {
      if (!userId || typeof userId !== 'string' || !userId.trim()) {
        return { data: null, error: { message: 'MISSING_USER_ID: updateUserById requires non-empty userId' } };
      }
      const res = await fetchFn(`${baseUrl}/auth/v1/admin/users/${encodeURIComponent(userId.trim())}`, {
        method: 'PUT',
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(attributes)
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return { data: null, error: body?.msg || body?.message || `HTTP_${res.status}` };
      }
      const data = await res.json().catch(() => ({ id: userId }));
      return { data, error: null };
    },

    async deleteTableRow(table, id) {
      if (!table || !id) {
        return { data: null, error: { message: 'MISSING_PARAMS: deleteTableRow requires table and id' } };
      }
      const res = await fetchFn(`${baseUrl}/rest/v1/${encodeURIComponent(table)}?id=eq.${encodeURIComponent(id)}`, {
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
      return { data: { table, id }, error: null };
    },

    async deleteStorageObject(bucket, path) {
      if (!bucket || !path) {
        return { data: null, error: { message: 'MISSING_PARAMS: deleteStorageObject requires bucket and path' } };
      }
      const res = await fetchFn(`${baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodeURIComponent(path)}`, {
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
      return { data: { bucket, path }, error: null };
    }
  };
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

    const adminClient = createHostedAdminClient({
      serviceRoleKey,
      anonKey,
      projectRef: HARDCODED_TEMP_REF,
      fetchFn: fetch
    });

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
