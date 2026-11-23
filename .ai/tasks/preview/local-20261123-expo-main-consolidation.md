# Consolidate Expo Go preview onto main

| Field | Value |
|---|---|
| Status | Review pending. Labeled preview activation and legacy retirement pending |
| Implementation owner | Codex Cloud session for the consolidation task |
| Previous agent | See the separate [labeled preview proposal PR #39](https://github.com/im-tnyx/Tio-Workspace/pull/39) |
| Last commit agent | Codex Cloud. The consolidation PR's Commits tab records the reviewed SHA |
| Approval | Owner's Cloud-only consolidation request. Merge and legacy deletion have separate approval gates |
| Branch | `fix/consolidate-expo-preview` |
| Inspected main SHA | `716fb32061ffb6012d17eae9453c822a281fe6f1` |
| Scope | Expo Go preview workflows, validation scripts, tests and operational docs |

Follow [AGENTS.md](../../../AGENTS.md), [workflow rules](../../core/workflow-rules.md)
and the [rollout guide](../../../docs/28-LABELED-EXPO-PR-LIVE-PREVIEW.md).
GitHub connector and a separate Codex Cloud Git checkout were used to compare
live branches and run regression checks. The owner's Windows repository was
outside the execution environment.

## Remote audit

| Ref | Observed HEAD | Ahead / behind main | Merge base with main |
|---|---|---|---|
| `main` | `716fb32061ffb6012d17eae9453c822a281fe6f1` | 0 / 0 | `716fb32061ffb6012d17eae9453c822a281fe6f1` |
| `tnyx/expo-preview` | `b366ff856f0faad761ed7315530198cf72078861` | 8 / 56 | `6b0ec5b0413cf3a22c3c631368ac883f7f29d630` |
| `feat/expo-label-live-preview` | `da4ea526500f003fcf17da7132f68044f3486ec9` | 9 / 0 | `716fb32061ffb6012d17eae9453c822a281fe6f1` |

The legacy and feature refs share merge base
`6b0ec5b0413cf3a22c3c631368ac883f7f29d630` and have 8 and 65 unique commits,
respectively. All eight legacy commits were inspected.

| Legacy commit | Disposition |
|---|---|
| `d8cea24ede6b82a29b937cdeabe2b282251780b0` | Devcontainer, starter and legacy workflows are already in main via [PR #18](https://github.com/im-tnyx/Tio-Workspace/pull/18). Reuse the devcontainer and starter. Keep legacy automation through acceptance |
| `e762fe58f646c595bc323b74089bed0600ec58ff` | Token scoping and immutable sync already in main. Preserve both with the isolated environment and exact PR SHA |
| `c35410c6aff72acbe7fc989d41646368d93f1a9c` | Setup-era token status superseded by historical worker success. Keep environment scoping |
| `52efc7605ad8685febeedb86bd3c616dada318cc` | Setup-era access-control notes superseded by current ruleset and environment evidence |
| `9e0a8e28fd4cb0c646ab96ba973064edf076c092` | Metro tunnel readiness and generated Expo type ignores already in main |
| `162591305c32249dc52d74ba0af7f14430f642dc` | Merge reconciliation with guard baseline. Devcontainer and starter match main. Keep current guard and history |
| `6980df08b4a72efa38017b2ee2cb84a2614e818c` | Signed Expo Go tunnel support already in main's shared starter |
| `b366ff856f0faad761ed7315530198cf72078861` | Merge reconciliation with PR #21. Main has newer task and guard docs. Keep this SHA as the observed retirement baseline |

The devcontainer, both legacy workflows, starter and sync script have identical
Git content on audited main and legacy heads. Branch-specific dependencies are
in the signal, worker, sync script and operator docs. Archival references record
history. No branch-specific package or app config migration is required.

The [legacy push](https://github.com/im-tnyx/Tio-Workspace/actions/runs/43815555568)
and [trusted worker](https://github.com/im-tnyx/Tio-Workspace/actions/runs/43815573691)
historically succeeded. The owner previously reported opening the mock UI on a
phone. Stopped-state wake and post-push physical refresh remain unverified.
The legacy `expo-codespaces-trusted` environment currently allows only the exact
`main` branch. Environment secret names and Codespace inventory returned HTTP
403 to the Cloud GitHub integration. The new protected environment and label were
absent during audit. The existing EAS workflow uses its separate `eas-preview`
environment and was left intact.

## Review and verification

The proposal on PR #39 was inspected without changing its branch. The
consolidation uses exact Git trees instead of REST compare file pagination,
adds mode checks and fresh revalidation, and requires an explicit manual SHA.
It preserves the legacy path until approval and device acceptance.

The [Main Protection ruleset](https://github.com/im-tnyx/Tio-Workspace/rules/27218050)
requires the strict App-owned `Commit attribution guard` check (App ID
`5032971`), one approval, stale-review dismissal and resolved threads. Workflow
changes need the owner's documented exact-PR/head integrity authorization after
independent review. See the [guard guide](../../../docs/26-COMMIT-ATTRIBUTION-GUARD.md).
The PR records exact-head check outcomes and independent review evidence.

The [acceptance and retirement checklist](../../../docs/28-LABELED-EXPO-PR-LIVE-PREVIEW.md)
covers manual dispatch, push, stopped wake, device refresh, rejection tests,
backup tag and rollback. The legacy branch stays in service pending those gates.

[Task guide](../README.md) · [Agent contract](../../../AGENTS.md)
