import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, realpathSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import {
  HARDCODED_TEMP_REF as projectRef, HARDCODED_REAL_REF, HARDCODED_TIO_WORLD_REF,
  TestRunInventory, createMockProjectKey, createCreationProof, createRunContext,
  createDeterministicFixtureTransport, createHostedAdminClient, createRunCreatedSeedDispatcher,
  reserveRunCreatedSeed, provisionRunCreatedSeed, runOfflineProbeSimulation, runHostedProbeRunner,
  provisionStorageProbeFixture
} from './hosted-probe-runner.mjs';
import { createOfflineRecoveryJournal, reopenOfflineRecoveryJournal, recoverOfflineProbeRun } from './offline-probe-recovery.mjs';
import { journalForRun } from './offline-recovery-journal.mjs';
import { getRunRequestBudget, executeRunBudgetRequest } from './run-request-budget.mjs';
import { getConditionalStorageFixtureProvider, snapshotRecoveryStorageFixture } from './conditional-storage-fixture.mjs';

const mode = 'recorded_zero_wait';
const sessionId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const objectId = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';
const foreignId = 'cccccccc-cccc-4ccc-accc-cccccccccccc';
const content = 'H5 synthetic fixture';
const file = fileURLToPath(import.meta.url);
const encode = data => Buffer.from(JSON.stringify(data)).toString('base64url');
function token(id) {
  const iat = Math.floor(Date.now() / 1000);
  return [encode({ alg: 'HS256' }), encode({ sub: id, session_id: sessionId, ref: projectRef,
    role: 'authenticated', aud: 'authenticated', iss: `https://${projectRef}.supabase.co/auth/v1`, iat, exp: iat + 300,
    amr_authenticated: true, amr: [{ method: 'password', timestamp: iat }] }), 'AA'].join('.');
}
function setup(t, directory = null) {
  directory ||= realpathSync.native(mkdtempSync(join(realpathSync.native(tmpdir()), 'task06i-h5-')));
  const handle = createOfflineRecoveryJournal({ directory, projectRef, mode });
  const inventory = new TestRunInventory(handle.runId);
  if (t) t.after(() => {
    handle.close();
    assert.ok(resolve(directory).startsWith(realpathSync.native(tmpdir()) + sep));
    rmSync(directory, { recursive: true, force: true });
  });
  return { directory, handle, inventory };
}
function fixture(base, controls = {}) {
  const { inventory, handle } = base;
  const plan = reserveRunCreatedSeed({ inventory, projectRef });
  const id = plan.userId;
  const jwt = token(id);
  const transport = createDeterministicFixtureTransport({ requestBudgetMode: mode,
    conditionalStorage: { projectRef, runId: handle.runId, objects: [] },
    initialState: { created: false, deleted: false, uploaded: false, storageDeleted: false, reset: false },
    routes: [
      { method: 'GET', pathEquals: '/auth/v1/admin/users/' + id, whenState: { created: false },
        status: controls.preexisting ? 200 : 404, json: controls.preexisting ? { id, email: plan.email } : { code: 'user_not_found' } },
      { method: 'POST', pathEquals: '/auth/v1/admin/users', setsState: { created: true },
        ...(controls.create || { status: 201, json: { id, email: plan.email } }) },
      { method: 'GET', pathEquals: '/auth/v1/admin/users/' + id, whenState: { created: true, deleted: false },
        ...(controls.verify || { status: 200, json: { id, email: plan.email } }) },
      { method: 'DELETE', pathEquals: '/auth/v1/admin/users/' + id, setsState: { deleted: true },
        ...(controls.deletion || { status: 200, json: {} }) },
      { method: 'GET', pathEquals: '/auth/v1/admin/users/' + id, whenState: { deleted: true },
        ...(controls.absence || { status: 404, json: { code: 'user_not_found' } }) },
      { method: 'POST', pathEquals: '/auth/v1/token', status: 200,
        json: { access_token: controls.tokenUser ? token(controls.tokenUser) : jwt, refresh_token: 'H5-synthetic-refresh',
          user: { id: controls.tokenUser || id, email: plan.email } } },
      { method: 'GET', pathEquals: '/auth/v1/user', whenState: { reset: false }, status: 200, json: { id } },
      { method: 'GET', pathEquals: '/auth/v1/user', whenState: { reset: true }, status: 401, json: { code: 'session_not_found' } },
      { method: 'PUT', pathEquals: '/auth/v1/admin/users/' + id, setsState: { reset: true }, status: 200, json: { id, email: plan.email } },
      { method: 'POST', pathEquals: '/auth/v1/logout', ...(controls.logout || { status: 204 }) },
      { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', whenState: { uploaded: false }, status: 404, json: { code: 'NoSuchKey' } },
      { method: 'POST', urlIncludes: '/storage/v1/object/', setsState: { uploaded: true }, status: 200, json: { Id: objectId } },
      { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', whenState: { uploaded: true, storageDeleted: false }, status: 200, text: content },
      { method: 'POST', pathEquals: '/rest/v1/rpc/task06i_lookup_storage_object_owner', status: 200,
        json: [{ id: objectId, bucket_id: 'task06i_probe_bucket', name: handle.runId + '/probe.txt', owner_id: controls.owner || id }] },
      { method: 'DELETE', urlIncludes: '/storage/v1/object/', setsState: { storageDeleted: true }, status: 200, json: {} },
      { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', whenState: { storageDeleted: true }, status: 400, json: { code: 'NoSuchKey', statusCode: '404' } }
    ] });
  const adminClient = createHostedAdminClient({ runId: handle.runId, fetchFn: transport,
    serviceRoleKey: createMockProjectKey(projectRef, 'service_role') });
  return { ...base, plan, transport, adminClient, jwt,
    provision: () => provisionRunCreatedSeed({ plan, inventory, adminClient }),
    storage: () => provisionStorageProbeFixture({ runId: handle.runId, seedUserId: id, userAccessToken: jwt,
      adminClient, inventory, fetchFn: transport, probeContent: content }),
    dispatcher: () => createRunCreatedSeedDispatcher({ inventory, fetchFn: transport, anonKey: createMockProjectKey(projectRef, 'anon'),
      serviceRoleKey: createMockProjectKey(projectRef, 'service_role') }) };
}
const budget = handle => getRunRequestBudget({ projectRef, runId: handle.runId });
const cleanup = f => f.inventory.executeCleanup({ adminClient: f.adminClient, failClosed: false });
function persisted(f) {
  f.handle.close();
  const db = new DatabaseSync(join(f.directory, f.handle.runId + '.sqlite'), { readOnly: true });
  try { return db.prepare('SELECT payload FROM journal').get().payload; } finally { db.close(); }
}

// Process-local SQLite fault injection; production APIs receive no fault callbacks.
function interrupt(directory, eventType, ordinal, after, witness, action = 'kill') {
  const original = DatabaseSync.prototype.prepare;
  DatabaseSync.prototype.prepare = function (...args) {
    const statement = original.apply(this, args);
    if (!args[0].startsWith('UPDATE journal SET payload')) return statement;
    return { run(...params) {
      const event = JSON.parse(params[0])[4].at(-1);
      if (event[0] !== eventType || (ordinal !== null && event[1] !== ordinal)) return statement.run(...params);
      if (action === 'fail') throw new Error('H5 injected persistence failure');
      if (after) statement.run(...params);
      writeFileSync(join(directory, 'witness.json'), JSON.stringify(witness()), { flush: true });
      process.kill(process.pid, 'SIGKILL');
      throw new Error('H5 process termination failed');
    } };
  };
  return () => { DatabaseSync.prototype.prepare = original; };
}
async function child(directory, type, rawOrdinal, after, stage, action) {
  const base = setup(null, directory);
  writeFileSync(join(directory, 'run-id'), base.handle.runId, { flush: true });
  let f;
  const witness = () => ({ calls: f?.transport.calls.length ?? 0,
    created: f?.transport.calls.some(c => c.method === 'POST' && c.pathname === '/auth/v1/admin/users') ?? false,
    deleted: f?.transport.calls.some(c => c.method === 'DELETE' && c.pathname.startsWith('/auth/v1/admin/users/')) ?? false,
    storage: f ? snapshotRecoveryStorageFixture(getConditionalStorageFixtureProvider(f.transport)).objects : [] });
  const restore = interrupt(directory, type, rawOrdinal === 'any' ? null : Number(rawOrdinal), after === 'after', witness, action);
  try {
    f = fixture(base);
    await f.provision();
    if (stage === 'storage') await f.storage();
    if (stage === 'auth' || stage === 'storage') {
      const dispatch = f.dispatcher();
      await dispatch({ id: 'HOOK-01' });
      await dispatch({ id: 'SESSION-01' });
    }
    const result = await cleanup(f);
    if (action === 'fail' && result.status !== 'CLEANUP_VERIFIED_SUCCESS') throw new Error('H5 expected cleanup persistence failure');
    throw new Error('H5 injector target missed');
  } catch (error) {
    if (action !== 'fail' || error.message === 'H5 injector target missed') throw error;
    writeFileSync(join(directory, 'witness.json'), JSON.stringify({ ...witness(), error: 'PERSISTENCE_FAILURE',
      privateState: f?.inventory.getSummary().seedLifecycle ?? 'NOT_ADMITTED' }), { flush: true });
    // A failed outcome write must still release its journal lease.
    base.handle.close();
    process.exitCode = 23;
  } finally { restore(); }
}
function restart(t, [type, ordinal, after, stage], action = 'kill') {
  const parent = realpathSync.native(tmpdir());
  const directory = realpathSync.native(mkdtempSync(join(parent, 'task06i-h5-')));
  const result = spawnSync(process.execPath, [file, '--seed-child', directory, type, String(ordinal), after, stage, action], { encoding: 'utf8', timeout: 20000 });
  assert.notEqual(result.status, 0, result.stderr);
  if (action === 'fail') assert.equal(result.status, 23, result.stderr);
  const witness = JSON.parse(readFileSync(join(directory, 'witness.json'), 'utf8'));
  const runId = readFileSync(join(directory, 'run-id'), 'utf8');
  const handle = reopenOfflineRecoveryJournal({ directory, projectRef, runId });
  t.after(() => { handle.close(); assert.ok(resolve(directory).startsWith(parent + sep)); rmSync(directory, { recursive: true, force: true }); });
  return { directory, handle, witness };
}

if (!process.argv.includes('--seed-child')) {
  test('H5 exact creation and durable absence reach terminal in five shared requests', async t => {
    const f = fixture(setup(t));
    assert.equal(f.handle.report().seeds[0].state, 'CREATION_PENDING');
    assert.equal(f.inventory.isClean(), false);
    await f.provision();
    assert.equal(f.handle.report().seeds[0].state, 'CREATION_VERIFIED');
    assert.equal(f.inventory.getUserOwnership(f.plan.userId), 'RUN_CREATED_VERIFIED');
    const result = await cleanup(f);
    assert.equal(result.status, 'CLEANUP_VERIFIED_SUCCESS', JSON.stringify(result));
    assert.equal(f.handle.report().seeds[0].state, 'CLEANUP_VERIFIED');
    assert.equal(f.handle.report().consumed, 5);
    assert.deepEqual(f.handle.report().attempts.map(a => a.kind), ['read', 'seed_create', 'read', 'auth_delete', 'read']);
    assert.equal(await cleanup(f).then(r => r.status), 'CLEANUP_VERIFIED_SUCCESS');
    const disk = persisted(f);
    assert.doesNotMatch(disk, /password|access_token|refresh_token|apikey|Bearer|H5-synthetic-refresh/);
    assert.doesNotMatch(disk, new RegExp(f.plan.email));
    assert.equal(f.transport.calls.length, 5);
  });
  test('H5 existing runner executes actual seed authentication, baseline and cleanup', async t => {
    const f = fixture(setup(t)); await f.provision();
    const result = await runOfflineProbeSimulation({ projectRef, inventory: f.inventory, adminClient: f.adminClient,
      offlineDispatcher: f.dispatcher(), testEmail: f.plan.email, selectedProbeIds: ['HOOK-01', 'SESSION-01'], timing: { mode } });
    assert.equal(result.status, 'COMPLETED', JSON.stringify(result));
    assert.equal(result.actualHostedRequests, 0);
    assert.equal(f.handle.report().status, 'CLEANUP_VERIFIED_SUCCESS');
    assert.equal(f.handle.report().consumed, 8);
    assert.equal(f.inventory.referencedUsers.has(f.plan.userId), false);
  });
  test('H5 disposable password reset preserves session proof without Option A restoration', async t => {
    const f = fixture(setup(t)); await f.provision();
    const result = await runOfflineProbeSimulation({ projectRef, inventory: f.inventory, adminClient: f.adminClient,
      offlineDispatcher: f.dispatcher(), testEmail: f.plan.email,
      selectedProbeIds: ['HOOK-01', 'SESSION-01', 'SESSION-02', 'SESSION-03'], timing: { mode } });
    assert.equal(result.status, 'COMPLETED', JSON.stringify(result));
    assert.equal(f.inventory.seedCredentialRestorations.length, 0);
    assert.equal(f.handle.report().status, 'CLEANUP_VERIFIED_SUCCESS');
    assert.equal(f.handle.report().consumed, 10);
  });
  test('H5 Storage owner binding, conditional delete, absence precede exact Auth deletion', async t => {
    const f = fixture(setup(t)); await f.provision(); await f.storage();
    const result = await runOfflineProbeSimulation({ projectRef, inventory: f.inventory, adminClient: f.adminClient,
      offlineDispatcher: f.dispatcher(), testEmail: f.plan.email, selectedProbeIds: ['HOOK-01', 'SESSION-01'], timing: { mode } });
    assert.equal(result.status, 'COMPLETED', JSON.stringify(result));
    assert.equal(f.handle.report().consumed, 15);
    const attempts = f.handle.report().attempts;
    assert.ok(attempts.findIndex(a => a.kind === 'storage_delete') < attempts.findIndex(a => a.kind === 'auth_delete'));
    assert.ok(attempts.findIndex(a => a.kind === 'storage_absence_read') < attempts.findIndex(a => a.kind === 'auth_delete'));
  });
  test('H5 duplicate, forged and foreign seed plans cannot dispatch', async t => {
    const f = fixture(setup(t));
    assert.throws(() => reserveRunCreatedSeed({ inventory: f.inventory, projectRef }), /SEED_ALREADY_ADMITTED/);
    const other = setup(t);
    for (const [plan, inventory] of [[{ ...f.plan }, f.inventory], [f.plan, other.inventory], [new Proxy(f.plan, {}), f.inventory]]) {
      await assert.rejects(provisionRunCreatedSeed({ plan, inventory, adminClient: f.adminClient }), /UNTRUSTED_SEED_PLAN/);
    }
    assert.equal(f.transport.calls.length, 0);
    await f.provision();
    await assert.rejects(f.provision(), /SEED_CREATION_ALREADY_ENTERED/);
    assert.equal(f.transport.calls.length, 3);
  });
  test('H5 descriptor-first admission executes no hostile accessor or prototype', t => {
    const f = setup(t); let executed = 0;
    const hostile = Object.defineProperty({}, 'inventory', { get() { executed++; return f.inventory; } });
    for (const value of [hostile, Object.create({ inventory: f.inventory, projectRef }),
      { inventory: f.inventory, projectRef, ownership: 'RUN_CREATED_VERIFIED' }]) {
      assert.throws(() => reserveRunCreatedSeed(value));
    }
    assert.equal(executed, 0); assert.equal(f.handle.report().seeds.length, 0);
  });
  for (const ref of [HARDCODED_REAL_REF, HARDCODED_TIO_WORLD_REF, 'foreign-project']) {
    test('H5 excluded project cannot admit seed: ' + ref, t => {
      const f = setup(t);
      assert.throws(() => reserveRunCreatedSeed({ inventory: f.inventory, projectRef: ref }), /SEED_PROJECT_BOUNDARY/);
      assert.equal(f.handle.report().consumed, 0);
      assert.equal(f.handle.report().seeds.length, 0);
    });
  }
  test('H5 pre-existing UUID is never adopted or deleted after pre-check collision', async t => {
    const f = fixture(setup(t), { preexisting: true });
    await assert.rejects(f.provision(), /SEED_PREEXISTENCE_OR_UNKNOWN/);
    const result = await cleanup(f);
    assert.equal(result.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
    assert.equal(f.transport.calls.length, 1);
    assert.equal(f.handle.report().seeds[0].state, 'CREATION_PENDING');
  });
  for (const [name, create] of [
    ['provider creation conflict', { status: 409, json: { code: 'email_exists' } }],
    ['wrong UUID', { status: 201, json: { id: foreignId, email: 'tio-test-foreign@proof.invalid' } }],
    ['missing identity', { status: 201, json: { user_metadata: { run_owned: true } } }],
    ['malformed JSON', { status: 201, text: '{broken' }],
    ['lost committed response', { throwError: { message: 'H5 simulated response lost' } }]
  ]) test('H5 ' + name + ' retains unknown creation and consumes dispatch', async t => {
    const f = fixture(setup(t), { create });
    await assert.rejects(f.provision());
    assert.equal((await cleanup(f)).status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
    assert.deepEqual(f.handle.report().residual.credentialDependent, [2]);
    assert.equal(f.handle.report().consumed, 2);
    assert.equal(f.transport.calls.some(c => c.method === 'DELETE'), false);
    assert.equal(f.inventory.isClean(), false);
  });
  test('H5 separate exact post-create UUID/email verification is mandatory', async t => {
    const f = fixture(setup(t), { verify: { status: 200, json: { id: foreignId, email: 'tio-test-foreign@proof.invalid' } } });
    await assert.rejects(f.provision(), /SEED_IDENTITY_VERIFICATION_FAILED/);
    assert.equal(f.handle.report().seeds[0].state, 'CREATION_INDETERMINATE');
    assert.equal((await cleanup(f)).status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
    assert.equal(f.transport.calls.length, 3);
  });
  test('H5 caller ownership labels and public creation proof cannot replace private provenance', async t => {
    const f = fixture(setup(t));
    const claim = { id: f.plan.userId, email: f.plan.email,
      creationProof: createCreationProof('provider_admin_create', { providerReturnedId: f.plan.userId }) };
    assert.throws(() => f.inventory.registerCreatedUser(claim), /UNTRUSTED_SEED_CREATION_PROOF/);
    await f.provision();
    assert.throws(() => f.inventory.registerCreatedUser(claim), /UNTRUSTED_SEED_CREATION_PROOF/);
    f.inventory.protectSeedIdentity({ id: f.plan.userId, email: f.plan.email });
    f.inventory.registerReferencedUser({ id: f.plan.userId, email: f.plan.email });
    assert.equal(f.inventory.referencedUsers.has(f.plan.userId), false);
    f.inventory.createdUsers.get(f.plan.userId).creationProof = claim.creationProof;
    assert.equal((await cleanup(f)).status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
    assert.equal(f.transport.calls.length, 3);
  });
  test('H5 Option A pre-existing seed remains protected from Option B assertions', async t => {
    const f = setup(t);
    f.inventory.protectSeedIdentity({ id: foreignId, email: 'tio-test-existing@proof.invalid' });
    f.inventory.registerCreatedUser({ id: foreignId, email: 'tio-test-existing@proof.invalid',
      creationProof: createCreationProof('provider_admin_create', { providerReturnedId: foreignId }) });
    const owned = fixture(f); await owned.provision();
    assert.equal((await cleanup(owned)).status, 'CLEANUP_VERIFIED_SUCCESS');
    assert.equal(f.inventory.isUserReferenced(foreignId), true);
    assert.equal(owned.transport.calls.some(c => c.method === 'DELETE' && c.pathname.endsWith(foreignId)), false);
  });
  test('H5 private session obligation survives caller clearing mutable session tracking', async t => {
    const f = fixture(setup(t)); await f.provision();
    await f.dispatcher()({ id: 'HOOK-01' });
    f.inventory.trackedSessions.clear();
    f.inventory.revokedSessions.add(sessionId);
    const result = await cleanup(f);
    assert.equal(result.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
    assert.equal(f.transport.calls.some(c => c.method === 'DELETE'), false);
    assert.ok(f.handle.report().residual.volatileKinds.includes('auth'));
  });
  test('H5 failed session revocation blocks Auth deletion despite successful authentication', async t => {
    const f = fixture(setup(t), { logout: { status: 401, json: { message: 'session_not_found prose only' } } });
    await f.provision(); await f.dispatcher()({ id: 'HOOK-01' });
    assert.equal((await cleanup(f)).status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
    assert.equal(f.transport.calls.some(c => c.method === 'DELETE'), false);
    assert.equal(f.handle.report().status, 'RECOVERY_REQUIRED');
  });
  test('H5 foreign mutable context cannot target another user or session', async t => {
    const f = fixture(setup(t)); await f.provision();
    const ctx = createRunContext({ runId: f.handle.runId, testEmail: f.plan.email, seedEmail: f.plan.email, seedUserId: f.plan.userId });
    ctx.activeUserId = foreignId; ctx.activeAccessToken = token(foreignId); ctx.activeSessionId = sessionId;
    const dispatcher = createRunCreatedSeedDispatcher({ inventory: f.inventory, runContext: ctx,
      fetchFn: f.transport, anonKey: createMockProjectKey(projectRef, 'anon') });
    await assert.rejects(dispatcher({ id: 'SESSION-02' }), /SEED_CONTEXT_IDENTITY_MISMATCH/);
    assert.equal(f.transport.calls.length, 3);
  });
  test('H5 dispatcher is bound to exact inventory even for a sibling with the same runId', async t => {
    const f = fixture(setup(t)); await f.provision();
    const dispatcher = f.dispatcher();
    const sibling = new TestRunInventory(f.handle.runId);
    await assert.rejects(dispatcher({ id: 'HOOK-01', testUser: 'tio-test-foreign@proof.invalid' }, { inventory: sibling }), /SEED_INVENTORY_CAPABILITY_MISMATCH/);
    await assert.rejects(dispatcher({ id: 'HOOK-01' }, { testUser: 'tio-test-foreign@proof.invalid' }), /SEED_CONTEXT_IDENTITY_MISMATCH/);
    assert.equal(f.transport.calls.length, 3);
    assert.equal(Object.isFrozen(dispatcher), true);
  });
  test('H5 rejected runner identity leaves inventory, journal and budget unchanged', async t => {
    const f = fixture(setup(t)); await f.provision();
    const dispatcher = f.dispatcher();
    const before = { inventory: structuredClone(f.inventory), journal: f.handle.report(), budget: budget(f.handle).report() };
    await assert.rejects(runOfflineProbeSimulation({ projectRef, inventory: f.inventory, adminClient: f.adminClient,
      offlineDispatcher: dispatcher, testEmail: f.plan.email, seedUserId: foreignId,
      selectedProbeIds: ['HOOK-01'], timing: { mode } }), /SEED_RUN_IDENTITY_MISMATCH/);
    assert.deepEqual({ inventory: structuredClone(f.inventory), journal: f.handle.report(), budget: budget(f.handle).report() }, before);
    assert.equal(f.transport.calls.length, 3);
    assert.equal((await cleanup(f)).status, 'CLEANUP_VERIFIED_SUCCESS');
  });
  test('H5 foreign authentication response cannot make a seed effect resolvable', async t => {
    const f = fixture(setup(t), { tokenUser: foreignId }); await f.provision();
    await f.dispatcher()({ id: 'HOOK-01' });
    assert.equal((await cleanup(f)).status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
    assert.equal(f.transport.calls.some(c => c.method === 'DELETE'), false);
    assert.ok(f.handle.report().residual.credentialDependent.includes(4));
  });
  test('H5 replacement Storage object survives and blocks Auth deletion', async t => {
    const f = fixture(setup(t)); await f.provision(); await f.storage();
    const provider = getConditionalStorageFixtureProvider(f.transport);
    provider.putObject({ projectRef, runId: f.handle.runId, bucket: 'task06i_probe_bucket', path: f.handle.runId + '/probe.txt', objectId: foreignId, ownerId: f.plan.userId });
    assert.equal((await cleanup(f)).status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
    assert.equal(snapshotRecoveryStorageFixture(provider).objects[0].objectId, foreignId);
    assert.equal(f.transport.calls.some(c => c.method === 'DELETE' && c.pathname.includes('/admin/users/')), false);
  });
  test('H5 recorded transport diagnostics redact ephemeral creation and authentication credentials', async t => {
    const f = fixture(setup(t)); await f.provision(); await f.dispatcher()({ id: 'HOOK-01' });
    const creates = f.transport.calls.filter(c => c.method === 'POST');
    assert.equal(creates.length, 2);
    for (const call of creates) {
      assert.equal(call.bodyJson.password, '[REDACTED]');
      assert.doesNotMatch(JSON.stringify(call.headers), /mock_sig|Bearer/);
    }
    await cleanup(f);
    const disk = persisted(f);
    assert.doesNotMatch(disk, /H5-synthetic-refresh|mock_sig|password|access_token|refresh_token/);
  });
  for (const [name, controls] of [
    ['DELETE alone', { absence: { status: 200, json: { id: foreignId } } }],
    ['indeterminate DELETE', { deletion: { throwError: 'H5 DELETE response lost' } }],
    ['ownership mismatch', { owner: foreignId }]
  ]) test('H5 ' + name + ' cannot establish verified seed cleanup', async t => {
    const f = fixture(setup(t), controls); await f.provision();
    if (controls.owner) await assert.rejects(f.storage());
    assert.equal((await cleanup(f)).status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
    assert.equal(f.handle.report().status, 'RECOVERY_REQUIRED');
    if (controls.owner) assert.equal(f.transport.calls.some(c => c.method === 'DELETE' && c.pathname.includes('/admin/users/')), false);
  });
  test('H5 LIVE remains blocked for the seed dispatcher and protected projects', async t => {
    const f = fixture(setup(t)); await f.provision();
    await assert.rejects(runHostedProbeRunner({ projectRef, inventory: f.inventory, adminClient: f.adminClient,
      offlineDispatcher: f.dispatcher(), testEmail: f.plan.email, argv: ['--live'], env: { TASK06I_HOSTED_PROBE_AUTHORIZED: 'true' } }));
    assert.equal(f.transport.calls.length, 3);
  });
  test('H5 budget exhaustion provides no cleanup reserve or refunds', async t => {
    const f = fixture(setup(t)); await f.provision();
    for (let i = 3; i < 25; i++) await executeRunBudgetRequest(budget(f.handle), { category: 'probe', kind: 'read' }, () => ({ ok: true, status: 200 }));
    assert.equal((await cleanup(f)).status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
    assert.equal(f.handle.report().consumed, 25);
    assert.equal(f.transport.calls.length, 3);
    assert.equal(budget(f.handle).report().reservedCleanupCapacity, 0);
  });
  test('H5 insufficient budget rejects intent without mutation', async t => {
    const f = setup(t);
    for (let i = 0; i < 21; i++) await executeRunBudgetRequest(budget(f.handle), { category: 'probe', kind: 'read' }, () => ({ ok: true, status: 200 }));
    assert.throws(() => reserveRunCreatedSeed({ inventory: f.inventory, projectRef }), /SEED_REQUEST_BUDGET_INSUFFICIENT/);
    assert.equal(f.handle.report().seeds.length, 0); assert.equal(f.handle.report().consumed, 21);
  });
  for (const [name, fault, expected] of [
    ['before creation admission', ['seed_intent', 'any', 'before', 'none'], { consumed: 0, seeds: 0, created: false }],
    ['after durable intent before dispatch', ['seed_intent', 'any', 'after', 'none'], { consumed: 0, seeds: 1, created: false }],
    ['after creation dispatch marker', ['dispatch', 2, 'after', 'none'], { consumed: 2, seeds: 1, created: false }],
    ['after simulated commit before settlement', ['outcome', 2, 'before', 'none'], { consumed: 2, seeds: 1, created: true }],
    ['before ownership persistence', ['seed_verified', 3, 'before', 'none'], { consumed: 3, seeds: 1, created: true }],
    ['after ownership persistence', ['seed_verified', 3, 'after', 'none'], { consumed: 3, seeds: 1, created: true }],
    ['during seed authentication', ['outcome', 4, 'before', 'auth'], { consumed: 4, seeds: 1, created: true }],
    ['during dependent Storage cleanup', ['outcome', 11, 'before', 'storage'], { consumed: 11, seeds: 1, created: true }],
    ['during session revocation', ['outcome', 6, 'before', 'auth'], { consumed: 6, seeds: 1, created: true }],
    ['during exact Auth deletion', ['outcome', 7, 'before', 'auth'], { consumed: 7, seeds: 1, created: true }],
    ['before durable absence resolution', ['seed_absence', 8, 'before', 'auth'], { consumed: 8, seeds: 1, created: true }],
    ['before terminal completion', ['terminal', 'any', 'before', 'auth'], { consumed: 8, seeds: 1, created: true }],
    ['after terminal completion', ['terminal', 'any', 'after', 'auth'], { consumed: 8, seeds: 1, created: true }]
  ]) test('H5 real process termination ' + name, async t => {
    const { handle, witness } = restart(t, fault);
    const report = handle.report();
    assert.equal(report.consumed, expected.consumed);
    assert.equal(report.seeds.length, expected.seeds);
    assert.equal(witness.created, expected.created);
    const recovered = await recoverOfflineProbeRun({ handle });
    if (expected.seeds && !['before terminal completion', 'after terminal completion'].includes(name)) {
      assert.equal(recovered.status, 'RECOVERY_REQUIRED');
      if (name !== 'during dependent Storage cleanup') assert.equal(recovered.reason, 'TRANSIENT_AUTH_CREDENTIALS_OR_PROOF_UNAVAILABLE');
    } else assert.equal(recovered.status, 'CLEANUP_VERIFIED_SUCCESS');
    if (name === 'after ownership persistence') assert.equal(report.seeds[0].state, 'CREATION_VERIFIED');
    if (name === 'during dependent Storage cleanup') assert.equal(witness.storage.length, 0);
    assert.equal(handle.report().consumed, expected.consumed);
    assert.deepEqual(await recoverOfflineProbeRun({ handle }), recovered);
  });
  for (const fault of [
    ['seed_intent', 'any', 'before', 'none'], ['outcome', 2, 'before', 'none'],
    ['seed_verified', 3, 'before', 'none'], ['seed_absence', 8, 'before', 'auth'], ['terminal', 'any', 'before', 'auth']
  ]) test('H5 persistence failure ' + fault[0] + ' never reports false terminal success', t => {
    const { handle, witness } = restart(t, fault, 'fail');
    assert.equal(handle.report().status, 'RECOVERY_REQUIRED');
    assert.equal(witness.error, 'PERSISTENCE_FAILURE');
    if (fault[0] === 'seed_intent') { assert.equal(witness.calls, 0); assert.equal(handle.report().seeds.length, 0); }
    if (fault[0] === 'outcome') assert.equal(handle.report().attempts[1].outcome, 'pending');
  });
  test('H5 capacity policy rejects seed intent while preserving recovery headroom', t => {
    const f = setup(t);
    for (let i = 0; i < 512; i++) {
      try { f.inventory.registerTableRow('h5_capacity', 'row-' + i); } catch (error) { assert.equal(error.code, 'RECOVERY_CAPACITY_EXCEEDED'); break; }
    }
    assert.throws(() => reserveRunCreatedSeed({ inventory: f.inventory, projectRef }), /RECOVERY_CAPACITY_EXCEEDED/);
    assert.equal(f.handle.report().seeds.length, 0);
    assert.equal(f.handle.report().consumed, 0);
  });
  test('H5 forged and duplicate seed resolution replay is rejected', async t => {
    for (const edit of [
      events => { const e = events.find(e => e[0] === 'seed_verified'); e[2] = '0'.repeat(64); },
      events => { const e = events.find(e => e[0] === 'seed_verified'); e[4] = [1, 2, 2]; },
      events => { events.push([...events.find(e => e[0] === 'seed_verified')]); },
      events => { events.find(e => e[0] === 'seed_intent')[3] = foreignId; }
    ]) {
      const f = fixture(setup(t)); await f.provision(); f.handle.close();
      const db = new DatabaseSync(join(f.directory, f.handle.runId + '.sqlite'));
      try {
        const envelope = JSON.parse(db.prepare('SELECT payload FROM journal').get().payload);
        edit(envelope[4]); const payload = JSON.stringify(envelope);
        db.prepare('UPDATE journal SET payload=?,digest=?').run(payload, createHash('sha256').update(payload).digest('hex'));
      } finally { db.close(); }
      assert.throws(() => reopenOfflineRecoveryJournal({ directory: f.directory, projectRef, runId: f.handle.runId }), /INVALID_RECOVERY_TRANSITION/);
    }
  });
}
else await child(...process.argv.slice(process.argv.indexOf('--seed-child') + 1));
