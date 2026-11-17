// Disposable Task 06B proof. Clones only the local GoTrue container in memory.
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import http from 'node:http';

const cli = process.env.SUPABASE_CLI || 'supabase';
const workdir = 'experiments/task06a';
const sourceName = 'supabase_auth_tio-task06a-native-otp';
const name = `tio_task06b_strict_${randomUUID().slice(0, 8)}`;
const local = JSON.parse(execFileSync(cli, ['--workdir', workdir, 'status', '--output', 'json'], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: '1' },
}));
if (new URL(local.API_URL).host !== '127.0.0.1:55321' ||
    new URL(local.MAILPIT_URL).host !== '127.0.0.1:55324' ||
    !local.PUBLISHABLE_KEY?.startsWith('sb_publishable_')) {
  throw new Error('Unexpected local-only Supabase endpoints');
}
const source = JSON.parse(execFileSync('docker', ['inspect', sourceName], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
}))[0];
const network = Object.keys(source.NetworkSettings.Networks).find(x => x === 'supabase_network_tio-task06a-native-otp');
if (!network || source.Config.Image !== 'public.ecr.aws/supabase/gotrue:v2.197.0') {
  throw new Error('Unexpected Auth source container');
}

function engine(method, path, body) {
  return new Promise((resolve, reject) => {
    const json = body && JSON.stringify(body);
    const req = http.request({ socketPath: '\\\\.\\pipe\\docker_engine', method,
      path: `/v1.43${path}`, headers: json ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(json) } : {} },
    res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, value: data ? JSON.parse(data) : {} }));
    });
    req.on('error', reject);
    req.end(json);
  });
}
const api = 'http://127.0.0.1:55325';
const mailpit = local.MAILPIT_URL;
const results = [];
const usedMessages = new Set();
const wait = ms => new Promise(done => setTimeout(done, ms));
const email = () => `task06b-${randomUUID().slice(0, 12)}@example.invalid`;
const password = () => `Tio8!${randomBytes(14).toString('hex')}`;
async function call(path, body, bearer) {
  const response = await fetch(`${api}${path}`, { method: path === '/user' ? 'PUT' : 'POST',
    headers: { apikey: local.PUBLISHABLE_KEY, 'content-type': 'application/json',
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) }, body: JSON.stringify(body) });
  return { ok: response.ok, status: response.status, value: await response.json().catch(() => ({})) };
}
async function messages() {
  const response = await fetch(`${mailpit}/api/v1/messages?limit=100`);
  if (!response.ok) throw new Error(`Mailpit HTTP ${response.status}`);
  return (await response.json()).messages ?? [];
}
async function codeFor(recipient, subject) {
  for (let attempt = 0; attempt < 30; attempt++) {
    for (const item of await messages()) {
      if (usedMessages.has(item.ID) || !item.Subject?.includes(subject) ||
          !item.To?.some(to => to.Address?.toLowerCase() === recipient)) continue;
      const response = await fetch(`${mailpit}/api/v1/message/${item.ID}`);
      const detail = await response.json();
      const code = `${detail.Text ?? ''} ${detail.HTML ?? ''}`.match(/\b\d{6}\b/)?.[0];
      if (code) { usedMessages.add(item.ID); return code; }
    }
    await wait(300);
  }
  throw new Error('Local OTP not captured');
}
function check(id, pass, detail) { results.push({ id, result: pass ? 'PASS' : 'FAIL', detail }); }
function ok(r, step) { if (!r.ok) throw new Error(`${step} HTTP ${r.status}`); return r.value; }

let created = false;
try {
  const env = source.Config.Env.filter(x => !x.startsWith('GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD='));
  env.push('GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD=true');
  const config = {
    Image: source.Config.Image, Env: env, Cmd: source.Config.Cmd,
    Entrypoint: source.Config.Entrypoint, WorkingDir: source.Config.WorkingDir,
    ExposedPorts: { '9999/tcp': {} }, Healthcheck: source.Config.Healthcheck,
    HostConfig: { NetworkMode: network, PortBindings: { '9999/tcp': [{ HostIp: '127.0.0.1', HostPort: '55325' }] } },
    NetworkingConfig: { EndpointsConfig: { [network]: {} } },
  };
  const createdResult = await engine('POST', `/containers/create?name=${name}`, config);
  if (createdResult.status !== 201) throw new Error(`Docker create HTTP ${createdResult.status}`);
  created = true;
  const started = await engine('POST', `/containers/${name}/start`);
  if (started.status !== 204) throw new Error(`Docker start HTTP ${started.status}`);
  const strictInspect = await engine('GET', `/containers/${name}/json`);
  if (strictInspect.status !== 200 || !strictInspect.value.Config.Env.includes('GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD=true')) {
    throw new Error('Strict Auth container setting was not present');
  }
  let healthy = false;
  for (let n = 0; n < 40; n++) {
    try { const response = await fetch(`${api}/health`); if (response.ok) { healthy = true; break; } } catch {}
    await wait(500);
  }
  if (!healthy) throw new Error('Strict local Auth did not become healthy');
  const baseline = await messages();
  baseline.forEach(item => usedMessages.add(item.ID));
  const address = email(), first = password(), second = password(), third = password();
  ok(await call('/otp', { email: address, create_user: true }), 'first OTP send');
  const firstCode = await codeFor(address, 'local signup');
  const verified = ok(await call('/verify', { email: address, token: firstCode, type: 'email' }), 'first OTP verify');
  const id = verified.user?.id;
  const enrolled = ok(await call('/user', { password: first }, verified.access_token), 'first password');
  check('FIRST_PASSWORD', enrolled.id === id, 'OTP session enrolled first password on same UUID');
  const signIn = ok(await call('/token?grant_type=password', { email: address, password: first }), 'password login');
  check('PASSWORD_LOGIN', signIn.user?.id === id, 'Existing password login retained UUID');
  const sameWithoutCurrent = await call('/user', { password: first }, signIn.access_token);
  check('STRICT_SETTING_ACTIVE', sameWithoutCurrent.status === 400 &&
    sameWithoutCurrent.value.error_code === 'current_password_required',
    `Password-session same-password direct API status/error: ${sameWithoutCurrent.status}/${sameWithoutCurrent.value.error_code ?? 'none'}`);
  await wait(1200);
  ok(await call('/otp', { email: address, create_user: true }), 'existing OTP send');
  const existingCode = await codeFor(address, 'local signup');
  const otpSession = ok(await call('/verify', { email: address, token: existingCode, type: 'email' }), 'existing OTP verify');
  const noCurrent = await call('/user', { password: second }, otpSession.access_token);
  const stillOld = await call('/token?grant_type=password', { email: address, password: first });
  const replacementLogin = await call('/token?grant_type=password', { email: address, password: second });
  check('DIRECT_NO_CURRENT', noCurrent.status === 400 && noCurrent.value.error_code === 'current_password_required' && stillOld.ok && !replacementLogin.ok,
    `Missing-current-password direct API status/error: ${noCurrent.status}/${noCurrent.value.error_code ?? 'none'}`);
  check('OTP_BYPASS_REPRODUCED', noCurrent.ok && !stillOld.ok && replacementLogin.ok && replacementLogin.value.user?.id === id,
    'Existing-email OTP session changed password directly despite active strict setting');
  const wrongCurrent = await call('/user', { password: third, current_password: first }, replacementLogin.value.access_token);
  const stillSecond = await call('/token?grant_type=password', { email: address, password: second });
  check('DIRECT_WRONG_CURRENT', wrongCurrent.status === 400 && wrongCurrent.value.error_code === 'current_password_invalid' && stillSecond.ok,
    `Wrong-current-password direct API status/error: ${wrongCurrent.status}/${wrongCurrent.value.error_code ?? 'none'}`);
  const legit = await call('/user', { password: third, current_password: second }, replacementLogin.value.access_token);
  const newLogin = await call('/token?grant_type=password', { email: address, password: third });
  check('DIRECT_CORRECT_CURRENT', legit.ok && newLogin.ok && newLogin.value.user?.id === id,
    'Correct current password permitted explicit change');
  const recovery = ok(await call('/recover', { email: address }), 'recovery send');
  const recoveryCode = await codeFor(address, 'local recovery');
  const recoverySession = ok(await call('/verify', { email: address, token: recoveryCode, type: 'recovery' }), 'recovery verify');
  const changed = await call('/user', { password: first }, recoverySession.access_token);
  const recovered = await call('/token?grant_type=password', { email: address, password: first });
  check('RECOVERY_EXEMPTION', changed.ok && recovered.ok && recovered.value.user?.id === id,
    'Explicit recovery session changed password without prior password');
  const pending = email();
  ok(await call('/otp', { email: pending, create_user: true }), 'pending send');
  const pendingCode = await codeFor(pending, 'local signup');
  const pendingSession = ok(await call('/verify', { email: pending, token: pendingCode, type: 'email' }), 'pending verify');
  await wait(1200);
  ok(await call('/otp', { email: pending, create_user: true }), 'pending resend');
  const freshCode = await codeFor(pending, 'local signup');
  const freshSession = ok(await call('/verify', { email: pending, token: freshCode, type: 'email' }), 'pending reverify');
  check('PROVISIONAL_UUID', pendingSession.user?.id === freshSession.user?.id && pendingCode !== freshCode,
    'Fresh OTP reverified same surviving provisional UUID');
  const flood = email();
  ok(await call('/otp', { email: flood, create_user: true }), 'flood send');
  const floodCode = await codeFor(flood, 'local signup');
  const badCode = floodCode === '000000' ? '111111' : '000000';
  const bad = [];
  for (let n = 0; n < 5; n++) bad.push(await call('/verify', { email: flood, token: badCode, type: 'email' }));
  const afterFive = await call('/verify', { email: flood, token: floodCode, type: 'email' });
  check('FIVE_FAILURE_LOCK', bad.every(x => !x.ok) && !afterFive.ok && afterFive.value.error_code === 'challenge_locked',
    `After-five direct API status/error: ${afterFive.status}/${afterFive.value.error_code ?? 'none'}`);
} catch (error) {
  results.push({ id: 'HARNESS', result: 'FAIL', detail: error.message });
} finally {
  if (created) {
    await engine('POST', `/containers/${name}/stop?t=3`).catch(() => {});
    await engine('DELETE', `/containers/${name}?force=true`).catch(() => {});
  }
}
console.log(JSON.stringify({ scope: 'isolated local GoTrue strict clone', results }, null, 2));
if (results.some(x => x.result === 'FAIL')) process.exitCode = 1;
