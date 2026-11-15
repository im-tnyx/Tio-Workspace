# Manual GitHub PR preview build and OTA update

| Field | Value |
|---|---|
| Status | Ready for Review |
| Objective | From GitHub Actions, manually select an open PR number and publish its verified code to the EAS `pr-preview` branch or create an installable preview build, using cloud runners only |
| Implementation owner | Codex agent; owner-approved bounded preview deployment slice |
| Previous agent | None |
| Last commit agent | Codex agent; local Git branch `tnyx/ci/manual-pr-expo-preview` |
| Tracking / approval | Owner instruction: “to ye setup kare” (2026-11-15); scope clarified as manual PR selection, automatic cloud workflow, no local machine; preview channel only |
| Branch | `tnyx/ci/manual-pr-expo-preview` |
| Base SHA / inspected HEAD | `762095ff6c049c2e5c559eedfa56f768de7fcbb9` / see linked PR head |
| Platform and file scope | Expo iOS/Android updates config, EAS preview build profile, GitHub Actions and `.ai/` task handoff |
| Created / updated | 2026-11-15 |

## Required context

- [x] Root `AGENTS.md` read and live GitHub state checked
- [x] `.ai/current.md`, task template, readiness gate and post-merge playbook read
- [x] Existing GitHub workflow and Expo app config inspected
- [x] Expo project confirmed as `@tnyx-23/tnyx`, connected to `im-tnyx/Tio-Workspace`; EAS Workflows is unconfigured, with no update runtime or development builds visible
- [x] Expo SDK 58 Updates documentation checked; project ID read from Expo project details

## Approved scope / non-goals

- In scope: configure `expo-updates`, add a preview EAS build profile, and provide a GitHub `workflow_dispatch` workflow that accepts a PR number, validates an open same-repository PR targeting `main`, runs existing `npm run verify`, then publishes a preview update or starts a cloud preview build.
- In scope: update `.ai/current.md` and track the bounded approval and setup requirements here.
- In scope: ignore Expo/EAS generated packages and local signing credential files so they are not accidentally committed or uploaded from the repository.
- Out of scope: automatic production publish, EAS project/account changes, creating Expo access tokens, writing secrets, running a build or publishing an OTA update during this task, app features/Auth/database, PR merge.
- Approval source: owner’s written “to ye setup kare” instruction and preceding clarification.

## Durable decisions

- Manual workflow input is the PR number; GitHub does not provide a dynamic open-PR dropdown for `workflow_dispatch`.
- Only open PRs from this repository targeting `main` may run. The workflow checks and checks out the exact PR head SHA.
- Only the repository owner `im-tnyx` may dispatch it, and it accepts only owner-authored PRs; the job uses the `eas-preview` GitHub Environment secret scope.
- Checkout fetches full Git history because `npm run verify` checks against the immutable historical design-token baseline.
- Updates go to EAS branch/channel `pr-preview`. This workflow has no production publish option.
- `EXPO_TOKEN` is read from the `eas-preview` GitHub Environment secret. It is never stored in source.
- A compatible preview build must be installed once for QR-free OTA updates. Native/API changes require another build; iOS internal distribution may require device registration.

## Selected tools and references

- GitHub connector: live repository/PR state and branch operations.
- Expo dashboard, read-only: project ID and GitHub connection verified; no Expo settings changed.
- Expo docs: [GitHub Actions for EAS Update](https://docs.expo.dev/eas-update/github-actions/), [SDK 58 Updates package](https://docs.expo.dev/versions/v58.0.0/sdk/updates/), [runtime compatibility](https://docs.expo.dev/eas-update/runtime-versions/).

## Changed files

- `app.json`
- `package.json`
- `package-lock.json`
- `.gitignore`
- `eas.json`
- `.github/workflows/expo-pr-preview.yml`
- `.ai/current.md`
- `.ai/tasks/ci/local-20261115-manual-pr-expo-preview.md`

## Validation evidence

- `npm.cmd install --package-lock-only --ignore-scripts --save expo-updates@~58.0.22 --no-audit --no-fund --cache "$env:TEMP\tnyx-expo-npm-cache"` — completed; resolved SDK 58 dependency and lockfile without install scripts.
- Node `JSON.parse` for local `app.json`, `eas.json`, `package.json`, `package-lock.json` — passed.
- Python PyYAML parse of `.github/workflows/expo-pr-preview.yml` — passed.
- `git diff --check` — passed on tracked local changes before publishing; `.git/index` write was unavailable, so final staged check was not run.
- `npm run verify` and native builds — not run. Workflow will run existing verification when manually dispatched; no EAS build or update was triggered.
- Manual GitHub workflow has not run; it is not available from `main` until merge. The `eas-preview` environment and `EXPO_TOKEN` secret name are confirmed in GitHub UI; secret value was not inspected. The repository UI did not expose required-reviewer protection, so workflow dispatch and PR author are restricted to `im-tnyx`.
- `.gitignore` patterns cover Expo local state, generated APK/AAB/IPA files, and common local signing credential formats; tracked source and EAS project config remain included.
- The lockfile includes the SDK-matched `expo-updates` dependency so the repository's existing `npm ci` check remains reproducible.

## PR review evidence and findings

- Review status: `REVIEW_PENDING` until the final GitHub PR diff has a recorded reviewer assessment.
- Formal GitHub approval and merge authorization: not requested or granted.

## Handoff

**Next owner:** Repository owner for review/merge authorization and initial compatible preview app installation.

**Next authorized action:** Complete review and separately authorize merge. After merge, run **Expo PR preview** from Actions with a valid owner-authored PR number.

**Post-merge synchronization/archive needed:** Yes, after verified review and merge.
