import test from 'node:test';
import assert from 'node:assert/strict';
import { admitInventoryEffects, snapshotInventoryEffectData } from './inventory-effect-admission.mjs';
import { TestRunInventory, createTrustedOfflineDispatcher, createDeterministicFixtureTransport } from './hosted-probe-runner.mjs';

const proof = () => ({ type: 'before_after_check', preCheckAbsent: true, postCheckPresent: true });

test('R14-01: missing nested user fields cannot resolve inherited id/email/creationProof getters', { concurrency: false }, () => {
  let reads = 0;
  const keys = ['id', 'email', 'creationProof'];
  const descriptors = keys.map(key => [key, Object.getOwnPropertyDescriptor(Object.prototype, key)]);
  try {
    for (const key of keys) Object.defineProperty(Object.prototype, key, { configurable: true, get() { reads++; return 'inherited'; } });
    assert.throws(() => admitInventoryEffects({ registerCreatedUser: {} }), /missing required id/);
    assert.throws(() => admitInventoryEffects({ registerCreatedUser: { id: 'own-id' } }), /missing required email/);
    const batch = admitInventoryEffects({ registerCreatedUser: { id: 'own-id', email: 'own@proof.invalid' } });
    assert.equal(batch.registerCreatedUser.creationProof, null);
    assert.equal(Object.getPrototypeOf(batch.registerCreatedUser), null);
    assert.equal(reads, 0);
  } finally {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(Object.prototype, key, descriptor);
      else delete Object.prototype[key];
    }
  }
});

test('R14-01: every supported effect is recursively own-only and typed before batch acceptance', () => {
  const batch = admitInventoryEffects({
    protectSeedIdentity: { id: 'seed', email: 'seed@proof.invalid' },
    registerCreatedUser: { id: 'created', email: 'created@proof.invalid', creationProof: proof() },
    registerUnverifiedUser: { id: 'unknown' },
    registerSession: { sessionId: 'session', accessToken: 'synthetic' },
    registerUntrackedSession: true,
    registerUntrackedUser: false,
    registerSeedPasswordModification: { userId: 'seed', originalPassword: 'synthetic-original' },
    registerInFlightOperation: { probeId: 'R14', canModifyProviderState: true, metadata: { nested: { value: 'inert' } } },
    settleInFlightOperation: { observed: { classification: 'observed' }, outcome: { body: { nested: { status: 200 } } } }
  });
  assert.equal(Object.getPrototypeOf(batch), null);
  assert.equal(Object.getPrototypeOf(batch.registerCreatedUser.creationProof), null);
  assert.equal(Object.getPrototypeOf(batch.registerInFlightOperation.metadata.nested), null);
  assert.equal(Object.getPrototypeOf(batch.settleInFlightOperation.outcome.body.nested), null);
  assert.equal(batch.registerInFlightOperation.canMintSession, false);
  assert.equal(batch.registerSeedPasswordModification.state, 'pending');
});

test('R14-01: nested session/password/settlement accessors, functions and Proxies execute zero user code', () => {
  let executions = 0;
  const accessor = Object.defineProperty({}, 'accessToken', { get() { executions++; return 'synthetic'; } });
  const proxy = new Proxy({}, { get() { executions++; }, getPrototypeOf() { executions++; }, ownKeys() { executions++; } });
  const invalid = [
    { registerSession: accessor },
    { registerSeedPasswordModification: { userId: 'user', originalPassword: () => { executions++; } } },
    { registerInFlightOperation: {}, settleInFlightOperation: { outcome: { proxy } } },
    { registerCreatedUser: proxy },
    { registerCreatedUser: { id: 'id', email: 'id@proof.invalid', creationProof: { ...proof(), callback() { executions++; } } } }
  ];
  for (const value of invalid) assert.throws(() => admitInventoryEffects(value), /INVALID_INVENTORY_EFFECT/);
  assert.equal(executions, 0);
});

test('R14-01: unknown effects/fields, invalid evidence and late-invalid batches fail atomically at admission', () => {
  for (const batch of [
    { unknownEffect: {} },
    { registerUntrackedUser: 'true' },
    { registerCreatedUser: { id: 'id', email: 'id@proof.invalid', extra: 1 } },
    { registerCreatedUser: { id: 'id', email: 'id@proof.invalid', creationProof: { type: 'before_after_check', preCheckAbsent: false, postCheckPresent: true } } },
    { registerInFlightOperation: { canCreateUser: 'true' } },
    { settleInFlightOperation: { outcome: { status: 200 } } },
    { registerInFlightOperation: {}, settleInFlightOperation: { observed: { status: '200' } } },
    { registerInFlightOperation: {}, settleInFlightOperation: { error: { message: 'failure', unexpected: true } } },
    { registerInFlightOperation: {}, settleInFlightOperation: { outcome: { passed: 'true' } } },
    { registerUntrackedUser: true, registerSeedPasswordModification: {} }
  ]) assert.throws(() => admitInventoryEffects(batch), /INVALID_INVENTORY_EFFECT/);
});

test('R14-01: admitted batch snapshots are independent of caller mutation', () => {
  const input = { registerCreatedUser: { id: 'id', email: 'id@proof.invalid', creationProof: proof() } };
  const snapshot = admitInventoryEffects(input);
  input.registerCreatedUser.id = 'changed';
  input.registerCreatedUser.creationProof.preCheckAbsent = false;
  assert.equal(snapshot.registerCreatedUser.id, 'id');
  assert.equal(snapshot.registerCreatedUser.creationProof.preCheckAbsent, true);
  const cycle = {}; cycle.self = cycle;
  assert.throws(() => snapshotInventoryEffectData(cycle), /cycle rejected/);
});

test('R14-01: actual dispatcher rejects a late-invalid batch before mutation or transport dispatch', async () => {
  const inventory = new TestRunInventory('r14-effect-invalid-batch');
  const transport = createDeterministicFixtureTransport({ defaultResponse: { status: 200, json: {} } });
  await assert.rejects(async () => {
    const dispatcher = createTrustedOfflineDispatcher({
      runId: inventory.runId, fetchFn: transport,
      defaultOutcome: { inventoryEffects: { registerUntrackedUser: true, registerCreatedUser: {} }, transportRequest: { url: 'https://offline.invalid/local' } }
    });
    await dispatcher({ id: 'BYPASS-01' }, { inventory });
  }, /INVALID_INVENTORY_EFFECT/);
  assert.equal(inventory.untrackedUsersCount, 0);
  assert.equal(inventory.createdUsers.size, 0);
  assert.equal(transport.calls.length, 0);
});

test('R14-01: actual dispatcher applies a complete multi-effect batch and settles its new operation', async () => {
  const inventory = new TestRunInventory('r14-effect-valid-batch');
  const dispatcher = createTrustedOfflineDispatcher({ runId: inventory.runId, defaultOutcome: {
    inventoryEffects: {
      registerCreatedUser: { id: 'created', email: 'created@proof.invalid', creationProof: proof() },
      registerUnverifiedUser: { id: 'observed' },
      registerSession: { sessionId: 'session' },
      registerInFlightOperation: { probeId: 'LOCAL-EFFECT', canModifyProviderState: true },
      settleInFlightOperation: { outcome: { status: 200 } }
    }, outcome: { status: 200 }
  } });
  await dispatcher({ id: 'BYPASS-01' }, { inventory });
  assert.equal(inventory.createdUsers.has('created'), true);
  assert.equal(inventory.unverifiedUsers.has('observed'), true);
  assert.equal(inventory.trackedSessions.has('session'), true);
  assert.equal(inventory.getUnresolvedOperations().length, 0);
});

test('R14-01: valid abort batch preserves genuine runtime partial effects and unresolved obligations', async () => {
  const inventory = new TestRunInventory('r14-effect-runtime-failure');
  inventory.registerReferencedUser({ id: 'seed', email: 'seed@proof.invalid' });
  inventory.registerInFlightOperation({ probeId: 'UNRESOLVED', canModifyProviderState: true });
  const dispatcher = createTrustedOfflineDispatcher({ runId: inventory.runId, defaultOutcome: {
    delayMs: 20, ignoreAbort: true,
    onAbortInventoryEffects: {
      registerUntrackedUser: true,
      registerSeedPasswordModification: { userId: 'seed', email: 'other@proof.invalid', originalPassword: 'synthetic-original' }
    }, outcome: { status: 200 }
  } });
  const controller = new AbortController();
  const pending = dispatcher({ id: 'BYPASS-01' }, { inventory, signal: controller.signal });
  const rejected = assert.rejects(pending, error => error.code === 'INTERNAL_ABORT_EFFECT_FAILED' && error.inventoryEffectsMayBePartial === true);
  controller.abort();
  await rejected;
  assert.equal(inventory.untrackedUsersCount, 1);
  assert.equal(inventory.getUnresolvedOperations().length, 1);
  assert.equal(inventory.isClean(), false);
});

test('R14-01: direct inventory method snapshots reject executable nested inputs before mutation', () => {
  const inventory = new TestRunInventory('r14-direct-effect-admission');
  let executions = 0;
  const accessor = Object.defineProperty({}, 'id', { get() { executions++; return 'unsafe'; } });
  const proxy = new Proxy({}, { get() { executions++; }, ownKeys() { executions++; } });
  for (const method of ['protectSeedIdentity', 'registerCreatedUser', 'registerObservedUser', 'registerReferencedUser', 'registerSeedPasswordModification', 'registerInFlightOperation']) {
    assert.throws(() => inventory[method](accessor), /INVALID_INVENTORY_EFFECT/);
    assert.throws(() => inventory[method](proxy), /INVALID_INVENTORY_EFFECT/);
  }
  assert.throws(() => inventory.registerSession({ sessionId: 'session', accessToken() { executions++; } }), /INVALID_INVENTORY_EFFECT/);
  assert.equal(executions, 0);
  assert.equal(inventory.createdUsers.size, 0);
  assert.equal(inventory.trackedSessions.size, 0);
  assert.equal(inventory.inFlightOperations.size, 0);
  const operation = inventory.registerInFlightOperation({ probeId: 'runtime' });
  inventory.settleInFlightOperation(operation.opId, { error: new Error() });
  assert.equal(inventory.inFlightOperations.get(operation.opId).state, 'SETTLED');
});
