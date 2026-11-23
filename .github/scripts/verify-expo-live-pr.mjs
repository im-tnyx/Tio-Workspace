import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PREVIEW_LABEL = 'tnyx-preview';
const OWNER = 'im-tnyx';
const MAX_FILES = 100;
const ALLOWED_PATH = /^(?:src|assets|tests|docs|\.ai)\//;
const ALLOWED_ROOT_DOC = /^(?:README|CHANGELOG|DESIGN)\.md$/;
const SHA = /^[0-9a-f]{40}$/;
const PR_NUMBER = /^[1-9][0-9]*$/;

function assert(condition, reason) {
  if (!condition) throw new Error(reason);
}

function allowedPath(path) {
  if (ALLOWED_ROOT_DOC.test(path)) return true;
  if (!ALLOWED_PATH.test(path) || !/^[\x20-\x7e]+$/.test(path) || path.includes('\\')) return false;
  return path.split('/').slice(1).every((part) => part && !part.startsWith('.') && part.toLowerCase() !== 'package.json');
}

// Read the complete, NUL-delimited Git tree diff. Disabling rename detection
// makes both ends of a rename subject to the same path and mode checks.
function verifyTreeDiff(rawDiff) {
  const records = rawDiff.split('\0');
  assert(records.pop() === '' && records.length % 2 === 0, 'Incomplete Git tree diff');
  assert(records.length > 0 && records.length <= MAX_FILES * 2, 'Changed-file count outside preview limit');

  for (let index = 0; index < records.length; index += 2) {
    const [header, path] = records.slice(index, index + 2);
    const modes = /^:(000000|100644) (000000|100644) [0-9a-f]{40} [0-9a-f]{40} ([AMD])$/.exec(header);
    assert(modes, 'Preview changes must involve regular, non-executable files');
    const [, before, after, status] = modes;
    assert(
      (status === 'A' && before === '000000' && after === '100644') ||
      (status === 'M' && before === '100644' && after === '100644') ||
      (status === 'D' && before === '100644' && after === '000000'),
      'Unexpected Git tree diff status',
    );
    assert(allowedPath(path), 'Changed path outside the preview allowlist');
  }
}

export function verifyExpoLivePr({
  pr,
  refreshedPr,
  rawDiff,
  labeledPrNumbers,
  repository,
  selectedPrNumber,
  trustedSha,
  expectedSha,
  expectedBranch = '',
}) {
  assert(repository === 'im-tnyx/Tio-Workspace', 'Unexpected repository');
  const selected = String(selectedPrNumber);
  assert(PR_NUMBER.test(selected), 'PR number must be a positive integer string');
  assert(SHA.test(trustedSha ?? '') && SHA.test(expectedSha ?? ''), 'Missing immutable commit identity');

  for (const snapshot of [pr, refreshedPr]) {
    assert(String(snapshot?.number) === selected, 'PR number changed');
    assert(snapshot.state === 'open', 'Preview PR is not open');
    assert(snapshot.user?.login === OWNER, 'Preview PR must be owner-authored');
    assert(snapshot.head?.repo?.full_name === repository, 'Preview PR must be same-repository');
    assert(snapshot.base?.repo?.full_name === repository, 'Preview base repository mismatch');
    assert(snapshot.base?.ref === 'main' && snapshot.base?.sha === trustedSha, 'PR must target the trusted main SHA');
    assert(snapshot.head?.sha === expectedSha, 'PR head differs from the authorized SHA');
    assert(typeof snapshot.head?.ref === 'string' && snapshot.head.ref &&
      !['main', 'tnyx/expo-preview'].includes(snapshot.head.ref), 'Preview head branch is invalid');
    assert(snapshot.labels?.filter((label) => label.name === PREVIEW_LABEL).length === 1,
      'Preview PR needs exactly one tnyx-preview label');
  }

  assert(pr.head.ref === refreshedPr.head.ref, 'PR branch changed during validation');
  if (expectedBranch) assert(expectedBranch === pr.head.ref, 'Push branch is stale');

  assert(Array.isArray(labeledPrNumbers) && labeledPrNumbers.length === 1 &&
    String(labeledPrNumbers[0]) === selected, 'Exactly one open PR may carry tnyx-preview');

  verifyTreeDiff(rawDiff);
  return { prNumber: selected, headSha: expectedSha };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const [prPath, latestPath, diffPath, labeledPath] = process.argv.slice(2);
    const labeled = readFileSync(labeledPath, 'utf8').trim();
    const verified = verifyExpoLivePr({
      pr: JSON.parse(readFileSync(prPath, 'utf8')),
      refreshedPr: JSON.parse(readFileSync(latestPath, 'utf8')),
      rawDiff: readFileSync(diffPath, 'utf8'),
      labeledPrNumbers: labeled ? labeled.split(/\r?\n/) : [],
      repository: process.env.GITHUB_REPOSITORY,
      selectedPrNumber: process.env.SELECTED_PR,
      trustedSha: process.env.GITHUB_SHA,
      expectedSha: process.env.PREVIEW_SHA,
      expectedBranch: process.env.PUSH_BRANCH,
    });
    console.log('Verified preview PR #' + verified.prNumber + ' at immutable SHA ' + verified.headSha);
  } catch (error) {
    console.error('::error::' + error.message.replace(/[\r\n]/g, ' '));
    process.exitCode = 1;
  }
}
