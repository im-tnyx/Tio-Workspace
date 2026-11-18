// Task 06H-D: Unit tests for local OTP adapter module.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  signLocalJwt,
  generateLocalKeys,
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

test('generateLocalKeys produces compliant anon and service_role tokens', () => {
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

test('executeAuthIntegrationSuite fails closed if required stack credentials are missing', async () => {
  const { executeAuthIntegrationSuite } = await import('./local-otp-adapter.mjs');
  await assert.rejects(
    async () => executeAuthIntegrationSuite(null),
    /Local stack configuration and credentials required to run integration suite/
  );
  await assert.rejects(
    async () => executeAuthIntegrationSuite({ API_URL: 'http://127.0.0.1:55621' }),
    /Local stack configuration and credentials required to run integration suite/
  );
});
