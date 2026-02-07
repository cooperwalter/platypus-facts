import type { Database } from "bun:sqlite";
import { createInMemoryDatabase } from "./db";
import type { SmsProvider } from "./sms/types";

function makeTestDatabase(): Database {
	return createInMemoryDatabase();
}

interface SentMessage {
	to: string;
	body: string;
	mediaUrl?: string;
}

interface MockSmsProvider extends SmsProvider {
	sentMessages: SentMessage[];
	reset(): void;
}

function makeMockSmsProvider(): MockSmsProvider {
	const sentMessages: SentMessage[] = [];

	return {
		sentMessages,

		async sendSms(to: string, body: string, mediaUrl?: string): Promise<void> {
			sentMessages.push({ to, body, mediaUrl });
		},

		async parseIncomingMessage(request: Request): Promise<{ from: string; body: string }> {
			const formData = await request.formData();
			return {
				from: (formData.get("From") as string) ?? "",
				body: (formData.get("Body") as string) ?? "",
			};
		},

		async validateWebhookSignature(_request: Request): Promise<boolean> {
			return true;
		},

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
		},

		reset() {
			sentMessages.length = 0;
		},
	};
}

function makeFactRow(
	db: Database,
	overrides: {
		text?: string;
		image_path?: string;
		sources?: Array<{ url: string; title?: string }>;
	} = {},
): number {
	const text = overrides.text ?? `Platypuses are amazing fact #${Date.now()}`;
	const imagePath = overrides.image_path ?? null;
	const result = db
		.prepare("INSERT INTO facts (text, image_path) VALUES (?, ?)")
		.run(text, imagePath);
	const factId = Number(result.lastInsertRowid);

	const sources = overrides.sources ?? [
		{ url: "https://example.com/source", title: "Example Source" },
	];
	const insertSource = db.prepare(
		"INSERT INTO fact_sources (fact_id, url, title) VALUES (?, ?, ?)",
	);
	for (const source of sources) {
		insertSource.run(factId, source.url, source.title ?? null);
	}

	return factId;
}

function makeSubscriberRow(
	db: Database,
	overrides: {
		phone_number?: string | null;
		email?: string | null;
		token?: string;
		status?: "pending" | "active" | "unsubscribed";
		confirmed_at?: string | null;
		unsubscribed_at?: string | null;
	} = {},
): number {
	const phone =
		overrides.phone_number === undefined
			? `+1555${String(Date.now()).slice(-7)}`
			: overrides.phone_number;
	const email = overrides.email ?? null;
	const token = overrides.token ?? crypto.randomUUID();
	const status = overrides.status ?? "pending";
	const result = db
		.prepare(
			"INSERT INTO subscribers (phone_number, email, token, status, confirmed_at, unsubscribed_at) VALUES (?, ?, ?, ?, ?, ?)",
		)
		.run(
			phone,
			email,
			token,
			status,
			overrides.confirmed_at ?? null,
			overrides.unsubscribed_at ?? null,
		);
	return Number(result.lastInsertRowid);
}

function makeSentFactRow(
	db: Database,
	overrides: { fact_id?: number; sent_date?: string; cycle?: number } = {},
): number {
	const factId = overrides.fact_id ?? makeFactRow(db);
	const sentDate = overrides.sent_date ?? new Date().toISOString().split("T")[0];
	const cycle = overrides.cycle ?? 1;
	const result = db
		.prepare("INSERT INTO sent_facts (fact_id, sent_date, cycle) VALUES (?, ?, ?)")
		.run(factId, sentDate, cycle);
	return Number(result.lastInsertRowid);
}

export type { MockSmsProvider, SentMessage };
export { makeTestDatabase, makeMockSmsProvider, makeFactRow, makeSubscriberRow, makeSentFactRow };
