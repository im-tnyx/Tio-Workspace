import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyExpoLivePr } from '../.github/scripts/verify-expo-live-pr.mjs';

const H = 'a'.repeat(40);
const B = 'b'.repeat(40);
const ownerRepo = { full_name: 'im-tnyx/Tio-Workspace' };
function fixture() {
  const pr = {
    number: 42,
    state: 'open',
    draft: true,
    user: { login: 'im-tnyx' },
    head: { sha: H, ref: 'feat/ui-review', repo: ownerRepo },
    base: { sha: B, ref: 'main', repo: ownerRepo },
    labels: [{ name: 'tnyx-preview' }],
    changed_files: 2,
  };
  return {
    repository: 'im-tnyx/Tio-Workspace',
    selectedPrNumber: '42',
    pr,
    refreshedPr: structuredClone(pr),
    compare: {
      base_commit: { sha: B },
      commits: [{ sha: H }],
      files: [
        { filename: 'src/app/index.tsx', status: 'modified' },
        { filename: 'assets/logo.png', status: 'added' },
      ],
    },
    labeledPrNumbers: ['42'],
    expectedSha: H,
    expectedBranch: 'feat/ui-review',
  };
}

test('accepts one owner-authored labeled Draft PR on immutable SHA', () => {
  const result = verifyExpoLivePr(fixture());
  assert.equal(result.headSha, H);
  assert.equal(result.prNumber, '42');
});
for (const [label, mutate] of [
  ['missing label', (f) => { f.pr.labels = []; }],
  ['multiple labeled PRs', (f) => { f.labeledPrNumbers.push('51'); }],
  ['wrong owner', (f) => { f.pr.user.login = 'attacker'; }],
  ['forked PR', (f) => { f.pr.head.repo.full_name = 'someone/else'; }],
  ['wrong base', (f) => { f.pr.base.ref = 'dev'; }],
  ['stale push SHA', (f) => { f.expectedSha = B; }],
  ['stale push branch', (f) => { f.expectedBranch = 'feat/other'; }],
  ['concurrent PR head change', (f) => { f.refreshedPr.head.sha = B; }],
  ['concurrent PR base change', (f) => { f.refreshedPr.base.sha = H; }],
  ['native file', (f) => { f.compare.files[0].filename = 'android/app/build.gradle'; }],
  ['dependency file', (f) => { f.compare.files[0].filename = 'package-lock.json'; }],
  ['workflow file', (f) => { f.compare.files[0].filename = '.github/workflows/evil.yml'; }],
  ['renamed file from workflow', (f) => {
    f.compare.files[0] = {
      filename: 'src/app/evil.tsx',
      previous_filename: '.github/workflows/evil.yml',
      status: 'renamed',
    };
  }],
  ['truncated compare', (f) => { f.compare.files.pop(); }],
  ['wrong compare base', (f) => { f.compare.base_commit.sha = H; }],
  ['wrong compare head', (f) => { f.compare.commits[0].sha = B; }],
  ['changed-file limit', (f) => { f.pr.changed_files = 101; }],
  ['zero files', (f) => { f.pr.changed_files = 0; f.compare.files = []; }],
  ['nonpositive PR', (f) => { f.selectedPrNumber = '0'; }],
]) {
  test('rejects ' + label, () => {
    const f = fixture();
    mutate(f);
    assert.throws(() => verifyExpoLivePr(f));
  });
}


import { readFileSync } from 'node:fs';

test('push signal contains no checkout, write permissions or credentials', () => {
  const text = readFileSync(new URL('../.github/workflows/expo-pr-live-push-signal.yml', import.meta.url), 'utf8');
  assert.match(text, /^name: TNYX PR preview push signal$/m);
  assert.match(text, /branches:\s*\n\s+- '\*\*'\s*\n\s+- '!main'/);
  assert.match(text, /^permissions:\s*\n  contents: read$/m);
  assert.doesNotMatch(text, /secrets\.|environment:|actions\/checkout|pull_request_target/);
});

test('trusted-main workflow isolates owner gate and credential-bearing steps', () => {
  const text = readFileSync(new URL('../.github/workflows/expo-pr-live-preview.yml', import.meta.url), 'utf8');
  assert.match(text, /github\.ref == 'refs\/heads\/main'/);
  assert.match(text, /github\.triggering_actor == 'im-tnyx'/);
  assert.match(text, /github\.event\.workflow_run\.actor\.login == 'im-tnyx'/);
  assert.match(text, /type: string/);
  assert.match(text, /environment: tnyx-expo-pr-preview-trusted/);
  assert.match(text, /github\.sha/);
  assert.match(text, /verify-expo-live-pr\.mjs/);
  assert.match(text, /sync-expo-pr-live-preview\.sh/);
  assert.match(text, /vars\.TNYX_PR_CODESPACE_ID/);
  assert.match(text, /secrets\.CODESPACES_TOKEN/);
  assert.doesNotMatch(text, /EXPO_TOKEN|pull_request_target|secrets: inherit/);
});

test('trusted sync refuses dirty or named feature worktrees and never resets', () => {
  const text = readFileSync(new URL('../.github/scripts/sync-expo-pr-live-preview.sh', import.meta.url), 'utf8');
  assert.match(text, /git status --porcelain=v1 --untracked-files=normal/);
  assert.match(text, /git switch --detach/);
  assert.match(text, /git fetch --no-tags origin/);
  assert.match(text, /node scripts\/start-codespace-expo\.mjs/);
  assert.doesNotMatch(text, /git (?:reset|clean|stash)|EXPO_TOKEN|CODESPACES_TOKEN/);
});
