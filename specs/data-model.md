# Data Model

SQLite database with the following tables.

## Tables

### `facts`

| Column       | Type    | Constraints              | Description                        |
| ------------ | ------- | ------------------------ | ---------------------------------- |
| `id`         | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique fact identifier             |
| `text`       | TEXT    | NOT NULL                 | The platypus fact content          |
| `created_at` | TEXT    | NOT NULL DEFAULT (datetime('now')) | When the fact was added |

Every fact MUST have at least one associated source.

### `fact_sources`

| Column    | Type    | Constraints                        | Description                          |
| --------- | ------- | ---------------------------------- | ------------------------------------ |
| `id`      | INTEGER | PRIMARY KEY AUTOINCREMENT          | Unique source identifier             |
| `fact_id` | INTEGER | NOT NULL, FK → facts(id) ON DELETE CASCADE | The fact this source belongs to |
| `url`     | TEXT    | NOT NULL                           | Source URL                           |
| `title`   | TEXT    |                                    | Optional human-readable source title |

### `subscribers`

| Column           | Type    | Constraints                         | Description                                  |
| ---------------- | ------- | ----------------------------------- | -------------------------------------------- |
| `id`             | INTEGER | PRIMARY KEY AUTOINCREMENT           | Unique subscriber identifier                 |
| `phone_number`   | TEXT    | NOT NULL, UNIQUE                    | E.164 formatted phone number                 |
| `status`         | TEXT    | NOT NULL DEFAULT 'pending'          | One of: `pending`, `active`, `unsubscribed`  |
| `created_at`     | TEXT    | NOT NULL DEFAULT (datetime('now'))  | When the subscriber signed up                |
| `confirmed_at`   | TEXT    |                                     | When the subscriber confirmed                |
| `unsubscribed_at`| TEXT    |                                     | When the subscriber unsubscribed             |

### `sent_facts`

Tracks which facts have been sent globally (one entry per day a fact is sent).

| Column       | Type    | Constraints                        | Description                       |
| ------------ | ------- | ---------------------------------- | --------------------------------- |
| `id`         | INTEGER | PRIMARY KEY AUTOINCREMENT          | Unique record identifier          |
| `fact_id`    | INTEGER | NOT NULL, FK → facts(id)           | The fact that was sent            |
| `sent_date`  | TEXT    | NOT NULL, UNIQUE                   | The date it was sent (YYYY-MM-DD) |
| `cycle`      | INTEGER | NOT NULL                           | Which cycle this send belongs to  |

## Constraints

- `facts` must always have at least one row in `fact_sources`. Enforce at the application level on insert/update.
- `subscribers.phone_number` must be stored in E.164 format (e.g., `+15551234567`).
- `sent_facts.sent_date` is unique — only one fact per day.
