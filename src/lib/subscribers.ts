import { count, eq } from "drizzle-orm";
import type { DrizzleDatabase } from "./db";
import { subscribers } from "./schema";

interface Subscriber {
	id: number;
	email: string;
	token: string;
	status: string;
	created_at: string;
	confirmed_at: string | null;
	unsubscribed_at: string | null;
}

function findByEmail(db: DrizzleDatabase, email: string): Subscriber | null {
	return db.select().from(subscribers).where(eq(subscribers.email, email)).get() ?? null;
}

function findByToken(db: DrizzleDatabase, token: string): Subscriber | null {
	return db.select().from(subscribers).where(eq(subscribers.token, token)).get() ?? null;
}

function getActiveCount(db: DrizzleDatabase): number {
	const row = db
		.select({ count: count() })
		.from(subscribers)
		.where(eq(subscribers.status, "active"))
		.get();
	return row?.count ?? 0;
}

function createSubscriber(db: DrizzleDatabase, email: string): Subscriber {
	const token = crypto.randomUUID();
	return db.insert(subscribers).values({ email, token, status: "pending" }).returning().get();
}

function updateStatus(
	db: DrizzleDatabase,
	id: number,
	status: "pending" | "active" | "unsubscribed",
	timestamps?: { confirmed_at?: string; unsubscribed_at?: string | null },
): void {
	const values: Record<string, string | null> = { status };

	if (timestamps?.confirmed_at !== undefined) {
		values.confirmed_at = timestamps.confirmed_at;
	}

	if (timestamps?.unsubscribed_at !== undefined) {
		values.unsubscribed_at = timestamps.unsubscribed_at;
	}

	db.update(subscribers).set(values).where(eq(subscribers.id, id)).run();
}

function getActiveSubscribers(db: DrizzleDatabase): Subscriber[] {
	return db.select().from(subscribers).where(eq(subscribers.status, "active")).all();
}

function getSubscriberCounts(db: DrizzleDatabase): {
	active: number;
	pending: number;
	unsubscribed: number;
} {
	const rows = db
		.select({ status: subscribers.status, count: count() })
		.from(subscribers)
		.groupBy(subscribers.status)
		.all();

	const counts = { active: 0, pending: 0, unsubscribed: 0 };
	for (const row of rows) {
		if (row.status === "active" || row.status === "pending" || row.status === "unsubscribed") {
			counts[row.status] = row.count;
		}
	}
	return counts;
}

export type { Subscriber };
export {
	findByEmail,
	findByToken,
	getActiveCount,
	getSubscriberCounts,
	createSubscriber,
	updateStatus,
	getActiveSubscribers,
};
