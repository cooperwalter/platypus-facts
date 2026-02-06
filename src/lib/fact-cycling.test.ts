import { describe, expect, test } from "bun:test";
import { selectAndRecordFact } from "./fact-cycling";
import { getCurrentCycle, getSentFactByDate } from "./facts";
import { makeFactRow, makeSentFactRow, makeTestDatabase } from "./test-utils";

describe("fact-cycling", () => {
	test("returns null when there are no facts in the database", () => {
		const db = makeTestDatabase();
		const result = selectAndRecordFact(db, "2025-01-01");
		expect(result).toBeNull();
	});

	test("selects from all facts and records as cycle 1 on first ever send", () => {
		const db = makeTestDatabase();
		const factId = makeFactRow(db, { text: "Only fact" });
		const result = selectAndRecordFact(db, "2025-01-01");
		expect(result).not.toBeNull();
		expect(result?.factId).toBe(factId);
		expect(result?.cycle).toBe(1);

		const recorded = getSentFactByDate(db, "2025-01-01");
		expect(recorded).not.toBeNull();
		expect(recorded?.fact_id).toBe(factId);
		expect(recorded?.cycle).toBe(1);
	});

	test("prioritizes never-sent facts over current-cycle unsent facts", () => {
		const db = makeTestDatabase();
		const sentFactId = makeFactRow(db, { text: "Already sent" });
		const neverSentFactId = makeFactRow(db, { text: "Never sent" });
		makeSentFactRow(db, { fact_id: sentFactId, sent_date: "2025-01-01", cycle: 1 });

		const result = selectAndRecordFact(db, "2025-01-02");
		expect(result).not.toBeNull();
		expect(result?.factId).toBe(neverSentFactId);
		expect(result?.cycle).toBe(1);
	});

	test("selects from unsent-in-current-cycle when all facts have been sent at least once", () => {
		const db = makeTestDatabase();
		const fact1 = makeFactRow(db, { text: "Fact one" });
		const fact2 = makeFactRow(db, { text: "Fact two" });
		const fact3 = makeFactRow(db, { text: "Fact three" });

		makeSentFactRow(db, { fact_id: fact1, sent_date: "2025-01-01", cycle: 1 });
		makeSentFactRow(db, { fact_id: fact2, sent_date: "2025-01-02", cycle: 1 });

		const result = selectAndRecordFact(db, "2025-01-03");
		expect(result).not.toBeNull();
		expect(result?.factId).toBe(fact3);
		expect(result?.cycle).toBe(1);
	});

	test("starts a new cycle when all facts have been sent in the current cycle", () => {
		const db = makeTestDatabase();
		const fact1 = makeFactRow(db, { text: "Fact one" });
		const fact2 = makeFactRow(db, { text: "Fact two" });

		makeSentFactRow(db, { fact_id: fact1, sent_date: "2025-01-01", cycle: 1 });
		makeSentFactRow(db, { fact_id: fact2, sent_date: "2025-01-02", cycle: 1 });

		const result = selectAndRecordFact(db, "2025-01-03");
		if (!result) throw new Error("Expected result");
		expect(result.cycle).toBe(2);
		expect([fact1, fact2]).toContain(result.factId);
	});

	test("new fact added mid-cycle is selected before continuing current cycle", () => {
		const db = makeTestDatabase();
		const fact1 = makeFactRow(db, { text: "Fact one" });
		const fact2 = makeFactRow(db, { text: "Fact two" });

		makeSentFactRow(db, { fact_id: fact1, sent_date: "2025-01-01", cycle: 2 });
		makeSentFactRow(db, { fact_id: fact2, sent_date: "2025-01-02", cycle: 2 });

		const newFact = makeFactRow(db, { text: "Brand new fact" });

		const result = selectAndRecordFact(db, "2025-01-03");
		expect(result).not.toBeNull();
		expect(result?.factId).toBe(newFact);
		expect(result?.cycle).toBe(2);
	});

	test("single fact is selected every time, creating a new cycle each day", () => {
		const db = makeTestDatabase();
		const factId = makeFactRow(db, { text: "Only one fact" });

		const result1 = selectAndRecordFact(db, "2025-01-01");
		expect(result1).not.toBeNull();
		expect(result1?.factId).toBe(factId);
		expect(result1?.cycle).toBe(1);

		const result2 = selectAndRecordFact(db, "2025-01-02");
		expect(result2).not.toBeNull();
		expect(result2?.factId).toBe(factId);
		expect(result2?.cycle).toBe(2);
	});

	test("selects randomly when multiple facts are eligible", () => {
		const db = makeTestDatabase();
		const facts: number[] = [];
		for (let i = 0; i < 20; i++) {
			facts.push(makeFactRow(db, { text: `Fact ${i}` }));
		}

		const selected = new Set<number>();
		for (let day = 0; day < 20; day++) {
			const result = selectAndRecordFact(db, `2025-01-${String(day + 1).padStart(2, "0")}`);
			if (!result) throw new Error("Expected result");
			selected.add(result.factId);
		}

		expect(selected.size).toBeGreaterThan(1);
	});

	test("records sent fact with correct date and cycle", () => {
		const db = makeTestDatabase();
		makeFactRow(db, { text: "Test fact" });

		const result = selectAndRecordFact(db, "2025-06-15");
		expect(result).not.toBeNull();

		const recorded = getSentFactByDate(db, "2025-06-15");
		expect(recorded).not.toBeNull();
		expect(recorded?.fact_id).toBe(result?.factId);
		expect(recorded?.cycle).toBe(result?.cycle);
	});

	test("getCurrentCycle reflects the cycle number after new cycle starts", () => {
		const db = makeTestDatabase();
		const fact1 = makeFactRow(db, { text: "Fact A" });

		makeSentFactRow(db, { fact_id: fact1, sent_date: "2025-01-01", cycle: 1 });
		expect(getCurrentCycle(db)).toBe(1);

		selectAndRecordFact(db, "2025-01-02");
		expect(getCurrentCycle(db)).toBe(2);
	});
});
