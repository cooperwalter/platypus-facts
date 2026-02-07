import { Database } from "bun:sqlite";

// DO NOT MODIFY initializeSchema — it reflects the baseline schema.
// All schema changes (new columns, constraint fixes, index additions) go in migrateSchema.
function initializeSchema(db: Database): void {
	db.exec(`
		CREATE TABLE IF NOT EXISTS facts (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			text TEXT NOT NULL,
			image_path TEXT,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		);

		CREATE TABLE IF NOT EXISTS fact_sources (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			fact_id INTEGER NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
			url TEXT NOT NULL,
			title TEXT
		);

		CREATE TABLE IF NOT EXISTS subscribers (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			phone_number TEXT UNIQUE,
			email TEXT UNIQUE,
			token TEXT NOT NULL UNIQUE,
			status TEXT NOT NULL DEFAULT 'pending',
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			confirmed_at TEXT,
			unsubscribed_at TEXT
		);

		CREATE TABLE IF NOT EXISTS sent_facts (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			fact_id INTEGER NOT NULL REFERENCES facts(id) ON DELETE RESTRICT,
			sent_date TEXT NOT NULL UNIQUE,
			cycle INTEGER NOT NULL
		);

		CREATE TABLE IF NOT EXISTS dev_messages (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			type TEXT NOT NULL,
			recipient TEXT NOT NULL,
			subject TEXT,
			body TEXT NOT NULL,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		);

		CREATE INDEX IF NOT EXISTS idx_fact_sources_fact_id ON fact_sources(fact_id);
		CREATE INDEX IF NOT EXISTS idx_sent_facts_fact_id ON sent_facts(fact_id);
	`);
}

function hasColumn(db: Database, table: string, column: string): boolean {
	const info = db
		.query<{ name: string }, [string]>("SELECT name FROM pragma_table_info(?)")
		.all(table);
	return info.some((col) => col.name === column);
}

function tryAddColumn(db: Database, table: string, columnDef: string): void {
	const columnName = columnDef.split(" ")[0];
	if (columnName && hasColumn(db, table, columnName)) {
		return;
	}
	db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
}

function isColumnNullable(db: Database, table: string, column: string): boolean {
	const info = db
		.query<{ name: string; notnull: number }, [string]>(
			'SELECT name, "notnull" FROM pragma_table_info(?)',
		)
		.all(table);
	const col = info.find((c) => c.name === column);
	return col ? col.notnull === 0 : true;
}

function migrateSubscribersConstraints(db: Database): void {
	const phoneNeedsNullable = !isColumnNullable(db, "subscribers", "phone_number");
	const tokenNeedsNotNull = isColumnNullable(db, "subscribers", "token");

	if (!phoneNeedsNullable && !tokenNeedsNotNull) return;

	db.exec("PRAGMA foreign_keys=OFF");
	db.exec("BEGIN TRANSACTION");
	db.run(`
		CREATE TABLE subscribers_new (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			phone_number TEXT UNIQUE,
			email TEXT UNIQUE,
			token TEXT NOT NULL UNIQUE,
			status TEXT NOT NULL DEFAULT 'pending',
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			confirmed_at TEXT,
			unsubscribed_at TEXT
		)
	`);
	db.run(`
		INSERT INTO subscribers_new (id, phone_number, email, token, status, created_at, confirmed_at, unsubscribed_at)
		SELECT id, phone_number, email, token, status, created_at, confirmed_at, unsubscribed_at
		FROM subscribers
	`);
	db.run("DROP TABLE subscribers");
	db.run("ALTER TABLE subscribers_new RENAME TO subscribers");
	db.exec("COMMIT");
	db.exec("PRAGMA foreign_keys=ON");
}

function migrateSchema(db: Database): void {
	tryAddColumn(db, "facts", "image_path TEXT");
	tryAddColumn(db, "subscribers", "email TEXT");
	if (hasColumn(db, "subscribers", "email")) {
		db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email)");
	}
	tryAddColumn(db, "subscribers", "token TEXT");
	if (hasColumn(db, "subscribers", "token")) {
		db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_subscribers_token ON subscribers(token)");
	}

	const needsToken = db
		.query<{ count: number }, []>("SELECT COUNT(*) as count FROM subscribers WHERE token IS NULL")
		.get();
	if (needsToken && needsToken.count > 0) {
		const rows = db
			.query<{ id: number }, []>("SELECT id FROM subscribers WHERE token IS NULL")
			.all();
		const update = db.prepare("UPDATE subscribers SET token = ? WHERE id = ?");
		for (const row of rows) {
			update.run(crypto.randomUUID(), row.id);
		}
	}

	migrateSubscribersConstraints(db);
}

function createDatabase(path: string): Database {
	const db = new Database(path);
	db.exec("PRAGMA journal_mode=WAL");
	db.exec("PRAGMA foreign_keys=ON");
	db.exec("PRAGMA busy_timeout=5000");
	initializeSchema(db);
	migrateSchema(db);
	return db;
}

function createInMemoryDatabase(): Database {
	const db = new Database(":memory:");
	db.exec("PRAGMA foreign_keys=ON");
	db.exec("PRAGMA busy_timeout=5000");
	initializeSchema(db);
	migrateSchema(db);
	return db;
}

export { createDatabase, createInMemoryDatabase };
