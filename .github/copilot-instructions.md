# Tio Workspace — Copilot Review Instructions

Read the repository [AGENTS.md](../AGENTS.md) and the focused [review guide](REVIEW_GUIDE.md). The **Phase 1.1 Expo/React Native mock shell is merged**, but real Supabase Auth, encrypted workout storage and backup/sync are **not implemented**; new feature slices require separate owner approval.

For **post-merge Git sync or a new-task checkout**, read [`.github/POST-MERGE-SYNC.md`](POST-MERGE-SYNC.md) and [the post-merge playbook](../docs/12-POST-MERGE-PLAYBOOK.md). Never auto-stash, reset, force-delete, or mutate another agent's worktree. For a **read-only code review**, do not execute the sync or assume any local command ran.

In every PR review:
1. Flag concrete accidental workout data uploads, cross-account local data access, client-side secrets or missing explicit consent for AI/backup/future sync; cite the changed line and impacted requirement.
2. Flag changes that bypass Phase 0 approval, break the persistent login/offline local-workout contract, or claim encryption/restore/deployment without verification.
3. For documentation-only changes, prioritize broken relative links, contradictory canonical instructions, incorrect architecture stack (Tio Workspace is **React Native / Expo**, not Tio World Flutter), or falsely marked approved/implemented status.

Give line-specific, actionable findings with impact and minimal fixes. Avoid generic stylistic suggestions unless they affect understanding. Do not claim CI, security checks or runtime features passed if they were not verified. A Copilot review is **feedback**; separate required GitHub approvals and owner authorization still govern merges.
