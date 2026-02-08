import { and, desc, eq } from "drizzle-orm";
import type { DrizzleDatabase } from "../db";
import { devMessages } from "../schema";
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

class DevEmailProvider implements EmailProvider {
	private db: DrizzleDatabase;

	constructor(db: DrizzleDatabase) {
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
			.insert(devMessages)
			.values({ type: "email", recipient: to, subject, body: htmlBody })
			.run();
		console.log(`[DEV EMAIL] To: ${to} | Subject: ${subject}`);
	}

	getStoredEmails(): StoredEmail[] {
		const rows = this.db
			.select()
			.from(devMessages)
			.where(eq(devMessages.type, "email"))
			.orderBy(desc(devMessages.id))
			.all();
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
			.select()
			.from(devMessages)
			.where(and(eq(devMessages.type, "email"), eq(devMessages.id, id)))
			.get();
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
