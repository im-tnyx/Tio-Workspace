import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import {
  copyFileSync, linkSync, mkdtempSync, readFileSync, realpathSync, rmSync,
  symlinkSync, truncateSync, writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  createConditionalStorageFixtureProvider, getConditionalStorageFixtureProvider, snapshotRecoveryStorageFixture
} from './conditional-storage-fixture.mjs';
import {
  createCreationProof, createDeterministicFixtureTransport, createHostedAdminClient, createMockProjectKey,
  createTrustedOfflineDispatcher, HARDCODED_REAL_REF, HARDCODED_TEMP_REF, HARDCODED_TIO_WORLD_REF,
  provisionStorageProbeFixture, runHostedProbeRunner, runOfflineProbeSimulation, STORAGE_PROBE_BUCKET, TestRunInventory
} from './hosted-probe-runner.mjs';
import { createOfflineRecoveryJournal, recoverOfflineProbeRun, reopenOfflineRecoveryJournal } from './offline-probe-recovery.mjs';
import { executeRunBudgetRequest, getRunRequestBudget } from './run-request-budget.mjs';

const file = fileURLToPath(import.meta.url);
const projectRef = HARDCODED_TEMP_REF;
const mode = 'recorded_zero_wait';
const ownerId = '11111111-1111-4111-a111-111111111111';
const objectId = '22222222-2222-4222-a222-222222222222';
const replacementId = '33333333-3333-4333-a333-333333333333';
const content = 'Synthetic fixture bytes';
const secretSentinel = 'H4-synthetic-secret-sentinel';
const directories = new Map();

function journalPath(directory, runId) { return join(directory, runId + '.sqlite'); }

function testDirectory() {
  const parent = realpathSync.native(tmpdir());
  const directory = mkdtempSync(join(parent, 'task06i-h4-'));
  directories.set(directory, parent);
  return realpathSync.native(directory);
}

function create(directory, pacingMode = mode) {
  return createOfflineRecoveryJournal({ directory, projectRef, mode: pacingMode });
}

function reopen(directory, runId) {
  return reopenOfflineRecoveryJournal({ directory, projectRef, runId });
}

function budget(handle) {
  return getRunRequestBudget({ projectRef, runId: handle.runId });
}

function request(handle, kind, operation = () => ({ ok: true }), category = 'auxiliary') {
  return executeRunBudgetRequest(budget(handle), { kind, category }, operation);
}

function object(runId, id = objectId) {
  return { projectRef, runId, bucket: STORAGE_PROBE_BUCKET, path: runId + '/probe.txt', objectId: id, ownerId };
}

function provider(runId, options = {}) {
  const { objects = [], indeterminate = false, creationOrdinal = null, ...fixtureControls } = options;
  return createConditionalStorageFixtureProvider({
    projectRef, runId, recoverySnapshot: { objects, indeterminate, creationOrdinal }, ...fixtureControls
  });
}

function journalTransport(handle) {
  const { runId } = handle;
  const location = object(runId);
  const transport = createDeterministicFixtureTransport({
    requestBudgetMode: mode,
    conditionalStorage: { projectRef, runId, objects: [] },
    initialState: { uploaded: false, deleted: false },
    routes: [
      { method: 'GET', pathEquals: '/auth/v1/user', status: 200, json: { id: ownerId, sentinel: secretSentinel } },
      { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', whenState: { uploaded: false }, status: 404, json: { code: 'NoSuchKey' } },
      { method: 'POST', urlIncludes: '/storage/v1/object/', setsState: { uploaded: true }, status: 200, json: { Id: objectId, sentinel: secretSentinel } },
      { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', whenState: { uploaded: true, deleted: false }, status: 200, text: content },
      { method: 'POST', pathEquals: '/rest/v1/rpc/task06i_lookup_storage_object_owner', status: 200,
        json: [{ id: objectId, bucket_id: location.bucket, name: location.path, owner_id: ownerId }] },
      { method: 'DELETE', urlIncludes: '/storage/v1/object/', setsState: { deleted: true }, status: 200, json: {} },
      { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', whenState: { deleted: true }, status: 400, json: { code: 'NoSuchKey', statusCode: '404' } }
    ]
  });
  const adminClient = createHostedAdminClient({ serviceRoleKey: createMockProjectKey(projectRef, 'service_role'), runId, fetchFn: transport });
  const inventory = new TestRunInventory(runId);
  const jwtSegment = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const userAccessToken = [
    jwtSegment({ alg: 'HS256', typ: 'JWT' }),
    jwtSegment({ ref: projectRef, role: 'authenticated', sub: ownerId, session_id: ownerId, sentinel: secretSentinel }),
    Buffer.from('synthetic-signature').toString('base64url')
  ].join('.');
  return {
    transport, adminClient, inventory, userAccessToken,
    provision: () => provisionStorageProbeFixture({
      runId, seedUserId: ownerId, userAccessToken, adminClient, inventory,
      fetchFn: transport, probeContent: content
    })
  };
}

function rewrite(directory, runId, edit, updateDigest = true) {
  const db = new DatabaseSync(journalPath(directory, runId));
  try {
    const row = db.prepare('SELECT payload, digest FROM journal').get();
    const envelope = JSON.parse(row.payload);
    edit(envelope);
    const payload = JSON.stringify(envelope);
    const digest = updateDigest ? createHash('sha256').update(payload).digest('hex') : row.digest;
    db.prepare('UPDATE journal SET payload = ?, digest = ? WHERE id = 1').run(payload, digest);
  } finally {
    db.close();
  }
}

// Only the subprocess has this fault injector. Halt before or after the real
// SQLite write of a matching event. The parent sees provider state through a
// separate fixture receipt produced from the provider map, never from the DB.
function interruptWrite(directory, type, ordinal, after, readFixture, action = 'kill') {
  const original = DatabaseSync.prototype.prepare;
  DatabaseSync.prototype.prepare = function (...args) {
    const statement = original.apply(this, args);
    if (!args[0].startsWith('UPDATE journal SET payload')) return statement;
    return {
      run(...params) {
        const event = JSON.parse(params[0])[4].at(-1);
        if (event[0] !== type || event[1] !== ordinal) return statement.run(...params);
        if (action === 'fail') throw new Error('Injected SQLite write failure');
        if (after) statement.run(...params);
        writeFileSync(join(directory, 'provider-witness.json'), JSON.stringify(readFixture()), { flush: true });
        process.kill(process.pid, 'SIGKILL');
        throw new Error('Process termination did not take effect');
      }
    };
  };
  return () => { DatabaseSync.prototype.prepare = original; };
}

async function child(kind, directory, runId) {
  if (kind === 'hold') {
    const handle = reopen(directory, runId);
    process.send({ ready: true, runId: handle.runId });
    await once(process, 'message');
    handle.close();
    process.disconnect();
    return;
  }
  const handle = create(directory);
  writeFileSync(join(directory, 'run-id'), handle.runId, { flush: true });
  let calls = 0;
  if (kind === 'before-intent' || kind === 'after-reserve') {
    interruptWrite(directory, 'reserve', 1, kind === 'after-reserve', () => ({ calls }));
    await request(handle, 'storage_upload', () => { calls++; });
  } else if (kind === 'direct-inventory' || kind === 'direct-operation') {
    const inventory = new TestRunInventory(handle.runId);
    if (kind === 'direct-inventory') {
      inventory.registerSession(ownerId);
    } else {
      inventory.registerInFlightOperation({ canMintSession: true }, Symbol('module-owned transport operation'));
      assert.ok(inventory.hasUnresolvedOperations());
    }
    writeFileSync(join(directory, 'provider-witness.json'), JSON.stringify({ calls }), { flush: true });
    process.kill(process.pid, 'SIGKILL');
  } else {
    const fixture = journalTransport(handle);
    const storage = getConditionalStorageFixtureProvider(fixture.transport);
    const snapshot = () => ({
      calls: fixture.transport.calls.length,
      ...snapshotRecoveryStorageFixture(storage)
    });
    if (kind === 'cleanup') {
      await fixture.provision();
      interruptWrite(directory, 'outcome', 6, false, snapshot);
      await fixture.inventory.executeCleanup({ adminClient: fixture.adminClient });
    } else {
      interruptWrite(directory, 'outcome', 3, kind === 'after-creation', snapshot);
      await fixture.provision();
    }
  }
  throw new Error('Crash point was never reached');
}

function crash(t, kind) {
  const directory = testDirectory();
  const result = spawnSync(process.execPath, [file, '--h4-child', kind, directory], { encoding: 'utf8', timeout: 10000 });
  assert.ifError(result.error);
  assert.notEqual(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /Crash point was never reached|Process termination did not take effect/);
  const runId = readFileSync(join(directory, 'run-id'), 'utf8');
  const witness = JSON.parse(readFileSync(join(directory, 'provider-witness.json'), 'utf8'));
  const handle = reopen(directory, runId);
  t.after(() => handle.close());
  return { handle, witness, directory };
}

function fromWitness(runId, witness) {
  const { objects, creationOrdinal, indeterminate } = witness;
  return createConditionalStorageFixtureProvider({ projectRef, runId, recoverySnapshot: { objects, creationOrdinal, indeterminate } });
}

async function seedStorage(t, options = {}) {
  const directory = testDirectory();
  const initial = create(directory, options.mode);
  await request(initial, 'storage_upload', (_ordinal, recordCreation) => {
    recordCreation(object(initial.runId));
    return { ok: true };
  });
  initial.close();
  const handle = reopen(directory, initial.runId);
  t.after(() => handle.close());
  return { handle, directory };
}

if (process.argv[2] === '--h4-child') {
  await child(...process.argv.slice(3));
} else {
  test.after(() => {
    for (const [directory, parent] of directories) {
      assert.equal(dirname(realpathSync.native(directory)), parent);
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test('H4-01 crash before durable intent does not enter the provider', async t => {
    const { handle, witness } = crash(t, 'before-intent');
    assert.deepEqual(witness, { calls: 0 });
    assert.equal(handle.report().consumed, 0);
    assert.equal((await recoverOfflineProbeRun({ handle })).status, 'CLEANUP_VERIFIED_SUCCESS');
  });

  test('H4-02 a journal write failure prevents further admitted dispatch', async t => {
    const directory = testDirectory();
    const handle = create(directory);
    const fixture = journalTransport(handle);
    const restore = interruptWrite(directory, 'reserve', 1, false, () => ({}), 'fail');
    try {
      await assert.rejects(fixture.provision(), /RECOVERY_PERSISTENCE_FAILED/);
      assert.equal(fixture.transport.calls.length, 0);
      await assert.rejects(request(handle, 'read', () => assert.fail('dispatched')), /RECOVERY_JOURNAL_UNAVAILABLE/);
    } finally {
      restore();
      handle.close();
    }
  });

  test('H4-03 reservation survives process death without an automatic refund', async t => {
    const { handle, witness } = crash(t, 'after-reserve');
    const [attempt] = handle.report().attempts;
    assert.equal(witness.calls, 0);
    assert.equal(attempt.dispatchedAt, null);
    assert.equal(attempt.outcome, 'pending');
    const accounting = budget(handle).report();
    assert.equal(accounting.remainingCapacity, 24);
    assert.equal(accounting.consumedAttempts, 1);
    assert.equal(accounting.reservedWithoutDispatch, 1);
    assert.equal(accounting.durableDispatchMarkers, 0);
    assert.equal(accounting.simulatedTransportRequests, 0);
    assert.equal(accounting.auxiliaryRequests, 0);
    assert.equal((await recoverOfflineProbeRun({ handle })).status, 'CLEANUP_VERIFIED_SUCCESS');
  });

  test('H4-04 committed synthetic upload without a persisted outcome remains indeterminate', async t => {
    const { handle, witness } = crash(t, 'after-dispatch');
    assert.equal(witness.objects.length, 1);
    const attempt = handle.report().attempts.at(-1);
    assert.equal(attempt.kind, 'storage_upload');
    assert.ok(attempt.dispatchedAt);
    assert.equal(attempt.outcome, 'pending');
    assert.equal(attempt.objectId, null);
    assert.equal((await recoverOfflineProbeRun({ handle })).status, 'RECOVERY_REQUIRED');
    await assert.rejects(request(handle, 'storage_upload', () => assert.fail('replayed')), /RECOVERY_RECONCILIATION_REQUIRED|INVALID_RECOVERY_TRANSITION/);
  });

  test('H4-05 confirmed creation survives restart as a candidate, not a receipt', t => {
    const { handle, witness } = crash(t, 'after-creation');
    const attempt = handle.report().attempts.at(-1);
    assert.equal(attempt.outcome, 'success');
    assert.equal(attempt.objectId, witness.objects[0].objectId);
    assert.equal(attempt.ownerId, witness.objects[0].ownerId);
    assert.deepEqual(handle.report().residual.storage, [3]);
  });

  test('H4-06 crash after synthetic deletion requires a separate absence observation', async t => {
    const { handle, witness } = crash(t, 'cleanup');
    assert.deepEqual(witness.objects, []);
    assert.equal(handle.report().attempts.at(-1).kind, 'storage_delete');
    assert.equal(handle.report().attempts.at(-1).outcome, 'pending');
    assert.equal(handle.report().status, 'RECOVERY_REQUIRED');
    const result = await recoverOfflineProbeRun({ handle, provider: fromWitness(handle.runId, witness) });
    assert.equal(result.status, 'CLEANUP_VERIFIED_SUCCESS');
    assert.deepEqual(result.attempts.slice(-2).map(a => a.kind), ['storage_delete', 'recovery_lookup']);
  });

  test('H4-07 repeated recovery preserves one terminal transition and never deletes twice', async t => {
    const { handle, directory } = await seedStorage(t);
    const simulated = provider(handle.runId, { objects: [object(handle.runId)], creationOrdinal: 1 });
    const initial = await recoverOfflineProbeRun({ handle, provider: simulated });
    assert.equal(initial.status, 'CLEANUP_VERIFIED_SUCCESS');
    assert.equal(simulated.getSnapshot().attempts.length, 1);
    assert.deepEqual(await recoverOfflineProbeRun({ handle, provider: simulated }), initial);
    handle.close();
    const restarted = reopen(directory, handle.runId);
    try {
      assert.deepEqual(await recoverOfflineProbeRun({ handle: restarted }), initial);
      assert.equal(simulated.getSnapshot().attempts.length, 1);
    } finally { restarted.close(); }
  });

  test('H4-08 truncated database and digest mismatch fail closed', t => {
    const directory = testDirectory();
    const truncated = create(directory);
    truncated.close();
    truncateSync(journalPath(directory, truncated.runId), 100);
    assert.throws(() => reopen(directory, truncated.runId), /RECOVERY/);
    const corrupt = create(directory);
    corrupt.close();
    rewrite(directory, corrupt.runId, envelope => { envelope[3] = 'standard'; }, false);
    assert.throws(() => reopen(directory, corrupt.runId), /CORRUPT_RECOVERY_JOURNAL/);
  });

  test('H4-09 unsupported journal version is explicitly rejected', t => {
    const directory = testDirectory();
    const handle = create(directory);
    handle.close();
    rewrite(directory, handle.runId, envelope => { envelope[0] = 99; });
    assert.throws(() => reopen(directory, handle.runId), /UNSUPPORTED_RECOVERY_VERSION/);
  });

  test('H4-10 copied journals and forbidden projects cannot substitute for the original binding', t => {
    const directory = testDirectory();
    const original = create(directory);
    const other = create(testDirectory());
    other.close();
    original.close();
    copyFileSync(journalPath(directory, original.runId), journalPath(directory, other.runId));
    assert.throws(() => reopen(directory, other.runId), /RECOVERY_SCOPE_MISMATCH/);
    for (const forbidden of [HARDCODED_REAL_REF, HARDCODED_TIO_WORLD_REF, 'unapproved-project']) {
      assert.throws(() => reopenOfflineRecoveryJournal({ directory, projectRef: forbidden, runId: original.runId }), /RECOVERY_SCOPE_MISMATCH/);
    }
  });

  test('H4-11 two recovery processes cannot own the journal concurrently', { timeout: 8000 }, async t => {
    const directory = testDirectory();
    const handle = create(directory);
    assert.throws(() => reopen(directory, handle.runId), /RECOVERY_JOURNAL_BUSY/);
    handle.close();
    const worker = spawn(process.execPath, [file, '--h4-child', 'hold', directory, handle.runId], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
    const exited = once(worker, 'exit');
    try {
      const [message] = await Promise.race([once(worker, 'message'), exited.then(([code]) => { throw new Error('Worker exited: ' + code); })]);
      assert.equal(message.runId, handle.runId);
      assert.throws(() => reopen(directory, handle.runId), /RECOVERY_JOURNAL_BUSY/);
    } finally {
      if (worker.connected) worker.send('close');
      const [code] = await exited;
      assert.equal(code, 0);
    }
    reopen(directory, handle.runId).close();
  });

  test('H4-12 exhausted shared attempt budget survives restart and blocks cleanup', async t => {
    const directory = testDirectory();
    const initial = create(directory);
    await request(initial, 'storage_upload');
    for (let count = 1; count < 25; count++) await request(initial, 'read', undefined, count % 2 ? 'probe' : 'cleanup');
    initial.close();
    const handle = reopen(directory, initial.runId);
    t.after(() => handle.close());
    const result = await recoverOfflineProbeRun({ handle, provider: provider(handle.runId) });
    assert.equal(result.reason, 'REQUEST_BUDGET_EXHAUSTED');
    assert.equal(result.consumed, 25);
    assert.equal(result.status, 'RECOVERY_REQUIRED');
    assert.equal(budget(handle).report().reservedCleanupCapacity, 0);
  });

  test('H4-13 real replacement in the synthetic provider is preserved', async t => {
    const { handle } = await seedStorage(t);
    const replacement = object(handle.runId, replacementId);
    const simulated = provider(handle.runId, { objects: [replacement], creationOrdinal: 1 });
    assert.equal((await recoverOfflineProbeRun({ handle, provider: simulated })).reason, 'STORAGE_OWNERSHIP_UNPROVEN_OR_REPLACED');
    assert.equal(simulated.getObject({ bucket: replacement.bucket, path: replacement.path }).objectId, replacementId);
    assert.equal(simulated.getSnapshot().attempts.length, 0);
  });

  test('H4-14 indeterminate provider ownership remains residual', async t => {
    const { handle } = await seedStorage(t);
    const expected = object(handle.runId);
    const original = createConditionalStorageFixtureProvider({ projectRef, runId: handle.runId });
    original.markIndeterminateObject({ bucket: expected.bucket, path: expected.path });
    const snapshot = snapshotRecoveryStorageFixture(original);
    assert.deepEqual(snapshot, { objects: [], indeterminate: true, creationOrdinal: null });
    const simulated = fromWitness(handle.runId, snapshot);
    const result = await recoverOfflineProbeRun({ handle, provider: simulated });
    assert.equal(result.reason, 'STORAGE_OWNERSHIP_UNKNOWN');
    assert.deepEqual(result.residual.storage, [1]);
    assert.equal(simulated.getSnapshot().attempts.length, 0);
  });

  test('H4-15 unresolved journaled Storage prevents dependent Auth user deletion', async t => {
    const handle = create(testDirectory());
    t.after(() => handle.close());
    await request(handle, 'storage_upload');
    const { inventory, adminClient, transport } = journalTransport(handle);
    inventory.registerCreatedUser({
      id: ownerId, email: 'h4-created@proof.invalid', creationProof: createCreationProof('before_after_check')
    });
    const result = await inventory.executeCleanup({ adminClient, failClosed: false });
    assert.equal(result.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
    assert.equal(inventory.deletedUsers.size, 0);
    assert.ok(!transport.calls.some(call => call.method === 'DELETE'));
    assert.ok(!handle.report().attempts.some(attempt => attempt.kind === 'auth_delete'));
  });

  test('H4-16 synthetic secrets in authentic transport input and output stay out of persistence', async t => {
    const directory = testDirectory();
    const handle = create(directory);
    const fixture = journalTransport(handle);
    try {
      await fixture.provision();
      assert.ok(fixture.transport.calls.some(call => call.headers.authorization?.includes(fixture.userAccessToken)));
      for (const suffix of ['', '-journal']) {
        let data;
        try { data = readFileSync(journalPath(directory, handle.runId) + suffix); }
        catch (error) { if (error.code === 'ENOENT' && suffix) continue; throw error; }
        for (const value of [secretSentinel, fixture.userAccessToken, content, 'Bearer ', 'apikey', 'https://']) {
          assert.equal(data.includes(value), false, 'found disallowed journal bytes');
        }
      }
    } finally { handle.close(); }
  });

  test('H4-17 Auth effects without transient proof remain blocked after restart', async t => {
    const directory = testDirectory();
    const initial = create(directory);
    const url = 'https://' + projectRef + '.supabase.co/auth/v1/token?grant_type=password';
    const transport = createDeterministicFixtureTransport({
      requestBudgetMode: mode,
      defaultResponse: { status: 200, json: { access_token: secretSentinel } }
    });
    const dispatcher = createTrustedOfflineDispatcher({ projectRef, runId: initial.runId, fetchFn: transport,
      defaultOutcome: { passed: false, status: 400, transportRequest: { url, method: 'POST', body: { password: secretSentinel } } }
    });
    await dispatcher({ id: 'BYPASS-01' });
    assert.equal(transport.calls.length, 1);
    initial.close();
    const handle = reopen(directory, initial.runId);
    t.after(() => handle.close());
    const result = await recoverOfflineProbeRun({ handle });
    assert.equal(result.status, 'RECOVERY_REQUIRED');
    assert.equal(result.reason, 'TRANSIENT_AUTH_CREDENTIALS_OR_PROOF_UNAVAILABLE');
    assert.deepEqual(result.residual.credentialDependent, [1]);
  });

  test('H4-18 verified process-crash recovery counts lookup, conditional delete and independent absence', async t => {
    const { handle, witness } = crash(t, 'after-creation');
    const simulated = fromWitness(handle.runId, witness);
    const result = await recoverOfflineProbeRun({ handle, provider: simulated });
    assert.equal(result.status, 'CLEANUP_VERIFIED_SUCCESS');
    assert.equal(result.consumed, 6);
    assert.deepEqual(result.attempts.slice(-3).map(a => a.kind), ['recovery_lookup', 'recovery_delete', 'recovery_lookup']);
    assert.equal(budget(handle).report().cleanupRequests, 3);
    assert.deepEqual(simulated.getSnapshot().objects, []);
  });

  test('H4-19 valid-digest hostile fields and illegal transitions are rejected', t => {
    for (const invalid of [
      [['dispatch', 1, Date.now()]],
      [['reserve', 1, 'auxiliary', { __proto__: null, payload: secretSentinel }, Date.now()]],
      [['terminal'], ['terminal']],
      [['reserve', 1, 'cleanup', 'storage_upload', Date.now()], ['dispatch', 1, Date.now()], ['terminal']]
    ]) {
      const directory = testDirectory();
      const handle = create(directory);
      handle.close();
      rewrite(directory, handle.runId, envelope => { envelope[4] = invalid; });
      assert.throws(() => reopen(directory, handle.runId), /INVALID_RECOVERY_TRANSITION/);
    }
  });

  test('H4-20 traversal, aliases, absent accounting and hostile options fail closed', t => {
    const directory = testDirectory();
    const handle = create(directory);
    handle.close();
    const alternative = testDirectory();
    linkSync(journalPath(directory, handle.runId), journalPath(alternative, handle.runId));
    assert.throws(() => reopen(alternative, handle.runId), /UNSAFE_RECOVERY_JOURNAL_FILE/);
    const link = join(alternative, 'alias');
    symlinkSync(directory, link, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => reopen(link, handle.runId), /UNSAFE_RECOVERY_DIRECTORY/);
    assert.throws(() => reopen(directory, '../' + handle.runId), /RECOVERY_SCOPE_MISMATCH/);
    assert.throws(() => reopen(testDirectory(), handle.runId), /RECOVERY_ACCOUNTING_MISSING/);
    assert.throws(() => createOfflineRecoveryJournal({ directory: join(dirname(file), '..'), projectRef }), /RECOVERY_DIRECTORY_INSIDE_CHECKOUT/);
    assert.throws(() => createOfflineRecoveryJournal({
      get directory() { assert.fail('getter executed'); }, projectRef
    }), /INVALID_RECOVERY_OPTIONS/);
  });

  test('H4-21 same IDs or an ordinary empty provider do not supply fresh creation proof', async t => {
    const { handle } = await seedStorage(t);
    const inactive = createConditionalStorageFixtureProvider({ projectRef, runId: handle.runId });
    assert.throws(() => createConditionalStorageFixtureProvider({ projectRef, runId: handle.runId, recoverySnapshot: true }), /INVALID_CONDITIONAL_STORAGE_RECORD/);
    assert.throws(() => createConditionalStorageFixtureProvider({
      projectRef, runId: handle.runId, recoverySnapshot: { objects: [], creationOrdinal: null }
    }), /MISSING_CONDITIONAL_STORAGE_FIELD/);
    assert.equal((await recoverOfflineProbeRun({ handle, provider: inactive })).reason, 'RECOVERY_PROVIDER_SNAPSHOT_REQUIRED');
    assert.equal(handle.report().consumed, 1);
    const simulated = provider(handle.runId, { objects: [object(handle.runId)] });
    const result = await recoverOfflineProbeRun({ handle, provider: simulated });
    assert.equal(result.status, 'RECOVERY_REQUIRED');
    assert.equal(simulated.getSnapshot().objects.length, 1);
    assert.equal(simulated.getSnapshot().attempts.length, 0);
  });

  test('H4-22 LIVE and unbudgeted fixture transport paths cannot dispatch', async t => {
    const handle = create(testDirectory());
    t.after(() => handle.close());
    const { adminClient, transport, inventory } = journalTransport(handle);
    const dispatcher = createTrustedOfflineDispatcher({ projectRef, runId: handle.runId, fetchFn: transport });
    const options = { projectRef, runId: handle.runId, inventory, adminClient, offlineDispatcher: dispatcher };
    await assert.rejects(runHostedProbeRunner({ ...options, argv: ['--live'], env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' } }), /RECOVERY_PROBE_ADMISSION_BLOCKED/);
    await assert.rejects(runOfflineProbeSimulation({ ...options, liveHostedDispatch: true }), /BLOCKED_PENDING_DURABLE_RECOVERY/);
    await assert.rejects(transport('https://' + projectRef + '.supabase.co/auth/v1/user'), /RECOVERY_TRANSPORT_RUN_SCOPE_REQUIRED/);
    assert.equal(handle.report().consumed, 0);
    assert.equal(transport.calls.length, 0);
    assert.equal(dispatcher.calls.length, 0);
  });

  test('H4 integration persists normal H3 conditional cleanup and its private absence result', async t => {
    const handle = create(testDirectory());
    t.after(() => handle.close());
    const fixture = journalTransport(handle);
    await fixture.provision();
    const cleanup = await fixture.inventory.executeCleanup({ adminClient: fixture.adminClient, failClosed: false });
    assert.equal(cleanup.status, 'CLEANUP_VERIFIED_SUCCESS', JSON.stringify({ cleanup: cleanup.residualResources, journal: handle.report() }));
    assert.equal(handle.report().status, 'CLEANUP_VERIFIED_SUCCESS');
    assert.equal(handle.report().consumed, 7);
  });

  test('H4 standard pacing and cancellation survive restart', async t => {
    const { handle } = await seedStorage(t, { mode: 'standard' });
    const simulated = provider(handle.runId);
    const aborted = new AbortController();
    aborted.abort();
    const cancelled = await recoverOfflineProbeRun({ handle, provider: simulated, signal: aborted.signal });
    assert.equal(cancelled.reason, 'REQUEST_CANCELLED_BEFORE_DISPATCH');
    assert.equal(cancelled.consumed, 1);
    const started = performance.now();
    const recovered = await recoverOfflineProbeRun({ handle, provider: simulated });
    assert.equal(recovered.status, 'CLEANUP_VERIFIED_SUCCESS');
    assert.ok(performance.now() - started >= 950);
    assert.ok(recovered.attempts[1].dispatchedAt - recovered.attempts[0].dispatchedAt >= 1000);
  });

  test('H4 explicit offline runner shares its durable budget with trusted transport', async t => {
    const handle = create(testDirectory());
    t.after(() => handle.close());
    const { adminClient, inventory, transport } = journalTransport(handle);
    const dispatcher = createTrustedOfflineDispatcher({ projectRef, runId: handle.runId, fetchFn: transport, outcomes: {
      'BYPASS-01': {
        passed: true, status: 422, route_disabled: true, error_code: 'email_provider_disabled',
        transportRequest: { url: 'https://' + projectRef + '.supabase.co/auth/v1/user', method: 'GET' }
      }
    } });
    const result = await runOfflineProbeSimulation({
      projectRef, runId: handle.runId, inventory, adminClient, offlineDispatcher: dispatcher,
      selectedProbeIds: ['BYPASS-01'], timing: { mode }
    });
    assert.equal(result.status, 'COMPLETED');
    assert.equal(result.actualHostedRequests, 0);
    assert.equal(handle.report().status, 'CLEANUP_VERIFIED_SUCCESS');
    assert.deepEqual(handle.report().attempts.map(attempt => attempt.category), ['probe']);
  });

  test('H4 crash before cleanup preserves a directly registered inventory obligation', async t => {
    const { handle, witness } = crash(t, 'direct-inventory');
    assert.equal(witness.calls, 0);
    const result = await recoverOfflineProbeRun({ handle });
    assert.equal(result.consumed, 0);
    assert.equal(result.status, 'RECOVERY_REQUIRED');
    assert.deepEqual(result.residual.volatileKinds, ['auth']);
    assert.equal(result.reason, 'TRANSIENT_AUTH_CREDENTIALS_OR_PROOF_UNAVAILABLE');
  });

  test('H4 direct in-flight effect survives a crash without a transport attempt', async t => {
    const { handle, witness } = crash(t, 'direct-operation');
    assert.equal(witness.calls, 0);
    const result = await recoverOfflineProbeRun({ handle });
    assert.equal(result.consumed, 0);
    assert.equal(result.status, 'RECOVERY_REQUIRED');
    assert.deepEqual(result.residual.volatileKinds, ['auth']);
  });
}
