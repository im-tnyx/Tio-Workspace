# Prevent unintended AI commit attribution

| Field | Value |
|---|---|
| Status | Ready for independent review — PR #17 CI passing on first code head; App/required-check activation NOT done |
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
- Runner must use trusted `main` code only, never execute the PR head, and publish a required check from a dedicated GitHub App only after admin activation.
- A PR fixture job is not non-bypassable enforcement. A post-merge audit cannot undo a bad squash message.
- Keep status **not enforced** pending App-source-pinned strict branch protection and live clean/bad/stale PR validation.

## Progress

- [x] Read-only comparison and exact GitHub state reconciliation.
- [x] Prepare scoped scanner/workflows/policy/task changes on feature branch (verify live PR head).
- [x] Validated fixtures/CI and patch on first published code head `6b3f1c4237fa154f48ee2d659bf9d1f7011b2caa` (CI must be rechecked after task-evidence commit).
- [ ] Independent review **requested** from `im-tio` on [PR #17](https://github.com/im-tnyx/Tio-Workspace/pull/17); final assessed head and verdict pending.
- [ ] Owner authorizes merge of this exact PR.
- [ ] Owner/admin configures GitHub App, trusted environment, strict required check and performs negative/positive/stale PR tests.

## Changed files

- `AGENTS.md`; `docs/00-INDEX.md`; `docs/26-COMMIT-ATTRIBUTION-GUARD.md`
- `.github/PULL_REQUEST_TEMPLATE.md`
- `.github/workflows/commit-attribution-fixtures.yml`
- `.github/workflows/commit-attribution-guard.yml`
- `.github/workflows/commit-attribution-main-audit.yml`
- `scripts/check_commit_attribution.sh`; `scripts/check_commit_attribution_test.sh`; `scripts/check_attribution_base_freshness.sh`
- `.ai/current.md`; this task file; old CI task moved into `.ai/archive/2026/`

## PR review evidence and findings

- Review requested from: `im-tio` on [PR #17](https://github.com/im-tnyx/Tio-Workspace/pull/17), confirmed in live GitHub requested reviewers; response pending.
- Reviewer identity / link / reviewed SHA: `im-tio` request confirmed; review submission and assessed SHA **not yet obtained**.
- Review status: `REVIEW_PENDING`; verdict: `INCONCLUSIVE` until actual check/review evidence.
- Required CI vs supplemental: check current repo rules, not guessed status.
- Merge approval: **not granted**.

## Validation evidence

- Tio-Workspace first code head `6b3f1c4237fa154f48ee2d659bf9d1f7011b2caa`: [Attribution fixture run 43734616083](https://github.com/im-tnyx/Tio-Workspace/actions/runs/43734616083) **72 passed, 0 failed**, completed success; [Phase 1.1 shell run 43734616001](https://github.com/im-tnyx/Tio-Workspace/actions/runs/43734616001) **success** (dependency, design tokens, TypeScript, ESLint, pure tests).
- First published [PR #17](https://github.com/im-tnyx/Tio-Workspace/pull/17) diff: 13 changed paths (including one archive rename), 1 commit ahead; no trailing whitespace in added lines. Git author + committer both the repository owner's connected GitHub identity; no AI co-author trailer. No GitHub App-owned required check is active or source pinned.
- Verify changed paths, exact PR SHA, whitespace, CI and test outcomes after PR publication; document anything unrun.

## Handoff

**Next owner:** Independent reviewer and repository owner for PR merge decision; GitHub administrator for protected-rule activation.

**Next authorized action:** Review/validate the governance PR, then ask for separate merge/admin action.

**Post-merge synchronization/archive needed:** Yes, only after verified merge and the separate activated-protection evidence.

[Task guide](../README.md) · [Agent contract](../../../AGENTS.md) · [Guard documentation](../../../docs/26-COMMIT-ATTRIBUTION-GUARD.md)
