import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createRateLimiter } from "../lib/rate-limiter";
import { subscribers } from "../lib/schema";
import {
	makeFactRow,
	makeMockEmailProvider,
	makeSubscriberRow,
	makeTestDatabase,
} from "../lib/test-utils";
import { handleHealthCheck } from "./health";
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
		const id = makeSubscriberRow(db, {
			email: "test@example.com",
			token: "11111111-1111-1111-1111-111111111111",
			status: "pending",
		});

		const response = renderConfirmationPage(db, "11111111-1111-1111-1111-111111111111", 1000);
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
		makeSubscriberRow(db, {
			email: "test@example.com",
			token: "22222222-2222-2222-2222-222222222222",
			status: "active",
			confirmed_at: "2025-01-01T00:00:00Z",
		});

		const response = renderConfirmationPage(db, "22222222-2222-2222-2222-222222222222", 1000);
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(html).toContain("Already Confirmed");
	});

	test("shows inactive message for unsubscribed subscriber", async () => {
		const db = makeTestDatabase();
		makeSubscriberRow(db, {
			email: "test@example.com",
			token: "33333333-3333-3333-3333-333333333333",
			status: "unsubscribed",
			unsubscribed_at: "2025-01-01T00:00:00Z",
		});

		const response = renderConfirmationPage(db, "33333333-3333-3333-3333-333333333333", 1000);
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(html).toContain("Subscription Inactive");
		expect(html).toContain("signup page");
	});

	test("returns 404 for invalid/nonexistent token", async () => {
		const db = makeTestDatabase();

		const response = renderConfirmationPage(db, "99999999-9999-9999-9999-999999999999", 1000);
		const html = await response.text();

		expect(response.status).toBe(404);
		expect(html).toContain("Invalid Link");
	});

	test("shows at-capacity page when cap reached during confirmation", async () => {
		const db = makeTestDatabase();
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

		const response = renderConfirmationPage(db, "44444444-4444-4444-4444-444444444444", 1);
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
		makeSubscriberRow(db, {
			email: "test@example.com",
			token: "55555555-5555-5555-5555-555555555555",
			status: "pending",
		});

		const response = renderConfirmationPage(db, "55555555-5555-5555-5555-555555555555", 1000);
		const html = await response.text();

		expect(html).toContain("Daily Platypus Facts");
		expect(html).toContain("Life is Strange: Double Exposure");
		expect(html).toContain('href="/"');
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

describe("platypus emoji (🦫🦆🥚) on pages", () => {
	test("signup page includes platypus emoji in heading, fan count, description, button, and footer", async () => {
		const db = makeTestDatabase();
		const response = renderSignupPage(db, 200);
		const html = await response.text();

		expect(html).toContain("🦫🦆🥚 Daily Platypus Facts");
		expect(html).toContain("Platypus Fans 🦫🦆🥚");
		expect(html).toContain("via email. 🦫🦆🥚");
		expect(html).toContain("🦫🦆🥚 Subscribe");
		expect(html).toContain("🦫🦆🥚 and ❤️");
	});

	test("signup page at capacity includes platypus emoji in capacity notice", async () => {
		const db = makeTestDatabase();
		makeSubscriberRow(db, { email: "a@example.com", status: "active" });
		const response = renderSignupPage(db, 1);
		const html = await response.text();

		expect(html).toContain("🦫🦆🥚 We're currently at capacity");
	});

	test("fact page includes platypus emoji in heading and CTA", async () => {
		const db = makeTestDatabase();
		const factId = makeFactRow(db, { text: "Platypus fact" });
		const response = renderFactPage(db, factId);
		const html = await response.text();

		expect(html).toContain("🦫🦆🥚 Daily Platypus Facts");
		expect(html).toContain("🦫🦆🥚 Want daily platypus facts");
	});

	test("404 page includes platypus emoji", async () => {
		const response = render404Page();
		const html = await response.text();

		expect(html).toContain("swam away? 🦫🦆🥚");
	});

	test("confirmation success page includes platypus emoji in heading", async () => {
		const db = makeTestDatabase();
		const token = crypto.randomUUID();
		makeSubscriberRow(db, { token, status: "pending" });
		const response = renderConfirmationPage(db, token, 200);
		const html = await response.text();

		expect(html).toContain("🦫🦆🥚 Welcome, Platypus Fan!");
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
		const token = crypto.randomUUID();
		makeSubscriberRow(db, { token, status: "pending" });
		const response = renderConfirmationPage(db, token, 200);
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
