import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createRateLimiter } from "../lib/rate-limiter";
import { subscribers } from "../lib/schema";
import {
	makeFactRow,
	makeMockEmailProvider,
	makeSentFactRow,
	makeSubscriberRow,
	makeTestDatabase,
} from "../lib/test-utils";
import { createRequestHandler, getCacheControl } from "../server";
import { formatUptime, handleHealthCheck } from "./health";
import {
	handleUnsubscribe,
	render404Page,
	renderAboutPage,
	renderConfirmationPage,
	renderDevEmailDetail,
	renderDevMessageList,
	renderFactPage,
	renderInspirationPage,
	renderSignupPage,
	renderUnsubscribePage,
} from "./pages";
import { getClientIp, handleSubscribe } from "./subscribe";

const BASE_URL = "https://example.com";

describe("GET /health", () => {
	test("returns 200 with ok status when detail is not requested", async () => {
		const db = makeTestDatabase();
		const request = new Request("http://localhost/health");
		const response = handleHealthCheck(request, db, "/tmp/nonexistent.db", Date.now());
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body).toEqual({ status: "ok" });
	});

	test("returns detailed metrics when detail=true", async () => {
		const db = makeTestDatabase();
		makeFactRow(db, { text: "Fact 1", image_path: "images/facts/1.png" });
		makeFactRow(db, { text: "Fact 2" });
		makeSubscriberRow(db, { email: "active@example.com", status: "active" });
		makeSubscriberRow(db, { email: "pending@example.com", status: "pending" });
		makeSentFactRow(db, { fact_id: 1, sent_date: "2025-01-15", cycle: 1 });

		const request = new Request("http://localhost/health?detail=true");
		const response = handleHealthCheck(request, db, "/tmp/nonexistent.db", Date.now() - 90000);
		expect(response.status).toBe(200);
		const body = (await response.json()) as Record<string, unknown>;
		expect(body.status).toBe("ok");
		expect(body.subscribers).toEqual({ active: 1, pending: 1, unsubscribed: 0 });
		const facts = body.facts as Record<string, number>;
		expect(facts.total).toBe(2);
		expect(facts.withImages).toBe(1);
		expect(facts.currentCycle).toBe(1);
		const lastSend = body.lastSend as Record<string, unknown>;
		expect(lastSend.date).toBe("2025-01-15");
		expect(lastSend.factId).toBe(1);
		const database = body.database as Record<string, number>;
		expect(database.sizeBytes).toBe(0);
		expect(database.sizeMB).toBe(0);
		const uptime = body.uptime as Record<string, unknown>;
		expect(typeof uptime.seconds).toBe("number");
		expect(typeof uptime.formatted).toBe("string");
	});

	test("returns minimal response when detail=false", async () => {
		const db = makeTestDatabase();
		const request = new Request("http://localhost/health?detail=false");
		const response = handleHealthCheck(request, db, "/tmp/nonexistent.db", Date.now());
		const body = await response.json();
		expect(body).toEqual({ status: "ok" });
	});

	test("returns minimal response when detail=invalid", async () => {
		const db = makeTestDatabase();
		const request = new Request("http://localhost/health?detail=invalid");
		const response = handleHealthCheck(request, db, "/tmp/nonexistent.db", Date.now());
		const body = await response.json();
		expect(body).toEqual({ status: "ok" });
	});

	test("returns null lastSend when no facts have been sent", async () => {
		const db = makeTestDatabase();
		const request = new Request("http://localhost/health?detail=true");
		const response = handleHealthCheck(request, db, "/tmp/nonexistent.db", Date.now());
		const body = (await response.json()) as Record<string, unknown>;
		expect(body.lastSend).toBeNull();
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

	test("returns success JSON for valid email", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();
		const limiter = createRateLimiter(5, 60 * 60 * 1000);

		const request = makeRequest(JSON.stringify({ email: "test@example.com" }));
		const response = await handleSubscribe(request, db, email, limiter, 1000, BASE_URL);
		const body = (await response.json()) as Record<string, unknown>;

		expect(response.status).toBe(200);
		expect(body.success).toBe(true);
		expect(typeof body.message).toBe("string");
	});

	test("returns error JSON for invalid email", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();
		const limiter = createRateLimiter(5, 60 * 60 * 1000);

		const request = makeRequest(JSON.stringify({ email: "notanemail" }));
		const response = await handleSubscribe(request, db, email, limiter, 1000, BASE_URL);
		const body = (await response.json()) as Record<string, unknown>;

		expect(response.status).toBe(200);
		expect(body.success).toBe(false);
	});

	test("returns 400 for malformed JSON body", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();
		const limiter = createRateLimiter(5, 60 * 60 * 1000);

		const request = makeRequest("not json");
		const response = await handleSubscribe(request, db, email, limiter, 1000, BASE_URL);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body).toEqual({ success: false, error: "Invalid request body" });
	});

	test("returns 400 when email is not provided", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();
		const limiter = createRateLimiter(5, 60 * 60 * 1000);

		const request = makeRequest(JSON.stringify({ name: "test" }));
		const response = await handleSubscribe(request, db, email, limiter, 1000, BASE_URL);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body).toEqual({
			success: false,
			error: "Please provide an email address.",
		});
	});

	test("returns 429 when rate limited", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();
		const limiter = createRateLimiter(2, 60 * 60 * 1000);

		for (let i = 0; i < 2; i++) {
			const req = makeRequest(JSON.stringify({ email: `test${i}@example.com` }));
			await handleSubscribe(req, db, email, limiter, 1000, BASE_URL);
		}

		const request = makeRequest(JSON.stringify({ email: "test@example.com" }));
		const response = await handleSubscribe(request, db, email, limiter, 1000, BASE_URL);
		const body = await response.json();

		expect(response.status).toBe(429);
		expect(body).toEqual({ success: false, error: "Too many requests. Please try again later." });
	});

	test("returns success:false when at capacity", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();
		const limiter = createRateLimiter(5, 60 * 60 * 1000);

		makeSubscriberRow(db, { email: "existing@example.com", status: "active" });

		const request = makeRequest(JSON.stringify({ email: "new@example.com" }));
		const response = await handleSubscribe(request, db, email, limiter, 1, BASE_URL);
		const body = (await response.json()) as Record<string, unknown>;

		expect(response.status).toBe(200);
		expect(body.success).toBe(false);
		expect(typeof body.error).toBe("string");
	});
});

describe("GET /", () => {
	test("returns HTML with signup form containing email input", async () => {
		const db = makeTestDatabase();
		const response = renderSignupPage(db, 1000);

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");

		const html = await response.text();
		expect(html).toContain("Daily Platypus Facts");
		expect(html).toContain("signup-form");
		expect(html).toContain('type="email"');
		expect(html).toContain('id="email-input"');
	});

	test("does not render animated swimming platypus element", async () => {
		const db = makeTestDatabase();
		const response = renderSignupPage(db, 1000);
		const html = await response.text();

		expect(html).not.toContain("platypus-swim");
		expect(html).not.toContain("platypus-body");
		expect(html).not.toContain("platypus-tail");
	});

	test("renders current Platypus Fan count and max capacity", async () => {
		const db = makeTestDatabase();
		makeSubscriberRow(db, { email: "a@example.com", status: "active" });
		makeSubscriberRow(db, { email: "b@example.com", status: "active" });
		makeSubscriberRow(db, { email: "c@example.com", status: "pending" });

		const response = renderSignupPage(db, 1000);
		const html = await response.text();

		expect(html).toContain("2");
		expect(html).toContain("1,000");
		expect(html).toContain("Platypus Fans");
	});

	test("renders capacity message instead of signup form when at capacity", async () => {
		const db = makeTestDatabase();
		makeSubscriberRow(db, { email: "a@example.com", status: "active" });

		const response = renderSignupPage(db, 1);
		const html = await response.text();

		expect(html).toContain("at capacity");
		expect(html).not.toContain("<form");
	});
});

describe("GET / - tagline", () => {
	test("renders Life is Strange: Double Exposure tagline on signup page", async () => {
		const db = makeTestDatabase();
		const response = renderSignupPage(db, 1000);
		const html = await response.text();

		expect(html).toContain("Inspired by");
		expect(html).toContain("Life is Strange: Double Exposure");
	});
});

describe("escapeHtml on fact page", () => {
	test("escapes HTML special characters in fact text to prevent XSS", async () => {
		const db = makeTestDatabase();
		const factId = makeFactRow(db, {
			text: '<script>alert("xss")</script>',
			sources: [{ url: "https://example.com/1", title: "Safe Source" }],
		});

		const response = renderFactPage(db, factId);
		const html = await response.text();

		expect(html).not.toContain("<script>");
		expect(html).toContain("&lt;script&gt;");
		expect(html).toContain("&quot;xss&quot;");
	});

	test("escapes HTML special characters in source titles to prevent XSS", async () => {
		const db = makeTestDatabase();
		const factId = makeFactRow(db, {
			text: "Normal fact",
			sources: [{ url: "https://example.com/1", title: '<img src=x onerror="alert(1)">' }],
		});

		const response = renderFactPage(db, factId);
		const html = await response.text();

		expect(html).not.toContain('<img src=x onerror="alert(1)">');
		expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
	});

	test("escapes ampersands and quotes in source URLs in href attributes", async () => {
		const db = makeTestDatabase();
		const factId = makeFactRow(db, {
			text: "Normal fact",
			sources: [{ url: "https://example.com/search?a=1&b=2", title: "Search" }],
		});

		const response = renderFactPage(db, factId);
		const html = await response.text();

		expect(html).toContain("https://example.com/search?a=1&amp;b=2");
	});
});

describe("isSafeUrl on fact page", () => {
	test("filters out javascript: URLs from rendered sources", async () => {
		const db = makeTestDatabase();
		const factId = makeFactRow(db, {
			text: "Normal fact",
			sources: [
				{ url: "javascript:alert(1)", title: "Malicious" },
				{ url: "https://example.com/safe", title: "Safe Source" },
			],
		});

		const response = renderFactPage(db, factId);
		const html = await response.text();

		expect(html).not.toContain("javascript:");
		expect(html).toContain("https://example.com/safe");
		expect(html).toContain("Safe Source");
	});

	test("filters out data: URLs from rendered sources", async () => {
		const db = makeTestDatabase();
		const factId = makeFactRow(db, {
			text: "Normal fact",
			sources: [
				{ url: "data:text/html,<script>alert(1)</script>", title: "Data URL" },
				{ url: "https://example.com/safe", title: "Safe" },
			],
		});

		const response = renderFactPage(db, factId);
		const html = await response.text();

		expect(html).not.toContain("data:text/html");
		expect(html).toContain("https://example.com/safe");
	});

	test("allows http: and https: URLs in rendered sources", async () => {
		const db = makeTestDatabase();
		const factId = makeFactRow(db, {
			text: "Normal fact",
			sources: [
				{ url: "http://example.com/http", title: "HTTP Source" },
				{ url: "https://example.com/https", title: "HTTPS Source" },
			],
		});

		const response = renderFactPage(db, factId);
		const html = await response.text();

		expect(html).toContain("http://example.com/http");
		expect(html).toContain("https://example.com/https");
	});

	test("filters out sources with invalid/malformed URLs", async () => {
		const db = makeTestDatabase();
		const factId = makeFactRow(db, {
			text: "Normal fact",
			sources: [
				{ url: "not-a-url", title: "Invalid" },
				{ url: "https://example.com/valid", title: "Valid" },
			],
		});

		const response = renderFactPage(db, factId);
		const html = await response.text();

		expect(html).not.toContain("not-a-url");
		expect(html).toContain("https://example.com/valid");
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

	test("renders img tag with correct src and alt when fact has image_path", async () => {
		const db = makeTestDatabase();
		const factId = makeFactRow(db, {
			text: "Platypuses glow under UV light",
			image_path: "images/facts/42.png",
			sources: [{ url: "https://example.com/uv", title: "UV Study" }],
		});

		const response = renderFactPage(db, factId);
		const html = await response.text();

		expect(html).toContain('<img src="/images/facts/42.png"');
		expect(html).toContain('alt="Illustration for this platypus fact"');
		expect(html).toContain('class="fact-image"');
	});

	test("omits img tag when fact has no image_path", async () => {
		const db = makeTestDatabase();
		const factId = makeFactRow(db, {
			text: "Platypuses are monotremes",
			sources: [{ url: "https://example.com/mono", title: "Mono Study" }],
		});

		const response = renderFactPage(db, factId);
		const html = await response.text();

		expect(html).not.toContain("<img");
		expect(html).not.toContain("fact-image");
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

	test("render404Page includes '404 - Fact Not Found' heading", async () => {
		const response = render404Page();
		const html = await response.text();
		expect(html).toContain("404 - Fact Not Found");
	});

	test("render404Page includes 'Maybe it swam away?' message", async () => {
		const response = render404Page();
		const html = await response.text();
		expect(html).toContain("Maybe it swam away?");
	});

	test("render404Page includes link back to home page", async () => {
		const response = render404Page();
		const html = await response.text();
		expect(html).toContain('href="/"');
		expect(html).toContain("Back to home");
	});

	test("uses source URL as display text when source has no title", async () => {
		const db = makeTestDatabase();
		const factId = makeFactRow(db, {
			text: "Platypuses are unique",
			sources: [{ url: "https://example.com/platypus" }],
		});

		const response = renderFactPage(db, factId);
		const html = await response.text();

		expect(html).toContain("https://example.com/platypus");
		expect(html).toContain('target="_blank"');
	});

	test("fact page includes subscribe CTA link", async () => {
		const db = makeTestDatabase();
		const factId = makeFactRow(db, {
			text: "Platypus fact",
			sources: [{ url: "https://example.com", title: "Source" }],
		});

		const response = renderFactPage(db, factId);
		const html = await response.text();

		expect(html).toContain("Want daily platypus facts? Subscribe here!");
		expect(html).toContain('href="/"');
	});
});

describe("POST /api/subscribe - getClientIp", () => {
	test("extracts first IP from X-Forwarded-For header with multiple IPs", () => {
		const request = new Request("http://localhost/api/subscribe", {
			method: "POST",
			headers: { "X-Forwarded-For": "203.0.113.50, 70.41.3.18, 150.172.238.178" },
		});
		expect(getClientIp(request)).toBe("203.0.113.50");
	});

	test("returns 'unknown' when X-Forwarded-For header is missing", () => {
		const request = new Request("http://localhost/api/subscribe", {
			method: "POST",
		});
		expect(getClientIp(request)).toBe("unknown");
	});

	test("trims whitespace from extracted IP", () => {
		const request = new Request("http://localhost/api/subscribe", {
			method: "POST",
			headers: { "X-Forwarded-For": "  203.0.113.50  , 70.41.3.18" },
		});
		expect(getClientIp(request)).toBe("203.0.113.50");
	});
});

describe("POST /api/subscribe - body size limit", () => {
	test("returns 413 when Content-Length header exceeds 4096 bytes", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();
		const limiter = createRateLimiter(5, 60 * 60 * 1000);

		const request = new Request("http://localhost/api/subscribe", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Forwarded-For": "192.168.1.1",
				"Content-Length": "10000",
			},
			body: JSON.stringify({ email: "test@example.com" }),
		});
		const response = await handleSubscribe(request, db, email, limiter, 1000, BASE_URL);
		const body = await response.json();

		expect(response.status).toBe(413);
		expect(body).toEqual({ success: false, error: "Request body too large" });
	});

	test("returns 413 when actual body exceeds 4096 bytes without Content-Length header", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();
		const limiter = createRateLimiter(5, 60 * 60 * 1000);

		const largeBody = JSON.stringify({ email: "test@example.com", padding: "x".repeat(5000) });
		const request = new Request("http://localhost/api/subscribe", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Forwarded-For": "192.168.1.1",
			},
			body: largeBody,
		});
		const response = await handleSubscribe(request, db, email, limiter, 1000, BASE_URL);
		const body = await response.json();

		expect(response.status).toBe(413);
		expect(body).toEqual({ success: false, error: "Request body too large" });
	});

	test("accepts request body under 4096 bytes", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();
		const limiter = createRateLimiter(5, 60 * 60 * 1000);

		const request = new Request("http://localhost/api/subscribe", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Forwarded-For": "192.168.1.1",
			},
			body: JSON.stringify({ email: "test@example.com" }),
		});
		const response = await handleSubscribe(request, db, email, limiter, 1000, BASE_URL);
		const body = (await response.json()) as Record<string, unknown>;

		expect(response.status).toBe(200);
		expect(body.success).toBe(true);
	});
});

describe("POST /api/subscribe - body validation edge cases", () => {
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

	test("returns 400 when email is a number instead of string", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();
		const limiter = createRateLimiter(5, 60 * 60 * 1000);

		const request = makeRequest(JSON.stringify({ email: 12345 }));
		const response = await handleSubscribe(request, db, email, limiter, 1000, BASE_URL);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body).toEqual({
			success: false,
			error: "Please provide an email address.",
		});
	});

	test("returns 400 when body is a JSON array instead of object", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();
		const limiter = createRateLimiter(5, 60 * 60 * 1000);

		const request = makeRequest(JSON.stringify(["test@example.com"]));
		const response = await handleSubscribe(request, db, email, limiter, 1000, BASE_URL);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body).toEqual({ success: false, error: "Invalid request body" });
	});

	test("returns 400 when body is JSON null", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();
		const limiter = createRateLimiter(5, 60 * 60 * 1000);

		const request = makeRequest("null");
		const response = await handleSubscribe(request, db, email, limiter, 1000, BASE_URL);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body).toEqual({ success: false, error: "Invalid request body" });
	});
});

describe("GET / - signup page at capacity details", () => {
	test("does not include form submission script when at capacity", async () => {
		const db = makeTestDatabase();
		makeSubscriberRow(db, { email: "a@example.com", status: "active" });

		const response = renderSignupPage(db, 1);
		const html = await response.text();

		expect(html).not.toContain("<script>");
		expect(html).not.toContain("signup-form");
	});

	test("includes form submission script when not at capacity", async () => {
		const db = makeTestDatabase();

		const response = renderSignupPage(db, 1000);
		const html = await response.text();

		expect(html).toContain("<script>");
		expect(html).toContain("/api/subscribe");
	});

	test("email input has required attribute", async () => {
		const db = makeTestDatabase();
		const response = renderSignupPage(db, 1000);
		const html = await response.text();

		expect(html).toContain("required");
	});

	test("form script sends email in payload", async () => {
		const db = makeTestDatabase();
		const response = renderSignupPage(db, 1000);
		const html = await response.text();

		expect(html).toContain("email: emailValue");
	});

	test("includes description text about daily platypus facts via email", async () => {
		const db = makeTestDatabase();

		const response = renderSignupPage(db, 1000);
		const html = await response.text();

		expect(html).toContain("Get one fascinating platypus fact delivered every day via email");
	});

	test("includes warm note explaining the subscriber cap", async () => {
		const db = makeTestDatabase();

		const response = renderSignupPage(db, 200);
		const html = await response.text();

		expect(html).toContain("sent with love");
		expect(html).toContain("200 Platypus Fans");
	});

	test("warm note uses the dynamic max subscriber count", async () => {
		const db = makeTestDatabase();

		const response = renderSignupPage(db, 500);
		const html = await response.text();

		expect(html).toContain("500 Platypus Fans right now");
	});
});

describe("GET /confirm/:token", () => {
	test("activates pending subscriber and shows success page", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();
		const id = makeSubscriberRow(db, {
			email: "test@example.com",
			token: "11111111-1111-1111-1111-111111111111",
			status: "pending",
		});

		const response = await renderConfirmationPage(
			db,
			"11111111-1111-1111-1111-111111111111",
			1000,
			email,
			BASE_URL,
		);
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(html).toContain("Welcome, Platypus Fan!");
		expect(html).toContain("confirmed");

		const row = db
			.select({ status: subscribers.status, confirmed_at: subscribers.confirmed_at })
			.from(subscribers)
			.where(eq(subscribers.id, id))
			.get();
		expect(row?.status).toBe("active");
		expect(row?.confirmed_at).toBeTruthy();
	});

	test("shows 'already confirmed' page for active subscriber", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();
		makeSubscriberRow(db, {
			email: "test@example.com",
			token: "22222222-2222-2222-2222-222222222222",
			status: "active",
			confirmed_at: "2025-01-01T00:00:00Z",
		});

		const response = await renderConfirmationPage(
			db,
			"22222222-2222-2222-2222-222222222222",
			1000,
			email,
			BASE_URL,
		);
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(html).toContain("Already Confirmed");
	});

	test("shows inactive message for unsubscribed subscriber", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();
		makeSubscriberRow(db, {
			email: "test@example.com",
			token: "33333333-3333-3333-3333-333333333333",
			status: "unsubscribed",
			unsubscribed_at: "2025-01-01T00:00:00Z",
		});

		const response = await renderConfirmationPage(
			db,
			"33333333-3333-3333-3333-333333333333",
			1000,
			email,
			BASE_URL,
		);
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(html).toContain("Subscription Inactive");
		expect(html).toContain("signup page");
	});

	test("returns 404 for invalid/nonexistent token", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();

		const response = await renderConfirmationPage(
			db,
			"99999999-9999-9999-9999-999999999999",
			1000,
			email,
			BASE_URL,
		);
		const html = await response.text();

		expect(response.status).toBe(404);
		expect(html).toContain("Invalid Link");
	});

	test("shows at-capacity page when cap reached during confirmation", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();
		makeSubscriberRow(db, {
			email: "existing@example.com",
			status: "active",
			confirmed_at: "2025-01-01T00:00:00Z",
		});
		makeSubscriberRow(db, {
			email: "pending@example.com",
			token: "44444444-4444-4444-4444-444444444444",
			status: "pending",
		});

		const response = await renderConfirmationPage(
			db,
			"44444444-4444-4444-4444-444444444444",
			1,
			email,
			BASE_URL,
		);
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(html).toContain("At Capacity");
		expect(html).toContain("at capacity");

		const row = db
			.select({ status: subscribers.status })
			.from(subscribers)
			.where(eq(subscribers.token, "44444444-4444-4444-4444-444444444444"))
			.get();
		expect(row?.status).toBe("pending");
	});

	test("confirmation page includes Daily Platypus Facts branding", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();
		makeSubscriberRow(db, {
			email: "test@example.com",
			token: "55555555-5555-5555-5555-555555555555",
			status: "pending",
		});

		const response = await renderConfirmationPage(
			db,
			"55555555-5555-5555-5555-555555555555",
			1000,
			email,
			BASE_URL,
		);
		const html = await response.text();

		expect(html).toContain("Daily Platypus Facts");
		expect(html).toContain("Life is Strange: Double Exposure");
		expect(html).toContain('href="/"');
	});
});

describe("welcome email on confirmation", () => {
	test("sends welcome email with most recent fact when pending subscriber confirms", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();
		const factId = makeFactRow(db, {
			text: "Platypuses glow under UV light.",
			sources: [{ url: "https://example.com/uv", title: "UV Study" }],
			image_path: "images/facts/1.png",
		});
		makeSentFactRow(db, { fact_id: factId, sent_date: "2025-06-01", cycle: 1 });

		makeSubscriberRow(db, {
			email: "fan@example.com",
			token: "welcome-111-1111-1111-111111111111",
			status: "pending",
		});

		await renderConfirmationPage(db, "welcome-111-1111-1111-111111111111", 1000, email, BASE_URL);

		expect(email.sentEmails).toHaveLength(1);
		expect(email.sentEmails[0].to).toBe("fan@example.com");
		expect(email.sentEmails[0].subject).toContain("Welcome to Daily Platypus Facts");
		expect(email.sentEmails[0].subject).toContain("Here's Your First Fact");
		expect(email.sentEmails[0].htmlBody).toContain("Platypuses glow under UV light.");
		expect(email.sentEmails[0].htmlBody).toContain("UV Study");
		expect(email.sentEmails[0].htmlBody).toContain(`${BASE_URL}/images/facts/1.png`);
		expect(email.sentEmails[0].htmlBody).toContain(`${BASE_URL}/facts/${factId}`);
	});

	test("sends welcome email without fact section when no facts have been sent", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();

		makeSubscriberRow(db, {
			email: "fan@example.com",
			token: "welcome-222-2222-2222-222222222222",
			status: "pending",
		});

		await renderConfirmationPage(db, "welcome-222-2222-2222-222222222222", 1000, email, BASE_URL);

		expect(email.sentEmails).toHaveLength(1);
		expect(email.sentEmails[0].subject).toBe("Welcome to Daily Platypus Facts!");
		expect(email.sentEmails[0].htmlBody).toContain("Welcome to Daily Platypus Facts");
		expect(email.sentEmails[0].htmlBody).not.toContain("Here's the latest fact");
	});

	test("welcome email includes unsubscribe link with subscriber token", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();

		makeSubscriberRow(db, {
			email: "fan@example.com",
			token: "welcome-333-3333-3333-333333333333",
			status: "pending",
		});

		await renderConfirmationPage(db, "welcome-333-3333-3333-333333333333", 1000, email, BASE_URL);

		expect(email.sentEmails[0].htmlBody).toContain(
			`${BASE_URL}/unsubscribe/welcome-333-3333-3333-333333333333`,
		);
	});

	test("welcome email includes List-Unsubscribe headers", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();

		makeSubscriberRow(db, {
			email: "fan@example.com",
			token: "welcome-444-4444-4444-444444444444",
			status: "pending",
		});

		await renderConfirmationPage(db, "welcome-444-4444-4444-444444444444", 1000, email, BASE_URL);

		expect(email.sentEmails[0].headers?.["List-Unsubscribe"]).toContain(
			`${BASE_URL}/unsubscribe/welcome-444-4444-4444-444444444444`,
		);
		expect(email.sentEmails[0].headers?.["List-Unsubscribe-Post"]).toBe(
			"List-Unsubscribe=One-Click",
		);
	});

	test("welcome email has both HTML and plain text bodies", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();

		makeSubscriberRow(db, {
			email: "fan@example.com",
			token: "welcome-555-5555-5555-555555555555",
			status: "pending",
		});

		await renderConfirmationPage(db, "welcome-555-5555-5555-555555555555", 1000, email, BASE_URL);

		expect(email.sentEmails[0].htmlBody).toBeTruthy();
		expect(email.sentEmails[0].plainBody).toBeTruthy();
		expect(email.sentEmails[0].plainBody).toContain("Welcome to Daily Platypus Facts");
	});

	test("confirmation still succeeds when welcome email fails to send", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();
		email.sendEmail = async () => {
			throw new Error("Email provider down");
		};

		makeSubscriberRow(db, {
			email: "fan@example.com",
			token: "welcome-666-6666-6666-666666666666",
			status: "pending",
		});

		const response = await renderConfirmationPage(
			db,
			"welcome-666-6666-6666-666666666666",
			1000,
			email,
			BASE_URL,
		);
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(html).toContain("Welcome, Platypus Fan!");

		const row = db
			.select({ status: subscribers.status })
			.from(subscribers)
			.where(eq(subscribers.token, "welcome-666-6666-6666-666666666666"))
			.get();
		expect(row?.status).toBe("active");
	});

	test("welcome email is NOT sent when already-active subscriber visits confirmation link", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();

		makeSubscriberRow(db, {
			email: "fan@example.com",
			token: "welcome-777-7777-7777-777777777777",
			status: "active",
			confirmed_at: "2025-01-01T00:00:00Z",
		});

		await renderConfirmationPage(db, "welcome-777-7777-7777-777777777777", 1000, email, BASE_URL);

		expect(email.sentEmails).toHaveLength(0);
	});

	test("welcome email is NOT sent when subscriber cap is reached", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();

		makeSubscriberRow(db, {
			email: "existing@example.com",
			status: "active",
			confirmed_at: "2025-01-01T00:00:00Z",
		});
		makeSubscriberRow(db, {
			email: "pending@example.com",
			token: "welcome-888-8888-8888-888888888888",
			status: "pending",
		});

		await renderConfirmationPage(db, "welcome-888-8888-8888-888888888888", 1, email, BASE_URL);

		expect(email.sentEmails).toHaveLength(0);
	});

	test("welcome email is NOT sent for invalid token", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();

		await renderConfirmationPage(db, "welcome-999-9999-9999-999999999999", 1000, email, BASE_URL);

		expect(email.sentEmails).toHaveLength(0);
	});

	test("welcome email is NOT sent for unsubscribed subscriber", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();

		makeSubscriberRow(db, {
			email: "fan@example.com",
			token: "welcome-aaa-aaaa-aaaa-aaaaaaaaaaaa",
			status: "unsubscribed",
			unsubscribed_at: "2025-01-01T00:00:00Z",
		});

		await renderConfirmationPage(db, "welcome-aaa-aaaa-aaaa-aaaaaaaaaaaa", 1000, email, BASE_URL);

		expect(email.sentEmails).toHaveLength(0);
	});

	test("welcome email includes the most recent fact when multiple facts have been sent", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();
		const factId1 = makeFactRow(db, { text: "Old fact" });
		const factId2 = makeFactRow(db, { text: "Newest fact about platypuses" });
		makeSentFactRow(db, { fact_id: factId1, sent_date: "2025-01-01", cycle: 1 });
		makeSentFactRow(db, { fact_id: factId2, sent_date: "2025-06-15", cycle: 1 });

		makeSubscriberRow(db, {
			email: "fan@example.com",
			token: "welcome-bbb-bbbb-bbbb-bbbbbbbbbbbb",
			status: "pending",
		});

		await renderConfirmationPage(db, "welcome-bbb-bbbb-bbbb-bbbbbbbbbbbb", 1000, email, BASE_URL);

		expect(email.sentEmails[0].htmlBody).toContain("Newest fact about platypuses");
		expect(email.sentEmails[0].htmlBody).not.toContain("Old fact");
	});

	test("welcome email fact image URL is constructed from baseUrl and image_path", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();
		const factId = makeFactRow(db, {
			text: "Fact with image",
			image_path: "images/facts/42.png",
		});
		makeSentFactRow(db, { fact_id: factId, sent_date: "2025-06-01", cycle: 1 });

		makeSubscriberRow(db, {
			email: "fan@example.com",
			token: "welcome-ccc-cccc-cccc-cccccccccccc",
			status: "pending",
		});

		await renderConfirmationPage(db, "welcome-ccc-cccc-cccc-cccccccccccc", 1000, email, BASE_URL);

		expect(email.sentEmails[0].htmlBody).toContain(`${BASE_URL}/images/facts/42.png`);
	});

	test("welcome email fact omits image when fact has no image_path", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();
		const factId = makeFactRow(db, { text: "Fact without image" });
		makeSentFactRow(db, { fact_id: factId, sent_date: "2025-06-01", cycle: 1 });

		makeSubscriberRow(db, {
			email: "fan@example.com",
			token: "welcome-ddd-dddd-dddd-dddddddddddd",
			status: "pending",
		});

		await renderConfirmationPage(db, "welcome-ddd-dddd-dddd-dddddddddddd", 1000, email, BASE_URL);

		expect(email.sentEmails[0].htmlBody).not.toContain('class="fact-image"');
	});
});

describe("GET /unsubscribe/:token", () => {
	test("shows confirmation form for active subscriber", async () => {
		const db = makeTestDatabase();
		makeSubscriberRow(db, {
			email: "test@example.com",
			token: "aaaa1111-1111-1111-1111-111111111111",
			status: "active",
			confirmed_at: "2025-01-01T00:00:00Z",
		});

		const response = renderUnsubscribePage(db, "aaaa1111-1111-1111-1111-111111111111");
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(html).toContain("Are you sure you want to unsubscribe");
		expect(html).toContain('method="POST"');
		expect(html).toContain("Yes, unsubscribe me");
	});

	test("shows confirmation form for pending subscriber", async () => {
		const db = makeTestDatabase();
		makeSubscriberRow(db, {
			email: "test@example.com",
			token: "aaaa2222-2222-2222-2222-222222222222",
			status: "pending",
		});

		const response = renderUnsubscribePage(db, "aaaa2222-2222-2222-2222-222222222222");
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(html).toContain("Are you sure you want to unsubscribe");
	});

	test("shows already-unsubscribed message for unsubscribed subscriber", async () => {
		const db = makeTestDatabase();
		makeSubscriberRow(db, {
			email: "test@example.com",
			token: "aaaa3333-3333-3333-3333-333333333333",
			status: "unsubscribed",
			unsubscribed_at: "2025-01-01T00:00:00Z",
		});

		const response = renderUnsubscribePage(db, "aaaa3333-3333-3333-3333-333333333333");
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(html).toContain("Already Unsubscribed");
	});

	test("returns 404 for nonexistent token", async () => {
		const db = makeTestDatabase();

		const response = renderUnsubscribePage(db, "aaaa9999-9999-9999-9999-999999999999");

		expect(response.status).toBe(404);
		const html = await response.text();
		expect(html).toContain("Invalid Link");
	});
});

describe("POST /unsubscribe/:token", () => {
	test("unsubscribes active subscriber and shows success page", async () => {
		const db = makeTestDatabase();
		const id = makeSubscriberRow(db, {
			email: "test@example.com",
			token: "bbbb1111-1111-1111-1111-111111111111",
			status: "active",
			confirmed_at: "2025-01-01T00:00:00Z",
		});

		const response = handleUnsubscribe(db, "bbbb1111-1111-1111-1111-111111111111");
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(html).toContain("Unsubscribed");
		expect(html).toContain("unsubscribed from Daily Platypus Facts");

		const row = db
			.select({ status: subscribers.status, unsubscribed_at: subscribers.unsubscribed_at })
			.from(subscribers)
			.where(eq(subscribers.id, id))
			.get();
		expect(row?.status).toBe("unsubscribed");
		expect(row?.unsubscribed_at).toBeTruthy();
	});

	test("unsubscribes pending subscriber and shows success page", async () => {
		const db = makeTestDatabase();
		const id = makeSubscriberRow(db, {
			email: "test@example.com",
			token: "bbbb2222-2222-2222-2222-222222222222",
			status: "pending",
		});

		const response = handleUnsubscribe(db, "bbbb2222-2222-2222-2222-222222222222");
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(html).toContain("Unsubscribed");

		const row = db
			.select({ status: subscribers.status })
			.from(subscribers)
			.where(eq(subscribers.id, id))
			.get();
		expect(row?.status).toBe("unsubscribed");
	});

	test("shows already-unsubscribed message for already unsubscribed subscriber", async () => {
		const db = makeTestDatabase();
		makeSubscriberRow(db, {
			email: "test@example.com",
			token: "bbbb3333-3333-3333-3333-333333333333",
			status: "unsubscribed",
			unsubscribed_at: "2025-01-01T00:00:00Z",
		});

		const response = handleUnsubscribe(db, "bbbb3333-3333-3333-3333-333333333333");
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(html).toContain("Already Unsubscribed");
	});

	test("returns 404 for nonexistent token", async () => {
		const db = makeTestDatabase();

		const response = handleUnsubscribe(db, "bbbb9999-9999-9999-9999-999999999999");

		expect(response.status).toBe(404);
		const html = await response.text();
		expect(html).toContain("Invalid Link");
	});
});

describe("GET /dev/messages", () => {
	test("renders empty state when no email messages have been sent", async () => {
		const response = renderDevMessageList([]);
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
		expect(html).toContain("No messages sent yet.");
	});

	test("lists email messages with recipient, subject, and timestamp", async () => {
		const emailMessages = [
			{
				id: 1,
				recipient: "fan@example.com",
				subject: "🦆 Daily Platypus Fact",
				htmlBody: "<p>Fact</p>",
				plainBody: "Fact",
				headers: undefined,
				timestamp: "2025-06-15T14:00:00Z",
			},
		];
		const response = renderDevMessageList(emailMessages);
		const html = await response.text();

		expect(html).toContain("fan@example.com");
		expect(html).toContain("🦆 Daily Platypus Fact");
		expect(html).toContain('href="/dev/messages/email-1"');
	});
});

describe("GET /dev/messages/:id", () => {
	test("renders email detail with recipient, subject, timestamp, and HTML body", async () => {
		const emailMessage = {
			id: 1,
			recipient: "fan@example.com",
			subject: "🦆 Daily Platypus Fact",
			htmlBody: "<p>Platypuses glow under UV light!</p>",
			plainBody: "Platypuses glow under UV light!",
			headers: undefined,
			timestamp: "2025-06-15T14:00:00Z",
		};
		const response = renderDevEmailDetail(emailMessage);
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(html).toContain("Email Message");
		expect(html).toContain("fan@example.com");
		expect(html).toContain("🦆 Daily Platypus Fact");
		expect(html).toContain("<p>Platypuses glow under UV light!</p>");
		expect(html).toContain("2025-06-15T14:00:00Z");
	});
});

describe("GET /inspiration", () => {
	test("renders inspiration page with Life is Strange reference", async () => {
		const response = renderInspirationPage();
		const html = await response.text();
		expect(response.status).toBe(200);
		expect(html).toContain("Inspiration");
		expect(html).toContain("Life is Strange: Double Exposure");
		expect(html).toContain("Caledon University");
	});

	test("renders footer on inspiration page", async () => {
		const response = renderInspirationPage();
		const html = await response.text();
		expect(html).toContain("site-footer");
		expect(html).toContain("Made with");
		expect(html).toContain("Cooper Walter");
	});
});

describe("GET /about", () => {
	test("renders about page with project description", async () => {
		const response = renderAboutPage();
		const html = await response.text();
		expect(response.status).toBe(200);
		expect(html).toContain("About");
		expect(html).toContain("one fascinating platypus fact per day");
	});

	test("renders footer on about page", async () => {
		const response = renderAboutPage();
		const html = await response.text();
		expect(html).toContain("site-footer");
		expect(html).toContain("Made with");
		expect(html).toContain("Cooper Walter");
	});
});

describe("platypus mascot image replaces emoji on web pages", () => {
	test("home page displays mascot image above heading", async () => {
		const db = makeTestDatabase();
		const response = renderSignupPage(db, 200);
		const html = await response.text();

		expect(html).toContain('<img src="/platypus.png"');
		expect(html).toContain('class="mascot-image"');
		expect(html).toContain('alt="Platypus mascot"');
	});

	test("home page heading does not contain emoji combo", async () => {
		const db = makeTestDatabase();
		const response = renderSignupPage(db, 200);
		const html = await response.text();

		expect(html).not.toContain("🦫🦆🥚");
	});

	test("home page at capacity does not contain emoji combo", async () => {
		const db = makeTestDatabase();
		makeSubscriberRow(db, { email: "a@example.com", status: "active" });
		const response = renderSignupPage(db, 1);
		const html = await response.text();

		expect(html).not.toContain("🦫🦆🥚");
	});

	test("fact page does not contain emoji combo", async () => {
		const db = makeTestDatabase();
		const factId = makeFactRow(db, { text: "Platypus fact" });
		const response = renderFactPage(db, factId);
		const html = await response.text();

		expect(html).not.toContain("🦫🦆🥚");
	});

	test("404 page does not contain emoji combo", async () => {
		const response = render404Page();
		const html = await response.text();

		expect(html).not.toContain("🦫🦆🥚");
	});

	test("confirmation success page does not contain emoji combo", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();
		const token = crypto.randomUUID();
		makeSubscriberRow(db, { token, status: "pending" });
		const response = await renderConfirmationPage(db, token, 200, email, BASE_URL);
		const html = await response.text();

		expect(html).not.toContain("🦫🦆🥚");
	});

	test("footer uses 'Made with ❤️' without emoji combo", async () => {
		const db = makeTestDatabase();
		const response = renderSignupPage(db, 200);
		const html = await response.text();

		expect(html).toContain("Made with ❤️ by Cooper Walter");
		expect(html).not.toContain("🦫🦆🥚");
	});
});

describe("footer on public pages", () => {
	test("signup page includes footer with Inspiration and About links", async () => {
		const db = makeTestDatabase();
		const response = renderSignupPage(db, 200);
		const html = await response.text();
		expect(html).toContain("site-footer");
		expect(html).toContain('href="/inspiration"');
		expect(html).toContain('href="/about"');
		expect(html).toContain("Made with");
		expect(html).toContain("Cooper Walter");
	});

	test("fact page includes footer", async () => {
		const db = makeTestDatabase();
		const factId = makeFactRow(db, { text: "Test fact" });
		const response = renderFactPage(db, factId);
		const html = await response.text();
		expect(html).toContain("site-footer");
		expect(html).toContain('href="/inspiration"');
	});

	test("404 page includes footer", async () => {
		const response = render404Page();
		const html = await response.text();
		expect(html).toContain("site-footer");
	});

	test("confirmation page includes footer", async () => {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();
		const token = crypto.randomUUID();
		makeSubscriberRow(db, { token, status: "pending" });
		const response = await renderConfirmationPage(db, token, 200, email, BASE_URL);
		const html = await response.text();
		expect(html).toContain("site-footer");
	});

	test("unsubscribe page includes footer", async () => {
		const db = makeTestDatabase();
		const token = crypto.randomUUID();
		makeSubscriberRow(db, { token, status: "active" });
		const response = renderUnsubscribePage(db, token);
		const html = await response.text();
		expect(html).toContain("site-footer");
	});
});

describe("getCacheControl", () => {
	test("returns 7-day immutable cache for PNG files", () => {
		expect(getCacheControl(".png")).toBe("public, max-age=604800, immutable");
	});

	test("returns 7-day immutable cache for JPG files", () => {
		expect(getCacheControl(".jpg")).toBe("public, max-age=604800, immutable");
	});

	test("returns 7-day immutable cache for JPEG files", () => {
		expect(getCacheControl(".jpeg")).toBe("public, max-age=604800, immutable");
	});

	test("returns 7-day immutable cache for GIF files", () => {
		expect(getCacheControl(".gif")).toBe("public, max-age=604800, immutable");
	});

	test("returns 7-day immutable cache for WebP files", () => {
		expect(getCacheControl(".webp")).toBe("public, max-age=604800, immutable");
	});

	test("returns 7-day immutable cache for SVG files", () => {
		expect(getCacheControl(".svg")).toBe("public, max-age=604800, immutable");
	});

	test("returns 7-day immutable cache for ICO files", () => {
		expect(getCacheControl(".ico")).toBe("public, max-age=604800, immutable");
	});

	test("returns 1-day cache for CSS files", () => {
		expect(getCacheControl(".css")).toBe("public, max-age=86400");
	});

	test("returns 1-hour cache for unknown extensions", () => {
		expect(getCacheControl(".txt")).toBe("public, max-age=3600");
	});

	test("returns 1-hour cache for JS files", () => {
		expect(getCacheControl(".js")).toBe("public, max-age=3600");
	});
});

describe("static file Cache-Control headers", () => {
	function makeHandler() {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();
		const rateLimiter = createRateLimiter(5, 3600000);
		return createRequestHandler({
			db,
			emailProvider: email,
			rateLimiter,
			maxSubscribers: 1000,
			baseUrl: BASE_URL,
			databasePath: "/tmp/nonexistent.db",
			devEmailProvider: null,
		});
	}

	test("PNG static files include Cache-Control header with 7-day immutable cache", async () => {
		const handler = makeHandler();
		const response = await handler(new Request("http://localhost/platypus.png"));
		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toBe("public, max-age=604800, immutable");
	});

	test("SVG static files include Cache-Control header with 7-day immutable cache", async () => {
		const handler = makeHandler();
		const response = await handler(new Request("http://localhost/platypus-icon.svg"));
		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toBe("public, max-age=604800, immutable");
	});

	test("CSS static files include Cache-Control header with 1-day cache", async () => {
		const handler = makeHandler();
		const response = await handler(new Request("http://localhost/styles.css"));
		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toBe("public, max-age=86400");
	});

	test("static file responses preserve Content-Type header", async () => {
		const handler = makeHandler();
		const response = await handler(new Request("http://localhost/styles.css"));
		expect(response.headers.get("Content-Type")).toContain("text/css");
	});
});

describe("formatUptime", () => {
	test("formats zero milliseconds as 0d 0h 0m", () => {
		expect(formatUptime(0)).toBe("0d 0h 0m");
	});

	test("formats 90 seconds as 0d 0h 1m", () => {
		expect(formatUptime(90000)).toBe("0d 0h 1m");
	});

	test("formats 1 day exactly", () => {
		expect(formatUptime(86400000)).toBe("1d 0h 0m");
	});

	test("formats 3 days 14 hours 22 minutes", () => {
		const ms = (3 * 86400 + 14 * 3600 + 22 * 60) * 1000;
		expect(formatUptime(ms)).toBe("3d 14h 22m");
	});
});

describe("GET /health/dashboard", () => {
	function makeDashboardHandler() {
		const db = makeTestDatabase();
		const email = makeMockEmailProvider();
		const rateLimiter = createRateLimiter(5, 3600000);
		const handler = createRequestHandler({
			db,
			emailProvider: email,
			rateLimiter,
			maxSubscribers: 200,
			baseUrl: BASE_URL,
			databasePath: "/tmp/nonexistent.db",
			devEmailProvider: null,
		});
		return { handler, db };
	}

	test("returns HTTP 200 with text/html content type", async () => {
		const { handler } = makeDashboardHandler();
		const response = await handler(new Request("http://localhost/health/dashboard"));
		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toContain("text/html");
	});

	test("contains subscriber count, fact count, and uptime", async () => {
		const { handler, db } = makeDashboardHandler();
		makeFactRow(db, { text: "Test fact" });
		makeSubscriberRow(db, { status: "active" });

		const response = await handler(new Request("http://localhost/health/dashboard"));
		const html = await response.text();
		expect(html).toContain("Active Platypus Fans");
		expect(html).toContain("Total Facts");
		expect(html).toContain("Server Uptime");
	});

	test("does not contain any subscriber email addresses or tokens", async () => {
		const { handler, db } = makeDashboardHandler();
		makeSubscriberRow(db, {
			email: "secret@example.com",
			token: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
			status: "active",
		});

		const response = await handler(new Request("http://localhost/health/dashboard"));
		const html = await response.text();
		expect(html).not.toContain("secret@example.com");
		expect(html).not.toContain("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
	});

	test("displays correct zero values when no subscribers, facts, or sends exist", async () => {
		const { handler } = makeDashboardHandler();
		const response = await handler(new Request("http://localhost/health/dashboard"));
		const html = await response.text();
		expect(html).toContain("0 / 200");
		expect(html).toContain("No sends yet");
	});

	test("displays last send date when sends exist", async () => {
		const { handler, db } = makeDashboardHandler();
		const factId = makeFactRow(db, { text: "Fact" });
		makeSentFactRow(db, { fact_id: factId, sent_date: "2025-06-15", cycle: 1 });

		const response = await handler(new Request("http://localhost/health/dashboard"));
		const html = await response.text();
		expect(html).toContain("2025-06-15");
	});

	test("includes footer with navigation links", async () => {
		const { handler } = makeDashboardHandler();
		const response = await handler(new Request("http://localhost/health/dashboard"));
		const html = await response.text();
		expect(html).toContain("site-footer");
	});
});
