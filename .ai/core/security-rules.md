# 🛡 Security and privacy rules

- Supabase **publishable** key can be shipped in the app; Supabase secret/service-role and AI vendor keys **must not**.
- Authenticated user tokens need appropriate protected storage and safe refresh/logout lifecycle.
- A cached offline identity permits chosen **local** operations; it does **not** prove remote session validity when internet is absent.
- Verify user ID binding before unlocking any account-specific local SQLite records. Never use email alone for local identity ownership.
- Proposed SQLCipher and per-user keys need validation in a native build; never report “encrypted” before verification.
- Device-local DB key and portable encrypted-backup recovery secret have **different** lifecycles. Lost phone + no backup may mean lost logs.
- Upload workout content only for user-authorized AI requests or separately user-enabled backup/sync; scope the payload minimally and make consent visible.
- Any future Supabase-hosted workout tables require owner-scoped RLS and negative access tests.
- No secrets or private workout data in GitHub issues, PRs, `.ai` notes, logs or screenshots.

**Review gates:** offline revocation policy, cross-user access, key rotation, backup import, account deletion and native entitlements all need explicit owner decisions.

**Canonical:** [Security requirements](../../docs/04-AUTH-AND-SECURITY.md) · [Threat model](../../docs/14-THREAT-MODEL.md) · [Backup strategy](../../docs/19-BACKUP-RECOVERY-STRATEGY.md)
