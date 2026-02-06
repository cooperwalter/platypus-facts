import type { Database } from "bun:sqlite";
import * as path from "node:path";
import { createDatabase } from "../lib/db";

interface SeedSource {
	url: string;
	title?: string;
}

interface SeedFact {
	text: string;
	sources: SeedSource[];
}

function validateSeedData(facts: unknown): asserts facts is SeedFact[] {
	if (!Array.isArray(facts)) {
		throw new Error("Seed data must be an array");
	}

	for (let i = 0; i < facts.length; i++) {
		const fact = facts[i];

		if (typeof fact !== "object" || fact === null) {
			throw new Error(`Fact at index ${i} must be an object`);
		}

		if (!("text" in fact) || typeof fact.text !== "string" || fact.text.trim() === "") {
			throw new Error(`Fact at index ${i} must have non-empty text`);
		}

		if (!("sources" in fact) || !Array.isArray(fact.sources)) {
			throw new Error(`Fact at index ${i} must have a sources array`);
		}

		if (fact.sources.length === 0) {
			throw new Error(`Fact at index ${i} must have at least one source`);
		}

		for (let j = 0; j < fact.sources.length; j++) {
			const source = fact.sources[j];

			if (typeof source !== "object" || source === null) {
				throw new Error(`Source at index ${j} for fact at index ${i} must be an object`);
			}

			if (!("url" in source) || typeof source.url !== "string" || source.url.trim() === "") {
				throw new Error(`Source at index ${j} for fact at index ${i} must have non-empty url`);
			}

			if ("title" in source && typeof source.title !== "string") {
				throw new Error(
					`Source at index ${j} for fact at index ${i} has invalid title (must be string if present)`,
				);
			}
		}
	}

	const seenTexts = new Map<string, number>();
	for (let i = 0; i < facts.length; i++) {
		const text = (facts[i] as SeedFact).text;
		if (seenTexts.has(text)) {
			throw new Error(
				`Duplicate fact text at index ${i} (first seen at index ${seenTexts.get(text)}): "${text}"`,
			);
		}
		seenTexts.set(text, i);
	}
}

export async function syncFacts(
	db: Database,
	factsFilePath?: string,
): Promise<{ added: number; updated: number; unchanged: number }> {
	const filePath = factsFilePath || path.join(process.cwd(), "data", "facts.json");

	const fileContent = await Bun.file(filePath).text();
	const parsedData: unknown = JSON.parse(fileContent);

	validateSeedData(parsedData);

	const results = { added: 0, updated: 0, unchanged: 0 };

	db.run("BEGIN TRANSACTION");

	try {
		const getFactByText = db.query<{ id: number }, [string]>("SELECT id FROM facts WHERE text = ?");

		const insertFact = db.query<{ id: number }, [string]>(
			"INSERT INTO facts (text) VALUES (?) RETURNING id",
		);

		const getSourcesForFact = db.query<{ url: string; title: string | null }, [number]>(
			"SELECT url, title FROM fact_sources WHERE fact_id = ?",
		);

		const deleteSourcesForFact = db.query<unknown, [number]>(
			"DELETE FROM fact_sources WHERE fact_id = ?",
		);

		const insertSource = db.query<unknown, [number, string, string | null]>(
			"INSERT INTO fact_sources (fact_id, url, title) VALUES (?, ?, ?)",
		);

		for (const seedFact of parsedData) {
			const existingFact = getFactByText.get(seedFact.text);

			if (existingFact) {
				const existingSources = getSourcesForFact.all(existingFact.id);

				const normalizeSource = (s: { url: string; title: string | null }) =>
					`${s.url}|${s.title ?? ""}`;
				const existingSet = new Set(existingSources.map(normalizeSource));
				const seedSet = new Set(
					seedFact.sources.map((s) => normalizeSource({ url: s.url, title: s.title ?? null })),
				);
				const sourcesChanged =
					existingSet.size !== seedSet.size || [...seedSet].some((s) => !existingSet.has(s));

				if (sourcesChanged) {
					deleteSourcesForFact.run(existingFact.id);
					for (const source of seedFact.sources) {
						insertSource.run(existingFact.id, source.url, source.title || null);
					}
					results.updated++;
				} else {
					results.unchanged++;
				}
			} else {
				const result = insertFact.get(seedFact.text);
				if (!result) {
					throw new Error("Failed to insert fact");
				}

				for (const source of seedFact.sources) {
					insertSource.run(result.id, source.url, source.title || null);
				}
				results.added++;
			}
		}

		db.run("COMMIT");
	} catch (error) {
		db.run("ROLLBACK");
		throw error;
	}

	return results;
}

if (import.meta.main) {
	const databasePath = process.env.DATABASE_PATH || "./data/platypus-facts.db";
	const db = createDatabase(databasePath);

	const results = await syncFacts(db);

	console.log("Sync complete:");
	console.log(`  Facts added: ${results.added}`);
	console.log(`  Facts updated: ${results.updated}`);
	console.log(`  Facts unchanged: ${results.unchanged}`);

	db.close();
}
