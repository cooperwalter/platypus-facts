# Implementation Plan -- Daily Platypus Facts

## Status Summary

**All spec enhancements complete.** Core service is complete and fully functional. Brevo is the production email provider. MAX_SUBSCRIBERS defaults to 200.

- **410 tests passing** across 19 test files with **869 expect() calls**
- **Type check clean**, **lint clean**
- **No TODOs, FIXMEs, skipped tests, or placeholder code** in source
- **28 real platypus facts** sourced and seeded with AI-generated illustrations (31 images in `public/images/facts/`)
- **Platypus mascot PNG** optimized to 74KB at 400×400 (down from 451KB at 1024×1024)
- **Fact images** optimized to 640×640 (86KB–538KB, down from 243KB–1.3MB)
- **Favicons** generated from mascot: `favicon.ico`, `favicon-32.png`, `apple-touch-icon.png`
- **Latest tag**: 0.0.64

---

## All Enhancements Complete

```
P2 (Email Mascot) ✅ COMPLETE
P1 (Welcome Email) ✅ COMPLETE
P4 (Static Cache Headers) ✅ COMPLETE
P3 (Health Dashboard) ✅ COMPLETE
P5 (Micro-Interactions) ✅ COMPLETE
P7 (Image Optimization) ✅ COMPLETE
P6 (Favicon) ✅ COMPLETE
```

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
| Image optimization (P7) | ✅ Complete | `src/scripts/optimize-images.ts` script with `sharp`/`png-to-ico`, mascot 74KB@400×400, fact images 86–538KB@640×640, favicon generation (ICO+PNG+apple-touch-icon), idempotent, `optimize-images` npm script |
| Favicon (P6) | ✅ Complete | Replaced inline SVG emoji favicon with mascot-based `favicon.ico`, `favicon-32.png`, `apple-touch-icon.png` across all 10 render functions |
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
