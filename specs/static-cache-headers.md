# Static Asset Cache Headers

Add `Cache-Control` headers to all static assets served from the `public/` directory to reduce bandwidth, improve page load times, and decrease load on the Raspberry Pi.

## Motivation

The static file handler in `src/server.ts` currently returns `new Response(file)` with no caching headers. Every page load re-downloads all static assets (CSS, images, favicon) from scratch. On the Raspberry Pi with limited upload bandwidth, this is wasteful — especially for the large fact images (up to 1.3 MB each, or ~150 KB after optimization).

Adding `Cache-Control` headers tells browsers to reuse previously downloaded assets, eliminating redundant downloads.

## Caching Strategy

### Asset Categories

Static assets fall into three categories based on how frequently they change:

#### 1. Images — Long Cache (`max-age=604800`, 7 days)

Applies to: `*.png`, `*.jpg`, `*.jpeg`, `*.gif`, `*.webp`, `*.svg`, `*.ico`

```
Cache-Control: public, max-age=604800, immutable
```

- **7 days**: Fact images and the mascot PNG never change once generated. A 7-day cache is conservative — in practice these files are immutable.
- **`immutable`**: Tells the browser not to revalidate even on a force-refresh. Supported by Firefox and Safari; ignored by Chrome (which relies on `max-age` instead).
- **`public`**: Allows intermediate caches (Cloudflare) to cache the response.

This includes:
- `platypus.png` (mascot)
- `platypus-icon.svg` (background pattern)
- `images/facts/*.png` (fact illustrations)
- `favicon.ico`, `favicon-32.png`, `apple-touch-icon.png` (favicons — these files are added by the `favicon.md` spec; if not yet present, the cache headers will apply automatically once they are)

#### 2. CSS — Medium Cache (`max-age=86400`, 1 day)

Applies to: `*.css`

```
Cache-Control: public, max-age=86400
```

- **1 day**: CSS may change between deploys. A 1-day cache ensures updates propagate within a day. Since deploys are infrequent (not multiple times per day), this is a reasonable balance.
- No `immutable` — CSS is expected to change occasionally.

#### 3. Everything Else — Short Cache

Any other file type served from `public/`:

```
Cache-Control: public, max-age=3600
```

- **1 hour**: A conservative default for any static file that doesn't match the above categories.

## Implementation

### Static File Handler Changes

In `src/server.ts`, the static file serving block (currently lines 108-115) returns `new Response(file)`. Update to include the `Cache-Control` header based on file extension:

```typescript
const ext = path.extname(publicPath).toLowerCase();
const cacheControl = getCacheControl(ext);
return new Response(file, {
  headers: { "Cache-Control": cacheControl },
});
```

### `getCacheControl(ext)` Helper

Add a helper function (in `src/server.ts` or a utility module) that maps file extensions to cache directives:

```typescript
function getCacheControl(ext: string): string {
  switch (ext) {
    case ".png":
    case ".jpg":
    case ".jpeg":
    case ".gif":
    case ".webp":
    case ".svg":
    case ".ico":
      return "public, max-age=604800, immutable";
    case ".css":
      return "public, max-age=86400";
    default:
      return "public, max-age=3600";
  }
}
```

### Content-Type

Bun's `new Response(file)` already sets `Content-Type` automatically based on file extension. No change needed.

## Cloudflare Interaction

The application sits behind Cloudflare Tunnel. Cloudflare respects `Cache-Control` headers from the origin:

- **`public`** tells Cloudflare it's allowed to cache the response on its edge.
- Cloudflare will serve cached responses to repeat visitors from its edge, reducing requests that reach the Pi.
- Cloudflare's default Edge Cache TTL for static assets is 2 hours (for 200 responses). The `Cache-Control` headers specified here instruct Cloudflare to cache for longer than its defaults (7 days for images, 1 day for CSS). When Origin Cache Control is enabled (Cloudflare's default), Cloudflare respects the origin's `Cache-Control` headers, so these values override Cloudflare's 2-hour default.

No Cloudflare configuration changes are needed.

## Cache Busting

### CSS Changes

When CSS is updated during a deploy, the 1-day cache means some users may see stale CSS for up to 24 hours. For this project's deploy frequency (infrequent, not daily), this is acceptable.

If cache busting becomes necessary in the future, append a version query string to the CSS link:

```html
<link rel="stylesheet" href="/styles.css?v=abc123">
```

This is NOT implemented now — it's a future option if needed. The current spec does not include cache busting.

### Image Changes

Fact images are immutable (generated once, never re-generated for the same fact ID). The mascot and favicons change extremely rarely. No cache busting is needed for images.

## Health Endpoint

The `/health` and `/health/dashboard` endpoints are NOT static assets — they are dynamic route handlers. They are not affected by this change. If cache headers are desired on the health endpoint, that would be handled separately in the health route handler (not in scope here).

## Testing

### Unit Tests

- Static file responses include `Cache-Control` header
- PNG files get `public, max-age=604800, immutable`
- SVG files get `public, max-age=604800, immutable`
- ICO files get `public, max-age=604800, immutable`
- CSS files get `public, max-age=86400`
- Unknown extensions get `public, max-age=3600`
- Existing static file tests (path traversal, 404 for missing files) continue to pass

### Manual Verification

- Open DevTools Network tab, load a fact page, verify `Cache-Control` header on the image response
- Reload the page, verify the image is served from cache (status 200 from disk cache or 304)
- Verify Cloudflare edge caching by checking the `cf-cache-status` response header (should show `HIT` after first request)
- Verify that `Content-Type` headers are still automatically set correctly when `Cache-Control` headers are added (both should be present)
- Test with uppercase file extensions (e.g., `.PNG`) to verify the `.toLowerCase()` normalization works

## Rollback

To revert, change `new Response(file, { headers: { "Cache-Control": cacheControl } })` back to `new Response(file)` in the static file handler. Remove the `getCacheControl()` helper. All static assets return to being served without caching directives.
