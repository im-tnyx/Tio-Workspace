import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PREVIEW_LABEL = 'tnyx-preview';
const OWNER = 'im-tnyx';
const MAX_FILES = 100;
const ALLOWED_PATH = /^(?:src\/|assets\/|tests\/|docs\/|\.ai\/)/;
const ALLOWED_ROOT_DOC = /^(?:README|CHANGELOG|DESIGN)\.md$/;
const SHA = /^[0-9a-f]{40}$/;
const PR_NUMBER = /^[1-9][0-9]*$/;

function assert(condition, reason) {
  if (!condition) throw new Error(reason);
}

function previewLabelCount(pr) {
  return (pr.labels ?? []).filter((label) => label.name === PREVIEW_LABEL).length;
}

function allowedPath(path) {
  return typeof path === 'string' && (ALLOWED_PATH.test(path) || ALLOWED_ROOT_DOC.test(path));
}

/**
 * Trusted-main, pure verifier. PR content is data and never executed on the
 * privileged GitHub Actions runner. Changes to scripts/config/native/deps are
 * not eligible for live preview.
 */
export function verifyExpoLivePr({
  pr,
  refreshedPr,
  compare,
  labeledPrNumbers,
  repository,
  selectedPrNumber,
  expectedSha = '',
  expectedBranch = '',
}) {
  assert(repository === 'im-tnyx/Tio-Workspace', 'Unexpected repository');
  const selected = String(selectedPrNumber);
  assert(PR_NUMBER.test(selected), 'PR number must be a positive integer string');
  assert(pr && refreshedPr && compare, 'Incomplete immutable PR validation evidence');

  for (const snapshot of [pr, refreshedPr]) {
    assert(String(snapshot.number) === selected, 'PR number changed');
    assert(snapshot.state === 'open', 'Preview PR is not open');
    assert(snapshot.user?.login === OWNER, 'Preview PR must be owner-authored');
    assert(snapshot.head?.repo?.full_name === repository, 'Preview PR must be same-repository');
    assert(snapshot.base?.repo?.full_name === repository, 'Preview base repository mismatch');
    assert(snapshot.base?.ref === 'main', 'Preview PR must target main');
    assert(SHA.test(snapshot.head?.sha ?? ''), 'Invalid PR head SHA');
    assert(SHA.test(snapshot.base?.sha ?? ''), 'Invalid PR base SHA');
    assert(typeof snapshot.head?.ref === 'string' && snapshot.head.ref !== 'main', 'Preview head branch is invalid');
    assert(previewLabelCount(snapshot) === 1, 'Preview PR needs exactly one tnyx-preview label');
  }

  assert(pr.head.sha === refreshedPr.head.sha, 'PR head changed during validation');
  assert(pr.base.sha === refreshedPr.base.sha, 'PR base changed during validation');
  assert(pr.head.ref === refreshedPr.head.ref, 'PR branch changed during validation');
  if (expectedSha) assert(SHA.test(expectedSha) && expectedSha === pr.head.sha, 'Push SHA is stale');
  if (expectedBranch) assert(expectedBranch === pr.head.ref, 'Push branch is stale');

  assert(Array.isArray(labeledPrNumbers), 'Missing global label inventory');
  assert(labeledPrNumbers.length === 1 && String(labeledPrNumbers[0]) === selected,
    'Exactly one open PR may carry tnyx-preview');

  assert(compare.base_commit?.sha === pr.base.sha, 'Compare base SHA mismatch');
  assert(compare.commits?.at(-1)?.sha === pr.head.sha || compare.status === 'identical',
    'Compare head commit mismatch');
  assert(Array.isArray(compare.files), 'Missing immutable changed-path report');
  assert(Number.isInteger(pr.changed_files) && pr.changed_files > 0 && pr.changed_files <= MAX_FILES,
    'Changed-file count outside reviewed preview limit');
  assert(compare.files.length === pr.changed_files, 'Changed-file list is truncated or inconsistent');
  for (const file of compare.files) {
    assert(allowedPath(file.filename), 'Preview disallows changed path: ' + file.filename);
    if (file.previous_filename !== undefined && file.previous_filename !== null) {
      assert(allowedPath(file.previous_filename), 'Preview disallows renamed source path: ' + file.previous_filename);
    }
    assert(!['unknown'].includes(file.status), 'Unrecognized changed-file status');
  }

  return {
    prNumber: selected,
    headSha: pr.head.sha,
    baseSha: pr.base.sha,
    headBranch: pr.head.ref,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const [prPath, latestPath, comparePath, labeledPath] = process.argv.slice(2);
    assert(prPath && latestPath && comparePath && labeledPath, 'Four evidence paths are required');
    const labeled = readFileSync(labeledPath, 'utf8').trim();
    const verified = verifyExpoLivePr({
      pr: JSON.parse(readFileSync(prPath, 'utf8')),
      refreshedPr: JSON.parse(readFileSync(latestPath, 'utf8')),
      compare: JSON.parse(readFileSync(comparePath, 'utf8')),
      labeledPrNumbers: labeled ? labeled.split(/\r?\n/) : [],
      repository: process.env.GITHUB_REPOSITORY,
      selectedPrNumber: process.env.SELECTED_PR,
      expectedSha: process.env.EXPECTED_PUSH_SHA || '',
      expectedBranch: process.env.EXPECTED_PUSH_BRANCH || '',
    });
    console.log('Verified preview PR #' + verified.prNumber + ' at immutable SHA ' + verified.headSha);
  } catch (error) {
    console.error('::error::' + error.message);
    process.exitCode = 1;
  }
}
