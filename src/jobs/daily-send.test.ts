import { describe, expect, test } from "bun:test";
import {
	makeFactRow,
	makeMockEmailProvider,
	makeMockSmsProvider,
	makeSentFactRow,
	makeSubscriberRow,
	makeTestDatabase,
} from "../lib/test-utils";
import { runDailySend } from "./daily-send";

describe("daily-send", () => {
	test("selects fact, sends SMS to all active subscribers, and records in sent_facts", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();

		makeFactRow(db, {
			text: "Platypuses detect electricity",
			sources: [{ url: "https://example.com/electro" }],
		});
		makeSubscriberRow(db, { phone_number: "+15552345678", status: "active" });
		makeSubscriberRow(db, { phone_number: "+15553456789", status: "active" });
		makeSubscriberRow(db, { phone_number: "+15554567890", status: "pending" });

		const result = await runDailySend(db, sms, "https://example.com", "2025-06-15");

		expect(result.alreadySent).toBe(false);
		expect(result.factId).toBeGreaterThan(0);
		expect(result.subscriberCount).toBe(2);
		expect(result.successCount).toBe(2);
		expect(result.failureCount).toBe(0);
		expect(sms.sentMessages).toHaveLength(2);
		expect(sms.sentMessages[0].body).toContain("Platypuses detect electricity");
		expect(sms.sentMessages[0].body).toContain("https://example.com/facts/");
	});

	test("exits without sending when sent_facts already has today's date (idempotency)", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();

		const factId = makeFactRow(db);
		makeSentFactRow(db, { fact_id: factId, sent_date: "2025-06-15", cycle: 1 });
		makeSubscriberRow(db, { phone_number: "+15552345678", status: "active" });

		const result = await runDailySend(db, sms, "https://example.com", "2025-06-15");

		expect(result.alreadySent).toBe(true);
		expect(sms.sentMessages).toHaveLength(0);
	});

	test("logs warning and exits when no facts exist in the database", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();

		makeSubscriberRow(db, { phone_number: "+15552345678", status: "active" });

		const result = await runDailySend(db, sms, "https://example.com", "2025-06-15");

		expect(result.alreadySent).toBe(false);
		expect(result.factId).toBeNull();
		expect(sms.sentMessages).toHaveLength(0);
	});

	test("records fact in sent_facts even when no active subscribers exist", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();

		makeFactRow(db, { text: "Platypuses are venomous" });

		const result = await runDailySend(db, sms, "https://example.com", "2025-06-15");

		expect(result.alreadySent).toBe(false);
		expect(result.factId).toBeGreaterThan(0);
		expect(result.subscriberCount).toBe(0);
		expect(sms.sentMessages).toHaveLength(0);

		const sentFact = db
			.prepare("SELECT fact_id FROM sent_facts WHERE sent_date = ?")
			.get("2025-06-15") as { fact_id: number } | null;
		expect(sentFact).not.toBeNull();
	});

	test("continues sending to other subscribers when individual SMS fails", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();

		makeFactRow(db, { text: "Platypuses have webbed feet" });
		makeSubscriberRow(db, { phone_number: "+15552345678", status: "active" });
		makeSubscriberRow(db, { phone_number: "+15553456789", status: "active" });
		makeSubscriberRow(db, { phone_number: "+15554567890", status: "active" });

		let callCount = 0;
		sms.sendSms = async (to: string, body: string, mediaUrl?: string) => {
			callCount++;
			if (callCount === 2) {
				throw new Error("SMS delivery failed");
			}
			sms.sentMessages.push({ to, body, mediaUrl });
		};

		const result = await runDailySend(db, sms, "https://example.com", "2025-06-15");

		expect(result.subscriberCount).toBe(3);
		expect(result.successCount).toBe(2);
		expect(result.failureCount).toBe(1);
	});

	test("records fact in sent_facts even with partial delivery failures", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();

		makeFactRow(db, { text: "Platypuses lay eggs" });
		makeSubscriberRow(db, { phone_number: "+15552345678", status: "active" });

		sms.sendSms = async () => {
			throw new Error("All deliveries failed");
		};

		const result = await runDailySend(db, sms, "https://example.com", "2025-06-15");

		expect(result.failureCount).toBe(1);
		expect(result.successCount).toBe(0);

		const sentFact = db
			.prepare("SELECT fact_id FROM sent_facts WHERE sent_date = ?")
			.get("2025-06-15") as { fact_id: number } | null;
		expect(sentFact).not.toBeNull();
	});

	test("uses dailyFactMessage template with fact text and correctly constructed URL", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();

		const factId = makeFactRow(db, {
			text: "Platypuses close their eyes underwater",
			sources: [{ url: "https://example.com/eyes" }],
		});
		makeSubscriberRow(db, { phone_number: "+15552345678", status: "active" });

		await runDailySend(db, sms, "https://example.com", "2025-06-15");

		expect(sms.sentMessages).toHaveLength(1);
		expect(sms.sentMessages[0].body).toContain("🦆 Daily Platypus Fact:");
		expect(sms.sentMessages[0].body).toContain("Platypuses close their eyes underwater");
		expect(sms.sentMessages[0].body).toContain(`https://example.com/facts/${factId}`);
	});

	test("constructs fact URL without double slashes when BASE_URL has no trailing slash", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();

		const factId = makeFactRow(db, { text: "Test fact" });
		makeSubscriberRow(db, { phone_number: "+15552345678", status: "active" });

		await runDailySend(db, sms, "https://example.com", "2025-06-15");

		expect(sms.sentMessages[0].body).toContain(`https://example.com/facts/${factId}`);
		expect(sms.sentMessages[0].body).not.toContain("//facts/");
	});

	test("sends MMS with image URL when fact has image_path", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();

		makeFactRow(db, {
			text: "Platypuses glow under UV light",
			image_path: "images/facts/1.png",
			sources: [{ url: "https://example.com/uv" }],
		});
		makeSubscriberRow(db, { phone_number: "+15552345678", status: "active" });

		await runDailySend(db, sms, "https://example.com", "2025-06-15");

		expect(sms.sentMessages).toHaveLength(1);
		expect(sms.sentMessages[0].mediaUrl).toBe("https://example.com/images/facts/1.png");
	});

	test("sends plain SMS without mediaUrl when fact has no image_path", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();

		makeFactRow(db, {
			text: "Platypuses are venomous",
			sources: [{ url: "https://example.com/venom" }],
		});
		makeSubscriberRow(db, { phone_number: "+15552345678", status: "active" });

		await runDailySend(db, sms, "https://example.com", "2025-06-15");

		expect(sms.sentMessages).toHaveLength(1);
		expect(sms.sentMessages[0].mediaUrl).toBeUndefined();
	});

	test("handles concurrent duplicate daily-send gracefully via sent_date UNIQUE constraint", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();

		const factId = makeFactRow(db, { text: "Race condition fact" });
		makeSubscriberRow(db, { phone_number: "+15552345678", status: "active" });

		db.prepare(
			"INSERT INTO sent_facts (fact_id, sent_date, cycle) VALUES (?, '2025-06-15', 1)",
		).run(factId);

		const result = await runDailySend(db, sms, "https://example.com", "2025-06-15");

		expect(result.alreadySent).toBe(true);
		expect(result.factId).toBe(factId);
		expect(sms.sentMessages).toHaveLength(0);
	});

	test("uses UTC today date when no override provided", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();
		const expectedDate = new Date().toISOString().split("T")[0];

		makeFactRow(db, { text: "Test fact for date check" });
		makeSubscriberRow(db, { phone_number: "+15552345678", status: "active" });

		await runDailySend(db, sms, "https://example.com");

		const sentFact = db.prepare("SELECT sent_date FROM sent_facts").get() as {
			sent_date: string;
		} | null;
		expect(sentFact?.sent_date).toBe(expectedDate);
	});

	test("sends email to subscriber with email address when emailProvider is provided", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();
		const email = makeMockEmailProvider();

		makeFactRow(db, { text: "Platypuses have electroreception" });
		makeSubscriberRow(db, { phone_number: null, email: "fan@example.com", status: "active" });

		const result = await runDailySend(db, sms, "https://example.com", "2025-06-15", email);

		expect(result.emailSuccess).toBe(1);
		expect(result.smsSuccess).toBe(0);
		expect(result.successCount).toBe(1);
		expect(email.sentEmails).toHaveLength(1);
		expect(email.sentEmails[0].to).toBe("fan@example.com");
		expect(email.sentEmails[0].subject).toBe("Your Daily Platypus Fact");
		expect(email.sentEmails[0].htmlBody).toContain("Platypuses have electroreception");
		expect(email.sentEmails[0].plainBody).toContain("Platypuses have electroreception");
		expect(sms.sentMessages).toHaveLength(0);
	});

	test("sends both SMS and email to subscriber with phone and email", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();
		const email = makeMockEmailProvider();

		makeFactRow(db, { text: "Platypuses are venomous" });
		makeSubscriberRow(db, {
			phone_number: "+15552345678",
			email: "fan@example.com",
			status: "active",
		});

		const result = await runDailySend(db, sms, "https://example.com", "2025-06-15", email);

		expect(result.smsSuccess).toBe(1);
		expect(result.emailSuccess).toBe(1);
		expect(result.successCount).toBe(2);
		expect(sms.sentMessages).toHaveLength(1);
		expect(email.sentEmails).toHaveLength(1);
	});

	test("skips email for phone-only subscriber", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();
		const email = makeMockEmailProvider();

		makeFactRow(db, { text: "Platypuses lay eggs" });
		makeSubscriberRow(db, { phone_number: "+15552345678", email: null, status: "active" });

		const result = await runDailySend(db, sms, "https://example.com", "2025-06-15", email);

		expect(result.smsSuccess).toBe(1);
		expect(result.emailSuccess).toBe(0);
		expect(sms.sentMessages).toHaveLength(1);
		expect(email.sentEmails).toHaveLength(0);
	});

	test("does not send email when emailProvider is not provided", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();

		makeFactRow(db, { text: "Platypuses are monotremes" });
		makeSubscriberRow(db, {
			phone_number: "+15552345678",
			email: "fan@example.com",
			status: "active",
		});

		const result = await runDailySend(db, sms, "https://example.com", "2025-06-15");

		expect(result.smsSuccess).toBe(1);
		expect(result.emailSuccess).toBe(0);
		expect(sms.sentMessages).toHaveLength(1);
	});

	test("continues sending when email delivery fails for one subscriber", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();
		const email = makeMockEmailProvider();

		makeFactRow(db, { text: "Platypuses have webbed feet" });
		makeSubscriberRow(db, { phone_number: null, email: "a@example.com", status: "active" });
		makeSubscriberRow(db, { phone_number: null, email: "b@example.com", status: "active" });

		let callCount = 0;
		email.sendEmail = async (to, subject, htmlBody, plainBody, headers) => {
			callCount++;
			if (callCount === 1) throw new Error("Email delivery failed");
			email.sentEmails.push({ to, subject, htmlBody, plainBody, headers });
		};

		const result = await runDailySend(db, sms, "https://example.com", "2025-06-15", email);

		expect(result.emailSuccess).toBe(1);
		expect(result.emailFail).toBe(1);
		expect(result.failureCount).toBe(1);
	});

	test("email includes unsubscribe URL and List-Unsubscribe headers", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();
		const email = makeMockEmailProvider();

		makeFactRow(db, { text: "Platypuses glow under UV light" });
		makeSubscriberRow(db, {
			phone_number: null,
			email: "fan@example.com",
			token: "test-token-uuid-1234-567890abcdef",
			status: "active",
		});

		await runDailySend(db, sms, "https://example.com", "2025-06-15", email);

		expect(email.sentEmails).toHaveLength(1);
		const sent = email.sentEmails[0];
		expect(sent.headers?.["List-Unsubscribe"]).toContain("test-token-uuid-1234-567890abcdef");
		expect(sent.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
		expect(sent.htmlBody).toContain("test-token-uuid-1234-567890abcdef");
	});

	test("per-channel counts are zero for early-exit scenarios", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();
		const factId = makeFactRow(db);
		makeSentFactRow(db, { fact_id: factId, sent_date: "2025-06-15", cycle: 1 });

		const result = await runDailySend(db, sms, "https://example.com", "2025-06-15");

		expect(result.smsSuccess).toBe(0);
		expect(result.smsFail).toBe(0);
		expect(result.emailSuccess).toBe(0);
		expect(result.emailFail).toBe(0);
	});
});
