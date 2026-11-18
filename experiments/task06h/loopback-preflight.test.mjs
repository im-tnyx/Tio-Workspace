// Task 06H-D: Unit tests for loopback and Windows listener preflight module.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  nonLoopbackPublishedPorts,
  preflightFailureKind,
  preflightFailureObservation,
  validateWindowsListeners,
  validateIsolatedLoopbackStack,
} from './loopback-preflight.mjs';

test('nonLoopbackPublishedPorts flags empty, wildcard and non-loopback IPs', () => {
  const ports = {
    '8000/tcp': [
      { HostIp: '127.0.0.1', HostPort: '55621' },
      { HostIp: '0.0.0.0', HostPort: '55621' },
      { HostIp: '', HostPort: '55621' },
    ],
    '8025/tcp': [
      { HostIp: '::1', HostPort: '55624' },
      { HostIp: '192.168.1.50', HostPort: '55624' },
    ],
  };

  const flagged = nonLoopbackPublishedPorts(ports);
  assert.equal(flagged.length, 3);
  assert.equal(flagged[0].HostIp, '0.0.0.0');
  assert.equal(flagged[1].HostIp, '');
  assert.equal(flagged[2].HostIp, '192.168.1.50');
});

test('validateWindowsListeners passes when all required ports are on 127.0.0.1', () => {
  const connections = [
    { LocalAddress: '127.0.0.1', LocalPort: 55621, State: 'Listen' },
    { LocalAddress: '127.0.0.1', LocalPort: 55624, State: 'Listen' },
    { LocalAddress: '0.0.0.0', LocalPort: 135, State: 'Listen' }, // Unrelated port
  ];

  assert.equal(validateWindowsListeners(['55621', '55624'], connections), true);
});

test('validateWindowsListeners rejects non-loopback listener on target port', () => {
  const connections = [
    { LocalAddress: '0.0.0.0', LocalPort: 55621, State: 'Listen' },
    { LocalAddress: '127.0.0.1', LocalPort: 55624, State: 'Listen' },
  ];

  assert.throws(
    () => validateWindowsListeners(['55621', '55624'], connections),
    /UNSAFE_WINDOWS_LISTENER: port 55621 is listening on non-loopback 0\.0\.0\.0/
  );
});

test('validateWindowsListeners rejects missing listener on target port', () => {
  const connections = [
    { LocalAddress: '127.0.0.1', LocalPort: 55621, State: 'Listen' },
    // 55624 is absent
  ];

  assert.throws(
    () => validateWindowsListeners(['55621', '55624'], connections),
    /MISSING_WINDOWS_LISTENER: port 55624 has no active loopback listener/
  );
});

test('validateIsolatedLoopbackStack validates compliant Compose containers', () => {
  const project = 'tio-task06h-local-auth';
  const network = `supabase_network_${project}`;

  const makeContainer = (part, image, portBindings = {}) => ({
    Name: `/supabase_${part}_${project}`,
    State: { Running: true },
    Config: { Image: image },
    NetworkSettings: {
      Networks: { [network]: {} },
      Ports: portBindings,
    },
  });

  const containers = [
    makeContainer('auth', 'public.ecr.aws/supabase/gotrue:v2.197.0'),
    makeContainer('db', 'public.ecr.aws/supabase/postgres:17.11.0.004'),
    makeContainer('kong', 'public.ecr.aws/supabase/kong:2.8.1', {
      '8000/tcp': [{ HostIp: '127.0.0.1', HostPort: '55621' }],
    }),
    makeContainer('inbucket', 'public.ecr.aws/supabase/mailpit:v1.31.3', {
      '8025/tcp': [{ HostIp: '127.0.0.1', HostPort: '55624' }],
    }),
  ];

  assert.equal(
    validateIsolatedLoopbackStack({
      containers,
      network,
      project,
    }),
    true
  );
});

test('validateIsolatedLoopbackStack fails on wildcard port exposure', () => {
  const project = 'tio-task06h-local-auth';
  const network = `supabase_network_${project}`;

  const containers = [
    {
      Name: `/supabase_auth_${project}`,
      State: { Running: true },
      Config: { Image: 'public.ecr.aws/supabase/gotrue:v2.197.0' },
      NetworkSettings: {
        Networks: { [network]: {} },
        Ports: {
          '9999/tcp': [{ HostIp: '0.0.0.0', HostPort: '55629' }],
        },
      },
    },
  ];

  assert.throws(
    () => validateIsolatedLoopbackStack({ containers, network, project }),
    /Local stack has a non-loopback published port/
  );
});

test('preflight failure classifications map correctly', () => {
  assert.equal(
    preflightFailureKind(new Error('UNSAFE_WINDOWS_LISTENER: 0.0.0.0')),
    'unsafe_published_port'
  );
  assert.equal(
    preflightFailureKind(new Error('MISSING_WINDOWS_LISTENER: 55621')),
    'missing_listener'
  );
  assert.equal(
    preflightFailureKind(new Error('No project containers to validate')),
    'no_containers'
  );

  const obs = preflightFailureObservation('unsafe_published_port');
  assert.match(obs, /UNSAFE_PUBLISHED_PORT/);
});
