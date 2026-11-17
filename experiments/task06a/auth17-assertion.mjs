// Pure classifier for the disposable Task 06A Auth proof. No hosted calls.
// Task 06B observed 400/current_password_required when the strict current-password
// policy denied PUT /user. An arbitrary Auth error is not evidence of that policy.
const validResponse = response => response && typeof response === 'object' &&
  Number.isInteger(response.status) && typeof response.ok === 'boolean' &&
  response.value && typeof response.value === 'object' &&
  !Array.isArray(response.value);

const validLogin = (response, userId) => response.status === 200 && response.ok &&
  response.value.user?.id === userId &&
  typeof response.value.access_token === 'string' && response.value.access_token.length > 0;

const invalidLogin = response => response.status === 400 && !response.ok &&
  response.value.error_code === 'invalid_credentials';

export function classifyAuth17(directUpdate, originalLogin, replacementLogin, userId) {
  if (typeof userId !== 'string' || !userId ||
      ![originalLogin, replacementLogin].every(validResponse)) {
    return { result: 'ERROR', evidence: 'Missing or malformed Auth response; policy outcome unverified' };
  }

  // Verified sign-ins outrank an unreliable update response: the security
  // requirement has failed if the old password is invalid and the new one works.
  if (invalidLogin(originalLogin) && validLogin(replacementLogin, userId)) {
    return { result: 'FAIL', evidence: 'Original password invalid and replacement valid after direct update attempt' };
  }

  if (!validResponse(directUpdate)) {
    return { result: 'ERROR', evidence: 'Missing or malformed Auth response; policy outcome unverified' };
  }

  if ([directUpdate, originalLogin, replacementLogin].some(response =>
    response.status === 429 || response.status >= 500)) {
    return { result: 'INCONCLUSIVE', evidence: 'Rate limit or server error; policy outcome unverified' };
  }

  if (directUpdate.status === 400 && !directUpdate.ok &&
      directUpdate.value.error_code === 'current_password_required' &&
      validLogin(originalLogin, userId) && invalidLogin(replacementLogin)) {
    return { result: 'PASS', evidence: 'Policy denied direct update; original password valid; replacement invalid' };
  }

  return { result: 'INCONCLUSIVE', evidence: 'Auth responses do not prove policy denial or password replacement' };
}
