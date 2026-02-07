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
                         │  │  /api/webhooks/ │  │
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
                         └──┬──────┬──────┬──────┘
                            │      │      │
              ┌─────────────┘      │      └─────────────┐
              │                    │                     │
   ┌──────────▼──────────┐  ┌─────▼──────┐  ┌──────────▼──────────┐
   │   SMS Provider       │  │  SQLite DB │  │   Email Provider     │
   │                      │  │            │  │                      │
   │  Production: Twilio  │  │  facts     │  │  Production: Postmark│
   │  Dev: DevSmsProvider │  │  fact_src  │  │  Dev: DevEmailProv.  │
   │                      │  │  subscr.   │  │                      │
   │  Send daily facts    │  │  sent_facts│  │  Send daily facts    │
   │  (MMS with image)    │  │  dev_msgs  │  │  (HTML with image)   │
   │  Receive incoming    │  │            │  │  Confirmation emails  │
   │  SMS via webhook     │  │  WAL mode  │  │  Unsubscribe headers │
   └──────────────────────┘  └──────┬─────┘  └──────────────────────┘
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
   │  3. Send to all active subscribers via SMS and/or email        │
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
- **subscribers** — Phone and/or email with status lifecycle (pending → active → unsubscribed)
- **sent_facts** — One row per day recording which fact was sent and which cycle
- **dev_messages** — Development-only message log for the dev message viewer

## Provider Abstraction

Both SMS and email use interface-based provider patterns:

- **SmsProvider** (`src/lib/sms/types.ts`) — `sendSms()`, `parseIncomingMessage()`, `validateWebhookSignature()`, `createWebhookResponse()`
- **EmailProvider** (`src/lib/email/types.ts`) — `sendEmail()`

Factory functions (`createSmsProvider`, `createEmailProvider`) select the implementation based on environment: Twilio/Postmark in production, dev providers (console + SQLite logging) in development.

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
