# Fact Images

Each platypus fact has one AI-generated illustration that accompanies it on the web and in SMS.

## Style

All images are generated in a consistent style: **minimalist line drawing** featuring a platypus character.

- Primarily black line art on a white background
- Hand-drawn, sketchy aesthetic with a warm, whimsical feel
- Occasional subtle color accents (e.g., rosy pink cheeks, soft blush marks)
- Cute and charming — character-focused
- The platypus is depicted in a scene or pose related to the fact content
- Simple compositions — no complex backgrounds, just the character and minimal context elements (a sun, stars, small props)
- Consistent with the *Life is Strange: Double Exposure* indie, handcrafted aesthetic

## Image Generation

Images are generated using an AI image generation API (e.g., OpenAI DALL-E, or similar). The generation prompt combines the fixed style description above with context from the fact text to produce a relevant illustration.

### Prompt Template

A system-level style prompt ensures visual consistency across all images. The fact text is appended to provide scene context. For example:

> Minimalist black line drawing of a cute platypus on a white background. Hand-drawn sketchy style with occasional rosy pink cheek accents. Simple, whimsical, charming. [Scene context derived from the fact text.]

The exact prompt template is maintained in code and can be iterated on. The goal is that all generated images feel like they belong to the same illustration series.

### When Images Are Generated

Images are generated during the **fact sync process** (`sync-facts`). When a fact is synced to the database and does not yet have an associated image, the sync script:

1. Generates an image using the AI image generation API.
2. Saves the image to local storage.
3. Records the image path in the database.

This means image generation happens once per fact, at sync time. Existing facts with images are not regenerated unless explicitly triggered (e.g., a manual re-generation script or flag).

### Image Format and Size

- Format: PNG
- Dimensions: 512x512 pixels (sufficient for MMS and web display, keeps file size reasonable)
- Stored in `public/images/facts/` as `{fact_id}.png`

## Storage

Images are stored on the local filesystem in `public/images/facts/`. They are served as static assets by the HTTP server alongside CSS and other public files.

The image path for a fact with `id = 7` would be:
- Filesystem: `public/images/facts/7.png`
- URL: `{base_url}/images/facts/7.png`

## Data Model

The `facts` table gains an `image_path` column:

| Column       | Type | Constraints | Description                                    |
| ------------ | ---- | ----------- | ---------------------------------------------- |
| `image_path` | TEXT |             | Relative path to the generated image file, or NULL if not yet generated |

See `data-model.md` for the full table definition.

## Web Display

The fact page (`GET /facts/:id`) displays the generated image above the fact text. If no image exists for the fact, the page renders without an image (graceful degradation). See `web-pages.md`.

## SMS (MMS)

The daily fact message is sent as an **MMS** (Multimedia Messaging Service) instead of plain SMS, with the image attached. This allows the illustration to appear inline in the subscriber's messaging app. See `sms-integration.md` for details on the MMS format and cost implications.

If a fact does not have an image (e.g., image generation failed), the message falls back to plain SMS.

## Configuration

| Variable                  | Description                                      | Example              |
| ------------------------- | ------------------------------------------------ | -------------------- |
| `OPENAI_API_KEY`          | API key for AI image generation                  | `sk-...`             |

## Cost

AI image generation costs apply per fact (one-time, not per subscriber). See `cost-estimate.md` for updated estimates including MMS pricing and image generation costs.
