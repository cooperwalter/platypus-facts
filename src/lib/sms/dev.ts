import type { Database } from "bun:sqlite";
import type { SmsProvider } from "./types";

interface StoredSms {
	id: number;
	to: string;
	body: string;
	mediaUrl: string | undefined;
	timestamp: string;
}

interface DevMessageRow {
	id: number;
	recipient: string;
	body: string;
	created_at: string;
}

class DevSmsProvider implements SmsProvider {
	private db: Database;

	constructor(db: Database) {
		this.db = db;
	}

	async sendSms(to: string, body: string, mediaUrl?: string): Promise<void> {
		const smsBody = mediaUrl ? `${body}\n[Media: ${mediaUrl}]` : body;
		this.db
			.prepare("INSERT INTO dev_messages (type, recipient, body) VALUES (?, ?, ?)")
			.run("sms", to, smsBody);
		console.log(`[DEV SMS] To: ${to} | ${body.slice(0, 80)}${body.length > 80 ? "..." : ""}`);
	}

	async parseIncomingMessage(request: Request): Promise<{ from: string; body: string }> {
		const formData = await request.formData();
		return {
			from: (formData.get("From") as string) ?? "",
			body: (formData.get("Body") as string) ?? "",
		};
	}

	async validateWebhookSignature(_request: Request): Promise<boolean> {
		return true;
	}

	createWebhookResponse(message?: string): string {
		if (!message) {
			return "<Response/>";
		}
		const escaped = message
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&apos;");
		return `<Response><Message>${escaped}</Message></Response>`;
	}

	getStoredMessages(): StoredSms[] {
		const rows = this.db
			.query<DevMessageRow, [string]>(
				"SELECT id, recipient, body, created_at FROM dev_messages WHERE type = ? ORDER BY id DESC",
			)
			.all("sms");
		return rows.map((row) => {
			const mediaMatch = row.body.match(/\n\[Media: (.+)\]$/);
			const mediaUrl = mediaMatch ? mediaMatch[1] : undefined;
			const body = mediaMatch ? row.body.slice(0, -mediaMatch[0].length) : row.body;
			return {
				id: row.id,
				to: row.recipient,
				body,
				mediaUrl,
				timestamp: row.created_at,
			};
		});
	}

	getStoredMessageById(id: number): StoredSms | undefined {
		const row = this.db
			.query<DevMessageRow, [string, number]>(
				"SELECT id, recipient, body, created_at FROM dev_messages WHERE type = ? AND id = ?",
			)
			.get("sms", id);
		if (!row) return undefined;
		const mediaMatch = row.body.match(/\n\[Media: (.+)\]$/);
		const mediaUrl = mediaMatch ? mediaMatch[1] : undefined;
		const body = mediaMatch ? row.body.slice(0, -mediaMatch[0].length) : row.body;
		return {
			id: row.id,
			to: row.recipient,
			body,
			mediaUrl,
			timestamp: row.created_at,
		};
	}
}

export type { StoredSms };
export { DevSmsProvider };
