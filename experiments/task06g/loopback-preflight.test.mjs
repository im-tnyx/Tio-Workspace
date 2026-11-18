import assert from 'node:assert/strict';
import test from 'node:test';
import {
  nonLoopbackPublishedPorts,
  preflightFailureKind,
  preflightFailureObservation,
  validateIsolatedLoopbackStack,
} from './loopback-preflight.mjs';

const project = 'tio-task06g-local-otp';
const network = `supabase_network_${project}`;
const gotrueImage = 'public.ecr.aws/supabase/gotrue:v2.197.0';

const container = (part, ports, extras = {}) => ({
  Name: `/supabase_${part}_${project}`,
  State: { Running: true },
  Config: part === 'auth' ? { Image: gotrueImage } : {},
  NetworkSettings: {
    Networks: { [network]: {} },
    Ports: ports,
  },
  ...extras,
});

const loopback = hostPort => [{ HostIp: '127.0.0.1', HostPort: hostPort }];
const required = [
  container('auth', { '9999/tcp': loopback('55999') }),
  container('db', { '5432/tcp': loopback('55622') }),
  container('kong', { '8000/tcp': loopback('55621') }),
  container('inbucket', { '8025/tcp': loopback('55624') }),
];

test('non-loopback published ports are detected', () => {
  assert.equal(nonLoopbackPublishedPorts({ '3000/tcp': loopback('55623') }).length, 0);
  assert.equal(nonLoopbackPublishedPorts({
    '3000/tcp': [{ HostIp: '0.0.0.0', HostPort: '55623' }],
  }).length, 1);
  assert.equal(nonLoopbackPublishedPorts({
    '3000/tcp': [{ HostIp: '::', HostPort: '55623' }],
  }).length, 1);
});

test('loopback-only required stack is accepted', () => {
  assert.equal(validateIsolatedLoopbackStack({
    containers: required,
    network,
    project,
    gotrueImage,
  }), true);
});

test('studio LAN publish rejects the whole project stack', () => {
  const studio = container('studio', {
    '3000/tcp': [{ HostIp: '0.0.0.0', HostPort: '55623' }],
  });
  assert.throws(() => validateIsolatedLoopbackStack({
    containers: [...required, studio],
    network,
    project,
    gotrueImage,
  }), /non-loopback published port/);
});

test('analytics LAN publish rejects the whole project stack', () => {
  const analytics = container('analytics', {
    '4000/tcp': [{ HostIp: '::', HostPort: '55627' }],
  });
  assert.throws(() => validateIsolatedLoopbackStack({
    containers: [...required, analytics],
    network,
    project,
    gotrueImage,
  }), /non-loopback published port/);
});

test('missing required auth container still fails closed', () => {
  assert.throws(() => validateIsolatedLoopbackStack({
    containers: required.filter(c => !c.Name.includes('_auth_')),
    network,
    project,
    gotrueImage,
  }), /Unexpected local auth/);
});

test('unsafe published-port rejection has a clear non-success diagnostic', () => {
  const studio = container('studio', {
    '3000/tcp': [{ HostIp: '0.0.0.0', HostPort: '55623' }],
  });
  let caught;
  try {
    validateIsolatedLoopbackStack({
      containers: [...required, studio],
      network,
      project,
      gotrueImage,
    });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, 'unsafe stack must throw');
  assert.equal(preflightFailureKind(caught), 'unsafe_published_port');
  const observed = preflightFailureObservation('unsafe_published_port');
  assert.match(observed, /UNSAFE_PUBLISHED_PORT/);
  assert.match(observed, /OWNER DECISION REQUIRED/);
  assert.doesNotMatch(observed, /\bPASS\b/);
  assert.equal(preflightFailureKind(new Error('Unexpected GoTrue image')),
    'mismatch_or_unavailable');
  assert.match(preflightFailureObservation('mismatch_or_unavailable'),
    /unavailable or mismatched/);
});
