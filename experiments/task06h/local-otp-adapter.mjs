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

// Generates valid local HS256 JWT tokens using the configured local test secret.
export function signLocalJwt(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encode = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const unsignedToken = `${encode(header)}.${encode(payload)}`;
  const signature = createHmac('sha256', secret).update(unsignedToken).digest('base64url');
  return `${unsignedToken}.${signature}`;
}

export function generateLocalKeys(jwtSecret) {
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

export function inspectWindowsListenersRuntime(ports = [55621, 55624]) {
  try {
    const portList = ports.join(',');
    const psScript = `Get-NetTCPConnection -LocalPort ${portList} -ErrorAction SilentlyContinue | Select-Object LocalAddress, LocalPort, State | ConvertTo-Json`;
    const output = execFileSync('powershell.exe', ['-NoProfile', '-Command', psScript], {
      encoding: 'utf8',
      timeout: 10000,
    }).trim();

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
  const run = (file, args) => execFileSync(file, args, {
    encoding: 'utf8',
    timeout: 15000,
    maxBuffer: 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const attached = Object.values(
    JSON.parse(run('docker', ['network', 'inspect', network]))[0]?.Containers ?? {}
  );
  if (!attached.length) throw new Error('No containers attached to the project network');

  const containers = attached.map(entry => {
    const name = entry?.Name;
    if (typeof name !== 'string' || !name) throw new Error('Project container name unavailable');
    return JSON.parse(run('docker', ['inspect', name]))[0];
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
  const jwtSecret = process.env.JWT_SECRET || 'super-secret-jwt-token-with-at-least-32-characters-long';
  const keys = generateLocalKeys(jwtSecret);

  // Runtime container and listener inspection
  inspectDockerStackRuntime();

  return {
    ...expected,
    ...keys,
  };
}

// Complete integration suite runner — executed only after live startup authorization.
export async function executeAuthIntegrationSuite(local) {
  if (!local?.API_URL || !local?.MAILPIT_URL || !local?.PUBLISHABLE_KEY || !local?.SERVICE_ROLE_KEY) {
    throw new Error('Local stack configuration and credentials required to run integration suite');
  }

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

  async function messages() {
    const r = await json(`${local.MAILPIT_URL}/api/v1/messages?limit=100`);
    if (r.status !== 200 || !Array.isArray(r.value.messages)) throw new Error('Mailpit unavailable');
    return r.value.messages;
  }

  async function codeFor(address, subject) {
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      for (const item of await messages()) {
        if (usedMail.has(item.ID) || !item.Subject?.includes(subject) ||
            !item.To?.some(to => to.Address?.toLowerCase() === address)) continue;
        const detail = await json(`${local.MAILPIT_URL}/api/v1/message/${encodeURIComponent(item.ID)}`);
        const match = `${detail.value.Text ?? ''} ${detail.value.HTML ?? ''}`.match(/\b\d{6}\b/);
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
    const sent = await auth('/otp', { email: address, create_user: createUser });
    if (sent.status !== 200) throw new Error('Local OTP issuance unavailable');
    return codeFor(address, 'local signup');
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

  async function runCase(id, fn) {
    try { await fn(); } catch { row(id, 'ERROR', 'Local case could not complete'); }
  }

  // Baseline Mailpit check
  await runCase('MAILPIT_BASELINE', async () => {
    (await messages()).forEach(item => usedMail.add(item.ID));
    row('MAILPIT_BASELINE', 'PASS', 'Existing mail IDs excluded');
  });

  // OTP replay check
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

  return rows;
}
