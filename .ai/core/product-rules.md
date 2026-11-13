# 🎯 Product rules

| Required product behavior | Never assume |
|---|---|
| Account registration/sign-in is required | Anonymous guest logging is supported |
| Users ordinarily sign in once and stay signed in | Device restart means logout |
| Already initialized users can log offline | Online validation is possible in airplane mode |
| Workouts/plans/sets/progress are device-local by default | Auth automatically uploads history |
| Logout locks account data but does not delete it | Deleting session equals deleting SQLite |
| AI is optional and online-only | AI draft auto-applies to local plan |
| Personal backup is user-controlled, encrypted and future work | Cloud restore is already available |
| App-database sync is separately opt-in and future only | Drive snapshots are real-time sync |

**Never promise** recovery of local-only workouts after uninstall/lost phone without a proven backup.

**Canonical:** [Product requirements](../../docs/01-PRODUCT-REQUIREMENTS.md) · [Session state](../../docs/18-OFFLINE-SESSION-STATE-MACHINE.md) · [Decisions](../../docs/09-DECISIONS.md)
