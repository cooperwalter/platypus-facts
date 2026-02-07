# Implementation Plan -- Daily Platypus Facts

## Status Summary

All 27 priorities are implemented and committed. A full spec-vs-implementation audit (Priority 24) confirmed **100% spec compliance** across all spec files, with subsequent fixes maintaining compliance.

- **269 tests passing** across 16 test files with **596 expect() calls**
- **Type check clean**, **lint clean**
- **28 real platypus facts** sourced and seeded
- **Latest tag**: 0.0.15
- **Spec compliance**: 100% (confirmed by comprehensive audit)

### Remaining Work (Manual Testing Only)

These require a running server with Twilio credentials:

- End-to-end manual test of full signup/confirm/daily-send flow
- Manual test of STOP (unsubscribe) flow
- Manual test of re-subscribe flow

---

## What Was Built

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

---

## Priority 21: AI-Generated Fact Images (tag: 0.0.8)

Each platypus fact has an AI-generated illustration (minimalist line drawing style) displayed on the web and attached as MMS in daily SMS messages. Added 3 new files, modified 21 existing files, 26 new tests.

Key design decisions:
- **OPENAI_API_KEY is optional** -- server never calls OpenAI; only the sync script does
- **Raw `fetch` instead of OpenAI SDK** -- single POST endpoint, no heavy dependency
- **Dual migration for `image_path`** -- `CREATE TABLE` for fresh DBs, `ALTER TABLE` for existing
- **Image generation runs after sync transaction** -- network I/O outside DB transaction for graceful degradation

---

## Priority 22: Audit Fixes and Security Tests (tag: 0.0.9)

Fixed `unsubscribed_at` not clearing on re-subscription (code passed `undefined` instead of `null` to `updateStatus()`). Added 19 tests covering XSS prevention (`escapeHtml`, `isSafeUrl`), XML escaping in TwiML, re-subscription fix verification, signup page tagline, and 8 seed data validation edge cases. Updated spec to reflect DALL-E 3's 1024x1024 minimum image size.

---

## Priority 23: Test Coverage Hardening (tag: 0.0.11)

Added 50 tests: 32 config validation tests (all env var validation paths, defaults, boundary values), 18 route handler edge case tests (404 page, fact page, `getClientIp`, subscribe body validation, webhook error handling, signup page at capacity), and 1 subscription flow edge case (STOP from unknown sender).

---

## Priority 24: Spec Compliance Audit Fixes (tag: 0.0.12)

Full spec-vs-implementation audit uncovered 5 actionable issues, all fixed:

1. **Webhook URL for Twilio signature validation** (critical) -- `createSmsProvider()` now accepts and forwards `webhookUrl` for correct validation behind Traefik proxy
2. **Phone input placeholder** -- changed from invalid `(555) 123-4567` to spec-compliant `(555) 823-4567`
3. **Unsubscribed re-signup capacity check** -- removed incorrect capacity check per spec ("does not count against the cap since the row already exists")
4. **Image output directory** -- added `mkdirSync` before `Bun.write()` to ensure directory exists on fresh deployments
5. **Rate limiter documentation** -- corrected "sliding window" to "fixed window" in CLAUDE.md

---

## Priority 25: Deployment Fixes (tag: 0.0.13)

GitHub Actions workflow was missing secret environment variables needed by Kamal to deploy application secrets (`BASE_URL`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `OPENAI_API_KEY`). Without these, Kamal deploy would fail to pass secrets to the container. Also added documentation comments to `config/deploy.yml` for placeholder values and VPS host directory setup instructions to `CRON_SETUP.md`.

---

## Priority 26: Invalid API Key Early Detection (tag: 0.0.14)

Spec requires that when `OPENAI_API_KEY` is set but invalid, the sync script detects the auth failure on the first DALL-E API call and skips all remaining image generation with a single warning — rather than repeating the same error for every fact.

Added `ImageAuthError` class in `image-generation.ts` that is thrown on 401/403 responses and re-thrown through the catch-all handler. The sync loop in `sync-facts.ts` catches `ImageAuthError`, logs one warning, counts remaining facts as failed, and breaks. Also committed spec clarifications marking `OPENAI_API_KEY` as optional in `fact-images.md` and `infrastructure.md`. 4 new tests (2 in image-generation, 2 in sync-facts).

---

## Priority 27: Production Hardening (tag: 0.0.15)

Deep edge case audit found four production-readiness issues, all fixed:

1. **SQLite busy_timeout** -- Added `PRAGMA busy_timeout=5000` to both `createDatabase` and `createInMemoryDatabase`. Without this, the HTTP server and daily-send cron (separate processes sharing the same SQLite file) could get immediate `SQLITE_BUSY` errors on write contention instead of retrying for up to 5 seconds.

2. **Daily-send race condition safety net** -- `runDailySend` now catches `UNIQUE constraint failed` on `sent_facts.sent_date` and returns `alreadySent: true` instead of crashing. This handles the narrow window where two concurrent daily-send processes both pass the idempotency check but only one can INSERT.

3. **Signup UNIQUE constraint retry for all statuses** -- The existing race condition handler in `signup()` only handled `pending` status on retry. Now handles `active` (sends already-subscribed message) and `unsubscribed` (resets to pending) statuses, preventing a 500 error in an extremely narrow race window.

4. **Request body size limit** -- `/api/subscribe` now rejects payloads over 4KB (413 status) via both `Content-Length` header check and actual body length check. Prevents memory exhaustion from oversized POST bodies on this unauthenticated endpoint.

5 new tests: 1 busy_timeout pragma, 1 daily-send race handling, 3 body size limit (over-limit header, over-limit body, under-limit acceptance).

---

## Known Spec Gaps and Recommendations

### Error Handling and Logging Strategy
- No spec covers structured logging. Using `console.log`/`console.error` for v1.

### Database Backup Implementation
- Defer to post-launch. Start with simple daily cron backup.

### MMS Cost Impact
- MMS ~$0.02/message vs SMS ~$0.008/segment. At 2-3 segments per SMS (UCS-2 encoding from duck emoji), MMS is comparable or cheaper while delivering illustrations inline.
