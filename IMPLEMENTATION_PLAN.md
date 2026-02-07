# Implementation Plan -- Daily Platypus Facts

## Status Summary

Priorities 1-36 are implemented and committed. A comprehensive spec-vs-implementation audit has identified **6 remaining priorities** covering unsubscribe routes, daily send email, animated platypus, and CLI enhancements.

- **391 tests passing** across 23 test files with **835 expect() calls**
- **Type check clean**, **lint clean**
- **28 real platypus facts** sourced and seeded with AI-generated illustrations
- **Latest tag**: 0.0.23
- **SMS-only spec compliance**: ~100%
- **Full spec compliance**: ~90% (unsubscribe routes, daily send email, animated platypus still remaining)

### What Exists (Priorities 1-27)

- Config has `nodeEnv` field, Twilio/Postmark vars nullable in dev, required in production (P29 complete).
- Database has 4 tables. `subscribers` has `phone_number TEXT UNIQUE` (nullable), `email TEXT UNIQUE`, `token TEXT NOT NULL UNIQUE` (P30 complete).
- Subscriber DAL has `findByPhoneNumber`, `findByEmail`, `findByToken`, `createSubscriber(db, { phone?, email? })`, `updateStatus`, `updateContactInfo`, `getActiveCount`, `getActiveSubscribers` (P31 complete).
- Subscription flow is email-aware (P34 complete): `signup(db, smsProvider, { phone?, email? }, maxSubscribers, baseUrl, emailProvider?)`. Includes conflict detection (phone→A, email→B), email validation, confirmation emails, "already subscribed" emails, channel-aware messages.
- `handleIncomingMessage(db, from, body, baseUrl, maxSubscribers)` unchanged (SMS-only, phone lookup).
- SMS provider falls back to DevSmsProvider when Twilio vars are missing (P33 complete). Dev provider stores messages in memory with sequential IDs, logs to console, validates all webhooks.
- Image generation uses fixed style prompt with no-text instruction (P28 complete).
- Email provider abstraction complete (P32): `EmailProvider` interface, Postmark implementation, dev email provider, factory function `createEmailProvider(config)`. Email templates for daily fact, confirmation, and already-subscribed. `escapeHtml`/`isSafeUrl` extracted to shared `src/lib/html-utils.ts`. `makeMockEmailProvider()` in test-utils. `unsubscribeHeaders()` for RFC 8058 List-Unsubscribe support.
- Subscribe endpoint accepts `{ phoneNumber?, email? }` (at least one required). Passes baseUrl and emailProvider to subscription flow (P34 complete).
- Signup page has phone and email inputs, "and / or" divider, client-side validation (at least one required), description says "via SMS and/or email" (P35 complete). No animated swimming platypus.
- Daily send is SMS-only with null phone guard. No email sending. No `--force` flag. No `NODE_ENV` check.
- `GET /confirm/:token` route with all confirmation states (P36 complete). Reusable `renderMessagePage` helper for status pages.
- No routes for `/unsubscribe/:token`, `/dev/messages`.

---

## Remaining Work -- Prioritized

### ~~Priority 34: Subscription flow -- email awareness~~ -- DONE (0.0.21)

### ~~Priority 35: Signup form -- accept email~~ -- DONE (0.0.22)

### ~~Priority 36: Email confirmation route (`GET /confirm/:token`)~~ -- DONE (0.0.23)

### Priority 37: Unsubscribe routes (`GET/POST /unsubscribe/:token`)

**Spec**: `specs/web-pages.md`, `specs/subscription-flow.md`
**Gap**: No routes for `/unsubscribe/:token` exist in `src/index.ts`.

- Add route pattern matching for `GET /unsubscribe/:token` and `POST /unsubscribe/:token` in `index.ts`
- Create unsubscribe page handlers:
  - `GET`: show confirmation page ("Are you sure you want to unsubscribe?")
  - `POST`: process unsubscribe, update status to `unsubscribed`, set `unsubscribed_at`, show success page
  - Invalid/missing token: show appropriate error
- Unsubscribing via email link unsubscribes from ALL channels (one status model)
- CSS for unsubscribe pages (consistent with existing LiS:DE theme)
- Tests for all unsubscribe states

### Priority 38: Daily send job -- email channel support

**Spec**: `specs/daily-job.md`, `specs/email-integration.md`
**Gap**: `runDailySend` in `src/jobs/daily-send.ts` only sends SMS. No email sending. The function also assumes `subscriber.phone_number` is always a non-null string (lines 101, 105).

- Update `runDailySend` to accept `EmailProvider` parameter (or null)
- For each active subscriber:
  - If has phone -> send SMS/MMS (existing)
  - If has email -> send daily fact email (new)
  - Subscribers with both receive both
- Handle null `phone_number` for email-only subscribers (skip SMS) and null `email` for phone-only subscribers (skip email)
  - **Critical**: line 101 `subscriber.phone_number` and line 105 `subscriber.phone_number.slice(-4)` will crash for email-only subscribers -- must guard with null check
- Log results broken down by channel (SMS success/fail, email success/fail)
- Update `DailySendResult` to include per-channel counts (smsSuccess, smsFail, emailSuccess, emailFail)
- Tests for email sending, dual-channel, email-only, and phone-only subscribers

### Priority 39: Dev message viewer routes

**Spec**: `specs/web-pages.md`, `specs/design-decisions.md`
**Gap**: No `/dev/messages` or `/dev/messages/:id` routes exist in `src/index.ts`.

- Add routes to `index.ts` (only when dev providers are active / `nodeEnv === "development"`):
  - `GET /dev/messages` -- lists all sent messages (SMS + email, newest first) with recipient, type, subject/preview, and timestamp
  - `GET /dev/messages/:id` -- displays specific message (renders HTML for email, text for SMS)
- Create page rendering functions for dev message viewer
- Never available in production (guard on `nodeEnv`)
- Tests for dev viewer routes

### Priority 40: CLI `--force` flag for daily-send

**Spec**: `specs/cli.md`
**Gap**: No `--force` flag parsing in `src/jobs/daily-send.ts` CLI entry point (`import.meta.main` block).

- Parse `process.argv` for `--force` in the `import.meta.main` block
- When `--force`: bypass idempotency check (send even if already sent today)
- Reject `--force` when `NODE_ENV=production`: exit with error "The --force flag is not allowed in production."
- When `--force` re-sends, do NOT create duplicate `sent_facts` entry (skip recording if today already has an entry)
- Update `runDailySend` to accept a `force?: boolean` parameter
- Tests for --force behavior and production rejection

### Priority 41: Animated swimming platypus on signup page

**Spec**: `specs/web-pages.md`
**Gap**: Signup page has no animated swimming platypus. Spec says: "An animated swimming platypus cartoon prominently displayed on the page. The animation should be implemented with CSS (keyframe animations on an SVG or image element) -- no JavaScript animation libraries, no GIFs, no external dependencies."

- Create an inline SVG platypus illustration for the signup page
- Add CSS keyframe animations for a looping, fluid swimming motion
- Place prominently on the page (in the hero section or between hero and form)
- Requirements:
  - CSS-only animation (no JS animation libraries)
  - No GIFs, no external dependencies
  - Looping, fluid swimming motion
  - Delightful without being distracting
  - Consistent with LiS:DE warm, indie, handcrafted aesthetic
- This is independent of email work but requires design creativity
- Update any CSS in `public/styles.css` as needed

### Priority 42: Comprehensive integration tests for email flows

- End-to-end signup with email only, phone only, and both
- Email confirmation flow (click link -> activate)
- Email unsubscribe flow (click link -> unsubscribe)
- Dual-channel daily send (subscriber gets both SMS and email)
- Conflict detection (phone matches subscriber A, email matches subscriber B)
- Re-subscribe via website with email
- Dev message viewer displays both SMS and email messages

### Priority 43: Update infrastructure configs for email

- Add `POSTMARK_API_TOKEN` and `EMAIL_FROM` to:
  - `.env.example`
  - `config/deploy.yml` (secret)
  - `.github/workflows/deploy.yml` (secret passthrough)
- Add `NODE_ENV=production` to `config/deploy.yml` `env.clear` section
- Update `README.md` to mention email support and new env vars
- Update `CLAUDE.md` architecture section to reflect email provider, dev providers, new routes

---

## What Was Built (Priorities 1-27)

| Priority | Description | Tag |
|----------|-------------|-----|
| 1 | Project bootstrapping (package.json, tsconfig, deps, directory structure, Biome) | 0.0.1 |
| 2 | Configuration and environment (typed config, env var validation, fail-fast) | 0.0.1 |
| 3 | Database setup (SQLite via bun:sqlite, WAL mode, 4-table schema) | 0.0.1 |
| 4 | Testing infrastructure (in-memory DB factory, mock SMS provider, test data builders) | 0.0.1 |
| 5 | Database unit tests (schema, constraints, cascades, pragmas) | 0.0.1 |
| 6 | Phone number validation (E.164 normalization, NANP rules) | 0.0.1 |
| 7 | SMS templates (all message content matching specs exactly) | 0.0.1 |
| 8 | SMS provider abstraction + Twilio implementation (SmsProvider interface, TwiML) | 0.0.1 |
| 9 | Seed data file and sync script (facts.json, upsert logic, validation) | 0.0.1 |
| 10 | Subscriber data access layer (CRUD, status transitions, cap checks) | 0.0.1 |
| 11 | Fact data access layer (queries for cycling, sent_facts tracking) | 0.0.1 |
| 12 | Subscription flow logic (signup, double opt-in, STOP, all edge cases) | 0.0.1 |
| 13 | Rate limiting (in-memory IP-based, fixed window, 5/hour, cleanup) | 0.0.1 |
| 14 | Fact cycling algorithm (new-first, cycle tracking, re-randomization) | 0.0.1 |
| 15 | Web server and routes (Bun.serve, router, health/subscribe/webhook/pages) | 0.0.2 |
| 16 | Web pages and themed design (signup page, fact page, LiS:DE styling, a11y) | 0.0.2 |
| 17 | Daily send job (standalone script, fact sync, cycling, SMS delivery, idempotency) | 0.0.2 |
| 18 | Integration tests and validation (end-to-end flow tests, type check, lint) | 0.0.3 |
| 19 | Infrastructure and deployment (Dockerfile, Kamal config, GitHub Actions, cron) | 0.0.4 |
| 20 | Final polish and launch preparation (README, templates, attribution, seed data) | 0.0.5 |
| 21 | AI-generated fact images with DALL-E 3 and MMS delivery | 0.0.8 |
| 22 | Audit fixes: `unsubscribed_at` bug fix + 19 security/validation tests | 0.0.9 |
| 23 | Test coverage hardening: 50 tests for config validation, route edge cases, subscription flow | 0.0.11 |
| 24 | Spec compliance audit: 5 fixes (webhook URL, placeholder, re-signup capacity, image dir, docs) | 0.0.12 |
| 25 | Deployment fixes: GitHub Actions secrets, Kamal deploy docs, VPS setup instructions | 0.0.13 |
| 26 | Invalid API key early detection: bail on first auth failure, skip remaining images | 0.0.14 |
| 27 | Production hardening: busy_timeout, race condition safety nets, request body size limit | 0.0.15 |
| 28 | Image generation prompt fix: fixed style prompt, no-text instruction, removed factText param | 0.0.16 |
| 29 | NODE_ENV-based config: nodeEnv field, Twilio/Postmark nullable in dev, required in production | 0.0.17 |
| 30-31 | DB schema (email, token, nullable phone) + subscriber DAL (findByEmail/Token, updateContactInfo) | 0.0.18 |
| 32 | Email provider (EmailProvider interface, Postmark, dev provider, factory, templates, html-utils extraction) | 0.0.19 |
| 33 | Dev SMS provider (DevSmsProvider with in-memory storage, factory fallback) | 0.0.20 |
| 34 | Subscription flow email awareness (email validation, conflict detection, dual-channel confirmations, channel-aware messages) | 0.0.21 |
| 35 | Signup form email support (email input, "and / or" divider, client-side validation, updated description) | 0.0.22 |
| 36 | Email confirmation route (`GET /confirm/:token`) with all states, reusable message page helper | 0.0.23 |

---

## Dependency Graph

```
P41 (Animated swimming platypus) ─── independent, can be done anytime

P30-36 (DB + DAL + Email + Dev SMS + Sub flow + Form + Confirm) ─ DONE ──┐
                                                  │
P37 (Unsubscribe routes) ──────────────────────┤
                                                  │
P38 (Daily send: email channel) ────────────────┤
                                                  │
P39 (Dev message viewer) ──────────────────────┤
                                                  │
P40 (CLI --force flag) ─────────────────────────┤
                                                  │
P42 (Integration tests for email) ──────────────┘

P43 (Infra configs for email) ─── last
```

### Dependency Details

- **P30-34** (DB schema + DAL + email provider + dev SMS provider + subscription flow) are complete. All downstream priorities can now use subscriber DAL functions, email/SMS providers, email templates, and the email-aware subscription flow.
- **P36** and **P37** depend on P32 (email templates for context) and P30-31 (token lookup -- already done).
- **P38** (daily send email) depends on P32 (email provider) and P34 (updated subscriber types).
  - **Must fix null phone_number crash**: `subscriber.phone_number.slice(-4)` in daily-send.ts will throw for email-only subscribers.
  - **Should add per-channel result breakdown** to `DailySendResult`.
- **P39** (dev viewer) depends on P32 (dev email provider) and P33 (dev SMS provider) for stored messages.
- **P40** (--force) depends on P29 (NODE_ENV for production rejection).
- **P41** (animated platypus) is fully independent. Can be done at any time.
- **P42** (integration tests) depends on all feature work being complete.
- **P43** (infra configs) is intentionally last -- updates deploy configs and documentation.

---

## Detailed Gap Inventory (43 items across 15 priorities)

For reference, here is the complete gap inventory mapped to their priorities:

### ~~In P30 (DB schema)~~ -- DONE (0.0.18):
~~7. `phone_number TEXT NOT NULL UNIQUE` should be `TEXT UNIQUE` (nullable)~~
~~8. No `email TEXT UNIQUE` column~~
~~9. No `token TEXT NOT NULL UNIQUE` column~~
~~10. `Subscriber` TypeScript interface missing `email`, `token`, nullable `phone_number`~~

### ~~In P31 (Subscriber DAL)~~ -- DONE (0.0.18):
~~11. No `findByEmail()` function~~
~~12. No `findByToken()` function~~
~~13. `createSubscriber()` doesn't accept email or generate token~~
~~14. No `updateContactInfo()` function~~

### ~~In P32 (Email provider)~~ -- DONE (0.0.19):
~~15. No `EmailProvider` interface~~
~~16. No Postmark implementation~~
~~17. No dev email provider~~
~~18. No email templates (daily fact, confirmation, already subscribed)~~
~~19. No `List-Unsubscribe` / `List-Unsubscribe-Post` headers~~
~~20. `escapeHtml` / `isSafeUrl` not in shared utility (locked in pages.ts)~~
~~21. No `makeMockEmailProvider()` in test-utils~~

### ~~In P33 (Dev SMS provider)~~ -- DONE (0.0.20):
~~22. `createSmsProvider()` throws instead of falling back to dev provider~~

### ~~In P34 (Subscription flow email awareness)~~ -- DONE (0.0.21):
~~23. `signup()` is phone-only (no email param, no EmailProvider param)~~
~~24. No conflict detection (phone → A, email → B)~~
~~25. No email validation function (basic `@` + domain check)~~
~~26. No confirmation email sent on signup~~
~~27. No "already subscribed" email sent on re-signup~~
~~28. Signup success messages say "check your phone" only~~
~~29. Subscribe endpoint accepts only `{ phoneNumber: string }` (moved from P35; now accepts `{ phoneNumber?, email? }`)~~

### ~~In P35 (Signup form)~~ -- DONE (0.0.22):
~~30. Signup page has no email input field~~
~~31. Signup page description says "via SMS" not "via SMS and/or email"~~

### ~~In P36 (Confirmation route)~~ -- DONE (0.0.23):
~~33. No `GET /confirm/:token` route~~
~~34. No confirmation page HTML templates (success, already-confirmed, invalid, at-capacity)~~

### In P37 (Unsubscribe routes):
35. No `GET /unsubscribe/:token` route
36. No `POST /unsubscribe/:token` route
37. No unsubscribe page HTML templates (confirmation, success, invalid)

### In P38 (Daily send email):
38. `runDailySend` is SMS-only (no EmailProvider param)
39. `subscriber.phone_number.slice(-4)` crashes for email-only subscribers (null)
40. `DailySendResult` has no per-channel breakdown

### In P39 (Dev message viewer):
41. No `/dev/messages` route
42. No `/dev/messages/:id` route

### In P40 (CLI --force):
43. No `--force` flag parsing in daily-send `import.meta.main` block

### In P41 (Animated platypus):
44. No animated swimming platypus on signup page (spec requires CSS keyframe animation on SVG)

### In P43 (Infra configs):
45. No `POSTMARK_API_TOKEN` / `EMAIL_FROM` in deploy configs
46. No `NODE_ENV=production` in deploy config

---

## Known Spec Gaps and Recommendations

### Error Handling and Logging Strategy
- No spec covers structured logging. Using `console.log`/`console.error` for v1.

### Database Backup Implementation
- Defer to post-launch. Start with simple daily cron backup.

### MMS Cost Impact
- MMS ~$0.02/message vs SMS ~$0.008/segment. At 2-3 segments per SMS (UCS-2 encoding from duck emoji), MMS is comparable or cheaper while delivering illustrations inline.

### Phone Number NOT NULL Migration
- SQLite does not support `ALTER TABLE ... ALTER COLUMN`. Existing databases will retain the NOT NULL constraint on phone_number. New databases created after the schema update will have nullable phone_number. This is acceptable since all existing subscribers are phone-only. If needed in the future, a full table recreation migration can be added.
