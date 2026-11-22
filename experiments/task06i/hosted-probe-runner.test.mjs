import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateTargetProject,
  validateTestIdentity,
  determineRunnerMode,
  sanitizeData,
  planProbeExecution,
  runHostedProbeRunner,
  IMMUTABLE_FORBIDDEN_PROJECTS,
  AUTHORIZED_TARGET_PROJECTS
} from './hosted-probe-runner.mjs';

test('1. Tio-world is permanently immune and rejected by target validator', () => {
  assert.throws(
    () => validateTargetProject('oykupyiitspujzpwwvuj'),
    /CRITICAL_SECURITY_VIOLATION.*Tio-world.*permanently forbidden/
  );
});

test('2. Unauthorized/unknown project refs are rejected', () => {
  assert.throws(
    () => validateTargetProject('randomunknownproject123'),
    /unauthorized_target.*not in AUTHORIZED_TARGET_PROJECTS/
  );
});

test('3. Authorized candidate testbed project is accepted', () => {
  const ref = validateTargetProject('bsfwzvgynwriswapxpsp');
  assert.equal(ref, 'bsfwzvgynwriswapxpsp');
});

test('4. Real customer domains are rejected for test identity', () => {
  assert.throws(
    () => validateTestIdentity('user@gmail.com'),
    /security_violation.*real customer.*prohibited/
  );
  assert.throws(
    () => validateTestIdentity('admin@yahoo.co.in'),
    /security_violation.*real customer.*prohibited/
  );
});

test('5. Reserved test domains are accepted for test identity', () => {
  assert.equal(validateTestIdentity('test-01@domain.invalid'), true);
  assert.equal(validateTestIdentity('test-02@domain.test'), true);
  assert.equal(validateTestIdentity('test-03@domain.example'), true);
});

test('6. Runner mode defaults strictly to DRY_RUN', () => {
  // Empty args and empty env
  assert.equal(determineRunnerMode([], {}), 'DRY_RUN');

  // Live flag without env
  assert.equal(determineRunnerMode(['--live'], {}), 'DRY_RUN');

  // Env without live flag
  assert.equal(determineRunnerMode([], { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' }), 'DRY_RUN');
});

test('7. Runner mode returns LIVE only when BOTH flag and env var are present', () => {
  assert.equal(
    determineRunnerMode(['--live'], { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' }),
    'LIVE'
  );
});

test('8. Secret sanitization redacts JWTs, API keys, passwords, and tokens', () => {
  const sensitiveObj = {
    apiKey: 'sbp_1234567890abcdef',
    password: 'SuperSecretPassword!',
    authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThisSignature',
    safeField: 'public_string_value'
  };

  const sanitized = sanitizeData(sensitiveObj);
  assert.equal(sanitized.apiKey, '[REDACTED]');
  assert.equal(sanitized.password, '[REDACTED]');
  assert.equal(sanitized.authorization, '[REDACTED]');
  assert.equal(sanitized.safeField, 'public_string_value');
});

test('9. Dry-run mode produces full probe plan with zero network requests', async () => {
  const result = await runHostedProbeRunner({
    projectRef: 'bsfwzvgynwriswapxpsp',
    argv: [], // dry run
    env: {}
  });

  assert.equal(result.status, 'DRY_RUN_COMPLETED');
  assert.equal(result.mode, 'DRY_RUN');
  assert.equal(result.zeroNetworkRequestsDispatched, true);
  assert.equal(result.plan.totalProbes, 18);
});

test('10. Runner immediately halts on first critical bypass failure', async () => {
  let probeCallCount = 0;

  const mockDispatcher = async (item) => {
    probeCallCount++;
    if (item.id === 'BYPASS-01') {
      // Critical bypass simulated failure!
      return { passed: false, status: 200, message: 'CRITICAL_BYPASS: OTP endpoint was open!' };
    }
    return { passed: true, status: 422 };
  };

  const result = await runHostedProbeRunner({
    projectRef: 'bsfwzvgynwriswapxpsp',
    argv: ['--live'],
    env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
    mockDispatcher
  });

  assert.equal(result.status, 'HALTED_ON_FAILURE');
  assert.equal(result.aborted, true);
  assert.match(result.abortReason, /CRITICAL_BYPASS_FAILURE/);
  assert.equal(probeCallCount, 1); // halted after exactly 1 failure!
});

test('11. Runner respects request budget ceiling', async () => {
  let probeCallCount = 0;

  const mockDispatcher = async () => {
    probeCallCount++;
    return { passed: true, status: 422 };
  };

  const result = await runHostedProbeRunner({
    projectRef: 'bsfwzvgynwriswapxpsp',
    argv: ['--live'],
    env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' },
    mockDispatcher
  });

  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.aborted, false);
  assert.equal(probeCallCount, 18);
});
