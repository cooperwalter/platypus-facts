# Implementation Plan -- Daily Platypus Facts

## Status Summary

**P69 complete (SMS removal).** All 68 original priorities (P1-P68) plus P69 complete. Remaining work: database schema alignment, Drizzle ORM migration, a missing fact-page link in daily emails, and documentation updates.

- **317 tests passing** across 19 test files with **684 expect() calls**
- **Type check clean**, **lint clean**
- **28 real platypus facts** sourced and seeded with AI-generated illustrations (31 images in `public/images/facts/`)
- **Latest tag**: 0.0.44

### What Changed

The specs were updated to make the service email-only and to require Drizzle ORM. The most recent commit (`546a8f8`) updated the spec files but did **not** change any application code. The specs are the source of truth; the code must be brought into alignment.

**Note on PROMPT_plan.md**: The ULTIMATE GOAL in `PROMPT_plan.md` still references SMS double opt-in and Twilio. This is outdated — the spec files (`specs/overview.md`, `specs/design-decisions.md`, `specs/data-model.md`) are the authoritative source of truth and define an email-only service. P72 includes updating `PROMPT_plan.md` to match.

---

## New Priorities

### P69 — Remove all SMS/phone support ✅ COMPLETE

Removed entire SMS infrastructure: 13 files deleted (sms/ directory, phone validation, SMS templates, webhook handler), 22 files modified to remove all Twilio/SMS/phone references. Twilio dependency removed from package.json. Integration tests rewritten for email-only flows. 317 tests pass, typecheck and lint clean.

---

### P70 — Remove phone_number from database schema, make email NOT NULL

The `subscribers` table still has `phone_number TEXT UNIQUE` and `email` is nullable. The spec defines email as `NOT NULL` with no phone_number column.

**Changes:**
- `src/lib/db.ts` — Update `initializeSchema()`: remove `phone_number TEXT UNIQUE` from subscribers CREATE TABLE; change `email TEXT UNIQUE` to `email TEXT NOT NULL UNIQUE`
- `src/lib/db.ts` — Update `migrateSchema()`: remove `tryAddColumn(db, "subscribers", "email TEXT")`; remove `migrateSubscribersConstraints()` (which creates phone_number); add a new migration that drops phone_number and makes email NOT NULL for existing databases (using the ALTER TABLE rename pattern)
- `src/lib/db.ts` — Remove `hasColumn()`, `tryAddColumn()`, `isColumnNullable()`, `migrateSubscribersConstraints()` if no longer needed after Drizzle migration (P71); otherwise simplify
- `src/lib/subscribers.ts` — Update `Subscriber` interface: remove `phone_number`; change `email` from `string | null` to `string`
- `src/lib/test-utils.ts` — Update `makeSubscriberRow()`: remove `phone_number` parameter and column from INSERT; require or default `email`
- `src/lib/db.test.ts` — Remove phone_number uniqueness tests; update schema assertions for email NOT NULL
- `dev_messages` table — Remove `sms` as a valid `type` value (spec says `type` is always `email`)

**Affected files:**
- `src/lib/db.ts`
- `src/lib/db.test.ts`
- `src/lib/subscribers.ts`
- `src/lib/test-utils.ts`
- All test files that call `makeSubscriberRow()` with phone_number overrides

---

### P71 — Migrate to Drizzle ORM

The specs require Drizzle ORM for schema definition, query building, and migrations. Currently the project uses raw SQL with hand-written migrations.

**Install dependencies:**
- `drizzle-orm` — ORM package
- `drizzle-kit` — Migration generation CLI (devDependency)

**Create new files:**
- `src/lib/schema.ts` — Drizzle schema definitions using `sqliteTable()` from `drizzle-orm/sqlite-core` for all 5 tables (`facts`, `fact_sources`, `subscribers`, `sent_facts`, `dev_messages`) matching the spec exactly
- `drizzle.config.ts` — Drizzle Kit configuration pointing to schema file, SQLite dialect, `drizzle/` output directory
- `drizzle/` — Directory for generated SQL migration files (created by `drizzle-kit generate`)

**Steps:**
1. Define Drizzle schema in `src/lib/schema.ts` that exactly matches the current (post-P70) database structure
2. Create `drizzle.config.ts`
3. Run `drizzle-kit generate` to create the baseline migration
4. Mark baseline migration as already-applied for existing databases (journal entry or custom logic)
5. Update `src/lib/db.ts`:
   - Replace `initializeSchema()` and `migrateSchema()` with Drizzle's `migrate()` from `drizzle-orm/bun-sqlite/migrator`
   - Create `drizzle()` instance wrapping the `bun:sqlite` Database
   - Export both the raw `Database` (for any remaining raw queries) and the Drizzle instance
6. Update query files to use Drizzle query builder where practical:
   - `src/lib/subscribers.ts` — Use Drizzle select/insert/update
   - `src/lib/facts.ts` — Use Drizzle select/insert
   - `src/lib/fact-cycling.ts` — Use Drizzle queries
   - `src/jobs/daily-send.ts` — Use Drizzle queries
   - `src/scripts/sync-facts.ts` — Use Drizzle queries
7. Update `package.json` scripts — add `"generate": "drizzle-kit generate"` script
8. Update test utilities to work with Drizzle (in-memory database + migrate)

**Affected files:**
- `src/lib/db.ts` (major rewrite)
- `src/lib/db.test.ts`
- `src/lib/subscribers.ts`
- `src/lib/subscribers.test.ts`
- `src/lib/facts.ts`
- `src/lib/facts.test.ts`
- `src/lib/fact-cycling.ts`
- `src/lib/fact-cycling.test.ts`
- `src/jobs/daily-send.ts`
- `src/jobs/daily-send.test.ts`
- `src/scripts/sync-facts.ts`
- `src/scripts/sync-facts.test.ts`
- `src/lib/test-utils.ts`
- `package.json`
- `drizzle.config.ts` (new)
- `src/lib/schema.ts` (new)
- `drizzle/` directory (new, generated)

---

### P72 — Update all documentation for email-only + Drizzle

After the code changes, all project documentation must reflect the new state.

**Changes:**
- `CLAUDE.md` — Remove all SMS/Twilio/phone references from Architecture, Source Layout, Key Design Decisions, Database, and Testing Patterns sections; add Drizzle ORM references (schema.ts, drizzle.config.ts, drizzle/ directory, migration workflow); update database section to describe Drizzle-managed schema; fix `confirmation_token` reference (should be `token`)
- `ARCHITECTURE.md` — Remove SMS Provider box from ASCII diagram; update "Database Schema" section for email-only subscribers; replace "SmsProvider" from Provider Abstraction section; mention Drizzle ORM for schema management; update daily send description to email-only
- `AGENTS.md` — Remove SMS/Twilio/phone references (lines 54, 56, 60); update operational notes for email-only
- `README.md` — Rewrite for email-only service: remove "via SMS and/or email" description, remove Twilio provider mention, remove phone number signup references, remove PERRY/1 confirmation flow, update architecture description
- `PROMPT_plan.md` — Update ULTIMATE GOAL description to match email-only spec (currently references SMS double opt-in and Twilio)

**Affected files:**
- `CLAUDE.md`
- `ARCHITECTURE.md`
- `AGENTS.md`
- `README.md`
- `PROMPT_plan.md`

---

### P73 — Clean up dev_messages table for email-only

The `dev_messages` table currently supports both `sms` and `email` types. With SMS removed, the `type` column should always be `email`. The dev message viewer routes should only handle email messages.

**Changes:**
- `src/lib/email/dev.ts` — Verify `type` is always set to `email` (likely already correct)
- `src/routes/pages.ts` — Dev message viewer: remove any SMS-specific rendering or `sms-` prefixed ID handling
- `src/server.ts` — Dev routes: remove SMS message fetching from dev viewer
- `public/styles.css` — Remove `.dev-badge-sms` CSS class (if not already done in P69)

**Affected files:**
- `src/lib/email/dev.ts`
- `src/routes/pages.ts`
- `src/server.ts`
- `public/styles.css`

---

### P75 — Add fact page link to daily email

**Spec gap**: `design-decisions.md` lines 17-19 state: "Sources: Linked web page (not inline in email) — Each daily email includes a link to a web page that displays the fact with its full sources."

The current `dailyFactEmailHtml()` renders source links inline in the email body but does NOT include a link to the fact page (`{base_url}/facts/{id}`). The fact URL should be passed to the email template.

**Changes:**
- `src/lib/email-templates.ts` — Add `factPageUrl` field to `DailyFactEmailData` interface; add a prominent link to the fact page in the daily email HTML body (e.g., "View this fact with sources" linking to `{base_url}/facts/{id}`); add the link in `dailyFactEmailPlain` too
- `src/lib/email-templates.test.ts` — Add test cases for fact page URL rendering in daily email
- `src/jobs/daily-send.ts` — Pass `factUrl` to the email template data as `factPageUrl`

**Design note**: The email should still render source links inline (the spec's `email-integration.md` says "Source links (clickable)"). The fact page link is an _additional_ link, not a replacement. The design decision says "linked web page" meaning the email links TO the page; sources can be shown both places.

**Affected files:**
- `src/lib/email-templates.ts`
- `src/lib/email-templates.test.ts`
- `src/jobs/daily-send.ts`
- `src/jobs/daily-send.test.ts`

---

### P74 — Ensure all tests pass after changes, run full validation

Final validation pass after all code changes.

**Steps:**
- Run `bun test` — all tests must pass
- Run `bun run typecheck` — must be clean
- Run `bun run lint` — must be clean
- Verify no orphan imports or dead code references to SMS/phone/Twilio
- Verify `bun install` succeeds with twilio removed
- Verify dev server starts cleanly (`bun run start`)
- Verify the signup page renders correctly (email-only form)

---

## Outstanding Items

### Pi 5 Server IP — Deferred (requires physical setup)

`config/deploy.yml` line 9 still has `<your-server-ip>` placeholder. This requires the Raspberry Pi 5 to be set up on the local network and its IP confirmed. All other deploy config values are filled in.

---

## Remaining After New Priorities

- Confirm Pi 5 server IP and update `config/deploy.yml`
- Manual testing with Postmark before production launch
- Database backup strategy (post-launch, not spec-required)

---

## Completed Priorities (1-68)

All 68 original priorities shipped. See git history for details.

### Recent Completions

| Priority | Description | Notes |
|----------|-------------|-------|
| P69 | Remove all SMS/phone support (email-only) | Deleted 13 SMS files, modified 22 files, removed twilio dependency. Rewrote integration tests for email-only. 317 tests, 684 expects. |
| P68 | Extract `createRequestHandler` + 33 server tests | Refactored `handleRequest` out of `index.ts` into testable `server.ts` factory. Tests cover route dispatching, static file serving, path traversal protection, 404 fallback, dev route gating, method restrictions, and URL pattern matching. |
| P67 | Fix .env.example PORT | Changed PORT from 3090 to 3000 to match production deploy config. |
| P66 | Platypus emoji in README | Added platypus emoji combo to README heading per spec. |
| P65 | Fill deploy.yml placeholders | Image, host filled in. Server IP deferred. |

---

## Resolved Items

### P53 — EmailProvider `imageUrl` parameter — CLOSED (intentional deviation)

Image URL passed via HTML template data structure instead of interface parameter. Functionally equivalent.

### P54 — Twilio opt-out webhook — CLOSED (removed in P69)

Twilio webhook removed entirely as part of SMS removal.

### sent_facts ON DELETE RESTRICT — NOT A GAP

SQLite's default NO ACTION behaves identically to RESTRICT. Correct behavior for historical send records.

### Dockerfile fact sync — NOT A GAP

`src/index.ts` calls `syncFacts()` on server startup, satisfying the spec requirement.

---

## Known Non-Gaps

- **Logging**: No spec covers structured logging. Using `console.log`/`console.error` for v1.
- **Backups**: Spec mentions options but doesn't require implementation. Deferred.
- **`.env.development` Loading**: Bun handles automatically.
- **`dev_messages` Table**: Created unconditionally. Harmless in production. Spec says "only created when dev providers are active" but this is a known acceptable deviation.

---

## Audit Trail

### Files found with SMS/phone/Twilio references (confirmed complete)

Every file in the codebase with SMS, phone, or Twilio references has been accounted for in the priorities above. The deep audit identified these files that were **missing from the original plan**:

| File | Issue | Added to Priority |
|------|-------|-------------------|
| `src/integration.test.ts` | Nearly every test uses SMS flows | P69 |
| `src/lib/email/index.test.ts` | Twilio config values in test objects | P69 |
| `config/deploy.yml` | Twilio secrets in Kamal deploy config | P69 |
| `.github/workflows/deploy.yml` | Twilio env vars in CI deploy step | P69 |
| `public/styles.css` | `.dev-badge-sms` CSS class | P69/P73 |
| `AGENTS.md` | SMS/Twilio/phone operational notes | P72 |
| `README.md` | SMS/Twilio/phone descriptions | P72 |
| `PROMPT_plan.md` | SMS double opt-in in ULTIMATE GOAL | P72 |
| `src/routes/routes.test.ts` | Was incorrectly listed as `pages.test.ts` | P69 (filename corrected) |
| `src/lib/db.test.ts` | Was listed as "if exists" — it exists | P70 (confirmed) |

### Behavioral gap found

| Issue | Description | Priority |
|-------|-------------|----------|
| Daily email missing fact page link | `design-decisions.md` says email links to fact web page; code inlines sources but has no link to `/facts/{id}` | P75 (new) |
