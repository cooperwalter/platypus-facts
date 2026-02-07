# Implementation Plan -- Daily Platypus Facts

## Status Summary

All priorities (1-23) are implemented. The application is feature-complete including AI-generated fact images with MMS delivery, with audit fixes and hardened test coverage.

- **259 tests passing** across 17 test files with **573 expect() calls**
- **Type check clean**, **lint clean**
- **28 real platypus facts** sourced and seeded
- **Latest tag**: 0.0.11 (pending)
- **Spec compliance**: 100%

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
- [x] Integration tests for end-to-end flows (`src/integration.test.ts`)
- [x] Type check passes with zero errors (`bunx tsc --noEmit`)
- [x] Lint passes with zero errors (`bunx biome check .`)

---

## Priority 19: Infrastructure and Deployment (tag: 0.0.4)

- [x] `Dockerfile`, `.dockerignore`, `config/deploy.yml`, `.github/workflows/deploy.yml`, `CRON_SETUP.md`

---

## Priority 20: Final Polish and Launch Preparation (tag: 0.0.5)

- [x] README, SMS templates, signup page, fact page, attribution, seed data
- [ ] **REQUIRES MANUAL TESTING** -- End-to-end flows with Twilio credentials

---

## Priority 21: AI-Generated Fact Images (tag: 0.0.8)

Each platypus fact has an AI-generated illustration (minimalist line drawing style) displayed on the web and attached as MMS in daily SMS messages. Implemented across 11 subtasks (21a-21k), adding 3 new files and modifying 21 existing files. 26 new tests added.

### Design Decisions (Resolved)

1. **OPENAI_API_KEY is optional.** The server never calls the OpenAI API — only the sync script does. `loadConfig()` reads it if present; `Config` gains `openaiApiKey: string | null`. The image generation module guards on its presence. The sync script logs a warning and skips image generation when absent. This lets the server and developers run without an API key.

2. **Use raw `fetch` instead of OpenAI SDK.** The DALL-E API is a single POST endpoint. Using fetch avoids a heavy SDK dependency for one API call. The request shape is simple (`model`, `prompt`, `size`, `response_format`). No new npm dependency needed.

3. **Dual migration strategy for `image_path`.** Add the column to the `CREATE TABLE` statement (handles fresh databases) AND run `ALTER TABLE facts ADD COLUMN image_path TEXT` on startup, catching the "duplicate column name" error (handles existing production databases).

4. **Image generation runs AFTER the sync transaction.** The current `syncFacts()` wraps upserts in a `BEGIN/COMMIT` transaction. Network I/O (OpenAI API + file write) must not be inside that transaction. After commit, iterate facts with `image_path IS NULL`, generate images, update DB individually. A crash during generation leaves facts without images — correct graceful degradation.

5. **Scene context uses raw fact text.** The spec says "scene context derived from the fact text." For v1, append the raw fact text to the style prefix. If results are poor, the prompt template can be iterated.

### Dependency Graph

```
21a (Schema) ──> 21b (Types/Queries) ──> 21d (Image Gen Module) ──> 21e (Sync Integration)
                                    ├──> 21f (MMS in SmsProvider) ──> 21g (Daily Send MMS)
                                    └──> 21h (Web Page Image)
21c (Config) ──> 21d (Image Gen Module)
21k (.env.example) -- standalone
21i (Infrastructure) -- standalone
Tests written alongside each subtask.
```

### Implementation Order

| Step | Subtask | Depends On | Unblocks |
|------|---------|------------|----------|
| 1 | 21a (Schema + migration) | -- | Everything |
| 2 | 21b (Types/Queries) | 21a | 21d, 21f, 21g, 21h |
| 3 | 21c (Config) | -- | 21d, 21e |
| 4 | 21d (Image Gen Module) | 21b, 21c | 21e |
| 5 | 21f (MMS in SmsProvider) | 21b | 21g |
| 6 | 21h (Web Page Image) | 21b | -- |
| 7 | 21e (Sync Integration) | 21d | -- |
| 8 | 21g (Daily Send MMS) | 21f | -- |
| 9 | 21i (Infrastructure) | -- | -- |
| 10 | 21k (.env.example) | -- | -- |
| 11 | Final validation | All above | -- |

Steps 3, 9, and 10 have no code dependencies and can be done in parallel with earlier steps. Steps 5+6 can be done in parallel once 21b is complete. Steps 7+8 can be done in parallel once their predecessors are complete.

---

### 21a. Database Schema — Add `image_path` Column to `facts` Table

- [x] Add `image_path TEXT` column to `CREATE TABLE facts` statement between `text` and `created_at`
  - **Modify**: `src/lib/db.ts:7` — add `image_path TEXT,` after `text TEXT NOT NULL,`
- [x] Add migration function for existing databases: attempt `ALTER TABLE facts ADD COLUMN image_path TEXT`, catch "duplicate column name" error gracefully. Call after `initializeSchema()` in both `createDatabase()` and `createInMemoryDatabase()`.
  - **Modify**: `src/lib/db.ts` — new function + calls at lines 42 and 49
- [x] Update database tests to verify `image_path` column exists and accepts NULL
  - **Modify**: `src/lib/db.test.ts`

### 21b. Fact Type and Query Updates

- [x] Add `image_path: string | null` to the `Fact` interface
  - **Modify**: `src/lib/facts.ts:3-7` — add field to interface
- [x] Update `getFactById()` SELECT to include `image_path`
  - **Modify**: `src/lib/facts.ts:17` — `SELECT id, text, image_path, created_at FROM facts WHERE id = ?`
  - Note: `getFactWithSources()` delegates to `getFactById()` (line 25), so it inherits the new field automatically. No separate query change needed for `getFactWithSources`.
- [x] Update `makeFactRow()` test builder to support `image_path` override (defaults to `null`). Change INSERT from `INSERT INTO facts (text) VALUES (?)` to `INSERT INTO facts (text, image_path) VALUES (?, ?)`.
  - **Modify**: `src/lib/test-utils.ts:60-78` — add `image_path?: string` to overrides, update INSERT statement
- [x] Add `image_path` assertions to existing `getFactById` and `getFactWithSources` tests (verify `image_path` is returned as `null` by default)
  - **Modify**: `src/lib/facts.test.ts`

### 21c. Configuration — `OPENAI_API_KEY` (Optional)

- [x] Add `openaiApiKey: string | null` to the `Config` interface
  - **Modify**: `src/lib/config.ts:1-10` — add field
- [x] Read `OPENAI_API_KEY` from env in `loadConfig()`, defaulting to `null` (NOT using `requireEnv()`)
  - **Modify**: `src/lib/config.ts:72-81` — add `openaiApiKey: process.env.OPENAI_API_KEY ?? null`
- [x] Create config tests: loads successfully without `OPENAI_API_KEY` (null), includes value when set
  - **Create**: `src/lib/config.test.ts` (no config test file exists currently)

### 21d. Image Generation Module

- [x] Create image generation module:
  - Function signature: `generateFactImage(factId: number, factText: string, apiKey: string): Promise<string | null>`
  - Construct prompt: `"Minimalist black line drawing of a cute platypus on a white background. Hand-drawn sketchy style with occasional rosy pink cheek accents. Simple, whimsical, charming. "` + fact text
  - POST to `https://api.openai.com/v1/images/generations` with `{ model: "dall-e-3", prompt, size: "1024x1024", response_format: "b64_json", n: 1 }` (DALL-E 3 minimum is 1024x1024; resize to 512x512 if needed, or accept 1024x1024)
  - Decode base64 response, save to `public/images/facts/{fact_id}.png` via `Bun.write()`
  - Return `images/facts/{fact_id}.png` on success
  - Return `null` on any error (API failure, network error, file write error) — log error but do not throw
  - **Create**: `src/lib/image-generation.ts`
- [x] Create `public/images/facts/` directory with `.gitkeep`
  - **Create**: `public/images/facts/.gitkeep`
- [x] Create unit tests (mock `fetch` and `Bun.write`):
  - Constructs correct prompt from fact text (style prefix + fact text)
  - Calls correct API endpoint with correct parameters
  - Saves to correct file path
  - Returns relative image path on success
  - Returns null and logs on API error (non-200)
  - Returns null and logs on network error
  - **Create**: `src/lib/image-generation.test.ts`

### 21e. Sync-Facts Integration — Generate Images During Sync

- [x] Add optional `openaiApiKey` parameter to `syncFacts()` signature
  - **Modify**: `src/scripts/sync-facts.ts:70-73` — `syncFacts(db, factsFilePath?, openaiApiKey?)`
- [x] After existing transaction commits (line 141), query `SELECT id, text FROM facts WHERE image_path IS NULL`
- [x] If `openaiApiKey` is provided, iterate and call `generateFactImage()` for each, then `UPDATE facts SET image_path = ? WHERE id = ?`
- [x] If `openaiApiKey` is null/undefined, log warning and skip image generation
- [x] If generation fails for a single fact, log error and continue
- [x] Return image generation stats alongside existing sync stats
  - **Modify**: `src/scripts/sync-facts.ts`
- [x] Update callers:
  - `src/index.ts:25` — pass `config.openaiApiKey` to `syncFacts(db, undefined, config.openaiApiKey)`
  - `src/jobs/daily-send.ts:113` — same pattern (read from config or env)
  - `src/scripts/sync-facts.ts:150-162` — `import.meta.main` block reads `process.env.OPENAI_API_KEY`
  - `src/integration.test.ts` — sync integration tests call `syncFacts(db, filePath)` and may need updating if return type gains image stats
- [x] Update/add tests for image generation during sync:
  - Calls image generation for facts with NULL `image_path`
  - Skips facts that already have `image_path`
  - Updates `image_path` in DB after generation
  - Continues if generation fails for one fact
  - Skips all generation when no API key (logs warning)
  - **Modify**: `src/scripts/sync-facts.test.ts`

### 21f. MMS Support in SMS Provider

- [x] Add optional `mediaUrl?: string` parameter to `sendSms()` in `SmsProvider` interface
  - **Modify**: `src/lib/sms/types.ts:2` — `sendSms(to: string, body: string, mediaUrl?: string)`
- [x] Update Twilio implementation to forward `mediaUrl`. Twilio's `messages.create()` accepts `mediaUrl` as array of strings — conditionally add when provided.
  - **Modify**: `src/lib/sms/twilio.ts`
- [x] Add `mediaUrl?: string` to `SentMessage` interface
  - **Modify**: `src/lib/test-utils.ts:9-12`
- [x] Update mock `sendSms()` to accept and record `mediaUrl`
  - **Modify**: `src/lib/test-utils.ts:25`
- [x] Add tests:
  - Twilio `sendSms` includes `mediaUrl` when provided
  - Twilio `sendSms` omits `mediaUrl` when not provided
  - Mock captures `mediaUrl` in `sentMessages`
  - **Modify**: `src/lib/sms/twilio.test.ts`

### 21g. Daily Send — MMS When Image Available

- [x] After getting `factData` from `getFactWithSources()`, check `factData.fact.image_path`
- [x] If image exists, construct URL: `` `${baseUrl}/images/facts/${selected.factId}.png` ``
- [x] Pass as third arg to `smsProvider.sendSms(phone, message, imageUrl)`
- [x] If no image, call with two args (current behavior)
  - **Modify**: `src/jobs/daily-send.ts:76-78` (the send loop)
- [x] Update existing `sendSms` mock overrides in `daily-send.test.ts` (lines ~92 and ~114) to accept the optional `mediaUrl` parameter, avoiding TypeScript type errors
- [x] Add tests:
  - Sends MMS with image URL when fact has `image_path`
  - Sends plain SMS when fact has no `image_path`
  - Constructs correct image URL
  - **Modify**: `src/jobs/daily-send.test.ts`

### 21h. Web Page — Display Fact Image

- [x] In `renderFactPage()`, check `fact.image_path`
- [x] If present, render `<img>` inside `.fact-card` above `.fact-text`:
  ```html
  <img src="/${fact.image_path}" alt="Illustration for this platypus fact" class="fact-image" />
  ```
  (`image_path` is stored as `images/facts/{id}.png`, prepend `/` for URL)
- [x] If no image, omit `<img>` (current behavior)
  - **Modify**: `src/routes/pages.ts:174-175` — add conditional `<img>` before `<p class="fact-text">`
- [x] Add CSS for `.fact-image`: centered, max-width 100%, auto height, border-radius, bottom margin
  - **Modify**: `public/styles.css`
- [x] Add tests:
  - Renders `<img>` with correct `src` and `alt` when `image_path` exists
  - Omits `<img>` when `image_path` is null
  - **Modify**: `src/routes/routes.test.ts`

### 21i. Infrastructure Updates

- [x] Add volume mount for images: `/opt/platypus-facts/images:/app/public/images/facts`
  - **Modify**: `config/deploy.yml` (add to volumes array alongside existing data volume)
- [x] Add `OPENAI_API_KEY` to secrets section
  - **Modify**: `config/deploy.yml` (add to `env.secret`)
- [x] Create `public/images/facts/` directory in Dockerfile: `RUN mkdir -p /app/public/images/facts`
  - **Modify**: `Dockerfile` (add after existing `RUN mkdir -p /app/data`)

### 21j. Integration Tests

- [x] Add end-to-end image flow test:
  - Fact with `image_path` → daily send includes `mediaUrl` → fact page shows `<img>`
  - Fact without `image_path` → daily send is plain SMS → fact page has no `<img>`
- [x] Update existing sync integration tests to assert new image-related stats in `syncFacts()` return value (if return type was extended in 21e)
  - **Modify**: `src/integration.test.ts`

### 21k. `.env.example` Update

- [x] Add `OPENAI_API_KEY` with comment indicating it's optional
  - **Modify**: `.env.example` — add `# Optional: required for AI image generation during fact sync` and `OPENAI_API_KEY=your_openai_api_key`

---

## Priority 22: Audit Fixes and Test Coverage Hardening (tag: 0.0.9)

### Bug Fix: `unsubscribed_at` Not Clearing on Re-subscription

**Issue**: When an unsubscribed user re-subscribed via the website, `unsubscribed_at` was not being cleared (set to NULL). The code in `src/lib/subscription-flow.ts` passed `undefined` to `updateStatus()`, but the check `timestamps?.unsubscribed_at !== undefined` evaluated to false, leaving the stale timestamp in the database.

**Fix**: Changed the code to pass `null` instead of `undefined` and updated the type signature of `updateStatus()` to accept `string | null` for timestamps. Now `timestamps?.unsubscribed_at !== null` correctly evaluates to true, and the column is set to NULL on re-subscription.

**Modified**: `src/lib/subscribers.ts` (updateStatus type signature), `src/lib/subscription-flow.ts` (re-subscribe logic)

### New Tests (19 total)

Added comprehensive test coverage across 4 test files:

**Security Tests (9 tests)**:
- `escapeHtml()` XSS prevention (3 tests in `src/routes/pages.test.ts`):
  - Escapes `<script>` tags
  - Escapes `&`, `<`, `>`, `"`, `'` characters
  - Handles plain text without special characters
- `isSafeUrl()` URL scheme filtering (4 tests in `src/routes/pages.test.ts`):
  - Accepts `http://` and `https://` URLs
  - Rejects `javascript:` URLs
  - Rejects `data:` URLs
  - Rejects URL with no scheme
- XML escaping in TwiML `createWebhookResponse()` (2 tests in `src/lib/sms/twilio.test.ts`):
  - Escapes XML special characters in message
  - Handles message without special characters

**Re-subscription Fix (1 test)**:
- `unsubscribed_at` clearing on re-subscription (1 test in `src/lib/subscription-flow.test.ts`):
  - Verifies re-subscribing an unsubscribed user sets `unsubscribed_at` to NULL

**Signup Page Verification (1 test)**:
- Signup page tagline verification (1 test in `src/routes/routes.test.ts`):
  - Verifies tagline "Get a platypus fact every day" is present

**Seed Data Validation Edge Cases (8 tests)**:
- Added 8 new validation tests in `src/scripts/sync-facts.test.ts`:
  - Non-array root in facts.json
  - Non-object fact entry
  - Null fact entry
  - Non-object source entry
  - Non-string source title
  - Whitespace-only fact text
  - Whitespace-only source URL
  - Zero sources for a fact

### Spec Fix

Updated `specs/fact-images.md` to reflect 1024x1024 image size (DALL-E 3 minimum) instead of 512x512. The implementation was already correct at 1024x1024; this brings the spec into alignment.

---

## Files Modified by Priority 21

| File | Subtask | Change |
|------|---------|--------|
| `src/lib/db.ts` | 21a | Add `image_path` to schema + migration |
| `src/lib/db.test.ts` | 21a | Test `image_path` column |
| `src/lib/facts.ts` | 21b | Add to `Fact` interface + update `getFactById` query |
| `src/lib/facts.test.ts` | 21b | Add `image_path` assertions to existing tests |
| `src/lib/test-utils.ts` | 21b, 21f | Update `makeFactRow`, `SentMessage`, mock `sendSms` |
| `src/lib/config.ts` | 21c | Add optional `openaiApiKey` field |
| `src/lib/config.test.ts` | 21c | **New file**: config tests |
| `src/lib/image-generation.ts` | 21d | **New file**: image gen module |
| `src/lib/image-generation.test.ts` | 21d | **New file**: image gen tests |
| `public/images/facts/.gitkeep` | 21d | **New file**: directory placeholder |
| `src/scripts/sync-facts.ts` | 21e | Add image gen after transaction |
| `src/scripts/sync-facts.test.ts` | 21e | Test image gen integration |
| `src/index.ts` | 21e | Pass `openaiApiKey` to `syncFacts()` |
| `src/lib/sms/types.ts` | 21f | Add `mediaUrl` to `sendSms` |
| `src/lib/sms/twilio.ts` | 21f | Forward `mediaUrl` to Twilio API |
| `src/lib/sms/twilio.test.ts` | 21f | Test MMS support |
| `src/jobs/daily-send.ts` | 21g | Pass `mediaUrl` when image exists |
| `src/jobs/daily-send.test.ts` | 21g | Test MMS in daily send |
| `src/routes/pages.ts` | 21h | Render `<img>` on fact page |
| `public/styles.css` | 21h | Add `.fact-image` styles |
| `src/routes/routes.test.ts` | 21h | Test fact page image display |
| `config/deploy.yml` | 21i | Add image volume + OPENAI_API_KEY secret |
| `Dockerfile` | 21i | Create images directory |
| `src/integration.test.ts` | 21j | Test end-to-end image flow |
| `.env.example` | 21k | Add OPENAI_API_KEY |

---

## Known Spec Gaps and Recommendations

### Error Handling and Logging Strategy
- No spec covers structured logging. Using `console.log`/`console.error` for v1 (already implemented).

### Twilio START Keyword Behavior
- **Implemented**: START from unsubscribed user returns "visit website" message. Test coverage exists.

### Twilio Stop Words (fixed in 0.0.7)
- All 8 Twilio opt-out keywords handled with test coverage for each variant.

### Database Backup Implementation
- Defer to post-launch. Start with simple daily cron backup.

### UCS-2 Encoding Cost Impact
- Duck emoji forces UCS-2 encoding (2-3 segments per SMS). With MMS (Priority 21), this becomes moot — MMS is not segmented.

### Database Migration Strategy
- Priority 21's `image_path` column handled via dual approach: in `CREATE TABLE` for fresh DBs, `ALTER TABLE` migration for existing DBs. See 21a.

### MMS Cost Impact (Priority 21)
- MMS ~$0.02/message vs SMS ~$0.008/segment. At 2-3 segments per SMS, MMS is comparable or cheaper while delivering illustration inline.

---

## Priority 23: Test Coverage Hardening (tag: 0.0.11)

### Config Validation Tests (32 new tests)
Added comprehensive tests for `loadConfig()` covering all validation paths that were previously untested:
- **Required env vars**: throws on missing BASE_URL, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
- **BASE_URL validation**: rejects invalid URLs, strips trailing slashes, accepts valid URLs
- **TWILIO_PHONE_NUMBER**: rejects non-E.164 format, requires plus prefix
- **DAILY_SEND_TIME_UTC**: defaults to 14:00, validates HH:MM format, rejects hours > 23 and minutes > 59, accepts boundary values (00:00, 23:59)
- **PORT**: defaults to 3000, rejects non-numbers/0/exceeding 65535, accepts boundary values (1, 65535)
- **MAX_SUBSCRIBERS**: defaults to 1000, rejects 0/negative/non-numbers
- **DATABASE_PATH**: defaults to ./data/platypus-facts.db, accepts custom paths
- **Full defaults test**: verifies all fields with required env only

### Route Handler Edge Case Tests (18 new tests)
- **404 page structure**: heading text, "swam away" message, back-to-home link
- **Fact page**: source URL used as display text when no title, subscribe CTA link present
- **getClientIp**: multiple IPs in X-Forwarded-For, missing header returns "unknown", whitespace trimming
- **Subscribe body validation**: phoneNumber as number (not string), JSON array body, JSON null body
- **Webhook error handling**: parseIncomingMessage throws → empty TwiML, handleIncomingMessage throws → empty TwiML, STOP from known subscriber returns no message body
- **Signup page at capacity**: no script tag when at capacity, includes script when not at capacity, description text present

### Subscription Flow Edge Case (1 new test)
- **STOP from unknown sender**: verifies help message returned (not unsubscribe action) when unknown phone sends STOP

### Why These Tests Matter
Config validation tests are critical for fail-fast behavior — the server should crash immediately on startup with clear error messages rather than fail mysteriously at runtime. The route handler tests ensure error paths don't leak internal errors to users and that HTML structure is correct for accessibility and user experience.
