# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun test                        # Run all tests
bun test src/lib/subscribers.test.ts  # Run a single test file
bun test --test-name-pattern "signup" # Run tests matching pattern
bun run start                   # Start the server (requires .env)
bun run typecheck               # TypeScript type checking (bunx tsc --noEmit)
bun run lint                    # Biome lint + format check
bun run lint:fix                # Auto-fix lint/format issues
bun run sync-facts              # Sync data/facts.json into database
bun run daily-send              # Execute the daily send job
```

## Architecture

Bun HTTP server (`Bun.serve()`) that sends daily platypus facts via email (Postmark). No build step — Bun runs TypeScript directly. SQLite database via `bun:sqlite` with Drizzle ORM for schema definition and migrations. Server-rendered HTML pages via template literals (no framework).

### Source Layout

- **`src/index.ts`** — Entry point: HTTP server with route matching, static file serving, graceful shutdown, dev message viewer routes (when dev providers are active)
- **`src/server.ts`** — `createRequestHandler(deps)` factory: testable request handler extracted from index.ts
- **`src/lib/`** — Core modules: database, config, schema (Drizzle), subscribers, facts, fact cycling, rate limiting, email provider, subscription flow
- **`drizzle/`** — Generated migration SQL files (managed by `drizzle-kit generate`)
- **`drizzle.config.ts`** — Drizzle Kit configuration
- **`src/lib/email/`** — Email provider abstraction: Postmark implementation + dev provider (persists to `dev_messages` table)
- **`src/routes/`** — Route handlers: health check, HTML pages (including dev message viewer), subscribe API
- **`src/jobs/daily-send.ts`** — Cron job: selects next fact and sends to all active subscribers via email
- **`src/scripts/sync-facts.ts`** — Syncs seed data from `data/facts.json` into the database
- **`data/facts.json`** — Seed data (array of `{text, sources: [{url, title}]}`)
- **`public/`** — Static assets (CSS, fact images)

### Key Design Decisions

- **Email provider is interface-based** (`EmailProvider` in `src/lib/email/types.ts`) — Postmark implementation for production, `DevEmailProvider` for development, `makeMockEmailProvider()` for tests
- **Dev email provider** persists to SQLite `dev_messages` table; dev viewer routes are conditionally registered via `instanceof` checks
- **Fact cycling** ensures every fact is sent before any repeats, tracking cycles in the `sent_facts` table
- **`runDailySend`** accepts a `todayOverride` param because Date mocking doesn't work in Bun's test runner; accepts `--force` flag to re-send (blocked in production)
- **Rate limiting** is in-memory per-process (fixed window, configured at 5 req/hr in index.ts)
- **Config** (`loadConfig()`) validates all env vars on startup and strips trailing slashes from BASE_URL

### Database

Five SQLite tables defined in `src/lib/schema.ts`: `facts`, `fact_sources` (FK→facts, CASCADE DELETE), `subscribers` (email NOT NULL UNIQUE, token NOT NULL UNIQUE), `sent_facts` (UNIQUE sent_date, FK→facts, NO CASCADE), `dev_messages`. WAL mode and foreign keys enabled. Drizzle's `migrate()` manages schema; `createDatabase()`/`createInMemoryDatabase()` return `{ db: DrizzleDatabase, sqlite: Database }`. Query code uses raw `sqlite` (Database) with prepared statements. Legacy phone_number migration runs before Drizzle migration for old databases.

Prefer `db.run()` over `db.exec()` for executing SQL statements. `db.run()` uses prepared statements (safer, supports parameters), while `db.exec()` runs raw SQL strings. To add schema changes: update `src/lib/schema.ts`, then run `bun run generate` to create a new migration.

## Testing Patterns

Tests use Bun's test runner (`describe`/`test`/`expect`). Test utilities in `src/lib/test-utils.ts`:

- `makeTestDatabase()` — in-memory SQLite with schema initialized
- `makeMockEmailProvider()` — mock implementing `EmailProvider` with `sentEmails` array for assertions
- `makeFactRow(db, overrides?)`, `makeSubscriberRow(db, overrides?)`, `makeSentFactRow(db, overrides?)` — data builders (generator pattern, not beforeEach/afterEach)

## Linting / Style

Biome with recommended rules, tab indentation, 100-char line width. Biome rejects non-null assertions (`!.`) — use optional chaining (`?.`) or a guard (`if (!x) throw`). `--fix --unsafe` can change `!.` to `?.` which may break TS when the value is used as an argument (not just in `expect`).
