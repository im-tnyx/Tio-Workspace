import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PREFLIGHT_REQUIREMENTS,
  VALID_STATUSES,
  validateRequirementStatus,
  evaluatePreflightGate
} from './preflight-evaluator.mjs';

test('Security matrix contains exactly 17 discrete requirements across 3 categories', () => {
  assert.equal(PREFLIGHT_REQUIREMENTS.length, 17);

  const categories = new Set(PREFLIGHT_REQUIREMENTS.map(r => r.category));
  assert.deepEqual(Array.from(categories), [
    'Native Bypass',
    'Token Hook',
    'Session & Consumer'
  ]);

  const nativeBypass = PREFLIGHT_REQUIREMENTS.filter(r => r.category === 'Native Bypass');
  assert.equal(nativeBypass.length, 4);

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

test('Quota exhaustion (2 active projects out of 2) triggers QUOTA_EXHAUSTED blocker', () => {
  const quota = { activeProjects: 2, freeTierLimit: 2 };
  const gate = evaluatePreflightGate(quota, false);

  assert.equal(gate.freeSlotsAvailable, 0);
  assert.equal(gate.activeProjects, 2);
  assert.equal(gate.freeTierLimit, 2);
  assert.equal(gate.verdict, 'REQUIRES OWNER APPROVAL');
  assert.equal(gate.productionAuthStatus, 'NO-GO');

  const quotaBlocker = gate.blockers.find(b => b.code === 'QUOTA_EXHAUSTED');
  assert.ok(quotaBlocker);
  assert.match(quotaBlocker.detail, /Supabase Free tier active quota exhausted/);

  const approvalGate = gate.pendingApprovals.find(a => a.code === 'DISPOSABLE_PROJECT_CREATION_GATE');
  assert.ok(approvalGate);
});

test('Unapproved project creation halts before hosted execution', () => {
  const quotaWithSlot = { activeProjects: 1, freeTierLimit: 2 };
  const gate = evaluatePreflightGate(quotaWithSlot, false);

  assert.equal(gate.freeSlotsAvailable, 1);
  assert.equal(gate.verdict, 'REQUIRES OWNER APPROVAL');
  assert.equal(gate.pendingApprovals.length, 1);
  assert.equal(gate.productionAuthStatus, 'NO-GO');
});

test('Invalid requirement status fails validation', () => {
  assert.throws(() => validateRequirementStatus('RANDOM_STATUS'), /invalid_status/);
  assert.throws(() => validateRequirementStatus('PASSED'), /invalid_status/);
});

test('Production Real Auth is unconditionally NO-GO across all gate evaluations', () => {
  const gate1 = evaluatePreflightGate({ activeProjects: 2, freeTierLimit: 2 }, false);
  assert.equal(gate1.productionAuthStatus, 'NO-GO');

  const gate2 = evaluatePreflightGate({ activeProjects: 0, freeTierLimit: 2 }, true);
  assert.equal(gate2.productionAuthStatus, 'NO-GO');
});
