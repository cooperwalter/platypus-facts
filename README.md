# Daily Platypus Facts

A service that sends one platypus fact per day via SMS to all confirmed Platypus Fans, ensuring every fact is shown before any are repeated.

Inspired by the Daily Platypus Facts in [*Life is Strange: Double Exposure*](https://hardcoregamer.com/life-is-strange-double-exposure-platypus-genius-trophy/), where Max can subscribe to platypus facts via a blue flyer and receive them throughout the game.

## Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **Language**: TypeScript
- **Database**: SQLite (via Bun's built-in `bun:sqlite`)
- **SMS Provider**: Twilio (behind an abstraction layer)
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
| `bun run src/scripts/sync-facts.ts` | Sync seed data to database |
| `bun test` | Run tests |
| `bunx tsc --noEmit` | Type check |
| `bunx biome check .` | Lint |

## How It Works

1. Users visit the signup page and enter their phone number
2. They receive a welcome SMS and confirm by replying `1` or `PERRY`
3. A daily cron job selects one fact and sends it to all active Platypus Fans
4. Facts cycle through all available facts before repeating, with re-randomization each cycle

## Environment Variables

See `.env.example` for all required configuration.

## Deployment

See `config/deploy.yml` for Kamal configuration and `CRON_SETUP.md` for the daily send job crontab.
