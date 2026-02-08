# Daily Send Job

The scheduled job that sends the day's platypus fact to all active Platypus Fans.

## Schedule

Runs once per day at a configured UTC time via system cron (e.g., `crontab`). The send time is configured via the `DAILY_SEND_TIME_UTC` environment variable (format: `HH:MM`, e.g., `14:00` for 2:00 PM UTC).

## Execution Steps

1. **Select today's fact** using the fact cycling algorithm (see `fact-cycling.md`).
2. **Query all active Platypus Fans** (status = `active` in `subscribers` table).
3. **Send to each Platypus Fan** via email, including the illustration if available (see `email-integration.md`). A missing image never prevents delivery — the fact text and sources link are always sent regardless of image availability.
4. **Record the send** in `sent_facts` with today's date and current cycle number.
5. **Log results**: total Platypus Fans emailed, any delivery failures.

## Idempotency

The job checks `sent_facts` for today's date before executing. If a fact has already been sent today, the job exits without sending again. This prevents duplicate sends if the job runs more than once (e.g., manual retry after a partial failure).

## Failure Handling

- If an individual email fails to send, log the error and continue with remaining Platypus Fans. Do not halt the entire job for one failed delivery.
- The fact is still recorded in `sent_facts` even if some individual deliveries fail — the fact selection should not change for the day.
- Failed deliveries can be retried manually or by a future retry mechanism.

## Manual Trigger

The daily send can be triggered manually via CLI. A `--force` flag bypasses the idempotency check (development only). See `cli.md`.

## Implementation

The job is a standalone Bun script (e.g., `src/jobs/daily-send.ts`) invoked by cron:

```
# Example crontab entry (2:00 PM UTC daily)
0 14 * * * cd /path/to/platypus-facts && bun run src/jobs/daily-send.ts
```
