# TNYX-PREVIEW-LABEL-20261123 — PR-label Expo Go preview

| Field | Value |
|---|---|
| Repository | im-tnyx/Tio-Workspace |
| Owner request | Advance existing Expo Live Preview toward Tio-Money-style labeled PR workflow, work on a branch |
| Working branch | feat/expo-label-live-preview |
| Status | IMPLEMENTED_ON_BRANCH / REVIEW_PENDING / NOT_ACTIVATED |
| Implementation owner | ChatGPT GPT-6 through connected GitHub tools |
| Previous implementing agent | UNKNOWN_NOT_VERIFIED |
| Last commit agent | ChatGPT GPT-6, exact commit to be checked after final update |
| Merge permission | NOT_GRANTED |
| Privileged Codespaces / EAS / production dispatch | NOT_GRANTED |
| Device verification | Owner reports existing Expo Go live verification; new labeled flow NOT_RUN |

## Scope and trust design

Add a fail-closed PR-label code review path without modifying existing legacy Codespaces sync or EAS workflows. This is **Phase 1** of parity with Tio-Money. The unified EAS + Codespaces single manual action is **not implemented** in this slice, because source code execution and secret exposure require an additional credential-isolation review.

- GitHub owner-selected PR must be open, authored in same repo and main-bound; only one globally open labeled PR uses label `tnyx-preview`.
- PR can be Draft; only approved paths (source, assets, tests/docs/task notes and constrained root docs) may change.
- Verify immutable compare base/head, changed-file completeness, renamed source paths and refreshed PR metadata before remote selection; recheck head/base/label before SSH.
- Secretless branch push signal and trusted-main worker are separated. No PR code runs in credential-bearing Actions runner.
- Owner-only manual dispatch accepts positive integer **string** PR input, not GHA numeric coercion.
- Dedicated Codespace must match immutable numeric API ID, name, display name, owner/repo. A clean isolated Codespace is checked out by SHA in detached mode; no remote reset/stash/clean.
- Existing Metro starter is reused. Exact device Fast Refresh is not assumed.

## Files in this slice

- `.github/workflows/expo-pr-live-push-signal.yml`: unprivileged push signal (excludes main and legacy preview).
- `.github/workflows/expo-pr-live-preview.yml`: owner-gated manual/automatic trusted-main worker, PR/path/identity gates and remote execution.
- `.github/scripts/verify-expo-live-pr.mjs`: reusable pure fail-closed PR/label/path verifier.
- `.github/scripts/sync-expo-pr-live-preview.sh`: dedicated Codespace clean worktree + exact PR SHA checkout.
- `tests/expo-live-preview.test.mjs`: positive owner Draft case and negative scope/race cases.
- `docs/28-LABELED-EXPO-PR-LIVE-PREVIEW.md`: operational boundaries, setup requirements, rollback and acceptance gates.
- This task record.

## Verification and ownership gates

- Connected GitHub: inspected actual default-branch AGENTS.md, current context, legacy workflows, Expo starter, sync script, package and app/EAS identity.
- Branch created from GitHub `main`. New files committed without altering legacy workflows, app source or secrets.
- Focused test designed: `node --test tests/expo-live-preview.test.mjs`. GitHub CI exact-HEAD status must be checked after PR creation.
- Local complete checkout/build/device/real Codespaces run: **NOT_RUN**. No GitHub Environments, tokens, labels, Codespaces or EAS settings changed.
- Review: **REVIEW_PENDING**. Human/independent security review required for trusted workflow before merge; source-map behavior, Codespaces API metadata, and real device flow must be validated.
- Post-merge operator must create isolated `tnyx-expo-pr-preview-trusted` Environment restricted to main, a new dedicated Codespace and nonsecret identity vars. No source-only PR may access EAS/production credentials via this workflow.
- Do not merge, publish, queue builds, start Codespaces or retire `tnyx/expo-preview` without separate owner approval.

## Next action

Open a draft PR with exact changed-file list and validation evidence. Address independent review findings and CI before requesting owner-specific merge authorization. After authorized merge, configure the new dedicated preview separately and capture actual physical Expo Go refresh evidence.
