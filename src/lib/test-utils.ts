import { createInMemoryDatabase } from "./db";
import type { DrizzleDatabase } from "./db";
import type { EmailProvider } from "./email/types";
import { factSources, facts, sentFacts, subscribers } from "./schema";

function makeTestDatabase(): DrizzleDatabase {
	return createInMemoryDatabase().db;
}

function makeFactRow(
	db: DrizzleDatabase,
	overrides: {
		text?: string;
		image_path?: string;
		sources?: Array<{ url: string; title?: string }>;
	} = {},
): number {
	const text = overrides.text ?? `Platypuses are amazing fact #${Date.now()}`;
	const imagePath = overrides.image_path ?? null;
	const inserted = db
		.insert(facts)
		.values({ text, image_path: imagePath })
		.returning({ id: facts.id })
		.get();
	const factId = inserted.id;

	const sourcesData = overrides.sources ?? [
		{ url: "https://example.com/source", title: "Example Source" },
	];
	for (const source of sourcesData) {
		db.insert(factSources)
			.values({ fact_id: factId, url: source.url, title: source.title ?? null })
			.run();
	}

	return factId;
}

function makeSubscriberRow(
	db: DrizzleDatabase,
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
	const inserted = db
		.insert(subscribers)
		.values({
			email,
			token,
			status,
			confirmed_at: overrides.confirmed_at ?? null,
			unsubscribed_at: overrides.unsubscribed_at ?? null,
		})
		.returning({ id: subscribers.id })
		.get();
	return inserted.id;
}

function makeSentFactRow(
	db: DrizzleDatabase,
	overrides: { fact_id?: number; sent_date?: string; cycle?: number } = {},
): number {
	const factId = overrides.fact_id ?? makeFactRow(db);
	const sentDate = overrides.sent_date ?? new Date().toISOString().split("T")[0];
	const cycle = overrides.cycle ?? 1;
	const inserted = db
		.insert(sentFacts)
		.values({ fact_id: factId, sent_date: sentDate, cycle })
		.returning({ id: sentFacts.id })
		.get();
	return inserted.id;
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
