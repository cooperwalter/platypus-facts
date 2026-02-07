# Implementation Plan -- Daily Platypus Facts

## Status Summary

**All priorities through P59 implemented. P57-P59 complete, ready for commit.**

- **434 tests passing** across 23 test files with **1015 expect() calls**
- **Type check clean**, **lint clean**
- **28 real platypus facts** sourced and seeded with AI-generated illustrations (31 images in `public/images/facts/`)
- **Latest tag**: 0.0.39
- **Independent audit (2026-02-07)**: All 15 spec files audited line-by-line against all 51 source files. Zero TODOs/FIXMEs, zero `any` types, zero skipped tests.

---

## Outstanding Items

### P61 — Background pattern spacing review (MINOR — visual check needed)

**Spec**: `specs/web-pages.md` line 28: icons should be "**generously spaced** — not packed tightly together. Use `background-size` and/or padding within the tile to ensure visible gaps between each icon so the pattern feels airy and light, not dense or wallpaper-like."

**Code**: `public/styles.css:48` uses `background-size: 48px 48px`. The SVG icon (`public/platypus-icon.svg`, 512x512pt viewBox) likely fills most of this tile. May need to increase to ~80-120px or use a CSS technique to add padding (e.g., larger background-size with a smaller SVG, or an SVG with built-in whitespace).

**Action**: Visual inspection needed. Start the server (`bun run start`), view the page, and if the current 48px feels dense, increase `background-size` to create more space between icons.

---

## Remaining

1. **P61** — Visual review of background pattern spacing (MINOR — visual check, possible CSS tweak)
2. Manual testing with Twilio and Postmark before production launch

---

## Completed Priorities (1-59)

All 59 priorities shipped. See git history for details.

### Recent Completions

| Priority | Description | Notes |
|----------|-------------|-------|
| P57 | Remove animated swimming platypus | ~200 lines removed across pages.ts, styles.css, routes.test.ts. Spec violation resolved. |
| P58 | Implement `dev_messages` SQLite table | Dev providers now persist to SQLite for cross-process visibility. 10 files updated. |
| P59 | Fix lint error in db.ts:62 | Quote style fix. |
| P55-P56 | Spec clarity + .DS_Store | Tag 0.0.39 |

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
