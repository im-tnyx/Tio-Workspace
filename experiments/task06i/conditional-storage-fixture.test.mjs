import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  TestRunInventory, createHostedAdminClient, createMockProjectKey,
  createDeterministicFixtureTransport, provisionStorageProbeFixture,
  createCreationProof, createOfflineBarrier, HARDCODED_TEMP_REF,
  STORAGE_PROBE_BUCKET, STORAGE_LIFECYCLE_STATE, validateUuid, observeAuthResponse, observeAndTrackSessionTokens, parseAndValidateJwt
} from './hosted-probe-runner.mjs';
import {
  getConditionalStorageFixtureProvider, extractOfflineStorageObjectId, observeConditionalStorageUpload,
  decodeOfflineJwtClaims, canonicalStorageUuid, createConditionalStorageFixtureProvider,
  registerConditionalStorageFixtureTransport, MAX_OFFLINE_JWT_TOKEN_LENGTH,
  MAX_OFFLINE_JWT_CLAIM_DEPTH, MAX_OFFLINE_JWT_CLAIM_NODES
} from './conditional-storage-fixture.mjs';

const OWNER = '11111111-1111-4111-a111-111111111114';
const OTHER_OWNER = '22222222-2222-4222-a222-222222222114';
const OBJECT = '33333333-3333-4333-a333-333333333114';
const REPLACEMENT = '44444444-4444-4444-a444-444444444114';
const CREATED_USER = '55555555-5555-4555-a555-555555555114';
const anonKey = createMockProjectKey(HARDCODED_TEMP_REF, 'anon');
const serviceRoleKey = createMockProjectKey(HARDCODED_TEMP_REF, 'service_role');
const content = 'r14 deterministic atomic Storage fixture\n';
let sequence = 0;
function jwt(subject = OWNER) {
  const now = Math.floor(Date.now() / 1000);
  const claims = { sub: subject, session_id: 'r14-fixture-session', iss: `https://${HARDCODED_TEMP_REF}.supabase.co/auth/v1`, aud: 'authenticated', iat: now, exp: now + 300, amr_authenticated: 'true', amr: [{ method: 'password', timestamp: now }] };
  return [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify(claims)).toString('base64url'), Buffer.from('offline_signature').toString('base64url')].join('.');
}

// Every scenario performs the actual upload and metadata verification. The same
// registered provider Map observes that upload, fixture replacement and cleanup.
async function provision(label, { responseMode = 'normal', capability = true, deleteBarrier = null, unknownUploadIdentity = false, uploadBody = undefined, metadataRow = undefined, expectedError = null, createdUser = false, owner = OWNER, objectId = OBJECT, metadataOwner = owner, metadataObject = objectId, validUploadBody = false } = {}) {
  const runId = `r14-atomic-${label}-${++sequence}`;
  const path = `${runId}/probe.txt`;
  const inventory = new TestRunInventory(runId);
  if (createdUser) inventory.registerCreatedUser({ id: CREATED_USER, email: 'created-r14@proof.invalid', creationProof: createCreationProof('before_after_check') });
  const transport = createDeterministicFixtureTransport({
    requestBudgetMode: 'recorded_zero_wait',
    ...(capability ? { conditionalStorage: { projectRef: HARDCODED_TEMP_REF, runId, objects: [], responseMode } } : {}),
    initialState: { uploaded: false, deleted: false, userDeleted: false },
    routes: [
      { method: 'GET', pathEquals: '/auth/v1/user', status: 200, json: { id: owner } },
      { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', whenState: { uploaded: false }, status: 404, json: { code: 'NoSuchKey' } },
      { method: 'POST', urlIncludes: '/storage/v1/object/', setsState: { uploaded: true }, status: 200, json: uploadBody !== undefined ? uploadBody : unknownUploadIdentity ? {} : { Id: objectId } },
      { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', whenState: { uploaded: true, deleted: false }, status: 200, text: content },
      { method: 'POST', urlIncludes: '/rest/v1/rpc/task06i_lookup_storage_object_owner', status: 200, json: metadataRow !== undefined ? [metadataRow] : [{ id: metadataObject, bucket_id: STORAGE_PROBE_BUCKET, name: path, owner_id: metadataOwner }] },
      { method: 'DELETE', urlIncludes: '/storage/v1/object/', ...(deleteBarrier ? { waitForBarrier: deleteBarrier } : {}), setsState: { deleted: true }, status: 200, json: {} },
      { method: 'GET', urlIncludes: '/storage/v1/object/authenticated/', whenState: { deleted: true }, status: 404, json: { code: 'NoSuchKey' } },
      { method: 'DELETE', urlIncludes: '/auth/v1/admin/users/', setsState: { userDeleted: true }, status: 200, json: {} },
      { method: 'GET', urlIncludes: '/auth/v1/admin/users/', whenState: { userDeleted: true }, status: 404, json: { code: 'user_not_found' } }
    ]
  });
  const adminClient = createHostedAdminClient({ runId, anonKey, serviceRoleKey, fetchFn: transport });
  const provisioning = provisionStorageProbeFixture({ runId, seedUserId: owner, userAccessToken: jwt(owner), anonKey, adminClient, inventory, fetchFn: transport, probeContent: content });
  if (expectedError) await assert.rejects(provisioning, expectedError);
  else if (unknownUploadIdentity || (uploadBody !== undefined && !validUploadBody)) await assert.rejects(provisioning, /STORAGE_UPLOAD_IDENTITY_INDETERMINATE/);
  else await provisioning;
  const provider = getConditionalStorageFixtureProvider(transport);
  const expected = { projectRef: HARDCODED_TEMP_REF, runId, bucket: STORAGE_PROBE_BUCKET, path, objectId: canonicalStorageUuid(objectId), ownerId: canonicalStorageUuid(owner) };
  if (provider && !unknownUploadIdentity && (uploadBody === undefined || validUploadBody)) assert.deepEqual({ ...provider.getObject({ bucket: STORAGE_PROBE_BUCKET, path }) }, expected, 'actual provisioning populates provider current identity');
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


for (const mode of ['upload-setter', 'upload-getter', 'delete-setter', 'delete-getter', 'combined']) {
  test(`R16-01 evidence: ${mode} cannot intercept immutable own observations`, { concurrency: false }, async () => {
    const keys = ['conditionalUploadIdentity', 'conditionalDeletion'];
    const saved = keys.map(key => Object.getOwnPropertyDescriptor(Object.prototype, key));
    let executions = 0;
    try {
      for (let index = 0; index < keys.length; index++) {
        const upload = index === 0;
        if (mode !== 'combined' && !mode.startsWith(upload ? 'upload' : 'delete')) continue;
        const descriptor = { configurable: true };
        if (mode === 'combined' || mode.endsWith('getter')) descriptor.get = () => { executions++; return { status: 'UPLOAD_IDENTITY_OBSERVED' }; };
        if (mode === 'combined' || mode.endsWith('setter')) descriptor.set = () => { executions++; };
        Object.defineProperty(Object.prototype, keys[index], descriptor);
      }
      const f = await provision(`r16-${mode}`, { createdUser: true });
      const observed = await postObserved(f, jwt());
      const upload = Object.getOwnPropertyDescriptor(observed.response, 'conditionalUploadIdentity');
      assert.equal(upload.writable, false); assert.equal(upload.configurable, false);
      assert.equal(Object.isFrozen(upload.value), true);
      assert.equal(Object.getPrototypeOf(upload.value), null);
      assert.throws(() => { observed.response.conditionalUploadIdentity = {}; }, TypeError);
      const refused = await f.transport(`https://${HARDCODED_TEMP_REF}.supabase.co/storage/v1/object/${STORAGE_PROBE_BUCKET}/${f.path}`, { method: 'DELETE' });
      const deletion = Object.getOwnPropertyDescriptor(refused, 'conditionalDeletion');
      assert.equal(deletion.writable, false); assert.equal(deletion.configurable, false);
      assert.equal(Object.isFrozen(deletion.value), true);
      assert.equal(deletion.value.status, 'CONDITIONAL_DELETE_UNAVAILABLE');
      const report = await cleanup(f);
      assert.equal(report.status, 'CLEANUP_VERIFIED_SUCCESS');
      assert.equal(Object.isFrozen(f.inventory.getStorageFixture(STORAGE_PROBE_BUCKET, f.path).conditionalDeletionEvidence), true);
      const unknown = await provision(`r16-unknown-${mode}`, { unknownUploadIdentity: true, createdUser: true });
      for (let attempt = 0; attempt < 2; attempt++) {
        const residual = await cleanup(unknown);
        assert.equal(residual.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
        assert.equal(residual.storageObjectsDeleted, 0); assert.equal(residual.usersDeleted, 0);
        assert.equal(storageDeletes(unknown).length, 0); assert.equal(userDeletes(unknown).length, 0);
        assert.equal(unknown.inventory.getStorageFixture(STORAGE_PROBE_BUCKET, unknown.path).hasCommittedUpload, true);
      }
      assert.equal(executions, 0);
    } finally {
      for (let index = 0; index < keys.length; index++) {
        if (saved[index]) Object.defineProperty(Object.prototype, keys[index], saved[index]);
        else delete Object.prototype[keys[index]];
      }
    }
    assert.equal(executions, 0);
  });
}

test('R16-01 evidence: required internal observation missing blocks matching metadata and keeps committed residual', () => {
  // Fault injection is isolated in a separate process; no production marker-skip option exists.
  const script = `
    import assert from 'node:assert/strict';
    import { mock } from 'node:test';
    const fixtureUrl = ${JSON.stringify(new URL('./conditional-storage-fixture.mjs', import.meta.url).href)};
    const actual = await import(fixtureUrl);
    mock.module(fixtureUrl, { namedExports: { ...actual, observeConditionalStorageUpload(...args) { actual.observeConditionalStorageUpload(...args); return null; } } });
    const m = await import(${JSON.stringify(new URL('./hosted-probe-runner.mjs', import.meta.url).href)});
    const ref = m.HARDCODED_TEMP_REF, runId = 'r16-missing-required', path = runId + '/probe.txt';
    const owner = ${JSON.stringify(OWNER)}, objectId = ${JSON.stringify(OBJECT)}, created = ${JSON.stringify(CREATED_USER)};
    const inventory = new m.TestRunInventory(runId);
    inventory.registerCreatedUser({ id: created, email: 'r16-created@proof.invalid', creationProof: m.createCreationProof('before_after_check') });
    const transport = m.createDeterministicFixtureTransport({ requestBudgetMode: 'recorded_zero_wait', conditionalStorage: { projectRef: ref, runId }, routes: [
      { method: 'GET', pathEquals: '/auth/v1/user', status: 200, json: { id: owner } },
      { method: 'GET', urlIncludes: '/storage/', status: 404, json: { code: 'NoSuchKey' } },
      { method: 'POST', urlIncludes: '/storage/', status: 200, json: {} },
      { method: 'POST', urlIncludes: '/rest/', status: 200, json: [{ id: objectId, owner_id: owner, bucket_id: m.STORAGE_PROBE_BUCKET, name: path }] }
    ] });
    const anonKey = m.createMockProjectKey(ref, 'anon'), serviceRoleKey = m.createMockProjectKey(ref, 'service_role');
    const adminClient = m.createHostedAdminClient({ runId, anonKey, serviceRoleKey, fetchFn: transport });
    const token = ${JSON.stringify(jwt())};
    await assert.rejects(m.provisionStorageProbeFixture({ runId, seedUserId: owner, userAccessToken: token, anonKey, adminClient, inventory, fetchFn: transport }), /STORAGE_UPLOAD_IDENTITY_INDETERMINATE/);
    const item = inventory.getStorageFixture(m.STORAGE_PROBE_BUCKET, path);
    assert.equal(item.hasCommittedUpload, true); assert.equal(item.deletionEligible, false); assert.equal(item.verifiedOwnerId, null);
    assert.equal(item.residualReason, 'UPLOAD_IDENTITY_MISSING_REQUIRED');
    assert.equal(transport.calls.filter(call => call.pathname.startsWith('/rest/')).length, 0);
    for (let attempt = 0; attempt < 2; attempt++) {
      const report = await inventory.executeCleanup({ adminClient, failClosed: false });
      assert.equal(report.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
      assert.equal(report.storageObjectsDeleted, 0); assert.equal(report.usersDeleted, 0);
    }
    assert.equal(transport.calls.filter(call => call.method === 'DELETE').length, 0);
    mock.restoreAll();
    process.stdout.write('MISSING_REQUIRED_BLOCKED');
  `;
  const output = execFileSync(process.execPath, ['--experimental-test-module-mocks', '--input-type=module', '-e', script], { encoding: 'utf8', timeout: 15000 });
  assert.equal(output, 'MISSING_REQUIRED_BLOCKED');
});

test('R16-01 evidence: explicit unavailable registration is non-applicable and cannot authorize deletion', async () => {
  const f = await provision('r16-not-applicable', { capability: false, createdUser: true });
  const report = await cleanup(f);
  assert.equal(report.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
  assert.equal(storageResidual(report).conditionalDeletion.status, 'CONDITIONAL_DELETE_UNAVAILABLE');
  assert.equal(storageDeletes(f).length, 0); assert.equal(userDeletes(f).length, 0);
});

for (const mode of ['filter', 'map', 'some', 'includes', 'combined']) {
  test(`R16-02 admission: hostile Array.${mode} cannot influence identity decisions`, { concurrency: false }, () => {
    const names = mode === 'combined' ? ['filter', 'map', 'some', 'includes'] : [mode];
    const saved = names.map(name => Object.getOwnPropertyDescriptor(Array.prototype, name));
    const runId = `r16-array-${mode}`, path = `${runId}/probe.txt`;
    const transport = createDeterministicFixtureTransport({ conditionalStorage: { projectRef: HARDCODED_TEMP_REF, runId } });
    const provider = getConditionalStorageFixtureProvider(transport);
    let executions = 0, traps = 0;
    const accessor = Object.defineProperty({}, 'Id', { get() { executions++; return OBJECT; } });
    const proxy = new Proxy({}, { ownKeys() { traps++; }, getPrototypeOf() { traps++; }, get() { traps++; } });
    const rows = [{ Id: null }, { Id: 'bad', id: OBJECT }, { Id: OBJECT, id: null }, { Id: OBJECT, id: REPLACEMENT }, accessor, proxy, { Id() { executions++; } }, Object.create({ Id: OBJECT }), { Id: OBJECT.toUpperCase(), id: OBJECT }, { id: OBJECT }];
    const results = [], observations = [], counts = [];
    const token = jwt();
    try {
      for (let index = 0; index < names.length; index++) Object.defineProperty(Array.prototype, names[index], { configurable: true, writable: true, value() { executions++; return names[index] === 'some' ? false : names[index] === 'includes' ? true : [OBJECT]; } });
      for (let index = 0; index < rows.length; index++) {
        results.push(extractOfflineStorageObjectId(rows[index]));
        observations.push(observeConditionalStorageUpload(transport, { method: 'POST', pathname: `/storage/v1/object/${STORAGE_PROBE_BUCKET}/${path}`, url: `https://${HARDCODED_TEMP_REF}.supabase.co/storage/v1/object/${STORAGE_PROBE_BUCKET}/${path}`, headers: { authorization: `Bearer ${token}` } }, { status: 201, json: rows[index] }));
        counts.push(provider.getSnapshot().objects.length);
      }
      const canonical = decodeOfflineJwtClaims(token);
      results.push(canonical.sub);
      const externalProvider = createConditionalStorageFixtureProvider({ projectRef: HARDCODED_TEMP_REF, runId: `r16-bound-${mode}` });
      const identity = { projectRef: HARDCODED_TEMP_REF, runId: `r16-bound-${mode}`, bucket: STORAGE_PROBE_BUCKET, path: `r16-bound-${mode}/probe.txt`, ownerId: OWNER.toUpperCase(), objectId: OBJECT.toUpperCase() };
      externalProvider.putObject(identity);
      results.push(externalProvider.conditionalDelete({ ...identity, ownerId: OWNER, objectId: OBJECT }).status);
    } finally {
      for (let index = 0; index < names.length; index++) Object.defineProperty(Array.prototype, names[index], saved[index]);
    }
    assert.equal(executions, 0); assert.equal(traps, 0);
    for (let index = 0; index < 8; index++) { assert.equal(results[index].valid, false); assert.equal(observations[index].status, 'UPLOAD_IDENTITY_INDETERMINATE'); assert.equal(counts[index], 0); }
    assert.equal(results[8].objectId, OBJECT); assert.equal(results[9].objectId, OBJECT);
    assert.equal(observations[8].status, 'UPLOAD_IDENTITY_OBSERVED');
    assert.equal(results[10], OWNER); assert.equal(results[11], 'EXPECTED_OBJECT_DELETED');
  });
}

for (const [label, signature] of [['one-character', 'x'], ['invalid-length', 'abcde'], ['empty', ''], ['invalid-characters', '**'], ['trailing-bits', 'AB'], ['padding', 'YQ==']]) {
  test(`R16-03 signature: ${label} preserves 2xx but never admits upload identity`, async () => {
    const runId = `r16-signature-${label}`;
    const token = jwt().split('.').slice(0, 2).join('.') + '.' + signature;
    assert.equal(decodeOfflineJwtClaims(token), null);
    const { response, provider } = await postObserved({ runId, path: `${runId}/probe.txt` }, token);
    assert.equal(response.status, 201); assert.deepEqual(await response.json(), { Id: OBJECT });
    assert.equal(response.conditionalUploadIdentity.status, 'UPLOAD_IDENTITY_INDETERMINATE');
    assert.equal(provider.getSnapshot().objects.length, 0);
    assert.equal(provider.getObjectState({ bucket: STORAGE_PROBE_BUCKET, path: `${runId}/probe.txt` }).indeterminate, true);
  });
}

test('R16-03 signature: canonical binary bytes are accepted without UTF8/JSON or cryptographic claims', async () => {
  const signature = Buffer.from([0xff, 0x00, 0x80, 0xfe]).toString('base64url');
  const token = jwt().split('.').slice(0, 2).join('.') + '.' + signature;
  assert.equal(decodeOfflineJwtClaims(token).sub, OWNER);
  const f = { runId: 'r16-binary-signature', path: 'r16-binary-signature/probe.txt' };
  const { response } = await postObserved(f, token);
  assert.equal(response.conditionalUploadIdentity.status, 'UPLOAD_IDENTITY_OBSERVED');
  assert.equal(response.conditionalUploadIdentity.cryptographicallyVerified, false);
  const parts = token.split('.');
  assert.equal(decodeOfflineJwtClaims(`e30.${parts[1]}.${signature}`), null);
  assert.equal(decodeOfflineJwtClaims(`${parts[0]}.bnVsbA.${signature}`), null);
});

test('R16-03 signature: committed malformed replacement remains residual and blocks dependent Auth deletion', async () => {
  const f = await provision('r16-signature-residual', { createdUser: true });
  const token = jwt().split('.').slice(0, 2).join('.') + '.x';
  const response = await f.transport(`https://${HARDCODED_TEMP_REF}.supabase.co/storage/v1/object/${STORAGE_PROBE_BUCKET}/${f.path}`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
  assert.equal(response.status, 200);
  assert.equal(response.conditionalUploadIdentity.status, 'UPLOAD_IDENTITY_INDETERMINATE');
  for (let attempt = 0; attempt < 2; attempt++) {
    const report = await cleanup(f);
    assert.equal(report.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
    assert.equal(report.storageObjectsDeleted, 0); assert.equal(report.usersDeleted, 0);
    assert.ok(storageResidual(report)); assert.equal(userDeletes(f).length, 0);
  }
});

for (const [label, owner, objectId, metadataOwner, metadataObject] of [
  ['uppercase', OWNER.toUpperCase(), OBJECT.toUpperCase(), OWNER.toUpperCase(), OBJECT.toUpperCase()],
  ['mixed', 'aBcDef01-abCD-4abc-aBcD-abcdef012345', 'ABCDef02-aBcd-4abc-abCd-AbCdEf012345', 'AbCdEf01-ABcd-4ABC-ABcd-ABCDEF012345', 'abcdef02-ABCD-4ABC-ABCD-abcdef012345']
]) test(`R16-04 UUID: ${label} lifecycle uses one canonical identity through repeated atomic cleanup`, async () => {
  assert.equal(validateUuid(owner), owner, 'general UUID API keeps its original case contract');
  const f = await provision(`r16-${label}`, { owner, objectId, metadataOwner, metadataObject, uploadBody: { Id: objectId, id: objectId.toLowerCase() }, validUploadBody: true, createdUser: true });
  const fixture = f.inventory.getStorageFixture(STORAGE_PROBE_BUCKET, f.path);
  assert.equal(fixture.providerObjectId, objectId.toLowerCase());
  assert.equal(fixture.verifiedOwnerId, owner.toLowerCase());
  assert.equal(fixture.ownerId, owner.toLowerCase());
  assert.equal(fixture.proof.objectId, objectId.toLowerCase());
  assert.equal(fixture.proof.ownerId, owner.toLowerCase());
  assert.equal(f.provider.getObject({ bucket: STORAGE_PROBE_BUCKET, path: f.path }).ownerId, owner.toLowerCase());
  const report = await cleanup(f);
  assert.equal(report.status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(report.storageObjectsDeleted, 1); assert.equal(report.usersDeleted, 1);
  assert.equal(fixture.conditionalDeletionEvidence.expected.objectId, objectId.toLowerCase());
  const storageCount = storageDeletes(f).length;
  assert.equal((await cleanup(f)).status, 'CLEANUP_VERIFIED_SUCCESS');
  assert.equal(storageDeletes(f).length, storageCount);
});

for (const field of ['ownerId', 'objectId']) test(`R16-04 UUID: genuine ${field} replacement remains blocked after canonicalization`, async () => {
  const f = await provision(`r16-mismatch-${field}`, { owner: OWNER.toUpperCase(), objectId: OBJECT.toUpperCase(), createdUser: true });
  const replacement = { ...f.expected, [field]: field === 'ownerId' ? OTHER_OWNER.toUpperCase() : REPLACEMENT.toUpperCase() };
  f.provider.putObject(replacement);
  for (let attempt = 0; attempt < 2; attempt++) {
    const report = await cleanup(f);
    assert.equal(report.status, 'CLEANUP_FAILED_RESIDUAL_RESOURCES');
    assert.equal(report.storageObjectsDeleted, 0); assert.equal(userDeletes(f).length, 0);
    assert.equal(f.provider.getObject({ bucket: STORAGE_PROBE_BUCKET, path: f.path })[field], replacement[field].toLowerCase());
  }
});

test('JWT-AMR-01: decodeOfflineJwtClaims recursively freezes null-prototype nested claims and rejects __proto__', () => {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const sig = Buffer.from('sig-amr-test').toString('base64url');
  const missingMethodToken = `${header}.${encode({ sub: OWNER, amr: [{}] })}.${sig}`;
  const validToken = `${header}.${encode({ sub: OWNER, amr: [{ method: 'password', timestamp: 1700000000 }] })}.${sig}`;
  const protoKeyToken = `${header}.${Buffer.from(`{"sub":"${OWNER}","__proto__":{"method":"password"}}`).toString('base64url')}.${sig}`;
  const prevMethod = Object.getOwnPropertyDescriptor(Object.prototype, 'method');
  let getterCalls = 0;
  try {
    Object.defineProperty(Object.prototype, 'method', {
      configurable: true,
      get() { getterCalls++; return 'password'; }
    });
    const decodedMissing = decodeOfflineJwtClaims(missingMethodToken);
    assert.ok(decodedMissing);
    assert.equal(Object.getPrototypeOf(decodedMissing), null);
    assert.equal(Object.isFrozen(decodedMissing.amr), true);
    assert.equal(Object.getPrototypeOf(decodedMissing.amr[0]), null);
    assert.equal(Object.isFrozen(decodedMissing.amr[0]), true);
    assert.equal(decodedMissing.amr[0].method, undefined);

    const decodedValid = decodeOfflineJwtClaims(validToken);
    assert.equal(Object.getPrototypeOf(decodedValid.amr[0]), null);
    assert.equal(decodedValid.amr[0].method, 'password');
    assert.equal(decodeOfflineJwtClaims(protoKeyToken), null);
    assert.equal(getterCalls, 0);
  } finally {
    if (prevMethod) Object.defineProperty(Object.prototype, 'method', prevMethod);
    else delete Object.prototype.method;
  }
});

test('JWT-BOUND-01: decodeOfflineJwtClaims enforces explicit depth, node-budget, and token-length limits without throwing', () => {
  const encodeHeader = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const sig = Buffer.from('sig-bound-test').toString('base64url');
  const tokenFromPayloadJson = payloadJson => `${encodeHeader}.${Buffer.from(payloadJson).toString('base64url')}.${sig}`;
  const nestedObjectJson = depth => '{"a":'.repeat(depth) + '1' + '}'.repeat(depth);
  const nestedArrayJson = depth => '['.repeat(depth) + '1' + ']'.repeat(depth);

  // 1. Legitimate nested JWT claims within documented limits succeed and stay frozen null-prototype
  const legitToken = tokenFromPayloadJson(JSON.stringify({
    sub: OWNER,
    amr: [{ method: 'password', timestamp: 1700000000 }],
    app_metadata: { roles: ['member'], flags: { beta: false } }
  }));
  const legit = decodeOfflineJwtClaims(legitToken);
  assert.ok(legit);
  assert.equal(Object.getPrototypeOf(legit.app_metadata), null);
  assert.equal(Object.isFrozen(legit.app_metadata.flags), true);
  assert.equal(legit.app_metadata.flags.beta, false);

  // 2. Exact depth boundary (leaf at MAX_OFFLINE_JWT_CLAIM_DEPTH) passes; depth + 1 rejects deterministically
  // Root object is depth 0; `deep` is depth 1; wrapping (MAX - 1) levels places leaf at depth MAX.
  const exactDepthObj = tokenFromPayloadJson(`{"sub":"${OWNER}","deep":${nestedObjectJson(MAX_OFFLINE_JWT_CLAIM_DEPTH - 1)}}`);
  const overDepthObj = tokenFromPayloadJson(`{"sub":"${OWNER}","deep":${nestedObjectJson(MAX_OFFLINE_JWT_CLAIM_DEPTH)}}`);
  const exactDepthArr = tokenFromPayloadJson(`{"sub":"${OWNER}","deep":${nestedArrayJson(MAX_OFFLINE_JWT_CLAIM_DEPTH - 1)}}`);
  const overDepthArr = tokenFromPayloadJson(`{"sub":"${OWNER}","deep":${nestedArrayJson(MAX_OFFLINE_JWT_CLAIM_DEPTH)}}`);
  assert.ok(decodeOfflineJwtClaims(exactDepthObj));
  assert.equal(decodeOfflineJwtClaims(overDepthObj), null);
  assert.ok(decodeOfflineJwtClaims(exactDepthArr));
  assert.equal(decodeOfflineJwtClaims(overDepthArr), null);

  // 3. Extreme nesting (depth 6000 within token length) rejects cleanly without RangeError
  const extremeDepth = tokenFromPayloadJson(`{"sub":"${OWNER}","deep":${nestedArrayJson(6000)}}`);
  assert.ok(extremeDepth.length <= MAX_OFFLINE_JWT_TOKEN_LENGTH);
  assert.equal(decodeOfflineJwtClaims(extremeDepth), null);

  // 4. Exact node-budget boundary (root + MAX_OFFLINE_JWT_CLAIM_NODES - 1 primitives) passes; +1 rejects
  const exactWideEntries = [];
  for (let i = 0; i < MAX_OFFLINE_JWT_CLAIM_NODES - 1; i++) exactWideEntries.push(`"k${i}":1`);
  const exactWideToken = tokenFromPayloadJson(`{${exactWideEntries.join(',')}}`);
  const overWideEntries = [...exactWideEntries, `"k${MAX_OFFLINE_JWT_CLAIM_NODES}":1`];
  const overWideToken = tokenFromPayloadJson(`{${overWideEntries.join(',')}}`);
  assert.ok(exactWideToken.length <= MAX_OFFLINE_JWT_TOKEN_LENGTH);
  assert.ok(overWideToken.length <= MAX_OFFLINE_JWT_TOKEN_LENGTH);
  assert.ok(decodeOfflineJwtClaims(exactWideToken));
  assert.equal(decodeOfflineJwtClaims(overWideToken), null);

  const overWideArrayEntries = new Array(MAX_OFFLINE_JWT_CLAIM_NODES - 1).fill('1').join(',');
  const overWideArrayToken = tokenFromPayloadJson(`{"arr":[${overWideArrayEntries}]}`);
  assert.ok(overWideArrayToken.length <= MAX_OFFLINE_JWT_TOKEN_LENGTH);
  assert.equal(decodeOfflineJwtClaims(overWideArrayToken), null);

  // 5. Over-length token rejects before traversal
  const bigPad = 'x'.repeat(MAX_OFFLINE_JWT_TOKEN_LENGTH);
  const overLenToken = tokenFromPayloadJson(JSON.stringify({ sub: OWNER, pad: bigPad }));
  assert.ok(overLenToken.length > MAX_OFFLINE_JWT_TOKEN_LENGTH);
  assert.equal(decodeOfflineJwtClaims(overLenToken), null);
});
