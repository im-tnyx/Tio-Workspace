import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, openSync, closeSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { types } from 'node:util';
import { assertRecoveryStorageObservation } from './conditional-storage-fixture.mjs';
import { consumeLiveCleanupResolution } from './hosted-probe-runner.mjs';

export const RECOVERY_PROJECT = 'wvdabiwbaavfggcmpizd';
export const REQUEST_LIMIT = 25;
export const REQUEST_INTERVAL_MS = 1000;
const VERSION = 1;
const MAX_EVENTS = 512;
// All replay-admitted scalar strings are bounded ASCII. Non-resolution
// events fit 256 bytes; total resolution keys <= event count, ordinals <=25.
// 512*256 + 512*67 + 25*4 + envelope < 256 KiB, including legacy V1 events.
const MAX_PAYLOAD_BYTES = 256 * 1024;
const SCHEMA = 'CREATE TABLE journal (id INTEGER PRIMARY KEY CHECK (id = 1), payload TEXT NOT NULL, digest TEXT NOT NULL) STRICT';
const require = createRequire(import.meta.url);
const active = new Map();
const handles = new WeakMap();
const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const runPattern = /^h4-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const kinds = ['read', 'storage_absence_read', 'storage_upload', 'storage_delete', 'auth_effect', 'auth_delete', 'other_effect', 'recovery_lookup', 'recovery_delete'];
const categories = ['probe', 'auxiliary', 'cleanup'];
const outcomes = ['success', 'failed', 'cancelled_after_dispatch'];
const modes = ['standard', 'recorded_zero_wait'];
const storageKinds = ['storage_upload', 'storage_delete', 'recovery_delete'];
const inventoryKinds = ['auth', 'storage', 'other'];

function fail(code) {
  return Object.assign(new Error(code), { code });
}

export function recoveryOptions(raw, fields) {
  if (!raw || typeof raw !== 'object' || types.isProxy(raw) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(raw)) || Object.getOwnPropertySymbols(raw).length) {
    throw fail('INVALID_RECOVERY_OPTIONS');
  }
  const options = Object.create(null);
  for (const key of Object.getOwnPropertyNames(raw)) {
    const descriptor = Object.getOwnPropertyDescriptor(raw, key);
    if (!fields.includes(key) || !Object.hasOwn(descriptor, 'value')) throw fail('INVALID_RECOVERY_OPTIONS');
    options[key] = descriptor.value;
  }
  return options;
}

function stat(path) {
  return lstatSync(path, { throwIfNoEntry: false });
}

function validateRegularFile(path, file, { optional = false, empty = false } = {}) {
  if (!file && optional) return;
  if (!file?.isFile() || file.isSymbolicLink() || file.nlink !== 1 || (!empty && file.size === 0) ||
      file.size > 1024 * 1024 || realpathSync.native(path) !== path) throw fail('UNSAFE_RECOVERY_JOURNAL_FILE');
}

function directoryPath(directory) {
  if (!['win32', 'linux'].includes(process.platform) || typeof directory !== 'string' || !isAbsolute(directory) ||
      directory !== resolve(directory) || (process.platform === 'win32' && !/^[A-Z]:\\/i.test(directory))) {
    throw fail('UNSAFE_RECOVERY_DIRECTORY');
  }
  const canonical = realpathSync.native(directory);
  if (canonical !== directory) throw fail('UNSAFE_RECOVERY_DIRECTORY');
  const fromProject = relative(resolve(projectRoot), canonical);
  if (!fromProject || (!isAbsolute(fromProject) && fromProject !== '..' && !fromProject.startsWith('..' + sep))) {
    throw fail('RECOVERY_DIRECTORY_INSIDE_CHECKOUT');
  }
  for (let path = canonical; ; path = dirname(path)) {
    const entry = stat(path);
    if (!entry?.isDirectory() || entry.isSymbolicLink() || existsSync(join(path, '.git'))) throw fail('UNSAFE_RECOVERY_DIRECTORY');
    if (dirname(path) === path) break;
  }
  const owner = stat(canonical);
  if (process.platform === 'linux' && (owner.uid !== process.getuid() || (owner.mode & 0o077) !== 0)) {
    throw fail('RECOVERY_DIRECTORY_NOT_PRIVATE');
  }
  return canonical;
}

function verifyFiles(path, creating) {
  validateRegularFile(path, stat(path), { empty: creating });
  const rollback = path + '-journal';
  validateRegularFile(rollback, stat(rollback), { optional: true, empty: true });
  if (stat(path + '-wal') || stat(path + '-shm')) throw fail('UNEXPECTED_RECOVERY_SIDECAR');
}

function digest(payload) {
  return createHash('sha256').update(payload).digest('hex');
}

function validTime(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function validIdentity(first, second) {
  return typeof first === 'string' && uuid.test(first) && typeof second === 'string' && uuid.test(second);
}

function pendingStorage(state) {
  return state.attempts.filter(a => a.dispatchedAt !== null && storageKinds.includes(a.kind) && a.ordinal > state.absentThrough);
}

function hasStorageObligation(state) {
  return pendingStorage(state).length > 0 || state.inventoryKinds.has('storage') || [...state.obligations.values()].includes('storage');
}

function residuals(state) {
  const effects = state.attempts.filter(a => !state.resolvedAttempts.has(a.ordinal) && a.dispatchedAt !== null && ['auth_effect', 'auth_delete', 'other_effect'].includes(a.kind));
  return {
    storage: pendingStorage(state),
    other: effects,
    volatileInventory: state.inventoryKinds.size > 0 || state.obligations.size > 0
  };
}

// Replaying the closed set of events validates on-disk transitions before any
// budget or provider capability can use them. Sequence is the array index.
function replay(events, mode) {
  const state = { attempts: [], absentThrough: 0, ownership: null, terminal: false, inventoryKinds: new Set(), obligations: new Map(), reservations: new Map(), resolvedAttempts: new Set(), recovery: false };
  const invalid = () => { throw fail('INVALID_RECOVERY_TRANSITION'); };
  if (!Array.isArray(events) || events.length > MAX_EVENTS) invalid();
  for (const event of events) {
    if (!Array.isArray(event) || state.terminal) invalid();
    const [type, ordinal, first, second, third] = event;
    const attempt = Number.isSafeInteger(ordinal) ? state.attempts[ordinal - 1] : undefined;
    switch (type) {
      case 'recovery':
        if (event.length !== 1 || state.recovery) invalid();
        state.recovery = true;
        break;
      case 'reserve':
        if (![5, 6].includes(event.length) || (event.length === 6 && (typeof event[5] !== 'string' || !/^[a-f0-9]{64}$/.test(event[5]))) || ordinal !== state.attempts.length + 1 || ordinal > REQUEST_LIMIT ||
            !categories.includes(first) || !kinds.includes(second) || !validTime(third) ||
            (state.recovery !== second.startsWith('recovery_')) ||
            (second.startsWith('recovery_') && first !== 'cleanup') ||
            (second === 'recovery_delete' && state.ownership?.lookupOrdinal !== ordinal - 1) ||
            (second === 'auth_delete' && hasStorageObligation(state))) invalid();
        if (mode === 'standard' && state.attempts.length &&
            third - (state.attempts.at(-1).dispatchedAt ?? state.attempts.at(-1).reservedAt) < REQUEST_INTERVAL_MS) invalid();
        state.attempts.push({
          ordinal, category: first, kind: second, reservedAt: third,
          dispatchedAt: null, outcome: 'pending', objectId: null, ownerId: null,
          ...(event.length === 6 ? { resourceKey: event[5] } : {})
        });
        break;
      case 'dispatch':
        if (event.length !== 3 || !attempt || ordinal !== state.attempts.length ||
            attempt.dispatchedAt !== null || !validTime(first) || first < attempt.reservedAt ||
            (state.recovery !== attempt.kind.startsWith('recovery_')) ||
            (attempt.kind === 'auth_delete' && hasStorageObligation(state))) invalid();
        attempt.dispatchedAt = first;
        break;
      case 'outcome':
        if (event.length !== 5 || !attempt || attempt.dispatchedAt === null || attempt.outcome !== 'pending' ||
            !outcomes.includes(first) || (state.recovery !== attempt.kind.startsWith('recovery_'))) invalid();
        if ((second !== null || third !== null) &&
            (attempt.kind !== 'storage_upload' || first !== 'success' ||
              !validIdentity(second, third))) invalid();
        attempt.outcome = first;
        attempt.objectId = second;
        attempt.ownerId = third;
        break;
      case 'ownership':
        if (event.length !== 5 || !state.recovery || !attempt || attempt.kind !== 'storage_upload' ||
            attempt.dispatchedAt === null || ordinal <= state.absentThrough || first !== state.attempts.length ||
            state.attempts.at(-1).kind !== 'recovery_lookup' || state.attempts.at(-1).outcome !== 'success' ||
            !validIdentity(second, third) ||
            (attempt.objectId && (attempt.objectId !== second || attempt.ownerId !== third)) ||
            (state.ownership?.attemptOrdinal === ordinal &&
              (state.ownership.lookupOrdinal === first || state.ownership.objectId !== second || state.ownership.ownerId !== third))) invalid();
        state.ownership = { attemptOrdinal: ordinal, lookupOrdinal: first, objectId: second, ownerId: third };
        break;
      case 'volatile':
        if (![2, 3].includes(event.length) || !inventoryKinds.includes(ordinal) || state.recovery) invalid();
        if (event.length === 2) {
          if (state.inventoryKinds.has(ordinal)) invalid();
          state.inventoryKinds.add(ordinal);
        } else {
          if (typeof first !== 'string' || !/^[a-f0-9]{64}$/.test(first) || state.obligations.has(first)) invalid();
          state.obligations.set(first, ordinal);
        }
        break;
      case 'storage_reservation':
        if (event.length !== 3 || state.recovery || typeof ordinal !== 'string' || !/^[a-f0-9]{64}$/.test(ordinal) ||
            typeof first !== 'string' || !/^[a-f0-9]{64}$/.test(first) || state.obligations.has(ordinal) || state.reservations.has(ordinal)) invalid();
        state.obligations.set(ordinal, 'storage');
        state.reservations.set(ordinal, first);
        break;
      case 'noncreation':
        if (event.length !== 3 || state.recovery || !state.obligations.has(ordinal) || state.reservations.get(ordinal) !== first) invalid();
        state.obligations.delete(ordinal);
        state.reservations.delete(ordinal);
        break;
      case 'reservation_absence':
        if (event.length !== 3 || !state.recovery || ordinal !== state.attempts.length ||
            attempt?.kind !== 'recovery_lookup' || attempt.outcome !== 'success' || !state.reservations.has(first) ||
            !state.obligations.has(first)) invalid();
        state.obligations.delete(first);
        state.reservations.delete(first);
        break;
      case 'resolution': {
        if (event.length !== 4 || state.recovery || ordinal !== state.attempts.length ||
            !Array.isArray(first) || !Array.isArray(second) || first.length + second.length === 0) invalid();
        const seen = new Set();
        for (const key of first) {
          if (typeof key !== 'string' || !state.obligations.has(key) || seen.has(key) ||
              !second.some(index => state.attempts[index - 1]?.resourceKey === key)) invalid();
          seen.add(key);
          state.obligations.delete(key);
          state.reservations.delete(key);
        }
        let previous = 0;
        for (const index of second) {
          const effect = state.attempts[index - 1];
          if (!Number.isSafeInteger(index) || index <= previous || !effect || effect.dispatchedAt === null ||
              effect.outcome !== 'success' || state.resolvedAttempts.has(index) ||
              !first.includes(effect.resourceKey) ||
              !['auth_effect', 'auth_delete', 'other_effect', 'storage_delete', 'storage_absence_read', 'read'].includes(effect.kind)) invalid();
          previous = index;
          state.resolvedAttempts.add(index);
        }
        break;
      }
      case 'absence':
        if (event.length !== 2 || ordinal !== state.attempts.length || !attempt ||
            (state.recovery ? attempt.kind !== 'recovery_lookup' || attempt.outcome !== 'success' :
              attempt.kind !== 'storage_absence_read' || attempt.category !== 'cleanup' ||
              !['failed', 'success'].includes(attempt.outcome)) ||
            pendingStorage(state).length === 0) invalid();
        state.absentThrough = ordinal;
        break;
      case 'terminal': {
        const pending = residuals(state);
        if (event.length !== 1 || pending.storage.length || pending.other.length || pending.volatileInventory) invalid();
        state.terminal = true;
        break;
      }
      default:
        invalid();
    }
  }
  return state;
}

function openJournal(rawOptions, creating) {
  const options = recoveryOptions(rawOptions, creating ? ['directory', 'projectRef', 'mode'] : ['directory', 'projectRef', 'runId']);
  const runId = creating ? 'h4-' + randomUUID() : options.runId;
  if (options.projectRef !== RECOVERY_PROJECT || typeof runId !== 'string' || !runPattern.test(runId)) {
    throw fail('RECOVERY_SCOPE_MISMATCH');
  }
  const directory = directoryPath(options.directory);
  if (active.has(runId)) throw fail('RECOVERY_JOURNAL_BUSY');
  const path = join(directory, runId + '.sqlite');
  let mode = creating && Object.hasOwn(options, 'mode') ? options.mode : 'standard';
  if (!modes.includes(mode)) throw fail('INVALID_RECOVERY_PACING_MODE');
  if (creating) closeSync(openSync(path, 'wx', 0o600));
  else if (!stat(path)) throw fail('RECOVERY_ACCOUNTING_MISSING');
  verifyFiles(path, creating);

  const { DatabaseSync } = require('node:sqlite');
  let db;
  try {
    db = new DatabaseSync(path, { allowExtension: false });
    db.exec('PRAGMA busy_timeout = 0; PRAGMA trusted_schema = OFF; PRAGMA locking_mode = EXCLUSIVE; PRAGMA synchronous = EXTRA;');
    if (db.prepare('PRAGMA journal_mode').get().journal_mode !== 'delete' ||
        db.prepare('PRAGMA locking_mode').get().locking_mode !== 'exclusive' ||
        db.prepare('PRAGMA synchronous').get().synchronous !== 3) throw fail('UNSAFE_RECOVERY_SQLITE_CONFIGURATION');
    db.exec('BEGIN EXCLUSIVE;');
    let events = [];
    let state;
    if (creating) {
      db.exec(SCHEMA);
      const payload = JSON.stringify([VERSION, options.projectRef, runId, mode, events]);
      db.prepare('INSERT INTO journal VALUES (1, ?, ?)').run(payload, digest(payload));
    } else {
      const schema = db.prepare('SELECT type, name, sql FROM sqlite_schema').all();
      if (db.prepare('PRAGMA integrity_check(1)').get().integrity_check !== 'ok' ||
          schema.length !== 1 || schema[0].type !== 'table' || schema[0].name !== 'journal' || schema[0].sql !== SCHEMA) {
        throw fail('INVALID_RECOVERY_SCHEMA');
      }
      const rows = db.prepare('SELECT id, payload, digest FROM journal LIMIT 2').all();
      const row = rows[0];
      if (rows.length !== 1 || row.id !== 1 || typeof row.payload !== 'string' || Buffer.byteLength(row.payload, 'utf8') > MAX_PAYLOAD_BYTES ||
          row.digest !== digest(row.payload)) throw fail('CORRUPT_RECOVERY_JOURNAL');
      const envelope = JSON.parse(row.payload);
      if (!Array.isArray(envelope) || envelope.length !== 5 || JSON.stringify(envelope) !== row.payload) throw fail('CORRUPT_RECOVERY_JOURNAL');
      if (envelope[0] !== VERSION) throw fail('UNSUPPORTED_RECOVERY_VERSION');
      if (envelope[1] !== options.projectRef || envelope[2] !== runId) throw fail('RECOVERY_SCOPE_MISMATCH');
      mode = envelope[3];
      if (!modes.includes(mode)) throw fail('INVALID_RECOVERY_PACING_MODE');
      events = envelope[4];
    }
    state = replay(events, mode);
    db.exec('COMMIT;'); // In EXCLUSIVE locking mode the connection retains ownership.
    const originalFile = stat(path);
    let failed = false;
    let closed = false;
    let leases = 0;
    let reconciling = false;
    const requireUsable = () => {
      if (closed || failed) throw fail('RECOVERY_JOURNAL_UNAVAILABLE');
    };
    function append(event) {
      requireUsable();
      const next = [...events, event];
      const nextState = replay(next, mode);
      const payload = JSON.stringify([VERSION, RECOVERY_PROJECT, runId, mode, next]);
      // Eight events per remaining request cover reserve/dispatch/outcome,
      // ownership/absence/resolution plus slack. Existing admitted requests
      // retain two completion events; every pending key retains a resolution.
      const outstanding = nextState.attempts.filter(a => a.outcome === 'pending').length;
      const headroom = 8 * (REQUEST_LIMIT - nextState.attempts.length) + 2 * outstanding + nextState.obligations.size + 4;
      if (Buffer.byteLength(payload, 'utf8') > MAX_PAYLOAD_BYTES ||
          (['volatile', 'storage_reservation', 'reserve'].includes(event[0]) && next.length + headroom > MAX_EVENTS)) {
        throw fail('RECOVERY_CAPACITY_EXCEEDED');
      }
      try {
        verifyFiles(path, false);
        const currentFile = stat(path);
        if (currentFile.dev !== originalFile.dev || currentFile.ino !== originalFile.ino) throw fail('RECOVERY_FILE_REPLACED');
        if (db.prepare('UPDATE journal SET payload = ?, digest = ? WHERE id = 1').run(payload, digest(payload)).changes !== 1) {
          throw fail('RECOVERY_ACCOUNTING_MISSING');
        }
      } catch {
        failed = true;
        throw fail('RECOVERY_PERSISTENCE_FAILED');
      }
      events = next;
      state = nextState;
    }
    if (!creating && !state.terminal && !state.recovery) append(['recovery']);
    const handle = Object.freeze({
      projectRef: RECOVERY_PROJECT,
      runId,
      report() {
        requireUsable();
        return {
          projectRef: RECOVERY_PROJECT, runId, mode, consumed: state.attempts.length,
          status: state.terminal ? 'CLEANUP_VERIFIED_SUCCESS' : 'RECOVERY_REQUIRED',
          lastVerifiedStorageAbsenceOrdinal: state.absentThrough || null,
          attempts: state.attempts.map(attempt => ({ ...attempt })),
          residual: {
            storage: pendingStorage(state).map(a => a.ordinal),
            credentialDependent: residuals(state).other.filter(a => ['auth_effect', 'auth_delete'].includes(a.kind)).map(a => a.ordinal),
            unclassified: residuals(state).other.filter(a => a.kind === 'other_effect').map(a => a.ordinal),
            volatileInventory: residuals(state).volatileInventory,
            volatileKinds: [...new Set([...state.inventoryKinds, ...state.obligations.values()])]
          }
        };
      },
      close() {
        if (closed) return;
        if (leases || reconciling) throw fail('RECOVERY_JOURNAL_IN_USE');
        db.close();
        closed = true;
        active.delete(runId);
      }
    });
    const internal = Object.freeze({
      get state() { requireUsable(); return replay(events, mode); },
      handle, mode,
      enterRequest() { requireUsable(); leases++; },
      leaveRequest() { leases--; },
      reserve(ordinal, category, kind, time, resourceKey = null) {
        if (state.recovery && !reconciling) throw fail('RECOVERY_RECONCILIATION_REQUIRED');
        append(resourceKey === null ? ['reserve', ordinal, category, kind, time] : ['reserve', ordinal, category, kind, time, resourceKey]);
      },
      dispatch(ordinal, time) { append(['dispatch', ordinal, time]); },
      complete(ordinal, outcome, identity) {
        const candidate = identity === null ? null : recoveryOptions(identity, ['projectRef', 'runId', 'bucket', 'path', 'objectId', 'ownerId']);
        if (candidate && (candidate.projectRef !== RECOVERY_PROJECT || candidate.runId !== runId ||
            candidate.bucket !== 'task06i_probe_bucket' || candidate.path !== runId + '/probe.txt' ||
            !validIdentity(candidate.objectId, candidate.ownerId))) throw fail('INVALID_RECOVERY_STORAGE_CANDIDATE');
        append(['outcome', ordinal, outcome, candidate?.objectId ?? null, candidate?.ownerId ?? null]);
      },
      volatile(kind, resource = null) {
        requireUsable();
        if (state.recovery || state.terminal) throw fail('RECOVERY_INVENTORY_MUTATION_BLOCKED');
        if (resource !== null) {
          if (typeof resource !== 'string' || resource.length > 512) throw fail('INVALID_RECOVERY_RESOURCE');
          const key = digest(kind + ':' + resource);
          if (!state.obligations.has(key)) append(['volatile', kind, key]);
          return key;
        }
        if (!state.inventoryKinds.has(kind)) append(['volatile', kind]);
      },
      reserveStorage(resource, operation) {
        requireUsable();
        if (typeof resource !== 'string' || resource.length > 512 || typeof operation !== 'string' || !operation || operation.length > 512) throw fail('INVALID_RECOVERY_RESOURCE');
        const key = digest('storage:' + resource);
        append(['storage_reservation', key, digest(operation)]);
        return key;
      },
      resolveNonCreation(receipt) {
        requireUsable();
        if (leases || state.recovery || state.terminal) throw fail('RECOVERY_RESOLUTION_BLOCKED');
        const proof = consumeLiveCleanupResolution(receipt, handle);
        if (proof.type !== 'noncreation') throw fail('UNTRUSTED_LIVE_CLEANUP_RESOLUTION');
        append(['noncreation', proof.key, proof.operation]);
      },
      resolveLive(receipt) {
        requireUsable();
        if (leases || state.recovery || state.terminal) throw fail('RECOVERY_RESOLUTION_BLOCKED');
        const proof = consumeLiveCleanupResolution(receipt, handle);
        const keys = proof.keys.filter(key => state.obligations.has(key));
        const attempts = proof.attempts.filter(index => !state.resolvedAttempts.has(index));
        if (keys.length || attempts.length) append(['resolution', state.attempts.length, keys, attempts]);
      },
      observeOwnership(lookupOrdinal, observation) {
        assertRecoveryStorageObservation(observation, RECOVERY_PROJECT, runId);
        if (observation.indeterminate || !observation.current || !observation.creationOrdinal) throw fail('RECOVERY_OWNERSHIP_UNPROVEN');
        append(['ownership', observation.creationOrdinal, lookupOrdinal, observation.current.objectId, observation.current.ownerId]);
      },
      absent(lookupOrdinal, observation) {
        assertRecoveryStorageObservation(observation, RECOVERY_PROJECT, runId);
        if (observation.indeterminate || observation.current) throw fail('RECOVERY_ABSENCE_UNPROVEN');
        if (pendingStorage(state).length) append(['absence', lookupOrdinal]);
        const key = digest('storage:storage:task06i_probe_bucket/' + runId + '/probe.txt');
        if (state.reservations.has(key) && state.obligations.has(key)) append(['reservation_absence', lookupOrdinal, key]);
      },
      hasRecoveryStorageReservation() {
        const key = digest('storage:storage:task06i_probe_bucket/' + runId + '/probe.txt');
        return state.reservations.has(key) && state.obligations.has(key);
      },
      liveAbsence(objectId, ownerId) {
        const uploads = pendingStorage(state).filter(attempt => attempt.kind === 'storage_upload');
        if (leases || uploads.length !== 1 || uploads[0].objectId !== objectId || uploads[0].ownerId !== ownerId) return;
        append(['absence', state.attempts.length]);
      },
      finish() {
        requireUsable();
        if (state.terminal) return true;
        const pending = residuals(state);
        if (leases || pending.storage.length || pending.other.length || pending.volatileInventory) return false;
        append(['terminal']);
        return true;
      },
      beginReconciliation() {
        requireUsable();
        if (!state.recovery && !state.terminal) throw fail('RECOVERY_REOPEN_REQUIRED');
        if (reconciling || leases) throw fail('RECOVERY_JOURNAL_IN_USE');
        reconciling = true;
      },
      endReconciliation() { reconciling = false; }
    });
    active.set(runId, internal);
    handles.set(handle, internal);
    return handle;
  } catch (error) {
    db?.close();
    if (error?.errcode === 5 || error?.errcode === 6) throw fail('RECOVERY_JOURNAL_BUSY');
    if (error?.code?.startsWith('ERR_SQLITE') || error instanceof SyntaxError) throw fail('CORRUPT_OR_UNAVAILABLE_RECOVERY_JOURNAL');
    throw error;
  }
}

export function createOfflineRecoveryJournal(options) {
  return openJournal(options, true);
}

export function reopenOfflineRecoveryJournal(options) {
  return openJournal(options, false);
}

export function requireOfflineRecoveryJournal(handle) {
  const journal = handles.get(handle);
  if (!journal || active.get(handle.runId) !== journal) throw fail('UNTRUSTED_RECOVERY_JOURNAL');
  return journal;
}

export function journalForRun(runId) {
  if (typeof runId !== 'string' || !/^h4-/i.test(runId)) return null;
  const journal = active.get(runId);
  if (!journal) throw fail('RECOVERY_ACCOUNTING_MISSING');
  return journal;
}
