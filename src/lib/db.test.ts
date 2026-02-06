import { describe, expect, test } from "bun:test";
import { makeTestDatabase } from "./test-utils";

describe("database setup", () => {
	test("creates the facts table on initialization", () => {
		const db = makeTestDatabase();
		const tables = db
			.query("SELECT name FROM sqlite_master WHERE type='table' AND name='facts'")
			.all();
		expect(tables).toHaveLength(1);
	});

	test("creates the fact_sources table on initialization", () => {
		const db = makeTestDatabase();
		const tables = db
			.query("SELECT name FROM sqlite_master WHERE type='table' AND name='fact_sources'")
			.all();
		expect(tables).toHaveLength(1);
	});

	test("creates the subscribers table on initialization", () => {
		const db = makeTestDatabase();
		const tables = db
			.query("SELECT name FROM sqlite_master WHERE type='table' AND name='subscribers'")
			.all();
		expect(tables).toHaveLength(1);
	});

	test("creates the sent_facts table on initialization", () => {
		const db = makeTestDatabase();
		const tables = db
			.query("SELECT name FROM sqlite_master WHERE type='table' AND name='sent_facts'")
			.all();
		expect(tables).toHaveLength(1);
	});

	test("enforces fact_sources.fact_id foreign key by rejecting references to nonexistent facts", () => {
		const db = makeTestDatabase();
		expect(() => {
			db.prepare(
				"INSERT INTO fact_sources (fact_id, url) VALUES (999, 'https://example.com')",
			).run();
		}).toThrow();
	});

	test("cascades deletes from facts to fact_sources when a fact is deleted", () => {
		const db = makeTestDatabase();
		db.prepare("INSERT INTO facts (text) VALUES ('test fact')").run();
		const factId = Number(
			(db.query("SELECT last_insert_rowid() as id").get() as { id: number }).id,
		);
		db.prepare("INSERT INTO fact_sources (fact_id, url) VALUES (?, 'https://example.com')").run(
			factId,
		);

		const sourcesBefore = db.query("SELECT * FROM fact_sources WHERE fact_id = ?").all(factId);
		expect(sourcesBefore).toHaveLength(1);

		db.prepare("DELETE FROM facts WHERE id = ?").run(factId);

		const sourcesAfter = db.query("SELECT * FROM fact_sources WHERE fact_id = ?").all(factId);
		expect(sourcesAfter).toHaveLength(0);
	});

	test("enforces sent_facts.fact_id foreign key by rejecting references to nonexistent facts", () => {
		const db = makeTestDatabase();
		expect(() => {
			db.prepare(
				"INSERT INTO sent_facts (fact_id, sent_date, cycle) VALUES (999, '2025-01-01', 1)",
			).run();
		}).toThrow();
	});

	test("blocks deleting a fact that is referenced by sent_facts (NO ACTION, not CASCADE)", () => {
		const db = makeTestDatabase();
		db.prepare("INSERT INTO facts (text) VALUES ('test fact')").run();
		const factId = Number(
			(db.query("SELECT last_insert_rowid() as id").get() as { id: number }).id,
		);
		db.prepare(
			"INSERT INTO sent_facts (fact_id, sent_date, cycle) VALUES (?, '2025-01-01', 1)",
		).run(factId);

		expect(() => {
			db.prepare("DELETE FROM facts WHERE id = ?").run(factId);
		}).toThrow();

		const sentAfter = db.query("SELECT * FROM sent_facts WHERE fact_id = ?").all(factId);
		expect(sentAfter).toHaveLength(1);
	});

	test("enforces subscribers.phone_number uniqueness by rejecting duplicate phone numbers", () => {
		const db = makeTestDatabase();
		db.prepare(
			"INSERT INTO subscribers (phone_number, status) VALUES ('+15551234567', 'pending')",
		).run();
		expect(() => {
			db.prepare(
				"INSERT INTO subscribers (phone_number, status) VALUES ('+15551234567', 'pending')",
			).run();
		}).toThrow();
	});

	test("enforces sent_facts.sent_date uniqueness by rejecting duplicate dates", () => {
		const db = makeTestDatabase();
		db.prepare("INSERT INTO facts (text) VALUES ('test fact')").run();
		const factId = Number(
			(db.query("SELECT last_insert_rowid() as id").get() as { id: number }).id,
		);
		db.prepare(
			"INSERT INTO sent_facts (fact_id, sent_date, cycle) VALUES (?, '2025-01-01', 1)",
		).run(factId);
		expect(() => {
			db.prepare(
				"INSERT INTO sent_facts (fact_id, sent_date, cycle) VALUES (?, '2025-01-01', 2)",
			).run(factId);
		}).toThrow();
	});

	test("enables foreign keys pragma (PRAGMA foreign_keys returns 1)", () => {
		const db = makeTestDatabase();
		const result = db.query("PRAGMA foreign_keys").get() as { foreign_keys: number };
		expect(result.foreign_keys).toBe(1);
	});
});
