import { types as utilTypes } from 'node:util';
import { journalForRun } from './offline-recovery-journal.mjs';

const RUN_BUDGETS = new Map();
const DURABLE_BUDGETS = new WeakMap();
const TRUSTED_BUDGETS = new WeakSet();
const TICKETS = new WeakMap();
const PRE_DISPATCH_FAILURES = new WeakMap();
const CANCELLATION_ERRORS = new WeakSet();
const TEMP_PROJECT = 'wvdabiwbaavfggcmpizd';
const LIMIT = 25;
const INTERVAL = 1000;
const signalProto = AbortSignal.prototype;
const abortedGet = Object.getOwnPropertyDescriptor(signalProto, 'aborted').get;
const addListener = signalProto.addEventListener;
const removeListener = signalProto.removeEventListener;

function record(input, keys) {
  if (!input || typeof input !== 'object' || utilTypes.isProxy(input) || ![Object.prototype, null].includes(Object.getPrototypeOf(input)) || Object.getOwnPropertySymbols(input).length) {
    throw new Error('INVALID_REQUEST_BUDGET_OPTIONS');
  }
  const out = Object.create(null);
  for (const key of Object.getOwnPropertyNames(input)) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!keys.includes(key) || !descriptor || !Object.hasOwn(descriptor, 'value')) throw new Error('INVALID_REQUEST_BUDGET_OPTIONS');
    out[key] = descriptor.value;
  }
  return out;
}
function trustedSignal(signal) {
  if (signal === undefined || signal === null) return null;
  if (utilTypes.isProxy(signal) || typeof signal !== 'object' || Object.getPrototypeOf(signal) !== signalProto) throw new Error('INVALID_REQUEST_BUDGET_SIGNAL');
  for (const key of Object.getOwnPropertyNames(signal)) {
    const descriptor = Object.getOwnPropertyDescriptor(signal, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || typeof descriptor.value === 'function') throw new Error('INVALID_REQUEST_BUDGET_SIGNAL');
  }
  abortedGet.call(signal);
  return signal;
}
function abortError() {
  const error = new Error('Request cancelled before dispatch');
  error.name = 'AbortError';
  error.code = 'REQUEST_CANCELLED_BEFORE_DISPATCH';
  CANCELLATION_ERRORS.add(error);
  return error;
}

// Error text/code is not dispatch provenance. Only this module can issue this
// receipt, and a caller may consume it only for the exact bound run.
export function isRunRequestAdmissionFailure(error, runId) {
  return typeof runId === 'string' && PRE_DISPATCH_FAILURES.get(error) === runId;
}
function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    let timer;
    let attached = false;
    let settled = false;
    const cleanup = () => {
      if (timer !== undefined) clearTimeout(timer);
      if (attached) removeListener.call(signal, 'abort', onAbort);
      attached = false;
    };
    const finish = error => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error); else resolve();
    };
    const onAbort = () => finish(abortError());
    try {
      if (signal && abortedGet.call(signal)) return finish(abortError());
      if (signal) {
        attached = true;
        addListener.call(signal, 'abort', onAbort, Object.assign(Object.create(null), { once: true }));
      }
      timer = setTimeout(() => finish(), ms);
    } catch (error) { finish(error); }
  });
}

/** Fixed shared run allowance. No extra or exempt cleanup quota is authorized. */
export function getRunRequestBudget(rawOptions) {
  const options = record(rawOptions, ['projectRef', 'runId', 'mode']);
  if (options.projectRef !== TEMP_PROJECT || typeof options.runId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(options.runId)) throw new Error('REQUEST_BUDGET_BINDING_REQUIRED');
  if (options.mode !== undefined && !['standard', 'recorded_zero_wait'].includes(options.mode)) throw new Error('INVALID_REQUEST_BUDGET_MODE');
  const key = options.projectRef + ':' + options.runId;
  const journal = journalForRun(options.runId);
  if (journal && options.mode !== undefined && options.mode !== journal.mode) throw new Error('REQUEST_BUDGET_MODE_MISMATCH');
  const existing = journal ? DURABLE_BUDGETS.get(journal) : RUN_BUDGETS.get(key);
  if (existing) {
    if (options.mode !== undefined && options.mode !== existing.report().pacingMode) throw new Error('REQUEST_BUDGET_MODE_MISMATCH');
    return existing;
  }
  const mode = journal?.mode ?? options.mode ?? 'standard';
  const history = journal?.state.attempts ?? [];
  let reserved = 0;
  let consumed = history.length;
  let dispatched = history.filter(entry => entry.dispatchedAt !== null).length;
  let blocked = 0;
  let failed = history.filter(entry => entry.outcome === 'failed' || entry.outcome === 'cancelled_after_dispatch').length;
  let cancelledBefore = 0;
  let cancelledAfter = history.filter(entry => entry.outcome === 'cancelled_after_dispatch').length;
  let cleanupAttempts = history.filter(entry => entry.dispatchedAt !== null && entry.category === 'cleanup').length;
  let auxiliaryAttempts = history.filter(entry => entry.dispatchedAt !== null && entry.category === 'auxiliary').length;
  let lastDispatch = history.at(-1)?.dispatchedAt ?? history.at(-1)?.reservedAt ?? null;
  // On reopen wait a full interval on a fresh monotonic clock. Persisted wall
  // time still constrains ordering, including a system clock rollback.
  let lastAdmission = journal && history.length ? performance.now() : null;
  let queue = Promise.resolve();
  const intervals = [];
  const attempts = history.map(({ ordinal, category, reservedAt, dispatchedAt, outcome }) => ({
    ordinal, category, reservedAt, dispatchedAt, outcome
  }));
  const budget = Object.freeze({
    async beginRequest(rawRequest = Object.create(null)) {
      const request = record(rawRequest, ['category', 'signal', 'kind', 'resourceKey', 'operationHash', 'dispatchDeadline', 'monotonicDeadline']);
      const category = request.category ?? 'probe';
      const deadline = request.dispatchDeadline;
      const monoDeadline = request.monotonicDeadline;
      if (!['probe', 'auxiliary', 'cleanup'].includes(category)) throw new Error('INVALID_REQUEST_BUDGET_CATEGORY');
      if ((deadline === undefined) !== (monoDeadline === undefined)) throw new Error('INVALID_REQUEST_DISPATCH_DEADLINE');
      if (deadline !== undefined && (!Number.isSafeInteger(deadline) || deadline <= 0)) throw new Error('INVALID_REQUEST_DISPATCH_DEADLINE');
      if (monoDeadline !== undefined && (typeof monoDeadline !== 'number' || !Number.isFinite(monoDeadline))) throw new Error('INVALID_REQUEST_DISPATCH_DEADLINE');
      if (request.resourceKey !== undefined && (typeof request.resourceKey !== 'string' || !/^[a-f0-9]{64}$/.test(request.resourceKey))) throw new Error('INVALID_REQUEST_RESOURCE_KEY');
      if (request.operationHash !== undefined && (typeof request.operationHash !== 'string' || !/^[a-f0-9]{64}$/.test(request.operationHash) || !['storage_upload', 'seed_create', 'auth_delete'].includes(request.kind) || !request.resourceKey)) throw new Error('INVALID_REQUEST_OPERATION_BINDING');
      const signal = trustedSignal(request.signal);
      const assertDeadline = (timestamp, monoTimestamp = performance.now()) => {
        if ((deadline === undefined || timestamp < deadline) &&
            (monoDeadline === undefined || monoTimestamp < monoDeadline)) return;
        blocked++;
        throw new Error('TEMP_AUTH_AUTHORIZATION_EXPIRED');
      };
      const rejectCancelled = () => { blocked++; cancelledBefore++; const error = abortError(); error._counted = true; PRE_DISPATCH_FAILURES.set(error, options.runId); throw error; };
      if (signal && abortedGet.call(signal)) return rejectCancelled();
      // Synchronous reservation occurs before the first await, so concurrent callers cannot oversubscribe.
      if (consumed + reserved >= LIMIT) {
        blocked++;
        const error = new Error('REQUEST_BUDGET_EXHAUSTED: Shared run request limit reached; outstanding resources require recovery');
        error.code = 'REQUEST_BUDGET_EXHAUSTED';
        error.recoveryRequired = category === 'cleanup';
        error.budgetReport = budget.report();
        PRE_DISPATCH_FAILURES.set(error, options.runId);
        throw error;
      }
      reserved++;
      const previous = queue;
      let release;
      let leased = false;
      let admitted = false;
      queue = new Promise(resolve => { release = resolve; });
      try {
        if (journal) {
          journal.enterRequest();
          leased = true;
        }
        await previous;
        if (signal && abortedGet.call(signal)) return rejectCancelled();
        if (lastDispatch !== null) {
          if (mode === 'standard') {
            // Check against the last actual admission after acquiring the serialized pacing turn.
            let remaining;
            do {
              const elapsed = Date.now() - lastDispatch;
              if (journal && elapsed < 0) throw new Error('REQUEST_CLOCK_BEFORE_RECOVERY_ACCOUNTING');
              remaining = Math.max(INTERVAL - elapsed, lastAdmission === null ? 0 : INTERVAL - (performance.now() - lastAdmission));
              if (remaining > 0) await wait(Math.ceil(remaining), signal);
            } while (remaining > 0);
          }
          intervals.push(mode === 'standard' ? Date.now() - lastDispatch : INTERVAL);
        }
        if (signal && abortedGet.call(signal)) return rejectCancelled();
        const reservedAt = Date.now();
        assertDeadline(reservedAt, performance.now());
        journal?.reserve(consumed + 1, category, request.kind, reservedAt, request.resourceKey ?? null, request.operationHash ?? null);
        lastDispatch = reservedAt;
        consumed++;
        const ticket = Object.freeze(Object.create(null));
        const entry = { ordinal: consumed, category, dispatchedAt: journal ? null : lastDispatch, outcome: 'pending' };
        if (journal) entry.reservedAt = reservedAt;
        attempts.push(entry);
        if (journal) {
          const dispatchedAt = Date.now();
          // A durable reservation can cross the deadline. Preserve it without dispatching.
          assertDeadline(dispatchedAt, performance.now());
          journal.dispatch(consumed, dispatchedAt);
          lastAdmission = performance.now();
          lastDispatch = dispatchedAt;
          entry.dispatchedAt = dispatchedAt;
        }
        dispatched++;
        if (category === 'cleanup') cleanupAttempts++;
        if (category === 'auxiliary') auxiliaryAttempts++;
        TICKETS.set(ticket, { budget, entry, settled: false });
        admitted = true;
        return ticket;
      } catch (error) {
        if (CANCELLATION_ERRORS.has(error)) PRE_DISPATCH_FAILURES.set(error, options.runId);
        // A journal failure here is before the caller can enter the provider.
        if (journal) PRE_DISPATCH_FAILURES.set(error, options.runId);
        if (error?.name === 'AbortError' && error?.code === 'REQUEST_CANCELLED_BEFORE_DISPATCH' && !error._counted) {
          blocked++; cancelledBefore++;
        }
        throw error;
      } finally {
        if (leased && !admitted) journal.leaveRequest();
        reserved--;
        release();
      }
    },
    requestOrdinal(ticket) {
      const metadata = TICKETS.get(ticket);
      if (!metadata || metadata.budget !== budget || metadata.settled) throw new Error('UNTRUSTED_REQUEST_BUDGET_TICKET');
      return metadata.entry.ordinal;
    },
    completeRequest(ticket, outcome = 'success', identity = null, responseStatus = null) {
      const metadata = TICKETS.get(ticket);
      if (!metadata || metadata.budget !== budget) throw new Error('UNTRUSTED_REQUEST_BUDGET_TICKET');
      if (metadata.settled) throw new Error('REQUEST_BUDGET_ALREADY_COMPLETED');
      metadata.settled = true;
      try {
        let validationError = null;
        if (!['success', 'failed', 'cancelled_after_dispatch'].includes(outcome)) {
          validationError = new Error('INVALID_REQUEST_BUDGET_OUTCOME');
        } else if (responseStatus !== null && (!Number.isInteger(responseStatus) || responseStatus < 100 || responseStatus > 599)) {
          validationError = new Error('INVALID_REQUEST_RESPONSE_STATUS');
        }
        if (validationError) {
          // The provider was already entered. Persist failure without inventing
          // HTTP status or accepting unverified identity, then reject admission.
          outcome = 'failed';
          identity = null;
          responseStatus = null;
        }
        journal?.complete(metadata.entry.ordinal, outcome, identity, responseStatus);
        metadata.entry.outcome = outcome;
        if (outcome === 'failed') failed++;
        if (outcome === 'cancelled_after_dispatch') { failed++; cancelledAfter++; }
        if (validationError) throw validationError;
      } finally {
        journal?.leaveRequest();
      }
    },
    report() {
      return {
        projectRef: options.projectRef, runId: options.runId, maxTotalRequests: LIMIT,
        minIntervalMs: INTERVAL, pacingMode: mode, simulatedPacing: mode === 'recorded_zero_wait',
        simulatedTransportRequests: dispatched, actualHostedRequests: 0, pendingReservations: reserved,
        blockedRequests: blocked, failedRequestAttempts: failed, cancelledBeforeDispatch: cancelledBefore,
        cancelledAfterDispatch: cancelledAfter, auxiliaryRequests: auxiliaryAttempts, cleanupRequests: cleanupAttempts,
        probeTransportRequests: dispatched - auxiliaryAttempts - cleanupAttempts,
        cleanupPolicy: 'SHARED_TOTAL_LIMIT_NO_EXTRA_ALLOWANCE', reservedCleanupCapacity: 0,
        remainingCapacity: LIMIT - consumed - reserved, intervalsMs: intervals.slice(), attempts: attempts.map(entry => ({ ...entry })),
        ...(journal ? {
          consumedAttempts: consumed, reservedWithoutDispatch: consumed - dispatched, durableDispatchMarkers: dispatched
        } : {})
      };
    }
  });
  TRUSTED_BUDGETS.add(budget);
  if (journal) DURABLE_BUDGETS.set(journal, budget);
  else RUN_BUDGETS.set(key, budget);
  return budget;
}
export function assertRunRequestBudget(budget, projectRef, runId) {
  if (!TRUSTED_BUDGETS.has(budget)) throw new Error('UNTRUSTED_RUN_REQUEST_BUDGET');
  const report = budget.report();
  if (report.projectRef !== projectRef || report.runId !== runId) throw new Error('REQUEST_BUDGET_BINDING_MISMATCH');
  return budget;
}

// The operation is a module-owned dispatch closure. Outcome persistence must
// happen after it settles and outside the operation's exception handler.
export async function executeRunBudgetRequest(budget, request, operation) {
  const ticket = await budget.beginRequest(request);
  let identity = null;
  let result;
  let outcome;
  let responseStatus;
  try {
    result = await operation(budget.requestOrdinal(ticket), observed => { identity = observed; });
    outcome = result?.ok === false ? 'failed' : 'success';
    responseStatus = result?.status ?? null;
  } catch (error) {
    let cancelled = false;
    // Rejection metadata is diagnostic and may itself be unreadable.
    try { cancelled = error?.name === 'AbortError'; } catch { /* retain failed classification */ }
    budget.completeRequest(ticket, cancelled ? 'cancelled_after_dispatch' : 'failed');
    throw error;
  }
  budget.completeRequest(ticket, outcome, identity, responseStatus);
  return result;
}
