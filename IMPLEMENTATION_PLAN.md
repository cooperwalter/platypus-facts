# Implementation Plan -- Daily Platypus Facts

## Status Summary

**P80 complete. 1 spec gap remains (P79).** Brevo is the production email provider. MAX_SUBSCRIBERS defaults to 200.

- **332 tests passing** across 19 test files with **716 expect() calls**
- **Type check clean**, **lint clean**
- **28 real platypus facts** sourced and seeded with AI-generated illustrations (31 images in `public/images/facts/`)
- **Latest tag**: 0.0.53

---

## Remaining Priorities

### P79 — Add platypus emoji (🦫🦆🥚) throughout web pages ⬜ TODO

**Priority: MEDIUM** — The spec (`specs/web-pages.md` line 23) says to "Use the platypus emoji combination (🦫🦆🥚) liberally throughout the page to add character — in the title, tagline, fan count, form labels, success/error messages, and footer."

**Current state:** No instances of 🦫🦆🥚 appear anywhere in `src/`. Pages use the duck emoji (🦆) only in the favicon.

**What needs to change:**

- **`src/routes/pages.ts`**: Add 🦫🦆🥚 to page titles/headings, taglines, fan count section, form labels, success messages, error messages, and footer.
- **`src/lib/email-templates.ts`**: Consider adding the emoji to email branding (if appropriate — spec says "wherever emoji are appropriate").

---

## Priority Order

| # | Description | Impact | Effort |
|---|-------------|--------|--------|
| P79 | Add platypus emoji throughout | Medium (spec compliance, design polish) | Low (string changes across pages) |

---

## Recently Completed

| Priority | Description | Notes |
|----------|-------------|-------|
| P80 | Add warm note explaining subscriber cap | Added `.cap-note` paragraph below fan count with dynamic max, CSS styling, 2 new tests. 332 tests, 716 expects. |
| P77+P78 | Add footer + /inspiration and /about pages | Shared `renderFooter()` helper on all pages, `renderInspirationPage()` and `renderAboutPage()`, GET routes in server.ts, footer + content-card CSS, 11 new tests. 330 tests, 713 expects. |
| P81 | Fix MAX_SUBSCRIBERS default to 200 | Changed default from 1000 to 200 in config, tests, .env files, deploy.yml. |
| P76 | Switch Postmark → Brevo | Renamed `postmarkApiToken` → `brevoApiKey` in Config, wired `BrevoEmailProvider` in factory, added sender name, deleted Postmark files, updated all config/deploy/docs. 319 tests, 686 expects. |
| P75 | Add fact page link to daily email | Added factPageUrl to DailyFactEmailData, CTA button in HTML, link in plain text. |
| P74 | Ensure all tests pass after changes | 319 tests, 687 expects, typecheck clean, lint clean. |

---

## Outstanding Items (Non-Blocking)

- **Pi 5 Server IP**: `config/deploy.yml` line 9 still has `<your-server-ip>` placeholder (requires physical setup)
- **Drizzle query builder adoption**: Query files still use raw `sqlite` (Database) — deferred, not spec-blocking
- **Manual Brevo testing**: Test with real Brevo API before production launch
- **Database backup strategy**: Post-launch, not spec-required

---

## Spec Compliance Summary

| Area | Status | Notes |
|------|--------|-------|
| Email provider (Brevo) | ✅ Complete | Brevo wired in, sender name included, Postmark removed |
| Subscription flow | ✅ Complete | Cap checked at signup + confirmation, List-Unsubscribe headers on all emails |
| Email templates | ✅ Complete | All 3 templates, correct subjects, plain-text fallbacks, source links, fact page link |
| Fact cycling | ✅ Complete | New facts prioritized, re-randomized per cycle |
| Daily send | ✅ Complete | Idempotent, --force dev-only, graceful failure handling |
| Sync + images | ✅ Complete | Upsert by text, image generation, auth failure handling |
| Drizzle schema | ✅ Complete | All 5 tables match spec exactly |
| Signup page | ⚠️ Mostly | Missing: emoji (P79); warm note complete |
| Fact page | ✅ Complete | Illustration, sources, branding, signup link |
| Footer | ✅ Complete | Shared footer on all pages with Inspiration, About links and credit |
| /inspiration page | ✅ Complete | Life is Strange: Double Exposure origin story |
| /about page | ✅ Complete | Project description, tech stack, Brevo mention |
| Platypus emoji | ❌ Missing from pages | P79 |
| MAX_SUBSCRIBERS default | ✅ Complete | Default 200, matches spec |
| Confirmation page | ✅ Complete | All states handled, cap check |
| Unsubscribe pages | ✅ Complete | GET confirmation + POST processing |
| Health endpoint | ✅ Complete | GET /health returns 200 |
| Dev message viewer | ✅ Complete | /dev/messages list + detail |
| Rate limiting | ✅ Complete | 5 per IP per hour on subscribe |
| Infrastructure/deploy | ✅ Complete | Brevo in deploy config, GitHub Actions updated |
| Background pattern | ✅ Complete | SVG repeat with low opacity |
| Desktop top padding | ✅ Complete | 6rem padding on ≥768px |
| CRON_SETUP.md | ✅ Complete | Cron documentation exists |
| Dockerfile | ✅ Complete | Multi-stage, oven/bun, arm64 handled by CI |
| Life is Strange attribution | ✅ Complete | README, signup page, welcome email |
| ARCHITECTURE.md diagram | ✅ Complete | Up-to-date |
| Fact sources | ✅ Complete | All 27 facts have sources in data/facts.json |
| Responsive design | ✅ Complete | Mobile breakpoints implemented |
| .dockerignore | ✅ Complete | Exists |
| CI/CD pipeline | ✅ Complete | GitHub Actions workflow |
