#!/usr/bin/env bash
set -euo pipefail

expected='feat/phase1-1-expo-shell-20261114'
current="$(git branch --show-current)"

if [ "$current" != "$expected" ]; then
  printf 'Stopped: current branch is %s; expected %s.\n' "$current" "$expected"
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  printf 'Stopped: local changes exist. Save or safely stash them first.\n'
  git status --short
  exit 1
fi

git pull --ff-only origin "$expected"
printf 'TNYX updated to commit: '
git rev-parse --short HEAD
