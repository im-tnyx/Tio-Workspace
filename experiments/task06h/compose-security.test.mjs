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
