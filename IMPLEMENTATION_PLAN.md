# Implementation Plan -- Daily Platypus Facts

## Status Summary

**P76 complete. 5 spec gaps remain (P77-P81).** All 76 priorities shipped. Brevo is now the production email provider.

- **319 tests passing** across 19 test files with **686 expect() calls**
- **Type check clean**, **lint clean**
- **28 real platypus facts** sourced and seeded with AI-generated illustrations (31 images in `public/images/facts/`)
- **Latest tag**: 0.0.49

---

## Remaining Priorities

### P77 — Add footer to all public pages ⬜ TODO

**Priority: HIGH** — The spec (`specs/web-pages.md` lines 74-80) requires a shared footer on all public pages with:
- **"Inspiration" link** → `/inspiration` page explaining the *Life is Strange: Double Exposure* origin
- **"About" link** → `/about` page with information about the project
- **"Made with ❤️ by Cooper Walter"**

**Current state:** No pages have a footer. All pages close with `</main></body></html>` with no footer content.

**What needs to change:**

- **`src/routes/pages.ts`**: Create a shared `renderFooter()` helper that returns the footer HTML. Insert it before `</body>` in every page renderer: `renderSignupPage`, `renderFactPage`, `renderConfirmationPage` (via `renderMessagePage`), `renderUnsubscribePage`, `render404Page`, `renderDevMessageList`, `renderDevEmailDetail`.
- **`public/styles.css`**: Add footer styling consistent with the existing warm/indie design.
- **`src/routes/routes.test.ts`**: Add tests verifying the footer content appears on rendered pages.

---

### P78 — Add /inspiration and /about pages ⬜ TODO

**Priority: HIGH** — The spec (`specs/web-pages.md` lines 78-79) requires these two pages. Neither exists. These are linked from the footer (P77).

**What needs to change:**

- **`src/routes/pages.ts`**: Add `renderInspirationPage()` and `renderAboutPage()` functions. The inspiration page should explain the *Life is Strange: Double Exposure* origin. The about page should describe the project.
- **`src/server.ts`**: Register `GET /inspiration` and `GET /about` routes.
- **`src/server.test.ts`** and/or **`src/routes/routes.test.ts`**: Add tests for the new routes.

---

### P79 — Add platypus emoji (🦫🦆🥚) throughout web pages ⬜ TODO

**Priority: MEDIUM** — The spec (`specs/web-pages.md` line 23) says to "Use the platypus emoji combination (🦫🦆🥚) liberally throughout the page to add character — in the title, tagline, fan count, form labels, success/error messages, and footer."

**Current state:** No instances of 🦫🦆🥚 appear anywhere in `src/`. Pages use the duck emoji (🦆) only in the favicon.

**What needs to change:**

- **`src/routes/pages.ts`**: Add 🦫🦆🥚 to page titles/headings, taglines, fan count section, form labels, success messages, error messages, and footer.
- **`src/lib/email-templates.ts`**: Consider adding the emoji to email branding (if appropriate — spec says "wherever emoji are appropriate").

---

### P80 — Add warm note explaining the subscriber cap ⬜ TODO

**Priority: LOW** — The spec (`specs/web-pages.md` line 13) says the signup page should show "a warm note explaining the limit (e.g., 'Since each fact is sent with love (and a small email cost), we can only support 200 Platypus Fans right now.')"

**Current state:** The fan count is displayed (`42 / 200 Platypus Fans`) but there is no explanatory note.

**What needs to change:**

- **`src/routes/pages.ts`**: Add a short warm note below/near the fan count explaining why there's a limit.

---

### P81 — Fix MAX_SUBSCRIBERS default to match spec ⬜ TODO

**Priority: LOW** — The spec (`specs/infrastructure.md` line 78, `specs/subscription-flow.md` line 57, `specs/design-decisions.md` line 65) all say `MAX_SUBSCRIBERS` defaults to `200`. The code (`src/lib/config.ts` line 64) defaults to `1000`. The `.env.development` and `.env.example` files also set `1000`. The `config/deploy.yml` also sets `1000`.

**What needs to change:**

- **`src/lib/config.ts`**: Change default from `"1000"` to `"200"` (line 64).
- **`src/lib/config.test.ts`**: Update test "defaults to 1000" → "defaults to 200".
- **`.env.development`** and **`.env.example`**: Change `MAX_SUBSCRIBERS=1000` → `MAX_SUBSCRIBERS=200`.
- **`config/deploy.yml`**: Change `MAX_SUBSCRIBERS: 1000` → `MAX_SUBSCRIBERS: 200` (line 25).
- Note: The deploy.yml explicitly sets this, so the production value is controlled there. The spec default of 200 is about the code's fallback behavior when the env var is unset.

---

## Priority Order

| # | Description | Impact | Effort |
|---|-------------|--------|--------|
| P77 | Add footer to all public pages | High (spec compliance, visible on every page) | Medium (shared helper + CSS) |
| P78 | Add /inspiration and /about pages | High (spec compliance, footer links need targets) | Low-Medium (2 new page renderers + routes) |
| P81 | Fix MAX_SUBSCRIBERS default | Low (spec compliance, behavioral default mismatch) | Low (4 files, value change) |
| P80 | Add warm note about subscriber cap | Low (spec compliance, minor UI element) | Low (one line of HTML) |
| P79 | Add platypus emoji throughout | Medium (spec compliance, design polish) | Low (string changes across pages) |

**Recommended order:** P77 → P78 → P81 → P80 → P79

P77 and P78 together because the footer links need the target pages. P81 is a quick fix. P80 and P79 are cosmetic polish.

---

## Recently Completed

| Priority | Description | Notes |
|----------|-------------|-------|
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
| Signup page | ⚠️ Mostly | Missing: emoji (P79), warm note (P80) |
| Fact page | ✅ Complete | Illustration, sources, branding, signup link |
| Footer | ❌ Missing | P77 |
| /inspiration page | ❌ Missing | P78 |
| /about page | ❌ Missing | P78 |
| Platypus emoji | ❌ Missing from pages | P79 |
| MAX_SUBSCRIBERS default | ❌ 1000 instead of 200 | P81 |
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
