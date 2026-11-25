import { types } from 'node:util';

function invalid(path, reason) {
  throw new Error(`INVALID_INVENTORY_EFFECT: ${path}: ${reason}`);
}

/** Copies own data descriptors only, before any field inspection or mutation. */
export function snapshotInventoryEffectData(value, path = 'effects', seen = new WeakSet()) {
  if (value === null || value === undefined || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object') invalid(path, 'expected inert data');
  if (types.isProxy(value)) invalid(path, 'Proxy rejected');
  const proto = Object.getPrototypeOf(value);
  if (proto !== null && proto !== Object.prototype && !(Array.isArray(value) && proto === Array.prototype)) invalid(path, 'unsupported prototype');
  if (seen.has(value)) invalid(path, 'cycle rejected');
  if (Object.getOwnPropertySymbols(value).length) invalid(path, 'symbol keys rejected');
  seen.add(value);
  const result = Array.isArray(value) ? [] : Object.create(null);
  for (const key of Object.getOwnPropertyNames(value)) {
    if (Array.isArray(value) && key === 'length') continue;
    if (key === '__proto__') invalid(path, 'prototype-sensitive key rejected');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) invalid(path, 'accessor rejected');
    Object.defineProperty(result, key, {
      value: snapshotInventoryEffectData(descriptor.value, `${path}.${key}`, seen),
      enumerable: true, writable: true, configurable: true
    });
  }
  seen.delete(value);
  return result;
}

/** Direct inventory calls retain their existing semantic errors/ownership fallbacks. */
export function snapshotDirectInventoryInput(raw, label = 'inventory', allowRuntimeError = false) {
  if (raw === undefined || raw === null) return Object.create(null);
  if (types.isProxy(raw) || typeof raw !== 'object' || Array.isArray(raw)) invalid(label, 'expected own data record');
  const proto = Object.getPrototypeOf(raw);
  if (proto !== null && proto !== Object.prototype) invalid(label, 'unsupported prototype');
  if (!allowRuntimeError) return snapshotInventoryEffectData(raw, label);
  const safe = Object.create(null);
  for (const key of Object.getOwnPropertyNames(raw)) {
    const descriptor = Object.getOwnPropertyDescriptor(raw, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) invalid(label, 'accessor rejected');
    let value = descriptor.value;
    if (key === 'error' && value && typeof value === 'object' && !types.isProxy(value) && types.isNativeError(value)) {
      const error = Object.create(null);
      for (const field of ['message', 'name', 'code', 'status']) {
        const own = Object.getOwnPropertyDescriptor(value, field);
        if (!own) continue;
        if (!Object.hasOwn(own, 'value')) invalid(label, 'runtime Error accessor rejected');
        error[field] = snapshotInventoryEffectData(own.value, `${label}.error.${field}`);
      }
      value = error;
    }
    Object.defineProperty(safe, key, { value, enumerable: true, writable: true, configurable: true });
  }
  if (Object.getOwnPropertySymbols(raw).length) invalid(label, 'symbol keys rejected');
  const snapshot = snapshotInventoryEffectData(safe, label);
  if (snapshot.error && typeof snapshot.error === 'object' && (typeof snapshot.error.message !== 'string' || !snapshot.error.message)) {
    snapshot.error.message = 'Inventory operation failed';
  }
  return snapshot;
}

const string = value => typeof value === 'string';
const nonempty = value => string(value) && value.trim().length > 0;
const boolean = value => typeof value === 'boolean';
const nullable = validator => value => value === null || validator(value);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const inert = value => value === null || ['string', 'boolean', 'number', 'undefined'].includes(typeof value) || typeof value === 'object';
const status = value => Number.isInteger(value) && value >= 0 && value <= 599;
const required = check => ({ check, required: true });
const optional = (check, fallback) => ({ check, required: false, fallback });

function validateRecord(value, schema, path) {
  if (!record(value)) invalid(path, 'expected object record');
  for (const key of Object.keys(value)) if (!Object.hasOwn(schema, key)) invalid(path, `unknown field ${key}`);
  for (const [key, field] of Object.entries(schema)) {
    if (!Object.hasOwn(value, key) || value[key] === undefined) {
      if (field.required) invalid(path, `missing required ${key}`);
      if (Object.hasOwn(field, 'fallback')) value[key] = field.fallback;
    } else if (!field.check(value[key])) invalid(path, `invalid ${key}`);
  }
  return value;
}

const proofSchema = {
  type: required(nonempty), preCheckAbsent: optional(boolean), postCheckPresent: optional(boolean),
  providerReturnedId: optional(nullable(nonempty)), affirmativeCreationConfirmed: optional(boolean),
  absentFromBaseline: optional(boolean), baselineSnapshotId: optional(nullable(nonempty)), timestamp: optional(string)
};
function creationProof(value) {
  if (value === null) return true;
  validateRecord(value, proofSchema, 'creationProof');
  switch (value.type) {
    case 'before_after_check': case 'before_after_correlation': return value.preCheckAbsent === true && value.postCheckPresent === true;
    case 'provider_admin_create': return nonempty(value.providerReturnedId) && value.affirmativeCreationConfirmed === true;
    case 'baseline_set_difference': return value.absentFromBaseline === true && nonempty(value.baselineSnapshotId);
    default: return false;
  }
}
function preexistenceProof(value) {
  if (value === null) return true;
  validateRecord(value, {
    type: required(nonempty), verifiedSeedUserId: optional(nullable(nonempty)), lookupUserId: optional(nullable(nonempty)),
    verifiedUserId: optional(nullable(nonempty)), userId: optional(nullable(nonempty)), preflightVerified: optional(boolean),
    userExistsBeforeRun: optional(boolean), credentialsVerifiedBeforeRun: optional(boolean), timestamp: optional(string)
  }, 'preexistenceProof');
  switch (value.type) {
    case 'preflight_discovery': return nonempty(value.verifiedSeedUserId) && value.preflightVerified === true;
    case 'provider_lookup': return nonempty(value.lookupUserId) && value.userExistsBeforeRun === true;
    case 'seed_credential_verification': return nonempty(value.verifiedUserId) && value.credentialsVerifiedBeforeRun === true;
    default: return false;
  }
}

function settlementError(value) {
  if (value === null || string(value)) return true;
  validateRecord(value, { message: required(nonempty), code: optional(nullable(string)), status: optional(status), name: optional(string) }, 'settlement.error');
  return true;
}
function settlementObservation(value) {
  if (value === null) return true;
  validateRecord(value, {
    classification: optional(nonempty), status: optional(status), hasTokens: optional(boolean),
    sessionId: optional(nullable(nonempty)), userId: optional(nullable(nonempty)), accessToken: optional(nullable(nonempty)),
    refreshToken: optional(nullable(nonempty)), indeterminateSession: optional(boolean), indeterminateUserCreation: optional(boolean),
    errorCode: optional(nullable(string)), error: optional(nullable(string)), body: optional(inert),
    parseStatus: optional(string), parseError: optional(nullable(string))
  }, 'settlement.observed');
  return true;
}
function settlementOutcome(value) {
  if (value === null || string(value)) return true;
  validateRecord(value, {
    status: optional(status), passed: optional(boolean), classification: optional(string), reason: optional(nullable(string)),
    error: optional(settlementError), body: optional(inert), data: optional(inert), result: optional(inert),
    has_token: optional(boolean), hasTokens: optional(boolean), sessionId: optional(nullable(nonempty)), userId: optional(nullable(nonempty))
  }, 'settlement.outcome');
  return true;
}

const schemas = {
  protectSeedIdentity: { id: required(nonempty), email: optional(nullable(nonempty), null), proof: optional(preexistenceProof, null) },
  registerCreatedUser: { id: required(nonempty), email: required(nonempty), source: optional(nonempty, 'test_signup'), creationProof: optional(creationProof, null) },
  registerUnverifiedUser: {
    id: required(nonempty), email: optional(nullable(nonempty), null), source: optional(nonempty, 'observed_response'),
    ownership: optional(value => ['OWNERSHIP_UNKNOWN', 'CREATION_INDETERMINATE'].includes(value), 'OWNERSHIP_UNKNOWN'),
    creationProof: optional(creationProof, null)
  },
  registerSession: {
    sessionId: required(nonempty), id: optional(nonempty), accessToken: optional(nullable(nonempty), null),
    jwt: optional(nullable(nonempty), null), token: optional(nullable(nonempty), null), source: optional(nonempty)
  },
  registerSeedPasswordModification: {
    userId: required(nonempty), email: optional(nullable(nonempty), null), originalPassword: required(nonempty),
    newPassword: optional(nullable(nonempty), null), targetPassword: optional(nullable(nonempty), null),
    state: optional(value => ['pending', 'dispatched', 'confirmed', 'indeterminate', 'restored', 'restoration_failed'].includes(value), 'pending')
  },
  registerInFlightOperation: {
    probeId: optional(nonempty, 'unknown'), endpoint: optional(nullable(nonempty), null), canMintSession: optional(boolean, false),
    canCreateUser: optional(boolean, false), canModifyProviderState: optional(boolean, false), requiresCleanupReconciliation: optional(boolean, false),
    targetUserId: optional(nullable(nonempty), null), description: optional(nullable(string), null), metadata: optional(record)
  },
  settleInFlightOperation: {
    observed: optional(settlementObservation, null), error: optional(settlementError, null), outcome: optional(settlementOutcome, null)
  }
};

/** Complete batch validation precedes the first inventory mutation. No capability is accepted as data. */
export function admitInventoryEffects(rawEffects) {
  const batch = snapshotInventoryEffectData(rawEffects);
  if (!record(batch)) invalid('effects', 'expected object record');
  for (const [name, payload] of Object.entries(batch)) {
    if (name === 'registerUntrackedSession' || name === 'registerUntrackedUser') {
      if (!boolean(payload)) invalid(name, 'expected boolean');
    } else if (Object.hasOwn(schemas, name)) validateRecord(payload, schemas[name], name);
    else invalid('effects', `unknown effect ${name}`);
  }
  if (Object.hasOwn(batch, 'settleInFlightOperation') && !Object.hasOwn(batch, 'registerInFlightOperation')) {
    invalid('effects', 'settlement requires a registered operation in the same batch');
  }
  for (const name of ['protectSeedIdentity', 'registerCreatedUser', 'registerUnverifiedUser', 'registerSeedPasswordModification']) {
    if (batch[name]?.email && !/^[^@\s]+@[^@\s]+\.(invalid|test)$/i.test(batch[name].email)) invalid(name, 'reserved test email required');
  }
  for (const name of ['registerCreatedUser', 'registerUnverifiedUser']) {
    const payload = batch[name];
    if (payload?.creationProof?.type === 'provider_admin_create' && payload.creationProof.providerReturnedId !== payload.id) {
      invalid(name, 'provider creation identity mismatch');
    }
  }
  return batch;
}
