import { describe, expect, test } from "bun:test";
import { count, eq } from "drizzle-orm";
import {
	makeFactRow,
	makeMockEmailProvider,
	makeSentFactRow,
	makeSubscriberRow,
	makeTestDatabase,
} from "../lib/test-utils";
import { sentFacts } from "../lib/schema";
import { runDailySend } from "./daily-send";

describe("daily-send", () => {
	test("selects fact, sends email to all active subscribers, and records in sent_facts", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();

		makeFactRow(db, {
			text: "Platypuses detect electricity",
			sources: [{ url: "https://example.com/electro" }],
		});
		makeSubscriberRow(db, { email: "a@example.com", status: "active" });
		makeSubscriberRow(db, { email: "b@example.com", status: "active" });
		makeSubscriberRow(db, { email: "c@example.com", status: "pending" });

		const result = await runDailySend(db, email, "https://example.com", "2025-06-15");

		expect(result.alreadySent).toBe(false);
		expect(result.factId).toBeGreaterThan(0);
		expect(result.subscriberCount).toBe(2);
		expect(result.emailSuccess).toBe(2);
		expect(result.emailFail).toBe(0);
		expect(email.sentEmails).toHaveLength(2);
		expect(email.sentEmails[0].htmlBody).toContain("Platypuses detect electricity");
	});

	test("exits without sending when sent_facts already has today's date (idempotency)", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();

		const factId = makeFactRow(db);
		makeSentFactRow(db, { fact_id: factId, sent_date: "2025-06-15", cycle: 1 });
		makeSubscriberRow(db, { email: "a@example.com", status: "active" });

		const result = await runDailySend(db, email, "https://example.com", "2025-06-15");

		expect(result.alreadySent).toBe(true);
		expect(email.sentEmails).toHaveLength(0);
	});

	test("logs warning and exits when no facts exist in the database", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();

		makeSubscriberRow(db, { email: "a@example.com", status: "active" });

		const result = await runDailySend(db, email, "https://example.com", "2025-06-15");

		expect(result.alreadySent).toBe(false);
		expect(result.factId).toBeNull();
		expect(email.sentEmails).toHaveLength(0);
	});

	test("records fact in sent_facts even when no active subscribers exist", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();

		makeFactRow(db, { text: "Platypuses are venomous" });

		const result = await runDailySend(db, email, "https://example.com", "2025-06-15");

		expect(result.alreadySent).toBe(false);
		expect(result.factId).toBeGreaterThan(0);
		expect(result.subscriberCount).toBe(0);
		expect(email.sentEmails).toHaveLength(0);

		const sentFact = db
			.select({ fact_id: sentFacts.fact_id })
			.from(sentFacts)
			.where(eq(sentFacts.sent_date, "2025-06-15"))
			.get();
		expect(sentFact).not.toBeNull();
	});

	test("continues sending to other subscribers when individual email fails", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();

		makeFactRow(db, { text: "Platypuses have webbed feet" });
		makeSubscriberRow(db, { email: "a@example.com", status: "active" });
		makeSubscriberRow(db, { email: "b@example.com", status: "active" });
		makeSubscriberRow(db, { email: "c@example.com", status: "active" });

		let callCount = 0;
		email.sendEmail = async (
			to: string,
			subject: string,
			htmlBody: string,
			plainBody?: string,
			headers?: Record<string, string>,
		) => {
			callCount++;
			if (callCount === 2) {
				throw new Error("Email delivery failed");
			}
			email.sentEmails.push({ to, subject, htmlBody, plainBody, headers });
		};

		const result = await runDailySend(db, email, "https://example.com", "2025-06-15");

		expect(result.subscriberCount).toBe(3);
		expect(result.emailSuccess).toBe(2);
		expect(result.emailFail).toBe(1);
	});

	test("records fact in sent_facts even with partial delivery failures", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();

		makeFactRow(db, { text: "Platypuses lay eggs" });
		makeSubscriberRow(db, { email: "a@example.com", status: "active" });

		email.sendEmail = async () => {
			throw new Error("All deliveries failed");
		};

		const result = await runDailySend(db, email, "https://example.com", "2025-06-15");

		expect(result.emailFail).toBe(1);
		expect(result.emailSuccess).toBe(0);

		const sentFact = db
			.select({ fact_id: sentFacts.fact_id })
			.from(sentFacts)
			.where(eq(sentFacts.sent_date, "2025-06-15"))
			.get();
		expect(sentFact).not.toBeNull();
	});

	test("email includes unsubscribe URL and List-Unsubscribe headers", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();

		makeFactRow(db, { text: "Platypuses glow under UV light" });
		makeSubscriberRow(db, {
			email: "fan@example.com",
			token: "test-token-uuid-1234-567890abcdef",
			status: "active",
		});

		await runDailySend(db, email, "https://example.com", "2025-06-15");

		expect(email.sentEmails).toHaveLength(1);
		const sent = email.sentEmails[0];
		expect(sent.headers?.["List-Unsubscribe"]).toContain("test-token-uuid-1234-567890abcdef");
		expect(sent.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
		expect(sent.htmlBody).toContain("test-token-uuid-1234-567890abcdef");
	});

	test("per-channel counts are zero for early-exit scenarios", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();
		const factId = makeFactRow(db);
		makeSentFactRow(db, { fact_id: factId, sent_date: "2025-06-15", cycle: 1 });

		const result = await runDailySend(db, email, "https://example.com", "2025-06-15");

		expect(result.emailSuccess).toBe(0);
		expect(result.emailFail).toBe(0);
	});

	test("handles concurrent duplicate daily-send gracefully via sent_date UNIQUE constraint", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();

		const factId = makeFactRow(db, { text: "Race condition fact" });
		makeSubscriberRow(db, { email: "a@example.com", status: "active" });

		db.insert(sentFacts).values({ fact_id: factId, sent_date: "2025-06-15", cycle: 1 }).run();

		const result = await runDailySend(db, email, "https://example.com", "2025-06-15");

		expect(result.alreadySent).toBe(true);
		expect(result.factId).toBe(factId);
		expect(email.sentEmails).toHaveLength(0);
	});

	test("uses UTC today date when no override provided", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();
		const expectedDate = new Date().toISOString().split("T")[0];

		makeFactRow(db, { text: "Test fact for date check" });
		makeSubscriberRow(db, { email: "a@example.com", status: "active" });

		await runDailySend(db, email, "https://example.com");

		const sentFact = db.select({ sent_date: sentFacts.sent_date }).from(sentFacts).get();
		expect(sentFact?.sent_date).toBe(expectedDate);
	});

	test("force mode re-sends to all subscribers even when fact already sent today", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();

		const factId = makeFactRow(db, { text: "Force re-send fact" });
		makeSentFactRow(db, { fact_id: factId, sent_date: "2025-06-15", cycle: 1 });
		makeSubscriberRow(db, { email: "a@example.com", status: "active" });

		const result = await runDailySend(db, email, "https://example.com", "2025-06-15", true);

		expect(result.alreadySent).toBe(false);
		expect(result.factId).toBe(factId);
		expect(result.emailSuccess).toBe(1);
		expect(email.sentEmails).toHaveLength(1);
		expect(email.sentEmails[0].htmlBody).toContain("Force re-send fact");
	});

	test("force mode does not create duplicate sent_facts entry", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();

		const factId = makeFactRow(db, { text: "No duplicate fact" });
		makeSentFactRow(db, { fact_id: factId, sent_date: "2025-06-15", cycle: 1 });
		makeSubscriberRow(db, { email: "a@example.com", status: "active" });

		await runDailySend(db, email, "https://example.com", "2025-06-15", true);

		const result = db
			.select({ count: count() })
			.from(sentFacts)
			.where(eq(sentFacts.sent_date, "2025-06-15"))
			.get();
		expect(result?.count).toBe(1);
	});

	test("force mode works normally when no fact has been sent today yet", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();

		makeFactRow(db, { text: "First send with force" });
		makeSubscriberRow(db, { email: "a@example.com", status: "active" });

		const result = await runDailySend(db, email, "https://example.com", "2025-06-15", true);

		expect(result.alreadySent).toBe(false);
		expect(result.factId).toBeGreaterThan(0);
		expect(result.emailSuccess).toBe(1);

		const countResult = db
			.select({ count: count() })
			.from(sentFacts)
			.where(eq(sentFacts.sent_date, "2025-06-15"))
			.get();
		expect(countResult?.count).toBe(1);
	});

	test("without force flag, skips when fact already sent today", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();

		const factId = makeFactRow(db, { text: "Already sent" });
		makeSentFactRow(db, { fact_id: factId, sent_date: "2025-06-15", cycle: 1 });
		makeSubscriberRow(db, { email: "a@example.com", status: "active" });

		const result = await runDailySend(db, email, "https://example.com", "2025-06-15", false);

		expect(result.alreadySent).toBe(true);
		expect(email.sentEmails).toHaveLength(0);
	});
});
