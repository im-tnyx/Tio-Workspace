import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import {
  chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { clearStaleMetro, inspectMetro, recordMetro } from '../scripts/codespace-metro-ownership.mjs';

const repo = resolve(import.meta.dirname, '..');
const scripts = ['start-codespace-expo.mjs', 'codespace-metro-ownership.mjs', 'stop-owned-metro.py'];

function temp(t) {
  const directory = mkdtempSync(join(tmpdir(), 'tnyx-metro-test-'));
  t.after(() => rmSync(directory, { force: true, recursive: true }));
  return directory;
}

function writeExecutable(file, text) {
  writeFileSync(file, text);
  chmodSync(file, 0o700);
}

function run(command, args, options) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 15_000, ...options });
  assert.ifError(result.error);
  return result;
}

function capture(child) {
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (data) => { stdout += data; });
  child.stderr.on('data', (data) => { stderr += data; });
  return once(child, 'close').then(([code]) => ({ code, stdout, stderr }));
}

async function exitedOwner(directory, record, port) {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    cwd: directory, detached: true, stdio: 'ignore',
  });
  await once(child, 'spawn');
  recordMetro(record, directory, port, child.pid);
  const exit = once(child, 'exit');
  child.kill('SIGTERM');
  await exit;
}

function codespaceFixture(t, startResponse, states, shortDeadline = false) {
  const folder = temp(t);
  writeExecutable(join(folder, 'gh'), `#!/usr/bin/env bash
set -eu
if [[ "$*" == *'/start' ]]; then
  if [[ -n "$START_ERROR" ]]; then printf '%s\\n' "$START_ERROR" >&2; exit 1; fi
  exit 0
fi
state=$(head -n 1 "$STATE_FILE")
if [[ $(wc -l < "$STATE_FILE") -gt 1 ]]; then sed -i '1d' "$STATE_FILE"; fi
printf '{"name":"preview-test","id":42,"display_name":"TNYX PR Preview Only","repository":{"full_name":"im-tnyx/Tio-Workspace"},"owner":{"login":"im-tnyx"},"state":"%s"}\\n' "$state"
`);
  const statesFile = join(folder, 'states');
  const output = join(folder, 'output');
  writeFileSync(statesFile, states.join('\n') + '\n');
  if (shortDeadline) {
    const timeout = run('which', ['timeout']).stdout.trim();
    writeExecutable(join(folder, 'timeout'), `#!/usr/bin/env bash
set -eu
[[ "$1" == --kill-after=5s && "$2" == 600s ]]
shift 2
exec "${timeout}" --kill-after=1s 0.7s "$@"
`);
  } else {
    writeExecutable(join(folder, 'sleep'), '#!/usr/bin/env bash\nexit 0\n');
  }
  const result = run('bash', [join(repo, '.github/scripts/start-preview-codespace.sh')], {
    env: {
      ...process.env, PATH: folder + ':' + process.env.PATH, GH_TOKEN: 'fixture',
      CODESPACE_NAME: 'preview-test', CODESPACE_ID: '42', GITHUB_OUTPUT: output,
      STATE_FILE: statesFile, START_ERROR: startResponse,
    },
  });
  return { ...result, output: existsSync(output) ? readFileSync(output, 'utf8') : '' };
}

test('Codespace start tolerates exactly the already-running race and still waits for Available', (t) => {
  const checked = codespaceFixture(t, 'gh: The codespace is already running (HTTP 409)',
    ['Shutdown', 'Starting', 'Available']);
  assert.equal(checked.status, 0, checked.stderr);
  assert.match(checked.stdout, /Verifying availability/);
  assert.equal(checked.output, 'name=preview-test\n');
  const unrelated = codespaceFixture(t, 'gh: Conflict (HTTP 409)', ['Shutdown', 'Available']);
  assert.equal(unrelated.status, 1);
  assert.equal(unrelated.output, '');
});

test('Codespace deadline fails with START_TIMEOUT and never emits a successful name', (t) => {
  const checked = codespaceFixture(t, 'gh: The codespace is already running (HTTP 409)',
    ['Shutdown', 'Starting'], true);
  assert.equal(checked.status, 124);
  assert.match(checked.stdout, /START_TIMEOUT/);
  assert.equal(checked.output, '');
});

test('ownership refuses a reused PID and leaves state unchanged', async (t) => {
  const root = temp(t);
  const record = join(root, 'metro.json');
  await exitedOwner(root, record, 8081);
  const saved = JSON.parse(readFileSync(record));
  saved.pid = process.pid;
  const tampered = JSON.stringify(saved);
  writeFileSync(record, tampered);
  assert.throws(() => inspectMetro(record, root, 8081), /different process/);
  assert.equal(readFileSync(record, 'utf8'), tampered);
});

test('ownership refuses a foreign listener and a changed stale record', async (t) => {
  const root = temp(t);
  const record = join(root, 'metro.json');
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const { port } = listener.address();
  try {
    await exitedOwner(root, record, port);
    assert.throws(() => inspectMetro(record, root, port), /port is occupied/);
    assert(listener.listening);
    assert(existsSync(record));
  } finally {
    const closed = once(listener, 'close');
    listener.close();
    await closed;
  }
  const observation = inspectMetro(record, root, port);
  assert.equal(observation.state, 'stale');
  writeFileSync(record, observation.snapshot.content + '\n');
  assert.throws(() => clearStaleMetro(record, root, port, observation), /changed during recovery/);
  assert(existsSync(record));
});

test('stopped Codespace with a stale record recovers once across manual and pushed sync', { timeout: 20_000 }, async (t) => {
  const woke = codespaceFixture(t, '', ['Shutdown', 'Available']);
  assert.equal(woke.status, 0, woke.stderr);

  const root = temp(t);
  const home = temp(t);
  const bin = temp(t);
  const state = join(home, '.cache', 'tnyx-expo-preview');
  mkdirSync(state, { recursive: true, mode: 0o700 });
  mkdirSync(join(root, 'scripts'));
  mkdirSync(join(root, 'node_modules/.bin'), { recursive: true });
  for (const file of scripts) copyFileSync(join(repo, 'scripts', file), join(root, 'scripts', file));
  writeExecutable(join(root, 'node_modules/.bin/expo'), '#!/usr/bin/env bash\nexit 0\n');
  writeExecutable(join(bin, 'npm'), '#!/usr/bin/env bash\nexec node fake-metro.mjs\n');
  const record = join(state, 'metro.json');
  const starts = join(home, 'starts');
  writeFileSync(join(root, 'fake-metro.mjs'), `
    import { createServer } from 'node:http';
    import { appendFileSync } from 'node:fs';
    createServer((req, response) => {
      response.end(req.url === '/status' ? 'packager-status:running' :
        JSON.stringify({ url: 'exp://fixture.exp.direct' }));
    }).listen(8081, '127.0.0.1', () => appendFileSync(process.env.FIXTURE_STARTS, process.pid + '\\n'));
  `);
  writeFileSync(join(root, '.gitignore'), 'node_modules/\n');
  writeFileSync(join(root, 'package.json'), '{}\n');
  writeFileSync(join(root, 'package-lock.json'), '{}\n');
  const git = (...args) => {
    const result = run('git', ['-c', 'user.email=test@example.invalid', '-c', 'user.name=Test',
      '-c', 'commit.gpgsign=false', ...args], { cwd: root });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git('init', '-b', 'main');
  git('add', '.');
  git('commit', '-m', 'fixture base');
  const base = git('rev-parse', 'HEAD');
  git('switch', '-c', 'preview-fixture');
  writeFileSync(join(root, 'README.md'), 'fixture revision\n');
  git('add', 'README.md');
  git('commit', '-m', 'fixture preview');
  const head = git('rev-parse', 'HEAD');
  git('switch', 'main');

  const marked = run('bash', ['-o', 'pipefail', '-c',
    "sha256sum package.json package-lock.json | sha256sum | cut -d ' ' -f 1"], { cwd: root });
  assert.equal(marked.status, 0, marked.stderr);
  writeFileSync(join(state, 'dependency-manifests.sha256'), marked.stdout);
  await exitedOwner(root, record, 8081);

  const env = { ...process.env, HOME: home, PATH: bin + ':' + process.env.PATH, FIXTURE_STARTS: starts };
  const cli = join(root, 'scripts/start-codespace-expo.mjs');
  try {
    const manual = capture(spawn(process.execPath, [cli], { cwd: root, env }));
    const pushed = capture(spawn(process.execPath, [cli, '--sync', head, base], { cwd: root, env }));
    const results = await Promise.all([manual, pushed]);
    for (const result of results) assert.equal(result.code, 0, result.stderr);
    assert.match(results.map(({ stdout }) => stdout).join(''), /Cleared the stale Metro ownership record/);
    assert.match(results.map(({ stdout }) => stdout).join(''), /already running/);
    assert.equal(readFileSync(starts, 'utf8').trim().split('\n').length, 1);
    assert.equal(git('rev-parse', 'HEAD'), head);
    assert.equal(git('branch', '--show-current'), '');
    assert(readdirSync(state).includes('metro.json'));
  } finally {
    // Use the production pidfd stop helper for the fixture. Cloud containers
    // may keep exited orphans as zombies, so cleanup does not require reaping.
    if (existsSync(starts)) {
      const observed = inspectMetro(record, root, 8081);
      assert.equal(observed.state, 'owned');
      const stopped = run('python3', [join(root, 'scripts/stop-owned-metro.py')], {
        input: JSON.stringify(observed.members),
      });
      assert.equal(stopped.status, 0, stopped.stderr);
    }
  }
});
