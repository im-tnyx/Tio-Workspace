import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createHostedAdminClient, createMockProjectKey, createTempAuthPilotFixtureTransport,
  provisionRunCreatedSeed, reserveRunCreatedSeed, TestRunInventory } from './hosted-probe-runner.mjs';
import { createOfflineRecoveryJournal, reopenOfflineRecoveryJournal } from './offline-recovery-journal.mjs';
import { assertTempAuthRequest, TEMP_AUTH_ORIGIN, TEMP_AUTH_PROJECT, tempAuthRequestPlan } from './temp-auth-pilot-contract.mjs';
import {
  inspectTempAuthRecovery, prepareTempAuthRehearsal, readTempAuthRuntimeIdentity, tempAuthAuthorizationPayload
} from './temp-auth-launcher.mjs';

const currentFile = fileURLToPath(import.meta.url);
const runtime = readTempAuthRuntimeIdentity();
const keys = generateKeyPairSync('ed25519');
const trust = {
  reviewedHead: runtime.runtimeHead, reviewedDigest: runtime.runtimeDigest,
  ownerPublicKey: keys.publicKey.export({ type: 'spki', format: 'pem' })
};
const sample = {
  publishable: ['sb', 'publishable', 'syntheticFixture1234567890'].join('_'),
  secret: ['sb', 'secret', 'differentFixture1234567890'].join('_')
};
const hash = value => createHash('sha256').update(value).digest('hex');

function authorization(runId, overrides = {}, key = keys.privateKey) {
  const statement = {
    purpose: 'TEMP_AUTH_HOOK_01_SESSION_01', projectRef: TEMP_AUTH_PROJECT, runId,
    ...runtime, reviewer: 'im-tio', reviewHead: runtime.runtimeHead,
    issuedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 30_000).toISOString(),
    publishableDigest: hash(sample.publishable), secretDigest: hash(sample.secret), ...overrides
  };
  return { statement, signature: sign(null, tempAuthAuthorizationPayload(statement), key).toString('base64url') };
}

function scratch(t, beforeRemove = () => {}) {
  const parent = realpathSync.native(tmpdir());
  const path = realpathSync.native(mkdtempSync(join(parent, 'tio-h6-c0-')));
  t.after(() => {
    beforeRemove();
    assert.ok(resolve(path).startsWith(parent + sep));
    rmSync(path, { recursive: true, force: true });
  });
  return path;
}

function rehearsal(t) {
  let run;
  const directory = scratch(t, () => run?.close());
  run = prepareTempAuthRehearsal({ directory, projectRef: TEMP_AUTH_PROJECT, trust });
  return { directory, run };
}

function operator(values) {
  const input = new PassThrough();
  input.isTTY = true;
  input.isRaw = false;
  input.setRawMode = flag => { input.isRaw = flag; };
  const transcript = [];
  const output = { write(text) {
    transcript.push(text);
    if (text.includes('key (hidden)') && values.length) {
      const next = values.shift();
      queueMicrotask(() => input.write(Buffer.from(next + '\r')));
    }
  } };
  return { input, output, transcript };
}

async function verifiedCredentials(run, allowed) {
  const tty = operator([sample.publishable, sample.secret]);
  await run.verifyOperatorInput(allowed, tty.input, tty.output);
}

if (process.argv[2] === '--crash-child') {
  const directory = process.argv[3];
  const run = prepareTempAuthRehearsal({ directory, projectRef: TEMP_AUTH_PROJECT, trust });
  writeFileSync(join(directory, 'run-id'), run.runId, { flush: true });
  const original = DatabaseSync.prototype.prepare;
  DatabaseSync.prototype.prepare = function (...args) {
    const statement = original.apply(this, args);
    if (!args[0].startsWith('UPDATE journal SET payload')) return statement;
    return { run(...params) {
      const event = JSON.parse(params[0])[4].at(-1);
      const result = statement.run(...params);
      if (event[0] === 'dispatch' && event[1] === 2) process.kill(process.pid, 'SIGKILL');
      return result;
    } };
  };
  const allowed = authorization(run.runId);
  await verifiedCredentials(run, allowed);
  await run.run(allowed);
  process.exitCode = 71;
} else {
  test('C0 CLI dry-runs by default and refuses live, target overrides and unknown options', () => {
    const launcher = fileURLToPath(new URL('./temp-auth-launcher.mjs', import.meta.url));
    const dry = spawnSync(process.execPath, [launcher], { encoding: 'utf8' });
    assert.equal(dry.status, 0, dry.stderr);
    assert.deepEqual(JSON.parse(dry.stdout), {
      projectRef: TEMP_AUTH_PROJECT, selected: ['HOOK-01', 'SESSION-01'], mode: 'DRY_RUN',
      live: 'BLOCKED', nominalRequests: 8, totalAttemptCeiling: 25, pacingMs: 1000, cleanupReserve: 0,
      journalEventLimit: 512, journalByteLimit: 262144, hostedRequests: 0
    });
    for (const args of [['--live'], ['--project-ref', TEMP_AUTH_PROJECT], ['--transport', 'untrusted']]) {
      const result = spawnSync(process.execPath, [launcher, ...args], {
        encoding: 'utf8', env: { ...process.env, TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' }
      });
      assert.equal(result.status, 1);
      assert.equal(result.stdout, '');
    }
  });

  test('C0 pins raw URL spelling, method, scope and the exact generated seed resource', () => {
    const seed = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
    const plan = tempAuthRequestPlan(seed);
    assert.equal(plan.length, 8);
    for (const { method, url } of plan) assert.doesNotThrow(() => assertTempAuthRequest(plan, method, url));
    for (const [method, url] of [
      ['GET', TEMP_AUTH_ORIGIN + '/auth/v1/admin/users'],
      ['GET', TEMP_AUTH_ORIGIN + '/auth/v1/admin/users/cccccccc-cccc-4ccc-accc-cccccccccccc'],
      ['DELETE', plan[0].url.replace(seed, seed.toUpperCase())],
      ['GET', plan[0].url.replace(seed, '%61' + seed.slice(1))],
      ['GET', plan[0].url + '#fragment'],
      ['GET', plan[0].url.replace('https://', 'http://')],
      ['GET', plan[0].url.replace('.co/', '.co:443/')],
      ['GET', plan[0].url.replace('https://', 'https://evil@')],
      ['GET', plan[0].url.replace(TEMP_AUTH_PROJECT, 'anotherprojectxx')],
      ['POST', TEMP_AUTH_ORIGIN + '/auth/v1/token?grant_type=refresh_token'],
      ['POST', TEMP_AUTH_ORIGIN + '/auth/v1/logout?scope=global'],
      ['POST', TEMP_AUTH_ORIGIN + '/auth/v1/logout?scope=local&scope=global'],
      ['POST', TEMP_AUTH_ORIGIN + '/auth/v1/recover'],
      ['POST', TEMP_AUTH_ORIGIN + '/storage/v1/object/fixture']
    ]) assert.throws(() => assertTempAuthRequest(plan, method, url), /OUTSIDE_ALLOWLIST/);
  });

  test('C0 unsigned, cross-run, stale, bad reviewer, foreign and untrusted transport admission fails before dispatch', async t => {
    const { run, directory } = rehearsal(t);
    assert.throws(() => prepareTempAuthRehearsal({ directory, projectRef: 'some-other-project', trust }), /PROJECT_MISMATCH/);
    assert.throws(() => prepareTempAuthRehearsal({ directory, projectRef: TEMP_AUTH_PROJECT,
      trust: { ...trust, reviewedDigest: 'f'.repeat(64) } }), /REVIEW_TRUST_REQUIRED/);
    assert.throws(() => prepareTempAuthRehearsal({ directory, projectRef: TEMP_AUTH_PROJECT, trust,
      fetchFn() { throw new Error('must not run'); } }), /INVALID_RECOVERY_OPTIONS/);
    await assert.rejects(run.run(authorization(run.runId, { projectRef: 'different' })), /SCOPE_MISMATCH/);
    await assert.rejects(run.run(authorization('h4-cccccccc-cccc-4ccc-accc-cccccccccccc')), /SCOPE_MISMATCH/);
    await assert.rejects(run.run(authorization(run.runId, { reviewer: 'not-im-tio' })), /SCOPE_MISMATCH/);
    await assert.rejects(run.run(authorization(run.runId, { reviewHead: 'f'.repeat(40) })), /SCOPE_MISMATCH/);
    await assert.rejects(run.run(authorization(run.runId, { expiresAt: '2000-01-01T00:00:00.000Z' })), /SCOPE_MISMATCH/);
    await assert.rejects(run.run(authorization(run.runId, {}, generateKeyPairSync('ed25519').privateKey)), /SIGNATURE_INVALID/);
    const allowed = authorization(run.runId);
    await assert.rejects(run.run(allowed), /OPERATOR_RECEIPT_REQUIRED/);
    await verifiedCredentials(run, allowed);
    const otherStatement = authorization(run.runId, { expiresAt: new Date(Date.now() + 15_000).toISOString() });
    await assert.rejects(run.run(otherStatement), /OPERATOR_RECEIPT_REQUIRED/);
    run.close();
    assert.equal(inspectTempAuthRecovery(directory, run.runId).consumed, 0);
  });

  test('C0 operator input is masked, role-bound and fingerprint-bound', async t => {
    const { run } = rehearsal(t);
    const tty = operator([sample.publishable, sample.secret]);
    const status = await run.verifyOperatorInput(authorization(run.runId), tty.input, tty.output);
    assert.equal(status.keyBindingVerified, true);
    assert.equal(status.hostedRequests, 0);
    assert.equal(tty.input.isRaw, false);
    assert.ok(tty.transcript.every(line => !Object.values(sample).some(key => line.includes(key))));
    const wrong = operator([sample.secret]);
    await assert.rejects(run.verifyOperatorInput(authorization(run.runId), wrong.input, wrong.output), /KEY_BINDING_MISMATCH/);
    const interrupted = operator(['\u0003']);
    await assert.rejects(run.verifyOperatorInput(authorization(run.runId), interrupted.input, interrupted.output), /INPUT_CANCELLED/);
    assert.equal(interrupted.input.isRaw, false);
    await assert.rejects(run.verifyOperatorInput(authorization(run.runId), new PassThrough(), tty.output), /EXCLUSIVE_OPERATOR_TTY_REQUIRED/);
  });

  test('C0 transport refuses password exchange using anything other than the reserved seed credential', async t => {
    let journal;
    const directory = scratch(t, () => journal?.close());
    journal = createOfflineRecoveryJournal({ directory, projectRef: TEMP_AUTH_PROJECT, mode: 'standard' });
    const inventory = new TestRunInventory(journal.runId);
    const plan = reserveRunCreatedSeed({ inventory, projectRef: TEMP_AUTH_PROJECT });
    const requests = tempAuthRequestPlan(plan.userId);
    const user = { id: plan.userId, email: plan.email };
    const routes = [
      { whenState: { created: false }, status: 404, json: { code: 'user_not_found' } },
      { setsState: { created: true }, status: 200, json: user },
      { whenState: { created: true }, status: 200, json: user },
      { status: 500, json: {} }
    ].map((route, i) => ({ ...route, method: requests[i].method, urlEquals: requests[i].url }));
    const transport = createTempAuthPilotFixtureTransport({
      plan, expiresAt: Date.now() + 30_000,
      fixture: { initialState: { created: false }, routes, requestBudgetMode: 'standard' }
    });
    const adminClient = createHostedAdminClient({ runId: journal.runId,
      fetchFn: transport, serviceRoleKey: createMockProjectKey(TEMP_AUTH_PROJECT, 'service_role') });
    await provisionRunCreatedSeed({ plan, inventory, adminClient });
    const result = await adminClient.verifyUserCredentials(plan.email, 'synthetic-wrong-password', {
      inventory, expectedUserId: plan.userId
    });
    assert.equal(result.credentialVerified, false);
    assert.equal(transport.calls.length, 3);
    assert.equal(journal.report().consumed, 3);
  });

  test('C0 nominal H5 run uses 8 paced attempts, preserves seed/session provenance and grants no JWT invalidation proof', async t => {
    const { directory, run } = rehearsal(t);
    const allowed = authorization(run.runId, { expiresAt: new Date(Date.now() + 55_000).toISOString() });
    await verifiedCredentials(run, allowed);
    const result = await run.run(allowed);
    assert.equal(result.status, 'OFFLINE_REHEARSAL_PASS', JSON.stringify(result));
    assert.equal(result.consumed, 8);
    assert.equal(result.observedRequests, 8);
    assert.equal(result.statelessJwtInvalidationVerified, false);
    assert.equal(result.hostedProviderVerified, false);
    await assert.rejects(run.run(allowed), /RUN_NOT_ADMISSIBLE/);
    run.close();
    const cold = inspectTempAuthRecovery(directory, run.runId);
    assert.equal(cold.consumed, 8);
    assert.equal(cold.journalStatus, 'CLEANUP_VERIFIED_SUCCESS');
    assert.deepEqual(cold.residual.credentialDependent, []);
  });

  test('C0 expiry after verified seed creation blocks new requests and preserves the cleanup obligation', async t => {
    const { directory, run } = rehearsal(t);
    const now = Date.now;
    const expiresAt = now() + 30_000;
    const allowed = authorization(run.runId, { expiresAt: new Date(expiresAt).toISOString() });
    await verifiedCredentials(run, allowed);

    let seedVerifiedAt = null;
    t.mock.method(Date, 'now', () => seedVerifiedAt === null ? now() : expiresAt + (now() - seedVerifiedAt));
    const prepare = DatabaseSync.prototype.prepare;
    t.mock.method(DatabaseSync.prototype, 'prepare', function (sql) {
      const statement = prepare.call(this, sql);
      if (!sql.startsWith('UPDATE journal SET payload')) return statement;
      return { run(...params) {
        const event = JSON.parse(params[0])[4].at(-1);
        const result = statement.run(...params);
        if (event[0] === 'seed_verified') seedVerifiedAt = now();
        return result;
      } };
    });

    const result = await run.run(allowed);
    assert.notEqual(seedVerifiedAt, null);
    assert.equal(result.status, 'OFFLINE_REHEARSAL_BLOCKED');
    assert.equal(result.observedRequests, 3);
    assert.equal(result.consumed, 3);
    await assert.rejects(run.run(allowed), /RUN_NOT_ADMISSIBLE/);
    run.close();

    const journal = reopenOfflineRecoveryJournal({ directory, runId: run.runId, projectRef: TEMP_AUTH_PROJECT });
    try {
      const report = journal.report();
      assert.equal(report.status, 'RECOVERY_REQUIRED');
      assert.deepEqual(report.attempts.map(attempt => attempt.kind), ['read', 'seed_create', 'read']);
      assert.ok(report.attempts.every(attempt => attempt.dispatchedAt < expiresAt));
      assert.equal(report.seeds[0]?.state, 'CREATION_VERIFIED');
      assert.ok(report.residual.volatileKinds.includes('auth'));
    } finally { journal.close(); }
  });

  test('C0 partial clock rollback during standard pacing blocks expired dispatches on monotonic deadline and preserves cleanup obligation', async t => {
    const { directory, run } = rehearsal(t);
    const realNow = Date.now;
    const baseWall = realNow();
    const expiresAt = baseWall + 3400;
    const allowed = authorization(run.runId, { expiresAt: new Date(expiresAt).toISOString() });
    await verifiedCredentials(run, allowed);

    let rollbackAt = null;
    t.mock.method(Date, 'now', () => {
      const current = realNow();
      return rollbackAt !== null && current >= rollbackAt ? current - 800 : current;
    });
    const prepare = DatabaseSync.prototype.prepare;
    t.mock.method(DatabaseSync.prototype, 'prepare', function (sql) {
      const statement = prepare.call(this, sql);
      if (!sql.startsWith('UPDATE journal SET payload')) return statement;
      return { run(...params) {
        const event = JSON.parse(params[0])[4].at(-1);
        const result = statement.run(...params);
        if (event[0] === 'seed_verified' && rollbackAt === null) rollbackAt = realNow() + 150;
        return result;
      } };
    });

    const result = await run.run(allowed);
    assert.notEqual(rollbackAt, null);
    assert.equal(result.status, 'OFFLINE_REHEARSAL_BLOCKED');
    assert.equal(result.observedRequests, 3);
    assert.equal(result.consumed, 3);
    await assert.rejects(run.run(allowed), /TEMP_AUTH_RUN_NOT_ADMISSIBLE/);
    run.close();

    const journal = reopenOfflineRecoveryJournal({ directory, runId: run.runId, projectRef: TEMP_AUTH_PROJECT });
    try {
      const report = journal.report();
      assert.equal(report.status, 'RECOVERY_REQUIRED');
      assert.deepEqual(report.attempts.map(attempt => attempt.kind), ['read', 'seed_create', 'read']);
      assert.ok(report.attempts.every(attempt => attempt.dispatchedAt < expiresAt));
      assert.equal(report.seeds[0]?.state, 'CREATION_VERIFIED');
      assert.ok(report.residual.volatileKinds.includes('auth'));
    } finally { journal.close(); }
  });

  test('C0 partial clock rollback across revalidation or fixture entry cannot extend authorization', async t => {
    const { directory, run } = rehearsal(t);
    const realNow = Date.now;
    const realMono = performance.now.bind(performance);
    const baseWall = realNow();
    const baseMono = realMono();
    const allowed = authorization(run.runId, { expiresAt: new Date(baseWall + 30_000).toISOString() });
    await verifiedCredentials(run, allowed);

    t.mock.method(Date, 'now', () => baseWall + 25_000);
    t.mock.method(performance, 'now', () => baseMono + 30_050);

    const ttyExpired = operator([sample.publishable, sample.secret]);
    await assert.rejects(run.verifyOperatorInput(allowed, ttyExpired.input, ttyExpired.output), /TEMP_AUTH_RUN_NOT_ADMISSIBLE/);
    assert.equal(ttyExpired.transcript.length, 0);

    const distinctAfterRollback = authorization(run.runId, {
      issuedAt: new Date(baseWall - 500).toISOString(),
      expiresAt: new Date(baseWall + 30_000).toISOString()
    });
    const ttyDistinct = operator([sample.publishable, sample.secret]);
    await assert.rejects(run.verifyOperatorInput(distinctAfterRollback, ttyDistinct.input, ttyDistinct.output), /TEMP_AUTH_RUN_NOT_ADMISSIBLE/);
    assert.equal(ttyDistinct.transcript.length, 0);
    run.close();

    const { directory: dir2, run: run2 } = rehearsal(t);
    t.mock.restoreAll();
    const wall2 = Date.now();
    const mono2 = performance.now();
    const allowed2 = authorization(run2.runId, { expiresAt: new Date(wall2 + 30_000).toISOString() });
    await verifiedCredentials(run2, allowed2);

    t.mock.method(Date, 'now', () => wall2 + 25_000);
    t.mock.method(performance, 'now', () => mono2 + 30_050);
    await assert.rejects(run2.run(allowed2), /TEMP_AUTH_AUTHORIZATION_EXPIRED/);
    run2.close();

    assert.equal(inspectTempAuthRecovery(directory, run.runId).consumed, 0);
    assert.equal(inspectTempAuthRecovery(dir2, run2.runId).consumed, 0);

    const { run: run3 } = rehearsal(t);
    const wall3 = realNow();
    const mono3 = realMono();
    let mono3Now = mono3;
    t.mock.restoreAll();
    t.mock.method(Date, 'now', () => wall3 + 25_000);
    t.mock.method(performance, 'now', () => mono3Now);
    const prepare3 = DatabaseSync.prototype.prepare;
    t.mock.method(DatabaseSync.prototype, 'prepare', function (sql) {
      const statement = prepare3.call(this, sql);
      if (!sql.startsWith('UPDATE journal SET payload')) return statement;
      return { run(...params) {
        const event = JSON.parse(params[0])[4].at(-1);
        const result = statement.run(...params);
        if (event[0] === 'dispatch') mono3Now = mono3 + 30_050;
        return result;
      } };
    });
    const inventory = new TestRunInventory(run3.runId);
    const seed = reserveRunCreatedSeed({ inventory, projectRef: TEMP_AUTH_PROJECT });
    const req = tempAuthRequestPlan(seed.userId)[0];
    const transport = createTempAuthPilotFixtureTransport({
      plan: seed,
      fixture: { routes: [{ method: req.method, pathEquals: new URL(req.url).pathname, status: 404, json: {} }] },
      expiresAt: wall3 + 30_000,
      monotonicExpiresAt: mono3 + 30_000
    });
    const adminClient = createHostedAdminClient({
      projectRef: TEMP_AUTH_PROJECT, runId: run3.runId, fetchFn: transport,
      anonKey: createMockProjectKey(TEMP_AUTH_PROJECT, 'anon'),
      serviceRoleKey: createMockProjectKey(TEMP_AUTH_PROJECT, 'service_role')
    });
    await assert.rejects(adminClient.getUserById(seed.userId), /TEMP_AUTH_AUTHORIZATION_EXPIRED/);
    assert.equal(transport.calls.length, 0);
  });

  test('C0 ambiguous responses and unverified Auth effects leave durable failures without retry', { concurrency: true }, async t => {
    const matrix = [['preexisting', 1], ['generic-404', 1], ['unreadable-404', 1], ['create-lost', 2],
      ['create-wrong-id', 2], ['redirect', 2], ['session-wrong-id', 4], ['session-wrong-issuer', 4],
      ['session-long-ttl', 4], ['session-missing-iat', 4], ['unreadable-baseline', 5],
      ['logout-401', 6], ['logout-403', 6], ['logout-200', 6], ['unreadable-final-404', 8]];
    await Promise.all(matrix.map(([fault, maximum]) => t.test(fault, async st => {
      const { directory, run } = rehearsal(st);
      const allowed = authorization(run.runId);
      await verifiedCredentials(run, allowed);
      const result = await run.run(allowed, fault);
      assert.equal(result.status, 'OFFLINE_REHEARSAL_BLOCKED', JSON.stringify(result));
      assert.equal(result.journalStatus, 'RECOVERY_REQUIRED');
      assert.ok(result.consumed <= maximum, JSON.stringify(result));
      run.close();
      const cold = inspectTempAuthRecovery(directory, run.runId);
      assert.equal(cold.consumed, result.consumed);
      assert.equal(cold.hostedRequests, 0);
    })));
  });

  test('C0 fresh process preserves consumed dispatch and cannot reconstruct seed ownership after crash', t => {
    const directory = scratch(t);
    const child = spawnSync(process.execPath, [currentFile, '--crash-child', directory], { encoding: 'utf8', timeout: 25_000 });
    assert.notEqual(child.status, 0);
    assert.notEqual(child.status, 71, child.stderr);
    const runId = readFileSync(join(directory, 'run-id'), 'utf8');
    const first = inspectTempAuthRecovery(directory, runId);
    assert.equal(first.journalStatus, 'RECOVERY_REQUIRED');
    assert.equal(first.consumed, 2);
    assert.deepEqual(first.residual.credentialDependent, [2]);
    assert.deepEqual(inspectTempAuthRecovery(directory, runId), first);
  });
}
