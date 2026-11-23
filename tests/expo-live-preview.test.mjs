import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { verifyExpoLivePr } from '../.github/scripts/verify-expo-live-pr.mjs';

const HEAD = 'a'.repeat(40);
const MAIN = 'b'.repeat(40);
const REPO = { full_name: 'im-tnyx/Tio-Workspace' };

function diffRecord(path, status = 'M', before = '100644', after = '100644') {
  return `:${before} ${after} ${MAIN} ${HEAD} ${status}\0${path}\0`;
}

function fixture() {
  const pr = {
    number: 42,
    state: 'open',
    draft: true,
    user: { login: 'im-tnyx' },
    head: { sha: HEAD, ref: 'feat/ui-review', repo: { ...REPO } },
    base: { sha: MAIN, ref: 'main', repo: { ...REPO } },
    labels: [{ name: 'tnyx-preview' }],
  };
  return {
    repository: REPO.full_name,
    selectedPrNumber: '42',
    pr,
    refreshedPr: structuredClone(pr),
    rawDiff: diffRecord('src/app/index.tsx') + diffRecord('assets/logo.png', 'A', '000000'),
    labeledPrNumbers: ['42'],
    trustedSha: MAIN,
    expectedSha: HEAD,
    expectedBranch: 'feat/ui-review',
  };
}

test('accepts the exact owner-approved draft PR and regular source changes', () => {
  assert.deepEqual(verifyExpoLivePr(fixture()), { prNumber: '42', headSha: HEAD });
});

test('accepts manual selection without push metadata', () => {
  assert.equal(verifyExpoLivePr({ ...fixture(), expectedBranch: undefined }).headSha, HEAD);
});

for (const [label, mutate] of [
  ['missing label', (f) => { f.pr.labels = []; }],
  ['removed label', (f) => { f.refreshedPr.labels = []; }],
  ['multiple labeled PRs', (f) => { f.labeledPrNumbers.push('51'); }],
  ['wrong label inventory', (f) => { f.labeledPrNumbers = ['51']; }],
  ['closed PR', (f) => { f.refreshedPr.state = 'closed'; }],
  ['wrong owner', (f) => { f.pr.user.login = 'other-user'; }],
  ['forked PR', (f) => { f.pr.head.repo.full_name = 'someone/else'; }],
  ['wrong base', (f) => { f.pr.base.ref = 'dev'; }],
  ['legacy head', (f) => { f.pr.head.ref = 'tnyx/expo-preview'; }],
  ['main head', (f) => { f.pr.head.ref = 'main'; }],
  ['stale SHA', (f) => { f.expectedSha = MAIN; }],
  ['missing SHA', (f) => { f.expectedSha = ''; }],
  ['stale push branch', (f) => { f.expectedBranch = 'feat/other'; }],
  ['concurrent head change', (f) => { f.refreshedPr.head.sha = MAIN; }],
  ['concurrent base change', (f) => { f.refreshedPr.base.sha = HEAD; }],
  ['concurrent branch change', (f) => { f.refreshedPr.head.ref = 'feat/other'; }],
  ['wrong reviewed main', (f) => { f.trustedSha = HEAD; }],
  ['native file', (f) => { f.rawDiff = diffRecord('android/app/build.gradle'); }],
  ['dependency file', (f) => { f.rawDiff = diffRecord('package-lock.json'); }],
  ['nested manifest', (f) => { f.rawDiff = diffRecord('src/package.json'); }],
  ['workflow file', (f) => { f.rawDiff = diffRecord('.github/workflows/extra.yml'); }],
  ['workflow moved to src', (f) => {
    f.rawDiff += diffRecord('.github/workflows/extra.yml', 'D', '100644', '000000');
  }],
  ['hidden configuration', (f) => { f.rawDiff = diffRecord('src/.env'); }],
  ['control characters', (f) => { f.rawDiff = diffRecord('src/file\n.tsx'); }],
  ['symlink', (f) => { f.rawDiff = diffRecord('src/alias.ts', 'A', '000000', '120000'); }],
  ['executable', (f) => { f.rawDiff = diffRecord('src/run.sh', 'A', '000000', '100755'); }],
  ['submodule', (f) => { f.rawDiff = diffRecord('src/submodule', 'A', '000000', '160000'); }],
  ['truncated Git diff', (f) => { f.rawDiff = f.rawDiff.slice(0, -1); }],
  ['changed-file limit', (f) => { f.rawDiff = diffRecord('src/a.ts').repeat(101); }],
  ['zero files', (f) => { f.rawDiff = ''; }],
  ['nonpositive PR', (f) => { f.selectedPrNumber = '0'; }],
]) {
  test('rejects ' + label, () => {
    const f = fixture();
    mutate(f);
    assert.throws(() => verifyExpoLivePr(f));
  });
}

test('accepts raw Git tree output from two immutable commits', () => {
  const repo = mkdtempSync(join(tmpdir(), 'expo-preview-tree-'));
  try {
    const git = (...args) => execFileSync('git', [
      '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
      '-c', 'commit.gpgsign=false', ...args,
    ], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    git('init');
    git('commit', '--allow-empty', '-m', 'base');
    writeFileSync(join(repo, 'README.md'), 'fixture');
    git('add', 'README.md');
    git('commit', '-m', 'preview');
    const rawDiff = git('diff', '--raw', '--no-abbrev', '--no-renames', '--no-ext-diff', '--no-textconv', '--ignore-submodules=none', '-z', 'HEAD^', 'HEAD', '--');
    assert.ok(verifyExpoLivePr({ ...fixture(), rawDiff }));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

function readRepoFile(path) {
  return readFileSync(new URL('../' + path, import.meta.url), 'utf8');
}

test('push signal contains no checkout, write permissions or credentials', () => {
  const text = readRepoFile('.github/workflows/expo-pr-live-push-signal.yml');
  assert.match(text, /^name: TNYX PR preview push signal$/m);
  assert.match(text, /branches:\s*\n\s+- '\*\*'\s*\n\s+- '!main'\s*\n\s+- '!tnyx\/expo-preview'/);
  assert.match(text, /^permissions:\s*\n  contents: read$/m);
  assert.doesNotMatch(text, /secrets\.|environment:|actions\/checkout|pull_request_target/);
});

test('trusted workflow isolates the owner gate, protected environment and SSH steps', () => {
  const text = readRepoFile('.github/workflows/expo-pr-live-preview.yml');
  assert.match(text, /github\.ref == 'refs\/heads\/main'/);
  assert.match(text, /github\.triggering_actor == 'im-tnyx'/);
  assert.match(text, /github\.event\.workflow_run\.actor\.login == 'im-tnyx'/);
  assert.match(text, /github\.event\.workflow_run\.path == '\.github\/workflows\/expo-pr-live-push-signal\.yml'/);
  assert.match(text, /github\.event\.workflow_run\.run_attempt == 1/);
  assert.match(text, /environment: tnyx-expo-pr-preview-trusted/);
  assert.match(text, /\.branch_policies\[0\]\.name == "main"/);
  assert.equal([...text.matchAll(/ref: \$\{\{ github\.sha \}\}/g)].length, 2);
  assert.equal([...text.matchAll(/check-expo-live-pr\.sh/g)].length, 3);
  assert.equal([...text.matchAll(/secrets\.PR_PREVIEW_CODESPACES_TOKEN/g)].length, 2);
  assert.match(text, /vars\.TNYX_PR_CODESPACE_ID/);
  assert.doesNotMatch(text, /EXPO_TOKEN|pull_request_target|secrets: inherit|download-artifact|actions\/cache/);
});

test('Git validation fetches objects and compares trees without switching the runner worktree', () => {
  const text = readRepoFile('.github/scripts/check-expo-live-pr.sh');
  assert.match(text, /git merge-base --is-ancestor "\$GITHUB_SHA" "\$PREVIEW_SHA"/);
  assert.match(text, /git diff --raw --no-abbrev --no-renames --no-ext-diff --no-textconv --ignore-submodules=none -z/);
  assert.match(text, /git\/ref\/heads\/main/);
  assert.doesNotMatch(text, /git (?:switch|checkout|reset)|secrets\./);
});

test('remote sync refuses dirty or named feature worktrees and requires trusted dependencies', () => {
  const text = readRepoFile('.github/scripts/sync-expo-pr-live-preview.sh');
  assert.match(text, /git status --porcelain=v1 --untracked-files=normal/);
  assert.match(text, /switch --detach --no-overwrite-ignore/);
  assert.match(text, /git diff --quiet "\$trusted_sha" "\$target_sha" -- scripts\/start-codespace-expo\.mjs package\.json package-lock\.json/);
  assert.match(text, /dependency-manifests\.sha256/);
  assert.match(text, /node scripts\/start-codespace-expo\.mjs/);
  assert.doesNotMatch(text, /git (?:reset|clean|stash)|EXPO_TOKEN|CODESPACES_TOKEN|npm ci/);
});
