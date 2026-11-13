# Tio Workspace — Copilot Review Instructions

Read the repository [AGENTS.md](../AGENTS.md) and the focused [review guide](REVIEW_GUIDE.md). This repository is **Phase 0 / documentation-only**; do not treat planned Expo, Supabase or backup features as implemented.

In every PR review:
1. Flag concrete accidental workout data uploads, cross-account local data access, client-side secrets or missing explicit consent for AI/backup/future sync; cite the changed line and impacted requirement.
2. Flag changes that bypass Phase 0 approval, break the persistent login/offline local-workout contract, or claim encryption/restore/deployment without verification.
3. For documentation-only changes, prioritize broken relative links, contradictory canonical instructions, incorrect architecture stack (Tio Workspace is **React Native / Expo**, not Tio World Flutter), or falsely marked approved/implemented status.

Give line-specific, actionable findings with impact and minimal fixes. Avoid generic stylistic suggestions unless they affect understanding. Do not claim CI, security checks or runtime features passed if they were not verified. A Copilot review is **feedback**; separate required GitHub approvals and owner authorization still govern merges.
