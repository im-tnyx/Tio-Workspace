// Offline provider model only. This module defines no HTTP endpoint and never
// dispatches a network request. The caller must separately validate its private
// creation receipt before requesting deletion; expected identity is not a receipt.
import { types } from 'node:util';

// Captured before fixture execution; this bounds prototype mutation after import.
const safeIncludes = Function.prototype.call.bind(Array.prototype.includes);
const safeSlice = Function.prototype.call.bind(Array.prototype.slice);
const safePush = Function.prototype.call.bind(Array.prototype.push);
const safeSplit = Function.prototype.call.bind(String.prototype.split);
const safeStringSlice = Function.prototype.call.bind(String.prototype.slice);
const safeJoin = Function.prototype.call.bind(Array.prototype.join);
const safeStartsWith = Function.prototype.call.bind(String.prototype.startsWith);
const safeLower = Function.prototype.call.bind(String.prototype.toLowerCase);
const safeTest = Function.prototype.call.bind(RegExp.prototype.test);
const safeBufferString = Function.prototype.call.bind(Buffer.prototype.toString);
const safeBufferFrom = Buffer.from;
const safeJsonParse = JSON.parse;
const safeDecodeURIComponent = decodeURIComponent;
const safeKeys = Object.keys;
const safeNames = Object.getOwnPropertyNames;
const safeDescriptor = Object.getOwnPropertyDescriptor;
const safeDefine = Object.defineProperty;
const safeHasOwn = Object.hasOwn;
const safePrototype = Object.getPrototypeOf;
const safeSymbols = Object.getOwnPropertySymbols;
const safeIsArray = Array.isArray;
const safeIsProxy = types.isProxy;
const safeArrayPrototype = Array.prototype;
const safeObjectPrototype = Object.prototype;
const safeDecodeUtf8 = Function.prototype.call.bind(TextDecoder.prototype.decode);
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
function defineData(target, key, value) {
  const descriptor = Object.create(null);
  descriptor.value = value; descriptor.enumerable = true;
  descriptor.writable = false; descriptor.configurable = false;
  safeDefine(target, key, descriptor);
}

const PROVIDERS = new WeakSet();
const PROVIDER_BINDINGS = new WeakMap();
const TRANSPORT_PROVIDERS = new WeakMap();
const TEMP_REF = 'wvdabiwbaavfggcmpizd';
const BUCKET = 'task06i_probe_bucket';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function record(value, keys, required = keys) {
  if (!value || typeof value !== 'object' || safeIsProxy(value) || safeIsArray(value)) throw new Error('INVALID_CONDITIONAL_STORAGE_RECORD');
  const proto = safePrototype(value);
  if (proto !== null && proto !== safeObjectPrototype) throw new Error('INVALID_CONDITIONAL_STORAGE_PROTOTYPE');
  if (safeSymbols(value).length) throw new Error('INVALID_CONDITIONAL_STORAGE_SYMBOL');
  const out = Object.create(null);
  const names = safeNames(value);
  for (let index = 0; index < names.length; index++) {
    const key = names[index];
    if (!safeIncludes(keys, key)) throw new Error('UNKNOWN_CONDITIONAL_STORAGE_FIELD');
    const descriptor = safeDescriptor(value, key);
    if (!descriptor || !safeHasOwn(descriptor, 'value')) throw new Error('INVALID_CONDITIONAL_STORAGE_ACCESSOR');
    out[key] = descriptor.value;
  }
  for (let index = 0; index < required.length; index++) if (!safeHasOwn(out, required[index])) throw new Error('MISSING_CONDITIONAL_STORAGE_FIELD');
  return out;
}

function identity(value) {
  const out = record(value, ['projectRef', 'runId', 'bucket', 'path', 'objectId', 'ownerId']);
  const keys = safeKeys(out);
  for (let index = 0; index < keys.length; index++) if (typeof out[keys[index]] !== 'string' || !out[keys[index]]) throw new Error('INVALID_CONDITIONAL_STORAGE_IDENTITY');
  if (out.projectRef !== TEMP_REF || out.bucket !== BUCKET || !safeTest(/^[a-zA-Z0-9_-]+$/, out.runId) || out.path !== `${out.runId}/probe.txt`) throw new Error('CONDITIONAL_STORAGE_SCOPE_MISMATCH');
  const objectId = canonicalStorageUuid(out.objectId);
  const ownerId = canonicalStorageUuid(out.ownerId);
  if (!objectId || !ownerId) throw new Error('INVALID_CONDITIONAL_STORAGE_UUID');
  out.objectId = objectId; out.ownerId = ownerId;
  return Object.freeze(out);
}

function location(value) {
  const out = record(value, ['bucket', 'path']);
  if (typeof out.bucket !== 'string' || typeof out.path !== 'string') throw new Error('INVALID_CONDITIONAL_STORAGE_LOCATION');
  return out;
}

function result(status, expected, current = null, deleted = false) {
  return Object.freeze({
    status,
    deleted,
    authoritativeAbsent: status === 'EXPECTED_OBJECT_ABSENT',
    expected: Object.freeze({ ...expected }),
    current: current ? Object.freeze({ ...current }) : null,
    providerContract: 'OFFLINE_ATOMIC_IDENTITY_COMPARE_DELETE_V1',
    hostedCapabilityVerified: false
  });
}

/**
 * Creates an inert-spec-backed provider model. compare+delete is one synchronous
 * controlled transition: it never calls a separate lookup or arbitrary callback.
 * Fixture transition methods are explicit test-provider state controls, not
 * authorization for any hosted operation.
 */
export function createConditionalStorageFixtureProvider(rawSpec) {
  const spec = record(rawSpec, ['projectRef', 'runId', 'objects', 'available', 'responseMode'], ['projectRef', 'runId']);
  if (spec.projectRef !== TEMP_REF || typeof spec.runId !== 'string' || !safeTest(/^[a-zA-Z0-9_-]+$/, spec.runId)) throw new Error('CONDITIONAL_STORAGE_SCOPE_MISMATCH');
  const available = safeHasOwn(spec, 'available') ? spec.available : true;
  if (typeof available !== 'boolean') throw new Error('INVALID_CONDITIONAL_STORAGE_AVAILABILITY');
  const mode = safeHasOwn(spec, 'responseMode') ? spec.responseMode : 'normal';
  if (!safeIncludes(['normal', 'lost_response', 'indeterminate', 'malformed'], mode)) throw new Error('INVALID_CONDITIONAL_STORAGE_RESPONSE_MODE');
  const objects = new Map();
  const unknownObjects = new Set();
  const attempts = [];
  const key = item => `${item.bucket}/${item.path}`;
  function boundIdentity(raw) {
    const item = identity(raw);
    if (item.runId !== spec.runId || item.projectRef !== spec.projectRef) throw new Error('CONDITIONAL_STORAGE_BINDING_MISMATCH');
    return item;
  }
  if (safeHasOwn(spec, 'objects')) {
    if (!safeIsArray(spec.objects) || safeIsProxy(spec.objects) || safePrototype(spec.objects) !== safeArrayPrototype) throw new Error('INVALID_CONDITIONAL_STORAGE_OBJECTS');
    for (let index = 0; index < spec.objects.length; index++) {
      const descriptor = safeDescriptor(spec.objects, String(index));
      if (!descriptor || !safeHasOwn(descriptor, 'value')) throw new Error('INVALID_CONDITIONAL_STORAGE_OBJECTS');
      const item = boundIdentity(descriptor.value);
      if (objects.has(key(item))) throw new Error('DUPLICATE_CONDITIONAL_STORAGE_OBJECT');
      objects.set(key(item), item);
    }
  }
  const provider = {
    // Provisioning and declarative replacement transitions share exactly this Map.
    putObject(raw) {
      const item = boundIdentity(raw);
      objects.set(key(item), item);
      unknownObjects.delete(key(item));
      return item;
    },
    markIndeterminateObject(rawLocation) {
      const item = location(rawLocation);
      unknownObjects.add(key(item));
    },
    // Models an independently observed provider deletion in an offline fixture.
    removeFixtureObject(rawLocation) {
      const item = location(rawLocation);
      unknownObjects.delete(key(item));
      return objects.delete(key(item));
    },
    getObject(rawLocation) {
      return objects.get(key(location(rawLocation))) || null;
    },
    getObjectState(rawLocation) {
      const item = location(rawLocation);
      return Object.freeze({ current: objects.get(key(item)) || null, indeterminate: unknownObjects.has(key(item)) });
    },
    conditionalDelete(rawExpected) {
      const expected = boundIdentity(rawExpected);
      if (!available) return result('CONDITIONAL_DELETE_UNAVAILABLE', expected);
      const current = objects.get(key(expected)) || null;
      // All checks and mutation below execute synchronously without yielding.
      safePush(attempts, Object.freeze({ expected, current }));
      if (mode === 'malformed') return result('CONDITIONAL_DELETE_MALFORMED', expected, current);
      if (mode === 'indeterminate') return result('CONDITIONAL_DELETE_INDETERMINATE', expected, current);
      if (unknownObjects.has(key(expected))) return result('CONDITIONAL_DELETE_INDETERMINATE', expected, current);
      if (!current) return result('EXPECTED_OBJECT_ABSENT', expected);
      if (current.ownerId !== expected.ownerId) return result('OWNER_MISMATCH', expected, current);
      if (current.objectId !== expected.objectId) return result('OBJECT_ID_MISMATCH', expected, current);
      objects.delete(key(expected));
      if (mode === 'lost_response') return result('CONDITIONAL_DELETE_INDETERMINATE', expected, null);
      return result('EXPECTED_OBJECT_DELETED', expected, null, true);
    },
    getSnapshot() {
      return Object.freeze({ objects: Object.freeze([...objects.values()]), attempts: Object.freeze(safeSlice(attempts)) });
    }
  };
  const methods = Object.values(provider);
  for (let index = 0; index < methods.length; index++) Object.freeze(methods[index]);
  Object.freeze(provider);
  PROVIDERS.add(provider);
  PROVIDER_BINDINGS.set(provider, Object.freeze({ projectRef: spec.projectRef, runId: spec.runId }));
  return provider;
}

export function assertConditionalStorageFixtureProvider(candidate) {
  if (!candidate || !PROVIDERS.has(candidate)) throw new Error('UNREGISTERED_CONDITIONAL_STORAGE_PROVIDER');
  return candidate;
}

// Called exactly once while the registered deterministic transport is built.
// A missing declaration is permanently unavailable, not a path-delete fallback.
export function registerConditionalStorageFixtureTransport(transport, spec) {
  if (typeof transport !== 'function' || TRANSPORT_PROVIDERS.has(transport)) throw new Error('CONDITIONAL_STORAGE_TRANSPORT_ALREADY_BOUND');
  TRANSPORT_PROVIDERS.set(transport, spec == null ? null : createConditionalStorageFixtureProvider(spec));
}

export function getConditionalStorageFixtureProvider(transport) {
  return TRANSPORT_PROVIDERS.get(transport) || null;
}

function ownData(value, key) {
  if (!value || typeof value !== 'object' || safeIsProxy(value)) return undefined;
  const descriptor = safeDescriptor(value, key);
  return descriptor && safeHasOwn(descriptor, 'value') ? descriptor.value : undefined;
}
function plainRecord(value) {
  return value !== null && typeof value === 'object' && !safeIsProxy(value) &&
    (safePrototype(value) === null || safePrototype(value) === safeObjectPrototype);
}
export function canonicalStorageUuid(value) {
  return typeof value === 'string' && safeTest(UUID, value) ? safeLower(value) : null;
}
function parseJsonEvidence(text) {
  if (typeof text !== 'string') return null;
  try { return safeJsonParse(text); }
  catch (error) { if (error instanceof SyntaxError) return null; throw error; }
}

// Structural encoding validation only, never cryptographic signature verification.
function canonicalBytes(part) {
  if (typeof part !== 'string' || !safeTest(/^[A-Za-z0-9_-]+$/, part) || part.length % 4 === 1) return null;
  const bytes = safeBufferFrom(part, 'base64url');
  return safeBufferString(bytes, 'base64url') === part ? bytes : null;
}
function jsonRecordBytes(bytes) {
  if (!bytes) return null;
  let text;
  try { text = safeDecodeUtf8(utf8Decoder, bytes); }
  catch (error) { if (error instanceof TypeError) return null; throw error; }
  const value = parseJsonEvidence(text);
  return plainRecord(value) ? value : null;
}
const safeFreeze = Object.freeze;
const safeIsFinite = Number.isFinite;
function snapshotJwtClaimValue(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return safeIsFinite(value) ? value : undefined;
  if (!value || typeof value !== 'object' || safeIsProxy(value)) return undefined;
  const proto = safePrototype(value);
  if (safeIsArray(value)) {
    if (proto !== safeArrayPrototype) return undefined;
    const out = [];
    for (let index = 0; index < value.length; index++) {
      const descriptor = safeDescriptor(value, String(index));
      if (!descriptor || !safeHasOwn(descriptor, 'value')) return undefined;
      const item = snapshotJwtClaimValue(descriptor.value);
      if (item === undefined) return undefined;
      defineData(out, String(index), item);
    }
    return safeFreeze(out);
  }
  if (proto !== null && proto !== safeObjectPrototype) return undefined;
  const out = Object.create(null);
  const keys = safeNames(value);
  for (let index = 0; index < keys.length; index++) {
    const key = keys[index];
    if (key === '__proto__') return undefined;
    const descriptor = safeDescriptor(value, key);
    if (!descriptor || !safeHasOwn(descriptor, 'value')) return undefined;
    const prop = snapshotJwtClaimValue(descriptor.value);
    if (prop === undefined) return undefined;
    defineData(out, key, prop);
  }
  return safeFreeze(out);
}
export function decodeOfflineJwtClaims(token) {
  if (typeof token !== 'string') return null;
  const parts = safeSplit(token, '.');
  if (parts.length !== 3) return null;
  const headerBytes = canonicalBytes(parts[0]);
  const payloadBytes = canonicalBytes(parts[1]);
  const signatureBytes = canonicalBytes(parts[2]);
  if (!headerBytes || !payloadBytes || !signatureBytes) return null;
  const header = jsonRecordBytes(headerBytes);
  const claims = jsonRecordBytes(payloadBytes);
  if (!header || !claims) return null;
  const algorithm = ownData(header, 'alg');
  if (typeof algorithm !== 'string' || !algorithm || safeLower(algorithm) === 'none' ||
      safeHasOwn(header, 'crit') || (safeHasOwn(header, 'b64') && ownData(header, 'b64') !== true)) return null;
  const snapshot = snapshotJwtClaimValue(claims);
  return snapshot || null;
}

export function extractOfflineStorageObjectId(row) {
  if (!plainRecord(row)) return { valid: false, reason: 'OBJECT_ID_MISSING', objectId: null };
  const upper = safeDescriptor(row, 'Id');
  const lower = safeDescriptor(row, 'id');
  if (!upper && !lower) return { valid: false, reason: 'OBJECT_ID_MISSING', objectId: null };
  const upperId = upper && safeHasOwn(upper, 'value') ? canonicalStorageUuid(upper.value) : null;
  const lowerId = lower && safeHasOwn(lower, 'value') ? canonicalStorageUuid(lower.value) : null;
  if ((upper && !upperId) || (lower && !lowerId)) return { valid: false, reason: 'OBJECT_ID_INVALID', objectId: null };
  if (upper && lower && upperId !== lowerId) return { valid: false, reason: 'OBJECT_ID_CONFLICT', objectId: null };
  return { valid: true, reason: null, objectId: upper ? upperId : lowerId };
}

function uploadIdentity(provider, request, response, bucket, path) {
  const binding = PROVIDER_BINDINGS.get(provider);
  let target;
  try { target = new URL(request.url); }
  catch (error) { if (error instanceof TypeError) return { reason: 'UPLOAD_SCOPE_MISMATCH' }; throw error; }
  if (target.protocol !== 'https:' || target.hostname !== `${binding.projectRef}.supabase.co` || target.port ||
      target.username || target.password || bucket !== BUCKET || path !== `${binding.runId}/probe.txt`) {
    return { reason: 'UPLOAD_SCOPE_MISMATCH' };
  }
  let row = ownData(response, 'json') ?? ownData(response, 'body');
  if (row == null) row = parseJsonEvidence(ownData(response, 'text'));
  const object = extractOfflineStorageObjectId(row);
  if (!object.valid) return { reason: object.reason };
  const authorization = ownData(request.headers, 'authorization');
  if (typeof authorization !== 'string' || !safeTest(/^Bearer [A-Za-z0-9_.-]+$/, authorization)) return { reason: 'OWNER_TOKEN_INVALID' };
  const claims = decodeOfflineJwtClaims(safeStringSlice(authorization, 7));
  const ownerId = canonicalStorageUuid(ownData(claims, 'sub'));
  if (!ownerId) return { reason: 'OWNER_SUBJECT_INVALID' };
  return { identity: { ...binding, bucket, path, objectId: object.objectId, ownerId } };
}

export function observeConditionalStorageUpload(transport, request, response) {
  const provider = getConditionalStorageFixtureProvider(transport);
  if (!provider || request.method !== 'POST' || !safeStartsWith(request.pathname, '/storage/v1/object/')) return null;
  const status = typeof response.status === 'number' ? response.status : 200;
  if (status < 200 || status >= 300 || response.throwError) return null;
  let segments;
  try {
    segments = safeSplit(safeStringSlice(request.pathname, '/storage/v1/object/'.length), '/');
    for (let index = 0; index < segments.length; index++) segments[index] = safeDecodeURIComponent(segments[index]);
  }
  catch (error) { if (error instanceof URIError) return { status: 'UPLOAD_IDENTITY_INDETERMINATE', reason: 'UPLOAD_SCOPE_MALFORMED' }; throw error; }
  const bucket = segments[0];
  const path = safeJoin(safeSlice(segments, 1), '/');
  provider.markIndeterminateObject({ bucket, path });
  const observation = uploadIdentity(provider, request, response, bucket, path);
  const admittedIdentity = ownData(observation, 'identity');
  if (!admittedIdentity) return { status: 'UPLOAD_IDENTITY_INDETERMINATE', reason: ownData(observation, 'reason') };
  // Expected invalid evidence returned above; genuine internal failures propagate.
  provider.putObject(admittedIdentity);
  return { status: 'UPLOAD_IDENTITY_OBSERVED', cryptographicallyVerified: false };
}
