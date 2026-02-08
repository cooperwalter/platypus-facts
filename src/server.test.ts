import { describe, expect, test } from "bun:test";
import { desc } from "drizzle-orm";
import { DevEmailProvider } from "./lib/email/dev";
import { createRateLimiter } from "./lib/rate-limiter";
import { devMessages } from "./lib/schema";
import {
	makeFactRow,
	makeMockEmailProvider,
	makeSubscriberRow,
	makeTestDatabase,
} from "./lib/test-utils";
import { createRequestHandler } from "./server";

function makeHandler(
	overrides: {
		devEmail?: boolean;
	} = {},
) {
	const db = makeTestDatabase();
	const emailProvider = makeMockEmailProvider();
	const rateLimiter = createRateLimiter(5, 60 * 60 * 1000);
	const devEmailProvider = overrides.devEmail ? new DevEmailProvider(db) : null;

	const handler = createRequestHandler({
		db,
		emailProvider,
		rateLimiter,
		maxSubscribers: 1000,
		baseUrl: "https://example.com",
		devEmailProvider,
	});

	return { handler, db, emailProvider, rateLimiter };
}

function get(url: string): Request {
	return new Request(`http://localhost${url}`, { method: "GET" });
}

function post(url: string, body?: string): Request {
	return new Request(`http://localhost${url}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-Forwarded-For": "192.168.1.1",
		},
		body: body ?? "{}",
	});
}

describe("createRequestHandler", () => {
	describe("route dispatching", () => {
		test("routes GET / to signup page", async () => {
			const { handler } = makeHandler();
			const response = await handler(get("/"));
			expect(response.status).toBe(200);
			const html = await response.text();
			expect(html).toContain("Daily Platypus Facts");
		});

		test("routes GET /health to health check", async () => {
			const { handler } = makeHandler();
			const response = await handler(get("/health"));
			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body).toEqual({ status: "ok" });
		});

		test("routes POST /api/subscribe to subscribe handler", async () => {
			const { handler } = makeHandler();
			const response = await handler(
				post("/api/subscribe", JSON.stringify({ email: "test@example.com" })),
			);
			expect(response.status).toBe(200);
			const body = (await response.json()) as { success: boolean };
			expect(body.success).toBe(true);
		});

		test("routes GET /facts/:id to fact page for existing fact", async () => {
			const { handler, db } = makeHandler();
			const factId = makeFactRow(db, { text: "Platypuses have venomous spurs" });
			const response = await handler(get(`/facts/${factId}`));
			expect(response.status).toBe(200);
			const html = await response.text();
			expect(html).toContain("Platypuses have venomous spurs");
		});

		test("routes GET /facts/:id to 404 for nonexistent fact", async () => {
			const { handler } = makeHandler();
			const response = await handler(get("/facts/99999"));
			expect(response.status).toBe(404);
		});

		test("routes GET /facts/non-numeric to 404", async () => {
			const { handler } = makeHandler();
			const response = await handler(get("/facts/abc"));
			expect(response.status).toBe(404);
		});

		test("routes GET /confirm/:token to confirmation page", async () => {
			const { handler, db } = makeHandler();
			const token = crypto.randomUUID();
			makeSubscriberRow(db, { token, status: "pending" });
			const response = await handler(get(`/confirm/${token}`));
			expect(response.status).toBe(200);
			const html = await response.text();
			expect(html).toContain("Platypus Fan");
		});

		test("routes GET /unsubscribe/:token to unsubscribe page", async () => {
			const { handler, db } = makeHandler();
			const token = crypto.randomUUID();
			makeSubscriberRow(db, { token, status: "active" });
			const response = await handler(get(`/unsubscribe/${token}`));
			expect(response.status).toBe(200);
			const html = await response.text();
			expect(html).toContain("unsubscribe");
		});

		test("routes POST /unsubscribe/:token to unsubscribe handler", async () => {
			const { handler, db } = makeHandler();
			const token = crypto.randomUUID();
			makeSubscriberRow(db, { token, status: "active" });
			const response = await handler(
				new Request(`http://localhost/unsubscribe/${token}`, { method: "POST" }),
			);
			expect(response.status).toBe(200);
			const html = await response.text();
			expect(html).toContain("unsubscribed");
		});
	});

	describe("static file serving", () => {
		test("serves existing static file from public/", async () => {
			const { handler } = makeHandler();
			const response = await handler(get("/styles.css"));
			expect(response.status).toBe(200);
			const text = await response.text();
			expect(text.length).toBeGreaterThan(0);
		});

		test("serves platypus-icon.svg from public/", async () => {
			const { handler } = makeHandler();
			const response = await handler(get("/platypus-icon.svg"));
			expect(response.status).toBe(200);
			const text = await response.text();
			expect(text).toContain("<svg");
		});

		test("returns 404 for nonexistent static file", async () => {
			const { handler } = makeHandler();
			const response = await handler(get("/nonexistent-file.txt"));
			expect(response.status).toBe(404);
		});

		test("blocks path traversal with ..", async () => {
			const { handler } = makeHandler();
			const response = await handler(get("/../package.json"));
			expect(response.status).toBe(404);
		});

		test("blocks path traversal with encoded ..", async () => {
			const { handler } = makeHandler();
			const response = await handler(get("/..%2Fpackage.json"));
			expect(response.status).toBe(404);
		});
	});

	describe("404 handling", () => {
		test("returns 404 for unknown GET path", async () => {
			const { handler } = makeHandler();
			const response = await handler(get("/nonexistent-route"));
			expect(response.status).toBe(404);
			const text = await response.text();
			expect(text).toBe("Not Found");
		});

		test("returns 404 for unknown POST path", async () => {
			const { handler } = makeHandler();
			const response = await handler(post("/nonexistent-route"));
			expect(response.status).toBe(404);
		});

		test("returns 404 for PUT request", async () => {
			const { handler } = makeHandler();
			const request = new Request("http://localhost/api/subscribe", { method: "PUT" });
			const response = await handler(request);
			expect(response.status).toBe(404);
		});

		test("returns 404 for DELETE request", async () => {
			const { handler } = makeHandler();
			const request = new Request("http://localhost/health", { method: "DELETE" });
			const response = await handler(request);
			expect(response.status).toBe(404);
		});
	});

	describe("dev routes", () => {
		test("enables dev message list when devEmailProvider is set", async () => {
			const { handler } = makeHandler({ devEmail: true });
			const response = await handler(get("/dev/messages"));
			expect(response.status).toBe(200);
			const html = await response.text();
			expect(html).toContain("Sent Emails");
		});

		test("returns 404 for dev routes when dev providers are disabled", async () => {
			const { handler } = makeHandler();
			const response = await handler(get("/dev/messages"));
			expect(response.status).toBe(404);
		});

		test("returns 404 for dev message detail when dev providers are disabled", async () => {
			const { handler } = makeHandler();
			const response = await handler(get("/dev/messages/email-1"));
			expect(response.status).toBe(404);
		});

		test("routes dev message detail with email prefix", async () => {
			const { handler, db } = makeHandler({ devEmail: true });
			db.insert(devMessages)
				.values({
					type: "email",
					recipient: "test@example.com",
					subject: "Subject",
					body: "<p>body</p>",
				})
				.run();
			const row = db.select().from(devMessages).orderBy(desc(devMessages.id)).limit(1).get();
			const response = await handler(get(`/dev/messages/email-${row?.id}`));
			expect(response.status).toBe(200);
		});
	});

	describe("route pattern matching", () => {
		test("rejects confirm token with wrong format", async () => {
			const { handler } = makeHandler();
			const response = await handler(get("/confirm/not-a-uuid"));
			expect(response.status).toBe(404);
		});

		test("rejects unsubscribe token with wrong format", async () => {
			const { handler } = makeHandler();
			const response = await handler(get("/unsubscribe/not-a-uuid"));
			expect(response.status).toBe(404);
		});

		test("accepts valid UUID format for confirm", async () => {
			const { handler, db } = makeHandler();
			const token = "12345678-1234-1234-1234-123456789abc";
			makeSubscriberRow(db, { token, status: "pending" });
			const response = await handler(get(`/confirm/${token}`));
			expect(response.status).toBe(200);
		});

		test("rejects fact ID with trailing path", async () => {
			const { handler } = makeHandler();
			const response = await handler(get("/facts/1/extra"));
			expect(response.status).toBe(404);
		});
	});

	describe("method restrictions", () => {
		test("GET /api/subscribe returns 404", async () => {
			const { handler } = makeHandler();
			const response = await handler(get("/api/subscribe"));
			expect(response.status).toBe(404);
		});

		test("POST / returns 404", async () => {
			const { handler } = makeHandler();
			const response = await handler(post("/"));
			expect(response.status).toBe(404);
		});

		test("POST /health returns 404", async () => {
			const { handler } = makeHandler();
			const response = await handler(post("/health"));
			expect(response.status).toBe(404);
		});

		test("PUT /unsubscribe/:token returns 404", async () => {
			const { handler, db } = makeHandler();
			const token = crypto.randomUUID();
			makeSubscriberRow(db, { token, status: "active" });
			const request = new Request(`http://localhost/unsubscribe/${token}`, { method: "PUT" });
			const response = await handler(request);
			expect(response.status).toBe(404);
		});
	});
});
