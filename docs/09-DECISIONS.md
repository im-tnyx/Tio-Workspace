<div align="center">

# 📝 Architecture Decisions
**Agreed intentions, proposed choices and open questions**

[← Docs hub](00-INDEX.md) · [🏠 Home](../README.md) · [🎨 Design](../DESIGN.md)

</div>

> [!NOTE]
> **Document status:** Planning / proposed specification. Product implementation has not started.

---

**Status as of 2026-11-14:** Initial intentions derive from the product brief; ADR-009 and ADR-010 record owner-selected architecture/tooling only. **No deployment or Phase 1 implementation is approved yet**.

## Agreed product intentions
| ID | Decision | Reason / consequence |
|---|---|---|
| ADR-001 | Build iOS + Android using React Native with Expo | Single shared mobile codebase |
| ADR-002 | Account registration and sign-in are required | Persistent user identity |
| ADR-003 | Normal app restarts must not force login | Familiar persistent-session experience |
| ADR-004 | Local-first workout records | Offline reliability and privacy |
| ADR-005 | No default Supabase workout-data upload | Clear local storage boundary |
| ADR-006 | AI provider keys stay behind server-side Edge Functions | Client bundles are not secret storage |
| ADR-007 | Personal cloud backup is optional; future online DB sync separately opt-in | User control |
| ADR-008 | Plan and document everything before implementation | User's explicit development order |
| ADR-009 | **Feature-first Modular Monolith v2.1**: `src/app/` routes/providers, `src/features/*` business-owned modules, `src/platform/*` technical adapters, non-business `src/shared/*`, optional `src/bootstrap/`; feature `domain/` interfaces and `data/` implementations with optional complex use cases | **Chosen by owner on 2026-11-13** as the final source-layout architecture. No package-per-feature; see [canonical boundaries](10-REPOSITORY-STRUCTURE.md). Does **not** approve Phase 1 coding or pending security choices. |
| ADR-010 | **Owner-selected local database technology stack:** Expo SQLite as on-device database, Drizzle ORM + Drizzle Kit for typed SQLite access and versioned generated migrations, and native SQLCipher for database-at-rest encryption | **Owner confirmed on 2026-11-14** after [PR #7](https://github.com/im-tnyx/Tio-Workspace/pull/7). This approves **technology selection only**, subject to native Android/iPhone compatibility, key lifecycle, migration/recovery security review and actual testing. It does **not** approve D03–D07 policies, app initialization, package installation, migration execution, or Phase 1. See [database contract](03-LOCAL-DATA-MODEL.md). |

**Decision boundaries:** ADR-009 approves source organization and dependency rules; ADR-010 approves the **local database technology choices**, not their security implementation or demonstrated compatibility. Auth/session details, per-account key custody, native SQLCipher verification, migration/rollback behaviour, backups, AI, sync, CI and **all Phase 1 implementation** remain subject to separate approval/evidence. A merged documentation PR is not a deployment or build approval.

## Engineering proposals and feasibility checks — not blanket implementation approval
| ID | Proposal | Validation needed |
|---|---|---|
| PROP-001 | Supabase Auth for accounts, Expo SecureStore-backed secure session adapter | Refresh, offline and logout tests |
| PROP-002 | **Tooling selected by ADR-010**: Expo SQLite + native SQLCipher; security design remains open | Prove cipher availability, key lifecycle, account isolation and performance on Android/iOS |
| PROP-003 | Separate per-account encrypted SQLite databases | User switching, cleanup and restore |
| PROP-004 | Repository interfaces from the beginning | Future sync integration without rewriting UI |
| PROP-005 | Versioned encrypted backup format and user-held recovery method | Real cross-device recovery tests |
| PROP-006 | Google Drive appDataFolder | OAuth scope, user consent and restore UX |
| PROP-007 | iCloud native backup integration or file export/import fallback | Expo/iOS feasibility and entitlements |
| PROP-008 | **Tooling selected by ADR-010**: Drizzle ORM + Drizzle Kit for local schema/queries and bundled versioned SQLite migrations; **implementation not authorized** | Validate Expo/Drizzle compatibility, account-scoped journal, SQLCipher unlock-first sequence, failure recovery and Android/iPhone offline upgrades. See [local data model](03-LOCAL-DATA-MODEL.md). |

## Open product decisions (not blocking documentation)
1. Final branding and app package identifiers.
2. Signup options: email/password only, or Google/Apple auth as well.
3. Should optional PIN/biometrics protect local data on app open?
4. How should account deletion differ from logout and delete-local-data?
5. Backup recovery choice: passphrase, recovery key, or another auditable design.
6. iCloud integration route, feasibility and backup frequency under OS restrictions.
7. AI vendor, model, quotas, user consent copy and costs.
8. Scope of exercise catalog and any third-party licensing.
9. Whether cloud sync is free/paid and how existing cloud data is deleted on disable.
10. Minimal analytics policy and opt-in consent.

## Phase 0 decision-review package (recommendations pending)

The [Phase 0 Decision Review Pack](17-PHASE-0-DECISION-PACK.md) tracks **D13 as owner-selected tooling**, while D01–D12 and native/security verification remain pending, informed by the [offline session state machine](18-OFFLINE-SESSION-STATE-MACHINE.md), [encrypted backup recovery](19-BACKUP-RECOVERY-STRATEGY.md), [MVP UX flows](20-MVP-UX-FLOWS.md) and [Phase 1 readiness checklist](21-PHASE-1-READINESS.md). Other recommendations remain **proposals only**; ADR-010 records the newly selected stack, while the remaining owner decisions are tracked in [GitHub issue #2](https://github.com/im-tnyx/Tio-Workspace/issues/2).

Important: Offline access to already-verified local data cannot guarantee real-time enforcement of a remote session revocation while the device has no network. This trade-off must receive explicit owner review. Local database encryption keys and portable backup recovery secrets must also be considered separately.

## Change control
When a decision changes, update the relevant requirements/architecture/security/test documents first; log the change here with rationale and approval. Implementation starts only after Phase 0 review.

---

[← Documentation hub](00-INDEX.md) · [ADR template →](16-ADR-TEMPLATE.md)
