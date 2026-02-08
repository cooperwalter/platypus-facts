import { count, eq, isNull } from "drizzle-orm";
import * as path from "node:path";
import { createDatabase } from "../lib/db";
import type { DrizzleDatabase } from "../lib/db";
import { ImageAuthError, generateFactImage } from "../lib/image-generation";
import { factSources, facts } from "../lib/schema";

interface SeedSource {
	url: string;
	title?: string;
}

interface SeedFact {
	text: string;
	sources: SeedSource[];
}

function validateSeedData(factsData: unknown): asserts factsData is SeedFact[] {
	if (!Array.isArray(factsData)) {
		throw new Error("Seed data must be an array");
	}

	for (let i = 0; i < factsData.length; i++) {
		const fact = factsData[i];

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
	for (let i = 0; i < factsData.length; i++) {
		const text = (factsData[i] as SeedFact).text;
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
	db: DrizzleDatabase,
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

	db.transaction((tx) => {
		for (const seedFact of parsedData) {
			const existingFact = tx
				.select({ id: facts.id })
				.from(facts)
				.where(eq(facts.text, seedFact.text))
				.get();

			if (existingFact) {
				const existingSources = tx
					.select({ url: factSources.url, title: factSources.title })
					.from(factSources)
					.where(eq(factSources.fact_id, existingFact.id))
					.all();

				const normalizeSource = (s: { url: string; title: string | null }) =>
					`${s.url}|${s.title ?? ""}`;
				const existingSet = new Set(existingSources.map(normalizeSource));
				const seedSet = new Set(
					seedFact.sources.map((s: SeedSource) =>
						normalizeSource({ url: s.url, title: s.title ?? null }),
					),
				);
				const sourcesChanged =
					existingSet.size !== seedSet.size || [...seedSet].some((s) => !existingSet.has(s));

				if (sourcesChanged) {
					tx.delete(factSources).where(eq(factSources.fact_id, existingFact.id)).run();
					for (const source of seedFact.sources) {
						tx.insert(factSources)
							.values({
								fact_id: existingFact.id,
								url: source.url,
								title: source.title || null,
							})
							.run();
					}
					results.updated++;
				} else {
					results.unchanged++;
				}
			} else {
				const inserted = tx
					.insert(facts)
					.values({ text: seedFact.text })
					.returning({ id: facts.id })
					.get();

				for (const source of seedFact.sources) {
					tx.insert(factSources)
						.values({
							fact_id: inserted.id,
							url: source.url,
							title: source.title || null,
						})
						.run();
				}
				results.added++;
			}
		}
	});

	if (openaiApiKey) {
		const factsWithoutImages = db
			.select({ id: facts.id })
			.from(facts)
			.where(isNull(facts.image_path))
			.all();

		for (const fact of factsWithoutImages) {
			try {
				const imagePath = await generateFactImage(fact.id, openaiApiKey);
				if (imagePath) {
					db.update(facts)
						.set({ image_path: imagePath })
						.where(eq(facts.id, fact.id))
						.run();
					results.imagesGenerated++;
				} else {
					results.imagesFailed++;
				}
			} catch (error) {
				if (error instanceof ImageAuthError) {
					console.warn(`Skipping image generation: API key is invalid — ${error.message}`);
					results.imagesFailed +=
						factsWithoutImages.length - results.imagesGenerated - results.imagesFailed;
					break;
				}
				console.error(
					`Image generation failed for fact ${fact.id}:`,
					error instanceof Error ? error.message : error,
				);
				results.imagesFailed++;
			}
		}
	} else if (openaiApiKey === undefined || openaiApiKey === null) {
		const row = db
			.select({ count: count() })
			.from(facts)
			.where(isNull(facts.image_path))
			.get();
		const missingCount = row?.count ?? 0;
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
	const { db, sqlite } = createDatabase(databasePath);

	const results = await syncFacts(db, undefined, openaiApiKey);

	console.log("Sync complete:");
	console.log(`  Facts added: ${results.added}`);
	console.log(`  Facts updated: ${results.updated}`);
	console.log(`  Facts unchanged: ${results.unchanged}`);
	console.log(`  Images generated: ${results.imagesGenerated}`);
	console.log(`  Images failed: ${results.imagesFailed}`);

	sqlite.close();
}
