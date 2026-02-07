import { describe, expect, test } from "bun:test";
import { createRateLimiter } from "../lib/rate-limiter";
import {
	makeFactRow,
	makeMockSmsProvider,
	makeSubscriberRow,
	makeTestDatabase,
} from "../lib/test-utils";
import { handleHealthCheck } from "./health";
import {
	handleUnsubscribe,
	render404Page,
	renderConfirmationPage,
	renderDevMessage,
	renderDevMessageList,
	renderFactPage,
	renderSignupPage,
	renderUnsubscribePage,
} from "./pages";
import { getClientIp, handleSubscribe } from "./subscribe";
import { handleTwilioWebhook } from "./webhook";

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

	test("returns success JSON for valid phone number", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();
		const limiter = createRateLimiter(5, 60 * 60 * 1000);

		const request = makeRequest(JSON.stringify({ phoneNumber: "5552345678" }));
		const response = await handleSubscribe(request, db, sms, limiter, 1000, BASE_URL);
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
		const response = await handleSubscribe(request, db, sms, limiter, 1000, BASE_URL);
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
		const response = await handleSubscribe(request, db, sms, limiter, 1000, BASE_URL);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body).toEqual({ success: false, error: "Invalid request body" });
	});

	test("returns 400 when neither phoneNumber nor email is provided", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();
		const limiter = createRateLimiter(5, 60 * 60 * 1000);

		const request = makeRequest(JSON.stringify({ phone: "5551234567" }));
		const response = await handleSubscribe(request, db, sms, limiter, 1000, BASE_URL);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body).toEqual({
			success: false,
			error: "Please provide a phone number or email address.",
		});
	});

	test("returns 429 when rate limited", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();
		const limiter = createRateLimiter(2, 60 * 60 * 1000);

		for (let i = 0; i < 2; i++) {
			const req = makeRequest(JSON.stringify({ phoneNumber: "5551234567" }));
			await handleSubscribe(req, db, sms, limiter, 1000, BASE_URL);
		}

		const request = makeRequest(JSON.stringify({ phoneNumber: "5551234567" }));
		const response = await handleSubscribe(request, db, sms, limiter, 1000, BASE_URL);
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
		const response = await handleSubscribe(request, db, sms, limiter, 1, BASE_URL);
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
	test("returns HTML with signup form containing phone and email inputs", async () => {
		const db = makeTestDatabase();
		const response = renderSignupPage(db, 1000);

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");

		const html = await response.text();
		expect(html).toContain("Daily Platypus Facts");
		expect(html).toContain("signup-form");
		expect(html).toContain('type="tel"');
		expect(html).toContain('type="email"');
		expect(html).toContain('id="email-input"');
		expect(html).toContain("and / or");
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
		const sms = makeMockSmsProvider();
		const limiter = createRateLimiter(5, 60 * 60 * 1000);

		const request = new Request("http://localhost/api/subscribe", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Forwarded-For": "192.168.1.1",
				"Content-Length": "10000",
			},
			body: JSON.stringify({ phoneNumber: "5552345678" }),
		});
		const response = await handleSubscribe(request, db, sms, limiter, 1000, BASE_URL);
		const body = await response.json();

		expect(response.status).toBe(413);
		expect(body).toEqual({ success: false, error: "Request body too large" });
	});

	test("returns 413 when actual body exceeds 4096 bytes without Content-Length header", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();
		const limiter = createRateLimiter(5, 60 * 60 * 1000);

		const largeBody = JSON.stringify({ phoneNumber: "5552345678", padding: "x".repeat(5000) });
		const request = new Request("http://localhost/api/subscribe", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Forwarded-For": "192.168.1.1",
			},
			body: largeBody,
		});
		const response = await handleSubscribe(request, db, sms, limiter, 1000, BASE_URL);
		const body = await response.json();

		expect(response.status).toBe(413);
		expect(body).toEqual({ success: false, error: "Request body too large" });
	});

	test("accepts request body under 4096 bytes", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();
		const limiter = createRateLimiter(5, 60 * 60 * 1000);

		const request = new Request("http://localhost/api/subscribe", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Forwarded-For": "192.168.1.1",
			},
			body: JSON.stringify({ phoneNumber: "5552345678" }),
		});
		const response = await handleSubscribe(request, db, sms, limiter, 1000, BASE_URL);
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

	test("returns 400 when phoneNumber is a number instead of string", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();
		const limiter = createRateLimiter(5, 60 * 60 * 1000);

		const request = makeRequest(JSON.stringify({ phoneNumber: 5551234567 }));
		const response = await handleSubscribe(request, db, sms, limiter, 1000, BASE_URL);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body).toEqual({
			success: false,
			error: "Please provide a phone number or email address.",
		});
	});

	test("returns 400 when body is a JSON array instead of object", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();
		const limiter = createRateLimiter(5, 60 * 60 * 1000);

		const request = makeRequest(JSON.stringify(["5551234567"]));
		const response = await handleSubscribe(request, db, sms, limiter, 1000, BASE_URL);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body).toEqual({ success: false, error: "Invalid request body" });
	});

	test("returns 400 when body is JSON null", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();
		const limiter = createRateLimiter(5, 60 * 60 * 1000);

		const request = makeRequest("null");
		const response = await handleSubscribe(request, db, sms, limiter, 1000, BASE_URL);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body).toEqual({ success: false, error: "Invalid request body" });
	});
});

describe("POST /api/webhooks/twilio/incoming - error handling", () => {
	test("returns empty TwiML when parseIncomingMessage throws", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();
		sms.parseIncomingMessage = async () => {
			throw new Error("Parse failure");
		};

		const request = new Request("http://localhost/api/webhooks/twilio/incoming", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: "invalid-data",
		});
		const response = await handleTwilioWebhook(request, db, sms, "https://example.com", 1000);

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("text/xml");
		const text = await response.text();
		expect(text).toContain("<Response");
		expect(text).not.toContain("<Message>");
	});

	test("returns empty TwiML when handleIncomingMessage throws", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();

		const formData = new URLSearchParams();
		formData.set("From", "+15551234567");
		formData.set("Body", "1");

		const request = new Request("http://localhost/api/webhooks/twilio/incoming", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: formData.toString(),
		});

		const originalParse = sms.parseIncomingMessage.bind(sms);
		let parseCount = 0;
		sms.parseIncomingMessage = async (req: Request) => {
			parseCount++;
			if (parseCount === 1) {
				return { from: "not-a-valid-phone!!!", body: "\0\0\0" };
			}
			return originalParse(req);
		};

		const response = await handleTwilioWebhook(request, db, sms, "https://example.com", 1000);

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("text/xml");
	});

	test("returns TwiML with no message body when STOP word sent by known subscriber", async () => {
		const db = makeTestDatabase();
		const sms = makeMockSmsProvider();
		makeSubscriberRow(db, { phone_number: "+15551234567", status: "active" });

		const formData = new URLSearchParams();
		formData.set("From", "+15551234567");
		formData.set("Body", "STOP");

		const request = new Request("http://localhost/api/webhooks/twilio/incoming", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: formData.toString(),
		});

		const response = await handleTwilioWebhook(request, db, sms, "https://example.com", 1000);
		const text = await response.text();

		expect(response.status).toBe(200);
		expect(text).not.toContain("<Message>");
	});
});

describe("GET / - signup page at capacity details", () => {
	test("does not include form submission script when at capacity", async () => {
		const db = makeTestDatabase();
		makeSubscriberRow(db, { phone_number: "+15551234567", status: "active" });

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

	test("phone input is not required (both fields optional, at least one needed)", async () => {
		const db = makeTestDatabase();
		const response = renderSignupPage(db, 1000);
		const html = await response.text();

		expect(html).not.toContain("required");
	});

	test("form script sends both phoneNumber and email in payload", async () => {
		const db = makeTestDatabase();
		const response = renderSignupPage(db, 1000);
		const html = await response.text();

		expect(html).toContain("payload.phoneNumber");
		expect(html).toContain("payload.email");
	});

	test("form script validates at least one of phone or email is provided", async () => {
		const db = makeTestDatabase();
		const response = renderSignupPage(db, 1000);
		const html = await response.text();

		expect(html).toContain("!phoneValue && !emailValue");
		expect(html).toContain("Please enter a phone number or email address");
	});

	test("includes description text about daily platypus facts via SMS and/or email", async () => {
		const db = makeTestDatabase();

		const response = renderSignupPage(db, 1000);
		const html = await response.text();

		expect(html).toContain(
			"Get one fascinating platypus fact delivered every day via SMS and/or email",
		);
	});
});

describe("GET /confirm/:token", () => {
	test("activates pending subscriber and shows success page", async () => {
		const db = makeTestDatabase();
		const id = makeSubscriberRow(db, {
			phone_number: "+15552345678",
			token: "11111111-1111-1111-1111-111111111111",
			status: "pending",
		});

		const response = renderConfirmationPage(db, "11111111-1111-1111-1111-111111111111", 1000);
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(html).toContain("Welcome, Platypus Fan!");
		expect(html).toContain("confirmed");

		const row = db.prepare("SELECT status, confirmed_at FROM subscribers WHERE id = ?").get(id) as {
			status: string;
			confirmed_at: string | null;
		};
		expect(row.status).toBe("active");
		expect(row.confirmed_at).toBeTruthy();
	});

	test("shows 'already confirmed' page for active subscriber", async () => {
		const db = makeTestDatabase();
		makeSubscriberRow(db, {
			phone_number: "+15552345678",
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
			phone_number: "+15552345678",
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
			phone_number: "+15559999999",
			status: "active",
			confirmed_at: "2025-01-01T00:00:00Z",
		});
		makeSubscriberRow(db, {
			phone_number: "+15552345678",
			token: "44444444-4444-4444-4444-444444444444",
			status: "pending",
		});

		const response = renderConfirmationPage(db, "44444444-4444-4444-4444-444444444444", 1);
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(html).toContain("At Capacity");
		expect(html).toContain("at capacity");

		const row = db
			.prepare("SELECT status FROM subscribers WHERE token = ?")
			.get("44444444-4444-4444-4444-444444444444") as { status: string };
		expect(row.status).toBe("pending");
	});

	test("confirmation page includes Daily Platypus Facts branding", async () => {
		const db = makeTestDatabase();
		makeSubscriberRow(db, {
			phone_number: "+15552345678",
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
			phone_number: "+15552345678",
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
			phone_number: "+15552345678",
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
			phone_number: "+15552345678",
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
			phone_number: "+15552345678",
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
			.prepare("SELECT status, unsubscribed_at FROM subscribers WHERE id = ?")
			.get(id) as {
			status: string;
			unsubscribed_at: string | null;
		};
		expect(row.status).toBe("unsubscribed");
		expect(row.unsubscribed_at).toBeTruthy();
	});

	test("unsubscribes pending subscriber and shows success page", async () => {
		const db = makeTestDatabase();
		const id = makeSubscriberRow(db, {
			phone_number: "+15552345678",
			token: "bbbb2222-2222-2222-2222-222222222222",
			status: "pending",
		});

		const response = handleUnsubscribe(db, "bbbb2222-2222-2222-2222-222222222222");
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(html).toContain("Unsubscribed");

		const row = db.prepare("SELECT status FROM subscribers WHERE id = ?").get(id) as {
			status: string;
		};
		expect(row.status).toBe("unsubscribed");
	});

	test("shows already-unsubscribed message for already unsubscribed subscriber", async () => {
		const db = makeTestDatabase();
		makeSubscriberRow(db, {
			phone_number: "+15552345678",
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
	test("renders empty state when no messages have been sent", async () => {
		const response = renderDevMessageList([], []);
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
		expect(html).toContain("Sent Messages (0)");
		expect(html).toContain("No messages sent yet.");
	});

	test("lists SMS messages with recipient, type badge, preview, and timestamp", async () => {
		const smsMessages = [
			{
				id: 1,
				to: "+15552345678",
				body: "Daily Platypus Fact: They glow!",
				mediaUrl: undefined,
				timestamp: "2025-06-15T14:00:00Z",
			},
		];
		const response = renderDevMessageList(smsMessages, []);
		const html = await response.text();

		expect(html).toContain("Sent Messages (1)");
		expect(html).toContain("+15552345678");
		expect(html).toContain("SMS");
		expect(html).toContain("They glow!");
		expect(html).toContain("2025-06-15T14:00:00Z");
		expect(html).toContain('href="/dev/messages/sms-1"');
	});

	test("lists email messages with recipient, type badge, subject, and timestamp", async () => {
		const emailMessages = [
			{
				id: 1,
				recipient: "fan@example.com",
				subject: "Your Daily Platypus Fact",
				htmlBody: "<p>Fact</p>",
				plainBody: "Fact",
				headers: undefined,
				timestamp: "2025-06-15T14:00:00Z",
			},
		];
		const response = renderDevMessageList([], emailMessages);
		const html = await response.text();

		expect(html).toContain("Sent Messages (1)");
		expect(html).toContain("fan@example.com");
		expect(html).toContain("EMAIL");
		expect(html).toContain("Your Daily Platypus Fact");
		expect(html).toContain('href="/dev/messages/email-1"');
	});

	test("combines SMS and email messages sorted newest first", async () => {
		const smsMessages = [
			{
				id: 1,
				to: "+15552345678",
				body: "Old SMS",
				mediaUrl: undefined,
				timestamp: "2025-06-15T12:00:00Z",
			},
		];
		const emailMessages = [
			{
				id: 1,
				recipient: "fan@example.com",
				subject: "New Email",
				htmlBody: "<p>Fact</p>",
				plainBody: "Fact",
				headers: undefined,
				timestamp: "2025-06-15T14:00:00Z",
			},
		];
		const response = renderDevMessageList(smsMessages, emailMessages);
		const html = await response.text();

		expect(html).toContain("Sent Messages (2)");
		const emailPos = html.indexOf("fan@example.com");
		const smsPos = html.indexOf("+15552345678");
		expect(emailPos).toBeLessThan(smsPos);
	});

	test("truncates SMS body preview to 80 characters", async () => {
		const longBody = "A".repeat(100);
		const smsMessages = [
			{
				id: 1,
				to: "+15552345678",
				body: longBody,
				mediaUrl: undefined,
				timestamp: "2025-06-15T14:00:00Z",
			},
		];
		const response = renderDevMessageList(smsMessages, []);
		const html = await response.text();

		expect(html).toContain(`${"A".repeat(80)}...`);
		expect(html).not.toContain("A".repeat(81));
	});
});

describe("GET /dev/messages/:id", () => {
	test("renders SMS detail with recipient, timestamp, and full body text", async () => {
		const smsMessages = [
			{
				id: 1,
				to: "+15552345678",
				body: "Daily Platypus Fact: They glow under UV!",
				mediaUrl: undefined,
				timestamp: "2025-06-15T14:00:00Z",
			},
		];
		const response = renderDevMessage("sms-1", smsMessages, []);
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(html).toContain("SMS Message");
		expect(html).toContain("+15552345678");
		expect(html).toContain("Daily Platypus Fact: They glow under UV!");
		expect(html).toContain("2025-06-15T14:00:00Z");
		expect(html).toContain('href="/dev/messages"');
	});

	test("renders SMS detail with media URL when present", async () => {
		const smsMessages = [
			{
				id: 1,
				to: "+15552345678",
				body: "Fact with image",
				mediaUrl: "https://example.com/images/facts/1.png",
				timestamp: "2025-06-15T14:00:00Z",
			},
		];
		const response = renderDevMessage("sms-1", smsMessages, []);
		const html = await response.text();

		expect(html).toContain("Media");
		expect(html).toContain("https://example.com/images/facts/1.png");
	});

	test("renders email detail with recipient, subject, timestamp, and HTML body", async () => {
		const emailMessages = [
			{
				id: 1,
				recipient: "fan@example.com",
				subject: "Your Daily Platypus Fact",
				htmlBody: "<p>Platypuses glow under UV light!</p>",
				plainBody: "Platypuses glow under UV light!",
				headers: undefined,
				timestamp: "2025-06-15T14:00:00Z",
			},
		];
		const response = renderDevMessage("email-1", [], emailMessages);
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(html).toContain("Email Message");
		expect(html).toContain("fan@example.com");
		expect(html).toContain("Your Daily Platypus Fact");
		expect(html).toContain("<p>Platypuses glow under UV light!</p>");
		expect(html).toContain("2025-06-15T14:00:00Z");
	});

	test("returns 404 for nonexistent SMS message ID", async () => {
		const response = renderDevMessage("sms-999", [], []);

		expect(response.status).toBe(404);
		const html = await response.text();
		expect(html).toContain("Not Found");
	});

	test("returns 404 for nonexistent email message ID", async () => {
		const response = renderDevMessage("email-999", [], []);

		expect(response.status).toBe(404);
		const html = await response.text();
		expect(html).toContain("Not Found");
	});

	test("returns 404 for invalid message ID format", async () => {
		const response = renderDevMessage("invalid-id", [], []);

		expect(response.status).toBe(404);
		const html = await response.text();
		expect(html).toContain("Not Found");
	});
});
