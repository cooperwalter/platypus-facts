# Favicon

Replace the current inline SVG emoji favicon with a proper favicon generated from the platypus mascot PNG.

## Current State

All pages currently use an inline SVG data URI favicon containing the duck emoji (🦆):

```html
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🦆</text></svg>">
```

This has several issues:
- Emoji rendering varies across operating systems (different duck designs on macOS, Windows, Linux, Android, iOS)
- The duck emoji is a stand-in for the platypus (since no platypus emoji exists) — the mascot PNG is a better representation
- No `apple-touch-icon` for iOS home screen bookmarks
- No standard `.ico` fallback for older browsers

## Favicon Files

Generate the following favicon files from the platypus mascot PNG (`public/platypus.png`) and place them in `public/`:

### `public/favicon.ico`

- **Format**: ICO (multi-resolution)
- **Sizes**: 16x16 and 32x32 embedded in a single `.ico` file
- **Source**: Cropped/resized from `platypus.png`
- **Purpose**: Universal fallback, served automatically by browsers requesting `/favicon.ico`

### `public/favicon-32.png`

- **Format**: PNG
- **Size**: 32x32 pixels
- **Purpose**: Modern browsers that prefer PNG over ICO

### `public/apple-touch-icon.png`

- **Format**: PNG
- **Size**: 180x180 pixels
- **Purpose**: iOS Safari home screen bookmark icon, Android Chrome, and other mobile browsers

## Generation

Favicon files can be generated using either approach:

### Option A: Manual Generation (Recommended for Initial Setup)

Use an online favicon generator (e.g., realfavicongenerator.net) or a local image editor:
1. Upload `public/platypus.png` as the source image
2. Download the generated favicon files
3. Place `favicon.ico`, `favicon-32.png`, and `apple-touch-icon.png` in `public/`
4. Commit the files to the repo

This is the simplest approach and has zero dependency on build tooling.

### Option B: Programmatic Generation via `optimize-images` Script

The image optimization script (`src/scripts/optimize-images.ts`, from `image-optimization.md`) can include favicon generation as part of its processing:

1. Read `public/platypus.png`
2. Resize to 180x180 and save as `public/apple-touch-icon.png`
3. Resize to 32x32 and save as `public/favicon-32.png`
4. For `favicon.ico`: sharp does **not** natively produce ICO files. Either:
   - Add `png-to-ico` as a dev dependency and convert the 32x32 PNG to ICO
   - Or skip ICO generation and rely on the PNG favicon (modern browsers all support PNG favicons; ICO is only needed for IE11 and older)

### Edge Cases

- If `public/platypus.png` does not exist when the script runs, skip favicon generation with a warning (do not fail)
- If favicon files already exist at the target paths, overwrite them (the source mascot is the canonical version)

## HTML Changes

Replace the existing inline SVG favicon `<link>` tag on **all pages** in `src/routes/pages.ts` with:

```html
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
```

This replaces the single `<link rel="icon" href="data:image/svg+xml,...">` line that currently appears in every page's `<head>`. Since there is no shared layout wrapper, the replacement must be made in **all 9** `render*()` functions that produce a full HTML document:

1. `renderSignupPage` (line 110)
2. `renderFactPage` (line 165)
3. `renderMessagePage` (line 253)
4. `renderUnsubscribePage` (line 303)
5. `render404Page` (line 365)
6. `renderInspirationPage` (line 398)
7. `renderAboutPage` (line 433)
8. `renderDevMessageList` (line 483)
9. `renderDevEmailDetail` (line 526)

Note: `renderConfirmationPage` uses `renderMessagePage` internally, so it is covered indirectly.

## Static File Serving

No changes to static file serving. The existing static file handler in `src/server.ts` already serves any file from `public/` — the new favicon files will be served automatically at `/favicon.ico`, `/favicon-32.png`, and `/apple-touch-icon.png`.

Browsers that request `/favicon.ico` by convention (without a `<link>` tag) will now receive the actual favicon file instead of a 404.

## Caching

Favicons change extremely rarely. Once the cache header enhancement (see `static-cache-headers.md`) is implemented, favicon files will benefit from long cache durations automatically as static assets. No favicon-specific caching configuration is needed.

## Testing

- Verify the favicon renders correctly in Chrome, Firefox, Safari, and Edge
- Verify `/favicon.ico` returns the ICO file (not 404)
- Verify the apple-touch-icon appears when bookmarking the site on iOS Safari
- Verify no pages still reference the old inline SVG emoji favicon
- Existing static file serving tests continue to pass
- No new automated tests required (visual verification)
- To clear a cached old favicon: hard-refresh (Ctrl+Shift+R) or clear browser cache. Old emoji favicons may persist in browser tab caches until cleared.

## Rollback

To revert, restore the inline SVG data URI `<link>` tag in all 9 render functions and delete the favicon files from `public/`. The old emoji favicon is self-contained (no external file needed).
