import { Database } from "bun:sqlite";

function initializeSchema(db: Database): void {
	db.exec(`
		CREATE TABLE IF NOT EXISTS facts (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			text TEXT NOT NULL,
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
			phone_number TEXT NOT NULL UNIQUE,
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

		CREATE INDEX IF NOT EXISTS idx_sent_facts_fact_id ON sent_facts(fact_id);
	`);
}

function createDatabase(path: string): Database {
	const db = new Database(path);
	db.exec("PRAGMA journal_mode=WAL");
	db.exec("PRAGMA foreign_keys=ON");
	initializeSchema(db);
	return db;
}

function createInMemoryDatabase(): Database {
	const db = new Database(":memory:");
	db.exec("PRAGMA foreign_keys=ON");
	initializeSchema(db);
	return db;
}

export { createDatabase, createInMemoryDatabase };
