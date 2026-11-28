import { execFileSync } from 'node:child_process';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TestRunInventory, createHostedAdminClient, createMockProjectKey, createRunCreatedSeedDispatcher,
  createTempAuthPilotFixtureTransport, provisionRunCreatedSeed, reserveRunCreatedSeed,
  runOfflineProbeSimulation
} from './hosted-probe-runner.mjs';
import {
  createOfflineRecoveryJournal, recoveryOptions, reopenOfflineRecoveryJournal
} from './offline-recovery-journal.mjs';
import { TEMP_AUTH_ORIGIN, TEMP_AUTH_PROBES, TEMP_AUTH_PROJECT, tempAuthRequestPlan } from './temp-auth-pilot-contract.mjs';
import { verifyTempAuthOperatorInput } from './temp-auth-operator-credentials.mjs';

const REVIEW_HEAD = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const AUTHORIZATION_WINDOW_MS = 60 * 60 * 1000;
const RUN_ID = /^h4-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const AUTHORIZATION_FIELDS = [
  'purpose', 'projectRef', 'runId', 'runtimeHead', 'runtimeDigest', 'reviewer', 'reviewHead',
  'issuedAt', 'expiresAt', 'publishableDigest', 'secretDigest'
];
const RUNTIME_FILES = [
  'conditional-storage-fixture.mjs', 'hosted-probe-runner.mjs', 'inventory-effect-admission.mjs',
  'offline-recovery-journal.mjs', 'preflight-evaluator.mjs', 'run-request-budget.mjs',
  'session-revocation-evidence.mjs', 'temp-auth-launcher.mjs', 'temp-auth-operator-credentials.mjs',
  'temp-auth-pilot-contract.mjs'
];
const FAULTS = new Set(['none', 'preexisting', 'generic-404', 'unreadable-404', 'create-lost', 'create-wrong-id',
  'session-wrong-id', 'session-wrong-issuer', 'session-long-ttl', 'session-missing-iat', 'unreadable-baseline',
  'logout-401', 'logout-403', 'logout-200', 'unreadable-final-404', 'redirect']);

export function readTempAuthRuntimeIdentity() {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const runtimeHead = execFileSync('git', ['-C', root, 'rev-parse', '--verify', 'HEAD'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true
  }).trim();
  if (!REVIEW_HEAD.test(runtimeHead)) throw new Error('TEMP_AUTH_RUNTIME_HEAD_UNAVAILABLE');
  const digest = createHash('sha256');
  for (const name of RUNTIME_FILES) {
    const contents = readFileSync(new URL(name, import.meta.url));
    digest.update(name + ':' + contents.length + '\n').update(contents);
  }
  return Object.freeze({ runtimeHead, runtimeDigest: digest.digest('hex') });
}

/** Canonical signed payload. The operator establishes the owner public key and reviewer evidence independently. */
export function tempAuthAuthorizationPayload(rawStatement) {
  const statement = recoveryOptions(rawStatement, AUTHORIZATION_FIELDS);
  if (Object.keys(statement).length !== AUTHORIZATION_FIELDS.length ||
      AUTHORIZATION_FIELDS.some(field => typeof statement[field] !== 'string' || statement[field].length > 128)) {
    throw new Error('TEMP_AUTH_INVALID_AUTHORIZATION');
  }
  return Buffer.from(JSON.stringify(AUTHORIZATION_FIELDS.map(field => statement[field])));
}

function verifiedAuthorization(rawAuthorization, trust, { runId, runtime }, now) {
  const { statement, signature } = recoveryOptions(rawAuthorization, ['statement', 'signature']);
  const payload = tempAuthAuthorizationPayload(statement);
  const [purpose, project, run, head, digest, reviewer, reviewHead, issuedAt, expiresAt,
    publishableDigest, secretDigest] = JSON.parse(payload);
  const issued = Date.parse(issuedAt);
  const expiry = Date.parse(expiresAt);
  if (purpose !== 'TEMP_AUTH_HOOK_01_SESSION_01' || project !== TEMP_AUTH_PROJECT ||
      run !== runId || !RUN_ID.test(run) || head !== runtime.runtimeHead || digest !== runtime.runtimeDigest ||
      reviewer !== 'im-tio' || reviewHead !== head || trust.reviewedHead !== reviewHead ||
      trust.reviewedDigest !== digest || !SHA256.test(publishableDigest) || !SHA256.test(secretDigest) ||
      publishableDigest === secretDigest || !Number.isFinite(issued) || !Number.isFinite(expiry) ||
      issued > now || expiry <= now || expiry <= issued || expiry - issued > AUTHORIZATION_WINDOW_MS ||
      typeof signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(signature)) {
    throw new Error('TEMP_AUTH_AUTHORIZATION_SCOPE_MISMATCH');
  }
  const ownerKey = createPublicKey(trust.ownerPublicKey);
  const suppliedSignature = Buffer.from(signature, 'base64url');
  if (ownerKey.asymmetricKeyType !== 'ed25519' || suppliedSignature.toString('base64url') !== signature ||
      !verify(null, payload, ownerKey, suppliedSignature)) {
    throw new Error('TEMP_AUTH_OWNER_SIGNATURE_INVALID');
  }
  return {
    bindings: Object.freeze({ publishable: publishableDigest, secret: secretDigest }),
    receipt: createHash('sha256').update(payload).digest('hex'),
    expiresAt: expiry
  };
}

function fixtureFor(seed, fault) {
  const now = Math.floor(Date.now() / 1000);
  const wrongUser = 'cccccccc-cccc-4ccc-accc-cccccccccccc';
  const tokenUser = fault === 'session-wrong-id' ? wrongUser : seed.userId;
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const accessToken = [encode({ alg: 'HS256' }), encode({
    sub: tokenUser, session_id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', ref: TEMP_AUTH_PROJECT,
    role: 'authenticated', aud: 'authenticated',
    iss: TEMP_AUTH_ORIGIN + (fault === 'session-wrong-issuer' ? '/auth/v1/unexpected' : '/auth/v1'),
    ...(fault === 'session-missing-iat' ? {} : { iat: now }),
    exp: now + (fault === 'session-long-ttl' ? 301 : 300),
    amr_authenticated: true, amr: [{ method: 'password', timestamp: now }]
  }), 'AA'].join('.');
  const okUser = { id: seed.userId, email: seed.email };
  const missing = { status: 404, json: { code: 'user_not_found' } };
  const plan = tempAuthRequestPlan(seed.userId);
  const route = (index, spec) => ({ method: plan[index].method, urlEquals: plan[index].url, ...spec });
  return {
    requestBudgetMode: 'standard',
    initialState: { created: false, deleted: false },
    routes: [
      route(0, { whenState: { created: false }, ...(fault === 'preexisting'
        ? { status: 200, json: okUser } : fault === 'generic-404' ? { status: 404, json: {} }
          : fault === 'unreadable-404' ? { ...missing, jsonError: 'SYNTHETIC_UNREADABLE_404' } : missing) }),
      route(1, { setsState: { created: true }, ...(fault === 'create-lost'
        ? { throwError: 'SYNTHETIC_INDETERMINATE_CREATE' } : fault === 'redirect'
          ? { status: 307 } : { status: 200, json: fault === 'create-wrong-id' ? { ...okUser, id: wrongUser } : okUser }) }),
      route(2, { whenState: { created: true, deleted: false }, status: 200, json: okUser }),
      route(3, { status: 200, json: { access_token: accessToken, refresh_token: 'synthetic-rehearsal-only', user: { ...okUser, id: tokenUser } } }),
      route(4, { status: 200, json: okUser, ...(fault === 'unreadable-baseline' ? { omitBodyInterface: true } : {}) }),
      route(5, { status: fault.startsWith('logout-') ? Number(fault.slice(7)) : 204 }),
      route(6, { setsState: { deleted: true }, status: 200, json: {} }),
      route(7, { whenState: { deleted: true }, ...missing,
        ...(fault === 'unreadable-final-404' ? { omitBodyInterface: true } : {}) })
    ]
  };
}

function safeStatus(report) {
  return {
    projectRef: report.projectRef, runId: report.runId, consumed: report.consumed,
    journalStatus: report.status, residual: report.residual, hostedRequests: 0,
    hostedProviderVerified: false, statelessJwtInvalidationVerified: false
  };
}

/**
 * C0 rehearses the real H5 admission, seed and cleanup contracts with module-owned
 * fixtures only. No API credentials are accepted on this entry point.
 */
export function prepareTempAuthRehearsal(rawOptions) {
  const { directory, projectRef, trust: rawTrust } = recoveryOptions(rawOptions, ['directory', 'projectRef', 'trust']);
  if (projectRef !== TEMP_AUTH_PROJECT) throw new Error('TEMP_AUTH_PROJECT_MISMATCH');
  const trust = recoveryOptions(rawTrust, ['reviewedHead', 'reviewedDigest', 'ownerPublicKey']);
  const runtime = readTempAuthRuntimeIdentity();
  if (runtime.runtimeHead !== trust.reviewedHead || runtime.runtimeDigest !== trust.reviewedDigest ||
      typeof trust.ownerPublicKey !== 'string' || trust.ownerPublicKey.length > 1024 ||
      !trust.ownerPublicKey.startsWith('-----BEGIN PUBLIC KEY-----')) {
    throw new Error('TEMP_AUTH_REVIEW_TRUST_REQUIRED');
  }
  const journal = createOfflineRecoveryJournal({ directory, projectRef, mode: 'standard' });
  let consumed = false;
  let closed = false;
  let credentialCheckActive = false;
  let credentialReceipt = null;
  return Object.freeze({
    runId: journal.runId,
    close() {
      journal.close();
      closed = true;
      credentialReceipt = null;
    },
    async verifyOperatorInput(authorization, input, output) {
      if (closed || consumed || credentialCheckActive) throw new Error('TEMP_AUTH_RUN_NOT_ADMISSIBLE');
      const verified = verifiedAuthorization(authorization, trust,
        { runId: journal.runId, runtime: readTempAuthRuntimeIdentity() }, Date.now());
      credentialReceipt = null;
      credentialCheckActive = true;
      try {
        await verifyTempAuthOperatorInput(verified.bindings, input, output);
        if (closed || Date.now() >= verified.expiresAt) throw new Error('TEMP_AUTH_RUN_NOT_ADMISSIBLE');
        credentialReceipt = verified.receipt;
        return Object.freeze({ projectRef, runId: journal.runId, keyBindingVerified: true, hostedRequests: 0 });
      } finally {
        credentialCheckActive = false;
      }
    },
    async run(authorization, fault = 'none') {
      if (closed || consumed || credentialCheckActive || !FAULTS.has(fault)) throw new Error('TEMP_AUTH_RUN_NOT_ADMISSIBLE');
      const verified = verifiedAuthorization(authorization, trust,
        { runId: journal.runId, runtime: readTempAuthRuntimeIdentity() }, Date.now());
      if (credentialReceipt !== verified.receipt) throw new Error('TEMP_AUTH_OPERATOR_RECEIPT_REQUIRED');
      consumed = true;
      credentialReceipt = null;
      const inventory = new TestRunInventory(journal.runId);
      const seed = reserveRunCreatedSeed({ inventory, projectRef });
      const transport = createTempAuthPilotFixtureTransport({
        plan: seed, fixture: fixtureFor(seed, fault), expiresAt: verified.expiresAt
      });
      const keys = { anonKey: createMockProjectKey(projectRef, 'anon'), serviceRoleKey: createMockProjectKey(projectRef, 'service_role') };
      const adminClient = createHostedAdminClient({ projectRef, runId: journal.runId, fetchFn: transport, ...keys });
      let outcome;
      try {
        await provisionRunCreatedSeed({ plan: seed, inventory, adminClient });
        outcome = await runOfflineProbeSimulation({ projectRef, runId: journal.runId, inventory, adminClient,
          offlineDispatcher: createRunCreatedSeedDispatcher({ inventory, fetchFn: transport, ...keys }),
          testEmail: seed.email, selectedProbeIds: [...TEMP_AUTH_PROBES], timing: { mode: 'standard' } });
      } catch {
        // Durable evidence is authoritative. In particular, a thrown creation
        // response never grants deletion authority or silently restarts the run.
      }
      const expected = tempAuthRequestPlan(seed.userId);
      const observed = transport.calls;
      const report = journal.report();
      const exact = observed.length === expected.length && expected.every(({ method, url }, i) =>
        observed[i].method === method && observed[i].url === url);
      const passed = exact && report.consumed === 8 && report.status === 'CLEANUP_VERIFIED_SUCCESS' &&
        outcome?.status === 'COMPLETED' && outcome.mode === 'OFFLINE_SIMULATION';
      return Object.freeze({ ...safeStatus(report), status: passed ? 'OFFLINE_REHEARSAL_PASS' : 'OFFLINE_REHEARSAL_BLOCKED',
        observedRequests: observed.length });
    }
  });
}

export function inspectTempAuthRecovery(directory, runId) {
  const journal = reopenOfflineRecoveryJournal({ directory, runId, projectRef: TEMP_AUTH_PROJECT });
  try { return Object.freeze(safeStatus(journal.report())); } finally { journal.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  try {
    if (args.length === 0) {
      console.log(JSON.stringify({ projectRef: TEMP_AUTH_PROJECT, selected: TEMP_AUTH_PROBES, mode: 'DRY_RUN',
        live: 'BLOCKED', nominalRequests: 8, totalAttemptCeiling: 25, pacingMs: 1000, cleanupReserve: 0,
        journalEventLimit: 512, journalByteLimit: 262144, hostedRequests: 0 }));
    } else if (args.length === 3 && args[0] === '--inspect-journal') {
      console.log(JSON.stringify(inspectTempAuthRecovery(args[1], args[2])));
    } else {
      throw new Error('TEMP_AUTH_LIVE_BLOCKED');
    }
  } catch {
    console.error('TEMP_AUTH_ADMISSION_BLOCKED');
    process.exitCode = 1;
  }
}
