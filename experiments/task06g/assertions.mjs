// LOCAL ONLY classifications. Decoded claims are diagnostics, never authorization.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validUuid = value => typeof value === 'string' && uuid.test(value);
const transportError = r => !r || ['network_error', 'timeout', 'invalid_json'].includes(r.kind);
const noSession = r => !r?.value?.access_token && !r?.value?.refresh_token;
const rejected = r => r?.status === 403 && r.value?.error_code === 'otp_expired' && noSession(r);
const infrastructure = r => r?.status === 429 || r?.status >= 500;

function claimsFrom(token) {
  try {
    if (typeof token !== 'string' || token.split('.').length !== 3) return null;
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return claims && typeof claims === 'object' ? claims : null;
  } catch { return null; }
}

export function inspectSession(r, expectedId, expectedEmail, getUser) {
  const base = { validResponse: false, probeValidated: false, wrongIdentity: false,
    sessionId: null, claimsAvailable: false };
  if (transportError(r)) return { ...base, state: 'ERROR' };
  if (rejected(r)) return { ...base, state: 'REJECTED' };
  if (r.status !== 200 || !r.value || typeof r.value !== 'object') {
    return { ...base, state: 'INCONCLUSIVE' };
  }
  if (!validUuid(expectedId)) return { ...base, state: 'INCONCLUSIVE' };
  const v = r.value;
  const hasAccess = typeof v.access_token === 'string' && Boolean(v.access_token);
  const hasRefresh = typeof v.refresh_token === 'string' && Boolean(v.refresh_token);
  const responseIdValid = validUuid(v.user?.id);
  const completeResponse = hasAccess && hasRefresh && responseIdValid;
  const authenticatedProbe = hasAccess && getUser?.status === 200 &&
    !transportError(getUser) && validUuid(getUser.value?.id);
  const wrongResponseIdentity = (responseIdValid && v.user.id !== expectedId) ||
    (typeof v.user?.email === 'string' && v.user.email.toLowerCase() !== expectedEmail.toLowerCase());
  if ((wrongResponseIdentity && (completeResponse || authenticatedProbe)) ||
      (authenticatedProbe && getUser.value.id !== expectedId)) {
    return { ...base, state: 'WRONG_IDENTITY', wrongIdentity: true };
  }
  if (!completeResponse || typeof v.user.email !== 'string' || !v.user.email) {
    return { ...base, state: 'INCONCLUSIVE' };
  }
  const claims = claimsFrom(v.access_token);
  // JWT payloads are unverified diagnostics. They never establish authentication.
  const validResponse = { ...base, state: 'VALID_RESPONSE', validResponse: true,
    claimsAvailable: Boolean(claims),
    sessionId: validUuid(claims?.session_id) ? claims.session_id : null };
  if (!authenticatedProbe) return validResponse;
  return { ...validResponse, state: 'VALIDATED', probeValidated: true };
}

export function classifyConcurrent(results, expectedId, expectedEmail, probes = []) {
  const empty = { result: 'INCONCLUSIVE', validResponses: 0, probesValidated: 0,
    sessionIdClaimComparison: 'unavailable', wrongIdentity: false };
  if (!Array.isArray(results) || results.length !== 2 || !Array.isArray(probes)) return empty;
  const evidence = results.map((r, i) => inspectSession(r, expectedId, expectedEmail, probes[i]));
  const valid = evidence.filter(e => e.validResponse);
  const validated = evidence.filter(e => e.probeValidated);
  // Compare decoded claims only after both bearer probes succeed. No database
  // session row is inspected by this classifier.
  const sessionIdClaimComparison = validated.length !== 2 ||
    !validated.every(e => e.sessionId) ? 'unavailable' :
    validated[0].sessionId === validated[1].sessionId ? 'same' : 'different';
  const common = { validResponses: valid.length, probesValidated: validated.length,
    sessionIdClaimComparison,
    wrongIdentity: evidence.some(e => e.wrongIdentity) };
  if (common.wrongIdentity) return { ...common, result: 'FAIL' };
  if (results.some(transportError)) return { ...common, result: 'ERROR' };
  // Two complete authentication responses violate one-use even if session IDs coincide.
  if (valid.length === 2) return { ...common, result: 'FAIL' };
  if (valid.length === 1 && validated.length === 1 && validated[0].sessionId &&
      evidence.some(e => e.state === 'REJECTED')) {
    return { ...common, result: 'PASS' };
  }
  return { ...common, result: 'INCONCLUSIVE' };
}

export function classifyReplay(first, second, id, email, firstProbe) {
  const firstEvidence = inspectSession(first, id, email, firstProbe);
  const secondEvidence = inspectSession(second, id, email);
  if (firstEvidence.wrongIdentity || secondEvidence.wrongIdentity) return 'FAIL';
  if (transportError(first) || transportError(second)) return 'ERROR';
  if (firstEvidence.validResponse && secondEvidence.validResponse) return 'FAIL';
  if (firstEvidence.probeValidated && firstEvidence.sessionId && rejected(second)) return 'PASS';
  return 'INCONCLUSIVE';
}

export function classifyNegative(result) {
  if (transportError(result)) return 'ERROR';
  if (infrastructure(result)) return 'INCONCLUSIVE';
  return rejected(result) ? 'PASS' : result.status === 200 &&
    result.value?.access_token && result.value?.refresh_token ? 'FAIL' : 'INCONCLUSIVE';
}

export function classifyFiveWrong(wrong, correct, id) {
  if (!Array.isArray(wrong) || wrong.length !== 5 || wrong.some(transportError) ||
      transportError(correct)) return 'ERROR';
  if (wrong.some(r => r.status < 400 || !noSession(r))) return 'FAIL';
  if (correct.status === 200 && correct.value?.user?.id === id &&
      correct.value?.access_token && correct.value?.refresh_token) return 'FAIL';
  return 'INCONCLUSIVE'; // A generic/429 denial cannot prove a 15-minute challenge lock.
}

export function classifyPasswordMutation({ beforeGrant, beforeProbe, update, oldGrant, newGrant, id }) {
  if ([beforeGrant, beforeProbe].some(r => r?.kind && transportError(r))) return 'ERROR';
  if (beforeGrant?.status !== 200 || beforeGrant.value?.user?.id !== id ||
      !beforeGrant.value?.access_token || !beforeGrant.value?.refresh_token ||
      beforeProbe?.status !== 200 || beforeProbe.value?.id !== id) return 'INCONCLUSIVE';
  if ([update, oldGrant, newGrant].some(transportError)) return 'ERROR';
  if ([update, oldGrant, newGrant].some(infrastructure)) return 'INCONCLUSIVE';
  if (update.status === 200 && oldGrant.status === 400 &&
      oldGrant.value?.error_code === 'invalid_credentials' &&
      newGrant.status === 200 && newGrant.value?.user?.id === id &&
      newGrant.value?.access_token && newGrant.value?.refresh_token) return 'FAIL';
  if (update.status >= 400 && update.status < 500 && update.value?.error_code &&
      oldGrant.status === 200 && oldGrant.value?.user?.id === id &&
      oldGrant.value?.access_token && oldGrant.value?.refresh_token &&
      newGrant.status === 400 && newGrant.value?.error_code === 'invalid_credentials') return 'PASS';
  return 'INCONCLUSIVE';
}

export function classifyResendTiming(first, attempts) {
  const empty = { result: 'INCONCLUSIVE', exactBoundary: 'INCONCLUSIVE',
    immediateRejected: false, acceptedAfter60: false, lowerBoundMs: null, upperBoundMs: null };
  if (first && transportError(first.result)) return { ...empty, result: 'ERROR' };
  if (!first || first.result?.status !== 200 || !Array.isArray(attempts) || !attempts.length) return empty;
  if (attempts.some(a => !a || transportError(a.result))) return { ...empty, result: 'ERROR' };
  if (![first, ...attempts].every(a => Number.isFinite(a.dispatchAt) &&
      Number.isFinite(a.responseAt) && a.responseAt >= a.dispatchAt) ||
      attempts.some(a => a.dispatchAt < first.responseAt)) return empty;
  const immediate = attempts[0];
  const immediateRejected = immediate.dispatchAt >= first.responseAt &&
    immediate.dispatchAt - first.responseAt < 60000 && immediate.result.status === 429 &&
    immediate.result.value?.error_code === 'over_email_send_rate_limit';
  const accepted = attempts.find(a => a.result.status === 200);
  if (!accepted) return { ...empty, immediateRejected };
  const lowerBoundMs = Math.max(0, accepted.dispatchAt - first.responseAt);
  const upperBoundMs = Math.max(0, accepted.responseAt - first.dispatchAt);
  const acceptedAfter60 = lowerBoundMs >= 60000;
  const earlyAccepted = attempts.some(a => a.result.status === 200 &&
    a.responseAt - first.dispatchAt < 60000);
  return { result: earlyAccepted ? 'FAIL' : immediateRejected && acceptedAfter60 ? 'PASS' : 'INCONCLUSIVE',
    exactBoundary: 'INCONCLUSIVE', immediateRejected, acceptedAfter60,
    lowerBoundMs, upperBoundMs };
}

export function safeStatus(r) {
  if (!r) return 'not_probed';
  if (transportError(r)) return r?.kind === 'invalid_json' ? 'invalid_json' : 'network_or_timeout';
  const code = r?.value?.error_code;
  return `${Number.isInteger(r?.status) ? r.status : 'unknown'}/${typeof code === 'string' &&
    /^[a-z_]{1,50}$/.test(code) ? code : 'none'}`;
}
