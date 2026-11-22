// Security harness for Task 06I-B1-H0
// Models, evaluates, and deterministically asserts the 12 security contract areas:
// 1. Native OTP route disablement contract (BYPASS-01)
// 2. Native signup route disablement contract (BYPASS-02)
// 3. Custom Access Token Hook authorization (HOOK-01)
// 4. Send Email Hook recovery suppression (BYPASS-05)
// 5. Password-origin JWT acceptance (HOOK-01, SESSION-01)
// 6. Token refresh AMR preservation (HOOK-02)
// 7. Missing/malformed/unknown AMR rejection (HOOK-06)
// 8. Mixed password + unauthorized AMR rejection (HOOK-05)
// 9. Invalid Send Email Hook payload rejection (BYPASS-05)
// 10. Hook error and timeout behavior (HOOK-07)
// 11. Revoked Auth-session behavior (SESSION-02, SESSION-03)
// 12. JWT consumer differences across Auth, Data API, Storage, and Edge Functions (SESSION-04, 05, 06)

import {
  evaluateCustomAccessTokenHook,
  evaluateSendEmailHook,
  classifyHookOutcome,
  classifySendEmailOutcome
} from './hook-allowlist-contract.mjs';

/**
 * 1. Evaluates native route disablement contract against provider configuration.
 * Maps to BYPASS-01 and BYPASS-02.
 */
export function evaluateNativeRouteDisablement(route, config = {}) {
  const normRoute = (route || '').trim().toLowerCase();

  if (normRoute === '/auth/v1/otp' || normRoute === '/auth/v1/magiclink') {
    if (config.external_email_magic_link_disabled === true) {
      return {
        allowed: false,
        status: 422,
        code: 'email_provider_disabled',
        message: 'Email OTP and Magic Link provider disabled by policy',
        tokenIssued: false
      };
    }
    return {
      allowed: true,
      status: 200,
      code: 'provider_enabled',
      message: 'Route open (INSECURE: violates BYPASS-01 invariant)',
      tokenIssued: false // verification required
    };
  }

  if (normRoute === '/auth/v1/signup') {
    if (config.disable_signup === true) {
      return {
        allowed: false,
        status: 422,
        code: 'signup_disabled',
        message: 'Direct signup disabled by policy',
        tokenIssued: false
      };
    }
    return {
      allowed: true,
      status: 200,
      code: 'signup_enabled',
      message: 'Direct signup open (INSECURE: violates BYPASS-02 invariant)',
      tokenIssued: true
    };
  }

  if (normRoute === '/auth/v1/recover') {
    // Route itself is reachable at gateway, but email delivery is governed by Send Email Hook
    return {
      allowed: true,
      status: 200,
      routeReachable: true,
      note: 'Gateway route open; dispatch suppression governed by Send Email Hook (BYPASS-05)'
    };
  }

  throw new Error(`unrecognized_route: ${route}`);
}

/**
 * 10. Evaluates hook failure, timeout, and exception fail-closed semantics.
 * Maps to HOOK-07.
 */
export function evaluateHookFailureSemantics(scenario) {
  switch (scenario) {
    case 'TIMEOUT':
      // Supabase default timeout is 2 seconds for Postgres functions
      return {
        httpStatus: 500,
        error: 'AuthApiError: Error invoking access token hook (function timeout after 2000ms)',
        transactionAborted: true,
        tokensIssued: 0,
        failClosed: true
      };
    case 'SQL_EXCEPTION_42501':
      return {
        httpStatus: 500,
        error: 'AuthApiError: Error invoking access token hook (SQLSTATE 42501)',
        transactionAborted: true,
        tokensIssued: 0,
        failClosed: true
      };
    case 'SYNTAX_OR_RUNTIME_ERROR':
      return {
        httpStatus: 500,
        error: 'AuthApiError: Error invoking access token hook (internal server error)',
        transactionAborted: true,
        tokensIssued: 0,
        failClosed: true
      };
    case 'NETWORK_OR_UNREACHABLE':
      return {
        httpStatus: 500,
        error: 'AuthApiError: Error invoking access token hook (database connection failure)',
        transactionAborted: true,
        tokensIssued: 0,
        failClosed: true
      };
    default:
      throw new Error(`unknown_failure_scenario: ${scenario}`);
  }
}

/**
 * 11. Models Auth session state and Admin-API password update session invalidation.
 * Maps to SESSION-01, SESSION-02, SESSION-03.
 */
export class MockAuthSessionStore {
  constructor() {
    this.sessions = new Map(); // sessionId -> sessionObject
    this.userSessions = new Map(); // userId -> Set of sessionIds
  }

  createSession(userId, authenticationMethod = 'password') {
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const session = {
      id: sessionId,
      userId,
      authenticationMethod,
      createdAt: Math.floor(Date.now() / 1000),
      revoked: false
    };
    this.sessions.set(sessionId, session);

    if (!this.userSessions.has(userId)) {
      this.userSessions.set(userId, new Set());
    }
    this.userSessions.get(userId).add(sessionId);

    return session;
  }

  adminUpdateUserPassword(userId, newPassword) {
    // When an administrator updates a user's password via Admin API,
    // GoTrue invalidates all active sessions for that user in auth.sessions.
    const userSessionIds = this.userSessions.get(userId) || new Set();
    let revokedCount = 0;
    for (const sid of userSessionIds) {
      const sess = this.sessions.get(sid);
      if (sess && !sess.revoked) {
        sess.revoked = true;
        revokedCount++;
      }
    }
    return { success: true, revokedSessionsCount: revokedCount };
  }

  validateSessionForUserEndpoint(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || session.revoked) {
      return {
        allowed: false,
        status: 403,
        error: 'session_not_found',
        message: 'Invalid or revoked user session'
      };
    }
    return {
      allowed: true,
      status: 200,
      user: { id: session.userId }
    };
  }
}

/**
 * 12. Evaluates JWT consumer differences across Auth, Data API (PostgREST), Storage, and Edge Functions.
 * Models stateless JWT signature validity vs database stateful revocation.
 * Maps to SESSION-04, SESSION-05, SESSION-06.
 */
export function evaluateJwtConsumerAccess({
  consumer,
  jwt,
  currentTime = Math.floor(Date.now() / 1000),
  sessionStore = null
}) {
  const isSignatureValid = jwt.signatureValid === true;
  const isNotExpired = jwt.exp > currentTime;

  if (!isSignatureValid) {
    return {
      allowed: false,
      status: 401,
      reason: 'invalid_jwt_signature'
    };
  }

  if (!isNotExpired) {
    return {
      allowed: false,
      status: 401,
      reason: 'jwt_expired'
    };
  }

  switch (consumer) {
    case 'AUTH_API_USER_ENDPOINT': {
      // Stateful check: GoTrue checks auth.sessions on every GET/PUT /user request
      if (!sessionStore) throw new Error('sessionStore required for Auth API check');
      const check = sessionStore.validateSessionForUserEndpoint(jwt.sessionId);
      return {
        allowed: check.allowed,
        status: check.status,
        consumer: 'Auth API (Stateful Database Check)',
        reason: check.allowed ? 'session_active' : check.error,
        lingeringRisk: false
      };
    }

    case 'POSTGREST_DATA_API': {
      // Stateless check: PostgREST verifies signature & exp only, without querying auth.sessions
      return {
        allowed: true, // accepts token during residual validity window
        status: 200,
        consumer: 'PostgREST (Stateless Signature Check)',
        reason: 'stateless_signature_valid',
        lingeringRisk: true,
        mitigation: 'Bounded by jwt_exp: 300s; server-side authorization / RLS required'
      };
    }

    case 'STORAGE_API': {
      // Stateless check: Storage API verifies signature & exp only
      return {
        allowed: true,
        status: 200,
        consumer: 'Storage API (Stateless Signature Check)',
        reason: 'stateless_signature_valid',
        lingeringRisk: true,
        mitigation: 'Bounded by jwt_exp: 300s; server-side authorization required'
      };
    }

    case 'EDGE_FUNCTION_AUTH_GET_USER': {
      // Edge Function explicitly calls supabase.auth.getUser(token), querying GoTrue
      if (!sessionStore) throw new Error('sessionStore required for Edge Function getUser check');
      const check = sessionStore.validateSessionForUserEndpoint(jwt.sessionId);
      return {
        allowed: check.allowed,
        status: check.status,
        consumer: 'Edge Function calling supabase.auth.getUser()',
        reason: check.allowed ? 'session_active' : 'AuthSessionMissingError (403)',
        lingeringRisk: false
      };
    }

    case 'EDGE_FUNCTION_UNVALIDATED_JWT': {
      // Edge Function merely inspects claims without calling auth.getUser()
      return {
        allowed: true,
        status: 200,
        consumer: 'Edge Function without auth.getUser()',
        reason: 'stateless_signature_valid',
        lingeringRisk: true,
        mitigation: 'Mandatory requirement: Edge Functions must invoke auth.getUser()'
      };
    }

    default:
      throw new Error(`unrecognized_consumer: ${consumer}`);
  }
}
