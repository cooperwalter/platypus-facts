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
                         │  │  /              │  │
                         │  │  /facts/:id     │  │
                         │  │  /confirm/:token│  │
                         │  │  /unsubscribe/  │  │
                         │  │  /api/subscribe │  │
                         │  │  /health        │  │
                         │  │  /dev/messages  │  │
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
                         │  │  unsubscribe)    │  │
                         │  └─────────────────┘  │
                         └──┬──────────────┬─────┘
                            │              │
              ┌─────────────┘              └─────────────┐
              │                                          │
   ┌──────────▼──────────┐                    ┌──────────▼──────────┐
   │   Email Provider     │                    │      SQLite DB      │
   │                      │                    │                     │
   │  Production: Brevo   │                    │  facts              │
   │  Dev: DevEmailProv.  │                    │  fact_sources       │
   │                      │                    │  subscribers        │
   │  Send daily facts    │                    │  sent_facts         │
   │  (HTML with image)   │                    │  dev_messages       │
   │  Confirmation emails │                    │                     │
   │  Unsubscribe headers │                    │  WAL mode           │
   └──────────────────────┘                    └──────────┬──────────┘
                                    │
                             ┌──────▼──────┐
                             │ Static Files│
                             │ public/     │
                             │  styles.css │
                             │  images/    │
                             │   facts/    │
                             └─────────────┘

   ┌─────────────────────────────────────────────────────────────────┐
   │                    Daily Send Job (cron)                        │
   │                   src/jobs/daily-send.ts                        │
   │                                                                 │
   │  1. Sync facts from data/facts.json                            │
   │  2. Select next fact (cycling algorithm)                       │
   │  3. Send to all active subscribers via email                   │
   │  4. Record in sent_facts with date and cycle number            │
   └─────────────────────────────────────────────────────────────────┘

   ┌─────────────────────────────────────────────────────────────────┐
   │                    Fact Sync (startup + CLI)                    │
   │                  src/scripts/sync-facts.ts                      │
   │                                                                 │
   │  1. Read data/facts.json                                       │
   │  2. Upsert facts and sources into SQLite                       │
   │  3. Generate missing images via OpenAI DALL-E (if key set)     │
   └─────────────────────────────────────────────────────────────────┘
```

## Database Schema

Five tables in SQLite with WAL mode and foreign keys enabled:

- **facts** — Platypus facts with optional image paths
- **fact_sources** — Source URLs per fact (CASCADE DELETE from facts)
- **subscribers** — Email (NOT NULL UNIQUE) with status lifecycle (pending → active → unsubscribed)
- **sent_facts** — One row per day recording which fact was sent and which cycle
- **dev_messages** — Development-only message log for the dev message viewer

## Provider Abstraction

Email uses an interface-based provider pattern:

- **EmailProvider** (`src/lib/email/types.ts`) — `sendEmail()`

Factory function (`createEmailProvider`) selects the implementation based on environment: Brevo in production, dev provider (console + SQLite logging) in development.

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
- **CI/CD**: GitHub Actions → test → build → `kamal deploy`
- **Daily job**: System crontab on the Pi executes inside the running container
