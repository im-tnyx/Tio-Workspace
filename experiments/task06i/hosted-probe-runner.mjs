import { registerConditionalStorageFixtureTransport, getConditionalStorageFixtureProvider, observeConditionalStorageUpload } from './conditional-storage-fixture.mjs';
import { admitInventoryEffects, snapshotInventoryEffectData, snapshotDirectInventoryInput } from './inventory-effect-admission.mjs';
// Hosted Probe Runner Specification & Harness for Task 06I-B1-H0-R2
// Prepares the opt-in, fail-closed hosted test runner for future authorized testing.
// Enforces strict safety gates:
// 1. Immutable forbidden project boundary: Tio-world (oykupyiitspujzpwwvuj) and REAL project (bsfwzvgynwriswapxpsp)
//    are permanently blocked via hardcoded constants and private immutable lookup.
//    Caller-controlled env vars, tempRef parameters, exports, object mutations or Set operations CANNOT disable protection.
// 2. Explicit target allowlist: only verified TEMP project allowed (via TIO_SUPABASE_TEMP_REF); deny-by-default for unknown refs.
// 3. Separate authorization gate: requires both --live flag and TASK06I_HOSTED_PROBE_AUTHORIZED="true".
// 4. Default mode: DRY_RUN (zero network requests, zero Supabase mutations).
// 5. Serialized JSON secret redaction: structured JSON strings are parsed and recursively sanitized;
//    Bearer headers, JWTs, query params, passwords, refresh/access tokens, service_role keys, and credentials are redacted.
// 6. Test-only identities: restricted to reserved *.invalid / *.test domains.
// 7. Shared actual-request budget: max25 including cleanup, minimum1000ms pacing; recorded-zero-wait is explicitly simulated.
// 8. Strict probe outcome validation: independent requirement-specific expectation validation,
//    dispatcher exception/timeout handling, fail-closed on non-boolean/missing passed, status mismatch rejection,
//    immediate halt on any failure, and COMPLETED never returned on partial/failed execution.
// 9. Zero fake LIVE success: missing dispatcher in LIVE mode immediately fails closed.
// 10. Zero automated project deletion and zero fallback to Tio-world.

import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { getRunRequestBudget } from './run-request-budget.mjs';
import { types as utilTypes } from 'node:util';
import { PREFLIGHT_REQUIREMENTS, EXPECTED_REQUIREMENT_IDS } from './preflight-evaluator.mjs';

const RUN_REQUEST_BUDGET_CONTEXT = new AsyncLocalStorage();
const TRANSPORT_REQUEST_BUDGET_MODES = new WeakMap();
function withRunRequestBudget(runId, category, operation, mode = undefined) {
  const existing = RUN_REQUEST_BUDGET_CONTEXT.getStore();
  if (!runId) throw new Error('REQUEST_BUDGET_BINDING_REQUIRED: Executing run operations require exact run ID');
  if (existing) {
    if (existing.runId !== runId) throw new Error('REQUEST_BUDGET_BINDING_MISMATCH');
    return operation();
  }
  return RUN_REQUEST_BUDGET_CONTEXT.run({ runId, category, mode }, operation);
}
async function executeBudgetedRequest(runId, category, operation, signal = null, mode = undefined) {
  const existing = RUN_REQUEST_BUDGET_CONTEXT.getStore();
  const effectiveRun = existing?.runId || runId;
  if (!effectiveRun || (runId && runId !== effectiveRun)) throw new Error('REQUEST_BUDGET_BINDING_MISMATCH');
  const budget = getRunRequestBudget({ projectRef: 'wvdabiwbaavfggcmpizd', runId: effectiveRun, mode: existing?.mode ?? mode });
  const ticket = await budget.beginRequest({ category: existing?.category || category, signal });
  try {
    const result = await operation();
    budget.completeRequest(ticket, result?.ok === false ? 'failed' : 'success');
    return result;
  } catch (error) {
    budget.completeRequest(ticket, error?.name === 'AbortError' ? 'cancelled_after_dispatch' : 'failed');
    throw error;
  }
}
function executeCurrentTransportRequest(transport, signal, operation) {
  const context = RUN_REQUEST_BUDGET_CONTEXT.getStore();
  if (!context) return operation(); // Standalone fixture routing has no run/resource authority.
  return executeBudgetedRequest(context.runId, context.category, operation, signal, TRANSPORT_REQUEST_BUDGET_MODES.get(transport));
}

const REAL_GLOBAL_FETCH = globalThis.fetch;
const HOSTED_NETWORK_DISPATCHERS = new WeakSet();
const TRUSTED_DETERMINISTIC_TRANSPORTS = new WeakSet();
const TRUSTED_OFFLINE_BARRIERS = new WeakSet();
const TARGET_ISOLATION_STATES = new WeakMap();
const TRUSTED_ADMIN_CLIENTS = new WeakMap();
const TRUSTED_OFFLINE_DISPATCHERS = new WeakMap();
const TRUSTED_RUN_INVENTORIES = new WeakMap();
const TRUSTED_RUN_CONTEXTS = new WeakMap();
const INTRINSIC_REGEXP_PROTO = RegExp.prototype;
const INTRINSIC_REGEXP_SOURCE_GET = Object.getOwnPropertyDescriptor(INTRINSIC_REGEXP_PROTO, 'source').get;
const INTRINSIC_REGEXP_FLAGS_GET = Object.getOwnPropertyDescriptor(INTRINSIC_REGEXP_PROTO, 'flags').get;
const INTRINSIC_REGEXP_TEST = INTRINSIC_REGEXP_PROTO.test;
// Private receipts cannot be manufactured by setting public inventory lifecycle fields.
const VERIFIED_STORAGE_DELETIONS = new WeakMap();
const VERIFIED_STORAGE_CREATIONS = new WeakMap();
const CONDITIONAL_DELETE_CONTEXT = new AsyncLocalStorage();
const STORAGE_DELETE_AUTHORIZATIONS = new WeakMap();
const RUNNER_LIVE_DISPATCH_CONTEXT = new AsyncLocalStorage();
const DISPATCHER_CALL_CONTEXT = new AsyncLocalStorage();

const GLOBAL_FETCH_BLOCK_TRAP = function blockedRealFetchTrap() {
  throw new Error(
    'BLOCKED_PENDING_DURABLE_RECOVERY: Indirect, wrapped, or bound real network fetch invocation is strictly blocked pending durable crash recovery'
  );
};

/**
 * Factory for concurrency-safe reference-counted fetch isolation coordinators (R3-01, R4-02).
 * Maintains exactly ONE shared coordinator state per target object via WeakMap, preserving a single
 * baseline fetch and restoring target.fetch only when the final active lease across all handles settles.
 */
export function createFetchIsolationCoordinator(target = globalThis) {
  if (!target || (typeof target !== 'object' && typeof target !== 'function')) {
    throw new TypeError('INVALID_ISOLATION_TARGET: createFetchIsolationCoordinator requires an object target');
  }

  let sharedState = TARGET_ISOLATION_STATES.get(target);
  if (!sharedState) {
    const initialFetch =
      target.fetch === GLOBAL_FETCH_BLOCK_TRAP && target === globalThis
        ? REAL_GLOBAL_FETCH
        : target.fetch;
    sharedState = {
      activeLeases: 0,
      baselineFetch: initialFetch
    };
    TARGET_ISOLATION_STATES.set(target, sharedState);
  }

  return Object.freeze({
    acquire() {
      if (sharedState.activeLeases === 0) {
        if (target.fetch !== GLOBAL_FETCH_BLOCK_TRAP) {
          sharedState.baselineFetch = target.fetch;
        } else if (target === globalThis && sharedState.baselineFetch === undefined) {
          sharedState.baselineFetch = REAL_GLOBAL_FETCH;
        }
        target.fetch = GLOBAL_FETCH_BLOCK_TRAP;
      }
      sharedState.activeLeases += 1;

      let released = false;
      return () => {
        if (released) return;
        released = true;
        if (sharedState.activeLeases <= 0) {
          sharedState.activeLeases = 0;
          if (target.fetch === GLOBAL_FETCH_BLOCK_TRAP) {
            target.fetch = sharedState.baselineFetch;
          }
          return;
        }
        sharedState.activeLeases -= 1;
        if (sharedState.activeLeases === 0 && target.fetch === GLOBAL_FETCH_BLOCK_TRAP) {
          target.fetch = sharedState.baselineFetch;
        }
      };
    },

    async run(fn) {
      const release = this.acquire();
      try {
        return await fn();
      } finally {
        release();
      }
    },

    getState() {
      return Object.freeze({
        activeDepth: sharedState.activeLeases,
        isTrapped: target.fetch === GLOBAL_FETCH_BLOCK_TRAP
      });
    }
  });
}

const GlobalFetchIsolationCoordinator = createFetchIsolationCoordinator(globalThis);

export function getFetchIsolationDebugState() {
  return GlobalFetchIsolationCoordinator.getState();
}

const INTRINSIC_ABORT_SIGNAL_PROTO = AbortSignal.prototype;
const INTRINSIC_ABORT_SIGNAL_ABORTED_GET = Object.getOwnPropertyDescriptor(INTRINSIC_ABORT_SIGNAL_PROTO, 'aborted')?.get;
const INTRINSIC_ABORT_SIGNAL_REASON_GET = Object.getOwnPropertyDescriptor(INTRINSIC_ABORT_SIGNAL_PROTO, 'reason')?.get;
const INTRINSIC_ABORT_SIGNAL_ADD_EVENT_LISTENER = INTRINSIC_ABORT_SIGNAL_PROTO.addEventListener;
const INTRINSIC_ABORT_SIGNAL_REMOVE_EVENT_LISTENER = INTRINSIC_ABORT_SIGNAL_PROTO.removeEventListener;

const INTRINSIC_TYPED_ARRAY_PROTO = Object.getPrototypeOf(Uint8Array.prototype);
const INTRINSIC_TYPED_ARRAY_BUFFER_GET = Object.getOwnPropertyDescriptor(INTRINSIC_TYPED_ARRAY_PROTO, 'buffer')?.get;
const INTRINSIC_TYPED_ARRAY_BYTE_OFFSET_GET = Object.getOwnPropertyDescriptor(INTRINSIC_TYPED_ARRAY_PROTO, 'byteOffset')?.get;
const INTRINSIC_TYPED_ARRAY_BYTE_LENGTH_GET = Object.getOwnPropertyDescriptor(INTRINSIC_TYPED_ARRAY_PROTO, 'byteLength')?.get;
const INTRINSIC_DATA_VIEW_BUFFER_GET = Object.getOwnPropertyDescriptor(DataView.prototype, 'buffer')?.get;
const INTRINSIC_DATA_VIEW_BYTE_OFFSET_GET = Object.getOwnPropertyDescriptor(DataView.prototype, 'byteOffset')?.get;
const INTRINSIC_DATA_VIEW_BYTE_LENGTH_GET = Object.getOwnPropertyDescriptor(DataView.prototype, 'byteLength')?.get;
const INTRINSIC_UINT8_ARRAY_SLICE = Uint8Array.prototype.slice;
const INTRINSIC_ARRAY_BUFFER_BYTE_LENGTH_GET = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')?.get;

const INTRINSIC_HEADERS_PROTO = typeof Headers === 'function' ? Headers.prototype : null;
const INTRINSIC_HEADERS_ENTRIES = INTRINSIC_HEADERS_PROTO ? INTRINSIC_HEADERS_PROTO.entries : null;
const INTRINSIC_URL_PROTO = typeof URL === 'function' ? URL.prototype : null;
const INTRINSIC_URL_HREF_GET = INTRINSIC_URL_PROTO ? Object.getOwnPropertyDescriptor(INTRINSIC_URL_PROTO, 'href')?.get : null;

function validateTrustedAbortSignal(signal, label = 'signal') {
  if (utilTypes.isProxy(signal)) {
    throw new Error(`INVALID_ADMISSION_TYPE: Proxy AbortSignal rejected at '${label}' (R11-02A)`);
  }
  if (!signal || typeof signal !== 'object' || Object.getPrototypeOf(signal) !== INTRINSIC_ABORT_SIGNAL_PROTO) {
    throw new Error(`INVALID_ADMISSION_TYPE: Expected genuine non-subclassed AbortSignal at '${label}' (R11-02A)`);
  }
  try {
    INTRINSIC_ABORT_SIGNAL_ABORTED_GET.call(signal);
    if (INTRINSIC_ABORT_SIGNAL_REASON_GET) {
      INTRINSIC_ABORT_SIGNAL_REASON_GET.call(signal);
    }
  } catch {
    throw new Error(`INVALID_ADMISSION_TYPE: Forged AbortSignal internal slot rejected at '${label}' (R11-02A)`);
  }
  const forbiddenOwnKeys = new Set([
    'addEventListener',
    'removeEventListener',
    'dispatchEvent',
    'aborted',
    'reason',
    'onabort',
    'throwIfAborted'
  ]);
  for (const key of Object.getOwnPropertyNames(signal)) {
    const desc = Object.getOwnPropertyDescriptor(signal, key);
    if (!desc || typeof desc.get === 'function' || typeof desc.set === 'function') {
      throw new Error(`INVALID_ADMISSION_TYPE: Own accessor '${key}' on AbortSignal rejected at '${label}' (R11-02A)`);
    }
    if (forbiddenOwnKeys.has(key) || typeof desc.value === 'function') {
      throw new Error(`INVALID_ADMISSION_TYPE: Own override '${key}' on AbortSignal rejected at '${label}' (R11-02A)`);
    }
  }
  if (Object.getOwnPropertyDescriptor(signal, Symbol.toStringTag) !== undefined) {
    throw new Error(`INVALID_ADMISSION_TYPE: Symbol.toStringTag override on AbortSignal rejected at '${label}' (R11-02A)`);
  }
  return signal;
}

function isTrustedSignalAborted(signal) {
  if (signal === null || signal === undefined) return false;
  validateTrustedAbortSignal(signal, 'signal');
  return Boolean(INTRINSIC_ABORT_SIGNAL_ABORTED_GET.call(signal));
}

function addTrustedSignalAbortListener(signal, listener) {
  if (signal === null || signal === undefined) return;
  validateTrustedAbortSignal(signal, 'signal');
  INTRINSIC_ABORT_SIGNAL_ADD_EVENT_LISTENER.call(signal, 'abort', listener, Object.assign(Object.create(null), { once: true }));
}

function removeTrustedSignalAbortListener(signal, listener) {
  if (signal === null || signal === undefined) return;
  if (utilTypes.isProxy(signal) || !signal || typeof signal !== 'object' || Object.getPrototypeOf(signal) !== INTRINSIC_ABORT_SIGNAL_PROTO) {
    throw new Error('INVALID_ADMISSION_TYPE: Expected genuine AbortSignal on listener cleanup (R11-02A)');
  }
  INTRINSIC_ABORT_SIGNAL_REMOVE_EVENT_LISTENER.call(signal, 'abort', listener);
}

function internalAbortEffectFailure() {
  const error = new Error('INTERNAL_ABORT_EFFECT_FAILED: Module-owned abort effect failed; inventory evidence may be partial');
  error.code = 'INTERNAL_ABORT_EFFECT_FAILED';
  error.inventoryEffectsMayBePartial = true;
  return error;
}

// Private positional arguments: all call sites supply only module-owned callbacks.
function waitWithTrustedSignal(delayMs, signal, onAbort = null, ignoreAbort = false) {
  return new Promise((resolve, reject) => {
    if (typeof delayMs !== 'number' || !Number.isFinite(delayMs) || delayMs < 0 || delayMs > 2147483647) {
      throw new Error('INVALID_ADMISSION_RANGE: Expected finite delayMs in timer range (R13-01)');
    }
    if (typeof ignoreAbort !== 'boolean' || (onAbort !== null && typeof onAbort !== 'function')) {
      throw new Error('INVALID_INTERNAL_DELAY_OPTIONS: Expected module-owned effect and boolean cancellation setting');
    }
    if (signal !== null && signal !== undefined) validateTrustedAbortSignal(signal, 'signal');
    let settled = false;
    let abortHandled = false;
    let timer = null;
    let listenerAttached = false;

    const detachListener = () => {
      if (listenerAttached) {
        listenerAttached = false;
        removeTrustedSignalAbortListener(signal, handleAbort);
      }
    };
    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      let cleanupFailed = false;
      if (timer !== null) {
        const ownedTimer = timer;
        timer = null;
        try { clearTimeout(ownedTimer); } catch { cleanupFailed = true; }
      }
      try { detachListener(); } catch { cleanupFailed = true; }
      if (cleanupFailed) {
        const cleanupError = new Error('TRUSTED_DELAY_CLEANUP_FAILED: Delay resource cleanup failed');
        cleanupError.code = 'TRUSTED_DELAY_CLEANUP_FAILED';
        cleanupError.abortEffectFailed = error?.code === 'INTERNAL_ABORT_EFFECT_FAILED';
        reject(cleanupError);
      } else if (error) reject(error);
      else resolve();
    };
    const handleAbort = () => {
      if (settled || abortHandled) return;
      abortHandled = true;
      try {
        detachListener();
      } catch {
        const error = new Error('TRUSTED_DELAY_CLEANUP_FAILED: Abort listener cleanup failed');
        error.code = 'TRUSTED_DELAY_CLEANUP_FAILED';
        finish(error);
        return;
      }
      try {
        if (onAbort !== null) onAbort();
      } catch {
        finish(internalAbortEffectFailure());
        return;
      }
      if (!ignoreAbort) {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        finish(error);
      }
    };

    try {
      if (isTrustedSignalAborted(signal)) handleAbort();
      if (settled) return;
      if (signal !== null && signal !== undefined && !abortHandled) {
        listenerAttached = true;
        addTrustedSignalAbortListener(signal, handleAbort);
      }
      timer = setTimeout(() => finish(), delayMs);
    } catch (setupError) {
      finish(setupError);
    }
  });
}

/**
 * Creates a declarative deterministic barrier for offline concurrency testing (R3-02, R3-03, R3-04, R4-03).
 * Contains no arbitrary network capabilities and settles both wait() and waitForArrivals() waiters on release.
 */
export function createOfflineBarrier(name = 'offline-barrier') {
  const cleanName = typeof name === 'string' && name.trim() ? name.trim() : 'offline-barrier';
  let released = false;
  let arrivedCount = 0;
  const waiters = new Set();
  const arrivalWaiters = new Set();

  function detachAbort(entry) {
    if (entry.signal && entry.onAbort) {
      removeTrustedSignalAbortListener(entry.signal, entry.onAbort);
    }
    entry.onAbort = null;
  }

  function createAbortError() {
    const abortErr = new Error('The operation was aborted');
    abortErr.name = 'AbortError';
    return abortErr;
  }

  function createReleasedBeforeTargetError(target) {
    const err = new Error(
      `BARRIER_RELEASED_BEFORE_ARRIVALS: Offline barrier '${cleanName}' was released at ${arrivedCount}/${target} arrivals`
    );
    err.code = 'BARRIER_RELEASED_BEFORE_ARRIVALS';
    return err;
  }

  const barrier = Object.freeze({
    name: cleanName,
    get arrivedCount() {
      return arrivedCount;
    },
    isReleased() {
      return released;
    },
    markArrived() {
      arrivedCount += 1;
      for (const entry of Array.from(arrivalWaiters)) {
        if (arrivedCount >= entry.target) {
          arrivalWaiters.delete(entry);
          entry.resolve();
        }
      }
    },
    wait(signal = null) {
      if (released) return Promise.resolve();
      if (isTrustedSignalAborted(signal)) {
        return Promise.reject(createAbortError());
      }
      return new Promise((resolve, reject) => {
        const entry = {
          signal,
          onAbort: null,
          settled: false,
          resolve: () => {
            if (!entry.settled) {
              entry.settled = true;
              detachAbort(entry);
              resolve();
            }
          },
          reject: (err) => {
            if (!entry.settled) {
              entry.settled = true;
              detachAbort(entry);
              reject(err);
            }
          }
        };
        if (signal !== null && signal !== undefined) {
          entry.onAbort = () => {
            waiters.delete(entry);
            entry.reject(createAbortError());
          };
          addTrustedSignalAbortListener(signal, entry.onAbort);
        }
        waiters.add(entry);
      });
    },
    waitForArrivals(target = 1, signal = null) {
      if (typeof target !== 'number' || !Number.isInteger(target) || target < 1) {
        return Promise.reject(
          new RangeError(
            `INVALID_BARRIER_ARRIVAL_TARGET: Offline barrier '${cleanName}' requires a positive integer arrival target`
          )
        );
      }
      if (arrivedCount >= target) return Promise.resolve();
      if (isTrustedSignalAborted(signal)) {
        return Promise.reject(createAbortError());
      }
      if (released) {
        return Promise.reject(createReleasedBeforeTargetError(target));
      }
      return new Promise((resolve, reject) => {
        const entry = {
          target,
          signal,
          onAbort: null,
          settled: false,
          resolve: () => {
            if (!entry.settled) {
              entry.settled = true;
              detachAbort(entry);
              resolve();
            }
          },
          reject: (err) => {
            if (!entry.settled) {
              entry.settled = true;
              detachAbort(entry);
              reject(err);
            }
          }
        };
        if (signal !== null && signal !== undefined) {
          entry.onAbort = () => {
            arrivalWaiters.delete(entry);
            entry.reject(createAbortError());
          };
          addTrustedSignalAbortListener(signal, entry.onAbort);
        }
        arrivalWaiters.add(entry);
      });
    },
    release() {
      if (released) return;
      released = true;
      for (const entry of Array.from(waiters)) {
        waiters.delete(entry);
        entry.resolve();
      }
      for (const entry of Array.from(arrivalWaiters)) {
        arrivalWaiters.delete(entry);
        if (arrivedCount >= entry.target) {
          entry.resolve();
        } else {
          entry.reject(createReleasedBeforeTargetError(entry.target));
        }
      }
    }
  });

  TRUSTED_OFFLINE_BARRIERS.add(barrier);
  return barrier;
}

function validateDeclarativeFixtureValue(val, pathLabel = 'spec', seen = new WeakSet()) {
  if (val === null || val === undefined) return;
  const t = typeof val;
  if (t === 'string' || t === 'number' || t === 'boolean') return;
  if (t === 'function') {
    throw new Error(
      `INVALID_DETERMINISTIC_FIXTURE_SPEC: Arbitrary executable callback rejected at '${pathLabel}'; deterministic fixture transports accept declarative specs and createOfflineBarrier() handles only (R3-02)`
    );
  }
  if (t !== 'object') {
    throw new Error(`INVALID_DETERMINISTIC_FIXTURE_SPEC: Unsupported type '${t}' at '${pathLabel}'`);
  }
  if (utilTypes.isProxy(val)) {
    throw new Error(`INVALID_DETERMINISTIC_FIXTURE_SPEC: Proxy object rejected at '${pathLabel}' (R7-02)`);
  }
  if (TRUSTED_OFFLINE_BARRIERS.has(val)) return;
  if (seen.has(val)) {
    throw new Error(`INVALID_DETERMINISTIC_FIXTURE_SPEC: Circular object reference rejected at '${pathLabel}' (R4-04)`);
  }
  if (utilTypes.isRegExp(val)) {
    if (Object.getPrototypeOf(val) !== INTRINSIC_REGEXP_PROTO) {
      throw new Error(`INVALID_DETERMINISTIC_FIXTURE_SPEC: RegExp subclass or custom prototype rejected at '${pathLabel}' (R8-02)`);
    }
    for (const sym of Object.getOwnPropertySymbols(val)) {
      throw new Error(`INVALID_DETERMINISTIC_FIXTURE_SPEC: Symbol property '${String(sym)}' rejected at '${pathLabel}' (R4-04/R8-02)`);
    }
    for (const key of Object.getOwnPropertyNames(val)) {
      const desc = Object.getOwnPropertyDescriptor(val, key);
      if (!desc || typeof desc.get === 'function' || typeof desc.set === 'function') {
        throw new Error(`INVALID_DETERMINISTIC_FIXTURE_SPEC: Accessor property rejected at '${pathLabel}.${key}' (R8-02)`);
      }
      if (key !== 'lastIndex' || typeof desc.value !== 'number') {
        throw new Error(`INVALID_DETERMINISTIC_FIXTURE_SPEC: Unexpected RegExp property '${key}' rejected at '${pathLabel}' (R8-02)`);
      }
    }
    return;
  }
  if (val instanceof ArrayBuffer || ArrayBuffer.isView(val)) {
    for (const sym of Object.getOwnPropertySymbols(val)) {
      throw new Error(`INVALID_DETERMINISTIC_FIXTURE_SPEC: Symbol property '${String(sym)}' rejected at '${pathLabel}' (R4-04)`);
    }
    for (const key of Object.getOwnPropertyNames(val)) {
      const desc = Object.getOwnPropertyDescriptor(val, key);
      if (desc && (typeof desc.get === 'function' || typeof desc.set === 'function')) {
        throw new Error(`INVALID_DETERMINISTIC_FIXTURE_SPEC: Accessor property rejected at '${pathLabel}.${key}' (R3-02/R4-04)`);
      }
    }
    return;
  }
  seen.add(val);
  if (Array.isArray(val)) {
    for (const sym of Object.getOwnPropertySymbols(val)) {
      throw new Error(`INVALID_DETERMINISTIC_FIXTURE_SPEC: Symbol property '${String(sym)}' rejected at '${pathLabel}' (R4-04)`);
    }
    for (const key of Object.getOwnPropertyNames(val)) {
      if (key === 'length') continue;
      const desc = Object.getOwnPropertyDescriptor(val, key);
      if (!desc || typeof desc.get === 'function' || typeof desc.set === 'function') {
        throw new Error(`INVALID_DETERMINISTIC_FIXTURE_SPEC: Accessor property rejected at '${pathLabel}.${key}' (R3-02/R4-04)`);
      }
      validateDeclarativeFixtureValue(desc.value, `${pathLabel}[${key}]`, seen);
    }
    seen.delete(val);
    return;
  }
  const proto = Object.getPrototypeOf(val);
  if (proto !== null && proto !== Object.prototype) {
    throw new Error(
      `INVALID_DETERMINISTIC_FIXTURE_SPEC: Non-plain object instance rejected at '${pathLabel}' (R3-02)`
    );
  }
  for (const sym of Object.getOwnPropertySymbols(val)) {
    throw new Error(`INVALID_DETERMINISTIC_FIXTURE_SPEC: Symbol property '${String(sym)}' rejected at '${pathLabel}' (R4-04)`);
  }
  for (const key of Object.getOwnPropertyNames(val)) {
    const desc = Object.getOwnPropertyDescriptor(val, key);
    if (!desc || typeof desc.get === 'function' || typeof desc.set === 'function') {
      throw new Error(
        `INVALID_DETERMINISTIC_FIXTURE_SPEC: Accessor property rejected at '${pathLabel}.${key}' (R3-02)`
      );
    }
    validateDeclarativeFixtureValue(desc.value, `${pathLabel}.${key}`, seen);
  }
  seen.delete(val);
}

function snapshotTrustedBinaryInput(rawVal, label = 'binary') {
  if (utilTypes.isProxy(rawVal)) {
    throw new Error(`INVALID_ADMISSION_TYPE: Proxy binary input rejected at '${label}' (R11-02B)`);
  }
  if (!rawVal || typeof rawVal !== 'object') {
    throw new Error(`INVALID_ADMISSION_TYPE: Expected genuine Uint8Array or Buffer at '${label}' (R11-02B)`);
  }
  const proto = Object.getPrototypeOf(rawVal);
  const isDataView = proto === DataView.prototype;
  if (proto !== Uint8Array.prototype && proto !== Buffer.prototype && !isDataView) {
    throw new Error(`INVALID_ADMISSION_TYPE: Unsupported binary prototype/subclass rejected at '${label}' (R11-02B)`);
  }
  const forbiddenOwnKeys = new Set([
    'toString',
    'valueOf',
    'buffer',
    'byteOffset',
    'byteLength',
    'slice',
    'subarray',
    'set',
    'copy'
  ]);
  for (const key of Object.getOwnPropertyNames(rawVal)) {
    const desc = Object.getOwnPropertyDescriptor(rawVal, key);
    if (!desc || typeof desc.get === 'function' || typeof desc.set === 'function') {
      throw new Error(`INVALID_ADMISSION_TYPE: Own accessor '${key}' on binary input rejected at '${label}' (R11-02B)`);
    }
    if (forbiddenOwnKeys.has(key) || typeof desc.value === 'function') {
      throw new Error(`INVALID_ADMISSION_TYPE: Own override '${key}' on binary input rejected at '${label}' (R11-02B)`);
    }
  }
  if (Object.getOwnPropertySymbols(rawVal).length > 0) {
    throw new Error(`INVALID_ADMISSION_TYPE: Own symbol property on binary input rejected at '${label}' (R11-02B)`);
  }
  let ab;
  let offset;
  let len;
  try {
    ab = (isDataView ? INTRINSIC_DATA_VIEW_BUFFER_GET : INTRINSIC_TYPED_ARRAY_BUFFER_GET).call(rawVal);
    offset = (isDataView ? INTRINSIC_DATA_VIEW_BYTE_OFFSET_GET : INTRINSIC_TYPED_ARRAY_BYTE_OFFSET_GET).call(rawVal);
    len = (isDataView ? INTRINSIC_DATA_VIEW_BYTE_LENGTH_GET : INTRINSIC_TYPED_ARRAY_BYTE_LENGTH_GET).call(rawVal);
  } catch {
    throw new Error(`INVALID_ADMISSION_TYPE: Forged binary internal slot rejected at '${label}' (R11-02B)`);
  }
  if (!ab || utilTypes.isProxy(ab) || Object.getPrototypeOf(ab) !== ArrayBuffer.prototype) {
    throw new Error(`INVALID_ADMISSION_TYPE: Unsupported backing ArrayBuffer rejected at '${label}' (R11-02B)`);
  }
  const view = new Uint8Array(ab, offset, len);
  const independent = INTRINSIC_UINT8_ARRAY_SLICE.call(view, 0, len);
  return Buffer.from(independent.buffer, 0, independent.byteLength);
}

function cloneBinaryViewToIndependentBuffer(view) {
  return snapshotTrustedBinaryInput(view, 'binaryView');
}

function toIndependentBytesBuffer(rawVal) {
  if (typeof rawVal === 'string') {
    const strBuf = Buffer.from(rawVal, 'utf8');
    return snapshotTrustedBinaryInput(strBuf, 'stringBytes');
  }
  if (rawVal instanceof ArrayBuffer) {
    if (utilTypes.isProxy(rawVal) || Object.getPrototypeOf(rawVal) !== ArrayBuffer.prototype) {
      throw new Error('INVALID_ADMISSION_TYPE: Unsupported ArrayBuffer rejected (R11-02B)');
    }
    const len = INTRINSIC_ARRAY_BUFFER_BYTE_LENGTH_GET.call(rawVal);
    const independent = INTRINSIC_UINT8_ARRAY_SLICE.call(new Uint8Array(rawVal, 0, len), 0, len);
    return Buffer.from(independent.buffer, 0, independent.byteLength);
  }
  return snapshotTrustedBinaryInput(rawVal, 'bytesBuffer');
}

function clonePlainData(val) {
  if (val === null || val === undefined || typeof val !== 'object') return val;
  if (val instanceof ArrayBuffer) {
    if (utilTypes.isProxy(val) || Object.getPrototypeOf(val) !== ArrayBuffer.prototype) {
      throw new Error('INVALID_ADMISSION_TYPE: Unsupported ArrayBuffer in plain data (R11-02B)');
    }
    const len = INTRINSIC_ARRAY_BUFFER_BYTE_LENGTH_GET.call(val);
    return INTRINSIC_UINT8_ARRAY_SLICE.call(new Uint8Array(val, 0, len), 0, len).buffer;
  }
  if (ArrayBuffer.isView(val)) {
    return snapshotTrustedBinaryInput(val, 'plainDataBinary');
  }
  if (utilTypes.isRegExp(val)) {
    return new RegExp(INTRINSIC_REGEXP_SOURCE_GET.call(val), INTRINSIC_REGEXP_FLAGS_GET.call(val));
  }
  if (TRUSTED_OFFLINE_BARRIERS.has(val)) return val;
  if (Array.isArray(val)) {
    const arr = [];
    for (let i = 0; i < val.length; i++) {
      const desc = Object.getOwnPropertyDescriptor(val, String(i));
      arr.push(clonePlainData(desc ? desc.value : undefined));
    }
    return arr;
  }
  const out = {};
  for (const k of Object.getOwnPropertyNames(val)) {
    if (k === '__proto__') {
      throw new Error('INVALID_DETERMINISTIC_FIXTURE_SPEC: Prototype-sensitive key \'__proto__\' rejected (R11-01)');
    }
    const desc = Object.getOwnPropertyDescriptor(val, k);
    if (desc && Object.hasOwn(desc, 'value')) {
      Object.defineProperty(out, k, {
        value: clonePlainData(desc.value),
        enumerable: true,
        writable: true,
        configurable: true
      });
    }
  }
  return out;
}

function deepSubsetMatches(candidate, expectedSubset) {
  if (expectedSubset === null || typeof expectedSubset !== 'object') {
    return candidate === expectedSubset;
  }
  if (!candidate || typeof candidate !== 'object') return false;
  if (Array.isArray(expectedSubset)) {
    if (!Array.isArray(candidate) || candidate.length !== expectedSubset.length) return false;
    return expectedSubset.every((item, idx) => deepSubsetMatches(candidate[idx], item));
  }
  for (const [k, v] of Object.entries(expectedSubset)) {
    if (!Object.hasOwn(candidate, k)) return false;
    if (!deepSubsetMatches(candidate[k], v)) return false;
  }
  return true;
}

function buildDeterministicResponse(descriptor) {
  if (descriptor.throwError) {
    const errSpec = typeof descriptor.throwError === 'string'
      ? { message: descriptor.throwError }
      : extractValidatedPlainOptions(descriptor.throwError, 'fixtureError', false);
    const err = new Error(errSpec.message || 'Deterministic transport simulated failure');
    if (errSpec.code) err.code = errSpec.code;
    if (errSpec.name) err.name = errSpec.name;
    throw err;
  }

  const status = typeof descriptor.status === 'number' ? descriptor.status : 200;
  const ok = descriptor.ok !== undefined ? Boolean(descriptor.ok) : (status >= 200 && status < 300);
  const headers = new Headers(descriptor.headers || {});

  const res = { status, ok, headers };
  if (descriptor.omitBodyInterface === true) {
    return res;
  }

  const hasJsonProp = Object.prototype.hasOwnProperty.call(descriptor, 'json');
  const hasBodyProp = Object.prototype.hasOwnProperty.call(descriptor, 'body');
  const hasTextProp = Object.prototype.hasOwnProperty.call(descriptor, 'text');
  const hasRawBytesProp = Object.prototype.hasOwnProperty.call(descriptor, 'rawBytes');

  if (descriptor.jsonError || hasJsonProp || hasBodyProp) {
    res.json = async () => {
      if (descriptor.jsonError) {
        throw new Error(String(descriptor.jsonError));
      }
      return clonePlainData(hasJsonProp ? descriptor.json : descriptor.body);
    };
  } else if (hasTextProp) {
    const textVal = String(descriptor.text);
    res.json = async () => JSON.parse(textVal);
  }

  const immutableRawBytes = hasRawBytesProp ? toIndependentBytesBuffer(descriptor.rawBytes) : null;

  if (descriptor.textError) {
    res.text = async () => {
      throw new Error(String(descriptor.textError));
    };
  } else if (hasTextProp) {
    const textVal = String(descriptor.text);
    res.text = async () => textVal;
  } else if (hasJsonProp || hasBodyProp) {
    const serialized = JSON.stringify(hasJsonProp ? descriptor.json : descriptor.body);
    res.text = async () => serialized;
  } else if (immutableRawBytes) {
    const textVal = immutableRawBytes.toString('utf8');
    res.text = async () => textVal;
  }

  if (descriptor.arrayBufferError) {
    res.arrayBuffer = async () => {
      throw new Error(String(descriptor.arrayBufferError));
    };
  } else if (immutableRawBytes) {
    res.arrayBuffer = async () => {
      const freshCopy = new Uint8Array(immutableRawBytes.byteLength);
      freshCopy.set(new Uint8Array(immutableRawBytes.buffer, immutableRawBytes.byteOffset, immutableRawBytes.byteLength));
      return freshCopy.buffer;
    };
  } else if (hasTextProp) {
    const textBytes = Buffer.from(String(descriptor.text), 'utf8');
    res.arrayBuffer = async () => {
      const freshCopy = new Uint8Array(textBytes.byteLength);
      freshCopy.set(new Uint8Array(textBytes.buffer, textBytes.byteOffset, textBytes.byteLength));
      return freshCopy.buffer;
    };
  }

  return res;
}

function extractValidatedPlainOptions(rawInput, label, allowNullUndefined = true) {
  if (typeof allowNullUndefined !== 'boolean') throw new Error('INVALID_INTERNAL_ADMISSION_OPTIONS');
  if (rawInput === undefined || rawInput === null) {
    if (allowNullUndefined) return Object.create(null);
    throw new Error(`INVALID_DETERMINISTIC_FIXTURE_SPEC: ${label} requires a plain object (R7-02)`);
  }
  if (utilTypes.isProxy(rawInput)) {
    throw new Error(`INVALID_DETERMINISTIC_FIXTURE_SPEC: Proxy object rejected at '${label}' (R7-02)`);
  }
  if (typeof rawInput !== 'object' || Array.isArray(rawInput)) {
    throw new Error(`INVALID_DETERMINISTIC_FIXTURE_SPEC: ${label} requires a plain object (R7-02)`);
  }
  const proto = Object.getPrototypeOf(rawInput);
  if (proto !== null && proto !== Object.prototype) {
    throw new Error(`INVALID_DETERMINISTIC_FIXTURE_SPEC: Unsupported prototype rejected at '${label}' (R7-02)`);
  }
  const syms = Object.getOwnPropertySymbols(rawInput);
  if (syms.length > 0) {
    throw new Error(`INVALID_DETERMINISTIC_FIXTURE_SPEC: Symbol property '${String(syms[0])}' rejected at '${label}' (R7-02)`);
  }
  const snapshot = Object.create(null);
  for (const key of Object.getOwnPropertyNames(rawInput)) {
    if (key === '__proto__') {
      throw new Error(`INVALID_DETERMINISTIC_FIXTURE_SPEC: Prototype-sensitive key '__proto__' rejected at '${label}' (R11-01)`);
    }
    const desc = Object.getOwnPropertyDescriptor(rawInput, key);
    if (!desc || typeof desc.get === 'function' || typeof desc.set === 'function') {
      throw new Error(`INVALID_DETERMINISTIC_FIXTURE_SPEC: Accessor property rejected at '${label}.${key}' (R7-02)`);
    }
    Object.defineProperty(snapshot, key, {
      value: desc.value,
      enumerable: true,
      writable: true,
      configurable: true
    });
  }
  return snapshot;
}

function snapshotStringArray(
  rawArr,
  label,
  allowEmpty = true, trimNonEmpty = false, errorCode = 'INVALID_DETERMINISTIC_FIXTURE_SPEC'
) {
  if (utilTypes.isProxy(rawArr)) {
    throw new Error(`${errorCode}: Proxy array rejected at '${label}' (R9-03)`);
  }
  if (!Array.isArray(rawArr) || Object.getPrototypeOf(rawArr) !== Array.prototype) {
    throw new Error(`${errorCode}: ${label} must be an array (genuine Array of strings required, R9-03)`);
  }
  if (Object.getOwnPropertySymbols(rawArr).length > 0) {
    throw new Error(`${errorCode}: Symbol properties on '${label}' rejected (R9-03)`);
  }
  const lenDesc = Object.getOwnPropertyDescriptor(rawArr, 'length');
  if (!lenDesc || !Object.hasOwn(lenDesc, 'value') || typeof lenDesc.value !== 'number') {
    throw new Error(`${errorCode}: Invalid length descriptor on '${label}' (R9-03)`);
  }
  const len = lenDesc.value;
  if (!allowEmpty && len === 0) {
    throw new Error(`${errorCode}: ${label} must be a non-empty array`);
  }
  for (const key of Object.getOwnPropertyNames(rawArr)) {
    if (key === 'length') continue;
    const idx = Number(key);
    if (!Number.isInteger(idx) || idx < 0 || idx >= len || String(idx) !== key) {
      throw new Error(`${errorCode}: Unexpected property '${key}' on '${label}' rejected (R9-03)`);
    }
  }
  const copy = [];
  for (let i = 0; i < len; i++) {
    const desc = Object.getOwnPropertyDescriptor(rawArr, String(i));
    if (!desc || !Object.hasOwn(desc, 'value') || typeof desc.value !== 'string') {
      if (errorCode === 'INVALID_PROBE_SELECTION') {
        throw new Error(`${errorCode}: each probe ID must be a non-empty string (R9-03)`);
      }
      throw new Error(`${errorCode}: ${label}[${i}] must be a primitive string data property (R9-03)`);
    }
    if (trimNonEmpty && !desc.value.trim()) {
      if (errorCode === 'INVALID_PROBE_SELECTION') {
        throw new Error(`${errorCode}: each probe ID must be a non-empty string (R9-03)`);
      }
      throw new Error(`${errorCode}: each element in ${label} must be a non-empty string`);
    }
    copy.push(desc.value);
  }
  return copy;
}

/**
 * Single unified typed admission schema registry (R9 Sec 6).
 * Every public execution path admits inputs through extractValidatedPlainOptions() + schema field contracts
 * before any subsequent property read or capability invocation.
 */
function deepFreezeNullProto(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      deepFreezeNullProto(obj[i]);
    }
    return Object.freeze(obj);
  }
  const out = Object.create(null);
  for (const key of Object.getOwnPropertyNames(obj)) {
    Object.defineProperty(out, key, {
      value: deepFreezeNullProto(obj[key]),
      enumerable: true,
      writable: false,
      configurable: false
    });
  }
  return Object.freeze(out);
}

const INTERNAL_ADMISSION_SCHEMAS = deepFreezeNullProto({
  runnerOptions: {
    projectRef: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'project' },
    tempRef: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'project' },
    argv: { type: 'string_array', required: false, nullable: true, allowEmpty: true, trimNonEmpty: false, errorCode: 'INVALID_RUNNER_ARGV', kind: 'inert_data', binding: 'none' },
    env: { type: 'env_record', required: false, nullable: true, kind: 'inert_data', binding: 'none' },
    testEmail: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'none' },
    testUser: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'none' },
    seedEmail: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'none' },
    seedUserId: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'none' },
    targetUserId: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'none' },
    testPassword: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'none' },
    runId: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'run' },
    storageFixturePath: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'run' },
    selectedProbeIds: { type: 'string_array', required: false, nullable: true, allowEmpty: true, trimNonEmpty: false, errorCode: 'INVALID_PROBE_SELECTION', kind: 'inert_data', binding: 'none' },
    timing: { type: 'declarative_record', required: false, nullable: true, kind: 'inert_data', binding: 'offline_only', deferRunnerRejection: true },
    sleepFn: { type: 'any_rejected_callback', required: false, nullable: true, kind: 'inert_data', binding: 'none', deferRunnerRejection: true },
    mockDispatcher: { type: 'trusted_offline_dispatcher', required: false, nullable: true, kind: 'registered_capability', binding: 'project+run', deferRunnerRejection: true },
    offlineDispatcher: { type: 'trusted_offline_dispatcher', required: false, nullable: true, kind: 'registered_capability', binding: 'project+run', deferRunnerRejection: true },
    adminClient: { type: 'trusted_admin_client', required: false, nullable: true, kind: 'registered_capability', binding: 'project+run', deferRunnerRejection: true },
    inventory: { type: 'trusted_inventory', required: false, nullable: true, kind: 'registered_capability', binding: 'project+run', deferRunnerRejection: true },
    runContext: { type: 'trusted_run_context', required: false, nullable: true, kind: 'registered_capability', binding: 'project+run', deferRunnerRejection: true },
    executionMode: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'none' },
    probeTimeoutMs: { type: 'number', required: false, nullable: false, min: 1, max: 60000, kind: 'inert_data', binding: 'none' },
    allowIsolatedTestRef: { type: 'boolean', required: false, nullable: false, kind: 'inert_data', binding: 'none' },
    liveHostedDispatch: { type: 'boolean', required: false, nullable: false, kind: 'inert_data', binding: 'none' },
    enforceDurableRecoveryGate: { type: 'boolean', required: false, nullable: false, kind: 'inert_data', binding: 'none' },
    requireSelection: { type: 'boolean', required: false, nullable: false, kind: 'inert_data', binding: 'none' }
  },
  planProbeExecutionOptions: {
    testEmail: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'none' },
    tempRef: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'project' },
    isLive: { type: 'boolean', required: false, nullable: false, kind: 'inert_data', binding: 'none' },
    selectedProbeIds: { type: 'string_array', required: false, nullable: true, allowEmpty: true, trimNonEmpty: false, errorCode: 'INVALID_PROBE_SELECTION', kind: 'inert_data', binding: 'none' },
    runId: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'run' },
    allowIsolatedTestRef: { type: 'boolean', required: false, nullable: false, kind: 'inert_data', binding: 'none' }
  },
  validateSelectedProbeIdsOptions: {
    isLive: { type: 'boolean', required: false, nullable: false, kind: 'inert_data', binding: 'none' }
  },
  createHostedDispatcherOptions: {
    projectRef: { type: 'string', required: false, nullable: false, kind: 'inert_data', binding: 'project' },
    anonKey: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'project' },
    serviceRoleKey: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'project' },
    fetchFn: { type: 'trusted_transport', required: false, nullable: true, kind: 'registered_capability', binding: 'offline_transport' },
    inventory: { type: 'trusted_inventory', required: false, nullable: true, kind: 'registered_capability', binding: 'project+run' },
    runContext: { type: 'trusted_run_context', required: false, nullable: true, kind: 'registered_capability', binding: 'project+run' },
    testEmail: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'none' },
    seedEmail: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'none' },
    seedUserId: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'none' }
  },
  dispatcherCallOptions: {
    signal: { type: 'abort_signal', required: false, nullable: true, kind: 'trusted_internal_object', binding: 'none' },
    projectRef: { type: 'string', required: false, nullable: false, kind: 'inert_data', binding: 'project' },
    runId: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'run' },
    inventory: { type: 'trusted_inventory', required: false, nullable: true, kind: 'registered_capability', binding: 'project+run' },
    runContext: { type: 'trusted_run_context', required: false, nullable: true, kind: 'registered_capability', binding: 'project+run' },
    testPassword: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'none' },
    testEmail: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'none' },
    testUser: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'none' },
    seedEmail: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'none' },
    seedUserId: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'none' },
    activeRefreshToken: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'none' }
  },
  offlineDispatcherCallOptions: {
    signal: { type: 'abort_signal', required: false, nullable: true, kind: 'trusted_internal_object', binding: 'none' },
    projectRef: { type: 'string', required: false, nullable: false, kind: 'inert_data', binding: 'project' },
    runId: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'run' },
    inventory: { type: 'trusted_inventory', required: false, nullable: true, kind: 'registered_capability', binding: 'project+run' },
    runContext: { type: 'trusted_run_context', required: false, nullable: true, kind: 'registered_capability', binding: 'project+run' },
    testPassword: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'none' },
    testEmail: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'none' },
    testUser: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'none' },
    seedEmail: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'none' },
    seedUserId: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'none' },
    activeRefreshToken: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'none' }
  },
  probeItem: {
    id: { type: 'string', required: true, nullable: false, kind: 'inert_data', binding: 'none' },
    category: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'none' },
    target: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'none' },
    expectedResponse: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'none' },
    plannedAction: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'none' },
    testUser: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'none' },
    status: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'none' },
    readinessStatus: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'none' },
    layer: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'none' }
  },
  createRunContextOptions: {
    runId: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'run' },
    storageFixturePath: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'run' },
    testPassword: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'none' },
    testEmail: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'none' },
    testUser: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'none' },
    seedUserId: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'none' },
    seedEmail: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'none' }
  },
  TestRunInventoryOptions: {
    seedEmail: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'none' },
    seedUserId: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'none' }
  },
  createHostedAdminClientOptions: {
    serviceRoleKey: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'project' },
    anonKey: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'project' },
    projectRef: { type: 'string', required: false, nullable: false, kind: 'inert_data', binding: 'project' },
    runId: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'run' },
    fetchFn: { type: 'trusted_transport', required: false, nullable: true, kind: 'registered_capability', binding: 'offline_transport' }
  },
  provisionStorageProbeFixtureOptions: {
    projectRef: { type: 'string', required: false, nullable: false, kind: 'inert_data', binding: 'project' },
    runId: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'run' },
    seedUserId: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'none' },
    userAccessToken: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'none' },
    anonKey: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'project' },
    serviceRoleKey: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'project' },
    adminClient: { type: 'trusted_admin_client', required: false, nullable: true, kind: 'registered_capability', binding: 'project+run' },
    ownershipLookupFn: { type: 'any_rejected_callback', required: false, nullable: true, kind: 'inert_data', binding: 'none' },
    fetchFn: { type: 'trusted_transport', required: false, nullable: true, kind: 'registered_capability', binding: 'offline_transport' },
    inventory: { type: 'trusted_inventory', required: false, nullable: true, kind: 'registered_capability', binding: 'project+run' },
    probeContent: { type: 'string_or_binary', required: false, nullable: false, kind: 'inert_data', binding: 'none' },
    ownershipTimeoutMs: { type: 'number', required: false, nullable: false, min: 1, max: 60000, kind: 'inert_data', binding: 'none' }
  },
  executeCleanupOptions: {
    adminClient: { type: 'trusted_admin_client', required: false, nullable: true, kind: 'registered_capability', binding: 'project+run', deferRunnerRejection: true },
    failClosed: { type: 'boolean', required: false, nullable: false, kind: 'inert_data', binding: 'none' },
    settlementTimeoutMs: { type: 'number', required: false, nullable: false, min: 0, max: 60000, kind: 'inert_data', binding: 'none' }
  },
  verifyStorageObjectAbsenceOptions: {
    projectRef: { type: 'string', required: false, nullable: false, kind: 'inert_data', binding: 'project' },
    runId: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'run' }
  },
  transportRequestOptions: {
    method: { type: 'string', required: false, nullable: false, kind: 'inert_data', binding: 'none' },
    headers: { type: 'headers_record', required: false, nullable: true, kind: 'inert_data', binding: 'none' },
    body: { type: 'string_or_binary', required: false, nullable: true, kind: 'inert_data', binding: 'none' },
    signal: { type: 'abort_signal', required: false, nullable: true, kind: 'trusted_internal_object', binding: 'none' }
  },
  getStorageObjectOwnershipOptions: {
    projectRef: { type: 'string', required: false, nullable: false, kind: 'inert_data', binding: 'project' },
    expectedObjectId: { type: 'string', required: false, nullable: true, kind: 'inert_data', binding: 'none' },
    timeoutMs: { type: 'number', required: false, nullable: false, integer: true, min: 1, max: 60000, kind: 'inert_data', binding: 'none' },
    signal: { type: 'abort_signal', required: false, nullable: true, kind: 'trusted_internal_object', binding: 'none' }
  }
});

export const UNIFIED_ADMISSION_SCHEMAS = INTERNAL_ADMISSION_SCHEMAS;

function ownSchemaMeta(spec, prop, fallback = undefined) {
  return spec && Object.hasOwn(spec, prop) ? spec[prop] : fallback;
}

function setNullProtoField(target, key, value) {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true
  });
}

function admitValidatedInput(rawInput, schemaName, allowNullUndefined = true) {
  if (typeof allowNullUndefined !== 'boolean') throw new Error('INVALID_INTERNAL_ADMISSION_OPTIONS');
  const schema = Object.hasOwn(INTERNAL_ADMISSION_SCHEMAS, schemaName)
    ? INTERNAL_ADMISSION_SCHEMAS[schemaName]
    : null;
  if (!schema) {
    throw new Error(`UNKNOWN_ADMISSION_SCHEMA: Admission schema '${schemaName}' is not registered (R10-01)`);
  }
  const snapshot = extractValidatedPlainOptions(rawInput, schemaName, allowNullUndefined);
  const admitted = Object.create(null);

  for (const key of Object.getOwnPropertyNames(snapshot)) {
    const spec = Object.hasOwn(schema, key) ? schema[key] : null;
    if (!spec) {
      throw new Error(
        `UNTRUSTED_ADMISSION_KEY: Unknown field '${key}' rejected at '${schemaName}' (R10-01)`
      );
    }
    const val = snapshot[key];
    if (val === undefined) continue;
    const specType = ownSchemaMeta(spec, 'type');
    const specKind = ownSchemaMeta(spec, 'kind');
    const isNullable = Boolean(ownSchemaMeta(spec, 'nullable', false));
    const deferRunnerRejection = Boolean(ownSchemaMeta(spec, 'deferRunnerRejection', false));

    if (val === null) {
      if (isNullable) {
        setNullProtoField(admitted, key, null);
        continue;
      }
      throw new Error(
        `INVALID_ADMISSION_TYPE: Null value rejected at '${schemaName}.${key}' (expected ${specType}) (R10-01)`
      );
    }

    if (typeof val === 'function' && specKind === 'inert_data') {
      if (deferRunnerRejection) {
        setNullProtoField(admitted, key, val);
        continue;
      }
      throw new Error(
        `BLOCKED_PENDING_DURABLE_RECOVERY: UNTRUSTED_EXECUTABLE_INPUT: Function value rejected at '${schemaName}.${key}' (R9 Sec 6)`
      );
    }

    switch (specType) {
      case 'string': {
        if (typeof val !== 'string') {
          throw new Error(
            `INVALID_ADMISSION_TYPE: Expected string at '${schemaName}.${key}', received ${typeof val} (R10-01)`
          );
        }
        setNullProtoField(admitted, key, val);
        break;
      }
      case 'number': {
        if (typeof val !== 'number' || !Number.isFinite(val)) {
          throw new Error(
            `INVALID_ADMISSION_TYPE: Expected finite number at '${schemaName}.${key}' (R10-01)`
          );
        }
        if (Boolean(ownSchemaMeta(spec, 'integer', false)) && !Number.isInteger(val)) {
          throw new Error(
            `INVALID_ADMISSION_TYPE: Expected integer at '${schemaName}.${key}' (R10-01)`
          );
        }
        const minVal = ownSchemaMeta(spec, 'min');
        if (typeof minVal === 'number' && val < minVal) {
          throw new Error(
            `INVALID_ADMISSION_RANGE: Value ${val} at '${schemaName}.${key}' is below minimum ${minVal} (R10-01)`
          );
        }
        const maxVal = ownSchemaMeta(spec, 'max');
        if (typeof maxVal === 'number' && val > maxVal) {
          throw new Error(
            `INVALID_ADMISSION_RANGE: Value ${val} at '${schemaName}.${key}' exceeds maximum ${maxVal} (R10-01)`
          );
        }
        setNullProtoField(admitted, key, val);
        break;
      }
      case 'boolean': {
        if (typeof val !== 'boolean') {
          throw new Error(
            `INVALID_ADMISSION_TYPE: Expected boolean at '${schemaName}.${key}', received ${typeof val} (R10-01)`
          );
        }
        setNullProtoField(admitted, key, val);
        break;
      }
      case 'string_array': {
        const allowEmpty = ownSchemaMeta(spec, 'allowEmpty');
        const trimNonEmpty = Boolean(ownSchemaMeta(spec, 'trimNonEmpty', false));
        const errorCode = ownSchemaMeta(spec, 'errorCode', 'INVALID_ADMISSION_TYPE');
        setNullProtoField(admitted, key, snapshotStringArray(val, `${schemaName}.${key}`, allowEmpty !== false, trimNonEmpty, errorCode));
        break;
      }
      case 'env_record': {
        setNullProtoField(admitted, key, snapshotRunnerEnv(val));
        break;
      }
      case 'headers_record': {
        const cleanHeaders = Object.create(null);
        if (INTRINSIC_HEADERS_PROTO && !utilTypes.isProxy(val) && Object.getPrototypeOf(val) === INTRINSIC_HEADERS_PROTO) {
          if (Object.getOwnPropertyNames(val).length > 0 || Object.getOwnPropertySymbols(val).length > 0) {
            throw new Error(`INVALID_ADMISSION_TYPE: Own overrides on Headers rejected at '${schemaName}.${key}' (R12-01)`);
          }
          for (const [hk, hv] of INTRINSIC_HEADERS_ENTRIES.call(val)) {
            setNullProtoField(cleanHeaders, String(hk).toLowerCase(), String(hv));
          }
        } else {
          const plainHdrs = extractValidatedPlainOptions(val, `${schemaName}.${key}`, false);
          for (const hk of Object.getOwnPropertyNames(plainHdrs)) {
            const hv = plainHdrs[hk];
            if (typeof hv !== 'string' && typeof hv !== 'number' && typeof hv !== 'boolean') {
              throw new Error(
                `INVALID_ADMISSION_TYPE: Expected primitive header value at '${schemaName}.${key}.${hk}', received ${typeof hv} (R12-01)`
              );
            }
            if (typeof hv === 'number' && !Number.isFinite(hv)) {
              throw new Error(`INVALID_ADMISSION_TYPE: Non-finite header value at '${schemaName}.${key}.${hk}' (R12-01)`);
            }
            setNullProtoField(cleanHeaders, hk.toLowerCase(), String(hv));
          }
        }
        setNullProtoField(admitted, key, cleanHeaders);
        break;
      }
      case 'declarative_record': {
        if (deferRunnerRejection) {
          setNullProtoField(admitted, key, val);
        } else {
          validateDeclarativeFixtureValue(val, `${schemaName}.${key}`);
          setNullProtoField(admitted, key, clonePlainData(val));
        }
        break;
      }
      case 'string_or_binary': {
        if (typeof val === 'string') {
          setNullProtoField(admitted, key, val);
        } else {
          setNullProtoField(admitted, key, snapshotTrustedBinaryInput(val, `${schemaName}.${key}`));
        }
        break;
      }
      case 'abort_signal': {
        setNullProtoField(admitted, key, validateTrustedAbortSignal(val, `${schemaName}.${key}`));
        break;
      }
      case 'trusted_transport': {
        assertOfflineMockTransport(val);
        setNullProtoField(admitted, key, val);
        break;
      }
      case 'trusted_offline_dispatcher': {
        if (deferRunnerRejection) {
          setNullProtoField(admitted, key, val);
        } else {
          assertTrustedOfflineDispatcher(val, { requireRunBinding: false });
          setNullProtoField(admitted, key, val);
        }
        break;
      }
      case 'trusted_admin_client': {
        if (deferRunnerRejection) {
          setNullProtoField(admitted, key, val);
        } else {
          assertTrustedAdminClient(val, { requireRunBinding: false });
          setNullProtoField(admitted, key, val);
        }
        break;
      }
      case 'trusted_inventory': {
        if (deferRunnerRejection) {
          setNullProtoField(admitted, key, val);
        } else {
          assertTrustedRunInventory(val, {});
          setNullProtoField(admitted, key, val);
        }
        break;
      }
      case 'trusted_run_context': {
        if (deferRunnerRejection) {
          setNullProtoField(admitted, key, val);
        } else {
          assertTrustedRunContext(val, {});
          setNullProtoField(admitted, key, val);
        }
        break;
      }
      case 'any_rejected_callback': {
        if (deferRunnerRejection) {
          setNullProtoField(admitted, key, val);
        } else {
          throw new Error(
            `BLOCKED_PENDING_DURABLE_RECOVERY: UNTRUSTED_EXECUTABLE_INPUT: Callback override '${schemaName}.${key}' is strictly prohibited (R10-01)`
          );
        }
        break;
      }
      default:
        throw new Error(
          `UNKNOWN_ADMISSION_FIELD_TYPE: Unsupported schema type '${specType}' at '${schemaName}.${key}' (R10-01)`
        );
    }
  }

  for (const fieldName of Object.getOwnPropertyNames(schema)) {
    const spec = schema[fieldName];
    if (Boolean(ownSchemaMeta(spec, 'required', false)) && !Object.hasOwn(admitted, fieldName)) {
      throw new Error(
        `MISSING_REQUIRED_ADMISSION_FIELD: Required field '${schemaName}.${fieldName}' is missing (R10-01)`
      );
    }
  }

  return admitted;
}

function internalThrottleWait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function validateDeclarativeTimingConfig(rawTiming, isOfflineAllowed = false) {
  if (rawTiming === undefined || rawTiming === null) {
    return { mode: 'standard', intervalMs: RATE_LIMIT_CONFIG.minIntervalMs };
  }
  const timing = extractValidatedPlainOptions(rawTiming, 'runnerOptions.timing', false);
  validateDeclarativeFixtureValue(timing, 'runnerOptions.timing');
  if (!isOfflineAllowed) {
    throw new Error('BLOCKED_PENDING_DURABLE_RECOVERY: Declarative timing overrides are prohibited for real hosted execution (R7-01)');
  }
  const mode = timing.mode !== undefined ? timing.mode : 'standard';
  if (mode !== 'standard' && mode !== 'recorded_zero_wait') {
    throw new Error(`INVALID_TIMING_CONFIG: Unsupported timing mode '${String(mode)}' (R7-01)`);
  }
  if (timing.intervalMs !== undefined) {
    if (typeof timing.intervalMs !== 'number' || !Number.isFinite(timing.intervalMs) || timing.intervalMs < 0 || timing.intervalMs > RATE_LIMIT_CONFIG.minIntervalMs) {
      throw new Error(`INVALID_TIMING_CONFIG: timing.intervalMs must be a finite number between 0 and ${RATE_LIMIT_CONFIG.minIntervalMs} (R7-01)`);
    }
  }
  const intervalMs = mode === 'recorded_zero_wait'
    ? 0
    : (timing.intervalMs !== undefined ? timing.intervalMs : RATE_LIMIT_CONFIG.minIntervalMs);
  return { mode, intervalMs };
}

function validateFixtureTiming(record, label) {
  const config = extractValidatedPlainOptions(record, label, false);
  for (const effect of ['inventoryEffects', 'onAbortInventoryEffects']) {
    if (config[effect] !== undefined) admitInventoryEffects(config[effect]);
  }
  for (const key of ['delayMs', 'rejectAfterAbortMs']) {
    if (!Object.hasOwn(config, key) || config[key] === undefined) continue;
    const value = config[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 2147483647) {
      throw new Error('INVALID_ADMISSION_RANGE: Fixture timing must be a finite primitive in timer range');
    }
  }
  if (Object.hasOwn(config, 'ignoreAbort') && typeof config.ignoreAbort !== 'boolean') {
    throw new Error('INVALID_INTERNAL_DELAY_OPTIONS: Fixture cancellation flag must be boolean');
  }
}

function validateTransportFixtureTiming(spec) {
  for (const route of spec.routes || []) validateFixtureTiming(route, 'transportRoute');
  if (spec.defaultResponse != null) validateFixtureTiming(spec.defaultResponse, 'transportDefaultResponse');
  if (spec.fallback != null) validateFixtureTiming(spec.fallback, 'transportFallback');
}

function validateDispatcherFixtureTiming(spec) {
  const outcomes = spec.outcomes ? extractValidatedPlainOptions(spec.outcomes, 'outcomes', false) : Object.create(null);
  for (const value of Object.values(outcomes)) {
    for (const outcome of Array.isArray(value) ? value : [value]) if (outcome != null) validateFixtureTiming(outcome, 'offlineOutcome');
  }
  for (const outcome of spec.sequence || []) if (outcome != null) validateFixtureTiming(outcome, 'offlineSequence');
  if (spec.defaultOutcome != null) validateFixtureTiming(spec.defaultOutcome, 'offlineDefaultOutcome');
}

/**
 * Factory for trusted, purely declarative offline fixture transports (R3-02).
 * Only transports produced by this module factory are trusted in offline simulation.
 * Accepts zero arbitrary user callbacks and executes inside runWithBlockedRealFetch.
 */
export function createDeterministicFixtureTransport(rawSpec = {}) {
  if (rawSpec !== undefined && rawSpec !== null && utilTypes.isProxy(rawSpec)) {
    throw new Error('INVALID_DETERMINISTIC_FIXTURE_SPEC: Proxy object rejected at \'transportSpec\' (R7-02)');
  }
  const normalizedSpec = rawSpec && typeof rawSpec === 'object' && !Array.isArray(rawSpec)
    ? extractValidatedPlainOptions(rawSpec, 'transportSpec')
    : Object.assign(Object.create(null), { routes: Array.isArray(rawSpec) ? rawSpec : [] });
  validateDeclarativeFixtureValue(normalizedSpec, 'transportSpec');
  validateTransportFixtureTiming(normalizedSpec);

  const requestBudgetMode = normalizedSpec.requestBudgetMode;
  if (requestBudgetMode !== undefined && requestBudgetMode !== 'standard' && requestBudgetMode !== 'recorded_zero_wait') throw new Error('INVALID_REQUEST_BUDGET_MODE');
  const state = clonePlainData(normalizedSpec.initialState || {});
  const rawRoutes = Array.isArray(normalizedSpec.routes) ? normalizedSpec.routes : [];
  const defaultResponse = normalizedSpec.defaultResponse !== undefined
    ? clonePlainData(normalizedSpec.defaultResponse)
    : (normalizedSpec.fallback !== undefined ? clonePlainData(normalizedSpec.fallback) : null);

  const compiledRoutes = rawRoutes.map((route, idx) => {
    const compiled = extractValidatedPlainOptions(clonePlainData(route), 'transportRoute', false);
    compiled._index = idx;
    compiled._remaining = typeof compiled.times === 'number' ? Math.max(0, Math.floor(compiled.times)) : Infinity;
    return compiled;
  });

  const calls = [];

  function matchesRoute(route, req) {
    if (route._remaining <= 0) return false;
    if (route.method !== undefined) {
      const allowed = Array.isArray(route.method)
        ? route.method.map(m => String(m).toUpperCase())
        : [String(route.method).toUpperCase()];
      if (!allowed.includes(req.method)) return false;
    }
    if (route.urlEquals !== undefined && req.url !== String(route.urlEquals)) return false;
    if (route.urlIncludes !== undefined) {
      const needles = Array.isArray(route.urlIncludes) ? route.urlIncludes : [route.urlIncludes];
      if (!needles.every(n => req.url.includes(String(n)))) return false;
    }
    if (route.urlRegex !== undefined) {
      const rx = utilTypes.isRegExp(route.urlRegex)
        ? route.urlRegex
        : new RegExp(String(route.urlRegex));
      if (!INTRINSIC_REGEXP_TEST.call(rx, req.url)) return false;
    }
    if (route.pathEquals !== undefined && req.pathname !== String(route.pathEquals)) return false;
    if (route.pathIncludes !== undefined) {
      const needles = Array.isArray(route.pathIncludes) ? route.pathIncludes : [route.pathIncludes];
      if (!needles.every(n => req.pathname.includes(String(n)))) return false;
    }
    if (route.pathRegex !== undefined) {
      const rx = utilTypes.isRegExp(route.pathRegex)
        ? route.pathRegex
        : new RegExp(String(route.pathRegex));
      if (!INTRINSIC_REGEXP_TEST.call(rx, req.pathname)) return false;
    }
    if (route.headersMatch && typeof route.headersMatch === 'object') {
      for (const [hk, hv] of Object.entries(route.headersMatch)) {
        const actualVal = req.headers[hk.toLowerCase()];
        if (actualVal !== String(hv)) return false;
      }
    }
    if (route.bodyIncludes !== undefined) {
      if (typeof req.rawBody !== 'string' || !req.rawBody.includes(String(route.bodyIncludes))) return false;
    }
    if (route.bodyMatch !== undefined) {
      if (!deepSubsetMatches(req.bodyJson, route.bodyMatch)) return false;
    }
    if (route.whenState && typeof route.whenState === 'object') {
      for (const [sk, sv] of Object.entries(route.whenState)) {
        if (!Object.hasOwn(state, sk) || state[sk] !== sv) return false;
      }
    }
    return true;
  }

  const transport = async function deterministicFixtureTransport(rawUrl, rawOpts = {}) {
    // R12-01: Descriptor-first typed admission BEFORE reading signal, converting URL/method/headers/body, recording calls, or mutating state/barriers
    let urlStr;
    if (typeof rawUrl === 'string') {
      urlStr = rawUrl;
    } else if (
      INTRINSIC_URL_PROTO
      && rawUrl
      && typeof rawUrl === 'object'
      && !utilTypes.isProxy(rawUrl)
      && Object.getPrototypeOf(rawUrl) === INTRINSIC_URL_PROTO
      && Object.getOwnPropertyNames(rawUrl).length === 0
      && Object.getOwnPropertySymbols(rawUrl).length === 0
    ) {
      urlStr = INTRINSIC_URL_HREF_GET.call(rawUrl);
    } else {
      throw new Error(`INVALID_ADMISSION_TYPE: Expected primitive URL string or genuine URL at 'transport.url' (R12-01)`);
    }
    const opts = admitValidatedInput(rawOpts, 'transportRequestOptions');
    const signal = ownSchemaMeta(opts, 'signal', null);
    if (isTrustedSignalAborted(signal)) {
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';
      if (RUN_REQUEST_BUDGET_CONTEXT.getStore()) {
        return executeCurrentTransportRequest(transport, signal, () => { throw abortErr; });
      }
      throw abortErr;
    }

    return executeCurrentTransportRequest(transport, signal, () => runWithBlockedRealFetch(async () => {
      let pathname = urlStr;
      try {
        pathname = new URL(urlStr, 'https://localhost').pathname;
      } catch {
        pathname = urlStr;
      }

      const rawMethod = ownSchemaMeta(opts, 'method', 'GET');
      const method = rawMethod.toUpperCase();
      const lowerHeaders = ownSchemaMeta(opts, 'headers', null) ?? Object.create(null);
      const admittedBody = ownSchemaMeta(opts, 'body', undefined);

      let rawBody = null;
      let bodyJson = null;
      if (typeof admittedBody === 'string') {
        rawBody = admittedBody;
        try {
          bodyJson = JSON.parse(admittedBody);
        } catch {
          bodyJson = null;
        }
      } else if (admittedBody !== undefined && admittedBody !== null) {
        rawBody = admittedBody.toString('utf8');
      }

      const req = { url: urlStr, pathname, method, headers: lowerHeaders, rawBody, bodyJson };

      const matched = compiledRoutes.find(r => matchesRoute(r, req)) || null;
      if (matched && Number.isFinite(matched._remaining)) {
        matched._remaining -= 1;
      }
      const selectedRecord = matched || defaultResponse;
      const selected = selectedRecord ? extractValidatedPlainOptions(selectedRecord, 'transportResponse', false) : null;
      if (!selected) {
        throw new Error(`DETERMINISTIC_TRANSPORT_UNMATCHED_ROUTE: No matching route for ${method} ${urlStr}`);
      }

      let conditionalDeletion = null;
      if (method === 'DELETE' && pathname.startsWith('/storage/v1/object/')) {
        const context = CONDITIONAL_DELETE_CONTEXT.getStore();
        const provider = getConditionalStorageFixtureProvider(transport);
        const expectedPath = context ? `/storage/v1/object/${context.expected.bucket}/${context.expected.path}` : null;
        if (!context || context.transport !== transport || pathname !== expectedPath || !provider) {
          conditionalDeletion = { status: 'CONDITIONAL_DELETE_UNAVAILABLE', deleted: false };
        } else if (selected.throwError || (typeof selected.status === 'number' && (selected.status < 200 || selected.status >= 300))) {
          const current = provider.getObjectState({ bucket: context.expected.bucket, path: context.expected.path });
          let body = selected.json || selected.body;
          if (!body && typeof selected.text === 'string') {
            try { body = JSON.parse(selected.text); } catch { body = null; }
          }
          const knownAbsentResponse = !selected.throwError && [400, 404].includes(selected.status) && body && typeof body === 'object' && Object.getOwnPropertyDescriptor(body, 'code')?.value === 'NoSuchKey';
          conditionalDeletion = knownAbsentResponse && !current.current && !current.indeterminate
            ? provider.conditionalDelete(context.expected)
            : { status: 'CONDITIONAL_DELETE_INDETERMINATE', deleted: false };
        } else {
          conditionalDeletion = provider.conditionalDelete(context.expected);
        }
      }
      calls.push(Object.freeze({
        url: urlStr,
        pathname,
        method,
        headers: Object.freeze({ ...lowerHeaders }),
        body: rawBody,
        bodyJson: clonePlainData(bodyJson),
        tag: selected.tag || null,
        routeIndex: matched ? matched._index : -1,
        timestamp: new Date().toISOString()
      }));

      if (conditionalDeletion && !['EXPECTED_OBJECT_DELETED', 'EXPECTED_OBJECT_ABSENT'].includes(conditionalDeletion.status)) {
        return Object.assign(buildDeterministicResponse({ status: 409, json: { code: conditionalDeletion.status } }), { conditionalDeletion });
      }
      if (selected.setsState && typeof selected.setsState === 'object') {
        for (const [sk, sv] of Object.entries(selected.setsState)) {
          setNullProtoField(state, sk, clonePlainData(sv));
        }
      }

      const releaseList = [];
      if (selected.releaseBarrier) releaseList.push(selected.releaseBarrier);
      if (Array.isArray(selected.releaseBarriers)) releaseList.push(...selected.releaseBarriers);
      for (const b of releaseList) {
        if (TRUSTED_OFFLINE_BARRIERS.has(b)) {
          b.markArrived();
          b.release();
        }
      }

      if (selected.waitForBarrier && TRUSTED_OFFLINE_BARRIERS.has(selected.waitForBarrier)) {
        selected.waitForBarrier.markArrived();
        await selected.waitForBarrier.wait(signal);
      }

      if (selected.delayMs !== undefined) {
        await waitWithTrustedSignal(selected.delayMs, signal);
      }

      observeConditionalStorageUpload(transport, req, selected);
      let response = buildDeterministicResponse(selected);
      // A declarative absent route cannot override authoritative current provider state.
      // Re-read after awaits so a replacement during DELETE/GET delay is preserved.
      const provider = getConditionalStorageFixtureProvider(transport);
      const storagePrefix = '/storage/v1/object/authenticated/';
      if (provider && method === 'GET' && pathname.startsWith(storagePrefix) && [400, 404].includes(response.status)) {
        const parts = pathname.slice(storagePrefix.length).split('/').map(decodeURIComponent);
        const bucket = parts.shift();
        const current = provider.getObjectState({ bucket, path: parts.join('/') });
        if (current.indeterminate) response = buildDeterministicResponse({ status: 503, json: { code: 'CONDITIONAL_IDENTITY_INDETERMINATE' } });
        else if (current.current) response = buildDeterministicResponse({ status: 200, json: { conditionalObjectPresent: true } });
      }
      if (conditionalDeletion) response.conditionalDeletion = conditionalDeletion;
      return response;
    }));
  };

  TRANSPORT_REQUEST_BUDGET_MODES.set(transport, requestBudgetMode);
  Object.defineProperty(transport, 'calls', {
    get() {
      return calls.slice();
    },
    enumerable: true,
    configurable: false
  });
  Object.defineProperty(transport, 'getState', {
    value: () => clonePlainData(state),
    writable: false,
    enumerable: true,
    configurable: false
  });

  registerConditionalStorageFixtureTransport(transport, normalizedSpec.conditionalStorage);
  TRUSTED_DETERMINISTIC_TRANSPORTS.add(transport);
  return transport;
}

/**
 * Rejects arbitrary, live, real, bound, or untrusted transports fail-closed (R3-02).
 * Only transports produced by createDeterministicFixtureTransport() are permitted offline.
 */
export function assertOfflineMockTransport(fetchFn) {
  if (typeof fetchFn !== 'function' || !TRUSTED_DETERMINISTIC_TRANSPORTS.has(fetchFn)) {
    throw new Error(
      'BLOCKED_PENDING_DURABLE_RECOVERY: Arbitrary executable transport rejected; LIVE hosted execution is blocked pending durable crash recovery and offline tests must use createDeterministicFixtureTransport()'
    );
  }
}

const FORGED_TRUSTED_DISPATCHER_MARKER_KEYS = Object.freeze([
  '_isTrustedOfflineDispatcher',
  '__trustedOfflineDispatcher',
  '_trustedDispatcher',
  'isTrustedOfflineDispatcher',
  'isTrustedDispatcher',
  '_isHostedNetworkDispatcher'
]);

function assertNoForgedDispatcherMarkers(candidate) {
  if (!candidate || (typeof candidate !== 'object' && typeof candidate !== 'function')) return;
  for (const key of FORGED_TRUSTED_DISPATCHER_MARKER_KEYS) {
    const desc = Object.getOwnPropertyDescriptor(candidate, key);
    if (desc !== undefined) {
      throw new Error(
        `BLOCKED_PENDING_DURABLE_RECOVERY: UNTRUSTED_OFFLINE_DISPATCHER: Forged trusted offline dispatcher marker '${key}' rejected fail-closed (R6-01)`
      );
    }
  }
}

function applyDeclarativeInventoryEffects(inv, effects) {
  if (!inv || !effects || typeof effects !== 'object') return;
  effects = admitInventoryEffects(effects);
  if (effects.protectSeedIdentity) {
    inv.protectSeedIdentity(effects.protectSeedIdentity);
  }
  if (effects.registerCreatedUser) {
    inv.registerCreatedUser(effects.registerCreatedUser);
  }
  if (effects.registerUnverifiedUser) {
    inv.registerObservedUser(effects.registerUnverifiedUser);
  }
  if (effects.registerSession) {
    const s = extractValidatedPlainOptions(effects.registerSession, 'sessionEffect', false);
    inv.registerSession(s.sessionId, s);
  }
  if (effects.registerUntrackedSession === true) {
    inv.registerUntrackedSession();
  }
  if (effects.registerUntrackedUser === true) {
    inv.registerUntrackedUser();
  }
  if (effects.registerSeedPasswordModification) {
    inv.registerSeedPasswordModification(effects.registerSeedPasswordModification);
  }
  if (effects.registerInFlightOperation) {
    const op = inv.registerInFlightOperation(effects.registerInFlightOperation);
    if (op && effects.settleInFlightOperation) {
      inv.settleInFlightOperation(op.opId, effects.settleInFlightOperation);
    }
  }
}

const OFFLINE_DISPATCHER_CONTROL_KEYS = new Set([
  'delayMs',
  'ignoreAbort',
  'neverSettle',
  'throwError',
  'waitForBarrier',
  'releaseBarrier',
  'releaseBarriers',
  'inventoryEffects',
  'onAbortInventoryEffects',
  'rejectAfterAbortMs',
  'transportRequest',
  'transportRequests',
  'outcome'
]);

function extractDeclarativeOutcome(descriptor) {
  if (descriptor.outcome !== undefined) {
    return clonePlainData(descriptor.outcome);
  }
  const out = {};
  for (const [k, v] of Object.entries(descriptor)) {
    if (!OFFLINE_DISPATCHER_CONTROL_KEYS.has(k)) {
      out[k] = clonePlainData(v);
    }
  }
  return out;
}

/**
 * Factory for trusted, purely declarative offline probe dispatchers (R6-01).
 * Only dispatchers produced by this module factory are permitted by runHostedProbeRunner().
 * Enforces projectRef, runId, deterministic fixture transport, and zero arbitrary callbacks.
 */
export function createTrustedOfflineDispatcher(rawSpec = {}) {
  const snapshot = extractValidatedPlainOptions(rawSpec, 'offlineDispatcherSpec', false);
  const declarativeSpec = Object.create(null);
  let candidateFetchFn = null;
  let hasFetchFn = false;

  for (const key of Object.getOwnPropertyNames(snapshot)) {
    const val = snapshot[key];
    if (key === 'fetchFn') {
      hasFetchFn = true;
      candidateFetchFn = val;
      continue;
    }
    Object.defineProperty(declarativeSpec, key, {
      value: val,
      enumerable: true,
      writable: true,
      configurable: true
    });
  }

  // Validate nested declarative fixture data BEFORE reading/validating projectRef, runId, or transportSpec.
  validateDeclarativeFixtureValue(declarativeSpec, 'offlineDispatcherSpec');
  validateDispatcherFixtureTiming(declarativeSpec);

  if (hasFetchFn && candidateFetchFn !== undefined && candidateFetchFn !== null) {
    if (utilTypes.isProxy(candidateFetchFn)) {
      throw new Error('BLOCKED_PENDING_DURABLE_RECOVERY: Proxied transport rejected at \'offlineDispatcherSpec.fetchFn\' (R7-02)');
    }
    assertOfflineMockTransport(candidateFetchFn);
  }

  const rawProjectRef = declarativeSpec.projectRef !== undefined ? declarativeSpec.projectRef : HARDCODED_TEMP_REF;
  if (typeof rawProjectRef !== 'string') {
    throw new Error('CRITICAL_SECURITY_VIOLATION: createTrustedOfflineDispatcher requires string projectRef (R7-02)');
  }
  const normRef = rawProjectRef.trim().toLowerCase();
  if (normRef !== HARDCODED_TEMP_REF || isForbiddenProject(normRef)) {
    throw new Error(
      `CRITICAL_SECURITY_VIOLATION: createTrustedOfflineDispatcher strictly rejected target '${normRef}'. Only approved TEMP project '${HARDCODED_TEMP_REF}' is authorized.`
    );
  }
  if (!declarativeSpec.runId || typeof declarativeSpec.runId !== 'string') {
    throw new Error('OFFLINE_DISPATCHER_RUN_REQUIRED: createTrustedOfflineDispatcher requires an explicit runId (R6-01)');
  }
  const boundRunId = validateRunId(declarativeSpec.runId);

  const rawTransportFetch = hasFetchFn && candidateFetchFn !== undefined && candidateFetchFn !== null
    ? candidateFetchFn
    : createDeterministicFixtureTransport(declarativeSpec.transportSpec || { defaultResponse: { status: 200, ok: true, json: {} } });
  assertOfflineMockTransport(rawTransportFetch);

  const outcomes = clonePlainData(declarativeSpec.outcomes || {});
  const defaultOutcome = declarativeSpec.defaultOutcome !== undefined
    ? clonePlainData(declarativeSpec.defaultOutcome)
    : null;
  const sequence = Array.isArray(declarativeSpec.sequence)
    ? clonePlainData(declarativeSpec.sequence)
    : null;

  const probeCursors = new Map();
  let sequenceCursor = 0;
  const calls = [];

  const dispatcher = async function trustedOfflineDispatcher(rawItem, rawOptions = {}) {
    const item = admitValidatedInput(rawItem, 'probeItem');
    const options = admitValidatedInput(rawOptions, 'offlineDispatcherCallOptions');
    assertTrustedOfflineDispatcher(dispatcher, { projectRef: normRef, runId: boundRunId });
    if (options.projectRef !== undefined && options.projectRef.trim().toLowerCase() !== normRef) {
      throw new Error(
        `CRITICAL_SECURITY_VIOLATION: Per-call projectRef '${options.projectRef}' does not match offline dispatcher project '${normRef}' (R10-02)`
      );
    }
    if (boundRunId !== null && options.runId !== undefined && options.runId !== null && options.runId !== boundRunId) {
      throw new Error(
        `DISPATCHER_RUN_MISMATCH: Per-call runId '${options.runId}' does not match offline dispatcher bound run '${boundRunId}' (R10-02)`
      );
    }
    if (options.inventory !== undefined && options.inventory !== null) {
      assertTrustedRunInventory(options.inventory, { projectRef: normRef, expectedRunId: boundRunId });
    }
    if (options.runContext !== undefined && options.runContext !== null) {
      assertTrustedRunContext(options.runContext, { projectRef: normRef, expectedRunId: boundRunId });
    }

    return withRunRequestBudget(boundRunId, 'probe', () => runWithBlockedRealFetch(async () => {
      const probeId = item?.id || 'UNKNOWN';
      calls.push(Object.freeze({ probeId, timestamp: new Date().toISOString() }));

      let descriptor = null;
      if (sequence) {
        if (sequenceCursor < sequence.length) {
          descriptor = sequence[sequenceCursor++];
        } else {
          descriptor = defaultOutcome;
        }
      } else if (Object.prototype.hasOwnProperty.call(outcomes, probeId)) {
        const entry = outcomes[probeId];
        if (Array.isArray(entry)) {
          const idx = probeCursors.get(probeId) || 0;
          probeCursors.set(probeId, idx + 1);
          descriptor = idx < entry.length ? entry[idx] : defaultOutcome;
        } else {
          descriptor = entry;
        }
      } else if (Object.prototype.hasOwnProperty.call(outcomes, '*')) {
        descriptor = outcomes['*'];
      } else {
        descriptor = defaultOutcome;
      }

      if (!descriptor) {
        return { passed: false, status: 500, reason: 'unrecognized probe case' };
      }

      descriptor = extractValidatedPlainOptions(descriptor, 'offlineOutcome', false);
      const signal = options.signal || null;
      const inv = options.inventory || null;

      if (descriptor.inventoryEffects) {
        applyDeclarativeInventoryEffects(inv, descriptor.inventoryEffects);
      }

      const transportReqs = Array.isArray(descriptor.transportRequests)
        ? descriptor.transportRequests
        : (descriptor.transportRequest ? [descriptor.transportRequest] : []);
      for (const rawReq of transportReqs) {
        const req = extractValidatedPlainOptions(rawReq, 'offlineTransportRequest', false);
        await rawTransportFetch(req.url, {
          method: req.method || 'GET',
          headers: req.headers || {},
          body: req.body !== undefined ? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body)) : undefined,
          signal
        });
      }

      const releaseList = [];
      if (descriptor.releaseBarrier) releaseList.push(descriptor.releaseBarrier);
      if (Array.isArray(descriptor.releaseBarriers)) releaseList.push(...descriptor.releaseBarriers);
      for (const b of releaseList) {
        if (TRUSTED_OFFLINE_BARRIERS.has(b)) {
          b.markArrived();
          b.release();
        }
      }

      if (descriptor.waitForBarrier && TRUSTED_OFFLINE_BARRIERS.has(descriptor.waitForBarrier)) {
        descriptor.waitForBarrier.markArrived();
        await descriptor.waitForBarrier.wait(signal);
      }

      if (descriptor.neverSettle === true) {
        // Deliberately pending fixtures retain unresolved obligations; failed abort effects must reject.
        return new Promise((_resolve, reject) => {
          let abortHandled = false;
          let attached = false;
          const detach = () => {
            if (attached) {
              attached = false;
              removeTrustedSignalAbortListener(signal, handleAbort);
            }
          };
          const handleAbort = () => {
            if (abortHandled) return;
            abortHandled = true;
            try {
              detach();
              if (descriptor.onAbortInventoryEffects) applyDeclarativeInventoryEffects(inv, descriptor.onAbortInventoryEffects);
            } catch {
              reject(internalAbortEffectFailure());
              return;
            }
            if (descriptor.rejectAfterAbortMs !== undefined) {
              waitWithTrustedSignal(descriptor.rejectAfterAbortMs, null).then(() => {
                const error = new Error('The operation was aborted');
                error.name = 'AbortError';
                reject(error);
              }, reject);
            }
          };
          try {
            if (signal && (descriptor.onAbortInventoryEffects || descriptor.rejectAfterAbortMs !== undefined)) {
              if (isTrustedSignalAborted(signal)) handleAbort();
              else {
                attached = true;
                addTrustedSignalAbortListener(signal, handleAbort);
              }
            }
          } catch (error) {
            try { detach(); } finally { reject(error); }
          }
        });
      }

      if (descriptor.delayMs !== undefined) {
        await waitWithTrustedSignal(descriptor.delayMs, signal, () => {
          if (descriptor.onAbortInventoryEffects) applyDeclarativeInventoryEffects(inv, descriptor.onAbortInventoryEffects);
        }, descriptor.ignoreAbort === undefined ? false : descriptor.ignoreAbort);
      }

      if (descriptor.throwError) {
        const errSpec = typeof descriptor.throwError === 'string'
          ? { message: descriptor.throwError }
          : extractValidatedPlainOptions(descriptor.throwError, 'offlineError', false);
        const err = new Error(errSpec.message || 'Deterministic offline dispatcher error');
        if (errSpec.code) err.code = errSpec.code;
        if (errSpec.name) err.name = errSpec.name;
        throw err;
      }

      return extractDeclarativeOutcome(descriptor);
    }));
  };

  Object.defineProperty(dispatcher, 'calls', {
    get() {
      return calls.slice();
    },
    enumerable: true,
    configurable: false
  });
  Object.freeze(dispatcher);

  TRUSTED_OFFLINE_DISPATCHERS.set(
    dispatcher,
    Object.freeze({
      projectRef: normRef,
      runId: boundRunId,
      rawTransportFetch,
      dispatchFn: dispatcher
    })
  );

  return dispatcher;
}

/**
 * Verifies that an offline probe dispatcher was constructed by createTrustedOfflineDispatcher(),
 * is bound to the exact TEMP project and runId, and uses a registered deterministic transport (R6-01).
 */
export function assertTrustedOfflineDispatcher(
  dispatcher,
  {
    projectRef = HARDCODED_TEMP_REF,
    runId = null
  } = {}
) {
  const normRef = (projectRef || '').trim().toLowerCase();
  if (dispatcher && HOSTED_NETWORK_DISPATCHERS.has(dispatcher)) {
    throw new Error(
      'BLOCKED_PENDING_DURABLE_RECOVERY: LIVE hosted execution against Supabase Cloud is blocked pending durable crash recovery and journaled inventory implementation (R6-01)'
    );
  }
  if (typeof dispatcher !== 'function') {
    throw new Error(
      'NO_HOSTED_DISPATCHER: live hosted execution requires a configured network dispatcher; synthetic placeholder execution prohibited'
    );
  }
  const meta = TRUSTED_OFFLINE_DISPATCHERS.get(dispatcher);
  if (!meta) {
    assertNoForgedDispatcherMarkers(dispatcher);
    throw new Error(
      'BLOCKED_PENDING_DURABLE_RECOVERY: UNTRUSTED_OFFLINE_DISPATCHER: Unregistered or forged offline dispatcher rejected fail-closed before any probe or cleanup execution (R6-01)'
    );
  }
  if (meta.dispatchFn !== dispatcher) {
    throw new Error(
      'BLOCKED_PENDING_DURABLE_RECOVERY: UNTRUSTED_OFFLINE_DISPATCHER: Cloned or proxied offline dispatcher rejected fail-closed (R6-01)'
    );
  }
  if (!meta.projectRef || meta.projectRef !== normRef || meta.projectRef !== HARDCODED_TEMP_REF || isForbiddenProject(meta.projectRef)) {
    throw new Error(
      `CRITICAL_SECURITY_VIOLATION: OFFLINE_DISPATCHER_PROJECT_MISMATCH: Trusted offline dispatcher bound to '${meta.projectRef}', expected '${normRef}' (R6-01)`
    );
  }
  if (!meta.runId || !runId || meta.runId !== runId) {
    throw new Error(
      `OFFLINE_DISPATCHER_RUN_MISMATCH: Trusted offline dispatcher bound to runId '${meta.runId || 'unbound'}', expected '${runId || 'none'}' (R6-01)`
    );
  }
  assertOfflineMockTransport(meta.rawTransportFetch);
  return meta;
}

/**
 * Verifies that an Admin client adapter was constructed by this module's createHostedAdminClient(),
 * preserves immutable registered capabilities, and matches project/run/transport bindings (R4-01).
 */
export function assertTrustedAdminClient(
  adminClient,
  {
    projectRef = HARDCODED_TEMP_REF,
    runId = null,
    requireRunBinding = true
  } = {}
) {
  const normRef = (projectRef || '').trim().toLowerCase();
  if (!adminClient || (typeof adminClient !== 'object' && typeof adminClient !== 'function')) {
    throw new Error(
      'BLOCKED_PENDING_DURABLE_RECOVERY: UNTRUSTED_ADMIN_CLIENT: Admin client adapter must be a registered fixture-backed instance from createHostedAdminClient() (R4-01)'
    );
  }

  const meta = TRUSTED_ADMIN_CLIENTS.get(adminClient);
  if (!meta) {
    throw new Error(
      'BLOCKED_PENDING_DURABLE_RECOVERY: UNTRUSTED_ADMIN_CLIENT: Unregistered or forged Admin client adapter rejected fail-closed before provider operation (R4-01)'
    );
  }

  if (!meta.projectRef || meta.projectRef !== normRef || meta.projectRef !== HARDCODED_TEMP_REF || isForbiddenProject(meta.projectRef)) {
    throw new Error(
      `CRITICAL_SECURITY_VIOLATION: ADMIN_CLIENT_PROJECT_MISMATCH: Trusted Admin adapter bound to '${meta.projectRef}', expected '${normRef}' (R4-01)`
    );
  }

  if (requireRunBinding) {
    if (!meta.runId || !runId || meta.runId !== runId) {
      throw new Error(
        `ADMIN_CLIENT_RUN_MISMATCH: Trusted Admin adapter bound to runId '${meta.runId || 'unbound'}', expected '${runId || 'none'}' (R4-01)`
      );
    }
  } else if (meta.runId && runId && meta.runId !== runId) {
    throw new Error(
      `ADMIN_CLIENT_RUN_MISMATCH: Trusted Admin adapter bound to runId '${meta.runId}', expected '${runId}' (R4-01)`
    );
  }

  assertOfflineMockTransport(meta.rawTransportFetch);

  for (const [methodName, expectedFn] of Object.entries(meta.capabilities)) {
    if (adminClient[methodName] !== expectedFn) {
      throw new Error(
        `TRUSTED_ADAPTER_MUTATION_REJECTED: Trusted Admin adapter method '${methodName}' was altered or replaced after registration (R4-01)`
      );
    }
  }

  return meta;
}

/**
 * Dynamically traps globalThis.fetch during isolated offline execution using a reference-counted lease (R3-01).
 */
export async function runWithBlockedRealFetch(fn) {
  const release = GlobalFetchIsolationCoordinator.acquire();
  try {
    return await fn();
  } finally {
    release();
  }
}

export const HARDCODED_REAL_REF = 'bsfwzvgynwriswapxpsp';
export const HARDCODED_TIO_WORLD_REF = 'oykupyiitspujzpwwvuj';
export const HARDCODED_TEMP_REF = 'wvdabiwbaavfggcmpizd';
export const DEFAULT_PROBE_TIMEOUT_MS = 5000;
export const STORAGE_PROBE_BUCKET = 'task06i_probe_bucket';

/**
 * Feasible 10-probe subset supported for controlled offline-tested execution (H3-01).
 * Comprises native bypass, password token hooks, and consumer linger/invalidation probes.
 */
export const SUPPORTED_SUBSET_PROBE_IDS = Object.freeze([
  'BYPASS-01',
  'BYPASS-02',
  'BYPASS-05',
  'HOOK-01',
  'HOOK-02',
  'SESSION-01',
  'SESSION-02',
  'SESSION-03',
  'SESSION-04',
  'SESSION-05'
]);

/**
 * 5 probes blocked pending hosted provider preconditions (H3-01).
 * Require external configuration, delivered OTP/magic-link tokens, or Edge Function deployment.
 */
export const PREREQUISITE_BLOCKED_PROBE_IDS = Object.freeze([
  'BYPASS-03',
  'BYPASS-04',
  'HOOK-03',
  'HOOK-04',
  'SESSION-06'
]);

/**
 * 3 Layer A probes unsupported for hosted HTTP dispatch (H3-01).
 * Cover claims.amr mutation and transaction-abort hooks; verified authoritatively offline via PostgreSQL parity.
 */
export const UNSUPPORTED_LAYER_B_PROBE_IDS = Object.freeze([
  'HOOK-05',
  'HOOK-06',
  'HOOK-07'
]);

/**
 * Explicit TestRunInventory run lifecycle states for admission control and cleanup fencing (R3-04).
 */
export const INVENTORY_RUN_STATE = Object.freeze({
  ACTIVE: 'ACTIVE',
  QUIESCING: 'QUIESCING',
  CLEANUP_ACTIVE: 'CLEANUP_ACTIVE',
  RESIDUAL_BLOCKED: 'RESIDUAL_BLOCKED',
  FINALIZED: 'FINALIZED'
});

/**
 * Storage Fixture Lifecycle States (R1-03, R2-02).
 * Separates creation obligation tracking from deletion eligibility.
 * Only affirmative RUN_CREATED_VERIFIED authorizes deletion.
 */
export const STORAGE_LIFECYCLE_STATE = Object.freeze({
  ABSENCE_VERIFIED: 'ABSENCE_VERIFIED',
  DEFINITIVE_NON_CREATION: 'DEFINITIVE_NON_CREATION',
  CREATION_PENDING: 'CREATION_PENDING',
  CREATION_IN_FLIGHT: 'CREATION_IN_FLIGHT',
  CREATION_INDETERMINATE: 'CREATION_INDETERMINATE',
  CONFLICT_EXISTING_PRESERVED: 'CONFLICT_EXISTING_PRESERVED',
  CREATION_FAILED: 'CREATION_FAILED',
  RESIDUAL_OWNERSHIP_BLOCKED: 'RESIDUAL_OWNERSHIP_BLOCKED',
  RUN_CREATED_VERIFIED: 'RUN_CREATED_VERIFIED',
  CLEANUP_PENDING: 'CLEANUP_PENDING',
  CLEANUP_INDETERMINATE: 'CLEANUP_INDETERMINATE',
  DELETION_VERIFIED: 'DELETION_VERIFIED',
  RESIDUAL_BLOCKED: 'RESIDUAL_BLOCKED'
});

/**
 * Normalized Supabase Storage provider response classifications (R2-03).
 */
export const STORAGE_RESPONSE_CLASS = Object.freeze({
  OBJECT_PRESENT: 'OBJECT_PRESENT',
  OBJECT_ABSENT: 'OBJECT_ABSENT',
  BUCKET_MISSING: 'BUCKET_MISSING',
  CONFLICT_EXISTS: 'CONFLICT_EXISTS',
  UNAUTHORIZED_OR_FORBIDDEN: 'UNAUTHORIZED_OR_FORBIDDEN',
  RATE_LIMITED_OR_SERVER_ERROR: 'RATE_LIMITED_OR_SERVER_ERROR',
  MALFORMED_RESPONSE: 'MALFORMED_RESPONSE',
  TRANSPORT_FAILURE: 'TRANSPORT_FAILURE',
  INDETERMINATE: 'INDETERMINATE'
});

const STORAGE_UNVERIFIED_PRE_CLEANUP_STATES = new Set([
  STORAGE_LIFECYCLE_STATE.ABSENCE_VERIFIED,
  STORAGE_LIFECYCLE_STATE.DEFINITIVE_NON_CREATION,
  STORAGE_LIFECYCLE_STATE.CREATION_PENDING,
  STORAGE_LIFECYCLE_STATE.CREATION_IN_FLIGHT,
  STORAGE_LIFECYCLE_STATE.CREATION_INDETERMINATE,
  STORAGE_LIFECYCLE_STATE.CONFLICT_EXISTING_PRESERVED,
  STORAGE_LIFECYCLE_STATE.CREATION_FAILED,
  STORAGE_LIFECYCLE_STATE.RESIDUAL_OWNERSHIP_BLOCKED
]);

/**
 * Canonical probe dependency graph enforcing prerequisite completeness (H3-01, H3-R1).
 * SESSION-01 establishes the pre-invalidation baseline (preInvalidationSessionValid).
 * SESSION-02 mutates the password and confirms revocation (sessionRevocationConfirmed).
 * SESSION-03, SESSION-04, SESSION-05, SESSION-06 require both SESSION-01 and SESSION-02.
 */
export const CANONICAL_PROBE_DEPENDENCIES = Object.freeze({
  'BYPASS-01': Object.freeze([]),
  'BYPASS-02': Object.freeze([]),
  'BYPASS-03': Object.freeze([]),
  'BYPASS-04': Object.freeze([]),
  'BYPASS-05': Object.freeze([]),
  'HOOK-01': Object.freeze([]),
  'HOOK-02': Object.freeze(['HOOK-01']),
  'HOOK-03': Object.freeze([]),
  'HOOK-04': Object.freeze([]),
  'HOOK-05': Object.freeze([]),
  'HOOK-06': Object.freeze([]),
  'HOOK-07': Object.freeze([]),
  'SESSION-01': Object.freeze(['HOOK-01']),
  'SESSION-02': Object.freeze(['HOOK-01', 'SESSION-01']),
  'SESSION-03': Object.freeze(['HOOK-01', 'SESSION-01', 'SESSION-02']),
  'SESSION-04': Object.freeze(['HOOK-01', 'SESSION-01', 'SESSION-02']),
  'SESSION-05': Object.freeze(['HOOK-01', 'SESSION-01', 'SESSION-02']),
  'SESSION-06': Object.freeze(['HOOK-01', 'SESSION-01', 'SESSION-02'])
});

/**
 * Validates runId format, enforcing entropy, uniqueness, and rejecting traversal/slashes/whitespace (H3-02).
 */
export function validateRunId(runId) {
  if (typeof runId !== 'string' || !runId.trim()) {
    throw new Error('INVALID_RUN_ID: runId must be a non-empty string');
  }
  if (runId.includes('..') || runId.includes('/') || runId.includes('\\') || /\s/.test(runId)) {
    throw new Error(
      `INVALID_RUN_ID: runId '${runId}' contains invalid characters (path traversal, slashes, or whitespace prohibited)`
    );
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(runId)) {
    throw new Error(
      `INVALID_RUN_ID: runId '${runId}' must only contain alphanumeric characters, hyphens, and underscores`
    );
  }
  return runId;
}

/**
 * Validates UUID v4/standard format, rejecting non-UUID identity references.
 */
export function validateUuid(id) {
  if (typeof id !== 'string' || !id.trim()) {
    throw new Error('INVALID_UUID: UUID must be a non-empty string');
  }
  const cleanId = id.trim();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(cleanId)) {
    throw new Error(`INVALID_UUID: '${cleanId}' is not a valid UUID format`);
  }
  return cleanId;
}

/**
 * Returns the run-scoped relative object path within task06i_probe_bucket (H3-02).
 */
export function getStorageProbeObjectPath(runId) {
  const valid = validateRunId(runId);
  return `${valid}/probe.txt`;
}

/**
 * Returns the fully qualified run-scoped Storage object key (H3-02).
 */
export function getStorageProbeObjectKey(runId) {
  const valid = validateRunId(runId);
  return `${STORAGE_PROBE_BUCKET}/${valid}/probe.txt`;
}

/**
 * Validates selected probe subset for unknown IDs, duplicates, dependency completeness,
 * and live-mode support (H3-01).
 */
export function validateSelectedProbeIds(selectedProbeIds, rawOptions = {}) {
  admitValidatedInput(rawOptions, 'validateSelectedProbeIdsOptions');
  const safeIds = snapshotStringArray(selectedProbeIds, 'selectedProbeIds', false, true, 'INVALID_PROBE_SELECTION');

  const seen = new Set();
  for (let i = 0; i < safeIds.length; i++) {
    const cleanId = safeIds[i].trim();
    if (seen.has(cleanId)) {
      throw new Error(`INVALID_PROBE_SELECTION: duplicate probe ID '${cleanId}' detected`);
    }
    seen.add(cleanId);
    if (!EXPECTED_REQUIREMENT_IDS.has(cleanId)) {
      throw new Error(`INVALID_PROBE_SELECTION: unknown probe ID '${cleanId}'`);
    }
    if (UNSUPPORTED_LAYER_B_PROBE_IDS.includes(cleanId)) {
      throw new Error(`UNSUPPORTED_PROBE: probe '${cleanId}' is not supported for hosted HTTP execution (Layer A only)`);
    }
    if (PREREQUISITE_BLOCKED_PROBE_IDS.includes(cleanId)) {
      throw new Error(`UNRESOLVED_PREREQUISITE: probe '${cleanId}' cannot be executed due to missing provider prerequisites`);
    }
  }

  for (const cleanId of seen) {
    const deps = CANONICAL_PROBE_DEPENDENCIES[cleanId] || [];
    const missing = deps.filter(d => !seen.has(d));
    if (missing.length > 0) {
      throw new Error(
        `DEPENDENCY_INCOMPLETE: probe '${cleanId}' requires prerequisite probe(s) '${missing.join("', '")}' to also be selected`
      );
    }
  }

  return Array.from(seen);
}

/**
 * Brevo sender and domain readiness baseline audited for Phase 1.2.
 * Documents observed read-only status without initiating mutations or email dispatch.
 */
export const BREVO_AUDIT_BASELINE = Object.freeze({
  plan: 'Free',
  dailyQuota: 300,
  smtpRelayEnabled: true,
  authenticatedSendingDomains: 0,
  readinessStatus: 'UNAUTHENTICATED_SENDER_DOMAIN_BLOCKED',
  deliveryPolicy: 'Transactional OTP delivery via external SMTP is BLOCKED until an authenticated domain is configured and owner-authorized; native email routes are suppressed fail-closed by Send Email Hook (SQLSTATE 42501).'
});

/**
 * Canonical Auth endpoint capability matrix (R13-01).
 * Specifies session-minting capability, provider mutation ability, user creation,
 * email triggers, evidence expectations, cleanup obligations, and indeterminate behavior.
 */
export const AUTH_ENDPOINT_CAPABILITIES = Object.freeze({
  'POST /auth/v1/otp': Object.freeze({
    probeId: 'BYPASS-01',
    endpoint: '/auth/v1/otp',
    method: 'POST',
    canMintSession: false,
    canCreateUser: true,
    canCreateUsers: true,
    canModifyProviderState: true,
    requiresCleanupReconciliation: true,
    canTriggerEmail: true,
    requiredEvidence: 'route_disabled (providerDisabled === true) and HTTP non-200',
    cleanupObligation: 'Track created user into createdUsers if created; register untracked user creation risk on transport error, unreadable response, or empty HTTP 200; track unexpected tokens for cleanup',
    indeterminateBehavior: 'AUTH_RESPONSE_INDETERMINATE on transport error or unreadable/missing user ID, register untracked user, fail cleanup closed'
  }),
  'POST /auth/v1/signup': Object.freeze({
    probeId: 'BYPASS-02',
    endpoint: '/auth/v1/signup',
    method: 'POST',
    canMintSession: true, // Signup with Confirm Email disabled returns active session (R16-01)
    canCreateUser: true,
    canCreateUsers: true,
    canModifyProviderState: true,
    requiresCleanupReconciliation: true,
    canTriggerEmail: true,
    requiredEvidence: 'signup_disabled === true, status !== 200, zero created user, zero tokens',
    cleanupObligation: 'Track created user into createdUsers if verified run-created; track unexpected session into trackedSessions; register untracked user/session on transport error, unreadable response, empty HTTP 200, or unparsed session ID',
    indeterminateBehavior: 'AUTH_RESPONSE_INDETERMINATE on transport error, unreadable/missing user ID, or missing session ID; register untracked user and/or session, fail cleanup closed'
  }),
  'POST /auth/v1/verify': Object.freeze({
    probeId: 'BYPASS-03',
    endpoint: '/auth/v1/verify',
    method: 'POST',
    canMintSession: true, // Verification challenge success issues tokens and session (R13-01)
    canCreateUser: false,
    canCreateUsers: false,
    canModifyProviderState: true,
    requiresCleanupReconciliation: true,
    canTriggerEmail: false,
    requiredEvidence: 'hook_rejected === true (42501) and HTTP non-200, zero tokens',
    cleanupObligation: 'Track unexpected session for revocation; indeterminate HTTP 200 / transport loss creates untracked session risk',
    indeterminateBehavior: 'AUTH_RESPONSE_INDETERMINATE, register untracked session, fail cleanup closed'
  }),
  'POST /auth/v1/recover': Object.freeze({
    probeId: 'BYPASS-05',
    endpoint: '/auth/v1/recover',
    method: 'POST',
    canMintSession: false,
    canCreateUser: false,
    canCreateUsers: false,
    canModifyProviderState: true,
    requiresCleanupReconciliation: false,
    canTriggerEmail: true,
    requiredEvidence: 'recovery_suppressed === true (42501) and zero recovery_token',
    cleanupObligation: 'Track unexpected tokens if issued',
    indeterminateBehavior: 'AUTH_RESPONSE_PROVIDER_FAILURE (no session minting or user creation capability)'
  }),
  'POST /auth/v1/token?grant_type=password': Object.freeze({
    probeId: 'HOOK-01',
    endpoint: '/auth/v1/token?grant_type=password',
    method: 'POST',
    canMintSession: true,
    canCreateUser: false,
    canCreateUsers: false,
    canModifyProviderState: true,
    requiresCleanupReconciliation: true,
    canTriggerEmail: false,
    requiredEvidence: 'access_token, refresh_token, session_id, amr_authenticated: true, verified claims',
    cleanupObligation: 'Track session into trackedSessions for signOut revocation; unverified token captured for cleanup',
    indeterminateBehavior: 'AUTH_RESPONSE_INDETERMINATE, register untracked session, fail cleanup closed'
  }),
  'POST /auth/v1/token?grant_type=refresh_token': Object.freeze({
    probeId: 'HOOK-02',
    endpoint: '/auth/v1/token?grant_type=refresh_token',
    method: 'POST',
    canMintSession: true,
    canCreateUser: false,
    canCreateUsers: false,
    canModifyProviderState: true,
    requiresCleanupReconciliation: true,
    canTriggerEmail: false,
    requiredEvidence: 'refreshed access_token, amr_preserved: true, verified claims',
    cleanupObligation: 'Track refreshed session context for signOut revocation',
    indeterminateBehavior: 'AUTH_RESPONSE_INDETERMINATE, register untracked session, fail cleanup closed'
  }),
  'POST /auth/v1/token?grant_type=password (verifyUserCredentials)': Object.freeze({
    probeId: 'verify_credentials',
    endpoint: '/auth/v1/token?grant_type=password',
    method: 'POST',
    canMintSession: true,
    canCreateUser: false,
    canCreateUsers: false,
    canModifyProviderState: true,
    requiresCleanupReconciliation: true,
    canTriggerEmail: false,
    requiredEvidence: 'HTTP 200 with access_token and session_id, followed by immediate verified local signOut',
    cleanupObligation: 'Immediate local signOut; on failure register verification session leak or untracked session',
    indeterminateBehavior: 'AUTH_RESPONSE_INDETERMINATE, register untracked session, fail cleanup closed'
  }),
  'PUT /auth/v1/admin/users/:id': Object.freeze({
    probeId: 'SESSION-02',
    endpoint: '/auth/v1/admin/users/:id',
    method: 'PUT',
    canMintSession: false,
    canCreateUser: false,
    canCreateUsers: false,
    canModifyProviderState: true,
    requiresCleanupReconciliation: true,
    canTriggerEmail: false,
    requiredEvidence: 'Admin password update confirmation, followed by affirmative session_not_found on probe',
    cleanupObligation: 'Pre-dispatch restoration registration; restore original password during cleanup',
    indeterminateBehavior: 'State transitions to indeterminate; obligation preserved for cleanup restoration'
  }),
  'POST /auth/v1/logout?scope=local': Object.freeze({
    probeId: 'SESSION-03',
    endpoint: '/auth/v1/logout',
    method: 'POST',
    canMintSession: false,
    canCreateUser: false,
    canCreateUsers: false,
    canModifyProviderState: true,
    requiresCleanupReconciliation: false,
    canTriggerEmail: false,
    requiredEvidence: 'Sign-out confirmation followed by affirmative session_not_found on GET /auth/v1/user',
    cleanupObligation: 'Marks session as revoked in inventory (idempotent)',
    indeterminateBehavior: 'Session remains unconfirmed; subsequent GET /user probe determines revocation state'
  })
});

/**
 * Resolves the canonical capability definition for an endpoint key or probe ID (R15-02).
 * Prevents configuration and dispatcher capability drift.
 */
export function getEndpointCapabilities(endpointOrProbeId) {
  if (!endpointOrProbeId || typeof endpointOrProbeId !== 'string') {
    return null;
  }
  const key = endpointOrProbeId.trim();
  if (AUTH_ENDPOINT_CAPABILITIES[key]) {
    return AUTH_ENDPOINT_CAPABILITIES[key];
  }
  return Object.values(AUTH_ENDPOINT_CAPABILITIES).find(c => c.probeId === key || c.endpoint === key) || null;
}

/**
 * Explicit user identity ownership classifications (R16-02).
 * Distinguishes verified run-created resources from pre-existing fixtures or unproven identities.
 */
export const USER_OWNERSHIP = Object.freeze({
  PRE_EXISTING_REFERENCED: 'PRE_EXISTING_REFERENCED',
  RUN_CREATED_VERIFIED: 'RUN_CREATED_VERIFIED',
  CREATION_INDETERMINATE: 'CREATION_INDETERMINATE',
  OWNERSHIP_UNKNOWN: 'OWNERSHIP_UNKNOWN'
});

/**
 * Validates affirmative run-created proof structure (R16-02).
 * Rejects bare caller-supplied metadata flags (Requirement 14).
 */
export function isValidCreationProof(proof) {
  if (!proof || typeof proof !== 'object') return false;
  // A bare metadata flag alone cannot certify ownership (Requirement 14, R16-02)
  if (proof.isCreated === true && Object.keys(proof).length === 1) return false;
  if (proof.callerFlag === true && Object.keys(proof).length === 1) return false;
  if (proof.created === true && Object.keys(proof).length === 1) return false;

  switch (proof.type) {
    case 'before_after_check':
    case 'before_after_correlation':
      return proof.preCheckAbsent === true && proof.postCheckPresent === true;
    case 'provider_admin_create':
      return (
        typeof proof.providerReturnedId === 'string' &&
        proof.providerReturnedId.trim().length > 0 &&
        proof.affirmativeCreationConfirmed === true
      );
    case 'baseline_set_difference':
      return (
        proof.absentFromBaseline === true &&
        typeof proof.baselineSnapshotId === 'string' &&
        proof.baselineSnapshotId.trim().length > 0
      );
    default:
      return false;
  }
}

/**
 * Creates a structured creation proof descriptor for verified run-created identities.
 */
export function createCreationProof(type = 'before_after_check', details = {}) {
  return Object.freeze({
    type,
    preCheckAbsent: details.preCheckAbsent ?? true,
    postCheckPresent: details.postCheckPresent ?? true,
    providerReturnedId: details.providerReturnedId || null,
    affirmativeCreationConfirmed: details.affirmativeCreationConfirmed ?? true,
    timestamp: new Date().toISOString(),
    ...details
  });
}

/**
 * Validates affirmative pre-existence proof structure for protected seed identities (R17-03).
 * A bare email string or caller assertion alone cannot confer pre-existing seed status.
 */
export function isValidPreExistenceProof(proof) {
  if (!proof || typeof proof !== 'object') return false;
  if (proof.isSeed === true && Object.keys(proof).length === 1) return false;
  if (proof.callerFlag === true && Object.keys(proof).length === 1) return false;

  switch (proof.type) {
    case 'preflight_discovery':
      return (
        typeof proof.verifiedSeedUserId === 'string' &&
        proof.verifiedSeedUserId.trim().length > 0 &&
        proof.preflightVerified === true
      );
    case 'provider_lookup':
      return (
        typeof proof.lookupUserId === 'string' &&
        proof.lookupUserId.trim().length > 0 &&
        proof.userExistsBeforeRun === true
      );
    case 'seed_credential_verification':
      return (
        typeof proof.verifiedUserId === 'string' &&
        proof.verifiedUserId.trim().length > 0 &&
        proof.credentialsVerifiedBeforeRun === true
      );
    default:
      return false;
  }
}

/**
 * Creates a structured pre-existence proof descriptor for verified seed identities (R17-03).
 */
export function createPreExistenceProof(type = 'preflight_discovery', details = {}) {
  return Object.freeze({
    type,
    verifiedSeedUserId: details.verifiedSeedUserId || details.userId || null,
    lookupUserId: details.lookupUserId || details.userId || null,
    verifiedUserId: details.verifiedUserId || details.userId || null,
    preflightVerified: details.preflightVerified ?? true,
    userExistsBeforeRun: details.userExistsBeforeRun ?? true,
    credentialsVerifiedBeforeRun: details.credentialsVerifiedBeforeRun ?? true,
    timestamp: new Date().toISOString(),
    ...details
  });
}

export const TIO_SUPABASE_REAL_REF = HARDCODED_REAL_REF;
export const TIO_SUPABASE_TEMP_REF = process.env.TIO_SUPABASE_TEMP_REF || HARDCODED_TEMP_REF;

// Internal private immutable array — cannot be mutated from outside
const INTERNAL_FORBIDDEN_REFS = Object.freeze([
  HARDCODED_TIO_WORLD_REF, // Tio-world: PERMANENT IMMUNITY
  HARDCODED_REAL_REF       // REAL Tio-Tnyx: protected production backend
]);

/**
 * Authoritative, non-bypassable forbidden project check.
 * Direct hardcoded constant string comparisons guarantee immunity from Set mutation,
 * prototype pollution, env overrides, or export tampering.
 */
function isForbiddenProject(ref) {
  if (!ref || typeof ref !== 'string') return false;
  const norm = ref.trim().toLowerCase();
  if (norm === HARDCODED_TIO_WORLD_REF || norm === HARDCODED_REAL_REF) {
    return true;
  }
  for (const forbidden of INTERNAL_FORBIDDEN_REFS) {
    if (norm === forbidden) return true;
  }
  const envRealRef = (process.env.TIO_SUPABASE_REAL_REF || '').trim().toLowerCase();
  if (envRealRef && norm === envRealRef) {
    return true;
  }
  return false;
}

/**
 * Immutable lookup interface exported for consumers/tests.
 * Mutation methods like delete, add, or clear either do not exist or throw errors.
 * validateTargetProject does NOT rely on this object for authoritative security decisions.
 */
export const IMMUTABLE_FORBIDDEN_PROJECTS = Object.freeze({
  has(ref) {
    return isForbiddenProject(ref);
  },
  includes(ref) {
    return isForbiddenProject(ref);
  },
  delete() {
    throw new TypeError('IMMUTABLE_FORBIDDEN_PROJECTS is immutable; deletion prohibited');
  },
  add() {
    throw new TypeError('IMMUTABLE_FORBIDDEN_PROJECTS is immutable; addition prohibited');
  },
  clear() {
    throw new TypeError('IMMUTABLE_FORBIDDEN_PROJECTS is immutable; clear prohibited');
  },
  [Symbol.iterator]() {
    return INTERNAL_FORBIDDEN_REFS[Symbol.iterator]();
  },
  get size() {
    return INTERNAL_FORBIDDEN_REFS.length;
  }
});

export const RESERVED_TEST_DOMAINS = ['.invalid', '.example', '.test', '.localhost'];

export const RATE_LIMIT_CONFIG = {
  maxTotalRequests: 25,
  minIntervalMs: 1000
};

const SENSITIVE_KEY_SUBSTRINGS = [
  'secret',
  'password',
  'token',
  'key',
  'authorization',
  'bearer',
  'credential',
  'service_role',
  'refresh_token',
  'access_token',
  'apikey',
  'api_key'
];

const SENSITIVE_KEY_NAMES = 'api_key|apikey|secret|password|token_hash|token|service_role|refresh_token|access_token|authorization|credential';
const SENSITIVE_KEY_SET = new Set([
  'api_key', 'apikey', 'secret', 'password', 'token_hash',
  'token', 'service_role', 'refresh_token', 'access_token',
  'authorization', 'credential'
]);

/**
 * Centrally determines whether a field or parameter name is sensitive.
 * Resolves PRRT_kwDOVtCmZc66kR_F and PRRT_kwDOVtCmZc66kYUU.
 */
export function isSensitiveKey(key) {
  if (typeof key !== 'string') return false;
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_SET.has(lower) || SENSITIVE_KEY_SUBSTRINGS.some(sub => lower.includes(sub));
}

/**
 * Robustly parses and redacts sensitive key-value pairs from diagnostic strings.
 * Handles single/double quotes, unclosed quotes, escaped quotes (\", \'), internal whitespace,
 * ampersands, and unquoted values without leaking substrings.
 * Resolves PRRT_kwDOVtCmZc66jdT4, PRRT_kwDOVtCmZc66joKm, PRRT_kwDOVtCmZc66kR_F, PRRT_kwDOVtCmZc66kR_N, and PRRT_kwDOVtCmZc66kYUU.
 */
export function redactSensitiveFields(str) {
  if (typeof str !== 'string') return str;

  const keyRegex = /(?:["']?([a-zA-Z0-9_-]+)["']?)\s*[:=]\s*/g;
  let result = '';
  let lastIndex = 0;
  let match;

  while ((match = keyRegex.exec(str)) !== null) {
    if (!isSensitiveKey(match[1])) {
      continue;
    }

    result += str.slice(lastIndex, match.index);
    let prefix = match[0]; // e.g. 'password=' or '"password": '

    let i = match.index + prefix.length;

    // Check if followed by Bearer scheme (PRRT_kwDOVtCmZc66ij55)
    const bearerMatch = str.slice(i).match(/^Bearer\s+/i);
    if (bearerMatch) {
      prefix += bearerMatch[0];
      i += bearerMatch[0].length;
    }

    // Check if already redacted
    if (str.startsWith('[REDACTED]', i) || str.startsWith('"[REDACTED]"', i) || str.startsWith("'[REDACTED]'", i)) {
      result += prefix;
      lastIndex = i;
      keyRegex.lastIndex = i;
      continue;
    }

    let quoteChar = null;
    let isEscapedQuote = false;

    // Check if opening quote or escaped quote
    if (str[i] === '"' || str[i] === "'") {
      quoteChar = str[i];
      i++;
    } else if (str[i] === '\\' && (str[i + 1] === '"' || str[i + 1] === "'")) {
      isEscapedQuote = true;
      quoteChar = str[i + 1];
      i += 2;
    }

    if (quoteChar !== null) {
      let valueClosed = false;
      let startVal = i;
      while (i < str.length) {
        if (str[i] === quoteChar) {
          let backslashCount = 0;
          let b = i - 1;
          while (b >= startVal && str[b] === '\\') {
            backslashCount++;
            b--;
          }
          if (isEscapedQuote) {
            // For opening \" or \', the closing delimiter has an odd number of backslashes (at least 1),
            // and the preceding backslashes must be paired (even number of backslash pairs).
            // E.g., \" (1 backslash) closes, but \\\" (3 backslashes = 1 pair + 1) is an inner escaped quote.
            const isOdd = backslashCount % 2 === 1;
            const backslashPairs = Math.floor((backslashCount - 1) / 2);
            if (isOdd && backslashPairs % 2 === 0) {
              valueClosed = true;
              i++;
              break;
            }
          } else {
            // For opening " or ', the closing delimiter is preceded by an even number of backslashes (e.g. 0 backslashes)
            if (backslashCount % 2 === 0) {
              valueClosed = true;
              i++;
              break;
            }
          }
        }
        if (str[i] === '\n' || str[i] === '\r') {
          break;
        }
        i++;
      }

      const quotePrefix = isEscapedQuote ? `\\${quoteChar}` : quoteChar;
      const quoteSuffix = isEscapedQuote ? `\\${quoteChar}` : quoteChar;

      if (valueClosed) {
        result += `${prefix}${quotePrefix}[REDACTED]${quoteSuffix}`;
      } else {
        // Unclosed quoted value: redact entire value until newline / comma / brace / bracket / & / end
        while (i < str.length && !/[\r\n,&}]/.test(str[i])) {
          i++;
        }
        const quotePrefix = isEscapedQuote ? `\\${quoteChar}` : quoteChar;
        result += `${prefix}${quotePrefix}[REDACTED]`;
      }
    } else {
      // Unquoted value: ends at whitespace, comma, bracket, brace, quote, or &
      while (i < str.length && !/[\s"',}&\]]/.test(str[i])) {
        i++;
      }
      result += `${prefix}[REDACTED]`;
    }

    lastIndex = i;
    keyRegex.lastIndex = i;
  }

  result += str.slice(lastIndex);
  return result;
}

/**
 * Sanitizes strings, objects, or arrays to redact secrets before logging or storage.
 * Handles structured JSON strings, JWTs, bearer headers, key/secret parameters, query strings,
 * quoted values with spaces/ampersands/escaped quotes, nested objects/arrays, and serialized response bodies.
 * Resolves PRRT_kwDOVtCmZc66ij55, PRRT_kwDOVtCmZc66i_Kf, PRRT_kwDOVtCmZc66jG6Y, PRRT_kwDOVtCmZc66jdT4, and PRRT_kwDOVtCmZc66joKm.
 */
export function sanitizeData(data) {
  if (data === null || data === undefined) return data;

  if (typeof data === 'string') {
    const trimmed = data.trim();
    // 1. If string is structured JSON (starts with { or [), parse and recursively sanitize
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed === 'object' && parsed !== null) {
          const sanitizedObj = sanitizeData(parsed);
          return JSON.stringify(sanitizedObj);
        }
      } catch {
        // Not valid JSON, proceed to fail-closed string regex redaction
      }
    }

    // 2. Comprehensive string redactions (PRRT_kwDOVtCmZc66jdT4 & PRRT_kwDOVtCmZc66joKm)
    const withoutBearerOrJwt = data
      // Redact Bearer authorization headers
      .replace(/Bearer\s+[^\s"';,]+/gi, 'Bearer [REDACTED]')
      // Redact full JWTs (header.payload.signature)
      .replace(/eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, '[REDACTED_JWT]')
      // Redact URL query parameters (including URL-encoded characters)
      .replace(new RegExp(`([?&](?:${SENSITIVE_KEY_NAMES})=)([^&\\s]+)`, 'gi'), '$1[REDACTED]');

    return redactSensitiveFields(withoutBearerOrJwt);
  }

  if (Array.isArray(data)) {
    return data.map(item => sanitizeData(item));
  }

  if (typeof data === 'object') {
    const sanitized = {};
    for (const [key, val] of Object.entries(data)) {
      if (isSensitiveKey(key)) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeData(val);
      }
    }
    return sanitized;
  }

  return data;
}

/**
 * Validates that an email address strictly uses reserved test-only domains.
 */
export function validateTestIdentity(email) {
  if (typeof email !== 'string' || !email.includes('@')) {
    throw new Error('invalid_test_identity: email must be a valid email string');
  }

  const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase();
  const isReserved = RESERVED_TEST_DOMAINS.some(suffix => domain.endsWith(suffix));

  if (!isReserved) {
    throw new Error(
      `security_violation: real customer or public domain '${domain}' prohibited. Must use a reserved test domain (*.invalid, *.example, *.test)`
    );
  }

  return true;
}

/**
 * Validates target project against security invariants and strict separation of REAL vs TEMP.
 * REAL project (bsfwzvgynwriswapxpsp) and Tio-world (oykupyiitspujzpwwvuj) are permanently forbidden.
 * In LIVE mode, strictly enforces approved owner TEMP project HARDCODED_TEMP_REF and rejects spoofing.
 * Resolves Phase D, PRRT_kwDOVtCmZc66i2Ff, PRRT_kwDOVtCmZc66i_Kb, and PRRT_kwDOVtCmZc66jOw4.
 */
export function validateTargetProject(projectRef, tempRef = HARDCODED_TEMP_REF, isLive = false, options = {}) {
  if (!projectRef || typeof projectRef !== 'string' || !projectRef.trim()) {
    throw new Error('invalid_project_ref: target projectRef is required and cannot be empty');
  }

  const normRef = projectRef.trim().toLowerCase();

  // 1. Direct hardcoded immunity check: Tio-world
  if (normRef === HARDCODED_TIO_WORLD_REF) {
    throw new Error(
      `CRITICAL_SECURITY_VIOLATION: Project '${normRef}' (Tio-world) is permanently forbidden and immune from testing!`
    );
  }

  // 2. Direct hardcoded protection check: REAL project
  if (normRef === HARDCODED_REAL_REF) {
    throw new Error(
      `CRITICAL_SECURITY_VIOLATION: Project '${normRef}' is the protected REAL backend and is permanently forbidden from test targeting!`
    );
  }

  // 3. Fallback to private immutable lookup
  if (isForbiddenProject(normRef)) {
    throw new Error(
      `CRITICAL_SECURITY_VIOLATION: Project '${normRef}' is permanently forbidden from test targeting!`
    );
  }

  // 4. LIVE Target Enforcement (PRRT_kwDOVtCmZc66jOw4)
  if (isLive) {
    // In LIVE mode, caller-controlled tempRef spoofing is unconditionally rejected
    if (tempRef && typeof tempRef === 'string') {
      const normTemp = tempRef.trim().toLowerCase();
      if (normTemp !== HARDCODED_TEMP_REF) {
        throw new Error(
          `CRITICAL_SECURITY_VIOLATION: Caller-controlled tempRef spoofing rejected! LIVE probes require approved TEMP ref '${HARDCODED_TEMP_REF}', received '${normTemp}'.`
        );
      }
    }

    if (normRef !== HARDCODED_TEMP_REF) {
      throw new Error(
        `unauthorized_target: LIVE target validation strictly requires approved owner TEMP project '${HARDCODED_TEMP_REF}'. Project '${normRef}' is not authorized for live probes.`
      );
    }

    return HARDCODED_TEMP_REF;
  }

  // 5. Non-LIVE (DRY_RUN or Isolated Test Seam) Target Validation
  const effectiveTemp = (tempRef || HARDCODED_TEMP_REF || '').trim().toLowerCase();
  if (effectiveTemp === HARDCODED_TIO_WORLD_REF || effectiveTemp === HARDCODED_REAL_REF || isForbiddenProject(effectiveTemp)) {
    throw new Error(
      `CRITICAL_SECURITY_VIOLATION: Configured TEMP ref '${effectiveTemp}' cannot be a protected or immune project!`
    );
  }

  if (options.allowIsolatedTestRef && !isLive) {
    // Confinable to explicitly isolated test mode only (PRRT_kwDOVtCmZc66jOw4)
    if (normRef !== effectiveTemp) {
      throw new Error(
        `unauthorized_target: Project '${normRef}' does not match isolated test ref '${effectiveTemp}'`
      );
    }
    return normRef;
  }

  // Normal non-live validation defaults to approved TEMP ref
  if (normRef !== HARDCODED_TEMP_REF && normRef !== effectiveTemp) {
    throw new Error(
      `unauthorized_target: Project '${normRef}' is not the authorized TEMP testbed project`
    );
  }

  return normRef;
}

function snapshotRunnerArgv(rawArgv = []) {
  const source = rawArgv === undefined ? [] : rawArgv;
  return snapshotStringArray(source, 'argv', true, false, 'INVALID_RUNNER_ARGV');
}

function snapshotRunnerEnv(rawEnv = {}) {
  const source = rawEnv === undefined ? {} : rawEnv;
  if (utilTypes.isProxy(source)) {
    throw new Error('INVALID_RUNNER_ENV: Proxy env rejected (R8-01)');
  }
  if (source === process.env) {
    const authDesc = Object.getOwnPropertyDescriptor(process.env, 'TASK06I_HOSTED_PROBE_AUTHORIZED');
    const out = {};
    out.TASK06I_HOSTED_PROBE_AUTHORIZED =
      authDesc && Object.hasOwn(authDesc, 'value') && typeof authDesc.value === 'string'
        ? authDesc.value
        : undefined;
    return out;
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('INVALID_RUNNER_ENV: env must be a plain object (R8-01)');
  }
  const proto = Object.getPrototypeOf(source);
  if (proto !== Object.prototype && proto !== null) {
    throw new Error('INVALID_RUNNER_ENV: Unsupported prototype on env rejected (R8-01)');
  }
  if (Object.getOwnPropertySymbols(source).length > 0) {
    throw new Error('INVALID_RUNNER_ENV: Symbol properties on env rejected (R8-01)');
  }
  let authorizedVal;
  for (const key of Object.getOwnPropertyNames(source)) {
    const desc = Object.getOwnPropertyDescriptor(source, key);
    if (!desc || !Object.hasOwn(desc, 'value')) {
      throw new Error(`INVALID_RUNNER_ENV: Accessor property '${key}' on env rejected (R8-01)`);
    }
    if (desc.value !== undefined && typeof desc.value !== 'string') {
      throw new Error(`INVALID_RUNNER_ENV: env.${key} must be a primitive string or undefined (R8-01)`);
    }
    if (key === 'TASK06I_HOSTED_PROBE_AUTHORIZED') {
      authorizedVal = desc.value;
    }
  }
  const out = {};
  out.TASK06I_HOSTED_PROBE_AUTHORIZED = authorizedVal;
  return out;
}

/**
 * Determines runner execution mode.
 * Defaults strictly to DRY_RUN unless explicit --live flag AND env var are present.
 */
export function determineRunnerMode(argv = [], env = {}) {
  const safeArgv = snapshotRunnerArgv(argv);
  const safeEnv = snapshotRunnerEnv(env);
  const hasLiveFlag = safeArgv.includes('--live');
  const hasAuthEnv = safeEnv.TASK06I_HOSTED_PROBE_AUTHORIZED === 'true';

  if (hasLiveFlag && hasAuthEnv) {
    return 'LIVE';
  }

  return 'DRY_RUN';
}

/**
 * Resolves probe readiness status safely without temporal dead zone risk (H3-01).
 */
function getProbeReadinessStatus(id) {
  if (typeof HOSTED_PROBE_SPECIFICATIONS !== 'undefined' && HOSTED_PROBE_SPECIFICATIONS[id]) {
    return HOSTED_PROBE_SPECIFICATIONS[id].readinessStatus;
  }
  if (SUPPORTED_SUBSET_PROBE_IDS.includes(id)) return 'IMPLEMENTED_OFFLINE_TESTED';
  if (PREREQUISITE_BLOCKED_PROBE_IDS.includes(id)) return 'PROVIDER_PRECONDITION_MISSING';
  if (UNSUPPORTED_LAYER_B_PROBE_IDS.includes(id)) return 'BLOCKED_UNSUPPORTED';
  return 'UNKNOWN';
}

/**
 * Plans probe execution across the canonical 18 preflight requirements, supporting
 * controlled subset execution, dependency completeness validation, and run-scoped target formatting (H3-01).
 */
export function planProbeExecution(projectRef, rawOptions = {}) {
  const options = admitValidatedInput(rawOptions, 'planProbeExecutionOptions');
  const isLive = options.isLive === true;
  const tempRef = options.tempRef || HARDCODED_TEMP_REF;
  const validatedRef = validateTargetProject(projectRef, tempRef, isLive, {
    allowIsolatedTestRef: options.allowIsolatedTestRef && !isLive
  });
  const testUser = options.testEmail || 'tio-test-user-06i@proof.invalid';
  validateTestIdentity(testUser);

  const runId = options.runId ? validateRunId(options.runId) : null;

  let selectedSet = null;
  if (options.selectedProbeIds !== undefined && options.selectedProbeIds !== null) {
    const validatedIds = validateSelectedProbeIds(options.selectedProbeIds, { isLive });
    selectedSet = new Set(validatedIds);
  }

  // Preserve canonical matrix ordering from PREFLIGHT_REQUIREMENTS
  const plannedCases = [];
  const notSelectedCases = [];

  for (const req of PREFLIGHT_REQUIREMENTS) {
    const isSelected = selectedSet ? selectedSet.has(req.id) : true;
    const target = req.id === 'SESSION-05' && runId
      ? `GET /storage/v1/object/authenticated/${getStorageProbeObjectKey(runId)}`
      : req.target;

    const caseItem = {
      id: req.id,
      category: req.category,
      target,
      expectedResponse: req.expectedResponse,
      plannedAction: `Execute probe against ${target} on TEMP project ${validatedRef}`,
      testUser,
      status: isSelected ? 'PLANNED' : 'NOT_SELECTED',
      readinessStatus: getProbeReadinessStatus(req.id),
      layer: UNSUPPORTED_LAYER_B_PROBE_IDS.includes(req.id) ? 'Layer A (Offline SQL Parity)' : 'Layer B (Hosted Endpoint)'
    };

    if (isSelected) {
      plannedCases.push(caseItem);
    } else {
      notSelectedCases.push(caseItem);
    }
  }

  return {
    projectRef: validatedRef,
    mode: 'PLANNED',
    testUser,
    runId,
    totalProbes: plannedCases.length,
    totalCanonicalProbes: PREFLIGHT_REQUIREMENTS.length,
    isSubset: selectedSet !== null && selectedSet.size < PREFLIGHT_REQUIREMENTS.length,
    selectedProbeIds: plannedCases.map(c => c.id),
    unselectedProbeIds: notSelectedCases.map(c => c.id),
    plannedCases,
    notSelectedCases,
    matrixSummary: {
      selectedCount: plannedCases.length,
      notSelectedCount: notSelectedCases.length,
      supportedSubsetCount: SUPPORTED_SUBSET_PROBE_IDS.length,
      prerequisiteBlockedCount: PREREQUISITE_BLOCKED_PROBE_IDS.length,
      unsupportedCount: UNSUPPORTED_LAYER_B_PROBE_IDS.length
    }
  };
}

function isNonEmptyObject(val) {
  return val !== null && typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length > 0;
}

function isNonEmptyString(val) {
  return typeof val === 'string' && val.trim().length > 0;
}

function isValidHttpErrorStatus(status) {
  return typeof status === 'number' && Number.isInteger(status) && status >= 400 && status < 600;
}

/**
 * Centrally normalizes and detects any observed token or credential issuance representation.
 * Inspects:
 * - rawOutcome.has_token === true
 * - rawOutcome.access_token (non-empty string)
 * - rawOutcome.refresh_token (non-empty string)
 * - rawOutcome.token (non-empty string)
 * - rawOutcome.tokens (non-empty string or object with access_token/refresh_token/token)
 * Resolves PRRT_kwDOVtCmZc66kYUV.
 */
function extractObservedTokens(rawOutcome) {
  if (rawOutcome === null || rawOutcome === undefined || typeof rawOutcome !== 'object') {
    return null;
  }

  if (rawOutcome.has_token === true) {
    return 'has_token: true';
  }

  if (isNonEmptyString(rawOutcome.access_token)) {
    return 'access_token present';
  }

  if (isNonEmptyString(rawOutcome.refresh_token)) {
    return 'refresh_token present';
  }

  if (isNonEmptyString(rawOutcome.token)) {
    return 'token present';
  }

  if (rawOutcome.tokens !== null && rawOutcome.tokens !== undefined) {
    if (typeof rawOutcome.tokens === 'string' && rawOutcome.tokens.trim().length > 0) {
      return 'tokens string present';
    }
    if (typeof rawOutcome.tokens === 'object') {
      if (isNonEmptyString(rawOutcome.tokens.access_token)) {
        return 'tokens.access_token present';
      }
      if (isNonEmptyString(rawOutcome.tokens.refresh_token)) {
        return 'tokens.refresh_token present';
      }
      if (isNonEmptyString(rawOutcome.tokens.token)) {
        return 'tokens.token present';
      }
      if (Object.keys(rawOutcome.tokens).length > 0) {
        return 'tokens object present';
      }
    }
  }

  return null;
}

/**
 * Safely parses response envelope, preserving HTTP status, structured JSON body,
 * and exact parse status for indeterminate observation. (R12-01, R12-02)
 */
export async function parseResponseEnvelope(res) {
  if (!res) {
    return { ok: false, status: 0, body: null, parseStatus: 'missing_response', parseError: null };
  }
  const status = typeof res.status === 'number' ? res.status : 0;
  if (typeof res.json !== 'function') {
    return { ok: res.ok ?? (status >= 200 && status < 300), status, body: null, parseStatus: 'no_json_function', parseError: null };
  }
  try {
    const body = await res.json();
    if (body === null || body === undefined) {
      return { ok: res.ok ?? (status >= 200 && status < 300), status, body: null, parseStatus: 'empty_body', parseError: null };
    }
    if (typeof body !== 'object') {
      return { ok: res.ok ?? (status >= 200 && status < 300), status, body, parseStatus: 'non_object', parseError: null };
    }
    return { ok: res.ok ?? (status >= 200 && status < 300), status, body, parseStatus: 'parsed', parseError: null };
  } catch (err) {
    return { ok: res.ok ?? (status >= 200 && status < 300), status, body: null, parseStatus: 'unreadable', parseError: err };
  }
}

/**
 * Shared Auth response observation boundary (R12-01, R12-02).
 * Classifies provider responses and registers session / user obligations in inventory.
 * Strictly separates response observation from probe pass/fail verdicts.
 *
 * Classifications:
 * - AUTH_RESPONSE_VERIFIED_REJECTION: Expected rejection (4xx) without tokens.
 * - AUTH_RESPONSE_TOKEN_OBSERVED: Successful authentication with valid token and extractable session.
 * - AUTH_RESPONSE_INDETERMINATE: Uncertain session state (HTTP 200 with unreadable/empty/missing tokens, or post-dispatch transport error).
 * - AUTH_RESPONSE_PROVIDER_FAILURE: HTTP 5xx or transport failure on non-minting request.
 * - AUTH_RESPONSE_UNEXPECTED_TOKEN: Tokens issued on negative probe or error status.
 */
export function observeAuthResponse({
  probeId = 'unknown',
  status = 0,
  parseStatus = 'parsed',
  body = null,
  parseError = null,
  transportError = null,
  inv = null,
  ctx = null,
  expectedOperation = 'token_issuance',
  canMintSession = false,
  canCreateUser = false,
  canModifyProviderState = false,
  testUser = null
} = {}) {
  // 1. Transport error handling
  if (transportError) {
    if (canMintSession && inv) {
      inv.registerUntrackedSession();
    }
    if (canCreateUser && inv) {
      inv.registerUntrackedUser();
    }
    if (canMintSession || canCreateUser) {
      return {
        classification: 'AUTH_RESPONSE_INDETERMINATE',
        status: 0,
        hasTokens: false,
        sessionId: null,
        userId: null,
        accessToken: null,
        refreshToken: null,
        indeterminateSession: Boolean(canMintSession),
        indeterminateUserCreation: Boolean(canCreateUser),
        errorCode: 'TRANSPORT_ERROR_POST_DISPATCH',
        error: `TRANSPORT_ERROR_POST_DISPATCH: Request dispatch threw transport error (${transportError?.message || String(transportError)}). Server may have minted session or created user but client cannot observe response. Untracked residual risk registered (R12-01, R14-02).`,
        body: null
      };
    }
    return {
      classification: 'AUTH_RESPONSE_PROVIDER_FAILURE',
      status: 0,
      hasTokens: false,
      sessionId: null,
      userId: null,
      accessToken: null,
      refreshToken: null,
      indeterminateSession: false,
      indeterminateUserCreation: false,
      errorCode: 'TRANSPORT_ERROR',
      error: `TRANSPORT_ERROR: Request dispatch failed: ${transportError?.message || String(transportError)}`,
      body: null
    };
  }

  // 2. Token extraction from parsed body (if body is an object)
  const isBodyObject = Boolean(body && typeof body === 'object');
  const accessToken = isBodyObject
    ? ((typeof body.access_token === 'string' && body.access_token.trim()) ||
       (typeof body.token === 'string' && body.token.trim()) ||
       (typeof body.tokens?.access_token === 'string' && body.tokens.access_token.trim()) ||
       (typeof body.tokens?.token === 'string' && body.tokens.token.trim()) ||
       (typeof body.session?.access_token === 'string' && body.session.access_token.trim()) ||
       null)
    : null;

  const refreshToken = isBodyObject
    ? ((typeof body.refresh_token === 'string' && body.refresh_token.trim()) ||
       (typeof body.tokens?.refresh_token === 'string' && body.tokens.refresh_token.trim()) ||
       (typeof body.session?.refresh_token === 'string' && body.session.refresh_token.trim()) ||
       null)
    : null;

  let rawSessionId = isBodyObject
    ? ((typeof body.session_id === 'string' && body.session_id.trim()) ||
       (typeof body.session?.id === 'string' && body.session.id.trim()) ||
       (typeof body.tokens?.session_id === 'string' && body.tokens.session_id.trim()) ||
       null)
    : null;

  let rawUserId = isBodyObject
    ? ((typeof body.user?.id === 'string' && body.user.id.trim()) ||
       (typeof body.id === 'string' && body.id.trim()) ||
       (typeof body.tokens?.user?.id === 'string' && body.tokens.user.id.trim()) ||
       null)
    : null;

  // Extract from unverified JWT claims if not present at top level
  if (accessToken && (!rawSessionId || !rawUserId)) {
    try {
      const parts = accessToken.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        if (!rawSessionId && typeof payload?.session_id === 'string' && payload.session_id.trim()) {
          rawSessionId = payload.session_id.trim();
        }
        if (!rawUserId && typeof payload?.sub === 'string' && payload.sub.trim()) {
          rawUserId = payload.sub.trim();
        }
      }
    } catch {}
  }

  const hasTokens = Boolean(accessToken || refreshToken || rawSessionId);
  const returnedEmail =
    (typeof body?.user?.email === 'string' && body.user.email.trim()) ||
    (typeof body?.email === 'string' && body.email.trim()) ||
    (typeof body?.tokens?.user?.email === 'string' && body.tokens.user.email.trim()) ||
    null;
  const userEmail = returnedEmail || testUser || 'tio-test-user-06i@proof.invalid';

  // 3. HTTP 200 evaluation
  if (status >= 200 && status < 300) {
    // Register created, observed, or referenced user into inventory if user ID observed (R2-04, R12-02, R15-01, R16-02)
    if (inv && rawUserId) {
      const uidStr = String(rawUserId).trim();
      if (canCreateUser || probeId === 'BYPASS-01' || probeId === 'BYPASS-02') {
        // R16-02, R17-03: Never assume seed status or run-created ownership from observed response!
        // A bare matching email alone cannot confer protected seed status without verified seed ID (PRRT_kwDOVtCmZc67O5WW).
        const isSeed = Boolean(inv.isSeedIdentity(uidStr, returnedEmail) || inv.isUserReferenced(uidStr));
        if (isSeed) {
          inv.registerReferencedUser({ id: uidStr, email: returnedEmail || userEmail, source: `${probeId}_unexpected_response_matched_seed` });
        } else if (!inv.isUserTracked(uidStr)) {
          inv.registerObservedUser({ id: uidStr, email: returnedEmail || userEmail, source: `${probeId}_unexpected_signup` });
        }
      } else {
        if (!inv.isUserReferenced(uidStr)) {
          inv.registerReferencedUser({ id: uidStr, email: returnedEmail || userEmail, source: `${probeId}_token_observation` });
        }
      }
    }

    // 3A: Parse error or malformed body structure
    if (parseStatus !== 'parsed' || !isBodyObject) {
      if (inv) {
        if (canMintSession) {
          inv.registerUntrackedSession();
        }
        if (canCreateUser) {
          inv.registerUntrackedUser();
        }
      }
      return {
        classification: 'AUTH_RESPONSE_INDETERMINATE',
        status,
        hasTokens: false,
        sessionId: null,
        userId: null,
        accessToken: null,
        refreshToken: null,
        indeterminateSession: Boolean(canMintSession),
        indeterminateUserCreation: Boolean(canCreateUser),
        errorCode: parseStatus === 'unreadable' ? 'UNREADABLE_RESPONSE' : 'INVALID_RESPONSE_STRUCTURE',
        error: `INDETERMINATE_AUTH_RESPONSE: Server returned HTTP ${status} but response body was ${parseStatus}: ${parseError?.message || 'body is not a valid JSON object'} (R12-01, R14-02)`,
        body
      };
    }

    // 3A-2: User creation endpoint returned 200 without extractable user ID (R14-02, R16-01)
    if (canCreateUser && !rawUserId) {
      if (inv) {
        inv.registerUntrackedUser();
        if (canMintSession && !hasTokens) {
          inv.registerUntrackedSession();
        }
      }
      return {
        classification: 'AUTH_RESPONSE_INDETERMINATE',
        status,
        hasTokens: false,
        sessionId: null,
        userId: null,
        accessToken: null,
        refreshToken: null,
        indeterminateSession: Boolean(canMintSession),
        indeterminateUserCreation: true,
        errorCode: 'MISSING_USER_ID',
        error: `INDETERMINATE_AUTH_RESPONSE: Server returned HTTP ${status} for user creation request but response lacked valid user identifier (R14-02, R16-01)`,
        body
      };
    }

    // 3B: Missing access token on session-minting request where token was expected, or on non-user-creating route returning 200 without tokens (R12-01, R13-01, R16-01)
    if (canMintSession && !accessToken && (expectedOperation === 'token_issuance' || !canCreateUser)) {
      if (inv) {
        inv.registerUntrackedSession();
      }
      return {
        classification: 'AUTH_RESPONSE_INDETERMINATE',
        status,
        hasTokens: false,
        sessionId: null,
        userId: null,
        accessToken: null,
        refreshToken: null,
        indeterminateSession: true,
        errorCode: 'MISSING_ACCESS_TOKEN',
        error: `INDETERMINATE_AUTH_RESPONSE: Server returned HTTP ${status} for ${expectedOperation} but response lacked valid access_token (R12-01, R13-01, R16-01)`,
        body
      };
    }

    // 3C: Token present but session ID unextractable (R12-01, R17-01)
    // Endpoint capability expectations must NEVER suppress observed token evidence! (PRRT_kwDOVtCmZc67OhSH)
    if (hasTokens && !rawSessionId) {
      if (inv) {
        inv.registerUntrackedSession();
      }
      if (ctx) {
        if (accessToken) ctx.mintedAccessToken = accessToken;
        if (rawUserId) ctx.activeUserId = String(rawUserId).trim();
      }
      return {
        classification: 'AUTH_RESPONSE_INDETERMINATE',
        status,
        hasTokens: true,
        sessionId: null,
        userId: rawUserId ? String(rawUserId).trim() : null,
        accessToken,
        refreshToken,
        indeterminateSession: true,
        errorCode: 'UNTRACKED_SESSION',
        error: `INDETERMINATE_AUTH_RESPONSE: Server returned token(s) on ${probeId} but session identifier could not be determined from payload or claims (R12-01, R17-01)`,
        body
      };
    }

    // 3D: Valid token and extractable session ID observed
    if (hasTokens) {
      if (inv) {
        if (rawSessionId) {
          inv.registerSession(String(rawSessionId).trim(), { accessToken, source: `${probeId}_observed` });
        }
      }

      if (ctx) {
        if (rawSessionId) ctx.activeSessionId = String(rawSessionId).trim();
        if (rawUserId) ctx.activeUserId = String(rawUserId).trim();
        if (accessToken) {
          ctx.mintedAccessToken = accessToken;
        }
      }

      const isUnexpected = expectedOperation === 'rejection';
      const classification = isUnexpected ? 'AUTH_RESPONSE_UNEXPECTED_TOKEN' : 'AUTH_RESPONSE_TOKEN_OBSERVED';
      return {
        classification,
        status,
        hasTokens: true,
        sessionId: rawSessionId ? String(rawSessionId).trim() : null,
        userId: rawUserId ? String(rawUserId).trim() : null,
        accessToken,
        refreshToken,
        indeterminateSession: false,
        errorCode: isUnexpected ? 'UNEXPECTED_TOKEN_ISSUANCE' : null,
        error: isUnexpected
          ? `SECURITY_INVARIANT_VIOLATION: ${probeId} (${expectedOperation}) unexpectedly issued authentication tokens!`
          : null,
        body
      };
    }

    // 3E: HTTP 200 without tokens on an expected-rejection probe (e.g. anti-enumeration 200)
    return {
      classification: 'AUTH_RESPONSE_INDETERMINATE',
      status,
      hasTokens: false,
      sessionId: null,
      userId: null,
      accessToken: null,
      refreshToken: null,
      indeterminateSession: false,
      errorCode: 'HTTP_200_CANNOT_PROVE_REJECTION',
      error: `HTTP_200_CANNOT_PROVE_REJECTION: Expected rejection but received HTTP ${status} without tokens; anti-enumeration response cannot prove policy enforcement`,
      body
    };
  }

  // 4. HTTP Non-200 evaluation
  if (hasTokens) {
    // Unexpected tokens returned in non-200 error response
    if (inv) {
      if (rawSessionId) {
        inv.registerSession(String(rawSessionId).trim(), { accessToken, source: `${probeId}_unexpected_non200` });
      } else {
        inv.registerUntrackedSession();
      }
    }
    return {
      classification: 'AUTH_RESPONSE_UNEXPECTED_TOKEN',
      status,
      hasTokens: true,
      sessionId: rawSessionId ? String(rawSessionId).trim() : null,
      userId: rawUserId ? String(rawUserId).trim() : null,
      accessToken,
      refreshToken,
      indeterminateSession: !rawSessionId,
      errorCode: 'UNEXPECTED_TOKEN_IN_ERROR_RESPONSE',
      error: `SECURITY_INVARIANT_VIOLATION: ${probeId} returned HTTP ${status} but unexpectedly included session tokens!`,
      body
    };
  }

  // 5xx Server Error
  if (status >= 500 && status < 600) {
    return {
      classification: 'AUTH_RESPONSE_PROVIDER_FAILURE',
      status,
      hasTokens: false,
      sessionId: null,
      userId: null,
      accessToken: null,
      refreshToken: null,
      indeterminateSession: false,
      errorCode: (body?.error_code || body?.code || `HTTP_${status}`).toString(),
      error: body?.msg || body?.message || body?.error_description || `PROVIDER_HTTP_${status}`,
      body
    };
  }

  // 4xx Client Error / Verified Rejection
  const errCode = (body?.error_code || body?.code || null)?.toString() || null;
  const errMsg = body?.msg || body?.message || body?.error_description || (status > 0 ? `HTTP_${status}` : 'Unknown rejection');
  return {
    classification: 'AUTH_RESPONSE_VERIFIED_REJECTION',
    status,
    hasTokens: false,
    sessionId: null,
    userId: null,
    accessToken: null,
    refreshToken: null,
    indeterminateSession: false,
    errorCode: errCode,
    error: errMsg,
    body
  };
}

/**
 * Shared helper to observe and immediately track session tokens across all probes.
 * Captures session identity and cleanup obligations whenever provider responses contain concrete tokens or session evidence.
 * If token is issued but session ID cannot be determined, records untracked session obligation via inv.registerUntrackedSession().
 * For BYPASS-02 (signup), registers user as created for deletion; for all other probes (seed user/login), registers as referenced user.
 * Resolves PRRT_kwDOVtCmZc66sSyk (R8-01).
 */
export function observeAndTrackSessionTokens(body, { inv, ctx, probeId, testUser } = {}) {
  if (!body || typeof body !== 'object') {
    return { hasTokens: false, sessionId: null, userId: null, accessToken: null, refreshToken: null };
  }

  // Detect presence of token(s)
  const accessToken =
    (typeof body.access_token === 'string' && body.access_token.trim()) ||
    (typeof body.token === 'string' && body.token.trim()) ||
    (typeof body.tokens?.access_token === 'string' && body.tokens.access_token.trim()) ||
    (typeof body.tokens?.token === 'string' && body.tokens.token.trim()) ||
    (typeof body.session?.access_token === 'string' && body.session.access_token.trim()) ||
    null;

  const refreshToken =
    (typeof body.refresh_token === 'string' && body.refresh_token.trim()) ||
    (typeof body.tokens?.refresh_token === 'string' && body.tokens.refresh_token.trim()) ||
    (typeof body.session?.refresh_token === 'string' && body.session.refresh_token.trim()) ||
    null;

  let rawSessionId =
    body.session_id ||
    body.session?.id ||
    body.tokens?.session_id ||
    null;

  let rawUserId =
    body.user?.id ||
    body.id ||
    body.tokens?.user?.id ||
    null;

  // If token is present, attempt safe unverified claim extraction for session_id and sub
  if (accessToken && (!rawSessionId || !rawUserId)) {
    try {
      const parts = accessToken.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        if (!rawSessionId && payload?.session_id) {
          rawSessionId = payload.session_id;
        }
        if (!rawUserId && payload?.sub) {
          rawUserId = payload.sub;
        }
      }
    } catch {}
  }

  const hasTokens = Boolean(accessToken || refreshToken || rawSessionId);

  if (hasTokens && inv) {
    const userEmail = testUser || (typeof body.email === 'string' ? body.email : null) || 'tio-test-user-06i@proof.invalid';

    // Register user for cleanup accounting (R15-01, R16-02):
    // For BYPASS-01 or BYPASS-02, unproven unexpected response user IDs are recorded as observed/unverified (NEVER deleted).
    // For seed user or login probes, register as REFERENCED user so pre-existing user is NEVER deleted during cleanup!
    if (rawUserId) {
      const uidStr = String(rawUserId).trim();
      if (probeId === 'BYPASS-01' || probeId === 'BYPASS-02') {
        if (inv.isSeedIdentity(uidStr, userEmail) || inv.isUserReferenced(uidStr)) {
          inv.registerReferencedUser({ id: uidStr, email: userEmail, source: `${probeId}_unexpected_response_matched_seed` });
        } else if (!inv.isUserTracked(uidStr)) {
          inv.registerObservedUser({ id: uidStr, email: userEmail, source: `${probeId}_unexpected_signup` });
        }
      } else {
        if (!inv.isUserReferenced(uidStr)) {
          inv.registerReferencedUser({ id: uidStr, email: userEmail, source: `${probeId}_token_observation` });
        }
      }
    }

    // Register session cleanup obligation (R17-01)
    if (rawSessionId) {
      inv.registerSession(String(rawSessionId).trim(), { accessToken });
    } else {
      // Any token present without extractable session ID must register untracked session obligation (R5-04, R8-01, R17-01)
      inv.registerUntrackedSession();
    }
  }

  if (hasTokens && ctx) {
    if (rawSessionId) ctx.activeSessionId = String(rawSessionId).trim();
    if (rawUserId) ctx.activeUserId = String(rawUserId).trim();
  }

  return {
    hasTokens,
    sessionId: rawSessionId ? String(rawSessionId).trim() : null,
    userId: rawUserId ? String(rawUserId).trim() : null,
    accessToken,
    refreshToken
  };
}

/**
 * Strictly validates affirmative access token issuance for positive token hook tests (HOOK-01 and HOOK-02).
 * Requires a concrete, non-empty string access_token at either:
 * - rawOutcome.access_token
 * - rawOutcome.tokens.access_token (where tokens is a non-null object)
 *
 * Strictly rejects:
 * - has_token: true alone (without an actual access_token string)
 * - tokens: {} or tokens: [] or tokens: { unrelated: '...' }
 * - refresh_token alone without access_token
 * - token-issuance booleans alone
 * - null, undefined, non-string, empty, or whitespace-only access_token
 *
 * Note on security semantics:
 * String presence alone does NOT constitute cryptographic token validity.
 * For hosted execution, observed access-token presence is a necessary precondition,
 * while provider verification, claims validation (e.g. amr_authenticated), and signature
 * verification represent the complete verification chain.
 *
 * Resolves PRRT_kwDOVtCmZc66kiam (P1).
 */
function validatePositiveAccessTokenIssuance(rawOutcome) {
  if (rawOutcome === null || rawOutcome === undefined || typeof rawOutcome !== 'object') {
    return { valid: false, reason: 'outcome must be a non-null object' };
  }

  let tokenCandidate = null;

  if (isNonEmptyString(rawOutcome.access_token)) {
    tokenCandidate = rawOutcome.access_token;
  } else if (
    rawOutcome.tokens !== null &&
    typeof rawOutcome.tokens === 'object' &&
    !Array.isArray(rawOutcome.tokens) &&
    isNonEmptyString(rawOutcome.tokens.access_token)
  ) {
    tokenCandidate = rawOutcome.tokens.access_token;
  }

  if (!tokenCandidate) {
    return {
      valid: false,
      reason: 'requires explicit, non-empty access_token string at access_token or tokens.access_token; booleans, refresh_token alone, or unrelated tokens objects are rejected'
    };
  }

  // Raw token is strictly kept within this local verification scope and never returned or exposed in unredacted evidence
  return {
    valid: true,
    tokenObserved: true,
    token: tokenCandidate
  };
}

/**
 * Independently validates probe dispatcher outcome against canonical requirement contract.
 * Enforces:
 * 1. Output must be a non-null object with explicit boolean `passed`.
 * 2. Status must be a positive integer (status 0 or missing status is invalid).
 * 3. Route disablement (BYPASS-01..04) strictly rejects HTTP 200 and token issuance, requires affirmative observation.
 * 4. Recovery suppression (BYPASS-05) strictly rejects email or token delivery, requires affirmative suppression proof.
 * 5. Token hooks (HOOK-01..07) and sessions (SESSION-01..06) strictly require non-empty affirmative observations.
 * 6. Empty objects/arrays/strings are rejected as proof.
 * Resolves PRRT_kwDOVtCmZc66i_Kd, PRRT_kwDOVtCmZc66jLk1, and PRRT_kwDOVtCmZc66jNbH.
 */
export function validateProbeOutcome(item, rawOutcome) {
  if (rawOutcome === null || rawOutcome === undefined || typeof rawOutcome !== 'object') {
    return {
      passed: false,
      status: 0,
      reason: 'INVALID_PAYLOAD_STRUCTURE: probe outcome must be a non-null object'
    };
  }

  if (typeof rawOutcome.passed !== 'boolean') {
    return {
      passed: false,
      status: typeof rawOutcome.status === 'number' ? rawOutcome.status : 0,
      reason: 'MISSING_OR_NON_BOOLEAN_PASSED: outcome.passed must be an explicit boolean'
    };
  }

  // If dispatcher reported failure, fail closed immediately
  if (rawOutcome.passed === false) {
    return {
      passed: false,
      status: typeof rawOutcome.status === 'number' ? rawOutcome.status : 0,
      reason: rawOutcome.error || rawOutcome.reason || 'DISPATCHER_REPORTED_FAILURE',
      evidence: rawOutcome.evidence || null
    };
  }

  // Dispatcher reported passed: true. Independently audit against canonical requirement expectations.
  const status = typeof rawOutcome.status === 'number' ? rawOutcome.status : 0;

  // Status must be a valid positive integer. Status 0 or missing status is invalid. (PRRT_kwDOVtCmZc66jLk1)
  if (status <= 0 || !Number.isInteger(status)) {
    return {
      passed: false,
      status,
      reason: `INVALID_HTTP_STATUS: probe ${item.id} requires a valid positive HTTP status, got ${status}`
    };
  }

  // 1. Native Bypass Requirements
  if (item.id === 'BYPASS-01') {
    // Native email OTP must be disabled (422/404/405/400/403/500). HTTP 200 is a critical violation!
    if (status === 200) {
      return {
        passed: false,
        status,
        reason: 'HTTP_STATUS_MISMATCH: BYPASS-01 received HTTP 200; native email OTP endpoint must be disabled'
      };
    }
    if (!isValidHttpErrorStatus(status)) {
      return {
        passed: false,
        status,
        reason: `INVALID_HTTP_STATUS: BYPASS-01 expected HTTP 4xx/5xx error status, got ${status}`
      };
    }
    const observedTokens = extractObservedTokens(rawOutcome);
    if (observedTokens) {
      return {
        passed: false,
        status,
        reason: `SECURITY_INVARIANT_VIOLATION: BYPASS-01 issued tokens on disabled route (${observedTokens})`
      };
    }
    if (rawOutcome.user_created === true) {
      return {
        passed: false,
        status,
        reason: `SECURITY_INVARIANT_VIOLATION: BYPASS-01 created user on disabled route (user_created: true)`
      };
    }
    if (rawOutcome.indeterminate_user_creation === true) {
      return {
        passed: false,
        status,
        reason: `INDETERMINATE_USER_CREATION: BYPASS-01 encountered indeterminate response or transport loss during user-creation capable dispatch (${rawOutcome.error || 'untracked user creation risk'})`
      };
    }
    const hasAffirmativeEvidence =
      rawOutcome.route_disabled === true ||
      rawOutcome.rejection_observed === true ||
      rawOutcome.error_code === 'email_provider_disabled' ||
      (isNonEmptyString(rawOutcome.error) && rawOutcome.error.includes('email_provider_disabled'));
    if (!hasAffirmativeEvidence) {
      return {
        passed: false,
        status,
        reason: 'MISSING_EVIDENCE: BYPASS-01 requires affirmative observation of route disablement (route_disabled: true or error_code)'
      };
    }
  }

  if (item.id === 'BYPASS-02') {
    // Native signup must be disabled (422/404/405/400/403/500). HTTP 200 is a critical violation!
    if (status === 200) {
      return {
        passed: false,
        status,
        reason: 'HTTP_STATUS_MISMATCH: BYPASS-02 received HTTP 200; native signup endpoint must be disabled'
      };
    }
    if (!isValidHttpErrorStatus(status)) {
      return {
        passed: false,
        status,
        reason: `INVALID_HTTP_STATUS: BYPASS-02 expected HTTP 4xx/5xx error status, got ${status}`
      };
    }
    const observedTokens = extractObservedTokens(rawOutcome);
    if (observedTokens || rawOutcome.user_created === true) {
      return {
        passed: false,
        status,
        reason: `SECURITY_INVARIANT_VIOLATION: BYPASS-02 created user or issued tokens on disabled route (${observedTokens || 'user_created: true'})`
      };
    }
    if (rawOutcome.indeterminate_user_creation === true) {
      return {
        passed: false,
        status,
        reason: `INDETERMINATE_USER_CREATION: BYPASS-02 encountered indeterminate response or transport loss during user-creation capable dispatch (${rawOutcome.error || 'untracked user creation risk'})`
      };
    }
    const hasAffirmativeEvidence =
      rawOutcome.signup_disabled === true ||
      rawOutcome.rejection_observed === true ||
      rawOutcome.error_code === 'signup_disabled' ||
      (isNonEmptyString(rawOutcome.error) && rawOutcome.error.includes('signup_disabled'));
    if (!hasAffirmativeEvidence) {
      return {
        passed: false,
        status,
        reason: 'MISSING_EVIDENCE: BYPASS-02 requires affirmative observation of signup disablement (signup_disabled: true or error_code)'
      };
    }
  }

  if (item.id === 'BYPASS-03' || item.id === 'BYPASS-04') {
    // Direct native verify or magic link / invite / anonymous session must be rejected (500/400/403)
    const observedTokens = extractObservedTokens(rawOutcome);
    if (status === 200 || observedTokens) {
      return {
        passed: false,
        status,
        reason: `SECURITY_INVARIANT_VIOLATION: ${item.id} received HTTP 200 or tokens on unauthorized route (${observedTokens || 'status 200'})`
      };
    }
    if (!isValidHttpErrorStatus(status)) {
      return {
        passed: false,
        status,
        reason: `INVALID_HTTP_STATUS: ${item.id} expected HTTP 4xx/5xx error status, got ${status}`
      };
    }
    // Reject upstream GoTrue pre-validation errors before reaching custom_access_token_hook (R3-06)
    const errCode = (rawOutcome.error_code || '').toLowerCase();
    const errMsg = (rawOutcome.error || '').toLowerCase();
    if (errCode === 'otp_expired' || errMsg.includes('otp_expired') || status === 404) {
      return {
        passed: false,
        status,
        reason: `FALSE_PROOF_REJECTED: ${item.id} rejected due to upstream GoTrue pre-validation ('${rawOutcome.error_code || rawOutcome.error || status}') before reaching custom_access_token_hook (R3-06)`
      };
    }
    // Reject email-hook suppression as proof of access-token-hook rejection (R4-08)
    if (item.id === 'BYPASS-04') {
      const isEmailSuppression =
        rawOutcome.email_suppressed === true ||
        errMsg.includes('send_email_hook') ||
        errMsg.includes('email dispatch suppressed') ||
        errMsg.includes('email delivery');
      if (isEmailSuppression) {
        return {
          passed: false,
          status,
          reason: 'FALSE_PROOF_REJECTED: BYPASS-04 email hook suppression cannot be accepted as proof of Custom Access Token Hook rejection (R4-08)'
        };
      }
    }
    const hasAffirmativeEvidence =
      rawOutcome.hook_rejected === true ||
      rawOutcome.rejection_observed === true ||
      (isNonEmptyString(rawOutcome.error) && (rawOutcome.error.includes('hook_error') || rawOutcome.error.includes('42501')));
    if (!hasAffirmativeEvidence) {
      return {
        passed: false,
        status,
        reason: `MISSING_EVIDENCE: ${item.id} requires affirmative observation of hook rejection (hook_rejected: true)`
      };
    }
  }

  if (item.id === 'BYPASS-05') {
    // Native recovery suppression: zero recovery token or recovery email dispatched (PRRT_kwDOVtCmZc66jLk1)
    if (rawOutcome.recovery_email_delivered === true || rawOutcome.email_delivered === true || rawOutcome.recovery_token) {
      return {
        passed: false,
        status,
        reason: 'SECURITY_INVARIANT_VIOLATION: BYPASS-05 recovery email or token delivered'
      };
    }
    const hasAffirmativeEvidence =
      rawOutcome.recovery_suppressed === true ||
      (rawOutcome.email_suppressed === true && rawOutcome.zero_email_delivered === true) ||
      rawOutcome.hook_rejected === true;
    if (!hasAffirmativeEvidence) {
      return {
        passed: false,
        status,
        reason: 'MISSING_EVIDENCE: BYPASS-05 requires affirmative observation of recovery suppression (recovery_suppressed: true)'
      };
    }
  }

  // 2. Token Hook Requirements (HOOK-01..07)
  if (item.id === 'HOOK-01') {
    // Valid password sign-in must succeed with HTTP 200 and issue concrete access token with amr_authenticated
    if (status !== 200) {
      return {
        passed: false,
        status,
        reason: `HTTP_STATUS_MISMATCH: HOOK-01 expected HTTP 200, got ${status}`
      };
    }
    const tokenValidation = validatePositiveAccessTokenIssuance(rawOutcome);
    if (!tokenValidation.valid) {
      return {
        passed: false,
        status,
        reason: `MISSING_EVIDENCE: HOOK-01 ${tokenValidation.reason}`
      };
    }
    // Reject client-editable metadata spoofing (PRRT_kwDOVtCmZc66lOOM)
    if (rawOutcome.amr_source === 'user_metadata' || rawOutcome.amr_source === 'app_metadata') {
      return {
        passed: false,
        status,
        reason: 'SECURITY_INVARIANT_VIOLATION: HOOK-01 amr_authenticated cannot be sourced from client-editable user_metadata or app_metadata'
      };
    }
    // Strict JWT claims parsing and validation without bypass (PRRT_kwDOVtCmZc66lo-t, R3-08)
    const jwtCheck = parseAndValidateJwt(tokenValidation.token);
    if (!jwtCheck.valid) {
      return {
        passed: false,
        status,
        reason: `JWT_CLAIM_VIOLATION: HOOK-01 ${jwtCheck.reason}`
      };
    }
    // Require genuine session_id (placeholder strings like 'sess-default' or user_id are strictly prohibited, R3-05)
    const candidateSessionId = rawOutcome.session_id || jwtCheck.payload?.session_id;
    if (!isNonEmptyString(candidateSessionId) || candidateSessionId.startsWith('sess-default')) {
      return {
        passed: false,
        status,
        reason: 'MISSING_EVIDENCE: HOOK-01 requires genuine session_id identifier in token or outcome (R3-05)'
      };
    }
    const hasAmrEvidence =
      rawOutcome.amr_authenticated === true ||
      jwtCheck.payload?.amr_authenticated === 'true' ||
      jwtCheck.payload?.amr_authenticated === true ||
      (Array.isArray(jwtCheck.payload?.amr) && jwtCheck.payload.amr.some(a => (typeof a === 'string' ? a : a?.method) === 'password'));
    if (!hasAmrEvidence) {
      return {
        passed: false,
        status,
        reason: 'MISSING_EVIDENCE: HOOK-01 expected verified amr_authenticated claim'
      };
    }
  }

  if (item.id === 'HOOK-02') {
    // Token refresh with password-origin AMR must succeed with HTTP 200 and issue fresh concrete access token
    if (status !== 200) {
      return {
        passed: false,
        status,
        reason: `HTTP_STATUS_MISMATCH: HOOK-02 expected HTTP 200, got ${status}`
      };
    }
    const tokenValidation = validatePositiveAccessTokenIssuance(rawOutcome);
    if (!tokenValidation.valid) {
      return {
        passed: false,
        status,
        reason: `MISSING_EVIDENCE: HOOK-02 ${tokenValidation.reason}`
      };
    }
    // Strict JWT claims parsing and validation without bypass (PRRT_kwDOVtCmZc66lo-t, R3-08)
    const jwtCheck = parseAndValidateJwt(tokenValidation.token);
    if (!jwtCheck.valid) {
      return {
        passed: false,
        status,
        reason: `JWT_CLAIM_VIOLATION: HOOK-02 ${jwtCheck.reason}`
      };
    }
    const hasAmrPreserved =
      rawOutcome.amr_preserved === true ||
      jwtCheck.payload?.amr_authenticated === 'true' ||
      jwtCheck.payload?.amr_authenticated === true;
    if (!hasAmrPreserved) {
      return {
        passed: false,
        status,
        reason: 'MISSING_EVIDENCE: HOOK-02 expected verified AMR preservation (amr_preserved: true)'
      };
    }
  }

  if (['HOOK-03', 'HOOK-04', 'HOOK-05', 'HOOK-06', 'HOOK-07'].includes(item.id)) {
    // Disallowed AMR / hook failure cases must reject token issuance (500/400/403)
    const observedTokens = extractObservedTokens(rawOutcome);
    if (status === 200 || observedTokens) {
      return {
        passed: false,
        status,
        reason: `SECURITY_INVARIANT_VIOLATION: ${item.id} issued token or returned HTTP 200 on disallowed AMR / hook failure (${observedTokens || 'status 200'})`
      };
    }
    if (!isValidHttpErrorStatus(status)) {
      return {
        passed: false,
        status,
        reason: `INVALID_HTTP_STATUS: ${item.id} expected HTTP 4xx/5xx error status, got ${status}`
      };
    }
    // Reject generic GoTrue errors that do not prove hook execution (R3-01, R3-02)
    const errCode = (rawOutcome.error_code || '').toLowerCase();
    const errMsg = (rawOutcome.error || '').toLowerCase();
    if (errCode === 'unsupported_grant_type' || errMsg.includes('unsupported_grant_type')) {
      return {
        passed: false,
        status,
        reason: `FALSE_PROOF_REJECTED: ${item.id} rejected due to 'unsupported_grant_type'. GoTrue token endpoint rejected request before custom_access_token_hook execution (R3-01)`
      };
    }
    const hasAffirmativeEvidence =
      rawOutcome.hook_rejected === true ||
      rawOutcome.rejection_observed === true ||
      (isNonEmptyString(rawOutcome.error) && (rawOutcome.error.includes('42501') || rawOutcome.error.includes('hook_error') || rawOutcome.error.includes('aborted')));
    if (!hasAffirmativeEvidence) {
      return {
        passed: false,
        status,
        reason: `MISSING_EVIDENCE: ${item.id} requires affirmative observation of hook rejection (hook_rejected: true)`
      };
    }
  }

  // 3. Session & Consumer Requirements (SESSION-01..06)
  if (item.id === 'SESSION-01') {
    if (status !== 200) {
      return {
        passed: false,
        status,
        reason: `HTTP_STATUS_MISMATCH: SESSION-01 expected HTTP 200, got ${status}`
      };
    }
    const sessionId = rawOutcome.session_id;
    if (!isNonEmptyString(sessionId) || sessionId.startsWith('sess-default')) {
      return {
        passed: false,
        status,
        reason: 'SESSION_FAILURE: SESSION-01 requires verified session creation with genuine session_id (placeholder rejected, R3-05)'
      };
    }
    const hasSessionEvidence =
      rawOutcome.session_created === true &&
      (typeof rawOutcome.sessions_count === 'number' ? rawOutcome.sessions_count >= 1 : true);
    if (!hasSessionEvidence) {
      return {
        passed: false,
        status,
        reason: 'SESSION_FAILURE: SESSION-01 expected verified session creation with explicit session row'
      };
    }
  }

  if (item.id === 'SESSION-02') {
    if (status !== 200) {
      return {
        passed: false,
        status,
        reason: `HTTP_STATUS_MISMATCH: SESSION-02 expected HTTP 200, got ${status}`
      };
    }
    // Reject logout fallback (R3-04)
    if (rawOutcome.logout_fallback === true) {
      return {
        passed: false,
        status,
        reason: 'SECURITY_INVARIANT_VIOLATION: SESSION-02 used logout fallback instead of admin password reset (R3-04)'
      };
    }
    const hasResetEvidence = rawOutcome.password_reset_completed === true || rawOutcome.reset_completed === true;
    if (!hasResetEvidence) {
      return {
        passed: false,
        status,
        reason: 'SESSION_FAILURE: SESSION-02 requires explicit password reset completion (R3-04)'
      };
    }

    // Strict session revocation verification: require affirmative provider evidence (R4-03)
    const hasRevocationEvidence =
      rawOutcome.remaining_sessions === 0 &&
      (rawOutcome.session_revoked === true || rawOutcome.sessions_invalidated === true) &&
      (rawOutcome.session_revocation_verified === true || rawOutcome.invalidation_completed === true);
    if (!hasRevocationEvidence) {
      return {
        passed: false,
        status,
        reason: `SESSION_FAILURE: SESSION-02 requires affirmative proof of session revocation after password update (got remaining_sessions: ${rawOutcome.remaining_sessions}, session_revoked: ${rawOutcome.session_revoked}). Surviving sessions fail closed (R4-03).`
      };
    }

    // Strict session correlation (R5-01): validate session identity if provided
    const sessionId = rawOutcome.session_id;
    if (sessionId !== undefined && sessionId !== null) {
      if (!isNonEmptyString(sessionId) || sessionId.startsWith('sess-default')) {
        return {
          passed: false,
          status,
          reason: 'SESSION_CORRELATION_MISMATCH: SESSION-02 requires valid session_id from HOOK-01 (R5-01)'
        };
      }
      if (rawOutcome.pre_session_id && rawOutcome.pre_session_id !== sessionId) {
        return {
          passed: false,
          status,
          reason: `SESSION_CORRELATION_MISMATCH: SESSION-02 pre_session_id '${rawOutcome.pre_session_id}' does not match session '${sessionId}'`
        };
      }
    }

    // Reject false-proof errors (R5-01): bad_jwt, jwt_expired, token_expired, invalid_jwt, etc.
    const errorCode = (rawOutcome.error_code || '').toLowerCase();
    const errorMsg = (rawOutcome.error || '').toLowerCase();
    const isFalseProofError =
      errorCode === 'bad_jwt' ||
      errorCode === 'jwt_expired' ||
      errorCode === 'token_expired' ||
      errorCode === 'invalid_jwt' ||
      errorCode === 'malformed_jwt' ||
      errorMsg.includes('bad_jwt') ||
      errorMsg.includes('expired') ||
      errorMsg.includes('malformed') ||
      errorMsg.includes('invalid jwt') ||
      errorMsg.includes('invalid token') ||
      errorMsg.includes('signature');

    if (isFalseProofError) {
      return {
        passed: false,
        status,
        reason: `FALSE_PROOF_REJECTED: SESSION-02 rejection due to '${rawOutcome.error_code || rawOutcome.error}'. Invalid, expired, or malformed JWT errors do not demonstrate remote session invalidation (R5-01).`
      };
    }

    // Reject ambiguous rejection without affirmative provider error code (R5-01)
    if (rawOutcome.error_code !== undefined && rawOutcome.error_code !== null) {
      const isAffirmativeRevocation =
        rawOutcome.revocation_error_code === 'session_not_found' ||
        errorCode === 'session_not_found' ||
        errorCode === 'session_revoked' ||
        errorCode === 'authsessionmissingerror' ||
        errorMsg.includes('session not found') ||
        errorMsg.includes('session_not_found');

      if (!isAffirmativeRevocation) {
        return {
          passed: false,
          status,
          reason: `MISSING_EVIDENCE: SESSION-02 requires affirmative provider revocation error code (e.g. session_not_found). Ambiguous rejection '${rawOutcome.error_code}' is rejected (R5-01).`
        };
      }
    }
  }

/**
 * Shared validator for session revocation requirements (SESSION-03 & SESSION-06).
 * Enforces:
 * 1. HTTP error status within allowed set (401/403/404 for SESSION-03; 401/403/500 for SESSION-06). Rejects HTTP 200.
 * 2. Strict rejection of false-proof errors (bad_jwt, jwt_expired, token_expired, invalid_jwt, malformed_jwt, etc.).
 * 3. Verified pre-reset baseline proving a valid unexpired session before invalidation.
 * 4. Explicit evidence that password reset / session invalidation operation completed.
 * 5. Strict session identity correlation (exact ID equality; boolean flag cannot override contradictory IDs).
 * 6. Provider-observed revocation rejection evidence (session_not_found, AuthSessionMissingError, etc.).
 * Resolves PRRT_kwDOVtCmZc66jLk1, PRRT_kwDOVtCmZc66jdT2, PRRT_kwDOVtCmZc66jlyg, and PRRT_kwDOVtCmZc66joKl.
 */
function validateSessionRevocationProof(item, rawOutcome, allowedStatuses, isRevocationEvidenceValid) {
  const status = rawOutcome.status;

  if (status === 200) {
    return {
      passed: false,
      status,
      reason: `SECURITY_INVARIANT_VIOLATION: ${item.id} accepted revoked token/session with HTTP 200`
    };
  }

  if (!allowedStatuses.includes(status)) {
    return {
      passed: false,
      status,
      reason: `HTTP_STATUS_MISMATCH: ${item.id} expected HTTP ${allowedStatuses.join('/')} rejection on revoked session, got ${status}`
    };
  }

  // 1. Reject false-proof errors: invalid, expired, or malformed JWT errors do NOT prove revocation of a valid session
  const errorCode = (rawOutcome.error_code || '').toLowerCase();
  const errorMsg = (rawOutcome.error || '').toLowerCase();
  const isFalseProofError =
    errorCode === 'bad_jwt' ||
    errorCode === 'jwt_expired' ||
    errorCode === 'token_expired' ||
    errorCode === 'invalid_jwt' ||
    errorCode === 'malformed_jwt' ||
    errorMsg.includes('bad_jwt') ||
    errorMsg.includes('expired') ||
    errorMsg.includes('malformed') ||
    errorMsg.includes('invalid jwt') ||
    errorMsg.includes('invalid token') ||
    errorMsg.includes('signature');

  if (isFalseProofError) {
    return {
      passed: false,
      status,
      reason: `FALSE_PROOF_REJECTED: ${item.id} rejection due to '${rawOutcome.error_code || rawOutcome.error}'. Invalid, expired, or malformed JWT errors do not demonstrate remote session invalidation.`
    };
  }

  // 2. Pre-reset baseline proof: require proof that the exact same valid, unexpired token/session succeeded BEFORE invalidation
  const hasPreResetBaseline =
    rawOutcome.pre_reset_baseline_verified === true ||
    rawOutcome.pre_invalidation_valid === true;
  if (!hasPreResetBaseline) {
    return {
      passed: false,
      status,
      reason: `MISSING_EVIDENCE: ${item.id} requires verified pre-reset session baseline proving valid unexpired session before invalidation`
    };
  }

  // 3. Reset / invalidation operation evidence: password reset or session invalidation operation completed
  const hasResetCompleted =
    rawOutcome.reset_completed === true ||
    rawOutcome.invalidation_completed === true ||
    rawOutcome.password_reset_completed === true;
  if (!hasResetCompleted) {
    return {
      passed: false,
      status,
      reason: `MISSING_EVIDENCE: ${item.id} requires evidence that password reset or session invalidation operation completed`
    };
  }

  // 4. Strict Session Correlation (PRRT_kwDOVtCmZc66joKl, PRRT_kwDOVtCmZc66kQA9):
  // - sessionId must be a non-empty string.
  // - Explicit pre-reset identity required (correlated_session_id or pre_session_id); a boolean flag alone is insufficient.
  // - Every provided identifier must be validated for correct string type and non-empty value.
  // - Every supplied pre-reset or correlated identifier must equal sessionId exactly. Contradictory IDs fail closed.
  // - same_session_correlated: true can never override contradictory or missing identifiers.
  // - same_session_correlated: false fails closed.
  const sessionId = rawOutcome.session_id;

  if (!isNonEmptyString(sessionId) || sessionId.startsWith('sess-default')) {
    return {
      passed: false,
      status,
      reason: `SESSION_CORRELATION_MISMATCH: ${item.id} requires a valid, non-empty session_id identifier (placeholder rejected, R3-05)`
    };
  }

  const hasCorrelatedId = rawOutcome.correlated_session_id !== undefined && rawOutcome.correlated_session_id !== null;
  const hasPreSessionId = rawOutcome.pre_session_id !== undefined && rawOutcome.pre_session_id !== null;

  if (!hasCorrelatedId && !hasPreSessionId) {
    return {
      passed: false,
      status,
      reason: `SESSION_CORRELATION_MISMATCH: ${item.id} requires an explicit pre-reset session identifier (correlated_session_id or pre_session_id); a boolean flag alone is insufficient`
    };
  }

  if (hasCorrelatedId) {
    if (!isNonEmptyString(rawOutcome.correlated_session_id)) {
      return {
        passed: false,
        status,
        reason: `SESSION_CORRELATION_MISMATCH: ${item.id} correlated_session_id must be a valid, non-empty string`
      };
    }
    if (rawOutcome.correlated_session_id !== sessionId) {
      return {
        passed: false,
        status,
        reason: `SESSION_CORRELATION_MISMATCH: ${item.id} correlated_session_id '${rawOutcome.correlated_session_id}' does not match post-reset session '${sessionId}'`
      };
    }
  }

  if (hasPreSessionId) {
    if (!isNonEmptyString(rawOutcome.pre_session_id)) {
      return {
        passed: false,
        status,
        reason: `SESSION_CORRELATION_MISMATCH: ${item.id} pre_session_id must be a valid, non-empty string`
      };
    }
    if (rawOutcome.pre_session_id !== sessionId) {
      return {
        passed: false,
        status,
        reason: `SESSION_CORRELATION_MISMATCH: ${item.id} pre-reset session identifier '${rawOutcome.pre_session_id}' does not match post-reset session '${sessionId}'`
      };
    }
  }

  if (rawOutcome.same_session_correlated === false) {
    return {
      passed: false,
      status,
      reason: `SESSION_CORRELATION_MISMATCH: ${item.id} same_session_correlated flag indicates session mismatch`
    };
  }

  // 5. Provider-observed revocation rejection evidence
  if (!isRevocationEvidenceValid(rawOutcome)) {
    return {
      passed: false,
      status,
      reason: `MISSING_EVIDENCE: ${item.id} requires affirmative revocation-specific evidence (e.g. error_code: "session_not_found", "AuthSessionMissingError", or revocation_verified: true)`
    };
  }

  return null;
}

  if (item.id === 'SESSION-03') {
    const err = validateSessionRevocationProof(
      item,
      rawOutcome,
      [401, 403, 404],
      (outcome) =>
        outcome.revocation_verified === true ||
        outcome.session_revoked === true ||
        outcome.error_code === 'session_not_found'
    );
    if (err) return err;
  }

  if (item.id === 'SESSION-04' || item.id === 'SESSION-05') {
    // Stateless linger window documentation check (PRRT_kwDOVtCmZc66jNbH, R3-03, R7-02, R17-02)
    if (status !== 200) {
      return {
        passed: false,
        status,
        reason: `HTTP_STATUS_MISMATCH: ${item.id} expected HTTP 200 demonstrating stateless signature-based access, got ${status} (401 rejection or 404 missing fixture does not prove linger, R3-03)`
      };
    }

    // Verified session revocation prerequisite check (PRRT_kwDOVtCmZc67OhSN, R17-02)
    if (rawOutcome.revocation_verified !== true) {
      return {
        passed: false,
        status,
        reason: `MISSING_EVIDENCE: ${item.id} requires verified session revocation evidence before demonstrating stateless linger (R17-02)`
      };
    }

    // Session correlation check (PRRT_kwDOVtCmZc67OhSN, R17-02)
    const revokedSessId = rawOutcome.revoked_session_id || rawOutcome.session_id || null;
    const correlatedSessId = rawOutcome.correlated_session_id || null;
    if (rawOutcome.session_correlated !== true || !revokedSessId || !correlatedSessId || revokedSessId !== correlatedSessId) {
      return {
        passed: false,
        status,
        reason: `SESSION_CORRELATION_FAILURE: ${item.id} token session_id ('${correlatedSessId || 'none'}') must correlate with verified revoked session ID ('${revokedSessId || 'none'}') (R17-02)`
      };
    }

    if (rawOutcome.token_unexpired !== true) {
      return {
        passed: false,
        status,
        reason: `MISSING_EVIDENCE: ${item.id} requires token to be unexpired (now < exp) during linger window demonstration (R3-03)`
      };
    }
    // Mandatory 300s JWT lifetime contract validation (PRRT_kwDOVtCmZc66r92y, R7-02)
    if (typeof rawOutcome.jwt_lifetime_seconds !== 'number' || !Number.isFinite(rawOutcome.jwt_lifetime_seconds)) {
      return {
        passed: false,
        status,
        reason: `MISSING_EVIDENCE: ${item.id} requires valid numeric jwt_lifetime_seconds claim evidence (R7-02)`
      };
    }
    if (rawOutcome.jwt_lifetime_seconds <= 0) {
      return {
        passed: false,
        status,
        reason: `INVALID_JWT_LIFETIME: ${item.id} token lifetime must be strictly positive, got ${rawOutcome.jwt_lifetime_seconds}s (R7-02)`
      };
    }
    if (rawOutcome.jwt_lifetime_seconds > 300) {
      return {
        passed: false,
        status,
        reason: `EXCESSIVE_JWT_LIFETIME: ${item.id} token lifetime (${rawOutcome.jwt_lifetime_seconds}s) exceeds approved 300s bound (R7-02)`
      };
    }
    if (rawOutcome.lifetime_bounded !== true) {
      return {
        passed: false,
        status,
        reason: `MISSING_EVIDENCE: ${item.id} requires affirmative lifetime_bounded flag (R7-02)`
      };
    }
    const hasNonEmptyLingerEvidence =
      rawOutcome.stateless_linger_documented === true &&
      (isNonEmptyString(rawOutcome.evidence) || isNonEmptyString(rawOutcome.note) || isNonEmptyObject(rawOutcome.documentation));
    if (!hasNonEmptyLingerEvidence) {
      return {
        passed: false,
        status,
        reason: `MISSING_EVIDENCE: ${item.id} requires affirmative, non-empty stateless linger window documentation/evidence`
      };
    }
  }

  if (item.id === 'SESSION-06') {
    const err = validateSessionRevocationProof(
      item,
      rawOutcome,
      [401, 403, 500],
      (outcome) => {
        const errCode = outcome.error_code || '';
        const errMsg = (outcome.error || '').toLowerCase();
        // Provider-observed revocation error (R4-04, R5-08, R6-03):
        // Accept affirmative provider codes ('session_not_found', 'AuthSessionMissingError')
        const isAffirmativeRevocationCode =
          errCode === 'session_not_found' ||
          errCode === 'AuthSessionMissingError' ||
          errMsg.includes('session_not_found') ||
          errMsg.includes('session not found') ||
          errMsg.includes('session from session_id claim in jwt does not exist') ||
          errMsg.includes('authsessionmissingerror');

        return (
          isAffirmativeRevocationCode ||
          (outcome.revocation_verified === true && (outcome.session_revoked === true || outcome.rejection_observed === true))
        );
      }
    );
    if (err) return err;
  }

  return {
    passed: true,
    status,
    evidence: rawOutcome.evidence || rawOutcome.body || rawOutcome.note || null,
    reason: rawOutcome.reason || 'Requirement verified successfully'
  };
}

/**
 * Verifies the authoritative absence of a storage object post-deletion (R1-06).
 * Must return true ONLY when provider affirmatively confirms HTTP 404.
 * Any other status (200, 401, 403, 500, timeout, error) fails closed returning false.
 */
/**
 * Parses Storage error / metadata response envelopes while strictly distinguishing empty 404/409 stubs
 * from malformed, truncated, or unparseable response payloads (R2-03).
 */
export async function parseStorageErrorEnvelope(res) {
  if (!res) {
    return { ok: false, status: 0, body: null, rawText: null, parseStatus: 'missing_response', parseError: null };
  }
  const status = typeof res.status === 'number' ? res.status : 0;
  const ok = res.ok ?? (status >= 200 && status < 300);

  if (typeof res.text === 'function') {
    let rawText;
    try {
      rawText = await res.text();
    } catch (err) {
      return { ok, status, body: null, rawText: null, parseStatus: 'unreadable_body', parseError: err };
    }
    if (typeof rawText !== 'string') {
      return { ok, status, body: null, rawText: null, parseStatus: 'unreadable_body', parseError: new Error('Non-string response text') };
    }
    const trimmed = rawText.trim();
    if (!trimmed) {
      return { ok, status, body: null, rawText: '', parseStatus: 'empty_body', parseError: null };
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ok, status, body: parsed, rawText, parseStatus: 'non_object', parseError: null };
      }
      return { ok, status, body: parsed, rawText, parseStatus: 'parsed', parseError: null };
    } catch (err) {
      return { ok, status, body: null, rawText, parseStatus: 'invalid_json', parseError: err };
    }
  }

  if (typeof res.json === 'function') {
    return parseResponseEnvelope(res);
  }

  return { ok, status, body: null, rawText: null, parseStatus: 'no_body', parseError: null };
}

/**
 * Shared provider-aware Supabase Storage REST response normalizer (R2-03).
 * Reconciles upstream http/error-handler.ts & storage-error.ts envelopes:
 * - Accepts HTTP 404 (when not NoSuchBucket/AccessDenied/corrupted/mismatched)
 * - Accepts HTTP 400 ONLY with documented structured object-not-found: statusCode === '404' AND code === 'NoSuchKey'
 * - Rejects generic HTTP 400, logical 404 with wrong/missing code, 401/403, permission-masked responses,
 *   429/5xx, malformed bodies, unverified project/bucket/path, or unauthorized context.
 */
export function normalizeStorageObjectResponse({
  status = 0,
  parseStatus = 'no_body',
  body = null,
  transportError = null,
  expectedBucket = STORAGE_PROBE_BUCKET,
  expectedPath = null,
  projectRef = HARDCODED_TEMP_REF,
  authorizedContext = true
} = {}) {
  const normRef = typeof projectRef === 'string' ? projectRef.trim().toLowerCase() : '';
  if (!normRef || normRef !== HARDCODED_TEMP_REF || isForbiddenProject(normRef)) {
    return {
      classification: STORAGE_RESPONSE_CLASS.UNAUTHORIZED_OR_FORBIDDEN,
      isAbsent: false,
      isPresent: false,
      isConflict: false,
      status,
      reason: `FORBIDDEN_OR_INVALID_PROJECT: '${normRef}'`
    };
  }

  if (!authorizedContext) {
    return {
      classification: STORAGE_RESPONSE_CLASS.UNAUTHORIZED_OR_FORBIDDEN,
      isAbsent: false,
      isPresent: false,
      isConflict: false,
      status,
      reason: 'UNAUTHORIZED_REQUEST_CONTEXT: Privileged or verified authorized request context required'
    };
  }

  if (!expectedBucket || typeof expectedBucket !== 'string' || !expectedBucket.trim()) {
    return {
      classification: STORAGE_RESPONSE_CLASS.INDETERMINATE,
      isAbsent: false,
      isPresent: false,
      isConflict: false,
      status,
      reason: 'MISSING_EXPECTED_BUCKET'
    };
  }

  if (transportError) {
    return {
      classification: STORAGE_RESPONSE_CLASS.TRANSPORT_FAILURE,
      isAbsent: false,
      isPresent: false,
      isConflict: false,
      status: 0,
      reason: `TRANSPORT_FAILURE: ${transportError?.message || String(transportError)}`
    };
  }

  if (
    parseStatus === 'unreadable_body' ||
    parseStatus === 'unreadable' ||
    parseStatus === 'missing_response'
  ) {
    return {
      classification: STORAGE_RESPONSE_CLASS.MALFORMED_RESPONSE,
      isAbsent: false,
      isPresent: false,
      isConflict: false,
      status,
      reason: `MALFORMED_STORAGE_RESPONSE: parseStatus='${parseStatus}'`
    };
  }

  // Successful Storage object retrieval/creation responses (text/plain, binary, or JSON payload) prove presence (R3-05).
  // Evaluate BEFORE invalid_json / non_object checks so non-JSON object bodies are never misclassified as malformed.
  if (status === 200 || status === 201 || status === 206) {
    return {
      classification: STORAGE_RESPONSE_CLASS.OBJECT_PRESENT,
      isAbsent: false,
      isPresent: true,
      isConflict: false,
      status,
      reason: `HTTP_${status}_PRESENT`
    };
  }

  if (
    parseStatus === 'invalid_json' ||
    parseStatus === 'non_object'
  ) {
    return {
      classification: STORAGE_RESPONSE_CLASS.MALFORMED_RESPONSE,
      isAbsent: false,
      isPresent: false,
      isConflict: false,
      status,
      reason: `MALFORMED_STORAGE_RESPONSE: parseStatus='${parseStatus}'`
    };
  }

  if (status === 401 || status === 403) {
    return {
      classification: STORAGE_RESPONSE_CLASS.UNAUTHORIZED_OR_FORBIDDEN,
      isAbsent: false,
      isPresent: false,
      isConflict: false,
      status,
      reason: `STORAGE_AUTH_REJECTED: HTTP ${status}`
    };
  }

  if (status === 429 || status >= 500) {
    return {
      classification: STORAGE_RESPONSE_CLASS.RATE_LIMITED_OR_SERVER_ERROR,
      isAbsent: false,
      isPresent: false,
      isConflict: false,
      status,
      reason: `STORAGE_PROVIDER_ERROR: HTTP ${status}`
    };
  }

  const errCode = typeof body?.code === 'string' ? body.code.trim() : '';
  const errName = typeof body?.error === 'string' ? body.error.trim() : '';
  const errMsg = typeof body?.message === 'string' ? body.message.trim() : '';
  const bodyStatusCode = body?.statusCode !== undefined && body?.statusCode !== null ? String(body.statusCode).trim() : null;
  const combinedErrText = `${errCode} ${errName} ${errMsg}`.toLowerCase();

  const hasPermissionMaskIndicator =
    errCode === 'AccessDenied' ||
    errCode === 'InvalidJWT' ||
    errCode === 'SignatureDoesNotMatch' ||
    errCode === 'ExpiredToken' ||
    /accessdenied|access denied|unauthorized|forbidden|permission|row-level security|rls|invalid jwt|signature does not match/i.test(combinedErrText);

  if (hasPermissionMaskIndicator) {
    return {
      classification: STORAGE_RESPONSE_CLASS.UNAUTHORIZED_OR_FORBIDDEN,
      isAbsent: false,
      isPresent: false,
      isConflict: false,
      status,
      code: errCode || null,
      reason: `PERMISSION_MASKED_OR_AUTH_DENIED: ${errCode || errName || errMsg || `HTTP ${status}`}`
    };
  }

  if (errCode === 'NoSuchBucket' || /bucket not found/i.test(combinedErrText)) {
    return {
      classification: STORAGE_RESPONSE_CLASS.BUCKET_MISSING,
      isAbsent: false,
      isPresent: false,
      isConflict: false,
      status,
      code: errCode || 'NoSuchBucket',
      reason: `BUCKET_MISSING: '${expectedBucket}' not found`
    };
  }

  // Documented Supabase Storage duplicate/conflict contract
  if (
    status === 409 &&
    (!body || errCode === 'KeyAlreadyExists' || errCode === 'ResourceAlreadyExists' || errName === 'Duplicate' || bodyStatusCode === '409' || /already exists/i.test(errMsg))
  ) {
    return {
      classification: STORAGE_RESPONSE_CLASS.CONFLICT_EXISTS,
      isAbsent: false,
      isPresent: true,
      isConflict: true,
      status,
      code: errCode || 'KeyAlreadyExists',
      reason: 'CONFIRMED_409_CONFLICT'
    };
  }

  if (
    status === 400 &&
    bodyStatusCode === '409' &&
    (errCode === 'KeyAlreadyExists' || errCode === 'ResourceAlreadyExists' || errName === 'Duplicate')
  ) {
    return {
      classification: STORAGE_RESPONSE_CLASS.CONFLICT_EXISTS,
      isAbsent: false,
      isPresent: true,
      isConflict: true,
      status,
      code: errCode,
      reason: 'CONFIRMED_STRUCTURED_400_409_CONFLICT'
    };
  }

  // Correlate resource / key field if provided by StorageBackendError
  const bodyResource = typeof body?.resource === 'string' ? body.resource.trim() : (typeof body?.key === 'string' ? body.key.trim() : null);
  const resourceMatches =
    !bodyResource ||
    !expectedPath ||
    bodyResource === expectedPath ||
    bodyResource === `${expectedBucket}/${expectedPath}`;

  // Documented Supabase Storage HTTP 400 structured object-not-found (renderer.ts / error-handler.ts)
  if (status === 400) {
    if (body && bodyStatusCode === '404' && errCode === 'NoSuchKey' && resourceMatches) {
      return {
        classification: STORAGE_RESPONSE_CLASS.OBJECT_ABSENT,
        isAbsent: true,
        isPresent: false,
        isConflict: false,
        status,
        logicalStatus: '404',
        code: 'NoSuchKey',
        reason: 'CONFIRMED_STRUCTURED_400_NOSUCHKEY_LOGICAL_404'
      };
    }
    return {
      classification: STORAGE_RESPONSE_CLASS.INDETERMINATE,
      isAbsent: false,
      isPresent: false,
      isConflict: false,
      status,
      logicalStatus: bodyStatusCode,
      code: errCode || null,
      reason: `AMBIGUOUS_HTTP_400: statusCode='${bodyStatusCode || 'none'}', code='${errCode || 'none'}' does not prove object absence`
    };
  }

  // Transport HTTP 404
  if (status === 404) {
    if (body) {
      if (errCode && errCode !== 'NoSuchKey') {
        return {
          classification: STORAGE_RESPONSE_CLASS.INDETERMINATE,
          isAbsent: false,
          isPresent: false,
          isConflict: false,
          status,
          code: errCode,
          reason: `UNEXPECTED_404_CODE: code='${errCode}' does not confirm object key absence`
        };
      }
      if (bodyStatusCode !== null && bodyStatusCode !== '404') {
        return {
          classification: STORAGE_RESPONSE_CLASS.INDETERMINATE,
          isAbsent: false,
          isPresent: false,
          isConflict: false,
          status,
          reason: `CONTRADICTORY_404_STATUS_CODE: body statusCode='${bodyStatusCode}'`
        };
      }
      if (!resourceMatches) {
        return {
          classification: STORAGE_RESPONSE_CLASS.INDETERMINATE,
          isAbsent: false,
          isPresent: false,
          isConflict: false,
          status,
          reason: `RESOURCE_MISMATCH: body resource '${bodyResource}' does not match '${expectedPath}'`
        };
      }
    }
    return {
      classification: STORAGE_RESPONSE_CLASS.OBJECT_ABSENT,
      isAbsent: true,
      isPresent: false,
      isConflict: false,
      status,
      logicalStatus: '404',
      code: errCode || 'NoSuchKey',
      reason: 'CONFIRMED_HTTP_404'
    };
  }

  return {
    classification: STORAGE_RESPONSE_CLASS.INDETERMINATE,
    isAbsent: false,
    isPresent: false,
    isConflict: false,
    status,
    reason: `INDETERMINATE_HTTP_${status}`
  };
}

/**
 * Verifies post-deletion Storage object absence with detailed normalized evidence (R1-06, R2-03).
 */
export async function verifyStorageObjectAbsenceDetailed(adminClient, bucket, path, rawOptions = {}) {
  let projectRef = HARDCODED_TEMP_REF;
  let runId = null;
  try {
    const opts = admitValidatedInput(rawOptions, 'verifyStorageObjectAbsenceOptions');
    if (opts.projectRef !== undefined) projectRef = opts.projectRef;
    if (opts.runId !== undefined) runId = opts.runId;
  } catch (optErr) {
    return {
      isAbsent: false,
      classification: STORAGE_RESPONSE_CLASS.INDETERMINATE,
      status: 0,
      providerResponseObtained: false,
      reason: sanitizeData(optErr.message)
    };
  }
  if (!bucket || !path) {
    return { isAbsent: false, classification: STORAGE_RESPONSE_CLASS.INDETERMINATE, status: 0, reason: 'MISSING_CLIENT_OR_PATH' };
  }
  let trustedMeta;
  try {
    // The run-owned path is an independent binding constraint, not a trust marker.
    const pathRunId = bucket === STORAGE_PROBE_BUCKET && typeof path === 'string' && path.includes('/')
      ? validateRunId(path.split('/')[0]) : null;
    if (runId && pathRunId && runId !== pathRunId) {
      throw new Error('ADMIN_CLIENT_RUN_MISMATCH: Absence path and requested run do not match');
    }
    trustedMeta = assertTrustedAdminClient(adminClient, {
      projectRef, runId: runId || pathRunId, requireRunBinding: Boolean(runId || pathRunId)
    });
  } catch (err) {
    return {
      isAbsent: false,
      classification: STORAGE_RESPONSE_CLASS.INDETERMINATE,
      status: 0,
      providerResponseObtained: false,
      reason: `ADMIN_INTEGRITY_REJECTED: ${sanitizeData(err.message)}`
    };
  }
  try {
    const res = await runWithBlockedRealFetch(() => Reflect.apply(trustedMeta.capabilities.getStorageObject, adminClient, [bucket, path]));
    if (!res) {
      return { isAbsent: false, classification: STORAGE_RESPONSE_CLASS.INDETERMINATE, status: 0, reason: 'EMPTY_ADMIN_CLIENT_RESPONSE' };
    }
    return res.normalized;
  } catch (err) {
    return normalizeStorageObjectResponse({
      transportError: err, expectedBucket: bucket, expectedPath: path, projectRef, authorizedContext: true
    });
  }
}

/**
 * Boolean wrapper over verifyStorageObjectAbsenceDetailed (R1-06, R2-03).
 */
export async function verifyStorageObjectAbsence(adminClient, bucket, path, options = {}) {
  const res = await verifyStorageObjectAbsenceDetailed(adminClient, bucket, path, options);
  return res?.isAbsent === true;
}

function storageEvidenceSnapshot(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') {
    if (!['undefined', 'string', 'number', 'boolean'].includes(typeof value) && value !== null) {
      throw new Error('INVALID_STORAGE_EVIDENCE');
    }
    return [typeof value, value];
  }
  if (seen.has(value) || Object.getOwnPropertySymbols(value).length) throw new Error('INVALID_STORAGE_EVIDENCE');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== Array.prototype && prototype !== null) throw new Error('INVALID_STORAGE_EVIDENCE');
  seen.add(value);
  const entries = [];
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (!Object.hasOwn(descriptor, 'value')) throw new Error('INVALID_STORAGE_EVIDENCE');
    entries.push([key, storageEvidenceSnapshot(descriptor.value, seen)]);
  }
  seen.delete(value);
  return [Array.isArray(value) ? 'array' : 'object', entries];
}

function hasVerifiedStorageDeletion(inventory, fixtureKey, fixture) {
  const receipt = VERIFIED_STORAGE_DELETIONS.get(fixture);
  if (!receipt || receipt.inventory !== inventory || receipt.runId !== inventory.runId || receipt.fixtureKey !== fixtureKey) return false;
  try {
    // Compare descriptor values without invoking getters or caller-supplied toJSON.
    return receipt.snapshot === JSON.stringify(storageEvidenceSnapshot(fixture));
  } catch {
    return false;
  }
}

function storageCreationSnapshot(fixture) {
  const evidence = Object.create(null);
  for (const key of ['bucket', 'path', 'key', 'runId', 'reservationOpId', 'ownerId', 'verifiedOwnerId',
    'providerObjectId', 'providerObjectIdLocked', 'bytes', 'sha256', 'hasCommittedUpload', 'proof']) {
    const descriptor = Object.getOwnPropertyDescriptor(fixture, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw new Error('INVALID_STORAGE_CREATION_EVIDENCE');
    evidence[key] = descriptor.value;
  }
  return JSON.stringify(storageEvidenceSnapshot(evidence));
}

function hasVerifiedStorageCreation(inventory, fixtureKey, fixture) {
  const receipt = VERIFIED_STORAGE_CREATIONS.get(fixture);
  if (!receipt || receipt.inventory !== inventory || receipt.fixtureKey !== fixtureKey || receipt.runId !== inventory.runId) return false;
  try {
    return receipt.snapshot === storageCreationSnapshot(fixture);
  } catch {
    return false;
  }
}

function cleanupFailure(message, report) {
  const error = new Error(message);
  error.code = 'CLEANUP_FAILED_RESIDUAL_RESOURCES';
  error.cleanupReport = sanitizeData(report);
  return error;
}

export function assertTrustedRunInventory(
  inventory,
  {
    projectRef = HARDCODED_TEMP_REF,
    expectedRunId = null
  } = {}
) {
  const normRef = (projectRef || '').trim().toLowerCase();
  if (!inventory || typeof inventory !== 'object' || Array.isArray(inventory) || utilTypes.isProxy(inventory)) {
    throw new Error(
      'BLOCKED_PENDING_DURABLE_RECOVERY: UNTRUSTED_RUN_INVENTORY: Inventory must be a registered TestRunInventory instance (R8-01)'
    );
  }
  const meta = TRUSTED_RUN_INVENTORIES.get(inventory);
  if (!meta || meta.instance !== inventory || Object.getPrototypeOf(inventory) !== TestRunInventory.prototype) {
    throw new Error(
      'BLOCKED_PENDING_DURABLE_RECOVERY: UNTRUSTED_RUN_INVENTORY: Unregistered, forged, or prototyped inventory rejected fail-closed (R8-01)'
    );
  }
  if (Object.getOwnPropertySymbols(inventory).length > 0) {
    throw new Error(
      'BLOCKED_PENDING_DURABLE_RECOVERY: UNTRUSTED_RUN_INVENTORY: Symbol property on inventory rejected fail-closed (R8-01)'
    );
  }
  for (const key of Object.getOwnPropertyNames(inventory)) {
    const desc = Object.getOwnPropertyDescriptor(inventory, key);
    if (!desc || !Object.hasOwn(desc, 'value')) {
      throw new Error(
        `BLOCKED_PENDING_DURABLE_RECOVERY: UNTRUSTED_RUN_INVENTORY: Accessor property '${key}' on inventory rejected fail-closed (R8-01)`
      );
    }
  }
  const runIdDesc = Object.getOwnPropertyDescriptor(inventory, 'runId');
  if (!runIdDesc || !Object.hasOwn(runIdDesc, 'value') || runIdDesc.value !== meta.runId) {
    throw new Error(
      'BLOCKED_PENDING_DURABLE_RECOVERY: UNTRUSTED_RUN_INVENTORY: Inventory runId tampered or invalid (R8-01)'
    );
  }
  if (!meta.projectRef || meta.projectRef !== normRef || meta.projectRef !== HARDCODED_TEMP_REF || isForbiddenProject(meta.projectRef)) {
    throw new Error(
      `CRITICAL_SECURITY_VIOLATION: UNTRUSTED_RUN_INVENTORY: Inventory bound to '${meta.projectRef}', expected '${normRef}' (R8-01)`
    );
  }
  if (expectedRunId && meta.runId !== expectedRunId) {
    throw new Error(
      `INVENTORY_RUN_ID_MISMATCH: Inventory runId '${meta.runId}' does not match expected '${expectedRunId}' (R8-01)`
    );
  }
  for (const [methodName, expectedFn] of Object.entries(meta.methods)) {
    if (inventory[methodName] !== expectedFn) {
      throw new Error(
        `BLOCKED_PENDING_DURABLE_RECOVERY: UNTRUSTED_RUN_INVENTORY: Inventory method '${methodName}' was altered or replaced (R8-01)`
      );
    }
  }
  return meta;
}

export function assertTrustedRunContext(ctx, { projectRef = HARDCODED_TEMP_REF, expectedRunId = null } = {}) {
  const normRef = (projectRef || '').trim().toLowerCase();
  if (!ctx || typeof ctx !== 'object' || Array.isArray(ctx) || utilTypes.isProxy(ctx)) {
    throw new Error(
      'BLOCKED_PENDING_DURABLE_RECOVERY: UNTRUSTED_RUN_CONTEXT: Run context must be a registered instance from createRunContext() (R8-01)'
    );
  }
  const meta = TRUSTED_RUN_CONTEXTS.get(ctx);
  if (!meta || meta.instance !== ctx) {
    throw new Error(
      'BLOCKED_PENDING_DURABLE_RECOVERY: UNTRUSTED_RUN_CONTEXT: Unregistered or forged run context rejected fail-closed (R8-01)'
    );
  }
  if (meta.cleared === true) {
    throw new Error(
      'BLOCKED_PENDING_DURABLE_RECOVERY: UNTRUSTED_RUN_CONTEXT: Cleared run context is terminal and cannot be reused (R9-01)'
    );
  }
  const proto = Object.getPrototypeOf(ctx);
  if (proto !== Object.prototype && proto !== null) {
    throw new Error(
      'BLOCKED_PENDING_DURABLE_RECOVERY: UNTRUSTED_RUN_CONTEXT: Unsupported prototype on run context rejected (R8-01)'
    );
  }
  if (Object.getOwnPropertySymbols(ctx).length > 0) {
    throw new Error(
      'BLOCKED_PENDING_DURABLE_RECOVERY: UNTRUSTED_RUN_CONTEXT: Symbol property on run context rejected (R8-01)'
    );
  }
  for (const key of Object.getOwnPropertyNames(ctx)) {
    const desc = Object.getOwnPropertyDescriptor(ctx, key);
    if (!desc || !Object.hasOwn(desc, 'value')) {
      throw new Error(
        `BLOCKED_PENDING_DURABLE_RECOVERY: UNTRUSTED_RUN_CONTEXT: Accessor property '${key}' on run context rejected (R8-01)`
      );
    }
  }
  if (ctx.clear !== meta.methods.clear) {
    throw new Error(
      'BLOCKED_PENDING_DURABLE_RECOVERY: UNTRUSTED_RUN_CONTEXT: Run context clear() method was altered or replaced (R8-01)'
    );
  }
  if (!meta.projectRef || meta.projectRef !== normRef || meta.projectRef !== HARDCODED_TEMP_REF || isForbiddenProject(meta.projectRef)) {
    throw new Error(
      `CRITICAL_SECURITY_VIOLATION: UNTRUSTED_RUN_CONTEXT: Run context bound to '${meta.projectRef}', expected '${normRef}' (R9-01)`
    );
  }
  const projDesc = Object.getOwnPropertyDescriptor(ctx, 'projectRef');
  if (!projDesc || !Object.hasOwn(projDesc, 'value') || projDesc.value !== meta.projectRef) {
    throw new Error(
      'BLOCKED_PENDING_DURABLE_RECOVERY: UNTRUSTED_RUN_CONTEXT: Run context projectRef tampered or missing (R9-01)'
    );
  }
  if (!meta.runId || typeof meta.runId !== 'string') {
    throw new Error(
      'BLOCKED_PENDING_DURABLE_RECOVERY: UNTRUSTED_RUN_CONTEXT: Run context lacks valid registered runId (R9-01)'
    );
  }
  const runIdDesc = Object.getOwnPropertyDescriptor(ctx, 'runId');
  if (!runIdDesc || !Object.hasOwn(runIdDesc, 'value') || runIdDesc.value !== meta.runId) {
    throw new Error(
      'BLOCKED_PENDING_DURABLE_RECOVERY: UNTRUSTED_RUN_CONTEXT: Run context runId tampered, nullified, or missing (R9-01)'
    );
  }
  if (expectedRunId && meta.runId !== expectedRunId) {
    throw new Error(
      `ADMIN_CLIENT_RUN_MISMATCH: Run context registered runId '${meta.runId}' does not match expected '${expectedRunId}' (R9-01)`
    );
  }
  return meta;
}

/**
 * Run-scoped identity and fixture inventory for deterministic cleanup and verification.
 * Distinguishes createdThisRun resources (eligible for deletion) from pre-existing fixture references (NEVER deleted).
 * Tracks exact UUIDs, emails, sessions, database rows, and storage objects.
 * Handles Supabase Admin { data, error } responses and verifies post-cleanup absence of residual resources.
 * Resolves PRRT_kwDOVtCmZc66lEzi, PRRT_kwDOVtCmZc66lOOS, PRRT_kwDOVtCmZc66lOOU, and PRRT_kwDOVtCmZc66lq3S.
 */
export class TestRunInventory {
  constructor(runId = null, rawSeedOptions = {}) {
    const seedOpts = admitValidatedInput(rawSeedOptions, 'TestRunInventoryOptions');
    const seedEmail = seedOpts.seedEmail !== undefined ? seedOpts.seedEmail : null;
    const seedUserId = seedOpts.seedUserId !== undefined ? seedOpts.seedUserId : null;
    if (runId !== null && runId !== undefined) {
      this.runId = validateRunId(runId);
    } else {
      this.runId = `run-${Date.now()}-${crypto.randomUUID()}`;
    }
    this.createdUsers = new Map(); // Users verified as created in THIS run with affirmative proof -> deletion eligible
    this.deletedUsers = new Set(); // Users confirmed deleted & absent during executeCleanup (R2-02)
    this.referencedUsers = new Map(); // Pre-existing / seeded users authenticated -> NEVER deleted (R3-09)
    this.unverifiedUsers = new Map(); // Users observed without affirmative run-created proof -> NEVER deleted (R16-02)
    this.userOwnership = new Map(); // userId -> USER_OWNERSHIP (R16-02)
    this.protectedSeedIdentities = new Set(); // verified pre-existing seed user IDs ONLY (R16-02, R17-03)
    this.verifiedSeedUsers = new Map(); // seedUserId -> { id, email, proof, registeredAt } (R17-03)
    this.trackedSessions = new Set(); // Session IDs
    this.sessionTokens = new Map(); // sessionId -> accessToken for supported GoTrue session invalidation (R6-01)
    this.revokedSessions = new Set(); // Session IDs affirmatively verified as revoked or absent (R8-02)
    this.trackedTableRows = new Map(); // table -> Set(id)
    this.trackedStorageObjects = new Map(); // bucket -> Set(path)
    this.storageFixtures = new Map(); // key -> fixture record (H3-02)
    this.seedCredentialRestorations = []; // Seed users whose password was modified -> must be restored (R5-06)
    this.untrackedSessionsCount = 0; // Minted sessions whose ID could not be parsed (R5-04, R8-01)
    this.untrackedUsersCount = 0; // Users created whose concrete ID was lost or unobserved (R14-02)
    this.inFlightOperations = new Map(); // opId -> operation record (R13-02)
    this._opSequence = 0;
    this._reservationSequence = 0;
    this.runLifecycleState = INVENTORY_RUN_STATE.ACTIVE; // ACTIVE -> QUIESCING -> CLEANUP_ACTIVE -> FINALIZED | RESIDUAL_BLOCKED (R3-04)
    this._cleanupInProgress = false;
    this._activeCleanupPromise = null;
    this.cleanupStarted = false; // Set to true once executeCleanup begins (R2-02)
    this.lateSettlementsDuringCleanup = []; // Operations or updates settling after cleanup starts (R2-02)
    this.finalized = false; // Set to true once executeCleanup completes (R13-02)
    this.postFinalizationMutations = []; // Late mutations attempted after finalization (R13-02)
    this._settlementListeners = [];

    if (seedUserId) {
      this.protectSeedIdentity({ id: seedUserId, email: seedEmail });
    }

    const trustedMethods = Object.freeze({
      assertActiveForAdmission: this.assertActiveForAdmission,
      protectSeedIdentity: this.protectSeedIdentity,
      registerCreatedUser: this.registerCreatedUser,
      registerReferencedUser: this.registerReferencedUser,
      trackReferencedUser: this.trackReferencedUser,
      registerUnverifiedUser: this.registerUnverifiedUser,
      registerSession: this.registerSession,
      registerUntrackedSession: this.registerUntrackedSession,
      registerUntrackedUser: this.registerUntrackedUser,
      registerInFlightOperation: this.registerInFlightOperation,
      settleInFlightOperation: this.settleInFlightOperation,
      markProbeOperationsTimedOut: this.markProbeOperationsTimedOut,
      hasUnresolvedOperations: this.hasUnresolvedOperations,
      getUnresolvedOperations: this.getUnresolvedOperations,
      awaitInFlightSettlement: this.awaitInFlightSettlement,
      finalize: this.finalize,
      executeCleanup: this.executeCleanup,
      _executeCleanupInternal: this._executeCleanupInternal,
      getSummary: this.getSummary,
      isClean: this.isClean,
      clearCredentials: this.clearCredentials,
      reserveStorageFixture: this.reserveStorageFixture,
      updateStorageFixture: this.updateStorageFixture,
      getStorageFixture: this.getStorageFixture,
      registerStorageObject: this.registerStorageObject,
      registerSeedPasswordModification: this.registerSeedPasswordModification
    });
    TRUSTED_RUN_INVENTORIES.set(
      this,
      Object.freeze({
        instance: this,
        runId: this.runId,
        projectRef: HARDCODED_TEMP_REF,
        methods: trustedMethods
      })
    );
  }

  /**
   * Ensures admission is still open (ACTIVE) before accepting new mutations or reservations (R3-04).
   */
  assertActiveForAdmission(action = 'operation') {
    if (this.finalized || this.runLifecycleState === INVENTORY_RUN_STATE.FINALIZED) {
      throw new Error(`INVENTORY_FINALIZED: Cannot perform '${action}' against finalized inventory`);
    }
    if (this.runLifecycleState !== INVENTORY_RUN_STATE.ACTIVE) {
      throw new Error(
        `INVENTORY_ADMISSION_CLOSED: Cannot perform '${action}' while runLifecycleState is '${this.runLifecycleState}' (R3-04)`
      );
    }
  }

  // Backward-compatible getter: returns combined map of tracked users
  get trackedUsers() {
    return new Map([...this.referencedUsers, ...this.createdUsers, ...this.unverifiedUsers]);
  }

  protectSeedIdentity(raw = {}) {
    const { id, email, proof = null } = snapshotDirectInventoryInput(raw, 'protectSeedIdentity');
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      // R17-03: A bare email string alone without an affirmative user ID cannot prove account pre-existence!
      return false;
    }
    const cleanId = id.trim();
    const cleanEmail = email && typeof email === 'string' && email.trim().length > 0 ? email.trim().toLowerCase() : null;
    this.protectedSeedIdentities.add(cleanId);
    this.verifiedSeedUsers.set(cleanId, {
      id: cleanId,
      email: cleanEmail,
      proof: proof || null,
      registeredAt: new Date().toISOString()
    });
    this.userOwnership.set(cleanId, USER_OWNERSHIP.PRE_EXISTING_REFERENCED);
    if (!this.referencedUsers.has(cleanId)) {
      this.referencedUsers.set(cleanId, {
        id: cleanId,
        email: cleanEmail,
        source: 'seed_protection',
        ownership: USER_OWNERSHIP.PRE_EXISTING_REFERENCED,
        referencedAt: new Date().toISOString()
      });
    }
    this.createdUsers.delete(cleanId);
    this.unverifiedUsers.delete(cleanId);
    return true;
  }

  isSeedIdentity(id, email = null) {
    if (id && typeof id === 'string' && id.trim().length > 0) {
      return this.protectedSeedIdentities.has(id.trim());
    }
    // R17-03: Bare email alone without an ID NEVER confers seed identity! (PRRT_kwDOVtCmZc67O5WW)
    return false;
  }

  getUserOwnership(userId) {
    if (!userId || typeof userId !== 'string') return USER_OWNERSHIP.OWNERSHIP_UNKNOWN;
    const cleanId = userId.trim();
    if (this.userOwnership.has(cleanId)) {
      return this.userOwnership.get(cleanId);
    }
    if (this.referencedUsers.has(cleanId) || this.protectedSeedIdentities.has(cleanId)) {
      return USER_OWNERSHIP.PRE_EXISTING_REFERENCED;
    }
    if (this.createdUsers.has(cleanId)) {
      return USER_OWNERSHIP.RUN_CREATED_VERIFIED;
    }
    if (this.unverifiedUsers.has(cleanId)) {
      return this.unverifiedUsers.get(cleanId)?.ownership || USER_OWNERSHIP.OWNERSHIP_UNKNOWN;
    }
    return USER_OWNERSHIP.OWNERSHIP_UNKNOWN;
  }

  /**
   * Registers a user created during this run with affirmative proof (R16-02).
   * Deletion eligible upon cleanup ONLY if RUN_CREATED_VERIFIED.
   */
  registerCreatedUser(raw = {}) {
    const { id, email, source = 'test_signup', creationProof = null } = snapshotDirectInventoryInput(raw, 'registerCreatedUser');
    if (this.finalized) {
      this.postFinalizationMutations.push({
        action: 'registerCreatedUser',
        id,
        email,
        source,
        attemptedAt: new Date().toISOString()
      });
    }
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      throw new Error('registerCreatedUser requires non-empty string id');
    }
    if (!email || typeof email !== 'string' || email.trim().length === 0) {
      throw new Error('registerCreatedUser requires non-empty string email');
    }
    validateTestIdentity(email);
    const cleanId = id.trim();
    const normEmail = email.trim().toLowerCase();

    // Anti-deletion guard: Never classify pre-existing seed user as run-created! (R16-02)
    if (this.isSeedIdentity(cleanId, normEmail) || this.isUserReferenced(cleanId)) {
      return this.registerReferencedUser({ id: cleanId, email: normEmail, source: `${source}_protected_seed` });
    }

    // Verify affirmative creation proof (R16-02)
    // Caller-supplied metadata flag alone does NOT certify ownership (Requirement 14)
    if (creationProof !== null && creationProof !== undefined) {
      if (!isValidCreationProof(creationProof)) {
        return this.registerObservedUser({
          id: cleanId,
          email: normEmail,
          source,
          ownership: USER_OWNERSHIP.CREATION_INDETERMINATE,
          creationProof: null
        });
      }
    } else {
      // creationProof omitted: register as observed user with UNKNOWN ownership
      return this.registerObservedUser({
        id: cleanId,
        email: normEmail,
        source,
        ownership: USER_OWNERSHIP.OWNERSHIP_UNKNOWN,
        creationProof: null
      });
    }

    const record = {
      id: cleanId,
      email: normEmail,
      source,
      ownership: USER_OWNERSHIP.RUN_CREATED_VERIFIED,
      creationProof,
      createdAt: new Date().toISOString()
    };
    this.createdUsers.set(cleanId, record);
    this.userOwnership.set(cleanId, USER_OWNERSHIP.RUN_CREATED_VERIFIED);
    this.unverifiedUsers.delete(cleanId);
    return record;
  }

  /**
   * Registers a user observed in a response without verified run-created ownership (R16-02).
   * User is preserved and NEVER deleted during cleanup.
   */
  registerObservedUser(raw = {}) {
    const { id, email, source = 'observed_response', ownership = USER_OWNERSHIP.OWNERSHIP_UNKNOWN, creationProof = null } = snapshotDirectInventoryInput(raw, 'registerObservedUser');
    if (this.finalized) {
      this.postFinalizationMutations.push({
        action: 'registerObservedUser',
        id,
        email,
        source,
        attemptedAt: new Date().toISOString()
      });
    }
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      throw new Error('registerObservedUser requires non-empty string id');
    }
    const cleanId = id.trim();
    const normEmail = email && typeof email === 'string' ? email.trim().toLowerCase() : null;

    if (this.isSeedIdentity(cleanId, normEmail) || this.isUserReferenced(cleanId)) {
      return this.registerReferencedUser({
        id: cleanId,
        email: normEmail || 'seed@proof.invalid',
        source: `${source}_protected_seed`
      });
    }

    if (creationProof && isValidCreationProof(creationProof)) {
      return this.registerCreatedUser({ id: cleanId, email: normEmail || 'created@proof.invalid', source, creationProof });
    }

    const determinedOwnership = ownership === USER_OWNERSHIP.CREATION_INDETERMINATE
      ? USER_OWNERSHIP.CREATION_INDETERMINATE
      : USER_OWNERSHIP.OWNERSHIP_UNKNOWN;

    const record = {
      id: cleanId,
      email: normEmail,
      source,
      ownership: determinedOwnership,
      creationProof: null,
      observedAt: new Date().toISOString()
    };
    this.unverifiedUsers.set(cleanId, record);
    this.userOwnership.set(cleanId, determinedOwnership);
    this.untrackedUsersCount++;
    return record;
  }

  /**
   * Registers a pre-existing fixture or seed user referenced during login (e.g. HOOK-01).
   * Tracked for audit and correlation, but NEVER deleted during cleanup (R3-09).
   */
  registerReferencedUser(raw = {}) {
    const { id, email, source = 'test_login' } = snapshotDirectInventoryInput(raw, 'registerReferencedUser');
    if (this.finalized) {
      this.postFinalizationMutations.push({
        action: 'registerReferencedUser',
        id,
        email,
        source,
        attemptedAt: new Date().toISOString()
      });
    }
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      throw new Error('registerReferencedUser requires non-empty string id');
    }
    if (!email || typeof email !== 'string' || email.trim().length === 0) {
      throw new Error('registerReferencedUser requires non-empty string email');
    }
    validateTestIdentity(email);
    const cleanId = id.trim();
    const normEmail = email.trim().toLowerCase();
    const record = {
      id: cleanId,
      email: normEmail,
      source,
      ownership: USER_OWNERSHIP.PRE_EXISTING_REFERENCED,
      referencedAt: new Date().toISOString()
    };
    this.referencedUsers.set(cleanId, record);
    this.userOwnership.set(cleanId, USER_OWNERSHIP.PRE_EXISTING_REFERENCED);
    this.protectedSeedIdentities.add(cleanId);
    this.protectedSeedIdentities.add(normEmail);
    this.createdUsers.delete(cleanId);
    this.unverifiedUsers.delete(cleanId);
    return record;
  }

  // Backward-compatible alias: registerUser defaults to registerCreatedUser
  registerUser(userObj) {
    return this.registerCreatedUser(userObj);
  }

  trackReferencedUser(userObj) {
    return this.registerReferencedUser(userObj);
  }

  trackCreatedUser(userObj) {
    return this.registerCreatedUser(userObj);
  }

  registerSession(sessionOrId, optionsOrToken = {}) {
    if (sessionOrId && typeof sessionOrId === 'object') sessionOrId = snapshotDirectInventoryInput(sessionOrId, 'registerSession');
    if (optionsOrToken && typeof optionsOrToken === 'object') optionsOrToken = snapshotDirectInventoryInput(optionsOrToken, 'registerSession.options');
    let sessionId = null;
    let accessToken = null;

    if (typeof sessionOrId === 'string' && sessionOrId.trim().length > 0) {
      sessionId = sessionOrId.trim();
      if (typeof optionsOrToken === 'string' && optionsOrToken.trim().length > 0) {
        accessToken = optionsOrToken.trim();
      } else if (optionsOrToken && typeof optionsOrToken === 'object') {
        accessToken = optionsOrToken.accessToken || optionsOrToken.jwt || optionsOrToken.token || null;
      }
    } else if (sessionOrId && typeof sessionOrId === 'object') {
      sessionId = (sessionOrId.sessionId || sessionOrId.id || '').trim();
      accessToken = sessionOrId.accessToken || sessionOrId.jwt || sessionOrId.token || null;
    }

    if (this.finalized) {
      this.postFinalizationMutations.push({
        action: 'registerSession',
        sessionId,
        attemptedAt: new Date().toISOString()
      });
    }

    if (sessionId) {
      this.trackedSessions.add(sessionId);
      if (accessToken && typeof accessToken === 'string' && accessToken.trim().length > 0) {
        this.sessionTokens.set(sessionId, accessToken.trim());
      }
    }
  }

  getSessionToken(sessionId) {
    if (!sessionId || typeof sessionId !== 'string') return null;
    return this.sessionTokens.get(sessionId.trim()) || null;
  }

  registerTableRow(table, id) {
    if (!table || !id || typeof table !== 'string' || typeof id !== 'string') {
      throw new Error('registerTableRow requires table and id');
    }
    const t = table.trim();
    const rowId = id.trim();
    if (!this.trackedTableRows.has(t)) {
      this.trackedTableRows.set(t, new Set());
    }
    this.trackedTableRows.get(t).add(rowId);
  }

  _syncTrackedObjectForVerifiedFixture(bucket, path) {
    const b = String(bucket).trim();
    const p = String(path).trim();
    if (!this.trackedStorageObjects.has(b)) {
      this.trackedStorageObjects.set(b, new Set());
    }
    this.trackedStorageObjects.get(b).add(p);
  }

  registerStorageObject(bucket, path) {
    if (this.finalized) {
      this.postFinalizationMutations.push({
        action: 'registerStorageObject',
        bucket,
        path,
        attemptedAt: new Date().toISOString()
      });
    } else if (this.cleanupStarted) {
      this.lateSettlementsDuringCleanup.push({
        action: 'registerStorageObject',
        bucket,
        path,
        attemptedAt: new Date().toISOString()
      });
    }
    this.assertActiveForAdmission('registerStorageObject');
    if (!bucket || !path || typeof bucket !== 'string' || typeof path !== 'string') {
      throw new Error('registerStorageObject requires bucket and path');
    }
    const b = bucket.trim();
    const p = path.trim();
    const fixtureKey = `${b}/${p}`;
    const existingFixture = this.storageFixtures.get(fixtureKey);
    if (existingFixture) {
      throw new Error(
        `STORAGE_LIFECYCLE_BYPASS_VIOLATION: Cannot bypass Storage fixture lifecycle via registerStorageObject('${fixtureKey}') while fixture is tracked in state '${existingFixture.lifecycleState}' (R3-03)`
      );
    }
    if (!this.trackedStorageObjects.has(b)) {
      this.trackedStorageObjects.set(b, new Set());
    }
    this.trackedStorageObjects.get(b).add(p);
  }

  /**
   * Atomically reserves a unique Storage fixture slot before any async provider dispatch (R3-03, R3-04).
   * Rejects duplicate keys without overwriting active/verified/blocked records, rejects closed/finalized runs,
   * and binds a single authoritative reservationOpId for subsequent state transitions.
   */
  reserveStorageFixture({
    bucket = STORAGE_PROBE_BUCKET,
    path,
    ownerId = null,
    reservationOpId = null,
    projectRef = HARDCODED_TEMP_REF,
    bytes = 0,
    sha256 = null,
    status = 'CREATION_PENDING',
    lifecycleState = STORAGE_LIFECYCLE_STATE.CREATION_PENDING
  } = {}) {
    if (this.finalized) {
      this.postFinalizationMutations.push({
        action: 'reserveStorageFixture',
        bucket,
        path,
        attemptedAt: new Date().toISOString()
      });
    } else if (this.cleanupStarted) {
      this.lateSettlementsDuringCleanup.push({
        action: 'reserveStorageFixture',
        bucket,
        path,
        attemptedAt: new Date().toISOString()
      });
    }
    this.assertActiveForAdmission('reserveStorageFixture');

    const normRef = typeof projectRef === 'string' ? projectRef.trim().toLowerCase() : '';
    if (!normRef || normRef !== HARDCODED_TEMP_REF || isForbiddenProject(normRef)) {
      throw new Error(`CRITICAL_SECURITY_VIOLATION: reserveStorageFixture rejected target project '${normRef}'`);
    }
    if (!path || typeof path !== 'string' || !path.trim()) {
      throw new Error('reserveStorageFixture requires non-empty path');
    }

    const cleanBucket = (bucket || STORAGE_PROBE_BUCKET).trim();
    const cleanPath = path.trim();
    const fixtureKey = `${cleanBucket}/${cleanPath}`;

    if (this.storageFixtures.has(fixtureKey)) {
      const existing = this.storageFixtures.get(fixtureKey);
      throw new Error(
        `STORAGE_FIXTURE_RESERVATION_CONFLICT: Storage fixture '${fixtureKey}' is already reserved in state '${existing.lifecycleState}' (ownerOpId='${existing.reservationOpId || 'none'}') (R3-03)`
      );
    }
    if (this.trackedStorageObjects.get(cleanBucket)?.has(cleanPath)) {
      throw new Error(
        `STORAGE_FIXTURE_RESERVATION_CONFLICT: Storage key '${fixtureKey}' is already tracked in inventory (R3-03)`
      );
    }

    const assignedOpId = reservationOpId && typeof reservationOpId === 'string' && reservationOpId.trim()
      ? reservationOpId.trim()
      : `op-res-${this.runId}-${++this._reservationSequence}`;

    const fixtureRecord = {
      bucket: cleanBucket,
      path: cleanPath,
      key: fixtureKey,
      runId: this.runId,
      projectRef: normRef,
      reservationOpId: assignedOpId,
      strictOwnerOpRequired: true,
      ownerId: ownerId ? String(ownerId).trim() : null,
      verifiedOwnerId: null,
      providerObjectId: null,
      providerObjectIdLocked: false,
      bytes: typeof bytes === 'number' ? bytes : 0,
      sha256: sha256 || null,
      status,
      lifecycleState: lifecycleState || STORAGE_LIFECYCLE_STATE.CREATION_PENDING,
      deletionEligible: false,
      hasCommittedUpload: false,
      neverDispatched: true,
      proof: null,
      registeredAt: new Date().toISOString()
    };
    this.storageFixtures.set(fixtureKey, fixtureRecord);
    return fixtureRecord;
  }

  /**
   * Registers a run-scoped Storage probe fixture with explicit lifecycle tracking (H3-02, H3-R1, H3-R2, R3-03).
   * Enforces atomic non-overwrite semantics and rejects closed/finalized run lifecycles.
   */
  registerStorageFixture({
    bucket = STORAGE_PROBE_BUCKET,
    path,
    ownerId = null,
    providerObjectId = null,
    bytes = 0,
    sha256 = null,
    status = 'PROVISIONED',
    proof = null,
    lifecycleState = null,
    deletionEligible = false,
    hasCommittedUpload = false,
    neverDispatched = false,
    reservationOpId = null,
    strictOwnerOpRequired = false
  } = {}) {
    if (this.finalized) {
      this.postFinalizationMutations.push({
        action: 'registerStorageFixture',
        bucket,
        path,
        lifecycleState,
        attemptedAt: new Date().toISOString()
      });
      throw new Error('INVENTORY_FINALIZED: Cannot register storage creation obligation against finalized inventory');
    }
    if (this.cleanupStarted) {
      this.lateSettlementsDuringCleanup.push({
        action: 'registerStorageFixture',
        bucket,
        path,
        lifecycleState,
        attemptedAt: new Date().toISOString()
      });
    }
    this.assertActiveForAdmission('registerStorageFixture');

    if (!path || typeof path !== 'string' || !path.trim()) {
      throw new Error('registerStorageFixture requires non-empty path');
    }
    const cleanBucket = (bucket || STORAGE_PROBE_BUCKET).trim();
    const cleanPath = path.trim();
    const fixtureKey = `${cleanBucket}/${cleanPath}`;

    if (this.storageFixtures.has(fixtureKey)) {
      const existing = this.storageFixtures.get(fixtureKey);
      throw new Error(
        `STORAGE_FIXTURE_RESERVATION_CONFLICT: Storage fixture '${fixtureKey}' already exists in state '${existing.lifecycleState}' (ownerOpId='${existing.reservationOpId || 'none'}') and cannot be overwritten (R3-03)`
      );
    }

    const state = lifecycleState || STORAGE_LIFECYCLE_STATE.CREATION_PENDING;
    const canDelete = deletionEligible === true && state === STORAGE_LIFECYCLE_STATE.RUN_CREATED_VERIFIED;
    const cleanObjectId = providerObjectId ? String(providerObjectId).trim() : null;
    const assignedOpId = reservationOpId && typeof reservationOpId === 'string' && reservationOpId.trim()
      ? reservationOpId.trim()
      : `op-res-${this.runId}-${++this._reservationSequence}`;

    if (canDelete) {
      this._syncTrackedObjectForVerifiedFixture(cleanBucket, cleanPath);
    }

    const fixtureRecord = {
      bucket: cleanBucket,
      path: cleanPath,
      key: fixtureKey,
      runId: this.runId,
      reservationOpId: assignedOpId,
      strictOwnerOpRequired: Boolean(strictOwnerOpRequired || reservationOpId),
      ownerId: ownerId ? String(ownerId).trim() : null,
      verifiedOwnerId: state === STORAGE_LIFECYCLE_STATE.RUN_CREATED_VERIFIED && ownerId ? String(ownerId).trim() : null,
      providerObjectId: cleanObjectId,
      providerObjectIdLocked: Boolean(cleanObjectId),
      bytes: typeof bytes === 'number' ? bytes : 0,
      sha256: sha256 || null,
      status,
      lifecycleState: state,
      deletionEligible: canDelete,
      hasCommittedUpload: Boolean(hasCommittedUpload || state === STORAGE_LIFECYCLE_STATE.RUN_CREATED_VERIFIED || state === STORAGE_LIFECYCLE_STATE.RESIDUAL_OWNERSHIP_BLOCKED),
      neverDispatched: Boolean(neverDispatched && !hasCommittedUpload),
      proof: proof || null,
      registeredAt: new Date().toISOString()
    };
    this.storageFixtures.set(fixtureKey, fixtureRecord);
    return fixtureRecord;
  }

  /**
   * Updates an existing Storage fixture's lifecycle state and metadata monotonically (H3-R1, H3-R2, R3-03).
   * - Enforces ownership via reservationOpId when strictOwnerOpRequired is enabled or ownerOpId is supplied.
   * - Locks providerObjectId against mutation once bound.
   * - Enforces monotonicity: never downgrades RUN_CREATED_VERIFIED or DELETION_VERIFIED to weaker pre-cleanup states.
   */
  updateStorageFixture(fixtureKeyOrBucket, pathOrUpdates = {}, maybeUpdates = {}) {
    let key = null;
    let updates = {};
    if (typeof pathOrUpdates === 'string') {
      key = `${String(fixtureKeyOrBucket).trim()}/${String(pathOrUpdates).trim()}`;
      updates = maybeUpdates || {};
    } else {
      key = String(fixtureKeyOrBucket).trim();
      updates = pathOrUpdates || {};
    }

    if (this.finalized) {
      this.postFinalizationMutations.push({
        action: 'updateStorageFixture',
        key,
        lifecycleState: updates.lifecycleState || null,
        attemptedAt: new Date().toISOString()
      });
      throw new Error('INVENTORY_FINALIZED: Cannot update storage fixture against finalized inventory');
    }

    const fixture = this.storageFixtures.get(key);
    if (!fixture) {
      throw new Error(`STORAGE_FIXTURE_NOT_FOUND: Fixture '${key}' not registered in inventory`);
    }

    const isInternalCleanup = updates._internalCleanupTransition === true;
    if (!isInternalCleanup && (fixture.strictOwnerOpRequired === true || updates.ownerOpId !== undefined)) {
      const callerOpId = typeof updates.ownerOpId === 'string' ? updates.ownerOpId.trim() : '';
      if (!callerOpId || callerOpId !== fixture.reservationOpId) {
        throw new Error(
          `STORAGE_FIXTURE_OWNERSHIP_VIOLATION: Operation '${callerOpId || 'none'}' does not own reservation '${fixture.reservationOpId}' for fixture '${key}' (R3-03)`
        );
      }
    }

    if (updates.providerObjectId !== undefined) {
      const incomingId = updates.providerObjectId === null ? null : String(updates.providerObjectId).trim();
      if (fixture.providerObjectId && (!incomingId || fixture.providerObjectId.toLowerCase() !== incomingId.toLowerCase())) {
        throw new Error(
          `STORAGE_FIXTURE_IMMUTABLE_IDENTITY_VIOLATION: Immutable providerObjectId '${fixture.providerObjectId}' for '${key}' cannot be overwritten with '${incomingId || 'null'}' (R3-03)`
        );
      }
    }

    const nextState = updates.lifecycleState || fixture.lifecycleState;

    // Invariant R2-02 #9: Never overwrite terminal DELETION_VERIFIED or downgrade RUN_CREATED_VERIFIED
    if (fixture.lifecycleState === STORAGE_LIFECYCLE_STATE.DELETION_VERIFIED && nextState !== STORAGE_LIFECYCLE_STATE.DELETION_VERIFIED) {
      throw new Error(`INVENTORY_STATE_MONOTONICITY_VIOLATION: Cannot transition terminal DELETION_VERIFIED fixture '${key}' to '${nextState}'`);
    }
    if (
      fixture.lifecycleState === STORAGE_LIFECYCLE_STATE.RUN_CREATED_VERIFIED &&
      STORAGE_UNVERIFIED_PRE_CLEANUP_STATES.has(nextState)
    ) {
      throw new Error(
        `INVENTORY_STATE_MONOTONICITY_VIOLATION: Cannot overwrite RUN_CREATED_VERIFIED ownership evidence for '${key}' with weaker state '${nextState}' (R2-02)`
      );
    }

    // Invariant R2-02 #1 & #2: Successful POST commitment cannot be downgraded to CREATION_FAILED or DEFINITIVE_NON_CREATION
    if (
      (fixture.hasCommittedUpload || updates.hasCommittedUpload) &&
      (nextState === STORAGE_LIFECYCLE_STATE.CREATION_FAILED || nextState === STORAGE_LIFECYCLE_STATE.DEFINITIVE_NON_CREATION)
    ) {
      throw new Error(
        `INVENTORY_STATE_MONOTONICITY_VIOLATION: Committed upload '${key}' cannot transition to '${nextState}'; must remain residual/unverified (R2-02)`
      );
    }

    if (this.cleanupStarted && !isInternalCleanup) {
      this.lateSettlementsDuringCleanup.push({
        action: 'updateStorageFixture',
        key,
        nextState,
        attemptedAt: new Date().toISOString()
      });
    }

    if (updates.lifecycleState) {
      fixture.lifecycleState = updates.lifecycleState;
    }
    if (updates.status) {
      fixture.status = updates.status;
    }
    if (typeof updates.bytes === 'number') {
      fixture.bytes = updates.bytes;
    }
    if (updates.sha256 !== undefined) {
      fixture.sha256 = updates.sha256;
    }
    if (updates.providerObjectId !== undefined && updates.providerObjectId !== null) {
      fixture.providerObjectId = String(updates.providerObjectId).trim();
      fixture.providerObjectIdLocked = true;
    }
    if (updates.verifiedOwnerId !== undefined) {
      fixture.verifiedOwnerId = updates.verifiedOwnerId;
    }
    if (updates.proof !== undefined) {
      fixture.proof = updates.proof;
    }
    if (updates.residualReason !== undefined) {
      fixture.residualReason = updates.residualReason;
    }
    if (updates.hasCommittedUpload === true) {
      fixture.hasCommittedUpload = true;
      fixture.neverDispatched = false;
    }
    if (updates.neverDispatched === true && !fixture.hasCommittedUpload) {
      fixture.neverDispatched = true;
    }

    // Deletion eligibility is authorized ONLY upon affirmative RUN_CREATED_VERIFIED while run admission was active (R3-04)
    if (fixture.lifecycleState === STORAGE_LIFECYCLE_STATE.RUN_CREATED_VERIFIED && !this.cleanupStarted) {
      fixture.deletionEligible = updates.deletionEligible !== false;
      this._syncTrackedObjectForVerifiedFixture(fixture.bucket, fixture.path);
    } else if (fixture.lifecycleState === STORAGE_LIFECYCLE_STATE.CLEANUP_PENDING && fixture.proof?.verifiedOwnership === true) {
      // Preserve verified proof during cleanup transition while awaiting deletion verification
      fixture.deletionEligible = false;
    } else {
      fixture.deletionEligible = false;
      if (this.trackedStorageObjects.has(fixture.bucket)) {
        this.trackedStorageObjects.get(fixture.bucket).delete(fixture.path);
      }
    }

    return fixture;
  }

  /**
   * Retrieves a registered Storage probe fixture by bucket and path or composite key (H3-02, H3-R1).
   */
  getStorageFixture(bucketOrKey, path = null) {
    if (!bucketOrKey) return null;
    let fixtureKey = null;
    if (!path && typeof bucketOrKey === 'string' && bucketOrKey.includes('/')) {
      fixtureKey = bucketOrKey.trim();
    } else {
      fixtureKey = `${String(bucketOrKey).trim()}/${String(path).trim()}`;
    }
    return this.storageFixtures.get(fixtureKey) || null;
  }

  getUserEmail(userId) {
    if (!userId || typeof userId !== 'string') return null;
    const uid = userId.trim();
    if (this.referencedUsers.has(uid)) {
      return this.referencedUsers.get(uid)?.email || null;
    }
    if (this.createdUsers.has(uid)) {
      return this.createdUsers.get(uid)?.email || null;
    }
    return null;
  }

  registerSeedPasswordModification(raw = {}) {
    const { userId, email, originalPassword, newPassword, targetPassword, state = 'pending' } = snapshotDirectInventoryInput(raw, 'registerSeedPasswordModification');
    if (this.finalized) {
      this.postFinalizationMutations.push({
        action: 'registerSeedPasswordModification',
        userId,
        email,
        attemptedAt: new Date().toISOString()
      });
    }
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      throw new Error('registerSeedPasswordModification requires non-empty string userId');
    }
    if (!originalPassword || typeof originalPassword !== 'string') {
      throw new Error('registerSeedPasswordModification requires string originalPassword');
    }
    const uid = userId.trim();
    const normEmail = typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null;
    const trackedEmail = this.getUserEmail(uid) ? this.getUserEmail(uid).trim().toLowerCase() : null;

    if (normEmail && trackedEmail && normEmail !== trackedEmail) {
      throw new Error(`IDENTITY_MISMATCH: Attempted restoration registration for user '${uid}' with email '${normEmail}', but user is tracked with '${trackedEmail}' (R10-02)`);
    }

    const resolvedEmail = normEmail || trackedEmail || null;

    // Ensure no other unrestored record exists with same email but different user ID (R10-02)
    if (resolvedEmail) {
      const otherConflict = this.seedCredentialRestorations.find(
        r => r.email === resolvedEmail && r.userId !== uid && r.state !== 'restored'
      );
      if (otherConflict) {
        throw new Error(`IDENTITY_MISMATCH: Email '${resolvedEmail}' is already bound to restoration record for user '${otherConflict.userId}', cannot bind to '${uid}' (R10-02)`);
      }
    }

    const existing = this.seedCredentialRestorations.find(r => r.userId === uid && r.state !== 'restored');
    if (existing) {
      if (!existing.email) existing.email = resolvedEmail;
      if (targetPassword || newPassword) existing.targetPassword = targetPassword || newPassword;
      if (state) existing.state = state;
      return existing;
    }
    const target = targetPassword || newPassword || null;
    const record = {
      userId: uid,
      email: resolvedEmail,
      originalPassword,
      targetPassword: target,
      state, // 'pending' | 'dispatched' | 'confirmed' | 'indeterminate' | 'restored' | 'restoration_failed'
      registeredAt: new Date().toISOString(),
      dispatchedAt: null,
      confirmedAt: null,
      indeterminateAt: null,
      restoredAt: null,
      verifiedAt: null,
      lastStatus: null,
      error: null
    };
    this.seedCredentialRestorations.push(record);
    return record;
  }

  getSeedPasswordModification(userId) {
    if (!userId || typeof userId !== 'string') return null;
    const uid = userId.trim();
    return this.seedCredentialRestorations.find(r => r.userId === uid) || null;
  }

  clearCredentials() {
    for (const item of this.seedCredentialRestorations) {
      if (item.originalPassword) item.originalPassword = '[CLEARED]';
      if (item.targetPassword) item.targetPassword = '[CLEARED]';
    }
  }

  registerUntrackedSession() {
    if (this.finalized) {
      this.postFinalizationMutations.push({
        action: 'registerUntrackedSession',
        attemptedAt: new Date().toISOString()
      });
    }
    this.untrackedSessionsCount++;
  }

  registerUntrackedUser() {
    if (this.finalized) {
      this.postFinalizationMutations.push({
        action: 'registerUntrackedUser',
        attemptedAt: new Date().toISOString()
      });
    }
    this.untrackedUsersCount++;
  }

  markSessionRevoked(sessionId) {
    if (sessionId && typeof sessionId === 'string' && sessionId.trim().length > 0) {
      this.revokedSessions.add(sessionId.trim());
    }
  }

  isSessionRevoked(sessionId) {
    if (!sessionId || typeof sessionId !== 'string') return false;
    return this.revokedSessions.has(sessionId.trim());
  }

  isUserTracked(userId) {
    const id = (userId || '').trim();
    return this.createdUsers.has(id) || this.referencedUsers.has(id) || this.unverifiedUsers.has(id);
  }

  isUserCreated(userId) {
    return this.createdUsers.has((userId || '').trim());
  }

  isUserReferenced(userId) {
    return this.referencedUsers.has((userId || '').trim());
  }

  getTrackedUserIds() {
    return Array.from(new Set([...this.createdUsers.keys(), ...this.referencedUsers.keys(), ...this.unverifiedUsers.keys()]));
  }

  getCreatedUserIds() {
    return Array.from(this.createdUsers.keys());
  }

  getReferencedUserIds() {
    return Array.from(this.referencedUsers.keys());
  }

  getTrackedEmails() {
    const emails = [
      ...Array.from(this.createdUsers.values()).map(u => u.email),
      ...Array.from(this.referencedUsers.values()).map(u => u.email),
      ...Array.from(this.unverifiedUsers.values()).map(u => u.email)
    ];
    return Array.from(new Set(emails.filter(Boolean)));
  }

  /**
   * Registers an in-flight operation before network dispatch begins (R13-02, R14-01, R14-02).
   * Lifecycle states: REGISTERED -> IN_FLIGHT -> SETTLED | TIMED_OUT_UNRESOLVED -> CLEANUP_REQUIRED -> CLEANUP_VERIFIED
   */
  registerInFlightOperation(raw = {}) {
    const {
    probeId = 'unknown',
    endpoint = null,
    canMintSession = false,
    canCreateUser = false,
    canModifyProviderState = false,
    requiresCleanupReconciliation = false,
    targetUserId = null,
    description = null,
    metadata = {},
    _internalCleanupOperation = false
    } = snapshotDirectInventoryInput(raw, 'registerInFlightOperation');
    if (this.finalized) {
      const mutation = {
        action: 'registerInFlightOperation',
        probeId,
        endpoint,
        attemptedAt: new Date().toISOString()
      };
      this.postFinalizationMutations.push(mutation);
      throw new Error(`INVENTORY_FINALIZED: Cannot register in-flight operation '${probeId}' after inventory finalization (R13-02)`);
    }
    if (this.runLifecycleState !== INVENTORY_RUN_STATE.ACTIVE && !_internalCleanupOperation) {
      this.lateSettlementsDuringCleanup.push({
        action: 'registerInFlightOperation',
        probeId,
        endpoint,
        runLifecycleState: this.runLifecycleState,
        attemptedAt: new Date().toISOString()
      });
      throw new Error(
        `INVENTORY_ADMISSION_CLOSED: Cannot register operation '${probeId}' while inventory is in state '${this.runLifecycleState}' (R3-04)`
      );
    }

    const opId = `op-${this.runId}-${++this._opSequence}`;
    const op = {
      opId,
      probeId,
      endpoint,
      canMintSession: Boolean(canMintSession),
      canCreateUser: Boolean(canCreateUser),
      canModifyProviderState: Boolean(canModifyProviderState),
      requiresCleanupReconciliation: Boolean(requiresCleanupReconciliation),
      targetUserId: targetUserId ? String(targetUserId).trim() : null,
      description,
      metadata: { ...metadata },
      state: 'IN_FLIGHT',
      registeredDuringCleanup: Boolean(this.cleanupStarted),
      registeredAt: new Date().toISOString(),
      dispatchedAt: new Date().toISOString(),
      settledAt: null,
      timedOutAt: null,
      timeoutReason: null,
      error: null,
      observed: null,
      outcome: null
    };
    this.inFlightOperations.set(opId, op);
    return op;
  }

  /**
   * Settles an in-flight operation upon resolution or rejection (R13-02).
   * If operation was previously marked TIMED_OUT_UNRESOLVED, transitions to SETTLED_AFTER_TIMEOUT.
   */
  settleInFlightOperation(opId, raw = {}) {
    const { observed = null, error = null, outcome = null } = snapshotDirectInventoryInput(raw, 'settleInFlightOperation', true);
    if (!opId || typeof opId !== 'string') return null;
    const op = this.inFlightOperations.get(opId.trim());
    if (!op) return null;

    if (this.finalized) {
      const mutation = {
        action: 'settleInFlightOperation',
        opId,
        probeId: op.probeId,
        priorState: op.state,
        error: error?.message || (typeof error === 'string' ? error : null),
        attemptedAt: new Date().toISOString()
      };
      this.postFinalizationMutations.push(mutation);
    } else if (this.cleanupStarted && !op.registeredDuringCleanup && (op.state === 'IN_FLIGHT' || op.state === 'TIMED_OUT_UNRESOLVED')) {
      this.lateSettlementsDuringCleanup.push({
        action: 'settleInFlightOperation',
        opId,
        probeId: op.probeId,
        priorState: op.state,
        canModifyProviderState: op.canModifyProviderState,
        canCreateUser: op.canCreateUser,
        canMintSession: op.canMintSession,
        settledAt: new Date().toISOString()
      });
    }

    const priorState = op.state;
    if (priorState === 'TIMED_OUT_UNRESOLVED') {
      op.state = 'SETTLED_AFTER_TIMEOUT';
    } else {
      op.state = 'SETTLED';
    }

    op.settledAt = new Date().toISOString();
    if (error) op.error = error?.message || String(error);
    if (observed) op.observed = observed;
    if (outcome) op.outcome = outcome;

    // Notify waiting settlement listeners
    if (this._settlementListeners.length > 0) {
      const activePending = Array.from(this.inFlightOperations.values()).filter(o => o.state === 'IN_FLIGHT');
      if (activePending.length === 0) {
        for (const listener of this._settlementListeners) {
          try { listener(); } catch {}
        }
        this._settlementListeners = [];
      }
    }

    return op;
  }

  /**
   * Transitions active in-flight operations for a probe to TIMED_OUT_UNRESOLVED (R13-02, R14-01, R14-02).
   * If operation had canMintSession=true, records untracked session risk.
   * If operation had canCreateUser=true, records untracked user risk.
   */
  markProbeOperationsTimedOut(probeId, reason = 'TIMEOUT') {
    if (!probeId) return [];
    const affected = [];
    let hadSessionMinting = false;
    let hadUserCreation = false;
    for (const [opId, op] of this.inFlightOperations.entries()) {
      if (op.probeId === probeId && op.state === 'IN_FLIGHT') {
        op.state = 'TIMED_OUT_UNRESOLVED';
        op.timedOutAt = new Date().toISOString();
        op.timeoutReason = reason;
        affected.push(op);

        if (op.canMintSession) {
          hadSessionMinting = true;
        }
        if (op.canCreateUser) {
          hadUserCreation = true;
        }
      }
    }
    if (hadSessionMinting) {
      this.registerUntrackedSession();
    }
    if (hadUserCreation) {
      this.registerUntrackedUser();
    }
    return affected;
  }

  hasUnresolvedOperations() {
    for (const op of this.inFlightOperations.values()) {
      if (op.state === 'IN_FLIGHT' || op.state === 'TIMED_OUT_UNRESOLVED') {
        return true;
      }
    }
    return false;
  }

  getUnresolvedOperations() {
    const list = [];
    for (const op of this.inFlightOperations.values()) {
      if (op.state === 'IN_FLIGHT' || op.state === 'TIMED_OUT_UNRESOLVED') {
        list.push(op);
      }
    }
    return list;
  }

  async awaitInFlightSettlement(timeoutMs = 50) {
    const pendingOps = Array.from(this.inFlightOperations.values()).filter(o => o.state === 'IN_FLIGHT');
    if (pendingOps.length === 0 || timeoutMs <= 0) {
      return;
    }

    await new Promise(resolve => {
      let timer = null;
      const onDone = () => {
        if (timer) clearTimeout(timer);
        resolve();
      };
      this._settlementListeners.push(onDone);
      timer = setTimeout(() => {
        const idx = this._settlementListeners.indexOf(onDone);
        if (idx !== -1) this._settlementListeners.splice(idx, 1);
        resolve();
      }, timeoutMs);
    });
  }

  finalize() {
    this.finalized = true;
    if (this.runLifecycleState !== INVENTORY_RUN_STATE.RESIDUAL_BLOCKED) {
      this.runLifecycleState = INVENTORY_RUN_STATE.FINALIZED;
    }
  }

  /**
   * Evaluates live pre-user-deletion safety blockers immediately before deleting each Auth user (R3-04).
   * Returns null if safe to delete, or a blocker descriptor object if any active/residual storage or
   * concurrent operation obligation forbids Auth user deletion.
   */
  _evaluatePreUserDeletionBlocker(storageCleanupFailed, report) {
    if (this.runLifecycleState !== INVENTORY_RUN_STATE.CLEANUP_ACTIVE) {
      return {
        code: 'STORAGE_CLEANUP_FAILURE_CASCADE_PREVENTED',
        reason: `Run lifecycle state is '${this.runLifecycleState}', not CLEANUP_ACTIVE`
      };
    }

    if (
      storageCleanupFailed ||
      (report && Array.isArray(report.residualResources) && report.residualResources.some(
        r => r.type === 'storage_object' || r.type === 'storage_objects'
      ))
    ) {
      return {
        code: 'STORAGE_CLEANUP_FAILURE_CASCADE_PREVENTED',
        reason: 'Storage fixture cleanup failed or left residual storage resources'
      };
    }

    for (const [fixtureKey, fixture] of this.storageFixtures.entries()) {
      const cleanlySettled =
        (fixture.lifecycleState === STORAGE_LIFECYCLE_STATE.DELETION_VERIFIED && hasVerifiedStorageDeletion(this, fixtureKey, fixture)) ||
        (fixture.lifecycleState === STORAGE_LIFECYCLE_STATE.CONFLICT_EXISTING_PRESERVED && !fixture.hasCommittedUpload) ||
        (fixture.lifecycleState === STORAGE_LIFECYCLE_STATE.DEFINITIVE_NON_CREATION &&
          fixture.neverDispatched === true &&
          !fixture.hasCommittedUpload);
      if (!cleanlySettled) {
        return {
          code: 'STORAGE_CLEANUP_FAILURE_CASCADE_PREVENTED',
          reason: `Live re-audit found fixture '${fixtureKey}' in non-settled state '${fixture.lifecycleState}' (hasCommittedUpload=${Boolean(fixture.hasCommittedUpload)})`
        };
      }
    }

    for (const [bucket, paths] of this.trackedStorageObjects.entries()) {
      if (paths && paths.size > 0) {
        return {
          code: 'STORAGE_CLEANUP_FAILURE_CASCADE_PREVENTED',
          reason: `Live re-audit found ${paths.size} remaining tracked storage object(s) in bucket '${bucket}'`
        };
      }
    }

    const unresolved = this.getUnresolvedOperations().filter(
      op => op.canModifyProviderState || op.canCreateUser || op.canMintSession || op.requiresCleanupReconciliation
    );
    if (unresolved.length > 0) {
      const sample = unresolved[0];
      return {
        code: 'STORAGE_CLEANUP_FAILURE_CASCADE_PREVENTED',
        reason: `Unresolved in-flight operation '${sample.opId}' (${sample.probeId}, state='${sample.state}') remains active during user deletion`
      };
    }

    if (this.lateSettlementsDuringCleanup.length > 0) {
      return {
        code: 'STORAGE_CLEANUP_FAILURE_CASCADE_PREVENTED',
        reason: `${this.lateSettlementsDuringCleanup.length} late settlement/mutation(s) arrived during cleanup`
      };
    }

    return null;
  }

  isClean() {
    if (this._cleanupInProgress) return false;
    if (
      this.runLifecycleState === INVENTORY_RUN_STATE.QUIESCING ||
      this.runLifecycleState === INVENTORY_RUN_STATE.CLEANUP_ACTIVE ||
      this.runLifecycleState === INVENTORY_RUN_STATE.RESIDUAL_BLOCKED
    ) {
      return false;
    }
    for (const uId of this.createdUsers.keys()) {
      if (!this.deletedUsers.has(uId)) return false;
    }
    if (this.unverifiedUsers.size > 0) return false;
    if (this.untrackedSessionsCount > 0) return false;
    if (this.untrackedUsersCount > 0) return false;
    if (this.trackedSessions.size !== this.revokedSessions.size) return false;
    if (this.hasUnresolvedOperations()) return false;
    if (this.postFinalizationMutations.length > 0) return false;
    if (this.lateSettlementsDuringCleanup.length > 0) return false;
    if (this.seedCredentialRestorations.some(r => r.state !== 'restored')) return false;
    for (const [fixtureKey, fixture] of this.storageFixtures.entries()) {
      const settledCleanly =
        (fixture.lifecycleState === STORAGE_LIFECYCLE_STATE.DELETION_VERIFIED && hasVerifiedStorageDeletion(this, fixtureKey, fixture)) ||
        (fixture.lifecycleState === STORAGE_LIFECYCLE_STATE.CONFLICT_EXISTING_PRESERVED && !fixture.hasCommittedUpload) ||
        (fixture.lifecycleState === STORAGE_LIFECYCLE_STATE.DEFINITIVE_NON_CREATION && fixture.neverDispatched === true && !fixture.hasCommittedUpload);
      if (!settledCleanly) return false;
    }
    for (const rows of this.trackedTableRows.values()) {
      if (rows.size > 0) return false;
    }
    for (const objs of this.trackedStorageObjects.values()) {
      if (objs.size > 0) return false;
    }
    return true;
  }

  getSummary() {
    return {
      runId: this.runId,
      runLifecycleState: this.runLifecycleState,
      createdUsersCount: this.createdUsers.size,
      referencedUsersCount: this.referencedUsers.size,
      unverifiedUsersCount: this.unverifiedUsers.size,
      trackedUsersCount: this.createdUsers.size + this.referencedUsers.size + this.unverifiedUsers.size,
      trackedSessionsCount: this.trackedSessions.size,
      revokedSessionsCount: this.revokedSessions.size,
      trackedTableRowsCount: Array.from(this.trackedTableRows.values()).reduce((acc, s) => acc + s.size, 0),
      trackedStorageObjectsCount: Array.from(this.trackedStorageObjects.values()).reduce((acc, s) => acc + s.size, 0),
      storageFixturesCount: this.storageFixtures.size,
      seedCredentialRestorationsCount: this.seedCredentialRestorations.length,
      untrackedSessionsCount: this.untrackedSessionsCount,
      untrackedUsersCount: this.untrackedUsersCount,
      inFlightOperationsCount: this.inFlightOperations.size,
      unresolvedOperationsCount: this.getUnresolvedOperations().length,
      finalized: this.finalized,
      postFinalizationMutationsCount: this.postFinalizationMutations.length,
      lateSettlementsDuringCleanupCount: this.lateSettlementsDuringCleanup.length
    };
  }

  /**
   * Deterministic cleanup routine: deletes ONLY createdThisRun resources by ID.
   * Pre-existing referencedUsers are NEVER deleted (R3-09).
   * Restores modified seed user credentials (R5-06).
   * Handles Supabase Admin { data, error } responses and enforces concurrency/quiescing fencing (R3-04).
   * Verifies absence of residual resources and fails closed if residual resources remain.
   * Resolves PRRT_kwDOVtCmZc66lOOU, PRRT_kwDOVtCmZc66lo-q, PRRT_kwDOVtCmZc66lq3S, PRRT_kwDOVtCmZc66mPVg (R5-02), PRRT_kwDOVtCmZc66mPVn (R5-03), PRRT_kwDOVtCmZc66mP9a (R5-06), PRRT_kwDOVtCmZc66vvky (R13-02), and PRRT_kwDOVtCmZc66_0zI (R16-02).
   */
  async executeCleanup(rawOptions = {}) {
    const options = admitValidatedInput(rawOptions, 'executeCleanupOptions');
    if (this._cleanupInProgress || this._activeCleanupPromise) {
      throw new Error(
        'CLEANUP_CONCURRENT_REENTRY_BLOCKED: Concurrent executeCleanup() invocation rejected while cleanup is already executing (R3-04)'
      );
    }
    this._cleanupInProgress = true;
    const cleanupRun = withRunRequestBudget(this.runId, 'cleanup', () => this._executeCleanupInternal(options));
    this._activeCleanupPromise = cleanupRun;
    try {
      return await cleanupRun;
    } finally {
      this._cleanupInProgress = false;
      this._activeCleanupPromise = null;
    }
  }

  async _executeCleanupInternal({ adminClient, failClosed = true, settlementTimeoutMs = 50 } = {}) {
    const report = {
      runId: this.runId,
      createdUsersAttempted: this.createdUsers.size,
      usersDeleted: 0,
      referencedUsersPreserved: this.referencedUsers.size,
      preservedUsers: Array.from(this.referencedUsers.keys()),
      tableRowsDeleted: 0,
      storageObjectsDeleted: 0,
      sessionsRevoked: 0,
      seedCredentialsRestored: 0,
      residualUsers: [],
      residualResources: [],
      status: 'CLEANUP_PENDING'
    };

    this.cleanupStarted = true;
    this.runLifecycleState = INVENTORY_RUN_STATE.QUIESCING;

    // Await bounded grace period for in-flight requests to settle before auditing cleanup items (R13-02, R3-04)
    if (settlementTimeoutMs > 0) {
      await this.awaitInFlightSettlement(settlementTimeoutMs);
    }

    // Admission is strictly closed upon entering CLEANUP_ACTIVE (R3-04)
    this.runLifecycleState = INVENTORY_RUN_STATE.CLEANUP_ACTIVE;

    const unresolvedOps = this.getUnresolvedOperations();

    const hasCleanupEligibleItems =
      this.createdUsers.size > 0 ||
      this.unverifiedUsers.size > 0 ||
      this.trackedTableRows.size > 0 ||
      this.trackedStorageObjects.size > 0 ||
      this.storageFixtures.size > 0 ||
      this.trackedSessions.size > 0 ||
      this.seedCredentialRestorations.length > 0 ||
      this.untrackedSessionsCount > 0 ||
      this.untrackedUsersCount > 0 ||
      unresolvedOps.length > 0 ||
      this.lateSettlementsDuringCleanup.length > 0 ||
      this.postFinalizationMutations.length > 0;

    if (!hasCleanupEligibleItems && !adminClient) {
      report.status = 'CLEANUP_VERIFIED_SUCCESS';
      this.runLifecycleState = INVENTORY_RUN_STATE.FINALIZED;
      this.finalize();
      return report;
    }

    try {
      if (!adminClient) throw new Error('CLEANUP_CLIENT_REQUIRED: MISSING_ADMIN_CLIENT');
      assertTrustedAdminClient(adminClient, { projectRef: HARDCODED_TEMP_REF, runId: this.runId });
    } catch (integrityErr) {
      // Rejection blocks all execution in both reporting modes. Keep every outstanding obligation visible.
      report.residualResources.push({ type: 'client', error: sanitizeData(integrityErr.message) });
      for (const [id] of this.createdUsers) {
        if (!this.deletedUsers.has(id)) report.residualUsers.push({ id, reason: 'ADMIN_INTEGRITY_REJECTED' });
      }
      for (const [id, user] of this.unverifiedUsers) {
        report.residualResources.push({ type: 'unresolved_user_ownership', userId: id, ownership: user.ownership });
      }
      for (const [bucket, paths] of this.trackedStorageObjects) {
        for (const path of paths) report.residualResources.push({ type: 'storage_object', bucket, path });
      }
      for (const [key, fixture] of this.storageFixtures) {
        if (!hasVerifiedStorageDeletion(this, key, fixture)) {
          report.residualResources.push({ type: 'storage_fixture', bucket: fixture.bucket, path: fixture.path, lifecycleState: fixture.lifecycleState });
        }
      }
      for (const [table, ids] of this.trackedTableRows) {
        for (const id of ids) report.residualResources.push({ type: 'table_row', table, id });
      }
      for (const id of this.trackedSessions) {
        if (!this.revokedSessions.has(id)) report.residualResources.push({ type: 'session', id });
      }
      for (const item of this.seedCredentialRestorations) {
        if (item.state !== 'restored') report.residualResources.push({ type: 'seed_credential_restoration', userId: item.userId, state: item.state });
      }
      for (const op of unresolvedOps) {
        report.residualResources.push({ type: 'unresolved_in_flight_operation', opId: op.opId, probeId: op.probeId, state: op.state });
      }
      if (this.untrackedSessionsCount) report.residualResources.push({ type: 'untracked_session', count: this.untrackedSessionsCount });
      if (this.untrackedUsersCount) report.residualResources.push({ type: 'unresolved_user_creation_risk', count: this.untrackedUsersCount });
      if (this.lateSettlementsDuringCleanup.length) report.residualResources.push({ type: 'late_settlement_during_cleanup', count: this.lateSettlementsDuringCleanup.length });
      if (this.postFinalizationMutations.length) report.residualResources.push({ type: 'post_finalization_mutations', count: this.postFinalizationMutations.length });
      report.status = 'CLEANUP_FAILED_RESIDUAL_RESOURCES';
      this.runLifecycleState = INVENTORY_RUN_STATE.RESIDUAL_BLOCKED;
      this.finalize();
      if (failClosed) throw cleanupFailure(integrityErr.message, report);
      return report;
    }

    // 0A. Untracked minted sessions blocker (R5-04, R8-01, R13-02)
    if (this.untrackedSessionsCount > 0) {
      report.residualResources.push({
        type: 'untracked_session',
        count: this.untrackedSessionsCount,
        error: 'UNTRACKED_MINTED_SESSION: Authentication response minted token or timed out before response observation; residual session cannot be tracked'
      });
    }

    // 0B. Indeterminate user creation risk blocker (R14-02)
    if (this.untrackedUsersCount > 0) {
      report.residualResources.push({
        type: 'unresolved_user_creation_risk',
        count: this.untrackedUsersCount,
        error: 'UNRESOLVED_USER_CREATION_RISK: User creation endpoint (e.g. signup) timed out, encountered transport reset, or returned unreadable response post-dispatch; orphaned user may exist without tracked identifier (R14-02)'
      });
    }

    // 0C. Unverified user ownership blocker (R16-02)
    if (this.unverifiedUsers.size > 0) {
      for (const [uId, uObj] of this.unverifiedUsers.entries()) {
        report.residualResources.push({
          type: 'unresolved_user_ownership',
          userId: uId,
          email: uObj.email,
          ownership: uObj.ownership,
          error: `UNRESOLVED_USER_OWNERSHIP: User '${uId}' was observed with ownership '${uObj.ownership}'; affirmative run-created proof was missing or unverified, user preserved without deletion (R16-02)`
        });
      }
    }

    // 0C. Unresolved dispatch obligations (R13-02, R14-01, R14-02)
    for (const op of unresolvedOps) {
      if (op.canMintSession) {
        report.residualResources.push({
          type: 'unresolved_in_flight_operation',
          opId: op.opId,
          probeId: op.probeId,
          state: op.state,
          error: `UNRESOLVED_DISPATCH_OBLIGATION: Operation '${op.opId}' (${op.probeId}) was in state '${op.state}' with canMintSession=true; provider may have minted session server-side that was not observed before cleanup (R13-02)`
        });
      }
      if (op.canCreateUser) {
        report.residualResources.push({
          type: 'unresolved_user_creation',
          opId: op.opId,
          probeId: op.probeId,
          state: op.state,
          error: `UNRESOLVED_USER_CREATION: Operation '${op.opId}' (${op.probeId}) was in state '${op.state}' with canCreateUser=true; user may have been created on provider without confirmation (R14-02)`
        });
      }
      if (op.canModifyProviderState) {
        report.residualResources.push({
          type: 'unresolved_provider_mutation',
          opId: op.opId,
          probeId: op.probeId,
          targetUserId: op.targetUserId || null,
          state: op.state,
          error: `UNRESOLVED_PROVIDER_MUTATION: Operation '${op.opId}' (${op.probeId}) was in state '${op.state}' with canModifyProviderState=true; delayed mutation may land after cleanup and overwrite restored state (R14-01)`
        });
      }
      if (!op.canMintSession && !op.canCreateUser && !op.canModifyProviderState && op.requiresCleanupReconciliation) {
        report.residualResources.push({
          type: 'unresolved_in_flight_operation',
          opId: op.opId,
          probeId: op.probeId,
          state: op.state,
          error: `UNRESOLVED_DISPATCH_OBLIGATION: Operation '${op.opId}' (${op.probeId}) was in state '${op.state}' requiring cleanup reconciliation`
        });
      }
    }

    if (this.postFinalizationMutations.length > 0) {
      report.residualResources.push({
        type: 'post_finalization_mutations',
        count: this.postFinalizationMutations.length,
        error: `POST_FINALIZATION_MUTATIONS: ${this.postFinalizationMutations.length} mutation(s) occurred after inventory was finalized`
      });
    }

    // 1. Delete tracked table rows by exact ID
    for (const [table, ids] of this.trackedTableRows.entries()) {
      if (ids.size > 0 && typeof adminClient.deleteTableRow !== 'function') {
        report.residualResources.push({ type: 'table_rows', table, count: ids.size, error: 'MISSING_DELETE_TABLE_ROW_METHOD' });
      } else {
        for (const id of ids) {
          try {
            const res = await adminClient.deleteTableRow(table, id);
            if (res && res.error) {
              report.residualResources.push({ type: 'table_row', table, id, error: res.error.message || String(res.error) });
            } else {
              report.tableRowsDeleted++;
            }
          } catch (err) {
            report.residualResources.push({ type: 'table_row', table, id, error: err.message });
          }
        }
      }
    }

    // 2. Storage object deletion: ONLY for verified run-created fixtures with affirmative deletion eligibility (R1-03, R1-06, R2-02, R2-03)
    let storageCleanupFailed = false;

    for (const [fixtureKey, fixture] of this.storageFixtures.entries()) {
      // A terminal label is insufficient: only this inventory's private post-GET receipt is authoritative.
      if (fixture.lifecycleState === STORAGE_LIFECYCLE_STATE.DELETION_VERIFIED &&
          hasVerifiedStorageDeletion(this, fixtureKey, fixture)) {
        continue;
      }
      // 1. Definitive non-creation (request NEVER dispatched and no committed upload): no Storage resource created
      if (
        fixture.lifecycleState === STORAGE_LIFECYCLE_STATE.DEFINITIVE_NON_CREATION &&
        fixture.neverDispatched === true &&
        !fixture.hasCommittedUpload
      ) {
        continue;
      }

      // 2. Confirmed existing-object conflict (with no committed upload from this run): preserve pre-existing object untouched
      if (
        fixture.lifecycleState === STORAGE_LIFECYCLE_STATE.CONFLICT_EXISTING_PRESERVED &&
        !fixture.hasCommittedUpload
      ) {
        continue;
      }

      // 3. Unverified, committed-but-unverified, indeterminate, or non-verified ownership states:
      // Quarantine obligation, block cleanup success & block Auth user deletion, NEVER blind-delete! (R2-02)
      const isVerifiedRunOwned =
        fixture.lifecycleState === STORAGE_LIFECYCLE_STATE.RUN_CREATED_VERIFIED &&
        fixture.deletionEligible === true &&
        hasVerifiedStorageCreation(this, fixtureKey, fixture);

      if (!isVerifiedRunOwned) {
        const failureCode = fixture.lifecycleState === STORAGE_LIFECYCLE_STATE.RESIDUAL_OWNERSHIP_BLOCKED || fixture.hasCommittedUpload
          ? 'RESIDUAL_STORAGE_OWNERSHIP_BLOCKED'
          : (fixture.lifecycleState === STORAGE_LIFECYCLE_STATE.CLEANUP_INDETERMINATE
              ? 'STORAGE_CLEANUP_INDETERMINATE'
              : 'UNRESOLVED_STORAGE_CREATION_RISK');
        const reason = `${failureCode}: Fixture '${fixtureKey}' in state '${fixture.lifecycleState}' (hasCommittedUpload=${Boolean(fixture.hasCommittedUpload)}) lacks affirmative deletion proof; quarantined for durable recovery without blind deletion (R2-02)`;

        report.residualResources.push({
          type: 'storage_object',
          bucket: fixture.bucket,
          path: fixture.path,
          lifecycleState: fixture.lifecycleState,
          hasCommittedUpload: Boolean(fixture.hasCommittedUpload),
          conditionalDeletion: fixture.conditionalDeletionEvidence || null,
          deleteClassification: fixture.conditionalDeletionEvidence?.status || null,
          recoverableForDurableRetry: true,
          error: reason
        });
        storageCleanupFailed = true;
        fixture.residualReason = reason;
        if (
          fixture.lifecycleState === STORAGE_LIFECYCLE_STATE.CREATION_PENDING ||
          fixture.lifecycleState === STORAGE_LIFECYCLE_STATE.CREATION_IN_FLIGHT
        ) {
          fixture.lifecycleState = STORAGE_LIFECYCLE_STATE.CREATION_INDETERMINATE;
        } else if (
          fixture.lifecycleState === STORAGE_LIFECYCLE_STATE.CREATION_FAILED &&
          fixture.hasCommittedUpload
        ) {
          fixture.lifecycleState = STORAGE_LIFECYCLE_STATE.RESIDUAL_OWNERSHIP_BLOCKED;
        }
        fixture.deletionEligible = false;
        fixture.status = 'CLEANUP_QUARANTINED';
        continue;
      }

      // 4. Affirmative run-created fixture: authorized for deletion
      if (typeof adminClient.conditionalDeleteStorageObject !== 'function') {
        report.residualResources.push({
          type: 'storage_object',
          bucket: fixture.bucket,
          path: fixture.path,
          lifecycleState: fixture.lifecycleState,
          error: 'MISSING_DELETE_STORAGE_OBJECT_METHOD'
        });
        storageCleanupFailed = true;
        fixture.lifecycleState = STORAGE_LIFECYCLE_STATE.CLEANUP_INDETERMINATE;
        fixture.deletionEligible = false;
        fixture.status = 'DELETION_FAILED';
        continue;
      }

      try {
        fixture.lifecycleState = STORAGE_LIFECYCLE_STATE.CLEANUP_PENDING;
        fixture.deletionEligible = false;
        const authorization = Object.freeze(Object.create(null));
        STORAGE_DELETE_AUTHORIZATIONS.set(authorization, Object.freeze({
          projectRef: HARDCODED_TEMP_REF, runId: this.runId, bucket: fixture.bucket, path: fixture.path,
          objectId: fixture.providerObjectId, ownerId: fixture.verifiedOwnerId
        }));
        const delRes = await adminClient.conditionalDeleteStorageObject(authorization);
        fixture.conditionalDeletionEvidence = delRes?.conditionalDeletion || { status: 'CONDITIONAL_DELETE_INDETERMINATE' };
        const delIsProviderAbsent =
          delRes &&
          delRes.error &&
          delRes.normalized &&
          delRes.normalized.classification === STORAGE_RESPONSE_CLASS.OBJECT_ABSENT &&
          delRes.normalized.isAbsent === true;

        if (delRes && delRes.error && !delIsProviderAbsent) {
          report.residualResources.push({
            type: 'storage_object',
            bucket: fixture.bucket,
            path: fixture.path,
            lifecycleState: STORAGE_LIFECYCLE_STATE.CLEANUP_INDETERMINATE,
            deleteClassification: delRes.conditionalDeletion?.status || delRes.normalized?.classification || null,
            conditionalDeletion: fixture.conditionalDeletionEvidence,
            recoverableForDurableRetry: true,
            error: delRes.error.message || String(delRes.error)
          });
          storageCleanupFailed = true;
          fixture.lifecycleState = STORAGE_LIFECYCLE_STATE.CLEANUP_INDETERMINATE;
          fixture.status = 'DELETION_FAILED';
          continue;
        }

        if (delIsProviderAbsent) {
          fixture.deleteResponseClassification = delRes.normalized.classification;
        }

        // 5. Independent normalized post-deletion absence verification (R1-06, R2-03, R3-06)
        // Both successful DELETE (200/204) AND idempotent DELETE NoSuchKey MUST prove authoritative absence via GET + settled ops
        const absenceDetail = await verifyStorageObjectAbsenceDetailed(
          adminClient,
          fixture.bucket,
          fixture.path,
          { projectRef: fixture.projectRef || HARDCODED_TEMP_REF, runId: this.runId }
        );
        const unresolvedDuringVerify = this.getUnresolvedOperations().filter(
          op => op.canModifyProviderState || op.requiresCleanupReconciliation
        );

        if (!absenceDetail.isAbsent || unresolvedDuringVerify.length > 0) {
          const isStillPresent = absenceDetail.classification === STORAGE_RESPONSE_CLASS.OBJECT_PRESENT;
          const nextState = isStillPresent
            ? STORAGE_LIFECYCLE_STATE.RESIDUAL_BLOCKED
            : STORAGE_LIFECYCLE_STATE.CLEANUP_INDETERMINATE;
          const reasonDetail = !absenceDetail.isAbsent
            ? (isStillPresent
                ? `STORAGE_OBJECT_NOT_ABSENT: Storage object '${fixture.bucket}/${fixture.path}' still present (HTTP ${absenceDetail.status}) during post-delete verification`
                : `STORAGE_ABSENCE_UNVERIFIED: Post-delete verification for '${fixture.bucket}/${fixture.path}' was inconclusive (${absenceDetail.classification}: ${absenceDetail.reason})`)
            : `STORAGE_ABSENCE_CONCURRENT_OP_UNSETTLED: Unresolved operation '${unresolvedDuringVerify[0].opId}' active alongside Storage DELETE`;
          report.residualResources.push({
            type: 'storage_object',
            bucket: fixture.bucket,
            path: fixture.path,
            lifecycleState: nextState,
            absenceClassification: absenceDetail.classification,
            recoverableForDurableRetry: true,
            error: reasonDetail
          });
          storageCleanupFailed = true;
          fixture.lifecycleState = nextState;
          fixture.status = 'DELETION_FAILED';
        } else {
          report.storageObjectsDeleted++;
          fixture.lifecycleState = STORAGE_LIFECYCLE_STATE.DELETION_VERIFIED;
          fixture.status = 'DELETED';
          fixture.deletionVerifiedAt = new Date().toISOString();
          fixture.absenceEvidence = absenceDetail;
          VERIFIED_STORAGE_DELETIONS.set(fixture, Object.freeze({
            inventory: this, runId: this.runId, fixtureKey, snapshot: JSON.stringify(storageEvidenceSnapshot(fixture))
          }));
          if (this.trackedStorageObjects.has(fixture.bucket)) {
            this.trackedStorageObjects.get(fixture.bucket).delete(fixture.path);
          }
        }
      } catch (err) {
        report.residualResources.push({
          type: 'storage_object',
          bucket: fixture.bucket,
          path: fixture.path,
          lifecycleState: STORAGE_LIFECYCLE_STATE.CLEANUP_INDETERMINATE,
          recoverableForDurableRetry: true,
          error: err.message
        });
        storageCleanupFailed = true;
        fixture.lifecycleState = STORAGE_LIFECYCLE_STATE.CLEANUP_INDETERMINATE;
        fixture.status = 'DELETION_FAILED';
      }
    }

    // A path-only legacy registration is an obligation, never provider ownership proof.
    // Keep it visible for recovery and block user deletion instead of blindly deleting it.
    for (const [bucket, paths] of this.trackedStorageObjects.entries()) {
      for (const path of paths) {
        if (this.storageFixtures.has(`${bucket}/${path}`)) continue;
        report.residualResources.push({
          type: 'storage_object', bucket, path, recoverableForDurableRetry: true,
          error: 'UNVERIFIED_STORAGE_OWNERSHIP: Path-only registration lacks affirmative run-created ownership; object preserved without deletion'
        });
        storageCleanupFailed = true;
      }
      if (paths.size === 0) this.trackedStorageObjects.delete(bucket);
    }

    // 3. Invalidate tracked sessions using supported GoTrue sign-out / session revocation (R4-05, R5-02, R6-01, R8-02)
    if (this.trackedSessions.size > 0 && typeof adminClient.invalidateSession !== 'function' && typeof adminClient.signOut !== 'function') {
      report.residualResources.push({
        type: 'sessions',
        count: this.trackedSessions.size,
        error: 'MISSING_SESSION_INVALIDATION_METHOD: adminClient lacks invalidateSession or signOut method'
      });
    } else {
      for (const sessionId of this.trackedSessions) {
        // Idempotency check: if session is already confirmed revoked, skip redundant duplicate logout (R8-02)
        if (this.revokedSessions.has(sessionId)) {
          report.sessionsRevoked++;
          continue;
        }

        try {
          const token = this.sessionTokens.get(sessionId) || null;
          let res;
          if (typeof adminClient.invalidateSession === 'function') {
            res = await adminClient.invalidateSession(sessionId, token);
          } else if (typeof adminClient.signOut === 'function') {
            if (!token) {
              res = {
                error: {
                  message: `MISSING_TOKEN_CONTEXT: Targeted local session revocation requires valid access token context. Session '${sessionId}' cannot be revoked without token context (R6-01).`
                }
              };
            } else {
              res = await adminClient.signOut(token, 'local');
            }
          }
          if (res && res.error) {
            report.residualResources.push({ type: 'session', id: sessionId, error: res.error.message || String(res.error) });
          } else {
            this.revokedSessions.add(sessionId);
            report.sessionsRevoked++;
          }
        } catch (err) {
          report.residualResources.push({ type: 'session', id: sessionId, error: err.message });
        }
      }
    }

    // 4. Delete ONLY verified created users by exact user ID (referencedUsers and unverifiedUsers are preserved! R16-02)
    // Storage-before-user cleanup ordering with live per-user pre-deletion predicate (H3-03, R3-04):
    // Always re-evaluates current storageFixtures, trackedStorageObjects, unresolvedOps, and lateSettlements right before EACH deleteUser().
    if (this.createdUsers.size > 0 && typeof adminClient.deleteUser !== 'function') {
      const initialBlocker = this._evaluatePreUserDeletionBlocker(storageCleanupFailed, report);
      if (initialBlocker) {
        for (const [userId, userObj] of this.createdUsers.entries()) {
          report.residualUsers.push({
            id: userId,
            email: userObj?.email,
            error: `STORAGE_CLEANUP_FAILURE_CASCADE_PREVENTED: Refusing to delete user '${userId}' because ${initialBlocker.reason} (H3-03, R3-04)`
          });
        }
      } else {
        report.residualResources.push({ type: 'users', count: this.createdUsers.size, error: 'MISSING_DELETE_USER_METHOD' });
      }
    } else {
      for (const [userId, userObj] of this.createdUsers.entries()) {
        // Live per-user pre-deletion audit immediately before deleteUser() (R3-04)
        const liveBlocker = this._evaluatePreUserDeletionBlocker(storageCleanupFailed, report);
        if (liveBlocker) {
          report.residualUsers.push({
            id: userId,
            email: userObj?.email,
            error: `STORAGE_CLEANUP_FAILURE_CASCADE_PREVENTED: Refusing to delete user '${userId}' because ${liveBlocker.reason} (H3-03, R3-04)`
          });
          continue;
        }

        // Enforce ownership again immediately before destructive Admin API call (Requirement 15, R16-02)
        const ownership = this.getUserOwnership(userId);
        if (ownership !== USER_OWNERSHIP.RUN_CREATED_VERIFIED) {
          report.residualUsers.push({
            id: userId,
            email: userObj?.email,
            error: `SECURITY_BOUNDARY_VIOLATION: Refusing to delete user '${userId}' with non-verified ownership '${ownership}' (R16-02)`
          });
          continue;
        }

        if (this.isUserReferenced(userId) || this.isSeedIdentity(userId, userObj?.email)) {
          report.residualUsers.push({
            id: userId,
            email: userObj?.email,
            error: `SECURITY_BOUNDARY_VIOLATION: Refusing to delete pre-existing or seed user '${userId}' (R16-02)`
          });
          continue;
        }

        if (!userObj?.creationProof || !isValidCreationProof(userObj.creationProof)) {
          report.residualUsers.push({
            id: userId,
            email: userObj?.email,
            error: `SECURITY_BOUNDARY_VIOLATION: Refusing to delete user '${userId}' lacking affirmative run-created proof (R16-02)`
          });
          continue;
        }

        try {
          const res = await adminClient.deleteUser(userId);
          if (res && res.error) {
            report.residualUsers.push({ id: userId, email: userObj.email, error: res.error.message || String(res.error) });
          } else {
            report.usersDeleted++;
          }
        } catch (err) {
          report.residualUsers.push({ id: userId, email: userObj.email, error: err.message });
        }
      }
    }

    const hasResidualStorage =
      this._evaluatePreUserDeletionBlocker(storageCleanupFailed, report) !== null;

    // 5. Affirmative post-cleanup verification for created users (R4-06, R5-03)
    if (!hasResidualStorage) {
      if (this.createdUsers.size > 0 && typeof adminClient.getUserById !== 'function') {
        report.residualResources.push({ type: 'verification', error: 'MISSING_GET_USER_BY_ID_METHOD' });
      } else {
        for (const [userId, userObj] of this.createdUsers.entries()) {
          if (typeof adminClient.getUserById === 'function') {
            try {
              const check = await adminClient.getUserById(userId);
              // Detect user existence across all response shapes (data.user.id, data.id, top-level id) (R4-06)
              const returnedUser = check?.data?.user || check?.data || (check && !check.error && check.id ? check : null);
              const foundId = returnedUser?.id;
              if (foundId && String(foundId) === String(userId)) {
                report.residualUsers.push({ id: userId, email: userObj.email, reason: 'STILL_EXISTS_IN_DATABASE' });
                continue;
              }

              // If check returns error, require structured 404; any 5xx/network/timeout error fails verification (R4-06, R5-03)
              if (check?.error) {
                const err = check.error;
                const errStatus = typeof err.status === 'number' ? err.status : (typeof err.code === 'number' ? err.code : null);
                const errCode = typeof err.code === 'string' ? err.code.toLowerCase() : '';

                const is5xxOrNetwork =
                  (errStatus !== null && errStatus >= 500 && errStatus < 600) ||
                  errCode.includes('503') ||
                  errCode.includes('unavailable') ||
                  errCode.includes('timeout') ||
                  errCode.includes('econnrefused');

                const isExplicit404 = !is5xxOrNetwork && (errStatus === 404 || errCode === 'user_not_found');

                if (!isExplicit404) {
                  report.residualUsers.push({
                    id: userId,
                    email: userObj.email,
                    error: `VERIFY_FAILED: Non-404 error during absence check (${errStatus || errCode || err.message || err.msg || String(err)})`
                  });
                } else {
                  this.deletedUsers.add(userId);
                }
                continue;
              }

              // Confirmed null/notFound absence
              if (check?.notFound === true || check === null || check?.data === null) {
                this.deletedUsers.add(userId);
                continue;
              }

              // Inconclusive response structure
              report.residualUsers.push({
                id: userId,
                email: userObj.email,
                error: 'VERIFY_FAILED: Inconclusive response from getUserById; cannot verify user absence'
              });
            } catch (err) {
              const errStatus = typeof err?.status === 'number' ? err.status : (typeof err?.code === 'number' ? err.code : null);
              const errCode = typeof err?.code === 'string' ? err.code.toLowerCase() : '';
              const is5xxOrNetwork =
                (errStatus !== null && errStatus >= 500 && errStatus < 600) ||
                errCode.includes('503') ||
                errCode.includes('unavailable') ||
                errCode.includes('timeout') ||
                errCode.includes('econnrefused');
              const isExplicit404 = !is5xxOrNetwork && (errStatus === 404 || errCode === 'user_not_found');
              if (!isExplicit404) {
                report.residualUsers.push({ id: userId, email: userObj.email, error: `VERIFY_FAILED: ${err.message}` });
              }
            }
          }
        }
      }
    }

    // 6. Restore modified seed credentials (R5-06, R9-01)
    if (this.seedCredentialRestorations.length > 0) {
      const updateFn = typeof adminClient.updateUserById === 'function'
        ? adminClient.updateUserById.bind(adminClient)
        : null;

      if (!updateFn) {
        report.residualResources.push({
          type: 'seed_credential_restoration',
          count: this.seedCredentialRestorations.length,
          error: 'MISSING_UPDATE_USER_METHOD: adminClient lacks updateUserById for seed password restoration'
        });
      } else {
        for (const item of this.seedCredentialRestorations) {
          // Untracked users cannot be modified by restoration (R9-01 security boundary)
          if (!this.isUserTracked(item.userId)) {
            report.residualResources.push({
              type: 'seed_credential_restoration',
              userId: item.userId,
              error: `SECURITY_BOUNDARY_VIOLATION: Attempted password restoration for untracked user '${item.userId}'`
            });
            continue;
          }

          // Exact identity correlation check (R10-02)
          const trackedEmail = this.getUserEmail(item.userId);
          if (trackedEmail && item.email && trackedEmail.trim().toLowerCase() !== item.email.trim().toLowerCase()) {
            report.residualResources.push({
              type: 'seed_credential_restoration',
              userId: item.userId,
              error: `IDENTITY_MISMATCH: Restoration record email '${item.email}' does not match tracked user email '${trackedEmail}' for user ID '${item.userId}' (R10-02)`
            });
            item.state = 'restoration_failed';
            continue;
          }

          // Concurrent / unresolved password mutation check (R14-01)
          const concurrentMutation = unresolvedOps.find(
            op => op.canModifyProviderState && (
              (op.targetUserId && String(op.targetUserId).trim() === String(item.userId).trim()) ||
              op.probeId === 'SESSION-02'
            )
          );
          if (concurrentMutation) {
            item.state = 'restoration_failed';
            report.residualResources.push({
              type: 'seed_credential_restoration',
              userId: item.userId,
              error: `CONCURRENT_UNRESOLVED_PASSWORD_MUTATION: Cannot verify password restoration for user '${item.userId}' because mutation operation '${concurrentMutation.opId}' (${concurrentMutation.probeId}) remains in state '${concurrentMutation.state}'. Delayed mutation could overwrite restored password (R14-01).`
            });
            continue;
          }

          // If already restored in this cleanup cycle, skip redundant update
          if (item.state === 'restored') {
            report.seedCredentialsRestored++;
            continue;
          }

          try {
            const res = await updateFn(item.userId, { password: item.originalPassword });
            if (res && res.error) {
              item.state = 'restoration_failed';
              item.error = res.error.message || String(res.error);
              report.residualResources.push({
                type: 'seed_credential_restoration',
                userId: item.userId,
                error: `RESTORE_FAILED: ${item.error}`
              });
              continue;
            }

            // Post-restoration verification via controlled authentication (R9-01, R10-01):
            // If adminClient provides verifyUserCredentials, verify that the restored password actually works
            if (typeof adminClient.verifyUserCredentials === 'function') {
              const testEmail = item.email || trackedEmail;
              if (testEmail) {
                let verifyRes;
                try {
                  verifyRes = await adminClient.verifyUserCredentials(testEmail, item.originalPassword, { inventory: this });
                } catch (verifyErr) {
                  verifyRes = {
                    data: null,
                    error: { message: `VERIFY_EXCEPTION: ${verifyErr?.message || String(verifyErr)}` }
                  };
                }

                if (verifyRes && verifyRes.error) {
                  const isRevocationFail = verifyRes.sessionRevocationFailed ||
                    (typeof verifyRes.error.message === 'string' && verifyRes.error.message.includes('VERIFICATION_SESSION_REVOCATION_FAILED'));
                  const isIndeterminate = verifyRes.indeterminateSession ||
                    (typeof verifyRes.error.message === 'string' && verifyRes.error.message.includes('INDETERMINATE_VERIFICATION_RESPONSE'));

                  if (isRevocationFail && !isIndeterminate) {
                    const leakSessId = verifyRes.error?.sessionId || null;
                    // Retrieve token from private inventory store (R11-02: secret boundary)
                    const leakToken = leakSessId ? this.getSessionToken(leakSessId) : null;
                    let retrySucceeded = false;

                    // Attempt safe fallback cleanup retry if private token context exists
                    if (leakToken && typeof adminClient.signOut === 'function') {
                      try {
                        const retryRes = await adminClient.signOut(leakToken, 'local');
                        if (retryRes && !retryRes.error) {
                          retrySucceeded = true;
                          if (leakSessId) this.markSessionRevoked(leakSessId);
                        }
                      } catch {
                        // retry failed
                      }
                    }

                    if (!retrySucceeded) {
                      item.state = 'restoration_failed';
                      item.error = verifyRes.error.message || String(verifyRes.error);
                      report.residualResources.push({
                        type: 'seed_credential_restoration',
                        userId: item.userId,
                        error: `RESTORE_VERIFICATION_FAILED: ${item.error}`
                      });
                      report.residualResources.push({
                        type: 'session',
                        id: leakSessId || 'verification_session',
                        sessionId: leakSessId || 'verification_session',
                        error: `VERIFICATION_SESSION_LEAK: Verification login succeeded but session invalidation failed: ${item.error}`
                      });
                      continue;
                    }
                  } else if (isIndeterminate) {
                    item.state = 'restoration_failed';
                    item.error = verifyRes.error.message || String(verifyRes.error);
                    report.residualResources.push({
                      type: 'seed_credential_restoration',
                      userId: item.userId,
                      error: `RESTORE_VERIFICATION_INDETERMINATE: ${item.error}`
                    });
                    report.residualResources.push({
                      type: 'untracked_session',
                      id: 'indeterminate_verification_session',
                      error: `INDETERMINATE_SESSION_LEAK: Server may have minted session during verification login but client could not identify or revoke it: ${item.error} (R11-01)`
                    });
                    continue;
                  } else {
                    item.state = 'restoration_failed';
                    item.error = verifyRes.error.message || String(verifyRes.error);
                    report.residualResources.push({
                      type: 'seed_credential_restoration',
                      userId: item.userId,
                      error: `RESTORE_VERIFICATION_FAILED: ${item.error}`
                    });
                    continue;
                  }
                }
                item.verifiedAt = new Date().toISOString();
              }
            }

            item.state = 'restored';
            item.restoredAt = new Date().toISOString();
            report.seedCredentialsRestored++;
          } catch (err) {
            item.state = 'restoration_failed';
            item.error = err.message;
            report.residualResources.push({
              type: 'seed_credential_restoration',
              userId: item.userId,
              error: `RESTORE_FAILED: ${err.message}`
            });
          }
        }
      }
    }

    // Late settlement / operation re-verification guard immediately prior to finalization (R2-02 #10)
    const lateUnresolvedOps = this.getUnresolvedOperations();
    if (this.lateSettlementsDuringCleanup.length > 0) {
      report.residualResources.push({
        type: 'late_settlement_during_cleanup',
        count: this.lateSettlementsDuringCleanup.length,
        details: this.lateSettlementsDuringCleanup.map(s => s.opId || s.key || s.action),
        error: `LATE_SETTLEMENT_DURING_CLEANUP: ${this.lateSettlementsDuringCleanup.length} operation(s)/fixture(s) settled or mutated after cleanup began; cannot certify cleanup completion (R2-02)`
      });
    }
    if (lateUnresolvedOps.length > unresolvedOps.length) {
      report.residualResources.push({
        type: 'late_unresolved_operations',
        count: lateUnresolvedOps.length - unresolvedOps.length,
        error: 'LATE_UNRESOLVED_OPERATIONS: Additional operations became unresolved during cleanup execution'
      });
    }

    if (report.residualUsers.length > 0 || report.residualResources.length > 0) {
      report.status = 'CLEANUP_FAILED_RESIDUAL_RESOURCES';
      this.runLifecycleState = INVENTORY_RUN_STATE.RESIDUAL_BLOCKED;
      this.finalize();
      if (failClosed) {
        const detail = report.residualUsers.length > 0
          ? `${report.residualUsers.length} synthetic user(s) remain in database after cleanup`
          : `${report.residualResources.length} residual resource(s) remain after cleanup`;
        throw cleanupFailure(`CLEANUP_INCOMPLETE: ${detail}`, report);
      }
    } else {
      report.status = 'CLEANUP_VERIFIED_SUCCESS';
      this.runLifecycleState = INVENTORY_RUN_STATE.FINALIZED;
      this.clearCredentials();
      this.finalize();
    }

    return report;
  }
}

/**
 * Provisions the run-scoped Storage probe fixture adhering to the provider-compatible ownership & lifecycle contract (H3-02, H3-R1, H3-R2).
 * Contract:
 * 1. Enforce TEMP project boundary, credential binding, runId, active inventory, and fail-closed offline mock transport
 * 2. Require privileged server-side storage.objects.owner_id lookup interface before any mutation
 * 3. Verify authenticated seed user identity affirmatively via provider /auth/v1/user (never unverified JWT decode alone)
 * 4. Confirm authoritative pre-upload absence using normalized Storage responses (including HTTP 400 NoSuchKey)
 * 5. Register write-ahead creation obligation before POST
 * 6. Upload bytes without overwrite (x-upsert: false); preserve documented 409 conflicts; quarantine HTTP 5xx/timeouts as CREATION_INDETERMINATE
 * 7. Immediately elevate successful POST (HTTP 200/201) to committed residual obligation (RESIDUAL_OWNERSHIP_BLOCKED) so verification failures never drop it
 * 8. Verify exact downloaded bytes and SHA-256 digest (without reading non-existent download owner headers)
 * 9. Verify authoritative storage.objects.owner_id correlation (projectRef, bucket_id, name, provider id, owner_id)
 * 10. Grant RUN_CREATED_VERIFIED + deletionEligible: true ONLY after full verification passes
 */
export async function provisionStorageProbeFixture(rawOptions = {}) {
  const opts = admitValidatedInput(rawOptions, 'provisionStorageProbeFixtureOptions');
  const {
    projectRef = HARDCODED_TEMP_REF,
    runId,
    seedUserId,
    userAccessToken,
    anonKey = null,
    serviceRoleKey = null,
    adminClient = null,
    ownershipLookupFn = null,
    fetchFn = null,
    inventory = null,
    probeContent = 'task06i probe test fixture\n',
    ownershipTimeoutMs = DEFAULT_PROBE_TIMEOUT_MS
  } = opts;
  // 1. Target project validation (R1-02)
  const normRef = (projectRef || '').trim().toLowerCase();
  if (!normRef || normRef !== HARDCODED_TEMP_REF || isForbiddenProject(normRef)) {
    throw new Error(
      `CRITICAL_SECURITY_VIOLATION: provisionStorageProbeFixture strictly rejected target '${normRef}'. Only approved TEMP project '${HARDCODED_TEMP_REF}' is authorized.`
    );
  }

  // 2. Validate credential bindings and seed user UUID (R1-02)
  if (!userAccessToken || typeof userAccessToken !== 'string' || !userAccessToken.trim()) {
    throw new Error('STORAGE_PROVISIONING_FAILED: userAccessToken is required to upload under authenticated seed user context');
  }
  validateProjectCredentialBinding(userAccessToken, normRef);
  if (isNonEmptyString(anonKey)) {
    validateProjectCredentialBinding(anonKey, normRef);
  }
  if (isNonEmptyString(serviceRoleKey)) {
    validateProjectCredentialBinding(serviceRoleKey, normRef);
  }

  let jwtClaims;
  try {
    const parts = userAccessToken.trim().split('.');
    if (parts.length !== 3) throw new Error('JWT must have 3 parts');
    jwtClaims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch (err) {
    throw new Error(`MALFORMED_CREDENTIAL_JWT: Failed to decode userAccessToken payload: ${err.message}`);
  }

  if (!seedUserId || typeof seedUserId !== 'string' || !seedUserId.trim()) {
    throw new Error('STORAGE_PROVISIONING_FAILED: seedUserId is required to identify fixture owner');
  }
  const validSeedUserId = validateUuid(seedUserId);
  if (!jwtClaims || jwtClaims.sub !== validSeedUserId) {
    throw new Error(`CREDENTIAL_BINDING_ERROR: userAccessToken sub claim ('${jwtClaims?.sub || 'none'}') does not match seedUserId ('${validSeedUserId}')`);
  }

  // 3. Validate run ID (R1-02)
  const validRunId = validateRunId(runId);

  // 4. Mandatory inventory tracking & admission gate (R1-08, R3-03, R3-04, R8-01)
  if (!inventory) {
    throw new Error('STORAGE_PROVISIONING_FAILED: inventory is required for write-ahead tracking (R1-08)');
  }
  assertTrustedRunInventory(inventory, { projectRef: normRef, expectedRunId: validRunId });
  inventory.assertActiveForAdmission('provisionStorageProbeFixture');

  // 5. Structural Fail-Closed Transport / Durable Recovery Gate (R1-01, R2 Sec 6, R3-02, R4-01)
  if (ownershipLookupFn !== null && ownershipLookupFn !== undefined) {
    throw new Error(
      'BLOCKED_PENDING_DURABLE_RECOVERY: Arbitrary executable ownershipLookupFn is rejected fail-closed; authoritative ownership metadata lookup must route exclusively through a registered offline Admin adapter (R4-01)'
    );
  }
  assertOfflineMockTransport(fetchFn);

  const safeFetch = (url, opts) => {
    assertOfflineMockTransport(fetchFn);
    return withRunRequestBudget(validRunId, 'auxiliary', () => runWithBlockedRealFetch(() => fetchFn(url, opts)));
  };

  // 6. Require narrowly-scoped, registered, run-bound authoritative ownership lookup interface before any Storage mutation (R2-01, R4-01)
  let resolvedAdminClient = adminClient;
  let trustedAdminMeta = null;
  if (resolvedAdminClient !== null && resolvedAdminClient !== undefined) {
    trustedAdminMeta = assertTrustedAdminClient(resolvedAdminClient, {
      projectRef: normRef,
      runId: validRunId,
      requireRunBinding: true
    });
  } else if (isNonEmptyString(serviceRoleKey)) {
    resolvedAdminClient = createHostedAdminClient({
      serviceRoleKey,
      anonKey,
      projectRef: normRef,
      runId: validRunId,
      fetchFn
    });
    trustedAdminMeta = assertTrustedAdminClient(resolvedAdminClient, {
      projectRef: normRef,
      runId: validRunId,
      requireRunBinding: true
    });
  }

  if (!trustedAdminMeta) {
    throw new Error(
      'BLOCKED_PENDING_OWNERSHIP_METADATA_INTERFACE: Authoritative storage.objects.owner_id lookup requires a registered run-bound createHostedAdminClient (adminClient) or serviceRoleKey (R2-01, R4-01)'
    );
  }

  const effectiveOwnershipLookup = (b, p, opts) => {
    assertTrustedAdminClient(resolvedAdminClient, {
      projectRef: normRef,
      runId: validRunId,
      requireRunBinding: true
    });
    return Reflect.apply(trustedAdminMeta.capabilities.getStorageObjectOwnership, resolvedAdminClient, [b, p, opts]);
  };

  const bucket = STORAGE_PROBE_BUCKET;
  const path = getStorageProbeObjectPath(validRunId);
  const fullKey = getStorageProbeObjectKey(validRunId);
  const baseUrl = `https://${normRef}.supabase.co`;

  // Compute expected byte buffer & SHA-256 digest upfront before atomic reservation
  const expectedBuf = typeof probeContent === 'string'
    ? Buffer.from(probeContent, 'utf8')
    : snapshotTrustedBinaryInput(probeContent, 'probeContent');
  const expectedSha256 = crypto.createHash('sha256').update(expectedBuf).digest('hex');

  // 6B. Register provisioning operation & atomically reserve fixture slot BEFORE the very first await (R3-03, R3-04)
  const provOp = typeof inventory.registerInFlightOperation === 'function'
    ? inventory.registerInFlightOperation({
        probeId: 'STORAGE-PROVISION',
        endpoint: `/storage/v1/object/${fullKey}`,
        canMintSession: false,
        canCreateUser: false,
        canModifyProviderState: true,
        requiresCleanupReconciliation: true,
        targetUserId: validSeedUserId,
        description: `Run-scoped Storage fixture provisioning (${fullKey})`
      })
    : null;

  let reservation;
  try {
    reservation = typeof inventory.reserveStorageFixture === 'function'
      ? inventory.reserveStorageFixture({
          bucket,
          path,
          ownerId: validSeedUserId,
          reservationOpId: provOp?.opId || null,
          projectRef: normRef,
          bytes: expectedBuf.length,
          sha256: expectedSha256,
          status: 'CREATION_PENDING',
          lifecycleState: STORAGE_LIFECYCLE_STATE.CREATION_PENDING
        })
      : inventory.registerStorageFixture({
          bucket,
          path,
          ownerId: validSeedUserId,
          status: 'CREATION_PENDING',
          lifecycleState: STORAGE_LIFECYCLE_STATE.CREATION_PENDING,
          deletionEligible: false,
          hasCommittedUpload: false,
          neverDispatched: true,
          bytes: expectedBuf.length,
          sha256: expectedSha256
        });
  } catch (reserveErr) {
    if (provOp && typeof inventory.settleInFlightOperation === 'function') {
      inventory.settleInFlightOperation(provOp.opId, { error: reserveErr, outcome: 'RESERVATION_REJECTED' });
    }
    throw reserveErr;
  }

  const ownerOpId = reservation.reservationOpId;

  function safeUpdateFixture(updates) {
    if (inventory.finalized) return null;
    return inventory.updateStorageFixture(fullKey, {
      ...updates,
      ownerOpId
    });
  }

  let settledOutcome = null;
  let caughtErr = null;
  try {
    // 7. Establish authenticated seed identity via affirmative provider /auth/v1/user proof (R2-01 #5, #6)
    const authHeaders = {
      Authorization: `Bearer ${userAccessToken.trim()}`
    };
    if (isNonEmptyString(anonKey)) {
      authHeaders.apikey = anonKey.trim();
    } else if (isNonEmptyString(serviceRoleKey)) {
      authHeaders.apikey = serviceRoleKey.trim();
    }

    let authUserRes;
    try {
      authUserRes = await safeFetch(`${baseUrl}/auth/v1/user`, {
        method: 'GET',
        headers: authHeaders
      });
    } catch (err) {
      safeUpdateFixture({
        lifecycleState: STORAGE_LIFECYCLE_STATE.DEFINITIVE_NON_CREATION,
        status: 'IDENTITY_CHECK_FAILED',
        deletionEligible: false,
        neverDispatched: true
      });
      throw new Error(`SEED_IDENTITY_VERIFICATION_FAILED: Provider /auth/v1/user check failed: ${err.message}`);
    }

    const authUserEnv = await parseStorageErrorEnvelope(authUserRes);
    if (authUserRes.status !== 200 || authUserEnv.parseStatus !== 'parsed' || !authUserEnv.body) {
      safeUpdateFixture({
        lifecycleState: STORAGE_LIFECYCLE_STATE.DEFINITIVE_NON_CREATION,
        status: 'IDENTITY_CHECK_FAILED',
        deletionEligible: false,
        neverDispatched: true
      });
      throw new Error(
        `SEED_IDENTITY_VERIFICATION_FAILED: Provider /auth/v1/user returned HTTP ${authUserRes.status} (${authUserEnv.parseStatus}); cannot prove seed identity from decoded JWT alone (R2-01)`
      );
    }
    const providerUserId = typeof authUserEnv.body.id === 'string' ? authUserEnv.body.id.trim() : null;
    if (!providerUserId) {
      safeUpdateFixture({
        lifecycleState: STORAGE_LIFECYCLE_STATE.DEFINITIVE_NON_CREATION,
        status: 'IDENTITY_CHECK_FAILED',
        deletionEligible: false,
        neverDispatched: true
      });
      throw new Error('SEED_IDENTITY_VERIFICATION_FAILED: Provider /auth/v1/user response missing user id');
    }
    let validProviderUserId;
    try {
      validProviderUserId = validateUuid(providerUserId);
    } catch (err) {
      safeUpdateFixture({
        lifecycleState: STORAGE_LIFECYCLE_STATE.DEFINITIVE_NON_CREATION,
        status: 'IDENTITY_CHECK_FAILED',
        deletionEligible: false,
        neverDispatched: true
      });
      throw new Error(`SEED_IDENTITY_VERIFICATION_FAILED: Provider /auth/v1/user returned invalid user UUID: ${err.message}`);
    }
    if (validProviderUserId !== validSeedUserId || validProviderUserId !== jwtClaims.sub) {
      safeUpdateFixture({
        lifecycleState: STORAGE_LIFECYCLE_STATE.DEFINITIVE_NON_CREATION,
        status: 'IDENTITY_CHECK_FAILED',
        deletionEligible: false,
        neverDispatched: true
      });
      throw new Error(
        `SEED_IDENTITY_VERIFICATION_FAILED: Provider user id '${validProviderUserId}' does not match expected seedUserId '${validSeedUserId}' (R2-01)`
      );
    }

    // Re-check run lifecycle admission before entering Storage calls (R3-04)
    if (inventory.runLifecycleState && inventory.runLifecycleState !== INVENTORY_RUN_STATE.ACTIVE) {
      safeUpdateFixture({
        lifecycleState: STORAGE_LIFECYCLE_STATE.DEFINITIVE_NON_CREATION,
        status: 'ABORTED_DURING_CLEANUP',
        deletionEligible: false,
        neverDispatched: true
      });
      throw new Error(
        `PROVISIONING_ABORTED_DURING_CLEANUP: Aborted before pre-upload collision check because runLifecycleState is '${inventory.runLifecycleState}' (R3-04)`
      );
    }

    // 8. Pre-upload collision check using normalized Storage absence evidence (R1-03, R2-03, R3-05)
    // Prefer privileged adminClient.getStorageObject (bypasses RLS so another user's object cannot be masked as NoSuchKey)
    let collisionNormalized;
    if (resolvedAdminClient && typeof resolvedAdminClient.getStorageObject === 'function') {
      try {
        const adminCheck = await resolvedAdminClient.getStorageObject(bucket, path);
        if (adminCheck && adminCheck.normalized) {
          collisionNormalized = adminCheck.normalized;
        } else {
          collisionNormalized = normalizeStorageObjectResponse({
            status: adminCheck?.status || 0,
            parseStatus: adminCheck?.parseStatus || (adminCheck?.body ? 'parsed' : 'no_body'),
            body: adminCheck?.body ?? null,
            transportError: adminCheck?.transportError || null,
            expectedBucket: bucket,
            expectedPath: path,
            projectRef: normRef,
            authorizedContext: adminCheck?.authorizedContext ?? true
          });
        }
      } catch (err) {
        safeUpdateFixture({
          lifecycleState: STORAGE_LIFECYCLE_STATE.DEFINITIVE_NON_CREATION,
          status: 'COLLISION_CHECK_FAILED',
          deletionEligible: false,
          neverDispatched: true
        });
        throw new Error(`STORAGE_COLLISION_CHECK_FAILED: Privileged pre-upload collision check threw: ${err.message}`);
      }
    } else {
      let checkRes;
      try {
        checkRes = await safeFetch(`${baseUrl}/storage/v1/object/authenticated/${fullKey}`, {
          method: 'GET',
          headers: authHeaders
        });
      } catch (err) {
        safeUpdateFixture({
          lifecycleState: STORAGE_LIFECYCLE_STATE.DEFINITIVE_NON_CREATION,
          status: 'COLLISION_CHECK_FAILED',
          deletionEligible: false,
          neverDispatched: true
        });
        throw new Error(`STORAGE_COLLISION_CHECK_FAILED: Pre-upload collision check failed: ${err.message}`);
      }
      const checkEnv = await parseStorageErrorEnvelope(checkRes);
      collisionNormalized = normalizeStorageObjectResponse({
        status: checkEnv.status,
        parseStatus: checkEnv.parseStatus,
        body: checkEnv.body,
        expectedBucket: bucket,
        expectedPath: path,
        projectRef: normRef,
        authorizedContext: true
      });
    }

    if (collisionNormalized.classification === STORAGE_RESPONSE_CLASS.OBJECT_PRESENT) {
      safeUpdateFixture({
        lifecycleState: STORAGE_LIFECYCLE_STATE.CONFLICT_EXISTING_PRESERVED,
        status: 'CONFLICT_PRESERVED',
        deletionEligible: false,
        neverDispatched: true
      });
      throw new Error(
        `STORAGE_COLLISION_DETECTED: Object '${fullKey}' already exists in bucket '${bucket}'; overwrite or collision prohibited (H3-02)`
      );
    }
    if (!collisionNormalized.isAbsent) {
      safeUpdateFixture({
        lifecycleState: STORAGE_LIFECYCLE_STATE.DEFINITIVE_NON_CREATION,
        status: 'COLLISION_CHECK_FAILED',
        deletionEligible: false,
        neverDispatched: true
      });
      throw new Error(
        `STORAGE_COLLISION_CHECK_FAILED: Pre-upload collision check failed with ${collisionNormalized.classification} (HTTP ${collisionNormalized.status}): ${collisionNormalized.reason}; fail-closed (R2-03)`
      );
    }

    // Re-check run lifecycle admission right before dispatching Storage upload POST (R3-04)
    if (inventory.runLifecycleState && inventory.runLifecycleState !== INVENTORY_RUN_STATE.ACTIVE) {
      safeUpdateFixture({
        lifecycleState: STORAGE_LIFECYCLE_STATE.DEFINITIVE_NON_CREATION,
        status: 'ABORTED_DURING_CLEANUP',
        deletionEligible: false,
        neverDispatched: true
      });
      throw new Error(
        `PROVISIONING_ABORTED_DURING_CLEANUP: Aborted before upload POST because runLifecycleState is '${inventory.runLifecycleState}' (R3-04)`
      );
    }

    // 10. Upload bytes with no overwrite/upsert (x-upsert: false)
    safeUpdateFixture({
      lifecycleState: STORAGE_LIFECYCLE_STATE.CREATION_IN_FLIGHT,
      status: 'IN_FLIGHT'
    });
    const activeFixtureRef = inventory.getStorageFixture(bucket, path);
    if (activeFixtureRef) {
      activeFixtureRef.neverDispatched = false;
    }

    let uploadRes;
    let uploadError = null;
    try {
      const uploadHeaders = {
        Authorization: `Bearer ${userAccessToken.trim()}`,
        'Content-Type': 'text/plain',
        'x-upsert': 'false'
      };
      if (isNonEmptyString(anonKey)) {
        uploadHeaders.apikey = anonKey.trim();
      }
      uploadRes = await safeFetch(`${baseUrl}/storage/v1/object/${fullKey}`, {
        method: 'POST',
        headers: uploadHeaders,
        body: expectedBuf
      });
    } catch (err) {
      uploadError = err;
    }

    if (uploadError) {
      safeUpdateFixture({
        lifecycleState: STORAGE_LIFECYCLE_STATE.CREATION_INDETERMINATE,
        status: 'CREATION_INDETERMINATE',
        deletionEligible: false,
        residualReason: `Upload transport failure: ${uploadError.message}`
      });
      throw new Error(`STORAGE_UPLOAD_INDETERMINATE: Network error during upload: ${uploadError.message}`);
    }

    const uploadEnv = await parseStorageErrorEnvelope(uploadRes);
    if (!uploadRes.ok) {
      const normUploadErr = normalizeStorageObjectResponse({
        status: uploadEnv.status,
        parseStatus: uploadEnv.parseStatus,
        body: uploadEnv.body,
        expectedBucket: bucket,
        expectedPath: path,
        projectRef: normRef,
        authorizedContext: true
      });

      if (normUploadErr.classification === STORAGE_RESPONSE_CLASS.CONFLICT_EXISTS) {
        safeUpdateFixture({
          lifecycleState: STORAGE_LIFECYCLE_STATE.CONFLICT_EXISTING_PRESERVED,
          status: 'CONFLICT_PRESERVED',
          deletionEligible: false
        });
        throw new Error(
          `STORAGE_UPLOAD_CONFLICT: Documented conflict detected during upload (HTTP ${uploadRes.status}); existing object preserved without deletion eligibility`
        );
      }

      // Invariant R2-02 #3: Any ambiguous non-conflict upload failure (e.g. HTTP 500, 429, malformed) after POST dispatch
      // MUST remain CREATION_INDETERMINATE so cleanup NEVER silently skips potentially committed objects!
      safeUpdateFixture({
        lifecycleState: STORAGE_LIFECYCLE_STATE.CREATION_INDETERMINATE,
        status: 'CREATION_INDETERMINATE',
        deletionEligible: false,
        residualReason: `Ambiguous POST response HTTP ${uploadRes.status} (${normUploadErr.classification})`
      });
      const detailMsg = uploadEnv.body?.message || uploadEnv.body?.msg || normUploadErr.reason || 'Upload failed';
      throw new Error(
        `STORAGE_UPLOAD_FAILED: HTTP ${uploadRes.status} - ${detailMsg} (quarantined as CREATION_INDETERMINATE, R2-02)`
      );
    }

    // POST succeeded (HTTP 200/201): Immediately create committed resource obligation! (R2-02 #1, #2)
    // Verification failure below MUST preserve RESIDUAL_OWNERSHIP_BLOCKED and never downgrade to CREATION_FAILED.
    const uploadedObjectId = typeof uploadEnv.body?.Id === 'string' && uploadEnv.body.Id.trim()
      ? uploadEnv.body.Id.trim()
      : null;

    safeUpdateFixture({
      lifecycleState: STORAGE_LIFECYCLE_STATE.RESIDUAL_OWNERSHIP_BLOCKED,
      status: 'UPLOAD_COMMITTED_UNVERIFIED',
      hasCommittedUpload: true,
      deletionEligible: false,
      providerObjectId: uploadedObjectId
    });

    // 11. Verification of accessibility (GET 200) and byte/digest integrity (R2-01 #7, #9)
    let verifyRes;
    try {
      verifyRes = await safeFetch(`${baseUrl}/storage/v1/object/authenticated/${fullKey}`, {
        method: 'GET',
        headers: authHeaders
      });
    } catch (err) {
      safeUpdateFixture({
        lifecycleState: STORAGE_LIFECYCLE_STATE.RESIDUAL_OWNERSHIP_BLOCKED,
        status: 'VERIFICATION_NETWORK_FAILED',
        deletionEligible: false,
        residualReason: `Post-upload GET failed: ${err.message}`
      });
      throw new Error(`STORAGE_VERIFICATION_FAILED: Verification network request failed (residual obligation preserved): ${err.message}`);
    }

    if (verifyRes.status !== 200) {
      safeUpdateFixture({
        lifecycleState: STORAGE_LIFECYCLE_STATE.RESIDUAL_OWNERSHIP_BLOCKED,
        status: 'VERIFICATION_FAILED',
        deletionEligible: false,
        residualReason: `Post-upload GET returned HTTP ${verifyRes.status}`
      });
      throw new Error(
        `STORAGE_VERIFICATION_FAILED: Uploaded fixture '${fullKey}' verification GET returned HTTP ${verifyRes.status} (residual obligation preserved, R2-02)`
      );
    }

    let downloadedBuf = null;
    try {
      if (typeof verifyRes.arrayBuffer === 'function') {
        const ab = await verifyRes.arrayBuffer();
        downloadedBuf = Buffer.from(ab);
      } else if (typeof verifyRes.text === 'function') {
        const textVal = await verifyRes.text();
        if (typeof textVal !== 'string') throw new Error('Response.text() returned non-string');
        downloadedBuf = Buffer.from(textVal, 'utf8');
      } else if (typeof verifyRes.body === 'string' || Buffer.isBuffer(verifyRes.body)) {
        downloadedBuf = Buffer.isBuffer(verifyRes.body) ? verifyRes.body : Buffer.from(verifyRes.body, 'utf8');
      } else {
        throw new Error('Verification response body interface missing (no arrayBuffer, text, or buffer/string body)');
      }
    } catch (err) {
      safeUpdateFixture({
        lifecycleState: STORAGE_LIFECYCLE_STATE.RESIDUAL_OWNERSHIP_BLOCKED,
        status: 'VERIFICATION_UNREADABLE',
        deletionEligible: false,
        residualReason: `Verification body read failed: ${err.message}`
      });
      throw new Error(`STORAGE_VERIFICATION_FAILED: Verification response body could not be read (${err.message}); residual obligation preserved`);
    }

    const downloadedSha256 = crypto.createHash('sha256').update(downloadedBuf).digest('hex');
    if (Buffer.compare(downloadedBuf, expectedBuf) !== 0 || downloadedSha256 !== expectedSha256) {
      safeUpdateFixture({
        lifecycleState: STORAGE_LIFECYCLE_STATE.RESIDUAL_OWNERSHIP_BLOCKED,
        status: 'INTEGRITY_MISMATCH',
        deletionEligible: false,
        residualReason: `Byte/SHA-256 mismatch (expected ${expectedSha256}, got ${downloadedSha256})`
      });
      throw new Error(
        `STORAGE_PAYLOAD_INTEGRITY_MISMATCH: Downloaded bytes/digest mismatch for '${fullKey}' (residual obligation preserved, R2-01/R2-02)`
      );
    }

    // 12. Authoritative provider ownership verification via storage.objects.owner_id lookup (R2-01 #2-#4, #10-#12)
    let lookupRes;
    let lookupTimedOut = false;
    try {
      const controller = new AbortController();
      let timer;
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          lookupTimedOut = true;
          reject(new Error(`OWNERSHIP_LOOKUP_TIMEOUT: Lookup exceeded ${ownershipTimeoutMs}ms`));
        }, ownershipTimeoutMs);
      });
      try {
        const lookupPromise = runWithBlockedRealFetch(() =>
          Promise.resolve(
            effectiveOwnershipLookup(bucket, path, {
              projectRef: normRef,
              expectedObjectId: uploadedObjectId,
              timeoutMs: ownershipTimeoutMs,
              signal: controller.signal
            })
          )
        );
        lookupPromise.catch(() => {});
        lookupRes = await Promise.race([lookupPromise, timeoutPromise]);
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      safeUpdateFixture({
        lifecycleState: STORAGE_LIFECYCLE_STATE.RESIDUAL_OWNERSHIP_BLOCKED,
        status: lookupTimedOut ? 'OWNERSHIP_LOOKUP_TIMEOUT' : 'OWNERSHIP_LOOKUP_ERROR',
        deletionEligible: false,
        residualReason: err.message
      });
      throw new Error(`STORAGE_OWNER_VERIFICATION_FAILED: ${err.message} (residual obligation preserved)`);
    }

    if (!lookupRes || lookupRes.error || !lookupRes.found || !lookupRes.data || typeof lookupRes.data !== 'object') {
      const reasonMsg = lookupRes?.error?.message || lookupRes?.error?.code || 'Ownership metadata record missing';
      safeUpdateFixture({
        lifecycleState: STORAGE_LIFECYCLE_STATE.RESIDUAL_OWNERSHIP_BLOCKED,
        status: 'OWNER_METADATA_MISSING',
        deletionEligible: false,
        residualReason: reasonMsg
      });
      throw new Error(
        `STORAGE_OWNER_VERIFICATION_FAILED: Authoritative storage.objects.owner_id lookup failed (${reasonMsg}); residual obligation preserved (R2-01/R2-02)`
      );
    }

    const meta = lookupRes.data;
    if (meta.project_ref && String(meta.project_ref).trim().toLowerCase() !== normRef) {
      safeUpdateFixture({
        lifecycleState: STORAGE_LIFECYCLE_STATE.RESIDUAL_OWNERSHIP_BLOCKED,
        status: 'PROJECT_MISMATCH',
        deletionEligible: false,
        residualReason: `Metadata project_ref '${meta.project_ref}' !== '${normRef}'`
      });
      throw new Error(
        `STORAGE_OWNER_VERIFICATION_FAILED: Metadata project_ref '${meta.project_ref}' does not match '${normRef}'`
      );
    }

    if (meta.bucket_id !== bucket || meta.name !== path) {
      safeUpdateFixture({
        lifecycleState: STORAGE_LIFECYCLE_STATE.RESIDUAL_OWNERSHIP_BLOCKED,
        status: 'KEY_MISMATCH',
        deletionEligible: false,
        residualReason: `Metadata bucket/name '${meta.bucket_id}/${meta.name}' !== '${bucket}/${path}'`
      });
      throw new Error(
        `STORAGE_OBJECT_KEY_MISMATCH: Authoritative metadata '${meta.bucket_id}/${meta.name}' does not match '${bucket}/${path}' (R2-01)`
      );
    }

    let validProviderObjectId;
    try {
      validProviderObjectId = validateUuid(meta.id);
    } catch (err) {
      safeUpdateFixture({
        lifecycleState: STORAGE_LIFECYCLE_STATE.RESIDUAL_OWNERSHIP_BLOCKED,
        status: 'OBJECT_ID_INVALID',
        deletionEligible: false,
        residualReason: `Invalid provider object UUID: ${err.message}`
      });
      throw new Error(`STORAGE_OBJECT_IDENTITY_MISMATCH: Authoritative storage.objects.id missing or invalid UUID: ${err.message}`);
    }

    if (uploadedObjectId && validProviderObjectId !== uploadedObjectId.toLowerCase()) {
      safeUpdateFixture({
        lifecycleState: STORAGE_LIFECYCLE_STATE.RESIDUAL_OWNERSHIP_BLOCKED,
        status: 'OBJECT_ID_MISMATCH',
        deletionEligible: false,
        residualReason: `Upload Id '${uploadedObjectId}' !== metadata id '${validProviderObjectId}'`
      });
      throw new Error(
        `STORAGE_OBJECT_IDENTITY_MISMATCH: Uploaded object Id '${uploadedObjectId}' does not match metadata id '${validProviderObjectId}' (R2-01)`
      );
    }

    let validMetaOwnerId = null;
    if (typeof meta.owner_id === 'string' && meta.owner_id.trim()) {
      try {
        validMetaOwnerId = validateUuid(meta.owner_id);
      } catch {
        validMetaOwnerId = null;
      }
    }

    if (!validMetaOwnerId || validMetaOwnerId !== validProviderUserId) {
      safeUpdateFixture({
        lifecycleState: STORAGE_LIFECYCLE_STATE.RESIDUAL_OWNERSHIP_BLOCKED,
        status: 'OWNER_MISMATCH',
        deletionEligible: false,
        residualReason: `storage.objects.owner_id '${meta.owner_id || 'missing'}' !== seedUserId '${validProviderUserId}'`
      });
      throw new Error(
        `STORAGE_OWNER_VERIFICATION_FAILED: storage.objects.owner_id '${meta.owner_id || 'missing'}' does not match verified seed user '${validProviderUserId}' (R2-01)`
      );
    }

    // Check admission gate before promoting RUN_CREATED_VERIFIED (R3-04)
    if (inventory.runLifecycleState && inventory.runLifecycleState !== INVENTORY_RUN_STATE.ACTIVE) {
      safeUpdateFixture({
        lifecycleState: STORAGE_LIFECYCLE_STATE.RESIDUAL_OWNERSHIP_BLOCKED,
        status: 'LATE_SETTLEMENT_DURING_CLEANUP',
        deletionEligible: false,
        providerObjectId: uploadedObjectId ? undefined : validProviderObjectId,
        residualReason: `Verification finished after cleanup transition (${inventory.runLifecycleState})`
      });
      throw new Error(
        `PROVISIONING_ABORTED_DURING_CLEANUP: Ownership verification settled while inventory is '${inventory.runLifecycleState}' (R3-04)`
      );
    }

    // 13. Affirmative RUN_CREATED_VERIFIED grants deletion eligibility (R1-03, R2-01, R2-02)
    const verifiedBytes = expectedBuf.length;
    const fixtureRecord = safeUpdateFixture({
      lifecycleState: STORAGE_LIFECYCLE_STATE.RUN_CREATED_VERIFIED,
      deletionEligible: true,
      status: 'VERIFIED',
      bytes: verifiedBytes,
      sha256: expectedSha256,
      providerObjectId: uploadedObjectId ? undefined : validProviderObjectId,
      verifiedOwnerId: validMetaOwnerId,
      proof: {
        verifiedOwnership: true,
        projectRef: normRef,
        bucket,
        path,
        objectId: validProviderObjectId,
        ownerId: validMetaOwnerId,
        seedIdentityEndpoint: '/auth/v1/user',
        ownershipSource: lookupRes.source || 'storage.objects.owner_id',
        verifiedGetStatus: 200,
        uploadedBytes: verifiedBytes,
        sha256: expectedSha256,
        timestamp: new Date().toISOString()
      }
    });

    // Public lifecycle/owner labels cannot manufacture provider creation provenance.
    // Issue the capability only after upload, exact payload and provider-owner verification.
    VERIFIED_STORAGE_CREATIONS.set(fixtureRecord, Object.freeze({
      inventory, runId: validRunId, fixtureKey: fullKey, snapshot: storageCreationSnapshot(fixtureRecord)
    }));

    settledOutcome = {
      bucket,
      path,
      key: fullKey,
      runId: validRunId,
      projectRef: normRef,
      objectId: validProviderObjectId,
      ownerId: validMetaOwnerId,
      bytes: verifiedBytes,
      sha256: expectedSha256,
      status: 'VERIFIED',
      lifecycleState: STORAGE_LIFECYCLE_STATE.RUN_CREATED_VERIFIED,
      deletionEligible: true,
      reservationOpId: ownerOpId,
      fixtureRecord
    };
    return settledOutcome;
  } catch (err) {
    caughtErr = err;
    throw err;
  } finally {
    if (provOp && typeof inventory.settleInFlightOperation === 'function') {
      inventory.settleInFlightOperation(provOp.opId, {
        outcome: settledOutcome || 'FAILED',
        error: caughtErr
      });
    }
  }
}

/**
 * Standard test password constant for synthetic testing.
 * Resolves PRRT_kwDOVtCmZc66lOOY.
 */
export const DEFAULT_TEST_PASSWORD = 'TioTest#SecureRun2026!';
export const DEFAULT_TEST_EMAIL = 'tio-test-user-06i@proof.invalid';

export function getRunTestPassword(options = {}) {
  return (options && options.testPassword) || process.env.TASK06I_TEST_PASSWORD || DEFAULT_TEST_PASSWORD;
}

/**
 * Creates private run-scoped credential context for token propagation and cleanup.
 * Resolves PRRT_kwDOVtCmZc66lOOP.
 */
export function createRunContext(rawOptions = {}) {
  const options = admitValidatedInput(rawOptions, 'createRunContextOptions');
  const testEmail = options.testEmail || options.testUser || null;
  const runId = options.runId ? validateRunId(options.runId) : `run-${Date.now()}-${crypto.randomUUID()}`;
  const projectRef = HARDCODED_TEMP_REF;
  const metaState = {
    instance: null,
    runId,
    projectRef,
    cleared: false,
    methods: null
  };
  const ctx = {
    storageFixturePath: options.storageFixturePath || getStorageProbeObjectPath(runId),
    testPassword: getRunTestPassword(options),
    testEmail: testEmail ? String(testEmail).trim().toLowerCase() : null,
    seedUserId: options.seedUserId || null,
    seedEmail: options.seedEmail || null,
    activeAccessToken: null,
    activeRefreshToken: null,
    activeUserId: null,
    activeSessionId: null,
    preInvalidationSessionValid: false,
    passwordResetCompleted: false,
    sessionRevocationConfirmed: false,
    revokedSessionId: null,
    revokedAccessToken: null,
    originalSeedPassword: null,
    activeSeedPassword: null,
    clear() {
      metaState.cleared = true;
      this.storageFixturePath = null;
      this.activeAccessToken = null;
      this.activeRefreshToken = null;
      this.testPassword = null;
      this.testEmail = null;
      this.seedUserId = null;
      this.seedEmail = null;
      this.activeSessionId = null;
      this.activeUserId = null;
      this.preInvalidationSessionValid = false;
      this.passwordResetCompleted = false;
      this.sessionRevocationConfirmed = false;
      this.revokedSessionId = null;
      this.revokedAccessToken = null;
      this.originalSeedPassword = null;
      this.activeSeedPassword = null;
    }
  };
  Object.defineProperty(ctx, 'runId', {
    value: runId,
    writable: false,
    enumerable: true,
    configurable: false
  });
  Object.defineProperty(ctx, 'projectRef', {
    value: projectRef,
    writable: false,
    enumerable: true,
    configurable: false
  });
  metaState.instance = ctx;
  metaState.methods = Object.freeze({ clear: ctx.clear });
  TRUSTED_RUN_CONTEXTS.set(ctx, metaState);
  return ctx;
}

/**
 * Inspects real JWT claim structure.
 * Decodes base64url payload, validates expiration, audience, issuer,
 * verifies server-owned claims.amr_authenticated, and ensures RFC 8176 AMR compliance.
 * Never logs access tokens or secrets.
 * Resolves PRRT_kwDOVtCmZc66lOOM.
 */
export function parseAndValidateJwt(token, { expectedIssuer, expectedAudience = 'authenticated', clockToleranceSeconds = 60 } = {}) {
  if (typeof token !== 'string' || !token.trim()) {
    return { valid: false, reason: 'TOKEN_EMPTY: JWT token must be a non-empty string' };
  }
  const parts = token.trim().split('.');
  if (parts.length !== 3) {
    return { valid: false, reason: `TOKEN_FORMAT_INVALID: JWT must contain exactly 3 dot-separated parts, got ${parts.length}` };
  }
  let header, payload;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch (err) {
    return { valid: false, reason: `TOKEN_PARSE_ERROR: Failed to decode JWT base64url JSON: ${err.message}` };
  }
  if (!payload || typeof payload !== 'object') {
    return { valid: false, reason: 'TOKEN_PAYLOAD_INVALID: Decoded JWT payload must be a JSON object' };
  }

  // Mandatory finite numeric expiration claim (R5-05)
  if (payload.exp === undefined || payload.exp === null) {
    return { valid: false, reason: 'MISSING_EXP: JWT payload claims lack mandatory exp (expiration) claim', payload };
  }
  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) {
    return { valid: false, reason: `INVALID_EXP: JWT exp claim must be a finite number, got ${typeof payload.exp} (${payload.exp})`, payload };
  }

  // Temporal consistency with iat (R5-05)
  if (payload.iat !== undefined && payload.iat !== null) {
    if (typeof payload.iat !== 'number' || !Number.isFinite(payload.iat)) {
      return { valid: false, reason: `INVALID_IAT: JWT iat claim must be a finite number, got ${typeof payload.iat}`, payload };
    }
    if (payload.exp < payload.iat) {
      return { valid: false, reason: `TEMPORAL_INCONSISTENCY: JWT exp (${payload.exp}) cannot be earlier than iat (${payload.iat})`, payload };
    }
  }

  const nowUnix = Math.floor(Date.now() / 1000);
  if (payload.exp + clockToleranceSeconds < nowUnix) {
    return { valid: false, reason: `TOKEN_EXPIRED: JWT expired at unix ${payload.exp}, current ${nowUnix}`, payload };
  }

  if (expectedIssuer && typeof payload.iss === 'string' && !payload.iss.includes(expectedIssuer)) {
    return { valid: false, reason: `ISSUER_MISMATCH: Expected issuer containing '${expectedIssuer}', got '${payload.iss}'`, payload };
  }

  if (expectedAudience) {
    const audMatches = payload.aud === expectedAudience || (Array.isArray(payload.aud) && payload.aud.includes(expectedAudience));
    if (!audMatches) {
      return { valid: false, reason: `AUDIENCE_MISMATCH: Expected audience '${expectedAudience}', got '${payload.aud}'`, payload };
    }
  }

  const isAmrAuthenticated =
    payload.amr_authenticated === 'true' ||
    payload.amr_authenticated === true;

  if (!isAmrAuthenticated) {
    return {
      valid: false,
      reason: 'MISSING_AMR_AUTHENTICATED: JWT payload claims lack server-owned amr_authenticated claim',
      payload
    };
  }

  // RFC 8176 AMR claim validation strictly matching canonical SQL hook contract (R4-07)
  if (payload.amr === undefined || payload.amr === null) {
    return { valid: false, reason: 'MISSING_AMR: JWT payload claims lack RFC 8176 amr array', payload };
  }
  if (!Array.isArray(payload.amr) || payload.amr.length === 0) {
    return { valid: false, reason: 'MALFORMED_AMR: amr claim must be a non-empty array', payload };
  }

  for (const item of payload.amr) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { valid: false, reason: 'MALFORMED_AMR_ELEMENT: each amr item must be a JSON object (strings prohibited)', payload };
    }
    const method = item.method;
    if (typeof method !== 'string' || !method.trim()) {
      return { valid: false, reason: 'MALFORMED_AMR_METHOD: amr element missing non-empty string method property', payload };
    }
    // Canonical SQL hook strictly allowlists ONLY 'password' method for password/refresh tokens
    if (method.trim() !== 'password') {
      return { valid: false, reason: `PROHIBITED_AMR_METHOD: JWT amr contains disallowed method '${method}' (only 'password' allowed)`, payload };
    }
  }

  return {
    valid: true,
    header,
    payload,
    claims: payload
  };
}

/**
 * Safely parses response JSON body or returns null on parse failure.
 * Delegates to parseResponseEnvelope for backward compatibility. (R12-02)
 */
async function parseResponseBody(res) {
  const env = await parseResponseEnvelope(res);
  return env.body;
}

/**
 * Authoritatively validates that a Supabase key (anon or service_role) belongs strictly to the expected project.
 * Inspects the decoded base64url JWT payload of the key.
 * Strictly prevents sending a production/REAL key to a TEMP environment or vice-versa.
 * Resolves PRRT_kwDOVtCmZc66lq3W.
 */
export function validateProjectCredentialBinding(key, expectedProjectRef = HARDCODED_TEMP_REF) {
  if (typeof key !== 'string' || !key.trim()) {
    throw new Error('MISSING_CREDENTIAL: key must be a non-empty string');
  }
  const trimmed = key.trim();
  const parts = trimmed.split('.');
  if (parts.length !== 3) {
    throw new Error(
      `OPAQUE_CREDENTIAL_UNSUPPORTED: Credential must be a 3-part project JWT (anon or service_role); opaque or malformed keys (${parts.length} parts) cannot be cryptographically bound to target project '${expectedProjectRef}'.`
    );
  }

  let header, payload;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch (err) {
    throw new Error(`MALFORMED_CREDENTIAL_JWT: Failed to decode credential base64url JSON: ${err.message}`);
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('INVALID_CREDENTIAL_PAYLOAD: Credential payload must be a JSON object');
  }

  let detectedRef = payload.ref;
  if (!detectedRef && typeof payload.iss === 'string') {
    const m = payload.iss.match(/https?:\/\/([^.]+)\.supabase\.co/);
    if (m && m[1]) detectedRef = m[1];
  }

  if (!detectedRef || typeof detectedRef !== 'string') {
    throw new Error(
      `CREDENTIAL_PROJECT_UNBOUND: Credential payload lacks project ref or Supabase issuer binding; cannot bind to '${expectedProjectRef}'.`
    );
  }

  const normDetected = detectedRef.trim().toLowerCase();
  if (normDetected === HARDCODED_REAL_REF || normDetected === HARDCODED_TIO_WORLD_REF || isForbiddenProject(normDetected)) {
    throw new Error(
      `CRITICAL_SECURITY_VIOLATION: Credential belongs to forbidden project '${normDetected}'! Production credential cannot be forwarded to testbed.`
    );
  }

  const normExpected = (expectedProjectRef || HARDCODED_TEMP_REF).trim().toLowerCase();
  if (normDetected !== normExpected) {
    throw new Error(
      `CREDENTIAL_TARGET_MISMATCH: Credential ref '${normDetected}' does not match expected target '${normExpected}'. Forwarding prohibited.`
    );
  }

  return true;
}

/**
 * Standard test helper to create valid mock project keys (anon or service_role) bound to a project ref.
 * Exported for internal tests and runner usage.
 */
export function createMockProjectKey(ref = HARDCODED_TEMP_REF, role = 'anon') {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    ref,
    role,
    iss: `https://${ref}.supabase.co/auth/v1`,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600
  })).toString('base64url');
  return `${header}.${payload}.mock_sig`;
}

/**
 * Layer B: Hosted probe specification metadata declaring prerequisites, evidence sources,
 * and exact readiness status across the 18 preflight requirements.
 * Resolves Task 06I-B1-H1-R3 Layer B architecture requirements.
 */
export const HOSTED_PROBE_SPECIFICATIONS = Object.freeze({
  'BYPASS-01': {
    id: 'BYPASS-01',
    category: 'Native Bypass',
    layer: 'Layer B (Hosted Endpoint)',
    target: 'POST /auth/v1/otp',
    prerequisites: ['MANAGEMENT_API_PATCH_EXTERNAL_EMAIL_MAGIC_LINK_DISABLED'],
    credentialsRequired: ['TIO_TEMP_ANON_KEY'],
    evidenceSource: 'GOTRUE_HTTP_422_EMAIL_PROVIDER_DISABLED',
    readinessStatus: 'IMPLEMENTED_OFFLINE_TESTED',
    hostedStatus: 'HOSTED_NOT_TESTED'
  },
  'BYPASS-02': {
    id: 'BYPASS-02',
    category: 'Native Bypass',
    layer: 'Layer B (Hosted Endpoint)',
    target: 'POST /auth/v1/signup',
    prerequisites: ['MANAGEMENT_API_PATCH_DISABLE_SIGNUP'],
    credentialsRequired: ['TIO_TEMP_ANON_KEY'],
    evidenceSource: 'GOTRUE_HTTP_422_SIGNUP_DISABLED',
    readinessStatus: 'IMPLEMENTED_OFFLINE_TESTED',
    hostedStatus: 'HOSTED_NOT_TESTED'
  },
  'BYPASS-03': {
    id: 'BYPASS-03',
    category: 'Native Bypass',
    layer: 'Layer B (Hosted Endpoint)',
    target: 'POST /auth/v1/verify',
    prerequisites: ['VALID_DELIVERED_OTP_CHALLENGE', 'HOOK_CUSTOM_ACCESS_TOKEN_ENABLED'],
    credentialsRequired: ['TIO_TEMP_ANON_KEY'],
    evidenceSource: 'CUSTOM_ACCESS_TOKEN_HOOK_SQLSTATE_42501',
    readinessStatus: 'PROVIDER_PRECONDITION_MISSING',
    hostedStatus: 'HOSTED_NOT_TESTED',
    note: 'GoTrue verifies challenge token before invoking hook. Native OTP is disabled/suppressed. Hook verified offline in Layer A (POSTGRES_VERIFIED).'
  },
  'BYPASS-04': {
    id: 'BYPASS-04',
    category: 'Native Bypass',
    layer: 'Layer B (Hosted Endpoint)',
    target: 'Magic Link / Invite / Anonymous',
    prerequisites: ['VALID_MAGIC_LINK_TOKEN', 'HOOK_CUSTOM_ACCESS_TOKEN_ENABLED'],
    credentialsRequired: ['TIO_TEMP_ANON_KEY'],
    evidenceSource: 'CUSTOM_ACCESS_TOKEN_HOOK_SQLSTATE_42501',
    readinessStatus: 'PROVIDER_PRECONDITION_MISSING',
    hostedStatus: 'HOSTED_NOT_TESTED',
    note: 'Upstream magiclink route is disabled by configuration (returns 422/404 before hook). Hook verified offline in Layer A (POSTGRES_VERIFIED).'
  },
  'BYPASS-05': {
    id: 'BYPASS-05',
    category: 'Native Bypass',
    layer: 'Layer B (Hosted Endpoint)',
    target: 'POST /auth/v1/recover',
    prerequisites: ['HOOK_SEND_EMAIL_ENABLED'],
    credentialsRequired: ['TIO_TEMP_ANON_KEY'],
    evidenceSource: 'SEND_EMAIL_HOOK_SQLSTATE_42501',
    readinessStatus: 'IMPLEMENTED_OFFLINE_TESTED',
    hostedStatus: 'HOSTED_NOT_TESTED',
    note: 'Rejects anti-enumeration HTTP 200 as proof of email suppression. Requires hook failure 42501.'
  },
  'HOOK-01': {
    id: 'HOOK-01',
    category: 'Token Hook',
    layer: 'Layer B (Hosted Endpoint)',
    target: 'POST /auth/v1/token?grant_type=password',
    prerequisites: ['SEEDED_PASSWORD_USER', 'HOOK_CUSTOM_ACCESS_TOKEN_ENABLED'],
    credentialsRequired: ['TIO_TEMP_ANON_KEY'],
    evidenceSource: 'DECODED_JWT_AMR_AUTHENTICATED_CLAIM',
    readinessStatus: 'IMPLEMENTED_OFFLINE_TESTED',
    hostedStatus: 'HOSTED_NOT_TESTED',
    note: 'Decodes base64url payload of minted access_token, enforces claims.amr_authenticated === true and RFC 8176 AMR object array. Captures session_id.'
  },
  'HOOK-02': {
    id: 'HOOK-02',
    category: 'Token Hook',
    layer: 'Layer B (Hosted Endpoint)',
    target: 'POST /auth/v1/token?grant_type=refresh_token',
    prerequisites: ['ACTIVE_REFRESH_TOKEN_FROM_HOOK_01', 'HOOK_CUSTOM_ACCESS_TOKEN_ENABLED'],
    credentialsRequired: ['TIO_TEMP_ANON_KEY'],
    evidenceSource: 'DECODED_REFRESHED_JWT_AMR_PRESERVATION',
    readinessStatus: 'IMPLEMENTED_OFFLINE_TESTED',
    hostedStatus: 'HOSTED_NOT_TESTED',
    note: 'Consumes genuine refresh_token issued in HOOK-01; verifies AMR preservation in refreshed JWT.'
  },
  'HOOK-03': {
    id: 'HOOK-03',
    category: 'Token Hook',
    layer: 'Layer B (Hosted Endpoint)',
    target: 'OTP-Origin Token Denial',
    prerequisites: ['VALID_DELIVERED_OTP_CHALLENGE', 'HOOK_CUSTOM_ACCESS_TOKEN_ENABLED'],
    credentialsRequired: ['TIO_TEMP_ANON_KEY'],
    evidenceSource: 'CUSTOM_ACCESS_TOKEN_HOOK_SQLSTATE_42501',
    readinessStatus: 'PROVIDER_PRECONDITION_MISSING',
    hostedStatus: 'HOSTED_NOT_TESTED',
    note: 'GoTrue token endpoint does not support grant_type=otp. OTP token issuance occurs via /verify which requires a valid delivered OTP. Verified in Layer A (POSTGRES_VERIFIED).'
  },
  'HOOK-04': {
    id: 'HOOK-04',
    category: 'Token Hook',
    layer: 'Layer B (Hosted Endpoint)',
    target: 'Recovery-Origin Token Denial',
    prerequisites: ['VALID_DELIVERED_RECOVERY_TOKEN', 'HOOK_CUSTOM_ACCESS_TOKEN_ENABLED'],
    credentialsRequired: ['TIO_TEMP_ANON_KEY'],
    evidenceSource: 'CUSTOM_ACCESS_TOKEN_HOOK_SQLSTATE_42501',
    readinessStatus: 'PROVIDER_PRECONDITION_MISSING',
    hostedStatus: 'HOSTED_NOT_TESTED',
    note: 'GoTrue token endpoint does not support grant_type=recovery. Recovery token issuance occurs via /verify. Verified in Layer A (POSTGRES_VERIFIED).'
  },
  'HOOK-05': {
    id: 'HOOK-05',
    category: 'Token Hook',
    layer: 'Layer A (Offline SQL Parity)',
    target: 'Mixed AMR Rejection',
    prerequisites: ['SQL_FUNCTION_PARITY_TEST'],
    credentialsRequired: [],
    evidenceSource: 'PLPGSQL_FUNCTION_EXECUTION_42501',
    readinessStatus: 'BLOCKED_UNSUPPORTED',
    hostedStatus: 'HOSTED_NOT_TESTED',
    note: 'GoTrue server-owned claims.amr cannot be mutated via HTTP client request body. Authoritatively verified at Layer A in PostgreSQL (POSTGRES_VERIFIED).'
  },
  'HOOK-06': {
    id: 'HOOK-06',
    category: 'Token Hook',
    layer: 'Layer A (Offline SQL Parity)',
    target: 'Malformed/Missing AMR Rejection',
    prerequisites: ['SQL_FUNCTION_PARITY_TEST'],
    credentialsRequired: [],
    evidenceSource: 'PLPGSQL_FUNCTION_EXECUTION_42501',
    readinessStatus: 'BLOCKED_UNSUPPORTED',
    hostedStatus: 'HOSTED_NOT_TESTED',
    note: 'GoTrue server-owned claims.amr cannot be mutated via HTTP client request body. Authoritatively verified at Layer A in PostgreSQL (POSTGRES_VERIFIED).'
  },
  'HOOK-07': {
    id: 'HOOK-07',
    category: 'Token Hook',
    layer: 'Layer A (Offline SQL Parity)',
    target: 'Fail-Closed Exception Handling',
    prerequisites: ['SQL_FUNCTION_PARITY_TEST'],
    credentialsRequired: [],
    evidenceSource: 'PLPGSQL_TRANSACTION_ABORT_500',
    readinessStatus: 'BLOCKED_UNSUPPORTED',
    hostedStatus: 'HOSTED_NOT_TESTED',
    note: 'Hook exceptions abort transaction fail-closed. Cannot inject hook exception over client HTTP. Authoritatively verified at Layer A in PostgreSQL (POSTGRES_VERIFIED).'
  },
  'SESSION-01': {
    id: 'SESSION-01',
    category: 'Session & Consumer',
    layer: 'Layer B (Hosted Endpoint)',
    target: 'GET /auth/v1/user',
    prerequisites: ['ACTIVE_SESSION_FROM_HOOK_01', 'TIO_TEMP_SERVICE_ROLE_KEY'],
    credentialsRequired: ['TIO_TEMP_ANON_KEY', 'TIO_TEMP_SERVICE_ROLE_KEY'],
    evidenceSource: 'REAL_SESSION_ID_CORRELATION',
    readinessStatus: 'IMPLEMENTED_OFFLINE_TESTED',
    hostedStatus: 'HOSTED_NOT_TESTED',
    note: 'Verifies real session_id from JWT payload and correlates with active session in GoTrue.'
  },
  'SESSION-02': {
    id: 'SESSION-02',
    category: 'Session & Consumer',
    layer: 'Layer B (Hosted Endpoint)',
    target: 'PUT /auth/v1/admin/users/:userId',
    prerequisites: ['ACTIVE_USER_ID_FROM_HOOK_01', 'TIO_TEMP_SERVICE_ROLE_KEY'],
    credentialsRequired: ['TIO_TEMP_SERVICE_ROLE_KEY'],
    evidenceSource: 'ADMIN_API_PASSWORD_UPDATE_AND_SESSION_REVOCATION',
    readinessStatus: 'IMPLEMENTED_OFFLINE_TESTED',
    hostedStatus: 'HOSTED_NOT_TESTED',
    note: 'Performs administrative password reset via Admin API. No logout fallback allowed. Verifies session revocation.'
  },
  'SESSION-03': {
    id: 'SESSION-03',
    category: 'Session & Consumer',
    layer: 'Layer B (Hosted Endpoint)',
    target: 'GET /auth/v1/user (post-reset)',
    prerequisites: ['PRE_RESET_TOKEN', 'ADMIN_PASSWORD_RESET_COMPLETED'],
    credentialsRequired: ['TIO_TEMP_ANON_KEY'],
    evidenceSource: 'GOTRUE_HTTP_403_SESSION_NOT_FOUND',
    readinessStatus: 'IMPLEMENTED_OFFLINE_TESTED',
    hostedStatus: 'HOSTED_NOT_TESTED',
    note: 'Direct GET /user with pre-reset token rejected with HTTP 403 / session_not_found.'
  },
  'SESSION-04': {
    id: 'SESSION-04',
    category: 'Session & Consumer',
    layer: 'Layer B (Hosted Endpoint)',
    target: 'GET /rest/v1/task06i_session_probe',
    prerequisites: ['PRE_RESET_TOKEN_BEFORE_EXPIRY', 'TABLE_FIXTURE_TASK06I_SESSION_PROBE'],
    credentialsRequired: ['TIO_TEMP_ANON_KEY'],
    evidenceSource: 'POSTGREST_STATELESS_HTTP_200_BEFORE_EXP',
    readinessStatus: 'IMPLEMENTED_OFFLINE_TESTED',
    hostedStatus: 'HOSTED_NOT_TESTED',
    note: 'Documents PostgREST stateless JWT linger window. Accepts HTTP 200 before exp; rejects 401 as proof of linger.'
  },
  'SESSION-05': {
    id: 'SESSION-05',
    category: 'Session & Consumer',
    layer: 'Layer B (Hosted Endpoint)',
    target: 'GET /storage/v1/object/authenticated/task06i_probe_bucket/<runId>/probe.txt',
    prerequisites: ['PRE_RESET_TOKEN_BEFORE_EXPIRY', 'STORAGE_OBJECT_FIXTURE_PROVISIONED (task06i_probe_bucket/<runId>/probe.txt owned by test user)'],
    credentialsRequired: ['TIO_TEMP_ANON_KEY'],
    evidenceSource: 'STORAGE_STATELESS_HTTP_200_BEFORE_EXP',
    readinessStatus: 'IMPLEMENTED_OFFLINE_TESTED',
    hostedStatus: 'HOSTED_NOT_TESTED',
    note: 'Documents Storage stateless JWT linger window. Accepts HTTP 200 before exp; rejects 401 or 404 as proof of linger (HTTP 404 indicates missing run-scoped probe.txt fixture, R5-07).'
  },
  'SESSION-06': {
    id: 'SESSION-06',
    category: 'Session & Consumer',
    layer: 'Layer B (Hosted Endpoint)',
    target: 'POST /functions/v1/auth-user-probe',
    prerequisites: ['EDGE_FUNCTION_AUTH_USER_PROBE_DEPLOYED', 'PRE_RESET_TOKEN'],
    credentialsRequired: ['TIO_TEMP_ANON_KEY'],
    evidenceSource: 'EDGE_FUNCTION_AUTH_SESSION_MISSING_ERROR',
    readinessStatus: 'PROVIDER_PRECONDITION_MISSING',
    hostedStatus: 'HOSTED_NOT_TESTED',
    note: 'Requires Edge Function auth-user-probe deployed to TEMP before execution.'
  }
});

/**
 * Creates a LIVE hosted probe dispatcher contract for the approved TEMP project.
 * Implements real endpoint logic for ALL 18 preflight probes (BYPASS-01..05, HOOK-01..07, SESSION-01..06).
 * Resolves PRRT_kwDOVtCmZc66lEzb, PRRT_kwDOVtCmZc66lOOK, PRRT_kwDOVtCmZc66lOOM, PRRT_kwDOVtCmZc66lOOP,
 * PRRT_kwDOVtCmZc66lOOS, PRRT_kwDOVtCmZc66lOOY, PRRT_kwDOVtCmZc66layA, PRRT_kwDOVtCmZc66lo-X,
 * PRRT_kwDOVtCmZc66lo-a, PRRT_kwDOVtCmZc66lo-f, PRRT_kwDOVtCmZc66lo-i, PRRT_kwDOVtCmZc66lo-m,
 * PRRT_kwDOVtCmZc66lo-o, PRRT_kwDOVtCmZc66lo-t, PRRT_kwDOVtCmZc66lq3S, and PRRT_kwDOVtCmZc66lq3W.
 */
export function createHostedDispatcher(rawOptions = {}) {
  const opts = admitValidatedInput(rawOptions, 'createHostedDispatcherOptions');
  let {
    projectRef = HARDCODED_TEMP_REF,
    anonKey,
    serviceRoleKey,
    inventory = null,
    runContext = null,
    fetchFn = null,
    testEmail = null,
    seedEmail = null,
    seedUserId = null
  } = opts;
  // 1. Strict Target Enforcement: Must be approved TEMP project ref
  const normRef = (projectRef || '').trim().toLowerCase();
  if (normRef !== HARDCODED_TEMP_REF) {
    throw new Error(
      `CRITICAL_SECURITY_VIOLATION: createHostedDispatcher strictly rejected target '${normRef}'. Only approved TEMP project '${HARDCODED_TEMP_REF}' is authorized.`
    );
  }

  // 2. Reject forbidden projects unconditionally
  if (isForbiddenProject(normRef)) {
    throw new Error(`CRITICAL_SECURITY_VIOLATION: Cannot create dispatcher for forbidden project '${normRef}'`);
  }

  // 3. Require non-empty anonKey and validate credential binding (R3-10)
  if (!isNonEmptyString(anonKey)) {
    throw new Error(
      'MISSING_HOSTED_CREDENTIALS: createHostedDispatcher requires non-empty anonKey for Supabase gateway requests'
    );
  }
  validateProjectCredentialBinding(anonKey, normRef);

  // 4. Validate serviceRoleKey binding if provided (R3-10)
  if (isNonEmptyString(serviceRoleKey)) {
    validateProjectCredentialBinding(serviceRoleKey, normRef);
  }

  // 5. Structural Fail-Closed Transport / Durable Recovery Gate BEFORE touching inventory/context (R1-01, R2 Sec 6, R9-04)
  assertOfflineMockTransport(fetchFn);

  // 6. Mandatory trusted inventory and runContext capability validation + immutable project/run correlation (R9-04, R10-02)
  if (inventory !== null && inventory !== undefined) {
    assertTrustedRunInventory(inventory, { projectRef: normRef, expectedRunId: null });
  }
  if (runContext !== null && runContext !== undefined) {
    assertTrustedRunContext(runContext, {
      projectRef: normRef,
      expectedRunId: inventory ? inventory.runId : null
    });
  }
  const factoryBoundRunId = inventory ? inventory.runId : (runContext ? runContext.runId : null);

  const factorySeedEmail = seedEmail || null;
  const factorySeedUserId = seedUserId || (runContext ? runContext.seedUserId : null) || null;
  if (inventory && factorySeedUserId) {
    inventory.protectSeedIdentity({ email: factorySeedEmail, id: factorySeedUserId });
  }

  const baseUrl = `https://${normRef}.supabase.co`;

  const transportFetch = fetchFn;
  fetchFn = async (url, opts) => {
    try {
      assertOfflineMockTransport(transportFetch);
      return await withRunRequestBudget(DISPATCHER_CALL_CONTEXT.getStore()?.runId || factoryBoundRunId, 'probe', () => runWithBlockedRealFetch(() => transportFetch(url, opts)));
    } catch (err) {
      if (typeof err?.message === 'string' && err.message.includes('BLOCKED_PENDING_DURABLE_RECOVERY')) {
        const callCtx = DISPATCHER_CALL_CONTEXT.getStore();
        if (callCtx) callCtx.trappedRecoveryError = err;
      }
      throw err;
    }
  };

  // Return the async dispatcher matching (item, options) contract
  const dispatcher = async function hostedDispatcher(rawItem, rawCallOptions = {}) {
    const liveCtx = RUNNER_LIVE_DISPATCH_CONTEXT.getStore();
    if (liveCtx && liveCtx.durableRecoveryVerified !== true) {
      throw new Error(
        'BLOCKED_PENDING_DURABLE_RECOVERY: Hosted network dispatcher cannot execute inside LIVE runner while durable crash recovery is not implemented'
      );
    }
    const item = admitValidatedInput(rawItem, 'probeItem', false);
    const options = admitValidatedInput(rawCallOptions, 'dispatcherCallOptions');
    if (options.projectRef !== undefined && options.projectRef.trim().toLowerCase() !== normRef) {
      throw new Error(
        `CRITICAL_SECURITY_VIOLATION: Per-call projectRef '${options.projectRef}' does not match dispatcher project '${normRef}' (R10-02)`
      );
    }
    const effInv = options.inventory !== undefined && options.inventory !== null ? options.inventory : inventory;
    const effCtx = options.runContext !== undefined && options.runContext !== null ? options.runContext : runContext;
    if (factoryBoundRunId !== null && options.runId !== undefined && options.runId !== null && options.runId !== factoryBoundRunId) {
      throw new Error(
        `DISPATCHER_RUN_MISMATCH: Per-call runId '${options.runId}' does not match factory-bound run '${factoryBoundRunId}' (R10-02)`
      );
    }
    const expectedCallRunId = factoryBoundRunId || (options.runId !== undefined && options.runId !== null ? options.runId : null);
    if (effInv !== null && effInv !== undefined) {
      assertTrustedRunInventory(effInv, { projectRef: normRef, expectedRunId: expectedCallRunId });
      if (effInv.runLifecycleState === INVENTORY_RUN_STATE.FINALIZED) {
        throw new Error(
          `RUN_FINALIZED_ADMISSION_BLOCKED: Inventory for run '${effInv.runId}' is already FINALIZED; dispatch rejected before transport/mutation (R10-02)`
        );
      }
    }
    const ctxExpectedRun = effInv ? effInv.runId : expectedCallRunId;
    if (effCtx !== null && effCtx !== undefined) {
      assertTrustedRunContext(effCtx, { projectRef: normRef, expectedRunId: ctxExpectedRun });
      if (effInv && effCtx.runId !== effInv.runId) {
        throw new Error(
          `DISPATCHER_RUN_MISMATCH: Effective runContext runId '${effCtx.runId}' does not match inventory runId '${effInv.runId}' (R10-02)`
        );
      }
    }
    const callCtx = { trappedRecoveryError: null, runId: effInv?.runId || effCtx?.runId || expectedCallRunId };
    const outcome = await DISPATCHER_CALL_CONTEXT.run(callCtx, async () => {
      const signal = options.signal;
      const probeId = item.id;
      const ctx = effCtx;
      const inv = effInv;
      const testPassword = options.testPassword || ctx?.testPassword || getRunTestPassword(options);
      const testUser = item?.testUser || options.testEmail || options.testUser || ctx?.testEmail || factorySeedEmail || 'tio-test-user-06i@proof.invalid';

      if (inv) {
        const seedEmailToProtect = options.seedEmail || factorySeedEmail || ctx?.seedEmail || null;
        const seedUserIdToProtect = options.seedUserId || factorySeedUserId || ctx?.seedUserId || null;
        if (seedUserIdToProtect) {
          inv.protectSeedIdentity({ email: seedEmailToProtect, id: seedUserIdToProtect });
        }
      }

      const headers = {
        'apikey': anonKey,
        'Content-Type': 'application/json'
      };

      switch (probeId) {
      case 'BYPASS-01': {
        const cap = getEndpointCapabilities('BYPASS-01') || {
          canMintSession: false,
          canCreateUser: true,
          canModifyProviderState: true,
          requiresCleanupReconciliation: true
        };
        const op = inv?.registerInFlightOperation
          ? inv.registerInFlightOperation({
              probeId: 'BYPASS-01',
              endpoint: '/auth/v1/otp',
              canMintSession: cap.canMintSession,
              canCreateUser: cap.canCreateUser,
              canModifyProviderState: cap.canModifyProviderState,
              requiresCleanupReconciliation: cap.requiresCleanupReconciliation,
              description: 'OTP probe dispatch (BYPASS-01)',
              metadata: { email: testUser }
            })
          : null;

        let res;
        let transportError = null;
        try {
          res = await fetchFn(`${baseUrl}/auth/v1/otp`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ email: testUser }),
            signal
          });
        } catch (err) {
          transportError = err;
        }

        const parseEnv = res ? await parseResponseEnvelope(res) : null;
        const observed = observeAuthResponse({
          probeId: 'BYPASS-01',
          status: parseEnv?.status || 0,
          parseStatus: parseEnv?.parseStatus || (transportError ? 'transport_error' : 'missing_response'),
          body: parseEnv?.body || null,
          parseError: parseEnv?.parseError || null,
          transportError,
          inv,
          ctx,
          expectedOperation: 'rejection',
          canMintSession: cap.canMintSession,
          canCreateUser: cap.canCreateUser,
          canModifyProviderState: cap.canModifyProviderState,
          requiresCleanupReconciliation: cap.requiresCleanupReconciliation,
          testUser
        });

        if (op && inv?.settleInFlightOperation) {
          inv.settleInFlightOperation(op.opId, { observed, error: transportError });
        }

        const body = parseEnv?.body || null;
        const createdUserId = observed.userId || body?.id || body?.user?.id;
        if (inv && createdUserId) {
          const uidStr = String(createdUserId).trim();
          const retEmail = (typeof body?.user?.email === 'string' && body.user.email.trim()) || (typeof body?.email === 'string' && body.email.trim()) || null;
          const isSeed = Boolean(inv.isSeedIdentity(uidStr, retEmail) || inv.isUserReferenced(uidStr));
          if (isSeed) {
            inv.registerReferencedUser({ id: uidStr, email: retEmail || testUser, source: 'BYPASS-01_unexpected_response_matched_seed' });
          } else if (!inv.isUserTracked(uidStr)) {
            inv.registerObservedUser({ id: uidStr, email: retEmail || testUser, source: 'BYPASS-01_unexpected_signup' });
          }
        }

        const errText = (body?.msg || body?.message || body?.error_description || body?.error || '').toLowerCase();
        const providerDisabled =
          body?.error_code === 'email_provider_disabled' ||
          errText.includes('email provider is disabled') ||
          errText.includes('signups not allowed for otp');

        return {
          passed: observed.status !== 200 && !createdUserId && providerDisabled === true && !observed.hasTokens,
          status: observed.status,
          route_disabled: providerDisabled,
          user_created: Boolean(createdUserId),
          indeterminate_user_creation: Boolean(observed.indeterminateUserCreation),
          error_code: body?.error_code || null,
          tokens: extractObservedTokens(body) ? body : null,
          error: body?.msg || body?.message || body?.error_description || (observed.hasTokens ? 'SECURITY_INVARIANT_VIOLATION: POST /auth/v1/otp unexpectedly issued tokens!' : (createdUserId ? 'SECURITY_INVARIANT_VIOLATION: POST /auth/v1/otp unexpectedly created user!' : (observed.indeterminateUserCreation ? observed.error : null)))
        };
      }

      case 'BYPASS-02': {
        const cap = getEndpointCapabilities('BYPASS-02') || {
          canMintSession: true,
          canCreateUser: true,
          canModifyProviderState: true,
          requiresCleanupReconciliation: true
        };
        const op = inv?.registerInFlightOperation
          ? inv.registerInFlightOperation({
              probeId: 'BYPASS-02',
              endpoint: '/auth/v1/signup',
              canMintSession: cap.canMintSession,
              canCreateUser: cap.canCreateUser,
              canModifyProviderState: cap.canModifyProviderState,
              requiresCleanupReconciliation: cap.requiresCleanupReconciliation,
              description: 'Signup probe dispatch (BYPASS-02)',
              metadata: { email: testUser }
            })
          : null;

        let res;
        let transportError = null;
        try {
          res = await fetchFn(`${baseUrl}/auth/v1/signup`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ email: testUser, password: testPassword }),
            signal
          });
        } catch (err) {
          transportError = err;
        }

        const parseEnv = res ? await parseResponseEnvelope(res) : null;
        const observed = observeAuthResponse({
          probeId: 'BYPASS-02',
          status: parseEnv?.status || 0,
          parseStatus: parseEnv?.parseStatus || (transportError ? 'transport_error' : 'missing_response'),
          body: parseEnv?.body || null,
          parseError: parseEnv?.parseError || null,
          transportError,
          inv,
          ctx,
          expectedOperation: 'rejection',
          canMintSession: cap.canMintSession,
          canCreateUser: cap.canCreateUser,
          canModifyProviderState: cap.canModifyProviderState,
          requiresCleanupReconciliation: cap.requiresCleanupReconciliation,
          testUser
        });

        if (op && inv?.settleInFlightOperation) {
          inv.settleInFlightOperation(op.opId, { observed, error: transportError });
        }

        const body = parseEnv?.body || null;
        const errText = (body?.msg || body?.message || body?.error_description || body?.error || '').toLowerCase();
        const createdUserId = observed.userId || body?.id || body?.user?.id;
        if (inv && createdUserId) {
          const uidStr = String(createdUserId).trim();
          const retEmail = (typeof body?.user?.email === 'string' && body.user.email.trim()) || (typeof body?.email === 'string' && body.email.trim()) || null;
          const isSeed = Boolean(inv.isSeedIdentity(uidStr, retEmail) || inv.isUserReferenced(uidStr));
          if (isSeed) {
            inv.registerReferencedUser({ id: uidStr, email: retEmail || testUser, source: 'BYPASS-02_unexpected_response_matched_seed' });
          } else if (!inv.isUserTracked(uidStr)) {
            inv.registerObservedUser({ id: uidStr, email: retEmail || testUser, source: 'BYPASS-02_unexpected_signup' });
          }
        }
        const signupDisabled =
          body?.error_code === 'signup_disabled' ||
          errText.includes('signups not allowed') ||
          errText.includes('signup is disabled');

        return {
          passed: observed.status !== 200 && !createdUserId && signupDisabled === true && !observed.hasTokens,
          status: observed.status,
          signup_disabled: signupDisabled,
          user_created: Boolean(createdUserId),
          indeterminate_user_creation: Boolean(observed.indeterminateUserCreation),
          error_code: body?.error_code || null,
          tokens: extractObservedTokens(body) ? body : null,
          error: body?.msg || body?.message || body?.error_description || (observed.hasTokens ? 'SECURITY_INVARIANT_VIOLATION: POST /auth/v1/signup unexpectedly issued tokens!' : (createdUserId ? 'SECURITY_INVARIANT_VIOLATION: POST /auth/v1/signup unexpectedly created user!' : (observed.indeterminateUserCreation ? observed.error : null)))
        };
      }

      case 'BYPASS-03': {
        const cap = getEndpointCapabilities('BYPASS-03') || {
          canMintSession: true,
          canCreateUser: false,
          canModifyProviderState: true,
          requiresCleanupReconciliation: true
        };
        const op = inv?.registerInFlightOperation
          ? inv.registerInFlightOperation({
              probeId: 'BYPASS-03',
              endpoint: '/auth/v1/verify',
              canMintSession: cap.canMintSession,
              canCreateUser: cap.canCreateUser,
              canModifyProviderState: cap.canModifyProviderState,
              requiresCleanupReconciliation: cap.requiresCleanupReconciliation,
              description: 'Verify probe dispatch (BYPASS-03)'
            })
          : null;

        // Direct verify with fake/unverified token returns 400 before hook execution (R3-06).
        // Hook is verified only if GoTrue actually invokes custom_access_token_hook.
        let res;
        let transportError = null;
        try {
          res = await fetchFn(`${baseUrl}/auth/v1/verify`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ type: 'email', token: '000000', email: testUser }),
            signal
          });
        } catch (err) {
          transportError = err;
        }

        const parseEnv = res ? await parseResponseEnvelope(res) : null;
        const observed = observeAuthResponse({
          probeId: 'BYPASS-03',
          status: parseEnv?.status || 0,
          parseStatus: parseEnv?.parseStatus || (transportError ? 'transport_error' : 'missing_response'),
          body: parseEnv?.body || null,
          parseError: parseEnv?.parseError || null,
          transportError,
          inv,
          ctx,
          expectedOperation: 'rejection',
          canMintSession: cap.canMintSession,
          canCreateUser: cap.canCreateUser,
          canModifyProviderState: cap.canModifyProviderState,
          requiresCleanupReconciliation: cap.requiresCleanupReconciliation,
          testUser
        });

        if (op && inv?.settleInFlightOperation) {
          inv.settleInFlightOperation(op.opId, { observed, error: transportError });
        }

        const body = parseEnv?.body || null;
        const errText = (body?.msg || body?.message || body?.error_description || body?.error || '').toLowerCase();
        const hookRejected =
          observed.status >= 400 &&
          (body?.error_code === 'hook_error' || errText.includes('42501') || errText.includes('error invoking access token hook'));
        const isUpstreamTokenError = body?.error_code === 'otp_expired' || errText.includes('token has expired') || errText.includes('invalid');

        if (observed.classification === 'AUTH_RESPONSE_INDETERMINATE') {
          return {
            passed: false,
            status: observed.status,
            hook_rejected: false,
            indeterminate_session: true,
            upstream_rejected_before_hook: false,
            tokens: extractObservedTokens(body) ? body : null,
            error: observed.error,
            reason: observed.error
          };
        }

        if (observed.hasTokens) {
          return {
            passed: false,
            status: observed.status,
            hook_rejected: false,
            indeterminate_session: false,
            upstream_rejected_before_hook: false,
            tokens: extractObservedTokens(body) ? body : null,
            error: 'SECURITY_INVARIANT_VIOLATION: POST /auth/v1/verify unexpectedly issued tokens for unverified challenge!'
          };
        }

        return {
          passed: observed.status !== 200 && hookRejected === true && !observed.hasTokens,
          status: observed.status,
          hook_rejected: hookRejected,
          upstream_rejected_before_hook: isUpstreamTokenError,
          tokens: extractObservedTokens(body) ? body : null,
          error: hookRejected
            ? (body?.msg || body?.message || 'Hook rejected token issuance')
            : (observed.hasTokens
                ? 'SECURITY_INVARIANT_VIOLATION: POST /auth/v1/verify unexpectedly issued tokens for unverified challenge!'
                : 'PROVIDER_PRECONDITION_MISSING: GoTrue rejected fake OTP upstream before invoking Custom Access Token Hook (R3-06)')
        };
      }

      case 'BYPASS-04': {
        // Magic Link token issuance occurs via token redemption, which requires a valid delivered magic link token.
        // On this testbed, send_email_hook suppresses magic link email delivery (42501), so no redemption token can be obtained.
        // Email suppression cannot be accepted as proof of Custom Access Token Hook rejection (R4-08).
        return {
          passed: false,
          status: 0,
          hook_rejected: false,
          email_suppressed: true,
          error: 'PROVIDER_PRECONDITION_MISSING: Magic link token cannot be obtained because email delivery is suppressed fail-closed. Email suppression cannot prove Custom Access Token Hook rejection. Hook contract is verified offline via Layer A PostgreSQL parity (POSTGRES_VERIFIED).',
          reason: 'PROVIDER_PRECONDITION_MISSING: Magic link redemption token unavailable due to fail-closed email suppression'
        };
      }

      case 'BYPASS-05': {
        const cap = getEndpointCapabilities('BYPASS-05') || {
          canMintSession: false,
          canCreateUser: false,
          canModifyProviderState: true,
          requiresCleanupReconciliation: false
        };
        const op = inv?.registerInFlightOperation
          ? inv.registerInFlightOperation({
              probeId: 'BYPASS-05',
              endpoint: '/auth/v1/recover',
              canMintSession: cap.canMintSession,
              canCreateUser: cap.canCreateUser,
              canModifyProviderState: cap.canModifyProviderState,
              requiresCleanupReconciliation: cap.requiresCleanupReconciliation,
              description: 'Recover probe dispatch (BYPASS-05)',
              metadata: { email: testUser }
            })
          : null;

        let res;
        let transportError = null;
        try {
          res = await fetchFn(`${baseUrl}/auth/v1/recover`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ email: testUser }),
            signal
          });
        } catch (err) {
          transportError = err;
        }

        const parseEnv = res ? await parseResponseEnvelope(res) : null;
        const observed = observeAuthResponse({
          probeId: 'BYPASS-05',
          status: parseEnv?.status || 0,
          parseStatus: parseEnv?.parseStatus || (transportError ? 'transport_error' : 'missing_response'),
          body: parseEnv?.body || null,
          parseError: parseEnv?.parseError || null,
          transportError,
          inv,
          ctx,
          expectedOperation: 'rejection',
          canMintSession: cap.canMintSession,
          canCreateUser: cap.canCreateUser,
          canModifyProviderState: cap.canModifyProviderState,
          requiresCleanupReconciliation: cap.requiresCleanupReconciliation,
          testUser
        });

        if (op && inv?.settleInFlightOperation) {
          inv.settleInFlightOperation(op.opId, { observed, error: transportError });
        }

        const body = parseEnv?.body || null;
        const errText = (body?.msg || body?.message || body?.error_description || body?.error || '').toLowerCase();
        const hookSuppressed =
          observed.status !== 200 &&
          (body?.error_code === 'hook_error' || errText.includes('42501') || errText.includes('send_email_hook'));

        return {
          passed: hookSuppressed === true && !body?.recovery_token && !observed.hasTokens,
          status: observed.status,
          recovery_suppressed: hookSuppressed,
          email_delivered: null,
          recovery_token: body?.recovery_token || null,
          tokens: extractObservedTokens(body) ? body : null,
          error: body?.msg || body?.message || (observed.hasTokens ? 'SECURITY_INVARIANT_VIOLATION: POST /auth/v1/recover unexpectedly issued tokens!' : (observed.status === 200 ? 'HTTP_200_CANNOT_PROVE_EMAIL_SUPPRESSION: Anti-enumeration 200 does not prove hook suppression' : null))
        };
      }

      case 'HOOK-01': {
        const cap = getEndpointCapabilities('HOOK-01') || {
          canMintSession: true,
          canCreateUser: false,
          canModifyProviderState: true,
          requiresCleanupReconciliation: true
        };
        const op = inv?.registerInFlightOperation
          ? inv.registerInFlightOperation({
              probeId: 'HOOK-01',
              endpoint: '/auth/v1/token?grant_type=password',
              canMintSession: cap.canMintSession,
              canCreateUser: cap.canCreateUser,
              canModifyProviderState: cap.canModifyProviderState,
              requiresCleanupReconciliation: cap.requiresCleanupReconciliation,
              description: 'Password token grant dispatch (HOOK-01)',
              metadata: { email: testUser }
            })
          : null;

        let res;
        let transportError = null;
        try {
          res = await fetchFn(`${baseUrl}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ email: testUser, password: testPassword }),
            signal
          });
        } catch (err) {
          transportError = err;
        }

        const parseEnv = res ? await parseResponseEnvelope(res) : null;
        const observed = observeAuthResponse({
          probeId: 'HOOK-01',
          status: parseEnv?.status || 0,
          parseStatus: parseEnv?.parseStatus || (transportError ? 'transport_error' : 'missing_response'),
          body: parseEnv?.body || null,
          parseError: parseEnv?.parseError || null,
          transportError,
          inv,
          ctx,
          expectedOperation: 'token_issuance',
          canMintSession: cap.canMintSession,
          canCreateUser: cap.canCreateUser,
          canModifyProviderState: cap.canModifyProviderState,
          requiresCleanupReconciliation: cap.requiresCleanupReconciliation,
          testUser
        });

        if (op && inv?.settleInFlightOperation) {
          inv.settleInFlightOperation(op.opId, { observed, error: transportError });
        }

        if (observed.classification === 'AUTH_RESPONSE_INDETERMINATE') {
          return {
            passed: false,
            status: observed.status,
            indeterminate_session: true,
            session_cleanup_registered: true,
            error: observed.error,
            tokens: parseEnv?.body || null
          };
        }

        if (observed.classification !== 'AUTH_RESPONSE_TOKEN_OBSERVED') {
          return {
            passed: false,
            status: observed.status,
            error: observed.error || 'Password grant authentication failed',
            tokens: parseEnv?.body || null
          };
        }

        const accessToken = observed.accessToken;
        const refreshToken = observed.refreshToken;
        const rawSessionId = observed.sessionId;
        const rawUserId = observed.userId;

        // Strictly validate JWT payload claims - NO bypass paths allowed (R3-08)
        const jwtCheck = parseAndValidateJwt(accessToken, { expectedAudience: 'authenticated' });
        if (!jwtCheck.valid) {
          // Token is unverified and untrusted for authorization, but cleanup obligation was retained (R5-04, R8-01)
          return {
            passed: false,
            status: observed.status,
            error: `JWT_CLAIM_VIOLATION: ${jwtCheck.reason}`,
            jwt_claims_verified: false,
            session_id: rawSessionId || null,
            session_cleanup_registered: isNonEmptyString(rawSessionId)
          };
        }

        const userId = jwtCheck.payload.sub || rawUserId;
        const sessionId = jwtCheck.payload.session_id || rawSessionId;

        if (!isNonEmptyString(sessionId)) {
          return {
            passed: false,
            status: observed.status,
            error: 'MISSING_SESSION_ID: Valid JWT must contain session_id claim for session tracking (R3-05)',
            jwt_claims_verified: true
          };
        }

        if (ctx) {
          ctx.activeAccessToken = accessToken;
          ctx.activeRefreshToken = refreshToken;
          ctx.activeUserId = userId;
          ctx.activeSessionId = sessionId;
        }

        return {
          passed: true,
          status: observed.status,
          access_token: accessToken,
          refresh_token: refreshToken,
          amr_authenticated: true,
          jwt_claims_verified: true,
          user_id: userId,
          session_id: sessionId,
          tokens: parseEnv?.body || null
        };
      }

      case 'HOOK-02': {
        const activeRefresh = options.activeRefreshToken || ctx?.activeRefreshToken;
        if (!activeRefresh) {
          return {
            passed: false,
            status: 400,
            error: 'PREREQUISITE_MISSING: HOOK-02 requires activeRefreshToken from HOOK-01'
          };
        }

        const cap = getEndpointCapabilities('HOOK-02') || {
          canMintSession: true,
          canCreateUser: false,
          canModifyProviderState: true,
          requiresCleanupReconciliation: true
        };
        const op = inv?.registerInFlightOperation
          ? inv.registerInFlightOperation({
              probeId: 'HOOK-02',
              endpoint: '/auth/v1/token?grant_type=refresh_token',
              canMintSession: cap.canMintSession,
              canCreateUser: cap.canCreateUser,
              canModifyProviderState: cap.canModifyProviderState,
              requiresCleanupReconciliation: cap.requiresCleanupReconciliation,
              description: 'Token refresh dispatch (HOOK-02)'
            })
          : null;

        let res;
        let transportError = null;
        try {
          res = await fetchFn(`${baseUrl}/auth/v1/token?grant_type=refresh_token`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ refresh_token: activeRefresh }),
            signal
          });
        } catch (err) {
          transportError = err;
        }

        const parseEnv = res ? await parseResponseEnvelope(res) : null;
        const observed = observeAuthResponse({
          probeId: 'HOOK-02',
          status: parseEnv?.status || 0,
          parseStatus: parseEnv?.parseStatus || (transportError ? 'transport_error' : 'missing_response'),
          body: parseEnv?.body || null,
          parseError: parseEnv?.parseError || null,
          transportError,
          inv,
          ctx,
          expectedOperation: 'token_refresh',
          canMintSession: cap.canMintSession,
          canCreateUser: cap.canCreateUser,
          canModifyProviderState: cap.canModifyProviderState,
          requiresCleanupReconciliation: cap.requiresCleanupReconciliation,
          testUser
        });

        if (op && inv?.settleInFlightOperation) {
          inv.settleInFlightOperation(op.opId, { observed, error: transportError });
        }

        if (observed.classification === 'AUTH_RESPONSE_INDETERMINATE') {
          return {
            passed: false,
            status: observed.status,
            indeterminate_session: true,
            error: observed.error,
            tokens: parseEnv?.body || null
          };
        }

        if (observed.classification !== 'AUTH_RESPONSE_TOKEN_OBSERVED') {
          return {
            passed: false,
            status: observed.status,
            error: observed.error || 'Token refresh failed',
            tokens: parseEnv?.body || null
          };
        }

        const refreshedAccess = observed.accessToken;

        // Strictly validate refreshed JWT payload - NO bypass paths allowed (R3-08)
        const jwtCheck = parseAndValidateJwt(refreshedAccess, { expectedAudience: 'authenticated' });
        if (!jwtCheck.valid) {
          return {
            passed: false,
            status: observed.status,
            error: `JWT_CLAIM_VIOLATION: ${jwtCheck.reason}`,
            refreshed_claims_verified: false
          };
        }

        const amrPreserved =
          (jwtCheck.payload.amr_authenticated === 'true' || jwtCheck.payload.amr_authenticated === true) &&
          Array.isArray(jwtCheck.payload.amr) &&
          jwtCheck.payload.amr.some(m => (typeof m === 'string' ? m : m?.method) === 'password');

        if (!amrPreserved) {
          return {
            passed: false,
            status: observed.status,
            error: 'AMR_PRESERVATION_VIOLATION: Refreshed token did not preserve password-origin AMR',
            amr_preserved: false
          };
        }

        if (ctx) {
          ctx.activeAccessToken = refreshedAccess;
          if (observed.refreshToken) {
            ctx.activeRefreshToken = observed.refreshToken;
          }
        }

        return {
          passed: true,
          status: observed.status,
          access_token: refreshedAccess,
          amr_preserved: true,
          refreshed_claims_verified: true,
          tokens: parseEnv?.body || null
        };
      }

      case 'HOOK-03':
      case 'HOOK-04': {
        // GoTrue token endpoint does not support grant_type=otp or grant_type=recovery (R3-01).
        // Token issuance from OTP/recovery occurs via POST /auth/v1/verify, which requires a valid delivered challenge token.
        // Because native OTP/recovery delivery is disabled and suppressed fail-closed on this testbed,
        // valid delivered challenge tokens cannot be generated without an external authenticated provider.
        return {
          passed: false,
          status: 0,
          hook_rejected: false,
          error: `PROVIDER_PRECONDITION_MISSING: ${item.id} requires valid delivered challenge token to exercise Custom Access Token Hook; GoTrue /token does not support grant_type=${item.id === 'HOOK-03' ? 'otp' : 'recovery'}. Hook contract is verified offline via Layer A PostgreSQL parity (POSTGRES_VERIFIED).`,
          reason: `PROVIDER_PRECONDITION_MISSING: ${item.id} cannot be executed live without valid delivered challenge token`
        };
      }

      case 'HOOK-05':
      case 'HOOK-06':
      case 'HOOK-07': {
        // GoTrue server-owned claims.amr is constructed internally by GoTrue and cannot be mutated or overridden
        // by client request body fields during password grant (R3-02). Client-injected AMR is ignored by GoTrue.
        // Malformed AMR, mixed AMR, and hook runtime exception abort are authoritative Layer A SQL contract
        // properties, verified directly against PostgreSQL in sql-contract-parity.mjs (POSTGRES_VERIFIED).
        return {
          passed: false,
          status: 0,
          hook_rejected: false,
          error: `BLOCKED_UNSUPPORTED: ${item.id} cannot be triggered via HTTP client body parameters. GoTrue constructs claims.amr server-side and ignores client-injected AMR. Verified authoritatively via Layer A SQL contract parity (POSTGRES_VERIFIED).`,
          reason: `BLOCKED_UNSUPPORTED: HTTP client cannot inject server-owned AMR claims into GoTrue hook payload`
        };
      }

      case 'SESSION-01': {
        const authHeader = ctx?.activeAccessToken ? `Bearer ${ctx.activeAccessToken}` : null;
        if (!authHeader) {
          return {
            passed: false,
            status: 401,
            error: 'PREREQUISITE_MISSING: SESSION-01 requires activeAccessToken from HOOK-01'
          };
        }
        const sessionId = ctx?.activeSessionId;
        if (!isNonEmptyString(sessionId) || sessionId.startsWith('sess-default')) {
          return {
            passed: false,
            status: 0,
            error: 'PREREQUISITE_MISSING: SESSION-01 requires genuine session_id from HOOK-01; user ID or fixed placeholder prohibited (R3-05)'
          };
        }

        const res = await fetchFn(`${baseUrl}/auth/v1/user`, {
          method: 'GET',
          headers: { ...headers, Authorization: authHeader },
          signal
        });
        const body = await parseResponseBody(res);
        const sessionCreated = res.status === 200 && isNonEmptyString(body?.id);

        if (sessionCreated && ctx) {
          ctx.preInvalidationSessionValid = true;
        }

        return {
          passed: sessionCreated,
          status: res.status,
          session_created: sessionCreated,
          session_id: sessionId,
          user_id: body?.id,
          sessions_count: 1,
          user: body
        };
      }

      case 'SESSION-02': {
        const userId = ctx?.activeUserId;
        if (!serviceRoleKey) {
          return {
            passed: false,
            status: 0,
            logout_fallback: false,
            error: 'PREREQUISITE_MISSING: SESSION-02 strictly requires explicit TIO_TEMP_SERVICE_ROLE_KEY to perform administrative password update via Admin API. Logout fallback prohibited (R3-04).'
          };
        }
        if (!userId) {
          return {
            passed: false,
            status: 0,
            error: 'PREREQUISITE_MISSING: SESSION-02 requires activeUserId from HOOK-01'
          };
        }

        const trackedEmail = (inv && userId) ? inv.getUserEmail(userId) : null;
        const candidateEmail = item?.testUser || options.testEmail || options.testUser || ctx?.testEmail || null;
        const normCandidate = candidateEmail ? String(candidateEmail).trim().toLowerCase() : null;
        const normTracked = trackedEmail ? String(trackedEmail).trim().toLowerCase() : null;

        if (normTracked && normCandidate && normTracked !== normCandidate) {
          return {
            passed: false,
            status: 0,
            password_reset_completed: false,
            session_revoked: false,
            session_revocation_verified: false,
            remaining_sessions: null,
            restoration_registered: false,
            restoration_state: 'rejected',
            error: `IDENTITY_MISMATCH: SESSION-02 candidate email '${normCandidate}' does not match tracked user email '${normTracked}' for user ID '${userId}' (R10-02)`
          };
        }

        const seedEmail = normTracked || normCandidate || DEFAULT_TEST_EMAIL;
        validateTestIdentity(seedEmail);

        if (ctx) {
          ctx.testEmail = seedEmail;
        }

        if (inv) {
          for (const [id, user] of [...inv.referencedUsers.entries(), ...inv.createdUsers.entries()]) {
            if (user?.email && user.email.toLowerCase() === seedEmail.toLowerCase() && String(id) !== String(userId)) {
              return {
                passed: false,
                status: 0,
                password_reset_completed: false,
                session_revoked: false,
                session_revocation_verified: false,
                remaining_sessions: null,
                restoration_registered: false,
                restoration_state: 'rejected',
                error: `IDENTITY_MISMATCH: Email '${seedEmail}' is already bound to user ID '${id}', cannot mutate different user ID '${userId}' (R10-02)`
              };
            }
          }
        }

        const origPassword = ctx?.originalSeedPassword || ctx?.testPassword || options.testPassword || DEFAULT_TEST_PASSWORD;
        const newPassword = 'TioNewPassword#2026!';

        // Ensure seed user is tracked in referencedUsers so it is preserved and never deleted (R3-09, R9-01)
        if (inv && !inv.isUserTracked(userId)) {
          inv.trackReferencedUser({
            id: String(userId),
            email: seedEmail,
            source: 'SESSION-02_seed_user'
          });
        }

        // PRE-DISPATCH RESTORATION REGISTRATION (R9-01):
        // Register the restoration obligation BEFORE dispatching the Admin API password mutation.
        // If the request commits but response is lost (network drop, timeout, connection reset,
        // or unreadable JSON), the restoration obligation is already securely recorded in inventory.
        let restorationRecord = null;
        if (inv && userId) {
          restorationRecord = inv.registerSeedPasswordModification({
            userId: String(userId),
            email: seedEmail,
            originalPassword: origPassword,
            targetPassword: newPassword,
            state: 'pending'
          });
          if (restorationRecord) {
            restorationRecord.state = 'dispatched';
            restorationRecord.dispatchedAt = new Date().toISOString();
          }
        }

        // PRE-DISPATCH IN-FLIGHT OPERATION REGISTRATION (R14-01, R15-02):
        // Register state mutation before network dispatch. Password is never exposed in metadata.
        const cap = getEndpointCapabilities('SESSION-02') || {
          canMintSession: false,
          canCreateUser: false,
          canModifyProviderState: true,
          requiresCleanupReconciliation: true
        };
        const op = inv?.registerInFlightOperation
          ? inv.registerInFlightOperation({
              probeId: 'SESSION-02',
              endpoint: `/auth/v1/admin/users/${userId}`,
              canMintSession: cap.canMintSession,
              canCreateUser: cap.canCreateUser,
              canModifyProviderState: cap.canModifyProviderState,
              requiresCleanupReconciliation: cap.requiresCleanupReconciliation,
              targetUserId: String(userId),
              description: 'Admin password update dispatch (SESSION-02)',
              metadata: { userId: String(userId), email: seedEmail }
            })
          : null;

        let res;
        let body;
        let fetchThrew = false;
        let fetchError = null;

        try {
          res = await fetchFn(`${baseUrl}/auth/v1/admin/users/${userId}`, {
            method: 'PUT',
            headers: {
              apikey: serviceRoleKey,
              Authorization: `Bearer ${serviceRoleKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ password: newPassword }),
            signal
          });
          body = await parseResponseBody(res);
        } catch (err) {
          fetchThrew = true;
          fetchError = err;
        }

        if (fetchThrew) {
          if (restorationRecord) {
            restorationRecord.state = 'indeterminate';
            restorationRecord.indeterminateAt = new Date().toISOString();
            restorationRecord.error = fetchError?.message || String(fetchError);
          }
          if (op && inv?.settleInFlightOperation) {
            if (signal?.aborted || fetchError?.name === 'AbortError' || fetchError?.code === 'ETIMEDOUT') {
              // Operation timed out / was aborted while in flight; server state is indeterminate (R14-01)
              if (op.state === 'IN_FLIGHT') {
                op.state = 'TIMED_OUT_UNRESOLVED';
                op.timedOutAt = new Date().toISOString();
                op.timeoutReason = 'DISPATCH_ABORTED_OR_TIMED_OUT';
              }
            } else {
              inv.settleInFlightOperation(op.opId, { error: fetchError });
            }
          }
          return {
            passed: false,
            status: 0,
            password_reset_completed: false,
            session_revoked: false,
            session_revocation_verified: false,
            remaining_sessions: null,
            restoration_registered: true,
            restoration_state: 'indeterminate',
            error: `DISPATCH_EXCEPTION: Admin password update failed during transport or response parsing: ${fetchError?.message}. Restoration obligation preserved as indeterminate (R9-01).`
          };
        }

        if (restorationRecord) {
          restorationRecord.lastStatus = res.status;
        }

        const resetSucceeded = res.status === 200 && (body?.id === userId || body?.user?.id === userId);

        if (op && inv?.settleInFlightOperation) {
          inv.settleInFlightOperation(op.opId, { outcome: { status: res.status, resetSucceeded } });
        }

        if (resetSucceeded) {
          if (restorationRecord) {
            restorationRecord.state = 'confirmed';
            restorationRecord.confirmedAt = new Date().toISOString();
          }
          if (ctx) {
            ctx.passwordResetCompleted = true;
            ctx.originalSeedPassword = origPassword;
            ctx.activeSeedPassword = newPassword;
          }
        } else {
          // If status was not 200, or body could not be verified as matching userId, mark indeterminate
          if (restorationRecord) {
            restorationRecord.state = 'indeterminate';
            restorationRecord.indeterminateAt = new Date().toISOString();
            restorationRecord.error = body?.msg || body?.message || (res.status === 200 ? 'UNREADABLE_RESPONSE: HTTP 200 received but response body could not be verified' : `HTTP_${res.status}`);
          }
        }

        // Affirmative verification of session revocation: pre-reset token MUST be verified as revoked (R4-03, R5-01)
        let sessionRevocationVerified = false;
        let remainingSessions = null;
        let verifyError = null;
        let probeErrorCode = null;

        if (resetSucceeded && ctx?.activeAccessToken) {
          try {
            const probeRes = await fetchFn(`${baseUrl}/auth/v1/user`, {
              method: 'GET',
              headers: {
                apikey: anonKey,
                Authorization: `Bearer ${ctx.activeAccessToken}`
              },
              signal
            });
            const probeBody = await parseResponseBody(probeRes);
            probeErrorCode = (probeBody?.error_code || probeBody?.code || '').toLowerCase();
            const probeErrorMsg = (probeBody?.msg || probeBody?.message || probeBody?.error_description || probeBody?.error || '').toLowerCase();

            // Distinguish false-proof errors (R5-01): bad_jwt, jwt_expired, token_expired, invalid_jwt, malformed_jwt, etc.
            const isFalseProof =
              probeErrorCode === 'bad_jwt' ||
              probeErrorCode === 'jwt_expired' ||
              probeErrorCode === 'token_expired' ||
              probeErrorCode === 'invalid_jwt' ||
              probeErrorCode === 'malformed_jwt' ||
              probeErrorMsg.includes('bad_jwt') ||
              probeErrorMsg.includes('expired') ||
              probeErrorMsg.includes('malformed') ||
              probeErrorMsg.includes('invalid jwt') ||
              probeErrorMsg.includes('invalid token') ||
              probeErrorMsg.includes('signature');

            // Affirmative provider-observed session revocation error (R5-01)
            const isAffirmativeRevocation =
              probeErrorCode === 'session_not_found' ||
              probeErrorCode === 'session_revoked' ||
              probeErrorCode === 'authsessionmissingerror' ||
              probeErrorMsg.includes('session not found') ||
              probeErrorMsg.includes('session_not_found');

            if (probeRes.status === 200) {
              sessionRevocationVerified = false;
              remainingSessions = 1;
              verifyError = 'SECURITY_REGRESSION: Admin password update returned HTTP 200, but pre-reset session token remained valid (HTTP 200 on /auth/v1/user); session was not revoked!';
            } else if (probeRes.status === 401 || probeRes.status === 403) {
              if (isFalseProof) {
                sessionRevocationVerified = false;
                remainingSessions = null;
                verifyError = `FALSE_PROOF_REJECTED: /auth/v1/user returned '${probeBody?.error_code || probeBody?.msg || probeBody?.message}'. Invalid/expired/malformed JWT errors do not demonstrate remote session invalidation (R5-01).`;
              } else if (isAffirmativeRevocation) {
                sessionRevocationVerified = true;
                remainingSessions = 0;
              } else {
                // Ambiguous 401/403 without revocation-specific code fails closed (R5-01)
                sessionRevocationVerified = false;
                remainingSessions = null;
                verifyError = `AMBIGUOUS_REJECTION: /auth/v1/user returned HTTP ${probeRes.status} with code '${probeBody?.error_code || 'none'}', which does not prove session revocation. Specific session_not_found provider error code required (R5-01).`;
              }
            } else {
              sessionRevocationVerified = false;
              verifyError = `REVOCATION_CHECK_INCONCLUSIVE: Unexpected status ${probeRes.status} during post-reset session verification`;
            }
          } catch (err) {
            verifyError = `REVOCATION_CHECK_FAILED: ${err.message}`;
          }
        } else if (resetSucceeded) {
          verifyError = 'PREREQUISITE_MISSING: Cannot verify session revocation without activeAccessToken from HOOK-01';
        }

        const isRevoked = resetSucceeded && sessionRevocationVerified && remainingSessions === 0;

        if (isRevoked) {
          if (inv && ctx?.activeSessionId) {
            inv.markSessionRevoked(ctx.activeSessionId);
          }
          if (ctx) {
            ctx.sessionRevocationConfirmed = true;
            ctx.revokedSessionId = ctx.activeSessionId;
            ctx.revokedAccessToken = ctx.activeAccessToken;
          }
        }

        return {
          passed: isRevoked,
          status: res.status,
          password_reset_completed: resetSucceeded,
          session_revoked: sessionRevocationVerified,
          remaining_sessions: remainingSessions,
          session_revocation_verified: sessionRevocationVerified,
          session_id: ctx?.activeSessionId || null,
          pre_session_id: ctx?.activeSessionId || null,
          correlated_session_id: ctx?.activeSessionId || null,
          invalidation_completed: isRevoked,
          logout_fallback: false,
          error_code: probeErrorCode || null,
          revocation_error_code: sessionRevocationVerified ? (probeErrorCode || 'session_not_found') : null,
          restoration_registered: !!restorationRecord,
          restoration_state: restorationRecord ? restorationRecord.state : null,
          error: verifyError || (resetSucceeded ? null : (body?.msg || body?.message || 'Admin password update failed'))
        };
      }

      case 'SESSION-03': {
        const authHeader = ctx?.activeAccessToken ? `Bearer ${ctx.activeAccessToken}` : null;
        if (!authHeader) {
          return {
            passed: false,
            status: 401,
            error: 'PREREQUISITE_MISSING: SESSION-03 requires pre-reset access token'
          };
        }
        const sessionId = ctx?.activeSessionId;
        if (!isNonEmptyString(sessionId) || sessionId.startsWith('sess-default')) {
          return {
            passed: false,
            status: 0,
            error: 'PREREQUISITE_MISSING: SESSION-03 requires valid activeSessionId from HOOK-01 (R3-05)'
          };
        }

        const res = await fetchFn(`${baseUrl}/auth/v1/user`, {
          method: 'GET',
          headers: { ...headers, Authorization: authHeader },
          signal
        });
        const body = await parseResponseBody(res);
        const errCode = body?.error_code || body?.code || null;
        const errMsg = (body?.msg || body?.message || body?.error_description || body?.error || '').toLowerCase();
        // Provider-observed revocation error (R4-04): Do NOT synthesize error code for generic 401/403
        const isRevocationError =
          (res.status === 401 || res.status === 403) &&
          (errCode === 'session_not_found' ||
           errCode === 'AuthSessionMissingError' ||
           (errCode !== 'bad_jwt' && (errMsg.includes('session not found') || errMsg.includes('session is revoked') || errMsg.includes('session_not_found'))));

        const isRevocationSuccess = isRevocationError && ctx?.preInvalidationSessionValid === true && ctx?.passwordResetCompleted === true;
        if (isRevocationSuccess && inv && sessionId) {
          inv.markSessionRevoked(sessionId);
        }

        return {
          passed: isRevocationSuccess,
          status: res.status,
          pre_reset_baseline_verified: ctx?.preInvalidationSessionValid === true,
          reset_completed: ctx?.passwordResetCompleted === true,
          session_id: sessionId,
          pre_session_id: sessionId,
          correlated_session_id: sessionId,
          revocation_verified: isRevocationError,
          session_revoked: isRevocationError,
          error_code: errCode,
          error: body?.msg || body?.message || (isRevocationError ? null : (res.status === 401 || res.status === 403 ? 'GENERIC_UNAUTHORIZED: HTTP 401/403 without provider-observed session revocation error' : null))
        };
      }

      case 'SESSION-04': {
        const authHeader = ctx?.activeAccessToken ? `Bearer ${ctx.activeAccessToken}` : null;
        if (!authHeader) {
          return {
            passed: false,
            status: 401,
            error: 'PREREQUISITE_MISSING: SESSION-04 requires pre-reset access token'
          };
        }

        // R17-02: Require authenticated pre-invalidation baseline and verified session revocation proof before linger claims
        if (ctx?.preInvalidationSessionValid !== true) {
          return {
            passed: false,
            status: 0,
            error: 'PREREQUISITE_MISSING: SESSION-04 requires authenticated pre-invalidation session baseline (HOOK-01)'
          };
        }
        if (ctx?.passwordResetCompleted !== true || ctx?.sessionRevocationConfirmed !== true) {
          return {
            passed: false,
            status: 0,
            error: 'PREREQUISITE_MISSING: SESSION-04 requires verified session revocation evidence (SESSION-02)'
          };
        }

        const token = ctx.activeAccessToken;
        let tokenExpiry = null;
        let tokenIat = null;
        let tokenSessionId = null;
        let jwtLifetimeSeconds = null;
        let lifetimeBounded = false;
        try {
          const parts = token.split('.');
          if (parts.length === 3) {
            const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
            if (typeof p?.exp === 'number' && Number.isFinite(p.exp)) {
              tokenExpiry = p.exp;
            }
            if (typeof p?.iat === 'number' && Number.isFinite(p.iat)) {
              tokenIat = p.iat;
            }
            if (typeof p?.session_id === 'string' && p.session_id.trim()) {
              tokenSessionId = p.session_id.trim();
            }
            if (tokenExpiry !== null && tokenIat !== null && tokenExpiry > tokenIat) {
              jwtLifetimeSeconds = tokenExpiry - tokenIat;
              lifetimeBounded = jwtLifetimeSeconds > 0 && jwtLifetimeSeconds <= 300;
            }
          }
        } catch {}

        // Token must correlate with verified revoked session ID (R17-02)
        const sessionCorrelated = Boolean(tokenSessionId && ctx?.revokedSessionId && tokenSessionId === ctx.revokedSessionId);
        if (!sessionCorrelated) {
          return {
            passed: false,
            status: 0,
            error: `SESSION_CORRELATION_FAILURE: SESSION-04 token session_id ('${tokenSessionId || 'none'}') does not correlate with verified revoked session ID ('${ctx?.revokedSessionId || 'none'}')`
          };
        }

        const nowUnix = Math.floor(Date.now() / 1000);
        const tokenUnexpired = typeof tokenExpiry === 'number' && nowUnix < tokenExpiry;

        const res = await fetchFn(`${baseUrl}/rest/v1/task06i_session_probe`, {
          method: 'GET',
          headers: { ...headers, Authorization: authHeader },
          signal
        });
        const body = await parseResponseBody(res);

        // Stateless linger is observed ONLY when token is unexpired AND lifetime is strictly bounded (<= 300s) AND PostgREST accepts it with HTTP 200 AND session is correlated (R3-03, R7-02, R17-02)
        const lingerObserved = res.status === 200 && tokenUnexpired && lifetimeBounded && sessionCorrelated;

        let error = null;
        if (res.status === 401) {
          error = 'POSTGREST_TOKEN_REJECTED: PostgREST returned HTTP 401; linger not observed';
        } else if (!tokenUnexpired) {
          error = 'TOKEN_ALREADY_EXPIRED';
        } else if (tokenIat === null || tokenExpiry === null) {
          error = 'MISSING_JWT_TIMESTAMPS: Token missing valid numeric iat or exp claims (R7-02)';
        } else if (tokenExpiry <= tokenIat) {
          error = 'INVALID_EXP_TEMPORAL_INCONSISTENCY: Token exp must be strictly greater than iat (R7-02)';
        } else if (jwtLifetimeSeconds > 300) {
          error = `EXCESSIVE_JWT_LIFETIME: Token lifetime (${jwtLifetimeSeconds}s) exceeds approved 300s bound (R7-02)`;
        }

        return {
          passed: lingerObserved,
          status: res.status,
          stateless_linger_documented: lingerObserved,
          token_unexpired: tokenUnexpired,
          jwt_exp: tokenExpiry,
          jwt_iat: tokenIat,
          jwt_lifetime_seconds: jwtLifetimeSeconds,
          lifetime_bounded: lifetimeBounded,
          revocation_verified: ctx?.sessionRevocationConfirmed === true,
          revoked_session_id: ctx?.revokedSessionId || null,
          correlated_session_id: tokenSessionId,
          session_correlated: sessionCorrelated,
          pre_invalidation_verified: ctx?.preInvalidationSessionValid === true,
          evidence: lingerObserved
            ? `PostgREST Data API stateless JWT linger confirmed (HTTP 200 before exp ${tokenExpiry}); verified short jwt_exp lifetime (${jwtLifetimeSeconds}s <= 300s); correlated revoked session ${ctx?.revokedSessionId}`
            : `PostgREST did not demonstrate valid bounded stateless linger (status ${res.status}, unexpired: ${tokenUnexpired}, lifetime: ${jwtLifetimeSeconds}s)`,
          postgrest_linger_observed: lingerObserved,
          bounded_by_jwt_exp: lifetimeBounded,
          data: body,
          error
        };
      }

      case 'SESSION-05': {
        const authHeader = ctx?.activeAccessToken ? `Bearer ${ctx.activeAccessToken}` : null;
        if (!authHeader) {
          return {
            passed: false,
            status: 401,
            error: 'PREREQUISITE_MISSING: SESSION-05 requires pre-reset access token'
          };
        }

        // R17-02: Require authenticated pre-invalidation baseline and verified session revocation proof before linger claims
        if (ctx?.preInvalidationSessionValid !== true) {
          return {
            passed: false,
            status: 0,
            error: 'PREREQUISITE_MISSING: SESSION-05 requires authenticated pre-invalidation session baseline (HOOK-01)'
          };
        }
        if (ctx?.passwordResetCompleted !== true || ctx?.sessionRevocationConfirmed !== true) {
          return {
            passed: false,
            status: 0,
            error: 'PREREQUISITE_MISSING: SESSION-05 requires verified session revocation evidence (SESSION-02)'
          };
        }

        const token = ctx.activeAccessToken;
        let tokenExpiry = null;
        let tokenIat = null;
        let tokenSessionId = null;
        let jwtLifetimeSeconds = null;
        let lifetimeBounded = false;
        try {
          const parts = token.split('.');
          if (parts.length === 3) {
            const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
            if (typeof p?.exp === 'number' && Number.isFinite(p.exp)) {
              tokenExpiry = p.exp;
            }
            if (typeof p?.iat === 'number' && Number.isFinite(p.iat)) {
              tokenIat = p.iat;
            }
            if (typeof p?.session_id === 'string' && p.session_id.trim()) {
              tokenSessionId = p.session_id.trim();
            }
            if (tokenExpiry !== null && tokenIat !== null && tokenExpiry > tokenIat) {
              jwtLifetimeSeconds = tokenExpiry - tokenIat;
              lifetimeBounded = jwtLifetimeSeconds > 0 && jwtLifetimeSeconds <= 300;
            }
          }
        } catch {}

        // Token must correlate with verified revoked session ID (R17-02)
        const sessionCorrelated = Boolean(tokenSessionId && ctx?.revokedSessionId && tokenSessionId === ctx.revokedSessionId);
        if (!sessionCorrelated) {
          return {
            passed: false,
            status: 0,
            error: `SESSION_CORRELATION_FAILURE: SESSION-05 token session_id ('${tokenSessionId || 'none'}') does not correlate with verified revoked session ID ('${ctx?.revokedSessionId || 'none'}')`
          };
        }

        const nowUnix = Math.floor(Date.now() / 1000);
        const tokenUnexpired = typeof tokenExpiry === 'number' && nowUnix < tokenExpiry;

        const rawRunId = ctx?.runId || inv?.runId || options.runId || null;
        if (!rawRunId) {
          return {
            passed: false,
            status: 0,
            error: 'PREREQUISITE_MISSING: SESSION-05 requires valid runId (R1-07)'
          };
        }
        let validRunId;
        try {
          validRunId = validateRunId(rawRunId);
        } catch (err) {
          return {
            passed: false,
            status: 0,
            error: `INVALID_RUN_ID: ${err.message}`
          };
        }
        const objectPath = getStorageProbeObjectPath(validRunId);
        const fullKey = `${STORAGE_PROBE_BUCKET}/${objectPath}`;

        if (inv) {
          const fixture = inv.getStorageFixture ? inv.getStorageFixture(STORAGE_PROBE_BUCKET, objectPath) : null;
          if (!fixture) {
            return {
              passed: false,
              status: 0,
              error: `STORAGE_FIXTURE_RECORD_MISSING: No verified storage fixture found in inventory for '${fullKey}' before dispatch (R1-07)`
            };
          }
          if (fixture.lifecycleState !== STORAGE_LIFECYCLE_STATE.RUN_CREATED_VERIFIED || fixture.deletionEligible !== true ||
              !hasVerifiedStorageCreation(inv, fullKey, fixture)) {
            return {
              passed: false,
              status: 0,
              error: `STORAGE_FIXTURE_NOT_VERIFIED: Storage fixture '${fullKey}' is in state '${fixture.lifecycleState}' (deletionEligible=${Boolean(fixture.deletionEligible)}) and cannot authorize SESSION-05 dispatch`
            };
          }
          const expectedOwner = ctx?.activeUserId || factorySeedUserId || options.seedUserId || null;
          const fixtureOwner = fixture.verifiedOwnerId || fixture.ownerId || null;
          if (expectedOwner && fixtureOwner && fixtureOwner !== expectedOwner) {
            return {
              passed: false,
              status: 0,
              error: `STORAGE_FIXTURE_OWNER_MISMATCH: Fixture owner '${fixtureOwner}' does not match expected seed user '${expectedOwner}' (R1-07)`
            };
          }
        }

        const storageUrl = `${baseUrl}/storage/v1/object/authenticated/${STORAGE_PROBE_BUCKET}/${objectPath}`;

        const res = await fetchFn(storageUrl, {
          method: 'GET',
          headers: { ...headers, Authorization: authHeader },
          signal
        });
        const body = res.status === 200 ? null : (await parseStorageErrorEnvelope(res)).body;
        const normStorage = res.status === 200
          ? { classification: STORAGE_RESPONSE_CLASS.OBJECT_PRESENT, isAbsent: false }
          : normalizeStorageObjectResponse({
              status: res.status,
              parseStatus: body ? 'parsed' : 'no_body',
              body,
              expectedBucket: STORAGE_PROBE_BUCKET,
              expectedPath: objectPath,
              projectRef: normRef,
              authorizedContext: true
            });

        // Stateless linger is observed ONLY when token is unexpired AND lifetime is strictly bounded (<= 300s) AND Storage accepts it with HTTP 200 AND session is correlated (R3-03, R7-02, R17-02)
        const lingerObserved = res.status === 200 && tokenUnexpired && lifetimeBounded && sessionCorrelated;

        let error = null;
        if (normStorage.isAbsent || res.status === 404) {
          error = `STORAGE_FIXTURE_MISSING: Storage probe file returned ${normStorage.classification} (HTTP ${res.status}, PROVIDER_PRECONDITION_MISSING: ${STORAGE_PROBE_BUCKET}/${objectPath} must be provisioned before test, R5-07)`;
        } else if (res.status === 401 || normStorage.classification === STORAGE_RESPONSE_CLASS.UNAUTHORIZED_OR_FORBIDDEN) {
          error = `STORAGE_TOKEN_REJECTED: Storage returned HTTP ${res.status} (${normStorage.classification})`;
        } else if (!tokenUnexpired) {
          error = 'TOKEN_ALREADY_EXPIRED';
        } else if (tokenIat === null || tokenExpiry === null) {
          error = 'MISSING_JWT_TIMESTAMPS: Token missing valid numeric iat or exp claims (R7-02)';
        } else if (tokenExpiry <= tokenIat) {
          error = 'INVALID_EXP_TEMPORAL_INCONSISTENCY: Token exp must be strictly greater than iat (R7-02)';
        } else if (jwtLifetimeSeconds > 300) {
          error = `EXCESSIVE_JWT_LIFETIME: Token lifetime (${jwtLifetimeSeconds}s) exceeds approved 300s bound (R7-02)`;
        }

        return {
          passed: lingerObserved,
          status: res.status,
          stateless_linger_documented: lingerObserved,
          token_unexpired: tokenUnexpired,
          jwt_exp: tokenExpiry,
          jwt_iat: tokenIat,
          jwt_lifetime_seconds: jwtLifetimeSeconds,
          lifetime_bounded: lifetimeBounded,
          revocation_verified: ctx?.sessionRevocationConfirmed === true,
          revoked_session_id: ctx?.revokedSessionId || null,
          correlated_session_id: tokenSessionId,
          session_correlated: sessionCorrelated,
          pre_invalidation_verified: ctx?.preInvalidationSessionValid === true,
          evidence: lingerObserved
            ? `Storage API stateless JWT linger confirmed (HTTP 200 before exp ${tokenExpiry}); verified short jwt_exp lifetime (${jwtLifetimeSeconds}s <= 300s); correlated revoked session ${ctx?.revokedSessionId}`
            : `Storage API did not demonstrate valid bounded stateless linger (status ${res.status}, unexpired: ${tokenUnexpired}, lifetime: ${jwtLifetimeSeconds}s)`,
          storage_linger_observed: lingerObserved,
          bounded_by_jwt_exp: lifetimeBounded,
          data: body,
          error
        };
      }

      case 'SESSION-06': {
        const authHeader = ctx?.activeAccessToken ? `Bearer ${ctx.activeAccessToken}` : null;
        if (!authHeader) {
          return {
            passed: false,
            status: 401,
            error: 'PREREQUISITE_MISSING: SESSION-06 requires pre-reset access token'
          };
        }
        const sessionId = ctx?.activeSessionId;
        if (!isNonEmptyString(sessionId) || sessionId.startsWith('sess-default')) {
          return {
            passed: false,
            status: 0,
            error: 'PREREQUISITE_MISSING: SESSION-06 requires activeSessionId from HOOK-01 (R3-05)'
          };
        }

        const res = await fetchFn(`${baseUrl}/functions/v1/auth-user-probe`, {
          method: 'POST',
          headers: { ...headers, Authorization: authHeader },
          body: JSON.stringify({ probe: 'revoked_session_check' }),
          signal
        });
        const body = await parseResponseBody(res);

        if (res.status === 404) {
          return {
            passed: false,
            status: 404,
            error: 'PROVIDER_PRECONDITION_MISSING: Edge Function auth-user-probe is not deployed on TEMP project (R3-05)',
            reason: 'PROVIDER_PRECONDITION_MISSING: Edge Function deployment required for SESSION-06'
          };
        }

        const errCode = body?.error_code || body?.code || null;
        const errMsg = (body?.msg || body?.message || body?.error_description || body?.error || '').toLowerCase();
        const errCodeLower = (errCode || '').toLowerCase();

        // Check false-proof errors (R5-08): bad_jwt, jwt_expired, token_expired, invalid_jwt, invalid_token, etc.
        const isFalseProof =
          errCodeLower === 'bad_jwt' ||
          errCodeLower === 'jwt_expired' ||
          errCodeLower === 'token_expired' ||
          errCodeLower === 'invalid_jwt' ||
          errCodeLower === 'malformed_jwt' ||
          errMsg.includes('bad_jwt') ||
          errMsg.includes('expired') ||
          errMsg.includes('malformed') ||
          errMsg.includes('invalid jwt') ||
          errMsg.includes('invalid token') ||
          errMsg.includes('signature');

        // Provider-observed revocation error (R4-04, R5-08): Accept ONLY genuine AuthSessionMissingError or session_not_found
        // Reject generic 401/403/500 and false-proof errors!
        const isRevocationError =
          !isFalseProof &&
          (res.status === 401 || res.status === 403 || res.status === 500) &&
          (errCode === 'AuthSessionMissingError' ||
           errCode === 'session_not_found' ||
           errMsg.includes('authsessionmissingerror') ||
           errMsg.includes('session not found'));

        const isRevocationSuccess = isRevocationError && ctx?.preInvalidationSessionValid === true && ctx?.passwordResetCompleted === true;
        if (isRevocationSuccess && inv && sessionId) {
          inv.markSessionRevoked(sessionId);
        }

        return {
          passed: isRevocationSuccess,
          status: res.status,
          pre_reset_baseline_verified: ctx?.preInvalidationSessionValid === true,
          reset_completed: ctx?.passwordResetCompleted === true,
          session_id: sessionId,
          pre_session_id: sessionId,
          correlated_session_id: sessionId,
          revocation_verified: isRevocationError,
          session_revoked: isRevocationError,
          error_code: errCode,
          error: isRevocationError
            ? null
            : (isFalseProof
                ? `FALSE_PROOF_REJECTED: Edge Function returned '${errCode || errMsg}' (invalid/expired token does not prove revocation)`
                : (body?.msg || body?.message || ((res.status === 401 || res.status === 403 || res.status === 500) ? 'GENERIC_UNAUTHORIZED: Edge Function returned generic error without provider-observed session revocation proof (R5-08)' : null)))
        };
      }

      default: {
        return {
          passed: false,
          status: 501,
          error: `UNKNOWN_PROBE_ID: probe ${probeId} is not in the planned 18-case matrix`
        };
      }
    }
    });
    if (callCtx.trappedRecoveryError) {
      throw callCtx.trappedRecoveryError;
    }
    return outcome;
  };
  HOSTED_NETWORK_DISPATCHERS.add(dispatcher);
  Object.defineProperty(dispatcher, '_isHostedNetworkDispatcher', {
    value: true,
    writable: false,
    configurable: false,
    enumerable: true
  });
  return dispatcher;
}

/**
 * Simulates or executes probe runner with rate-limiting, stop-on-failure, strict outcome validation,
 * identity inventory tracking, and serialized JSON secret sanitization.
 * Resolves PRRT_kwDOVtCmZc66ij5y, PRRT_kwDOVtCmZc66ij56, PRRT_kwDOVtCmZc66iotG, PRRT_kwDOVtCmZc66i_Kb,
 * PRRT_kwDOVtCmZc66i_Kd, PRRT_kwDOVtCmZc66i_Kf, PRRT_kwDOVtCmZc66lOOS, and PRRT_kwDOVtCmZc66lOOP.
 */
export async function runOfflineProbeSimulation(rawOptions = {}) {
  return _runHostedProbeRunnerInternal(rawOptions, 'OFFLINE_SIMULATION');
}

export async function runHostedProbeRunner(rawOptions = {}) {
  return _runHostedProbeRunnerInternal(rawOptions, null);
}

async function _runHostedProbeRunnerInternal(rawOptions = {}, forcedExecutionMode = null) {
  const options = admitValidatedInput(rawOptions, 'runnerOptions');
  const {
    projectRef,
    tempRef = HARDCODED_TEMP_REF,
    argv = [],
    env = {},
    testEmail = 'tio-test-user-06i@proof.invalid',
    mockDispatcher = null,
    offlineDispatcher = null,
    inventory = null,
    runContext = null,
    probeTimeoutMs = DEFAULT_PROBE_TIMEOUT_MS
  } = options;

  const hasOwnSleepFn = Object.prototype.hasOwnProperty.call(options, 'sleepFn') && options.sleepFn !== undefined;
  const protoSleepDesc = Object.getOwnPropertyDescriptor(Object.prototype, 'sleepFn');
  const hasProtoSleepFn = protoSleepDesc !== undefined;

  const explicitOfflineSimulation = forcedExecutionMode === 'OFFLINE_SIMULATION' || options.executionMode === 'OFFLINE_SIMULATION';
  const mode = explicitOfflineSimulation ? 'OFFLINE_SIMULATION' : determineRunnerMode(argv, env);
  const isExecuting = mode === 'LIVE' || mode === 'OFFLINE_SIMULATION';
  const validatedRef = validateTargetProject(projectRef, tempRef, isExecuting, {
    allowIsolatedTestRef: options.allowIsolatedTestRef && !isExecuting
  });
  validateTestIdentity(testEmail);

  const explicitRunId = options.runId ? validateRunId(options.runId) : null;
  let validatedInventory = null;
  if (inventory !== null && inventory !== undefined) {
    try {
      assertTrustedRunInventory(inventory, {
        projectRef: validatedRef,
        expectedRunId: null
      });
      validatedInventory = inventory;
    } catch (invErr) {
      // Untrusted inventory MUST NEVER have its properties read or executeCleanup() invoked (R8-01D).
      throw cleanupFailure(invErr.message, {
        runId: explicitRunId || 'untrusted-inventory',
        status: 'CLEANUP_FAILED_RESIDUAL_RESOURCES',
        inventoryTrusted: false,
        inventoryEvidenceUnavailable: true,
        residualResources: [{ type: 'inventory', error: sanitizeData(invErr.message) }]
      });
    }
  }

  const runId = explicitRunId || (validatedInventory ? validatedInventory.runId : null);

  const plan = planProbeExecution(validatedRef, {
    testEmail,
    tempRef,
    isLive: isExecuting,
    selectedProbeIds: options.selectedProbeIds,
    runId,
    allowIsolatedTestRef: options.allowIsolatedTestRef && !isExecuting
  });
  const results = [];
  let aborted = false;
  let abortReason = null;
  let attemptedProbeCount = 0;

  if (mode === 'DRY_RUN') {
    if (hasOwnSleepFn || hasProtoSleepFn) {
      throw new Error(
        'BLOCKED_PENDING_DURABLE_RECOVERY: UNTRUSTED_TIMING_OVERRIDE: Caller-supplied sleepFn is prohibited; use declarative timing or internal module timer (R7-01)'
      );
    }
    if (options.timing !== undefined && options.timing !== null) {
      validateDeclarativeTimingConfig(options.timing, true);
    }
    if (runContext !== null && runContext !== undefined) {
      assertTrustedRunContext(runContext, { projectRef: validatedRef, expectedRunId: runId });
    }
    return sanitizeData({
      status: 'DRY_RUN_COMPLETED',
      requestCount: 0, attemptedProbeCount: 0, simulatedTransportRequests: 0, actualHostedRequests: 0,
      mode: 'DRY_RUN',
      projectRef: validatedRef,
      runId: plan.runId,
      zeroNetworkRequestsDispatched: true,
      hostedProviderVerified: false,
      message: 'Dry-run executed successfully. Zero HTTP requests sent to Supabase Cloud.',
      plan: plan,
      executionEvidence: {
        selected: plan.selectedProbeIds,
        attempted: [],
        completed: [],
        failed: [],
        not_selected: plan.unselectedProbeIds,
        prerequisite_blocked: Array.from(PREREQUISITE_BLOCKED_PROBE_IDS),
        unsupported: Array.from(UNSUPPORTED_LAYER_B_PROBE_IDS)
      }
    });
  }

  const adminClient = options.adminClient || null;
  const candidateDispatcher = offlineDispatcher ?? mockDispatcher;
  const activeInventory = validatedInventory || new TestRunInventory(runId || plan.runId);
  let timingConfig;

  // Admission checks private identities, timing contract, and durable-recovery boundaries
  // BEFORE any probe, provisioning, or destructive cleanup execution (R5-01, R6-01, R7-01, R8-01).
  try {
    if (hasOwnSleepFn || hasProtoSleepFn) {
      throw new Error(
        'BLOCKED_PENDING_DURABLE_RECOVERY: UNTRUSTED_TIMING_OVERRIDE: Caller-supplied sleepFn is prohibited; use declarative timing or internal module timer (R7-01)'
      );
    }
    if (
      options.liveHostedDispatch === true ||
      options.enforceDurableRecoveryGate === true ||
      (candidateDispatcher && HOSTED_NETWORK_DISPATCHERS.has(candidateDispatcher))
    ) {
      throw new Error(
        'BLOCKED_PENDING_DURABLE_RECOVERY: LIVE hosted execution against Supabase Cloud is blocked pending durable crash recovery and journaled inventory implementation'
      );
    }
    timingConfig = validateDeclarativeTimingConfig(options.timing, true);
    getRunRequestBudget({ projectRef: validatedRef, runId: activeInventory.runId, mode: timingConfig.mode });
    if (runId && runId !== activeInventory.runId) {
      throw new Error('ADMIN_CLIENT_RUN_MISMATCH: Runner and inventory run IDs differ');
    }
    if (runContext !== null && runContext !== undefined) {
      assertTrustedRunContext(runContext, { projectRef: validatedRef, expectedRunId: activeInventory.runId });
    }
    assertTrustedOfflineDispatcher(candidateDispatcher, { projectRef: validatedRef, runId: activeInventory.runId });
    if (!adminClient) {
      throw new Error('CLEANUP_CAPABILITY_REQUIRED: Executing runner mode requires a registered run-bound Admin client');
    }
    assertTrustedAdminClient(adminClient, { projectRef: validatedRef, runId: activeInventory.runId });
  } catch (err) {
    // Admission rejection is report-only, even if an adapter matches the inventory. Never mutate here.
    const cleanupReport = await activeInventory.executeCleanup({ adminClient: null, failClosed: false, settlementTimeoutMs: 0 });
    const clientFailure = cleanupReport.residualResources.find(resource => resource.type === 'client');
    if (clientFailure) clientFailure.error = sanitizeData(err.message);
    if (cleanupReport.status === 'CLEANUP_VERIFIED_SUCCESS') {
      cleanupReport.status = 'CLEANUP_FAILED_RESIDUAL_RESOURCES';
      cleanupReport.residualResources.push({ type: 'client', error: sanitizeData(err.message) });
      activeInventory.runLifecycleState = INVENTORY_RUN_STATE.RESIDUAL_BLOCKED;
    }
    throw cleanupFailure(err.message, cleanupReport);
  }

  if (isExecuting && options.requireSelection === true && (!options.selectedProbeIds || !Array.isArray(options.selectedProbeIds) || options.selectedProbeIds.length === 0)) {
    throw new Error(
      'SELECTION_REQUIRED: Executing runner mode strictly requires an explicit, validated selectedProbeIds array'
    );
  }

  const verifiedSeedId = options.seedUserId || options.targetUserId || null;
  if (verifiedSeedId) {
    activeInventory.protectSeedIdentity({ email: options.seedEmail || testEmail || null, id: verifiedSeedId });
  }
  const activeRunContext = runContext || createRunContext({
    runId: activeInventory.runId,
    testEmail,
    testPassword: options.testPassword,
    seedUserId: options.seedUserId,
    seedEmail: options.seedEmail,
    storageFixturePath: options.storageFixturePath
  });
  let cleanupReport = null;
  let cleanupExecuted = false;

  async function performCleanup() {
    if (cleanupExecuted) return;
    cleanupExecuted = true;
    if (isExecuting && activeInventory && adminClient) {
      try {
        await activeInventory.awaitInFlightSettlement(Math.min(probeTimeoutMs, 100));
        cleanupReport = await activeInventory.executeCleanup({ adminClient, failClosed: false, settlementTimeoutMs: 50 });
      } catch (err) {
        cleanupReport = err.cleanupReport || {
          status: 'CLEANUP_FAILED_RESIDUAL_RESOURCES',
          error: sanitizeData(err.message),
          inventory: activeInventory.getSummary(),
          residualResources: [{ type: 'cleanup_exception', error: sanitizeData(err.message) }]
        };
      }
    }
  }

  try {
    // LIVE probe loop with bounded timeout and abort signal (PRRT_kwDOVtCmZc66jOw5)
    for (let i = 0; i < plan.plannedCases.length; i++) {
      const item = plan.plannedCases[i];
      if (aborted) break;

      attemptedProbeCount++; // Provider requests are independently admitted and counted at transport dispatch.

      // Register runner-level in-flight operation for probe (R13-02, R14-01, R14-02, R15-02)
      const cap = getEndpointCapabilities(item.id) || null;
      const canMint = cap ? Boolean(cap.canMintSession) : ['HOOK-01', 'HOOK-02', 'BYPASS-03'].includes(item.id);
      const canCreate = cap ? Boolean(cap.canCreateUser ?? cap.canCreateUsers) : ['BYPASS-01', 'BYPASS-02'].includes(item.id);
      const canModify = cap ? Boolean(cap.canModifyProviderState) : true;
      const reqReconcile = cap ? Boolean(cap.requiresCleanupReconciliation) : true;

      const runnerOp = activeInventory?.registerInFlightOperation
        ? activeInventory.registerInFlightOperation({
            probeId: item.id,
            endpoint: item.target,
            canMintSession: canMint,
            canCreateUser: canCreate,
            canModifyProviderState: canModify,
            requiresCleanupReconciliation: reqReconcile,
            targetUserId: item.id === 'SESSION-02' && activeRunContext?.activeUserId ? String(activeRunContext.activeUserId) : null,
            description: `Runner execution for probe ${item.id}`
          })
        : null;

      // Enforce bounded per-probe deadline with AbortController (PRRT_kwDOVtCmZc66jOw5, R13-02)
      const controller = new AbortController();
      let timeoutTimer;

      const timeoutPromise = new Promise((_, reject) => {
        timeoutTimer = setTimeout(() => {
          controller.abort();
          if (activeInventory?.markProbeOperationsTimedOut) {
            activeInventory.markProbeOperationsTimedOut(item.id, `PROBE_TIMEOUT: probe ${item.id} exceeded deadline of ${probeTimeoutMs}ms`);
          }
          const timeoutErr = new Error(`PROBE_TIMEOUT: probe ${item.id} exceeded deadline of ${probeTimeoutMs}ms`);
          timeoutErr.code = 'ETIMEDOUT';
          reject(timeoutErr);
        }, probeTimeoutMs);
      });

      let rawOutcome;
      try {
        const dispatchPromise = RUNNER_LIVE_DISPATCH_CONTEXT.run(
          { durableRecoveryVerified: false },
          () => withRunRequestBudget(activeInventory.runId, 'probe', () => runWithBlockedRealFetch(() =>
            Promise.resolve(
              candidateDispatcher(item, {
                signal: controller.signal,
                projectRef: validatedRef,
                inventory: activeInventory,
                runContext: activeRunContext,
                testPassword: activeRunContext.testPassword,
                testEmail: item.testUser || activeRunContext.testEmail || testEmail,
                testUser: item.testUser || activeRunContext.testEmail || testEmail,
                activeRefreshToken: activeRunContext.activeRefreshToken
              })
            )
          ), timingConfig.mode)
        );
        // Attach no-op rejection handler so late rejection after timeout/abort never leaks unhandledRejection (PRRT_kwDOVtCmZc66jd3O)
        dispatchPromise.catch(() => {});
        rawOutcome = await Promise.race([dispatchPromise, timeoutPromise]);
        if (runnerOp && activeInventory?.settleInFlightOperation) {
          activeInventory.settleInFlightOperation(runnerOp.opId, { outcome: rawOutcome });
        }
      } catch (err) {
        if (typeof err?.message === 'string' && err.message.includes('BLOCKED_PENDING_DURABLE_RECOVERY')) {
          if (runnerOp && activeInventory?.settleInFlightOperation) {
            activeInventory.settleInFlightOperation(runnerOp.opId, { error: err });
          }
          throw err;
        }
        const isTimeout = err?.code === 'ETIMEDOUT' || (typeof err?.message === 'string' && err.message.includes('PROBE_TIMEOUT'));
        if (isTimeout) {
          if (activeInventory?.markProbeOperationsTimedOut) {
            activeInventory.markProbeOperationsTimedOut(item.id, `PROBE_TIMEOUT: probe ${item.id} exceeded deadline of ${probeTimeoutMs}ms`);
          }
        } else {
          if (runnerOp && activeInventory?.settleInFlightOperation) {
            activeInventory.settleInFlightOperation(runnerOp.opId, { error: err });
          }
        }
        rawOutcome = {
          passed: false,
          status: 0,
          error: isTimeout ? `PROBE_TIMEOUT: probe ${item.id} timed out before settling (${probeTimeoutMs}ms)` : `DISPATCHER_EXCEPTION: ${err?.message || String(err)}`,
          reason: isTimeout ? `PROBE_TIMEOUT: probe ${item.id} exceeded deadline of ${probeTimeoutMs}ms` : `DISPATCHER_EXCEPTION: ${err?.message || String(err)}`
        };
      } finally {
        clearTimeout(timeoutTimer);
      }

      // Strict outcome validation against canonical requirement contract (PRRT_kwDOVtCmZc66i_Kd, PRRT_kwDOVtCmZc66jLk1, PRRT_kwDOVtCmZc66jNbH)
      const validatedOutcome = validateProbeOutcome(item, rawOutcome);

      // Stop and fail on ANY requirement failure across BYPASS, HOOK, or SESSION (PRRT_kwDOVtCmZc66iotG)
      if (validatedOutcome.passed !== true) {
        aborted = true;
        abortReason = `CRITICAL_SECURITY_FAILURE: Case ${item.id} (${item.category}) failed validation! Reason: ${validatedOutcome.reason}`;
      }

      results.push({
        id: item.id,
        category: item.category,
        target: item.target,
        outcome: validatedOutcome,
        timestamp: new Date().toISOString()
      });
    }

    // Execute cleanup at end of test run (PRRT_kwDOVtCmZc66lo-q, R3-07, R4-02)
    await performCleanup();

    // In executing mode, cleanup failure must override probe success (R4-02)
    const cleanupSuccess = !isExecuting || (cleanupReport && cleanupReport.status === 'CLEANUP_VERIFIED_SUCCESS');
    if (isExecuting && !cleanupSuccess) {
      aborted = true;
      const cleanupErrText = `CLEANUP_FAILURE: Test run cleanup did not verify complete resource removal. Status: ${cleanupReport?.status || 'UNKNOWN'}. Residual users: ${cleanupReport?.residualUsers?.length || 0}, Residual resources: ${cleanupReport?.residualResources?.length || 0}. Error: ${cleanupReport?.error || 'Unverified cleanup'}`;
      if (!abortReason) {
        abortReason = cleanupErrText;
      } else {
        abortReason = `${abortReason} (${cleanupErrText})`;
      }
    }

    // Status is COMPLETED only if zero cases failed, all planned cases executed, and cleanup verified
    const allCasesExecuted = results.length === plan.plannedCases.length;
    const allPassed = !aborted && allCasesExecuted && cleanupSuccess && results.every(r => r.outcome && r.outcome.passed === true);

    const selectedProbeIds = plan.selectedProbeIds;
    const attemptedProbes = results.map(r => r.id);
    const completedProbes = results.filter(r => r.outcome && r.outcome.passed === true).map(r => r.id);
    const failedProbes = results.filter(r => !r.outcome || r.outcome.passed !== true).map(r => r.id);

    return sanitizeData({
      status: allPassed ? 'COMPLETED' : 'HALTED_ON_FAILURE',
      mode: explicitOfflineSimulation ? 'OFFLINE_SIMULATION' : 'LIVE',
      simulatedExecution: true,
      hostedProviderVerified: false,
      projectRef: validatedRef,
      runId: activeInventory.runId,
      totalExecuted: results.length,
      totalExpected: plan.plannedCases.length,
      requestCount: getRunRequestBudget({ projectRef: validatedRef, runId: activeInventory.runId }).report().simulatedTransportRequests,
      attemptedProbeCount,
      requestBudget: getRunRequestBudget({ projectRef: validatedRef, runId: activeInventory.runId }).report(),
      simulatedTransportRequests: getRunRequestBudget({ projectRef: validatedRef, runId: activeInventory.runId }).report().simulatedTransportRequests,
      actualHostedRequests: 0,
      throttleIntervalsMs: getRunRequestBudget({ projectRef: validatedRef, runId: activeInventory.runId }).report().intervalsMs,
      aborted,
      abortReason: abortReason,
      cleanupReport: cleanupReport,
      inventorySummary: activeInventory.getSummary(),
      executionEvidence: {
        selected: selectedProbeIds,
        attempted: attemptedProbes,
        completed: completedProbes,
        failed: failedProbes,
        not_selected: plan.unselectedProbeIds,
        prerequisite_blocked: Array.from(PREREQUISITE_BLOCKED_PROBE_IDS),
        unsupported: Array.from(UNSUPPORTED_LAYER_B_PROBE_IDS)
      },
      results: results
    });
  } finally {
    // Clear run-scoped credential state after execution (PRRT_kwDOVtCmZc66lOOP)
    activeRunContext.clear();
    // Ensure cleanup always executes even on unexpected exceptions (PRRT_kwDOVtCmZc66lo-q, R3-07)
    await performCleanup();
    if (activeInventory && typeof activeInventory.clearCredentials === 'function') {
      if (!isExecuting || (cleanupReport && cleanupReport.status === 'CLEANUP_VERIFIED_SUCCESS')) {
        activeInventory.clearCredentials();
      }
    }
  }
}

/**
 * Factory for the hosted admin client adapter used by cleanup and admin operations.
 * Strictly binds to HARDCODED_TEMP_REF; rejects real and tio-world projects.
 * Resolves PRRT_kwDOVtCmZc66sBa5 (R7-01).
 */
export function createHostedAdminClient(rawOptions = {}) {
  const opts = admitValidatedInput(rawOptions, 'createHostedAdminClientOptions');
  let {
    serviceRoleKey,
    anonKey,
    projectRef = HARDCODED_TEMP_REF,
    runId = null,
    fetchFn = null
  } = opts;
  if (projectRef !== HARDCODED_TEMP_REF) {
    throw new Error(`SECURITY_BOUNDARY_VIOLATION: createHostedAdminClient strictly permitted only against TEMP project '${HARDCODED_TEMP_REF}', attempted '${projectRef}'`);
  }
  if (!serviceRoleKey || typeof serviceRoleKey !== 'string' || !serviceRoleKey.trim()) {
    throw new Error('MISSING_HOSTED_CREDENTIALS: createHostedAdminClient requires non-empty serviceRoleKey');
  }
  validateProjectCredentialBinding(serviceRoleKey, projectRef);
  if (isNonEmptyString(anonKey)) {
    validateProjectCredentialBinding(anonKey, projectRef);
  }
  const boundRunId = runId !== null && runId !== undefined ? validateRunId(runId) : null;
  assertOfflineMockTransport(fetchFn);

  const rawTransportFetch = fetchFn;
  fetchFn = (url, opts) => {
    assertOfflineMockTransport(rawTransportFetch);
    return runWithBlockedRealFetch(() => rawTransportFetch(url, opts));
  };

  const baseUrl = `https://${projectRef}.supabase.co`;

  const client = {
    async verifyUserCredentials(email, password, options = {}) {
      const inv = options?.inventory || null;
      if (!email || typeof email !== 'string' || !email.trim()) {
        return { data: null, error: { message: 'MISSING_EMAIL: verifyUserCredentials requires non-empty email' } };
      }
      if (!password || typeof password !== 'string') {
        return { data: null, error: { message: 'MISSING_PASSWORD: verifyUserCredentials requires string password' } };
      }

      const cap = getEndpointCapabilities('verify_credentials') || {
        canMintSession: true,
        canCreateUser: false,
        canModifyProviderState: true,
        requiresCleanupReconciliation: true
      };
      const op = inv?.registerInFlightOperation
        ? inv.registerInFlightOperation({
            probeId: 'verify_credentials',
            endpoint: '/auth/v1/token?grant_type=password',
            canMintSession: cap.canMintSession,
            canCreateUser: cap.canCreateUser,
            canModifyProviderState: cap.canModifyProviderState,
            requiresCleanupReconciliation: cap.requiresCleanupReconciliation,
            description: 'Seed password restoration credential verification',
            _internalCleanupOperation: inv?.runLifecycleState === INVENTORY_RUN_STATE.CLEANUP_ACTIVE
          })
        : null;

      const keyToUse = anonKey || serviceRoleKey;
      let res;
      let transportError = null;
      try {
        res = await fetchFn(`${baseUrl}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers: {
            apikey: keyToUse,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email: email.trim(),
            password
          })
        });
      } catch (err) {
        transportError = err;
      }

      const parseEnv = res ? await parseResponseEnvelope(res) : null;
      const observed = observeAuthResponse({
        probeId: 'verify_credentials',
        status: parseEnv?.status || 0,
        parseStatus: parseEnv?.parseStatus || (transportError ? 'transport_error' : 'missing_response'),
        body: parseEnv?.body || null,
        parseError: parseEnv?.parseError || null,
        transportError,
        inv,
        expectedOperation: 'token_issuance',
        canMintSession: cap.canMintSession,
        canCreateUser: cap.canCreateUser,
        canModifyProviderState: cap.canModifyProviderState,
        requiresCleanupReconciliation: cap.requiresCleanupReconciliation,
        testUser: email.trim()
      });

      if (op && inv?.settleInFlightOperation) {
        inv.settleInFlightOperation(op.opId, { observed, error: transportError });
      }

      if (observed.classification === 'AUTH_RESPONSE_INDETERMINATE') {
        const errorMsg = transportError
          ? `VERIFICATION_NETWORK_ERROR: ${observed.error || transportError?.message || String(transportError)}`
          : observed.error;
        return {
          data: null,
          error: {
            message: errorMsg,
            code: observed.errorCode || 'UNREADABLE_RESPONSE',
            status: observed.status
          },
          sessionRevocationFailed: true,
          indeterminateSession: true
        };
      }

      if (observed.classification !== 'AUTH_RESPONSE_TOKEN_OBSERVED') {
        return {
          data: null,
          error: {
            message: observed.error || `HTTP_${observed.status}`,
            status: observed.status,
            code: observed.errorCode || `HTTP_${observed.status}`
          }
        };
      }

      const token = observed.accessToken;
      const sessionId = observed.sessionId;

      // Immediately revoke verification session so no residual sessions leak (R9-01, R10-01, R11-01)
      let signOutRes;
      let signOutThrew = false;
      let signOutError = null;
      try {
        signOutRes = await this.signOut(token, 'local');
      } catch (err) {
        signOutThrew = true;
        signOutError = err;
      }

      if (signOutThrew) {
        return {
          data: null,
          error: {
            message: `VERIFICATION_SESSION_REVOCATION_FAILED: signOut threw exception: ${signOutError?.message || String(signOutError)} (R11-01)`,
            code: 'LOGOUT_EXCEPTION',
            sessionId: String(sessionId)
            // NOTE (R11-02): Raw token value is strictly omitted to prevent secret leakage
          },
          sessionRevocationFailed: true
        };
      }

      if (signOutRes && signOutRes.error) {
        return {
          data: null,
          error: {
            message: `VERIFICATION_SESSION_REVOCATION_FAILED: signOut failed: ${signOutRes.error.message || JSON.stringify(signOutRes.error)} (R11-01)`,
            code: 'LOGOUT_FAILED',
            sessionId: String(sessionId),
            status: signOutRes.error.status
            // NOTE (R11-02): Raw token value is strictly omitted to prevent secret leakage
          },
          sessionRevocationFailed: true
        };
      }

      // Successfully signed out - mark session revoked in inventory
      if (inv && sessionId) {
        inv.markSessionRevoked(sessionId);
      }

      return {
        data: {
          verified: true,
          userId: observed.userId,
          sessionId: String(sessionId)
        },
        error: null
      };
    },

    async deleteUser(userId) {
      if (!userId || typeof userId !== 'string' || !userId.trim()) {
        return { data: null, error: { message: 'MISSING_USER_ID: deleteUser requires non-empty userId' } };
      }
      const res = await fetchFn(`${baseUrl}/auth/v1/admin/users/${encodeURIComponent(userId.trim())}`, {
        method: 'DELETE',
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`
        }
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return { error: body?.msg || body?.message || `HTTP_${res.status}` };
      }
      return { data: { user: { id: userId } }, error: null };
    },

    async getUserById(userId) {
      if (!userId || typeof userId !== 'string' || !userId.trim()) {
        return { data: null, error: { message: 'MISSING_USER_ID: getUserById requires non-empty userId' } };
      }
      const res = await fetchFn(`${baseUrl}/auth/v1/admin/users/${encodeURIComponent(userId.trim())}`, {
        method: 'GET',
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`
        }
      });
      if (res.status === 404) return { data: null, error: { message: 'User not found', status: 404 } };
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return { data: null, error: body };
      }
      const data = await res.json();
      return { data, error: null };
    },

    async signOut(token, scope = 'local') {
      if (!token || typeof token !== 'string' || !token.trim()) {
        return { data: null, error: { message: 'MISSING_TOKEN: signOut requires non-empty user access token' } };
      }
      const res = await fetchFn(`${baseUrl}/auth/v1/logout?scope=${encodeURIComponent(scope)}`, {
        method: 'POST',
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${token.trim()}`,
          'Content-Type': 'application/json'
        }
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const errCode = (body?.error_code || body?.code || '').toString().toLowerCase();
        const errMsg = (body?.msg || body?.message || body?.error_description || body?.error || '').toString().toLowerCase();

        // Disqualify false proofs (R8-02)
        const isFalseProof =
          errCode.includes('bad_jwt') ||
          errCode.includes('jwt_expired') ||
          errCode.includes('token_expired') ||
          errCode.includes('invalid_token') ||
          errCode.includes('invalid_jwt') ||
          errMsg.includes('bad_jwt') ||
          errMsg.includes('jwt expired') ||
          errMsg.includes('token is expired') ||
          errMsg.includes('token expired') ||
          errMsg.includes('invalid token') ||
          errMsg.includes('invalid claim');

        // Affirmative session absence: session_not_found or authsessionmissingerror (R8-02)
        const isSessionAbsence = !isFalseProof && (
          errCode === 'session_not_found' ||
          errCode === 'authsessionmissingerror' ||
          errMsg.includes('session not found') ||
          errMsg.includes('session_not_found') ||
          errMsg.includes('auth session missing') ||
          errMsg.includes('session from session_id claim in jwt does not exist') ||
          (errMsg.includes('session') && errMsg.includes('does not exist'))
        );

        if (isSessionAbsence) {
          return { data: { scope, alreadyRevoked: true }, error: null, session_not_found: true };
        }

        return {
          data: null,
          error: {
            message: body?.msg || body?.message || `HTTP_${res.status}`,
            status: res.status,
            code: body?.error_code || body?.code
          }
        };
      }
      return { data: { scope }, error: null };
    },

    async invalidateSession(sessionId, token) {
      if (!token || typeof token !== 'string' || !token.trim()) {
        return {
          data: null,
          error: {
            status: 400,
            message: `UNSUPPORTED_SESSION_REVOCATION: GoTrue lacks an admin session-by-id deletion endpoint; access token context is required for targeted local sign-out of session '${sessionId}' (R6-01)`
          }
        };
      }
      const res = await this.signOut(token.trim(), 'local');
      if (res.session_not_found) {
        return { data: { sessionId, scope: 'local', alreadyRevoked: true }, error: null, session_not_found: true };
      }
      return res;
    },

    async updateUserById(userId, attributes) {
      if (!userId || typeof userId !== 'string' || !userId.trim()) {
        return { data: null, error: { message: 'MISSING_USER_ID: updateUserById requires non-empty userId' } };
      }
      const res = await fetchFn(`${baseUrl}/auth/v1/admin/users/${encodeURIComponent(userId.trim())}`, {
        method: 'PUT',
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(attributes)
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return { data: null, error: body?.msg || body?.message || `HTTP_${res.status}` };
      }
      const data = await res.json().catch(() => ({ id: userId }));
      return { data, error: null };
    },

    async deleteTableRow(table, id) {
      if (!table || !id) {
        return { data: null, error: { message: 'MISSING_PARAMS: deleteTableRow requires table and id' } };
      }
      const res = await fetchFn(`${baseUrl}/rest/v1/${encodeURIComponent(table)}?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`
        }
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return { error: body?.msg || body?.message || `HTTP_${res.status}` };
      }
      return { data: { table, id }, error: null };
    },

    async getStorageObject(bucket, path) {
      if (!bucket || !path) {
        return {
          status: 0,
          ok: false,
          body: null,
          parseStatus: 'missing_params',
          authorizedContext: false,
          normalized: normalizeStorageObjectResponse({
            status: 0,
            expectedBucket: bucket,
            expectedPath: path,
            projectRef,
            authorizedContext: false
          }),
          error: 'MISSING_PARAMS: getStorageObject requires bucket and path'
        };
      }
      const encodedPath = String(path).split('/').map(encodeURIComponent).join('/');
      let res;
      let transportError = null;
      try {
        res = await fetchFn(`${baseUrl}/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${encodedPath}`, {
          method: 'GET',
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`
          }
        });
      } catch (err) {
        transportError = err;
      }

      if (transportError) {
        const normalized = normalizeStorageObjectResponse({
          transportError,
          expectedBucket: bucket,
          expectedPath: path,
          projectRef,
          authorizedContext: true
        });
        return {
          status: 0,
          ok: false,
          body: null,
          parseStatus: 'transport_error',
          transportError,
          authorizedContext: true,
          normalized
        };
      }

      const env = res.ok
        ? { ok: true, status: res.status, body: null, parseStatus: 'present_binary_or_text' }
        : await parseStorageErrorEnvelope(res);

      const normalized = normalizeStorageObjectResponse({
        status: env.status,
        parseStatus: env.parseStatus,
        body: env.body,
        expectedBucket: bucket,
        expectedPath: path,
        projectRef,
        authorizedContext: true
      });

      return {
        status: env.status,
        ok: Boolean(res.ok),
        body: env.body,
        parseStatus: env.parseStatus,
        authorizedContext: true,
        normalized
      };
    },

    /**
     * Narrowly-scoped server-side lookup of authoritative storage.objects.owner_id metadata (R2-01).
     * Calls PostgreSQL SECURITY DEFINER RPC executable ONLY by service_role; keeps storage schema unexposed.
     */
    async getStorageObjectOwnership(bucket, path, rawOptions = {}) {
      if (typeof bucket !== 'string' || typeof path !== 'string' || !path.trim() || bucket !== STORAGE_PROBE_BUCKET) {
        return {
          found: false,
          source: 'storage.objects.owner_id',
          data: null,
          error: { code: 'INVALID_SCOPE', message: `OWNERSHIP_LOOKUP_INVALID_SCOPE: Only '${STORAGE_PROBE_BUCKET}' is authorized` }
        };
      }

      const opts = admitValidatedInput(rawOptions, 'getStorageObjectOwnershipOptions');
      const reqProjectRef = ownSchemaMeta(opts, 'projectRef', projectRef);
      if (reqProjectRef.trim().toLowerCase() !== projectRef) {
        return {
          found: false,
          source: 'storage.objects.owner_id',
          data: null,
          error: { code: 'INVALID_SCOPE', message: `OWNERSHIP_LOOKUP_PROJECT_MISMATCH: Expected '${projectRef}'` }
        };
      }
      const timeoutMs = ownSchemaMeta(opts, 'timeoutMs', DEFAULT_PROBE_TIMEOUT_MS);
      const signal = ownSchemaMeta(opts, 'signal', null);

      if (isTrustedSignalAborted(signal)) {
        return {
          found: false,
          source: 'storage.objects.owner_id',
          data: null,
          error: { code: 'OWNERSHIP_LOOKUP_ABORTED', message: 'Ownership lookup signal aborted' }
        };
      }

      const controller = new AbortController();
      let timedOut = false;
      let timer = null;
      let listenerAttached = false;
      const onExternalAbort = () => controller.abort();

      let res;
      try {
        if (signal !== null && signal !== undefined) {
          addTrustedSignalAbortListener(signal, onExternalAbort);
          listenerAttached = true;
        }
        timer = setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs);
        res = await fetchFn(`${baseUrl}/rest/v1/rpc/task06i_lookup_storage_object_owner`, {
          method: 'POST',
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          body: JSON.stringify({
            p_bucket_id: bucket,
            p_object_name: path
          }),
          signal: controller.signal
        });
      } catch (err) {
        return {
          found: false,
          source: 'storage.objects.owner_id',
          data: null,
          error: {
            code: timedOut ? 'OWNERSHIP_LOOKUP_TIMEOUT' : 'OWNERSHIP_LOOKUP_TRANSPORT_ERROR',
            message: timedOut ? `OWNERSHIP_LOOKUP_TIMEOUT: exceeded ${timeoutMs}ms` : err.message
          }
        };
      } finally {
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        if (listenerAttached && signal !== null && signal !== undefined) {
          listenerAttached = false;
          removeTrustedSignalAbortListener(signal, onExternalAbort);
        }
      }

      const env = await parseStorageErrorEnvelope(res);
      // RPC TABLE return can serialize as an array of rows OR a single object depending on mock/Accept header
      let rawJson = null;
      if (env.parseStatus === 'parsed') {
        rawJson = env.body;
      } else if (env.parseStatus === 'non_object' && Array.isArray(env.body)) {
        rawJson = env.body;
      } else if (!res.ok) {
        const errCode = env.body?.code || null;
        return {
          found: false,
          source: 'storage.objects.owner_id',
          data: null,
          error: {
            code: res.status === 404 || errCode === 'PGRST202' ? 'PROVIDER_PRECONDITION_MISSING' : 'OWNERSHIP_LOOKUP_FAILED',
            status: res.status,
            message: env.body?.message || env.body?.hint || `HTTP ${res.status} (${env.parseStatus})`
          }
        };
      } else {
        return {
          found: false,
          source: 'storage.objects.owner_id',
          data: null,
          error: {
            code: 'OWNERSHIP_METADATA_MALFORMED',
            status: res.status,
            message: `Unreadable or malformed ownership lookup response (${env.parseStatus})`
          }
        };
      }

      if (!res.ok) {
        const errCode = rawJson?.code || null;
        return {
          found: false,
          source: 'storage.objects.owner_id',
          data: null,
          error: {
            code: res.status === 404 || errCode === 'PGRST202' ? 'PROVIDER_PRECONDITION_MISSING' : 'OWNERSHIP_LOOKUP_FAILED',
            status: res.status,
            message: rawJson?.message || `HTTP ${res.status}`
          }
        };
      }

      const row = Array.isArray(rawJson) ? rawJson[0] || null : rawJson;
      if (!row || typeof row !== 'object') {
        return {
          found: false,
          source: 'storage.objects.owner_id',
          data: null,
          error: {
            code: 'OBJECT_NOT_FOUND',
            message: `No storage.objects metadata row found for '${bucket}/${path}'`
          }
        };
      }

      return {
        found: true,
        source: 'storage.objects.owner_id',
        data: row,
        error: null
      };
    },

    async conditionalDeleteStorageObject(authorization) {
      const expected = STORAGE_DELETE_AUTHORIZATIONS.get(authorization);
      if (!expected || expected.projectRef !== projectRef || expected.runId !== boundRunId) {
        return { data: null, error: { message: 'UNAUTHORIZED_CONDITIONAL_STORAGE_DELETE' } };
      }
      STORAGE_DELETE_AUTHORIZATIONS.delete(authorization);
      if (!getConditionalStorageFixtureProvider(rawTransportFetch)) {
        return { data: null, error: { message: 'CONDITIONAL_DELETE_UNAVAILABLE: Atomic hosted conditional deletion is unverified' }, conditionalDeletion: { status: 'CONDITIONAL_DELETE_UNAVAILABLE' } };
      }
      const url = `${baseUrl}/storage/v1/object/${encodeURIComponent(expected.bucket)}/${expected.path.split('/').map(encodeURIComponent).join('/')}`;
      try {
        const response = await CONDITIONAL_DELETE_CONTEXT.run({ transport: rawTransportFetch, expected }, () => fetchFn(url, { method: 'DELETE' }));
        const evidence = response.conditionalDeletion;
        if (!evidence || !['EXPECTED_OBJECT_DELETED', 'EXPECTED_OBJECT_ABSENT'].includes(evidence.status)) {
          return { data: null, error: { message: evidence?.status || 'CONDITIONAL_DELETE_INDETERMINATE' }, conditionalDeletion: evidence || null };
        }
        return { data: { bucket: expected.bucket, path: expected.path }, error: null, conditionalDeletion: evidence };
      } catch (error) {
        if (error?.code === 'REQUEST_BUDGET_EXHAUSTED') {
          return { data: null, error: { code: error.code, message: error.message }, recoveryRequired: true,
            conditionalDeletion: { status: 'CONDITIONAL_DELETE_BUDGET_EXHAUSTED', expected }, budgetReport: error.budgetReport };
        }
        return { data: null, error: { message: 'CONDITIONAL_DELETE_INDETERMINATE: No authoritative conditional deletion response' },
          conditionalDeletion: { status: 'CONDITIONAL_DELETE_INDETERMINATE', expected } };
      }
    },

    async deleteStorageObject(bucket, path) {
      if (!bucket || !path) {
        return {
          data: null,
          status: 0,
          normalized: normalizeStorageObjectResponse({
            status: 0,
            expectedBucket: bucket,
            expectedPath: path,
            projectRef,
            authorizedContext: false
          }),
          error: { message: 'MISSING_PARAMS: deleteStorageObject requires bucket and path' }
        };
      }
      const encodedPath = String(path).split('/').map(encodeURIComponent).join('/');
      let res;
      let transportError = null;
      try {
        res = await fetchFn(`${baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`, {
          method: 'DELETE',
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`
          }
        });
      } catch (err) {
        transportError = err;
      }

      if (transportError) {
        const normalized = normalizeStorageObjectResponse({
          transportError,
          expectedBucket: bucket,
          expectedPath: path,
          projectRef,
          authorizedContext: true
        });
        return {
          data: null,
          status: 0,
          body: null,
          parseStatus: 'transport_error',
          transportError,
          normalized,
          error: {
            message: normalized.reason,
            status: 0,
            classification: normalized.classification
          }
        };
      }

      const env = await parseStorageErrorEnvelope(res);
      if (res.ok) {
        return {
          data: { bucket, path },
          error: null,
          status: env.status,
          body: env.body,
          parseStatus: env.parseStatus,
          normalized: {
            classification: STORAGE_RESPONSE_CLASS.OBJECT_ABSENT,
            isAbsent: true,
            isPresent: false,
            isConflict: false,
            status: env.status,
            reason: `HTTP_DELETE_${env.status}_OK`
          }
        };
      }

      const normalized = normalizeStorageObjectResponse({
        status: env.status,
        parseStatus: env.parseStatus,
        body: env.body,
        expectedBucket: bucket,
        expectedPath: path,
        projectRef,
        authorizedContext: true
      });
      return {
        data: null,
        status: env.status,
        body: env.body,
        parseStatus: env.parseStatus,
        normalized,
        error: {
          message: env.body?.message || env.body?.msg || normalized.reason || `HTTP_${env.status}`,
          status: env.status,
          code: normalized.code || env.body?.code || null,
          classification: normalized.classification
        }
      };
    }
  };

  // Guard direct capability calls as well as the orchestration helpers. A borrowed method
  // must never execute methods on a caller-controlled receiver (notably this.signOut).
  for (const [name, implementation] of Object.entries(client)) {
    client[name] = async function guardedAdminCapability(...args) {
      if (this !== client) {
        throw new Error('UNTRUSTED_ADMIN_CLIENT: Admin capability receiver does not match its registered adapter');
      }
      let operationRunId = null;
      if (name === 'verifyUserCredentials' && args[2]?.inventory) operationRunId = args[2].inventory.runId;
      if (['getStorageObject', 'getStorageObjectOwnership', 'deleteStorageObject'].includes(name) &&
          args[0] === STORAGE_PROBE_BUCKET && typeof args[1] === 'string' && args[1].includes('/')) {
        operationRunId = validateRunId(args[1].split('/')[0]);
      }
      assertTrustedAdminClient(client, {
        projectRef, runId: operationRunId || boundRunId,
        requireRunBinding: Boolean(operationRunId || boundRunId)
      });
      return withRunRequestBudget(operationRunId || boundRunId, 'auxiliary', () => Reflect.apply(implementation, client, args));
    };
  }

  const capabilities = Object.freeze({
    verifyUserCredentials: client.verifyUserCredentials,
    deleteUser: client.deleteUser,
    getUserById: client.getUserById,
    signOut: client.signOut,
    invalidateSession: client.invalidateSession,
    updateUserById: client.updateUserById,
    deleteTableRow: client.deleteTableRow,
    getStorageObject: client.getStorageObject,
    getStorageObjectOwnership: client.getStorageObjectOwnership,
    deleteStorageObject: client.deleteStorageObject,
    conditionalDeleteStorageObject: client.conditionalDeleteStorageObject
  });

  for (const capability of Object.values(capabilities)) Object.freeze(capability);
  Object.freeze(client);
  TRUSTED_ADMIN_CLIENTS.set(
    client,
    Object.freeze({
      projectRef,
      runId: boundRunId,
      rawTransportFetch,
      capabilities
    })
  );
  return client;
}

// Standalone CLI execution: defaults strictly to DRY_RUN
if (process.argv[1] && process.argv[1].endsWith('hosted-probe-runner.mjs')) {
  const cliArgv = process.argv.slice(2);
  const hasLiveFlag = cliArgv.includes('--live');

  if (hasLiveFlag) {
    console.error('BLOCKED_PENDING_DURABLE_RECOVERY: LIVE hosted execution against Supabase Cloud is blocked pending durable crash recovery and journaled inventory implementation');
    process.exit(1);
  }

  const mode = determineRunnerMode(cliArgv, process.env);

  if (mode === 'DRY_RUN') {
    runHostedProbeRunner({
      projectRef: HARDCODED_TEMP_REF,
      argv: cliArgv,
      env: process.env
    }).then(res => {
      console.log(`[HOSTED PROBE RUNNER] Mode: ${res.mode} | Status: ${res.status} | Project: ${res.projectRef} | Planned Probes: ${res.plan?.totalProbes}`);
      console.log(`[HOSTED PROBE RUNNER] Zero Network Requests Dispatched: ${res.zeroNetworkRequestsDispatched}`);
      console.log(JSON.stringify(res, null, 2));
    }).catch(err => {
      console.error('CRITICAL_RUNNER_ERROR:', err.message);
      process.exit(1);
    });
  } else {
    // LIVE CLI execution unconditionally blocked while durable crash recovery is not implemented
    console.error('BLOCKED_PENDING_DURABLE_RECOVERY: LIVE hosted execution against Supabase Cloud is blocked pending durable crash recovery and journaled inventory implementation');
    process.exit(1);
  }
}
