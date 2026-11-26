import { assertRecoveryStorageFixture, deleteRecoveryStorageFixture, readRecoveryStorageFixture } from './conditional-storage-fixture.mjs';
import { recoveryOptions, requireOfflineRecoveryJournal } from './offline-recovery-journal.mjs';
import { executeRunBudgetRequest, getRunRequestBudget } from './run-request-budget.mjs';

export { createOfflineRecoveryJournal, reopenOfflineRecoveryJournal } from './offline-recovery-journal.mjs';

/**
 * Reconcile the original journal using newly observed synthetic state. This
 * entry point never executes probe dispatchers or restores Auth credentials.
 */
export async function recoverOfflineProbeRun(rawOptions) {
  const { handle, provider, signal } = recoveryOptions(rawOptions, ['handle', 'provider', 'signal']);
  const journal = requireOfflineRecoveryJournal(handle);
  const { projectRef, runId } = handle;
  journal.beginReconciliation();
  try {
    const report = reason => ({ ...handle.report(), ...(reason ? { reason } : {}) });
    if (journal.state.terminal) return report();
    const budget = getRunRequestBudget({ projectRef, runId });
    const read = () => readRecoveryStorageFixture(provider, projectRef, runId);
    const request = (kind, operation) => executeRunBudgetRequest(budget, { category: 'cleanup', kind, signal }, operation);
    let status = handle.report();
    if (status.residual.storage.length) {
      try {
        // Admission checks that the current provider offers an independent
        // snapshot. Ownership and absence come from budgeted observations.
        assertRecoveryStorageFixture(provider, projectRef, runId);
        const lookup = await request('recovery_lookup', ordinal => ({ ordinal, observation: read() }));
        const { current, indeterminate, creationOrdinal } = lookup.observation;
        if (indeterminate) return report('STORAGE_OWNERSHIP_UNKNOWN');
        if (!current) {
          journal.absent(lookup.ordinal, lookup.observation);
        } else {
          const uploads = status.attempts.filter(attempt =>
            attempt.kind === 'storage_upload' && status.residual.storage.includes(attempt.ordinal));
          const candidate = uploads.length === 1 ? uploads[0] : null;
          const historical = journal.state.ownership;
          const previous = candidate?.ordinal === historical?.attemptOrdinal ? historical : candidate;
          if (!candidate || creationOrdinal !== candidate.ordinal ||
              (previous?.objectId && (previous.objectId !== current.objectId || previous.ownerId !== current.ownerId))) {
            return report('STORAGE_OWNERSHIP_UNPROVEN_OR_REPLACED');
          }
          journal.observeOwnership(lookup.ordinal, lookup.observation);
          // Recheck the creation witness and compare+delete in the same
          // budgeted provider transition, even if pacing allowed a replacement.
          await request('recovery_delete', () => ({ ok: deleteRecoveryStorageFixture(provider, current, creationOrdinal) }));
          const verify = await request('recovery_lookup', ordinal => ({ ordinal, observation: read() }));
          if (verify.observation.indeterminate || verify.observation.current) return report('STORAGE_ABSENCE_UNVERIFIED');
          journal.absent(verify.ordinal, verify.observation);
        }
      } catch (error) {
        if (error.message === 'RECOVERY_PROVIDER_SNAPSHOT_REQUIRED') return report(error.message);
        if (error.code === 'REQUEST_BUDGET_EXHAUSTED' || error.code === 'REQUEST_CANCELLED_BEFORE_DISPATCH') return report(error.code);
        throw error;
      }
    }
    if (journal.finish()) return report();
    status = handle.report();
    const missingAuthProof = status.residual.credentialDependent.length || status.residual.volatileKinds.includes('auth');
    return report(missingAuthProof ? 'TRANSIENT_AUTH_CREDENTIALS_OR_PROOF_UNAVAILABLE' : 'PROVIDER_EFFECT_UNRECONCILED');
  } finally {
    journal.endReconciliation();
  }
}
