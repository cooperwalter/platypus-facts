# Health Dashboard

Expand the `/health` endpoint to report operational metrics including subscriber count, fact statistics, last send date, and database size. Add a separate human-readable HTML dashboard.

## Motivation

The current `/health` endpoint returns only `{ "status": "ok" }`. This is sufficient for Kamal's automated health checks but provides no visibility into the application's operational state. Operators (that is, the project maintainer) must SSH into the Pi and query the database manually to check subscriber counts, last send date, or whether the daily job ran. A dashboard makes this information instantly accessible.

## Architecture

Two endpoints:

1. **`GET /health`** — Existing endpoint, enhanced with optional detail (JSON API)
2. **`GET /health/dashboard`** — New endpoint, HTML dashboard page

### Why Two Endpoints

Kamal health checks hit `/health` every 10 seconds. The health check must remain fast and lightweight — it should not run database queries on every poll. The detailed dashboard is a separate endpoint that runs queries on demand when a human visits it.

## `GET /health` (Enhanced)

### Default Response (Unchanged)

```json
{
  "status": "ok"
}
```

HTTP 200. No database queries. Kamal compatibility preserved.

### Detailed Response (Query Parameter)

When requested with `?detail=true`:

```
GET /health?detail=true
```

Response:

```json
{
  "status": "ok",
  "subscribers": {
    "active": 42,
    "pending": 3,
    "unsubscribed": 7
  },
  "facts": {
    "total": 28,
    "withImages": 25,
    "currentCycle": 3
  },
  "lastSend": {
    "date": "2026-02-11",
    "factId": 15
  },
  "database": {
    "sizeBytes": 245760,
    "sizeMB": 0.23
  },
  "uptime": {
    "seconds": 86400,
    "formatted": "1d 0h 0m"
  }
}
```

HTTP 200 with `Content-Type: application/json`.

If `lastSend` has no data (no daily sends yet), the field is `null`:

```json
"lastSend": null
```

### Handler Signature Update

`handleHealthCheck()` in `src/routes/health.ts` currently takes no parameters. Update to accept the request and dependencies:

```
handleHealthCheck(request: Request, db: DrizzleDatabase, databasePath: string): Response
```

The handler checks for the `detail` query parameter using strict comparison: `new URL(request.url).searchParams.get("detail") === "true"`. Any other value (including `"1"`, `"yes"`, or absent) returns the minimal response. If `"true"`, run the dashboard queries and return the detailed response. This introduces a new pattern (query parameter parsing) not currently used elsewhere in the codebase.

The `databasePath` is threaded from `config.databasePath` in `src/index.ts` through `RequestHandlerDeps` (add `databasePath: string` to the interface) and into the handler via the closure in `createRequestHandler()`.

## `GET /health/dashboard` (New)

A server-rendered HTML page displaying operational metrics in a human-readable format. Uses the same visual design as other pages (warm theme, shared header, footer).

### Content

The dashboard displays:

#### Subscriber Metrics
- **Active Platypus Fans**: Count of `status = 'active'` subscribers (e.g., "42 / 200")
- **Pending**: Count of `status = 'pending'`
- **Unsubscribed**: Count of `status = 'unsubscribed'`

#### Fact Metrics
- **Total Facts**: Count of rows in `facts` table
- **Facts with Images**: Count where `image_path IS NOT NULL`
- **Current Cycle**: The max `cycle` value from `sent_facts`
- **Facts Remaining in Cycle**: Number of facts not yet sent in the current cycle

#### Last Daily Send
- **Date**: The most recent `sent_date` from `sent_facts`
- **Fact ID**: The `fact_id` from that send
- **Days Ago**: Computed difference from today (e.g., "1 day ago", "today")

#### Database
- **File Size**: Size of the SQLite database file in MB

#### Uptime
- **Server Uptime**: Time since the server process started (e.g., "3d 14h 22m")

### Design

Consistent with the existing page theme:
- Uses `renderFooter()` for the shared footer
- Hero header with "Daily Platypus Facts" title linking to home
- Uses the `.content-card` CSS class for the dashboard content
- Metrics displayed in a clean, readable format using definition lists (`<dl>`, `<dt>`, `<dd>`) or a simple table
- No auto-refresh. Metrics are current as of page load. Reload the page to refresh.

### Access Control

The dashboard is **public** (no authentication). It exposes aggregate counts only — no subscriber emails, tokens, or personally identifiable information. The metrics shown are the same kind of information visible on the home page (subscriber count) plus operational data (last send date, database size) that is not sensitive.

If authentication is desired in the future, this spec can be amended. For now, simplicity is preferred.

## New Query Functions

Add to the appropriate existing modules (subscriber queries in `src/lib/subscribers.ts`, fact queries in `src/lib/facts.ts`, file size in `src/lib/db.ts`):

### `getSubscriberCounts(db)`

Returns counts by status:

```typescript
{ active: number; pending: number; unsubscribed: number }
```

Uses Drizzle's `count()` with `groupBy(subscribers.status)`.

### `getFactStats(db)`

Returns fact statistics:

```typescript
{ total: number; withImages: number; currentCycle: number; remainingInCycle: number }
```

- `total`: `count()` from `facts`
- `withImages`: `count()` from `facts` where `image_path IS NOT NULL`
- `currentCycle`: Reuse existing `getCurrentCycle(db)` from `src/lib/facts.ts`
- `remainingInCycle`: Total facts minus facts sent in the current cycle

### `getLastSend(db)`

Returns the most recent send:

```typescript
{ date: string; factId: number } | null
```

Queries `sent_facts` ordered by `sent_date DESC`, limited to 1. Returns `null` if no facts have been sent.

### `getDatabaseSizeBytes(databasePath)`

Returns the database file size in bytes:

```typescript
number
```

Uses `Bun.file(databasePath).size` or `fs.statSync(databasePath).size`. Returns `0` if the file doesn't exist or an error occurs.

### Uptime Tracking

Record the server start time inside the `createRequestHandler()` closure in `src/server.ts`, so it is captured when the handler is created (at server startup) and is accessible via closure to all route handlers:

```typescript
function createRequestHandler(deps: RequestHandlerDeps) {
  const startTime = Date.now();
  // ... handlers can reference startTime
}
```

Compute uptime as `Date.now() - startTime` in the health handler. This approach makes the start time testable (each test creates a new handler with a new start time) and avoids mutable module-level state.

## Route Registration

In `src/server.ts`, add the new route:

```typescript
if (method === "GET" && pathname === "/health/dashboard") {
  return renderHealthDashboard(db, config.databasePath, maxSubscribers);
}
```

The existing `/health` route must be updated to pass `request`, `db`, and `{ databasePath }` to the handler.

The existing routing uses exact string matching (`pathname === "/health"`), so `/health/dashboard` will NOT accidentally match the `/health` handler. No special route ordering is required.

## Testing

### Unit Tests

- `getSubscriberCounts()` returns correct counts with mixed subscriber statuses
- `getFactStats()` returns correct total, withImages, currentCycle, and remainingInCycle
- `getLastSend()` returns the most recent sent fact
- `getLastSend()` returns `null` when `sent_facts` is empty
- `getDatabaseSizeBytes()` returns a positive number for an existing database file
- `getDatabaseSizeBytes()` returns `0` for a nonexistent path

### Integration Tests

- `GET /health` returns `{ "status": "ok" }` (backward compatibility)
- `GET /health?detail=true` returns the full JSON structure with all metrics
- `GET /health/dashboard` returns HTTP 200 with `text/html` content type
- Dashboard HTML contains subscriber count, fact count, and last send date
- Dashboard does not contain any subscriber email addresses or tokens
- `GET /health?detail=false` returns minimal response (same as no parameter)
- `GET /health?detail=invalid` returns minimal response (strict `=== "true"` check)
- Dashboard displays correct zero values when no subscribers, facts, or sends exist
- Uptime formatted string matches expected pattern (e.g., "0d 0h 1m" for fresh server)

## Rollback

To revert, restore the original no-parameter `handleHealthCheck()` signature, remove the `/health/dashboard` route from `src/server.ts`, remove `databasePath` from `RequestHandlerDeps`, and delete the dashboard render function. The `/health` endpoint returns to its original `{ "status": "ok" }` behavior.
