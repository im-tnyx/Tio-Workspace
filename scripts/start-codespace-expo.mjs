import { spawn } from 'node:child_process';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stateDirectory = join(homedir(), '.cache', 'tnyx-expo-preview');
const lockPath = join(stateDirectory, 'start.lock');
const pidPath = join(stateDirectory, 'metro.pid');
const logPath = join(stateDirectory, 'metro.log');
const metroPort = 8081;
const startupTimeoutMs = 300_000;
const shouldRestart = process.argv.includes('--restart');
const shouldStop = process.argv.includes('--stop');

mkdirSync(stateDirectory, { recursive: true, mode: 0o700 });

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function processGroupExists(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function readManagedPid() {
  if (!existsSync(pidPath)) return null;

  const pid = Number(readFileSync(pidPath, 'utf8').trim());
  if (!Number.isInteger(pid) || pid < 1) return null;

  try {
    const command = readFileSync(`/proc/${pid}/cmdline`, 'utf8').replaceAll('\0', ' ');
    const workingDirectory = resolve(readlinkSync(`/proc/${pid}/cwd`));
    const looksLikeMobileScript = command.includes('npm')
      && command.includes('run')
      && command.includes('mobile');

    return workingDirectory === projectRoot && looksLikeMobileScript ? pid : null;
  } catch {
    return null;
  }
}

async function expoServerIsReady() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1_500);

  try {
    const response = await fetch(`http://127.0.0.1:${metroPort}/status`, {
      signal: controller.signal,
    });
    return response.ok && (await response.text()).includes('packager-status:running');
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function assertMetroPortIsFree() {
  await new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        rejectPort(new Error(`Port ${metroPort} is already used by a non-Expo process.`));
        return;
      }
      rejectPort(error);
    });
    server.listen(metroPort, '127.0.0.1', () => {
      server.close((error) => (error ? rejectPort(error) : resolvePort()));
    });
  });
}

async function acquireLock() {
  const deadline = Date.now() + startupTimeoutMs;

  while (Date.now() < deadline) {
    try {
      const file = openSync(lockPath, 'wx', 0o600);
      writeFileSync(file, String(process.pid));
      return () => {
        closeSync(file);
        rmSync(lockPath, { force: true });
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;

      let lockPid = 0;
      try {
        lockPid = Number(readFileSync(lockPath, 'utf8').trim());
      } catch {
        // An empty or unreadable lock is stale and is removed below.
      }

      if (!Number.isInteger(lockPid) || lockPid < 1 || !processExists(lockPid)) {
        rmSync(lockPath, { force: true });
      }

      await delay(1_000);
    }
  }

  throw new Error(`Timed out waiting for the Expo startup lock. See ${logPath}.`);
}

async function stopManagedServer() {
  const pid = readManagedPid();
  if (!pid) {
    if (await expoServerIsReady()) {
      throw new Error('Expo is running but is not owned by this starter; refusing to stop it.');
    }
    rmSync(pidPath, { force: true });
    return;
  }

  try {
    process.kill(-pid, 'SIGTERM');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline && ((await expoServerIsReady()) || processGroupExists(pid))) {
    await delay(250);
  }

  if ((await expoServerIsReady()) || processGroupExists(pid)) {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }

  rmSync(pidPath, { force: true });
}

async function startServer() {
  await assertMetroPortIsFree();

  const logFile = openSync(logPath, 'w', 0o600);
  const child = spawn('npm', ['run', 'mobile'], {
    cwd: projectRoot,
    detached: true,
    env: {
      ...process.env,
      EXPO_NO_TELEMETRY: '1',
    },
    stdio: ['ignore', logFile, logFile],
  });
  closeSync(logFile);

  if (!child.pid) throw new Error(`Could not launch Expo. See ${logPath}.`);

  let exit = null;
  child.once('error', (error) => {
    exit = { error };
  });
  child.once('exit', (code, signal) => {
    exit = { code, signal };
  });
  writeFileSync(pidPath, String(child.pid), { mode: 0o600 });
  child.unref();

  const deadline = Date.now() + startupTimeoutMs;
  while (Date.now() < deadline) {
    if (await expoServerIsReady()) {
      console.log(`Expo Go dev server is running on the Codespace tunnel. Log: ${logPath}`);
      return;
    }
    if (exit) {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
      rmSync(pidPath, { force: true });
      const reason = exit.error?.message ?? `exit ${exit.code ?? exit.signal}`;
      throw new Error(`Expo exited before Metro became ready (${reason}). See ${logPath}.`);
    }
    await delay(1_000);
  }

  await stopManagedServer();
  throw new Error(`Expo did not become ready within 5 minutes. See ${logPath}.`);
}

async function main() {
  if (!process.platform.startsWith('linux')) {
    throw new Error('This starter is intended to run inside a Linux GitHub Codespace.');
  }

  const releaseLock = await acquireLock();

  try {
    if (shouldStop) {
      await stopManagedServer();
      console.log('Expo Go dev server stopped.');
      return;
    }

    if (shouldRestart) {
      await stopManagedServer();
    } else if (await expoServerIsReady()) {
      console.log('Expo Go dev server is already running.');
      return;
    }

    await startServer();
  } finally {
    releaseLock();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
