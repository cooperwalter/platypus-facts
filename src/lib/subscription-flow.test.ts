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

	test("rejects signup when at capacity for new subscriber", async () => {
		const db = makeTestDatabase();
		const emailProv = makeMockEmailProvider();
		makeSubscriberRow(db, { email: "existing@example.com", status: "active" });

		const result = await signup(db, emailProv, "new@example.com", 1, BASE_URL);
		expect(result.success).toBe(false);
		expect(result.message).toContain("at capacity");
		expect(emailProv.sentEmails).toHaveLength(0);
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

describe("signup - no input", () => {
	test("rejects when email is not provided", async () => {
		const db = makeTestDatabase();
		const emailProv = makeMockEmailProvider();

		const result = await signup(db, emailProv, undefined, 1000, BASE_URL);
		expect(result.success).toBe(false);
		expect(result.message).toContain("email address");
	});
});
