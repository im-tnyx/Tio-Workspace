import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TestRunInventory, createHostedAdminClient, createMockProjectKey,
  createDeterministicFixtureTransport, provisionStorageProbeFixture,
  createCreationProof, createOfflineBarrier, HARDCODED_TEMP_REF,
  STORAGE_PROBE_BUCKET, STORAGE_LIFECYCLE_STATE, observeAuthResponse, observeAndTrackSessionTokens, parseAndValidateJwt
} from './hosted-probe-runner.mjs';
import { getConditionalStorageFixtureProvider, extractOfflineStorageObjectId, observeConditionalStorageUpload } from './conditional-storage-fixture.mjs';

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
async function provision(label, { responseMode = 'normal', capability = true, deleteBarrier = null, unknownUploadIdentity = false, uploadBody = undefined, metadataRow = undefined, expectedError = null, createdUser = false } = {}) {
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
      { method: 'POST', urlIncludes: '/storage/v1/object/', setsState: { uploaded: true }, status: 200, json: uploadBody !== undefined ? uploadBody : unknownUploadIdentity ? {} : { Id: OBJECT } },
      { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', whenState: { uploaded: true, deleted: false }, status: 200, text: content },
      { method: 'POST', urlIncludes: '/rest/v1/rpc/task06i_lookup_storage_object_owner', status: 200, json: metadataRow !== undefined ? [metadataRow] : [{ id: OBJECT, bucket_id: STORAGE_PROBE_BUCKET, name: path, owner_id: OWNER }] },
      { method: 'DELETE', urlIncludes: '/storage/v1/object/', ...(deleteBarrier ? { waitForBarrier: deleteBarrier } : {}), setsState: { deleted: true }, status: 200, json: {} },
      { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', whenState: { deleted: true }, status: 404, json: { code: 'NoSuchKey' } },
      { method: 'DELETE', urlIncludes: '/auth/v1/admin/users/', setsState: { userDeleted: true }, status: 200, json: {} },
      { method: 'GET', urlIncludes: '/auth/v1/admin/users/', whenState: { userDeleted: true }, status: 404, json: { code: 'user_not_found' } }
    ]
  });
  const adminClient = createHostedAdminClient({ runId, anonKey, serviceRoleKey, fetchFn: transport });
  const provisioning = provisionStorageProbeFixture({ runId, seedUserId: OWNER, userAccessToken: jwt(), anonKey, adminClient, inventory, fetchFn: transport, probeContent: content });
  if (expectedError) await assert.rejects(provisioning, expectedError);
  else if (unknownUploadIdentity || uploadBody !== undefined) await assert.rejects(provisioning, /STORAGE_UPLOAD_IDENTITY_INDETERMINATE/);
  else await provisioning;
  const provider = getConditionalStorageFixtureProvider(transport);
  const expected = { projectRef: HARDCODED_TEMP_REF, runId, bucket: STORAGE_PROBE_BUCKET, path, objectId: OBJECT, ownerId: OWNER };
  if (provider && !unknownUploadIdentity && uploadBody === undefined) assert.deepEqual({ ...provider.getObject({ bucket: STORAGE_PROBE_BUCKET, path }) }, expected, 'actual provisioning populates provider current identity');
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
  assert.equal(f.inventory.getStorageFixture(STORAGE_PROBE_BUCKET, f.path).status, 'CLEANUP_QUARANTINED');
  assert.equal(storageDeletes(f).length, 0);
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


function tokenWithPayload(payload, raw = false) {
  const header = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url');
  const body = Buffer.from(raw ? payload : JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.b2ZmbGluZQ`;
}
async function postObserved(f, token, body = { Id: OBJECT }) {
  // A separate actual deterministic transport keeps each invalid response isolated.
  const transport = createDeterministicFixtureTransport({
    conditionalStorage: { projectRef: HARDCODED_TEMP_REF, runId: f.runId },
    routes: [{ method: 'POST', status: 201, json: body }]
  });
  const response = await transport(`https://${HARDCODED_TEMP_REF}.supabase.co/storage/v1/object/${STORAGE_PROBE_BUCKET}/${f.path}`, {
    method: 'POST', headers: { authorization: `Bearer ${token}` }
  });
  return { response, provider: getConditionalStorageFixtureProvider(transport) };
}

for (const [label, token] of [
  ['missing-sub', tokenWithPayload({})], ['null-sub', tokenWithPayload({ sub: null })],
  ['numeric-sub', tokenWithPayload({ sub: 1 })], ['object-sub', tokenWithPayload({ sub: {} })],
  ['array-sub', tokenWithPayload({ sub: [] })], ['empty-sub', tokenWithPayload({ sub: '' })],
  ['non-uuid-sub', tokenWithPayload({ sub: 'synthetic-invalid' })],
  ['malformed-payload', tokenWithPayload('{', true)], ['null-payload', tokenWithPayload(null)],
  ['array-payload', tokenWithPayload([])], ['string-payload', tokenWithPayload('subject')],
  ['bad-parts', 'not-a-jwt'], ['empty-signature', tokenWithPayload({ sub: OWNER }).replace(/[^.]+$/, '')],
  ['bad-base64url', 'e30.*.c2ln']
]) test(`R15 upload identity: ${label} preserves HTTP success and indeterminate state`, async () => {
  const f = { runId: `r15-jwt-${label}`, path: `r15-jwt-${label}/probe.txt` };
  const { response, provider } = await postObserved(f, token);
  assert.equal(response.status, 201);
  assert.equal(response.ok, true);
  assert.deepEqual(await response.json(), { Id: OBJECT });
  assert.equal(response.conditionalUploadIdentity.status, 'UPLOAD_IDENTITY_INDETERMINATE');
  assert.equal(provider.getObjectState({ bucket: STORAGE_PROBE_BUCKET, path: f.path }).indeterminate, true);
  assert.equal(provider.getSnapshot().objects.length, 0);
  assert.equal(provider.getSnapshot().attempts.length, 0);
});

for (const [label, body] of [
  ['missing-id', {}], ['invalid-id', { Id: 'invalid' }], ['numeric-id', { Id: 12 }],
  ['object-id', { Id: {} }], ['conflicting-ids', { Id: OBJECT, id: REPLACEMENT }],
  ['invalid-alias', { Id: OBJECT, id: null }]
]) test(`R15 upload identity: ${label} retains committed residual and blocks both deletions`, async () => {
  const f = await provision(`r15-${label}`, { createdUser: true, uploadBody: body });
  const fixture = f.inventory.getStorageFixture(STORAGE_PROBE_BUCKET, f.path);
  assert.equal(fixture.hasCommittedUpload, true);
  assert.equal(fixture.deletionEligible, false);
  assert.equal(fixture.verifiedOwnerId, null);
  assert.equal(f.provider.getObjectState({ bucket: STORAGE_PROBE_BUCKET, path: f.path }).indeterminate, true);
  assert.equal(f.provider.getSnapshot().objects.length, 0);
  for (let attempt = 0; attempt < 2; attempt++) {
    const report = await cleanup(f);
    assert.equal(report.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
    assert.ok(storageResidual(report));
    assert.equal(report.storageObjectsDeleted, 0);
    assert.equal(report.usersDeleted, 0);
    assert.equal(storageDeletes(f).length, 0);
    assert.equal(userDeletes(f).length, 0);
    assert.equal(fixture.hasCommittedUpload, true);
    assert.equal(fixture.deletionEligible, false);
  }
});

test('R15 upload identity: inherited sub value/getter never supplies ownership; own subject still works', { concurrency: false }, async () => {
  const saved = Object.getOwnPropertyDescriptor(Object.prototype, 'sub');
  let reads = 0;
  try {
    for (const descriptor of [{ value: OWNER, writable: true }, { value() { reads++; return OWNER; }, writable: true }, { get() { reads++; return OWNER; } }]) {
      Object.defineProperty(Object.prototype, 'sub', { ...descriptor, configurable: true });
      const runId = `r15-prototype-${++sequence}`;
      const f = { runId, path: `${runId}/probe.txt` };
      const absent = await postObserved(f, tokenWithPayload({}));
      assert.equal(absent.response.status, 201);
      assert.equal(absent.provider.getSnapshot().objects.length, 0);
      assert.equal(absent.provider.getObjectState({ bucket: STORAGE_PROBE_BUCKET, path: f.path }).indeterminate, true);
      const own = await postObserved(f, tokenWithPayload({ sub: OWNER }));
      assert.equal(own.response.conditionalUploadIdentity.status, 'UPLOAD_IDENTITY_OBSERVED');
      assert.equal(own.provider.getObject({ bucket: STORAGE_PROBE_BUCKET, path: f.path }).ownerId, OWNER);
      assert.equal(reads, 0);
    }
  } finally {
    if (saved) Object.defineProperty(Object.prototype, 'sub', saved);
    else delete Object.prototype.sub;
  }
  assert.equal(reads, 0);
});

test('R15 upload identity: invalid scope cannot register an affirmative provider identity', async () => {
  for (const [label, bucket, pathSuffix, project] of [
    ['run', STORAGE_PROBE_BUCKET, 'other-run/probe.txt', HARDCODED_TEMP_REF],
    ['bucket', 'other_bucket', 'r15-binding/probe.txt', HARDCODED_TEMP_REF],
    ['path', STORAGE_PROBE_BUCKET, 'r15-binding/other.txt', HARDCODED_TEMP_REF],
    ['project', STORAGE_PROBE_BUCKET, 'r15-binding/probe.txt', 'offline-invalid']
  ]) {
    const transport = createDeterministicFixtureTransport({ conditionalStorage: { projectRef: HARDCODED_TEMP_REF, runId: 'r15-binding' }, routes: [{ status: 200, json: { Id: OBJECT } }] });
    const response = await transport(`https://${project}.supabase.co/storage/v1/object/${bucket}/${pathSuffix}`, { method: 'POST', headers: { authorization: `Bearer ${jwt()}` } });
    assert.equal(response.status, 200, label);
    assert.equal(response.conditionalUploadIdentity.reason, 'UPLOAD_SCOPE_MISMATCH');
    const provider = getConditionalStorageFixtureProvider(transport);
    assert.equal(provider.getSnapshot().objects.length, 0);
    assert.equal(provider.getObjectState({ bucket, path: pathSuffix }).indeterminate, true);
  }
});

test('R15 upload identity: matching Id/id aliases preserve legitimate atomic lifecycle', async () => {
  const runId = 'r15-valid-aliases';
  const { response, provider } = await postObserved({ runId, path: `${runId}/probe.txt` }, jwt(), { Id: OBJECT, id: OBJECT });
  assert.equal(response.status, 201);
  assert.equal(provider.getObject({ bucket: STORAGE_PROBE_BUCKET, path: `${runId}/probe.txt` }).objectId, OBJECT);
  const f = await provision('r15-valid-lifecycle', { createdUser: true });
  const report = await cleanup(f);
  assert.equal(report.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(report.storageObjectsDeleted, 1);
  assert.equal(report.usersDeleted, 1);
});


test('R15 related identity paths: inherited subject is inert in provisioning and JWT observation', { concurrency: false }, async () => {
  const saved = Object.getOwnPropertyDescriptor(Object.prototype, 'sub');
  let reads = 0;
  const f = await provision('r15-related-sub');
  const claims = JSON.parse(Buffer.from(jwt().split('.')[1], 'base64url').toString('utf8'));
  delete claims.sub;
  const token = tokenWithPayload(claims);
  try {
    Object.defineProperty(Object.prototype, 'sub', { configurable: true, get() { reads++; return OWNER; } });
    const count = f.transport.calls.length;
    await assert.rejects(provisionStorageProbeFixture({ runId: f.runId, seedUserId: OWNER, userAccessToken: token, anonKey, adminClient: f.adminClient, inventory: f.inventory, fetchFn: f.transport }), /CREDENTIAL_BINDING_ERROR/);
    assert.equal(f.transport.calls.length, count);
    const jwtResult = parseAndValidateJwt(token);
    assert.equal(jwtResult.payload.sub, undefined);
    assert.equal(Object.getPrototypeOf(jwtResult.payload), null);
    const inventory = new TestRunInventory('r15-related-observation');
    observeAuthResponse({ probeId: 'BYPASS-01', status: 200, body: { access_token: token }, inv: inventory, canCreateUser: true });
    observeAndTrackSessionTokens({ access_token: token }, { inv: inventory, probeId: 'BYPASS-01' });
    assert.equal(inventory.createdUsers.size, 0);
    assert.equal(inventory.unverifiedUsers.size, 0);
    assert.equal(reads, 0);
  } finally {
    if (saved) Object.defineProperty(Object.prototype, 'sub', saved);
    else delete Object.prototype.sub;
  }
});


test('R15 identity evidence: malformed JOSE structure and executable object-ID values fail without execution', async () => {
  const f = { runId: 'r15-jose', path: 'r15-jose/probe.txt' };
  for (const header of [null, [], {}, { alg: null }, { alg: 'none' }, { alg: 'HS256', b64: false }, { alg: 'HS256', crit: [] }]) {
    const token = `${Buffer.from(JSON.stringify(header)).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: OWNER })).toString('base64url')}.c2ln`;
    const { response, provider } = await postObserved(f, token);
    assert.equal(response.status, 201);
    assert.equal(response.conditionalUploadIdentity.status, 'UPLOAD_IDENTITY_INDETERMINATE');
    assert.equal(provider.getSnapshot().objects.length, 0);
  }
  let executions = 0;
  const accessor = Object.defineProperty({}, 'Id', { get() { executions++; return OBJECT; } });
  const proxy = new Proxy({}, { get() { executions++; }, getPrototypeOf() { executions++; }, ownKeys() { executions++; } });
  for (const row of [accessor, proxy, { Id() { executions++; return OBJECT; } }]) assert.equal(extractOfflineStorageObjectId(row).valid, false);
  assert.equal(executions, 0);
  const transport = createDeterministicFixtureTransport({ conditionalStorage: { projectRef: HARDCODED_TEMP_REF, runId: f.runId } });
  // No blanket catch may turn a genuine internal request-contract failure into successful observation.
  assert.throws(() => observeConditionalStorageUpload(transport, { method: 'POST', pathname: null }, { status: 200 }), TypeError);
});


test('R15 authoritative metadata: inherited owner does not mint a creation receipt', { concurrency: false }, async () => {
  const saved = Object.getOwnPropertyDescriptor(Object.prototype, 'owner_id');
  let reads = 0;
  try {
    Object.defineProperty(Object.prototype, 'owner_id', { configurable: true, get() { reads++; return OWNER; } });
    const runId = `r14-atomic-r15-metadata-${sequence + 1}`;
    const f = await provision('r15-metadata', { createdUser: true, metadataRow: { id: OBJECT, bucket_id: STORAGE_PROBE_BUCKET, name: `${runId}/probe.txt` }, expectedError: /STORAGE_OWNER_VERIFICATION_FAILED/ });
    assert.equal(f.runId, runId);
    const fixture = f.inventory.getStorageFixture(STORAGE_PROBE_BUCKET, f.path);
    assert.equal(fixture.hasCommittedUpload, true);
    assert.equal(fixture.verifiedOwnerId, null);
    assert.equal(fixture.deletionEligible, false);
    const report = await cleanup(f);
    assert.equal(report.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
    assert.equal(storageDeletes(f).length, 0);
    assert.equal(userDeletes(f).length, 0);
    assert.equal(reads, 0);
  } finally {
    if (saved) Object.defineProperty(Object.prototype, 'owner_id', saved);
    else delete Object.prototype.owner_id;
  }
});
