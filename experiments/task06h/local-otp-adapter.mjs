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
