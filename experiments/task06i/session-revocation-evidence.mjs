import { types } from 'node:util';

const purposes = Object.freeze({
  session_02_post_reset_user_read: {
    method: 'GET', path: '/auth/v1/user', kind: 'read', statuses: [401, 403],
    classification: 'provider_session_revoked', providerEvidence: ['SESSION_NOT_FOUND', 'SESSION_REVOKED', 'AUTH_SESSION_MISSING'],
    prerequisites: ['password_reset_confirmed', 'pre_invalidation_session_valid', 'intended_user_correlated']
  },
  session_03_post_reset_user_read: {
    method: 'GET', path: '/auth/v1/user', kind: 'read', statuses: [401, 403],
    classification: 'provider_session_revoked', providerEvidence: ['SESSION_NOT_FOUND', 'SESSION_REVOKED', 'AUTH_SESSION_MISSING'],
    prerequisites: ['password_reset_confirmed', 'pre_invalidation_session_valid', 'intended_user_correlated']
  },
  session_06_post_reset_edge_probe: {
    method: 'POST', path: '/functions/v1/auth-user-probe', kind: 'other_effect', statuses: [401, 403, 500],
    providerEvidence: ['SESSION_NOT_FOUND', 'AUTH_SESSION_MISSING'],
    classification: 'provider_session_revoked', prerequisites: ['password_reset_confirmed', 'pre_invalidation_session_valid', 'intended_user_correlated']
  },
  targeted_local_logout: {
    method: 'POST', path: '/auth/v1/logout', kind: 'auth_effect', statuses: null,
    classification: null, providerEvidence: ['SESSION_NOT_FOUND', 'AUTH_SESSION_MISSING'],
    prerequisites: ['session_token_correlated']
  },
  credential_verification_local_logout: {
    method: 'POST', path: '/auth/v1/logout', kind: 'auth_effect', statuses: null,
    classification: null, providerEvidence: ['SESSION_NOT_FOUND', 'AUTH_SESSION_MISSING'],
    prerequisites: ['session_token_correlated', 'intended_user_correlated']
  },
  restoration_retry_local_logout: {
    method: 'POST', path: '/auth/v1/logout', kind: 'auth_effect', statuses: null,
    classification: null, providerEvidence: ['SESSION_NOT_FOUND', 'AUTH_SESSION_MISSING'],
    prerequisites: ['session_token_correlated', 'intended_user_correlated']
  }
});

function purposeContract(purpose) {
  return typeof purpose === 'string' && Object.hasOwn(purposes, purpose) ? purposes[purpose] : null;
}

function plainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || types.isProxy(value) ||
      Object.getOwnPropertySymbols(value).length !== 0) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) return false;
  }
  return true;
}

function exactKeys(value, keys) {
  return plainRecord(value) && Object.getOwnPropertySymbols(value).length === 0 &&
    Object.getOwnPropertyNames(value).length === keys.length && keys.every(key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor && Object.hasOwn(descriptor, 'value');
    });
}

function exactRequest(response, expected, projectRef) {
  const target = response?.target;
  return exactKeys(target, ['origin', 'method', 'path', 'scope']) &&
    target.origin === `https://${projectRef}.supabase.co` &&
    target.method === expected.method && target.path === expected.path &&
    target.scope === (expected.path === '/auth/v1/logout' ? 'local' : null) &&
    response.kind === expected.kind;
}

function proofExpected(purpose, classification, status, providerEvidence) {
  const expected = purposeContract(purpose);
  if (!expected) return null;
  if (purpose.startsWith('session_')) {
    return classification === expected.classification && expected.statuses.includes(status) &&
      expected.providerEvidence.includes(providerEvidence) ? expected : null;
  }
  if (purpose.endsWith('_local_logout')) {
    if (classification === 'local_logout_completed' && Number.isInteger(status) && status >= 200 && status < 300) {
      return providerEvidence === null ? expected : null;
    }
    if (classification === 'provider_session_absent' && [400, 401, 403, 404].includes(status) &&
        expected.providerEvidence.includes(providerEvidence)) return expected;
  }
  return null;
}

function validPrerequisites(contract, values, hasSupporting) {
  if (!Array.isArray(values) || new Set(values).size !== values.length ||
      values.some(value => typeof value !== 'string')) return false;
  const allowed = new Set(contract.prerequisites);
  if (hasSupporting) allowed.add('pre_invalidation_session_valid');
  return contract.prerequisites.every(value => values.includes(value)) && values.every(value => allowed.has(value));
}

/**
 * Validate ephemeral provider evidence and return a bounded, secret-free record
 * suitable for durable replay. This function never creates a resolution receipt.
 */
export function validateSessionRevocationEvidence({ entry, proof, expected } = {}) {
  if (!plainRecord(expected) || !plainRecord(entry) || !plainRecord(proof) ||
      typeof expected.projectRef !== 'string' || typeof expected.runId !== 'string' ||
      typeof expected.sessionId !== 'string' || typeof expected.userId !== 'string' ||
      typeof expected.tokenHash !== 'string' || typeof expected.resourceKey !== 'string' ||
      entry.projectRef !== expected.projectRef || entry.runId !== expected.runId ||
      entry.resource !== 'session:' + expected.sessionId || entry.key !== expected.resourceKey ||
      proof.projectRef !== expected.projectRef || proof.runId !== expected.runId ||
      proof.sessionId !== expected.sessionId || proof.userId !== expected.userId ||
      proof.tokenHash !== expected.tokenHash || !Array.isArray(entry.requestOrdinals) ||
      !Array.isArray(entry.responses) || entry.requestOrdinals.length === 0 ||
      entry.responses.length !== entry.requestOrdinals.length ||
      !Array.isArray(proof.prerequisites) || !Array.isArray(proof.supportingOrdinals) ||
      (proof.supportingRequests !== undefined && !Array.isArray(proof.supportingRequests))) return null;

  const contract = purposeContract(proof.purpose);
  if (!contract || !validPrerequisites(contract, proof.prerequisites, proof.supportingOrdinals.length > 0)) return null;
  const responseByOrdinal = new Map();
  let priorOrdinal = 0;
  for (let index = 0; index < entry.requestOrdinals.length; index++) {
    const ordinal = entry.requestOrdinals[index];
    const response = entry.responses[index];
    if (!Number.isSafeInteger(ordinal) || ordinal <= priorOrdinal || !plainRecord(response) ||
        response.ordinal !== ordinal || !Number.isInteger(response.status) || response.status < 100 || response.status > 599 ||
        responseByOrdinal.has(ordinal)) return null;
    priorOrdinal = ordinal;
    responseByOrdinal.set(ordinal, response);
  }

  const supportingRequests = proof.supportingRequests || [];
  for (const response of supportingRequests) {
    if (!exactKeys(response, ['ordinal', 'status', 'kind', 'target']) || responseByOrdinal.has(response.ordinal) ||
        !Number.isSafeInteger(response.ordinal) || !plainRecord(response.target)) return null;
    responseByOrdinal.set(response.ordinal, response);
  }
  const decisive = responseByOrdinal.get(proof.decisiveOrdinal);
  const decisiveContract = proofExpected(proof.purpose, proof.classification, decisive?.status, proof.providerEvidence);
  if (!decisive || !decisiveContract || !exactRequest(decisive, decisiveContract, expected.projectRef)) return null;

  const supportSet = new Set();
  let previousSupport = 0;
  for (const ordinal of proof.supportingOrdinals) {
    const response = responseByOrdinal.get(ordinal);
    if (!Number.isSafeInteger(ordinal) || ordinal <= previousSupport || ordinal >= proof.decisiveOrdinal ||
        ordinal === proof.decisiveOrdinal || !response || response.kind !== 'read' || response.status < 200 || response.status >= 300 ||
        !exactRequest(response, { method: 'GET', path: '/auth/v1/user', kind: 'read' }, expected.projectRef) ||
        !proof.prerequisites.includes('pre_invalidation_session_valid')) return null;
    previousSupport = ordinal;
    supportSet.add(ordinal);
  }
  if (responseByOrdinal.size !== supportSet.size + 1 ||
      (expected.requireDurableBaseline === true && proof.purpose.startsWith('session_') && supportSet.size === 0)) return null;

  const requests = [...responseByOrdinal.values()].sort((left, right) => left.ordinal - right.ordinal).map(response => ({
    ordinal: response.ordinal,
    status: response.status,
    kind: response.kind,
    method: response.target.method,
    path: response.target.path,
    scope: response.target.scope,
    role: response.ordinal === proof.decisiveOrdinal ? 'decisive' : 'supporting',
    classification: response.ordinal === proof.decisiveOrdinal ? proof.classification : 'pre_invalidation_session_valid'
  }));
  const evidence = {
    version: 1,
    purpose: proof.purpose,
    classification: proof.classification,
    providerEvidence: proof.providerEvidence ?? null,
    decisiveOrdinal: proof.decisiveOrdinal,
    prerequisites: [...new Set(proof.prerequisites)].sort(),
    requests
  };
  const evidenceOrdinals = [...responseByOrdinal.keys()].sort((left, right) => left - right);
  return validateSessionResolutionJournalEvidence(expected.resourceKey, evidenceOrdinals, evidence) ? evidence : null;
}

/** Validate the safe semantic summary persisted in a session_resolution event. */
export function validateSessionResolutionJournalEvidence(resourceKey, ordinals, evidence) {
  if (typeof resourceKey !== 'string' || !Array.isArray(ordinals) || !exactKeys(evidence,
    ['version', 'purpose', 'classification', 'providerEvidence', 'decisiveOrdinal', 'prerequisites', 'requests']) || evidence.version !== 1 ||
      !Array.isArray(evidence.prerequisites) || !Array.isArray(evidence.requests) ||
      ordinals.length === 0 || evidence.requests.length !== ordinals.length) return false;
  const contract = purposeContract(evidence.purpose);
  if (!contract || !validPrerequisites(contract, evidence.prerequisites,
      evidence.requests.some(request => request?.role === 'supporting'))) return false;
  const roles = new Map();
  let previous = 0;
  for (let index = 0; index < evidence.requests.length; index++) {
    const request = evidence.requests[index];
    if (!exactKeys(request, ['ordinal', 'status', 'kind', 'method', 'path', 'scope', 'role', 'classification']) ||
        request.ordinal !== ordinals[index] || !Number.isSafeInteger(request.ordinal) || request.ordinal <= previous ||
        !Number.isInteger(request.status) || request.status < 100 || request.status > 599 ||
        typeof request.kind !== 'string' || typeof request.method !== 'string' || typeof request.path !== 'string' ||
        ![null, 'local'].includes(request.scope) || !['decisive', 'supporting'].includes(request.role) ||
        typeof request.classification !== 'string') return false;
    previous = request.ordinal;
    roles.set(request.ordinal, request);
  }
  const decisive = roles.get(evidence.decisiveOrdinal);
  const decisiveContract = proofExpected(evidence.purpose, evidence.classification, decisive?.status, evidence.providerEvidence);
  if (!decisive || decisive.role !== 'decisive' || decisive.classification !== evidence.classification ||
      decisive.method !== decisiveContract?.method || decisive.path !== decisiveContract?.path || decisive.kind !== decisiveContract?.kind ||
      decisive.scope !== (decisiveContract?.path === '/auth/v1/logout' ? 'local' : null)) return false;
  for (const request of evidence.requests) {
    if (request.ordinal === decisive.ordinal) continue;
    if (request.role !== 'supporting' || request.ordinal >= decisive.ordinal ||
        request.classification !== 'pre_invalidation_session_valid' || !evidence.prerequisites.includes('pre_invalidation_session_valid') ||
        request.method !== 'GET' || request.path !== '/auth/v1/user' || request.kind !== 'read' || request.scope !== null ||
        request.status < 200 || request.status >= 300) return false;
  }
  if (evidence.purpose.startsWith('session_') &&
      !evidence.requests.some(request => request.role === 'supporting' && request.classification === 'pre_invalidation_session_valid')) return false;
  return true;
}
