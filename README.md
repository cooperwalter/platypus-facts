# Daily Platypus Facts

A service that sends one platypus fact per day via SMS and/or email to all confirmed Platypus Fans, ensuring every fact is shown before any are repeated.

Inspired by the Daily Platypus Facts in [*Life is Strange: Double Exposure*](https://hardcoregamer.com/life-is-strange-double-exposure-platypus-genius-trophy/), where Max can subscribe to platypus facts via a blue flyer and receive them throughout the game.

## Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **Language**: TypeScript
- **Database**: SQLite (via Bun's built-in `bun:sqlite`)
- **SMS Provider**: Twilio (behind an abstraction layer)
- **Email Provider**: Postmark (behind an abstraction layer)
- **Deployment**: Docker + [Kamal](https://kamal-deploy.org/)

## Getting Started

```bash
bun install
cp .env.example .env   # then fill in your values
bun run src/index.ts
```

## Commands

| Command | Description |
|---------|-------------|
| `bun run src/index.ts` | Start the web server |
| `bun run src/jobs/daily-send.ts` | Run the daily send job |
| `bun run src/jobs/daily-send.ts --force` | Re-send today's fact (dev only) |
| `bun run src/scripts/sync-facts.ts` | Sync seed data to database |
| `bun test` | Run tests |
| `bunx tsc --noEmit` | Type check |
| `bunx biome check .` | Lint |

## How It Works

1. Users visit the signup page and enter their phone number and/or email address
2. Phone subscribers receive a welcome SMS and confirm by replying `1` or `PERRY`
3. Email subscribers receive a confirmation email with a link to click
4. A daily cron job selects one fact and sends it to all active Platypus Fans via their chosen channel(s)
5. Facts cycle through all available facts before repeating, with re-randomization each cycle

## Environment Variables

See `.env.example` for all required configuration.

## Deployment

See `config/deploy.yml` for Kamal configuration and `CRON_SETUP.md` for the daily send job crontab.
