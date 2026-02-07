import { describe, expect, test } from "bun:test";
import { findByPhoneNumber } from "./subscribers";
import { handleIncomingMessage, signup } from "./subscription-flow";
import { makeMockSmsProvider, makeSubscriberRow, makeTestDatabase } from "./test-utils";

const BASE_URL = "https://platypusfacts.example.com";

describe("signup", () => {
	test("creates a pending subscriber and sends welcome SMS for new phone number", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();

		const result = await signup(db, sms, "(555) 823-4567", 1000);
		expect(result.success).toBe(true);
		expect(result.message).toContain("check your phone");

		const sub = findByPhoneNumber(db, "+15558234567");
		expect(sub).not.toBeNull();
		expect(sub?.status).toBe("pending");

		expect(sms.sentMessages).toHaveLength(1);
		expect(sms.sentMessages[0].to).toBe("+15558234567");
		expect(sms.sentMessages[0].body).toContain("Welcome to Daily Platypus Facts");
	});

	test("resends welcome SMS when re-signing up while pending", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();
		makeSubscriberRow(db, { phone_number: "+15558234567", status: "pending" });

		const result = await signup(db, sms, "5558234567", 1000);
		expect(result.success).toBe(true);
		expect(result.message).toContain("resent");

		expect(sms.sentMessages).toHaveLength(1);
		expect(sms.sentMessages[0].body).toContain("Welcome to Daily Platypus Facts");
	});

	test("sends already-subscribed SMS when re-signing up while active", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();
		makeSubscriberRow(db, { phone_number: "+15558234567", status: "active" });

		const result = await signup(db, sms, "5558234567", 1000);
		expect(result.success).toBe(true);
		expect(result.message).toContain("already subscribed");

		expect(sms.sentMessages).toHaveLength(1);
		expect(sms.sentMessages[0].body).toContain("already a Platypus Fan");
	});

	test("resets to pending and sends welcome SMS when re-signing up after unsubscribing", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();
		makeSubscriberRow(db, { phone_number: "+15558234567", status: "unsubscribed" });

		const result = await signup(db, sms, "5558234567", 1000);
		expect(result.success).toBe(true);
		expect(result.message).toContain("Welcome back");

		const sub = findByPhoneNumber(db, "+15558234567");
		expect(sub?.status).toBe("pending");

		expect(sms.sentMessages).toHaveLength(1);
		expect(sms.sentMessages[0].body).toContain("Welcome to Daily Platypus Facts");
	});

	test("clears unsubscribed_at timestamp when re-signing up after unsubscribing", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();
		makeSubscriberRow(db, { phone_number: "+15558234567", status: "unsubscribed" });
		db.prepare(
			"UPDATE subscribers SET unsubscribed_at = '2024-01-15T00:00:00.000Z' WHERE phone_number = '+15558234567'",
		).run();

		const sub1 = findByPhoneNumber(db, "+15558234567");
		expect(sub1?.unsubscribed_at).toBe("2024-01-15T00:00:00.000Z");

		await signup(db, sms, "5558234567", 1000);

		const sub2 = findByPhoneNumber(db, "+15558234567");
		expect(sub2?.status).toBe("pending");
		expect(sub2?.unsubscribed_at).toBeNull();
	});

	test("rejects signup when at capacity for new subscriber", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();
		makeSubscriberRow(db, { phone_number: "+15559990001", status: "active" });

		const result = await signup(db, sms, "5558234567", 1);
		expect(result.success).toBe(false);
		expect(result.message).toContain("at capacity");
		expect(sms.sentMessages).toHaveLength(0);
	});

	test("allows unsubscribed re-signup at capacity since pending does not count against cap", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();
		makeSubscriberRow(db, { phone_number: "+15559990001", status: "active" });
		makeSubscriberRow(db, { phone_number: "+15558234567", status: "unsubscribed" });

		const result = await signup(db, sms, "5558234567", 1);
		expect(result.success).toBe(true);
		expect(result.message).toContain("Welcome back");

		const sub = findByPhoneNumber(db, "+15558234567");
		expect(sub?.status).toBe("pending");

		expect(sms.sentMessages).toHaveLength(1);
		expect(sms.sentMessages[0].body).toContain("Welcome to Daily Platypus Facts");
	});

	test("returns validation error for invalid phone number", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();

		const result = await signup(db, sms, "invalid", 1000);
		expect(result.success).toBe(false);
		expect(result.message).toContain("valid US phone number");
		expect(sms.sentMessages).toHaveLength(0);
	});

	test("handles concurrent duplicate signup gracefully via UNIQUE constraint", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();

		db.prepare(
			"INSERT INTO subscribers (phone_number, status) VALUES ('+15558234567', 'pending')",
		).run();

		const result = await signup(db, sms, "5558234567", 1000);
		expect(result.success).toBe(true);
		expect(sms.sentMessages).toHaveLength(1);
	});
});

describe("handleIncomingMessage - confirmation", () => {
	test("activates subscriber when pending subscriber replies '1'", async () => {
		const db = makeTestDatabase();
		makeSubscriberRow(db, { phone_number: "+15558234567", status: "pending" });

		const reply = await handleIncomingMessage(db, "+15558234567", "1", BASE_URL, 1000);
		expect(reply).toContain("Platypus Fan");

		const sub = findByPhoneNumber(db, "+15558234567");
		expect(sub?.status).toBe("active");
		expect(sub?.confirmed_at).not.toBeNull();
	});

	test("activates subscriber when pending subscriber replies 'PERRY'", async () => {
		const db = makeTestDatabase();
		makeSubscriberRow(db, { phone_number: "+15558234567", status: "pending" });

		const reply = await handleIncomingMessage(db, "+15558234567", "PERRY", BASE_URL, 1000);
		expect(reply).toContain("Platypus Fan");

		const sub = findByPhoneNumber(db, "+15558234567");
		expect(sub?.status).toBe("active");
	});

	test("activates subscriber when pending subscriber replies 'perry' (case-insensitive)", async () => {
		const db = makeTestDatabase();
		makeSubscriberRow(db, { phone_number: "+15558234567", status: "pending" });

		const reply = await handleIncomingMessage(db, "+15558234567", "perry", BASE_URL, 1000);
		expect(reply).toContain("Platypus Fan");
	});

	test("activates subscriber when pending subscriber replies ' Perry ' (with whitespace)", async () => {
		const db = makeTestDatabase();
		makeSubscriberRow(db, { phone_number: "+15558234567", status: "pending" });

		const reply = await handleIncomingMessage(db, "+15558234567", " Perry ", BASE_URL, 1000);
		expect(reply).toContain("Platypus Fan");
	});

	test("replies with at-capacity SMS when cap reached since signup", async () => {
		const db = makeTestDatabase();
		makeSubscriberRow(db, { phone_number: "+15558234567", status: "pending" });
		makeSubscriberRow(db, { phone_number: "+15559990001", status: "active" });

		const reply = await handleIncomingMessage(db, "+15558234567", "1", BASE_URL, 1);
		expect(reply).toContain("at capacity");

		const sub = findByPhoneNumber(db, "+15558234567");
		expect(sub?.status).toBe("pending");
	});

	test("replies with help message when active subscriber sends '1'", async () => {
		const db = makeTestDatabase();
		makeSubscriberRow(db, { phone_number: "+15558234567", status: "active" });

		const reply = await handleIncomingMessage(db, "+15558234567", "1", BASE_URL, 1000);
		expect(reply).toContain("Reply 1 or PERRY");
	});

	test("replies with 'visit website' message when unsubscribed subscriber sends 'PERRY'", async () => {
		const db = makeTestDatabase();
		makeSubscriberRow(db, { phone_number: "+15558234567", status: "unsubscribed" });

		const reply = await handleIncomingMessage(db, "+15558234567", "PERRY", BASE_URL, 1000);
		expect(reply).toContain("re-subscribe");
		expect(reply).toContain(BASE_URL);

		const sub = findByPhoneNumber(db, "+15558234567");
		expect(sub?.status).toBe("unsubscribed");
	});
});

describe("handleIncomingMessage - STOP handling", () => {
	test("updates active subscriber to unsubscribed when they send STOP", async () => {
		const db = makeTestDatabase();
		makeSubscriberRow(db, { phone_number: "+15558234567", status: "active" });

		const reply = await handleIncomingMessage(db, "+15558234567", "STOP", BASE_URL, 1000);
		expect(reply).toBeUndefined();

		const sub = findByPhoneNumber(db, "+15558234567");
		expect(sub?.status).toBe("unsubscribed");
		expect(sub?.unsubscribed_at).not.toBeNull();
	});

	test("updates pending subscriber to unsubscribed when they send STOP", async () => {
		const db = makeTestDatabase();
		makeSubscriberRow(db, { phone_number: "+15558234567", status: "pending" });

		const reply = await handleIncomingMessage(db, "+15558234567", "STOP", BASE_URL, 1000);
		expect(reply).toBeUndefined();

		const sub = findByPhoneNumber(db, "+15558234567");
		expect(sub?.status).toBe("unsubscribed");
	});

	test.each(["STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REVOKE", "OPTOUT"])(
		"unsubscribes active subscriber when they send Twilio stop word '%s'",
		async (stopWord) => {
			const db = makeTestDatabase();
			makeSubscriberRow(db, { phone_number: "+15558234567", status: "active" });

			const reply = await handleIncomingMessage(db, "+15558234567", stopWord, BASE_URL, 1000);
			expect(reply).toBeUndefined();

			const sub = findByPhoneNumber(db, "+15558234567");
			expect(sub?.status).toBe("unsubscribed");
		},
	);

	test("returns help message (not unsubscribe action) when unknown sender sends STOP", async () => {
		const db = makeTestDatabase();

		const reply = await handleIncomingMessage(db, "+15559999999", "STOP", BASE_URL, 1000);
		expect(reply).toContain("Reply 1 or PERRY");
	});

	test("unsubscribes subscriber when stop word is lowercase", async () => {
		const db = makeTestDatabase();
		makeSubscriberRow(db, { phone_number: "+15558234567", status: "active" });

		const reply = await handleIncomingMessage(db, "+15558234567", "optout", BASE_URL, 1000);
		expect(reply).toBeUndefined();

		const sub = findByPhoneNumber(db, "+15558234567");
		expect(sub?.status).toBe("unsubscribed");
	});
});

describe("handleIncomingMessage - other messages", () => {
	test("replies with help message for unrecognized text from pending subscriber", async () => {
		const db = makeTestDatabase();
		makeSubscriberRow(db, { phone_number: "+15558234567", status: "pending" });

		const reply = await handleIncomingMessage(db, "+15558234567", "hello", BASE_URL, 1000);
		expect(reply).toContain("Reply 1 or PERRY");
	});

	test("replies with help message for unrecognized text from active subscriber", async () => {
		const db = makeTestDatabase();
		makeSubscriberRow(db, { phone_number: "+15558234567", status: "active" });

		const reply = await handleIncomingMessage(db, "+15558234567", "hello", BASE_URL, 1000);
		expect(reply).toContain("Reply 1 or PERRY");
	});

	test("replies with help message for unknown phone number", async () => {
		const db = makeTestDatabase();

		const reply = await handleIncomingMessage(db, "+15559999999", "hello", BASE_URL, 1000);
		expect(reply).toContain("Reply 1 or PERRY");
	});

	test("replies with 'visit website' message for START from unsubscribed subscriber", async () => {
		const db = makeTestDatabase();
		makeSubscriberRow(db, { phone_number: "+15558234567", status: "unsubscribed" });

		const reply = await handleIncomingMessage(db, "+15558234567", "START", BASE_URL, 1000);
		expect(reply).toContain("re-subscribe");
		expect(reply).toContain(BASE_URL);

		const sub = findByPhoneNumber(db, "+15558234567");
		expect(sub?.status).toBe("unsubscribed");
	});
});
