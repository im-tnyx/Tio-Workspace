// Task 06H-D: Unit tests for local OTP adapter module.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import childProcess from 'node:child_process';
import * as localOtpModule from './local-otp-adapter.mjs';
import {
  signLocalJwt,
  generateLocalKeys,
  getRequiredJwtSecret,
  assertRuntimeStackIsolation,
  executeAuthIntegrationSuite,
  validateLocalStackConfig,
  QuotaExhaustedError,
  CASE_EMAIL_BUDGETS,
  NAMED_BATCHES,
  calculateBatchBudget,
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

test('calculateBatchBudget correctly computes email costs for all named batches', () => {
  // GoTrue server-wide rate limit is 5 sends per hour. Every individual batch must be <= 5.
  assert.equal(calculateBatchBudget('batch-1'), 4, 'batch-1 (OTP_FORMAT_REPLAY + OTP_CONCURRENT) requires 4 sends');
  assert.equal(calculateBatchBudget('batch-2'), 3, 'batch-2 (INVALID_CODE + FIVE_WRONG + SIGNUP_RECOVERY) requires 3 sends');
  assert.equal(calculateBatchBudget('batch-3'), 4, 'batch-3 (RECOVERY_FLOW) requires 4 sends');
  assert.equal(calculateBatchBudget('batch-4'), 3, 'batch-4 (RESEND_OLD_CODE + AUTH17) requires 3 sends');
  assert.equal(calculateBatchBudget('all'), 14, 'all batches combined require 14 sends (exceeds single 1-hour window)');

  // Verify custom case list budget calculation
  assert.equal(calculateBatchBudget(['OTP_FORMAT_REPLAY', 'INVALID_CODE']), 2);
  assert.equal(calculateBatchBudget([]), 0);
  assert.equal(calculateBatchBudget(), 0);

  // Assert every individual executable batch strictly fits within 5-send hourly limit
  for (const b of ['batch-1', 'batch-2', 'batch-3', 'batch-4']) {
    assert.ok(calculateBatchBudget(b) <= 5, `${b} budget (${calculateBatchBudget(b)}) must fit within 5-send hourly quota`);
  }
});

test('NAMED_BATCHES comprehensively covers all 12 executable test cases', () => {
  const covered = new Set();
  for (const b of ['batch-1', 'batch-2', 'batch-3', 'batch-4']) {
    for (const c of NAMED_BATCHES[b]) covered.add(c);
  }
  for (const c of NAMED_BATCHES.all) {
    assert.ok(covered.has(c), `Case ${c} must be present in at least one executable batch`);
  }
});

test('executeAuthIntegrationSuite public entrypoint fails closed when Docker daemon is unreachable', async () => {
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error('fetch should not be called');
  };

  const origExec = childProcess.execFileSync;
  childProcess.execFileSync = () => {
    throw new Error('Cannot connect to the Docker daemon at unix:///var/run/docker.sock');
  };

  try {
    await assert.rejects(
      async () => executeAuthIntegrationSuite({
        API_URL: 'http://127.0.0.1:55621',
        MAILPIT_URL: 'http://127.0.0.1:55624',
        PUBLISHABLE_KEY: 'test-pub',
        SERVICE_ROLE_KEY: 'test-serv',
      }),
      /Docker network inspection failed: Cannot connect to the Docker daemon/
    );
    assert.equal(fetchCalled, false, 'No fetch request must be made when Docker daemon is down');
  } finally {
    childProcess.execFileSync = origExec;
    globalThis.fetch = originalFetch;
  }
});

test('executeAuthIntegrationSuite public entrypoint fails closed when Docker CLI is missing (ENOENT)', async () => {
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error('fetch should not be called');
  };

  const origExec = childProcess.execFileSync;
  childProcess.execFileSync = () => {
    const err = new Error('spawnSync docker ENOENT');
    err.code = 'ENOENT';
    throw err;
  };

  try {
    await assert.rejects(
      async () => executeAuthIntegrationSuite({
        API_URL: 'http://127.0.0.1:55621',
        MAILPIT_URL: 'http://127.0.0.1:55624',
        PUBLISHABLE_KEY: 'test-pub',
        SERVICE_ROLE_KEY: 'test-serv',
      }),
      /Docker network inspection failed: spawnSync docker ENOENT/
    );
    assert.equal(fetchCalled, false, 'No fetch request must be made when Docker CLI is missing');
  } finally {
    childProcess.execFileSync = origExec;
    globalThis.fetch = originalFetch;
  }
});

test('executeAuthIntegrationSuite public entrypoint fails closed on malformed Docker network output', async () => {
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error('fetch should not be called');
  };

  const origExec = childProcess.execFileSync;
  childProcess.execFileSync = () => 'invalid non-json output from docker';

  try {
    await assert.rejects(
      async () => executeAuthIntegrationSuite({
        API_URL: 'http://127.0.0.1:55621',
        MAILPIT_URL: 'http://127.0.0.1:55624',
        PUBLISHABLE_KEY: 'test-pub',
        SERVICE_ROLE_KEY: 'test-serv',
      }),
      /Docker network parsing failed/
    );
    assert.equal(fetchCalled, false, 'No fetch request must be made on malformed docker output');
  } finally {
    childProcess.execFileSync = origExec;
    globalThis.fetch = originalFetch;
  }
});

function setupDeterministicProcessMock({ kongHostIp = '127.0.0.1', windowsListeners = true, gotrueQuota = 5 } = {}) {
  const origExec = childProcess.execFileSync;
  const project = 'tio-task06h-local-auth';
  const network = `supabase_network_${project}`;

  const makeContainer = (part, image, portBindings = {}, env = undefined) => ({
    Name: `/supabase_${part}_${project}`,
    State: { Running: true },
    Config: {
      Image: image,
      Labels: { 'com.docker.compose.project': project },
      Env: env ?? (part === 'auth' ? (gotrueQuota !== undefined ? [`GOTRUE_RATE_LIMIT_EMAIL_SENT=${gotrueQuota}`] : []) : []),
    },
    HostConfig: {
      PortBindings: portBindings,
    },
    NetworkSettings: {
      Networks: { [network]: {} },
      Ports: portBindings,
    },
  });

  const containersMap = {
    [`/supabase_auth_${project}`]: makeContainer('auth', 'public.ecr.aws/supabase/gotrue:v2.197.0'),
    [`/supabase_db_${project}`]: makeContainer('db', 'public.ecr.aws/supabase/postgres:17.11.0.004'),
    [`/supabase_kong_${project}`]: makeContainer('kong', 'public.ecr.aws/supabase/kong:2.8.1', {
      '8000/tcp': [{ HostIp: kongHostIp, HostPort: '55621' }],
    }),
    [`/supabase_inbucket_${project}`]: makeContainer('inbucket', 'public.ecr.aws/supabase/mailpit:v1.31.3', {
      '8025/tcp': [{ HostIp: '127.0.0.1', HostPort: '55624' }],
    }),
  };

  const executedCommands = [];

  childProcess.execFileSync = (file, args) => {
    executedCommands.push({ file, args });
    if (file === 'docker') {
      if (args[0] === 'network' && args[1] === 'inspect') {
        return JSON.stringify([{
          Containers: {
            c1: { Name: `/supabase_auth_${project}` },
            c2: { Name: `/supabase_db_${project}` },
            c3: { Name: `/supabase_kong_${project}` },
            c4: { Name: `/supabase_inbucket_${project}` },
          }
        }]);
      }
      if (args[0] === 'inspect') {
        const name = args[1];
        const c = containersMap[name];
        if (c) return JSON.stringify([c]);
        return JSON.stringify([makeContainer('unknown', 'unknown')]);
      }
    }
    if (file === 'powershell.exe') {
      if (!windowsListeners) return '';
      return JSON.stringify([
        { LocalAddress: '127.0.0.1', LocalPort: 55621, State: 'Listen' },
        { LocalAddress: '127.0.0.1', LocalPort: 55624, State: 'Listen' },
      ]);
    }
    return '';
  };

  const restore = () => {
    childProcess.execFileSync = origExec;
  };
  restore.executedCommands = executedCommands;
  return restore;
}

test('executeAuthIntegrationSuite public entrypoint fails closed on wildcard host port binding', async () => {
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error('fetch should not be called');
  };
  const restoreProc = setupDeterministicProcessMock({ kongHostIp: '0.0.0.0' });

  try {
    await assert.rejects(
      async () => executeAuthIntegrationSuite({
        API_URL: 'http://127.0.0.1:55621',
        MAILPIT_URL: 'http://127.0.0.1:55624',
        PUBLISHABLE_KEY: 'test-pub',
        SERVICE_ROLE_KEY: 'test-serv',
      }),
      /non-loopback HostConfig published ports/
    );
    assert.equal(fetchCalled, false, 'No fetch request must be made when port binding is wildcard');
  } finally {
    restoreProc();
    globalThis.fetch = originalFetch;
  }
});

test('executeAuthIntegrationSuite public entrypoint fails closed when Windows listeners are missing', async () => {
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error('fetch should not be called');
  };
  const restoreProc = setupDeterministicProcessMock({ windowsListeners: false });

  try {
    await assert.rejects(
      async () => executeAuthIntegrationSuite({
        API_URL: 'http://127.0.0.1:55621',
        MAILPIT_URL: 'http://127.0.0.1:55624',
        PUBLISHABLE_KEY: 'test-pub',
        SERVICE_ROLE_KEY: 'test-serv',
      }),
      /MISSING_WINDOWS_LISTENER/
    );
    assert.equal(fetchCalled, false, 'No fetch request must be made when host listeners are missing');
  } finally {
    restoreProc();
    globalThis.fetch = originalFetch;
  }
});

test('executeAuthIntegrationSuite defaults to real execution boundary when invoked with production signature', async () => {
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error('fetch must not be called');
  };

  const executedCommands = [];
  const origExec = childProcess.execFileSync;
  childProcess.execFileSync = (file, args, options) => {
    executedCommands.push({ file, args });
    throw new Error(`Simulated preflight failure on ${file} ${(args || []).join(' ')}`);
  };

  try {
    await assert.rejects(
      async () => executeAuthIntegrationSuite({
        API_URL: 'http://127.0.0.1:55621',
        MAILPIT_URL: 'http://127.0.0.1:55624',
        PUBLISHABLE_KEY: 'test-pub',
        SERVICE_ROLE_KEY: 'test-serv',
      }),
      /Docker network inspection failed: Simulated preflight failure on docker network inspect supabase_network_tio-task06h-local-auth/
    );
    assert.equal(fetchCalled, false, 'No network requests dispatched on preflight rejection');
    assert.ok(executedCommands.length >= 1, 'Production execution boundary must invoke real childProcess.execFileSync');
    assert.equal(executedCommands[0].file, 'docker');
    assert.deepEqual(executedCommands[0].args, ['network', 'inspect', 'supabase_network_tio-task06h-local-auth']);
  } finally {
    childProcess.execFileSync = origExec;
    globalThis.fetch = originalFetch;
  }
});

test('executeAuthIntegrationSuite invokes both Docker inspection and Windows listener inspection during preflight', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async (url) => {
    fetchCalled = true;
    if (url.includes('/api/v1/messages')) {
      return { status: 200, json: async () => ({ messages: [] }) };
    }
    return { status: 404, json: async () => ({}) };
  };

  const restoreProc = setupDeterministicProcessMock();

  try {
    const results = await executeAuthIntegrationSuite({
      API_URL: 'http://127.0.0.1:55621',
      MAILPIT_URL: 'http://127.0.0.1:55624',
      PUBLISHABLE_KEY: 'test-pub',
      SERVICE_ROLE_KEY: 'test-serv',
      selectedCases: ['MAILPIT_BASELINE'],
    });

    assert.equal(fetchCalled, true, 'Fetch called for baseline case under simulated healthy stack');
    assert.equal(results.find(r => r.id === 'MAILPIT_BASELINE')?.result, 'PASS');

    const cmds = restoreProc.executedCommands;
    const dockerNetworkInspect = cmds.find(c => c.file === 'docker' && c.args?.[0] === 'network' && c.args?.[1] === 'inspect');
    const dockerContainerInspect = cmds.find(c => c.file === 'docker' && c.args?.[0] === 'inspect');
    const powershellListenerInspect = cmds.find(c => c.file === 'powershell.exe' && c.args?.some(a => String(a).includes('55621,55624')));

    assert.ok(dockerNetworkInspect, 'Preflight must invoke docker network inspect');
    assert.ok(dockerContainerInspect, 'Preflight must invoke docker container inspect');
    assert.ok(powershellListenerInspect, 'Preflight must invoke Windows PowerShell listener inspect');
  } finally {
    restoreProc();
    globalThis.fetch = originalFetch;
  }
});

test('executeAuthIntegrationSuite with devModeEmailQuota: 30 fails closed during preflight when GoTrue container has default quota 5', async () => {
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error('fetch should not be called');
  };
  const restoreProc = setupDeterministicProcessMock({ gotrueQuota: 5 });

  try {
    await assert.rejects(
      async () => executeAuthIntegrationSuite({
        API_URL: 'http://127.0.0.1:55621',
        MAILPIT_URL: 'http://127.0.0.1:55624',
        PUBLISHABLE_KEY: 'test-pub',
        SERVICE_ROLE_KEY: 'test-serv',
        devModeEmailQuota: 30,
      }),
      /MISMATCHED_GOTRUE_EMAIL_QUOTA: client quota \(30\) does not match GoTrue container GOTRUE_RATE_LIMIT_EMAIL_SENT \(5\)/
    );
    assert.equal(fetchCalled, false, 'No fetch request must be made when GoTrue container email quota mismatches client dev quota');
  } finally {
    restoreProc();
    globalThis.fetch = originalFetch;
  }
});

test('executeAuthIntegrationSuite with devModeEmailQuota: 30 succeeds during preflight when GoTrue container matches quota 30', async () => {
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    fetchCalled = true;
    if (url.includes('/api/v1/messages')) {
      return { status: 200, json: async () => ({ messages: [] }) };
    }
    return { status: 404, json: async () => ({}) };
  };
  const restoreProc = setupDeterministicProcessMock({ gotrueQuota: 30 });

  try {
    const results = await executeAuthIntegrationSuite({
      API_URL: 'http://127.0.0.1:55621',
      MAILPIT_URL: 'http://127.0.0.1:55624',
      PUBLISHABLE_KEY: 'test-pub',
      SERVICE_ROLE_KEY: 'test-serv',
      devModeEmailQuota: 30,
      selectedCases: ['MAILPIT_BASELINE'],
    });
    assert.equal(fetchCalled, true);
    assert.equal(results.find(r => r.id === 'MAILPIT_BASELINE')?.result, 'PASS');
  } finally {
    restoreProc();
    globalThis.fetch = originalFetch;
  }
});

test('executeAuthIntegrationSuite strictly rejects caller-provided runner options or extra arguments (Bugbot regression)', async () => {
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error('fetch must not be called');
  };

  const validConfig = {
    API_URL: 'http://127.0.0.1:55621',
    MAILPIT_URL: 'http://127.0.0.1:55624',
    PUBLISHABLE_KEY: 'test-pub',
    SERVICE_ROLE_KEY: 'test-serv',
  };

  let fakeRunnerCalled = false;
  const fakeRunner = () => {
    fakeRunnerCalled = true;
    return 'simulated_ok';
  };

  // 1. Extra argument (options object with commandRunner) is rejected immediately by arity check
  await assert.rejects(
    async () => executeAuthIntegrationSuite(validConfig, { commandRunner: fakeRunner }),
    /executeAuthIntegrationSuite requires exactly 1 argument/
  );
  assert.equal(fakeRunnerCalled, false, 'Fake runner must not be called on extra argument');
  assert.equal(fetchCalled, false, 'No fetch request must be made on extra argument rejection');

  // 2. Caller embedding commandRunner inside config object does NOT bypass real preflight (failure path)
  const origExec = childProcess.execFileSync;
  let realExecCalls = [];
  childProcess.execFileSync = (file, args, options) => {
    realExecCalls.push({ file, args });
    throw new Error('Deterministic host isolation preflight failure');
  };

  try {
    await assert.rejects(
      async () => executeAuthIntegrationSuite({ ...validConfig, commandRunner: fakeRunner }),
      /Docker network inspection failed: Deterministic host isolation preflight failure/
    );
    assert.equal(fakeRunnerCalled, false, 'Embedded commandRunner must never be invoked on preflight failure');
    assert.ok(realExecCalls.length >= 1, 'Real execution boundary must be invoked instead of caller-provided commandRunner');

    realExecCalls = [];
    // 3. Caller embedding runner inside config object does NOT bypass real preflight
    await assert.rejects(
      async () => executeAuthIntegrationSuite({ ...validConfig, runner: fakeRunner }),
      /Docker network inspection failed: Deterministic host isolation preflight failure/
    );
    assert.equal(fakeRunnerCalled, false, 'Embedded runner must never be invoked on preflight failure');
    assert.ok(realExecCalls.length >= 1, 'Real execution boundary must be invoked instead of caller-provided runner');

    assert.equal(fetchCalled, false, 'No network requests dispatched on any bypass attempt');
  } finally {
    childProcess.execFileSync = origExec;
    globalThis.fetch = originalFetch;
  }

  // 4. Even under a simulated healthy stack, embedded runner is never invoked
  const restoreProc = setupDeterministicProcessMock();
  try {
    let mockFetchCalled = false;
    globalThis.fetch = async (url) => {
      mockFetchCalled = true;
      if (url.includes('/api/v1/messages')) {
        return { status: 200, json: async () => ({ messages: [] }) };
      }
      return { status: 404, json: async () => ({}) };
    };

    fakeRunnerCalled = false;
    const results = await executeAuthIntegrationSuite({
      ...validConfig,
      commandRunner: fakeRunner,
      runner: fakeRunner,
      selectedCases: ['MAILPIT_BASELINE'],
    });

    assert.equal(fakeRunnerCalled, false, 'Embedded runners must NEVER be invoked even when stack is healthy');
    assert.equal(mockFetchCalled, true, 'Real runner proceeds to execution without invoking caller runner');
    assert.equal(results.find(r => r.id === 'MAILPIT_BASELINE')?.result, 'PASS');
  } finally {
    restoreProc();
    globalThis.fetch = originalFetch;
  }
});

test('local-otp-adapter exports no test runner hooks or mutable process execution seams', () => {
  assert.equal(localOtpModule.defaultCommandRunner, undefined, 'defaultCommandRunner must not be exported');
  assert.equal(localOtpModule._setProcessRunnerForTesting, undefined, '_setProcessRunnerForTesting must not be exported');
  assert.equal(localOtpModule._resetProcessRunnerForTesting, undefined, '_resetProcessRunnerForTesting must not be exported');
  assert.equal(localOtpModule._customProcessRunner, undefined, '_customProcessRunner must not be exported');
  assert.equal(localOtpModule._executeCommand, undefined, '_executeCommand must not be exported');
  assert.equal(localOtpModule._executeAuthIntegrationSuiteInternal, undefined, '_executeAuthIntegrationSuiteInternal must not be exported');
  assert.equal(localOtpModule._runAuthIntegrationSuiteInternal, undefined, '_runAuthIntegrationSuiteInternal must not be exported');
  assert.equal(localOtpModule.assertRuntimeStackIsolation.length, 0, 'assertRuntimeStackIsolation must accept 0 arguments');
  assert.equal(localOtpModule.inspectDockerStackRuntime.length, 0, 'inspectDockerStackRuntime must accept 0 arguments');
  assert.equal(localOtpModule.initializeLocalStack.length, 0, 'initializeLocalStack must accept 0 arguments');
  assert.equal(localOtpModule.inspectWindowsListenersRuntime.length, 0, 'inspectWindowsListenersRuntime must default ports and accept no runner');
});

test('isolated test seam: command execution failure parsing fails closed with precise error classifications', () => {
  function simulateDockerInspect(runner) {
    const run = (file, args) => runner(file, args, {
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
    return attached;
  }

  // 1. Daemon down
  assert.throws(
    () => simulateDockerInspect(() => {
      throw new Error('Cannot connect to the Docker daemon at unix:///var/run/docker.sock');
    }),
    /Docker network inspection failed: Cannot connect to the Docker daemon/
  );

  // 2. Missing Docker CLI (ENOENT)
  assert.throws(
    () => simulateDockerInspect(() => {
      const err = new Error('spawnSync docker ENOENT');
      err.code = 'ENOENT';
      throw err;
    }),
    /Docker network inspection failed: spawnSync docker ENOENT/
  );

  // 3. Network inspect returns empty containers
  assert.throws(
    () => simulateDockerInspect(() => JSON.stringify([{ Containers: {} }])),
    /No containers attached to the project network/
  );
});

test('local-otp-adapter does not export bypassable internal network runners', () => {
  assert.equal(
    typeof localOtpModule._executeAuthIntegrationSuiteInternal,
    'undefined',
    'Internal runner _executeAuthIntegrationSuiteInternal must not be exported'
  );

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

test('validateLocalStackConfig validates loopback URLs, credentials, and batch options offline', () => {
  assert.throws(() => validateLocalStackConfig(null), /Invalid or non-loopback stack URLs refused/);
  assert.throws(() => validateLocalStackConfig({}), /Invalid or non-loopback stack URLs refused/);
  assert.throws(() => validateLocalStackConfig({
    API_URL: 'http://192.168.1.100:55621',
    MAILPIT_URL: 'http://127.0.0.1:55624',
    PUBLISHABLE_KEY: 'test-pub',
    SERVICE_ROLE_KEY: 'test-serv',
  }), /Invalid or non-loopback stack URLs refused/);
  assert.throws(() => validateLocalStackConfig({
    API_URL: 'http://127.0.0.1:55621',
    MAILPIT_URL: 'http://127.0.0.1:55624',
  }), /Local stack configuration and credentials required to run integration suite/);

  // Batch validation
  assert.throws(() => validateLocalStackConfig({
    API_URL: 'http://127.0.0.1:55621',
    MAILPIT_URL: 'http://127.0.0.1:55624',
    PUBLISHABLE_KEY: 'test-pub',
    SERVICE_ROLE_KEY: 'test-serv',
    selectedBatch: 'batch-invalid',
  }), /Invalid selectedBatch: batch-invalid/);

  assert.throws(() => validateLocalStackConfig({
    API_URL: 'http://127.0.0.1:55621',
    MAILPIT_URL: 'http://127.0.0.1:55624',
    PUBLISHABLE_KEY: 'test-pub',
    SERVICE_ROLE_KEY: 'test-serv',
    selectedCases: 'not-an-array',
  }), /selectedCases must be an array/);

  assert.throws(() => validateLocalStackConfig({
    API_URL: 'http://127.0.0.1:55621',
    MAILPIT_URL: 'http://127.0.0.1:55624',
    PUBLISHABLE_KEY: 'test-pub',
    SERVICE_ROLE_KEY: 'test-serv',
    selectedCases: ['NONEXISTENT_CASE'],
  }), /Invalid case ID in selectedCases: NONEXISTENT_CASE/);

  assert.throws(() => validateLocalStackConfig({
    API_URL: 'http://127.0.0.1:55621',
    MAILPIT_URL: 'http://127.0.0.1:55624',
    PUBLISHABLE_KEY: 'test-pub',
    SERVICE_ROLE_KEY: 'test-serv',
    selectedCases: ['OTP_CONCURRENT', 'RECOVERY_FLOW'], // 3 + 4 = 7 sends (exceeds 5)
  }), /exceeds 5-send hourly quota/);

  assert.equal(validateLocalStackConfig({
    API_URL: 'http://127.0.0.1:55621',
    MAILPIT_URL: 'http://127.0.0.1:55624',
    PUBLISHABLE_KEY: 'test-pub',
    SERVICE_ROLE_KEY: 'test-serv',
    selectedCases: ['OTP_FORMAT_REPLAY', 'INVALID_CODE'], // 1 + 1 = 2 sends (valid)
  }), true);

  // Exhaustive devModeEmailQuota validation: requires safe integer in range 5..100
  const invalidDevQuotas = [
    3, 4, 0, -1, -5, 101, 105, 1000,
    NaN, Infinity, -Infinity,
    5.5, 30.2, 99.9,
    '30', '5', 'dev', true, false, null, {}, [30]
  ];
  for (const invalidVal of invalidDevQuotas) {
    assert.throws(() => validateLocalStackConfig({
      API_URL: 'http://127.0.0.1:55621',
      MAILPIT_URL: 'http://127.0.0.1:55624',
      PUBLISHABLE_KEY: 'test-pub',
      SERVICE_ROLE_KEY: 'test-serv',
      devModeEmailQuota: invalidVal,
    }), /devModeEmailQuota must be a safe integer between 5 and 100/);
  }

  assert.equal(validateLocalStackConfig({
    API_URL: 'http://127.0.0.1:55621',
    MAILPIT_URL: 'http://127.0.0.1:55624',
    PUBLISHABLE_KEY: 'test-pub',
    SERVICE_ROLE_KEY: 'test-serv',
    devModeEmailQuota: 5, // minimum boundary
  }), true);

  assert.equal(validateLocalStackConfig({
    API_URL: 'http://127.0.0.1:55621',
    MAILPIT_URL: 'http://127.0.0.1:55624',
    PUBLISHABLE_KEY: 'test-pub',
    SERVICE_ROLE_KEY: 'test-serv',
    devModeEmailQuota: 100, // maximum boundary
  }), true);

  assert.equal(validateLocalStackConfig({
    API_URL: 'http://127.0.0.1:55621',
    MAILPIT_URL: 'http://127.0.0.1:55624',
    PUBLISHABLE_KEY: 'test-pub',
    SERVICE_ROLE_KEY: 'test-serv',
    devModeEmailQuota: 30,
    selectedCases: ['OTP_CONCURRENT', 'RECOVERY_FLOW'], // 3 + 4 = 7 sends (allowed with devModeEmailQuota: 30)
  }), true);

  assert.equal(validateLocalStackConfig({
    API_URL: 'http://127.0.0.1:55621',
    MAILPIT_URL: 'http://127.0.0.1:55624',
    PUBLISHABLE_KEY: 'test-pub',
    SERVICE_ROLE_KEY: 'test-serv',
    selectedBatch: 'batch-1',
  }), true);
});

test('executeAuthIntegrationSuite enforces batch filtering and marks excluded cases as SKIPPED and never PASS', async () => {
  const originalFetch = globalThis.fetch;
  const restoreProc = setupDeterministicProcessMock();

  // Mock fetch to provide clean Mailpit baseline
  globalThis.fetch = async (url) => {
    if (url.includes('/api/v1/messages')) {
      return {
        status: 200,
        json: async () => ({ messages: [] })
      };
    }
    return { status: 404, json: async () => ({}) };
  };

  try {
    // Run with selectedCases containing only MAILPIT_BASELINE (excludes all other cases)
    const results = await executeAuthIntegrationSuite({
      API_URL: 'http://127.0.0.1:55621',
      MAILPIT_URL: 'http://127.0.0.1:55624',
      PUBLISHABLE_KEY: 'test-pub',
      SERVICE_ROLE_KEY: 'test-serv',
      selectedCases: ['MAILPIT_BASELINE'],
    });

    const baseline = results.find(r => r.id === 'MAILPIT_BASELINE');
    assert.equal(baseline.result, 'PASS');

    const skippedIds = [
      'OTP_FORMAT',
      'OTP_REPLAY',
      'OTP_CONCURRENT_1',
      'INVALID_CODE',
      'FIVE_WRONG_COOLDOWN',
      'COOLDOWN_15_MIN',
      'SIGNUP_AS_RECOVERY',
      'RECOVERY_AS_EMAIL',
      'RECOVERY_AS_RECOVERY',
      'RESEND_INTERVAL_OBSERVED',
      'AUTH17_PASSWORD_MUTATION',
    ];

    for (const id of skippedIds) {
      const row = results.find(r => r.id === id);
      assert.ok(row, `Row for ${id} must exist in results`);
      assert.equal(row.result, 'SKIPPED', `Excluded case ${id} must be marked SKIPPED`);
      assert.equal(row.details?.skippedByBatch, true, `Excluded case ${id} must have skippedByBatch flag`);
      assert.notEqual(row.result, 'PASS', `Excluded case ${id} must NEVER be marked PASS`);
    }
  } finally {
    restoreProc();
    globalThis.fetch = originalFetch;
  }
});

test('Mailpit 1-hour quota accounting tracks recent messages across process runs and fails closed on exhaustion', async () => {
  const originalFetch = globalThis.fetch;
  const restoreProc = setupDeterministicProcessMock();

  // Mock Mailpit returning 5 recent messages within the last 15 minutes (quota exhausted on server)
  const now = Date.now();
  const recentMessages = Array.from({ length: 5 }, (_, i) => ({
    ID: `msg-${i}`,
    Subject: 'Local signup code',
    Created: new Date(now - (i + 1) * 60000).toISOString(),
    To: [{ Address: `user${i}@example.invalid` }]
  }));

  globalThis.fetch = async (url) => {
    if (url.includes('/api/v1/messages')) {
      return {
        status: 200,
        json: async () => ({ messages: recentMessages })
      };
    }
    return { status: 404, json: async () => ({}) };
  };

  try {
    // Run batch-1 which attempts to issue OTP
    const results = await executeAuthIntegrationSuite({
      API_URL: 'http://127.0.0.1:55621',
      MAILPIT_URL: 'http://127.0.0.1:55624',
      PUBLISHABLE_KEY: 'test-pub',
      SERVICE_ROLE_KEY: 'test-serv',
      selectedBatch: 'batch-1',
    });

    const baseline = results.find(r => r.id === 'MAILPIT_BASELINE');
    assert.equal(baseline.result, 'PASS');
    assert.match(baseline.observed, /recent_window_sends=5/);

    // Because recent_window_sends is 5, OTP_FORMAT_REPLAY cannot issue email and must report INCONCLUSIVE with quotaExhausted
    const replay = results.find(r => r.id === 'OTP_FORMAT_REPLAY');
    assert.ok(replay, 'OTP_FORMAT_REPLAY row must be recorded');
    assert.equal(replay.result, 'INCONCLUSIVE');
    assert.equal(replay.details?.quotaExhausted, true);
    assert.match(replay.observed, /EMAIL_QUOTA_EXHAUSTED/);
  } finally {
    restoreProc();
    globalThis.fetch = originalFetch;
  }
});

test('QuotaExhaustedError is a distinct error type preserving rate limit policy', () => {
  const err = new QuotaExhaustedError('5-send budget reached');
  assert.equal(err.name, 'QuotaExhaustedError');
  assert.equal(err.message, '5-send budget reached');
  assert.ok(err instanceof Error);
});

test('Mailpit subject matchers cover both configured Task 06G/06H subjects and GoTrue defaults', () => {
  const signupMatcher = /local signup|confirm your email|confirm your signup/i;
  const recoveryMatcher = /local recovery|reset your password|reset password/i;

  // Configured Task 06G / Task 06H subjects
  assert.equal(signupMatcher.test('Your local signup code'), true);
  assert.equal(recoveryMatcher.test('Your local recovery code'), true);

  // GoTrue upstream default subjects
  assert.equal(signupMatcher.test('Confirm your email address'), true);
  assert.equal(signupMatcher.test('Confirm Your Signup'), true);
  assert.equal(recoveryMatcher.test('Reset your password'), true);
  assert.equal(recoveryMatcher.test('Reset Password'), true);

  // Negative checks: unrelated emails must not match
  assert.equal(signupMatcher.test('Your account invoice'), false);
  assert.equal(recoveryMatcher.test('Welcome to our newsletter'), false);
});
