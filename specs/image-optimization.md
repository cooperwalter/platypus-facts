# Fact Image Optimization

Optimize all images served by the application to reduce page load times, email download sizes, and bandwidth consumption on the Raspberry Pi.

## Motivation

Current image sizes are excessive for their display contexts:

- **Fact images**: 31 PNGs at 1024x1024, ranging from 243 KB to 1.3 MB each (~18 MB total). Displayed at constrained widths on web pages and in emails where 1024px is unnecessary. (Note: 28 facts exist in `data/facts.json`; 3 orphaned images from deleted facts may also exist.)
- **Mascot PNG**: 441 KB at 1024x1024. Displayed at 200x200 CSS pixels on the home page.
- **Bandwidth impact**: Each daily email embeds a ~600 KB image URL. With 200 subscribers, that's ~120 MB of image downloads per daily send.

## Strategy: Build-Time Optimization Script

A new script (`src/scripts/optimize-images.ts`) optimizes images at build time rather than at runtime. This runs once during development or CI — not on every request.

### Dependencies

Add `sharp` as a **dev dependency** (`bun add -d sharp`). Sharp is the standard Node.js image processing library, supports Bun, and has prebuilt binaries for linux/arm64 (Raspberry Pi 5 compatible). Sharp requires glibc (not musl) on Linux — the Docker base image `oven/bun:1` is Debian-based and satisfies this requirement.

#### Favicon Generation

The optimization script also generates favicon files from the mascot PNG. See `favicon.md` for the required output files (`favicon.ico`, `favicon-32.png`, `apple-touch-icon.png`). Sharp can produce the PNG favicons directly; for the ICO file, use a utility like `png-to-ico` (add as dev dependency) or generate the ICO manually.

### Script: `bun run optimize-images`

Add to `package.json` scripts:

```json
"optimize-images": "bun run src/scripts/optimize-images.ts"
```

### Optimization Steps

The script processes images in `public/`:

#### 1. Fact Images (`public/images/facts/*.png`)

For each fact image:

- **Resize** to 640x640 pixels (sufficient for web display and email rendering; 2x retina for typical 320px email column width)
- **Compress** as PNG using sharp's `png({ quality: 80, compressionLevel: 9 })` or convert to optimized PNG with palette reduction where appropriate
- **Overwrite** the original file in place
- **Target size**: Under 150 KB per image (down from 243 KB - 1.3 MB)

Do NOT convert fact images to WebP. Fact images are referenced in emails, and **WebP has poor email client support** (Gmail web, Outlook desktop, and many mobile clients do not render WebP). PNG is the safe, universal format for email images.

#### 2. Mascot Image (`public/platypus.png`)

- **Resize** to 400x400 pixels (2x the 200x200 CSS display size for retina)
- **Compress** as PNG
- **Target size**: Under 80 KB (down from 441 KB)

The mascot is used on web pages only (not in emails currently), but keeping it as PNG maintains consistency and avoids needing `<picture>` element fallbacks.

#### 3. Platypus Icon SVG (`public/platypus-icon.svg`)

No changes. The SVG is already 2.5 KB and is an efficient format for the background pattern.

### Script Behavior

- **Idempotent**: Running the script multiple times produces the same result. Already-optimized images are not re-processed. The script checks image dimensions using `sharp(file).metadata()` — if width and height are at or below target (640x640 for facts, 400x400 for mascot), the image is skipped. Images that match target dimensions but have large file sizes are still compressed (dimension check only gates resizing, not compression).
- **Logging**: Logs each image processed with before/after file sizes.
- **Skip check**: If an image is already at or below the target dimensions, skip it with a log message.
- **Error handling**: If a single image fails to optimize, log the error and continue with remaining images. Do not halt the entire script.
- **Orphaned images**: Images in `public/images/facts/` that don't correspond to any fact in the database are still optimized (the script processes all PNGs in the directory, not just those with matching database records). A warning is NOT logged for orphaned images — they may correspond to facts added in the future.

### When to Run

- **During development**: Run manually after adding new facts or regenerating images via `bun run optimize-images`.
- **In CI (optional)**: Can be added as a step in the GitHub Actions workflow before the Docker build, ensuring all images in the built image are optimized. Not required if developers run it locally.
- **After fact sync**: The `sync-facts` script generates images at 1024x1024 via DALL-E. After sync completes, run `optimize-images` to resize and compress newly generated images.

### NOT at Runtime

Image optimization does NOT happen on incoming HTTP requests. There is no on-the-fly resizing, no CDN transformation, and no content negotiation for image formats. All optimization is pre-computed.

## Web Page Updates

### `<picture>` Element (Not Required)

Since all images remain PNG format (no WebP conversion), no `<picture>` element with source fallbacks is needed. Existing `<img>` tags continue to work unchanged.

### Responsive Image Attributes

Update fact image `<img>` tags on the fact page to include explicit `width` and `height` attributes matching the optimized dimensions (640x640). This prevents layout shift during image loading:

```html
<img src="/images/facts/7.png" alt="..." width="640" height="640" class="fact-image" />
```

The mascot `<img>` tag already has `width="200" height="200"` attributes.

### Lazy Loading (Not Required)

Fact pages display a single image above the fold. Lazy loading (`loading="lazy"`) is not beneficial for above-the-fold content and would actually delay the image load. Do not add it.

## Email Template Updates

No changes to email templates. Emails already reference fact images via absolute URL (`${baseUrl}/images/facts/${factId}.png`). The URLs remain the same — only the file content at those URLs becomes smaller.

## Docker Build Impact

The `Dockerfile` does not need changes. The optimization script runs locally (or in CI) before the Docker build. The Docker image copies already-optimized files from `public/`.

If optimization is added to CI:
- Add a step after checkout and before Docker build: `bun run optimize-images`
- The `sharp` dev dependency will be installed during `bun install` in CI

## Database Impact

No schema changes. The `facts.image_path` column values remain unchanged — only the file contents at those paths change.

## Cost Impact

No additional cost. Sharp is free and open source. Image optimization reduces bandwidth costs (particularly relevant for the Raspberry Pi's upload speed).

## Testing

- The optimization script should be tested manually by comparing before/after file sizes
- Verify optimized images render correctly on the fact page and in email clients (Gmail, Outlook, Apple Mail)
- Verify the mascot image renders correctly at 200x200 on the home page (no visible quality degradation)
- Existing server tests for static file serving (`/images/facts/*.png`) continue to pass unchanged
- No new automated tests are required for the script itself (it's a build tool, not application logic)

## Rollback

If optimized images have visible quality issues, revert by:
1. Re-running `sync-facts` to regenerate original 1024x1024 images from DALL-E
2. Committing the original images
3. Adjusting optimization parameters and re-running `optimize-images`
