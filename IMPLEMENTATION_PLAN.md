# Implementation Plan -- Daily Platypus Facts

## Status Summary

**All spec items complete.** Brevo is the production email provider. MAX_SUBSCRIBERS defaults to 200.

- **339 tests passing** across 19 test files with **726 expect() calls**
- **Type check clean**, **lint clean**
- **28 real platypus facts** sourced and seeded with AI-generated illustrations (31 images in `public/images/facts/`)
- **Platypus mascot PNG** generated via DALL-E 3 at `public/platypus.png`
- **Latest tag**: 0.0.56

---

## Outstanding Items (Non-Blocking)

- **Drizzle query builder adoption**: Query files still use raw `sqlite` (Database) — deferred, not spec-blocking
- **Manual Brevo testing**: Test with real Brevo API before production launch
- **Database backup strategy**: Post-launch, not spec-required
- **Mascot image optimization**: `public/platypus.png` is 445 KB (1024x1024 source displayed at 200x200 CSS). Could be resized/compressed to ~50-100 KB for faster loading. Non-critical.

---

## Spec Compliance Summary

| Area | Status | Notes |
|------|--------|-------|
| Platypus mascot image | ✅ Complete | `public/platypus.png` generated, displayed as hero image on home page |
| Footer text | ✅ Complete | "Made with ❤️ by Cooper Walter" matches spec |
| Web page emoji removal | ✅ Complete | All 20 occurrences of 🦫🦆🥚 removed from web pages |
| Email emoji preserved | ✅ Complete | Email templates still use 🦫🦆🥚 per spec |
| Email provider (Brevo) | ✅ Complete | Brevo wired in, sender name included, Postmark removed |
| Subscription flow | ✅ Complete | Cap checked at signup + confirmation, List-Unsubscribe headers on all emails |
| Email templates | ✅ Complete | All 3 templates, correct subjects, plain-text fallbacks, source links, fact page link |
| Fact cycling | ✅ Complete | New facts prioritized, re-randomized per cycle |
| Daily send | ✅ Complete | Idempotent, --force dev-only, graceful failure handling |
| Sync + images | ✅ Complete | Upsert by text, image generation, auth failure handling |
| Drizzle schema | ✅ Complete | All 5 tables match spec exactly |
| Signup page | ✅ Complete | Warm note, fan count, form, capacity handling, mascot image |
| Fact page | ✅ Complete | Illustration, sources, branding, signup link |
| /inspiration page | ✅ Complete | Life is Strange: Double Exposure origin story |
| /about page | ✅ Complete | Project description, tech stack, Brevo mention |
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
| Fact sources | ✅ Complete | All 28 facts have sources in data/facts.json |
| Responsive design | ✅ Complete | Mobile breakpoints implemented |
| .dockerignore | ✅ Complete | Exists |
| CI/CD pipeline | ✅ Complete | GitHub Actions workflow |
