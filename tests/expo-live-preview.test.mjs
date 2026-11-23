import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { verifyOtaBundle } from '../.github/scripts/verify-expo-ota-bundle.mjs';
import { verifyEasPreview, verifyPreviewChannels } from '../.github/scripts/verify-eas-preview-config.mjs';
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

for (const operation of ['publish_update', 'build_preview']) {
  test(operation + ' accepts an immutable non-draft owner PR without a Live label', () => {
    const f = fixture();
    for (const snapshot of [f.pr, f.refreshedPr]) {
      snapshot.draft = false;
      snapshot.labels = [];
    }
    assert.equal(verifyExpoLivePr({ ...f, operation, labeledPrNumbers: [] }).headSha, HEAD);
  });

  test(operation + ' rejects drafts and native changes', () => {
    const f = { ...fixture(), operation };
    assert.throws(() => verifyExpoLivePr(f), /non-draft/);
    f.pr.draft = false;
    f.refreshedPr.draft = false;
    f.rawDiff = diffRecord('app.json');
    assert.throws(() => verifyExpoLivePr(f), /allowlist/);
  });
}

test('rejects an unknown preview operation', () => {
  assert.throws(() => verifyExpoLivePr({ ...fixture(), operation: 'release' }), /Unknown operation|Unknown preview operation/);
});

test('one workflow exposes three operations; only owner label and synchronize events can start Live automatically', () => {
  const text = readRepoFile('.github/workflows/expo-pr-preview.yml');
  assert.match(text, /^name: Tio-TNYX Expo Preview$/m);
  assert.match(text, /options:\n\s+- codespaces_live\n\s+- publish_update\n\s+- build_preview/);
  assert.match(text, /pull_request_target:\n\s+branches: \[main\]\n\s+types: \[labeled, synchronize\]/);
  assert.match(text, /github\.ref == 'refs\/heads\/main'/);
  assert.match(text, /github\.triggering_actor == 'im-tnyx'/);
  assert.match(text, /github\.event\.sender\.login == 'im-tnyx'/);
  assert.match(text, /contains\(github\.event\.pull_request\.labels\.\*\.name, 'tnyx-preview'\)/);
  assert.match(text, /github\.event\.action == 'synchronize' \|\| github\.event\.label\.name == 'tnyx-preview'/);
  assert.match(text, /inputs\.operation \|\| 'codespaces_live'/);
  assert.doesNotMatch(text, /^  (?:push|schedule|workflow_run):/m);
  assert.doesNotMatch(text, /^concurrency:/m);
});

test('Live uses trusted checkout, scoped concurrency and a separate credential', () => {
  const text = readRepoFile('.github/workflows/expo-pr-preview.yml').split('\n  codespaces_live:')[1].split('\n  prepare_update:')[0];
  assert.match(text, /if: needs\.select\.outputs\.operation == 'codespaces_live'/);
  assert.match(text, /environment: tnyx-expo-pr-preview-trusted/);
  assert.match(text, /concurrency:\n      group: tnyx-labeled-pr-expo-preview/);
  assert.match(text, /ref: \$\{\{ github\.sha \}\}/);
  assert.equal([...text.matchAll(/check-expo-live-pr\.sh/g)].length, 2);
  assert.equal([...text.matchAll(/secrets\.PR_PREVIEW_CODESPACES_TOKEN/g)].length, 2);
  assert.match(text, /vars\.TNYX_PR_CODESPACE_ID/);
  assert.doesNotMatch(text, /EXPO_TOKEN|worktree add|npm ci|download-artifact|actions\/cache/);
});

test('OTA exports without credentials and EAS only runs on manual dispatch', () => {
  const text = readRepoFile('.github/workflows/expo-pr-preview.yml');
  const [exportJob, easJob] = text.split('\n  prepare_update:')[1].split('\n  eas_preview:');
  assert.match(exportJob, /github\.event_name == 'workflow_dispatch'/);
  assert.match(exportJob, /npm ci --ignore-scripts/);
  assert.match(exportJob, /expo export/);
  assert.doesNotMatch(exportJob, /environment:|secrets\.|npm run|actions\/cache/);
  assert.match(easJob, /github\.event_name == 'workflow_dispatch'/);
  assert.match(easJob, /environment: eas-preview/);
  assert.match(easJob, /needs\.prepare_update\.result == 'success'/);
  assert.match(easJob, /needs\.prepare_update\.result == 'skipped'/);
  assert.equal([...easJob.matchAll(/secrets\.PR_PREVIEW_EXPO_TOKEN/g)].length, 1);
  assert.match(easJob, /--branch pr-preview --environment preview --non-interactive/);
  assert.match(easJob, /--skip-bundler --input-dir/);
  assert.match(easJob, /verify-expo-ota-bundle\.mjs/);
  assert.match(easJob, /build --profile preview --platform "\$PREVIEW_PLATFORM"/);
  assert.match(easJob, /--non-interactive --freeze-credentials --no-wait/);
  assert.match(easJob, /--require ".*freeze-expo-preview-keystore\.cjs"/);
  assert.doesNotMatch(easJob, /npm run|npx|auto-submit|secrets\.PR_PREVIEW_CODESPACES_TOKEN/);
});

test('EAS config requires this project, preview-only configuration and pinned CLI integrity', () => {
  const args = {
    app: JSON.parse(readRepoFile('app.json')).expo,
    eas: JSON.parse(readRepoFile('eas.json')),
    manifest: JSON.parse(readRepoFile('.github/preview-eas-cli/package.json')),
    lock: JSON.parse(readRepoFile('.github/preview-eas-cli/package-lock.json')),
    platform: 'all',
  };
  verifyEasPreview(args);
  assert.throws(() => verifyEasPreview({ ...args, platform: 'web' }), /platform/);
  assert.throws(() => verifyEasPreview({ ...args, app: { ...args.app, slug: 'tio-money' } }), /slug/);
  for (const change of [{ distribution: 'store' }, { channel: 'production' }, { environment: 'production' }]) {
    const eas = { build: { preview: { ...args.eas.build.preview, ...change } } };
    assert.throws(() => verifyEasPreview({ ...args, eas }));
  }
  for (const change of [{ channel: 'production' }, { environment: 'production' },
    { distribution: 'store' }, { developmentClient: true }]) {
    const preview = { ...args.eas.build.preview, ios: change };
    assert.throws(() => verifyEasPreview({ ...args, eas: { build: { preview } } }));
  }
  const lock = structuredClone(args.lock);
  lock.packages['node_modules/eas-cli'].integrity = '';
  assert.throws(() => verifyEasPreview({ ...args, lock }), /Unverified EAS CLI dependency/);
});

test('OTA publishes only to a branch exclusively routed from the active preview channel', () => {
  const mapping = (branchId) => JSON.stringify({ version: 0, data: [{ branchId, branchMappingLogic: 'true' }] });
  const preview = {
    name: 'pr-preview', isPaused: false, branchMapping: mapping('preview-id'),
    updateBranches: [{ name: 'pr-preview', id: 'preview-id' }],
  };
  const production = { name: 'production', branchMapping: mapping('production-id') };
  verifyPreviewChannels([production, preview]);
  assert.throws(() => verifyPreviewChannels([{ ...preview, isPaused: true }]), /paused/);
  assert.throws(() => verifyPreviewChannels([{ ...preview, updateBranches: [] }]), /Link/);
  assert.throws(() => verifyPreviewChannels([{ ...production, branchMapping: mapping('preview-id') }, preview]),
    /Another EAS channel/);
});

test('OTA artifact confines metadata to the requested platforms and regular bundle files', () => {
  const folder = mkdtempSync(join(tmpdir(), 'tnyx-ota-policy-'));
  try {
    mkdirSync(join(folder, '_expo/static/js/ios'), { recursive: true });
    mkdirSync(join(folder, 'assets'));
    const bundle = '_expo/static/js/ios/entry-ab12.hbc';
    const asset = 'assets/ac47';
    writeFileSync(join(folder, bundle), 'fixture');
    writeFileSync(join(folder, asset), 'fixture');
    const metadata = { bundler: 'metro', version: 0, fileMetadata: {
      ios: { bundle, assets: [{ path: asset, ext: 'png' }] },
    } };
    const write = () => writeFileSync(join(folder, 'metadata.json'), JSON.stringify(metadata));
    write();
    verifyOtaBundle(folder, 'ios');
    assert.throws(() => verifyOtaBundle(folder, 'all'), /platform metadata/);
    metadata.fileMetadata.ios.bundle = '../outside.hbc';
    write();
    assert.throws(() => verifyOtaBundle(folder, 'ios'), /bundle path/);
    metadata.fileMetadata.ios.bundle = bundle;
    metadata.fileMetadata.ios.assets[0].path = 'assets/../outside';
    write();
    assert.throws(() => verifyOtaBundle(folder, 'ios'), /asset path/);
    metadata.fileMetadata.ios.assets[0].path = asset;
    write();
    rmSync(join(folder, asset));
    symlinkSync(join(folder, bundle), join(folder, asset));
    assert.throws(() => verifyOtaBundle(folder, 'ios'), /non-regular file/);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('Git validation fetches objects and compares trees without switching the runner worktree', () => {
  const text = readRepoFile('.github/scripts/check-expo-live-pr.sh');
  assert.match(text, /git merge-base --is-ancestor "\$GITHUB_SHA" "\$PREVIEW_SHA"/);
  assert.match(text, /git diff --raw --no-abbrev --no-renames --no-ext-diff --no-textconv --ignore-submodules=none -z/);
  assert.match(text, /git\/ref\/heads\/main/);
  assert.match(text, /\.branch_policies\[0\]\.name == "main"/);
  assert.doesNotMatch(text, /git (?:switch|checkout|reset)|secrets\./);
});

test('remote sync refuses dirty or named feature worktrees and requires trusted dependencies', () => {
  const text = readRepoFile('.github/scripts/sync-expo-pr-live-preview.sh');
  assert.match(text, /git status --porcelain=v1 --untracked-files=normal/);
  assert.match(text, /switch --detach --no-overwrite-ignore/);
  assert.match(text, /test "\$\(git rev-parse HEAD\)" = "\$target_sha"\nrequire_clean_worktree/);
  assert.match(text, /git diff --quiet "\$trusted_sha" "\$target_sha" -- scripts\/start-codespace-expo\.mjs package\.json package-lock\.json/);
  assert.match(text, /dependency-manifests\.sha256/);
  assert.match(text, /node scripts\/start-codespace-expo\.mjs/);
  assert.doesNotMatch(text, /git (?:reset|clean|stash)|EXPO_TOKEN|CODESPACES_TOKEN|npm ci/);
});
