import { count, desc, eq, isNotNull, isNull, max, notInArray } from "drizzle-orm";
import type { DrizzleDatabase } from "./db";
import { factSources, facts, sentFacts } from "./schema";

export interface Fact {
	id: number;
	text: string;
	image_path: string | null;
	created_at: string;
}

export interface FactSource {
	id: number;
	fact_id: number;
	url: string;
	title: string | null;
}

export function getFactById(db: DrizzleDatabase, id: number): Fact | null {
	return db.select().from(facts).where(eq(facts.id, id)).get() ?? null;
}

export function getFactWithSources(
	db: DrizzleDatabase,
	id: number,
): { fact: Fact; sources: FactSource[] } | null {
	const fact = getFactById(db, id);
	if (!fact) {
		return null;
	}

	const sources = db.select().from(factSources).where(eq(factSources.fact_id, id)).all();

	return { fact, sources };
}

export function getAllFactIds(db: DrizzleDatabase): number[] {
	const rows = db.select({ id: facts.id }).from(facts).all();
	return rows.map((row) => row.id);
}

export function getNeverSentFactIds(db: DrizzleDatabase): number[] {
	const rows = db
		.select({ id: facts.id })
		.from(facts)
		.leftJoin(sentFacts, eq(facts.id, sentFacts.fact_id))
		.where(isNull(sentFacts.fact_id))
		.all();
	return rows.map((row) => row.id);
}

export function getUnsentFactIdsInCycle(db: DrizzleDatabase, cycle: number): number[] {
	const sentInCycle = db
		.select({ fact_id: sentFacts.fact_id })
		.from(sentFacts)
		.where(eq(sentFacts.cycle, cycle));

	const rows = db
		.select({ id: facts.id })
		.from(facts)
		.where(notInArray(facts.id, sentInCycle))
		.all();
	return rows.map((row) => row.id);
}

export function getCurrentCycle(db: DrizzleDatabase): number {
	const row = db
		.select({ maxCycle: max(sentFacts.cycle) })
		.from(sentFacts)
		.get();
	return row?.maxCycle ?? 1;
}

export function recordSentFact(
	db: DrizzleDatabase,
	factId: number,
	sentDate: string,
	cycle: number,
): void {
	db.insert(sentFacts).values({ fact_id: factId, sent_date: sentDate, cycle }).run();
}

export function getMostRecentSentFact(
	db: DrizzleDatabase,
): { fact_id: number; sent_date: string } | null {
	const row = db
		.select({ fact_id: sentFacts.fact_id, sent_date: sentFacts.sent_date })
		.from(sentFacts)
		.orderBy(desc(sentFacts.sent_date))
		.limit(1)
		.get();
	return row ?? null;
}

export function getFactStats(db: DrizzleDatabase): {
	total: number;
	withImages: number;
	currentCycle: number;
	remainingInCycle: number;
} {
	const totalRow = db.select({ count: count() }).from(facts).get();
	const total = totalRow?.count ?? 0;

	const withImagesRow = db
		.select({ count: count() })
		.from(facts)
		.where(isNotNull(facts.image_path))
		.get();
	const withImages = withImagesRow?.count ?? 0;

	const currentCycle = getCurrentCycle(db);
	const unsentInCycle = getUnsentFactIdsInCycle(db, currentCycle);
	const remainingInCycle = unsentInCycle.length;

	return { total, withImages, currentCycle, remainingInCycle };
}

export function getLastSend(db: DrizzleDatabase): { date: string; factId: number } | null {
	const row = db
		.select({ sent_date: sentFacts.sent_date, fact_id: sentFacts.fact_id })
		.from(sentFacts)
		.orderBy(desc(sentFacts.sent_date))
		.limit(1)
		.get();
	if (!row) return null;
	return { date: row.sent_date, factId: row.fact_id };
}

export function getSentFactByDate(
	db: DrizzleDatabase,
	date: string,
): { fact_id: number; cycle: number } | null {
	const row = db
		.select({ fact_id: sentFacts.fact_id, cycle: sentFacts.cycle })
		.from(sentFacts)
		.where(eq(sentFacts.sent_date, date))
		.get();
	return row ?? null;
}
