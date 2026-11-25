import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TestRunInventory, createHostedAdminClient, createMockProjectKey,
  createDeterministicFixtureTransport, provisionStorageProbeFixture,
  createCreationProof, createOfflineBarrier, HARDCODED_TEMP_REF,
  STORAGE_PROBE_BUCKET, STORAGE_LIFECYCLE_STATE
} from './hosted-probe-runner.mjs';
import { getConditionalStorageFixtureProvider } from './conditional-storage-fixture.mjs';

const OWNER = '11111111-1111-4111-a111-111111111114';
const OTHER_OWNER = '22222222-2222-4222-a222-222222222114';
const OBJECT = '33333333-3333-4333-a333-333333333114';
const REPLACEMENT = '44444444-4444-4444-a444-444444444114';
const CREATED_USER = '55555555-5555-4555-a555-555555555114';
const anonKey = createMockProjectKey(HARDCODED_TEMP_REF, 'anon');
const serviceRoleKey = createMockProjectKey(HARDCODED_TEMP_REF, 'service_role');
const content = 'r14 deterministic atomic Storage fixture\n';
let sequence = 0;
function jwt() {
  const now = Math.floor(Date.now() / 1000);
  const claims = { sub: OWNER, session_id: 'r14-fixture-session', iss: `https://${HARDCODED_TEMP_REF}.supabase.co/auth/v1`, aud: 'authenticated', iat: now, exp: now + 300, amr_authenticated: 'true', amr: [{ method: 'password', timestamp: now }] };
  return [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify(claims)).toString('base64url'), Buffer.from('offline_signature').toString('base64url')].join('.');
}

// Every scenario performs the actual upload and metadata verification. The same
// registered provider Map observes that upload, fixture replacement and cleanup.
async function provision(label, { responseMode = 'normal', capability = true, deleteBarrier = null, unknownUploadIdentity = false, createdUser = false } = {}) {
  const runId = `r14-atomic-${label}-${++sequence}`;
  const path = `${runId}/probe.txt`;
  const inventory = new TestRunInventory(runId);
  if (createdUser) inventory.registerCreatedUser({ id: CREATED_USER, email: 'created-r14@proof.invalid', creationProof: createCreationProof('before_after_check') });
  const transport = createDeterministicFixtureTransport({
    requestBudgetMode: 'recorded_zero_wait',
    ...(capability ? { conditionalStorage: { projectRef: HARDCODED_TEMP_REF, runId, objects: [], responseMode } } : {}),
    initialState: { uploaded: false, deleted: false, userDeleted: false },
    routes: [
      { method: 'GET', pathEquals: '/auth/v1/user', status: 200, json: { id: OWNER } },
      { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', whenState: { uploaded: false }, status: 404, json: { code: 'NoSuchKey' } },
      { method: 'POST', urlIncludes: '/storage/v1/object/', setsState: { uploaded: true }, status: 200, json: unknownUploadIdentity ? {} : { Id: OBJECT } },
      { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', whenState: { uploaded: true, deleted: false }, status: 200, text: content },
      { method: 'POST', urlIncludes: '/rest/v1/rpc/task06i_lookup_storage_object_owner', status: 200, json: [{ id: OBJECT, bucket_id: STORAGE_PROBE_BUCKET, name: path, owner_id: OWNER }] },
      { method: 'DELETE', urlIncludes: '/storage/v1/object/', ...(deleteBarrier ? { waitForBarrier: deleteBarrier } : {}), setsState: { deleted: true }, status: 200, json: {} },
      { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', whenState: { deleted: true }, status: 404, json: { code: 'NoSuchKey' } },
      { method: 'DELETE', urlIncludes: '/auth/v1/admin/users/', setsState: { userDeleted: true }, status: 200, json: {} },
      { method: 'GET', urlIncludes: '/auth/v1/admin/users/', whenState: { userDeleted: true }, status: 404, json: { code: 'user_not_found' } }
    ]
  });
  const adminClient = createHostedAdminClient({ runId, anonKey, serviceRoleKey, fetchFn: transport });
  await provisionStorageProbeFixture({ runId, seedUserId: OWNER, userAccessToken: jwt(), anonKey, adminClient, inventory, fetchFn: transport, probeContent: content });
  const provider = getConditionalStorageFixtureProvider(transport);
  const expected = { projectRef: HARDCODED_TEMP_REF, runId, bucket: STORAGE_PROBE_BUCKET, path, objectId: OBJECT, ownerId: OWNER };
  if (provider && !unknownUploadIdentity) assert.deepEqual({ ...provider.getObject({ bucket: STORAGE_PROBE_BUCKET, path }) }, expected, 'actual provisioning populates provider current identity');
  return { runId, path, expected, provider, inventory, adminClient, transport };
}
const cleanup = f => f.inventory.executeCleanup({ adminClient: f.adminClient, failClosed: false });
const storageDeletes = f => f.transport.calls.filter(c => c.method === 'DELETE' && c.pathname.startsWith('/storage/'));
const userDeletes = f => f.transport.calls.filter(c => c.method === 'DELETE' && c.pathname.startsWith('/auth/'));
function storageResidual(report) {
  return report.residualResources.find(resource => resource.type === 'storage_object');
}

test('R14 atomic Storage: matching current identity deletes once, independently verifies absence and retains terminal evidence', async () => {
  const f = await provision('matching', { createdUser: true });
  const report = await cleanup(f);
  assert.equal(report.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(report.storageObjectsDeleted, 1);
  assert.equal(report.usersDeleted, 1);
  assert.equal(f.provider.getSnapshot().objects.length, 0);
  const deletion = f.transport.calls.findIndex(c => c.method === 'DELETE' && c.pathname.startsWith('/storage/'));
  const verification = f.transport.calls.findIndex((c, index) => index > deletion && c.method === 'GET' && c.pathname.startsWith('/storage/'));
  const userDeletion = f.transport.calls.findIndex(c => c.method === 'DELETE' && c.pathname.startsWith('/auth/'));
  assert.ok(deletion >= 0 && verification > deletion && userDeletion > verification, 'Storage absence verified before Auth user deletion');
  const evidence = f.inventory.getStorageFixture(STORAGE_PROBE_BUCKET, f.path).conditionalDeletionEvidence;
  assert.equal(evidence.status, 'EXPECTED_OBJECT_DELETED');
  assert.deepEqual({ ...evidence.expected }, f.expected);
  const count = f.transport.calls.filter(c => c.pathname.startsWith('/storage/')).length;
  const repeated = await cleanup(f);
  assert.equal(repeated.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(f.transport.calls.filter(c => c.pathname.startsWith('/storage/')).length, count);
  assert.deepEqual(f.inventory.getStorageFixture(STORAGE_PROBE_BUCKET, f.path).conditionalDeletionEvidence, evidence);
  assert.equal(storageDeletes(f).length, 1);
});

for (const [label, ownerId, objectId, status] of [
  ['different-id', OWNER, REPLACEMENT, 'OBJECT_ID_MISMATCH'],
  ['different-owner', OTHER_OWNER, OBJECT, 'OWNER_MISMATCH'],
  ['different-owner-and-id', OTHER_OWNER, REPLACEMENT, 'OWNER_MISMATCH'],
  ['lookup-then-replacement', OWNER, REPLACEMENT, 'OBJECT_ID_MISMATCH']
]) test(`R14 atomic Storage: ${label} remains untouched across repeated cleanup and blocks Auth deletion`, async () => {
  const f = await provision(label, { createdUser: true });
  if (label === 'lookup-then-replacement') {
    const lookup = await f.adminClient.getStorageObjectOwnership(STORAGE_PROBE_BUCKET, f.path);
    assert.equal(lookup.found, true);
    assert.equal(lookup.data.id, OBJECT);
  }
  const replacement = { ...f.expected, objectId, ownerId };
  f.provider.putObject(replacement);
  for (let attempt = 0; attempt < 2; attempt++) {
    const report = await cleanup(f);
    assert.equal(report.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
    assert.equal(report.storageObjectsDeleted, 0);
    assert.equal(report.usersDeleted, 0);
    assert.equal(storageResidual(report).conditionalDeletion.status, status);
    assert.deepEqual({ ...storageResidual(report).conditionalDeletion.expected }, f.expected);
    assert.deepEqual({ ...storageResidual(report).conditionalDeletion.current }, replacement);
    assert.deepEqual({ ...f.provider.getObject({ bucket: STORAGE_PROBE_BUCKET, path: f.path }) }, replacement);
    assert.equal(userDeletes(f).length, 0);
  }
  assert.ok(f.provider.getSnapshot().attempts.every(attempt => attempt.current.objectId === objectId));
});

test('R14 atomic Storage: unavailable capability makes no path-only DELETE and preserves obligation', async () => {
  const f = await provision('unavailable', { capability: false, createdUser: true });
  const report = await cleanup(f);
  assert.equal(report.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.equal(storageResidual(report).conditionalDeletion.status, 'CONDITIONAL_DELETE_UNAVAILABLE');
  assert.equal(storageDeletes(f).length, 0);
  assert.equal(userDeletes(f).length, 0);
});

for (const responseMode of ['lost_response', 'indeterminate', 'malformed']) test(`R14 atomic Storage: ${responseMode} retains structured recovery evidence`, async () => {
  const f = await provision(responseMode, { responseMode, createdUser: true });
  const report = await cleanup(f);
  assert.equal(report.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.equal(report.storageObjectsDeleted, 0);
  assert.equal(userDeletes(f).length, 0);
  assert.match(storageResidual(report).conditionalDeletion.status, /CONDITIONAL_DELETE_(INDETERMINATE|MALFORMED)/);
  assert.deepEqual({ ...storageResidual(report).conditionalDeletion.expected }, f.expected);
  assert.equal(f.provider.getSnapshot().objects.length, responseMode === 'lost_response' ? 0 : 1);
  assert.equal(f.inventory.isClean(), false);
});

test('R14 atomic Storage: malformed committed upload identity remains unknown and cannot be deleted', async () => {
  const f = await provision('unknown-upload', { unknownUploadIdentity: true, createdUser: true });
  const state = f.provider.getObjectState({ bucket: STORAGE_PROBE_BUCKET, path: f.path });
  assert.equal(state.indeterminate, true);
  const report = await cleanup(f);
  assert.equal(report.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.equal(storageResidual(report).conditionalDeletion.status, 'CONDITIONAL_DELETE_INDETERMINATE');
  assert.equal(userDeletes(f).length, 0);
  assert.equal(report.storageObjectsDeleted, 0);
});

test('R14 atomic Storage: independently absent original receives authoritative absence plus follow-up GET', async () => {
  const f = await provision('already-absent');
  f.provider.removeFixtureObject({ bucket: STORAGE_PROBE_BUCKET, path: f.path });
  const report = await cleanup(f);
  assert.equal(report.status, 'CLEANUP_VERIFIED_SUCCESS');
  const evidence = f.inventory.getStorageFixture(STORAGE_PROBE_BUCKET, f.path).conditionalDeletionEvidence;
  assert.equal(evidence.status, 'EXPECTED_OBJECT_ABSENT');
  assert.equal(evidence.authoritativeAbsent, true);
  assert.equal(evidence.deleted, false);
  assert.equal(f.transport.calls.at(-1).method, 'GET');
});

test('R14 atomic Storage: replacement arriving during delayed DELETE cannot be hidden by stale absence route', async () => {
  const barrier = createOfflineBarrier('r14-delete-delay');
  const f = await provision('delayed-replacement', { deleteBarrier: barrier, createdUser: true });
  const pending = cleanup(f);
  await barrier.waitForArrivals(1);
  const replacement = { ...f.expected, objectId: REPLACEMENT };
  f.provider.putObject(replacement);
  barrier.release();
  const report = await pending;
  assert.equal(report.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.equal(report.storageObjectsDeleted, 0);
  assert.equal(userDeletes(f).length, 0);
  assert.deepEqual({ ...f.provider.getObject({ bucket: STORAGE_PROBE_BUCKET, path: f.path }) }, replacement);
  assert.equal(f.inventory.getStorageFixture(STORAGE_PROBE_BUCKET, f.path).lifecycleState, STORAGE_LIFECYCLE_STATE.RESIDUAL_BLOCKED);
  const repeated = await cleanup(f);
  assert.equal(repeated.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.deepEqual({ ...f.provider.getObject({ bucket: STORAGE_PROBE_BUCKET, path: f.path }) }, replacement);
});
