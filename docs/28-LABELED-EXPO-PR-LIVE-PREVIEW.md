# TNYX labeled Expo Go PR live preview (proposed)

**Status:** Feature branch only, not merged or activated. Live Codespace and physical-device behavior **not verified** by this implementation. The owner reports an existing on-device Expo Go preview is already working; this proposal does not replace that observation.

## Purpose and compatibility

This design adds PR-selectable Expo Go development previews, borrowing immutable-SHA and dedicated Codespace controls from Tio-Money while retaining Tio-Workspace project identity and the existing working preview.

- Existing branch preview preserved: `tnyx/expo-preview` -> `Expo preview push signal` -> `Expo Go Codespaces preview worker`.
- New secretless signal: `.github/workflows/expo-pr-live-push-signal.yml` on non-main, non-legacy-preview branch pushes.
- New trusted-main worker: `.github/workflows/expo-pr-live-preview.yml`. Only owner may start manual `workflow_dispatch`; automatic follows a successful owner push signal.
- Eligible PR: owner-authored, same-repository, main-bound, **exactly one** open PR with label `tnyx-preview`. Draft PRs may be previewed. Only `src/`, `assets/`, `tests/`, `docs/`, `.ai/` and a narrow root Markdown allowlist qualify. Workflow, scripts, native, package, secrets, app and EAS config are excluded.
- Immutable base/head snapshot and changed-path comparison; PR recheck, exact-SHA checkout. No untrusted PR script/source executes on the privileged Actions runner.
- The dedicated preview Codespace must match exact name, numeric ID, display name, repository and owner before wake. The trusted-main script is streamed over SSH, checks a clean worktree, switches to selected detached PR SHA and invokes the existing Expo Go starter.
- No EAS Update, EAS Build, production deployment, Supabase change or secret/config setting mutation by this branch.

**Why not immediately merge all operations into one workflow?** The existing EAS workflow is a separate credential-bearing surface; fusing unreviewed PR execution with Codespaces activation enlarges trust boundaries. This first slice adds labeled live preview while retaining EAS. A second separately reviewed slice may unify the manual form after EAS isolation is audited.

## Required setup ONLY after independent review and authorized merge

1. Verify exact-head CI/security review; obtain owner merge approval. Create GitHub label `tnyx-preview` if absent.
2. Configure GitHub Environment `tnyx-expo-pr-preview-trusted` with deployment branch restricted to exact `main`. Add only the needed environment secret `CODESPACES_TOKEN` with least Codespaces list/start/SSH privileges. Do not reuse Tio-Money, Supabase, Expo or production credentials.
3. Create a **separate preview-only Codespace** from reviewed Tio-Workspace `main`. It must NOT be the editing Codespace or the existing `tnyx/expo-preview` Codespace. Set display name to `TNYX PR Preview Only`. Bootstrap locked npm dependencies and Expo CLI login there; confirm the intended TNYX account/project.
4. Set nonsecret Environment variables `TNYX_PR_CODESPACE_NAME` (API name) and `TNYX_PR_CODESPACE_ID` (immutable numeric API ID). Both must match exactly.
5. Choose an owner-authored, source-only PR targeting `main`; add `tnyx-preview` to that PR and remove it from every other open PR. Use **Actions -> TNYX labeled PR Expo Go preview -> Run workflow** from trusted `main` with positive integer PR number. Draft PRs are allowed. Eligible later owner pushes will automatically trigger the secretless signal and trusted worker.
6. In physical Expo Go, record device OS/version, Expo Go version, PR SHA, tunnel, actual UI change/refresh and manual reload if needed. A stopped Codespace may require reopening Expo Go after a verified wake.

## Security boundaries and limitations

- **Not always-on:** Codespaces can idle-stop; tapping the phone alone does not wake one. A push or owner dispatch does.
- **Not EAS:** Expo Go Metro/tunnel does not prove an installable APK/IPA or OTA Update.
- **Not guaranteed Fast Refresh:** Metro may observe a PR source checkout but manual reload may be required. No device, tunnel, source-map or idle-resume verification has been executed for this new implementation.
- **No workspace takeover:** Dirty worktrees and named non-main branches fail closed; no reset/stash/clean/force branch change.
- **No unauthorized paths:** Native/config/dependency/workflow/tooling PR changes are denied. PR SHA/base/label races are rechecked.
- **No token forwarding:** The Codespaces token stays in trusted Actions steps; Expo login credentials already inside the dedicated Codespace must still be protected because PR app source executes there.
- **Review questions:** Validate Codespaces API shape (`owner`, `display_name`, numeric `id`), SHA compare completeness, workflow event/checkout context, SSH stdin behavior, real Expo Go source-map/HMR and stopped Codespace behavior. These require additional checks and separate live authorization.
- **Rollout gating:** Before retiring the working branch-preview, independently verify a labeled PR manual run, a subsequent owner push, live Android/iPhone refresh and failure cases. Legacy preview remains active until separate approval.

## Checks and rollback

Run focused offline tests: `node --test tests/expo-live-preview.test.mjs`. Verify GitHub Actions YAML semantics and exact-head CI on this branch. Request independent security review before merge.

Rollback: do not merge this branch, or revert only its newly added files via a separate authorized PR. Never delete the existing Codespace, branch preview, tokens or customer data as a side effect.
