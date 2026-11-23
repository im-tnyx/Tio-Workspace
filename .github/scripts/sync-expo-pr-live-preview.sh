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

git -c core.hooksPath=/dev/null fetch --no-tags --no-recurse-submodules origin "$target_sha"
if [[ "$(git rev-parse 'FETCH_HEAD^{commit}')" != "$target_sha" ]]; then
  printf 'Refusing preview: fetched commit differs from immutable PR SHA.\n' >&2
  exit 1
fi

# Load the validated main programs before the checkout. The starter holds
# the local ownership lock through preflight, checkout and Metro reuse/start.
readonly runtime_files=(
  scripts/start-codespace-expo.mjs
  scripts/codespace-metro-ownership.mjs
  scripts/stop-owned-metro.py
)
git merge-base --is-ancestor "$trusted_sha" "$target_sha"
git diff --quiet "$trusted_sha" "$target_sha" -- "${runtime_files[@]}" package.json package-lock.json
runtime_dir="$(mktemp -d)"
trap 'rm -rf -- "$runtime_dir"' EXIT
for file in "${runtime_files[@]}"; do
  git show "$trusted_sha:$file" > "$runtime_dir/${file##*/}"
done

node "$runtime_dir/start-codespace-expo.mjs" --sync "$target_sha" "$trusted_sha"
printf 'Dedicated worktree synced to %s and Expo tunnel is ready.\n' "$target_sha"
