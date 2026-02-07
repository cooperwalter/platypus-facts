# Implementation Plan -- Daily Platypus Facts

## Status Summary

**All priorities through P61 implemented.**

- **434 tests passing** across 23 test files with **1015 expect() calls**
- **Type check clean**, **lint clean**
- **28 real platypus facts** sourced and seeded with AI-generated illustrations (31 images in `public/images/facts/`)
- **Latest tag**: 0.0.41
- **Independent audit (2026-02-07)**: All 15 spec files audited line-by-line against all 51 source files. Zero TODOs/FIXMEs, zero `any` types, zero skipped tests.

---

## Outstanding Items

None.

---

## Remaining

Manual testing with Twilio and Postmark before production launch

---

## Completed Priorities (1-61)

All 61 priorities shipped. See git history for details.

### Recent Completions

| Priority | Description | Notes |
|----------|-------------|-------|
| P61 | Background pattern spacing review | Expanded SVG viewBox from `0 0 512 512` to `-256 -256 1024 1024` for padding, increased CSS `background-size` from `48px 48px` to `80px 80px`. Fixed accessibility issue: removed conflicting `aria-hidden="true"` from phone prefix span. Visual review confirmed generously spaced pattern. |
| P58 | Implement `dev_messages` SQLite table | Dev providers now persist to SQLite for cross-process visibility. 10 files updated. |
| P59 | Fix lint error in db.ts:62 | Quote style fix. |
| P57 | Remove animated swimming platypus | ~200 lines removed across pages.ts, styles.css, routes.test.ts. Spec violation resolved. |

### P58 Implementation Details

**Schema decision**: `dev_messages` table added to `initializeSchema()` with `CREATE TABLE IF NOT EXISTS` — harmless in production, simplifies migration.

**MediaUrl handling**: SMS `mediaUrl` is stored inline in the body field as `\n[Media: URL]` suffix, parsed out on read. This avoids adding a column not in the spec while preserving the data.

**PlainBody/Headers**: Email `plainBody` and `headers` are not persisted to `dev_messages` since the spec table doesn't include them. The dev message viewer only needs `htmlBody` for preview.

**Factory changes**: `createSmsProvider()` and `createEmailProvider()` now accept optional `Database` parameter. Throws if dev mode but no database provided.

---

## Resolved Items

### P53 — EmailProvider `imageUrl` parameter — CLOSED (intentional deviation)

Image URL passed via HTML template data structure instead of interface parameter.

### P54 — Twilio opt-out webhook — CLOSED

Twilio forwards STOP messages to the existing incoming message webhook.

### Phone Number NOT NULL Migration — RESOLVED

`migrateSubscribersConstraints()` in db.ts recreates subscribers table with nullable phone_number.

---

## Known Spec Gaps and Recommendations

### Error Handling and Logging Strategy
No spec covers structured logging. Using `console.log`/`console.error` for v1.

### Database Backup Implementation
Defer to post-launch. Start with simple daily cron backup.

### `.env.development` Loading
Bun automatically loads `.env.development` when `NODE_ENV=development` (or unset). No code change needed.
