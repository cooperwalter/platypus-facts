## Build & Run

- Runtime: Bun (runs TypeScript natively, no build step needed)
- Install dependencies: `bun install`
- Start web server: `bun run src/index.ts`
- Run daily send job: `bun run src/jobs/daily-send.ts`
- Sync seed data: `bun run src/scripts/sync-facts.ts`

## Validation

Run these after implementing to get immediate feedback:

- Tests: `bun test`
- Typecheck: `bunx tsc --noEmit`
- Lint: (configure during project setup — Biome recommended for Bun/TS projects)

## Pre-Commit

Before every commit, run CodeRabbit CLI to review changes:

- Run: `cr review`
- All warnings and errors reported by `cr` MUST be resolved before committing.
- Do not skip or defer CodeRabbit findings — fix them in the same increment.

## Frontend Review

After any change to frontend pages (HTML, CSS, templates, or UI-related code), use an Opus subagent acting as a UX/UI expert to review the changes. The subagent should:

- Evaluate visual hierarchy, spacing, and layout consistency
- Check accessibility (contrast, focus states, semantic HTML, screen reader compatibility)
- Verify the design matches the *Life is Strange: Double Exposure* themed aesthetic from the specs
- Flag usability issues (confusing flows, missing feedback states, unclear CTAs)
- Review responsive behavior across mobile and desktop viewports

Resolve all issues raised by the UX/UI review subagent before committing.

## Operational Notes

- Database: SQLite file at path configured by `DATABASE_PATH` env var (default `./data/platypus-facts.db`)
- SMS: Twilio — requires `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` env vars
- Fact data lives in `data/facts.json`, synced to DB on startup/deploy
- Phone numbers stored in E.164 format (e.g., `+15551234567`)

### Codebase Patterns

- SMS provider is behind an abstraction interface (not Twilio-specific in application code)
- Shared utilities go in `src/lib/`
- Never use `any` in TypeScript — use real types or `unknown`