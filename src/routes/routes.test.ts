import { describe, expect, test } from "bun:test";
import { createRateLimiter } from "../lib/rate-limiter";
import {
	makeFactRow,
	makeMockSmsProvider,
	makeSubscriberRow,
	makeTestDatabase,
} from "../lib/test-utils";
import { handleHealthCheck } from "./health";
import { render404Page, renderFactPage, renderSignupPage } from "./pages";
import { handleSubscribe } from "./subscribe";
import { handleTwilioWebhook } from "./webhook";

describe("GET /health", () => {
	test("returns 200 with ok status", async () => {
		const response = handleHealthCheck();
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body).toEqual({ status: "ok" });
	});
});

describe("POST /api/subscribe", () => {
	function makeRequest(body: string, headers?: Record<string, string>): Request {
		return new Request("http://localhost/api/subscribe", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Forwarded-For": "192.168.1.1",
				...headers,
			},
			body,
		});
	}

	test("returns success JSON for valid phone number", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();
		const limiter = createRateLimiter(5, 60 * 60 * 1000);

		const request = makeRequest(JSON.stringify({ phoneNumber: "5552345678" }));
		const response = await handleSubscribe(request, db, sms, limiter, 1000);
		const body = (await response.json()) as Record<string, unknown>;

		expect(response.status).toBe(200);
		expect(body.success).toBe(true);
		expect(typeof body.message).toBe("string");
	});

	test("returns error JSON for invalid phone number", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();
		const limiter = createRateLimiter(5, 60 * 60 * 1000);

		const request = makeRequest(JSON.stringify({ phoneNumber: "123" }));
		const response = await handleSubscribe(request, db, sms, limiter, 1000);
		const body = (await response.json()) as Record<string, unknown>;

		expect(response.status).toBe(200);
		expect(body.success).toBe(false);
		expect(typeof body.error).toBe("string");
	});

	test("returns 400 for malformed JSON body", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();
		const limiter = createRateLimiter(5, 60 * 60 * 1000);

		const request = makeRequest("not json");
		const response = await handleSubscribe(request, db, sms, limiter, 1000);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body).toEqual({ success: false, error: "Invalid request body" });
	});

	test("returns 400 for missing phoneNumber field", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();
		const limiter = createRateLimiter(5, 60 * 60 * 1000);

		const request = makeRequest(JSON.stringify({ phone: "5551234567" }));
		const response = await handleSubscribe(request, db, sms, limiter, 1000);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body).toEqual({ success: false, error: "Invalid request body" });
	});

	test("returns 429 when rate limited", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();
		const limiter = createRateLimiter(2, 60 * 60 * 1000);

		for (let i = 0; i < 2; i++) {
			const req = makeRequest(JSON.stringify({ phoneNumber: "5551234567" }));
			await handleSubscribe(req, db, sms, limiter, 1000);
		}

		const request = makeRequest(JSON.stringify({ phoneNumber: "5551234567" }));
		const response = await handleSubscribe(request, db, sms, limiter, 1000);
		const body = await response.json();

		expect(response.status).toBe(429);
		expect(body).toEqual({ success: false, error: "Too many requests. Please try again later." });
	});

	test("returns success:false when at capacity", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();
		const limiter = createRateLimiter(5, 60 * 60 * 1000);

		makeSubscriberRow(db, { phone_number: "+15559999999", status: "active" });

		const request = makeRequest(JSON.stringify({ phoneNumber: "5551234567" }));
		const response = await handleSubscribe(request, db, sms, limiter, 1);
		const body = (await response.json()) as Record<string, unknown>;

		expect(response.status).toBe(200);
		expect(body.success).toBe(false);
		expect(typeof body.error).toBe("string");
	});
});

describe("POST /api/webhooks/twilio/incoming", () => {
	function makeWebhookRequest(from: string, body: string): Request {
		const formData = new URLSearchParams();
		formData.set("From", from);
		formData.set("Body", body);

		return new Request("http://localhost/api/webhooks/twilio/incoming", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: formData.toString(),
		});
	}

	test("processes valid webhook and returns TwiML XML", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();
		makeSubscriberRow(db, { phone_number: "+15551234567", status: "pending" });

		const request = makeWebhookRequest("+15551234567", "1");
		const response = await handleTwilioWebhook(request, db, sms, "https://example.com", 1000);

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("text/xml");
		const text = await response.text();
		expect(text).toContain("<Response>");
	});

	test("returns 403 when webhook signature is invalid", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();
		sms.validateWebhookSignature = async () => false;

		const request = makeWebhookRequest("+15551234567", "1");
		const response = await handleTwilioWebhook(request, db, sms, "https://example.com", 1000);

		expect(response.status).toBe(403);
	});
});

describe("GET /", () => {
	test("returns HTML with signup form", async () => {
		const db = makeTestDatabase();
		const response = renderSignupPage(db, 1000);

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");

		const html = await response.text();
		expect(html).toContain("Daily Platypus Facts");
		expect(html).toContain("signup-form");
		expect(html).toContain('type="tel"');
	});

	test("renders current Platypus Fan count and max capacity", async () => {
		const db = makeTestDatabase();
		makeSubscriberRow(db, { phone_number: "+15551234567", status: "active" });
		makeSubscriberRow(db, { phone_number: "+15559876543", status: "active" });
		makeSubscriberRow(db, { phone_number: "+15550001111", status: "pending" });

		const response = renderSignupPage(db, 1000);
		const html = await response.text();

		expect(html).toContain("2");
		expect(html).toContain("1,000");
		expect(html).toContain("Platypus Fans");
	});

	test("renders capacity message instead of signup form when at capacity", async () => {
		const db = makeTestDatabase();
		makeSubscriberRow(db, { phone_number: "+15551234567", status: "active" });

		const response = renderSignupPage(db, 1);
		const html = await response.text();

		expect(html).toContain("at capacity");
		expect(html).not.toContain("<form");
	});
});

describe("GET /facts/:id", () => {
	test("returns HTML with fact content and sources for valid ID", async () => {
		const db = makeTestDatabase();
		const factId = makeFactRow(db, {
			text: "Platypuses glow under UV light",
			sources: [{ url: "https://example.com/uv", title: "UV Study" }],
		});

		const response = renderFactPage(db, factId);
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
		expect(html).toContain("Platypuses glow under UV light");
		expect(html).toContain("UV Study");
		expect(html).toContain("https://example.com/uv");
		expect(html).toContain("Daily Platypus Facts");
		expect(html).toContain("Life is Strange: Double Exposure");
	});

	test("returns 404 for nonexistent numeric ID", () => {
		const db = makeTestDatabase();
		const response = renderFactPage(db, 99999);
		expect(response.status).toBe(404);
	});

	test("render404Page returns a 404 response with helpful content", async () => {
		const response = render404Page();
		expect(response.status).toBe(404);
		const html = await response.text();
		expect(html).toContain("404");
		expect(html).toContain("Daily Platypus Facts");
	});
});
