# ✅ Post-merge playbook

**Status:** Process checklist for **after a PR is actually merged**; nothing in this file runs automatically.

For **local checkout / remote ref synchronization** after verifying the GitHub merge, follow [the safe post-merge Git sync guide](../.github/POST-MERGE-SYNC.md). It checks dirty worktrees, uses `git pull --ff-only`, verifies the *actual squash merge commit* and avoids automatic branch deletion. This playbook covers repository/task evidence; the sync guide covers local Git operations.

[← Docs hub](00-INDEX.md) · [🔀 PR review](11-PR-REVIEW-WORKFLOW.md) · [🗞 Changelog](../CHANGELOG.md)

## 01 · Confirm the merge

- [ ] PR state is **merged**; capture PR URL, resulting commit SHA and merge time.
- [ ] Target branch is correct, typically `main`.
- [ ] If syncing a local checkout, follow the [Git sync procedure](../.github/POST-MERGE-SYNC.md) without overwriting changes; record actual local `main` SHA and skipped steps.
- [ ] Verify expected changed files exist on `main` and link from README/docs index.
- [ ] Check any branch protection/status checks actually configured; do not assume approval and checks imply a successful deploy.
- [ ] Record the completed reviewer/agent/bot/owner assessment link, disposition of blocking inline comments, reviewed SHA/scope, and distinct owner merge authorization. Do not relabel automated comments as GitHub formal approvals.
- [ ] Archive/close linked issue only when acceptance criteria are met.

## 02 · Revalidate the result

| Change type | Post-merge verification |
|---|---|
| Documentation | Read rendered Markdown on GitHub; check navigation, Mermaid and links |
| Auth (future) | Cold start, persist session, offline reopening, logout, account switching |
| Local database (future) | Migrations, backup snapshot, rollback, row and owner isolation |
| AI Edge Function (future) | Correct auth, rate limits, provider secrets, no logging of sensitive inputs |
| Backup & restore (future) | Real restore on another device, encrypted file integrity |
| Cloud sync (future) | Explicit consent, RLS and concurrent edit conflicts |

## 03 · Keep records accurate

- [ ] Move completed items in [roadmap](06-ROADMAP.md) **only when verified**.
- [ ] Update [decisions](09-DECISIONS.md) for choices now approved.
- [ ] Update [CHANGELOG.md](../CHANGELOG.md) in a **new PR if required**; do not rewrite previous merged commit.
- [ ] Add release notes only for an actual shipped release.
- [ ] Record problems and follow-up tasks rather than hiding failed verification.
- [ ] Document migration/cost/security implications if any online integration changed.

## 04 · Operational follow-ups (future)

Deployments are **not** implied by merges. If production infrastructure exists later, use a separate deployment approval and verify environment, secrets, schema/RLS migration order, health checks, incident response and rollback. Keep workout content out of deployment telemetry.

## 05 · When something goes wrong

1. Stop rollout or disable affected remote feature if supported.
2. Preserve evidence without leaking private data.
3. Revert safely or prepare a corrective PR; avoid rewriting `main` history.
4. If secrets leaked, revoke/rotate immediately.
5. If user local data may be affected, prioritize recovery and informed communication.
6. Document root cause and regression test.

> [!WARNING]
> Never delete local or remote workout data as an incidental cleanup action. Logout, local erase, backup deletion and cloud deletion are distinct user operations.

---

[← PR review](11-PR-REVIEW-WORKFLOW.md) · [Definition of done →](15-DEFINITION-OF-DONE.md)
