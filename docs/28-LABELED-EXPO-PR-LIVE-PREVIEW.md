# Expo Go previews for labeled pull requests

The TNYX Expo Go preview serves temporary, owner-authored pull requests targeting
`main`. It uses the existing mock shell, Metro starter and Expo Go tunnel. The
[legacy Codespaces preview](27-EXPO-GO-CODESPACES-LIVE-PREVIEW.md) stays active
through acceptance. The [manual EAS preview](../.github/workflows/expo-pr-preview.yml)
keeps its own workflow and credentials.

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
- Manual runs require the PR number and full owner-approved head SHA. Automatic
  runs require a successful first-attempt owner push signal at the current
  labeled PR head. The feature branch must contain the signal from `main`.
- The default-branch worker verifies metadata and a complete immutable Git tree
  diff, checks the environment's exact-`main` branch policy, and revalidates
  eligibility before wake and before SSH. Candidate Git objects are fetched as
  data. The Actions runner executes the trusted `main` checkout with read-only
  repository permissions and transfers the trusted script over SSH.
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
   mkdir -p "$HOME/.cache/tnyx-expo-preview"
   sha256sum package.json package-lock.json | sha256sum | cut -d ' ' -f 1 \
     > "$HOME/.cache/tnyx-expo-preview/dependency-manifests.sha256"
   npx expo login
   node scripts/start-codespace-expo.mjs
   ```

5. Open an owner-authored, source-only feature PR targeting current `main`.
   Apply `tnyx-preview` to that PR. In Actions, run **TNYX labeled PR Expo Go
   preview** from `main` with its PR number and exact SHA. Later owner pushes
   to that PR branch trigger the signal and trusted worker. Open TNYX from
   Expo Go Projects using the matching preview account and a compatible SDK
   58 client. Metro tunnel URLs should stay private.

## Acceptance before retiring the legacy path

| Scenario | Evidence to record |
|---|---|
| Manual labeled PR | Workflow run URL, input PR and exact SHA, policy checks, dedicated Codespace selection and SSH sync success |
| Owner push | Push signal and worker run URLs, exact new head SHA and successful sync |
| Stopped Codespace wake | Confirm dedicated Codespace is stopped, push eligible source, capture initial `Shutdown` followed by `Available` and successful sync |
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
   references. Leave the shared Metro starter, devcontainer and manual EAS
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
