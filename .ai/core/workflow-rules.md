# 🔀 Agent workflow and handoff summary

> Short on-demand context. [`AGENTS.md`](../../AGENTS.md) remains the complete operating contract; this file is **not** a second authority.

## Start / resume
1. Read [root AGENTS.md](../../AGENTS.md) and [current pointer](../current.md).
2. Verify live GitHub, branch, PR and issue; read one approved task brief if active.
3. Load only relevant [core summaries](README.md) and canonical documents.
4. Select specialized skills/tools by actual task: read installed skill instructions, never assume connection or wrong-project tools.
5. Verify approved scope, owner and remaining privacy/security constraints.

## Single owner and reviewers
- One active primary objective and one **Implementation owner** per slice.
- Independent reviewers may inspect but not silently overwrite an owner's files.
- Default PR quality gate: request **one recorded** owner, separate-agent, GitHub Copilot or Codex review. Record reviewer, assessed SHA, finding severity and verdict; no self-review-only pass. See [review guide](../../.github/REVIEW_GUIDE.md).
- Bot or AI `COMMENT` feedback is not a formal GitHub approval. Resolve blocking inline comments and re-request review after significant fixes; owner still approves merges.
- If review is unavailable, keep `REVIEW_PENDING` or record scope-specific owner-authorized deferral with risks; never claim passing review.
- On handoff record `Implementation owner`, `Previous agent`, `Last commit agent` and observed SHA in the [task template](../tasks/TEMPLATE.md); never invent GitHub approval or add fake `Co-authored-by` metadata.
- Reconcile conflicting agent assignments and stale branches against actual GitHub state before writing.

## Approval and execution gates
- **Phase 0 remains documentation-only**; new runtime code or production changes require separately approved Phase 1 scope.
- An issue, planning document, task or PR is not permission to implement.
- Routine subtasks of an approved scope may proceed without repeating the same decision; scope expansions, privacy/security changes and merge/deployment need explicit approvals.
- Workflow: Discovery → Exploration → Skills/architecture plan → Bounded work → Proportional validation → PR/review → Owner-authorized merge → Verified handoff.
- Never weaken required checks or mistake scanner outages for a security pass.
- Merging a docs PR does not approve proposed product decisions.

## Task records and post-merge
- Use [task guide](../tasks/README.md) and [template](../tasks/TEMPLATE.md).
- Keep context short and evidence-based; no transcripts, copied specs, secrets or raw command dumps.
- Record exact checks performed, skipped validation, independent/self/automated review status and one next action.
- After verified merge and post-merge checks, archive completed task and clear current pointer through an authorized tracked change.

**Canonical:** [Agent contract](../../AGENTS.md) · [PR workflow](../../docs/11-PR-REVIEW-WORKFLOW.md) · [Post-merge playbook](../../docs/12-POST-MERGE-PLAYBOOK.md)
