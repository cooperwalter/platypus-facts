import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runDailySend } from "./jobs/daily-send";
import { getFactWithSources, getSentFactByDate } from "./lib/facts";
import {
	atCapacityMessage,
	confirmationSuccessMessage,
	dailyFactMessage,
	welcomeMessage,
} from "./lib/sms-templates";
import { findByEmail, findByPhoneNumber, getActiveCount } from "./lib/subscribers";
import { handleIncomingMessage, signup } from "./lib/subscription-flow";
import {
	makeFactRow,
	makeMockEmailProvider,
	makeMockSmsProvider,
	makeSubscriberRow,
	makeTestDatabase,
} from "./lib/test-utils";
import { handleUnsubscribe, renderConfirmationPage } from "./routes/pages";
import { syncFacts } from "./scripts/sync-facts";

const BASE_URL = "https://platypusfacts.example.com";
const MAX_SUBSCRIBERS = 1000;

describe("integration: full signup flow with PERRY", () => {
	test("web signup creates pending subscriber, sends welcome SMS, reply PERRY activates subscriber and sends confirmation SMS", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();
		const phone = "+15558234567";

		const signupResult = await signup(db, sms, { phone: "5558234567" }, MAX_SUBSCRIBERS, BASE_URL);
		expect(signupResult.success).toBe(true);

		const subscriber = findByPhoneNumber(db, phone);
		expect(subscriber).not.toBeNull();
		expect(subscriber?.status).toBe("pending");

		expect(sms.sentMessages).toHaveLength(1);
		expect(sms.sentMessages[0].to).toBe(phone);
		expect(sms.sentMessages[0].body).toBe(welcomeMessage());

		const replyMessage = await handleIncomingMessage(db, phone, "PERRY", BASE_URL, MAX_SUBSCRIBERS);
		expect(replyMessage).toBe(confirmationSuccessMessage());

		const activated = findByPhoneNumber(db, phone);
		expect(activated).not.toBeNull();
		expect(activated?.status).toBe("active");
		expect(activated?.confirmed_at).not.toBeNull();
	});
});

describe("integration: full signup flow with 1", () => {
	test("web signup creates pending subscriber, sends welcome SMS, reply 1 activates subscriber and sends confirmation SMS", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();
		const phone = "+15558234567";

		const signupResult = await signup(db, sms, { phone: "5558234567" }, MAX_SUBSCRIBERS, BASE_URL);
		expect(signupResult.success).toBe(true);

		const subscriber = findByPhoneNumber(db, phone);
		expect(subscriber?.status).toBe("pending");

		expect(sms.sentMessages).toHaveLength(1);
		expect(sms.sentMessages[0].body).toBe(welcomeMessage());

		const replyMessage = await handleIncomingMessage(db, phone, "1", BASE_URL, MAX_SUBSCRIBERS);
		expect(replyMessage).toBe(confirmationSuccessMessage());

		const activated = findByPhoneNumber(db, phone);
		expect(activated?.status).toBe("active");
		expect(activated?.confirmed_at).not.toBeNull();
	});
});

describe("integration: daily send job", () => {
	test("syncs facts, selects fact by cycling algorithm, sends SMS to all active subscribers, records in sent_facts", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();
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
			phone_number: "+15558234567",
			status: "active",
			confirmed_at: new Date().toISOString(),
		});
		makeSubscriberRow(db, {
			phone_number: "+15559876543",
			status: "active",
			confirmed_at: new Date().toISOString(),
		});
		makeSubscriberRow(db, { phone_number: "+15552223333" });

		const result = await runDailySend(db, sms, BASE_URL, today);

		expect(result.alreadySent).toBe(false);
		if (result.factId === null) throw new Error("Expected factId to be non-null");
		expect([factId1, factId2]).toContain(result.factId);
		expect(result.subscriberCount).toBe(2);
		expect(result.successCount).toBe(2);
		expect(result.failureCount).toBe(0);

		expect(sms.sentMessages).toHaveLength(2);
		const sentPhones = sms.sentMessages.map((m) => m.to).sort();
		expect(sentPhones).toEqual(["+15558234567", "+15559876543"]);
		const factData = getFactWithSources(db, result.factId);
		if (!factData) throw new Error("Expected factData to be non-null");
		const expectedMessage = dailyFactMessage(
			factData.fact.text,
			`${BASE_URL}/facts/${result.factId}`,
		);
		expect(sms.sentMessages[0].body).toBe(expectedMessage);

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

describe("integration: unsubscribe flow", () => {
	test("active subscriber sends STOP, status updated to unsubscribed, no longer receives daily facts", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();
		const phone = "+15558234567";

		makeSubscriberRow(db, {
			phone_number: phone,
			status: "active",
			confirmed_at: new Date().toISOString(),
		});
		makeFactRow(db, {
			text: "Platypuses are egg-laying mammals",
			sources: [{ url: "https://example.com/eggs" }],
		});

		const stopReply = await handleIncomingMessage(db, phone, "STOP", BASE_URL, MAX_SUBSCRIBERS);
		expect(stopReply).toBeUndefined();

		const unsubscribed = findByPhoneNumber(db, phone);
		expect(unsubscribed?.status).toBe("unsubscribed");
		expect(unsubscribed?.unsubscribed_at).not.toBeNull();

		const result = await runDailySend(db, sms, BASE_URL, "2025-08-01");
		expect(result.subscriberCount).toBe(0);
		expect(sms.sentMessages).toHaveLength(0);
	});
});

describe("integration: re-subscribe flow", () => {
	test("unsubscribed user visits website, enters phone, reset to pending, confirms, becomes active again", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();
		const phone = "+15558234567";

		makeSubscriberRow(db, {
			phone_number: phone,
			status: "unsubscribed",
			confirmed_at: new Date(Date.now() - 86400000).toISOString(),
			unsubscribed_at: new Date().toISOString(),
		});

		const signupResult = await signup(db, sms, { phone: "5558234567" }, MAX_SUBSCRIBERS, BASE_URL);
		expect(signupResult.success).toBe(true);

		const pending = findByPhoneNumber(db, phone);
		expect(pending?.status).toBe("pending");

		expect(sms.sentMessages).toHaveLength(1);
		expect(sms.sentMessages[0].body).toBe(welcomeMessage());

		const replyMessage = await handleIncomingMessage(db, phone, "PERRY", BASE_URL, MAX_SUBSCRIBERS);
		expect(replyMessage).toBe(confirmationSuccessMessage());

		const reactivated = findByPhoneNumber(db, phone);
		expect(reactivated?.status).toBe("active");
		expect(reactivated?.confirmed_at).not.toBeNull();
	});
});

describe("integration: image in daily send", () => {
	test("daily send includes mediaUrl when fact has image_path, omits when no image", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();

		const factWithImage = makeFactRow(db, {
			text: "Platypuses glow under UV light",
			image_path: "images/facts/1.png",
			sources: [{ url: "https://example.com/uv" }],
		});
		makeFactRow(db, {
			text: "Platypuses are venomous",
			sources: [{ url: "https://example.com/venom" }],
		});

		makeSubscriberRow(db, {
			phone_number: "+15558234567",
			status: "active",
			confirmed_at: new Date().toISOString(),
		});

		const result1 = await runDailySend(db, sms, BASE_URL, "2025-09-01");
		if (result1.factId === null) throw new Error("Expected factId");

		const firstMsg = sms.sentMessages[0];
		if (result1.factId === factWithImage) {
			expect(firstMsg.mediaUrl).toBe(`${BASE_URL}/images/facts/1.png`);
		} else {
			expect(firstMsg.mediaUrl).toBeUndefined();
		}

		sms.reset();
		const result2 = await runDailySend(db, sms, BASE_URL, "2025-09-02");
		if (result2.factId === null) throw new Error("Expected factId");

		const secondMsg = sms.sentMessages[0];
		if (result2.factId === factWithImage) {
			expect(secondMsg.mediaUrl).toBe(`${BASE_URL}/images/facts/1.png`);
		} else {
			expect(secondMsg.mediaUrl).toBeUndefined();
		}
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
		const sms = makeMockSmsProvider();
		const maxCap = 2;

		const signupResult1 = await signup(db, sms, { phone: "5558234567" }, maxCap, BASE_URL);
		expect(signupResult1.success).toBe(true);
		await handleIncomingMessage(db, "+15558234567", "1", BASE_URL, maxCap);
		expect(findByPhoneNumber(db, "+15558234567")?.status).toBe("active");

		const signupResult2 = await signup(db, sms, { phone: "5559876543" }, maxCap, BASE_URL);
		expect(signupResult2.success).toBe(true);
		await handleIncomingMessage(db, "+15559876543", "PERRY", BASE_URL, maxCap);
		expect(findByPhoneNumber(db, "+15559876543")?.status).toBe("active");

		expect(getActiveCount(db)).toBe(2);

		const rejectedSignup = await signup(db, sms, { phone: "5553456789" }, maxCap, BASE_URL);
		expect(rejectedSignup.success).toBe(false);
		expect(rejectedSignup.message).toContain("capacity");

		await handleIncomingMessage(db, "+15558234567", "STOP", BASE_URL, maxCap);
		expect(findByPhoneNumber(db, "+15558234567")?.status).toBe("unsubscribed");
		expect(getActiveCount(db)).toBe(1);

		const allowedSignup = await signup(db, sms, { phone: "5553456789" }, maxCap, BASE_URL);
		expect(allowedSignup.success).toBe(true);

		await handleIncomingMessage(db, "+15553456789", "1", BASE_URL, maxCap);
		expect(findByPhoneNumber(db, "+15553456789")?.status).toBe("active");
		expect(getActiveCount(db)).toBe(2);
	});

	test("pending subscriber cannot confirm when cap reached between signup and confirmation", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();
		const maxCap = 1;

		const signupResult = await signup(db, sms, { phone: "5558234567" }, maxCap, BASE_URL);
		expect(signupResult.success).toBe(true);

		makeSubscriberRow(db, {
			phone_number: "+15559999999",
			status: "active",
			confirmed_at: new Date().toISOString(),
		});
		expect(getActiveCount(db)).toBe(1);

		const replyMessage = await handleIncomingMessage(db, "+15558234567", "1", BASE_URL, maxCap);
		expect(replyMessage).toBe(atCapacityMessage());

		const stillPending = findByPhoneNumber(db, "+15558234567");
		expect(stillPending?.status).toBe("pending");
	});
});

describe("integration: email-only signup and confirmation flow", () => {
	test("email signup creates pending subscriber, confirmation link activates subscription", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();
		const email = makeMockEmailProvider();

		const result = await signup(
			db,
			sms,
			{ email: "platypus@example.com" },
			MAX_SUBSCRIBERS,
			BASE_URL,
			email,
		);
		expect(result.success).toBe(true);

		const subscriber = findByEmail(db, "platypus@example.com");
		expect(subscriber).not.toBeNull();
		expect(subscriber?.status).toBe("pending");
		expect(subscriber?.phone_number).toBeNull();

		expect(email.sentEmails).toHaveLength(1);
		expect(email.sentEmails[0].to).toBe("platypus@example.com");
		expect(email.sentEmails[0].subject).toContain("Confirm");
		if (!subscriber?.token) throw new Error("Expected token");
		expect(email.sentEmails[0].htmlBody).toContain(subscriber.token);
		expect(sms.sentMessages).toHaveLength(0);
		const confirmResponse = renderConfirmationPage(db, subscriber.token, MAX_SUBSCRIBERS);
		expect(confirmResponse.status).toBe(200);
		const confirmHtml = await confirmResponse.text();
		expect(confirmHtml).toContain("Welcome, Platypus Fan!");

		const activated = findByEmail(db, "platypus@example.com");
		expect(activated?.status).toBe("active");
		expect(activated?.confirmed_at).not.toBeNull();
	});
});

describe("integration: email unsubscribe flow", () => {
	test("active email subscriber unsubscribes via web link and no longer receives daily emails", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();
		const email = makeMockEmailProvider();

		makeSubscriberRow(db, {
			phone_number: null,
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
		const result = await runDailySend(db, sms, BASE_URL, "2025-10-01", email);
		expect(result.subscriberCount).toBe(0);
		expect(email.sentEmails).toHaveLength(0);
	});
});

describe("integration: dual-channel daily send", () => {
	test("subscriber with both phone and email receives both SMS and email", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();
		const email = makeMockEmailProvider();

		makeFactRow(db, {
			text: "Platypuses have electroreception",
			sources: [{ url: "https://example.com/electro" }],
		});
		makeSubscriberRow(db, {
			phone_number: "+15558234567",
			email: "fan@example.com",
			status: "active",
			confirmed_at: new Date().toISOString(),
		});

		const result = await runDailySend(db, sms, BASE_URL, "2025-11-01", email);

		expect(result.smsSuccess).toBe(1);
		expect(result.emailSuccess).toBe(1);
		expect(result.successCount).toBe(2);
		expect(sms.sentMessages).toHaveLength(1);
		expect(sms.sentMessages[0].body).toContain("Platypuses have electroreception");
		expect(email.sentEmails).toHaveLength(1);
		expect(email.sentEmails[0].to).toBe("fan@example.com");
		expect(email.sentEmails[0].htmlBody).toContain("Platypuses have electroreception");
	});
});

describe("integration: conflict detection", () => {
	test("signup with phone matching subscriber A and email matching subscriber B returns conflict error", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();
		const email = makeMockEmailProvider();

		makeSubscriberRow(db, {
			phone_number: "+15558234567",
			email: null,
			status: "active",
			confirmed_at: new Date().toISOString(),
		});
		makeSubscriberRow(db, {
			phone_number: null,
			email: "other@example.com",
			status: "active",
			confirmed_at: new Date().toISOString(),
		});

		const result = await signup(
			db,
			sms,
			{ phone: "5558234567", email: "other@example.com" },
			MAX_SUBSCRIBERS,
			BASE_URL,
			email,
		);

		expect(result.success).toBe(false);
		expect(result.message).toContain("different");
	});
});

describe("integration: cross-channel confirmation activates all channels", () => {
	test("dual-channel signup confirmed via SMS activates both SMS and email delivery", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();
		const email = makeMockEmailProvider();
		const phone = "+15558234567";

		const result = await signup(
			db,
			sms,
			{ phone: "5558234567", email: "dual@example.com" },
			MAX_SUBSCRIBERS,
			BASE_URL,
			email,
		);
		expect(result.success).toBe(true);

		const pending = findByPhoneNumber(db, phone);
		expect(pending?.status).toBe("pending");
		expect(pending?.email).toBe("dual@example.com");

		expect(sms.sentMessages).toHaveLength(1);
		expect(sms.sentMessages[0].body).toBe(welcomeMessage());
		expect(email.sentEmails).toHaveLength(1);
		expect(email.sentEmails[0].subject).toContain("Confirm");

		const replyMessage = await handleIncomingMessage(db, phone, "PERRY", BASE_URL, MAX_SUBSCRIBERS);
		expect(replyMessage).toBe(confirmationSuccessMessage());

		const activated = findByPhoneNumber(db, phone);
		expect(activated?.status).toBe("active");
		expect(activated?.confirmed_at).not.toBeNull();
		expect(activated?.email).toBe("dual@example.com");

		sms.reset();
		email.reset();
		makeFactRow(db, {
			text: "Platypuses can sense electric fields",
			sources: [{ url: "https://example.com/electro" }],
		});

		const sendResult = await runDailySend(db, sms, BASE_URL, "2025-12-01", email);
		expect(sendResult.subscriberCount).toBe(1);
		expect(sendResult.smsSuccess).toBe(1);
		expect(sendResult.emailSuccess).toBe(1);
		expect(sms.sentMessages).toHaveLength(1);
		expect(sms.sentMessages[0].to).toBe(phone);
		expect(email.sentEmails).toHaveLength(1);
		expect(email.sentEmails[0].to).toBe("dual@example.com");
	});

	test("dual-channel signup confirmed via email link activates both SMS and email delivery", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();
		const email = makeMockEmailProvider();

		const result = await signup(
			db,
			sms,
			{ phone: "5559876543", email: "emailconfirm@example.com" },
			MAX_SUBSCRIBERS,
			BASE_URL,
			email,
		);
		expect(result.success).toBe(true);

		const pending = findByEmail(db, "emailconfirm@example.com");
		expect(pending?.status).toBe("pending");
		expect(pending?.phone_number).toBe("+15559876543");
		if (!pending?.token) throw new Error("Expected token");

		const confirmResponse = renderConfirmationPage(db, pending.token, MAX_SUBSCRIBERS);
		expect(confirmResponse.status).toBe(200);
		const confirmHtml = await confirmResponse.text();
		expect(confirmHtml).toContain("Welcome, Platypus Fan!");

		const activated = findByEmail(db, "emailconfirm@example.com");
		expect(activated?.status).toBe("active");
		expect(activated?.confirmed_at).not.toBeNull();
		expect(activated?.phone_number).toBe("+15559876543");

		sms.reset();
		email.reset();
		makeFactRow(db, {
			text: "Platypuses have venomous spurs",
			sources: [{ url: "https://example.com/venom" }],
		});

		const sendResult = await runDailySend(db, sms, BASE_URL, "2025-12-02", email);
		expect(sendResult.subscriberCount).toBe(1);
		expect(sendResult.smsSuccess).toBe(1);
		expect(sendResult.emailSuccess).toBe(1);
		expect(sms.sentMessages).toHaveLength(1);
		expect(sms.sentMessages[0].to).toBe("+15559876543");
		expect(email.sentEmails).toHaveLength(1);
		expect(email.sentEmails[0].to).toBe("emailconfirm@example.com");
	});
});

describe("integration: re-subscribe via website with email", () => {
	test("unsubscribed email user re-signs up, gets new pending status, confirms via link", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();
		const email = makeMockEmailProvider();

		makeSubscriberRow(db, {
			phone_number: null,
			email: "returning@example.com",
			status: "unsubscribed",
			confirmed_at: new Date(Date.now() - 86400000).toISOString(),
			unsubscribed_at: new Date().toISOString(),
		});

		const result = await signup(
			db,
			sms,
			{ email: "returning@example.com" },
			MAX_SUBSCRIBERS,
			BASE_URL,
			email,
		);
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
