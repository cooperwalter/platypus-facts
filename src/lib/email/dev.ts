import type { Database } from "bun:sqlite";
import type { EmailProvider } from "./types";

interface StoredEmail {
	id: number;
	recipient: string;
	subject: string;
	htmlBody: string;
	plainBody: string | undefined;
	headers: Record<string, string> | undefined;
	timestamp: string;
}

interface DevMessageRow {
	id: number;
	recipient: string;
	subject: string | null;
	body: string;
	created_at: string;
}

class DevEmailProvider implements EmailProvider {
	private db: Database;

	constructor(db: Database) {
		this.db = db;
	}

	async sendEmail(
		to: string,
		subject: string,
		htmlBody: string,
		_plainBody?: string,
		_headers?: Record<string, string>,
	): Promise<void> {
		this.db
			.prepare("INSERT INTO dev_messages (type, recipient, subject, body) VALUES (?, ?, ?, ?)")
			.run("email", to, subject, htmlBody);
		console.log(`[DEV EMAIL] To: ${to} | Subject: ${subject}`);
	}

	getStoredEmails(): StoredEmail[] {
		const rows = this.db
			.query<DevMessageRow, [string]>(
				"SELECT id, recipient, subject, body, created_at FROM dev_messages WHERE type = ? ORDER BY id DESC",
			)
			.all("email");
		return rows.map((row) => ({
			id: row.id,
			recipient: row.recipient,
			subject: row.subject ?? "",
			htmlBody: row.body,
			plainBody: undefined,
			headers: undefined,
			timestamp: row.created_at,
		}));
	}

	getStoredEmailById(id: number): StoredEmail | undefined {
		const row = this.db
			.query<DevMessageRow, [string, number]>(
				"SELECT id, recipient, subject, body, created_at FROM dev_messages WHERE type = ? AND id = ?",
			)
			.get("email", id);
		if (!row) return undefined;
		return {
			id: row.id,
			recipient: row.recipient,
			subject: row.subject ?? "",
			htmlBody: row.body,
			plainBody: undefined,
			headers: undefined,
			timestamp: row.created_at,
		};
	}
}

export type { StoredEmail };
export { DevEmailProvider };
