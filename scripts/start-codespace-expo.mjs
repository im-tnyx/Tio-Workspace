import { execFileSync, spawn } from 'node:child_process';
import { accessSync, closeSync, constants, ftruncateSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import {
  clearStaleMetro, inspectMetro, openMetroLog, recordMetro, verifyMetroObservation, withMetroLock,
} from './codespace-metro-ownership.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const [operation, targetSha, trustedSha] = process.argv.slice(2);
const projectRoot = operation === '--sync' ? process.cwd() : resolve(scriptDirectory, '..');
const stateDirectory = join(homedir(), '.cache', 'tnyx-expo-preview');
const recordPath = join(stateDirectory, 'metro.json');
const logPath = join(stateDirectory, 'metro.log');
const metroPort = 8081;
const startupTimeoutMs = 300_000;

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

const observeMetro = () => inspectMetro(recordPath, projectRoot, metroPort);

function currentMetro(previous) {
  const current = observeMetro();
  verifyMetroObservation(previous, current);
  return current;
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

async function expoTunnelIsReady() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1_500);

  try {
    const response = await fetch(
      `http://127.0.0.1:${metroPort}/_expo/open?platform=ios&runtime=expo`,
      { signal: controller.signal },
    );
    if (!response.ok) return false;

    const { url } = await response.json();
    const deepLink = new URL(url);
    return ['exp:', 'exps:'].includes(deepLink.protocol)
      && (deepLink.hostname.endsWith('.on.expo.app')
        || deepLink.hostname.endsWith('.exp.direct'));
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

function syncCheckout() {
  const git = (...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
  }).trim();

  const activeBranch = git('branch', '--show-current');
  if (activeBranch && activeBranch !== 'main') throw new Error('Refusing preview outside main or a detached worktree');
  function requireCleanWorktree() {
    if (git('status', '--porcelain=v1', '--untracked-files=normal')) {
      throw new Error('Refusing preview: dedicated Codespace has uncommitted or untracked work');
    }
  }
  requireCleanWorktree();
  git('diff', '--quiet', 'HEAD', trustedSha, '--', 'package.json', 'package-lock.json');

  const hash = execFileSync('bash', ['-o', 'pipefail', '-c',
    "sha256sum package.json package-lock.json | sha256sum | cut -d ' ' -f 1"], {
    cwd: projectRoot,
    encoding: 'utf8',
  }).trim();
  const marker = readFileSync(join(stateDirectory, 'dependency-manifests.sha256'), 'utf8').trim();
  if (hash !== marker) throw new Error('Bootstrap the reviewed main lockfile before syncing');
  accessSync(join(projectRoot, 'node_modules/.bin/expo'), constants.X_OK);

  if (activeBranch || git('rev-parse', 'HEAD') !== targetSha) {
    git('switch', '--detach', '--no-overwrite-ignore', '--no-recurse-submodules', targetSha);
  }
  if (git('rev-parse', 'HEAD') !== targetSha) throw new Error('Worktree differs from the selected preview SHA');
  requireCleanWorktree();
}

function discardStale(observation) {
  if (observation.state === 'stale') {
    clearStaleMetro(recordPath, projectRoot, metroPort, observation);
    console.log('Cleared the stale Metro ownership record.');
  }
}

async function stopOwnedMetro(observation) {
  if (observation.state !== 'owned') {
    discardStale(observation);
    return;
  }
  // pidfds bind signals to the observed process instances. There is no
  // numeric-PID or process-group fallback if the kernel check is unavailable.
  const current = currentMetro(observation);
  execFileSync('python3', [join(scriptDirectory, 'stop-owned-metro.py')], {
    input: JSON.stringify(current.members),
    stdio: ['pipe', 'ignore', 'inherit'],
  });
  const deadline = performance.now() + 10_000;
  while (performance.now() < deadline) {
    await delay(250);
    try {
      const after = observeMetro();
      if (after.state === 'stale') {
        verifyMetroObservation({ ...observation, state: 'stale' }, after);
        discardStale(after);
        return;
      }
      verifyMetroObservation(observation, after);
    } catch (error) {
      // The session leader may exit while its own descendants drain. Wait
      // only for that known orphaned state; all other failures stop here.
      if (error.code !== 'METRO_DRAINING') throw error;
    }
  }
  throw new Error('Managed Metro did not stop cleanly; leaving its record in place');
}

async function startServer() {
  await assertMetroPortIsFree();
  if (observeMetro().state !== 'vacant') throw new Error('Metro state changed before startup');

  const logFile = openMetroLog(logPath);
  let child;
  try {
    ftruncateSync(logFile, 0);
    child = spawn('npm', ['run', 'mobile'], {
      cwd: projectRoot,
      detached: true,
      env: { ...process.env, EXPO_NO_TELEMETRY: '1' },
      stdio: ['ignore', logFile, logFile],
    });
  } finally {
    closeSync(logFile);
  }

  await new Promise((resolveSpawn, rejectSpawn) => {
    child.once('spawn', resolveSpawn);
    child.once('error', rejectSpawn);
  });
  let exited = false;
  child.once('exit', () => { exited = true; });
  recordMetro(recordPath, projectRoot, metroPort, child.pid);
  child.unref();

  const deadline = performance.now() + startupTimeoutMs;
  while (performance.now() < deadline) {
    if (exited) break;
    const observation = observeMetro();
    if (observation.state === 'owned' && observation.listening &&
      await expoServerIsReady() && await expoTunnelIsReady() && currentMetro(observation).listening) {
      console.log(`Expo Go dev server is running on the Codespace tunnel. Log: ${logPath}`);
      return;
    }
    if (observation.state !== 'owned') break;
    await delay(1_000);
  }
  // Retain the attestation so recovery or an explicit stop can verify it.
  throw new Error(`Metro or its tunnel did not become ready. See ${logPath}.`);
}

async function main() {
  if (process.platform !== 'linux') throw new Error('This starter requires a Linux GitHub Codespace');
  if (![undefined, '--sync', '--stop', '--restart'].includes(operation)) {
    throw new Error('Unknown Metro starter operation');
  }
  if (operation === '--sync' &&
    (!/^[0-9a-f]{40}$/.test(targetSha ?? '') || !/^[0-9a-f]{40}$/.test(trustedSha ?? ''))) {
    throw new Error('Sync requires exact preview and main SHAs');
  }

  await withMetroLock(stateDirectory, async () => {
    // Preflight, checkout and startup share this ownership lock.
    const observation = observeMetro();
    if (operation === '--stop' || operation === '--restart') {
      await stopOwnedMetro(observation);
      if (operation === '--stop') {
        console.log('Expo Go dev server is stopped.');
        return;
      }
    } else {
      if (observation.state === 'owned' &&
        (!observation.listening || !await expoServerIsReady() || !await expoTunnelIsReady())) {
        throw new Error(`Managed Metro is not healthy. Use --restart after inspecting ${logPath}.`);
      }
      if (operation === '--sync') syncCheckout();
      const current = currentMetro(observation);
      if (current.state === 'owned') {
        if (!current.listening) throw new Error('Managed Metro listener disappeared');
        console.log('Expo Go dev server is already running.');
        return;
      }
      discardStale(current);
    }
    await startServer();
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
