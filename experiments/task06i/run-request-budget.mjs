import { types as utilTypes } from 'node:util';

const RUN_BUDGETS = new Map();
const TRUSTED_BUDGETS = new WeakSet();
const TICKETS = new WeakMap();
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
  return error;
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
  if (RUN_BUDGETS.has(key)) {
    const existing = RUN_BUDGETS.get(key);
    if (options.mode !== undefined && options.mode !== existing.report().pacingMode) throw new Error('REQUEST_BUDGET_MODE_MISMATCH');
    return existing;
  }
  const mode = options.mode ?? 'standard';
  let reserved = 0;
  let attempted = 0;
  let blocked = 0;
  let failed = 0;
  let cancelledBefore = 0;
  let cancelledAfter = 0;
  let cleanupAttempts = 0;
  let auxiliaryAttempts = 0;
  let lastDispatch = null;
  let queue = Promise.resolve();
  const intervals = [];
  const attempts = [];
  const budget = Object.freeze({
    async beginRequest(rawRequest = Object.create(null)) {
      const request = record(rawRequest, ['category', 'signal']);
      const category = request.category ?? 'probe';
      if (!['probe', 'auxiliary', 'cleanup'].includes(category)) throw new Error('INVALID_REQUEST_BUDGET_CATEGORY');
      const signal = trustedSignal(request.signal);
      const rejectCancelled = () => { blocked++; cancelledBefore++; const error = abortError(); error._counted = true; throw error; };
      if (signal && abortedGet.call(signal)) return rejectCancelled();
      // Synchronous reservation occurs before the first await, so concurrent callers cannot oversubscribe.
      if (attempted + reserved >= LIMIT) {
        blocked++;
        const error = new Error('REQUEST_BUDGET_EXHAUSTED: Shared run request limit reached; outstanding resources require recovery');
        error.code = 'REQUEST_BUDGET_EXHAUSTED';
        error.recoveryRequired = category === 'cleanup';
        error.budgetReport = budget.report();
        throw error;
      }
      reserved++;
      const previous = queue;
      let release;
      queue = new Promise(resolve => { release = resolve; });
      try {
        await previous;
        if (signal && abortedGet.call(signal)) return rejectCancelled();
        if (lastDispatch !== null) {
          if (mode === 'standard') {
            // Check against the last actual admission after acquiring the serialized pacing turn.
            while (Date.now() - lastDispatch < INTERVAL) await wait(INTERVAL - (Date.now() - lastDispatch), signal);
          }
          intervals.push(mode === 'standard' ? Date.now() - lastDispatch : INTERVAL);
        }
        if (signal && abortedGet.call(signal)) return rejectCancelled();
        lastDispatch = Date.now();
        attempted++;
        if (category === 'cleanup') cleanupAttempts++;
        if (category === 'auxiliary') auxiliaryAttempts++;
        const ticket = Object.freeze(Object.create(null));
        const entry = { ordinal: attempted, category, dispatchedAt: lastDispatch, outcome: 'pending' };
        attempts.push(entry);
        TICKETS.set(ticket, { budget, entry });
        return ticket;
      } catch (error) {
        if (error?.name === 'AbortError' && error?.code === 'REQUEST_CANCELLED_BEFORE_DISPATCH' && !error._counted) {
          blocked++; cancelledBefore++;
        }
        throw error;
      } finally {
        reserved--;
        release();
      }
    },
    completeRequest(ticket, outcome = 'success') {
      if (!['success', 'failed', 'cancelled_after_dispatch'].includes(outcome)) throw new Error('INVALID_REQUEST_BUDGET_OUTCOME');
      const metadata = TICKETS.get(ticket);
      if (!metadata || metadata.budget !== budget) throw new Error('UNTRUSTED_REQUEST_BUDGET_TICKET');
      if (metadata.entry.outcome !== 'pending') throw new Error('REQUEST_BUDGET_ALREADY_COMPLETED');
      metadata.entry.outcome = outcome;
      if (outcome === 'failed') failed++;
      if (outcome === 'cancelled_after_dispatch') { failed++; cancelledAfter++; }
    },
    report() {
      return {
        projectRef: options.projectRef, runId: options.runId, maxTotalRequests: LIMIT,
        minIntervalMs: INTERVAL, pacingMode: mode, simulatedPacing: mode === 'recorded_zero_wait',
        simulatedTransportRequests: attempted, actualHostedRequests: 0, pendingReservations: reserved,
        blockedRequests: blocked, failedRequestAttempts: failed, cancelledBeforeDispatch: cancelledBefore,
        cancelledAfterDispatch: cancelledAfter, auxiliaryRequests: auxiliaryAttempts, cleanupRequests: cleanupAttempts,
        probeTransportRequests: attempted - auxiliaryAttempts - cleanupAttempts,
        cleanupPolicy: 'SHARED_TOTAL_LIMIT_NO_EXTRA_ALLOWANCE', reservedCleanupCapacity: 0,
        remainingCapacity: LIMIT - attempted - reserved, intervalsMs: intervals.slice(), attempts: attempts.map(entry => ({ ...entry }))
      };
    }
  });
  TRUSTED_BUDGETS.add(budget);
  RUN_BUDGETS.set(key, budget);
  return budget;
}
export function assertRunRequestBudget(budget, projectRef, runId) {
  if (!TRUSTED_BUDGETS.has(budget)) throw new Error('UNTRUSTED_RUN_REQUEST_BUDGET');
  const report = budget.report();
  if (report.projectRef !== projectRef || report.runId !== runId) throw new Error('REQUEST_BUDGET_BINDING_MISMATCH');
  return budget;
}
