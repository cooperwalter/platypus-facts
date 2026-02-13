import { describe, expect, test } from "bun:test";
import {
	createSubscriber,
	findByEmail,
	findByToken,
	getActiveCount,
	getActiveSubscribers,
	getSubscriberCounts,
	updateStatus,
} from "./subscribers";
import { makeTestDatabase } from "./test-utils";

describe("subscribers", () => {
	describe("createSubscriber", () => {
		test("inserts a new subscriber with 'pending' status and email", () => {
			const db = makeTestDatabase();

			const subscriber = createSubscriber(db, "test@example.com");

			expect(subscriber.id).toBeGreaterThan(0);
			expect(subscriber.email).toBe("test@example.com");
			expect(subscriber.token).toBeTruthy();
			expect(subscriber.status).toBe("pending");
			expect(subscriber.created_at).toBeTruthy();
			expect(subscriber.confirmed_at).toBeNull();
			expect(subscriber.unsubscribed_at).toBeNull();
		});

		test("generates a unique token for each subscriber", () => {
			const db = makeTestDatabase();

			const sub1 = createSubscriber(db, "a@example.com");
			const sub2 = createSubscriber(db, "b@example.com");

			expect(sub1.token).not.toBe(sub2.token);
		});

		test("throws when inserting a duplicate email due to UNIQUE constraint", () => {
			const db = makeTestDatabase();
			const email = "test@example.com";

			createSubscriber(db, email);

			expect(() => createSubscriber(db, email)).toThrow();
		});
	});

	describe("findByEmail", () => {
		test("returns the subscriber when the email exists in the database", () => {
			const db = makeTestDatabase();
			const created = createSubscriber(db, "test@example.com");

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
			const created = createSubscriber(db, "test@example.com");

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

			createSubscriber(db, "pending@example.com");
			const active1 = createSubscriber(db, "active1@example.com");
			const active2 = createSubscriber(db, "active2@example.com");
			const unsubscribed = createSubscriber(db, "unsub@example.com");

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
			const subscriber = createSubscriber(db, "test@example.com");
			const confirmedAt = new Date().toISOString();

			updateStatus(db, subscriber.id, "active", { confirmed_at: confirmedAt });

			const updated = findByEmail(db, "test@example.com");
			expect(updated?.status).toBe("active");
			expect(updated?.confirmed_at).toBe(confirmedAt);
			expect(updated?.unsubscribed_at).toBeNull();
		});

		test("updates status to 'unsubscribed' and sets the unsubscribed_at timestamp", () => {
			const db = makeTestDatabase();
			const subscriber = createSubscriber(db, "test@example.com");
			const unsubscribedAt = new Date().toISOString();

			updateStatus(db, subscriber.id, "unsubscribed", {
				unsubscribed_at: unsubscribedAt,
			});

			const updated = findByEmail(db, "test@example.com");
			expect(updated?.status).toBe("unsubscribed");
			expect(updated?.unsubscribed_at).toBe(unsubscribedAt);
			expect(updated?.confirmed_at).toBeNull();
		});
	});

	describe("getActiveSubscribers", () => {
		test("returns only subscribers with 'active' status", () => {
			const db = makeTestDatabase();

			createSubscriber(db, "pending@example.com");
			const active1 = createSubscriber(db, "active1@example.com");
			const active2 = createSubscriber(db, "active2@example.com");
			const unsubscribed = createSubscriber(db, "unsub@example.com");

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
			expect(activeSubscribers.find((s) => s.email === "active1@example.com")).toBeTruthy();
			expect(activeSubscribers.find((s) => s.email === "active2@example.com")).toBeTruthy();
		});

		test("includes email and token fields in returned subscribers", () => {
			const db = makeTestDatabase();
			const sub = createSubscriber(db, "test@example.com");
			updateStatus(db, sub.id, "active", {
				confirmed_at: new Date().toISOString(),
			});

			const activeSubscribers = getActiveSubscribers(db);

			expect(activeSubscribers).toHaveLength(1);
			expect(activeSubscribers[0].email).toBe("test@example.com");
			expect(activeSubscribers[0].token).toBeTruthy();
		});
	});

	describe("getSubscriberCounts", () => {
		test("returns zero counts when no subscribers exist", () => {
			const db = makeTestDatabase();
			const counts = getSubscriberCounts(db);
			expect(counts).toEqual({ active: 0, pending: 0, unsubscribed: 0 });
		});

		test("returns correct counts with mixed subscriber statuses", () => {
			const db = makeTestDatabase();
			const sub1 = createSubscriber(db, "active1@example.com");
			updateStatus(db, sub1.id, "active");
			const sub2 = createSubscriber(db, "active2@example.com");
			updateStatus(db, sub2.id, "active");
			createSubscriber(db, "pending@example.com");
			const sub4 = createSubscriber(db, "unsub@example.com");
			updateStatus(db, sub4.id, "unsubscribed");

			const counts = getSubscriberCounts(db);
			expect(counts.active).toBe(2);
			expect(counts.pending).toBe(1);
			expect(counts.unsubscribed).toBe(1);
		});
	});
});
