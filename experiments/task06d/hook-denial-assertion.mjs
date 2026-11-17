// Pure assertions for Task 06D's pinned GoTrue v2.197.0 HTTP hook clone.
// This clone returns HTTP 500 for deliberate token denial. GoTrue exposes
// 500/unexpected_failure, so that response is proof only with the matching
// invocation recorded during the awaited request.
const validResponse = response => response && typeof response === 'object' &&
  Number.isInteger(response.status) && typeof response.ok === 'boolean' &&
  response.value && typeof response.value === 'object' &&
  !Array.isArray(response.value);

const recentTokenEvents = (events, startIndex) => {
  if (!Array.isArray(events) || !Number.isInteger(startIndex) ||
      startIndex < 0 || startIndex > events.length) return null;
  return events.slice(startIndex).filter(event => event?.kind === 'token');
};

const matchingEvent = (events, userId, method, denied, status) =>
  events.length === 1 && events[0].userId === userId &&
  events[0].method === method && events[0].denied === denied &&
  events[0].status === status;

export function classifyHookDenial(response, events, startIndex, userId, method) {
  const recent = recentTokenEvents(events, startIndex);
  if (typeof userId !== 'string' || !userId || typeof method !== 'string' ||
      !method || recent === null || !validResponse(response)) {
    return { result: 'ERROR', observed: 'Missing or malformed response/event evidence' };
  }

  if (response.status === 200 && response.ok &&
      typeof response.value.access_token === 'string' && response.value.access_token) {
    return { result: 'FAIL', observed: 'Token issued despite intended hook denial' };
  }

  if (response.status === 500 && !response.ok &&
      response.value.error_code === 'unexpected_failure' &&
      matchingEvent(recent, userId, method, true, 500)) {
    return { result: 'PASS', observed: '500/unexpected_failure with matching denied token hook' };
  }

  if (response.status === 429 || response.status >= 500 ||
      (response.ok && response.status >= 200 && response.status < 300)) {
    return { result: 'INCONCLUSIVE', observed: 'Rate limit, server error, or unexpected success shape' };
  }

  return { result: 'INCONCLUSIVE', observed: 'No matching hook denial for Auth rejection' };
}

export function classifyHookPasswordLogin(response, events, startIndex, userId) {
  const recent = recentTokenEvents(events, startIndex);
  if (typeof userId !== 'string' || !userId || recent === null || !validResponse(response)) {
    return { result: 'ERROR', observed: 'Missing or malformed password-login evidence' };
  }

  if (response.status === 200 && response.ok &&
      response.value.user?.id === userId &&
      typeof response.value.access_token === 'string' && response.value.access_token &&
      matchingEvent(recent, userId, 'password', false, 200)) {
    return { result: 'PASS', observed: 'Password login succeeded with matching allowed token hook' };
  }

  if (response.status === 429 || response.status >= 500) {
    return { result: 'INCONCLUSIVE', observed: 'Rate limit or server error during password login' };
  }

  return { result: 'FAIL', observed: 'Password login or matching allow event missing' };
}
