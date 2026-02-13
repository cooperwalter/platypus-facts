import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import {
	getAllFactIds,
	getCurrentCycle,
	getFactById,
	getFactWithSources,
	getMostRecentSentFact,
	getNeverSentFactIds,
	getSentFactByDate,
	getUnsentFactIdsInCycle,
	recordSentFact,
} from "./facts";
import { sentFacts } from "./schema";
import { makeFactRow, makeSentFactRow, makeTestDatabase } from "./test-utils";

describe("getFactById", () => {
	test("returns the fact when it exists in the database", () => {
		const db = makeTestDatabase();
		const factId = makeFactRow(db, { text: "Platypuses have venomous spurs" });

		const result = getFactById(db, factId);

		expect(result).toBeDefined();
		expect(result?.id).toBe(factId);
		expect(result?.text).toBe("Platypuses have venomous spurs");
		expect(result?.image_path).toBeNull();
		expect(result?.created_at).toBeDefined();
	});

	test("returns image_path when fact has an associated image", () => {
		const db = makeTestDatabase();
		const factId = makeFactRow(db, {
			text: "Platypuses glow under UV light",
			image_path: "images/facts/1.png",
		});

		const result = getFactById(db, factId);

		expect(result?.image_path).toBe("images/facts/1.png");
	});

	test("returns null when the fact ID does not exist", () => {
		const db = makeTestDatabase();

		const result = getFactById(db, 999);

		expect(result).toBeNull();
	});
});

describe("getFactWithSources", () => {
	test("returns the fact with all its associated sources", () => {
		const db = makeTestDatabase();
		const factId = makeFactRow(db, {
			text: "Platypuses are monotremes",
			sources: [
				{ url: "https://example.com/source1", title: "Source 1" },
				{ url: "https://example.com/source2", title: "Source 2" },
				{ url: "https://example.com/source3" },
			],
		});

		const result = getFactWithSources(db, factId);

		expect(result).toBeDefined();
		expect(result?.fact.id).toBe(factId);
		expect(result?.fact.text).toBe("Platypuses are monotremes");
		expect(result?.fact.image_path).toBeNull();
		expect(result?.sources).toHaveLength(3);
		expect(result?.sources[0].url).toBe("https://example.com/source1");
		expect(result?.sources[0].title).toBe("Source 1");
		expect(result?.sources[1].url).toBe("https://example.com/source2");
		expect(result?.sources[1].title).toBe("Source 2");
		expect(result?.sources[2].url).toBe("https://example.com/source3");
		expect(result?.sources[2].title).toBeNull();
	});

	test("returns null when the fact ID does not exist", () => {
		const db = makeTestDatabase();

		const result = getFactWithSources(db, 999);

		expect(result).toBeNull();
	});
});

describe("getAllFactIds", () => {
	test("returns all fact IDs in the database", () => {
		const db = makeTestDatabase();
		const factId1 = makeFactRow(db, { text: "Fact 1" });
		const factId2 = makeFactRow(db, { text: "Fact 2" });
		const factId3 = makeFactRow(db, { text: "Fact 3" });

		const result = getAllFactIds(db);

		expect(result).toHaveLength(3);
		expect(result).toContain(factId1);
		expect(result).toContain(factId2);
		expect(result).toContain(factId3);
	});
});

describe("getNeverSentFactIds", () => {
	test("returns only fact IDs that have never been recorded in sent_facts", () => {
		const db = makeTestDatabase();
		const factId1 = makeFactRow(db, { text: "Never sent fact" });
		const factId2 = makeFactRow(db, { text: "Sent fact" });
		const factId3 = makeFactRow(db, { text: "Another never sent fact" });

		makeSentFactRow(db, { fact_id: factId2, sent_date: "2025-01-01", cycle: 1 });

		const result = getNeverSentFactIds(db);

		expect(result).toHaveLength(2);
		expect(result).toContain(factId1);
		expect(result).toContain(factId3);
		expect(result).not.toContain(factId2);
	});
});

describe("getUnsentFactIdsInCycle", () => {
	test("returns only fact IDs not sent in the specified cycle number", () => {
		const db = makeTestDatabase();
		const factId1 = makeFactRow(db, { text: "Fact 1" });
		const factId2 = makeFactRow(db, { text: "Fact 2" });
		const factId3 = makeFactRow(db, { text: "Fact 3" });

		makeSentFactRow(db, { fact_id: factId1, sent_date: "2025-01-01", cycle: 1 });
		makeSentFactRow(db, { fact_id: factId2, sent_date: "2025-01-02", cycle: 2 });

		const resultCycle1 = getUnsentFactIdsInCycle(db, 1);

		expect(resultCycle1).toHaveLength(2);
		expect(resultCycle1).toContain(factId2);
		expect(resultCycle1).toContain(factId3);
		expect(resultCycle1).not.toContain(factId1);

		const resultCycle2 = getUnsentFactIdsInCycle(db, 2);

		expect(resultCycle2).toHaveLength(2);
		expect(resultCycle2).toContain(factId1);
		expect(resultCycle2).toContain(factId3);
		expect(resultCycle2).not.toContain(factId2);
	});
});

describe("getCurrentCycle", () => {
	test("returns 1 when the sent_facts table is empty", () => {
		const db = makeTestDatabase();

		const result = getCurrentCycle(db);

		expect(result).toBe(1);
	});

	test("returns the maximum cycle number from sent_facts entries", () => {
		const db = makeTestDatabase();
		const factId1 = makeFactRow(db, { text: "Fact 1" });
		const factId2 = makeFactRow(db, { text: "Fact 2" });
		const factId3 = makeFactRow(db, { text: "Fact 3" });

		makeSentFactRow(db, { fact_id: factId1, sent_date: "2025-01-01", cycle: 1 });
		makeSentFactRow(db, { fact_id: factId2, sent_date: "2025-01-02", cycle: 3 });
		makeSentFactRow(db, { fact_id: factId3, sent_date: "2025-01-03", cycle: 2 });

		const result = getCurrentCycle(db);

		expect(result).toBe(3);
	});
});

describe("recordSentFact", () => {
	test("inserts a new row into the sent_facts table with correct fact_id, sent_date, and cycle", () => {
		const db = makeTestDatabase();
		const factId = makeFactRow(db, { text: "Test fact" });

		recordSentFact(db, factId, "2025-01-15", 2);

		const row = db
			.select({
				fact_id: sentFacts.fact_id,
				sent_date: sentFacts.sent_date,
				cycle: sentFacts.cycle,
			})
			.from(sentFacts)
			.where(eq(sentFacts.fact_id, factId))
			.get();
		expect(row).toBeDefined();
		expect(row?.fact_id).toBe(factId);
		expect(row?.sent_date).toBe("2025-01-15");
		expect(row?.cycle).toBe(2);
	});
});

describe("getSentFactByDate", () => {
	test("returns the sent fact record when the date exists in sent_facts", () => {
		const db = makeTestDatabase();
		const factId = makeFactRow(db, { text: "Test fact" });
		makeSentFactRow(db, { fact_id: factId, sent_date: "2025-01-20", cycle: 3 });

		const result = getSentFactByDate(db, "2025-01-20");

		expect(result).toBeDefined();
		expect(result?.fact_id).toBe(factId);
		expect(result?.cycle).toBe(3);
	});

	test("returns null when the date does not exist in sent_facts", () => {
		const db = makeTestDatabase();

		const result = getSentFactByDate(db, "2025-01-20");

		expect(result).toBeNull();
	});
});

describe("getMostRecentSentFact", () => {
	test("returns the most recently sent fact by sent_date", () => {
		const db = makeTestDatabase();
		const factId1 = makeFactRow(db, { text: "Older fact" });
		const factId2 = makeFactRow(db, { text: "Newer fact" });
		makeSentFactRow(db, { fact_id: factId1, sent_date: "2025-01-15", cycle: 1 });
		makeSentFactRow(db, { fact_id: factId2, sent_date: "2025-01-20", cycle: 1 });

		const result = getMostRecentSentFact(db);

		expect(result).not.toBeNull();
		expect(result?.fact_id).toBe(factId2);
		expect(result?.sent_date).toBe("2025-01-20");
	});

	test("returns null when no facts have been sent", () => {
		const db = makeTestDatabase();

		const result = getMostRecentSentFact(db);

		expect(result).toBeNull();
	});

	test("returns the single sent fact when only one exists", () => {
		const db = makeTestDatabase();
		const factId = makeFactRow(db, { text: "Only fact" });
		makeSentFactRow(db, { fact_id: factId, sent_date: "2025-03-01", cycle: 1 });

		const result = getMostRecentSentFact(db);

		expect(result).not.toBeNull();
		expect(result?.fact_id).toBe(factId);
		expect(result?.sent_date).toBe("2025-03-01");
	});
});
