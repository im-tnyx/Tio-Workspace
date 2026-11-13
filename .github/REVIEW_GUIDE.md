# 👀 Tio Workspace — PR Review Guide

**Status:** Review procedure for repository owners, independent AI agents and optional GitHub review bots. [Root agent contract](../AGENTS.md) remains canonical; [PR workflow](../docs/11-PR-REVIEW-WORKFLOW.md) defines merge gates.

> [!IMPORTANT]
> A reviewer must inspect the **actual PR diff**, relevant current canonical docs and available checks. Do not say “passed” after reading only the PR description. A bot comment is not necessarily a formal GitHub approval. Review findings must never silently authorize implementation or merge.

## 1. Ways to obtain one quality review

| Reviewer | How to request | Evidence to retain |
|---|---|---|
| **GitHub Copilot Code Review** | PR → Reviewers → Copilot → Request, **when eligible**; optional auto-review in GitHub settings | Copilot review URL, result and exact scope; normally `COMMENT` |
| **Codex Code Review** | `@codex review` PR comment **only after integration is enabled** | Bot review/comment link and findings; do not infer GitHub `APPROVED` |
| **Independent ChatGPT/AI agent** | Provide PR link **with authorized repo access** and ask for read-only review following `AGENTS.md` | Posted review summary/inline notes with reviewed commit SHA and reviewer identity |
| **Owner/human** | Files changed → inspect diff → leave meaningful PR review/comment | GitHub review or owner sign-off comment with scope |

A genuinely **separate reviewer** is preferred over author self-review. One recorded review is the default quality gate; for sensitive auth, key/backup, local erase or remote data handling, request a security-minded second perspective where practical. **Only owner authorization** allows review deferral; deferral is not a way around repository-required checks.

## 2. Copyable prompt for a manual AI / ChatGPT review

```text
Review PR <URL> in im-tnyx/Tio-Workspace in READ-ONLY mode.
Follow root AGENTS.md and docs/11-PR-REVIEW-WORKFLOW.md.
Read the live PR diff, changed paths, relevant accepted product/architecture
docs, and available checks. Do not implement or merge anything.

Focus first on consequential issues: local-only workout data privacy,
Supabase Auth/offline sessions, user/account isolation, secrets,
AI/backup/sync consent, phase gates, and misleading implementation claims.
For docs-only PRs, prioritize broken relative paths, contradiction,
invalid links, unclear approval, and false status claims.

Return a verdict: PASS / CHANGES_REQUESTED / INCONCLUSIVE.
For each concrete issue give severity, path:line (when available),
evidence/impact and a minimum fix. Separate questions from findings.
Identify your reviewer type, inspected commit SHA/diff scope,
checks not run, blockers, and whether re-review is required.
Do not assert GitHub APPROVED unless GitHub actually records it.
```

**Privacy:** do not paste private repository code or personal data into an unapproved third-party AI chat; use connected, authorized review tools and redacted/minimal excerpts where necessary.

## 3. Finding format and review outcomes

| Level | Meaning | Expected handling |
|---|---|---|
| **Blocking — high** | Security, data exposure/loss, critical product invariant or approval violation | Fix before merge; require review of fix |
| **Blocking — medium** | Significant behavior/contract mistake, broken doc reference, misleading state | Fix before merge |
| **Non-blocking — low** | Useful improvement without correctness impact | Fix if cheap or track separately |
| **Question** | Unproven interpretation or missing context | Clarify; do not represent as a defect |

**Review evidence template:**

```text
Reviewer: <human / Copilot / Codex / independent agent>
Review mode: <GitHub APPROVED | GitHub COMMENT | manual assessment>
PR + inspected HEAD SHA: <link + verified SHA>
Verdict: <PASS | CHANGES_REQUESTED | INCONCLUSIVE>
Blocking findings: <path:line, issue, fix commit/thread URL, disposition>
Checks verified / unavailable: <actual results>
Unresolved risks + next review: <details>
Merge authorization: <separate owner authorization or NOT GRANTED>
```

## 4. Minimum workflow

1. Author self-checks scope, docs, diff and applicable automated checks.
2. Request **at least one** reviewer (bot, independent agent or owner). If unavailable, record `REVIEW_PENDING` and ask owner whether to defer for this specific PR.
3. Reviewer reads real current diff; leaves actionable, concrete inline comments or a linked review summary.
4. Author fixes blocking findings, links commit and test evidence, replies to threads; requests re-review after material changes.
5. Reviewer confirms remaining blockers are resolved, or records why evidence is inconclusive.
6. Verify required configured checks, then seek **distinct owner authorization to merge**. A bot `COMMENT` does not meet a GitHub formal approval rule.
7. After authorized merge, verify `main` and follow [post-merge playbook](../docs/12-POST-MERGE-PLAYBOOK.md).

**Bot setup is optional and cannot be claimed complete merely because these files exist.** Settings, plan/license eligibility, and installed GitHub integration determine whether Copilot/Codex requests actually work.

## 5. Official setup references

- [GitHub Copilot code review](https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/copilot-code-review)
- [Configure automatic Copilot reviews](https://docs.github.com/en/copilot/how-tos/copilot-on-github/set-up-copilot/configure-code-review)
- [Codex custom review rules in AGENTS.md](https://developers.openai.com/blog/custom-code-review-rules-for-codex)

---

[← Review workflow](../docs/11-PR-REVIEW-WORKFLOW.md) · [Agent contract](../AGENTS.md)
