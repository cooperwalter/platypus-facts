# Fact Cycling

How the system selects which platypus fact to send each day.

## Core Rule

Every fact must be sent once before any fact is sent again. New facts are always prioritized over previously-sent facts.

## Algorithm

Each day, the daily send job selects one fact using this priority:

1. **New facts first**: Any fact that has NEVER appeared in `sent_facts` is eligible. Pick one at random. Record it in `sent_facts` with the current cycle number (so it is considered "sent in this cycle" and won't repeat until the next cycle).
2. **Current cycle unsent**: If all facts have been sent at least once, check which facts have NOT been sent in the current cycle. Pick one at random.
3. **New cycle**: If all facts have been sent in the current cycle, increment the cycle number. All facts become eligible again. Pick one at random.

This means each cycle is a complete pass through all facts in a randomized order, with re-randomization between cycles.

## Handling New Facts

When a new fact is added to the seed file and synced to the database:
- It has no entries in `sent_facts`, so it automatically falls into priority #1 (new facts first).
- It will be sent before the current cycle continues with remaining unsent facts.
- When sent, it is recorded with the current cycle number. For example, if the system is on cycle 3, the new fact's `sent_facts` entry has `cycle = 3`. This ensures it is treated as "sent in cycle 3" and won't be sent again until cycle 4.
- Multiple new facts are sent in random order among themselves, one per day.

## Cycle Tracking

- The `cycle` column in `sent_facts` tracks which cycle each send belongs to.
- The current cycle number is derived from the max `cycle` value in `sent_facts` (or 1 if empty).
- When all facts have been sent in the current cycle, the next send increments the cycle.

## Edge Cases

- **Only one fact exists**: That fact is sent every day. Each day is a new cycle.
- **No facts exist**: The daily job logs a warning and sends nothing.
- **Fact removed from seed file**: Facts are never deleted from the database; they continue to participate in cycling. (If fact removal is needed in the future, a soft-delete mechanism can be added.)
