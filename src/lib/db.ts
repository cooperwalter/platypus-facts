import { Database } from "bun:sqlite";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "./schema";

type DrizzleDatabase = ReturnType<typeof drizzle<typeof schema>>;

const MIGRATIONS_FOLDER = path.resolve(import.meta.dir, "../../drizzle");

function hasTable(sqlite: Database, table: string): boolean {
	const result = sqlite
		.query<{ count: number }, [string]>(
			"SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name=?",
		)
		.get(table);
	return (result?.count ?? 0) > 0;
}

function hasColumn(sqlite: Database, table: string, column: string): boolean {
	const info = sqlite
		.query<{ name: string }, [string]>("SELECT name FROM pragma_table_info(?)")
		.all(table);
	return info.some((col) => col.name === column);
}

function migratePhoneNumber(sqlite: Database): void {
	if (!hasTable(sqlite, "subscribers") || !hasColumn(sqlite, "subscribers", "phone_number")) return;
	sqlite.exec("PRAGMA foreign_keys=OFF");
	sqlite.exec("BEGIN TRANSACTION");
	sqlite.run(`
		CREATE TABLE subscribers_new (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			email TEXT NOT NULL UNIQUE,
			token TEXT NOT NULL UNIQUE,
			status TEXT NOT NULL DEFAULT 'pending',
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			confirmed_at TEXT,
			unsubscribed_at TEXT
		)
	`);
	sqlite.run(`
		INSERT INTO subscribers_new (id, email, token, status, created_at, confirmed_at, unsubscribed_at)
		SELECT id, email, token, status, created_at, confirmed_at, unsubscribed_at
		FROM subscribers
		WHERE email IS NOT NULL
	`);
	sqlite.run("DROP TABLE subscribers");
	sqlite.run("ALTER TABLE subscribers_new RENAME TO subscribers");
	sqlite.exec("COMMIT");
	sqlite.exec("PRAGMA foreign_keys=ON");
}

function markBaselineMigrationApplied(sqlite: Database): void {
	if (hasTable(sqlite, "__drizzle_migrations")) return;
	if (!hasTable(sqlite, "facts")) return;

	const journalPath = path.join(MIGRATIONS_FOLDER, "meta", "_journal.json");
	const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8")) as {
		entries: Array<{ tag: string; when: number }>;
	};
	const baseline = journal.entries[0];
	if (!baseline) return;

	const sqlFile = path.join(MIGRATIONS_FOLDER, `${baseline.tag}.sql`);
	const query = fs.readFileSync(sqlFile, "utf-8");
	const hash = crypto.createHash("sha256").update(query).digest("hex");

	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS __drizzle_migrations (
			id SERIAL PRIMARY KEY,
			hash text NOT NULL,
			created_at numeric
		)
	`);
	sqlite
		.prepare("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)")
		.run(hash, baseline.when);
}

function initializeDatabase(sqlite: Database): DrizzleDatabase {
	migratePhoneNumber(sqlite);
	markBaselineMigrationApplied(sqlite);
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	return db;
}

function createDatabase(dbPath: string): { db: DrizzleDatabase; sqlite: Database } {
	const sqlite = new Database(dbPath);
	sqlite.exec("PRAGMA journal_mode=WAL");
	sqlite.exec("PRAGMA foreign_keys=ON");
	sqlite.exec("PRAGMA busy_timeout=5000");
	const db = initializeDatabase(sqlite);
	return { db, sqlite };
}

function createInMemoryDatabase(): { db: DrizzleDatabase; sqlite: Database } {
	const sqlite = new Database(":memory:");
	sqlite.exec("PRAGMA foreign_keys=ON");
	sqlite.exec("PRAGMA busy_timeout=5000");
	const db = initializeDatabase(sqlite);
	return { db, sqlite };
}

export type { DrizzleDatabase };
export { createDatabase, createInMemoryDatabase };
