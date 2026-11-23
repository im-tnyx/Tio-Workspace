#!/usr/bin/env bash
# Streamed into a dedicated Codespace from trusted main. Never call a PR
# supplied sync script or copy privileged runner credentials to this process.
set -euo pipefail

readonly target_sha="${1:-}"
readonly trusted_sha="${2:-}"
readonly project_root="/workspaces/Tio-Workspace"
readonly expected_origin="https://github.com/im-tnyx/Tio-Workspace"

if [[ ! "$target_sha" =~ ^[0-9a-f]{40}$ || ! "$trusted_sha" =~ ^[0-9a-f]{40}$ ]]; then
  printf 'Refusing preview: expected immutable 40-character head and main SHAs.\n' >&2
  exit 1
fi

cd "$project_root"
if [[ "$(git rev-parse --show-toplevel)" != "$project_root" ]]; then
  printf 'Refusing preview: unexpected repository worktree.\n' >&2
  exit 1
fi

origin="$(git remote get-url origin)"
origin="${origin%.git}"
if [[ "$origin" != "$expected_origin" &&
      "$origin" != "git@github.com:im-tnyx/Tio-Workspace" &&
      "$origin" != "ssh://git@github.com/im-tnyx/Tio-Workspace" ]]; then
  printf 'Refusing preview: origin does not match Tio-Workspace.\n' >&2
  exit 1
fi

active_branch="$(git branch --show-current)"
if [[ -n "$active_branch" && "$active_branch" != "main" ]]; then
  printf 'Refusing preview: expected a dedicated main-based or detached preview worktree, found %s.\n' "$active_branch" >&2
  exit 1
fi

require_clean_worktree() {
  local worktree_status
  worktree_status="$(git status --porcelain=v1 --untracked-files=normal)"
  if [[ -n "$worktree_status" ]]; then
    printf 'Refusing preview: dedicated Codespace has uncommitted or untracked work.\n' >&2
    exit 1
  fi
}
require_clean_worktree

git -c core.hooksPath=/dev/null fetch --no-tags --no-recurse-submodules origin "$target_sha"
if [[ "$(git rev-parse 'FETCH_HEAD^{commit}')" != "$target_sha" ]]; then
  printf 'Refusing preview: fetched commit differs from immutable PR SHA.\n' >&2
  exit 1
fi

# Validate the trusted starter and dependency manifests before changing files.
git merge-base --is-ancestor "$trusted_sha" "$target_sha"
git diff --quiet "$trusted_sha" "$target_sha" -- scripts/start-codespace-expo.mjs package.json package-lock.json
if ! git diff --quiet HEAD "$trusted_sha" -- package.json package-lock.json; then
  printf 'Refusing preview: reviewed main has different dependency manifests.\n' >&2
  exit 1
fi

readonly dependency_marker="${HOME}/.cache/tnyx-expo-preview/dependency-manifests.sha256"
dependency_hash="$(sha256sum package.json package-lock.json | sha256sum | cut -d ' ' -f 1)"
if [[ ! -x node_modules/.bin/expo || ! -f "$dependency_marker" || "$(<"$dependency_marker")" != "$dependency_hash" ]]; then
  printf 'Refusing preview: bootstrap dependencies for the reviewed main lockfile first.\n' >&2
  exit 1
fi

if [[ -n "$active_branch" || "$(git rev-parse HEAD)" != "$target_sha" ]]; then
  git -c core.hooksPath=/dev/null switch --detach --no-overwrite-ignore --no-recurse-submodules "$target_sha"
fi
test "$(git rev-parse HEAD)" = "$target_sha"
require_clean_worktree

node scripts/start-codespace-expo.mjs
printf 'Dedicated worktree synced to %s and Expo tunnel is ready.\n' "$target_sha"
