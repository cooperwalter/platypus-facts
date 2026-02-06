import { describe, expect, test } from "bun:test";
import {
	createSubscriber,
	findByPhoneNumber,
	getActiveCount,
	getActiveSubscribers,
	updateStatus,
} from "./subscribers";
import { makeTestDatabase } from "./test-utils";

describe("subscribers", () => {
	describe("createSubscriber", () => {
		test("inserts a new subscriber with 'pending' status and E.164 phone number", () => {
			const db = makeTestDatabase();
			const phone = "+15551234567";

			const subscriber = createSubscriber(db, phone);

			expect(subscriber.id).toBeGreaterThan(0);
			expect(subscriber.phone_number).toBe(phone);
			expect(subscriber.status).toBe("pending");
			expect(subscriber.created_at).toBeTruthy();
			expect(subscriber.confirmed_at).toBeNull();
			expect(subscriber.unsubscribed_at).toBeNull();
		});

		test("throws when inserting a duplicate phone number due to UNIQUE constraint", () => {
			const db = makeTestDatabase();
			const phone = "+15551234567";

			createSubscriber(db, phone);

			expect(() => createSubscriber(db, phone)).toThrow();
		});
	});

	describe("findByPhoneNumber", () => {
		test("returns the subscriber when the phone number exists in the database", () => {
			const db = makeTestDatabase();
			const phone = "+15551234567";
			const created = createSubscriber(db, phone);

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

	describe("getActiveCount", () => {
		test("counts only subscribers with 'active' status, not 'pending' or 'unsubscribed'", () => {
			const db = makeTestDatabase();

			createSubscriber(db, "+15551111111");
			const active1 = createSubscriber(db, "+15552222222");
			const active2 = createSubscriber(db, "+15553333333");
			const unsubscribed = createSubscriber(db, "+15554444444");

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
			const subscriber = createSubscriber(db, "+15551234567");
			const confirmedAt = new Date().toISOString();

			updateStatus(db, subscriber.id, "active", { confirmed_at: confirmedAt });

			const updated = findByPhoneNumber(db, "+15551234567");
			expect(updated?.status).toBe("active");
			expect(updated?.confirmed_at).toBe(confirmedAt);
			expect(updated?.unsubscribed_at).toBeNull();
		});

		test("updates status to 'unsubscribed' and sets the unsubscribed_at timestamp", () => {
			const db = makeTestDatabase();
			const subscriber = createSubscriber(db, "+15551234567");
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

	describe("getActiveSubscribers", () => {
		test("returns only subscribers with 'active' status", () => {
			const db = makeTestDatabase();

			createSubscriber(db, "+15551111111");
			const active1 = createSubscriber(db, "+15552222222");
			const active2 = createSubscriber(db, "+15553333333");
			const unsubscribed = createSubscriber(db, "+15554444444");

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
	});
});
