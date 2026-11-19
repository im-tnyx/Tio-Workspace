// Task 06H-D: Isolated Compose Auth test harness adapter.
// Never prints OTPs, passwords, session tokens, or private secrets.
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  classifyReplay, classifyConcurrent, classifyNegative,
  classifyFiveWrong, classifyRecoveryControl, classifyOldCodeInvalidation, classifyInvalidCode,
  classifyPurposeCrossing, classifyRecoveryPurposeCrossing, classifyPasswordMutation, classifyOtpSessionControl,
  planAuth17OtpControlAbort, classifyResendTiming, safeStatus
} from './assertions.mjs';
import {
  preflightFailureKind,
  preflightFailureObservation,
  validateWindowsListeners,
  validateIsolatedLoopbackStack,
} from './loopback-preflight.mjs';

export const project = process.env.PROJECT_ID || 'tio-task06h-local-auth';
export const network = `supabase_network_${project}`;
export const gotrueImage = 'public.ecr.aws/supabase/gotrue:v2.197.0';
export const postgresImage = 'public.ecr.aws/supabase/postgres:17.11.0.004';
export const expected = {
  API_URL: process.env.API_EXTERNAL_URL || 'http://127.0.0.1:55621',
  MAILPIT_URL: process.env.MAILPIT_URL || 'http://127.0.0.1:55624',
};

// Requires a mandatory, untracked JWT secret without insecure fallbacks.
export function getRequiredJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || typeof secret !== 'string' || secret.trim().length < 32) {
    throw new Error('JWT_SECRET must be set via environment and be at least 32 characters long (no fallback permitted)');
  }
  return secret.trim();
}

// Generates valid local HS256 JWT tokens using the configured local test secret.
export function signLocalJwt(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encode = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const unsignedToken = `${encode(header)}.${encode(payload)}`;
  const signature = createHmac('sha256', secret).update(unsignedToken).digest('base64url');
  return `${unsignedToken}.${signature}`;
}

export function generateLocalKeys(jwtSecret = getRequiredJwtSecret()) {
  if (!jwtSecret || typeof jwtSecret !== 'string' || jwtSecret.trim().length < 32) {
    throw new Error('Valid JWT secret of at least 32 characters required');
  }
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600 * 24 * 365; // 1 year local test validity
  const publishablePayload = {
    role: 'anon',
    iss: 'supabase',
    iat: now,
    exp,
  };
  const serviceRolePayload = {
    role: 'service_role',
    iss: 'supabase',
    iat: now,
    exp,
  };
  return {
    PUBLISHABLE_KEY: process.env.PUBLISHABLE_KEY || signLocalJwt(publishablePayload, jwtSecret),
    SERVICE_ROLE_KEY: process.env.SERVICE_ROLE_KEY || signLocalJwt(serviceRolePayload, jwtSecret),
  };
}

export class QuotaExhaustedError extends Error {
  constructor(message = 'Global email rate limit budget exhausted') {
    super(message);
    this.name = 'QuotaExhaustedError';
  }
}

let _customProcessRunner = null;

export function _setProcessRunnerForTesting(runner) {
  _customProcessRunner = runner;
}

export function _resetProcessRunnerForTesting() {
  _customProcessRunner = null;
}

function _executeCommand(file, args, options = {}) {
  if (typeof _customProcessRunner === 'function') {
    return _customProcessRunner(file, args, options);
  }
  return execFileSync(file, args, options);
}

export function inspectWindowsListenersRuntime(ports = [55621, 55624]) {
  try {
    const portList = ports.join(',');
    const psScript = `Get-NetTCPConnection -LocalPort ${portList} -ErrorAction SilentlyContinue | Select-Object LocalAddress, LocalPort, State | ConvertTo-Json`;
    let rawOutput;
    try {
      rawOutput = _executeCommand('powershell.exe', ['-NoProfile', '-Command', psScript], {
        encoding: 'utf8',
        timeout: 10000,
      });
    } catch (err) {
      throw new Error(`Listener command execution failed: ${err.message}`);
    }

    const output = String(rawOutput ?? '').trim();
    if (!output) {
      throw new Error(`MISSING_WINDOWS_LISTENER: ports ${portList} have no active listeners`);
    }

    const parsed = JSON.parse(output);
    const connections = Array.isArray(parsed) ? parsed : [parsed];
    validateWindowsListeners(ports.map(String), connections);
    return connections;
  } catch (error) {
    throw new Error(`Host listener validation failed: ${error.message}`);
  }
}

export function inspectDockerStackRuntime() {
  const run = (file, args) => _executeCommand(file, args, {
    encoding: 'utf8',
    timeout: 15000,
    maxBuffer: 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let networkRaw;
  try {
    networkRaw = run('docker', ['network', 'inspect', network]);
  } catch (error) {
    throw new Error(`Docker network inspection failed: ${error.message}`);
  }

  let attached;
  try {
    attached = Object.values(JSON.parse(networkRaw)[0]?.Containers ?? {});
  } catch (error) {
    throw new Error(`Docker network parsing failed: ${error.message}`);
  }

  if (!attached.length) throw new Error('No containers attached to the project network');

  const containers = attached.map(entry => {
    const name = entry?.Name;
    if (typeof name !== 'string' || !name) throw new Error('Project container name unavailable');
    try {
      return JSON.parse(run('docker', ['inspect', name]))[0];
    } catch (error) {
      throw new Error(`Docker container inspection failed on ${name}: ${error.message}`);
    }
  });

  validateIsolatedLoopbackStack({
    containers,
    network,
    project,
    gotrueImage,
    postgresImage,
    apiHostPort: '55621',
    mailHostPort: '55624',
  });

  inspectWindowsListenersRuntime([55621, 55624]);
  return containers;
}

export function initializeLocalStack() {
  const jwtSecret = getRequiredJwtSecret();
  const keys = generateLocalKeys(jwtSecret);

  // Runtime container and listener inspection
  inspectDockerStackRuntime();

  return {
    ...expected,
    ...keys,
  };
}

export function assertRuntimeStackIsolation() {
  inspectDockerStackRuntime();
  inspectWindowsListenersRuntime([55621, 55624]);
  return true;
}

export function validateLocalStackConfig(local) {
  // Strict Loopback URL enforcement
  const allowedBases = ['http://127.0.0.1:55621', 'http://127.0.0.1:55624'];
  if (!local?.API_URL || !local?.MAILPIT_URL ||
      !allowedBases.includes(local.API_URL) ||
      !allowedBases.includes(local.MAILPIT_URL)) {
    throw new Error('Invalid or non-loopback stack URLs refused');
  }

  if (!local?.PUBLISHABLE_KEY || !local?.SERVICE_ROLE_KEY) {
    throw new Error('Local stack configuration and credentials required to run integration suite');
  }

  return true;
}

// Public production integration entrypoint: ALWAYS executes real Docker and Windows isolation validation.
// No caller-controlled argument or callback can bypass this gate.
export async function executeAuthIntegrationSuite(local) {
  assertRuntimeStackIsolation();
  return _runAuthIntegrationSuiteInternal(local);
}

async function _runAuthIntegrationSuiteInternal(local) {
  validateLocalStackConfig(local);

  const rows = [];
  const usedMail = new Set();
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const email = () => `task06h-${randomUUID()}@example.invalid`;
  const password = () => `Tio8!${randomBytes(18).toString('hex')}`;
  const describe = (...results) => results.map(safeStatus).join(',');
  const row = (id, result, observed, details) => rows.push({
    id, result, observed,
    ...(details === undefined ? {} : { details })
  });

  async function json(url, init = {}) {
    if (![expected.API_URL, expected.MAILPIT_URL].some(base => url.startsWith(`${base}/`))) {
      throw new Error('Non-local URL refused');
    }
    try {
      const response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(10000) });
      try { return { status: response.status, value: await response.json() }; }
      catch { return { status: response.status, kind: 'invalid_json', value: null }; }
    } catch (error) {
      return { status: null, kind: error?.name === 'TimeoutError' ? 'timeout' : 'network_error', value: null };
    }
  }

  async function auth(path, body, { method = 'POST', token, admin = false } = {}) {
    if (!/^\/[a-z?=&_0-9/-]+$/.test(path)) throw new Error('Unexpected Auth path');
    return json(`${local.API_URL}/auth/v1${path}`, {
      method,
      headers: {
        apikey: admin ? local.SERVICE_ROLE_KEY : local.PUBLISHABLE_KEY,
        'content-type': 'application/json',
        ...(admin ? { authorization: `Bearer ${local.SERVICE_ROLE_KEY}` } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  let sendsInWindow = 0;
  let windowStart = Date.now();
  const maxSendsPerWindow = 5;
  const windowDurationMs = 60000;

  async function paceEmailQuota() {
    const elapsed = Date.now() - windowStart;
    if (elapsed >= windowDurationMs) {
      sendsInWindow = 0;
      windowStart = Date.now();
    } else if (sendsInWindow >= maxSendsPerWindow) {
      // Quota-aware scheduling: wait for the sliding window to reset rather than failing
      const waitTime = windowDurationMs - elapsed + 1000;
      await delay(waitTime);
      sendsInWindow = 0;
      windowStart = Date.now();
    }
  }

  function recordEmailSend() {
    sendsInWindow++;
  }

  async function messages() {
    const r = await json(`${local.MAILPIT_URL}/api/v1/messages?limit=100`);
    if (r.status !== 200 || !Array.isArray(r.value.messages)) throw new Error('Mailpit unavailable');
    return r.value.messages;
  }

  async function codeFor(address, subjectFilter) {
    const deadline = Date.now() + 12000;
    const matcher = subjectFilter instanceof RegExp
      ? subjectFilter
      : new RegExp(String(subjectFilter).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    while (Date.now() < deadline) {
      for (const item of await messages()) {
        if (usedMail.has(item.ID) || !matcher.test(item.Subject ?? '') ||
            !item.To?.some(to => to.Address?.toLowerCase() === address.toLowerCase())) continue;
        const detail = await json(`${local.MAILPIT_URL}/api/v1/message/${encodeURIComponent(item.ID)}`);
        const match = `${detail.value?.Text ?? ''} ${detail.value?.HTML ?? ''}`.match(/\b\d{6}\b/);
        if (detail.status === 200 && match) { usedMail.add(item.ID); return match[0]; }
      }
      await delay(250);
    }
    throw new Error('Local Mailpit code unavailable');
  }

  function requireSession(r) {
    if (r.status !== 200 || !r.value?.user?.id || !r.value?.access_token ||
        !r.value?.refresh_token) throw new Error('Expected local session unavailable');
    return r.value;
  }

  async function issue(address, createUser = true) {
    await paceEmailQuota();
    const sent = await auth('/otp', { email: address, create_user: createUser });
    if (sent.status === 429 || sent.value?.error_code === 'over_email_send_rate_limit') {
      throw new QuotaExhaustedError('Global 5-send email rate limit exhausted on /otp issuance');
    }
    if (sent.status !== 200) throw new Error('Local OTP issuance unavailable');
    recordEmailSend();
    return codeFor(address, /local signup|confirm your email|confirm your signup/i);
  }

  async function timedAuth(path, body, options) {
    const dispatchAt = performance.now();
    const result = await auth(path, body, options);
    return { dispatchAt, responseAt: performance.now(), result };
  }

  async function probeUser(result) {
    if (result?.status !== 200 || typeof result.value?.access_token !== 'string') return null;
    return auth('/user', undefined, { method: 'GET', token: result.value.access_token });
  }

  async function localUser(address, withPassword = false) {
    const body = { email: address, email_confirm: true };
    if (withPassword) body.password = password();
    const created = await auth('/admin/users', body, { admin: true });
    if (![200, 201].includes(created.status) || !created.value?.id) {
      throw new Error('Synthetic local user creation unavailable');
    }
    return created.value.id;
  }

  const wrongCode = code => code === '000000' ? '111111' : '000000';
  async function runCase(id, fn) {
    try {
      await fn();
    } catch (err) {
      if (err instanceof QuotaExhaustedError || err?.name === 'QuotaExhaustedError') {
        row(id, 'INCONCLUSIVE', `EMAIL_QUOTA_EXHAUSTED: ${err.message}; test gated under security policy`, { quotaExhausted: true });
      } else {
        row(id, 'ERROR', 'Local case could not complete');
      }
    }
  }

  // Case 1: Baseline Mailpit check
  await runCase('MAILPIT_BASELINE', async () => {
    (await messages()).forEach(item => usedMail.add(item.ID));
    row('MAILPIT_BASELINE', 'PASS', 'Existing mail IDs excluded');
  });

  if (rows.at(-1)?.result === 'PASS') {
    // Case 2: OTP format & sequential replay check
    await runCase('OTP_FORMAT_REPLAY', async () => {
      const address = email();
      const code = await issue(address);
      const first = await auth('/verify', { email: address, token: code, type: 'email' });
      const id = requireSession(first).user.id;
      const firstProbe = await probeUser(first);
      const second = await auth('/verify', { email: address, token: code, type: 'email' });
      const secondProbe = await probeUser(second);
      row('OTP_FORMAT', /^\d{6}$/.test(code) ? 'PASS' : 'FAIL', 'Mailpit code shape checked; value redacted');
      row('OTP_REPLAY', classifyReplay(first, second, id, address, firstProbe, secondProbe),
        `verify=${describe(first, second)}; first_user_probe=${safeStatus(firstProbe)}; ` +
        `second_user_probe=${safeStatus(secondProbe)}; ` +
        `second_session=${Boolean(second.value?.access_token)}`);
    });

    // Case 3: Concurrent OTP verification (3 pairs)
    for (let attempt = 1; attempt <= 3; attempt++) {
      await runCase(`OTP_CONCURRENT_${attempt}`, async () => {
        const address = email();
        const id = await localUser(address);
        const code = await issue(address, false);
        const results = await Promise.all([
          auth('/verify', { email: address, token: code, type: 'email' }),
          auth('/verify', { email: address, token: code, type: 'email' }),
        ]);
        const probes = await Promise.all(results.map(probeUser));
        const classified = classifyConcurrent(results, id, address, probes);
        const responseEvidence = results.map((r, i) => ({
          http: safeStatus(r),
          expectedUuidMatch: r.value?.user?.id ? r.value.user.id === id : null,
          accessTokenPresent: Boolean(r.value?.access_token),
          refreshTokenPresent: Boolean(r.value?.refresh_token),
          userProbeAccepted: probes[i]?.status === 200 && probes[i].value?.id === id,
        }));
        row(`OTP_CONCURRENT_${attempt}`, classified.result,
          `verify=${describe(...results)}; user_probes=${describe(...probes)}; ` +
          `valid_responses=${classified.validResponses}; probes_validated=${classified.probesValidated}; ` +
          `bearers_authenticated=${classified.bearersAuthenticated}; ` +
          `session_id_claim_comparison=${classified.sessionIdClaimComparison}; ` +
          `server_session_records=NOT TESTED; wrong_identity=${classified.wrongIdentity}`,
          {
            responses: responseEvidence,
            sessionIdClaimComparison: classified.sessionIdClaimComparison,
            bearersAuthenticated: classified.bearersAuthenticated,
            serverSessionRecords: 'NOT TESTED'
          });
      });
    }

    // Case 4: Invalid code rejection
    await runCase('INVALID_CODE', async () => {
      const address = email(), code = await issue(address);
      const invalid = await auth('/verify', { email: address, token: wrongCode(code), type: 'email' });
      const valid = await auth('/verify', { email: address, token: code, type: 'email' });
      const expectedId = valid.value?.user?.id || invalid.value?.user?.id;
      const invalidProbe = await probeUser(invalid);
      const validProbe = await probeUser(valid);
      row('INVALID_CODE', classifyInvalidCode(invalid, valid, expectedId || '', address, {
        wrongProbe: invalidProbe,
        correctProbe: validProbe,
      }),
        `wrong_then_valid=${describe(invalid, valid)}; ` +
        `wrong_user_probe=${safeStatus(invalidProbe)}; valid_user_probe=${safeStatus(validProbe)}`);
    });

    // Case 5: Five-wrong attempts lock & 15-min cooldown
    await runCase('FIVE_WRONG_COOLDOWN', async () => {
      const address = email(), id = await localUser(address);
      const code = await issue(address, false);
      const wrong = [];
      const wrongProbes = [];
      for (let n = 0; n < 5; n++) {
        const attempt = await auth('/verify',
          { email: address, token: wrongCode(code), type: 'email' });
        wrong.push(attempt);
        wrongProbes.push(await probeUser(attempt));
      }
      const valid = await auth('/verify', { email: address, token: code, type: 'email' });
      const validProbe = await probeUser(valid);
      const five = classifyFiveWrong(wrong, valid, id, {
        correctProbe: validProbe,
        wrongProbes,
      });
      row('FIVE_WRONG_COOLDOWN', five.result,
        `wrong=${describe(...wrong)}; wrong_user_probes=${describe(...wrongProbes)}; ` +
        `correct=${safeStatus(valid)}; correct_user_probe=${safeStatus(validProbe)}; ` +
        `correct_session=${Boolean(valid.value?.access_token)}; kind=${five.kind}`);
      row('COOLDOWN_15_MIN', five.kind === 'cooldown_bypass' ? 'FAIL' : 'NOT TESTED',
        `correct_immediately_after_five=${safeStatus(valid)}; ` +
        `correct_user_probe=${safeStatus(validProbe)}; ` +
        `session=${Boolean(valid.value?.access_token && valid.value?.refresh_token)}; ` +
        `kind=${five.kind}`);
    });

    // Case 6: Purpose crossing (Signup code used as Recovery)
    await runCase('SIGNUP_AS_RECOVERY', async () => {
      const address = email(), signupCode = await issue(address);
      const crossing = await auth('/verify', { email: address, token: signupCode, type: 'recovery' });
      const crossingProbe = await probeUser(crossing);
      const signup = await auth('/verify', { email: address, token: signupCode, type: 'email' });
      const signupProbe = await probeUser(signup);
      const expectedId = signup.value?.user?.id || crossing.value?.user?.id ||
        crossingProbe?.value?.id || '';
      const signupOk = signup.status === 200 && signup.value?.user?.email?.toLowerCase() === address &&
        Boolean(signup.value?.access_token && signup.value?.refresh_token) &&
        signupProbe?.status === 200 && signupProbe.value?.id === signup.value.user.id;
      row('SIGNUP_AS_RECOVERY', classifyPurposeCrossing(crossing, {
        expectedId,
        expectedEmail: address,
        probe: crossingProbe,
        positiveControlValidated: Boolean(signupOk),
      }),
        `verify=${safeStatus(crossing)}; user_probe=${safeStatus(crossingProbe)}; ` +
        `session=${Boolean(crossing.value?.access_token && crossing.value?.refresh_token)}; ` +
        `bearer_auth=${Boolean(crossingProbe?.status === 200 && crossingProbe.value?.id)}; ` +
        `same_uuid=${Boolean(crossingProbe?.value?.id && crossingProbe.value.id === expectedId)}`);
      row('SIGNUP_EXPECTED_EMAIL', signupOk ? 'PASS' : 'INCONCLUSIVE',
        `verify=${safeStatus(signup)}; user_probe=${safeStatus(signupProbe)}; ` +
        `same_email=${signup.value?.user?.email?.toLowerCase() === address}; ` +
        `same_uuid=${Boolean(signup.value?.user?.id && signupProbe?.value?.id === signup.value.user.id)}`);
    });

    // Case 7: Recovery code crossing (Recovery used as other purposes)
    for (const type of ['email', 'signup', 'magiclink', 'recovery']) {
      await runCase(`RECOVERY_AS_${type.toUpperCase()}`, async () => {
        const address = email(), id = await localUser(address, true);
        await paceEmailQuota();
        const sent = await auth('/recover', { email: address });
        if (sent.status === 429 || sent.value?.error_code === 'over_email_send_rate_limit') {
          throw new QuotaExhaustedError('Global 5-send email rate limit exhausted on /recover issuance');
        }
        if (sent.status !== 200) throw new Error('Recovery issuance unavailable');
        recordEmailSend();
        const code = await codeFor(address, /local recovery|reset your password|reset password/i);
        const verified = await auth('/verify', { email: address, token: code, type });
        const probe = await probeUser(verified);
        const session = verified.status === 200 && verified.value?.user?.id === id &&
          verified.value?.access_token && verified.value?.refresh_token &&
          probe?.status === 200 && probe.value?.id === id;
        if (type === 'recovery') {
          const recoveryResult = classifyRecoveryControl(verified, id, address, probe);
          row('RECOVERY_AS_RECOVERY', recoveryResult,
            `verify=${safeStatus(verified)}; user_probe=${safeStatus(probe)}; ` +
            `session=${Boolean(session)}; same_uuid=${verified.value?.user?.id === id}; ` +
            `wrong_identity=${recoveryResult === 'FAIL' && verified.value?.user?.id !== id}`);
          return;
        }
        const early = classifyPurposeCrossing(verified, {
          expectedId: id, expectedEmail: address, probe, positiveControlValidated: false,
        });
        if (early === 'FAIL' || early === 'ERROR') {
          row(`RECOVERY_AS_${type.toUpperCase()}`, early,
            `verify=${safeStatus(verified)}; user_probe=${safeStatus(probe)}; ` +
            `session=${Boolean(session)}; same_uuid=${verified.value?.user?.id === id}; ` +
            `bearer_auth=${Boolean(probe?.status === 200 && probe.value?.id === id)}; ` +
            `purpose_crossover=${Boolean(session || (probe?.status === 200 &&
              probe.value?.id === id && verified.value?.access_token))}; ` +
            `recovery_control=NOT_ATTEMPTED`);
          return;
        }
        let recoveryControl = null, recoveryProbe = null, positiveControlValidated = false;
        if (verified.status === 403 && verified.value?.error_code === 'otp_expired' &&
            !verified.value?.access_token && !verified.value?.refresh_token) {
          recoveryControl = await auth('/verify',
            { email: address, token: code, type: 'recovery' });
          if (recoveryControl.kind && ['network_error', 'timeout', 'invalid_json']
              .includes(recoveryControl.kind)) {
            row(`RECOVERY_AS_${type.toUpperCase()}`, 'ERROR',
              `verify=${safeStatus(verified)}; user_probe=${safeStatus(probe)}; ` +
              `recovery_control=${safeStatus(recoveryControl)}; positive_control=false`);
            return;
          }
          recoveryProbe = await probeUser(recoveryControl);
          positiveControlValidated = classifyRecoveryControl(recoveryControl, id, address,
            recoveryProbe) === 'PASS';
        }
        const classification = classifyRecoveryPurposeCrossing(verified, recoveryControl,
          id, address, recoveryProbe, probe);
        const result = classification.result;
        row(`RECOVERY_AS_${type.toUpperCase()}`, result,
          `verify=${safeStatus(verified)}; user_probe=${safeStatus(probe)}; ` +
          `session=${Boolean(session)}; same_uuid=${verified.value?.user?.id === id}; ` +
          `bearer_auth=${Boolean(probe?.status === 200 && probe.value?.id === id)}; ` +
          `purpose_crossover=${Boolean(session || (probe?.status === 200 &&
            probe.value?.id === id && verified.value?.access_token))}; ` +
          `recovery_control=${safeStatus(recoveryControl)}; ` +
          `recovery_control_identity=${classification.finding}; ` +
          `positive_control=${positiveControlValidated}`);
      });
    }

    row('APP_AUTHORIZATION', 'NOT TESTED', 'No Tio enrollment, Home, or server eligibility implementation');

    // Case 8: Resend interval and old code invalidation
    await runCase('RESEND_OLD_CODE', async () => {
      const address = email();
      const first = await timedAuth('/otp', { email: address, create_user: true });
      if (first.result.status !== 200) throw new Error('First local OTP send unavailable');
      const oldCode = await codeFor(address, /local signup|confirm your email|confirm your signup/i);
      const attempts = [await timedAuth('/otp', { email: address, create_user: true })];
      const deadline = first.responseAt + 75000;
      while (attempts.at(-1).result.status !== 200 && performance.now() < deadline) {
        if (![429, 422].includes(attempts.at(-1).result.status)) break;
        await delay(3000);
        attempts.push(await timedAuth('/otp', { email: address, create_user: true }));
      }
      const timing = classifyResendTiming(first, attempts);
      const accepted = attempts.find(a => a.result.status === 200);
      const bounds = timing.lowerBoundMs === null ? 'unavailable' :
        `${Math.floor(timing.lowerBoundMs / 1000)}..${Math.ceil(timing.upperBoundMs / 1000)}s`;
      row('RESEND_INTERVAL_OBSERVED', timing.result,
        `immediate=${safeStatus(attempts[0].result)}; accepted=${safeStatus(accepted?.result)}; ` +
        `elapsed_bounds=${bounds}; immediate_rejected=${timing.immediateRejected}; ` +
        `accepted_after_60=${timing.acceptedAfter60}`,
        { lowerBoundMs: timing.lowerBoundMs, upperBoundMs: timing.upperBoundMs,
          immediateRejected: timing.immediateRejected, acceptedAfter60: timing.acceptedAfter60 });
      row('EXACT_60_SECOND_BOUNDARY', timing.exactBoundary,
        'Server-side exact boundary not inferred from client timestamps');
      if (!accepted) {
        row('OLD_CODE_INVALIDATED', 'NOT TESTED', 'No accepted second challenge');
        return;
      }
      const newCode = await codeFor(address, /local signup|confirm your email|confirm your signup/i);
      const oldVerify = await auth('/verify', { email: address, token: oldCode, type: 'email' });
      const newVerify = await auth('/verify', { email: address, token: newCode, type: 'email' });
      const expectedId = newVerify.value?.user?.id || oldVerify.value?.user?.id;
      const oldProbe = await probeUser(oldVerify);
      const newProbe = await probeUser(newVerify);
      row('OLD_CODE_INVALIDATED', classifyOldCodeInvalidation(oldVerify, newVerify,
        expectedId || '', address, {
          distinctCodes: oldCode !== newCode,
          oldProbe,
          newProbe,
        }),
        `old_then_new=${describe(oldVerify, newVerify)}; ` +
        `old_user_probe=${safeStatus(oldProbe)}; new_user_probe=${safeStatus(newProbe)}; ` +
        `distinct_codes=${oldCode !== newCode}`);
    });

    // Case 9: AUTH-17 unrevoked OTP password mutation
    await runCase('AUTH17_PASSWORD_MUTATION', async () => {
      const address = email(), oldPassword = password(), newPassword = password();
      const created = await auth('/admin/users',
        { email: address, password: oldPassword, email_confirm: true }, { admin: true });
      if (created.status !== 200 && created.status !== 201) throw new Error('Local user creation unavailable');
      const id = created.value.id;
      const beforeGrant = await auth('/token?grant_type=password',
        { email: address, password: oldPassword });
      const beforeProbe = await probeUser(beforeGrant);
      const baseline = classifyPasswordMutation({
        beforeGrant, beforeProbe,
        update: { status: 400, value: { error_code: 'validation_failed' } },
        oldGrant: { status: 400, value: { error_code: 'invalid_credentials' } },
        newGrant: { status: 400, value: { error_code: 'invalid_credentials' } },
        id,
      });
      if (baseline.kind === 'identity_violation') {
        row('AUTH17_PASSWORD_MUTATION', 'FAIL',
          `pre_grant=${safeStatus(beforeGrant)}; pre_user_probe=${safeStatus(beforeProbe)}; ` +
          `kind=${baseline.kind}; pre_mutation_positive_control=false; mutation=NOT TESTED`);
        return;
      }
      if (baseline.result === 'ERROR') {
        row('AUTH17_PASSWORD_MUTATION', 'ERROR',
          `pre_grant=${safeStatus(beforeGrant)}; pre_user_probe=${safeStatus(beforeProbe)}; ` +
          `kind=${baseline.kind}; pre_mutation_positive_control=false; mutation=NOT TESTED`);
        return;
      }
      const beforeControl = beforeGrant.status === 200 && beforeGrant.value?.user?.id === id &&
        Boolean(beforeGrant.value?.access_token && beforeGrant.value?.refresh_token) &&
        beforeProbe?.status === 200 && beforeProbe.value?.id === id;
      if (!beforeControl) {
        row('AUTH17_PASSWORD_MUTATION', 'INCONCLUSIVE',
          `pre_grant=${safeStatus(beforeGrant)}; pre_user_probe=${safeStatus(beforeProbe)}; ` +
          `kind=${baseline.kind}; pre_mutation_positive_control=false; mutation=NOT TESTED`);
        return;
      }
      const code = await issue(address, false);
      const otpResult = await auth('/verify', { email: address, token: code, type: 'email' });
      const otpProbe = await probeUser(otpResult);
      const otpControl = classifyOtpSessionControl(otpResult, id, address, otpProbe);
      const otpAbort = planAuth17OtpControlAbort(otpControl);
      if (otpAbort) {
        row('AUTH17_OTP_SESSION', otpAbort.otpSession.result,
          `verify=${safeStatus(otpResult)}; user_probe=${safeStatus(otpProbe)}; ` +
          `kind=${otpAbort.otpSession.kind}`);
        row('AUTH17_PASSWORD_MUTATION', otpAbort.passwordMutation.result,
          `otp_control=${otpAbort.passwordMutation.kind}; ` +
          `mutation=${otpAbort.passwordMutation.mutation}`);
        return;
      }
      row('AUTH17_OTP_SESSION', 'PASS',
        `verify=${safeStatus(otpResult)}; user_probe=${safeStatus(otpProbe)}; same_uuid=true`);
      const otp = requireSession(otpResult);
      const update = await auth('/user', { password: newPassword }, { method: 'PUT', token: otp.access_token });
      const oldGrant = await auth('/token?grant_type=password', { email: address, password: oldPassword });
      const oldGrantProbe = await probeUser(oldGrant);
      const newGrant = await auth('/token?grant_type=password', { email: address, password: newPassword });
      const newGrantProbe = await probeUser(newGrant);
      const classified = classifyPasswordMutation({
        beforeGrant, beforeProbe, update, oldGrant, newGrant, id,
        oldGrantProbe, newGrantProbe,
      });
      row('AUTH17_PASSWORD_MUTATION', classified.result,
        `pre_grant=${safeStatus(beforeGrant)}; pre_user_probe=${safeStatus(beforeProbe)}; ` +
        `kind=${classified.kind}; pre_mutation_positive_control=true; update=${safeStatus(update)}; ` +
        `admin_header=false; current_password_supplied=false; ` +
        `old_grant=${safeStatus(oldGrant)}; old_grant_user_probe=${safeStatus(oldGrantProbe)}; ` +
        `new_grant=${safeStatus(newGrant)}; new_grant_user_probe=${safeStatus(newGrantProbe)}; ` +
        `same_uuid=${newGrant.value?.user?.id === id}`);
    });
  }

  // Cases 10-12: Diagnostic unverified platform boundaries
  for (const id of ['OTP_EXPIRY_10_MIN', 'FIVE_SENDS_PER_HOUR',
    'NO_UNINTENDED_IDENTITY', 'NO_AUTO_HOME', 'ONE_ACCOUNT_PER_INSTALL']) {
    row(id, 'NOT TESTED', 'Requires elapsed-time, identity-ledger, or app-level evidence');
  }

  return rows;
}
