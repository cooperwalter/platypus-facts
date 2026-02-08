import { afterEach, describe, expect, test } from "bun:test";
import { BrevoEmailProvider } from "./brevo";

describe("BrevoEmailProvider", () => {
	let capturedRequests: { url: string; init: RequestInit }[] = [];
	const originalFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = originalFetch;
		capturedRequests = [];
	});

	function mockFetch(status = 200, body = '{"messageId":"<abc@smtp-relay.brevo.com>"}') {
		globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
			capturedRequests.push({ url: String(url), init: init ?? {} });
			return new Response(body, { status });
		}) as unknown as typeof fetch;
	}

	test("sendEmail sends POST request to Brevo API with api-key header", async () => {
		mockFetch();
		const provider = new BrevoEmailProvider("xkeysib-test-key", "from@example.com");

		await provider.sendEmail("to@example.com", "Subject", "<p>Body</p>");

		expect(capturedRequests).toHaveLength(1);
		expect(capturedRequests[0].url).toBe("https://api.brevo.com/v3/smtp/email");
		expect(capturedRequests[0].init.method).toBe("POST");

		const headers = capturedRequests[0].init.headers as Record<string, string>;
		expect(headers["api-key"]).toBe("xkeysib-test-key");
		expect(headers["Content-Type"]).toBe("application/json");
	});

	test("sendEmail includes sender, to, subject, htmlContent in request body", async () => {
		mockFetch();
		const provider = new BrevoEmailProvider("xkeysib-test-key", "from@example.com");

		await provider.sendEmail("to@example.com", "Test Subject", "<p>HTML</p>");

		const body = JSON.parse(capturedRequests[0].init.body as string);
		expect(body.sender).toEqual({ name: "Daily Platypus Facts", email: "from@example.com" });
		expect(body.to).toEqual([{ email: "to@example.com" }]);
		expect(body.subject).toBe("Test Subject");
		expect(body.htmlContent).toBe("<p>HTML</p>");
	});

	test("sendEmail includes textContent when plainBody is provided", async () => {
		mockFetch();
		const provider = new BrevoEmailProvider("xkeysib-test-key", "from@example.com");

		await provider.sendEmail("to@example.com", "Subject", "<p>HTML</p>", "Plain text");

		const body = JSON.parse(capturedRequests[0].init.body as string);
		expect(body.textContent).toBe("Plain text");
	});

	test("sendEmail omits textContent when plainBody is not provided", async () => {
		mockFetch();
		const provider = new BrevoEmailProvider("xkeysib-test-key", "from@example.com");

		await provider.sendEmail("to@example.com", "Subject", "<p>HTML</p>");

		const body = JSON.parse(capturedRequests[0].init.body as string);
		expect(body.textContent).toBeUndefined();
	});

	test("sendEmail includes headers object when headers are provided", async () => {
		mockFetch();
		const provider = new BrevoEmailProvider("xkeysib-test-key", "from@example.com");

		await provider.sendEmail("to@example.com", "Subject", "<p>HTML</p>", undefined, {
			"List-Unsubscribe": "<https://example.com/unsub>",
			"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
		});

		const body = JSON.parse(capturedRequests[0].init.body as string);
		expect(body.headers).toEqual({
			"List-Unsubscribe": "<https://example.com/unsub>",
			"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
		});
	});

	test("sendEmail omits headers when none are provided", async () => {
		mockFetch();
		const provider = new BrevoEmailProvider("xkeysib-test-key", "from@example.com");

		await provider.sendEmail("to@example.com", "Subject", "<p>HTML</p>");

		const body = JSON.parse(capturedRequests[0].init.body as string);
		expect(body.headers).toBeUndefined();
	});

	test("sendEmail throws on non-OK response from Brevo API", async () => {
		mockFetch(401, '{"code":"unauthorized","message":"Key not found"}');
		const provider = new BrevoEmailProvider("xkeysib-test-key", "from@example.com");

		await expect(provider.sendEmail("invalid", "Subject", "<p>Body</p>")).rejects.toThrow(
			"Brevo API error (401)",
		);
	});
});
