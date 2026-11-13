# Architecture decision register

**Status as of 2026-11-13:** Intentions below are derived from the product brief; **no deployment or implementation is approved yet**.

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

## Engineering proposals — validate during implementation
| ID | Proposal | Validation needed |
|---|---|---|
| PROP-001 | Supabase Auth for accounts, Expo SecureStore-backed secure session adapter | Refresh, offline and logout tests |
| PROP-002 | Expo SQLite with SQLCipher in native builds | Build feasibility, key management, performance |
| PROP-003 | Separate per-account encrypted SQLite databases | User switching, cleanup and restore |
| PROP-004 | Repository interfaces from the beginning | Future sync integration without rewriting UI |
| PROP-005 | Versioned encrypted backup format and user-held recovery method | Real cross-device recovery tests |
| PROP-006 | Google Drive appDataFolder | OAuth scope, user consent and restore UX |
| PROP-007 | iCloud native backup integration or file export/import fallback | Expo/iOS feasibility and entitlements |

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

## Change control
When a decision changes, update the relevant requirements/architecture/security/test documents first; log the change here with rationale and approval. Implementation starts only after Phase 0 review.
