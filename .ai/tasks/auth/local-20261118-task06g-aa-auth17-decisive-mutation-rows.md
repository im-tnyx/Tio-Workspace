# Task 06G-AA — AUTH-17 decisive mutation evidence and complete report rows

| Field | Value |
|---|---|
| Status | Ready for Review (published to PR #30; threads left for independent confirmation) |
| Date | 2026-11-18 |
| PR | [#30](https://github.com/im-tnyx/Tio-Workspace/pull/30) branch `docs/task06g-local-auth-evidence` |
| Baseline HEAD | `bc03e583c9ce65e125335f9de7fda54d8aa6e1b5` |
| Findings | `4611386086` (mutation bypass gated on old rejection), `4610938579` (OTP abort omits mutation row) |
| Implementation owner | Cursor agent (Task 06G-AA) |
| Previous agent | Task 06G-Z publisher at `bc03e58` |
| Scope | AUTH-17 classifier precedence + OTP abort reporting only |
| Product gate | AUTH-12 / AUTH-17 / AUTH-22 **BLOCKED**; managed-hosted Auth **NOT VERIFIED**; Production Auth **NO-GO** |

## Finding A

`password_mutation_bypass` no longer requires `oldRejected`. After baseline control, `update.status === 200` plus independently authenticated new-password evidence (complete session or access-only matching bearer) is decisive FAIL, even when old grant still works, times out, or returns 429/503.

## Finding B

`planAuth17OtpControlAbort()` ensures every non-PASS OTP control emits exactly one `AUTH17_OTP_SESSION` and one `AUTH17_PASSWORD_MUTATION` row with `mutation=NOT TESTED` (ERROR / INCONCLUSIVE / identity FAIL). Valid OTP PASS continues the mutation experiment.

## Preserved gates

- Docker Auth integration: **NOT RUN**
- Review `4609372956`: **BLOCKED — OWNER DECISION REQUIRED**
- Historical local AUTH-17 FAIL evidence unchanged

## Thread policy

Reply to both comments with fixing SHA. Do not auto-resolve. Merge requires separate owner authorization.
