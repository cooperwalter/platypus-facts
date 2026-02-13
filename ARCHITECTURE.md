# Architecture

## System Overview

```
                         ┌──────────────────────┐
                         │   Cloudflare Tunnel   │
                         │  (TLS termination)    │
                         └──────────┬───────────┘
                                    │ HTTP
                         ┌──────────▼───────────┐
                         │   Bun HTTP Server     │
                         │   (src/index.ts)      │
                         │                       │
                         │  ┌─────────────────┐  │
                         │  │  Route Handlers  │  │
                         │  │  /               │  │
                         │  │  /facts/:id      │  │
                         │  │  /confirm/:token │  │
                         │  │  /unsubscribe/   │  │
                         │  │  /api/subscribe  │  │
                         │  │  /inspiration    │  │
                         │  │  /about          │  │
                         │  │  /health         │  │
                         │  │  /health?detail  │  │
                         │  │  /health/dashboard│ │
                         │  │  /dev/messages   │  │
                         │  └─────────────────┘  │
                         │                       │
                         │  ┌─────────────────┐  │
                         │  │  Rate Limiter    │  │
                         │  │  (in-memory)     │  │
                         │  └─────────────────┘  │
                         │                       │
                         │  ┌─────────────────┐  │
                         │  │ Subscription     │  │
                         │  │ Flow             │  │
                         │  │ (signup, confirm,│  │
                         │  │  welcome email,  │  │
                         │  │  unsubscribe)    │  │
                         │  └─────────────────┘  │
                         └──┬──────────────┬─────┘
                            │              │
              ┌─────────────┘              └─────────────┐
              │                                          │
   ┌──────────▼──────────┐                    ┌──────────▼──────────┐
   │   Email Provider     │                    │      SQLite DB      │
   │                      │                    │   (Drizzle ORM)     │
   │  Production: Brevo   │                    │                     │
   │  Dev: DevEmailProv.  │                    │  facts              │
   │                      │                    │  fact_sources       │
   │  4 email templates:  │                    │  subscribers        │
   │  - Daily fact        │                    │  sent_facts         │
   │  - Confirmation      │                    │  dev_messages       │
   │  - Already subscribed│                    │                     │
   │  - Welcome (w/ fact) │                    │  WAL mode           │
   │                      │                    │  Foreign keys on    │
   │  Unsubscribe headers │                    └──────────┬──────────┘
   │  Mascot branding     │                               │
   └──────────────────────┘                    ┌──────────▼──────────┐
                                               │     Static Files    │
                                               │     public/         │
                                               │      styles.css     │
                                               │      platypus.png   │
                                               │      platypus-icon  │
                                               │       .svg          │
                                               │      favicon.ico    │
                                               │      favicon-32.png │
                                               │      apple-touch-   │
                                               │       icon.png      │
                                               │      images/facts/  │
                                               │     Cache-Control   │
                                               │      headers set    │
                                               └─────────────────────┘

   ┌─────────────────────────────────────────────────────────────────┐
   │                    Daily Send Job (cron)                        │
   │                   src/jobs/daily-send.ts                        │
   │                                                                 │
   │  1. Select next fact (cycling algorithm)                       │
   │  2. Send to all active subscribers via email                   │
   │  3. Record in sent_facts with date and cycle number            │
   └─────────────────────────────────────────────────────────────────┘

   ┌─────────────────────────────────────────────────────────────────┐
   │                    Fact Sync (startup + CLI)                    │
   │                  src/scripts/sync-facts.ts                      │
   │                                                                 │
   │  1. Read data/facts.json                                       │
   │  2. Upsert facts and sources into SQLite                       │
   │  3. Generate missing images via OpenAI DALL-E (if key set)     │
   └─────────────────────────────────────────────────────────────────┘

   ┌─────────────────────────────────────────────────────────────────┐
   │                Image Optimization (manual CLI)                  │
   │              src/scripts/optimize-images.ts                     │
   │                                                                 │
   │  1. Resize fact images to 640x640 (from 1024x1024)            │
   │  2. Resize mascot to 400x400 (from 1024x1024)                 │
   │  3. Generate favicons (ICO, 32x32 PNG, 180x180 apple-touch)   │
   │  4. Idempotent — skips already-optimized images                │
   └─────────────────────────────────────────────────────────────────┘
```

## Database Schema

Five tables in SQLite with WAL mode and foreign keys enabled. Schema defined in `src/lib/schema.ts` using Drizzle ORM, with migrations generated by `drizzle-kit` and auto-applied on startup via `migrate()`.

- **facts** — Platypus facts with optional image paths
- **fact_sources** — Source URLs per fact (CASCADE DELETE from facts)
- **subscribers** — Email (NOT NULL UNIQUE) with status lifecycle (pending → active → unsubscribed)
- **sent_facts** — One row per day recording which fact was sent and which cycle (UNIQUE sent_date)
- **dev_messages** — Development-only message log for the dev message viewer

## Provider Abstraction

Email uses an interface-based provider pattern:

- **EmailProvider** (`src/lib/email/types.ts`) — `sendEmail()`

Factory function (`createEmailProvider`) selects the implementation based on environment: Brevo in production, dev provider (console + SQLite logging) in development.

## Subscription Flow

1. User submits email on signup page → confirmation email sent
2. User clicks confirmation link → status transitions to `active`, welcome email sent with most recent fact
3. Unsubscribe via `List-Unsubscribe` header or two-step web flow (GET confirmation → POST processing)

## Health Monitoring

- `GET /health` — minimal `{ "status": "ok" }` for Kamal health checks
- `GET /health?detail=true` — JSON with subscriber counts, fact stats, last send, database size, uptime
- `GET /health/dashboard` — server-rendered HTML dashboard with all metrics

## Fact Cycling

The cycling algorithm in `src/lib/fact-cycling.ts` ensures every fact is sent exactly once before any repeats:

1. Never-sent facts are prioritized first (random selection)
2. Within a cycle, unsent facts are selected randomly
3. When all facts in a cycle are exhausted, a new cycle begins with fresh randomization

## Deployment

- **Host**: Raspberry Pi 5 on local network
- **Networking**: Cloudflare Tunnel terminates TLS, forwards plain HTTP
- **Container**: Docker image built for `linux/arm64`, deployed via Kamal
- **Persistence**: Docker volumes for SQLite database and fact images
- **CI/CD**: GitHub Actions → test/typecheck/lint → build arm64 image → push GHCR → `kamal deploy`
- **Daily job**: System crontab on the Pi (6 AM Pacific) executes inside the running container
