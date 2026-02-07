# CLI Commands

Command-line tools for operating the application.

## Daily Send

Manually trigger the daily fact send.

```bash
bun run daily-send              # Send today's fact (skips if already sent)
bun run daily-send --force      # Send even if already sent today (development only)
```

### Default Behavior

Runs the same logic as the cron-triggered daily send: selects today's fact, sends to all active subscribers via their configured channels (SMS/MMS and/or email), and records the send. Idempotent — if a fact has already been sent today, exits without re-sending.

### `--force` Flag

Bypasses the idempotency check and sends the current fact to all active subscribers regardless of whether it has already been sent today. Useful during development for testing the send flow repeatedly without waiting for a new day.

**The `--force` flag is rejected when `NODE_ENV=production`.** If used in production, the command exits with an error message: "The --force flag is not allowed in production."

When `--force` re-sends a fact that was already sent today, it does NOT create a duplicate entry in `sent_facts` — it skips recording if today's date already has an entry.

## Fact Sync

Sync facts from seed data and generate images.

```bash
bun run sync-facts              # Sync facts and generate missing images
```

## Server

Start the HTTP server.

```bash
bun run start                   # Start the server
```
