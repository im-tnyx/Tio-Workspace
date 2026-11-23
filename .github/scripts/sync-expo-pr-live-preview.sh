#!/usr/bin/env bash
# Streamed into a dedicated Codespace from trusted main. Never call a PR
# supplied sync script or copy privileged runner credentials to this process.
set -euo pipefail

readonly target_sha="${1:-}"
readonly project_root="/workspaces/Tio-Workspace"
readonly expected_origin="https://github.com/im-tnyx/Tio-Workspace"

if [[ ! "$target_sha" =~ ^[0-9a-f]{40}$ ]]; then
  printf 'Refusing preview: expected an immutable 40-character SHA.\n' >&2
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

if [[ -n "$(git status --porcelain=v1 --untracked-files=normal)" ]]; then
  printf 'Refusing preview: dedicated Codespace has uncommitted or untracked work.\n' >&2
  exit 1
fi

git fetch --no-tags origin "$target_sha"
if [[ "$(git rev-parse 'FETCH_HEAD^{commit}')" != "$target_sha" ]]; then
  printf 'Refusing preview: fetched commit differs from immutable PR SHA.\n' >&2
  exit 1
fi

if [[ "$(git rev-parse HEAD)" != "$target_sha" ]]; then
  git switch --detach "$target_sha"
fi
if [[ "$(git rev-parse HEAD)" != "$target_sha" ]]; then
  printf 'Refusing preview: worktree failed exact-SHA verification.\n' >&2
  exit 1
fi

# The source-only PR allowlist forbids package/config/script changes, so
# dependencies and starter come from reviewed main. Never run PR npm hooks.
if [[ ! -x node_modules/.bin/expo ]]; then
  printf 'Refusing preview: first bootstrap must install locked dependencies inside the isolated Codespace.\n' >&2
  exit 1
fi

node scripts/start-codespace-expo.mjs
printf 'Dedicated Expo Go Codespace now serves PR commit %s.\n' "$target_sha"
