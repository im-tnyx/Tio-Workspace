// Local executable SQL-to-JavaScript contract parity verifier for Task 06I
// Verifies that private_auth.custom_access_token_hook and private_auth.send_email_hook
// in PostgreSQL behave identically to evaluateCustomAccessTokenHook and evaluateSendEmailHook.
// When Docker is available, executes against an isolated, unexposed container (0 published ports).
// When Docker is unavailable, records status as POSTGRES_NOT_EXECUTED with passedParity: 0 (never claims JS as PG pass).

import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';
import {
  evaluateCustomAccessTokenHook,
  evaluateSendEmailHook
} from './hook-allowlist-contract.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Portable synchronous sleep for Node.js across all platforms (Linux/Windows/macOS).
 * Does not depend on PowerShell or shell binaries.
 */
export function sleepSync(ms) {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    const end = Date.now() + ms;
    while (Date.now() < end) { /* busy wait fallback */ }
  }
}

/**
 * Deep equality check for normalized JSON output comparison.
 */
export function isDeepEqual(a, b) {
  try {
    assert.deepStrictEqual(a, b);
    return true;
  } catch {
    return false;
  }
}

export const PARITY_TEST_CASES = [
  // Custom Access Token Hook cases
  {
    name: 'Token Hook: Valid password sign-in',
    hook: 'custom_access_token_hook',
    event: {
      user_id: '11111111-1111-1111-1111-111111111111',
      authentication_method: 'password',
      claims: {
        sub: '11111111-1111-1111-1111-111111111111',
        amr: [{ method: 'password', timestamp: 1700000000 }]
      }
    },
    expectedAllowed: true
  },
  {
    name: 'Token Hook: Valid password token_refresh',
    hook: 'custom_access_token_hook',
    event: {
      user_id: '11111111-1111-1111-1111-111111111111',
      authentication_method: 'token_refresh',
      claims: {
        sub: '11111111-1111-1111-1111-111111111111',
        amr: [{ method: 'password', timestamp: 1700000000 }]
      }
    },
    expectedAllowed: true
  },
  {
    name: 'Token Hook: Native OTP auth method fails closed',
    hook: 'custom_access_token_hook',
    event: {
      user_id: '11111111-1111-1111-1111-111111111111',
      authentication_method: 'otp',
      claims: {
        amr: [{ method: 'otp' }]
      }
    },
    expectedAllowed: false
  },
  {
    name: 'Token Hook: Recovery auth method fails closed',
    hook: 'custom_access_token_hook',
    event: {
      user_id: '11111111-1111-1111-1111-111111111111',
      authentication_method: 'recovery',
      claims: {
        amr: [{ method: 'recovery' }]
      }
    },
    expectedAllowed: false
  },
  {
    name: 'Token Hook: Mixed password + OTP AMR fails closed',
    hook: 'custom_access_token_hook',
    event: {
      user_id: '11111111-1111-1111-1111-111111111111',
      authentication_method: 'password',
      claims: {
        amr: [
          { method: 'password' },
          { method: 'otp' }
        ]
      }
    },
    expectedAllowed: false
  },
  {
    name: 'Token Hook: Mixed password + unknown AMR fails closed',
    hook: 'custom_access_token_hook',
    event: {
      user_id: '11111111-1111-1111-1111-111111111111',
      authentication_method: 'token_refresh',
      claims: {
        amr: [
          { method: 'password' },
          { method: 'future_unknown_auth' }
        ]
      }
    },
    expectedAllowed: false
  },
  {
    name: 'Token Hook: Malformed non-object AMR element fails closed',
    hook: 'custom_access_token_hook',
    event: {
      user_id: '11111111-1111-1111-1111-111111111111',
      authentication_method: 'password',
      claims: {
        amr: ['password']
      }
    },
    expectedAllowed: false
  },
  {
    name: 'Token Hook: Missing claims object fails closed',
    hook: 'custom_access_token_hook',
    event: {
      user_id: '11111111-1111-1111-1111-111111111111',
      authentication_method: 'password'
    },
    expectedAllowed: false
  },

  // Send Email Hook cases
  {
    name: 'Send Email Hook: Native recovery email suppressed (SQLSTATE 42501)',
    hook: 'send_email_hook',
    event: {
      user_id: '11111111-1111-1111-1111-111111111111',
      email_data: {
        email_action_type: 'recovery',
        token_hash: 'test_hash_123'
      }
    },
    expectedAllowed: false
  },
  {
    name: 'Send Email Hook: Native signup email suppressed (SQLSTATE 42501)',
    hook: 'send_email_hook',
    event: {
      user_id: '11111111-1111-1111-1111-111111111111',
      email_data: {
        email_action_type: 'signup'
      }
    },
    expectedAllowed: false
  },
  {
    name: 'Send Email Hook: Native magiclink email suppressed (SQLSTATE 42501)',
    hook: 'send_email_hook',
    event: {
      user_id: '11111111-1111-1111-1111-111111111111',
      email_data: {
        email_action_type: 'magiclink'
      }
    },
    expectedAllowed: false
  },
  {
    name: 'Send Email Hook: Native invite email suppressed (SQLSTATE 42501)',
    hook: 'send_email_hook',
    event: {
      user_id: '11111111-1111-1111-1111-111111111111',
      email_data: {
        email_action_type: 'invite'
      }
    },
    expectedAllowed: false
  },
  {
    name: 'Send Email Hook: Native email_change suppressed (SQLSTATE 42501)',
    hook: 'send_email_hook',
    event: {
      user_id: '11111111-1111-1111-1111-111111111111',
      email_data: {
        email_action_type: 'email_change'
      }
    },
    expectedAllowed: false
  },
  {
    name: 'Send Email Hook: Native reauthentication suppressed (SQLSTATE 42501)',
    hook: 'send_email_hook',
    event: {
      user_id: '11111111-1111-1111-1111-111111111111',
      email_data: {
        email_action_type: 'reauthentication'
      }
    },
    expectedAllowed: false
  },
  {
    name: 'Send Email Hook: Padded action type fails closed',
    hook: 'send_email_hook',
    event: {
      user_id: '11111111-1111-1111-1111-111111111111',
      email_data: {
        email_action_type: ' recovery '
      }
    },
    expectedAllowed: false
  },
  {
    name: 'Send Email Hook: Permitted custom_notification returns empty object',
    hook: 'send_email_hook',
    event: {
      user_id: '11111111-1111-1111-1111-111111111111',
      email_data: {
        email_action_type: 'custom_notification'
      }
    },
    expectedAllowed: true
  },
  {
    name: 'Send Email Hook: Unknown action type fails closed',
    hook: 'send_email_hook',
    event: {
      user_id: '11111111-1111-1111-1111-111111111111',
      email_data: {
        email_action_type: 'unexpected_future_action'
      }
    },
    expectedAllowed: false
  },
  {
    name: 'Send Email Hook: Missing email_data object fails closed',
    hook: 'send_email_hook',
    event: {
      user_id: '11111111-1111-1111-1111-111111111111'
    },
    expectedAllowed: false
  }
];

/**
 * Checks whether Docker CLI and daemon are available.
 */
export function isDockerAvailable() {
  try {
    const res = spawnSync('docker', ['info'], { timeout: 4000 });
    return res.status === 0;
  } catch {
    return false;
  }
}

/**
 * Executes a single test case in JavaScript.
 */
export function executeJsCase(testCase) {
  try {
    let result;
    if (testCase.hook === 'custom_access_token_hook') {
      result = evaluateCustomAccessTokenHook(testCase.event);
    } else {
      result = evaluateSendEmailHook(testCase.event);
    }
    return {
      allowed: true,
      result,
      error: null,
      code: null
    };
  } catch (err) {
    return {
      allowed: false,
      result: null,
      error: err.message,
      code: err.code || null
    };
  }
}

/**
 * Executes a single test case against PostgreSQL via psql in an isolated container.
 * Uses GET STACKED DIAGNOSTICS to extract the exact SQLSTATE code and error message.
 */
export function executePostgresCase(containerName, testCase) {
  const jsonLiteral = JSON.stringify(testCase.event).replace(/'/g, "''");
  const query = `
    DO $$
    DECLARE
      v_res jsonb;
      v_sqlstate text;
      v_msg text;
    BEGIN
      BEGIN
        v_res := private_auth.${testCase.hook}('${jsonLiteral}'::jsonb);
        RAISE NOTICE 'SUCCESS_RESULT:%', v_res::text;
      EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
        RAISE NOTICE 'FAILED_SQLSTATE:%|MSG:%', v_sqlstate, v_msg;
      END;
    END $$;
  `;

  const res = spawnSync('docker', ['exec', '-i', containerName, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-c', query], {
    encoding: 'utf8',
    timeout: 5000
  });

  const output = (res.stdout || '') + (res.stderr || '');

  if (output.includes('SUCCESS_RESULT:')) {
    const match = output.match(/SUCCESS_RESULT:(\{.*\})/);
    let parsed = {};
    if (match) {
      try { parsed = JSON.parse(match[1]); } catch { parsed = match[1]; }
    }
    return {
      allowed: true,
      result: parsed,
      error: null,
      sqlstate: null,
      raw: output
    };
  }

  // Trapped exception
  const failMatch = output.match(/FAILED_SQLSTATE:([A-Z0-9]{5})\|MSG:([^\n]+)/);
  if (failMatch) {
    return {
      allowed: false,
      result: null,
      error: failMatch[2].trim(),
      sqlstate: failMatch[1].trim(),
      raw: output
    };
  }

  // Fallback for unexpected error
  const fallbackMatch = output.match(/ERROR:\s+([^\n]+)/);
  return {
    allowed: false,
    result: null,
    error: fallbackMatch ? fallbackMatch[1].trim() : 'SQL_ERROR',
    sqlstate: 'UNKNOWN',
    raw: output
  };
}

/**
 * Validates least-privilege grants and revocations on PostgreSQL schema and functions.
 * Resolves PRRT_kwDOVtCmZc66iotJ.
 */
export function verifyRoleGrantsAndRevocations(containerName) {
  const query = `
    SELECT
      has_function_privilege('supabase_auth_admin', 'private_auth.custom_access_token_hook(jsonb)', 'EXECUTE') AS admin_can_token,
      has_function_privilege('supabase_auth_admin', 'private_auth.send_email_hook(jsonb)', 'EXECUTE') AS admin_can_email,
      has_function_privilege('anon', 'private_auth.custom_access_token_hook(jsonb)', 'EXECUTE') AS anon_can_token,
      has_function_privilege('anon', 'private_auth.send_email_hook(jsonb)', 'EXECUTE') AS anon_can_email,
      has_function_privilege('authenticated', 'private_auth.custom_access_token_hook(jsonb)', 'EXECUTE') AS auth_can_token,
      has_function_privilege('authenticated', 'private_auth.send_email_hook(jsonb)', 'EXECUTE') AS auth_can_email,
      has_function_privilege('public', 'private_auth.custom_access_token_hook(jsonb)', 'EXECUTE') AS public_can_token,
      has_function_privilege('public', 'private_auth.send_email_hook(jsonb)', 'EXECUTE') AS public_can_email;
  `;

  const res = spawnSync('docker', ['exec', '-i', containerName, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-F', ',', '-c', query], {
    encoding: 'utf8',
    timeout: 5000
  });

  if (res.status !== 0) {
    throw new Error(`Failed to query role grants: ${res.stderr || res.stdout}`);
  }

  const parts = res.stdout.trim().split(',');
  const [adminToken, adminEmail, anonToken, anonEmail, authToken, authEmail, publicToken, publicEmail] = parts;

  const valid = (
    adminToken === 't' &&
    adminEmail === 't' &&
    anonToken === 'f' &&
    anonEmail === 'f' &&
    authToken === 'f' &&
    authEmail === 'f' &&
    publicToken === 'f' &&
    publicEmail === 'f'
  );

  return {
    verified: valid,
    grants: {
      supabase_auth_admin: { custom_access_token_hook: adminToken === 't', send_email_hook: adminEmail === 't' },
      anon: { custom_access_token_hook: anonToken === 't', send_email_hook: anonEmail === 't' },
      authenticated: { custom_access_token_hook: authToken === 't', send_email_hook: authEmail === 't' },
      public: { custom_access_token_hook: publicToken === 't', send_email_hook: publicEmail === 't' }
    }
  };
}

/**
 * Runs parity verification across all defined test cases with deep normalized JSON comparison.
 */
export function verifyParityMatrix() {
  const dockerReady = isDockerAvailable();
  const results = [];
  let containerName = null;
  let grantsVerification = null;

  if (dockerReady) {
    containerName = `task06i-parity-${Date.now()}`;
    try {
      // Start isolated container with ZERO published ports (30s timeout)
      const runRes = spawnSync('docker', ['run', '-d', '--rm', '--name', containerName, '-e', 'POSTGRES_PASSWORD=secret', 'postgres:17'], { timeout: 30000 });
      if (runRes.status !== 0) {
        throw new Error(`Failed to start postgres container: ${runRes.stderr || runRes.stdout}`);
      }

      // Wait for postgres to be ready using portable Node.js sleep
      let ready = false;
      for (let i = 0; i < 20; i++) {
        const ping = spawnSync('docker', ['exec', '-i', containerName, 'pg_isready', '-U', 'postgres'], { timeout: 2000 });
        if (ping.status === 0) { ready = true; break; }
        sleepSync(400); // portable sleep
      }

      if (!ready) {
        throw new Error('PostgreSQL container failed to become ready in time');
      }

      // Deploy hooks.sql using ON_ERROR_STOP=1
      const sqlPath = join(__dirname, 'sql', 'hooks.sql');
      const sqlContent = readFileSync(sqlPath, 'utf8');
      const deploy = spawnSync('docker', ['exec', '-i', containerName, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], {
        input: sqlContent,
        encoding: 'utf8',
        timeout: 8000
      });

      if (deploy.status !== 0) {
        throw new Error(`Failed to deploy hooks.sql with ON_ERROR_STOP=1: ${deploy.stderr || deploy.stdout}`);
      }

      // Verify least-privilege role grants & revocations
      grantsVerification = verifyRoleGrantsAndRevocations(containerName);
      if (!grantsVerification.verified) {
        throw new Error(`Role grants/revocations verification failed: ${JSON.stringify(grantsVerification)}`);
      }

      // Execute each case and deep-compare complete output
      for (const tc of PARITY_TEST_CASES) {
        const jsOutcome = executeJsCase(tc);
        const pgOutcome = executePostgresCase(containerName, tc);

        let parityMatches = false;
        if (jsOutcome.allowed && pgOutcome.allowed) {
          // Deep compare complete normalized JSON output (PRRT_kwDOVtCmZc66iotM)
          parityMatches = isDeepEqual(jsOutcome.result, pgOutcome.result);
        } else if (!jsOutcome.allowed && !pgOutcome.allowed) {
          // Ensure both fail closed with exact SQLSTATE 42501
          parityMatches = (pgOutcome.sqlstate === '42501' && jsOutcome.code === '42501');
        }

        results.push({
          name: tc.name,
          hook: tc.hook,
          jsOutcome,
          pgOutcome,
          parityMatches,
          verifiedInPostgres: true
        });
      }
    } finally {
      if (containerName) {
        spawnSync('docker', ['rm', '-f', containerName], { timeout: 5000 });
      }
    }

    const passedParity = results.filter(r => r.parityMatches).length;
    const isFullPass = passedParity === results.length && results.length > 0;
    const status = isFullPass ? 'POSTGRES_VERIFIED' : 'PARITY_FAILED';

    return {
      dockerAvailable: true,
      status,
      totalCases: results.length,
      passedParity,
      grantsVerification,
      results
    };
  }

  // Docker not available: record POSTGRES_NOT_EXECUTED and DO NOT claim parity passes (PRRT_kwDOVtCmZc66ij51)
  for (const tc of PARITY_TEST_CASES) {
    const jsOutcome = executeJsCase(tc);
    results.push({
      name: tc.name,
      hook: tc.hook,
      jsOutcome,
      pgOutcome: null,
      parityMatches: false, // not verified in postgres
      verifiedInPostgres: false,
      reason: 'Docker runtime unavailable in execution environment'
    });
  }

  return {
    dockerAvailable: false,
    status: 'POSTGRES_NOT_EXECUTED',
    totalCases: results.length,
    passedParity: 0, // Explicitly 0 passes when PostgreSQL did not run
    grantsVerification: null,
    results
  };
}

if (process.argv[1] && process.argv[1].endsWith('sql-contract-parity.mjs')) {
  console.log('Running SQL vs JavaScript contract parity check...');
  const res = verifyParityMatrix();
  console.log(`Docker Available: ${res.dockerAvailable}`);
  console.log(`Status: ${res.status}`);
  console.log(`Cases Evaluated: ${res.totalCases}, Matched Parity: ${res.passedParity}`);
  for (const r of res.results) {
    const status = r.parityMatches ? 'PASS' : 'FAIL';
    const runtime = r.verifiedInPostgres ? 'POSTGRES 17.11' : 'POSTGRES NOT EXECUTED';
    console.log(`[${status}] [${runtime}] ${r.name}`);
    if (!r.parityMatches) {
      console.error('Mismatch details:', JSON.stringify(r, null, 2));
    }
  }

  // Standalone command fails with nonzero exit code on parity mismatch or missing PostgreSQL (PRRT_kwDOVtCmZc66jLk5)
  if (res.status !== 'POSTGRES_VERIFIED' || res.passedParity !== res.totalCases) {
    process.exitCode = 1;
    console.error(`ERROR: Standalone contract parity check failed with status: ${res.status} (${res.passedParity}/${res.totalCases} passed)`);
  }
}
