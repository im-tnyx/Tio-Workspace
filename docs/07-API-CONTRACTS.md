<div align="center">

# 🧠 AI & API Contracts
**Authenticated Edge Functions and future-only sync APIs**

[← Docs hub](00-INDEX.md) · [🏠 Home](../README.md) · [🎨 Design](../DESIGN.md)

</div>

> [!NOTE]
> **Document status:** Planning / proposed specification. Product implementation has not started.

---

**Status:** Specification draft only; no endpoints are deployed.

## Supabase Auth usage
Use official Supabase authentication SDK for signup, login, refresh, password reset, verified session, signout. The mobile app contains **publishable** project config only. Do not create a custom password-storage API.

## Optional Edge Function: `POST /functions/v1/generate-workout-plan`
Purpose: Generate a workout **draft**; persist approved draft in local SQLite. Function is online-only.

### Request (illustrative JSON)
```json
{
  "goal": "strength",
  "experience": "beginner",
  "daysPerWeek": 3,
  "minutesPerSession": 45,
  "availableEquipment": ["dumbbells"],
  "constraints": [],
  "preferredUnits": "metric"
}
```
Authorization: current authenticated user access token; function validates it. No provider key in the request. Send only opted-in information needed for the plan, not the user's entire workout history.

### Response (illustrative JSON)
```json
{
  "requestId": "uuid",
  "plan": {
    "title": "3-day full-body",
    "days": [
      {
        "dayIndex": 1,
        "name": "Full body A",
        "exercises": [
          { "name": "Goblet squat", "sets": 3, "repsMin": 8, "repsMax": 12, "restSeconds": 90 }
        ]
      }
    ]
  }
}
```
**Important:** Response is untrusted/generated content. Validate schema and exercise prescription constraints. Show preview/edit controls before saving locally.

## Expected errors
| HTTP status | Meaning | App action |
|---|---|---|
| 400 / 422 | Invalid input | Edit fields |
| 401 | Missing/invalid session | Reauthenticate when online |
| 403 | Not authorized/consent required | Explain restriction |
| 429 | Per-user quota/rate limit | Show retry guidance |
| 502 / 503 / 504 | Provider/temporary failure | Retry later; preserve local state |

## Function security requirements
- Require authenticated user JWT, provider secret stored only in Supabase Edge Function secrets.
- Request validation; fixed server-side limits; abuse protection; timeout; idempotency as needed.
- Bounded outputs and deterministic schema; server strips unknown fields.
- Avoid personal-data logging; document AI vendor retention policy before go-live.
- Reject offline calls gracefully; never block local workout logging due to API unavailability.
- Version response schema when changing the format.

## Future cloud sync API (NOT IMPLEMENTED)
Do not deploy routes yet. Potential operations: `pushChanges`, `pullChanges`, `getSyncCursor` and `deleteCloudData` with authenticated owner checks, RLS, revision IDs, tombstones and idempotency. Final contract requires explicit sync architecture review.

## References
- https://supabase.com/docs/guides/functions
- https://supabase.com/docs/guides/functions/auth
- https://supabase.com/docs/guides/functions/secrets

---

[← Documentation hub](00-INDEX.md) · [Security →](04-AUTH-AND-SECURITY.md)
