# Commit attribution guard — Tio Workspace

**Status: proposed implementation / not yet enforced at the merge gate.** The root [AGENTS.md](../AGENTS.md) is the normative multi-agent attribution policy. The dedicated [task record](../.ai/tasks/security/local-20261115-commit-attribution-guard.md) tracks this bounded governance slice.

## Policy and scope

- AI assistance does not grant Git authorship or co-authorship. Record **Implementation owner**, **Previous agent**, **Last commit agent**, handoff and observed SHAs only in `.ai/tasks/`, not in Git `Co-Authored-By` or AI self-credit messages.
- Do not add AI/model/vendor `Co-Authored-By`, AI `Signed-off-by`, `Assisted-by`, `Generated with/by`, `AI-assisted`, or equivalent attribution in commit bodies, squash messages, PR text or release notes. Legitimate human authors, co-authors and compliance sign-offs remain valid.
- Do not impersonate a human author or rewrite already published `main` history. Agents cannot approve their own exceptions, disable the checker, remove a required check, or bypass branch rules.
- The scanner detects known explicit AI identities, bot mailboxes, and credit footers, with false-positive fixtures for real humans. It cannot reliably classify every invented or ambiguous identity; human review remains necessary.

## Files and behavior

1. `scripts/check_commit_attribution.sh` is adapted from Tio-Ledger's tested scanner. It checks **all commits** in the provided `base..head` range, using `git interpret-trailers` plus careful free-form credit detection. Exit code `0` = clean or exact owner-approved exception, `1` = violation, `2` = technical failure (never exempt).
2. `scripts/check_commit_attribution_test.sh` creates disposable Git fixture commits for allowed humans, rejected AI identities, mixed commit ranges, exceptions and fail-closed errors. `commit-attribution-fixtures.yml` runs these on PRs and `main`; this is an **advisory bootstrap check**, NOT trusted enforcement because PRs can change their own fixture workflow.
3. `commit-attribution-guard.yml` uses `pull_request_target` to execute the default-branch checker at the PR base SHA. It fetches the PR head as Git **objects only** and never checks out or executes PR code. The separate `scripts/check_attribution_base_freshness.sh` rejects stale main and PR heads.
4. The trusted guard runner publishes `Commit attribution guard` as a **dedicated GitHub App Check Run on the exact PR head**, not as a `github-actions`-owned required check. Without the App, environment, secrets, and source-pinned ruleset, it is **NOT** an enforced merge gate.
5. `commit-attribution-main-audit.yml` inspects newly reachable `main` commits, including new squash/merge commit messages. It detects *after* merge; it cannot prevent or undo the merge.

## Activation: owner/admin steps (separate authority)

**Do not claim complete protection until every step below is verified.**

1. Confirm private-repository branch rules are actually available. On 2026-11-15, Tio-Workspace's `main` reported `protected: false`, and repository rulesets returned GitHub `403` with “Upgrade to GitHub Pro or make this repository public”. **Do not make the repo public as a workaround without separate explicit owner approval.** If the plan lacks required rules, the scanner may alert but cannot guarantee that an offending PR/direct push is blocked.
2. Install an owner-controlled `Tio Attribution Guard` GitHub App for **Tio-Workspace**, with minimum `Checks: read/write` and `Metadata: read`. Do not reuse or expose a Ledger-only private key without deliberate owner/admin reconfiguration.
3. Set up Actions environment `attribution-guard-trusted`, deployment branches restricted to `main` only. Provide `ATTRIBUTION_GUARD_APP_PRIVATE_KEY` as an **environment secret** and `ATTRIBUTION_GUARD_APP_CLIENT_ID` as an **environment variable**. Never commit either value.
4. Merge the reviewed governance PR only after **separate owner merge approval** and explicit inspection of the final merge/squash subject and body. This makes the trusted-base workflow available on `main`; it does not itself establish protection.
5. Use disposable, never-to-be-merged test PRs to verify (a) a clean head receives an App-produced successful `Commit attribution guard` Check Run and (b) a prohibited AI co-author commit creates a failing Check Run. Verify the check's **GitHub App source ID** and exact head SHA.
6. Protect `main`: require PRs, no force pushes/deletions or unauthorized bypass; add `Commit attribution guard` as a **required status check pinned to the dedicated App**, not to `github-actions`. Turn on **Require branches to be up to date** (strict). Verify a previously green PR cannot merge after `main` advances without an updated head and a fresh App check. Never claim strict enforcement based solely on the freshness script.
7. Verify a remediated PR passes, the bad PR cannot merge, direct pushes are restricted, and no path can spoof the required App check. Record the live ruleset, App ID, checked head SHAs and review links in the task/PR. If GitHub account capabilities block these actions, keep the status **NOT ENFORCED**.

## Final merge-message boundary

PR-commit checking cannot see a *new* squash/merge commit message before it is created. The owner must inspect and clean the final merge confirmation text, including trailers. The `main` audit is post-merge **detection only**. For a stronger future boundary, separately evaluate GitHub commit-message metadata restrictions if supported by the repository plan and after false-positive testing; changing allowed merge methods is a separate owner decision.

## Remediation and exceptions

- Before PR, run `bash scripts/check_commit_attribution_test.sh` and the checker against the relevant commit range; examine full messages with `git show -s --format=%B <sha>`.
- Remove prohibited AI credit from the affected **feature-branch** commit(s) only; a published history rewrite requires explicit owner authorization. Never rewrite `main` merely for historical AI attribution.
- The owner can temporarily set `AI_ATTRIBUTION_EXCEPTION_PR` to one exact PR number, **only** for a specifically approved attribution exception. Clear it immediately afterward. Invalid refs, fetch mismatches and parser failures are never bypassed.
- Owner authorization to implement this guard is not permission to merge its PR, change branch protection, create credentials, or alter application/Auth/Supabase behavior.

[Docs index](00-INDEX.md) · [Multi-agent contract](../AGENTS.md) · [Task template](../.ai/tasks/TEMPLATE.md)
