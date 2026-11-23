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
