# Task 06A local Supabase Auth proof

**Status:** Disposable, non-production evidence only. This does not wire the Expo UI, create a cloud profile, enforce RLS, or authorize hosted Auth changes.

The local `supabase/config.toml` uses a unique project ID and `5532x` ports. It enables email confirmation and six-digit OTPs with a 600-second expiry. New-user confirmation, existing-user magic-link/OTP, and recovery templates all render `{{ .Token }}` into local Mailpit. No custom SMTP or external email delivery is configured.

Start a dedicated local Supabase stack with CLI v2.121.0 and Docker. Keep its CLI startup/status output private because it contains disposable local keys. Exclude services not needed for Auth (`realtime,storage-api,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor,postgrest`). Set `SUPABASE_CLI` to the installed CLI executable and run `node experiments/task06a/local-auth.mjs` from the repository root. The harness obtains the local publishable key in memory from `supabase status`, refuses any endpoint other than `127.0.0.1:55321` and `127.0.0.1:55324`, and prints no email address, OTP, password, session token or key.

The harness creates disposable local Auth identities and captures mail in local Mailpit. It exercises OTP signup, same-UUID initial password enrollment and interrupted return, password sign-in, token refresh, generic send responses, recovery, replay, direct authenticated password replacement, and five invalid OTP attempts. Its exit status is nonzero when any security requirement fails. The known local failures are direct replacement of an existing password and absence of the selected five-failure cooldown. Do not change those expectations to make the run green.

Local evidence cannot prove hosted built-in email delivery, server-owned lifecycle/RLS, native encrypted persistence, a 600-second expiry, the selected 60-second resend or five-send/hour limits, cleanup, or the full `AUTH-01–31` suite. The [Task 06A record](../../.ai/tasks/auth/local-20261117-native-otp-foundation.md) tracks exact coverage and remaining gates.
