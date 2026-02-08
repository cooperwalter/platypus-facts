import { describe, expect, mock, test } from "bun:test";
import { asc, count, eq, isNull } from "drizzle-orm";
import * as os from "node:os";
import * as path from "node:path";
import { facts, factSources } from "../lib/schema";
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

		const factsResult = db
			.select({ id: facts.id, text: facts.text })
			.from(facts)
			.orderBy(asc(facts.id))
			.all();
		expect(factsResult).toHaveLength(2);
		expect(factsResult[0].text).toBe("Fact 1");
		expect(factsResult[1].text).toBe("Fact 2");

		const sources = db
			.select({ fact_id: factSources.fact_id, url: factSources.url, title: factSources.title })
			.from(factSources)
			.orderBy(asc(factSources.fact_id), asc(factSources.url))
			.all();
		expect(sources).toHaveLength(3);
		expect(sources[0]).toEqual({
			fact_id: factsResult[0].id,
			url: "https://example.com/1",
			title: "Source 1",
		});
		expect(sources[1]).toEqual({
			fact_id: factsResult[1].id,
			url: "https://example.com/2a",
			title: "Source 2a",
		});
		expect(sources[2]).toEqual({
			fact_id: factsResult[1].id,
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

		const sources = db
			.select({ url: factSources.url, title: factSources.title })
			.from(factSources)
			.orderBy(asc(factSources.url))
			.all();
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

		const factsResult = db.select({ text: facts.text }).from(facts).orderBy(asc(facts.text)).all();
		expect(factsResult).toHaveLength(2);
		expect(factsResult[0].text).toBe("Fact 1");
		expect(factsResult[1].text).toBe("Fact 2");
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

	test("skips image generation and logs warning when no API key provided", async () => {
		const db = makeTestDatabase();
		const seedData = [{ text: "Fact 1", sources: [{ url: "https://example.com/1" }] }];
		const tmpFile = await makeTempFactsFile(seedData);

		const results = await syncFacts(db, tmpFile);

		expect(results.imagesGenerated).toBe(0);
		expect(results.imagesFailed).toBe(0);

		const fact = db.select({ image_path: facts.image_path }).from(facts).get();
		expect(fact?.image_path).toBeNull();
	});

	test("skips facts that already have image_path during image generation", async () => {
		const db = makeTestDatabase();
		const seedData = [{ text: "Fact 1", sources: [{ url: "https://example.com/1" }] }];
		const tmpFile = await makeTempFactsFile(seedData);

		await syncFacts(db, tmpFile);
		db.update(facts).set({ image_path: "images/facts/1.png" }).where(eq(facts.text, "Fact 1")).run();

		const originalFetch = globalThis.fetch;
		globalThis.fetch = mock(async () => {
			throw new Error("Should not be called");
		}) as unknown as typeof fetch;

		try {
			const results = await syncFacts(db, tmpFile, "sk-test");
			expect(results.imagesGenerated).toBe(0);
			expect(results.imagesFailed).toBe(0);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("generates images for facts with NULL image_path when API key provided", async () => {
		const db = makeTestDatabase();
		const seedData = [{ text: "Fact 1", sources: [{ url: "https://example.com/1" }] }];
		const tmpFile = await makeTempFactsFile(seedData);

		const originalFetch = globalThis.fetch;
		const originalBunWrite = Bun.write;
		globalThis.fetch = mock(
			async () => new Response(JSON.stringify({ data: [{ b64_json: "AQID" }] }), { status: 200 }),
		) as unknown as typeof fetch;
		Bun.write = mock(async () => 0) as typeof Bun.write;

		try {
			const results = await syncFacts(db, tmpFile, "sk-test");
			expect(results.imagesGenerated).toBe(1);
			expect(results.imagesFailed).toBe(0);

			const fact = db.select({ image_path: facts.image_path }).from(facts).get();
			expect(fact?.image_path).toMatch(/^images\/facts\/\d+\.png$/);
		} finally {
			globalThis.fetch = originalFetch;
			Bun.write = originalBunWrite;
		}
	});

	test("continues generating images for other facts when one fails with non-auth error", async () => {
		const db = makeTestDatabase();
		const seedData = [
			{ text: "Fact 1", sources: [{ url: "https://example.com/1" }] },
			{ text: "Fact 2", sources: [{ url: "https://example.com/2" }] },
		];
		const tmpFile = await makeTempFactsFile(seedData);

		const originalFetch = globalThis.fetch;
		const originalBunWrite = Bun.write;
		let callCount = 0;
		globalThis.fetch = mock(async () => {
			callCount++;
			if (callCount === 1) {
				return new Response("Error", { status: 500 });
			}
			return new Response(JSON.stringify({ data: [{ b64_json: "AQID" }] }), { status: 200 });
		}) as unknown as typeof fetch;
		Bun.write = mock(async () => 0) as typeof Bun.write;

		try {
			const results = await syncFacts(db, tmpFile, "sk-test");
			expect(results.imagesGenerated).toBe(1);
			expect(results.imagesFailed).toBe(1);
		} finally {
			globalThis.fetch = originalFetch;
			Bun.write = originalBunWrite;
		}
	});

	test("stops generating images after first auth failure (401) and counts remaining as failed", async () => {
		const db = makeTestDatabase();
		const seedData = [
			{ text: "Fact 1", sources: [{ url: "https://example.com/1" }] },
			{ text: "Fact 2", sources: [{ url: "https://example.com/2" }] },
			{ text: "Fact 3", sources: [{ url: "https://example.com/3" }] },
		];
		const tmpFile = await makeTempFactsFile(seedData);

		const originalFetch = globalThis.fetch;
		let fetchCallCount = 0;
		globalThis.fetch = mock(async () => {
			fetchCallCount++;
			return new Response("Unauthorized", { status: 401 });
		}) as unknown as typeof fetch;

		try {
			const results = await syncFacts(db, tmpFile, "sk-invalid");
			expect(fetchCallCount).toBe(1);
			expect(results.imagesGenerated).toBe(0);
			expect(results.imagesFailed).toBe(3);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("stops generating images after first auth failure (403) and logs a single warning", async () => {
		const db = makeTestDatabase();
		const seedData = [
			{ text: "Fact 1", sources: [{ url: "https://example.com/1" }] },
			{ text: "Fact 2", sources: [{ url: "https://example.com/2" }] },
		];
		const tmpFile = await makeTempFactsFile(seedData);

		const originalFetch = globalThis.fetch;
		let fetchCallCount = 0;
		globalThis.fetch = mock(async () => {
			fetchCallCount++;
			return new Response("Forbidden", { status: 403 });
		}) as unknown as typeof fetch;

		try {
			const results = await syncFacts(db, tmpFile, "sk-expired");
			expect(fetchCallCount).toBe(1);
			expect(results.imagesGenerated).toBe(0);
			expect(results.imagesFailed).toBe(2);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("sync rejects seed data that is not an array", async () => {
		const db = makeTestDatabase();
		const tmpFile = await makeTempFactsFile({ text: "Not an array" });
		await expect(syncFacts(db, tmpFile)).rejects.toThrow("Seed data must be an array");
	});

	test("sync rejects a fact that is not an object", async () => {
		const db = makeTestDatabase();
		const tmpFile = await makeTempFactsFile(["just a string"]);
		await expect(syncFacts(db, tmpFile)).rejects.toThrow("Fact at index 0 must be an object");
	});

	test("sync rejects a fact that is null", async () => {
		const db = makeTestDatabase();
		const tmpFile = await makeTempFactsFile([null]);
		await expect(syncFacts(db, tmpFile)).rejects.toThrow("Fact at index 0 must be an object");
	});

	test("sync rejects a source that is not an object", async () => {
		const db = makeTestDatabase();
		const tmpFile = await makeTempFactsFile([{ text: "Fact 1", sources: ["https://example.com"] }]);
		await expect(syncFacts(db, tmpFile)).rejects.toThrow(
			"Source at index 0 for fact at index 0 must be an object",
		);
	});

	test("sync rejects a source with non-string title type", async () => {
		const db = makeTestDatabase();
		const tmpFile = await makeTempFactsFile([
			{ text: "Fact 1", sources: [{ url: "https://example.com/1", title: 123 }] },
		]);
		await expect(syncFacts(db, tmpFile)).rejects.toThrow(
			"invalid title (must be string if present)",
		);
	});

	test("sync rejects a fact with whitespace-only text", async () => {
		const db = makeTestDatabase();
		const tmpFile = await makeTempFactsFile([
			{ text: "   \n\t  ", sources: [{ url: "https://example.com/1" }] },
		]);
		await expect(syncFacts(db, tmpFile)).rejects.toThrow("must have non-empty text");
	});

	test("sync rejects a source with whitespace-only URL", async () => {
		const db = makeTestDatabase();
		const tmpFile = await makeTempFactsFile([{ text: "Fact 1", sources: [{ url: "   \t  " }] }]);
		await expect(syncFacts(db, tmpFile)).rejects.toThrow("must have non-empty url");
	});

	test("sync rejects a fact with zero sources", async () => {
		const db = makeTestDatabase();
		const tmpFile = await makeTempFactsFile([{ text: "Fact 1", sources: [] }]);
		await expect(syncFacts(db, tmpFile)).rejects.toThrow("must have at least one source");
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

		const factsCount = db.select({ count: count() }).from(facts).get();
		expect(factsCount?.count).toBe(0);

		const sourcesCount = db.select({ count: count() }).from(factSources).get();
		expect(sourcesCount?.count).toBe(0);
	});
});
