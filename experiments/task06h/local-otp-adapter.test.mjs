// Task 06H-D: Unit tests for local OTP adapter module.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import * as localOtpModule from './local-otp-adapter.mjs';
import {
  signLocalJwt,
  generateLocalKeys,
  getRequiredJwtSecret,
  assertRuntimeStackIsolation,
  executeAuthIntegrationSuite,
  validateLocalStackConfig,
  project,
  network,
  expected,
} from './local-otp-adapter.mjs';

test('signLocalJwt creates valid verifiable HS256 tokens', () => {
  const secret = 'test-secret-with-at-least-32-chars';
  const payload = { sub: 'user-123', role: 'authenticated' };

  const token = signLocalJwt(payload, secret);
  const parts = token.split('.');
  assert.equal(parts.length, 3, 'JWT must have 3 parts');

  const [headerB64, payloadB64, signature] = parts;
  const decodedHeader = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
  const decodedPayload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));

  assert.equal(decodedHeader.alg, 'HS256');
  assert.equal(decodedPayload.sub, 'user-123');

  const expectedSig = createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');
  assert.equal(signature, expectedSig, 'Signature must match HMAC-SHA256 calculation');
});

test('getRequiredJwtSecret enforces mandatory secret and rejects insecure fallbacks', () => {
  const origSecret = process.env.JWT_SECRET;
  try {
    delete process.env.JWT_SECRET;
    assert.throws(() => getRequiredJwtSecret(), /JWT_SECRET must be set via environment/);

    process.env.JWT_SECRET = 'short';
    assert.throws(() => getRequiredJwtSecret(), /at least 32 characters long/);

    process.env.JWT_SECRET = '   valid-secret-with-at-least-32-characters-length   ';
    assert.equal(getRequiredJwtSecret(), 'valid-secret-with-at-least-32-characters-length');
  } finally {
    if (origSecret !== undefined) process.env.JWT_SECRET = origSecret;
    else delete process.env.JWT_SECRET;
  }
});

test('generateLocalKeys produces compliant anon and service_role tokens with valid secret', () => {
  const secret = 'super-secret-jwt-token-with-at-least-32-characters-long';
  const keys = generateLocalKeys(secret);

  assert.ok(keys.PUBLISHABLE_KEY, 'Publishable key must be generated');
  assert.ok(keys.SERVICE_ROLE_KEY, 'Service role key must be generated');

  const decodePayload = token =>
    JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));

  const pubPayload = decodePayload(keys.PUBLISHABLE_KEY);
  const servPayload = decodePayload(keys.SERVICE_ROLE_KEY);

  assert.equal(pubPayload.role, 'anon');
  assert.equal(pubPayload.iss, 'supabase');
  assert.equal(servPayload.role, 'service_role');
  assert.equal(servPayload.iss, 'supabase');
});

test('adapter defaults adhere to isolated Task 06H namespace', () => {
  assert.equal(project, 'tio-task06h-local-auth');
  assert.equal(network, 'supabase_network_tio-task06h-local-auth');
  assert.equal(expected.API_URL, 'http://127.0.0.1:55621');
  assert.equal(expected.MAILPIT_URL, 'http://127.0.0.1:55624');
});

test('executeAuthIntegrationSuite public entrypoint unconditionally enforces real preflight and ignores bypass attempts', async () => {
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error('fetch should not be called');
  };

  try {
    // Calling executeAuthIntegrationSuite with a caller-provided bypass MUST NOT bypass real preflight.
    // It must invoke real assertRuntimeStackIsolation, which fails closed when Docker/Windows stack is not running.
    await assert.rejects(
      async () => executeAuthIntegrationSuite(
        {
          API_URL: 'http://127.0.0.1:55621',
          MAILPIT_URL: 'http://127.0.0.1:55624',
          PUBLISHABLE_KEY: 'test-pub',
          SERVICE_ROLE_KEY: 'test-serv',
        },
        // Attacker or rogue caller attempts to pass a mock preflight validator:
        { preflightValidator: async () => true }
      ),
      /network .* not found|No containers attached to the project network|Host listener validation failed|MISSING_WINDOWS_LISTENER/
    );
    assert.equal(fetchCalled, false, 'No fetch request must be made when real preflight fails');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('local-otp-adapter does not export bypassable internal network runners', () => {
  // Ensure _executeAuthIntegrationSuiteInternal or any mockable network runner is NOT exported
  assert.equal(
    typeof localOtpModule._executeAuthIntegrationSuiteInternal,
    'undefined',
    'Internal runner _executeAuthIntegrationSuiteInternal must not be exported'
  );

  // executeAuthIntegrationSuite is the only network entrypoint and takes exactly 1 parameter (local)
  assert.equal(
    typeof localOtpModule.executeAuthIntegrationSuite,
    'function',
    'executeAuthIntegrationSuite must be exported'
  );
  assert.equal(
    localOtpModule.executeAuthIntegrationSuite.length,
    1,
    'executeAuthIntegrationSuite must accept only 1 parameter (local)'
  );
});

test('validateLocalStackConfig validates loopback URLs and credentials purely offline without network', () => {
  assert.throws(
    () => validateLocalStackConfig(null),
    /Invalid or non-loopback stack URLs refused/
  );
  assert.throws(
    () => validateLocalStackConfig({}),
    /Invalid or non-loopback stack URLs refused/
  );
  assert.throws(
    () => validateLocalStackConfig({
      API_URL: 'http://192.168.1.100:55621',
      MAILPIT_URL: 'http://127.0.0.1:55624',
      PUBLISHABLE_KEY: 'test-pub',
      SERVICE_ROLE_KEY: 'test-serv',
    }),
    /Invalid or non-loopback stack URLs refused/
  );
  assert.throws(
    () => validateLocalStackConfig({
      API_URL: 'http://127.0.0.1:55621',
      MAILPIT_URL: 'http://10.0.0.1:55624',
      PUBLISHABLE_KEY: 'test-pub',
      SERVICE_ROLE_KEY: 'test-serv',
    }),
    /Invalid or non-loopback stack URLs refused/
  );
  assert.throws(
    () => validateLocalStackConfig({
      API_URL: 'http://127.0.0.1:55621',
      MAILPIT_URL: 'http://127.0.0.1:55624',
    }),
    /Local stack configuration and credentials required to run integration suite/
  );
  assert.throws(
    () => validateLocalStackConfig({
      API_URL: 'http://127.0.0.1:55621',
      MAILPIT_URL: 'http://127.0.0.1:55624',
      PUBLISHABLE_KEY: 'test-pub',
    }),
    /Local stack configuration and credentials required to run integration suite/
  );

  assert.equal(
    validateLocalStackConfig({
      API_URL: 'http://127.0.0.1:55621',
      MAILPIT_URL: 'http://127.0.0.1:55624',
      PUBLISHABLE_KEY: 'test-pub',
      SERVICE_ROLE_KEY: 'test-serv',
    }),
    true
  );
});
