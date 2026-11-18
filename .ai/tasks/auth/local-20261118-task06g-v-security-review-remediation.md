# Task 06G-V — PR #30 security review remediation and GitHub publication

| Field | Value |
|---|---|
| Status | Ready for Review (published to PR #30; threads left for independent confirmation) |
| Date | 2026-11-18 |
| PR | [#30](https://github.com/im-tnyx/Tio-Workspace/pull/30) branch `docs/task06g-local-auth-evidence` |
| Baseline HEAD | `9d57b7712b9e3d68f101e3e2e555ca1f4091f403` |
| Implementation owner | Cursor agent (Task 06G-V) |
| Previous agent | Task 06G-U publisher at `9d57b77` |
| Scope | Classifier/harness regressions + provenance addenda only |
| Product gate | AUTH-12 / AUTH-17 / AUTH-22 **BLOCKED**; managed-hosted Auth **NOT VERIFIED**; Production Auth **NO-GO** |

## Findings addressed

| Comment ID | Finding | Fix |
|---|---|---|
| 4609151597 | Wrong-identity hidden by 429/generic/timeout short-circuits | `classifyFiveWrong` evaluates proven wrong-identity before infrastructure short-circuits; `cooldown_bypass` still requires five recognized rejections |
| 4609116465 | Access-only correct session not probed for cooldown | Optional `correctProbe`; matching bearer after five recognized → `cooldown_bypass`; harness probes `/user` |
| 4609116473 | Recovery control wrong UUID reported INCONCLUSIVE | `classifyRecoveryControl` → confirmed wrong UUID **FAIL**; matching complete evidence **PASS** |
| 4609020483 | Stale Task 06G-T publication wording | Dated publication addendum; Task 06G-U similarly amended |

## Changed files

- `experiments/task06g/assertions.mjs`
- `experiments/task06g/assertions.test.mjs`
- `experiments/task06g/local-otp.mjs`
- `.ai/tasks/auth/local-20261118-task06g-t-purpose-crossing-classification.md`
- `.ai/tasks/auth/local-20261118-task06g-u-cooldown-identity-and-recovery-control.md`
- `.ai/tasks/auth/local-20261118-task06g-v-security-review-remediation.md`

## Validation (offline)

Recorded at publish time in the Task 06G-V commit message / final report. Docker / hosted Auth integration **NOT RUN**.

## Thread policy

Implementation replies may be posted with evidence. Threads are **not** auto-resolved by this agent. Formal GitHub approval and merge remain separate owner actions.
