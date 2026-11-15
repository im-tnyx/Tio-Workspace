# Prevent unintended AI commit attribution

| Field | Value |
|---|---|
| Status | P2 Markdown-emphasis fix verified on code HEAD `c00a0b2` (131 attribution + 14 guard integrity, Phase 1.1 green); PR #17 precedes PR #18 for pointer handoff; independent re-review, App bootstrap and owner merge gate still BLOCKED |
| Objective | Prevent agents from writing AI co-author and equivalent self-credit metadata, while retaining human attribution and `.ai/` multi-agent records |
| Implementation owner | ChatGPT connected GitHub session, bounded repo governance slice; repository owner retains approval/merge authority |
| Previous agent | None for this slice; completed preview PR #15 is a separate archived task |
| Last commit agent | ChatGPT connected GitHub session; code-fix commit `4483dd99fafb3b19a6b6001ce4f27507f712f4eb` verified; evidence-only commit HEAD/CI to re-check |
| Tracking / approval | Owner's 2026-11-15 instruction approving Tio-Ledger-style setup in Tio-Workspace; **merge/admin activation not authorized** |
| Branch | `tnyx/security/commit-attribution-guard-20261115` |
| Base SHA / inspected HEAD | `095c3edb4a7b1969598bc01162d66496febbf0c2` (`main` after PR #15 merge) / code-fix `4483dd99fafb3b19a6b6001ce4f27507f712f4eb` |
| Platform and file scope | GitHub workflow/commit metadata, Bash fixtures, docs, `.ai/` task continuity; no Expo/Auth/Supabase changes |
| Created / updated | 2026-11-15 |

## Required context

- [x] Read root `AGENTS.md`, existing `.ai/tasks/TEMPLATE.md`, current pointer and multi-agent rules.
- [x] Verified live `main` and that PR #15 merged; existing preview task pointer is stale.
- [x] Inspected Tio-Ledger's scanner, tests, trusted workflow, post-merge audit, documentation and live ruleset.
- [x] Historical starting-state check: `protected: false` and `403` on private repository. **Superseded on 2026-11-15**: repository now **public**, `main` protected, active ruleset `Main Protection` ID `27218050`. This PR did not change visibility or protection.
- [ ] Independently review changes at exact PR head and review live CI results.

## Approved scope / non-goals

- Add Tio-Ledger-derived Bash scanner and fixture suite, trusted `pull_request_target` GitHub App workflow, separate fixture CI, and `main` post-merge audit.
- Add explicit agent attribution policy and owner/admin activation instructions.
- Update `.ai/current.md` to one active task, archive completed PR #15 preview task; leave all product decisions intact.
- Out of scope: GitHub App provisioning/secrets, changing repository plan/visibility/protection settings, merging PRs, rewriting published history, Expo features, Auth, Supabase, database, OTA deployment.
- Approval source: owner's current bounded setup instruction; all elevated admin and merge actions require separate approval.

## Selected skills and tools

- GitHub connector: read current branches, Ledger implementation and Workspace docs; create one focused governance branch and PR.
- Bash/Git fixture checks: use the independent fixture workflow; record observed results rather than assuming they ran.
- Workspace `AGENTS.md` and existing test/review governance: source of truth.
- Live ruleset is readable via GitHub API; this agent did not administer visibility, ruleset, trusted environment, App credentials or merge.

## Durable decisions

- The `.ai/` task file is the official record of AI agent role/ownership/handoff; Git commit trailers belong to human provenance, not AI self-credit.
- Preserve legitimate human names and sign-offs. Use Ledger's precise, tested detector; prohibit AI attribution by default.
- Runner must use trusted `main` code only, never execute the PR head, and publish a required check from the **existing `Tio Attribution Guard` GitHub App** only after admin activation. Owner (2026-11-15) explicitly confirmed that the existing App may be reused for Workspace; no separate App registration is needed. Verify that its installation includes Tio-Workspace, without broadening to all repositories; provision Workspace environment Client ID and private-key secret securely from that App's owner-controlled credentials. **No App installation, credential or repository-setting update has been performed by this PR.**
- A PR fixture job is not non-bypassable enforcement. A post-merge audit cannot undo a bad squash message.
- Keep status **not enforced** pending App-source-pinned strict branch protection and live clean/bad/stale PR validation.

## Progress

- [x] Read-only comparison and exact GitHub state reconciliation.
- [x] Reconciled independently merged PR #15 post-merge archive on `main` (SHA `095c3edb4a7b1969598bc01162d66496febbf0c2`); preserved the **main** archive and preview follow-up facts rather than replacing with stale PR #17 copy.
- [x] Prepare scoped scanner/workflows/policy/task changes on feature branch (verify live PR head).
- [x] Validated fixtures/CI and patch on first published code head `6b3f1c4237fa154f48ee2d659bf9d1f7011b2caa` (CI must be rechecked after task-evidence commit).
- [x] `im-tio` reviewed `7e28127d992f6dc374df0426f3578cc1b1d4563c`: COMMENTED, no new actionable code defect; P3 PR description evidence needed refresh (review link in PR).
- [x] Codex [review #5911817400](https://github.com/im-tnyx/Tio-Workspace/pull/17#pullrequestreview-5911817400) on same SHA identified **three open P2 threads**: Claude 3.7 Sonnet names, nonterminal co-author credits, AI author/committer metadata. Fix commit `57b0d4d4b6ce57398695e7d9fcf3a1891b69ec7e` adds precise metadata and full-message scanning and 16 regression cases; verified 88/88 pass, shell checks pass on that code head. Independent re-review is still required before treating the findings as resolved.
- [x] [Codex review #5911887685](https://github.com/im-tnyx/Tio-Workspace/pull/17#pullrequestreview-5911887685) on `95db341b` reported three additional P2 issues: qualified AI bot-role identity bypass, guard-source tampering, and email-free legitimate human name false positive. Focused changes add precise bot-role identity detection, precise email-free credit rules, and owner-only exact `PR:SHA` trust-boundary approval for guard-critical paths. New deterministic regression tests added; [fixture run 43741139005](https://github.com/im-tnyx/Tio-Workspace/actions/runs/43741139005) confirms **100 attribution tests + 14 integrity tests passed, 0 failed** on code head `5a726fd6c7e0c684b8c6f1e0fb43346aeb4e2e07`; [shell checks 43741138995](https://github.com/im-tnyx/Tio-Workspace/actions/runs/43741138995) also passed. **Independent re-review still required**.
- [ ] [Codex review #5911970399](https://github.com/im-tnyx/Tio-Workspace/pull/17#pullrequestreview-5911970399) on `cd6e0295` identified **two new P2 residual bypasses**: `OpenAI Assistant` / `Anthropic Bot` with generic emails, and terminal punctuation in `Generated with Claude Code.`. Fix expands **exact curated AI base + explicit role** recognition and trims only edge punctuation for known credit identities, preserving email-free human false positives. Added **16** focused regression cases. Code-fix head `4483dd99fafb3b19a6b6001ce4f27507f712f4eb` passed [fixture run 43743606019](https://github.com/im-tnyx/Tio-Workspace/actions/runs/43743606019) with **116 attribution + 14 integrity tests / 0 failures**; [Phase 1.1 shell run 43743606081](https://github.com/im-tnyx/Tio-Workspace/actions/runs/43743606081) also **passed**. Independent current-head review is still required.
- [x] [im-tio formal CHANGES_REQUESTED review #5912187405](https://github.com/im-tnyx/Tio-Workspace/pull/17#pullrequestreview-5912187405) on `c4d29989fbed2bc4c018a15b3bca1fcf6b86a323`: **8 prior P2 implementation concerns accepted**; new **P1** source-unpinned required guard checks; **P2** `strict_required_status_checks_policy=false`; **P2** impossible missing-check bootstrap. Live active ruleset `27218050` requires `Commit attribution guard` and `Attribution guard runner`, both missing `integration_id`, neither appears on HEAD. Repository now **public** and protected. **Owner-only bootstrap proposal** added to docs; settings not changed.
- [x] Independently verified live ruleset **27218050** on 2026-11-16: strict required checks **ON**; `Commit attribution guard` is pinned to `tio-attribution-guard` App **5032971**; `Attribution guard runner` remains required with `github-actions` App **15368**. The reviewer’s earlier source-pin/strict findings are **fixed by owner settings**, but neither missing actual Check Run nor bootstrap is resolved.
- [ ] Owner/admin executes separately authorized, narrowly scoped temporary replacement of only missing guard required contexts with existing successful `checks` and `Commit attribution fixture tests` (both pinned to `github-actions` App **15368**), keeps strict + all PR/review protections, merges **only after independent approval and separate explicit `go merge`**. Then validates real App-owned positive/negative/stale checks and restores a sole App-pinned requirement immediately. No ruleset settings changed by this session.
- [ ] Owner authorizes merge of this exact PR only after updated independent approval and authorized bootstrap plan.
- [x] New P2 review on `5f3671b`: **Markdown emphasis bypass** (`Generated with **Claude Code**` / `Co-Authored-By: **Claude Code** <...>`) and **`.ai/current.md` conflict with concurrent PR #18**. Scanner now removes only **balanced whole-identity Markdown `**`, `__`, `*`, `_`** before exact AI classification and also normalizes Markdown-link labels. Added **15 fixtures** incl legitimate emphasized humans. **Code HEAD `c00a0b21d6ce2f79e6558048d8072eeb582da7a6` verified**: [fixtures run 43756600583](https://github.com/im-tnyx/Tio-Workspace/actions/runs/43756600583) **131 attribution + 14 integrity passed, 0 failed**; [Phase 1.1 run 43756600623](https://github.com/im-tnyx/Tio-Workspace/actions/runs/43756600623) **passed**. Independent reviewer confirmation is still pending. Chosen dependency order **PR #17 first** (guard needed by #18), then **PR #18 rebase and restore its own current task pointer**; PR #18 branch has not been edited. No merge authority granted.
- [ ] Owner reports existing `Tio Attribution Guard` App + Workspace trusted environment Client ID/private-key secret setup completed (2026-11-15); confirm **actual** App installation and credential function with a trusted-run test after PR merge. Owner/admin still must configure strict App-source-pinned required check and perform clean/bad/stale PR tests. GitHub connector does not expose encrypted environment values.

## Changed files

- `AGENTS.md`; `docs/00-INDEX.md`; `docs/26-COMMIT-ATTRIBUTION-GUARD.md`
- `.github/PULL_REQUEST_TEMPLATE.md`
- `.github/workflows/commit-attribution-fixtures.yml`
- `.github/workflows/commit-attribution-guard.yml`
- `.github/workflows/commit-attribution-main-audit.yml`
- `scripts/check_commit_attribution.sh`; `scripts/check_commit_attribution_test.sh`; `scripts/check_attribution_base_freshness.sh`; `scripts/check_guard_integrity.sh`; `scripts/check_guard_integrity_test.sh`
- `.ai/current.md`; this task file; old CI task moved into `.ai/archive/2026/`

## PR review evidence and findings

- [im-tio review #5912187405](https://github.com/im-tnyx/Tio-Workspace/pull/17#pullrequestreview-5912187405): **CHANGES_REQUESTED** against exact SHA `c4d29989fbed2bc4c018a15b3bca1fcf6b86a323` / base `095c3edb4a7b1969598bc01162d66496febbf0c2`. Reviewer validated all eight earlier P2 fixes and passing 116+14 fixtures + Phase 1.1 checks; **no new scanner defect**.
- **P1 now addressed in owner settings (read-only verified 2026-11-16):** active `Main Protection` ruleset `27218050` pins `Commit attribution guard` to the **dedicated App ID 5032971**, correctly named `tio-attribution-guard` in the GitHub App suite. The redundant runner is still pinned to GitHub Actions App 15368 and must be removed from final required contexts.
- **P2 strict-setting now addressed:** `strict_required_status_checks_policy=true` was observed 2026-11-16. The stale-main/PR scenario still needs a live end-to-end App check after bootstrap.
- **P2 bootstrap still blocking:** neither required guard Check Run exists on latest HEAD `af30bc176db792e0c4f6cf0a8a388f43e918c60b`; only GitHub Actions `checks` and `Commit attribution fixture tests` (App ID **15368**) are green. The correct App **5032971** has a **queued check suite**, not a real Check Run. Trusted workflow is not on main; REST mergeable_state=blocked. The admin-only minimal bootstrap plan is documented. No setting/merge action authorized in this documentation update.
- All eight old Codex P2 threads remain **unresolved in GitHub**, despite im-tio's substantive acceptance; reviewer confirmation/thread resolution and a new formal `APPROVED` review after this docs update are still required. Owner merge approval **not granted**.

## Validation evidence

- Current Markdown emphasis code-fix HEAD `c00a0b21d6ce2f79e6558048d8072eeb582da7a6`: [fixtures 43756600583](https://github.com/im-tnyx/Tio-Workspace/actions/runs/43756600583) **131 attribution tests + 14 guard integrity tests, all passing**, [shell 43756600623](https://github.com/im-tnyx/Tio-Workspace/actions/runs/43756600623) **success**; PR diff 14 files, no added whitespace; documentation evidence-only latest SHA requires its own checks.
- Exact review HEAD `c4d29989fbed2bc4c018a15b3bca1fcf6b86a323`: [attribution fixtures 43743792055](https://github.com/im-tnyx/Tio-Workspace/actions/runs/43743792055) and [Phase 1.1 shell 43743792068](https://github.com/im-tnyx/Tio-Workspace/actions/runs/43743792068) both successful, plus [im-tio CHANGES_REQUESTED review](https://github.com/im-tnyx/Tio-Workspace/pull/17#pullrequestreview-5912187405). Required App check contexts absent, so merge protection NOT green. Documentation-only follow-up requires its own current-head checks/review.
- Third Codex P2 remediation code HEAD `4483dd99fafb3b19a6b6001ce4f27507f712f4eb`: [attribution/integrity fixtures 43743606019](https://github.com/im-tnyx/Tio-Workspace/actions/runs/43743606019) **116 + 14 passed / 0 failed**, [Phase 1.1 shell 43743606081](https://github.com/im-tnyx/Tio-Workspace/actions/runs/43743606081) **passed**; PR diff 14 files, no added trailing whitespace. New evidence-only HEAD CI requires separate verification.
- Tio-Workspace first code head `6b3f1c4237fa154f48ee2d659bf9d1f7011b2caa`: [Attribution fixture run 43734616083](https://github.com/im-tnyx/Tio-Workspace/actions/runs/43734616083) **72 passed, 0 failed**, completed success; [Phase 1.1 shell run 43734616001](https://github.com/im-tnyx/Tio-Workspace/actions/runs/43734616001) **success** (dependency, design tokens, TypeScript, ESLint, pure tests).
- First published [PR #17](https://github.com/im-tnyx/Tio-Workspace/pull/17) diff: 13 changed paths (including one archive rename), 1 commit ahead; no trailing whitespace in added lines. Git author + committer both the repository owner's connected GitHub identity; no AI co-author trailer. No GitHub App-owned required check is active or source pinned.
- Current code-fix head `5a726fd6c7e0c684b8c6f1e0fb43346aeb4e2e07`: [fixture run 43741139005](https://github.com/im-tnyx/Tio-Workspace/actions/runs/43741139005) **100 attribution + 14 guard integrity cases pass**; [shell run 43741138995](https://github.com/im-tnyx/Tio-Workspace/actions/runs/43741138995) **success**; current PR diff 14 files. Updating this task will advance the PR head, so verify latest-head CI after the evidence-only commit.
- Earlier code-fix head `57b0d4d4b6ce57398695e7d9fcf3a1891b69ec7e`: [fixture run 43738705551](https://github.com/im-tnyx/Tio-Workspace/actions/runs/43738705551) **88 passed / 0 failed** (including all three Codex bypasses, human false positives and freshness fixtures); [shell run 43738705449](https://github.com/im-tnyx/Tio-Workspace/actions/runs/43738705449) **success**. PR diff has 0 added-line whitespace issues. A task/evidence follow-up commit must be CI-checked separately.

## Handoff

**Next owner:** Independent reviewer and repository owner for PR merge decision; GitHub administrator for protected-rule activation.

**Next authorized action:** Review/validate the governance PR, then ask for separate merge/admin action.

**Post-merge synchronization/archive needed:** Yes, only after verified merge and the separate activated-protection evidence.

[Task guide](../README.md) · [Agent contract](../../../AGENTS.md) · [Guard documentation](../../../docs/26-COMMIT-ATTRIBUTION-GUARD.md)
