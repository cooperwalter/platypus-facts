# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun test                        # Run all tests
bun test src/lib/phone.test.ts  # Run a single test file
bun test --test-name-pattern "normalizes" # Run tests matching pattern
bun run start                   # Start the server (requires .env)
bun run typecheck               # TypeScript type checking (bunx tsc --noEmit)
bun run lint                    # Biome lint + format check
bun run lint:fix                # Auto-fix lint/format issues
bun run sync-facts              # Sync data/facts.json into database
bun run daily-send              # Execute the daily SMS send job
```

## Architecture

Bun HTTP server (`Bun.serve()`) that sends daily platypus facts via SMS (Twilio). No build step — Bun runs TypeScript directly. SQLite database via `bun:sqlite`. Server-rendered HTML pages via template literals (no framework).

### Source Layout

- **`src/index.ts`** — Entry point: HTTP server with route matching, static file serving, graceful shutdown
- **`src/lib/`** — Core modules: database, config, phone validation, subscribers, facts, fact cycling, rate limiting, SMS provider, subscription flow
- **`src/routes/`** — Route handlers: health check, HTML pages, subscribe API, Twilio webhook
- **`src/jobs/daily-send.ts`** — Cron job: selects next fact and sends to all active subscribers
- **`src/scripts/sync-facts.ts`** — Syncs seed data from `data/facts.json` into the database
- **`data/facts.json`** — Seed data (array of `{text, sources: [{url, title}]}`)
- **`public/`** — Static assets (CSS)

### Key Design Decisions

- **SMS provider is interface-based** (`SmsProvider` in `src/lib/sms/types.ts`) — only Twilio implementation exists, but tests use `makeMockSmsProvider()`
- **Fact cycling** ensures every fact is sent before any repeats, tracking cycles in the `sent_facts` table
- **`handleIncomingMessage`** returns a message string (not a Response) — the caller wraps it in TwiML
- **`runDailySend`** accepts a `todayOverride` param because Date mocking doesn't work in Bun's test runner
- **Rate limiting** is in-memory per-process (sliding window, configured at 5 req/hr in index.ts)
- **Config** (`loadConfig()`) validates all env vars on startup and strips trailing slashes from BASE_URL

### Database

Four SQLite tables: `facts`, `fact_sources` (FK→facts, CASCADE DELETE), `subscribers` (UNIQUE phone_number), `sent_facts` (UNIQUE sent_date, FK→facts, NO CASCADE). WAL mode and foreign keys enabled. Schema auto-initializes on connection.

## Testing Patterns

Tests use Bun's test runner (`describe`/`test`/`expect`). Test utilities in `src/lib/test-utils.ts`:

- `makeTestDatabase()` — in-memory SQLite with schema initialized
- `makeMockSmsProvider()` — mock implementing `SmsProvider` with `sentMessages` array for assertions
- `makeFactRow(db, overrides?)`, `makeSubscriberRow(db, overrides?)`, `makeSentFactRow(db, overrides?)` — data builders (generator pattern, not beforeEach/afterEach)

Phone numbers in tests: avoid area codes or exchanges starting with 0 or 1 (NANP validation rejects them).

## Linting / Style

Biome with recommended rules, tab indentation, 100-char line width. Biome rejects non-null assertions (`!.`) — use optional chaining (`?.`) or a guard (`if (!x) throw`). `--fix --unsafe` can change `!.` to `?.` which may break TS when the value is used as an argument (not just in `expect`).
