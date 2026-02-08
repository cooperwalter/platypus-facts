import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runDailySend } from "./jobs/daily-send";
import { getFactWithSources, getSentFactByDate } from "./lib/facts";
import { findByEmail, getActiveCount } from "./lib/subscribers";
import { signup } from "./lib/subscription-flow";
import {
	makeFactRow,
	makeMockEmailProvider,
	makeSubscriberRow,
	makeTestDatabase,
} from "./lib/test-utils";
import { handleUnsubscribe, renderConfirmationPage } from "./routes/pages";
import { syncFacts } from "./scripts/sync-facts";

const BASE_URL = "https://platypusfacts.example.com";
const MAX_SUBSCRIBERS = 1000;

describe("integration: email signup and confirmation flow", () => {
	test("email signup creates pending subscriber, confirmation link activates subscription", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();

		const result = await signup(db, email, "platypus@example.com", MAX_SUBSCRIBERS, BASE_URL);
		expect(result.success).toBe(true);

		const subscriber = findByEmail(db, "platypus@example.com");
		expect(subscriber).not.toBeNull();
		expect(subscriber?.status).toBe("pending");

		expect(email.sentEmails).toHaveLength(1);
		expect(email.sentEmails[0].to).toBe("platypus@example.com");
		expect(email.sentEmails[0].subject).toContain("Confirm");
		if (!subscriber?.token) throw new Error("Expected token");
		expect(email.sentEmails[0].htmlBody).toContain(subscriber.token);

		const confirmResponse = renderConfirmationPage(db, subscriber.token, MAX_SUBSCRIBERS);
		expect(confirmResponse.status).toBe(200);
		const confirmHtml = await confirmResponse.text();
		expect(confirmHtml).toContain("Welcome, Platypus Fan!");

		const activated = findByEmail(db, "platypus@example.com");
		expect(activated?.status).toBe("active");
		expect(activated?.confirmed_at).not.toBeNull();
	});
});

describe("integration: daily send job", () => {
	test("selects fact by cycling algorithm, sends email to all active subscribers, records in sent_facts", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();
		const today = "2025-07-01";

		const factId1 = makeFactRow(db, {
			text: "Platypuses detect electric fields",
			sources: [{ url: "https://example.com/electro", title: "Electroreception Study" }],
		});
		const factId2 = makeFactRow(db, {
			text: "Platypuses are venomous mammals",
			sources: [{ url: "https://example.com/venom", title: "Venom Research" }],
		});

		makeSubscriberRow(db, {
			email: "a@example.com",
			status: "active",
			confirmed_at: new Date().toISOString(),
		});
		makeSubscriberRow(db, {
			email: "b@example.com",
			status: "active",
			confirmed_at: new Date().toISOString(),
		});
		makeSubscriberRow(db, { email: "c@example.com" });

		const result = await runDailySend(db, email, BASE_URL, today);

		expect(result.alreadySent).toBe(false);
		if (result.factId === null) throw new Error("Expected factId to be non-null");
		expect([factId1, factId2]).toContain(result.factId);
		expect(result.subscriberCount).toBe(2);
		expect(result.emailSuccess).toBe(2);
		expect(result.emailFail).toBe(0);

		expect(email.sentEmails).toHaveLength(2);
		const sentEmails = email.sentEmails.map((m) => m.to).sort();
		expect(sentEmails).toEqual(["a@example.com", "b@example.com"]);
		const factData = getFactWithSources(db, result.factId);
		if (!factData) throw new Error("Expected factData to be non-null");
		expect(email.sentEmails[0].htmlBody).toContain(factData.fact.text);

		const sentRecord = getSentFactByDate(db, today);
		if (!sentRecord) throw new Error("Expected sentRecord to be non-null");
		expect(sentRecord.fact_id).toBe(result.factId);
	});
});

describe("integration: fact sync", () => {
	function writeTempFactsFile(
		facts: Array<{ text: string; sources: Array<{ url: string; title?: string }> }>,
	): string {
		const tmpDir = os.tmpdir();
		const filePath = path.join(tmpDir, `test-facts-${Date.now()}.json`);
		fs.writeFileSync(filePath, JSON.stringify(facts));
		return filePath;
	}

	test("seed file loaded, facts inserted, re-sync is idempotent, new facts added on subsequent sync", async () => {
		const db = makeTestDatabase();

		const initialFacts = [
			{
				text: "Platypuses have no stomach",
				sources: [{ url: "https://example.com/stomach", title: "Stomach Study" }],
			},
			{
				text: "Platypuses close their eyes underwater",
				sources: [{ url: "https://example.com/eyes", title: "Eye Study" }],
			},
		];

		const filePath = writeTempFactsFile(initialFacts);

		try {
			const firstSync = await syncFacts(db, filePath);
			expect(firstSync.added).toBe(2);
			expect(firstSync.updated).toBe(0);
			expect(firstSync.unchanged).toBe(0);

			const secondSync = await syncFacts(db, filePath);
			expect(secondSync.added).toBe(0);
			expect(secondSync.updated).toBe(0);
			expect(secondSync.unchanged).toBe(2);

			const expandedFacts = [
				...initialFacts,
				{
					text: "Platypuses glow under UV light",
					sources: [{ url: "https://example.com/uv", title: "UV Study" }],
				},
			];

			const expandedPath = writeTempFactsFile(expandedFacts);

			try {
				const thirdSync = await syncFacts(db, expandedPath);
				expect(thirdSync.added).toBe(1);
				expect(thirdSync.updated).toBe(0);
				expect(thirdSync.unchanged).toBe(2);

				const allFacts = db.prepare("SELECT COUNT(*) as count FROM facts").get() as {
					count: number;
				};
				expect(allFacts.count).toBe(3);
			} finally {
				fs.unlinkSync(expandedPath);
			}
		} finally {
			fs.unlinkSync(filePath);
		}
	});
});

describe("integration: email unsubscribe flow", () => {
	test("active email subscriber unsubscribes via web link and no longer receives daily emails", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();

		makeSubscriberRow(db, {
			email: "fan@example.com",
			token: "unsub-1111-2222-3333-444444444444",
			status: "active",
			confirmed_at: new Date().toISOString(),
		});

		const unsubResponse = handleUnsubscribe(db, "unsub-1111-2222-3333-444444444444");
		expect(unsubResponse.status).toBe(200);
		const unsubHtml = await unsubResponse.text();
		expect(unsubHtml).toContain("Unsubscribed");

		const unsubscribed = findByEmail(db, "fan@example.com");
		expect(unsubscribed?.status).toBe("unsubscribed");
		expect(unsubscribed?.unsubscribed_at).not.toBeNull();

		makeFactRow(db, { text: "Platypuses swim well" });
		const result = await runDailySend(db, email, BASE_URL, "2025-10-01");
		expect(result.subscriberCount).toBe(0);
		expect(email.sentEmails).toHaveLength(0);
	});
});

describe("integration: fact page image display", () => {
	test("fact page renders img tag when fact has image_path", async () => {
		const db = makeTestDatabase();
		const factId = makeFactRow(db, {
			text: "Platypuses glow under UV light",
			image_path: "images/facts/42.png",
			sources: [{ url: "https://example.com/uv" }],
		});

		const { renderFactPage } = await import("./routes/pages");
		const response = renderFactPage(db, factId);
		const html = await response.text();

		expect(html).toContain('<img src="/images/facts/42.png"');
		expect(html).toContain("fact-image");
	});

	test("fact page has no img tag when fact has no image_path", async () => {
		const db = makeTestDatabase();
		const factId = makeFactRow(db, {
			text: "Platypuses are monotremes",
			sources: [{ url: "https://example.com/mono" }],
		});

		const { renderFactPage } = await import("./routes/pages");
		const response = renderFactPage(db, factId);
		const html = await response.text();

		expect(html).not.toContain("<img");
		expect(html).not.toContain("fact-image");
	});
});

describe("integration: cap enforcement end-to-end", () => {
	test("fill to cap, new signup rejected, unsubscribe one, new signup allowed", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();
		const maxCap = 2;

		const signupResult1 = await signup(db, email, "a@example.com", maxCap, BASE_URL);
		expect(signupResult1.success).toBe(true);
		const sub1 = findByEmail(db, "a@example.com");
		if (!sub1?.token) throw new Error("Expected token");
		renderConfirmationPage(db, sub1.token, maxCap);
		expect(findByEmail(db, "a@example.com")?.status).toBe("active");

		const signupResult2 = await signup(db, email, "b@example.com", maxCap, BASE_URL);
		expect(signupResult2.success).toBe(true);
		const sub2 = findByEmail(db, "b@example.com");
		if (!sub2?.token) throw new Error("Expected token");
		renderConfirmationPage(db, sub2.token, maxCap);
		expect(findByEmail(db, "b@example.com")?.status).toBe("active");

		expect(getActiveCount(db)).toBe(2);

		const rejectedSignup = await signup(db, email, "c@example.com", maxCap, BASE_URL);
		expect(rejectedSignup.success).toBe(false);
		expect(rejectedSignup.message).toContain("capacity");

		handleUnsubscribe(db, sub1.token);
		expect(findByEmail(db, "a@example.com")?.status).toBe("unsubscribed");
		expect(getActiveCount(db)).toBe(1);

		const allowedSignup = await signup(db, email, "c@example.com", maxCap, BASE_URL);
		expect(allowedSignup.success).toBe(true);

		const sub3 = findByEmail(db, "c@example.com");
		if (!sub3?.token) throw new Error("Expected token");
		renderConfirmationPage(db, sub3.token, maxCap);
		expect(findByEmail(db, "c@example.com")?.status).toBe("active");
		expect(getActiveCount(db)).toBe(2);
	});

	test("pending subscriber cannot confirm when cap reached between signup and confirmation", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();
		const maxCap = 1;

		const signupResult = await signup(db, email, "a@example.com", maxCap, BASE_URL);
		expect(signupResult.success).toBe(true);

		makeSubscriberRow(db, {
			email: "blocker@example.com",
			status: "active",
			confirmed_at: new Date().toISOString(),
		});
		expect(getActiveCount(db)).toBe(1);

		const sub = findByEmail(db, "a@example.com");
		if (!sub?.token) throw new Error("Expected token");
		const confirmResponse = renderConfirmationPage(db, sub.token, maxCap);
		const html = await confirmResponse.text();
		expect(html).toContain("At Capacity");

		const stillPending = findByEmail(db, "a@example.com");
		expect(stillPending?.status).toBe("pending");
	});
});

describe("integration: re-subscribe via website with email", () => {
	test("unsubscribed email user re-signs up, gets new pending status, confirms via link", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();

		makeSubscriberRow(db, {
			email: "returning@example.com",
			status: "unsubscribed",
			confirmed_at: new Date(Date.now() - 86400000).toISOString(),
			unsubscribed_at: new Date().toISOString(),
		});

		const result = await signup(db, email, "returning@example.com", MAX_SUBSCRIBERS, BASE_URL);
		expect(result.success).toBe(true);

		const pending = findByEmail(db, "returning@example.com");
		expect(pending?.status).toBe("pending");

		expect(email.sentEmails).toHaveLength(1);
		expect(email.sentEmails[0].to).toBe("returning@example.com");

		if (!pending?.token) throw new Error("Expected token");
		const confirmResponse = renderConfirmationPage(db, pending.token, MAX_SUBSCRIBERS);
		expect(confirmResponse.status).toBe(200);

		const reactivated = findByEmail(db, "returning@example.com");
		expect(reactivated?.status).toBe("active");
	});
});
