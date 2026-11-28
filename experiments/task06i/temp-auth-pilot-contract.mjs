export const TEMP_AUTH_PROJECT = 'wvdabiwbaavfggcmpizd';
export const TEMP_AUTH_ORIGIN = `https://${TEMP_AUTH_PROJECT}.supabase.co`;
export const TEMP_AUTH_PROBES = Object.freeze(['HOOK-01', 'SESSION-01']);

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function tempAuthRequestPlan(seedUserId) {
  if (typeof seedUserId !== 'string' || !uuid.test(seedUserId)) {
    throw new Error('TEMP_AUTH_INVALID_SEED_UUID');
  }
  const adminUsers = '/auth/v1/admin/users';
  const exactUser = `${adminUsers}/${seedUserId}`;
  return Object.freeze([
    ['GET', exactUser],
    ['POST', adminUsers],
    ['GET', exactUser],
    ['POST', '/auth/v1/token?grant_type=password'],
    ['GET', '/auth/v1/user'],
    ['POST', '/auth/v1/logout?scope=local'],
    ['DELETE', exactUser],
    ['GET', exactUser]
  ].map(([method, path]) => Object.freeze({ method, url: TEMP_AUTH_ORIGIN + path })));
}

export function assertTempAuthRequest(plan, method, url) {
  if (!plan.some(entry => entry.method === method && entry.url === url)) {
    throw new Error('TEMP_AUTH_REQUEST_OUTSIDE_ALLOWLIST');
  }
}

export function assertTempAuthFixtureResponse(method, url, response) {
  const { status, ok, body } = response;
  if (ok !== (status >= 200 && status < 300)) {
    throw new Error('TEMP_AUTH_RESPONSE_STATUS_MISMATCH');
  }
  if (status >= 300 && status < 400) {
    throw new Error('TEMP_AUTH_REDIRECT_REJECTED');
  }
  if (method === 'GET' && status === 404 && url.startsWith(TEMP_AUTH_ORIGIN + '/auth/v1/admin/users/')) {
    const codes = [body?.error_code, body?.code].filter(code => code !== undefined);
    if (codes.length === 0 || codes.some(code => code !== 'user_not_found')) {
      throw new Error('TEMP_AUTH_USER_ABSENCE_UNPROVEN');
    }
  }
  if (method === 'POST' && url === TEMP_AUTH_ORIGIN + '/auth/v1/logout?scope=local' &&
      status >= 200 && status < 300 && status !== 204) {
    throw new Error('TEMP_AUTH_LOGOUT_ACKNOWLEDGEMENT_UNPROVEN');
  }
}
