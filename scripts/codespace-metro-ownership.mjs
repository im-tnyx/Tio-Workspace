import { spawnSync } from 'node:child_process';
import {
  closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync,
  readdirSync, readFileSync, readlinkSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

const uid = process.getuid?.();
const missing = (error) => error.code === 'ENOENT' || error.code === 'ESRCH';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function privateFile(path, flags) {
  const fd = openSync(path, flags | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o600);
  const stat = fstatSync(fd);
  if (stat.isFile() && stat.uid === uid && stat.nlink === 1 && (stat.mode & 0o777) === 0o600) {
    return fd;
  }
  closeSync(fd);
  throw new Error('Unsafe Metro state file: ' + path);
}

export async function withMetroLock(directory, callback) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = lstatSync(directory);
  assert(stat.isDirectory() && stat.uid === uid && (stat.mode & 0o777) === 0o700,
    'Unsafe Metro state directory');
  // File descriptor 3 shares the parent's open file description. The lock
  // lives until this callback finishes, even after the flock child exits.
  const fd = privateFile(join(directory, 'ownership.lock'), constants.O_RDWR | constants.O_CREAT);
  try {
    const lock = spawnSync('flock', ['--exclusive', '--timeout', '320', '3'], {
      stdio: ['ignore', 'ignore', 'inherit', fd],
    });
    if (lock.error) throw lock.error;
    assert(lock.status === 0, 'Cannot acquire the Metro ownership lock');
    const bound = fstatSync(fd);
    const current = lstatSync(join(directory, 'ownership.lock'));
    assert(current.dev === bound.dev && current.ino === bound.ino, 'Metro ownership lock changed');
    return await callback();
  } finally {
    closeSync(fd);
  }
}

function readPrivateFile(path) {
  let fd;
  try {
    fd = privateFile(path, constants.O_RDONLY);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  try {
    const stat = fstatSync(fd, { bigint: true });
    assert(stat.size <= 4096n, 'Metro state record is too large');
    const content = readFileSync(fd, 'utf8');
    assert(fstatSync(fd, { bigint: true }).ctimeNs === stat.ctimeNs, 'Metro state record changed during read');
    return { dev: stat.dev, ino: stat.ino, changed: stat.ctimeNs, content };
  } finally {
    closeSync(fd);
  }
}

function sameFile(before, after) {
  return before === after || Boolean(before && after && before.dev === after.dev &&
    before.ino === after.ino && before.changed === after.changed && before.content === after.content);
}

function readProcess(pid) {
  const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
  // The command field may contain spaces and parentheses.
  const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/ +/);
  const group = Number(fields[2]);
  const session = Number(fields[3]);
  const startTicks = fields[19];
  assert(Number.isInteger(group) && group > 0 && Number.isInteger(session) && session > 0 &&
    /^\d+$/.test(startTicks ?? ''), 'Cannot read Linux process identity');
  return { pid, group, session, startTicks, status: fields[0] };
}

function processIsAbsent(pid) {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    if (error.code === 'ESRCH') return true;
    throw new Error('Cannot verify whether a recorded Metro process exists', { cause: error });
  }
}

function listeningSockets(port) {
  const portHex = port.toString(16).padStart(4, '0').toUpperCase();
  return ['/proc/net/tcp', '/proc/net/tcp6'].flatMap((table) => {
    const entries = readFileSync(table, 'utf8').trim().split('\n');
    assert(entries.shift()?.includes('local_address'), 'Cannot read the system TCP listener table');
    return entries.flatMap((entry) => {
      const fields = entry.trim().split(/\s+/);
      assert(fields.length >= 10, 'Incomplete TCP listener evidence');
      if (fields[3] !== '0A' || fields[1].split(':')[1] !== portHex) return [];
      assert(/^[1-9]\d*$/.test(fields[9]), 'Cannot verify the TCP listener inode');
      return [fields[9]];
    });
  }).sort();
}

function processGroupMembers(leader) {
  return readdirSync('/proc').filter((entry) => /^[1-9]\d*$/.test(entry)).flatMap((entry) => {
    const pid = Number(entry);
    try {
      const member = readProcess(pid);
      if (member.group !== leader || member.session !== leader) return [];
      assert(lstatSync(`/proc/${pid}`).uid === uid, 'A Metro process group member has a foreign owner');
      return [member];
    } catch (error) {
      if (missing(error)) return [];
      throw error;
    }
  });
}

function verifyListeners(port, sockets, members) {
  const owned = new Set();
  for (const { pid, startTicks, group, session } of members) {
    const dir = `/proc/${pid}/fd`;
    const socketsForProcess = [];
    try {
      for (const fd of readdirSync(dir)) {
        try {
          const socket = /^socket:\[(\d+)\]$/.exec(readlinkSync(join(dir, fd)));
          if (socket) socketsForProcess.push(socket[1]);
        } catch (error) {
          if (!missing(error)) throw error;
        }
      }
      const current = readProcess(pid);
      assert(current.startTicks === startTicks && current.group === group && current.session === session,
        'Metro listener process changed during verification');
      for (const socket of socketsForProcess) owned.add(socket);
    } catch (error) {
      if (!missing(error)) throw error;
    }
  }
  assert(sockets.every((socket) => owned.has(socket)) &&
    listeningSockets(port).join(',') === sockets.join(','),
  'Metro port has a foreign listener or its ownership changed');
}

function bootId() {
  return readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
}

function verifyRecord(record, projectRoot, port) {
  assert(record && record.version === 1 && record.projectRoot === projectRoot &&
    record.port === port && record.uid === uid && Number.isSafeInteger(record.pid) &&
    record.pid > 1 && /^[0-9a-f-]{36}$/.test(record.bootId ?? '') &&
    /^\d+$/.test(record.startTicks ?? ''), 'Invalid managed Metro record');
}

export function recordMetro(recordPath, projectRoot, port, pid) {
  const identity = readProcess(pid);
  assert(identity.group === pid && identity.session === pid &&
    readlinkSync(`/proc/${pid}/cwd`) === projectRoot && lstatSync(`/proc/${pid}`).uid === uid,
  'Cannot verify the newly spawned Metro process');
  const record = { version: 1, projectRoot, port, uid, pid, bootId: bootId(), startTicks: identity.startTicks };
  writeFileSync(recordPath, JSON.stringify(record) + '\n', { flag: 'wx', mode: 0o600 });
}

// Called under the shared ownership lock by both preflight and the starter.
export function inspectMetro(recordPath, projectRoot, port) {
  const snapshot = readPrivateFile(recordPath);
  if (!snapshot) {
    assert(readPrivateFile(join(dirname(recordPath), 'metro.pid')) === null,
      'Legacy Metro PID record found. Stop the prior starter and verify the port before upgrading.');
    assert(listeningSockets(port).length === 0 && readPrivateFile(recordPath) === null,
      'Metro port is occupied or the ownership record changed');
    return { state: 'vacant' };
  }

  const record = JSON.parse(snapshot.content);
  verifyRecord(record, projectRoot, port);
  let processIdentity;
  try {
    processIdentity = readProcess(record.pid);
  } catch (error) {
    if (!missing(error)) throw error;
    assert(processIsAbsent(record.pid), 'Recorded Metro PID could not be proven absent');
    const groupAbsent = processIsAbsent(-record.pid);
    const portFree = listeningSockets(port).length === 0;
    assert(sameFile(snapshot, readPrivateFile(recordPath)), 'Metro ownership record changed');
    if (!groupAbsent) {
      throw Object.assign(new Error('Recorded Metro is absent but its process group is still present'), {
        code: 'METRO_DRAINING',
      });
    }
    assert(portFree, 'Recorded Metro is absent but its port is occupied');
    return { state: 'stale', record, snapshot };
  }
  assert(record.bootId === bootId() && processIdentity.startTicks === record.startTicks &&
    processIdentity.group === record.pid && processIdentity.session === record.pid &&
    lstatSync(`/proc/${record.pid}`).uid === uid,
  'Recorded Metro PID now belongs to a different process');
  if (processIdentity.status === 'Z') {
    assert(sameFile(snapshot, readPrivateFile(recordPath)), 'Metro ownership record changed');
    throw Object.assign(new Error('Managed Metro exited but its PID has not been reaped'), {
      code: 'METRO_DRAINING',
    });
  }
  assert(readlinkSync(`/proc/${record.pid}/cwd`) === projectRoot, 'Metro working directory changed');

  const sockets = listeningSockets(port);
  const members = processGroupMembers(record.pid);
  if (sockets.length) verifyListeners(port, sockets, members);
  else assert(listeningSockets(port).length === 0, 'Metro listener appeared during verification');
  assert(members.some(({ pid, startTicks }) => pid === record.pid && startTicks === record.startTicks) &&
    readProcess(record.pid).startTicks === record.startTicks &&
    sameFile(snapshot, readPrivateFile(recordPath)), 'Metro process or ownership record changed');
  return { state: 'owned', listening: sockets.length > 0, record, snapshot, members };
}

export function clearStaleMetro(recordPath, projectRoot, port, observation) {
  const current = inspectMetro(recordPath, projectRoot, port);
  assert(observation.state === 'stale' && current.state === 'stale' &&
    sameFile(observation.snapshot, current.snapshot), 'Metro state changed during recovery');
  unlinkSync(recordPath);
}

export function verifyMetroObservation(before, after) {
  assert(before.state === after.state && sameFile(before.snapshot, after.snapshot),
    'Metro ownership record or process state changed');
}

export function openMetroLog(path) {
  const fd = privateFile(path, constants.O_WRONLY | constants.O_CREAT);
  // Verify the log inode before truncating it.
  return fd;
}
