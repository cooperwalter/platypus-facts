import type { Database } from "bun:sqlite";
import * as path from "node:path";
import { createDatabase } from "../lib/db";
import { generateFactImage } from "../lib/image-generation";

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

interface SyncResult {
	added: number;
	updated: number;
	unchanged: number;
	imagesGenerated: number;
	imagesFailed: number;
}

export async function syncFacts(
	db: Database,
	factsFilePath?: string,
	openaiApiKey?: string | null,
): Promise<SyncResult> {
	const filePath = factsFilePath || path.join(process.cwd(), "data", "facts.json");

	const fileContent = await Bun.file(filePath).text();
	const parsedData: unknown = JSON.parse(fileContent);

	validateSeedData(parsedData);

	const results: SyncResult = {
		added: 0,
		updated: 0,
		unchanged: 0,
		imagesGenerated: 0,
		imagesFailed: 0,
	};

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

	if (openaiApiKey) {
		const factsWithoutImages = db
			.query<{ id: number; text: string }, []>(
				"SELECT id, text FROM facts WHERE image_path IS NULL",
			)
			.all();

		for (const fact of factsWithoutImages) {
			try {
				const imagePath = await generateFactImage(fact.id, fact.text, openaiApiKey);
				if (imagePath) {
					db.prepare("UPDATE facts SET image_path = ? WHERE id = ?").run(imagePath, fact.id);
					results.imagesGenerated++;
				} else {
					results.imagesFailed++;
				}
			} catch (error) {
				console.error(
					`Image generation failed for fact ${fact.id}:`,
					error instanceof Error ? error.message : error,
				);
				results.imagesFailed++;
			}
		}
	} else if (openaiApiKey === undefined || openaiApiKey === null) {
		const missingCount = (
			db
				.query<{ count: number }, []>(
					"SELECT COUNT(*) as count FROM facts WHERE image_path IS NULL",
				)
				.get() ?? { count: 0 }
		).count;
		if (missingCount > 0) {
			console.warn(
				`Skipping image generation: no OPENAI_API_KEY provided (${missingCount} facts without images)`,
			);
		}
	}

	return results;
}

if (import.meta.main) {
	const databasePath = process.env.DATABASE_PATH || "./data/platypus-facts.db";
	const openaiApiKey = process.env.OPENAI_API_KEY ?? null;
	const db = createDatabase(databasePath);

	const results = await syncFacts(db, undefined, openaiApiKey);

	console.log("Sync complete:");
	console.log(`  Facts added: ${results.added}`);
	console.log(`  Facts updated: ${results.updated}`);
	console.log(`  Facts unchanged: ${results.unchanged}`);
	console.log(`  Images generated: ${results.imagesGenerated}`);
	console.log(`  Images failed: ${results.imagesFailed}`);

	db.close();
}
