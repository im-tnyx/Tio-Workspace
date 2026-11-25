// Offline provider model only. This module defines no HTTP endpoint and never
// dispatches a network request. The caller must separately validate its private
// creation receipt before requesting deletion; expected identity is not a receipt.
import { types } from 'node:util';

const PROVIDERS = new WeakSet();
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

export function observeConditionalStorageUpload(transport, request, response) {
  const provider = getConditionalStorageFixtureProvider(transport);
  if (!provider || request.method !== 'POST' || !request.pathname.startsWith('/storage/v1/object/')) return;
  const status = typeof response.status === 'number' ? response.status : 200;
  if (status < 200 || status >= 300 || response.throwError) return;
  const segments = request.pathname.slice('/storage/v1/object/'.length).split('/').map(decodeURIComponent);
  const bucket = segments.shift();
  const path = segments.join('/');
  provider.markIndeterminateObject({ bucket, path });
  let row = response.json || response.body;
  if (!row && typeof response.text === 'string') {
    try { row = JSON.parse(response.text); } catch { row = null; }
  }
  const objectId = row && (Object.getOwnPropertyDescriptor(row, 'Id')?.value || Object.getOwnPropertyDescriptor(row, 'id')?.value);
  const authorization = Object.getOwnPropertyDescriptor(request.headers, 'authorization')?.value;
  if (typeof authorization !== 'string' || typeof objectId !== 'string') { provider.markIndeterminateObject({ bucket, path }); return; }
  let ownerId;
  try { ownerId = JSON.parse(Buffer.from(authorization.replace(/^Bearer /i, '').split('.')[1], 'base64url').toString('utf8')).sub; } catch { provider.markIndeterminateObject({ bucket, path }); return; }
  const runId = path.split('/')[0];
  provider.putObject({ projectRef: TEMP_REF, runId, bucket, path, objectId, ownerId });
}
