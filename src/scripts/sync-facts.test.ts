import { describe, expect, test } from "bun:test";
import * as os from "node:os";
import * as path from "node:path";
import { makeTestDatabase } from "../lib/test-utils";
import { syncFacts } from "./sync-facts";

async function makeTempFactsFile(facts: unknown): Promise<string> {
	const tmpDir = os.tmpdir();
	const tmpFile = path.join(
		tmpDir,
		`facts-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
	);
	await Bun.write(tmpFile, JSON.stringify(facts));
	return tmpFile;
}

describe("syncFacts", () => {
	test("inserting new facts creates rows in both facts and fact_sources tables", async () => {
		const db = makeTestDatabase();

		const seedData = [
			{
				text: "Fact 1",
				sources: [{ url: "https://example.com/1", title: "Source 1" }],
			},
			{
				text: "Fact 2",
				sources: [
					{ url: "https://example.com/2a", title: "Source 2a" },
					{ url: "https://example.com/2b" },
				],
			},
		];

		const tmpFile = await makeTempFactsFile(seedData);
		const results = await syncFacts(db, tmpFile);

		expect(results.added).toBe(2);
		expect(results.updated).toBe(0);
		expect(results.unchanged).toBe(0);

		const facts = db.query("SELECT id, text FROM facts ORDER BY id").all() as {
			id: number;
			text: string;
		}[];
		expect(facts).toHaveLength(2);
		expect(facts[0].text).toBe("Fact 1");
		expect(facts[1].text).toBe("Fact 2");

		const sources = db
			.query("SELECT fact_id, url, title FROM fact_sources ORDER BY fact_id, url")
			.all() as { fact_id: number; url: string; title: string | null }[];
		expect(sources).toHaveLength(3);
		expect(sources[0]).toEqual({
			fact_id: facts[0].id,
			url: "https://example.com/1",
			title: "Source 1",
		});
		expect(sources[1]).toEqual({
			fact_id: facts[1].id,
			url: "https://example.com/2a",
			title: "Source 2a",
		});
		expect(sources[2]).toEqual({
			fact_id: facts[1].id,
			url: "https://example.com/2b",
			title: null,
		});
	});

	test("updating sources for an existing fact replaces old sources with new ones", async () => {
		const db = makeTestDatabase();

		const initialData = [
			{
				text: "Fact 1",
				sources: [{ url: "https://example.com/old", title: "Old Source" }],
			},
		];

		const tmpFile1 = await makeTempFactsFile(initialData);
		await syncFacts(db, tmpFile1);

		const updatedData = [
			{
				text: "Fact 1",
				sources: [
					{ url: "https://example.com/new1", title: "New Source 1" },
					{ url: "https://example.com/new2" },
				],
			},
		];

		const tmpFile2 = await makeTempFactsFile(updatedData);
		const results = await syncFacts(db, tmpFile2);

		expect(results.added).toBe(0);
		expect(results.updated).toBe(1);
		expect(results.unchanged).toBe(0);

		const sources = db.query("SELECT url, title FROM fact_sources ORDER BY url").all() as {
			url: string;
			title: string | null;
		}[];
		expect(sources).toHaveLength(2);
		expect(sources[0]).toEqual({
			url: "https://example.com/new1",
			title: "New Source 1",
		});
		expect(sources[1]).toEqual({
			url: "https://example.com/new2",
			title: null,
		});
	});

	test("re-running sync with unchanged data produces zero additions and zero updates", async () => {
		const db = makeTestDatabase();

		const seedData = [
			{
				text: "Fact 1",
				sources: [{ url: "https://example.com/1", title: "Source 1" }],
			},
		];

		const tmpFile = await makeTempFactsFile(seedData);

		await syncFacts(db, tmpFile);
		const results = await syncFacts(db, tmpFile);

		expect(results.added).toBe(0);
		expect(results.updated).toBe(0);
		expect(results.unchanged).toBe(1);
	});

	test("facts removed from the JSON seed file are NOT deleted from the database", async () => {
		const db = makeTestDatabase();

		const initialData = [
			{
				text: "Fact 1",
				sources: [{ url: "https://example.com/1" }],
			},
			{
				text: "Fact 2",
				sources: [{ url: "https://example.com/2" }],
			},
		];

		const tmpFile1 = await makeTempFactsFile(initialData);
		await syncFacts(db, tmpFile1);

		const reducedData = [
			{
				text: "Fact 1",
				sources: [{ url: "https://example.com/1" }],
			},
		];

		const tmpFile2 = await makeTempFactsFile(reducedData);
		await syncFacts(db, tmpFile2);

		const facts = db.query("SELECT text FROM facts ORDER BY text").all() as {
			text: string;
		}[];
		expect(facts).toHaveLength(2);
		expect(facts[0].text).toBe("Fact 1");
		expect(facts[1].text).toBe("Fact 2");
	});

	test("sync rejects a fact with empty text and throws a validation error", async () => {
		const db = makeTestDatabase();

		const invalidData = [
			{
				text: "",
				sources: [{ url: "https://example.com/1" }],
			},
		];

		const tmpFile = await makeTempFactsFile(invalidData);

		await expect(syncFacts(db, tmpFile)).rejects.toThrow("must have non-empty text");
	});

	test("sync rejects a fact with no sources array and throws a validation error", async () => {
		const db = makeTestDatabase();

		const invalidData = [
			{
				text: "Fact without sources",
			},
		];

		const tmpFile = await makeTempFactsFile(invalidData);

		await expect(syncFacts(db, tmpFile)).rejects.toThrow("must have a sources array");
	});

	test("sync rejects a source with an empty URL and throws a validation error", async () => {
		const db = makeTestDatabase();

		const invalidData = [
			{
				text: "Fact 1",
				sources: [{ url: "", title: "Empty URL" }],
			},
		];

		const tmpFile = await makeTempFactsFile(invalidData);

		await expect(syncFacts(db, tmpFile)).rejects.toThrow("must have non-empty url");
	});

	test("sync rejects duplicate fact texts in seed data with a validation error", async () => {
		const db = makeTestDatabase();

		const duplicateData = [
			{
				text: "Same fact",
				sources: [{ url: "https://example.com/1" }],
			},
			{
				text: "Same fact",
				sources: [{ url: "https://example.com/2" }],
			},
		];

		const tmpFile = await makeTempFactsFile(duplicateData);

		await expect(syncFacts(db, tmpFile)).rejects.toThrow("Duplicate fact text");
	});

	test("transaction rolls back all changes when a validation error occurs mid-sync", async () => {
		const db = makeTestDatabase();

		const partiallyValidData = [
			{
				text: "Valid fact",
				sources: [{ url: "https://example.com/valid" }],
			},
			{
				text: "",
				sources: [{ url: "https://example.com/invalid" }],
			},
		];

		const tmpFile = await makeTempFactsFile(partiallyValidData);

		await expect(syncFacts(db, tmpFile)).rejects.toThrow();

		const facts = db.query("SELECT COUNT(*) as count FROM facts").get() as {
			count: number;
		};
		expect(facts.count).toBe(0);

		const sources = db.query("SELECT COUNT(*) as count FROM fact_sources").get() as {
			count: number;
		};
		expect(sources.count).toBe(0);
	});
});
