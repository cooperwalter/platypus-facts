import type { Database } from "bun:sqlite";
import { createInMemoryDatabase } from "./db";
import type { EmailProvider } from "./email/types";

function makeTestDatabase(): Database {
	return createInMemoryDatabase();
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
		email?: string;
		token?: string;
		status?: "pending" | "active" | "unsubscribed";
		confirmed_at?: string | null;
		unsubscribed_at?: string | null;
	} = {},
): number {
	const email = overrides.email ?? `fan${Date.now()}@example.com`;
	const token = overrides.token ?? crypto.randomUUID();
	const status = overrides.status ?? "pending";
	const result = db
		.prepare(
			"INSERT INTO subscribers (email, token, status, confirmed_at, unsubscribed_at) VALUES (?, ?, ?, ?, ?)",
		)
		.run(email, token, status, overrides.confirmed_at ?? null, overrides.unsubscribed_at ?? null);
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

interface SentEmail {
	to: string;
	subject: string;
	htmlBody: string;
	plainBody?: string;
	headers?: Record<string, string>;
}

interface MockEmailProvider extends EmailProvider {
	sentEmails: SentEmail[];
	reset(): void;
}

function makeMockEmailProvider(): MockEmailProvider {
	const sentEmails: SentEmail[] = [];

	return {
		sentEmails,

		async sendEmail(
			to: string,
			subject: string,
			htmlBody: string,
			plainBody?: string,
			headers?: Record<string, string>,
		): Promise<void> {
			sentEmails.push({ to, subject, htmlBody, plainBody, headers });
		},

		reset() {
			sentEmails.length = 0;
		},
	};
}

export type { MockEmailProvider, SentEmail };
export { makeTestDatabase, makeMockEmailProvider, makeFactRow, makeSubscriberRow, makeSentFactRow };
