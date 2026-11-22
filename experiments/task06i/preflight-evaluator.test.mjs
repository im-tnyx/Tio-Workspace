import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PREFLIGHT_REQUIREMENTS,
  EXPECTED_REQUIREMENT_IDS,
  VALID_STATUSES,
  TARGET_STRATEGIES,
  validateRequirementStatus,
  validateRequirementSet,
  evaluatePreflightGate
} from './preflight-evaluator.mjs';

test('Security matrix contains exactly 18 discrete requirements across 3 categories (including BYPASS-05)', () => {
  assert.equal(PREFLIGHT_REQUIREMENTS.length, 18);
  assert.equal(EXPECTED_REQUIREMENT_IDS.size, 18);

  const categories = new Set(PREFLIGHT_REQUIREMENTS.map(r => r.category));
  assert.deepEqual(Array.from(categories), [
    'Native Bypass',
    'Token Hook',
    'Session & Consumer'
  ]);

  const nativeBypass = PREFLIGHT_REQUIREMENTS.filter(r => r.category === 'Native Bypass');
  assert.equal(nativeBypass.length, 5);
  assert.ok(nativeBypass.some(r => r.id === 'BYPASS-05' && r.target === 'POST /auth/v1/recover'));

  const tokenHook = PREFLIGHT_REQUIREMENTS.filter(r => r.category === 'Token Hook');
  assert.equal(tokenHook.length, 7);

  const sessionConsumer = PREFLIGHT_REQUIREMENTS.filter(r => r.category === 'Session & Consumer');
  assert.equal(sessionConsumer.length, 6);
});

test('All requirements have valid initial preflight statuses', () => {
  for (const req of PREFLIGHT_REQUIREMENTS) {
    assert.doesNotThrow(() => validateRequirementStatus(req.hostedExecutionStatus));
    assert.equal(req.hostedExecutionStatus, 'NOT TESTED');
    assert.ok(req.id.length > 0);
    assert.ok(req.target.length > 0);
    assert.ok(req.description.length > 0);
    assert.ok(req.expectedResponse.length > 0);
  }
});

test('R2-04: validateRequirementSet rejects empty array', () => {
  assert.throws(() => validateRequirementSet([]), /invalid_requirements_input/);
  assert.throws(() => validateRequirementSet(null), /invalid_requirements_input/);
  assert.throws(() => validateRequirementSet('bad'), /invalid_requirements_input/);
});

test('R2-04: validateRequirementSet rejects duplicate requirement IDs', () => {
  const duplicates = [
    ...PREFLIGHT_REQUIREMENTS,
    { ...PREFLIGHT_REQUIREMENTS[0] }
  ];
  assert.throws(() => validateRequirementSet(duplicates), /duplicate_requirement_ids/);
});

test('R2-04: validateRequirementSet rejects missing expected requirement IDs', () => {
  const incomplete = PREFLIGHT_REQUIREMENTS.slice(0, 17); // missing last requirement
  assert.throws(() => validateRequirementSet(incomplete), /missing_expected_requirements/);
});

test('R2-04: validateRequirementSet rejects unknown requirement IDs', () => {
  const withUnknown = PREFLIGHT_REQUIREMENTS.map(r => r.id === 'BYPASS-01' ? { ...r, id: 'UNKNOWN-99' } : r);
  assert.throws(() => validateRequirementSet(withUnknown), /missing_expected_requirements/);
});

test('R2-04: Requirements with VERIFIED FAIL block readiness verdict', () => {
  const quota = { activeProjects: 1, freeTierLimit: 2 };
  const reqsWithFailure = PREFLIGHT_REQUIREMENTS.map(r =>
    r.id === 'BYPASS-01' ? { ...r, hostedExecutionStatus: 'VERIFIED FAIL' } : r
  );

  const gate = evaluatePreflightGate(quota, { ownerApproved: true }, reqsWithFailure);
  assert.equal(gate.verdict, 'BLOCKED');
  const failureBlocker = gate.blockers.find(b => b.code === 'REQUIREMENT_FAILURES');
  assert.ok(failureBlocker);
  assert.match(failureBlocker.detail, /BYPASS-01/);
});

test('R2-04: Requirements with all VERIFIED FAIL return BLOCKED, not complete', () => {
  const quota = { activeProjects: 1, freeTierLimit: 2 };
  const allFailed = PREFLIGHT_REQUIREMENTS.map(r => ({ ...r, hostedExecutionStatus: 'VERIFIED FAIL' }));

  const gate = evaluatePreflightGate(quota, { ownerApproved: true }, allFailed);
  assert.equal(gate.verdict, 'BLOCKED');
  assert.equal(gate.counts.verifiedFail, 18);
  assert.ok(gate.blockers.some(b => b.code === 'REQUIREMENT_FAILURES'));
});

test('R2-04: Requirements with BLOCKED status block readiness verdict', () => {
  const quota = { activeProjects: 1, freeTierLimit: 2 };
  const reqsWithBlocked = PREFLIGHT_REQUIREMENTS.map(r =>
    r.id === 'HOOK-01' ? { ...r, hostedExecutionStatus: 'BLOCKED' } : r
  );

  const gate = evaluatePreflightGate(quota, { ownerApproved: true }, reqsWithBlocked);
  assert.equal(gate.verdict, 'BLOCKED');
  assert.ok(gate.blockers.some(b => b.code === 'REQUIREMENTS_BLOCKED'));
});

test('R2-04: Unresolved NOT TESTED requirements prevent passing readiness verdict', () => {
  const quota = { activeProjects: 1, freeTierLimit: 2 };
  // 17 pass, 1 not tested
  const partiallyTested = PREFLIGHT_REQUIREMENTS.map((r, idx) =>
    idx === 0 ? r : { ...r, hostedExecutionStatus: 'VERIFIED PASS' }
  );

  const gate = evaluatePreflightGate(quota, { ownerApproved: true }, partiallyTested);
  assert.notEqual(gate.verdict, 'ALL CHECKS PASSED');
  assert.equal(gate.verdict, 'READY FOR HOSTED EXECUTION');
  assert.equal(gate.counts.notTested, 1);
});

test('R2-04: ALL CHECKS PASSED only returned when all 18 requirements are VERIFIED PASS', () => {
  const quota = { activeProjects: 1, freeTierLimit: 2 };
  const allPassed = PREFLIGHT_REQUIREMENTS.map(r => ({ ...r, hostedExecutionStatus: 'VERIFIED PASS' }));

  const gate = evaluatePreflightGate(quota, { ownerApproved: true }, allPassed);
  assert.equal(gate.verdict, 'ALL CHECKS PASSED');
  assert.equal(gate.counts.verifiedPass, 18);
  assert.equal(gate.blockers.length, 0);
});

test('R2-05: Strategy NEW_DISPOSABLE_PROJECT blocks when 0 slots available', () => {
  const quota = { activeProjects: 2, freeTierLimit: 2 };
  const gate = evaluatePreflightGate(quota, { targetStrategy: 'NEW_DISPOSABLE_PROJECT' });

  assert.equal(gate.freeSlotsAvailable, 0);
  assert.equal(gate.verdict, 'BLOCKED');
  const quotaBlocker = gate.blockers.find(b => b.code === 'QUOTA_EXHAUSTED');
  assert.ok(quotaBlocker);
  assert.match(quotaBlocker.detail, /Supabase Free tier active quota exhausted/);
});

test('R2-05: Strategy EXISTING_PROJECT_TESTBED separates quota from target authorization', () => {
  // Even with 2/2 projects in use (0 free slots), existing project testbed does NOT fail on quota slot
  const quota = { activeProjects: 2, freeTierLimit: 2 };
  const gate = evaluatePreflightGate(quota, {
    targetStrategy: 'EXISTING_PROJECT_TESTBED',
    targetAuthorized: false
  });

  // Zero free slots does NOT trigger QUOTA_EXHAUSTED under existing project strategy
  assert.ok(!gate.blockers.some(b => b.code === 'QUOTA_EXHAUSTED'));
  // But strictly triggers NO_SAFE_HOSTED_TARGET because production/Tio-world are read-only
  const targetBlocker = gate.blockers.find(b => b.code === 'NO_SAFE_HOSTED_TARGET');
  assert.ok(targetBlocker);
  assert.match(targetBlocker.detail, /strictly READ-ONLY/);
  assert.equal(gate.verdict, 'BLOCKED');
});

test('Invalid requirement status fails validation', () => {
  assert.throws(() => validateRequirementStatus('RANDOM_STATUS'), /invalid_status/);
  assert.throws(() => validateRequirementStatus('PASSED'), /invalid_status/);
});

test('Production Real Auth is unconditionally NO-GO across all gate evaluations', () => {
  const gate1 = evaluatePreflightGate({ activeProjects: 2, freeTierLimit: 2 });
  assert.equal(gate1.productionAuthStatus, 'NO-GO');
  assert.equal(gate1.costPolicy, 'STRICT_ZERO_COST');

  const allPassed = PREFLIGHT_REQUIREMENTS.map(r => ({ ...r, hostedExecutionStatus: 'VERIFIED PASS' }));
  const gate2 = evaluatePreflightGate({ activeProjects: 1, freeTierLimit: 2 }, { ownerApproved: true }, allPassed);
  assert.equal(gate2.productionAuthStatus, 'NO-GO');
});
