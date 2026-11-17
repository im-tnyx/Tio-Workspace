// Disposable local Supabase/Mailpit proof. Never point this at a hosted project.
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const workdir = dirname(fileURLToPath(import.meta.url));
const cli = process.env.SUPABASE_CLI || 'supabase';
const raw = execFileSync(cli, ['--workdir', workdir, 'status', '--output', 'json'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: '1' },
});
const local = JSON.parse(raw);
const api = new URL(local.API_URL);
const mailpit = new URL(local.MAILPIT_URL);
if (api.hostname !== '127.0.0.1' || api.port !== '55321' ||
    mailpit.hostname !== '127.0.0.1' || mailpit.port !== '55324' ||
    !local.PUBLISHABLE_KEY?.startsWith('sb_publishable_')) {
  throw new Error('Task 06A refuses non-local or unexpected Supabase endpoints');
}

const results = [];
const usedMessages = new Set();
const wait = ms => new Promise(done => setTimeout(done, ms));
const email = () => `task06a-${randomUUID().slice(0, 12)}@example.invalid`;
const password = () => `Tio8!${randomBytes(14).toString('hex')}`;

async function call(path, body, bearer) {
  const response = await fetch(new URL(`/auth/v1${path}`, api), {
    method: path === '/user' ? 'PUT' : 'POST',
    headers: {
      apikey: local.PUBLISHABLE_KEY,
      'content-type': 'application/json',
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const value = await response.json().catch(() => ({}));
  return { status: response.status, ok: response.ok, value };
}

async function messages() {
  const response = await fetch(new URL('/api/v1/messages?limit=100', mailpit));
  if (!response.ok) throw new Error(`Mailpit list HTTP ${response.status}`);
  return (await response.json()).messages ?? [];
}

async function codeFor(recipient, subject) {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    for (const item of await messages()) {
      if (usedMessages.has(item.ID) || !item.Subject?.includes(subject) ||
          !item.To?.some(to => to.Address?.toLowerCase() === recipient)) continue;
      const response = await fetch(new URL(`/api/v1/message/${item.ID}`, mailpit));
      if (!response.ok) continue;
      const detail = await response.json();
      const code = `${detail.Text ?? ''} ${detail.HTML ?? ''}`.match(/\b\d{6}\b/)?.[0];
      if (code) {
        usedMessages.add(item.ID);
        return code;
      }
    }
    await wait(300);
  }
  throw new Error('Six-digit code was not captured locally');
}

function record(id, condition, evidence) {
  results.push({ id, result: condition ? 'PASS' : 'FAIL', evidence });
}

function requireOk(result, step) {
  if (!result.ok) throw new Error(`${step} HTTP ${result.status}`);
  return result.value;
}

try {
  for (const item of await messages()) usedMessages.add(item.ID);
  const firstEmail = email();
  const firstPassword = password();
  const sent = await call('/otp', { email: firstEmail, create_user: true });
  requireOk(sent, 'first OTP send');
  const firstCode = await codeFor(firstEmail, 'local signup');
  record('AUTH-15_OTP_FORMAT', /^\d{6}$/.test(firstCode), 'Mailpit captured six digits');
  const verified = requireOk(await call('/verify', {
    email: firstEmail, token: firstCode, type: 'email',
  }), 'first OTP verification');
  record('AUTH-15_SESSION', !!verified.access_token && !!verified.user?.id,
    'OTP verification returned a provisional session');
  const firstId = verified.user?.id;
  const beforeEnrollment = await call('/token?grant_type=password', {
    email: firstEmail, password: firstPassword,
  });
  record('AUTH-18_BEFORE_ENROLLMENT', !beforeEnrollment.ok,
    'Chosen initial password was unusable before enrollment');
  const enrolled = requireOk(await call('/user', { password: firstPassword },
    verified.access_token), 'initial password enrollment');
  record('AUTH-15_SAME_UUID', enrolled.id === firstId,
    'Initial password enrollment retained Auth UUID');
  const mailCount = (await messages()).filter(m =>
    m.To?.some(to => to.Address?.toLowerCase() === firstEmail)).length;
  const login = requireOk(await call('/token?grant_type=password', {
    email: firstEmail, password: firstPassword,
  }), 'password sign-in');
  const mailCountAfter = (await messages()).filter(m =>
    m.To?.some(to => to.Address?.toLowerCase() === firstEmail)).length;
  record('AUTH-16_PASSWORD_LOGIN', login.user?.id === firstId &&
    mailCountAfter === mailCount, 'Password login retained UUID and sent no email');
  const invalidExisting = await call('/token?grant_type=password', {
    email: firstEmail, password: password(),
  });
  const invalidUnknown = await call('/token?grant_type=password', {
    email: email(), password: password(),
  });
  record('AUTH-29_INVALID_CREDENTIALS', !invalidExisting.ok &&
    invalidExisting.status === invalidUnknown.status &&
    JSON.stringify(invalidExisting.value) === JSON.stringify(invalidUnknown.value),
    'Existing and unknown email password failures matched locally');
  const refreshed = requireOk(await call('/token?grant_type=refresh_token', {
    refresh_token: login.refresh_token,
  }), 'refresh token');
  record('AUTH-24_TOKEN_RESTORE', refreshed.user?.id === firstId,
    'Refresh token exchange worked in Node; native device persistence untested');

  const pendingEmail = email();
  const pendingPassword = password();
  requireOk(await call('/otp', { email: pendingEmail, create_user: true }),
    'provisional OTP send');
  const pendingCode = await codeFor(pendingEmail, 'local signup');
  const pending = requireOk(await call('/verify', {
    email: pendingEmail, token: pendingCode, type: 'email',
  }), 'provisional OTP verification');
  await wait(1200);
  requireOk(await call('/otp', { email: pendingEmail, create_user: true }),
    'fresh provisional OTP send');
  const freshCode = await codeFor(pendingEmail, 'local signup');
  const resumed = requireOk(await call('/verify', {
    email: pendingEmail, token: freshCode, type: 'email',
  }), 'fresh provisional OTP verification');
  record('AUTH-18_FRESH_SAME_UUID', pending.user?.id === resumed.user?.id &&
    pendingCode !== freshCode, 'Fresh OTP reverified surviving provisional UUID');
  requireOk(await call('/user', { password: pendingPassword }, resumed.access_token),
    'resumed initial password enrollment');
  const existingPasswordLogin = await call('/token?grant_type=password', {
    email: pendingEmail, password: pendingPassword,
  });
  record('AUTH-18_RESUMED_PASSWORD', existingPasswordLogin.ok &&
    existingPasswordLogin.value.user?.id === pending.user?.id,
    'Initial password worked on surviving provisional UUID');

  await wait(1200);
  const existingSignup = await call('/otp', { email: pendingEmail, create_user: true });
  const freshEmail = email();
  const newSignup = await call('/otp', { email: freshEmail, create_user: true });
  record('AUTH-29_SEND_RESPONSE', existingSignup.status === newSignup.status &&
    JSON.stringify(existingSignup.value) === JSON.stringify(newSignup.value),
    'Existing and new email send responses matched locally');

  const existingCode = await codeFor(pendingEmail, 'local signup');
  const existingOtpSession = requireOk(await call('/verify', {
    email: pendingEmail, token: existingCode, type: 'email',
  }), 'existing account OTP verification');
  const replacementPassword = password();
  const directReplacement = await call('/user', { password: replacementPassword },
    existingOtpSession.access_token);
  const oldPassword = await call('/token?grant_type=password', {
    email: pendingEmail, password: pendingPassword,
  });
  const replacementLogin = await call('/token?grant_type=password', {
    email: pendingEmail, password: replacementPassword,
  });
  record('AUTH-17_DIRECT_MUTATION_PREVENTION',
    !directReplacement.ok && oldPassword.ok && !replacementLogin.ok,
    directReplacement.ok && !oldPassword.ok && replacementLogin.ok
      ? 'FAIL: direct authenticated Auth API replaced existing password'
      : 'Direct replacement outcome requires investigation');

  const floodCode = await codeFor(freshEmail, 'local signup');
  const invalidCode = floodCode === '000000' ? '111111' : '000000';
  const failures = [];
  for (let n = 0; n < 5; n += 1) failures.push(await call('/verify', {
    email: freshEmail, token: invalidCode, type: 'email',
  }));
  const afterFailures = await call('/verify', {
    email: freshEmail, token: floodCode, type: 'email',
  });
  record('AUTH-22_FIVE_FAILURE_COOLDOWN',
    failures.every(x => !x.ok) && !afterFailures.ok,
    failures.every(x => !x.ok) && afterFailures.ok
      ? 'FAIL: correct code succeeded after five invalid attempts'
      : 'Five-attempt outcome requires investigation');
  const replay = await call('/verify', {
    email: freshEmail, token: floodCode, type: 'email',
  });
  record('AUTH-21_REPLAY', !replay.ok, 'Used OTP was rejected on replay');

  const recoveryPassword = password();
  const recoverySend = await call('/recover', { email: firstEmail });
  requireOk(recoverySend, 'recovery send');
  const unknownRecovery = await call('/recover', { email: email() });
  record('AUTH-23_RECOVERY_RESPONSE', recoverySend.status === unknownRecovery.status &&
    JSON.stringify(recoverySend.value) === JSON.stringify(unknownRecovery.value),
    'Existing and unknown email recovery responses matched locally');
  const recoveryCode = await codeFor(firstEmail, 'local recovery');
  const recovered = requireOk(await call('/verify', {
    email: firstEmail, token: recoveryCode, type: 'recovery',
  }), 'recovery verification');
  requireOk(await call('/user', { password: recoveryPassword },
    recovered.access_token), 'recovery password update');
  const recoveredLogin = await call('/token?grant_type=password', {
    email: firstEmail, password: recoveryPassword,
  });
  record('AUTH-23_RECOVERY', recoveredLogin.ok &&
    recoveredLogin.value.user?.id === firstId,
    'Recovery OTP changed password on the same UUID');
} catch (error) {
  results.push({ id: 'HARNESS', result: 'FAIL', evidence: error.message });
}

console.log(JSON.stringify({ scope: 'local Supabase and Mailpit only', results }, null, 2));
if (results.some(item => item.result === 'FAIL')) process.exitCode = 1;
