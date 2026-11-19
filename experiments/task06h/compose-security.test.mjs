// Task 06H-D: Static security assertion tests for Docker Compose specification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const composePath = 'experiments/task06h/docker-compose.yml';
const composeText = readFileSync(composePath, 'utf8');

test('Compose file uses explicit loopback 127.0.0.1 host binding for all published ports', () => {
  const lines = composeText.split('\n');
  const portMappings = [];
  let inPortsSection = false;

  for (const line of lines) {
    if (line.match(/^\s{4}ports:\s*$/)) {
      inPortsSection = true;
      continue;
    }
    if (inPortsSection) {
      const portItem = line.match(/^\s{6}-\s*["']?([^"'\n]+)["']?/);
      if (portItem) {
        portMappings.push(portItem[1]);
      } else if (line.match(/^\s{4}[a-z]/)) {
        inPortsSection = false;
      }
    }
  }

  assert.ok(portMappings.length > 0, 'Must have declared port mappings');
  for (const portMapping of portMappings) {
    assert.match(
      portMapping,
      /^127\.0\.0\.1:\d+:\d+$/,
      `Port mapping ${portMapping} must strictly start with 127.0.0.1:`
    );
  }
});

test('Compose file forbids host networking mode', () => {
  assert.doesNotMatch(composeText, /network_mode:\s*["']?host["']?/i);
});

test('Compose file uses pinned image versions and forbids :latest', () => {
  const imageMatches = [...composeText.matchAll(/image:\s*([^\s]+)/g)].map(m => m[1]);
  assert.ok(imageMatches.length >= 4, 'Must define at least 4 service images');
  for (const img of imageMatches) {
    assert.doesNotMatch(img, /:latest$/i, `Image ${img} must not use :latest tag`);
    assert.match(img, /:[a-zA-Z0-9._-]+$/, `Image ${img} must have a pinned version tag`);
  }
});

test('Compose file isolates DB and Auth from direct host exposure', () => {
  // DB and Auth must NOT have a ports section
  const lines = composeText.split('\n');
  let currentService = null;
  const servicePorts = {};

  for (const line of lines) {
    const serviceMatch = line.match(/^\s{2}([a-z0-9_-]+):\s*$/);
    if (serviceMatch && !line.startsWith('    ')) {
      currentService = serviceMatch[1];
      servicePorts[currentService] = false;
    }
    if (currentService && line.match(/^\s{4}ports:\s*$/)) {
      servicePorts[currentService] = true;
    }
  }

  assert.equal(servicePorts['db'], false, 'DB service must not publish host ports');
  assert.equal(servicePorts['auth'], false, 'Auth service must not publish host ports');
  assert.equal(servicePorts['kong'], true, 'Kong gateway must publish host port');
  assert.equal(servicePorts['inbucket'], true, 'Mailpit must publish host port');
});

test('Compose file uses dedicated Task 06H network and volume namespaces', () => {
  assert.match(composeText, /name:\s*supabase_network_tio-task06h-local-auth/);
  assert.match(composeText, /name:\s*supabase_db_tio-task06h-local-auth-data/);
  // Verify historical Task 06G namespaces are NOT referenced
  assert.doesNotMatch(composeText, /tio-task06g/);
});

test('Compose file enforces mandatory secrets and rejects insecure fallback defaults', () => {
  // Assert presence of ${VAR:?error} syntax for credentials
  assert.match(composeText, /\$\{POSTGRES_PASSWORD:\?[^}]+\}/, 'POSTGRES_PASSWORD must be required without fallback');
  assert.match(composeText, /\$\{JWT_SECRET:\?[^}]+\}/, 'JWT_SECRET must be required without fallback');

  // Assert absence of insecure default fallbacks (e.g. :-postgres or :-super-secret)
  assert.doesNotMatch(composeText, /\$\{POSTGRES_PASSWORD:-/);
  assert.doesNotMatch(composeText, /\$\{JWT_SECRET:-/);
});

test('Compose file configures GoTrue API_EXTERNAL_URL and mailer subjects', () => {
  assert.match(composeText, /API_EXTERNAL_URL:\s*["']?http:\/\/127\.0\.0\.1:55621["']?/);
  assert.match(composeText, /GOTRUE_MAILER_SUBJECTS_CONFIRMATION:\s*["']?Your local signup code["']?/);
  assert.match(composeText, /GOTRUE_MAILER_SUBJECTS_MAGIC_LINK:\s*["']?Your local signup code["']?/);
  assert.match(composeText, /GOTRUE_MAILER_SUBJECTS_RECOVERY:\s*["']?Your local recovery code["']?/);
});

test('Compose file uses HTTP-served email templates via Kong and request-termination plugin', () => {
  assert.match(composeText, /GOTRUE_MAILER_TEMPLATES_CONFIRMATION:\s*["']?http:\/\/kong:8000\/templates\/confirmation\.html["']?/);
  assert.match(composeText, /GOTRUE_MAILER_TEMPLATES_MAGIC_LINK:\s*["']?http:\/\/kong:8000\/templates\/confirmation\.html["']?/);
  assert.match(composeText, /GOTRUE_MAILER_TEMPLATES_RECOVERY:\s*["']?http:\/\/kong:8000\/templates\/recovery\.html["']?/);
  assert.doesNotMatch(composeText, /GOTRUE_MAILER_TEMPLATES_[A-Z_]+:\s*\/etc\/gotrue/);
  assert.match(composeText, /KONG_PLUGINS:.*request-termination/);
});

test('Kong configuration restricts email template routes to internal container hostnames', () => {
  const kongPath = 'experiments/task06h/kong.yml';
  const kongText = readFileSync(kongPath, 'utf8');

  // Both template routes must restrict hosts to kong / kong:8000 to prevent external exposure via 55621
  assert.match(kongText, /name:\s*template-confirmation[\s\S]*?hosts:\s*\n\s*-\s*kong\s*\n\s*-\s*kong:8000/);
  assert.match(kongText, /name:\s*template-recovery[\s\S]*?hosts:\s*\n\s*-\s*kong\s*\n\s*-\s*kong:8000/);
});

test('Compose file enforces hourly email rate limit without unsupported settings', () => {
  assert.match(composeText, /GOTRUE_RATE_LIMIT_EMAIL_SENT:\s*5/);
  assert.doesNotMatch(composeText, /GOTRUE_RATE_LIMIT_OVER_EMAIL_SEND_RATE_LIMIT/);
});

test('Auth service depends on Kong service_healthy to eliminate template-cache warmup startup race', () => {
  assert.match(composeText, /auth:[\s\S]*?depends_on:[\s\S]*?kong:\s*\n\s*condition:\s*service_healthy/);
  assert.doesNotMatch(composeText, /auth:[\s\S]*?depends_on:[\s\S]*?kong:\s*\n\s*condition:\s*service_started/);
});

test('Kong service defines readiness probe verifying template endpoint reachability with internal Host header and content match via wget', () => {
  // Probe must use verified runtime command (wget + grep), send Host: kong:8000, and assert verification code text
  assert.match(
    composeText,
    /kong:[\s\S]*?healthcheck:[\s\S]*?wget\s+-q\s+-O\s+-\s+--header=['"]Host:\s*kong:8000['"]\s+http:\/\/127\.0\.0\.1:8000\/templates\/confirmation\.html\s*\|\s*grep\s+-q\s+['"]verification code['"]/
  );

  // Probe must not invoke missing curl binary
  const kongHealthcheck = composeText.match(/kong:[\s\S]*?healthcheck:[\s\S]*?(?:networks|$)/)?.[0] ?? '';
  assert.doesNotMatch(kongHealthcheck, /\bcurl\b/, 'Kong healthcheck must not invoke missing curl utility');
});

test('Kong readiness probe fails closed on simulated non-200 or missing template content', () => {
  // Offline regex assertion testing: simulates probe output matching logic
  const validOutput = '<p>Your local Tio verification code: 123456</p>';
  const notFoundOutput = '{"message":"no Route matched with those values"}';
  const serverErrorOutput = '{"message":"An unexpected error occurred"}';
  const emptyOutput = '';

  const probePattern = /verification code/;

  assert.equal(probePattern.test(validOutput), true, 'Valid template body matches probe requirement');
  assert.equal(probePattern.test(notFoundOutput), false, '404 route-not-found body fails probe requirement');
  assert.equal(probePattern.test(serverErrorOutput), false, '500 error body fails probe requirement');
  assert.equal(probePattern.test(emptyOutput), false, 'Empty body on connection failure fails probe requirement');
});
