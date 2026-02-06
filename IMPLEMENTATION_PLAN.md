# Implementation Plan -- Daily Platypus Facts

All items are marked with their implementation status. This is a greenfield project; everything must be built from scratch.

---

## Priority 1: Project Bootstrapping

These items must be completed first. Everything else depends on them.

- [x] **IMPLEMENTED** -- Initialize `package.json` with `bun init`, set project name to `platypus-facts`, entry point to `src/index.ts`
- [x] **IMPLEMENTED** -- Create `tsconfig.json` targeting Bun runtime (use `bun` types, strict mode, `noImplicitAny: true`, path aliases if desired)
- [x] **IMPLEMENTED** -- Install core dependencies: `twilio` SDK (database uses Bun's built-in `bun:sqlite`, no separate package needed)
- [x] **IMPLEMENTED** -- Install dev dependencies: `@types/bun`, `typescript`, Biome (linter/formatter)
- [x] **IMPLEMENTED** -- Create initial directory structure: `src/`, `src/lib/`, `src/lib/sms/`, `src/routes/`, `src/jobs/`, `src/scripts/`, `data/`, `public/`, `config/`
- [x] **IMPLEMENTED** -- Create `data/.gitkeep` so the `data/` directory is tracked by git (the SQLite database file itself is gitignored)
- [x] **IMPLEMENTED** -- Create `.env.example` with all environment variables documented in `specs/infrastructure.md`: `PORT`, `BASE_URL`, `DATABASE_PATH`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `DAILY_SEND_TIME_UTC`, `MAX_SUBSCRIBERS`
- [x] **IMPLEMENTED** -- Create `.gitignore` (node_modules, *.db, .env, dist/; bun.lock should NOT be ignored -- commit it for reproducible builds)
- [x] **IMPLEMENTED** -- Set up Biome configuration (`biome.json`) for linting and formatting

---

## Priority 2: Configuration and Environment

Centralized config loading used by all components.

- [x] **IMPLEMENTED** -- Create `src/lib/config.ts` -- load and validate all environment variables with typed defaults:
  - `PORT` default `3000`
  - `MAX_SUBSCRIBERS` default `1000`
  - `DATABASE_PATH` default `./data/platypus-facts.db`
  - `DAILY_SEND_TIME_UTC` default `14:00` (validate `HH:MM` format, 24-hour, reject invalid values)
  - `BASE_URL` (required, no default)
  - `TWILIO_ACCOUNT_SID` (required, no default)
  - `TWILIO_AUTH_TOKEN` (required, no default)
  - `TWILIO_PHONE_NUMBER` (required, no default, must be E.164 format)
- [x] **IMPLEMENTED** -- Validate required env vars at startup and fail fast with clear error messages if missing (per `specs/infrastructure.md` environment variables table)
- [x] **IMPLEMENTED** -- Export typed config object (not individual env var reads scattered through codebase)

---

## Priority 3: Database Setup

The database is a dependency for nearly every feature. Moved ahead of testing infrastructure because tests need the schema.

- [x] **IMPLEMENTED** -- Create `src/lib/db.ts` -- SQLite connection setup using Bun's built-in `bun:sqlite`, configured via `DATABASE_PATH` from config
- [x] **IMPLEMENTED** -- Enable WAL mode (`PRAGMA journal_mode=WAL`) and foreign keys (`PRAGMA foreign_keys=ON`) on connection open
- [x] **IMPLEMENTED** -- Create schema initialization (run on connection open) with all four tables matching `specs/data-model.md` exactly:
  - `facts` (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')))
  - `fact_sources` (id INTEGER PRIMARY KEY AUTOINCREMENT, fact_id INTEGER NOT NULL REFERENCES facts(id) ON DELETE CASCADE, url TEXT NOT NULL, title TEXT)
  - `subscribers` (id INTEGER PRIMARY KEY AUTOINCREMENT, phone_number TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL DEFAULT (datetime('now')), confirmed_at TEXT, unsubscribed_at TEXT)
  - `sent_facts` (id INTEGER PRIMARY KEY AUTOINCREMENT, fact_id INTEGER NOT NULL REFERENCES facts(id), sent_date TEXT NOT NULL UNIQUE, cycle INTEGER NOT NULL) -- note: NO `ON DELETE CASCADE` here (unlike `fact_sources`), because send history must be preserved even if a fact were ever removed
- [x] **IMPLEMENTED** -- Export a function to create an in-memory database with the same schema (used by tests and the sync script)

---

## Priority 4: Testing Infrastructure

Test utilities are needed before writing unit tests in later priorities. The database schema (Priority 3) must exist first so the in-memory DB factory can apply it. The mock SMS provider is a stub here; it will be updated in Priority 8 to implement the `SmsProvider` interface once that interface is defined.

Test files are colocated with source code (e.g., `src/lib/phone.test.ts` next to `src/lib/phone.ts`). This keeps related code together and is the Bun test runner default discovery pattern.

- [x] **IMPLEMENTED** -- Configure Bun test runner (`bunfig.toml` if needed, ensure `bun test` discovers `*.test.ts` files in `src/`)
- [x] **IMPLEMENTED** -- Create test utilities module (`src/lib/test-utils.ts`):
  - In-memory SQLite database factory (creates a fresh database with schema for each test, using the schema init from Priority 3)
  - Preliminary mock SMS provider (records sent messages; will be updated in Priority 8 to implement `SmsProvider` interface)
  - Test data builder functions (prefer generator/factory functions over setup/teardown) for facts, subscribers, sent_facts records

---

## Priority 5: Database Unit Tests

Write unit tests for the database setup from Priority 3. Depends on test utilities from Priority 4.

- [x] **IMPLEMENTED** -- Write unit tests (`src/lib/db.test.ts`) for database setup:
  - All four tables exist after initialization
  - Foreign key constraint on `fact_sources.fact_id` is enforced (inserting a fact_source referencing a nonexistent fact_id fails)
  - `ON DELETE CASCADE` works on `fact_sources`: deleting a fact deletes its associated fact_sources rows
  - `sent_facts.fact_id` foreign key is enforced (inserting a sent_fact referencing a nonexistent fact_id fails)
  - Deleting a fact does NOT cascade to `sent_facts` (no `ON DELETE CASCADE` on sent_facts)
  - `subscribers.phone_number` UNIQUE constraint is enforced (inserting duplicate phone number throws)
  - `sent_facts.sent_date` UNIQUE constraint is enforced (inserting duplicate sent_date throws)
  - WAL mode is enabled (querying `PRAGMA journal_mode` returns `wal`)
  - Foreign keys pragma is enabled (querying `PRAGMA foreign_keys` returns `1`)

---

## Priority 6: Phone Number Validation

Reusable module depended on by subscription flow and web pages. Rules from `specs/phone-validation.md`.

- [x] **IMPLEMENTED** -- Create `src/lib/phone.ts` -- phone number validation and E.164 normalization:
  - Strip all non-digit characters except a leading `+`
  - Rule 1: starts with `+1` followed by exactly 10 digits -> valid, already normalized
  - Rule 2: starts with `1` followed by exactly 10 digits -> prepend `+`, valid
  - Rule 3: exactly 10 digits -> prepend `+1`, valid
  - Otherwise -> invalid
  - NANP validation: area code (first 3 digits after country code) must not start with `0` or `1`
  - NANP validation: exchange (next 3 digits after area code) must not start with `0` or `1`
  - Return normalized E.164 string on success, or error on failure
  - Error message: "Please enter a valid US phone number."
- [x] **IMPLEMENTED** -- Write unit tests (`src/lib/phone.test.ts`) for phone validation/normalization covering all accepted formats from `specs/phone-validation.md`:
  - `+15551234567` (E.164, already normalized) -> `+15551234567`
  - `15551234567` (country code, no plus) -> `+15551234567`
  - `5551234567` (10-digit) -> `+15551234567`
  - `(555) 123-4567` (parens and dash) -> `+15551234567`
  - `555-123-4567` (dashes) -> `+15551234567`
  - `555.123.4567` (dots) -> `+15551234567`
  - `555 123 4567` (spaces) -> `+15551234567`
  - Mixed separators (e.g., `(555) 123.4567`) -> valid
  - NANP rejection: area code starting with `0` (e.g., `0551234567`) -> invalid
  - NANP rejection: area code starting with `1` (e.g., `1551234567` as 10 digits) -> invalid
  - NANP rejection: exchange starting with `0` (e.g., `5550234567`) -> invalid
  - NANP rejection: exchange starting with `1` (e.g., `5551134567`) -> invalid
  - Too few digits -> invalid
  - Too many digits -> invalid
  - Non-US country codes -> invalid
  - Empty string -> invalid
  - Letters/non-numeric input -> invalid

---

## Priority 7: SMS Templates

All SMS message content, traceable to `specs/subscription-flow.md` and `specs/sms-integration.md`.

- [x] **IMPLEMENTED** -- Create `src/lib/sms-templates.ts` -- all SMS message templates as typed functions. Each template must match the exact wording in `specs/subscription-flow.md`:
  - `welcomeMessage(): string` -- "Welcome to Daily Platypus Facts! Inspired by Life is Strange: Double Exposure. [duck emoji]\nReply 1 or PERRY to confirm and start receiving a platypus fact every day."
  - `confirmationSuccessMessage(): string` -- "You're now a Platypus Fan! You'll receive one platypus fact every day. Reply STOP at any time to unsubscribe."
  - `alreadySubscribedMessage(): string` -- "You're already a Platypus Fan! Reply STOP to unsubscribe." (sent via SMS only when re-registering while already active)
  - `unsubscribedUserMessage(baseUrl: string): string` -- "You've unsubscribed from Daily Platypus Facts. To re-subscribe, visit {base_url}"
  - `helpMessage(): string` -- "Daily Platypus Facts: Reply 1 or PERRY to confirm your subscription. Reply STOP to unsubscribe."
  - `atCapacityMessage(): string` -- "Sorry, Daily Platypus Facts is currently at capacity! We can't confirm your subscription right now. Please try again later." (sent via SMS when confirmation rejected at cap)
  - `dailyFactMessage(factText: string, factUrl: string): string` -- "[duck emoji] Daily Platypus Fact:\n{fact_text}\n\nSources: {fact_url}" (format from `specs/sms-integration.md`, `factUrl` is the pre-constructed `${BASE_URL}/facts/${factId}` URL)
- [x] **IMPLEMENTED** -- Write unit tests (`src/lib/sms-templates.test.ts`) for SMS templates:
  - Each template returns the exact text specified in `specs/subscription-flow.md`
  - `unsubscribedUserMessage` correctly interpolates `baseUrl`
  - `dailyFactMessage` correctly interpolates `factText` and `factUrl`
  - Templates that take no arguments return consistent strings
  - `welcomeMessage` contains the Life is Strange: Double Exposure attribution (per `specs/overview.md` Project Attribution requirement)

---

## Priority 8: SMS Provider Abstraction + Twilio Implementation

Required before subscription flow or daily sends can work.

Note on interface design: `specs/sms-integration.md` defines a generic provider interface ("Send SMS" + "Incoming message webhook handler"). The plan adds `validateWebhookSignature` and `createWebhookResponse` to the interface, which are Twilio-influenced. This is acceptable for v1 (Twilio is the only provider), but if swapping providers later, these methods would need to be generalized.

- [x] **IMPLEMENTED** -- Create `src/lib/sms/types.ts` -- define the `SmsProvider` interface (per `specs/sms-integration.md` provider abstraction):
  - `sendSms(to: string, body: string): Promise<void>`
  - `parseIncomingMessage(request: Request): Promise<{ from: string; body: string }>`
  - `validateWebhookSignature(request: Request): Promise<boolean>`
  - `createWebhookResponse(message?: string): string` (returns TwiML for Twilio, could return different format for other providers)
- [x] **IMPLEMENTED** -- Create `src/lib/sms/twilio.ts` -- Twilio implementation of `SmsProvider`:
  - `sendSms`: use Twilio REST API via `twilio` SDK, sending from configured `TWILIO_PHONE_NUMBER`
  - `parseIncomingMessage`: parse incoming webhook form data, extract `From` and `Body` fields. Handle missing/empty `From` or `Body` gracefully (return empty strings or throw with clear error)
  - `validateWebhookSignature`: validate `X-Twilio-Signature` header against request URL + params + auth token (per `specs/sms-integration.md` webhook handler step 1)
  - `createWebhookResponse`: generate TwiML XML -- empty `<Response/>` when no message, or `<Response><Message>...</Message></Response>` when message provided
- [x] **IMPLEMENTED** -- Create `src/lib/sms/index.ts` -- factory function that returns the configured provider (Twilio for production, mock for tests)
- [x] **IMPLEMENTED** -- Update test utilities: ensure mock SMS provider in test helpers implements the same `SmsProvider` interface
- [x] **IMPLEMENTED** -- Write unit tests (`src/lib/sms/twilio.test.ts`) for Twilio provider:
  - `sendSms` calls Twilio SDK with correct parameters (mock the SDK)
  - `parseIncomingMessage` extracts `From` and `Body` from form data
  - `parseIncomingMessage` handles missing or empty `Body` field gracefully
  - `parseIncomingMessage` handles missing or empty `From` field gracefully
  - `validateWebhookSignature` accepts valid signatures, rejects invalid ones
  - `createWebhookResponse()` with no arg returns empty `<Response/>`
  - `createWebhookResponse("hello")` returns `<Response><Message>hello</Message></Response>`

---

## Priority 9: Seed Data File and Sync Script

Facts must be in the database before the daily job or fact pages can work.

- [x] **IMPLEMENTED** -- Create `data/facts.json` with initial platypus facts matching the format in `specs/seed-data.md`:
  - Array of objects, each with `text` (string) and `sources` (array of `{ url: string, title?: string }`)
  - Include at least 2-3 placeholder facts for development (real facts to be authored before launch)
- [x] **IMPLEMENTED** -- Create `src/scripts/sync-facts.ts` implementing the sync behavior from `specs/seed-data.md`:
  - Load and validate `data/facts.json`:
    - Each fact must have non-empty `text`
    - Each fact must have at least one source
    - Each source must have non-empty `url`
    - `title` on sources is optional
  - Upsert logic:
    - Match existing facts by exact `text` content
    - Insert new facts with their sources into `facts` and `fact_sources` tables
    - Update sources for existing facts if changed
    - Do NOT delete facts that are present in DB but absent from seed file (per `specs/seed-data.md`: "Removed facts: left in place, continue to participate in cycling")
  - Run in a database transaction for atomicity
  - Log summary of changes (facts added, facts updated, facts unchanged)
  - Must be importable as a function (for use in web server startup and daily send job) as well as runnable as a standalone script (`bun run src/scripts/sync-facts.ts`)
- [x] **IMPLEMENTED** -- Write unit tests (`src/scripts/sync-facts.test.ts`) for sync script:
  - New fact insertion creates rows in both `facts` and `fact_sources`
  - Source updates for existing facts (add source, remove source, change URL/title)
  - Idempotent re-runs produce no changes
  - Facts removed from JSON are NOT deleted from database
  - Validation error on fact with empty text
  - Validation error on fact with no sources
  - Validation error on source with empty URL
  - Transaction rollback on validation failure

---

## Priority 10: Subscriber Data Access Layer

Data access functions used by the subscription flow and daily send job.

- [x] **IMPLEMENTED** -- Create `src/lib/subscribers.ts` -- subscriber data access layer:
  - `findByPhoneNumber(db, phone: string): Subscriber | null`
  - `getActiveCount(db): number` -- count of subscribers with status `active` (used for cap checks per `specs/subscription-flow.md`)
  - `createSubscriber(db, phone: string): Subscriber` -- insert with status `pending`, phone in E.164 format
  - `updateStatus(db, id: number, status: 'pending' | 'active' | 'unsubscribed', timestamps?: { confirmed_at?: string; unsubscribed_at?: string }): void`
  - `getActiveSubscribers(db): Subscriber[]` -- all subscribers with status `active` (used by daily send job)
- [x] **IMPLEMENTED** -- Define TypeScript `Subscriber` type matching the `subscribers` table schema from `specs/data-model.md`
- [x] **IMPLEMENTED** -- Write unit tests (`src/lib/subscribers.test.ts`) for subscriber data access:
  - `createSubscriber` inserts with `pending` status and E.164 phone
  - `findByPhoneNumber` returns subscriber when it exists
  - `findByPhoneNumber` returns null when phone number not found
  - `getActiveCount` counts only `active` status (not `pending` or `unsubscribed`)
  - `updateStatus` to `active` sets `confirmed_at`
  - `updateStatus` to `unsubscribed` sets `unsubscribed_at`
  - `getActiveSubscribers` returns only active subscribers
  - Duplicate phone number insertion throws (UNIQUE constraint)

---

## Priority 11: Fact Data Access Layer

Data access functions for facts and sent_facts, used by the fact cycling algorithm, daily send job, fact page route, and sync script. Without this module, SQL queries for facts would be scattered across multiple files.

- [x] **IMPLEMENTED** -- Create `src/lib/facts.ts` -- fact data access layer:
  - `getFactById(db, id: number): Fact | null` -- used by fact page route
  - `getFactWithSources(db, id: number): { fact: Fact; sources: FactSource[] } | null` -- used by fact page and daily fact SMS
  - `getAllFactIds(db): number[]` -- all fact IDs in the database
  - `getNeverSentFactIds(db): number[]` -- fact IDs with no entries in `sent_facts`
  - `getUnsentFactIdsInCycle(db, cycle: number): number[]` -- fact IDs not sent in the given cycle
  - `getCurrentCycle(db): number` -- `MAX(cycle)` from `sent_facts`, or `1` if table is empty
  - `recordSentFact(db, factId: number, sentDate: string, cycle: number): void` -- insert into `sent_facts`
  - `getSentFactByDate(db, date: string): { fact_id: number; cycle: number } | null` -- used for idempotency check in daily send job
- [x] **IMPLEMENTED** -- Define TypeScript `Fact` and `FactSource` types matching the `facts` and `fact_sources` table schemas from `specs/data-model.md`
- [x] **IMPLEMENTED** -- Write unit tests (`src/lib/facts.test.ts`) for fact data access:
  - `getFactById` returns fact when it exists
  - `getFactById` returns null for nonexistent ID
  - `getFactWithSources` returns fact with all its sources
  - `getFactWithSources` returns null for nonexistent ID
  - `getAllFactIds` returns all fact IDs
  - `getNeverSentFactIds` returns only facts with no sent_facts entries
  - `getUnsentFactIdsInCycle` returns facts not sent in the given cycle
  - `getCurrentCycle` returns 1 when sent_facts is empty
  - `getCurrentCycle` returns max cycle number when sent_facts has entries
  - `recordSentFact` inserts into sent_facts correctly
  - `getSentFactByDate` returns record when date exists
  - `getSentFactByDate` returns null when date not found

---

## Priority 12: Subscription Flow Logic

Core business logic for signing up and confirming subscribers. Implements `specs/subscription-flow.md`.

- [x] **IMPLEMENTED** -- Create `src/lib/subscription-flow.ts` -- signup logic (per `specs/subscription-flow.md` Signup section):
  - Validate and normalize phone number via `src/lib/phone.ts`
  - Check subscriber cap: if `getActiveCount() >= MAX_SUBSCRIBERS`, reject with at-capacity message (web-facing, not SMS)
  - If phone number already exists in database:
    - Status `pending`: resend welcome/confirmation SMS (does not count against cap)
    - Status `active`: send "already a Platypus Fan" SMS, return success with informational message
    - Status `unsubscribed`: reset status to `pending`, resend welcome/confirmation SMS (does not count against cap)
  - New phone number: create subscriber with `pending` status, send welcome SMS
  - Handle concurrent duplicate signup requests gracefully (catch UNIQUE constraint violation on insert, treat as re-signup for pending subscriber)
  - Return result indicating success/failure and appropriate user-facing message
- [x] **IMPLEMENTED** -- Create incoming message handler (in `src/lib/subscription-flow.ts` or `src/lib/incoming-message.ts`) per `specs/subscription-flow.md` Double Opt-In section:
  - Look up subscriber by phone number (from parsed incoming message `From` field)
  - If status is `pending` AND message body (trimmed, case-insensitive) is `1` or `PERRY`:
    - Check subscriber cap again (cap may have been reached since signup)
    - If at capacity: reply with `atCapacityMessage()`, leave status as `pending`
    - Otherwise: update status to `active`, set `confirmed_at`, reply with `confirmationSuccessMessage()`
  - If status is `unsubscribed` (regardless of message content, except STOP):
    - Reply with `unsubscribedUserMessage(baseUrl)` -- do NOT re-subscribe (per `specs/subscription-flow.md`: "Do NOT re-subscribe them regardless of what they text")
  - If message body is `STOP` (or Twilio-recognized stop word):
    - Update status to `unsubscribed`, set `unsubscribed_at`
    - (Twilio handles the carrier-level opt-out automatically)
  - Any other message (from active subscriber, pending subscriber with non-matching keyword, or unknown number):
    - Reply with `helpMessage()`
- [x] **IMPLEMENTED** -- Write unit tests (`src/lib/subscription-flow.test.ts`) for subscription flow covering all scenarios in `specs/subscription-flow.md`:
  - **Signup tests:**
    - New signup happy path: creates pending subscriber, sends welcome SMS
    - Re-signup while `pending`: resends welcome SMS, does not create duplicate
    - Re-signup while `active`: sends "already a Platypus Fan" SMS
    - Re-signup while `unsubscribed`: resets to `pending`, sends welcome SMS
    - Signup at capacity: rejected with friendly message (web-facing, not the SMS atCapacityMessage)
    - Invalid phone number: returns validation error
    - Concurrent duplicate signup: UNIQUE constraint caught gracefully, treated as re-signup
  - **Confirmation tests:**
    - Reply `1` from pending subscriber: activates, sends confirmation success
    - Reply `PERRY` from pending subscriber: activates, sends confirmation success
    - Reply `perry` (lowercase) from pending subscriber: activates (case-insensitive)
    - Reply ` Perry ` (with whitespace) from pending subscriber: activates (trimmed)
    - Reply `1` but cap reached since signup: replies with at-capacity SMS, stays pending
    - Reply `1` from active subscriber: replies with help message
    - Reply `PERRY` from unsubscribed subscriber: replies with "visit website" message, does NOT re-subscribe
  - **STOP handling tests:**
    - STOP from active subscriber: updates to unsubscribed, sets `unsubscribed_at`
    - STOP from pending subscriber: updates to unsubscribed
  - **Other message tests:**
    - Unrecognized text from pending subscriber: replies with help message
    - Unrecognized text from active subscriber: replies with help message
    - Message from unknown phone number: replies with help message
  - **Twilio START keyword:**
    - START from unsubscribed subscriber: replies with "visit website" message (does NOT reactivate per `specs/subscription-flow.md`)

---

## Priority 13: Rate Limiting

Protects the signup endpoint from abuse. Per `specs/subscription-flow.md` Rate Limiting section and `specs/web-pages.md`.

- [x] **IMPLEMENTED** -- Create `src/lib/rate-limiter.ts` -- in-memory IP-based rate limiter:
  - Track request counts per IP with sliding window or fixed window (1 hour)
  - Limit: 5 requests per IP per hour on the subscribe endpoint (per `specs/subscription-flow.md`)
  - Periodic cleanup of expired entries to prevent memory leaks
  - Export a function that accepts an IP string and returns whether the request is allowed
  - Note: v1 uses in-memory storage. Rate limit state resets on server restart. Acceptable for v1 given single-instance deployment; consider SQLite-backed storage for durability post-launch.
- [x] **IMPLEMENTED** -- Write unit tests (`src/lib/rate-limiter.test.ts`) for rate limiter:
  - Under limit (requests 1-5): allowed
  - At limit (request 5): allowed
  - Over limit (request 6): rejected
  - Window expiration: requests allowed again after 1 hour
  - Different IPs tracked independently
  - Cleanup removes expired entries

---

## Priority 14: Fact Cycling Algorithm

Core algorithm for the daily send job. Implements `specs/fact-cycling.md` exactly. Depends on Priority 11 (Fact Data Access Layer) for database queries.

- [x] **IMPLEMENTED** -- Create `src/lib/fact-cycling.ts` -- fact selection algorithm:
  - Determine current cycle number via `getCurrentCycle()` from fact data access layer
  - **Priority 1 -- New facts first**: any fact with NO entries in `sent_facts` (never sent globally), via `getNeverSentFactIds()`. Pick one at random. Record it in `sent_facts` with the current cycle number.
  - **Priority 2 -- Current cycle unsent**: if all facts have been sent at least once, find facts NOT sent in the current cycle via `getUnsentFactIdsInCycle()`. Pick one at random.
  - **Priority 3 -- New cycle**: if ALL facts have been sent in the current cycle, increment the cycle number. All facts become eligible again. Pick one at random. (Per `specs/fact-cycling.md`: "re-randomization between cycles")
  - **Handling new facts mid-cycle**: a new fact has no `sent_facts` entries, so it falls into Priority 1. When sent, it is recorded with the current cycle number (e.g., if on cycle 3, recorded as `cycle = 3`). Per `specs/fact-cycling.md` Handling New Facts section.
  - **Edge case -- no facts in database**: return null (daily job will log warning and exit)
  - **Edge case -- single fact**: always selected, each day is a new cycle
  - **Edge case -- fact removed from seed file**: still in database, continues to participate in cycling (per `specs/fact-cycling.md`: "Facts are never deleted from the database")
- [x] **IMPLEMENTED** -- Write unit tests (`src/lib/fact-cycling.test.ts`) for fact cycling matching all scenarios in `specs/fact-cycling.md`:
  - Empty `sent_facts` table (first ever send): selects from all facts, records as cycle 1
  - New facts (never sent) prioritized over current-cycle unsent facts
  - All facts sent at least once, some not sent in current cycle: selects from unsent-in-current-cycle
  - All facts sent in current cycle: starts new cycle (cycle number incremented), selects from all facts
  - New fact added mid-cycle: selected before continuing current cycle, recorded with current cycle number
  - Single fact edge case: selected every time, new cycle each day
  - No facts edge case: returns null
  - Randomization: given multiple eligible facts, selection is not deterministic (statistical test or mock random)

---

## Priority 15: Web Server and Routes

The HTTP layer that ties everything together. Uses `Bun.serve()` for the HTTP server.

- [x] **IMPLEMENTED** -- Create `src/index.ts` -- Bun HTTP server entry point using `Bun.serve()`:
  - Run fact sync on startup (per `specs/seed-data.md`: "On application startup, the sync script runs automatically")
  - Initialize database connection
  - Set up request router/dispatcher (match method + path, delegate to route handlers)
  - Serve static files from `public/` directory with path traversal protection (`path.resolve()` validation)
  - Listen on configured PORT
  - Global error handler: catch unhandled errors, log them, return 500 response with `Content-Type: application/json`
  - Handle `SIGTERM` and `SIGINT` for graceful shutdown (await `server.stop()`, close database connection, exit cleanly -- required for Kamal zero-downtime deploys per `specs/infrastructure.md`)
  - Rate limiter cleanup every 10 minutes
- [x] **IMPLEMENTED** -- Create `src/routes/health.ts` -- `GET /health` returns 200 OK (per `specs/infrastructure.md`: used by Kamal for deploy health checks)
- [x] **IMPLEMENTED** -- Create `src/routes/subscribe.ts` -- `POST /api/subscribe`:
  - Parse JSON body `{ "phoneNumber": string }` (field name per `specs/web-pages.md`)
  - Handle malformed JSON body or missing `phoneNumber` field: return 400 with `Content-Type: application/json` and `{ "success": false, "error": "Invalid request body" }`
  - Apply rate limiting (5 per IP per hour) -- return 429 with `{ "success": false, "error": "Too many requests. Please try again later." }`
  - Call subscription flow signup logic
  - At capacity: return 200 with `{ "success": false, "error": "<at-capacity web message>" }`
  - Return `{ "success": true, "message": string }` or `{ "success": false, "error": string }` (response format per `specs/web-pages.md`)
  - Extract client IP from X-Forwarded-For header (falls back to "unknown")
- [x] **IMPLEMENTED** -- Create `src/routes/webhook.ts` -- `POST /api/webhooks/twilio/incoming`:
  - Validate Twilio request signature (clone request to preserve body, reject with 403 if invalid, per `specs/sms-integration.md`)
  - Parse incoming message (extract `From` and `Body`) with error handling
  - Delegate to incoming message handler with error handling (returns empty TwiML on failure to prevent Twilio retries)
  - Return webhook response with `Content-Type: text/xml`. Every code path returns valid TwiML -- either `<Response/>` (no reply) or `<Response><Message>...</Message></Response>` (with reply)
- [x] **IMPLEMENTED** -- Create `src/routes/pages.ts` -- HTML page routes:
  - `GET /` -- signup page (server-rendered HTML, details in Priority 16)
  - `GET /facts/:id` -- fact display page (server-rendered HTML, details in Priority 16)
  - `GET /facts/:id` with nonexistent ID or non-numeric `:id`: return 404 page
  - URL scheme validation (only http/https) to prevent javascript: XSS in source links
- [x] **IMPLEMENTED** -- Write tests (`src/routes/routes.test.ts`) for routes:
  - `GET /health` returns 200
  - `POST /api/subscribe` with valid phone returns success JSON
  - `POST /api/subscribe` with invalid phone returns error JSON with `success: false`
  - `POST /api/subscribe` with malformed JSON body returns 400
  - `POST /api/subscribe` with missing `phoneNumber` field returns 400
  - `POST /api/subscribe` rate limited returns 429
  - `POST /api/subscribe` at capacity returns `success: false` with at-capacity message
  - `POST /api/webhooks/twilio/incoming` with valid signature processes message and returns TwiML XML
  - `POST /api/webhooks/twilio/incoming` with invalid signature returns 403
  - `GET /` returns HTML with signup form
  - `GET /` renders current Platypus Fan count and max capacity
  - `GET /` at capacity renders the capacity message instead of the signup form
  - `GET /facts/:id` with valid ID returns HTML with fact content and sources
  - `GET /facts/:id` with nonexistent numeric ID returns 404
  - 404 page returns helpful content with branding

---

## Priority 16: Web Pages and Themed Design

User-facing HTML pages with Life is Strange: Double Exposure styling. Per `specs/web-pages.md` and `specs/design-decisions.md`.

After implementing any frontend changes, the AGENTS.md requires an Opus subagent UX/UI review to evaluate visual hierarchy, accessibility, theme consistency, usability, and responsiveness before committing.

- [x] **IMPLEMENTED** -- Create `GET /` signup page HTML (per `specs/web-pages.md` Signup Page section):
  - Project title "Daily Platypus Facts"
  - Tagline referencing the *Life is Strange: Double Exposure* inspiration (per `specs/overview.md`)
  - Current Platypus Fan count and limit displayed (e.g., "42 / 1,000 Platypus Fans") -- uses "Platypus Fans" terminology per `specs/design-decisions.md`
  - Phone number input field with US +1 prefix and placeholder `(555) 123-4567`, with sr-only label and aria-describedby for accessibility
  - Submit button with disabled state during submission
  - Brief explanation of what the user is signing up for (one fact per day via SMS)
  - "Standard message rates apply" note
  - At-capacity state: replaces form with capacity message, script not included when at capacity
  - Client-side JS for form submission via `POST /api/subscribe` with success/error/rate-limit display using `role="alert"` for screen readers
- [x] **IMPLEMENTED** -- Create `GET /facts/:id` fact page HTML (per `specs/web-pages.md` Fact Page section):
  - Fact text prominently displayed
  - List of sources with clickable links (display title if available, URL otherwise), filtered to http/https only
  - "Daily Platypus Facts" branding with link to homepage
  - "Inspired by *Life is Strange: Double Exposure*" attribution
  - Link to signup page for visitors who aren't yet subscribed
  - 404 handling for nonexistent fact IDs
- [x] **IMPLEMENTED** -- Create `public/styles.css` -- themed stylesheet (per `specs/web-pages.md` Design section and `specs/design-decisions.md`):
  - Warm, indie, handcrafted aesthetic inspired by *Life is Strange: Double Exposure*
  - WCAG-compliant contrast ratios (accent #a86520, muted text #6b5744)
  - Responsive design for mobile with 480px breakpoint
  - Focus-visible styles for keyboard navigation
  - sr-only utility class for accessible labels
  - Consistent theme between signup page, fact page, and 404 page
- [x] **IMPLEMENTED** -- Add platypus imagery/illustrations to `public/` (inline SVG duck emoji favicon on all pages)

---

## Priority 17: Daily Send Job

The scheduled job that orchestrates sending facts. Implements `specs/daily-job.md`.

The daily send job is a standalone Bun script. It must initialize its own dependencies (config, database connection, SMS provider) since it does not run inside the web server process.

- [x] **IMPLEMENTED** -- Create `src/jobs/daily-send.ts` -- standalone Bun script:
  - Initialize config, database connection, and SMS provider (standalone script via `import.meta.main` guard, not part of the web server)
  - Run fact sync before selecting today's fact (ensures newly added facts are available)
  - Determine "today" in UTC (`new Date().toISOString().split('T')[0]`), with `todayOverride` parameter for testing
  - Check idempotency: query `sent_facts` for today's UTC date via `getSentFactByDate()`, exit if already sent
  - Select today's fact via fact cycling algorithm
  - If no fact selected (no facts in DB): log warning and exit
  - Query all active subscribers via `getActiveSubscribers()`
  - Send SMS to each subscriber using `dailyFactMessage` template with fact URL `${BASE_URL}/facts/${factId}`
  - Continue on individual SMS failures with masked phone number logging (PII protection)
  - Record in `sent_facts` with today's UTC date and cycle number even with partial delivery failures
  - Log summary: total subscribers messaged, success count, failure count
- [x] **IMPLEMENTED** -- Write unit tests (`src/jobs/daily-send.test.ts`) for daily send job:
  - Happy path: fact selected, SMS sent to all active subscribers, recorded in `sent_facts`
  - Idempotency: `sent_facts` already has today's date -> job exits without sending
  - No facts in database: logs warning, exits without error
  - No active subscribers: fact still selected and recorded, no SMS sent
  - Individual SMS failure does not halt job (other subscribers still receive SMS)
  - Fact recorded in `sent_facts` even with partial delivery failures
  - Uses correct `dailyFactMessage` template with fact text and URL
  - Fact URL is constructed correctly (no double slashes)
  - UTC today date used when no override provided (verified via sent_facts record)

---

## Priority 18: Integration Tests and Validation

Ensure all components work together and type safety is maintained.

- [x] **IMPLEMENTED** -- Ensure all unit tests from Priorities 5-17 pass (`bun test`) -- 156 tests passing across 14 files
- [x] **IMPLEMENTED** -- Add integration tests for end-to-end flows (`src/integration.test.ts`):
  - Full signup flow: web signup -> pending subscriber created -> welcome SMS sent -> reply "PERRY" -> subscriber activated -> confirmation SMS sent
  - Full signup flow with "1": same as above but confirming with "1"
  - Daily send job: facts synced -> fact selected by cycling algorithm -> SMS sent to all active subscribers -> recorded in `sent_facts`
  - Fact sync: seed file loaded -> facts inserted -> re-sync is idempotent -> new facts added on subsequent sync
  - Unsubscribe flow: active subscriber sends STOP -> status updated to unsubscribed -> no longer receives daily facts
  - Re-subscribe flow: unsubscribed user visits website -> enters phone -> reset to pending -> confirms -> active again
  - Cap enforcement end-to-end: fill to cap -> new signup rejected -> unsubscribe one -> new signup allowed
  - Additional: pending subscriber cannot confirm when cap reached between signup and confirmation
- [x] **IMPLEMENTED** -- Type check passes with zero errors (`bunx tsc --noEmit`)
- [x] **IMPLEMENTED** -- Lint passes with zero errors (`bunx biome check .`)
- [x] **IMPLEMENTED** -- CodeRabbit review: `cr review` CLI requires TTY (raw mode) and cannot run in non-interactive environments. Skipped per AGENTS.md quota/error rule.

---

## Priority 19: Infrastructure and Deployment

Containerization, CI/CD, and deployment configuration. Per `specs/infrastructure.md`.

- [x] **IMPLEMENTED** -- Create `Dockerfile` (multi-stage, per `specs/infrastructure.md` Dockerfile section):
  - Build stage: `FROM oven/bun:1` as builder, `COPY package.json bun.lock`, `RUN bun install --frozen-lockfile`, `COPY .`
  - Production stage: `FROM oven/bun:1`, copy from builder, expose 3000, `CMD` runs fact sync then starts server
- [x] **IMPLEMENTED** -- Create `.dockerignore` (node_modules, .git, .env, *.db, *.db-shm, *.db-wal, specs/)
- [x] **IMPLEMENTED** -- Create `config/deploy.yml` (Kamal configuration, per `specs/infrastructure.md` Configuration section):
  - Docker image registry (GHCR), server IP placeholder, service name `platypus-facts`
  - Health check endpoint (`GET /health`), SSL proxy config
  - Volume mount for SQLite database (`/opt/platypus-facts/data:/app/data`)
  - Environment variables (clear + secret) for all required config
- [x] **IMPLEMENTED** -- Create `.github/workflows/deploy.yml` (GitHub Actions CI/CD, per `specs/infrastructure.md` How It Works section):
  - Trigger on push to `main` with concurrency control
  - Test job: checkout, setup Bun, install deps, run tests, type check, lint
  - Deploy job: build/push Docker image to GHCR with caching, install Kamal, deploy
- [x] **IMPLEMENTED** -- Document crontab entry for daily send job in `CRON_SETUP.md`: `docker exec` pattern, log rotation, verification steps, fragility notes
- [x] **IMPLEMENTED** -- Created `CRON_SETUP.md` with crontab provisioning instructions, log rotation config, and troubleshooting guidance

---

## Priority 20: Final Polish and Launch Preparation

- [x] **IMPLEMENTED** -- Create README.md with "Inspired by Life is Strange: Double Exposure" attribution
- [x] **VERIFIED** -- All SMS templates match `specs/subscription-flow.md` exactly (character-for-character comparison confirmed)
- [x] **VERIFIED** -- Daily fact SMS format matches `specs/sms-integration.md` (duck emoji + "Daily Platypus Fact:" + fact text + "Sources:" + URL)
- [x] **VERIFIED** -- SMS length considerations: all 28 fact texts are under 100 characters, keeping full messages to 2-3 UCS-2 segments
- [x] **VERIFIED** -- Signup page displays Platypus Fan count and cap correctly using "Platypus Fans" terminology
- [x] **VERIFIED** -- Fact page renders sources with clickable links (titles displayed when available, URL fallback)
- [x] **VERIFIED** -- "Inspired by Life is Strange: Double Exposure" attribution appears on: signup page, fact page, welcome SMS, and README
- [x] **IMPLEMENTED** -- Populated `data/facts.json` with 28 real, sourced platypus facts from Wikipedia, Australian Museum, NHM, Britannica, National Geographic, San Diego Zoo, and scientific journals
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
