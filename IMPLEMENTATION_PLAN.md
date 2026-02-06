# Implementation Plan -- Daily Platypus Facts

## Status Summary

All 20 priorities are implemented. The application is feature-complete and ready for manual end-to-end testing with Twilio credentials, followed by production deployment.

- **164 tests passing** (148 unit + 16 integration) across 15 test files
- **Type check clean**, **lint clean**
- **28 real platypus facts** sourced and seeded

Three items remain that require a running server with Twilio credentials:
- End-to-end manual test of full signup/confirm/daily-send flow
- Manual test of STOP (unsubscribe) flow
- Manual test of re-subscribe flow

---

## Priorities 1-17: Core Application (Complete)

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
| 13 | Rate limiting (in-memory IP-based, 5/hour sliding window, cleanup) | 0.0.1 |
| 14 | Fact cycling algorithm (new-first, cycle tracking, re-randomization) | 0.0.1 |
| 15 | Web server and routes (Bun.serve, router, health/subscribe/webhook/pages) | 0.0.2 |
| 16 | Web pages and themed design (signup page, fact page, LiS:DE styling, a11y) | 0.0.2 |
| 17 | Daily send job (standalone script, fact sync, cycling, SMS delivery, idempotency) | 0.0.2 |

---

## Priority 18: Integration Tests and Validation (tag: 0.0.3)

- [x] All unit tests from Priorities 5-17 pass (`bun test`)
- [x] Integration tests for end-to-end flows (`src/integration.test.ts`):
  - Full signup flow: web signup -> pending -> welcome SMS -> reply "PERRY" -> active -> confirmation SMS
  - Full signup flow with "1" confirmation keyword
  - Daily send job: facts synced -> fact selected -> SMS sent to active subscribers -> recorded in sent_facts
  - Fact sync: seed file loaded -> facts inserted -> re-sync idempotent -> new facts added
  - Unsubscribe flow: active subscriber sends STOP -> unsubscribed -> excluded from daily sends
  - Re-subscribe flow: unsubscribed -> web signup -> pending -> confirm -> active
  - Cap enforcement end-to-end: fill to cap -> reject -> unsubscribe one -> allow
  - Pending subscriber cannot confirm when cap reached between signup and confirmation
- [x] Type check passes with zero errors (`bunx tsc --noEmit`)
- [x] Lint passes with zero errors (`bunx biome check .`)

---

## Priority 19: Infrastructure and Deployment (tag: 0.0.4)

- [x] `Dockerfile` (multi-stage: build with `bun install --frozen-lockfile`, production with fact sync + server start)
- [x] `.dockerignore` (node_modules, .git, .env, *.db, *.db-shm, *.db-wal, specs/)
- [x] `config/deploy.yml` (Kamal config: GHCR registry, health check, SQLite volume mount, env vars)
- [x] `.github/workflows/deploy.yml` (GitHub Actions: test job with Bun, deploy job with Docker + Kamal)
- [x] `CRON_SETUP.md` (crontab `docker exec` pattern, log rotation, verification steps)

---

## Priority 20: Final Polish and Launch Preparation (tag: 0.0.5)

- [x] `README.md` with "Inspired by Life is Strange: Double Exposure" attribution
- [x] All SMS templates verified character-for-character against specs
- [x] Daily fact SMS format verified (duck emoji + fact text + sources URL)
- [x] SMS length confirmed: all 28 facts under 100 chars, 2-3 UCS-2 segments per message
- [x] Signup page displays Platypus Fan count/cap with correct terminology
- [x] Fact page renders sources with clickable links (title or URL fallback)
- [x] Attribution appears on: signup page, fact page, welcome SMS, README
- [x] `data/facts.json` populated with 28 real platypus facts from Wikipedia, Australian Museum, NHM, Britannica, National Geographic, San Diego Zoo, and scientific journals
- [ ] **REQUIRES MANUAL TESTING** -- End-to-end manual test of full flow (requires running server with Twilio credentials)
- [ ] **REQUIRES MANUAL TESTING** -- Test STOP flow manually (requires Twilio)
- [ ] **REQUIRES MANUAL TESTING** -- Test re-subscribe flow manually (requires Twilio)

---

## Known Spec Gaps and Recommendations

The following areas are referenced across the specs but lack dedicated, detailed specification. These are documented here for reference during implementation.

### Error Handling and Logging Strategy
- No spec covers structured logging format, log levels, error handling patterns, or monitoring beyond health checks.
- **Recommendation**: Use `console.log`/`console.error` for v1 (Bun's built-in console outputs to stdout/stderr). Log structured JSON objects for important events (SMS sent, SMS failed, subscriber created, daily job summary). Add a global error handler in the HTTP server that logs unhandled errors and returns 500.

### Actual Platypus Facts Content
- The `data/facts.json` seed file is specified in format only. No actual platypus facts are provided in the specs. The example facts in `specs/seed-data.md` use placeholder URLs.
- **Recommendation**: Research and author 20-30 real platypus facts with legitimate source URLs before launch. Each fact should be concise enough to minimize SMS segment count. The duck emoji forces UCS-2 encoding (70 char segment limit), so every daily fact SMS will be multi-segment.

### Twilio START Keyword Behavior
- Whether the incoming webhook receives START messages at all is unclear (Twilio may consume them at the carrier level without forwarding).
- **Recommendation**: Handle START in the incoming webhook defensively. If a START message arrives for an unsubscribed user, reply with the "visit website to re-subscribe" message. If Twilio does not forward START messages, this is a no-op.

### Database Backup Implementation
- The infrastructure spec mentions backup options (cron copy or Litestream) but does not specify which to implement.
- **Recommendation**: Defer to post-launch. Start with a simple daily cron backup of the SQLite file.

### UCS-2 Encoding Cost Impact
- The `specs/cost-estimate.md` assumes "most daily fact messages fit in 1 SMS segment (<=160 chars GSM-7)" which is incorrect given the duck emoji forces UCS-2 encoding. Actual per-subscriber SMS costs will be 2-3x the estimate. This does not change the implementation.
- **Recommendation**: Add a Priority 20 task to evaluate whether the duck emoji is worth the increased cost and update `specs/cost-estimate.md` accordingly.

### Database Migration Strategy
- No spec addresses how schema changes will be handled after initial deployment. `CREATE TABLE IF NOT EXISTS` will not alter existing tables.
- **Recommendation**: For v1, the schema is stable and migrations are not needed. If schema changes become necessary post-launch, implement a simple version-tracking approach (e.g., a `schema_version` table).
- **Note**: Facts are never physically deleted from the database per spec (`specs/fact-cycling.md`: "Facts are never deleted from the database"), so orphaned fact URLs in `sent_facts` are not a concern.

### Daily Send Job "Today" Date Determination
- **Recommendation**: Always compute "today" as the current UTC date (`new Date().toISOString().split('T')[0]`). This ensures consistency with the UTC cron schedule.

### Cron Job Runs Inside Docker Container
- The daily send job is a standalone Bun script, but Bun and the app code live inside the Docker container. The crontab runs on the host.
- **Recommendation**: Use `docker exec <container-name> bun run src/jobs/daily-send.ts` in the host crontab.

### Capacity Check TOCTOU Race Condition
- The capacity check in signup and confirmation flows is not atomic with the subscriber state change. Under concurrent requests, the subscriber cap could briefly be exceeded.
- **Accepted for v1**: SQLite single-writer serialization mitigates this for the single-instance deployment. The cap is enforced as a soft limit.

### Duplicate Fact Text Validation
- The fact sync script (`src/scripts/sync-facts.ts`) validates that fact text values are unique within the seed file to prevent accidental duplicates.
- Duplicate fact text entries in `data/facts.json` will be rejected during sync with a clear validation error.
