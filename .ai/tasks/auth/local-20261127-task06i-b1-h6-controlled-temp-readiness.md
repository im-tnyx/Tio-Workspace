# Task 06I-B1-H6 — Controlled TEMP hosted Auth readiness decision packet

**H6-RP public rollback `PASS` · Phase B TEMP activation `PASS` · Phase C pilot `NO-GO`** · 28 नवंबर 2026 IST

Phase A की read-only review और H6-RP rollback proof के बाद owner ने exact TEMP पर Phase B SQL/config activation अलग से authorize किया। Phase C pilot execution और LIVE admission के लिए अलग अनुमति चाहिए। Hosted verification **0/18**, hosted atomic conditional deletion **UNVERIFIED**, LIVE **BLOCKED**, Production Real Auth **STRICT NO-GO**। अतिरिक्त infrastructure cost **$0**।

| Field | Value |
|---|---|
| Decision owner | Repository owner |
| Phase A review and documentation | Codex root |
| Future implementation owner / operator / independent reviewer | नियुक्ति लंबित |
| Verified baseline | Local `main`, `origin/main` और live GitHub `main` `cc1ac5cf77269368dde81bec486106033eb5c5a7`। [Merged closeout PR #50](https://github.com/im-tnyx/Tio-Workspace/pull/50) |
| Historical Phase A target | `Tio-Tnyx-Auth-Temp` · `wvdabiwbaavfggcmpizd` · organization `llmbrmxhyirtoqndazpg` |
| Source of requirements | [H2 plan](local-20261124-task06i-b1-h2-temp-hosted-readiness.md), [H3 subset runner](../../archive/2026/local-20261124-task06i-b1-h3-subset-runner-storage.md), [H4 durable recovery](../../archive/2026/local-20261126-task06i-b1-h4-durable-recovery.md), [H5 archive](../../archive/2026/local-20261127-task06i-b1-h5-seed-temp-readiness.md#h5-merged-closeout-receipt), [H5 readiness matrix](../../../experiments/task06i/h5-temp-readiness.md#existing18-scenario-readiness-matrix) |

## H6-RP — Disposable hosted hook rollback proof

**Stage 1 `PASS` · Stage 2 R2 rollback `PASS` · Probe fixture और token cleanup `PASS`** · 28 नवंबर 2026 IST

| जाँच | Evidence |
|---|---|
| Baseline | Local `main`, `origin/main` और GitHub `main` ने `cc1ac5cf77269368dde81bec486106033eb5c5a7` resolve किया। [PR #50 closeout](https://github.com/im-tnyx/Tio-Workspace/pull/50) |
| Billing eligibility | Supabase connector ने exact organization `Tio-tnyx` (`llmbrmxhyirtoqndazpg`) का `free` plan दोबारा सत्यापित किया। 00:12 IST पर उसी organization के Dashboard preflight ने नई Free provisioning को quota पर block किया था। Existing TEMP के लिए प्रस्तावित operations में नया project, plan upgrade या paid add-on शामिल नहीं है। Stage 1 में नई infrastructure cost **$0** और credential creation **0** हैं। [Dashboard preflight](https://supabase.com/dashboard/new/llmbrmxhyirtoqndazpg) · [Supabase Free quota](https://supabase.com/docs/guides/platform/billing-faq#how-many-free-projects-can-i-have) |
| Exact target और authorization | Owner ने पुष्टि की कि दोनों projects में से एक testing के लिए बनाया गया था। पिछली बातचीत में नामित `Tio-Tnyx-Auth-Temp` को Stage 1 read-only target माना गया। Project metadata ने exact `ref` `wvdabiwbaavfggcmpizd`, organization `llmbrmxhyirtoqndazpg`, region `ap-south-1` और status `ACTIVE_HEALTHY` लौटाए। Original `NO ACCESS` सीमा में TEMP का अपवाद इस Stage 1 read-only जाँच तक है। REAL और Tio-world पर कोई project-level access नहीं हुआ। |
| Empty baseline | TEMP पर aggregate SQL `SELECT` में Auth users, identities, sessions, `public` relations और routines सभी **0**। Expected managed namespaces से अलग कोई schema नहीं मिला। `private_auth` और दोनों `public` probe signatures अनुपस्थित हैं। `supabase_auth_admin` role मौजूद है। Connector ने project migrations **0** और Edge Functions **0** लौटाए। किसी user row की details नहीं पढ़ी गईं। |
| Provider compatibility | TEMP metadata में PostgreSQL `17.12.0.000` GA और SQL में `17.12` मिला। Supabase Free पर दोनों PostgreSQL hook types और public Management Auth config `GET`/`PATCH` documented हैं। Fresh Auth version और explicit-null config preimage Stage 2 के पहले checks हैं। `PATCH` schema का nullable type live clear/readback behavior का प्रमाण नहीं देता। [Auth Hooks](https://supabase.com/docs/guides/auth/auth-hooks) · [Public GET](https://supabase.com/docs/reference/api/v1-get-auth-service-config) · [Public PATCH](https://supabase.com/docs/reference/api/v1-update-auth-service-config) |

### Stage 2 first attempt — activation `403`

Owner ने explicit confirmation के जवाब में `मंज़ूरी h` देकर exact TEMP ref `wvdabiwbaavfggcmpizd` पर public baseline `GET`, दो reviewed PostgreSQL fixtures और उनके minimal grants, चार hook fields का `PATCH`, exact rollback, cleanup और final verification approve किए। यह approval H6-RP experiment तक है।

**Credential:** Owner ने अलग से `Tio-Workspace TEMP H6-RP` scoped PAT मंज़ूर किया और Dashboard में उसे generate करने की पुष्टि की। Reviewed Dashboard settings में एक project `Tio-Tnyx-Auth-Temp`, एक capability `Auth Config: Read-write`, और 24 घंटे की expiry थी। Owner ने masked local prompt में secret दिया। Token और raw Auth config केवल process memory में इस्तेमाल हुए। Revocation [R2 cleanup evidence](#h6-rp-r2-evidence) में दर्ज है। [Supabase PAT permissions](https://supabase.com/docs/guides/platform/personal-access-tokens) · [Management authentication](https://supabase.com/docs/reference/api/introduction#authentication)

| Public Management API request on exact TEMP | HTTP | Dispatch → observed (UTC) | Sanitized evidence |
|---|---|---|---|
| Baseline `GET` | `200` | `2026-11-27T19:10:26.4325142Z` → `2026-11-27T19:10:26.8279115Z` | दोनों enabled keys present और boolean `false`। दोनों URI keys present और JSON `null`। |
| Activation `PATCH` | `403` | `2026-11-27T19:12:13.7166957Z` → `2026-11-27T19:12:15.0049336Z` | Request ने केवल दोनों flags और दोनों PostgreSQL URIs भेजे। Raw error body retain नहीं किया गया। Provider rejection का specific कारण `UNVERIFIED` है। कोई mutation retry या internal API fallback नहीं हुआ। |
| Cleanup verification `GET` | `200` | `2026-11-27T19:13:21.3319768Z` → `2026-11-27T19:13:21.7165527Z` | दोनों flags `false`, दोनों URI keys explicit JSON `null`, probe schema को reference करने वाली Auth config strings **0**। |

**PostgreSQL evidence:** TEMP PostgreSQL `17.12`। दो routines ने reviewed `hooks.sql` के bodies का इस्तेमाल किया। एक targeted transaction ने नया `private_auth` schema, दो exact `jsonb` routines और सिर्फ़ नए objects पर scoped ACL बनाए। Independent catalog readback में `supabase_auth_admin` को schema `USAGE` और दोनों routines पर `EXECUTE` मिला। Client roles के effective grants और unexpected ACL entries **0** रहे। Source SHA-256 `72b950028a288f533c5db8d9163742163723b93783ca955961da0420132b12c3` है। [Reviewed source](../../../experiments/task06i/sql/hooks.sql)

**Fixture cleanup `PASS`:** Post-403 `GET` के बाद captured OIDs, function-definition hashes और ACL scope से दोनों exact functions और schema मिलाए। Targeted transaction ने `RESTRICT` से सिर्फ़ उन्हीं objects को हटाया। Independent readback ने schema और दोनों routines की absence, residual fixture ACL dependencies **0**, Auth users/identities/sessions **0**, `public` relations/routines **0**, project migrations **0** और Edge Functions **0** सत्यापित किए।

**पहले attempt में rollback proof `BLOCKED`:** Activation PATCH सफल नहीं हुआ। Configured-state `GET`, rollback `PATCH` और full semantic rollback comparison नहीं चले। Recovery `GET` केवल exact चार target fields और probe references का cleanup evidence है। इस attempt में fresh GoTrue version नहीं मापा गया।

**`403` का documented permission mismatch:** Public `GET` को `auth_config_read` चाहिए। Public `PATCH` के fine-grained token में `auth_config_write` और `project_admin_write` दोनों चाहिए। Supabase PAT permission table का footnote 3 इसकी पुष्टि करता है। पहले token में केवल `Auth Config: Read-write` चुना गया था। `Project Settings: Read-write` अनुपस्थित था, इसलिए वह documented write requirements पूरी नहीं करता था। यह observed `GET 200` और `PATCH 403` से consistent है। Provider के specific response message की स्वतंत्र पुष्टि उपलब्ध नहीं है। [Public GET permissions](https://supabase.com/docs/reference/api/v1-get-auth-service-config) · [Public PATCH permissions](https://supabase.com/docs/reference/api/v1-update-auth-service-config) · [PAT permission footnote](https://supabase.com/docs/guides/platform/personal-access-tokens#footnotes)

### H6-RP R2 evidence

Owner ने TEMP-only `Auth Config: Read-write` और `Project Settings: Read-write` वाले short-lived PAT और **एक नया attempt** explicitly मंज़ूर किया। Dashboard review ने एक project, दो capabilities और 24 घंटे की expiry दिखाईं। Owner ने token generate किया और masked local prompt में दिया। Public requests केवल exact `wvdabiwbaavfggcmpizd` के Auth config और documented Auth health endpoints पर गए। कोई automatic retry, redirect या internal API fallback नहीं हुआ। [PAT capabilities](https://supabase.com/docs/guides/platform/personal-access-tokens#permission-scopes) · [Service health API](https://supabase.com/docs/reference/api/v1-get-services-health)

| Public Management API request | HTTP | Dispatch → observed (UTC) | Sanitized evidence |
|---|---|---|---|
| Baseline Auth config `GET` | `200` | `2026-11-27T19:27:07.7268403Z` → `2026-11-27T19:27:09.0855897Z` | दोनों flags present और boolean `false`। दोनों URI keys present और explicit JSON `null`। |
| Auth service health `GET` | `200` | `2026-11-27T19:27:09.1554490Z` → `2026-11-27T19:27:10.1389953Z` | Managed GoTrue `v2.199.0`। PostgreSQL `17.12` को independent SQL readback ने सत्यापित किया। |
| Activation `PATCH` | `200` | `2026-11-27T19:28:26.1918283Z` → `2026-11-27T19:28:27.5304850Z` | सिर्फ़ दोनों `enabled=true` flags और canonical PostgreSQL URI fields भेजीं। |
| Configured-state `GET` | `200` | `2026-11-27T19:28:27.5310101Z` → `2026-11-27T19:28:27.8201353Z` | चारों fields exact match। Unrelated observable config diff **0**। |
| Exact preimage rollback `PATCH` | `200` | `2026-11-27T19:28:27.8507056Z` → `2026-11-27T19:28:28.1760583Z` | उन्हीं चार fields में captured `false` flags और दोनों explicit JSON `null` values restore के लिए भेजीं। |
| Post-rollback verification `GET` | `200` | `2026-11-27T19:28:28.1766731Z` → `2026-11-27T19:28:28.4412424Z` | पूरे observable GET baseline के विरुद्ध semantic diff **0**। Key presence, JSON types और values match हैं। दोनों URI keys present और `null` हैं। |

**Fixture और ACL verification `PASS`:** Reviewed source के दोनों canonical routine bodies को केवल नए `private_auth` schema में लगाया। SQL setup `2026-11-27T19:27:42.903Z` → `2026-11-27T19:27:53.332Z`। Independent catalog check में दो exact `jsonb → jsonb` routines, fixed empty `search_path`, `supabase_auth_admin` को required `USAGE`/`EXECUTE`, unexpected ACL **0** और client-role access **0** मिले। Definition hashes पहले attempt के reviewed bodies से match थे।

**Database और credential cleanup `PASS`:** Captured object identities, hashes और ACL scope match होने पर `RESTRICT` cleanup `2026-11-27T19:28:56.810Z` → `2026-11-27T19:29:06.000Z` में हुआ। अलग catalog readback में schema और दोनों routines absent, fixture ACL dependencies **0**, Auth users/identities/sessions **0**, public relations/routines **0**, project migrations **0**, और Edge Functions **0** मिले। Owner-approved revocation के बाद Supabase Dashboard reload पर दोनों probe PATs (`Tio-Workspace TEMP H6-RP` और `Tio-Workspace TEMP H6-RP R2`) absent थे, लगभग `19:31 UTC`।

**Decision:** Exact TEMP और recorded provider version पर managed public API rollback proof `PASS`। कोई Auth user creation, login, OTP, email delivery या Storage operation नहीं हुआ। इस receipt की verification सीमा चार managed Auth fields और observable config equality है।

### Approved experiment contract

1. Short-lived credential केवल exact TEMP project तक scoped है। Public route allowlist Auth config `GET`/`PATCH` और read-only Auth service health है। Project pause, project deletion, plan upgrade, paid infrastructure और REAL/Tio-world access scope से बाहर हैं।
2. Approved ref पर public `GET /v1/projects/{ref}/config/auth` से fresh preimage लें। `hook_custom_access_token_enabled` और `hook_send_email_enabled` दोनों `false` हों। `hook_custom_access_token_uri` और `hook_send_email_uri` दोनों keys मौजूद हों और उनकी value JSON `null` हो। Missing, empty string, masked या अन्य representation पर setup से पहले रुकें।
3. केवल independently reviewed disposable PostgreSQL fixtures के लिए एक unexposed schema, दो `jsonb → jsonb` routines और `supabase_auth_admin` के लिए exact `USAGE`/`EXECUTE` रखें। `PUBLIC`, `anon` और `authenticated` को effective fixture access न मिले। SQL और ACL preimage तथा cleanup steps पहले pin करें। Hook invocation, Auth user creation, login, OTP, email delivery, Storage, Brevo और production implementation scope से बाहर हैं।
4. Public `PATCH` में केवल दोनों enabled flags और दोनों reviewed `pg-functions://` URIs भेजें। अलग public `GET` से exact bindings और unrelated observable config में zero drift सत्यापित करें। Rollback `PATCH` में उन्हीं चार fields का captured preimage भेजें, जिसमें दोनों explicit JSON `null` हों। अंतिम public `GET` को पूरे observable baseline से semantically compare करें। Key presence, JSON type और value match हों। HTTP `200` अकेले proof नहीं है।
5. Config restoration verified होने पर independently grants, routines, schema और बाकी probe resources को baseline से reconcile करें। Evidence में provider versions, UTC timestamps, HTTP statuses, field presence/types, semantic diff और catalog/ACL cleanup result रखें। Raw config, credentials और secret values persist न करें। Ambiguous effect या mismatch पर sanitized evidence और pending cleanup दर्ज कर owner को सौंपें। Automatic retry और undocumented internal API fallback निषिद्ध हैं।

Hosted verification **0/18**, atomic conditional deletion **UNVERIFIED**, LIVE **BLOCKED**, Production Real Auth **STRICT NO-GO**। H6-RP से TEMP Phase B की अनुमति नहीं मिलती।

## H6-A-R1 — TEMP Auth evidence recovery

Owner authorization केवल नीचे के दो TEMP evidence GETs तक है। हर endpoint के लिए एक attempt है, retries और redirects बंद हैं। ये evidence requests Auth pilot के आठ nominal requests से अलग हैं।

| Evidence request | HTTP status | Dispatch / response timestamp | Evidence |
|---|---|---|---|
| `GET https://api.supabase.com/v1/projects/wvdabiwbaavfggcmpizd/config/auth` | **200**, attempt 1 | `2026-11-27T15:13:57.8400032Z` → `2026-11-27T15:13:59.6715476Z` | Allowlisted Auth configuration नीचे दर्ज है। दोनों hook URI values **UNKNOWN** हैं। |
| `GET https://wvdabiwbaavfggcmpizd.supabase.co/auth/v1/health` | **200**, attempt 1 | `2026-11-27T15:13:59.6764774Z` → `2026-11-27T15:14:01.3645639Z` | Auth health endpoint ने **GoTrue `v2.199.0`** report किया। |

Dispatch से पहले owner ने Dashboard से TEMP-only `Auth Config: Read` scope, publishable key का project और PAT expiry `2026-12-04T15:10:04Z` की पुष्टि की। Scope evidence owner की Dashboard पुष्टि है। Helper ने दोनों credential formats और pinned targets validate किए। Sanitized receipt में सिर्फ typed allowlisted values हैं। Null/absent values **UNKNOWN** हैं। Helper ने transient credentials clear किए। Owner ने collection पूरी होने के बाद temporary PAT revoke करने की पुष्टि की। Revocation की अलग API जाँच नहीं हुई। [Scoped PATs](https://supabase.com/docs/guides/platform/personal-access-tokens) · [GoTrue health](https://supabase.com/kb/troubleshooting/how-do-i-check-gotrueapi-version-of-a-supabase-project-lQAnOR)

## H6-A-R2 — TEMP hook bindings और rollback verification

Authenticated Chrome session में exact [TEMP Auth Hooks Dashboard](https://supabase.com/dashboard/project/wvdabiwbaavfggcmpizd/auth/hooks) देखा। Project header ने `Tio-Tnyx-Auth-Temp` दिखाया। Hooks list में existing card की जगह `Create an auth hook` empty state थी। Add menu में `Customize Access Token (JWT) Claims` और `Send Email` उपलब्ध थे। Menu बंद किया और कोई hook save, enable, disable या delete नहीं किया। नया PAT या direct Management API request इस्तेमाल नहीं हुआ।

| Field | R1 Management GET | R2 Dashboard | Verification result |
|---|---|---|---|
| `hook_custom_access_token_enabled` | `false` | Existing token hook card नहीं दिखा | R1 boolean `false` सत्यापित। R2 UI में raw flag अलग से उपलब्ध नहीं था। |
| `hook_custom_access_token_uri` | `UNKNOWN` | Destination नहीं दिखा | Exact stored URI state **UNKNOWN**। |
| `hook_send_email_enabled` | `false` | Existing email hook card नहीं दिखा | R1 boolean `false` सत्यापित। R2 UI में raw flag अलग से उपलब्ध नहीं था। |
| `hook_send_email_uri` | `UNKNOWN` | Destination नहीं दिखा | Exact stored URI state **UNKNOWN**। |

R1 sanitizer missing field, JSON `null`, empty/whitespace string और unexpected non-string value को `UNKNOWN` करता है। Nonempty target canonical होने पर exact approved URI दर्ज होता है। अन्य nonempty values को HTTP, other Postgres या other-redacted category में रखा जाता है। R1 में दोनों URI के लिए कोई configured या redacted category नहीं लौटी। इससे provider-side omission, underlying storage state और exact restore value अलग नहीं की जा सकती।

Public Studio source में Auth config की absent, null और empty URI एक ही empty display में जाती हैं। UI valid Postgres/HTTPS method वाले hooks के cards दिखाता है। इसलिए R2 empty state raw URI या raw enabled flag का proof नहीं देती। [Studio hook listing](https://github.com/supabase/supabase/blob/cddcdf5b419c8abd9972c7b49410a1999ab4fc70/apps/studio/components/interfaces/Auth/Hooks/HooksListing.tsx#L43) · [Studio hook validation](https://github.com/supabase/supabase/blob/cddcdf5b419c8abd9972c7b49410a1999ab4fc70/apps/studio/components/interfaces/Auth/Hooks/hooks.utils.ts#L5)

### Rollback contract का evidence

- Public Management PATCH schema में `enabled` और `uri` अलग fields हैं। दोनों URI nullable हैं। Schema से यह स्थापित नहीं हुआ कि `enabled=false` URI हटाता है, या `null` PATCH के बाद hosted GET उसे explicit null, omitted या normalized value के रूप में लौटाता है। [Management PATCH schema](https://supabase.com/docs/reference/api/v1-update-auth-service-config)
- Public Studio का Delete flow दोनों hook types के लिए स्पष्ट रूप से `enabled=false`, `uri=null` और `secrets=null` भेजता है। यह Studio का अलग hooks-management path है। Postgres hook के लिए config update के बाद अलग SQL privilege changes चल सकते हैं, जिनमें `PUBLIC`, `anon` और `authenticated` को `EXECUTE` देना भी शामिल है। इस कारण Dashboard Delete Phase B के targeted rollback scope में स्वीकार्य नहीं है। R2 ने source behavior पढ़ा। किसी TEMP write या readback से इसे exercise नहीं किया। [Studio delete payload](https://github.com/supabase/supabase/blob/cddcdf5b419c8abd9972c7b49410a1999ab4fc70/apps/studio/components/interfaces/Auth/Hooks/DeleteHookConfirmationDialog.tsx#L86) · [Studio SQL privilege behavior](https://github.com/supabase/supabase/blob/cddcdf5b419c8abd9972c7b49410a1999ab4fc70/apps/studio/components/interfaces/Auth/Hooks/hooks.utils.ts#L39)

## H6-A-R3 — Dashboard GET और exact rollback

27 नवंबर 2026 IST को Chrome DevTools Network में authenticated TEMP Auth Hooks Dashboard का normal `GET /platform/auth/wvdabiwbaavfggcmpizd/config` देखा। Initial conditional request का `304` URI evidence में उपयोग नहीं हुआ। Cache-disabled Dashboard reload ने `200` response दिया। DevTools Response search से केवल exact field names और JSON `null` literal का match दर्ज किया। कोई raw response, credential या HAR capture नहीं किया गया। नया PAT, direct Management API call, PATCH, SQL, permissions change और pilot dispatch शून्य रहे।

| Hook URI field | Property present | JSON type | Sanitized state |
|---|---|---|---|
| `hook_custom_access_token_uri` | `true` | `null` | `NULL` |
| `hook_send_email_uri` | `true` | `null` | `NULL` |

`ABSENT` में key गायब होती है। `NULL` में key और explicit JSON `null` होते हैं। `EMPTY_STRING` में key की value `""` होती है। `CONFIGURED` nonempty binding के लिए है और `REDACTED` provider द्वारा mask की गई value के लिए। दोनों fields में `NULL` का exact match मिला। यह Dashboard की GET representation है। R1 sanitized receipt में public Management GET का URI JSON type और presence **UNKNOWN** हैं। दोनों enabled flags का `false` baseline R1 से है।

| Pinned Studio source | Verified behavior और evidence limit |
|---|---|
| `auth-config-query.ts` | Studio config `GET /platform/auth/{ref}/config` से पढ़ता है। [Source](https://github.com/supabase/supabase/blob/cddcdf5b419c8abd9972c7b49410a1999ab4fc70/apps/studio/data/auth/auth-config-query.ts#L17) |
| `auth-hooks-update-mutation.ts` | Studio hook updates internal `PATCH /platform/auth/{ref}/config/hooks` पर भेजता है और success पर config cache invalidate करता है। Cache invalidation persisted value या GET serialization निर्धारित नहीं करती। [Source](https://github.com/supabase/supabase/blob/cddcdf5b419c8abd9972c7b49410a1999ab4fc70/apps/studio/data/auth/auth-hooks-update-mutation.ts#L16) |
| `DeleteHookConfirmationDialog.tsx` | दोनों hook types के Delete payload में `enabled=false`, `uri=null`, `secrets=null` हैं। Postgres hooks के लिए अलग SQL privilege changes भी हो सकते हैं। यह targeted rollback के लिए उपयुक्त नहीं है। [Source](https://github.com/supabase/supabase/blob/cddcdf5b419c8abd9972c7b49410a1999ab4fc70/apps/studio/components/interfaces/Auth/Hooks/DeleteHookConfirmationDialog.tsx#L86) |

**R3 के समय rollback readiness `BLOCKED` थी।** उस समय public PATCH schema में nullable URI types उपलब्ध थे, लेकिन live clear और readback behavior **UNKNOWN** था। [H6-RP R2](#h6-rp-r2-evidence) ने बाद में public Management `PATCH` से exact clear और `GET` से explicit `null` readback सत्यापित किया। Stage 2 ने Studio से config write या readback नहीं किया। [Public Management PATCH](https://supabase.com/docs/reference/api/v1-update-auth-service-config) · [Public Management GET](https://supabase.com/docs/reference/api/v1-get-auth-service-config)

### Historical Supabase Support question — unsent draft

> In a TEMP project, Studio’s authenticated `GET /platform/auth/{ref}/config` returns both `hook_custom_access_token_uri` and `hook_send_email_uri` as present with JSON `null`. For a later rollback from configured Postgres hook URIs, does the public Management API `PATCH /v1/projects/{ref}/config/auth` actually clear both URIs when sent explicit JSON `null` with their two enabled flags set to `false`? Can we omit all other fields from that hook rollback without changing hook secrets, database grants, or unrelated Auth settings? After propagation, what exact presence/type should we expect for those URI fields in the public Management GET and the Studio GET, and how should we verify restoration if either response normalizes the fields to omitted or empty? If that PATCH cannot restore the observed state, what supported scoped operation and GET readback sequence can?

Support draft local है। Ticket submit नहीं किया गया। Phase B owner gate पर निर्णय `NO-GO` है।

## Phase A में सत्यापित evidence

- Project metadata में exact name, ref और organization match हैं। Project status `ACTIVE_HEALTHY`, region `ap-south-1`, canonical origin `https://wvdabiwbaavfggcmpizd.supabase.co`। Database metadata PostgreSQL `17.12.0.000` GA दिखाता है और SQL ने `17.12` लौटाया। R1 ने Auth health endpoint और उसका reported GoTrue `v2.199.0` सत्यापित किया। Hosted exact-ID Admin create behavior, future launcher isolation और data lineage **UNKNOWN** हैं। Access देने से पहले future launcher की independent TEMP-only isolation verification अलग gate है। [Service health reference](https://supabase.com/docs/reference/api/v1-get-services-health) · [GoTrue v2.199.0 release](https://github.com/supabase/auth/releases/tag/v2.199.0)
- Project migrations **0**, Edge Functions **0**, Auth users **0**, Auth sessions **0**, सभी inspection के समय। Managed Auth catalog में **85** migration entries थीं और सबसे बड़ा version identifier `20261116120000` था। Managed migration history से running GoTrue build निर्धारित नहीं किया गया। Auth data से केवल aggregate counts पढ़े गए।
- Phase A catalog में `auth`, `extensions`, `graphql`, `graphql_public`, `pgbouncer`, `public`, `realtime`, `storage`, `vault` schemas थे। `public` में application tables/views और routines **0**। `private_auth`, दोनों Task 06I hook routines, `public.task06i_session_probe` और Storage owner lookup routine अनुपस्थित थे। R1 Management GET में दोनों अपेक्षित hook enabled flags `false` लौटे। R3 Dashboard GET में दोनों URI keys present और JSON `null` थीं। R1 और R3 में catalog दोबारा query नहीं किया गया।
- `PUBLIC` के पास `public` schema पर `USAGE` था। `anon`, `authenticated` और `service_role` के पास `auth`, `public` और `storage` पर `USAGE`, और इन schemas पर `CREATE` नहीं था। `supabase_auth_admin` के पास `auth` पर `USAGE/CREATE` और `public` पर `USAGE` था।
- `auth.users` और `auth.sessions` पर RLS enabled, FORCE RLS off और policies **0**। Selected roles में `supabase_auth_admin` के पास CRUD था। `anon`, `authenticated`, `service_role` को direct SQL CRUD grants नहीं मिले। `storage.objects` पर RLS enabled, FORCE RLS off और policies **0**। उस table पर `anon`, `authenticated` और `service_role` के effective CRUD grants मिले। यह ACL और catalog evidence है। HTTP Auth authority, RLS behavior और bucket access को exercise नहीं किया गया।

Project URL, migration और function inventory exact project-scoped connector methods से पढ़े गए। पहला catalog statement सिर्फ `SELECT` था और connector का transaction default `off` दिखा। Detailed catalog और ACL checks explicit `BEGIN TRANSACTION READ ONLY` में चले, `transaction_read_only=on` लौटाया और `COMMIT` किया। Queries में DDL, DML या application hook invocation शामिल नहीं थे। REAL और Tio-world को किसी call में target नहीं किया गया।

## Sanitized Auth snapshot — observed versus required

नीचे की observed values R1 के TEMP Management GET से हैं। URI representation R3 Dashboard GET से अलग दर्ज है। Public GET की URI representation और sanitized SMTP mode receipt में **UNKNOWN** हैं। Config values endpoint behavior की अलग verification नहीं देतीं। [Management GET reference और `auth_config_read` scope](https://supabase.com/docs/reference/api/v1-get-auth-service-config)

| Setting | TEMP observed | H2–H5 requirement / प्रस्तावित baseline |
|---|---|---|
| Public signup और anonymous sign-in | `disable_signup=false`, `external_anonymous_users_enabled=false` | Signup disable करना प्रस्तावित है। Anonymous sign-in target से match है। केवल verified disposable Admin fixture प्रस्तावित है। |
| Native email OTP / magic link और phone | `external_email_magic_link_disabled=false`, `external_phone_enabled=false`, OTP length `8`, OTP expiry `3600` seconds | Magic-link flag को `true` करना प्रस्तावित है। Phone, OTP length और OTP expiry में कोई delta नहीं। Hosted behavior अलग gate है। |
| Email/password और confirmation | `external_email_enabled=true`, `mailer_autoconfirm=false`, `mailer_allow_unverified_email_sign_ins=false`, minimum password length `6` | मौजूदा settings retain करें। Synthetic seed confirmation approved Admin fixture तक सीमित है। |
| JWT expiry और refresh | `jwt_exp=3600` seconds, rotation `true`, reuse interval `10` seconds, inactivity timeout `0`, timebox `0`, single session per user `false` | सिर्फ `jwt_exp=300` seconds प्रस्तावित है। Rotation और बाकी session controls retain करें। Pilot में refresh dispatch शामिल नहीं है। |
| Custom Access Token Hook | R1 enabled `false`। R3 Dashboard URI present, JSON `null`। Canonical function Phase A catalog में **ABSENT**। | Canonical Postgres function और binding तैयार हों। फिर enabled `true` प्रस्तावित है। Password-origin AMR, `amr_authenticated`, exact seed और session evidence pilot में चाहिए। |
| Send Email Hook | R1 enabled `false`। R3 Dashboard URI present, JSON `null`। Canonical function Phase A catalog में **ABSENT**। | Canonical Postgres function और binding तैयार हों। फिर enabled `true` प्रस्तावित है। Native email suppression आवश्यक है। |
| Rate limits और email delivery | Email sent `2`, OTP `30`, verify `30`, token refresh `150`, `smtp_max_frequency=60`; sanitized SMTP mode **UNKNOWN** | ये GET के configured values हैं। Limits और delivery routing retain करें। Pilot में external email शून्य है। |

Public docs Auth Hooks, JWT/session lifecycle और rate limits के provider contracts बताते हैं। इनसे TEMP configuration, invocation या outcome का PASS निर्धारित नहीं किया गया। [Auth Hooks](https://supabase.com/docs/guides/auth/auth-hooks) · [Session lifecycle](https://supabase.com/docs/guides/auth/sessions) · [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits) · [SMTP](https://supabase.com/docs/guides/auth/auth-smtp) · [Changelog](https://supabase.com/changelog)

## H2–H5 runtime audit

| Area | Source-backed evidence | Pilot से पहले unresolved |
|---|---|---|
| H2 target और LIVE admission | Runner और CLI में LIVE hard block है। TEMP pin और protected destinations का rejection source में है। Hosted network dispatcher मौजूदा runner admission से आगे नहीं जा सकता। | Exact runtime SHA पर reviewed TEMP-only launcher, pinned HTTPS origin, redirect rejection, outbound restriction और control evidence। H5 offline gate को हटाने मात्र से यह evidence नहीं बनता। |
| H3 subset और accounting | Run-bound private admission, durable reservation/dispatch/outcomes, **25** attempts, **1,000 ms** pacing, **0** cleanup reserve। Cancelled/dispatched और ambiguous effects account होते हैं। Offline instrumentation simulated pacing को अलग बताता है। | Actual hosted adapter को हर admitted attempt, including cleanup and expected 404, इसी journal/budget में दर्ज करना होगा। No automatic retry या hidden provider call। |
| H4 durable recovery | Current journal limit **512 events / 256 KiB**। Replay और residuals local process crashes पर offline-tested हैं। Cold Auth credentials या live cleanup proof journal से reconstruct नहीं होते। | Named recovery operator, approved secure evidence location, cold-hosted Auth recovery का bounded disposition, और interrupted run पर `RECOVERY_REQUIRED`। Evidence का digest alone privileged host tampering के विरुद्ध protection नहीं है। |
| H5 exact ownership और cleanup | Private seed capability exact project/run/journal/provider और UUID से bound है। Creation proof exact pre-absence, matching creation and independent confirmation से बनता है। Session reconciliation और verified identity gate के बाद ही seed delete और independent absence evidence। [GoTrue v2.199.0 Admin source](https://github.com/supabase/auth/blob/v2.199.0/internal/api/admin.go#L19) में Admin user parameter `id` है। | Managed gateway पर exact-ID create और same-provider local logout behavior **UNKNOWN** हैं। Ambiguous effect, collision या missing proof पर seed को adopt/delete न किया जाए। |
| Transient credentials और key compatibility | Auth material process-local है और journal में secrets नहीं हैं। Current key binder legacy JWT-shaped credentials के project claims parse करता है। Opaque publishable/secret key format reject होता है। Claim parsing credential provenance या signature verification स्थापित नहीं करती। Current cleanup adapter local logout में service-role gateway key और session bearer इस्तेमाल करता है। | TEMP publishable key केवल read-only health GET पर सफल रही। Future reviewed pilot key binding, credential injection और least-privilege logout gateway अब भी चाहिए। Public probe path को privileged key से अलग रखें। |

Source inspected, runtime tests इस turn में rerun नहीं किए गए। Merged H5 offline evidence archive में है। [LIVE gate](../../../experiments/task06i/hosted-probe-runner.mjs#L11596) · [Seed ownership](../../../experiments/task06i/hosted-probe-runner.mjs#L281) · [Credential binder](../../../experiments/task06i/hosted-probe-runner.mjs#L9370) · [Logout adapter](../../../experiments/task06i/hosted-probe-runner.mjs#L12188) · [Budget](../../../experiments/task06i/run-request-budget.mjs) · [Journal](../../../experiments/task06i/offline-recovery-journal.mjs) · [Supabase API key types](https://supabase.com/docs/guides/getting-started/api-keys)

## H6 Phase B — controlled TEMP activation

**Phase B owner authorization (28 नवंबर 2026 IST):** केवल `Tio-Tnyx-Auth-Temp` (`wvdabiwbaavfggcmpizd`), नीचे के exact seven-field delta, दो reviewed hook routines, न्यूनतम grants, independent readback और failure पर exact rollback। Scope में pilot, LIVE Auth endpoints, Auth users/sessions creation, OTP, recovery, email delivery, Storage, production, project lifecycle, Git publication और protected REAL/Tio-world नहीं हैं। TEMP-only short-lived PAT के दो required capabilities और उसी token की final revocation अलग से owner-approved हैं।

Live GitHub `main`, local `main` और merged PR #50 का SHA `cc1ac5cf77269368dde81bec486106033eb5c5a7` match हुआ। Live Main Protection ruleset `27218050` active है। Strict App-owned `Commit attribution guard` (`5032971`), one approving review और resolved review threads required हैं। `.ai/current.md` का historical planning statement इस owner authorization से superseded है। [PR #50](https://github.com/im-tnyx/Tio-Workspace/pull/50) · [Live ruleset](https://github.com/im-tnyx/Tio-Workspace/rules/27218050)

Independent reviewer `phaseb_review` का static review `PASS` रहा। Canonical source SHA-256 `72b950028a288f533c5db8d9163742163723b93783ca955961da0420132b12c3` के दोनों bodies केवल input JSON और built-ins इस्तेमाल करते हैं। Fixed empty `search_path` के साथ `SECURITY INVOKER` पर्याप्त है। Read-only SQL ने DDL actor `postgres`, PostgreSQL `17.12`, `supabase_auth_admin` present, `private_auth` absent और Auth users/identities/sessions तथा public application relations/routines सभी **0** पाए। TEMP Security Advisor baseline lints **0**। PostgreSQL connection में exposed-schema GUC उपलब्ध नहीं था। Authoritative Data API settings की अलग जाँच precondition है। [Canonical bodies](../../../experiments/task06i/sql/hooks.sql) · [Auth hook grants](https://supabase.com/docs/guides/auth/auth-hooks)

Phase B ने reviewed SQL का catalog verification होने के बाद सिर्फ़ सात settings apply कीं। Independent config GET और Dashboard ने TEMP binding verify की। Scope में पहले से matching fields, rotation, बाकी session controls, rates, SMTP, DNS और Brevo के changes नहीं थे। नीचे की baseline values fresh public GET से हैं। [Management PATCH reference](https://supabase.com/docs/reference/api/v1-update-auth-service-config)

| Auth config field | Fresh observed before | Independent GET after | Exact rollback preimage |
|---|---|---|---|
| `disable_signup` | `false` | `true` | `false` |
| `external_email_magic_link_disabled` | `false` | `true` | `false` |
| `jwt_exp` | `3600` | `300` | `3600` |
| `hook_custom_access_token_enabled` | `false` | `true` | `false` |
| `hook_send_email_enabled` | `false` | `true` | `false` |
| `hook_custom_access_token_uri` | Present, JSON `null` | `pg-functions://postgres/private_auth/custom_access_token_hook` | Present, JSON `null` |
| `hook_send_email_uri` | Present, JSON `null` | `pg-functions://postgres/private_auth/send_email_hook` | Present, JSON `null` |

सात-field delta में दोनों hook flags और canonical URI हैं। इन्हें छोड़ना evidence से justified नहीं है। Token hook mandatory claims enforcement देता है। Email Provider enabled होने पर Send Email Hook disabled रहने से Supabase docs के अनुसार SMTP email delivery संभव है। Signup और magic-link guardrails तथा `jwt_exp=300` की pilot acceptance condition भी retain हों। इसलिए reduction सिर्फ पहले से matching fields, session और rate controls, SMTP तथा अन्य unrelated settings को patch scope से बाहर रखने तक है। [Custom Access Token Hook](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook) · [Email sending behavior](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook)

### Phase B activation evidence

| Public Management request | HTTP | Dispatch → observed (UTC) | Result |
|---|---|---|---|
| Baseline `GET` | `200` | `2026-11-27T19:45:10.9969492Z` → `2026-11-27T19:45:11.3628994Z` | Seven-field typed preimage और सभी allowlisted retained controls matched। |
| Auth health `GET` | `200` | `2026-11-27T19:45:11.4183979Z` → `2026-11-27T19:45:12.3630812Z` | GoTrue `v2.199.0`। PostgreSQL `17.12` अलग SQL evidence में है। |
| Pre-PATCH drift `GET` | `200` | `2026-11-27T19:47:07.3529429Z` → `2026-11-27T19:47:08.6887884Z` | Entire observable baseline diff **0**। |
| Exact seven-field `PATCH` | `200` | `2026-11-27T19:47:08.7276370Z` → `2026-11-27T19:47:09.0309460Z` | सिर्फ़ approved settings send हुईं। |
| Independent configured `GET` | `200` | `2026-11-27T19:47:09.0313560Z` → `2026-11-27T19:47:09.2741322Z` | Scoped diff **0**, unrelated observable diff **0**। Dashboard में दोनों hooks `Enabled` और schema `private_auth` दिखे। |

**Exact deployed SQL inventory:** Transaction SHA-256 `cf2881c4cbc337f37c91aa3c03680e15355ea387c37e7ba3f19750296cf9de66`। एक schema `private_auth` (`postgres`, OID `17700`), दो PL/pgSQL routines और निम्न object grants। दोनों canonical bodies exact match हैं। [Reviewed source](../../../experiments/task06i/sql/hooks.sql)

| Routine | Signature | Owner / execution mode | Definition digest / OID |
|---|---|---|---|
| `private_auth.custom_access_token_hook` | `event jsonb → jsonb` | `postgres`, `SECURITY INVOKER`, empty `search_path` | `a6989abfbf07e253ff5f81d3edfb4072` / `17701` |
| `private_auth.send_email_hook` | `event jsonb → jsonb` | `postgres`, `SECURITY INVOKER`, empty `search_path` | `66708e821f524f9b959c0bf2d8a59bc9` / `17702` |

Non-owner grants में केवल `supabase_auth_admin` का schema `USAGE` और दोनों routines पर `EXECUTE` है। Grant options और `supabase_auth_admin` का schema `CREATE` absent हैं। Client-role effective access, PUBLIC grants और unexpected ACLs **0** हैं। Independent pre/post catalog inventory matched। Data API exposure में सिर्फ़ `public` और `graphql_public` selected थे। `private_auth` unselected था। Security Advisor lints **0**, Auth users/identities/sessions **0**, migration entries **0**, Edge Functions **0**। Hook bodies का hosted Auth invocation इस activation verification का हिस्सा नहीं था।

**Rollback evidence:** H6-RP R2 का hosted public proof दोनों flags और दोनों explicit-null URIs को cover करता है। Phase B ने सभी सात exact rollback values और owned SQL inventory mutation से पहले/उसके दौरान durable [journal](#phase-b-recovery-journal) में सुरक्षित रखीं। सभी postchecks पास होने के कारण Phase B rollback invoke नहीं हुआ। तीन additional scalar settings के hosted rollback का execution evidence इस receipt में उपलब्ध नहीं है। Phase B का short-lived PAT revoke हुआ और Dashboard reload पर absent सत्यापित हुआ। किसी बाद की rollback operation के लिए authorized scoped credential और fresh drift/ownership readback चाहिए।

**Phase C recommendation `NO-GO`:** Hosted exact-ID Admin seed create/confirm और same-provider local logout behavior, reviewed TEMP-only launcher and opaque key provenance, exact route/redirect/egress restrictions, hosted request accounting, और cold recovery operator/credential handoff अब भी verify होने हैं। Phase C pilot की अलग owner authorization चाहिए।

## Exact Auth-only pilot allowlist — NOT AUTHORIZED

एक run, एक run-created Option B synthetic `.invalid` seed और सिर्फ **HOOK-01 + SESSION-01**। Base origin केवल `https://wvdabiwbaavfggcmpizd.supabase.co`। `{seed_uuid}` launcher की उसी run में reserved और independently verified identity है। Listed path, method और query के बाहर कोई dispatch नहीं।

| Order | Method और exact path class | Purpose / PASS evidence |
|---:|---|---|
| 1 | `GET /auth/v1/admin/users/{seed_uuid}` | Exact reserved identity की initial absence |
| 2 | `POST /auth/v1/admin/users` | एक disposable seed creation, उसी reserved identity और run से bound |
| 3 | `GET /auth/v1/admin/users/{seed_uuid}` | Same-provider independent exact identity confirmation |
| 4 | `POST /auth/v1/token?grant_type=password` | HOOK-01, उसी seed का verified subject/session, password AMR, `amr_authenticated`, token lifetime ≤300 s |
| 5 | `GET /auth/v1/user` | SESSION-01, exact correlated seed/session का authenticated baseline |
| 6 | `POST /auth/v1/logout?scope=local` | उसी provider और exact session का scoped logout evidence |
| 7 | `DELETE /auth/v1/admin/users/{seed_uuid}` | Same-run verified seed, session और अन्य obligations साफ होने पर |
| 8 | `GET /auth/v1/admin/users/{seed_uuid}` | Independent Auth absence, durable terminal receipt, zero unresolved obligations |

Nominal **8** attempts। Shared hard ceiling **25**, pacing **1,000 ms**, cleanup reserve **0**। Remaining capacity कोई नया operation authorize नहीं करती। No Storage, refresh, external email, OTP, password update, sibling identity, Data API, Edge Function, redirect या automatic retry। Provisioning, verification और cleanup attempts सभी गिने जाएँ। [H5 request accounting](../../../experiments/task06i/h5-temp-readiness.md#exact-shared-request-costs)

## Recovery, rollback और अगला owner gate

- Target/config mismatch, identity conflict, unexpected email/session, ambiguous effect, missing proof, provider throttling या journal/cleanup failure पर pilot progress रोकें। Uncertain seed या session पर dependent deletion रोकें। Already-authorized exact cleanup की feasibility को journal और remaining budget से तय करें। Unknown effect, consumed ordinals और sanitized evidence preserve करें। Cold recovery में पर्याप्त proof न हो तो `RECOVERY_REQUIRED`, named owner handoff और कोई automatic replay नहीं।
- Future activation के rollback ledger में पाँच R1 values, दोनों URI की R3 Dashboard presence/type और verified H6-RP public restore method रखें। Phase B SQL और config activation के लिए अलग owner approval और fresh preflight चाहिए।
- Rollback में पहले नई admission रोकें और existing evidence preserve करें। Active obligations reconcile करें या residual के रूप में retain करें। Approved fields और objects पर drift check करें। दोनों activated hook flags को `false` पर लौटाएँ। Confirmed restore method से दोनों URI की prior state restore करें और बाकी बदले हुए fields को ऊपर के exact baselines पर लौटाएँ। Exact TEMP GET readback verify करें। फिर separately approved reverse SQL migration में activation से जोड़े गए grants, दोनों newly created exact-signature functions और newly created private schema को dependency order में हटाएँ। Schema drop से पहले उसके empty और unused होने की पुष्टि करें। Ambiguous readback, dependencies, partial writes या preimage loss पर रुकें। Pre-existing objects और grants scope से बाहर हैं।
- **Phase B TEMP activation `PASS` और Phase C pilot `NO-GO`।** Activation configuration verified है। अगला owner gate reviewed TEMP-only execution/recovery controls के साथ Phase C pilot के लिए है। LIVE admission और Production Real Auth blocked हैं।

REAL और Tio-world इस task से बाहर रहे। Hosted verification **0/18**, atomic conditional deletion **UNVERIFIED**, LIVE **BLOCKED**, Production Real Auth **STRICT NO-GO**।

## Phase B recovery journal

Run `H6-B-20261128-01` · baseline `cc1ac5cf77269368dde81bec486106033eb5c5a7` · target `wvdabiwbaavfggcmpizd` · recovery operator Codex root, interruption fallback repository owner।

TEMP Dashboard के Data API settings में `public` और `graphql_public` ही exposed candidates थे, और `private_auth` absent था। Auth Hooks Dashboard में कोई configured hook नहीं दिखा। दोनों observations read-only थीं। Exact URI presence/type के लिए public Management readback authoritative है। [TEMP Data API settings](https://supabase.com/dashboard/project/wvdabiwbaavfggcmpizd/integrations/data_api/settings)

Configured-state validation विफल हो या postchecks fail हों तो केवल captured सात fields restore करें, और fresh public `GET` से उनका type/presence/value तथा memory में unrelated observable config verify करें। Current state captured baseline या intended values से बाहर हो तो competing change पर overwrite करने की जगह `RECOVERY_REQUIRED` रखें। Known run-owned `private_auth` objects तभी हटाएँ जब config readback में उनका reference न हो। Unknown SQL outcome, unverifiable rollback, lost preimage या unowned object को unresolved रखें। सफल activation पर exact rollback standby रहता है। H6-RP hosted proof चार hook fields को cover करता है। अन्य तीन scalar fields की Phase B rollback plan में exact preimage रहेगा।

**Durable events**

- `PREPARED` · Owner scope, repository rules, exact seven-field manifest, independent SQL review और empty project baseline verified। Hosted write pending fresh config snapshot।
- [2026-11-27T19:45:12.3782685+00:00] CONFIG_PREIMAGE_DURABLE · TEMP exact seven-field JSON: {"disable_signup":false,"external_email_magic_link_disabled":false,"jwt_exp":3600,"hook_custom_access_token_enabled":false,"hook_custom_access_token_uri":null,"hook_send_email_enabled":false,"hook_send_email_uri":null}. Observed retained allowlist: {"external_anonymous_users_enabled":false,"external_phone_enabled":false,"mailer_otp_length":8,"mailer_otp_exp":3600,"external_email_enabled":true,"mailer_autoconfirm":false,"mailer_allow_unverified_email_sign_ins":false,"password_min_length":6,"refresh_token_rotation_enabled":true,"security_refresh_token_reuse_interval":10,"sessions_inactivity_timeout":0,"sessions_timebox":0,"sessions_single_per_user":false,"rate_limit_email_sent":2,"rate_limit_otp":30,"rate_limit_verify":30,"rate_limit_token_refresh":150,"smtp_max_frequency":60}. GoTrue v2.199.0. Raw configuration and token remain volatile.
- [2026-11-27T19:46:04.5755984+00:00] SQL_FIXTURES_INTENT · Exact TEMP-only transaction SHA-256: cf2881c4cbc337f37c91aa3c03680e15355ea387c37e7ba3f19750296cf9de66. Reviewed source bodies, invoker mode, postgres owner expected, two fixture routines and scoped grants. Initial schema absent and user/session counts zero. Ownership pending independent readback.
- [2026-11-27T19:47:06.8678959+00:00] SQL_FIXTURES_VERIFIED · Schema private_auth owner postgres OID 17700; routines custom_access_token_hook(jsonb) 17701/a6989abfbf07e253ff5f81d3edfb4072, send_email_hook(jsonb) 17702/66708e821f524f9b959c0bf2d8a59bc9. Both bodies match reviewed source. Invoker, fixed empty search_path, direct auth-admin USAGE and EXECUTE, zero client/excess ACL. SQL dispatch 2026-11-27T19:46:10.778Z through 2026-11-27T19:46:15.713Z. Auth users/identities/sessions zero.
- [2026-11-27T19:47:08.7174473+00:00] CONFIG_PATCH_INTENT · Exact seven-field target: {"disable_signup":true,"external_email_magic_link_disabled":true,"jwt_exp":300,"hook_custom_access_token_enabled":true,"hook_custom_access_token_uri":"pg-functions://postgres/private_auth/custom_access_token_hook","hook_send_email_enabled":true,"hook_send_email_uri":"pg-functions://postgres/private_auth/send_email_hook"}. Baseline and run-owned fixture identities are durable.
- [2026-11-27T19:47:09.2968231+00:00] CONFIG_VERIFIED · All seven values exact; unrelated observable diff zero. Waiting for independent database, Advisor and Dashboard postchecks.
- [2026-11-27T19:48:29.3814804+00:00] POSTCHECKS_VERIFIED · Independent catalog and Advisor verification: both run-owned invoker functions match reviewed bodies, owners and grants; zero auth users/identities/sessions, migration entries, edge functions and security lints. Dashboard shows both hooks enabled and Data API exposure marks public and graphql_public only.
- [2026-11-27T19:48:29.6201514+00:00] CONFIG_ACTIVATION_VERIFIED · Activation remains installed on exact TEMP. Failure rollback was armed and was not invoked.
- [2026-11-27T19:50:24.8871221+00:00] CREDENTIAL_REVOKED · Exact Phase B PAT revoked under owner authorization. Reloaded settled token list showed token absent. Local credential process terminated.
- [2026-11-27T19:50:24.9105286+00:00] TERMINAL_PHASE_B_PASS · No unresolved recovery obligations from this activation. The two run-owned invoker hooks and exact seven-field settings remain installed on TEMP. Phase C NO-GO and separate owner gate.

## H6-C0 — offline TEMP Auth admission

| Field | Value |
|---|---|
| Status | **REVIEW** · offline implementation and verification complete |
| Implementation owner | Codex root |
| Previous agent | None for C0 |
| Last commit agent | Codex root · H6-C0-R1 on `tnyx/h6-c0-r1-offline-auth`. The exact commit SHA is recorded on the pull request. |
| Baseline | `cc1ac5cf77269368dde81bec486106033eb5c5a7` on local and live GitHub `main` |
| Authority | Owner authorized H6-C0 offline implementation and local verification, then H6-C0-R1 commit, feature branch push and PR publication. Merge and any hosted pilot require separate owner authorization. |

Existing H5 exact-ID ownership, session correlation and H4 durable accounting remain the authority. C0 adds a separate Auth-only launcher and a run-bound deterministic transport policy for HOOK-01 + SESSION-01. The launcher has no hosted transport and retains the H1–H5 LIVE hard block. No hosted credentials are obtained or used for C0. [H5 closeout](../../archive/2026/local-20261127-task06i-b1-h5-seed-temp-readiness.md#h5-merged-closeout-receipt)

### C0 implementation and evidence

- `experiments/task06i/temp-auth-launcher.mjs` pins exact TEMP, two probes, Git HEAD and a content digest of ten runtime files. It gates the local rehearsal on an unexpired, one-run Ed25519 owner statement, the operator's independently established owner trust anchor and matching `im-tio` review evidence, and a private credential receipt bound to the same signed statement. The CLI defaults to zero-network planning. `--inspect-journal` performs local readback. Every execution flag is rejected. Tests use synthetic trust and keys. C0 does not establish real owner or provider key provenance.
- `experiments/task06i/temp-auth-operator-credentials.mjs` checks secure no-echo operator input, opaque key role and signed exact-TEMP fingerprints using local buffers. It clears the buffers on completion or failure and issues no credential-bearing result. The rehearsal transport uses fresh H5 mock keys. Future hosted dispatch still needs an independently reviewed adapter that can use equivalent process-local custody without a broad transport or credential fallback.
- `experiments/task06i/temp-auth-pilot-contract.mjs` and `experiments/task06i/hosted-probe-runner.mjs` restrict only the new registered C0 test transport to the exact HTTPS origin, method, query, route sequence and current seed UUID. The create and password-grant bodies must match the private seed before budget reservation. Redirects, generic or unreadable Admin 404s, unbound tokens and logout without a durable baseline fail closed. Session evidence binds exact seed UUID, exact issuer, session ID, credential and observed JWT lifetime no greater than 300 seconds. Generic 401/403 and unexpected successful logout statuses confer no revocation proof. Structured session absence retains H5's same-provider and baseline requirements.
- `experiments/task06i/temp-auth-launcher.test.mjs` covers signed admission, synthetic masked input, rejected requests, exact success order, no retries, response ambiguity, and a fresh-process recovery inspection after a real local crash following a durable dispatch marker. The nominal rehearsal consumed **8** attempts with standard 1,000 ms pacing. H5 owns cleanup authority within the shared ceiling of **25** and cleanup reserve **0**. The unchanged journal bounds are **512 events / 256 KiB**. Cold inspection never rebuilds ownership, recovers missing credentials or replays a request.
- `.ai/current.md` links this active review. This packet records scope, test evidence and the next owner gate. Main Protection ruleset `27218050` remains active, with strict App-owned `Commit attribution guard` integration `5032971`. [Live ruleset](https://github.com/im-tnyx/Tio-Workspace/rules/27218050)

### C0 verification

| Check | Actual result |
|---|---|
| Windows Node 24 Task 06I full suite | **570/570 PASS**, including 23 C0 tests and crash subprocess |
| Hardened cached `node:24-bookworm` Task 06I suite | **570/570 PASS** with `--pull never`, `--network none`, no added capabilities, no-new-privileges, read-only root/source and writable tmpfs |
| Standalone PostgreSQL contract parity | PostgreSQL **17.11**, **18/18** `POSTGRES_VERIFIED` over isolated local Docker fixtures |
| Attribution and guard integrity | **142/142** and **14/14 PASS** in hardened cached Docker |
| `npm.cmd run verify` | **PASS**, including **22/22** root shell tests |
| Pinned Supabase CLI | Existing executable reported **2.121.0** using read-only CLI commands and telemetry opt-out. Local parity ran via the repository's PostgreSQL Docker harness |
| Independent implementation review | `phaseb_review` **PASS** for final working-tree runtime digest `5e81720a6a43e048b4467a2c9718f23a6e111b516d0e370d3ab8774745176672` at baseline `cc1ac5c`. Review is recorded here and is separate from GitHub approval |

### Provider contract and scope of the review gate

GoTrue `v2.199.0` assigns a parsed caller-supplied `id` before Admin insert. Its exact-user lookup distinguishes `UserNotFound` from invalid UUID input. The public Admin client docs describe the create operation. Managed edge/gateway forwarding of the supplied UUID, response shape, exact-ID independent read and conditional ownership of deletion still need hosted verification. [GoTrue Admin source](https://github.com/supabase/auth/blob/v2.199.0/internal/api/admin.go#L445) · [Official Admin create reference](https://supabase.com/docs/reference/javascript/auth-admin-createuser)

GoTrue `scope=local` targets the current session and returns HTTP 204 on success. Structured same-provider absence cannot override missing credential, identity or baseline evidence. Access JWTs may remain usable until expiry, depending on the consumer. C0 grants no immediate stateless JWT invalidation proof. Managed same-provider local logout and Auth response classifications remain pilot verification items. [GoTrue logout source](https://github.com/supabase/auth/blob/v2.199.0/internal/api/logout.go#L21) · [Official sign-out scopes and expiry](https://supabase.com/docs/guides/auth/signout)

**Next owner gate:** `im-tio` reviews the exact pull request HEAD and runtime digest against source and tests. Review focus includes the P2 dispatch expiry defect, forbidden origin/method/query/body, owner trust provisioning, provider key provenance, JWT/session correlation, durable crash accounting and exact-delete proof. A separate hosted adapter review must establish immutable reviewed checkout and owner trust, real opaque key injection, hard egress/no-redirect transport and independent cold recovery before any hosted pilot authorization. C0 remains at **REVIEW** with Phase C **NO-GO**.

### C0 dispatch expiry review follow-up

- The independent review returned `CHANGES REQUIRED` for patch SHA-256 `276ced6bb02ec87f72588d832bd8ca77643007b032f032047ee943bd8a809558` and runtime digest `5e81720a6a43e048b4467a2c9718f23a6e111b516d0e370d3ab8774745176672`. Its synthetic run observed the password exchange 902 ms after the signed deadline. The owner authorized the local correction.
- C0 carries the signed deadline to the shared budget. The budget checks it after pacing, before reservation and before the durable dispatch marker. The transport also checks immediately before fixture dispatch. Expiry closes admission for every remaining request. The journal preserves existing obligations and any durable reservation. Cleanup after expiry requires separate explicit authority and independently verified proof.
- The regression expires authorization immediately after durable seed verification. Windows Node 24 and hardened network-disabled Docker each passed **571/571** tests. The regression verifies three dispatched attempts, no password exchange or cleanup request, and a verified seed obligation still present after journal reopen.
- The tested Windows working-tree runtime SHA-256 is `f45870ce8f589bbd9b006cc22bbcbd1c5a6033d2a9fcd64128b42c04c9a4647b` at baseline `cc1ac5cf77269368dde81bec486106033eb5c5a7`. The digest hashes raw bytes. The pull request records the exact feature HEAD and the runtime digest from its Git blob bytes for independent `im-tio` review. Earlier approvals and test receipts refer to their recorded digests.

### C0-R2 monotonic deadline remediation

- Independent `im-tio` review on PR #51 HEAD `f75e821f5c2bddba197ef69f13792713bcf25500` raised a P2 finding (`#discussion_r4725408399`, thread `PRRT_kwDOVtCmZc68_8OB`) that a partial backward wall-clock adjustment staying above the last persisted dispatch timestamp could extend a signed authorization past its elapsed lifetime. The owner authorized H6-C0-R2 targeted remediation on existing PR #51.
- `prepareTempAuthRehearsal` in `experiments/task06i/temp-auth-launcher.mjs` now binds verified signed authorizations to an immutable monotonic deadline alongside UTC `expiresAt` (`maxWallMinusMono = Math.max(maxWallMinusMono, wallNow - monoNow)`, `Math.min` across revalidation for a receipt, pre-TTY and post-TTY checks in `verifyOperatorInput`, and pre-admission checks in `run`). Clock rollback cannot extend the deadline for the same receipt or a distinct signed authorization on the rehearsal.
- `run-request-budget.mjs` (`beginRequest`) requires paired `dispatchDeadline` and `monotonicDeadline`, validates finite bounds, and checks both wall (`Date.now()`) and monotonic (`performance.now()`) deadlines post-pacing before `journal.reserve` and post-reservation immediately before `journal.dispatch`, including `cleanup` requests (`auth_logout`, `auth_delete`). `hosted-probe-runner.mjs` (`executeBudgetedRequest`, `executeCurrentTransportRequest`, `createTempAuthPilotFixtureTransport`, `deterministicFixtureTransport`) forwards `monotonicDeadline` and enforces both `Date.now() >= pilot.expiresAt || performance.now() >= pilot.monotonicExpiresAt` immediately before fixture dispatch.
- Deterministic regression tests in `experiments/task06i/temp-auth-launcher.test.mjs` and `experiments/task06i/run-request-budget.test.mjs` verify: mid-run partial clock rollback during `standard` pacing blocks subsequent dispatches (`observedRequests === 3`, `consumed === 3`) while preserving `RECOVERY_REQUIRED`, `CREATION_VERIFIED`, and `'auth'` volatile residual; rollback across revalidation/distinct authorization/fixture entry fails closed without TTY prompting or dispatch extendability; and cleanup monotonic expiry between `journal.reserve` and `journal.dispatch` blocks dispatch while preserving the durable reservation.
- Validation after final edit: independent read-only audit returned `PASS`; Windows Node 24 Task 06I passed **574/574**, hardened network-disabled Docker (`node:24-bookworm`) passed **574/574**, Task 06H passed **115/115**, PostgreSQL 17.11 parity passed **18/18** (`POSTGRES_VERIFIED`), `npm run verify` passed (`22/22` tests, zero lint/typecheck/token warnings), `check_guard_integrity_test` passed **14/14**, and Windows MSYS `check_commit_attribution_test` ran **139 passed, 3 failed** (known Windows MSYS locale limitation; Linux CI authoritative). The tested Windows working-tree 10-file raw-byte runtime SHA-256 is `efb97226f8e869ced7774c434cad89a5641f919e65c524740a30e0659295ca58` and the exact committed Git-blob 10-file raw-byte runtime SHA-256 (`readTempAuthRuntimeIdentity()`) is `38f1f697dad9026c7d5a588376bddfe503a21477a7833c582c60575be943f6a4` (reconciled from an earlier ad-hoc check that decoded UTF-8 strings and hashed UTF-16 code-unit length `587021` instead of UTF-8 byte length `587023` on `hosted-probe-runner.mjs`).

Hosted verification **0/18** · Atomic conditional deletion **UNVERIFIED** · LIVE **BLOCKED** · Production Real Auth **STRICT NO-GO**.
