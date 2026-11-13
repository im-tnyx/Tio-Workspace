# 🛡 Security policy — Tio Workspace

[🏠 README](README.md) · [🔐 Auth requirements](docs/04-AUTH-AND-SECURITY.md) · [🧯 Threat model](docs/14-THREAT-MODEL.md)

> [!WARNING]
> **Planning stage:** Tio has no released app, production backend or active security program in this repository. This document defines the intended reporting and engineering approach.

## Reporting a vulnerability

For a future discovered vulnerability, **do not** post exploits, keys, user data or sensitive reproduction steps in a public issue. Prefer GitHub's **private vulnerability reporting** feature if it is enabled for this repository. If private reporting is not available, contact the repository owner through a private, trusted channel; never expose confidential details in an open ticket.

No response-time SLA or bug-bounty program is promised. Coordinate any disclosure with the maintainer.

## Security baseline

| Area | Requirement |
|---|---|
| Auth | Supabase Auth with persistent sessions and safe refresh/revalidation |
| Workout storage | Per-user access isolation and validated on-device encryption where supported |
| Secrets | AI provider keys and Supabase secret/service-role credentials only server-side |
| AI | Authenticated Edge Function, limited data sharing, validation, rate limits |
| Backup | Authenticated encrypted export with a cross-device recovery method |
| Future cloud sync | Explicit opt-in, owner-scoped RLS, least privilege |
| Logs | Avoid private workout content, access tokens, recovery keys and API secrets |
| Account lifecycle | Differentiate logout, local erase, remote account deletion and restore |

## Developer precautions
Never push `.env` secrets, mobile credentials, raw workout exports or personal data. If a secret leaks, rotate or revoke it immediately at the provider; simply deleting the Git line is insufficient. Review GitHub and provider history/logs for exposure.

## Supported versions
No versions released yet. Once app releases exist, maintainers must list which versions receive security fixes.

## References
[Authentication & security spec](docs/04-AUTH-AND-SECURITY.md) · [Testing](docs/08-TEST-PLAN.md) · [Threat model](docs/14-THREAT-MODEL.md)
