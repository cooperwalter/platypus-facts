import type { Database } from "bun:sqlite";

interface Subscriber {
	id: number;
	phone_number: string;
	status: string;
	created_at: string;
	confirmed_at: string | null;
	unsubscribed_at: string | null;
}

function findByPhoneNumber(db: Database, phone: string): Subscriber | null {
	const stmt = db.prepare(
		"SELECT id, phone_number, status, created_at, confirmed_at, unsubscribed_at FROM subscribers WHERE phone_number = ?",
	);
	const result = stmt.get(phone);
	return result ? (result as Subscriber) : null;
}

function getActiveCount(db: Database): number {
	const stmt = db.prepare("SELECT COUNT(*) as count FROM subscribers WHERE status = 'active'");
	const result = stmt.get() as { count: number };
	return result.count;
}

function createSubscriber(db: Database, phone: string): Subscriber {
	const stmt = db.prepare(
		"INSERT INTO subscribers (phone_number, status) VALUES (?, 'pending') RETURNING id, phone_number, status, created_at, confirmed_at, unsubscribed_at",
	);
	const result = stmt.get(phone);
	return result as Subscriber;
}

function updateStatus(
	db: Database,
	id: number,
	status: "pending" | "active" | "unsubscribed",
	timestamps?: { confirmed_at?: string; unsubscribed_at?: string },
): void {
	const params: (number | string | null)[] = [status];
	let sql = "UPDATE subscribers SET status = ?";

	if (timestamps?.confirmed_at !== undefined) {
		sql += ", confirmed_at = ?";
		params.push(timestamps.confirmed_at);
	}

	if (timestamps?.unsubscribed_at !== undefined) {
		sql += ", unsubscribed_at = ?";
		params.push(timestamps.unsubscribed_at);
	}

	sql += " WHERE id = ?";
	params.push(id);

	const stmt = db.prepare(sql);
	stmt.run(...params);
}

function getActiveSubscribers(db: Database): Subscriber[] {
	const stmt = db.prepare(
		"SELECT id, phone_number, status, created_at, confirmed_at, unsubscribed_at FROM subscribers WHERE status = 'active'",
	);
	const results = stmt.all();
	return results as Subscriber[];
}

export type { Subscriber };
export { findByPhoneNumber, getActiveCount, createSubscriber, updateStatus, getActiveSubscribers };
