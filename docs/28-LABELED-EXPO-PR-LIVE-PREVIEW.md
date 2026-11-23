# Tio-TNYX Expo Preview

[Tio-TNYX Expo Preview](../.github/workflows/expo-pr-preview.yml) is the Actions
entry for Expo Go and EAS previews of temporary, owner-authored PRs targeting
`main`. For a manual run choose the operation and platform, then enter the open
PR number and its full head SHA.

| Operation | Trigger | Result |
|---|---|---|
| `codespaces_live` | Owner adds `tnyx-preview`, pushes to that labeled PR, or dispatches manually | Serve the exact PR SHA via Expo Go in the dedicated Codespace. The platform selection does not limit the live tunnel |
| `publish_update` | Owner dispatch only | Publish the prebuilt JavaScript bundle to EAS branch `pr-preview`, for a compatible installed preview build |
| `build_preview` | Owner dispatch only when an installable build is needed | Queue the internal `preview` EAS profile for Android, iOS or both. The operator needs configured signing |

The [legacy Codespaces preview](27-EXPO-GO-CODESPACES-LIVE-PREVIEW.md) stays
available during rollout. The old standalone manual EAS entry is replaced by
this workflow. Preview policy tests run with the existing shell checks.

## Eligibility and trust

- One open, same-repository PR authored by `im-tnyx` may carry `tnyx-preview`.
  Drafts are eligible. Its head must descend from the current reviewed `main`.
  Update the feature branch when `main` advances and retry at the new head SHA.
- Eligible diffs change up to 100 regular, non-executable files under `src/`,
  `assets/`, `tests/`, `docs/` or `.ai/`, or the root Markdown files
  `README.md`, `DESIGN.md` and `CHANGELOG.md`. Hidden paths below those
  directories, nested package manifests, symlinks and submodules fail validation.
  A rename is checked at both paths. Workflow, root app/native configuration and
  dependency changes require a different verification path.
- Manual runs require the PR number and full owner-approved head SHA. The
  trusted `pull_request_target` entry admits only the owner's first-attempt
  `tnyx-preview` label event or a push to that labeled same-repository PR.
  Unrelated events schedule no preview runner. A feature branch can use the
  main-based workflow without carrying a separate push signal.
- Live validates the complete immutable Git tree diff, the environment's
  exact-`main` branch policy and current PR metadata before wake and SSH.
  Candidate Git objects are fetched as data. The Actions runner executes the
  trusted `main` checkout with read-only repository permissions and transfers
  the trusted script over SSH.
- EAS requires an open non-draft PR. The same path and mode checks apply, so
  native, dependency or Expo configuration changes first need their own reviewed
  change on `main`. OTA export runs without EAS credentials and the publish job
  accepts the prebuilt bundle from the same workflow run. EAS uses its pinned
  CLI, the TNYX project, its preview environment and its internal profile.
  App source is bundled or uploaded for preview. Candidate tests and lifecycle
  scripts are outside the protected runner's execution path.
- The Codespace is matched by API name, immutable numeric ID, owner, repo and
  display name. The sync refuses named branches other than `main`, dirty
  worktrees, ignored-file overwrite, dependency drift and nonmatching SHAs.
  Metro serves the candidate source in the isolated Codespace. Treat that
  Codespace and the test phone as preview environments with synthetic data.

## Enable after reviewed merge

1. Confirm the merge SHA on `main`, then create the `tnyx-preview` label if
   absent. Configure the `tnyx-expo-pr-preview-trusted` environment with a
   custom deployment branch policy allowing the exact branch `main` only.
   Apply the owner's reviewer policy. If approvals are required for the
   environment, each qualifying push waits for approval before wake.
2. Use an owner credential restricted to this repository and the minimum
   Codespaces read, start and SSH capabilities. Store it only as
   `PR_PREVIEW_CODESPACES_TOKEN` in that environment. Keep production,
   repository-wide and legacy preview credentials out of the new environment.
3. Create a **new dedicated Codespace** from reviewed `main`. Leave the editing
   Codespace and legacy preview Codespace in place. Set its display name to
   `TNYX PR Preview Only`. Set the environment variables
   `TNYX_PR_CODESPACE_NAME` and `TNYX_PR_CODESPACE_ID` to the new Codespace's API
   name and numeric ID. Check that Codespaces user/repository secrets are scoped
   away from this preview runtime. Keep only the Expo preview account login
   needed for the account-signed tunnel.
4. On a clean checkout of reviewed `main` inside the new Codespace, bootstrap
   the dependency marker and Expo login. Repeat the install on reviewed `main`
   if its dependency manifests change. A detached preview may require an
   owner-performed clean switch and fast-forward to reviewed `main` first.

   ```bash
   set -euo pipefail
   test "$(git branch --show-current)" = main
   test -z "$(git status --porcelain=v1 --untracked-files=normal)"
   git fetch --no-tags origin main
   test "$(git rev-parse HEAD)" = "$(git rev-parse FETCH_HEAD)"
   node scripts/start-codespace-expo.mjs --stop
   npm ci
   sha256sum package.json package-lock.json | sha256sum | cut -d ' ' -f 1 \
     > "$HOME/.cache/tnyx-expo-preview/dependency-manifests.sha256"
   npx expo login
   node scripts/start-codespace-expo.mjs
   ```

5. Open an owner-authored, source-only feature PR targeting current `main`.
   Applying `tnyx-preview` starts Live. Later owner pushes refresh the preview
   automatically. For an on-demand retry use **Tio-TNYX Expo Preview → Run
   workflow** on `main` and select `codespaces_live` with the exact PR SHA.
   Open TNYX from Expo Go Projects using the matching preview account and a
   compatible SDK 58 client. Keep Metro tunnel URLs private.
6. For EAS modes, configure the separate `eas-preview` GitHub environment with
   a custom deployment branch policy allowing exact `main` only. Add the
   project-scoped `PR_PREVIEW_EXPO_TOKEN` as an environment secret. Confirm the
   Expo preview project and remote signing for the chosen platform. CI fails
   closed when required signing is missing. Use the
   `preview` profile and verify that channel `pr-preview` is linked to branch
   `pr-preview` before testing an OTA. The publish step checks this route and
   rejects a preview branch shared with any other channel. The current mock app has no preview
   environment inputs for JavaScript export. EAS builds only queue from manual
   dispatch and may consume the owner's EAS quota.

## Live wake and Metro recovery

The wake step verifies Codespace identity on every poll. The exact GitHub CLI
already-running HTTP 409 response allows polling to continue. Availability
must still be confirmed. If the deadline expires, the run fails with
`START_TIMEOUT` and does not proceed to SSH.

The Codespace starter keeps a private `metro.json` record and a Linux
`flock` shared by preflight, checkout and startup. It clears a stale record
only after verifying the recorded PID and process group are absent and the
Metro port has no listener. A live process needs matching boot and process
identity plus listener ownership before it can be reused. PID reuse, a
foreign listener, changed state files or incomplete evidence stop the run.
Explicit stop and restart use Python 3 Linux pidfds for verified process
instances. If that support is unavailable, the stop fails closed.

Use a new dedicated Codespace for the merged flow. If a workspace still has
a legacy `metro.pid`, stop its old trusted starter before upgrading. The
new starter does not adopt a process from the old PID-only record.

## Acceptance before retiring the legacy path

| Scenario | Evidence to record |
|---|---|
| Manual labeled PR | Workflow run URL, input PR and exact SHA, policy checks, dedicated Codespace selection and SSH sync success |
| Label and owner push | Apply the label once, push new source, and record the Live run URLs and exact served SHAs |
| Unrelated activity | Non-preview labels, unlabeled PR pushes, forks and non-owner events do not enter Live or EAS jobs |
| EAS modes | Verify a requested OTA lands on `pr-preview` and a compatible install loads it. Verify a requested internal build queues the selected platform with existing signing |
| Stopped Codespace wake | Confirm dedicated Codespace is stopped, push eligible source, capture `Shutdown` followed by verified `Available` and successful sync. Record stale Metro recovery if its previous PID is gone |
| Real device refresh | Owner records device OS, Expo Go version, PR SHA, visible mock UI change and whether refresh required reopening or manual reload |
| Invalid or unauthorized PR | Missing label, stale SHA, second labeled PR or out-of-scope changes are rejected before wake or SSH. A non-owner dispatch skips the privileged path |
| Isolation | Confirm the old Codespace and tunnel remain usable and EAS preview configuration is intact |

A successful SSH command establishes the synced SHA and starter readiness.
Device acceptance requires the owner's observation. There is a short time
between the last API check and SSH. If the label or PR changes during that
interval, the worker can serve only the previously verified immutable SHA.
Label removal prevents future eligible runs. To stop a currently served
preview, use the dedicated Codespace controls.

## Retirement and rollback

After the replacement is merged, accepted and owner-approved:

1. Verify no open PR, Codespace operator or required automation depends on
   `tnyx/expo-preview`. Recheck repository refs, tracked references,
   workflow registrations, environment/branch rules and owner-side Codespace
   inventory. Preserve the existing Codespace and its environment secret.
2. Use a separately reviewed PR to remove the legacy push signal, trusted
   worker and branch sync script, and reconcile the legacy guide and sync
   references. Leave the shared Metro starter, devcontainer and unified preview
   workflow in place. Verify main and the replacement again after that merge.
3. Read the live legacy branch HEAD and create a permanent annotated backup tag,
   for example `backup/expo-preview-retired-20261123`, at that exact SHA. Verify
   the tag's resolved commit on GitHub and record the observed retirement SHA.
4. Obtain separate owner approval to delete `tnyx/expo-preview`. Recheck the
   branch and tag first. Verify the remote branch is gone, the tag still resolves
   to the intended commit and the new preview still passes. Keep the legacy
   Codespace and secrets until the owner decides their lifecycle separately.

For rollback before retirement, stop running the labeled preview and use the
existing branch workflow. After retirement, recover the exact legacy ref from
the verified backup tag and restore legacy workflow files through a reviewed
PR. Use the retained Codespace and environment for the legacy smoke check.
