# Seed Data

Platypus facts and their sources are maintained in a JSON file in the repository and synced to the database.

## File Location

`data/facts.json`

## Format

```json
[
  {
    "text": "Platypuses are one of only five species of monotremes — mammals that lay eggs.",
    "sources": [
      {
        "url": "https://example.com/monotremes",
        "title": "Monotremes - Australian Museum"
      }
    ]
  },
  {
    "text": "Male platypuses have venomous spurs on their hind legs.",
    "sources": [
      {
        "url": "https://example.com/platypus-venom",
        "title": "Platypus Venom Research"
      },
      {
        "url": "https://example.com/platypus-defense"
      }
    ]
  }
]
```

## Validation Rules

- Each fact MUST have a non-empty `text` field.
- Each fact MUST have at least one source.
- Each source MUST have a non-empty `url` field.
- The `title` field on sources is optional.

## Sync Behavior

A sync script (e.g., `src/scripts/sync-facts.ts`) loads `data/facts.json` and upserts facts into the database:

- **Matching**: Facts are matched by their `text` content (exact match).
- **New facts**: Inserted into `facts` and `fact_sources` tables. They have no `sent_facts` entries, so the cycling algorithm will prioritize them.
- **Existing facts**: Sources are updated if changed.
- **Removed facts**: Facts present in the database but absent from the seed file are left in place (not deleted). They continue to participate in cycling.
- **Image generation**: After upserting a fact, if it does not yet have a generated image (`image_path` is NULL), the sync script generates one using the AI image generation API and saves it to `public/images/facts/{fact_id}.png`. See `fact-images.md` for style and generation details.

The sync script runs as part of the deployment process.

## Startup

On application startup, the sync script runs automatically to ensure the database reflects the current seed file.
