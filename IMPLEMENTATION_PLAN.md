# Implementation Plan -- Daily Platypus Facts

## Status Summary

**4 spec enhancements pending implementation.** Core service is complete and fully functional. Brevo is the production email provider. MAX_SUBSCRIBERS defaults to 200.

- **387 tests passing** across 19 test files with **821 expect() calls**
- **Type check clean**, **lint clean**
- **No TODOs, FIXMEs, skipped tests, or placeholder code** in source
- **28 real platypus facts** sourced and seeded with AI-generated illustrations (31 images in `public/images/facts/`)
- **Platypus mascot PNG** generated via DALL-E 3 at `public/platypus.png` (451KB, unoptimized)
- **Latest tag**: 0.0.60

---

## Pending Enhancements (Priority Order)

### P3: Health Dashboard (`specs/health-dashboard.md`) — MEDIUM PRIORITY
Operational visibility for monitoring the running service.

Current state: `handleHealthCheck()` in `src/routes/health.ts` takes no parameters and returns only `{ status: "ok" }`. No `?detail=true` support, no dashboard page, no query functions for metrics. `RequestHandlerDeps` does not include `databasePath`. No uptime tracking.

- [ ] Add query functions (use Drizzle query builder, add to existing modules):
  - `getSubscriberCounts(db)` in `src/lib/subscribers.ts` — returns `{ active: number, pending: number, unsubscribed: number }`
  - `getFactStats(db)` in `src/lib/facts.ts` — returns `{ total: number, withImages: number, currentCycle: number, remainingInCycle: number }`
  - `getLastSend(db)` in `src/lib/facts.ts` — returns `{ date: string, factId: number } | null`
  - `getDatabaseSizeBytes(databasePath: string)` in `src/lib/db.ts` — returns file size via `Bun.file().size`
- [ ] Add `databasePath: string` to `RequestHandlerDeps` interface in `src/server.ts`
- [ ] Track server uptime: store `const startTime = Date.now()` in `createRequestHandler()` closure
- [ ] Update `handleHealthCheck()` signature to `(request: Request, db: DrizzleDatabase, databasePath: string, startTime: number)`
  - Without `?detail=true`: return `{ status: "ok" }` (unchanged, Kamal-compatible)
  - With `?detail=true` (strict `=== "true"` check): return JSON with subscribers, facts, lastSend, database size, uptime
- [ ] Implement `renderHealthDashboard()` in `src/routes/pages.ts` — HTML page with operational metrics, uses `renderFooter()`, consistent theme
- [ ] Register `GET /health/dashboard` route in `src/server.ts` — must come before `/health` route to avoid path prefix conflicts
- [ ] Update `/health` route in `src/server.ts` to pass `request`, `db`, `databasePath`, `startTime` to `handleHealthCheck()`
- [ ] Update `src/index.ts` to pass `databasePath` (from `config.databasePath`) in deps
- [ ] Write tests: basic health check unchanged, `?detail=true` returns all fields with correct types, dashboard renders HTML with metrics, query functions return correct data, uptime increases over time

### P5: Micro-Interactions (`specs/micro-interactions.md`) — LOW PRIORITY
CSS polish. No functional impact. No JavaScript required.

Current state: 3 existing transitions in `public/styles.css` (email input `border-color` at line 181, submit button `background` at line 203, unsubscribe button `background` at line 329) are unconditional — not wrapped in `prefers-reduced-motion` media query. All other micro-interactions are missing.

- [ ] Remove the 3 existing `transition` declarations from their current locations in `public/styles.css`
- [ ] Add `@media (prefers-reduced-motion: no-preference)` block at end of stylesheet containing ALL transitions:
  - Move the 3 existing transitions into the media query
  - Add link transition: `a { transition: color 0.2s ease; }`
  - Add button enhancements: extend transition to `background 0.2s ease, transform 0.15s ease`; add `:active { transform: scale(0.97); }` for both `button[type="submit"]` and `.unsubscribe-btn`
  - Add email input focus glow: `.email-input:focus { box-shadow: 0 0 0 3px rgba(168, 101, 32, 0.15); }` with transition `border-color 0.2s ease, box-shadow 0.2s ease`
  - Add form message fadeIn: `@keyframes fadeIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }` and `.form-message:not([hidden]) { animation: fadeIn 0.3s ease; }`
  - Add mascot hover: `.mascot-image { transition: transform 0.2s ease; }` + `.mascot-image:hover { transform: scale(1.03); }`
  - Add focus-visible: `a:focus-visible, button:focus-visible, .email-input:focus-visible { box-shadow: 0 0 0 3px rgba(168, 101, 32, 0.2); transition: box-shadow 0.2s ease; }`
  - Add content card hover (nested inside `@media (hover: hover)`): `.content-card { transition: box-shadow 0.2s ease; }` + `.content-card:hover { box-shadow: 0 2px 12px rgba(61, 44, 30, 0.08); }`
- [ ] No automated tests required (CSS-only visual changes, manual browser verification)

### P6: Favicon (`specs/favicon.md`) — LOW PRIORITY
Replace inline SVG emoji favicon with mascot-based favicons.

Current state: All 9 render functions in `src/routes/pages.ts` use an inline SVG data URI with a duck emoji (🦆) as the favicon (rendered in each function's `<head>`). No `favicon.ico`, `favicon-32.png`, or `apple-touch-icon.png` files exist in `public/`. Can be generated manually via an online tool or programmatically via P7's script.

- [ ] Generate `public/favicon.ico` (16×16 + 32×32 multi-resolution ICO) from `public/platypus.png`
- [ ] Generate `public/favicon-32.png` (32×32 PNG) from `public/platypus.png`
- [ ] Generate `public/apple-touch-icon.png` (180×180 PNG) from `public/platypus.png`
- [ ] Update all 9 `render*()` functions in `src/routes/pages.ts` to replace inline SVG emoji favicon with:
  - `<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">`
  - `<link rel="icon" type="image/x-icon" href="/favicon.ico">`
  - `<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">`
- [ ] Update tests if any assert on favicon HTML (check routes.test.ts)

The 9 render functions producing full HTML documents:
1. `renderSignupPage` (line 17)
2. `renderFactPage` (line 142)
3. `renderMessagePage` (line 246) — also covers `renderConfirmationPage` which uses it
4. `renderUnsubscribePage` (line 279)
5. `render404Page` (line 358)
6. `renderInspirationPage` (line 391)
7. `renderAboutPage` (line 426)
8. `renderDevMessageList` (line 462)
9. `renderDevEmailDetail` (line 519)

### P7: Image Optimization Script (`specs/image-optimization.md`) — LOW PRIORITY
Build tooling. Non-blocking for functionality. Can be run manually or in CI.

Current state: No optimization script exists. `src/scripts/optimize-images.ts` does not exist. `sharp` is not a dependency. Mascot PNG is 451KB at 1024×1024 (target: ≤80KB at 400×400). Fact images range from 230KB–1.3MB at 1024×1024 (target: ≤150KB at 640×640).

- [ ] Add `sharp` as a devDependency: `bun add -d sharp`
- [ ] Create `src/scripts/optimize-images.ts`:
  - Fact images (`public/images/facts/*.png`): resize to 640×640, compress PNG, target under 150KB, overwrite in place
  - Mascot (`public/platypus.png`): resize to 400×400, target under 80KB
  - Idempotent: check dimensions via `sharp().metadata()`, skip if already at target
  - Optionally generate favicon PNG files (P6 integration: 180×180 apple-touch-icon, 32×32 favicon-32)
  - Error handling: log + continue on failure per image
  - Log before/after file sizes
- [ ] Add `"optimize-images": "bun run src/scripts/optimize-images.ts"` to `package.json` scripts
- [ ] Update fact image `<img>` tags in `renderFactPage()` with explicit `width="640" height="640"` attributes matching resized dimensions

---

## Implementation Dependencies

```
P2 (Email Mascot) ✅ COMPLETE
P1 (Welcome Email) ✅ COMPLETE
P4 (Static Cache Headers) ✅ COMPLETE
P7 (Image Optimization) ──→ P6 (Favicon)    [P6 can use manual generation or P7 script]
P3, P5 are independent of each other
```

**Recommended implementation order:** P3 → P5 → P7 → P6

---

## Previously Completed (Core Service)

All core spec items are complete:

| Area | Status | Notes |
|------|--------|-------|
| Platypus mascot image | ✅ Complete | `public/platypus.png` generated, displayed as hero image on home page |
| Footer text | ✅ Complete | "Made with ❤️ by Cooper Walter" matches spec |
| Web page emoji removal | ✅ Complete | All occurrences of 🦫🦆🥚 removed from web pages |
| Email mascot branding (P2) | ✅ Complete | Mascot image replaces 🦫🦆🥚 in all email templates, `emailWrapper()` accepts `baseUrl`, `AlreadySubscribedEmailData` interface added |
| Welcome email (P1) | ✅ Complete | `renderConfirmationPage()` async, sends welcome email with most recent fact on confirmation, `WelcomeEmailData`/`welcomeEmailHtml`/`welcomeEmailPlain` added, `getMostRecentSentFact()` query, List-Unsubscribe headers, failure-safe (27 new tests) |
| Static cache headers (P4) | ✅ Complete | `getCacheControl()` helper, images 7-day immutable, CSS 1-day, others 1-hour, Content-Type preserved (14 new tests) |
| Email provider (Brevo) | ✅ Complete | Brevo wired in, sender name included, Postmark removed |
| Subscription flow | ✅ Complete | Cap checked at signup + confirmation, List-Unsubscribe headers on all 3 email types |
| Email templates | ✅ Complete | Daily fact, confirmation, already-subscribed — correct subjects, plain-text fallbacks, source links, fact page link |
| Fact cycling | ✅ Complete | New facts prioritized, re-randomized per cycle, 14 tests |
| Daily send | ✅ Complete | Idempotent, --force dev-only, graceful failure, race condition handling, 14 tests |
| Sync + images | ✅ Complete | Upsert by text, DALL-E image generation, auth failure handling |
| Drizzle schema | ✅ Complete | All 5 tables match spec exactly |
| Signup page | ✅ Complete | Warm note, fan count, form, capacity handling, mascot image |
| Fact page | ✅ Complete | Illustration, sources, branding, signup link |
| /inspiration page | ✅ Complete | Life is Strange: Double Exposure origin story |
| /about page | ✅ Complete | Project description, tech stack, Brevo mention |
| MAX_SUBSCRIBERS default | ✅ Complete | Default 200, matches spec |
| DAILY_SEND_TIME_UTC default | ✅ Complete | Default 13:00, matches spec |
| Confirmation page | ✅ Complete | All states handled, cap check |
| Unsubscribe pages | ✅ Complete | GET confirmation + POST processing |
| Health endpoint | ✅ Complete | GET /health returns `{ status: "ok" }` |
| Dev message viewer | ✅ Complete | /dev/messages list + detail |
| Rate limiting | ✅ Complete | 5 per IP per hour on subscribe |
| Infrastructure/deploy | ✅ Complete | Brevo in deploy config, GitHub Actions, Dockerfile |
| Background pattern | ✅ Complete | SVG repeat with low opacity |
| Desktop top padding | ✅ Complete | 6rem padding on ≥768px |
| CRON_SETUP.md | ✅ Complete | Cron documentation exists |
| Dockerfile | ✅ Complete | Multi-stage, oven/bun, arm64 handled by CI |
| Life is Strange attribution | ✅ Complete | README, signup page |
| ARCHITECTURE.md diagram | ✅ Complete | Up-to-date |
| Fact sources | ✅ Complete | All 28 facts have sources in data/facts.json |
| Responsive design | ✅ Complete | Mobile breakpoints implemented |
| .dockerignore | ✅ Complete | Exists |
| CI/CD pipeline | ✅ Complete | GitHub Actions workflow |

---

## Outstanding Items (Non-Blocking, Not Spec-Required)

- **Drizzle query builder adoption**: Only `src/lib/db.ts` uses raw `sqlite` (for low-level migration/PRAGMA logic that must run before Drizzle). All query modules already use Drizzle query builder. No further migration needed.
- **Manual Brevo testing**: Test with real Brevo API before production launch
- **Database backup strategy**: Post-launch, not spec-required
