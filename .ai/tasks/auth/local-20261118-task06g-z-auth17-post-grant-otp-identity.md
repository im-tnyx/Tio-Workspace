# Task 06G-Z — AUTH-17 post-grant and OTP session security evidence

| Field | Value |
|---|---|
| Status | Ready for Review (published to PR #30; threads left for independent confirmation) |
| Date | 2026-11-18 |
| PR | [#30](https://github.com/im-tnyx/Tio-Workspace/pull/30) branch `docs/task06g-local-auth-evidence` |
| Baseline HEAD | `29c3f5943ca3cc0cea09b8df699f3831a2949712` |
| Findings | `4610777923` (post-grant bearer proof), `4610777930` (OTP wrong-identity) |
| Implementation owner | Cursor agent (Task 06G-Z) |
| Previous agent | Task 06G-Y publisher at `29c3f59` |
| Scope | AUTH-17 classifier/harness post-grant probes + OTP session control only |
| Product gate | AUTH-12 / AUTH-17 / AUTH-22 **BLOCKED**; managed-hosted Auth **NOT VERIFIED**; Production Auth **NO-GO** |

## Finding A — post-mutation grant bearers

`oldGrant`/`newGrant` were not probed. Access-only new-password authentication could remain `INCONCLUSIVE` despite decisive mutation evidence.

**Fix:** harness probes each grant 1:1; `classifyPasswordMutation` accepts `oldGrantProbe`/`newGrantProbe`; matching access-only bearer can prove `password_mutation_bypass`; wrong-UUID complete/access-only bearers remain `identity_violation`.

## Finding B — OTP session wrong identity

`requireSession` + thrown identity mismatch became harness `ERROR`; expected-UUID body with wrong `/user` became `INCONCLUSIVE`.

**Fix:** `classifyOtpSessionControl` before `requireSession`; confirmed wrong UUID → `FAIL/identity_violation`; incomplete → `INCONCLUSIVE`; transport → `ERROR`; matching complete+probe → `PASS` then mutation continues.

## Preserved gates

- Docker Auth integration: **NOT RUN**
- Review `4609372956`: **BLOCKED — OWNER DECISION REQUIRED**
- Historical local AUTH-17 FAIL evidence unchanged; this improves classification only

## Thread policy

Reply to both comments with fixing SHA. Do not auto-resolve. Merge requires separate owner authorization.
