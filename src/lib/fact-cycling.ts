import type { Database } from "bun:sqlite";
import {
	getAllFactIds,
	getCurrentCycle,
	getNeverSentFactIds,
	getUnsentFactIdsInCycle,
	recordSentFact,
} from "./facts";

interface SelectedFact {
	factId: number;
	cycle: number;
}

function pickRandom(ids: number[]): number {
	return ids[Math.floor(Math.random() * ids.length)];
}

function selectAndRecordFact(db: Database, sentDate: string): SelectedFact | null {
	const allFactIds = getAllFactIds(db);
	if (allFactIds.length === 0) {
		return null;
	}

	const neverSentIds = getNeverSentFactIds(db);
	if (neverSentIds.length > 0) {
		const factId = pickRandom(neverSentIds);
		const cycle = getCurrentCycle(db);
		recordSentFact(db, factId, sentDate, cycle);
		return { factId, cycle };
	}

	const currentCycle = getCurrentCycle(db);
	const unsentInCycle = getUnsentFactIdsInCycle(db, currentCycle);
	if (unsentInCycle.length > 0) {
		const factId = pickRandom(unsentInCycle);
		recordSentFact(db, factId, sentDate, currentCycle);
		return { factId, cycle: currentCycle };
	}

	const newCycle = currentCycle + 1;
	const factId = pickRandom(allFactIds);
	recordSentFact(db, factId, sentDate, newCycle);
	return { factId, cycle: newCycle };
}

export type { SelectedFact };
export { selectAndRecordFact };
