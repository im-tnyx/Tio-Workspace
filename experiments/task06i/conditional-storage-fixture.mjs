// Offline provider model only. This module defines no HTTP endpoint and never
// dispatches a network request. The caller must separately validate its private
// creation receipt before requesting deletion; expected identity is not a receipt.
import { types } from 'node:util';

const PROVIDERS = new WeakSet();
const PROVIDER_BINDINGS = new WeakMap();
const TRANSPORT_PROVIDERS = new WeakMap();
const TEMP_REF = 'wvdabiwbaavfggcmpizd';
const BUCKET = 'task06i_probe_bucket';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function record(value, keys, required = keys) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || Array.isArray(value)) throw new Error('INVALID_CONDITIONAL_STORAGE_RECORD');
  const proto = Object.getPrototypeOf(value);
  if (proto !== null && proto !== Object.prototype) throw new Error('INVALID_CONDITIONAL_STORAGE_PROTOTYPE');
  if (Object.getOwnPropertySymbols(value).length) throw new Error('INVALID_CONDITIONAL_STORAGE_SYMBOL');
  const out = Object.create(null);
  for (const key of Object.getOwnPropertyNames(value)) {
    if (!keys.includes(key)) throw new Error('UNKNOWN_CONDITIONAL_STORAGE_FIELD');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw new Error('INVALID_CONDITIONAL_STORAGE_ACCESSOR');
    out[key] = descriptor.value;
  }
  for (const key of required) if (!Object.hasOwn(out, key)) throw new Error('MISSING_CONDITIONAL_STORAGE_FIELD');
  return out;
}

function identity(value) {
  const out = record(value, ['projectRef', 'runId', 'bucket', 'path', 'objectId', 'ownerId']);
  for (const key of Object.keys(out)) if (typeof out[key] !== 'string' || !out[key]) throw new Error('INVALID_CONDITIONAL_STORAGE_IDENTITY');
  if (out.projectRef !== TEMP_REF || out.bucket !== BUCKET || !/^[a-zA-Z0-9_-]+$/.test(out.runId) || out.path !== `${out.runId}/probe.txt`) throw new Error('CONDITIONAL_STORAGE_SCOPE_MISMATCH');
  if (!UUID.test(out.objectId) || !UUID.test(out.ownerId)) throw new Error('INVALID_CONDITIONAL_STORAGE_UUID');
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
  if (spec.projectRef !== TEMP_REF || typeof spec.runId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(spec.runId)) throw new Error('CONDITIONAL_STORAGE_SCOPE_MISMATCH');
  const available = Object.hasOwn(spec, 'available') ? spec.available : true;
  if (typeof available !== 'boolean') throw new Error('INVALID_CONDITIONAL_STORAGE_AVAILABILITY');
  const mode = Object.hasOwn(spec, 'responseMode') ? spec.responseMode : 'normal';
  if (!['normal', 'lost_response', 'indeterminate', 'malformed'].includes(mode)) throw new Error('INVALID_CONDITIONAL_STORAGE_RESPONSE_MODE');
  const objects = new Map();
  const unknownObjects = new Set();
  const attempts = [];
  const key = item => `${item.bucket}/${item.path}`;
  function boundIdentity(raw) {
    const item = identity(raw);
    if (item.runId !== spec.runId || item.projectRef !== spec.projectRef) throw new Error('CONDITIONAL_STORAGE_BINDING_MISMATCH');
    return item;
  }
  if (Object.hasOwn(spec, 'objects')) {
    if (!Array.isArray(spec.objects) || types.isProxy(spec.objects) || Object.getPrototypeOf(spec.objects) !== Array.prototype) throw new Error('INVALID_CONDITIONAL_STORAGE_OBJECTS');
    for (let index = 0; index < spec.objects.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(spec.objects, String(index));
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw new Error('INVALID_CONDITIONAL_STORAGE_OBJECTS');
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
      attempts.push(Object.freeze({ expected, current }));
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
      return Object.freeze({ objects: Object.freeze([...objects.values()]), attempts: Object.freeze(attempts.slice()) });
    }
  };
  for (const method of Object.values(provider)) Object.freeze(method);
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
  if (!value || typeof value !== 'object' || types.isProxy(value)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
}
function plainRecord(value) {
  return value !== null && typeof value === 'object' && !types.isProxy(value) &&
    [null, Object.prototype].includes(Object.getPrototypeOf(value));
}
function uuid(value) {
  return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null;
}
function parseJsonEvidence(text) {
  if (typeof text !== 'string') return null;
  try { return JSON.parse(text); }
  catch (error) { if (error instanceof SyntaxError) return null; throw error; }
}

// Structural decoding only, never cryptographic signature verification.
export function decodeOfflineJwtClaims(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) return null;
  const decode = part => {
    if (part.length % 4 === 1) return null;
    const bytes = Buffer.from(part, 'base64url');
    if (bytes.toString('base64url') !== part) return null;
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch (error) { if (error instanceof TypeError) return null; throw error; }
    return parseJsonEvidence(text);
  };
  const header = decode(parts[0]);
  const claims = decode(parts[1]);
  if (!plainRecord(header) || !plainRecord(claims)) return null;
  const algorithm = ownData(header, 'alg');
  if (typeof algorithm !== 'string' || !algorithm || algorithm.toLowerCase() === 'none' ||
      Object.hasOwn(header, 'crit') || (Object.hasOwn(header, 'b64') && ownData(header, 'b64') !== true)) return null;
  // JSON.parse creates own data properties; copy only those into an inert record.
  const snapshot = Object.create(null);
  for (const key of Object.keys(claims)) Object.defineProperty(snapshot, key, { value: ownData(claims, key), enumerable: true });
  return snapshot;
}

export function extractOfflineStorageObjectId(row) {
  if (!plainRecord(row)) return { valid: false, reason: 'OBJECT_ID_MISSING', objectId: null };
  const fields = ['Id', 'id'].filter(key => Object.hasOwn(row, key));
  if (!fields.length) return { valid: false, reason: 'OBJECT_ID_MISSING', objectId: null };
  const ids = fields.map(key => uuid(ownData(row, key)));
  if (ids.some(id => id === null)) return { valid: false, reason: 'OBJECT_ID_INVALID', objectId: null };
  if (ids.some(id => id !== ids[0])) return { valid: false, reason: 'OBJECT_ID_CONFLICT', objectId: null };
  return { valid: true, reason: null, objectId: ids[0] };
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
  if (typeof authorization !== 'string' || !/^Bearer [A-Za-z0-9_.-]+$/.test(authorization)) return { reason: 'OWNER_TOKEN_INVALID' };
  const claims = decodeOfflineJwtClaims(authorization.slice(7));
  const ownerId = uuid(ownData(claims, 'sub'));
  if (!ownerId) return { reason: 'OWNER_SUBJECT_INVALID' };
  return { identity: { ...binding, bucket, path, objectId: object.objectId, ownerId } };
}

export function observeConditionalStorageUpload(transport, request, response) {
  const provider = getConditionalStorageFixtureProvider(transport);
  if (!provider || request.method !== 'POST' || !request.pathname.startsWith('/storage/v1/object/')) return null;
  const status = typeof response.status === 'number' ? response.status : 200;
  if (status < 200 || status >= 300 || response.throwError) return null;
  let segments;
  try { segments = request.pathname.slice('/storage/v1/object/'.length).split('/').map(decodeURIComponent); }
  catch (error) { if (error instanceof URIError) return { status: 'UPLOAD_IDENTITY_INDETERMINATE', reason: 'UPLOAD_SCOPE_MALFORMED' }; throw error; }
  const bucket = segments.shift();
  const path = segments.join('/');
  provider.markIndeterminateObject({ bucket, path });
  const observation = uploadIdentity(provider, request, response, bucket, path);
  const admittedIdentity = ownData(observation, 'identity');
  if (!admittedIdentity) return { status: 'UPLOAD_IDENTITY_INDETERMINATE', reason: ownData(observation, 'reason') };
  // Expected invalid evidence returned above; genuine internal failures propagate.
  provider.putObject(admittedIdentity);
  return { status: 'UPLOAD_IDENTITY_OBSERVED', cryptographicallyVerified: false };
}
