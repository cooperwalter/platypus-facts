import type { Database } from "bun:sqlite";

export interface Fact {
	id: number;
	text: string;
	created_at: string;
}

export interface FactSource {
	id: number;
	fact_id: number;
	url: string;
	title: string | null;
}

export function getFactById(db: Database, id: number): Fact | null {
	const row = db.prepare("SELECT id, text, created_at FROM facts WHERE id = ?").get(id);
	return row ? (row as Fact) : null;
}

export function getFactWithSources(
	db: Database,
	id: number,
): { fact: Fact; sources: FactSource[] } | null {
	const fact = getFactById(db, id);
	if (!fact) {
		return null;
	}

	const sources = db
		.prepare("SELECT id, fact_id, url, title FROM fact_sources WHERE fact_id = ?")
		.all(id) as FactSource[];

	return { fact, sources };
}

export function getAllFactIds(db: Database): number[] {
	const rows = db.prepare("SELECT id FROM facts").all() as Array<{ id: number }>;
	return rows.map((row) => row.id);
}

export function getNeverSentFactIds(db: Database): number[] {
	const rows = db
		.prepare(
			`SELECT f.id
			FROM facts f
			LEFT JOIN sent_facts sf ON f.id = sf.fact_id
			WHERE sf.fact_id IS NULL`,
		)
		.all() as Array<{ id: number }>;
	return rows.map((row) => row.id);
}

export function getUnsentFactIdsInCycle(db: Database, cycle: number): number[] {
	const rows = db
		.prepare(
			`SELECT f.id
			FROM facts f
			WHERE f.id NOT IN (
				SELECT fact_id
				FROM sent_facts
				WHERE cycle = ?
			)`,
		)
		.all(cycle) as Array<{ id: number }>;
	return rows.map((row) => row.id);
}

export function getCurrentCycle(db: Database): number {
	const row = db.prepare("SELECT MAX(cycle) as max_cycle FROM sent_facts").get() as {
		max_cycle: number | null;
	};
	return row.max_cycle ?? 1;
}

export function recordSentFact(
	db: Database,
	factId: number,
	sentDate: string,
	cycle: number,
): void {
	db.prepare("INSERT INTO sent_facts (fact_id, sent_date, cycle) VALUES (?, ?, ?)").run(
		factId,
		sentDate,
		cycle,
	);
}

export function getSentFactByDate(
	db: Database,
	date: string,
): { fact_id: number; cycle: number } | null {
	const row = db.prepare("SELECT fact_id, cycle FROM sent_facts WHERE sent_date = ?").get(date);
	return row ? (row as { fact_id: number; cycle: number }) : null;
}
