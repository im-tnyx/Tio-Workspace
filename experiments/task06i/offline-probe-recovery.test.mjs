import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import {
  copyFileSync, existsSync, linkSync, mkdtempSync, readFileSync, realpathSync, rmSync,
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
  createCreationProof, createDeterministicFixtureTransport, createHostedAdminClient, createHostedDispatcher, createMockProjectKey,
  createRunContext, createTrustedOfflineDispatcher, HARDCODED_REAL_REF, HARDCODED_TEMP_REF, HARDCODED_TIO_WORLD_REF,
  provisionStorageProbeFixture, runHostedProbeRunner, runOfflineProbeSimulation, STORAGE_PROBE_BUCKET, TestRunInventory
} from './hosted-probe-runner.mjs';
import { createOfflineRecoveryJournal, recoverOfflineProbeRun, reopenOfflineRecoveryJournal } from './offline-probe-recovery.mjs';
import { executeRunBudgetRequest, getRunRequestBudget } from './run-request-budget.mjs';
import { journalForRun } from './offline-recovery-journal.mjs';
import { validateSessionRevocationEvidence, validateSessionResolutionJournalEvidence } from './session-revocation-evidence.mjs';

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
    projectRef, runId, recoverySnapshot: { projectRef, runId, objects, indeterminate, creationOrdinal }, ...fixtureControls
  });
}

function journalTransport(handle, { postDeleteResponse = null, deleteResponse = null, authCleanup = false, authStatus = 200 } = {}) {
  const { runId } = handle;
  const location = object(runId);
  const transport = createDeterministicFixtureTransport({
    requestBudgetMode: mode,
    conditionalStorage: { projectRef, runId, objects: [] },
    initialState: { uploaded: false, deleted: false },
    routes: [
      { method: 'GET', pathEquals: '/auth/v1/user', status: authStatus, json: { id: ownerId, sentinel: secretSentinel } },
      { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', whenState: { uploaded: false }, status: 404, json: { code: 'NoSuchKey' } },
      { method: 'POST', urlIncludes: '/storage/v1/object/', setsState: { uploaded: true }, status: 200, json: { Id: objectId, sentinel: secretSentinel } },
      { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', whenState: { uploaded: true, deleted: false }, status: 200, text: content },
      { method: 'POST', pathEquals: '/rest/v1/rpc/task06i_lookup_storage_object_owner', status: 200,
        json: [{ id: objectId, bucket_id: location.bucket, name: location.path, owner_id: ownerId }] },
      { method: 'DELETE', urlIncludes: '/storage/v1/object/', setsState: { deleted: true }, ...(deleteResponse || { status: 200, json: {} }) },
      { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', whenState: { deleted: true },
        ...(postDeleteResponse || { status: 400, json: { code: 'NoSuchKey', statusCode: '404' } }) },
      ...(authCleanup ? [
        { method: 'DELETE', pathIncludes: '/auth/v1/admin/users/', status: 200, json: {} },
        { method: 'GET', pathIncludes: '/auth/v1/admin/users/', status: 404, json: { message: 'User not found' } }
      ] : [])
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

async function provisionKeyedStorage(fixture, handle) {
  const provisioning = fixture.provision();
  const key = STORAGE_PROBE_BUCKET + '/' + handle.runId + '/probe.txt';
  const reservation = fixture.inventory.storageFixtures.get(key);
  assert.ok(reservation);
  fixture.inventory.updateStorageFixture(key, {
    ownerOpId: reservation.reservationOpId, lifecycleState: 'CREATION_INDETERMINATE'
  });
  assert.deepEqual(handle.report().residual.volatileKinds, ['storage']);
  return provisioning;
}

function runnerFixture(handle) {
  const fixture = journalTransport(handle);
  const dispatcher = createTrustedOfflineDispatcher({
    projectRef, runId: handle.runId, fetchFn: fixture.transport,
    outcomes: {
      'BYPASS-01': {
        passed: true, status: 422, route_disabled: true, error_code: 'email_provider_disabled',
        transportRequest: { url: 'https://' + projectRef + '.supabase.co/auth/v1/user', method: 'GET' }
      }
    }
  });
  return {
    ...fixture, dispatcher,
    options: {
      projectRef, runId: handle.runId, inventory: fixture.inventory, adminClient: fixture.adminClient,
      offlineDispatcher: dispatcher, selectedProbeIds: ['BYPASS-01'], timing: { mode }
    }
  };
}

function resolutionFixture(handle, { partial = false } = {}) {
  const transport = createDeterministicFixtureTransport({
    requestBudgetMode: mode,
    routes: [
      { method: 'DELETE', pathEquals: '/rest/v1/task06i_rows', status: 204 },
      { method: 'GET', pathEquals: '/rest/v1/task06i_rows', status: 200, json: partial ? [{ id: ownerId }] : [] },
      { method: 'DELETE', pathIncludes: '/auth/v1/admin/users/', status: 200, json: {} },
      { method: 'GET', pathIncludes: '/auth/v1/admin/users/', status: 404, json: { message: 'User not found' } },
      { method: 'POST', pathEquals: '/auth/v1/logout', status: 204 }
    ]
  });
  const inventory = new TestRunInventory(handle.runId);
  const adminClient = createHostedAdminClient({ runId: handle.runId, fetchFn: transport, serviceRoleKey: createMockProjectKey(projectRef, 'service_role') });
  return { inventory, transport, adminClient };
}

function revokedSessionFixture(handle, { sessionId = ownerId, tokenUser = ownerId, intendedUser = ownerId, probeId = 'SESSION-03',
  rejection = { status: 401, json: { code: 'session_not_found' } }, establishBaseline = true } = {}) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = [encode({ alg: 'HS256' }), encode({ sub: tokenUser, session_id: sessionId, ref: projectRef }), 'AA'].join('.');
  const inventory = new TestRunInventory(handle.runId);
  inventory.registerSession(sessionId, token);
  const context = createRunContext({ runId: handle.runId });
  Object.assign(context, { activeAccessToken: token, activeSessionId: sessionId, activeUserId: intendedUser,
    preInvalidationSessionValid: true, passwordResetCompleted: true });
  const transport = createDeterministicFixtureTransport({ requestBudgetMode: mode, routes: [
    { method: 'GET', pathEquals: '/auth/v1/user', times: 1, status: 200, json: { id: tokenUser } },
    { method: 'GET', pathEquals: '/auth/v1/user', ...rejection },
    { method: 'PUT', pathIncludes: '/auth/v1/admin/users/', status: 200, json: { id: ownerId } },
    { method: 'POST', pathEquals: '/functions/v1/auth-user-probe', ...rejection },
    { method: 'POST', pathEquals: '/auth/v1/logout', status: 204 }
  ] });
  const adminClient = createHostedAdminClient({ runId: handle.runId, fetchFn: transport, serviceRoleKey: createMockProjectKey(projectRef, 'service_role') });
  const dispatcher = createHostedDispatcher({ inventory, runContext: context,
    fetchFn: transport, anonKey: createMockProjectKey(projectRef, 'anon'), serviceRoleKey: createMockProjectKey(projectRef, 'service_role') });
  return { inventory, context, transport, adminClient, token,
    verify: async () => {
      if (establishBaseline) await dispatcher({ id: 'SESSION-01', category: 'Session & Consumer' });
      return dispatcher({ id: probeId, category: 'Session & Consumer' });
    } };
}

function admissionSnapshot(handle, directory, fixture, runContext) {
  const file = journalPath(directory, handle.runId);
  const { clear: _clear, ...contextState } = runContext ?? {};
  return {
    inventory: structuredClone(fixture.inventory),
    context: structuredClone(contextState),
    journal: handle.report(),
    persisted: readFileSync(file),
    rollbackSidecar: existsSync(file + '-journal') ? readFileSync(file + '-journal') : null,
    budget: budget(handle).report(),
    provider: snapshotRecoveryStorageFixture(getConditionalStorageFixtureProvider(fixture.transport)),
    providerCalls: fixture.transport.calls,
    dispatcherCalls: fixture.dispatcher.calls
  };
}

async function assertUnchangedAdmission(handle, directory, fixture, invoke, expectedMessage, runContext) {
  const before = admissionSnapshot(handle, directory, fixture, runContext);
  let rejection;
  await assert.rejects(invoke, error => {
    assert.match(error.message, expectedMessage);
    rejection = error;
    return true;
  });
  const after = admissionSnapshot(handle, directory, fixture, runContext);
  assert.deepEqual(after, before);
  assert.equal(rejection.code, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.equal(rejection.cleanupReport.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.equal(rejection.cleanupReport.failureStage, 'admission');
  assert.equal(rejection.cleanupReport.cleanupExecuted, false);
  return rejection.cleanupReport;
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
  if (kind === 'r6-before-resolution' || kind === 'r6-after-resolution') {
    const fixture = revokedSessionFixture(handle);
    interruptWrite(directory, 'session_resolution', 2, kind === 'r6-after-resolution', () => ({ calls: fixture.transport.calls.length }));
    await fixture.verify();
  } else if (kind === 'r4-capacity') {
    const inventory = new TestRunInventory(handle.runId);
    let admitted = 0;
    for (; admitted < 512; admitted++) {
      try { inventory.registerTableRow('capacity_rows', 'row-' + admitted); }
      catch (error) { if (error.code !== 'RECOVERY_CAPACITY_EXCEEDED') throw error; break; }
    }
    writeFileSync(join(directory, 'provider-witness.json'), JSON.stringify({ admitted }), { flush: true });
    process.kill(process.pid, 'SIGKILL');
  } else if (kind === 'r7-direct-registration' || kind === 'r7-direct-registration-absence') {
    const inventory = new TestRunInventory(handle.runId);
    inventory.registerStorageFixture({
      path: handle.runId + '/probe.txt',
      lifecycleState: 'CREATION_PENDING',
      neverDispatched: true
    });
    const storage = provider(handle.runId);
    if (kind === 'r7-direct-registration') storage.putObject(object(handle.runId));
    writeFileSync(join(directory, 'provider-witness.json'), JSON.stringify({
      ...snapshotRecoveryStorageFixture(storage)
    }), { flush: true });
    process.kill(process.pid, 'SIGKILL');
  } else if (kind === 'r4-reservation' || kind === 'r4-direct-effect') {
    const inventory = new TestRunInventory(handle.runId);
    inventory.reserveStorageFixture({ path: handle.runId + '/probe.txt' });
    const storage = provider(handle.runId);
    if (kind === 'r4-direct-effect') storage.putObject(object(handle.runId));
    writeFileSync(join(directory, 'provider-witness.json'), JSON.stringify({ calls: kind === 'r4-direct-effect' ? 1 : 0, ...snapshotRecoveryStorageFixture(storage) }), { flush: true });
    process.kill(process.pid, 'SIGKILL');
  } else if (kind === 'before-storage-resolution' || kind === 'after-storage-resolution') {
    const fixture = journalTransport(handle);
    await provisionKeyedStorage(fixture, handle);
    interruptWrite(directory, 'storage_absence_resolution', 7, kind === 'after-storage-resolution', () => ({ calls: fixture.transport.calls.length }));
    await fixture.inventory.executeCleanup({ adminClient: fixture.adminClient });
  } else if (kind === 'before-resolution' || kind === 'after-resolution') {
    const fixture = resolutionFixture(handle);
    fixture.inventory.registerTableRow('task06i_rows', ownerId);
    interruptWrite(directory, 'resolution', 2, kind === 'after-resolution', () => ({ calls: fixture.transport.calls.length }));
    await fixture.inventory.executeCleanup({ adminClient: fixture.adminClient });
  } else if (kind === 'before-intent' || kind === 'after-reserve') {
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
  const { calls: _calls, ...recoverySnapshot } = witness;
  return createConditionalStorageFixtureProvider({ projectRef, runId, recoverySnapshot });
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
    const originalEmpty = createConditionalStorageFixtureProvider({ projectRef, runId: original.runId });
    assert.throws(() => fromWitness(other.runId, snapshotRecoveryStorageFixture(originalEmpty)), /RECOVERY_PROVIDER_SNAPSHOT_SCOPE_MISMATCH/);
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
    assert.deepEqual(snapshot, { projectRef, runId: handle.runId, objects: [], indeterminate: true, creationOrdinal: null });
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
      projectRef, runId: handle.runId, recoverySnapshot: { projectRef, runId: handle.runId, objects: [], creationOrdinal: null }
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

  test('H4-R1 incorrect runner and repeated explicit LIVE rejection preserve the original eligible inventory', async t => {
    const directory = testDirectory();
    const handle = create(directory);
    t.after(() => handle.close());
    const fixture = runnerFixture(handle);
    const initial = admissionSnapshot(handle, directory, fixture);
    await assert.rejects(recoverOfflineProbeRun({ handle }), /RECOVERY_REOPEN_REQUIRED/);
    assert.deepEqual(admissionSnapshot(handle, directory, fixture), initial);
    const wrongEntryPoint = () => runHostedProbeRunner({
      ...fixture.options, argv: ['--live'], env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' }
    });
    await assertUnchangedAdmission(handle, directory, fixture, wrongEntryPoint, /RECOVERY_PROBE_ADMISSION_BLOCKED/);
    await assertUnchangedAdmission(handle, directory, fixture, wrongEntryPoint, /RECOVERY_PROBE_ADMISSION_BLOCKED/);
    await assertUnchangedAdmission(handle, directory, fixture,
      () => runOfflineProbeSimulation({ ...fixture.options, liveHostedDispatch: true }), /BLOCKED_PENDING_DURABLE_RECOVERY/);
    assert.equal(handle.report().consumed, 0);
    assert.equal(fixture.dispatcher.calls.length, 0);
    assert.equal(fixture.transport.calls.length, 0);
    const result = await runOfflineProbeSimulation(fixture.options);
    assert.equal(result.status, 'COMPLETED');
    assert.equal(result.cleanupReport.status, 'CLEANUP_VERIFIED_SUCCESS');
    assert.equal(handle.report().consumed, 1);
  });

  test('H4-R1 rejected admission preserves verified pending Storage and later admitted cleanup still deletes it', async t => {
    const directory = testDirectory();
    const handle = create(directory);
    t.after(() => handle.close());
    const fixture = runnerFixture(handle);
    await fixture.provision();
    const report = await assertUnchangedAdmission(handle, directory, fixture,
      () => runOfflineProbeSimulation({ ...fixture.options, adminClient: null }), /CLEANUP_CAPABILITY_REQUIRED/);
    assert.ok(report.residualResources.some(resource => resource.type === 'storage_fixture'));
    assert.equal(handle.report().consumed, 5);
    const result = await runOfflineProbeSimulation(fixture.options);
    assert.equal(result.status, 'COMPLETED');
    assert.equal(result.cleanupReport.storageObjectsDeleted, 1);
    assert.equal(handle.report().consumed, 8);
    assert.equal(fixture.transport.calls.filter(call => call.method === 'DELETE').length, 1);
  });

  test('H4-R1 rejected timing preserves Auth obligations and transient credentials', async t => {
    const directory = testDirectory();
    const handle = create(directory);
    t.after(() => handle.close());
    const fixture = runnerFixture(handle);
    const runContext = createRunContext({ runId: handle.runId, testPassword: secretSentinel });
    runContext.activeAccessToken = fixture.userAccessToken;
    runContext.activeRefreshToken = secretSentinel + '-refresh';
    fixture.inventory.registerSession(ownerId, fixture.userAccessToken);
    fixture.inventory.registerSeedPasswordModification({ userId: ownerId, originalPassword: secretSentinel });
    const report = await assertUnchangedAdmission(handle, directory, fixture,
      () => runOfflineProbeSimulation({ ...fixture.options, runContext, timing: { mode: 'standard' } }),
      /REQUEST_BUDGET_MODE_MISMATCH/, runContext);
    assert.ok(report.residualResources.some(resource => resource.type === 'session'));
    assert.ok(report.residualResources.some(resource => resource.type === 'seed_credential_restoration'));
    const diagnostic = JSON.stringify(report);
    assert.ok(!diagnostic.includes(secretSentinel) && !diagnostic.includes(fixture.userAccessToken));
    assert.equal(handle.report().consumed, 0);
  });

  test('H4-R1 reopened recovery rejects probe admission without changing persistent recovery state', async t => {
    const { handle, directory } = await seedStorage(t);
    const fixture = runnerFixture(handle);
    await assertUnchangedAdmission(handle, directory, fixture,
      () => runOfflineProbeSimulation(fixture.options), /RECOVERY_PROBE_ADMISSION_BLOCKED/);
    assert.equal(handle.report().consumed, 1);
    assert.deepEqual(handle.report().residual.storage, [1]);
    const result = await recoverOfflineProbeRun({ handle, provider: provider(handle.runId) });
    assert.equal(result.status, 'CLEANUP_VERIFIED_SUCCESS');
  });

  test('H4-R1 terminal rejection preserves the finalized inventory and terminal journal', async t => {
    const directory = testDirectory();
    const handle = create(directory);
    t.after(() => handle.close());
    const fixture = runnerFixture(handle);
    assert.equal((await runOfflineProbeSimulation(fixture.options)).status, 'COMPLETED');
    await assertUnchangedAdmission(handle, directory, fixture,
      () => runOfflineProbeSimulation(fixture.options), /RECOVERY_PROBE_ADMISSION_BLOCKED/);
    assert.equal(handle.report().status, 'CLEANUP_VERIFIED_SUCCESS');
    assert.equal(handle.report().consumed, 1);
  });

  test('H4-R1 rejected legacy admission cannot pin a pacing mode before valid retry', async () => {
    const fixture = runnerFixture({ runId: 'r1-legacy-pacing-retry' });
    const before = structuredClone(fixture.inventory);
    await assert.rejects(runOfflineProbeSimulation({
      ...fixture.options, adminClient: null, timing: { mode: 'standard' }
    }), /CLEANUP_CAPABILITY_REQUIRED/);
    assert.deepEqual(structuredClone(fixture.inventory), before);
    assert.equal(fixture.transport.calls.length, 0);
    assert.equal((await runOfflineProbeSimulation(fixture.options)).status, 'COMPLETED');
  });

  test('H4-R2 verified table cleanup durably resolves its exact obligation', async t => {
    const directory = testDirectory();
    const handle = create(directory);
    t.after(() => handle.close());
    const transport = createDeterministicFixtureTransport({
      requestBudgetMode: mode,
      routes: [
        { method: 'DELETE', pathEquals: '/rest/v1/task06i_rows', status: 204 },
        { method: 'GET', pathEquals: '/rest/v1/task06i_rows', status: 200, json: [] }
      ]
    });
    const inventory = new TestRunInventory(handle.runId);
    const adminClient = createHostedAdminClient({ runId: handle.runId, fetchFn: transport, serviceRoleKey: createMockProjectKey(projectRef, 'service_role') });
    inventory.registerTableRow('task06i_rows', ownerId);
    const report = await inventory.executeCleanup({ adminClient, failClosed: false });
    assert.equal(report.status, 'CLEANUP_VERIFIED_SUCCESS');
    assert.equal(handle.report().status, 'CLEANUP_VERIFIED_SUCCESS');
    assert.equal(handle.report().consumed, 2);
  });

  for (const resources of [['user'], ['session'], ['table', 'user', 'session']]) {
    test('H4-R2 verified supported cleanup resolves ' + resources.join('/'), async t => {
      const directory = testDirectory();
      const handle = create(directory);
      t.after(() => handle.close());
      const fixture = resolutionFixture(handle);
      if (resources.includes('user')) fixture.inventory.registerCreatedUser({
        id: ownerId, email: 'h4-r2@proof.invalid', creationProof: createCreationProof('before_after_check')
      });
      if (resources.includes('session')) fixture.inventory.registerSession(ownerId, journalTransport(handle).userAccessToken);
      if (resources.includes('table')) fixture.inventory.registerTableRow('task06i_rows', ownerId);
      const cleanup = await fixture.inventory.executeCleanup({ adminClient: fixture.adminClient, failClosed: false });
      assert.equal(cleanup.status, 'CLEANUP_VERIFIED_SUCCESS', JSON.stringify(cleanup));
      const before = handle.report();
      handle.close();
      const restarted = reopen(directory, handle.runId);
      try {
        assert.deepEqual(await recoverOfflineProbeRun({ handle: restarted }), before);
        assert.equal(budget(restarted).report().consumedAttempts, before.consumed);
      } finally { restarted.close(); }
    });
  }

  test('H4-R2 partial cleanup and unrelated same-category dispatch remain unresolved', async t => {
    for (const partial of [false, true]) {
      const handle = create(testDirectory());
      t.after(() => handle.close());
      const fixture = resolutionFixture(handle, { partial });
      fixture.inventory.registerTableRow('task06i_rows', ownerId);
      await request(handle, 'other_effect');
      const cleanup = await fixture.inventory.executeCleanup({ adminClient: fixture.adminClient, failClosed: false });
      assert.equal(cleanup.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
      assert.ok(handle.report().residual.unclassified.includes(1));
      if (partial) assert.equal(fixture.inventory.trackedTableRows.get('task06i_rows').size, 1);
      assert.equal(handle.report().status, 'RECOVERY_REQUIRED');
    }
  });

  test('H4-R2 verified resources survive an admitted cleanup retry', async t => {
    const handle = create(testDirectory());
    t.after(() => handle.close());
    const transport = createDeterministicFixtureTransport({ requestBudgetMode: mode, routes: [
      { method: 'DELETE', pathEquals: '/rest/v1/task06i_rows', status: 204 },
      { method: 'GET', pathEquals: '/rest/v1/task06i_rows', status: 200, json: [] },
      { method: 'POST', pathEquals: '/auth/v1/logout', times: 1, status: 503, json: {} },
      { method: 'POST', pathEquals: '/auth/v1/logout', status: 204 }
    ] });
    const inventory = new TestRunInventory(handle.runId);
    const adminClient = createHostedAdminClient({ runId: handle.runId, fetchFn: transport, serviceRoleKey: createMockProjectKey(projectRef, 'service_role') });
    inventory.registerTableRow('task06i_rows', ownerId);
    inventory.registerSession(ownerId, journalTransport(handle).userAccessToken);
    assert.equal((await inventory.executeCleanup({ adminClient, failClosed: false })).status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
    // The failed dispatch stays indeterminate. A new successful logout cannot
    // authorize clearing that separate historical effect.
    assert.equal((await inventory.executeCleanup({ adminClient, failClosed: false })).status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
    assert.ok(handle.report().residual.credentialDependent.length > 0);
  });

  test('H4-R2 independently verified table retry resolves earlier exact successful effects', async t => {
    const handle = create(testDirectory());
    t.after(() => handle.close());
    const transport = createDeterministicFixtureTransport({ requestBudgetMode: mode, routes: [
      { method: 'DELETE', pathEquals: '/rest/v1/task06i_rows', status: 204 },
      { method: 'GET', pathEquals: '/rest/v1/task06i_rows', times: 1, status: 200, json: [{ id: ownerId }] },
      { method: 'GET', pathEquals: '/rest/v1/task06i_rows', status: 200, json: [] }
    ] });
    const inventory = new TestRunInventory(handle.runId);
    inventory.registerTableRow('task06i_rows', ownerId);
    const adminClient = createHostedAdminClient({ runId: handle.runId, fetchFn: transport, serviceRoleKey: createMockProjectKey(projectRef, 'service_role') });
    assert.equal((await inventory.executeCleanup({ adminClient, failClosed: false })).status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
    assert.equal((await inventory.executeCleanup({ adminClient, failClosed: false })).status, 'CLEANUP_VERIFIED_SUCCESS');
    assert.equal(handle.report().consumed, 4);
  });

  test('H4-R2 public journal and recovery modules initialize independently', () => {
    for (const path of ['./offline-recovery-journal.mjs', './offline-probe-recovery.mjs']) {
      const result = spawnSync(process.execPath, ['--input-type=module', '-e', 'await import(' + JSON.stringify(new URL(path, import.meta.url).href) + ')'], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
    }
  });

  test('H4-R2 unknown Storage volatile registration stays blocked and protects Auth deletion', async t => {
    const handle = create(testDirectory());
    t.after(() => handle.close());
    const fixture = resolutionFixture(handle);
    fixture.inventory.registerStorageObject(STORAGE_PROBE_BUCKET, handle.runId + '/probe.txt');
    fixture.inventory.registerCreatedUser({ id: ownerId, email: 'r2@proof.invalid', creationProof: createCreationProof('before_after_check') });
    const result = await fixture.inventory.executeCleanup({ adminClient: fixture.adminClient, failClosed: false });
    assert.equal(result.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
    assert.equal(fixture.transport.calls.length, 0);
    assert.ok(handle.report().residual.volatileKinds.includes('storage'));
  });

  test('H4-R2 legacy category-only journal markers remain conservatively blocked', async t => {
    const directory = testDirectory();
    const handle = create(directory);
    journalForRun(handle.runId).volatile('auth');
    handle.close();
    const restarted = reopen(directory, handle.runId);
    t.after(() => restarted.close());
    assert.equal((await recoverOfflineProbeRun({ handle: restarted })).status, 'RECOVERY_REQUIRED');
  });

  test('H4-R2 HTTP 503 with user_not_found never proves user absence', async t => {
    const handle = create(testDirectory());
    t.after(() => handle.close());
    const transport = createDeterministicFixtureTransport({ requestBudgetMode: mode, routes: [
      { method: 'DELETE', pathIncludes: '/auth/v1/admin/users/', status: 200, json: {} },
      { method: 'GET', pathIncludes: '/auth/v1/admin/users/', status: 503, json: { code: 'user_not_found', status: 404 } }
    ] });
    const inventory = new TestRunInventory(handle.runId);
    inventory.registerCreatedUser({ id: ownerId, email: 'r2@proof.invalid', creationProof: createCreationProof('before_after_check') });
    const adminClient = createHostedAdminClient({ runId: handle.runId, fetchFn: transport, serviceRoleKey: createMockProjectKey(projectRef, 'service_role') });
    assert.equal((await inventory.executeCleanup({ adminClient, failClosed: false })).status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
    assert.equal(inventory.deletedUsers.size, 0);
    assert.equal(handle.report().status, 'RECOVERY_REQUIRED');
  });

  for (const after of [false, true]) {
    test('H4-R2 process crash ' + (after ? 'after' : 'before') + ' committed resolution', async t => {
      const { handle } = crash(t, after ? 'after-resolution' : 'before-resolution');
      assert.equal(handle.report().consumed, 2);
      const result = await recoverOfflineProbeRun({ handle });
      assert.equal(result.status, after ? 'CLEANUP_VERIFIED_SUCCESS' : 'RECOVERY_REQUIRED');
    });
  }

  test('H4-R2 failed resolution persistence retains a blocked run', async t => {
    const directory = testDirectory();
    const handle = create(directory);
    t.after(() => handle.close());
    const fixture = resolutionFixture(handle);
    fixture.inventory.registerTableRow('task06i_rows', ownerId);
    const restore = interruptWrite(directory, 'resolution', 2, false, () => ({}), 'fail');
    try {
      const result = await fixture.inventory.executeCleanup({ adminClient: fixture.adminClient, failClosed: false });
      assert.equal(result.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
      assert.ok(result.residualResources.some(r => r.error === 'RECOVERY_PERSISTENCE_FAILED'));
    } finally { restore(); }
  });

  test('H4-R2 forged, malformed, duplicate and out-of-order resolution is rejected', async t => {
    const directory = testDirectory();
    const handle = create(directory);
    const fixture = resolutionFixture(handle);
    fixture.inventory.registerTableRow('task06i_rows', ownerId);
    assert.throws(() => journalForRun(handle.runId).resolveLive({ keys: [], attempts: [] }), /UNTRUSTED/);
    await fixture.inventory.executeCleanup({ adminClient: fixture.adminClient });
    handle.close();
    for (const mutation of [
      events => { events.splice(-1, 0, events.find(e => e[0] === 'resolution')); },
      events => { events.find(e => e[0] === 'resolution')[2] = ['a'.repeat(64)]; },
      events => { events.find(e => e[0] === 'resolution')[1] = 0; },
      events => { events.find(e => e[0] === 'resolution')[3] = [99]; }
    ]) {
      const alternate = testDirectory();
      copyFileSync(journalPath(directory, handle.runId), journalPath(alternate, handle.runId));
      rewrite(alternate, handle.runId, envelope => mutation(envelope[4]));
      assert.throws(() => reopen(alternate, handle.runId), /INVALID_RECOVERY_TRANSITION/);
    }
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

  test('H4-R3 authentic keyed Storage cleanup persists scoped absence resolution and replays terminal', async t => {
    const directory = testDirectory();
    const handle = create(directory);
    const fixture = journalTransport(handle);
    // Public inventory transition during the admitted provisioning window:
    // this writes a keyed obligation before the real upload has dispatched.
    await provisionKeyedStorage(fixture, handle);
    const result = await fixture.inventory.executeCleanup({ adminClient: fixture.adminClient, failClosed: false });
    assert.equal(result.status, 'CLEANUP_VERIFIED_SUCCESS', JSON.stringify({ residual: result.residualResources, journal: handle.report() }));
    const before = handle.report();
    assert.deepEqual(before.residual.storage, []);
    assert.equal(before.residual.volatileInventory, false);
    assert.equal(before.consumed, 7);
    assert.equal(before.lastVerifiedStorageAbsenceOrdinal, 7);
    handle.close();
    const db = new DatabaseSync(journalPath(directory, handle.runId));
    const envelope = JSON.parse(db.prepare('SELECT payload FROM journal WHERE id=1').get().payload);
    db.close();
    const events = envelope[4];
    const storageResolution = events.find(event => event[0] === 'storage_absence_resolution');
    assert.ok(storageResolution);
    assert.deepEqual(storageResolution[4], [3, 6, 7]);
    assert.equal(storageResolution[5], 'EXPECTED_OBJECT_DELETED');
    assert.equal(storageResolution[6], 'OBJECT_ABSENT');
    for (const mutate of [
      records => records.splice(records.findIndex(event => event[0] === 'storage_absence_resolution'), 1),
      records => records.splice(-1, 0, records.find(event => event[0] === 'storage_absence_resolution')),
      records => { records.find(event => event[0] === 'storage_absence_resolution')[4] = [3, 7]; },
      records => { records.find(event => event[0] === 'storage_absence_resolution')[6] = 'OBJECT_PRESENT'; },
      records => {
        const index = records.findIndex(event => event[0] === 'storage_absence_resolution');
        const event = records[index];
        records[index] = ['resolution', event[1], [event[2]], [event[4][1]]];
      }
    ]) {
      const alternate = testDirectory();
      copyFileSync(journalPath(directory, handle.runId), journalPath(alternate, handle.runId));
      rewrite(alternate, handle.runId, envelope => mutate(envelope[4]));
      assert.throws(() => reopen(alternate, handle.runId), /INVALID_RECOVERY_TRANSITION/);
    }
    const restarted = reopen(directory, handle.runId);
    t.after(() => restarted.close());
    assert.deepEqual(await recoverOfflineProbeRun({ handle: restarted }), before);
    assert.deepEqual(await recoverOfflineProbeRun({ handle: restarted }), before);
  });

  for (const absent of [true, false]) {
    test('H4-R3 keyed Storage ' + (absent ? 'absence admits dependent Auth and mixed terminal' : 'DELETE without absence blocks Auth'), async t => {
      const handle = create(testDirectory());
      t.after(() => handle.close());
      const fixture = journalTransport(handle, { authCleanup: true,
        postDeleteResponse: absent ? null : { status: 503, json: {} } });
      await provisionKeyedStorage(fixture, handle);
      fixture.inventory.registerCreatedUser({ id: replacementId, email: 'r3-created@proof.invalid', creationProof: createCreationProof('before_after_check') });
      const result = await fixture.inventory.executeCleanup({ adminClient: fixture.adminClient, failClosed: false });
      assert.equal(result.status, absent ? 'CLEANUP_VERIFIED_SUCCESS' : 'CLEANUP_FAILED_RESIDUAL_RESOURCES', JSON.stringify(result.residualResources));
      assert.equal(fixture.transport.calls.filter(call => call.method === 'DELETE' && call.pathname.includes('/auth/v1/admin/users/')).length, absent ? 1 : 0);
      assert.equal(handle.report().consumed, absent ? 9 : 7);
      assert.equal(handle.report().residual.volatileInventory, !absent);
      if (!absent) assert.ok(handle.report().residual.storage.length > 0);
    });
  }

  test('H4-R3 additional indeterminate upload is not cleared by exact keyed cleanup', async t => {
    const handle = create(testDirectory());
    t.after(() => handle.close());
    const fixture = journalTransport(handle);
    await provisionKeyedStorage(fixture, handle);
    await assert.rejects(request(handle, 'storage_upload', () => { throw new Error('indeterminate'); }), /indeterminate/);
    const result = await fixture.inventory.executeCleanup({ adminClient: fixture.adminClient, failClosed: false });
    assert.equal(result.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
    assert.equal(handle.report().lastVerifiedStorageAbsenceOrdinal, null);
    assert.ok(handle.report().residual.storage.includes(6));
    assert.equal(handle.report().consumed, 8);
  });

  for (const after of [false, true]) {
    test('H4-R3 process crash ' + (after ? 'after' : 'before') + ' keyed Storage resolution', async t => {
      const { handle } = crash(t, after ? 'after-storage-resolution' : 'before-storage-resolution');
      assert.equal(handle.report().consumed, 7);
      assert.equal(handle.report().lastVerifiedStorageAbsenceOrdinal, after ? 7 : null);
      const result = await recoverOfflineProbeRun({ handle });
      assert.equal(result.status, after ? 'CLEANUP_VERIFIED_SUCCESS' : 'RECOVERY_REQUIRED');
      assert.equal(result.consumed, 7);
    });
  }

  test('H4-R3 keyed resolution persistence failure cannot finish despite verified absence', async t => {
    const directory = testDirectory();
    const handle = create(directory);
    t.after(() => handle.close());
    const fixture = journalTransport(handle);
    await provisionKeyedStorage(fixture, handle);
    const restore = interruptWrite(directory, 'storage_absence_resolution', 7, false, () => ({}), 'fail');
    try {
      const result = await fixture.inventory.executeCleanup({ adminClient: fixture.adminClient, failClosed: false });
      assert.equal(result.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
      assert.throws(() => handle.report(), /RECOVERY_JOURNAL_UNAVAILABLE/);
    } finally { restore(); }
    handle.close();
    const restarted = reopen(directory, handle.runId);
    t.after(() => restarted.close());
    assert.equal(restarted.report().status, 'RECOVERY_REQUIRED');
    assert.equal(restarted.report().residual.volatileInventory, true);
    assert.equal(restarted.report().consumed, 7);
  });

  for (const count of [200, 220]) {
    test('H4-R4 capacity ' + count + ' public registrations never commits an unreadable journal', t => {
      const directory = testDirectory();
      const handle = create(directory);
      const inventory = new TestRunInventory(handle.runId);
      let admitted = 0;
      for (; admitted < count; admitted++) {
        try { inventory.registerTableRow('capacity_rows', 'row-' + admitted); }
        catch (error) { assert.equal(error.code, 'RECOVERY_CAPACITY_EXCEEDED'); break; }
      }
      handle.close();
      const db = new DatabaseSync(journalPath(directory, handle.runId));
      const payload = db.prepare('SELECT payload FROM journal').get().payload;
      db.close();
      t.diagnostic(JSON.stringify({ admitted, events: JSON.parse(payload)[4].length, bytes: Buffer.byteLength(payload) }));
      const restarted = reopen(directory, handle.runId);
      t.after(() => restarted.close());
      assert.equal(restarted.report().status, 'RECOVERY_REQUIRED');
      assert.equal(inventory.trackedTableRows.get('capacity_rows').size, admitted);
    });
  }

  test('H4-R4 explicit non-preflight reservation rejects without mutation', t => {
    const handle = create(testDirectory());
    t.after(() => handle.close());
    const inventory = new TestRunInventory(handle.runId);
    const before = handle.report();
    assert.throws(() => inventory.reserveStorageFixture({ path: handle.runId + '/probe.txt', lifecycleState: 'CREATION_INDETERMINATE' }), /INVALID_STORAGE_RESERVATION_STATE/);
    assert.deepEqual(handle.report(), before);
    assert.equal(inventory.storageFixtures.size, 0);
  });

  test('H4-R4 normal direct reservation is durable before return and never self-authorizes absence', async t => {
    const directory = testDirectory();
    const handle = create(directory);
    t.after(() => handle.close());
    const inventory = new TestRunInventory(handle.runId);
    const fixture = inventory.reserveStorageFixture({ path: handle.runId + '/probe.txt' });
    assert.equal(handle.report().residual.volatileInventory, true);
    inventory.updateStorageFixture(fixture.key, { ownerOpId: fixture.reservationOpId,
      lifecycleState: 'DEFINITIVE_NON_CREATION', neverDispatched: true });
    handle.close();
    const restarted = reopen(directory, handle.runId);
    t.after(() => restarted.close());
    assert.equal((await recoverOfflineProbeRun({ handle: restarted })).status, 'RECOVERY_REQUIRED');
  });

  for (const kind of ['r4-reservation', 'r4-direct-effect']) {
    test('H4-R4 crash ' + kind + ' cannot falsely finish before fresh provider proof', async t => {
      const { handle, witness } = crash(t, kind);
      const result = await recoverOfflineProbeRun({ handle });
      assert.equal(result.status, 'RECOVERY_REQUIRED');
      assert.equal(witness.calls, kind === 'r4-direct-effect' ? 1 : 0);
      assert.equal(witness.objects.length, kind === 'r4-direct-effect' ? 1 : 0);
    });
  }

  test('H4-R4 maximum admission preserves outstanding outcomes, all 25 slots and recovery headroom', async t => {
    const directory = testDirectory();
    const handle = create(directory);
    t.after(() => handle.close());
    const inventory = new TestRunInventory(handle.runId);
    const shared = budget(handle);
    const ticket = await shared.beginRequest({ kind: 'read' });
    let admitted = 0;
    for (; admitted < 512; admitted++) {
      try { inventory.registerTableRow('capacity_rows', 'row-' + admitted); }
      catch (error) { assert.equal(error.code, 'RECOVERY_CAPACITY_EXCEEDED'); break; }
    }
    const before = handle.report();
    const bytes = readFileSync(journalPath(directory, handle.runId));
    assert.throws(() => inventory.registerTableRow('capacity_rows', 'boundary-plus-one'), /RECOVERY_CAPACITY_EXCEEDED/);
    assert.deepEqual(handle.report(), before);
    assert.deepEqual(readFileSync(journalPath(directory, handle.runId)), bytes);
    assert.equal(inventory.trackedTableRows.get('capacity_rows').size, admitted);
    shared.completeRequest(ticket);
    for (let index = 1; index < 25; index++) await request(handle, 'read');
    assert.equal(shared.report().consumedAttempts, 25);
    await assert.rejects(request(handle, 'read'), /REQUEST_BUDGET_EXHAUSTED/);
    handle.close();
    const restarted = reopen(directory, handle.runId);
    t.after(() => restarted.close());
    assert.equal(restarted.report().consumed, 25);
    assert.equal(restarted.report().status, 'RECOVERY_REQUIRED');
  });

  for (const count of [200, 220, 256]) {
    test('H4-R4 legacy V1 writer envelope above old byte limit remains readable ' + count, t => {
      const directory = testDirectory();
      const handle = create(directory);
      handle.close();
      rewrite(directory, handle.runId, envelope => {
        envelope[4] = Array.from({ length: count }, (_, index) => ['volatile', 'other', createHash('sha256').update('legacy-' + index).digest('hex')]);
      });
      const restarted = reopen(directory, handle.runId);
      t.after(() => restarted.close());
      assert.equal(restarted.report().status, 'RECOVERY_REQUIRED');
      assert.equal(restarted.report().consumed, 0);
      const inventory = new TestRunInventory(handle.runId);
      assert.throws(() => inventory.registerTableRow('legacy_rows', 'new'), /RECOVERY_INVENTORY_MUTATION_BLOCKED/);
    });
  }

  test('H4-R4 oversized malformed envelope is bounded and rejected', () => {
    const directory = testDirectory();
    const handle = create(directory);
    handle.close();
    rewrite(directory, handle.runId, envelope => { envelope[4] = [['volatile', 'other', 'a'.repeat(256 * 1024)]]; });
    assert.throws(() => reopen(directory, handle.runId), /CORRUPT_RECOVERY_JOURNAL/);
  });

  test('H4-R4 actual process crash at capacity leaves readable recovery evidence', async t => {
    const { handle, witness } = crash(t, 'r4-capacity');
    assert.equal(witness.admitted, 154);
    assert.equal((await recoverOfflineProbeRun({ handle })).status, 'RECOVERY_REQUIRED');
    assert.equal(handle.report().consumed, 0);
  });

  test('H4-R4 reservation persistence failure prevents inventory admission and dispatch', async t => {
    const directory = testDirectory();
    const handle = create(directory);
    t.after(() => handle.close());
    const inventory = new TestRunInventory(handle.runId);
    const key = createHash('sha256').update('storage:storage:' + STORAGE_PROBE_BUCKET + '/' + handle.runId + '/probe.txt').digest('hex');
    const restore = interruptWrite(directory, 'storage_reservation', key, false, () => ({}), 'fail');
    try {
      assert.throws(() => inventory.reserveStorageFixture({ path: handle.runId + '/probe.txt' }), /RECOVERY_PERSISTENCE_FAILED/);
      assert.equal(inventory.storageFixtures.size, 0);
      assert.equal(inventory._reservationSequence, 0);
    } finally { restore(); }
  });

  test('H4-R4 module-owned definitive noncreation clears only its reservation', async t => {
    const handle = create(testDirectory());
    t.after(() => handle.close());
    const fixture = journalTransport(handle, { authStatus: 503 });
    fixture.inventory.registerTableRow('other_rows', 'unrelated');
    await assert.rejects(fixture.provision(), /SEED_IDENTITY_VERIFICATION_FAILED/);
    assert.equal(fixture.transport.calls.length, 1);
    assert.deepEqual(handle.report().residual.volatileKinds, ['other']);
    assert.throws(() => journalForRun(handle.runId).resolveNonCreation({ type: 'noncreation' }), /UNTRUSTED/);
    assert.equal(handle.report().status, 'RECOVERY_REQUIRED');
  });

  test('H4-R4 fresh absence can reconcile reservation-only crash, current unknown object cannot', async t => {
    for (const kind of ['r4-reservation', 'r4-direct-effect']) {
      const { handle, witness } = crash(t, kind);
      const result = await recoverOfflineProbeRun({ handle, provider: fromWitness(handle.runId, witness) });
      assert.equal(result.status, kind === 'r4-reservation' ? 'CLEANUP_VERIFIED_SUCCESS' : 'RECOVERY_REQUIRED');
      if (kind === 'r4-direct-effect') assert.equal(witness.objects.length, 1);
      assert.equal(result.consumed, 1);
    }
  });

  test('H4-R4 definitive noncreation can finish, while duplicate reservations retain original identity', async t => {
    const handle = create(testDirectory());
    t.after(() => handle.close());
    const fixture = journalTransport(handle, { authStatus: 503 });
    const provisioning = fixture.provision();
    const key = STORAGE_PROBE_BUCKET + '/' + handle.runId + '/probe.txt';
    const original = fixture.inventory.storageFixtures.get(key);
    const before = handle.report();
    assert.throws(() => fixture.inventory.reserveStorageFixture({ path: original.path, reservationOpId: 'conflicting-operation' }), /RESERVATION_CONFLICT/);
    assert.deepEqual(handle.report(), before);
    assert.equal(fixture.inventory.storageFixtures.get(key), original);
    await assert.rejects(provisioning, /SEED_IDENTITY_VERIFICATION_FAILED/);
    assert.equal(handle.report().residual.volatileInventory, false);
    const cleanup = await fixture.inventory.executeCleanup({ adminClient: fixture.adminClient, failClosed: false });
    assert.equal(cleanup.status, 'CLEANUP_VERIFIED_SUCCESS');
    assert.equal(handle.report().consumed, 1);
  });

  for (const durable of [false, true]) {
    test('H4-R5 normalized operation IDs stay unique and reject unsupported inputs ' + (durable ? 'journal' : 'legacy'), t => {
      const handle = durable ? create(testDirectory()) : null;
      if (handle) t.after(() => handle.close());
      const inventory = new TestRunInventory(handle?.runId || 'r5-legacy-ids');
      const ids = [];
      for (const [index, value] of [undefined, null, '', '   ', undefined].entries()) {
        ids.push(inventory.reserveStorageFixture({ path: 'r5-' + index + '/probe.txt', reservationOpId: value }).reservationOpId);
      }
      assert.equal(new Set(ids).size, ids.length);
      assert.equal(inventory._reservationSequence, 5);
      const explicit = inventory.reserveStorageFixture({ path: 'r5-explicit/probe.txt', reservationOpId: '  explicit-owner  ' });
      assert.equal(explicit.reservationOpId, 'explicit-owner');
      assert.equal(inventory._reservationSequence, 5);
      for (const value of [123, true, 0, false, {}, () => {}, 'malformed\u0000id', 'x'.repeat(513)]) {
        for (const method of ['reserveStorageFixture', 'registerStorageFixture']) {
          const before = handle?.report();
          const size = inventory.storageFixtures.size;
          assert.throws(() => inventory[method]({ path: 'rejected/probe.txt', reservationOpId: value }), /INVALID_STORAGE_OPERATION_ID/);
          assert.equal(inventory.storageFixtures.size, size);
          assert.equal(inventory._reservationSequence, 5);
          if (handle) assert.deepEqual(handle.report(), before);
        }
      }
      assert.throws(() => inventory.updateStorageFixture(STORAGE_PROBE_BUCKET + '/r5-0/probe.txt', {
        ownerOpId: ids[1], status: 'WRONG_OWNER'
      }), /OWNERSHIP_VIOLATION/);
    });

    test('H4-R5 explicit/generated collisions and adjacent registration ' + (durable ? 'journal' : 'legacy'), t => {
      const handle = durable ? create(testDirectory()) : null;
      if (handle) t.after(() => handle.close());
      const inventory = new TestRunInventory(handle?.runId || 'r5-legacy-collisions');
      const firstAuto = 'op-res-' + inventory.runId + '-1';
      inventory.registerStorageFixture({ path: 'legacy-explicit/probe.txt', reservationOpId: firstAuto });
      const next = inventory.reserveStorageFixture({ path: 'generated/probe.txt' });
      assert.notEqual(next.reservationOpId, firstAuto);
      assert.equal(inventory._reservationSequence, 2);
      for (const method of ['reserveStorageFixture', 'registerStorageFixture']) {
        const before = handle?.report();
        assert.throws(() => inventory[method]({ path: 'conflicting/probe.txt', reservationOpId: next.reservationOpId }), /STORAGE_OPERATION_ID_CONFLICT/);
        assert.equal(inventory.storageFixtures.has(STORAGE_PROBE_BUCKET + '/conflicting/probe.txt'), false);
        if (handle) assert.deepEqual(handle.report(), before);
      }
      const adjacent = inventory.registerStorageFixture({ path: 'adjacent/probe.txt', reservationOpId: '   ' });
      assert.notEqual(adjacent.reservationOpId, next.reservationOpId);
      assert.equal(inventory._reservationSequence, 3);
    });
  }

  test('H4-R5 failed reservation persistence never advances normalized auto sequence', t => {
    const directory = testDirectory();
    const handle = create(directory);
    t.after(() => handle.close());
    const inventory = new TestRunInventory(handle.runId);
    const path = handle.runId + '/probe.txt';
    const key = createHash('sha256').update('storage:storage:' + STORAGE_PROBE_BUCKET + '/' + path).digest('hex');
    const restore = interruptWrite(directory, 'storage_reservation', key, false, () => ({}), 'fail');
    try {
      assert.throws(() => inventory.reserveStorageFixture({ path, reservationOpId: '   ' }), /RECOVERY_PERSISTENCE_FAILED/);
      assert.equal(inventory._reservationSequence, 0);
      assert.equal(inventory.storageFixtures.size, 0);
    } finally { restore(); }
  });

  test('H4-R6 authentic already-revoked session reaches durable cleanup without redundant logout', async t => {
    const handle = create(testDirectory());
    t.after(() => handle.close());
    const fixture = revokedSessionFixture(handle);
    const observation = await fixture.verify();
    assert.equal(observation.passed, true, JSON.stringify({ observation, report: handle.report() }));
    assert.equal(fixture.inventory.isSessionRevoked(ownerId), true);
    const result = await fixture.inventory.executeCleanup({ adminClient: fixture.adminClient, failClosed: false });
    assert.equal(result.status, 'CLEANUP_VERIFIED_SUCCESS', JSON.stringify({
      residual: result.residualResources, report: handle.report()
    }));
    assert.equal(handle.report().status, 'CLEANUP_VERIFIED_SUCCESS');
    assert.equal(handle.report().consumed, 2);
    assert.equal(fixture.transport.calls.length, 2);
  });

  test('H4-R6 empty cleanup must finalize the durable journal with zero requests', async t => {
    const directory = testDirectory();
    const handle = create(directory);
    t.after(() => handle.close());
    const inventory = new TestRunInventory(handle.runId);
    const result = await inventory.executeCleanup({ adminClient: null });
    assert.equal(result.status, 'CLEANUP_VERIFIED_SUCCESS');
    assert.equal(handle.report().status, 'CLEANUP_VERIFIED_SUCCESS');
    assert.equal(handle.report().consumed, 0);
    assert.equal((await inventory.executeCleanup({ adminClient: null })).status, result.status);
    handle.close();
    const restarted = reopen(directory, handle.runId);
    t.after(() => restarted.close());
    assert.equal((await recoverOfflineProbeRun({ handle: restarted })).status, 'CLEANUP_VERIFIED_SUCCESS');
  });

  test('H4-R7 direct CREATION_PENDING registration survives process crash with provider object preserved', async t => {
    const { handle, witness } = crash(t, 'r7-direct-registration');
    assert.equal(witness.objects.length, 1);
    assert.equal(handle.report().residual.volatileInventory, true);
    const result = await recoverOfflineProbeRun({ handle, provider: fromWitness(handle.runId, witness) });
    assert.equal(result.status, 'RECOVERY_REQUIRED');
    assert.equal(result.reason, 'STORAGE_OWNERSHIP_UNPROVEN_OR_REPLACED');
    assert.equal(result.consumed, 1);
    assert.equal(witness.objects.length, 1, 'unknown provider object must never be deleted');
  });

  test('H4-R7 direct default registration persists exact operation-bound Storage reservation', async t => {
    const directory = testDirectory();
    const handle = create(directory);
    t.after(() => handle.close());
    const inventory = new TestRunInventory(handle.runId);
    const fixture = inventory.registerStorageFixture({ path: handle.runId + '/probe.txt' });
    const key = createHash('sha256').update('storage:storage:' + STORAGE_PROBE_BUCKET + '/' + fixture.path).digest('hex');
    const state = journalForRun(handle.runId).state;
    assert.equal(state.obligations.get(key), 'storage');
    assert.equal(state.reservations.get(key), createHash('sha256').update(fixture.reservationOpId).digest('hex'));
    assert.equal(inventory._reservationSequence, 1);
    handle.close();
    const restarted = reopen(directory, handle.runId);
    t.after(() => restarted.close());
    assert.equal((await recoverOfflineProbeRun({ handle: restarted })).status, 'RECOVERY_REQUIRED');
    assert.equal(restarted.report().consumed, 0, 'recovery cannot infer absence without an authoritative provider snapshot');
  });

  test('H4-R7 lifecycle labels and neverDispatched cannot establish definitive non-creation', async t => {
    const handle = create(testDirectory());
    t.after(() => handle.close());
    const inventory = new TestRunInventory(handle.runId);
    const fixture = inventory.registerStorageFixture({ path: handle.runId + '/probe.txt',
      lifecycleState: 'DEFINITIVE_NON_CREATION', neverDispatched: true });
    assert.equal(fixture.neverDispatched, true, 'the public label remains diagnostic only');
    assert.equal(handle.report().status, 'RECOVERY_REQUIRED');
    assert.equal(handle.report().residual.volatileInventory, true);
    assert.throws(() => inventory.registerStorageFixture({ path: 'unsupported/probe.txt', lifecycleState: 'UNTRUSTED_STATE' }),
      /INVALID_STORAGE_REGISTRATION_STATE/);
  });

  test('H4-R7 direct registration reuses neither an existing resource nor a journaled operation ID', t => {
    const handle = create(testDirectory());
    t.after(() => handle.close());
    const firstInventory = new TestRunInventory(handle.runId);
    const first = firstInventory.reserveStorageFixture({ path: 'r7-existing/probe.txt', reservationOpId: 'op-res-' + handle.runId + '-1' });
    const secondInventory = new TestRunInventory(handle.runId);
    const before = handle.report();
    assert.throws(() => secondInventory.registerStorageFixture({ path: first.path, reservationOpId: 'different' }), /RESERVATION_CONFLICT/);
    assert.deepEqual(handle.report(), before);
    assert.equal(secondInventory.storageFixtures.size, 0);
    const next = secondInventory.registerStorageFixture({ path: 'r7-new/probe.txt' });
    assert.notEqual(next.reservationOpId, first.reservationOpId);
    assert.equal(handle.report().residual.volatileKinds.length, 1);
  });

  for (const durable of [false, true]) {
    test('H4-R7 direct fixture registration cannot duplicate a path-only Storage entry ' + (durable ? 'journal' : 'legacy'), t => {
      const handle = durable ? create(testDirectory()) : null;
      if (handle) t.after(() => handle.close());
      const inventory = new TestRunInventory(handle?.runId || 'r7-legacy-path-only');
      const path = 'same/path.txt';
      inventory.registerStorageObject(STORAGE_PROBE_BUCKET, path);
      const beforeSequence = inventory._reservationSequence;
      const beforeFixtureCount = inventory.storageFixtures.size;
      assert.throws(() => inventory.registerStorageFixture({ path }), /already tracked in inventory/);
      assert.equal(inventory._reservationSequence, beforeSequence);
      assert.equal(inventory.storageFixtures.size, beforeFixtureCount);
      assert.equal(inventory.trackedStorageObjects.get(STORAGE_PROBE_BUCKET).has(path), true);
      if (handle) assert.equal(handle.report().residual.volatileKinds.length, 1);
    });
  }

  test('H4-R7 fresh canonical absence reconciles registration; noncanonical registration stays blocked', async t => {
    const canonical = crash(t, 'r7-direct-registration-absence');
    const absentResult = await recoverOfflineProbeRun({ handle: canonical.handle, provider: fromWitness(canonical.handle.runId, canonical.witness) });
    assert.equal(absentResult.status, 'CLEANUP_VERIFIED_SUCCESS');
    assert.equal(absentResult.consumed, 1);

    const directory = testDirectory();
    const created = create(directory);
    t.after(() => created.close());
    const inventory = new TestRunInventory(created.runId);
    inventory.registerStorageFixture({ path: 'noncanonical/path.txt', lifecycleState: 'CREATION_PENDING', neverDispatched: true });
    const runId = created.runId;
    created.close();
    const handle = reopen(directory, runId);
    t.after(() => handle.close());
    const result = await recoverOfflineProbeRun({ handle, provider: provider(runId) });
    assert.equal(result.status, 'RECOVERY_REQUIRED');
    assert.equal(result.consumed, 0, 'canonical absence evidence does not clear a noncanonical resource');
    assert.deepEqual(result.residual.volatileKinds, ['storage']);
  });

  test('H4-R7 unresolved direct Storage registration blocks dependent Auth deletion', async t => {
    const handle = create(testDirectory());
    t.after(() => handle.close());
    const fixture = journalTransport(handle, { authCleanup: true });
    fixture.inventory.registerStorageFixture({ path: handle.runId + '/probe.txt',
      lifecycleState: 'CREATION_PENDING', neverDispatched: true });
    fixture.inventory.registerCreatedUser({ id: replacementId, email: 'r7-created@proof.invalid', creationProof: createCreationProof('before_after_check') });
    const result = await fixture.inventory.executeCleanup({ adminClient: fixture.adminClient, failClosed: false });
    assert.notEqual(result.status, 'CLEANUP_VERIFIED_SUCCESS');
    assert.equal(fixture.transport.calls.filter(call => call.method === 'DELETE' && call.pathname.includes('/auth/v1/admin/users/')).length, 0);
    assert.equal(handle.report().status, 'RECOVERY_REQUIRED');
  });

  test('H4-R7 conditional NoSuchKey plus independent GET absence durably resolves exact Storage before Auth', async t => {
    const directory = testDirectory();
    const handle = create(directory);
    t.after(() => handle.close());
    const fixture = journalTransport(handle, { authCleanup: true,
      deleteResponse: { status: 400, json: { code: 'NoSuchKey', statusCode: '404' } } });
    await provisionKeyedStorage(fixture, handle);
    const resource = { bucket: STORAGE_PROBE_BUCKET, path: handle.runId + '/probe.txt' };
    const storageProvider = getConditionalStorageFixtureProvider(fixture.transport);
    assert.ok(storageProvider);
    assert.equal(storageProvider.removeFixtureObject(resource), true,
      'model a run-owned object that became absent before cleanup');
    fixture.inventory.registerCreatedUser({ id: replacementId, email: 'r7-absence@proof.invalid',
      creationProof: createCreationProof('before_after_check') });

    const result = await fixture.inventory.executeCleanup({ adminClient: fixture.adminClient, failClosed: false });
    assert.equal(result.status, 'CLEANUP_VERIFIED_SUCCESS', JSON.stringify({ residual: result.residualResources, report: handle.report() }));
    assert.equal(fixture.transport.calls.filter(call => call.method === 'DELETE' && call.pathname.includes('/storage/v1/object/')).length, 1);
    const storageFixture = fixture.inventory.storageFixtures.get(STORAGE_PROBE_BUCKET + '/' + resource.path);
    assert.equal(storageFixture.absenceEvidence.status, 400);
    assert.equal(storageFixture.absenceEvidence.classification, 'OBJECT_ABSENT');
    assert.equal(result.status, 'CLEANUP_VERIFIED_SUCCESS', JSON.stringify(result.residualResources));
    assert.equal(handle.report().status, 'CLEANUP_VERIFIED_SUCCESS');
    assert.equal(result.usersDeleted, 1);
    assert.equal(fixture.transport.calls.filter(call => call.method === 'DELETE' && call.pathname.includes('/auth/v1/admin/users/')).length, 1,
      'dependent Auth deletion runs only after the Storage proof is durably admitted');
    const storageKey = createHash('sha256').update('storage:storage:' + STORAGE_PROBE_BUCKET + '/' + resource.path).digest('hex');
    assert.equal(journalForRun(handle.runId).state.obligations.has(storageKey), false);
    assert.equal(journalForRun(handle.runId).state.reservations.has(storageKey), false);
    const durableAttempts = journalForRun(handle.runId).state.attempts;
    assert.equal(durableAttempts[5].kind, 'storage_delete');
    assert.equal(durableAttempts[5].outcome, 'failed', 'expected NoSuchKey DELETE remains an accounted failed HTTP attempt');
    assert.equal(durableAttempts[5].resourceKey, storageKey);
    assert.equal(durableAttempts[6].kind, 'storage_absence_read');
    assert.equal(durableAttempts[6].outcome, 'failed', 'authoritative NoSuchKey GET remains an accounted failed HTTP attempt');
    assert.equal(durableAttempts[6].resourceKey, storageKey);
    assert.equal(handle.report().consumed, budget(handle).report().consumedAttempts);
    const attemptsBeforeRestart = handle.report().consumed;
    handle.close();
    const restarted = reopen(directory, handle.runId);
    t.after(() => restarted.close());
    assert.equal((await recoverOfflineProbeRun({ handle: restarted })).status, 'CLEANUP_VERIFIED_SUCCESS');
    assert.equal(restarted.report().consumed, attemptsBeforeRestart, 'terminal replay does not refund or add requests');
  });

  test('H4-R7 registration persistence failure leaves fixture and operation sequence unchanged', t => {
    const directory = testDirectory();
    const handle = create(directory);
    t.after(() => handle.close());
    const inventory = new TestRunInventory(handle.runId);
    const path = handle.runId + '/probe.txt';
    const key = createHash('sha256').update('storage:storage:' + STORAGE_PROBE_BUCKET + '/' + path).digest('hex');
    const before = readFileSync(journalPath(directory, handle.runId));
    const restore = interruptWrite(directory, 'storage_reservation', key, false, () => ({}), 'fail');
    try {
      assert.throws(() => inventory.registerStorageFixture({ path, lifecycleState: 'CREATION_PENDING', neverDispatched: true }), /RECOVERY_PERSISTENCE_FAILED/);
      assert.equal(inventory._reservationSequence, 0);
      assert.equal(inventory.storageFixtures.size, 0);
      assert.deepEqual(readFileSync(journalPath(directory, handle.runId)), before);
    } finally { restore(); }
  });

  test('H4-R7 semantic proof requires decisive endpoint evidence and permits declared supporting reads', t => {
    const handle = create(testDirectory());
    t.after(() => handle.close());
    const resourceKey = createHash('sha256').update('auth:session:' + ownerId).digest('hex');
    const tokenHash = 'a'.repeat(64);
    const expected = { projectRef, runId: handle.runId, sessionId: ownerId, userId: ownerId, tokenHash, resourceKey };
    const proof = {
      projectRef, runId: handle.runId, sessionId: ownerId, userId: ownerId, tokenHash,
      purpose: 'session_03_post_reset_user_read', classification: 'provider_session_revoked',
      providerEvidence: 'SESSION_NOT_FOUND',
      decisiveOrdinal: 2,
      prerequisites: ['password_reset_confirmed', 'pre_invalidation_session_valid', 'intended_user_correlated'],
      supportingOrdinals: [1]
    };
    const read = (ordinal, status) => ({ ordinal, status, kind: 'read', target: {
      origin: 'https://' + projectRef + '.supabase.co', method: 'GET', path: '/auth/v1/user', scope: null
    } });
    const entry = {
      projectRef, runId: handle.runId, resource: 'session:' + ownerId, key: resourceKey,
      requestOrdinals: [1, 2], responses: [read(1, 200), read(2, 401)]
    };
    const evidence = validateSessionRevocationEvidence({ entry, proof, expected });
    assert.ok(evidence);
    assert.deepEqual(evidence.requests.map(request => request.role), ['supporting', 'decisive']);
    assert.equal(validateSessionResolutionJournalEvidence(resourceKey, [1, 2], evidence), true);

    assert.equal(validateSessionRevocationEvidence({ entry: { ...entry, responses: [read(1, 200)] , requestOrdinals: [1] },
      proof: { ...proof, decisiveOrdinal: 1, supportingOrdinals: [] }, expected }), null,
    'a successful /user read cannot be decisive revocation evidence');
    const badEdge = { ...entry, requestOrdinals: [1], responses: [{ ordinal: 1, status: 200, kind: 'other_effect', target: {
      origin: 'https://' + projectRef + '.supabase.co', method: 'POST', path: '/functions/v1/auth-user-probe', scope: null
    } }] };
    assert.equal(validateSessionRevocationEvidence({ entry: badEdge, proof: { ...proof, purpose: 'session_06_post_reset_edge_probe',
      decisiveOrdinal: 1, supportingOrdinals: [] }, expected }), null,
    'a generic successful Edge response cannot be decisive revocation evidence');
    const genericFiveHundred = { ...badEdge, responses: [{ ...badEdge.responses[0], status: 500 }] };
    assert.equal(validateSessionRevocationEvidence({ entry: genericFiveHundred,
      proof: { ...proof, purpose: 'session_06_post_reset_edge_probe', classification: 'provider_session_revoked', providerEvidence: null,
        decisiveOrdinal: 1, supportingOrdinals: [] }, expected }), null,
    'HTTP 500 without fixed session-missing evidence is not revocation proof');
    const unrelated = { ...entry, responses: [read(1, 200), { ...read(2, 401), target: {
      origin: 'https://' + projectRef + '.supabase.co', method: 'GET', path: '/auth/v1/token', scope: null
    } }] };
    assert.equal(validateSessionRevocationEvidence({ entry: unrelated, proof, expected }), null,
      'unrelated endpoints cannot be attached as session evidence');
  });

  test('H4-R7 SESSION-01 baseline binds provider user to the registered token and session', async t => {
    for (const providerUserId of [ownerId, replacementId]) {
      const handle = create(testDirectory());
      t.after(() => handle.close());
      const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
      const token = [encode({ alg: 'HS256' }), encode({ sub: ownerId, session_id: ownerId, ref: projectRef }), 'AA'].join('.');
      const inventory = new TestRunInventory(handle.runId);
      inventory.registerSession(ownerId, token);
      const context = createRunContext({ runId: handle.runId });
      Object.assign(context, { activeAccessToken: token, activeSessionId: ownerId, activeUserId: ownerId });
      const transport = createDeterministicFixtureTransport({ requestBudgetMode: mode, routes: [
        { method: 'GET', pathEquals: '/auth/v1/user', status: 200, json: { id: providerUserId } }
      ] });
      const dispatcher = createHostedDispatcher({ inventory, runContext: context, fetchFn: transport,
        anonKey: createMockProjectKey(projectRef, 'anon'), serviceRoleKey: createMockProjectKey(projectRef, 'service_role') });
      const observation = await dispatcher({ id: 'SESSION-01', category: 'Session & Consumer' });
      assert.equal(observation.passed, providerUserId === ownerId);
      assert.equal(context.preInvalidationSessionValid, providerUserId === ownerId);
      assert.equal(handle.report().consumed, 1);
      if (providerUserId !== ownerId) assert.equal(handle.report().residual.volatileInventory, true);
    }
  });

  test('H4-R7 SESSION-02 cannot claim revocation without a proven pre-invalidation baseline', async t => {
    const handle = create(testDirectory());
    t.after(() => handle.close());
    const fixture = revokedSessionFixture(handle, { probeId: 'SESSION-02', establishBaseline: false });
    fixture.context.preInvalidationSessionValid = false;
    const observation = await fixture.verify();
    assert.equal(observation.passed, false);
    assert.match(observation.error, /exact pre-invalidation session baseline/);
    assert.equal(fixture.transport.calls.filter(call => call.method === 'PUT').length, 1);
    assert.equal(fixture.transport.calls.filter(call => call.method === 'GET').length, 0,
      'without a valid baseline, the post-reset rejection is not dispatched as revocation proof');
    assert.equal(handle.report().consumed, 1);
    assert.equal(journalForRun(handle.runId).state.obligations.size, 1);
  });

  for (const probeId of ['SESSION-03', 'SESSION-06']) {
    test('H4-R7 successful ' + probeId + ' response never resolves durable revocation', async t => {
      const handle = create(testDirectory());
      t.after(() => handle.close());
      const fixture = revokedSessionFixture(handle, { probeId, rejection: { status: 200, json: { id: ownerId } } });
      const result = await fixture.verify();
      assert.equal(result.passed, false);
      const key = createHash('sha256').update('auth:session:' + ownerId).digest('hex');
      assert.equal(journalForRun(handle.runId).state.obligations.has(key), true);
      assert.equal(handle.report().status, 'RECOVERY_REQUIRED');
      assert.equal(handle.report().consumed, 2);
    });
  }

  test('H4-R7 generic Edge HTTP 500 cannot resolve a session obligation', async t => {
    const handle = create(testDirectory());
    t.after(() => handle.close());
    const fixture = revokedSessionFixture(handle, { probeId: 'SESSION-06', rejection: { status: 500, json: { message: 'Internal Server Error' } } });
    assert.equal((await fixture.verify()).passed, false);
    assert.equal(handle.report().status, 'RECOVERY_REQUIRED');
    assert.equal(handle.report().consumed, 2);
  });

  test('H4-R7 exact fixed Edge session-missing evidence remains supported and persists only safe metadata', async t => {
    const directory = testDirectory();
    const handle = create(directory);
    t.after(() => handle.close());
    const fixture = revokedSessionFixture(handle, { probeId: 'SESSION-06', rejection: { status: 500, json: { code: 'session_not_found' } } });
    assert.equal((await fixture.verify()).passed, true);
    assert.equal(journalForRun(handle.runId).state.obligations.size, 0);
    handle.close();
    const db = new DatabaseSync(journalPath(directory, handle.runId));
    try {
      const payload = db.prepare('SELECT payload FROM journal').get().payload;
      const resolution = JSON.parse(payload)[4].find(event => event[0] === 'session_resolution');
      assert.equal(resolution[4].purpose, 'session_06_post_reset_edge_probe');
      assert.equal(resolution[4].classification, 'provider_session_revoked');
    assert.equal(resolution[4].requests.at(-1).path, '/functions/v1/auth-user-probe');
      assert.equal(payload.includes(fixture.token), false);
      assert.equal(payload.includes('session_not_found'), false);
      assert.equal(payload.includes(secretSentinel), false);
    } finally { db.close(); }
  });

  test('H4-R7 authentic targeted local logout resolves only its exact session and stores safe semantic evidence', async t => {
    const directory = testDirectory();
    const handle = create(directory);
    t.after(() => handle.close());
    const fixture = revokedSessionFixture(handle);
    const result = await fixture.inventory.executeCleanup({ adminClient: fixture.adminClient, failClosed: false });
    assert.equal(result.status, 'CLEANUP_VERIFIED_SUCCESS');
    assert.equal(fixture.transport.calls.length, 1);
    assert.equal(handle.report().consumed, 1);
    assert.equal(journalForRun(handle.runId).state.obligations.size, 0);
    handle.close();
    const db = new DatabaseSync(journalPath(directory, handle.runId));
    try {
      const payload = db.prepare('SELECT payload FROM journal').get().payload;
      const resolution = JSON.parse(payload)[4].find(event => event[0] === 'session_resolution');
      assert.equal(resolution[4].purpose, 'targeted_local_logout');
      assert.equal(resolution[4].classification, 'local_logout_completed');
      assert.deepEqual(resolution[4].requests.map(request => [request.method, request.path, request.scope, request.status]),
        [['POST', '/auth/v1/logout', 'local', 204]]);
      assert.equal(payload.includes(fixture.token), false);
      assert.equal(payload.includes(secretSentinel), false);
    } finally { db.close(); }
  });

  for (const probeId of ['SESSION-02', 'SESSION-06']) {
    test('H4-R6 ' + probeId + ' persists exact verified session and preserves unrelated reset effects', async t => {
      const handle = create(testDirectory());
      t.after(() => handle.close());
      const fixture = revokedSessionFixture(handle, { probeId });
      const result = await fixture.verify();
      assert.equal(result.passed, true, JSON.stringify(result));
      const key = createHash('sha256').update('auth:session:' + ownerId).digest('hex');
      assert.equal(journalForRun(handle.runId).state.obligations.has(key), false);
      assert.equal(handle.report().consumed, probeId === 'SESSION-02' ? 3 : 2);
      if (probeId === 'SESSION-02') {
        assert.ok(handle.report().residual.credentialDependent.length > 0);
        assert.equal(handle.report().status, 'RECOVERY_REQUIRED');
      } else {
        assert.equal((await fixture.inventory.executeCleanup({ adminClient: fixture.adminClient })).status, 'CLEANUP_VERIFIED_SUCCESS');
        assert.equal(fixture.transport.calls.length, 2);
      }
    });
  }

  test('H4-R6 private correlated credential logout resolves session but not its unscoped login effect', async t => {
    const handle = create(testDirectory());
    t.after(() => handle.close());
    const fixture = revokedSessionFixture(handle);
    const transport = createDeterministicFixtureTransport({ requestBudgetMode: mode, routes: [
      { method: 'POST', pathEquals: '/auth/v1/token', status: 200, json: { access_token: fixture.token, user: { id: ownerId }, session_id: ownerId } },
      { method: 'POST', pathEquals: '/auth/v1/logout', status: 204 }
    ] });
    const admin = createHostedAdminClient({ runId: handle.runId, fetchFn: transport, serviceRoleKey: createMockProjectKey(projectRef, 'service_role') });
    const result = await admin.verifyUserCredentials('r6@proof.invalid', 'synthetic-password', { inventory: fixture.inventory, expectedUserId: ownerId });
    assert.equal(result.credentialVerified, true);
    assert.equal(result.sessionRevocationFailed, false);
    assert.equal(journalForRun(handle.runId).state.obligations.size, 0);
    assert.deepEqual(handle.report().residual.credentialDependent, [1]);
    assert.equal((await fixture.inventory.executeCleanup({ adminClient: admin, failClosed: false })).status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
    assert.equal(transport.calls.length, 2, 'No repeated logout for the privately revoked session');
  });

  for (const hostile of ['public-marker', 'public-set', 'wrong-user', 'wrong-session', 'bad-jwt']) {
    test('H4-R6 ' + hostile + ' cannot resolve a session obligation', async t => {
      const handle = create(testDirectory());
      t.after(() => handle.close());
      const fixture = revokedSessionFixture(handle, {
        intendedUser: hostile === 'wrong-user' ? replacementId : ownerId,
        rejection: hostile === 'bad-jwt' ? { status: 401, json: { code: 'jwt_expired', message: 'JWT expired; session not found' } } : undefined
      });
      if (hostile === 'public-marker') fixture.inventory.markSessionRevoked(ownerId);
      else if (hostile === 'public-set') fixture.inventory.revokedSessions.add(ownerId);
      else {
        if (hostile === 'wrong-session') {
          fixture.inventory.registerSession(replacementId);
          fixture.context.activeSessionId = replacementId;
        }
        await fixture.verify();
      }
      const key = createHash('sha256').update('auth:session:' + ownerId).digest('hex');
      assert.equal(journalForRun(handle.runId).state.obligations.has(key), true);
      assert.equal(handle.report().status, 'RECOVERY_REQUIRED');
      assert.throws(() => journalForRun(handle.runId).resolveSession({ type: 'session' }), /UNTRUSTED/);
    });
  }

  test('H4-R6 unrelated Auth effects survive verified session and empty-live finalization', async t => {
    const handle = create(testDirectory());
    t.after(() => handle.close());
    await request(handle, 'auth_effect');
    const fixture = revokedSessionFixture(handle);
    await fixture.verify();
    const cleanup = await fixture.inventory.executeCleanup({ adminClient: fixture.adminClient, failClosed: false });
    assert.equal(cleanup.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
    assert.deepEqual(handle.report().residual.credentialDependent, [1]);
    const emptyInventory = new TestRunInventory(handle.runId);
    assert.equal((await emptyInventory.executeCleanup({ adminClient: null, failClosed: false })).status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
    assert.equal(emptyInventory.runLifecycleState, 'RESIDUAL_BLOCKED');
    assert.equal(emptyInventory.clearCredentials(), false);
  });

  for (const after of [false, true]) {
    test('H4-R6 actual crash ' + (after ? 'after' : 'before') + ' verified session resolution', async t => {
      const { handle } = crash(t, after ? 'r6-after-resolution' : 'r6-before-resolution');
      const result = await recoverOfflineProbeRun({ handle });
      assert.equal(result.status, after ? 'CLEANUP_VERIFIED_SUCCESS' : 'RECOVERY_REQUIRED');
      assert.equal(result.consumed, 2);
      assert.deepEqual(await recoverOfflineProbeRun({ handle }), result);
    });
  }

  for (const empty of [false, true]) {
    test('H4-R6 ' + (empty ? 'empty terminal' : 'session resolution') + ' persistence failure retains credentials', async t => {
      const directory = testDirectory();
      const handle = create(directory);
      t.after(() => handle.close());
      const fixture = empty ? { inventory: new TestRunInventory(handle.runId) } : revokedSessionFixture(handle);
      fixture.inventory.sessionTokens.set('transient', 'synthetic-transient-credential');
      const restore = interruptWrite(directory, empty ? 'terminal' : 'session_resolution', empty ? undefined : 2, false, () => ({}), 'fail');
      try {
        if (empty) {
          const result = await fixture.inventory.executeCleanup({ adminClient: null, failClosed: false });
          assert.equal(result.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
          assert.equal(fixture.inventory.runLifecycleState, 'RESIDUAL_BLOCKED');
        } else await assert.rejects(fixture.verify(), /RECOVERY_PERSISTENCE_FAILED/);
        assert.equal(fixture.inventory.sessionTokens.get('transient'), 'synthetic-transient-credential');
      } finally { restore(); }
      handle.close();
      const restarted = reopen(directory, handle.runId);
      t.after(() => restarted.close());
      assert.equal(restarted.report().status, 'RECOVERY_REQUIRED');
    });
  }

  test('H4-R6 legacy empty cleanup remains idempotent', async () => {
    const inventory = new TestRunInventory('r6-empty-legacy');
    assert.equal((await inventory.executeCleanup({ adminClient: null })).status, 'CLEANUP_VERIFIED_SUCCESS');
    assert.equal((await inventory.executeCleanup({ adminClient: null })).status, 'CLEANUP_VERIFIED_SUCCESS');
  });

  for (const probeId of ['SESSION-02', 'SESSION-03', 'SESSION-06']) {
    test('H4-R6 ' + probeId + ' rejects invalid-token text as durable revocation evidence', async t => {
      const handle = create(testDirectory());
      t.after(() => handle.close());
      const fixture = revokedSessionFixture(handle, { probeId, rejection: {
        status: 401, json: { code: 'invalid_token', message: 'invalid token signature; session not found' }
      } });
      assert.equal((await fixture.verify()).passed, false);
      assert.equal(journalForRun(handle.runId).state.obligations.has(createHash('sha256').update('auth:session:' + ownerId).digest('hex')), true);
    });
  }

  test('H4-R6 logout 500 stays blocked while explicit 400 session absence remains supported', async t => {
    const handle = create(testDirectory());
    t.after(() => handle.close());
    const fixture = revokedSessionFixture(handle);
    const transport = createDeterministicFixtureTransport({ requestBudgetMode: mode, routes: [
      { method: 'POST', pathEquals: '/auth/v1/logout', status: 500, json: { code: 'session_not_found' } }
    ] });
    const admin = createHostedAdminClient({ runId: handle.runId, fetchFn: transport, serviceRoleKey: createMockProjectKey(projectRef, 'service_role') });
    const result = await fixture.inventory.executeCleanup({ adminClient: admin, failClosed: false });
    assert.equal(result.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
    assert.equal(handle.report().status, 'RECOVERY_REQUIRED');
    assert.equal(handle.report().consumed, 1);
    const knownDirectory = testDirectory();
    const known = create(knownDirectory);
    t.after(() => known.close());
    const valid = revokedSessionFixture(known);
    const confirmed = createDeterministicFixtureTransport({ requestBudgetMode: mode, routes: [
      { method: 'POST', pathEquals: '/auth/v1/logout', status: 400, json: { code: 'AuthSessionMissingError' } }
    ] });
    const confirmedAdmin = createHostedAdminClient({ runId: known.runId, fetchFn: confirmed, serviceRoleKey: createMockProjectKey(projectRef, 'service_role') });
    assert.equal((await valid.inventory.executeCleanup({ adminClient: confirmedAdmin })).status, 'CLEANUP_VERIFIED_SUCCESS');
    assert.equal(known.report().consumed, 1);
    known.close();
    const db = new DatabaseSync(journalPath(knownDirectory, known.runId));
    try {
      const payload = db.prepare('SELECT payload FROM journal').get().payload;
      const resolution = JSON.parse(payload)[4].find(event => event[0] === 'session_resolution');
      assert.equal(resolution[4].providerEvidence, 'AUTH_SESSION_MISSING');
    } finally { db.close(); }
    const tampered = testDirectory();
    copyFileSync(journalPath(knownDirectory, known.runId), journalPath(tampered, known.runId));
    rewrite(tampered, known.runId, envelope => {
      envelope[4].find(event => event[0] === 'session_resolution')[4].providerEvidence = null;
    });
    assert.throws(() => reopen(tampered, known.runId), /INVALID_RECOVERY_TRANSITION/,
      'replay refuses a status-only local logout absence claim');
  });

  test('H4-R7 generic local logout rejection statuses cannot become durable session absence', async t => {
    for (const status of [400, 401, 403, 404]) {
      const handle = create(testDirectory());
      t.after(() => handle.close());
      const fixture = revokedSessionFixture(handle);
      const transport = createDeterministicFixtureTransport({ requestBudgetMode: mode, routes: [
        { method: 'POST', pathEquals: '/auth/v1/logout', status, json: { code: 'permission_denied', message: 'request denied' } }
      ] });
      const admin = createHostedAdminClient({ runId: handle.runId, fetchFn: transport, serviceRoleKey: createMockProjectKey(projectRef, 'service_role') });
      const result = await fixture.inventory.executeCleanup({ adminClient: admin, failClosed: false });
      assert.equal(result.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES', `HTTP ${status} remains an unresolved logout`);
      assert.equal(journalForRun(handle.runId).state.obligations.size, 1, `HTTP ${status} cannot resolve the session obligation`);
      assert.equal(handle.report().status, 'RECOVERY_REQUIRED');
      assert.equal(handle.report().consumed, 1);
      assert.equal(journalForRun(handle.runId).state.attempts[0].httpStatus, status);
    }
  });

  test('H4-R6 generic cleanup resolution cannot bypass a rejected private session proof', async t => {
    const handle = create(testDirectory());
    t.after(() => handle.close());
    const fixture = revokedSessionFixture(handle);
    fixture.inventory.sessionMetadata.set(ownerId, { ...fixture.inventory.sessionMetadata.get(ownerId), userId: replacementId });
    const result = await fixture.inventory.executeCleanup({ adminClient: fixture.adminClient, failClosed: false });
    assert.equal(result.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
    assert.ok(result.residualResources.some(item => item.error === 'SESSION_REVOCATION_PROOF_UNAVAILABLE'));
    assert.equal(journalForRun(handle.runId).state.obligations.size, 1);
    assert.equal(handle.report().consumed, 1);
  });

  test('H4-R6 session proof replay rejects forgery, duplicates and later registration reuse', async t => {
    const directory = testDirectory();
    const handle = create(directory);
    t.after(() => handle.close());
    const fixture = revokedSessionFixture(handle);
    assert.equal((await fixture.verify()).passed, true);
    const repeated = await fixture.verify();
    assert.equal(repeated.passed, false, 'a fresh failed SESSION-01 read does not repeat or replace the prior proof');
    assert.equal(repeated.status, 0);
    assert.equal(handle.report().consumed, 3);
    assert.deepEqual(handle.report().attempts.map(attempt => attempt.httpStatus), [200, 401, 401]);
    assert.equal(journalForRun(handle.runId).state.obligations.size, 0);
    handle.close();
    for (const mutate of [
      events => { events.find(event => event[0] === 'session_resolution')[2] = 'a'.repeat(64); },
      events => { events.find(event => event[0] === 'session_resolution')[3] = [99]; },
      events => { events.find(event => event[0] === 'session_resolution')[4].requests[0].path = '/auth/v1/token'; },
      events => { events.find(event => event[0] === 'session_resolution')[4].prerequisites.push('raw-response-secret'); },
      events => { events.find(event => event[0] === 'session_resolution')[4].purpose = 'constructor'; },
      events => { events.find(event => event[0] === 'session_resolution')[4].purpose = 'toString'; },
      events => { events.find(event => event[0] === 'session_resolution').length = 4; },
      events => { events.push(events.find(event => event[0] === 'session_resolution')); }
    ]) {
      const alternate = testDirectory();
      copyFileSync(journalPath(directory, handle.runId), journalPath(alternate, handle.runId));
      rewrite(alternate, handle.runId, envelope => mutate(envelope[4]));
      assert.throws(() => reopen(alternate, handle.runId), /INVALID_RECOVERY_TRANSITION/);
    }
    const restarted = reopen(directory, handle.runId);
    t.after(() => restarted.close());
    assert.equal((await recoverOfflineProbeRun({ handle: restarted })).status, 'CLEANUP_VERIFIED_SUCCESS');
    const second = create(testDirectory());
    t.after(() => second.close());
    const next = revokedSessionFixture(second);
    await next.verify();
    next.inventory.registerSession(ownerId, next.token);
    assert.equal((await next.inventory.executeCleanup({ adminClient: next.adminClient, failClosed: false })).status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
    assert.equal(second.report().consumed, 2, 'Only the baseline and provider probe were dispatched; public marker reuse cannot consume a hidden logout');
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
