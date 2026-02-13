import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { subscribers } from "./schema";
import { findByEmail } from "./subscribers";
import { signup } from "./subscription-flow";
import { makeMockEmailProvider, makeSubscriberRow, makeTestDatabase } from "./test-utils";

const BASE_URL = "https://platypusfacts.example.com";

describe("signup - email", () => {
	test("creates a pending subscriber and sends confirmation email for new email", async () => {
		const db = makeTestDatabase();
		const emailProv = makeMockEmailProvider();

		const result = await signup(db, emailProv, "test@example.com", 1000, BASE_URL);
		expect(result.success).toBe(true);
		expect(result.message).toContain("check your email");

		const sub = findByEmail(db, "test@example.com");
		expect(sub).not.toBeNull();
		expect(sub?.status).toBe("pending");

		expect(emailProv.sentEmails).toHaveLength(1);
		expect(emailProv.sentEmails[0].to).toBe("test@example.com");
		expect(emailProv.sentEmails[0].subject).toContain("Confirm");
	});

	test("returns validation error for invalid email", async () => {
		const db = makeTestDatabase();
		const emailProv = makeMockEmailProvider();

		const result = await signup(db, emailProv, "notanemail", 1000, BASE_URL);
		expect(result.success).toBe(false);
		expect(result.message).toContain("valid email");
	});

	test("resends confirmation email when re-signing up while pending", async () => {
		const db = makeTestDatabase();
		const emailProv = makeMockEmailProvider();
		makeSubscriberRow(db, { email: "test@example.com", status: "pending" });

		const result = await signup(db, emailProv, "test@example.com", 1000, BASE_URL);
		expect(result.success).toBe(true);
		expect(result.message).toContain("resent");
		expect(emailProv.sentEmails).toHaveLength(1);
	});

	test("sends already-subscribed email when re-signing up while active", async () => {
		const db = makeTestDatabase();
		const emailProv = makeMockEmailProvider();
		makeSubscriberRow(db, { email: "test@example.com", status: "active" });

		const result = await signup(db, emailProv, "test@example.com", 1000, BASE_URL);
		expect(result.success).toBe(true);
		expect(result.message).toContain("already subscribed");
		expect(emailProv.sentEmails).toHaveLength(1);
		expect(emailProv.sentEmails[0].subject).toContain("Platypus Fan");
	});

	test("resets to pending and sends confirmation email when re-signing up after unsubscribing", async () => {
		const db = makeTestDatabase();
		const emailProv = makeMockEmailProvider();
		makeSubscriberRow(db, { email: "test@example.com", status: "unsubscribed" });

		const result = await signup(db, emailProv, "test@example.com", 1000, BASE_URL);
		expect(result.success).toBe(true);
		expect(result.message).toContain("Welcome back");

		const sub = findByEmail(db, "test@example.com");
		expect(sub?.status).toBe("pending");

		expect(emailProv.sentEmails).toHaveLength(1);
	});

	test("clears unsubscribed_at timestamp when re-signing up after unsubscribing", async () => {
		const db = makeTestDatabase();
		const emailProv = makeMockEmailProvider();
		makeSubscriberRow(db, { email: "test@example.com", status: "unsubscribed" });
		db.update(subscribers)
			.set({ unsubscribed_at: "2024-01-15T00:00:00.000Z" })
			.where(eq(subscribers.email, "test@example.com"))
			.run();

		await signup(db, emailProv, "test@example.com", 1000, BASE_URL);

		const sub = findByEmail(db, "test@example.com");
		expect(sub?.status).toBe("pending");
		expect(sub?.unsubscribed_at).toBeNull();
	});

	test("preserves confirmed_at when re-signing up after unsubscribing so returning subscribers are distinguished from first-time", async () => {
		const db = makeTestDatabase();
		const emailProv = makeMockEmailProvider();
		const confirmedTimestamp = "2024-06-01T12:00:00.000Z";
		makeSubscriberRow(db, { email: "test@example.com", status: "unsubscribed" });
		db.update(subscribers)
			.set({ confirmed_at: confirmedTimestamp, unsubscribed_at: "2024-07-01T00:00:00.000Z" })
			.where(eq(subscribers.email, "test@example.com"))
			.run();

		await signup(db, emailProv, "test@example.com", 1000, BASE_URL);

		const sub = findByEmail(db, "test@example.com");
		expect(sub?.status).toBe("pending");
		expect(sub?.confirmed_at).toBe(confirmedTimestamp);
		expect(sub?.unsubscribed_at).toBeNull();
	});

	test("rejects signup when at capacity for new subscriber", async () => {
		const db = makeTestDatabase();
		const emailProv = makeMockEmailProvider();
		makeSubscriberRow(db, { email: "existing@example.com", status: "active" });

		const result = await signup(db, emailProv, "new@example.com", 1, BASE_URL);
		expect(result.success).toBe(false);
		expect(result.message).toContain("at capacity");
		expect(emailProv.sentEmails).toHaveLength(0);
	});

	test("allows pending re-signup at capacity since subscriber already exists in system", async () => {
		const db = makeTestDatabase();
		const emailProv = makeMockEmailProvider();
		makeSubscriberRow(db, { email: "existing@example.com", status: "active" });
		makeSubscriberRow(db, { email: "test@example.com", status: "pending" });

		const result = await signup(db, emailProv, "test@example.com", 1, BASE_URL);
		expect(result.success).toBe(true);
		expect(result.message).toContain("resent");
		expect(emailProv.sentEmails).toHaveLength(1);
		expect(emailProv.sentEmails[0].subject).toContain("Confirm");
	});

	test("allows unsubscribed re-signup at capacity since pending does not count against cap", async () => {
		const db = makeTestDatabase();
		const emailProv = makeMockEmailProvider();
		makeSubscriberRow(db, { email: "existing@example.com", status: "active" });
		makeSubscriberRow(db, { email: "test@example.com", status: "unsubscribed" });

		const result = await signup(db, emailProv, "test@example.com", 1, BASE_URL);
		expect(result.success).toBe(true);
		expect(result.message).toContain("Welcome back");

		const sub = findByEmail(db, "test@example.com");
		expect(sub?.status).toBe("pending");
	});

	test("handles concurrent duplicate signup gracefully via UNIQUE constraint", async () => {
		const db = makeTestDatabase();
		const emailProv = makeMockEmailProvider();

		db.insert(subscribers)
			.values({ email: "test@example.com", token: "tok-race", status: "pending" })
			.run();

		const result = await signup(db, emailProv, "test@example.com", 1000, BASE_URL);
		expect(result.success).toBe(true);
		expect(emailProv.sentEmails).toHaveLength(1);
	});
});

describe("signup - List-Unsubscribe headers", () => {
	test("includes List-Unsubscribe and List-Unsubscribe-Post headers on confirmation email for new subscriber", async () => {
		const db = makeTestDatabase();
		const emailProv = makeMockEmailProvider();

		await signup(db, emailProv, "new@example.com", 1000, BASE_URL);

		expect(emailProv.sentEmails).toHaveLength(1);
		const sent = emailProv.sentEmails[0];
		expect(sent.headers?.["List-Unsubscribe"]).toBeDefined();
		expect(sent.headers?.["List-Unsubscribe"]).toContain("/unsubscribe/");
		expect(sent.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
	});

	test("includes List-Unsubscribe and List-Unsubscribe-Post headers on re-sent confirmation email for pending subscriber", async () => {
		const db = makeTestDatabase();
		const emailProv = makeMockEmailProvider();
		makeSubscriberRow(db, { email: "pending@example.com", status: "pending" });

		await signup(db, emailProv, "pending@example.com", 1000, BASE_URL);

		expect(emailProv.sentEmails).toHaveLength(1);
		const sent = emailProv.sentEmails[0];
		expect(sent.headers?.["List-Unsubscribe"]).toBeDefined();
		expect(sent.headers?.["List-Unsubscribe"]).toContain("/unsubscribe/");
		expect(sent.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
	});

	test("includes List-Unsubscribe and List-Unsubscribe-Post headers on already-subscribed email for active subscriber", async () => {
		const db = makeTestDatabase();
		const emailProv = makeMockEmailProvider();
		makeSubscriberRow(db, {
			email: "active@example.com",
			status: "active",
			token: "active-token-1234",
		});

		await signup(db, emailProv, "active@example.com", 1000, BASE_URL);

		expect(emailProv.sentEmails).toHaveLength(1);
		const sent = emailProv.sentEmails[0];
		expect(sent.headers?.["List-Unsubscribe"]).toContain("active-token-1234");
		expect(sent.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
	});

	test("includes List-Unsubscribe and List-Unsubscribe-Post headers on confirmation email for re-subscribing user", async () => {
		const db = makeTestDatabase();
		const emailProv = makeMockEmailProvider();
		makeSubscriberRow(db, { email: "unsub@example.com", status: "unsubscribed" });

		await signup(db, emailProv, "unsub@example.com", 1000, BASE_URL);

		expect(emailProv.sentEmails).toHaveLength(1);
		const sent = emailProv.sentEmails[0];
		expect(sent.headers?.["List-Unsubscribe"]).toBeDefined();
		expect(sent.headers?.["List-Unsubscribe"]).toContain("/unsubscribe/");
		expect(sent.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
	});
});

describe("signup - no input", () => {
	test("rejects when email is not provided", async () => {
		const db = makeTestDatabase();
		const emailProv = makeMockEmailProvider();

		const result = await signup(db, emailProv, undefined, 1000, BASE_URL);
		expect(result.success).toBe(false);
		expect(result.message).toContain("email address");
	});
});
