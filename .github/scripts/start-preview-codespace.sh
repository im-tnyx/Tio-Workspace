#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" != --poll ]]; then
  if timeout --kill-after=5s 600s bash "$0" --poll; then
    exit 0
  else
    status=$?
    if [[ "$status" == 124 || "$status" == 137 ]]; then
      echo '::error title=START_TIMEOUT::The dedicated preview Codespace did not become Available within 10 minutes.'
    fi
    exit "$status"
  fi
fi

[[ -n "$GH_TOKEN" && "$CODESPACE_NAME" =~ ^[a-z0-9-]+$ && "$CODESPACE_ID" =~ ^[1-9][0-9]*$ ]] || {
  echo '::error::Configure the dedicated Codespace ID, name and environment token.'
  exit 1
}
endpoint="/user/codespaces/$CODESPACE_NAME"

read_state() {
  gh api "$endpoint" | jq -er --arg name "$CODESPACE_NAME" --arg id "$CODESPACE_ID" '
    select(.name == $name and (.id | tostring) == $id and
      .display_name == "TNYX PR Preview Only" and
      .repository.full_name == "im-tnyx/Tio-Workspace" and .owner.login == "im-tnyx") |
    .state | select(type == "string" and test("^[A-Za-z]+$"))'
}

state="$(read_state)"
echo "Initial Codespace state: $state"
case "$state" in
  Shutdown)
    if start_error="$(gh api --method POST "$endpoint/start" 2>&1 >/dev/null)"; then
      :
    elif [[ "$start_error" == 'gh: The codespace is already running (HTTP 409)' ]]; then
      echo 'Codespace start raced with another request. Verifying availability.'
    else
      echo '::error::Dedicated Codespace start request failed.'
      exit 1
    fi
    ;;
  Available|Starting) ;;
  *) echo '::error::Dedicated Codespace is in an unexpected state.'; exit 1 ;;
esac

while :; do
  state="$(read_state)"
  case "$state" in
    Available) echo "name=$CODESPACE_NAME" >> "$GITHUB_OUTPUT"; exit 0 ;;
    Deleted|Failed) echo '::error::Dedicated Codespace cannot be started.'; exit 1 ;;
  esac
  sleep 5
done
