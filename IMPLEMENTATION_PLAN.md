# Implementation Plan -- Daily Platypus Facts

## Status Summary

**2 spec enhancements pending implementation.** Core service is complete and fully functional. Brevo is the production email provider. MAX_SUBSCRIBERS defaults to 200.

- **410 tests passing** across 19 test files with **869 expect() calls**
- **Type check clean**, **lint clean**
- **No TODOs, FIXMEs, skipped tests, or placeholder code** in source
- **28 real platypus facts** sourced and seeded with AI-generated illustrations (31 images in `public/images/facts/`)
- **Platypus mascot PNG** generated via DALL-E 3 at `public/platypus.png` (451KB, unoptimized)
- **Latest tag**: 0.0.62

---

## Pending Enhancements (Priority Order)

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
P3 (Health Dashboard) ✅ COMPLETE
P5 (Micro-Interactions) ✅ COMPLETE
P7 (Image Optimization) ──→ P6 (Favicon)    [P6 can use manual generation or P7 script]
```

**Recommended implementation order:** P7 → P6

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
| Health dashboard (P3) | ✅ Complete | `/health?detail=true` JSON API, `/health/dashboard` HTML page, `getSubscriberCounts`/`getFactStats`/`getLastSend`/`getDatabaseSizeBytes` queries, `formatUptime` helper, uptime tracking via closure, `databasePath` in deps (19 new tests) |
| Micro-interactions (P5) | ✅ Complete | All transitions wrapped in `@media (prefers-reduced-motion: no-preference)`, link/button/input/mascot/card transitions, fadeIn animation, focus-visible glow, `:active` scale-down, hover-only card shadow |
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
