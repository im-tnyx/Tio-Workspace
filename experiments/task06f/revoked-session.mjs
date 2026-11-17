// Task 06F: isolated LOCAL-ONLY direct-HTTP hypothesis for Auth /user after
// session revocation on disposable GoTrue. This is NOT managed/hosted proof,
// NOT AUTH-17 acceptance, and NOT a JWT-consumer (PostgREST/Data API) test.
// Never prints credentials, OTP codes, access/refresh tokens or keys.
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';

const cli = process.env.SUPABASE_CLI;
if (!cli) throw new Error('Set SUPABASE_CLI to the pinned local executable');
let local;
try {
  local = JSON.parse(execFileSync(cli, ['status', '--workdir', 'experiments/task06f', '--output', 'json'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: '1' },
  }));
} catch {
  throw new Error('Task 06F local CLI status unavailable');
}
// Prefer loopback clients even when Docker may publish host ports on 0.0.0.0.
if (new URL(local.API_URL).host !== '127.0.0.1:55521' ||
    new URL(local.MAILPIT_URL).host !== '127.0.0.1:55524' ||
    !local.PUBLISHABLE_KEY?.startsWith('sb_publishable_') || !local.SERVICE_ROLE_KEY) {
  throw new Error('Unexpected Task 06F local-only stack');
}
const source = JSON.parse(execFileSync('docker', ['inspect', 'supabase_auth_tio-task06f-cutover'], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
}))[0];
if (source.Config.Image !== 'public.ecr.aws/supabase/gotrue:v2.197.0' ||
    !source.NetworkSettings.Networks['supabase_network_tio-task06f-cutover']) {
  throw new Error('Unexpected Task 06F GoTrue image or network');
}

const rows = [];
const usedMail = new Set();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const email = () => `task06f-${randomUUID().slice(0, 12)}@example.invalid`;
const password = () => `Tio8!${randomBytes(14).toString('hex')}`;
const record = (id, pass, detail) => rows.push({ id, result: pass ? 'PASS' : 'FAIL', detail });
const brief = result => `${result.status}/${result.value.error_code ?? 'none'}`;

/** Auth /user denial after session delete — unrelated PUT failures must not PASS. */
function authUserSessionDenied(getResult, putResult) {
  return getResult.status === 403 && getResult.value.error_code === 'session_not_found' &&
    putResult.status === 403 && putResult.value.error_code === 'session_not_found';
}

async function call(path, { body, bearer, admin = false, method = 'POST' } = {}) {
  const response = await fetch(`${local.API_URL}/auth/v1${path}`, {
    method,
    headers: {
      apikey: admin ? local.SERVICE_ROLE_KEY : local.PUBLISHABLE_KEY,
      'content-type': 'application/json',
      ...(admin ? { authorization: `Bearer ${local.SERVICE_ROLE_KEY}` } : {}),
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, ok: response.ok,
    value: await response.json().catch(() => ({})) };
}
function requireOk(result, step) {
  if (!result.ok) throw new Error(`${step}: ${brief(result)}`);
  return result.value;
}
async function messages() {
  const response = await fetch(`${local.MAILPIT_URL}/api/v1/messages?limit=100`);
  if (!response.ok) throw new Error(`Mailpit: HTTP ${response.status}`);
  return (await response.json()).messages ?? [];
}
async function codeFor(address) {
  for (let n = 0; n < 35; n++) {
    for (const item of await messages()) {
      if (usedMail.has(item.ID) || !item.Subject?.includes('local signup') ||
          !item.To?.some(to => to.Address?.toLowerCase() === address)) continue;
      const response = await fetch(`${local.MAILPIT_URL}/api/v1/message/${item.ID}`);
      const detail = await response.json();
      const code = `${detail.Text ?? ''} ${detail.HTML ?? ''}`.match(/\b\d{6}\b/)?.[0];
      if (code) { usedMail.add(item.ID); return code; }
    }
    await sleep(300);
  }
  throw new Error('Local code capture timed out');
}
async function prepareExistingUser() {
  const address = email(), initial = password();
  // Admin create/update uses service_role — server-only trust boundary; never Expo/client.
  const created = requireOk(await call('/admin/users', {
    admin: true, body: { email: address, password: initial, email_confirm: true },
  }), 'admin create');
  const passwordSession = await call('/token?grant_type=password',
    { body: { email: address, password: initial } });
  record('LOCAL_PASSWORD_LOGIN_BEFORE_CUTOVER',
    passwordSession.status === 200 && passwordSession.value.user?.id === created.id,
    `grant=${brief(passwordSession)}; same_uuid=${passwordSession.value.user?.id === created.id}`);
  // Native /otp remains enabled in this disposable config — residual bypass, not a closed boundary.
  requireOk(await call('/otp', { body: { email: address, create_user: false } }), 'OTP send');
  const code = await codeFor(address);
  const otpSession = requireOk(await call('/verify', {
    body: { email: address, token: code, type: 'email' },
  }), 'OTP verify');
  record('LOCAL_NATIVE_OTP_STILL_OPENS_SESSION',
    otpSession.user?.id === created.id,
    `verify=200; same_uuid=${otpSession.user?.id === created.id}; native_otp_endpoint=enabled`);
  return { address, initial, uuid: created.id, otpSession };
}

try {
  const global = await prepareExistingUser();
  const globalReplacement = password();
  // Voluntary global logout of THIS session only — not ops cutover for all issued JWTs.
  const logout = await call('/logout?scope=global', { bearer: global.otpSession.access_token });
  const refresh = await call('/token?grant_type=refresh_token',
    { body: { refresh_token: global.otpSession.refresh_token } });
  const getUser = await call('/user',
    { method: 'GET', bearer: global.otpSession.access_token });
  const update = await call('/user', {
    method: 'PUT', bearer: global.otpSession.access_token,
    body: { password: globalReplacement },
  });
  const oldLogin = await call('/token?grant_type=password',
    { body: { email: global.address, password: global.initial } });
  const newLogin = await call('/token?grant_type=password',
    { body: { email: global.address, password: globalReplacement } });
  record('LOCAL_GLOBAL_LOGOUT_REFRESH_REVOKED',
    logout.status === 204 &&
      refresh.status === 400 && refresh.value.error_code === 'refresh_token_not_found',
    `logout=${brief(logout)}; refresh=${brief(refresh)}`);
  record('LOCAL_GLOBAL_LOGOUT_AUTH_USER_SESSION_DENIED',
    logout.status === 204 &&
      authUserSessionDenied(getUser, update) &&
      oldLogin.status === 200 && oldLogin.value.user?.id === global.uuid &&
      newLogin.status !== 200,
    `logout=${brief(logout)}; get_user=${brief(getUser)}; update=${brief(update)}; old_grant=${brief(oldLogin)}; replacement_grant=${brief(newLogin)}`);

  const reset = await prepareExistingUser();
  const authorized = password(), attacker = password();
  // Trusted Admin password update — NOT public Forgot Password / client recovery.
  const adminReset = await call(`/admin/users/${reset.uuid}`,
    { admin: true, method: 'PUT', body: { password: authorized } });
  const oldAfterReset = await call('/token?grant_type=password',
    { body: { email: reset.address, password: reset.initial } });
  const newAfterReset = await call('/token?grant_type=password',
    { body: { email: reset.address, password: authorized } });
  record('LOCAL_ADMIN_RESET_SEPARATE_PASSWORD_LOGIN',
    adminReset.status === 200 &&
      oldAfterReset.status !== 200 &&
      newAfterReset.status === 200 && newAfterReset.value.user?.id === reset.uuid,
    `admin_reset=${brief(adminReset)}; old_grant=${brief(oldAfterReset)}; new_grant=${brief(newAfterReset)}; same_uuid=${newAfterReset.value.user?.id === reset.uuid}`);
  const resetRefresh = await call('/token?grant_type=refresh_token',
    { body: { refresh_token: reset.otpSession.refresh_token } });
  const resetGet = await call('/user',
    { method: 'GET', bearer: reset.otpSession.access_token });
  const resetUpdate = await call('/user', {
    method: 'PUT', bearer: reset.otpSession.access_token, body: { password: attacker },
  });
  const authorizedLogin = await call('/token?grant_type=password',
    { body: { email: reset.address, password: authorized } });
  const attackerLogin = await call('/token?grant_type=password',
    { body: { email: reset.address, password: attacker } });
  record('LOCAL_ADMIN_RESET_OLD_REFRESH_REVOKED',
    adminReset.status === 200 &&
      resetRefresh.status === 400 && resetRefresh.value.error_code === 'refresh_token_not_found',
    `admin_reset=${brief(adminReset)}; refresh=${brief(resetRefresh)}`);
  record('LOCAL_ADMIN_RESET_AUTH_USER_SESSION_DENIED',
    adminReset.status === 200 &&
      authUserSessionDenied(resetGet, resetUpdate) &&
      authorizedLogin.status === 200 && authorizedLogin.value.user?.id === reset.uuid &&
      attackerLogin.status !== 200,
    `admin_reset=${brief(adminReset)}; get_user=${brief(resetGet)}; update=${brief(resetUpdate)}; authorized_grant=${brief(authorizedLogin)}; attacker_grant=${brief(attackerLogin)}`);
} catch (error) {
  rows.push({ id: 'HARNESS', result: 'ERROR', detail: String(error.message).slice(0, 140) });
}

console.log(JSON.stringify({
  scope: 'Task 06F LOCAL-ONLY Auth /user revocation hypothesis; managed/JWT-consumers/hosted cutover NOT TESTED',
  rows,
}, null, 2));
if (rows.some(row => row.result !== 'PASS')) process.exitCode = 1;
