# Data Model

SQLite database with the following tables.

## Tables

### `facts`

| Column       | Type    | Constraints              | Description                        |
| ------------ | ------- | ------------------------ | ---------------------------------- |
| `id`         | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique fact identifier             |
| `text`       | TEXT    | NOT NULL                 | The platypus fact content          |
| `image_path` | TEXT    |                          | Relative path to AI-generated illustration (e.g., `images/facts/7.png`), or NULL if not yet generated |
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
| `email`          | TEXT    | NOT NULL, UNIQUE                    | Email address                                |
| `token`          | TEXT    | NOT NULL, UNIQUE                    | Random token for email confirmation and unsubscribe links |
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

### `dev_messages` (Development Only)

Stores emails sent by the dev email provider so they are visible across processes (e.g., emails sent by the daily-send CLI are viewable in the web server's dev message viewer). This table is only created when dev providers are active — it does not exist in production.

| Column       | Type    | Constraints                        | Description                       |
| ------------ | ------- | ---------------------------------- | --------------------------------- |
| `id`         | INTEGER | PRIMARY KEY AUTOINCREMENT          | Unique message identifier         |
| `type`       | TEXT    | NOT NULL                           | `email`                           |
| `recipient`  | TEXT    | NOT NULL                           | Email address                     |
| `subject`    | TEXT    |                                    | Email subject                     |
| `body`       | TEXT    | NOT NULL                           | Email HTML body                   |
| `created_at` | TEXT    | NOT NULL DEFAULT (datetime('now')) | When the email was sent           |

## Constraints

- `facts` must always have at least one row in `fact_sources`. Enforce at the application level on insert/update.
- `subscribers.email` must be a valid email address.
- `subscribers.token` is a cryptographically random string (e.g., 32-byte hex or UUID v4), generated when the subscriber record is created.
- `sent_facts.sent_date` is unique — only one fact per day.
