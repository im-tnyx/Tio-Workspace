// Task 06D: disposable local-only GoTrue boundary proof. Never prints credentials or OTPs.
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import http from 'node:http';

const cli = process.env.SUPABASE_CLI;
if (!cli) throw new Error('Set SUPABASE_CLI to the pinned local executable');
const local = JSON.parse(execFileSync(cli, ['status', '--workdir', 'experiments/task06d', '--output', 'json'], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: '1' },
}));
if (new URL(local.API_URL).host !== '127.0.0.1:55421' ||
    new URL(local.MAILPIT_URL).host !== '127.0.0.1:55424' ||
    !local.PUBLISHABLE_KEY?.startsWith('sb_publishable_') || !local.SERVICE_ROLE_KEY) {
  throw new Error('Unexpected Task 06D local-only stack');
}
const sourceName = 'supabase_auth_tio-task06d-boundary';
const source = JSON.parse(execFileSync('docker', ['inspect', sourceName], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
}))[0];
const network = 'supabase_network_tio-task06d-boundary';
if (!source.NetworkSettings.Networks[network] ||
    source.Config.Image !== 'public.ecr.aws/supabase/gotrue:v2.197.0') {
  throw new Error('Unexpected isolated Auth source');
}
const name = `tio_task06d_boundary_${randomUUID().slice(0, 8)}`;
const clone = 'http://127.0.0.1:55425';
const hookName = `tio_task06d_hook_${randomUUID().slice(0, 8)}`;
const hookApi = 'http://127.0.0.1:55426';
const rows = [];
const usedMail = new Set();
const hookEvents = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const email = () => `task06d-${randomUUID().slice(0, 12)}@example.invalid`;
const password = () => `Tio8!${randomBytes(14).toString('hex')}`;
const record = (id, expected, observed, details = '') => rows.push({
  id, result: expected ? 'PASS' : 'FAIL', observed, details,
});

async function engine(method, path, body) {
  const json = body ? JSON.stringify(body) : undefined;
  return await new Promise((resolve, reject) => {
    const req = http.request({
      socketPath: '\\\\.\\pipe\\docker_engine', method, path: `/v1.43${path}`,
      headers: json ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(json) } : {},
    }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let value = {};
        try { value = data ? JSON.parse(data) : {}; } catch {}
        resolve({ status: res.statusCode, value });
      });
    });
    req.on('error', reject);
    req.end(json);
  });
}
async function request(base, path, body, bearer, method = 'POST') {
  const url = base === local.API_URL ? `${base}/auth/v1${path}` : `${base}${path}`;
  const response = await fetch(url, {
    method,
    headers: {
      apikey: local.PUBLISHABLE_KEY,
      'content-type': 'application/json',
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, ok: response.ok, value: await response.json().catch(() => ({})) };
}
async function admin(base, path, body, method = 'POST') {
  const url = base === local.API_URL ? `${base}/auth/v1${path}` : `${base}${path}`;
  const response = await fetch(url, {
    method,
    headers: {
      apikey: local.SERVICE_ROLE_KEY,
      authorization: `Bearer ${local.SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, ok: response.ok, value: await response.json().catch(() => ({})) };
}
async function messages() {
  const response = await fetch(`${local.MAILPIT_URL}/api/v1/messages?limit=100`);
  if (!response.ok) throw new Error(`Mailpit HTTP ${response.status}`);
  return (await response.json()).messages ?? [];
}
async function codeFor(address, subject) {
  for (let n = 0; n < 35; n++) {
    for (const item of await messages()) {
      if (usedMail.has(item.ID) || !item.Subject?.includes(subject) ||
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
function requireOk(result, step) {
  if (!result.ok) throw new Error(`${step} HTTP ${result.status}/${result.value.error_code ?? 'none'}`);
  return result.value;
}

let created = false;
let hookCreated = false;
let hookServer;
try {
  const baselineMail = await messages();
  baselineMail.forEach(item => usedMail.add(item.ID));
  const address = email(), pw1 = password(), pw2 = password(), pw3 = password();
  requireOk(await request(local.API_URL, '/otp', { email: address, create_user: true }), 'baseline signup send');
  const signupCode = await codeFor(address, 'local signup');
  const signup = requireOk(await request(local.API_URL, '/verify',
    { email: address, token: signupCode, type: 'email' }), 'baseline signup verify');
  const uuid = signup.user?.id;
  requireOk(await request(local.API_URL, '/user', { password: pw1 }, signup.access_token, 'PUT'),
    'baseline first password');
  await sleep(1200);
  requireOk(await request(local.API_URL, '/otp', { email: address, create_user: true }),
    'baseline existing OTP send');
  const oldOtpCode = await codeFor(address, 'local signup');
  const oldOtpSession = requireOk(await request(local.API_URL, '/verify',
    { email: address, token: oldOtpCode, type: 'email' }), 'baseline existing OTP verify');
  await sleep(1200);
  requireOk(await request(local.API_URL, '/otp', { email: address, create_user: true }),
    'baseline preissued OTP send');
  const preissuedCode = await codeFor(address, 'local signup');
  const floodAddress = email();
  requireOk(await request(local.API_URL, '/otp', { email: floodAddress, create_user: true }),
    'baseline flood OTP send');
  const floodCode = await codeFor(floodAddress, 'local signup');

  const env = source.Config.Env.filter(x => ![
    'GOTRUE_EXTERNAL_EMAIL_MAGIC_LINK_ENABLED=',
    'GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD=',
  ].some(prefix => x.startsWith(prefix)));
  env.push('GOTRUE_EXTERNAL_EMAIL_MAGIC_LINK_ENABLED=false');
  env.push('GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD=true');
  const config = {
    Image: source.Config.Image, Env: env, Cmd: source.Config.Cmd,
    Entrypoint: source.Config.Entrypoint, WorkingDir: source.Config.WorkingDir,
    ExposedPorts: { '9999/tcp': {} }, Healthcheck: source.Config.Healthcheck,
    HostConfig: { NetworkMode: network,
      PortBindings: { '9999/tcp': [{ HostIp: '127.0.0.1', HostPort: '55425' }] } },
    NetworkingConfig: { EndpointsConfig: { [network]: {} } },
  };
  const creation = await engine('POST', `/containers/create?name=${name}`, config);
  if (creation.status !== 201) throw new Error(`Docker create HTTP ${creation.status}`);
  created = true;
  const start = await engine('POST', `/containers/${name}/start`);
  if (start.status !== 204) throw new Error(`Docker start HTTP ${start.status}`);
  const inspected = await engine('GET', `/containers/${name}/json`);
  if (inspected.status !== 200 ||
      !inspected.value.Config.Env.includes('GOTRUE_EXTERNAL_EMAIL_MAGIC_LINK_ENABLED=false') ||
      !inspected.value.Config.Env.includes('GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD=true')) {
    throw new Error('Boundary clone configuration not confirmed');
  }
  let ready = false;
  for (let n = 0; n < 50; n++) {
    try { if ((await fetch(`${clone}/health`)).ok) { ready = true; break; } } catch {}
    await sleep(400);
  }
  if (!ready) throw new Error('Boundary clone did not become healthy');
  record('PROVIDER_CONFIG', true, 'GoTrue v2.197.0 clone flags confirmed');

  const existingOtp = await request(clone, '/otp', { email: address, create_user: true });
  record('DIRECT_OTP_DISABLED', existingOtp.status === 422, `${existingOtp.status}/${existingOtp.value.error_code ?? 'none'}`);
  const directMagiclink = await request(clone, '/magiclink', { email: address });
  record('DIRECT_MAGICLINK_DISABLED', directMagiclink.status === 422,
    `${directMagiclink.status}/${directMagiclink.value.error_code ?? 'none'}`);
  const signIn = await request(clone, '/token?grant_type=password', { email: address, password: pw1 });
  record('PASSWORD_SIGNIN', signIn.ok && signIn.value.user?.id === uuid,
    `${signIn.status}/${signIn.value.error_code ?? 'none'}; same_uuid=${signIn.value.user?.id === uuid}`);

  const directSignupAddress = email(), directSignupPassword = password();
  const directSignup = await request(clone, '/signup',
    { email: directSignupAddress, password: directSignupPassword });
  record('DIRECT_SIGNUP_BLOCKED', !directSignup.ok,
    `${directSignup.status}/${directSignup.value.error_code ?? 'none'}`);
  if (directSignup.ok) {
    await sleep(1200);
    const resendSignup = await request(clone, '/resend',
      { email: directSignupAddress, type: 'signup' });
    record('DIRECT_RESEND_SIGNUP_BLOCKED', !resendSignup.ok,
      `${resendSignup.status}/${resendSignup.value.error_code ?? 'none'}`);
    const signupConfirmCode = await codeFor(directSignupAddress, 'local signup');
    const directConfirm = await request(clone, '/verify',
      { email: directSignupAddress, token: signupConfirmCode, type: 'signup' });
    const directLogin = await request(clone, '/token?grant_type=password',
      { email: directSignupAddress, password: directSignupPassword });
    record('DIRECT_SIGNUP_PASSWORD_BEFORE_OTP_BLOCKED', !directConfirm.ok && !directLogin.ok,
      `verify=${directConfirm.status}/${directConfirm.value.error_code ?? 'none'}; login=${directLogin.status}`);
  }
  const oldRefresh = await request(clone, '/token?grant_type=refresh_token',
    { refresh_token: oldOtpSession.refresh_token });
  record('PREEXISTING_OTP_REFRESH_BLOCKED', !oldRefresh.ok,
    `${oldRefresh.status}/${oldRefresh.value.error_code ?? 'none'}`);
  const preissued = await request(clone, '/verify',
    { email: address, token: preissuedCode, type: 'email' });
  record('PREISSUED_OTP_VERIFY_BLOCKED', !preissued.ok,
    `${preissued.status}/${preissued.value.error_code ?? 'none'}`);
  const oldPasswordUpdate = await request(clone, '/user',
    { password: pw2 }, oldOtpSession.access_token, 'PUT');
  const oldPasswordLogin = await request(clone, '/token?grant_type=password',
    { email: address, password: pw1 });
  const newPasswordLogin = await request(clone, '/token?grant_type=password',
    { email: address, password: pw2 });
  record('PREEXISTING_OTP_PASSWORD_PROTECTION',
    !oldPasswordUpdate.ok && !!oldPasswordUpdate.value.error_code &&
      oldPasswordLogin.ok && !newPasswordLogin.ok,
    `update=${oldPasswordUpdate.status}/${oldPasswordUpdate.value.error_code ?? 'none'}; old_works=${oldPasswordLogin.ok}; new_works=${newPasswordLogin.ok}`);

  const badCode = floodCode === '000000' ? '111111' : '000000';
  const wrong = [];
  for (let n = 0; n < 5; n++) wrong.push(await request(clone, '/verify',
    { email: floodAddress, token: badCode, type: 'email' }));
  const afterFive = await request(clone, '/verify',
    { email: floodAddress, token: floodCode, type: 'email' });
  record('FIVE_FAILURE_LOCK', wrong.every(r => !r.ok) && !afterFive.ok &&
    afterFive.value.error_code === 'challenge_locked',
    `wrong=${wrong.map(r => r.status).join(',')}; correct_after_five=${afterFive.status}/${afterFive.value.error_code ?? 'none'}`);

  const recoverySend = await request(clone, '/recover', { email: address });
  record('DIRECT_RECOVER_BLOCKED', !recoverySend.ok,
    `${recoverySend.status}/${recoverySend.value.error_code ?? 'none'}`);
  if (recoverySend.ok) {
    const recoveryCode = await codeFor(address, 'local recovery');
    const recoverySession = await request(clone, '/verify',
      { email: address, token: recoveryCode, type: 'recovery' });
    record('DIRECT_RECOVERY_VERIFY_BLOCKED', !recoverySession.ok,
      `${recoverySession.status}/${recoverySession.value.error_code ?? 'none'}`);
    if (recoverySession.ok) {
      const replacement = await request(clone, '/user', { password: pw3 },
        recoverySession.value.access_token, 'PUT');
      const originalLogin = await request(clone, '/token?grant_type=password',
        { email: address, password: pw1 });
      const replacementLogin = await request(clone, '/token?grant_type=password',
        { email: address, password: pw3 });
      // PASS only when Auth denies the mutation with an error_code and the original password still works.
      record('DIRECT_RECOVERY_PASSWORD_PROTECTION',
        !replacement.ok && !!replacement.value.error_code &&
          originalLogin.ok && !replacementLogin.ok,
        `update=${replacement.status}/${replacement.value.error_code ?? 'none'}; old_works=${originalLogin.ok}; new_works=${replacementLogin.ok}`);
    }
  }
  const resendRecovery = await request(clone, '/resend', { email: address, type: 'recovery' });
  record('RESEND_RECOVERY_UNSUPPORTED_TYPE',
    resendRecovery.status === 400 && resendRecovery.value.error_code === 'validation_failed',
    `${resendRecovery.status}/${resendRecovery.value.error_code ?? 'none'}; not a security boundary`);

  const adminAddress = email(), adminPassword = password();
  const createdUser = await admin(clone, '/admin/users', { email: adminAddress, email_confirm: true });
  const before = await request(clone, '/token?grant_type=password',
    { email: adminAddress, password: adminPassword });
  record('ADMIN_PROVISIONAL_CREATE', createdUser.ok && !!createdUser.value.id && !before.ok,
    `create=${createdUser.status}; password_before=${before.status}`);
  if (createdUser.ok && createdUser.value.id) {
    const enrolled = await admin(clone, `/admin/users/${createdUser.value.id}`,
      { password: adminPassword }, 'PUT');
    const login = await request(clone, '/token?grant_type=password',
      { email: adminAddress, password: adminPassword });
    record('ADMIN_FIRST_PASSWORD_SAME_UUID',
      enrolled.ok && login.ok && login.value.user?.id === createdUser.value.id,
      `enroll=${enrolled.status}; login=${login.status}; same_uuid=${login.value.user?.id === createdUser.value.id}`);
  }

  // A second disposable Auth clone tests documented hooks and direct API paths.
  const hookAddress = email(), recoveryAddress = email(), deliveryAddress = email();
  const hookPassword = password(), changedPassword = password();
  requireOk(await admin(local.API_URL, '/admin/users',
    { email: hookAddress, password: hookPassword, email_confirm: true }), 'hook test user');
  requireOk(await admin(local.API_URL, '/admin/users',
    { email: recoveryAddress, password: password(), email_confirm: true }), 'hook recovery test user');
  requireOk(await admin(local.API_URL, '/admin/users',
    { email: deliveryAddress, password: password(), email_confirm: true }), 'hook delivery test user');
  requireOk(await request(local.API_URL, '/otp',
    { email: hookAddress, create_user: false }), 'hook preexisting OTP send');
  const sessionCode = await codeFor(hookAddress, 'local signup');
  const prehookSession = requireOk(await request(local.API_URL, '/verify',
    { email: hookAddress, token: sessionCode, type: 'email' }), 'hook preexisting OTP verify');
  await sleep(1200);
  requireOk(await request(local.API_URL, '/otp',
    { email: hookAddress, create_user: false }), 'hook preissued OTP send');
  const hookOtpCode = await codeFor(hookAddress, 'local signup');
  requireOk(await request(local.API_URL, '/recover', { email: recoveryAddress }),
    'hook preissued recovery send');
  const hookRecoveryCode = await codeFor(recoveryAddress, 'local recovery');

  hookServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let event = {};
      try { event = JSON.parse(body); } catch {}
      if (req.url === '/email') {
        hookEvents.push('email');
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{}');
        return;
      }
      const method = event.authentication_method ?? 'none';
      hookEvents.push(`token:${method}`);
      const amr = event.claims?.amr ?? [];
      const otpOrigin = Array.isArray(amr) && amr.some(entry =>
        ['otp', 'recovery', 'magiclink', 'email'].includes(entry.method));
      const blocked = ['otp', 'recovery', 'magiclink', 'email', 'signup'].includes(method) ||
        (method === 'token_refresh' && otpOrigin);
      res.writeHead(blocked ? 500 : 200, { 'content-type': 'application/json' });
      res.end(blocked ? '{"error":"Unauthorized"}' : JSON.stringify({ claims: event.claims }));
    });
  });
  await new Promise((resolve, reject) =>
    hookServer.once('error', reject).listen(55430, '0.0.0.0', resolve));
  const hookEnv = source.Config.Env.filter(x => ![
    'GOTRUE_EXTERNAL_EMAIL_MAGIC_LINK_ENABLED=',
    'GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD=',
    'GOTRUE_DISABLE_SIGNUP=',
    'GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_ENABLED=',
    'GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_URI=',
    'GOTRUE_HOOK_SEND_EMAIL_ENABLED=',
    'GOTRUE_HOOK_SEND_EMAIL_URI=',
  ].some(prefix => x.startsWith(prefix)));
  hookEnv.push(
    'GOTRUE_EXTERNAL_EMAIL_MAGIC_LINK_ENABLED=false',
    'GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD=true',
    'GOTRUE_DISABLE_SIGNUP=true',
    'GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_ENABLED=true',
    'GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_URI=http://host.docker.internal:55430/token',
    'GOTRUE_HOOK_SEND_EMAIL_ENABLED=true',
    'GOTRUE_HOOK_SEND_EMAIL_URI=http://host.docker.internal:55430/email',
  );
  const hookConfig = {
    ...config, Env: hookEnv,
    HostConfig: { NetworkMode: network,
      PortBindings: { '9999/tcp': [{ HostIp: '127.0.0.1', HostPort: '55426' }] } },
  };
  const hookCreation = await engine('POST', `/containers/create?name=${hookName}`, hookConfig);
  if (hookCreation.status !== 201) throw new Error(`Hook clone create HTTP ${hookCreation.status}`);
  hookCreated = true;
  const hookStart = await engine('POST', `/containers/${hookName}/start`);
  if (hookStart.status !== 204) throw new Error(`Hook clone start HTTP ${hookStart.status}`);
  let hookReady = false;
  for (let n = 0; n < 50; n++) {
    try { if ((await fetch(`${hookApi}/health`)).ok) { hookReady = true; break; } } catch {}
    await sleep(400);
  }
  if (!hookReady) throw new Error('Hook clone did not become healthy');
  record('HOOK_CONFIG', true, 'local GoTrue hook clone healthy');

  const hookLogin = await request(hookApi, '/token?grant_type=password',
    { email: hookAddress, password: hookPassword });
  record('HOOK_PASSWORD_LOGIN', hookLogin.ok,
    `${hookLogin.status}/${hookLogin.value.error_code ?? 'none'}`);
  const hookOtp = await request(hookApi, '/otp', { email: hookAddress, create_user: false });
  record('HOOK_DIRECT_OTP_DISABLED', hookOtp.status === 422,
    `${hookOtp.status}/${hookOtp.value.error_code ?? 'none'}`);
  const hookSignup = await request(hookApi, '/signup',
    { email: email(), password: password() });
  record('HOOK_DIRECT_SIGNUP_DISABLED', !hookSignup.ok,
    `${hookSignup.status}/${hookSignup.value.error_code ?? 'none'}`);
  const hookVerify = await request(hookApi, '/verify',
    { email: hookAddress, token: hookOtpCode, type: 'email' });
  record('HOOK_PREISSUED_OTP_VERIFY_BLOCKED', !hookVerify.ok,
    `${hookVerify.status}/${hookVerify.value.error_code ?? 'none'}`);
  const hookRecoveryVerify = await request(hookApi, '/verify',
    { email: recoveryAddress, token: hookRecoveryCode, type: 'recovery' });
  record('HOOK_PREISSUED_RECOVERY_VERIFY_BLOCKED', !hookRecoveryVerify.ok,
    `${hookRecoveryVerify.status}/${hookRecoveryVerify.value.error_code ?? 'none'}`);
  const mailBefore = (await messages()).length;
  const hookRecover = await request(hookApi, '/recover', { email: deliveryAddress });
  await sleep(500);
  const mailAfter = (await messages()).length;
  record('HOOK_RECOVER_NO_NATIVE_EMAIL', hookRecover.ok && mailAfter === mailBefore,
    `${hookRecover.status}/${hookRecover.value.error_code ?? 'none'}; mail_delta=${mailAfter - mailBefore}`);
  const hookRefresh = await request(hookApi, '/token?grant_type=refresh_token',
    { refresh_token: prehookSession.refresh_token });
  record('HOOK_PREEXISTING_OTP_REFRESH_BLOCKED', !hookRefresh.ok,
    `${hookRefresh.status}/${hookRefresh.value.error_code ?? 'none'}`);
  const hookUserUpdate = await request(hookApi, '/user',
    { password: changedPassword }, prehookSession.access_token, 'PUT');
  const originalHookLogin = await request(hookApi, '/token?grant_type=password',
    { email: hookAddress, password: hookPassword });
  const changedLogin = await request(hookApi, '/token?grant_type=password',
    { email: hookAddress, password: changedPassword });
  // PASS only when Auth denies with an error_code and the pre-update password still works.
  record('HOOK_PREEXISTING_OTP_PASSWORD_PROTECTION',
    !hookUserUpdate.ok && !!hookUserUpdate.value.error_code &&
      originalHookLogin.ok && !changedLogin.ok,
    `update=${hookUserUpdate.status}/${hookUserUpdate.value.error_code ?? 'none'}; old_works=${originalHookLogin.ok}; new_works=${changedLogin.ok}`);
  record('HOOK_INVOCATION_OBSERVED', hookEvents.some(x => x.startsWith('token:')) &&
    hookEvents.includes('email'), [...new Set(hookEvents)].join(','));
} catch (error) {
  rows.push({ id: 'HARNESS', result: 'FAIL', observed: String(error.message).slice(0, 180) });
} finally {
  if (hookCreated) {
    await engine('POST', `/containers/${hookName}/stop?t=3`).catch(() => {});
    await engine('DELETE', `/containers/${hookName}?force=true`).catch(() => {});
  }
  if (hookServer) await new Promise(resolve => hookServer.close(resolve));
  if (created) {
    await engine('POST', `/containers/${name}/stop?t=3`).catch(() => {});
    await engine('DELETE', `/containers/${name}?force=true`).catch(() => {});
  }
}
console.log(JSON.stringify({ scope: 'Task 06D isolated local boundary, no secrets', rows }, null, 2));
if (rows.some(r => r.result === 'FAIL')) process.exitCode = 1;
