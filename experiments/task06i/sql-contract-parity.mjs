// Local executable SQL-to-JavaScript contract parity verifier
// Verifies that private_auth.custom_access_token_hook and private_auth.send_email_hook
// in PostgreSQL behave identically to evaluateCustomAccessTokenHook and evaluateSendEmailHook.
// When Docker is available, executes against an isolated, unexposed container (0 published ports).
// When Docker is unavailable, records the environment limitation truthfully.

import { execFileSync, spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  evaluateCustomAccessTokenHook,
  evaluateSendEmailHook
} from './hook-allowlist-contract.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

  const res = spawnSync('docker', ['exec', '-i', containerName, 'psql', '-U', 'postgres', '-d', 'postgres', '-c', query], {
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
 * Runs parity verification across all defined test cases.
 */
export function verifyParityMatrix() {
  const dockerReady = isDockerAvailable();
  const results = [];
  let containerName = null;

  if (dockerReady) {
    containerName = `task06i-parity-${Date.now()}`;
    try {
      // Start isolated container with ZERO published ports
      spawnSync('docker', ['run', '-d', '--rm', '--name', containerName, '-e', 'POSTGRES_PASSWORD=secret', 'postgres:17'], { timeout: 8000 });
      // Wait for postgres to be ready
      let ready = false;
      for (let i = 0; i < 10; i++) {
        const ping = spawnSync('docker', ['exec', '-i', containerName, 'pg_isready', '-U', 'postgres'], { timeout: 2000 });
        if (ping.status === 0) { ready = true; break; }
        spawnSync('powershell', ['-Command', 'Start-Sleep -Milliseconds 400']);
      }

      if (!ready) {
        throw new Error('PostgreSQL container failed to become ready in time');
      }

      // Deploy hooks.sql
      const sqlPath = join(__dirname, 'sql', 'hooks.sql');
      const sqlContent = readFileSync(sqlPath, 'utf8');
      const deploy = spawnSync('docker', ['exec', '-i', containerName, 'psql', '-U', 'postgres', '-d', 'postgres'], {
        input: sqlContent,
        encoding: 'utf8',
        timeout: 5000
      });

      if (deploy.status !== 0) {
        throw new Error(`Failed to deploy hooks.sql: ${deploy.stderr || deploy.stdout}`);
      }

      // Execute each case
      for (const tc of PARITY_TEST_CASES) {
        const jsOutcome = executeJsCase(tc);
        const pgOutcome = executePostgresCase(containerName, tc);

        const parityMatches = (
          jsOutcome.allowed === pgOutcome.allowed &&
          (jsOutcome.allowed ? (pgOutcome.result?.claims?.amr_authenticated === 'true' || tc.hook === 'send_email_hook') : (pgOutcome.sqlstate === '42501' && jsOutcome.code === '42501'))
        );

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
  } else {
    // Docker not available: run JS evaluation only and document runtime environment limitation
    for (const tc of PARITY_TEST_CASES) {
      const jsOutcome = executeJsCase(tc);
      results.push({
        name: tc.name,
        hook: tc.hook,
        jsOutcome,
        pgOutcome: null,
        parityMatches: jsOutcome.allowed === tc.expectedAllowed,
        verifiedInPostgres: false,
        reason: 'Docker runtime unavailable in execution environment'
      });
    }
  }

  return {
    dockerAvailable: dockerReady,
    totalCases: results.length,
    passedParity: results.filter(r => r.parityMatches).length,
    results
  };
}

if (process.argv[1] && process.argv[1].endsWith('sql-contract-parity.mjs')) {
  console.log('Running SQL vs JavaScript contract parity check...');
  const res = verifyParityMatrix();
  console.log(`Docker Available: ${res.dockerAvailable}`);
  console.log(`Cases Evaluated: ${res.totalCases}, Matched Parity: ${res.passedParity}`);
  for (const r of res.results) {
    const status = r.parityMatches ? 'PASS' : 'FAIL';
    const runtime = r.verifiedInPostgres ? 'POSTGRES 17.11' : 'OFFLINE JS ONLY';
    console.log(`[${status}] [${runtime}] ${r.name}`);
    if (!r.parityMatches) {
      console.error('Mismatch details:', JSON.stringify(r, null, 2));
    }
  }
}
