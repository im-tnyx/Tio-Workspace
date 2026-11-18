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
    bearersAuthenticated: 0, sessionIdClaimComparison: 'unavailable', wrongIdentity: false };
  if (!Array.isArray(results) || results.length !== 2 || !Array.isArray(probes)) return empty;
  const evidence = results.map((r, i) => inspectSession(r, expectedId, expectedEmail, probes[i]));
  const valid = evidence.filter(e => e.validResponse);
  const validated = evidence.filter(e => e.probeValidated);
  // Matching-UUID bearer /user proofs count even when refresh is absent (access-only).
  const bearersAuthenticated = results.reduce((count, r, i) => {
    if (!validUuid(expectedId) || evidence[i].wrongIdentity) return count;
    if (!authenticatedBearer(r, probes[i]) || probes[i].value.id !== expectedId) return count;
    return count + 1;
  }, 0);
  // Compare decoded claims only after both complete+probe validations. No database
  // session row is inspected by this classifier; JWT claims are diagnostics only.
  const sessionIdClaimComparison = validated.length !== 2 ||
    !validated.every(e => e.sessionId) ? 'unavailable' :
    validated[0].sessionId === validated[1].sessionId ? 'same' : 'different';
  const common = { validResponses: valid.length, probesValidated: validated.length,
    bearersAuthenticated, sessionIdClaimComparison,
    wrongIdentity: evidence.some(e => e.wrongIdentity) };
  if (common.wrongIdentity) return { ...common, result: 'FAIL' };
  if (results.some(transportError)) return { ...common, result: 'ERROR' };
  // Two complete authentication responses violate one-use even if session IDs coincide.
  if (valid.length === 2) return { ...common, result: 'FAIL' };
  // Two independently authenticated bearers also violate single-use (refresh optional).
  if (bearersAuthenticated === 2) return { ...common, result: 'FAIL' };
  if (valid.length === 1 && validated.length === 1 && validated[0].sessionId &&
      evidence.some(e => e.state === 'REJECTED')) {
    return { ...common, result: 'PASS' };
  }
  return { ...common, result: 'INCONCLUSIVE' };
}

export function classifyReplay(first, second, id, email, firstProbe, secondProbe = null) {
  const firstEvidence = inspectSession(first, id, email, firstProbe);
  const secondEvidence = inspectSession(second, id, email, secondProbe);
  // Identity failures are decisive before transport or incomplete-evidence short-circuits.
  if (firstEvidence.wrongIdentity || secondEvidence.wrongIdentity) return 'FAIL';

  const expectedOk = validUuid(id);
  const firstAuthenticated = firstEvidence.validResponse || firstEvidence.probeValidated ||
    (expectedOk && authenticatedBearer(first, firstProbe) && firstProbe.value.id === id);
  const secondMatchingBearer = expectedOk && authenticatedBearer(second, secondProbe) &&
    secondProbe.value.id === id;
  // Access-only replay with a matching authenticated bearer is single-use FAIL (refresh optional).
  if (firstAuthenticated && secondMatchingBearer) return 'FAIL';
  // Two complete authentication responses remain FAIL even without second-probe input.
  if (firstEvidence.validResponse && secondEvidence.validResponse) return 'FAIL';

  if (transportError(first) || transportError(second)) return 'ERROR';
  // Strict PASS: validated first positive control + recognized second OTP rejection.
  if (firstEvidence.probeValidated && firstEvidence.sessionId && rejected(second)) return 'PASS';
  return 'INCONCLUSIVE';
}

export function classifyNegative(result) {
  if (transportError(result)) return 'ERROR';
  if (infrastructure(result)) return 'INCONCLUSIVE';
  return rejected(result) ? 'PASS' : result.status === 200 &&
    result.value?.access_token && result.value?.refresh_token ? 'FAIL' : 'INCONCLUSIVE';
}

export function classifyPurposeCrossing(verifyResult, options = {}) {
  const {
    expectedId = '',
    expectedEmail = '',
    probe = null,
    positiveControlValidated = false,
  } = options;
  const id = validUuid(expectedId) ? expectedId : '';
  const email = typeof expectedEmail === 'string' ? expectedEmail : '';

  // Decisive wrong-purpose authentication cannot be hidden by later control/transport failures.
  if (id && email) {
    const evidence = inspectSession(verifyResult, id, email, probe);
    if (evidence.wrongIdentity || evidence.validResponse || evidence.probeValidated) return 'FAIL';
  }
  if (completeAuthResponse(verifyResult, id || undefined)) return 'FAIL';
  if (authenticatedBearer(verifyResult, probe)) {
    // Matching or mismatched authenticated UUID are both purpose-isolation failures.
    return 'FAIL';
  }

  if (transportError(verifyResult) || (probe && transportError(probe))) return 'ERROR';
  if (infrastructure(verifyResult)) return 'INCONCLUSIVE';
  if (rejected(verifyResult)) return positiveControlValidated ? 'PASS' : 'INCONCLUSIVE';
  return 'INCONCLUSIVE';
}

function recognizedWrongOtp(r) {
  // Only an explicit GoTrue invalid/expired OTP rejection counts as a processed wrong attempt.
  return rejected(r);
}

function completeAuthResponse(r, id) {
  return r?.status === 200 && validUuid(r.value?.user?.id) &&
    (id === undefined || r.value.user.id === id) &&
    typeof r.value?.access_token === 'string' && Boolean(r.value.access_token) &&
    typeof r.value?.refresh_token === 'string' && Boolean(r.value.refresh_token);
}

function completeAuthResponseAny(r) {
  // Any structurally complete authentication response, regardless of expected UUID.
  return completeAuthResponse(r);
}

function authenticatedBearer(result, probe) {
  // The harness probes /user with this verify response's access token.
  return !transportError(result) && result.status === 200 &&
    typeof result.value?.access_token === 'string' && Boolean(result.value.access_token) &&
    !transportError(probe) && probe.status === 200 && validUuid(probe.value?.id);
}

export function classifyFiveWrong(wrong, correct, id, options = {}) {
  const out = (result, kind) => ({ result, kind });
  const { correctProbe = null, wrongProbes = [] } = options;
  if (!Array.isArray(wrong) || wrong.length !== 5) return out('ERROR', 'invalid_input');
  const expectedOk = validUuid(id);
  // A complete wrong-code authentication is decisive even if a later request fails.
  if (wrong.some(r => completeAuthResponseAny(r))) return out('FAIL', 'wrong_code_auth');
  // Access-only wrong-code bearers must be probed 1:1; confirmed auth fails closed.
  if (Array.isArray(wrongProbes)) {
    for (let i = 0; i < wrong.length; i++) {
      const attempt = wrong[i];
      const attemptProbe = wrongProbes[i];
      if (!authenticatedBearer(attempt, attemptProbe)) continue;
      if (expectedOk && attemptProbe.value.id !== id) return out('FAIL', 'wrong_identity');
      return out('FAIL', 'wrong_code_auth');
    }
  }

  const correctCompleteAny = completeAuthResponseAny(correct);
  const correctBearer = authenticatedBearer(correct, correctProbe);
  const responseId = correct?.value?.user?.id;
  const probeId = correctProbe?.value?.id;

  // Proven wrong-identity auth is independent of earlier wrong-attempt infrastructure errors.
  if (expectedOk) {
    if (correctCompleteAny && responseId !== id) return out('FAIL', 'wrong_identity');
    if (correctBearer && validUuid(probeId) && probeId !== id) {
      return out('FAIL', 'wrong_identity');
    }
  }

  if (wrong.some(transportError) || transportError(correct)) return out('ERROR', 'transport');
  // Cooldown verdict requires five recognized OTP rejections, not generic 4xx/429/5xx.
  if (!wrong.every(recognizedWrongOtp)) return out('INCONCLUSIVE', 'unrecognized_wrong');
  // Matching expected UUID + complete auth = cooldown non-enforcement.
  if (expectedOk && completeAuthResponse(correct, id)) return out('FAIL', 'cooldown_bypass');
  // Access-only correct response still proves cooldown bypass when bearer /user matches.
  if (expectedOk && correctBearer && probeId === id) return out('FAIL', 'cooldown_bypass');
  // Missing/malformed UUID or incomplete tokens never confirm cooldown or wrong identity.
  return out('INCONCLUSIVE', 'incomplete_correct');
}

export function classifyRecoveryControl(verifyResult, expectedId, expectedEmail, probe = null) {
  // Same-purpose recovery positive control: confirmed wrong UUID fails closed.
  if (!validUuid(expectedId)) return 'INCONCLUSIVE';
  const evidence = inspectSession(verifyResult, expectedId, expectedEmail, probe);
  if (evidence.wrongIdentity) return 'FAIL';
  if (evidence.state === 'ERROR' || (probe && transportError(probe))) return 'ERROR';
  if (evidence.validResponse && evidence.probeValidated) return 'PASS';
  return 'INCONCLUSIVE';
}

export function classifyRecoveryPurposeCrossing(wrongPurposeResult, recoveryResult,
  expectedId, expectedEmail, recoveryProbe = null, wrongPurposeProbe = null) {
  const crossing = classifyPurposeCrossing(wrongPurposeResult,
    { expectedId, expectedEmail, probe: wrongPurposeProbe, positiveControlValidated: false });
  if (crossing === 'FAIL') return { result: 'FAIL', finding: 'purpose_crossover' };
  if (crossing === 'ERROR') return { result: 'ERROR', finding: 'purpose_transport' };
  if (!rejected(wrongPurposeResult)) {
    return { result: crossing === 'ERROR' ? 'ERROR' : 'INCONCLUSIVE',
      finding: 'purpose_evidence_incomplete' };
  }

  const recovery = classifyRecoveryControl(recoveryResult, expectedId, expectedEmail, recoveryProbe);
  if (recovery === 'FAIL') return { result: 'FAIL', finding: 'recovery_control_wrong_identity' };
  if (recovery === 'PASS') {
    return { result: 'PASS', finding: 'purpose_isolated' };
  }
  return { result: recovery === 'ERROR' ? 'ERROR' : 'INCONCLUSIVE',
    finding: 'recovery_control_unavailable', recovery };
}

export function classifyOldCodeInvalidation(oldResult, newResult, id, email, options = {}) {
  const { distinctCodes = false, oldProbe = null, newProbe = null } = options;
  // A new challenge must be accepted and codes confirmed distinct before judging invalidation.
  if (!distinctCodes) return 'INCONCLUSIVE';
  const oldEvidence = inspectSession(oldResult, id, email, oldProbe);
  const newEvidence = inspectSession(newResult, id, email, newProbe);
  if (oldEvidence.wrongIdentity || newEvidence.wrongIdentity) return 'FAIL';
  // Successful old-code authentication is already an invalidation violation.
  if (completeAuthResponse(oldResult) || oldEvidence.validResponse ||
      oldEvidence.probeValidated) return 'FAIL';
  if (authenticatedBearer(oldResult, oldProbe)) return 'FAIL';
  // Only unresolved evidence is affected by later transport or probe failures.
  if ([oldResult, newResult].some(transportError) ||
      [oldProbe, newProbe].some(probe => probe && transportError(probe))) return 'ERROR';
  // Recognized old-code rejection needs a usable new-code positive control for PASS.
  if (oldEvidence.state === 'REJECTED') {
    if (newEvidence.probeValidated) return 'PASS';
    return 'INCONCLUSIVE';
  }
  return 'INCONCLUSIVE';
}

function currentPasswordPolicyDenial(update) {
  // Only documented GoTrue current-password policy denials prove AUTH-17 enforcement.
  // Observed in Task 06A/06B: current_password_required / current_password_invalid.
  return update?.status === 400 &&
    (update.value?.error_code === 'current_password_required' ||
      update.value?.error_code === 'current_password_invalid');
}

function completeAuthForOtherUuid(grant, expectedId) {
  // Only a structurally complete session for a different valid UUID is cross-identity proof.
  return grant?.status === 200 && validUuid(expectedId) && validUuid(grant.value?.user?.id) &&
    grant.value.user.id !== expectedId &&
    typeof grant.value?.access_token === 'string' && Boolean(grant.value.access_token) &&
    typeof grant.value?.refresh_token === 'string' && Boolean(grant.value.refresh_token);
}

function wrongUuidBearer(grant, probe, expectedId) {
  // Access token + GET /user for a different valid UUID, even if grant body claims expectedId.
  return validUuid(expectedId) && authenticatedBearer(grant, probe) && probe.value.id !== expectedId;
}

function matchingPasswordAuth(grant, grantProbe, expectedId) {
  // Complete session or access-only bearer authenticated as the expected UUID.
  if (!validUuid(expectedId)) return false;
  if (grant?.status === 200 && grant.value?.user?.id === expectedId &&
      typeof grant.value?.access_token === 'string' && Boolean(grant.value.access_token) &&
      typeof grant.value?.refresh_token === 'string' && Boolean(grant.value.refresh_token)) {
    return true;
  }
  return authenticatedBearer(grant, grantProbe) && grantProbe.value.id === expectedId;
}

export function classifyPasswordMutation({
  beforeGrant, beforeProbe, update, oldGrant, newGrant, id,
  oldGrantProbe = null, newGrantProbe = null,
}) {
  const out = (result, kind) => ({ result, kind });
  // Baseline cross-identity evidence is decisive before "control unavailable" short-circuits.
  if (completeAuthForOtherUuid(beforeGrant, id) || wrongUuidBearer(beforeGrant, beforeProbe, id)) {
    return out('FAIL', 'identity_violation');
  }
  // Post-mutation grants: complete or access-only wrong-UUID bearer fails closed first.
  if (completeAuthForOtherUuid(oldGrant, id) || completeAuthForOtherUuid(newGrant, id) ||
      wrongUuidBearer(oldGrant, oldGrantProbe, id) || wrongUuidBearer(newGrant, newGrantProbe, id)) {
    return out('FAIL', 'identity_violation');
  }
  if ([beforeGrant, beforeProbe].some(r => r?.kind && transportError(r))) {
    return out('ERROR', 'transport');
  }
  if (beforeGrant?.status !== 200 || beforeGrant.value?.user?.id !== id ||
      !beforeGrant.value?.access_token || !beforeGrant.value?.refresh_token ||
      beforeProbe?.status !== 200 || beforeProbe.value?.id !== id) {
    return out('INCONCLUSIVE', 'inconclusive_control');
  }
  // Update transport without a usable update body cannot prove mutation.
  if (transportError(update)) return out('ERROR', 'transport');
  // Unauthorized mutation is proven when update succeeds and the new password authenticates.
  // Old-grant rejection is diagnostic only and must not gate or conceal this FAIL.
  if (update.status === 200 && matchingPasswordAuth(newGrant, newGrantProbe, id)) {
    return out('FAIL', 'password_mutation_bypass');
  }
  if ([oldGrant, newGrant].some(transportError)) return out('ERROR', 'transport');
  if ([update, oldGrant, newGrant].some(infrastructure)) {
    return out('INCONCLUSIVE', 'inconclusive_control');
  }
  // Generic 4xx/session_not_found/validation_failed are not current-password enforcement.
  if (currentPasswordPolicyDenial(update) &&
      matchingPasswordAuth(oldGrant, oldGrantProbe, id) &&
      newGrant.status === 400 && newGrant.value?.error_code === 'invalid_credentials') {
    return out('PASS', 'current_password_enforced');
  }
  return out('INCONCLUSIVE', 'inconclusive_control');
}

export function classifyOtpSessionControl(verifyResult, expectedId, expectedEmail = '', probe = null) {
  const out = (result, kind) => ({ result, kind });
  if (!validUuid(expectedId)) return out('INCONCLUSIVE', 'inconclusive_control');
  const email = typeof expectedEmail === 'string' ? expectedEmail : '';
  const evidence = inspectSession(verifyResult, expectedId, email, probe);
  // Confirmed wrong-UUID OTP authentication fails closed before requireSession/exceptions.
  if (evidence.wrongIdentity || wrongUuidBearer(verifyResult, probe, expectedId)) {
    return out('FAIL', 'identity_violation');
  }
  if (evidence.state === 'ERROR') return out('ERROR', 'transport');
  if (probe && transportError(probe) && !evidence.validResponse) return out('ERROR', 'transport');
  if (evidence.validResponse && evidence.probeValidated) return out('PASS', 'otp_control');
  return out('INCONCLUSIVE', 'inconclusive_control');
}

export function planAuth17OtpControlAbort(otpControl) {
  // Pure reporting plan: every OTP abort also emits AUTH17_PASSWORD_MUTATION once.
  if (!otpControl || otpControl.result === 'PASS') return null;
  const kind = otpControl.kind || 'inconclusive_control';
  if (otpControl.kind === 'identity_violation' || otpControl.result === 'FAIL') {
    return {
      otpSession: { result: 'FAIL', kind },
      passwordMutation: { result: 'FAIL', kind, mutation: 'NOT TESTED' },
    };
  }
  if (otpControl.result === 'ERROR') {
    return {
      otpSession: { result: 'ERROR', kind },
      passwordMutation: { result: 'ERROR', kind, mutation: 'NOT TESTED' },
    };
  }
  return {
    otpSession: { result: 'INCONCLUSIVE', kind },
    passwordMutation: { result: 'INCONCLUSIVE', kind, mutation: 'NOT TESTED' },
  };
}

export function classifyInvalidCode(wrongResult, correctResult, id, email, options = {}) {
  const { wrongProbe = null, correctProbe = null } = options;
  const wrongEvidence = inspectSession(wrongResult, id, email, wrongProbe);
  const correctEvidence = inspectSession(correctResult, id, email, correctProbe);
  if (wrongEvidence.wrongIdentity || correctEvidence.wrongIdentity) return 'FAIL';
  // Authenticated wrong OTP is already a security failure.
  if (completeAuthResponse(wrongResult) || wrongEvidence.validResponse ||
      wrongEvidence.probeValidated) return 'FAIL';
  if (authenticatedBearer(wrongResult, wrongProbe)) return 'FAIL';
  // A later failed request cannot erase decisive wrong-code authentication.
  if ([wrongResult, correctResult].some(transportError) ||
      [wrongProbe, correctProbe].some(probe => probe && transportError(probe))) return 'ERROR';
  // Recognized rejection needs a usable correct-code positive control for PASS.
  if (wrongEvidence.state === 'REJECTED') {
    if (correctEvidence.probeValidated) return 'PASS';
    return 'INCONCLUSIVE';
  }
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
