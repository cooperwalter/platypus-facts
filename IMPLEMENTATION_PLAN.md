# Implementation Plan -- Daily Platypus Facts

## Status Summary

**All spec items complete (2026-02-13).** Full audit across all 20 spec files and all source code — zero remaining issues. Core service fully functional and spec-compliant.

- **423 tests passing** across 19 test files with **898 expect() calls**
- **Type check clean**, **lint clean**
- **No TODOs, FIXMEs, skipped tests, or placeholder code** in source
- **28 real platypus facts** sourced and seeded with AI-generated illustrations (31 images in `public/images/facts/`)
- **Platypus mascot PNG** optimized to 74KB at 400x400 (down from 451KB at 1024x1024)
- **Fact images** optimized to 640x640 (86KB-538KB, down from 243KB-1.3MB)
- **Favicons** generated from mascot: `favicon.ico`, `favicon-32.png`, `apple-touch-icon.png`
- **ARCHITECTURE.md** updated with Drizzle ORM, health monitoring, welcome email flow, image optimization, all routes, static assets
- **Latest tag**: 0.0.68
- **All 11 render functions** include `renderFooter()` and 3 favicon `<link>` tags
- **Email templates**: All 4 templates (daily fact, confirmation, already subscribed, welcome) have HTML + plain text, `List-Unsubscribe` + `List-Unsubscribe-Post` headers
- **CSS micro-interactions**: `prefers-reduced-motion` media query wrapping all transitions
- **Static cache headers**: `getCacheControl()` with extension normalization via `.toLowerCase()`
- **Drizzle ORM**: All query modules use Drizzle query builder; only `db.ts` uses raw sqlite (intentional for PRAGMAs/migrations)
- **CI workflow**: `.github/workflows/ci.yml` runs tests, typecheck, and lint on PRs targeting `main`

---

## All Enhancements Complete

```
P2 (Email Mascot)         COMPLETE
P1 (Welcome Email)        COMPLETE
P4 (Static Cache Headers) COMPLETE
P3 (Health Dashboard)     COMPLETE
P5 (Micro-Interactions)   COMPLETE
P7 (Image Optimization)   COMPLETE
P6 (Favicon)              COMPLETE
```

---

## Spec Compliance Audit (Latest)

All 20 spec files audited against source code (2026-02-13) — all fully compliant:

- **overview.md**: Tech stack, components, attribution — all present and correct
- **data-model.md**: All 5 tables match spec exactly. WAL mode, foreign keys, Drizzle migrate() all working.
- **subscription-flow.md**: All flows correct. Email validation, subscriber cap, rate limiting, existing subscriber lookup all working. confirmed_at preservation on re-subscribe tested.
- **fact-cycling.md**: Algorithm correct. All edge cases tested.
- **seed-data.md**: `sync-facts.ts` correctly syncs, upserts by text match, generates images via DALL-E. Empty OPENAI_API_KEY handled correctly.
- **fact-images.md**: AI generation at sync time, graceful degradation when no image. Empty API key normalized to null.
- **email-integration.md**: Provider abstraction, Brevo implementation, dev provider with SQLite persistence. All 4 templates with HTML + plain text + headers. List-Unsubscribe headers tested on all email paths (confirmation, already-subscribed, daily, welcome).
- **daily-job.md**: Idempotency, active subscribers only, individual failure handling, `--force` rejected in production (now tested via subprocess).
- **cli.md**: All commands configured in package.json.
- **web-pages.md**: All pages implemented with footer, background pattern, desktop top padding.
- **design-decisions.md**: All decisions reflected in implementation.
- **cost-estimate.md**: Informational spec, no implementation required.
- **email-mascot.md**: Mascot PNG in email headers, emoji removed from HTML. `emailWrapper()` accepts `baseUrl`. All 4 templates tested for emoji absence.
- **health-dashboard.md**: `/health` JSON + `/health/dashboard` HTML. All metrics implemented.
- **static-cache-headers.md**: `getCacheControl()` with extension normalization.
- **favicon.md**: All favicon files exist. All render functions have favicon `<link>` tags.
- **micro-interactions.md**: All transitions in `prefers-reduced-motion` media query.
- **image-optimization.md**: `optimize-images.ts` with sharp + png-to-ico. Idempotent.
- **infrastructure.md**: Kamal deploys, Cloudflare Tunnel, Docker arm64, `.env.development`, CI workflow for PRs.
- **welcome-email.md**: Welcome email with most recent fact for first-time subscribers only. Returning subscribers skip welcome email and see different confirmation message. All 19 test scenarios covered.

---

## Bugs Fixed (2026-02-13)

- **Welcome email plain text had duplicate opening line**: `welcomeEmailPlain()` repeated "Welcome to Daily Platypus Facts!" twice — fixed to show it once as title, then body text without redundant repeat.
- **OPENAI_API_KEY empty string not normalized**: Config used `??` (nullish coalescing) which passes through empty strings — changed to `||` (logical OR) so empty strings become `null`. Same fix in `sync-facts.ts` CLI entry point and warning condition.
- **db.test.ts comment inaccuracy**: Test description said "NO ACTION" but schema uses `onDelete: "restrict"` — corrected to "RESTRICT".

---

## Outstanding Items (Non-Blocking, Not Spec-Required)

- **Manual Brevo testing**: Test with real Brevo API before production launch
- **Database backup strategy**: Post-launch, not spec-required
