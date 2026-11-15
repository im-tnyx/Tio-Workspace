# Manual GitHub PR preview build and OTA update

| Field | Value |
|---|---|
| Status | Review complete for code head; merge authorization pending |
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
- Checkout fetches full history and explicitly fetches the immutable design-token baseline SHA because its original feature branch was deleted; the baseline itself is not changed.
- Updates go to EAS branch/channel `pr-preview`. This workflow has no production publish option.
- `EXPO_TOKEN` is read from the `eas-preview` GitHub Environment secret. It is never stored in source.
- A compatible preview build must be installed once for QR-free OTA updates. Native/API changes require another build; iOS internal distribution may require device registration.
- OTA runtime compatibility uses Expo's `fingerprint` policy so native dependency/config changes get a different runtime automatically. The workflow additionally blocks `publish_update` when the selected PR changes app config, package manifests/lockfiles, native directories or Expo config plugins; use `build_preview` for that PR and install the resulting binary first.
- `build_preview` signing credentials must already exist in EAS for every selected platform; the GitHub workflow does not generate or import signing credentials.
- Read-only Expo dashboard check on 2026-11-15 confirmed an Android `com.tnyx.tio` application identifier with a default EAS build credential and JKS keystore. This supports the Android preview build without a local credential bootstrap.
- The same dashboard showed no iOS signing credentials, although `app.json` already defines `ios.bundleIdentifier`. Do not select `ios` or `all` for `build_preview` until iOS credentials are configured. No credential values, aliases, or fingerprints were copied.

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
- `.github/workflows/phase1-shell.yml`
- `scripts/check-design-tokens.cjs`
- `.ai/current.md`
- `.ai/tasks/ci/local-20261115-manual-pr-expo-preview.md`

## Validation evidence

- `npm.cmd install --package-lock-only --ignore-scripts --save expo-updates@~58.0.22 --no-audit --no-fund --cache "$env:TEMP\tnyx-expo-npm-cache"` — completed; resolved SDK 58 dependency and lockfile without install scripts.
- Node `JSON.parse` for local `app.json`, `eas.json`, `package.json`, `package-lock.json` — passed.
- Python PyYAML parse of `.github/workflows/expo-pr-preview.yml` — passed.
- `git diff --check` and `git show --check` — passed on the current local changes/commit.
- `npm run verify` — passed locally after fetching the immutable baseline SHA; 22 contract tests passed. Native builds and EAS build/update were not run.
- Current review-fix working tree: both workflow YAML files and `app.json` parse successfully; `git diff --check` passed; `npm run verify` passed (token self-test, baseline token guard, TypeScript, ESLint, and 22 tests). GitHub exact-head validation is pending.
- Manual GitHub workflow has not run; it is not available from `main` until merge. The `eas-preview` environment and `EXPO_TOKEN` secret name are confirmed in GitHub UI; secret value was not inspected. The repository UI did not expose required-reviewer protection, so workflow dispatch and PR author are restricted to `im-tnyx`.
- Expo dashboard credential readiness was checked read-only: Android signing credential exists for `com.tnyx.tio`; iOS signing is not configured. Android `build_preview` can use the EAS-managed credential. iOS/all builds remain unavailable until their signing credentials are configured. No build was started during this check.
- `.gitignore` patterns cover Expo local state, generated APK/AAB/IPA files, and common local signing credential formats; tracked source and EAS project config remain included.
- The lockfile includes the SDK-matched `expo-updates` dependency so the repository's existing `npm ci` check remains reproducible.
- GitHub `Phase 1.1 shell checks` passed on code head `429402858d932f35802fdd825c0696e3087cc269`: [run 43730420533](https://github.com/im-tnyx/Tio-Workspace/actions/runs/43730420533). Earlier run [43729401576](https://github.com/im-tnyx/Tio-Workspace/actions/runs/43729401576) exposed that `fetch-depth: 0` did not fetch the deleted source branch's baseline; direct baseline-SHA fetch plus non-persisted checkout credentials fixed it.

## PR review evidence and findings

- Codex GitHub review [#5911333001](https://github.com/im-tnyx/Tio-Workspace/pull/15#pullrequestreview-5911333001) reviewed head `d90bbc39fcf2b14e0c5412f386da0c004a31777a` and found the token baseline unavailable. `fetch-depth: 0` was added in commit `3e0e611ae11a186bc0328cd3a51f82a121b726d8`, but later exact-head CI proved that alone was insufficient because the baseline's original feature branch had been deleted. Both CI workflows now fetch the immutable baseline SHA directly using step-scoped `GITHUB_TOKEN`; the baseline commit itself remains unchanged.
- Codex GitHub review [#5911380555](https://github.com/im-tnyx/Tio-Workspace/pull/15#pullrequestreview-5911380555) reviewed head `e9f6608b5cbfaabb61757674df07c1cac600c826` and requested a documented/verified signing-credential prerequisite. Android credentials have now been verified in the Expo dashboard and the missing iOS setup is explicitly documented.
- Follow-up Codex review [comment](https://github.com/im-tnyx/Tio-Workspace/pull/15#issuecomment-6896955015) reviewed code head `429402858d932f35802fdd825c0696e3087cc269` and reported no major issues. Both then-open inline findings were answered and resolved on that head. This was a Codex comment, not formal GitHub `APPROVED`.
- Review [#5911554932](https://github.com/im-tnyx/Tio-Workspace/pull/15#pullrequestreview-5911554932) found that `appVersion` could permit an OTA update with incompatible native code. The fix changes runtime versioning to `fingerprint` and blocks `publish_update` for PR diffs that touch native-affecting config/dependency/plugin/platform paths. Local verification passed; exact-head GitHub validation and fresh review are pending.
- Formal GitHub approval and action-specific merge authorization are not recorded.

## Handoff

**Next owner:** Repository owner for review/merge authorization and initial compatible preview app installation.

**Next authorized action:** Complete review and separately authorize merge. After merge, run **Expo PR preview** from Actions with a valid owner-authored PR number.

**Post-merge synchronization/archive needed:** Yes, after verified review and merge.
