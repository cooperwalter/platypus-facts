import { describe, expect, test } from "bun:test";
import {
	createSubscriber,
	findByEmail,
	findByPhoneNumber,
	findByToken,
	getActiveCount,
	getActiveSubscribers,
	updateContactInfo,
	updateStatus,
} from "./subscribers";
import { makeTestDatabase } from "./test-utils";

describe("subscribers", () => {
	describe("createSubscriber", () => {
		test("inserts a new subscriber with 'pending' status and E.164 phone number", () => {
			const db = makeTestDatabase();
			const phone = "+15551234567";

			const subscriber = createSubscriber(db, { phone });

			expect(subscriber.id).toBeGreaterThan(0);
			expect(subscriber.phone_number).toBe(phone);
			expect(subscriber.email).toBeNull();
			expect(subscriber.token).toBeTruthy();
			expect(subscriber.status).toBe("pending");
			expect(subscriber.created_at).toBeTruthy();
			expect(subscriber.confirmed_at).toBeNull();
			expect(subscriber.unsubscribed_at).toBeNull();
		});

		test("inserts a subscriber with email only", () => {
			const db = makeTestDatabase();

			const subscriber = createSubscriber(db, { email: "test@example.com" });

			expect(subscriber.phone_number).toBeNull();
			expect(subscriber.email).toBe("test@example.com");
			expect(subscriber.token).toBeTruthy();
			expect(subscriber.status).toBe("pending");
		});

		test("inserts a subscriber with both phone and email", () => {
			const db = makeTestDatabase();

			const subscriber = createSubscriber(db, {
				phone: "+15551234567",
				email: "test@example.com",
			});

			expect(subscriber.phone_number).toBe("+15551234567");
			expect(subscriber.email).toBe("test@example.com");
			expect(subscriber.token).toBeTruthy();
		});

		test("generates a unique token for each subscriber", () => {
			const db = makeTestDatabase();

			const sub1 = createSubscriber(db, { phone: "+15551234567" });
			const sub2 = createSubscriber(db, { phone: "+15559876543" });

			expect(sub1.token).not.toBe(sub2.token);
		});

		test("throws when inserting a duplicate phone number due to UNIQUE constraint", () => {
			const db = makeTestDatabase();
			const phone = "+15551234567";

			createSubscriber(db, { phone });

			expect(() => createSubscriber(db, { phone })).toThrow();
		});

		test("throws when inserting a duplicate email due to UNIQUE constraint", () => {
			const db = makeTestDatabase();
			const email = "test@example.com";

			createSubscriber(db, { email });

			expect(() => createSubscriber(db, { email })).toThrow();
		});
	});

	describe("findByPhoneNumber", () => {
		test("returns the subscriber when the phone number exists in the database", () => {
			const db = makeTestDatabase();
			const phone = "+15551234567";
			const created = createSubscriber(db, { phone });

			const found = findByPhoneNumber(db, phone);

			expect(found).not.toBeNull();
			expect(found?.id).toBe(created.id);
			expect(found?.phone_number).toBe(phone);
			expect(found?.status).toBe("pending");
		});

		test("returns null when the phone number does not exist in the database", () => {
			const db = makeTestDatabase();

			const found = findByPhoneNumber(db, "+15551234567");

			expect(found).toBeNull();
		});
	});

	describe("findByEmail", () => {
		test("returns the subscriber when the email exists in the database", () => {
			const db = makeTestDatabase();
			const created = createSubscriber(db, { email: "test@example.com" });

			const found = findByEmail(db, "test@example.com");

			expect(found).not.toBeNull();
			expect(found?.id).toBe(created.id);
			expect(found?.email).toBe("test@example.com");
		});

		test("returns null when the email does not exist in the database", () => {
			const db = makeTestDatabase();

			const found = findByEmail(db, "nonexistent@example.com");

			expect(found).toBeNull();
		});
	});

	describe("findByToken", () => {
		test("returns the subscriber when the token exists in the database", () => {
			const db = makeTestDatabase();
			const created = createSubscriber(db, { phone: "+15551234567" });

			const found = findByToken(db, created.token);

			expect(found).not.toBeNull();
			expect(found?.id).toBe(created.id);
			expect(found?.token).toBe(created.token);
		});

		test("returns null when the token does not exist in the database", () => {
			const db = makeTestDatabase();

			const found = findByToken(db, "nonexistent-token");

			expect(found).toBeNull();
		});
	});

	describe("getActiveCount", () => {
		test("counts only subscribers with 'active' status, not 'pending' or 'unsubscribed'", () => {
			const db = makeTestDatabase();

			createSubscriber(db, { phone: "+15551111111" });
			const active1 = createSubscriber(db, { phone: "+15552222222" });
			const active2 = createSubscriber(db, { phone: "+15553333333" });
			const unsubscribed = createSubscriber(db, { phone: "+15554444444" });

			updateStatus(db, active1.id, "active", {
				confirmed_at: new Date().toISOString(),
			});
			updateStatus(db, active2.id, "active", {
				confirmed_at: new Date().toISOString(),
			});
			updateStatus(db, unsubscribed.id, "unsubscribed", {
				unsubscribed_at: new Date().toISOString(),
			});

			const count = getActiveCount(db);

			expect(count).toBe(2);
		});
	});

	describe("updateStatus", () => {
		test("updates status to 'active' and sets the confirmed_at timestamp", () => {
			const db = makeTestDatabase();
			const subscriber = createSubscriber(db, { phone: "+15551234567" });
			const confirmedAt = new Date().toISOString();

			updateStatus(db, subscriber.id, "active", { confirmed_at: confirmedAt });

			const updated = findByPhoneNumber(db, "+15551234567");
			expect(updated?.status).toBe("active");
			expect(updated?.confirmed_at).toBe(confirmedAt);
			expect(updated?.unsubscribed_at).toBeNull();
		});

		test("updates status to 'unsubscribed' and sets the unsubscribed_at timestamp", () => {
			const db = makeTestDatabase();
			const subscriber = createSubscriber(db, { phone: "+15551234567" });
			const unsubscribedAt = new Date().toISOString();

			updateStatus(db, subscriber.id, "unsubscribed", {
				unsubscribed_at: unsubscribedAt,
			});

			const updated = findByPhoneNumber(db, "+15551234567");
			expect(updated?.status).toBe("unsubscribed");
			expect(updated?.unsubscribed_at).toBe(unsubscribedAt);
			expect(updated?.confirmed_at).toBeNull();
		});
	});

	describe("updateContactInfo", () => {
		test("updates phone number on an existing subscriber", () => {
			const db = makeTestDatabase();
			const sub = createSubscriber(db, { phone: "+15551234567" });

			updateContactInfo(db, sub.id, { phone: "+15559876543" });

			const updated = findByPhoneNumber(db, "+15559876543");
			expect(updated).not.toBeNull();
			expect(updated?.id).toBe(sub.id);
		});

		test("adds email to an existing phone-only subscriber", () => {
			const db = makeTestDatabase();
			const sub = createSubscriber(db, { phone: "+15551234567" });

			updateContactInfo(db, sub.id, { email: "new@example.com" });

			const updated = findByEmail(db, "new@example.com");
			expect(updated).not.toBeNull();
			expect(updated?.id).toBe(sub.id);
			expect(updated?.phone_number).toBe("+15551234567");
		});

		test("clears phone number by passing null", () => {
			const db = makeTestDatabase();
			const sub = createSubscriber(db, {
				phone: "+15551234567",
				email: "test@example.com",
			});

			updateContactInfo(db, sub.id, { phone: null });

			const updated = findByToken(db, sub.token);
			expect(updated?.phone_number).toBeNull();
			expect(updated?.email).toBe("test@example.com");
		});

		test("does nothing when called with no fields to update", () => {
			const db = makeTestDatabase();
			const sub = createSubscriber(db, { phone: "+15551234567" });

			updateContactInfo(db, sub.id, {});

			const updated = findByPhoneNumber(db, "+15551234567");
			expect(updated?.phone_number).toBe("+15551234567");
		});
	});

	describe("getActiveSubscribers", () => {
		test("returns only subscribers with 'active' status", () => {
			const db = makeTestDatabase();

			createSubscriber(db, { phone: "+15551111111" });
			const active1 = createSubscriber(db, { phone: "+15552222222" });
			const active2 = createSubscriber(db, { phone: "+15553333333" });
			const unsubscribed = createSubscriber(db, { phone: "+15554444444" });

			updateStatus(db, active1.id, "active", {
				confirmed_at: new Date().toISOString(),
			});
			updateStatus(db, active2.id, "active", {
				confirmed_at: new Date().toISOString(),
			});
			updateStatus(db, unsubscribed.id, "unsubscribed", {
				unsubscribed_at: new Date().toISOString(),
			});

			const activeSubscribers = getActiveSubscribers(db);

			expect(activeSubscribers).toHaveLength(2);
			expect(activeSubscribers.every((s) => s.status === "active")).toBe(true);
			expect(activeSubscribers.find((s) => s.phone_number === "+15552222222")).toBeTruthy();
			expect(activeSubscribers.find((s) => s.phone_number === "+15553333333")).toBeTruthy();
		});

		test("includes email and token fields in returned subscribers", () => {
			const db = makeTestDatabase();
			const sub = createSubscriber(db, {
				phone: "+15551234567",
				email: "test@example.com",
			});
			updateStatus(db, sub.id, "active", {
				confirmed_at: new Date().toISOString(),
			});

			const activeSubscribers = getActiveSubscribers(db);

			expect(activeSubscribers).toHaveLength(1);
			expect(activeSubscribers[0].email).toBe("test@example.com");
			expect(activeSubscribers[0].token).toBeTruthy();
		});
	});
});
