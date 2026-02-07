import type { Database } from "bun:sqlite";

interface Subscriber {
	id: number;
	phone_number: string | null;
	email: string | null;
	token: string;
	status: string;
	created_at: string;
	confirmed_at: string | null;
	unsubscribed_at: string | null;
}

const SUBSCRIBER_COLUMNS =
	"id, phone_number, email, token, status, created_at, confirmed_at, unsubscribed_at";

function findByPhoneNumber(db: Database, phone: string): Subscriber | null {
	const stmt = db.prepare(`SELECT ${SUBSCRIBER_COLUMNS} FROM subscribers WHERE phone_number = ?`);
	const result = stmt.get(phone);
	return result ? (result as Subscriber) : null;
}

function findByEmail(db: Database, email: string): Subscriber | null {
	const stmt = db.prepare(`SELECT ${SUBSCRIBER_COLUMNS} FROM subscribers WHERE email = ?`);
	const result = stmt.get(email);
	return result ? (result as Subscriber) : null;
}

function findByToken(db: Database, token: string): Subscriber | null {
	const stmt = db.prepare(`SELECT ${SUBSCRIBER_COLUMNS} FROM subscribers WHERE token = ?`);
	const result = stmt.get(token);
	return result ? (result as Subscriber) : null;
}

function getActiveCount(db: Database): number {
	const stmt = db.prepare("SELECT COUNT(*) as count FROM subscribers WHERE status = 'active'");
	const result = stmt.get() as { count: number };
	return result.count;
}

function createSubscriber(db: Database, options: { phone?: string; email?: string }): Subscriber {
	const token = crypto.randomUUID();
	const stmt = db.prepare(
		`INSERT INTO subscribers (phone_number, email, token, status) VALUES (?, ?, ?, 'pending') RETURNING ${SUBSCRIBER_COLUMNS}`,
	);
	const result = stmt.get(options.phone ?? null, options.email ?? null, token);
	return result as Subscriber;
}

function updateStatus(
	db: Database,
	id: number,
	status: "pending" | "active" | "unsubscribed",
	timestamps?: { confirmed_at?: string; unsubscribed_at?: string | null },
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

function updateContactInfo(
	db: Database,
	id: number,
	info: { phone?: string | null; email?: string | null },
): void {
	const setClauses: string[] = [];
	const params: (number | string | null)[] = [];

	if (info.phone !== undefined) {
		setClauses.push("phone_number = ?");
		params.push(info.phone);
	}

	if (info.email !== undefined) {
		setClauses.push("email = ?");
		params.push(info.email);
	}

	if (setClauses.length === 0) return;

	params.push(id);
	db.prepare(`UPDATE subscribers SET ${setClauses.join(", ")} WHERE id = ?`).run(...params);
}

function getActiveSubscribers(db: Database): Subscriber[] {
	const stmt = db.prepare(`SELECT ${SUBSCRIBER_COLUMNS} FROM subscribers WHERE status = 'active'`);
	const results = stmt.all();
	return results as Subscriber[];
}

export type { Subscriber };
export {
	findByPhoneNumber,
	findByEmail,
	findByToken,
	getActiveCount,
	createSubscriber,
	updateStatus,
	updateContactInfo,
	getActiveSubscribers,
};
