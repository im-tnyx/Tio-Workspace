# Prevent unintended AI commit attribution

| Field | Value |
|---|---|
| Status | Third Codex review: two fresh P2 fixes implemented; current-head CI and independent re-review pending; App-owned required-check activation NOT done |
| Objective | Prevent agents from writing AI co-author and equivalent self-credit metadata, while retaining human attribution and `.ai/` multi-agent records |
| Implementation owner | ChatGPT connected GitHub session, bounded repo governance slice; repository owner retains approval/merge authority |
| Previous agent | None for this slice; completed preview PR #15 is a separate archived task |
| Last commit agent | ChatGPT connected GitHub session; verified first code commit `6b3f1c4237fa154f48ee2d659bf9d1f7011b2caa`; current PR head must be rechecked after evidence commits |
| Tracking / approval | Owner's 2026-11-15 instruction approving Tio-Ledger-style setup in Tio-Workspace; **merge/admin activation not authorized** |
| Branch | `tnyx/security/commit-attribution-guard-20261115` |
| Base SHA / inspected HEAD | `5b8f03579f3c68b6f773ebde0323b1f6ee95263d` (verified starting `main`; PR head to be inspected) |
| Platform and file scope | GitHub workflow/commit metadata, Bash fixtures, docs, `.ai/` task continuity; no Expo/Auth/Supabase changes |
| Created / updated | 2026-11-15 |

## Required context

- [x] Read root `AGENTS.md`, existing `.ai/tasks/TEMPLATE.md`, current pointer and multi-agent rules.
- [x] Verified live `main` and that PR #15 merged; existing preview task pointer is stale.
- [x] Inspected Tio-Ledger's scanner, tests, trusted workflow, post-merge audit, documentation and live ruleset.
- [x] Checked Tio-Workspace branch protection: `protected: false`; ruleset API returned `403` private-repo feature restriction.
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
- Not available here: GitHub private-repo branch rules under current plan; no credential/account administration performed.

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
- [ ] [Codex review #5911970399](https://github.com/im-tnyx/Tio-Workspace/pull/17#pullrequestreview-5911970399) on `cd6e0295` identified **two new P2 residual bypasses**: `OpenAI Assistant` / `Anthropic Bot` with generic emails, and terminal punctuation in `Generated with Claude Code.`. Fix expands **exact curated AI base + explicit role** recognition and trims only edge punctuation for known credit identities, preserving email-free human false positives. Added **16** focused regression cases. CI on the new PR head and independent review are required before considering these fixed.
- [ ] Owner authorizes merge of this exact PR.
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

- Review requested from: `im-tio` on [PR #17](https://github.com/im-tnyx/Tio-Workspace/pull/17), confirmed in live GitHub requested reviewers; response pending.
- Reviewer identity / link / reviewed SHA: `im-tio` request confirmed; review submission and assessed SHA **not yet obtained**.
- Review status: Eight P2 findings reported across three Codex reviews; six prior findings have implementations and deterministic passing CI; two new findings on `cd6e0295` need fresh CI/review; three new P2 from `95db341b` have code-fix HEAD `5a726fd6` with 100+14 tests passed. **None of the six threads is reviewer-confirmed/resolved**, and `im-tio`'s only formal review is COMMENTED (not APPROVED); independent current-head re-review is required. im-tio COMMENTED (not APPROVED); independent re-review and final owner gate pending.
- Required CI vs supplemental: check current repo rules, not guessed status.
- Merge approval: **not granted**.

## Validation evidence

- Tio-Workspace first code head `6b3f1c4237fa154f48ee2d659bf9d1f7011b2caa`: [Attribution fixture run 43734616083](https://github.com/im-tnyx/Tio-Workspace/actions/runs/43734616083) **72 passed, 0 failed**, completed success; [Phase 1.1 shell run 43734616001](https://github.com/im-tnyx/Tio-Workspace/actions/runs/43734616001) **success** (dependency, design tokens, TypeScript, ESLint, pure tests).
- First published [PR #17](https://github.com/im-tnyx/Tio-Workspace/pull/17) diff: 13 changed paths (including one archive rename), 1 commit ahead; no trailing whitespace in added lines. Git author + committer both the repository owner's connected GitHub identity; no AI co-author trailer. No GitHub App-owned required check is active or source pinned.
- Current code-fix head `5a726fd6c7e0c684b8c6f1e0fb43346aeb4e2e07`: [fixture run 43741139005](https://github.com/im-tnyx/Tio-Workspace/actions/runs/43741139005) **100 attribution + 14 guard integrity cases pass**; [shell run 43741138995](https://github.com/im-tnyx/Tio-Workspace/actions/runs/43741138995) **success**; current PR diff 14 files. Updating this task will advance the PR head, so verify latest-head CI after the evidence-only commit.
- Earlier code-fix head `57b0d4d4b6ce57398695e7d9fcf3a1891b69ec7e`: [fixture run 43738705551](https://github.com/im-tnyx/Tio-Workspace/actions/runs/43738705551) **88 passed / 0 failed** (including all three Codex bypasses, human false positives and freshness fixtures); [shell run 43738705449](https://github.com/im-tnyx/Tio-Workspace/actions/runs/43738705449) **success**. PR diff has 0 added-line whitespace issues. A task/evidence follow-up commit must be CI-checked separately.

## Handoff

**Next owner:** Independent reviewer and repository owner for PR merge decision; GitHub administrator for protected-rule activation.

**Next authorized action:** Review/validate the governance PR, then ask for separate merge/admin action.

**Post-merge synchronization/archive needed:** Yes, only after verified merge and the separate activated-protection evidence.

[Task guide](../README.md) · [Agent contract](../../../AGENTS.md) · [Guard documentation](../../../docs/26-COMMIT-ATTRIBUTION-GUARD.md)
