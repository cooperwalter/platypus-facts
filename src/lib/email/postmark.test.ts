import { afterEach, describe, expect, test } from "bun:test";
import { PostmarkEmailProvider } from "./postmark";

describe("PostmarkEmailProvider", () => {
	let capturedRequests: { url: string; init: RequestInit }[] = [];
	const originalFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = originalFetch;
		capturedRequests = [];
	});

	function mockFetch(status = 200, body = "{}") {
		globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
			capturedRequests.push({ url: String(url), init: init ?? {} });
			return new Response(body, { status });
		}) as unknown as typeof fetch;
	}

	test("sendEmail sends POST request to Postmark API with correct headers", async () => {
		mockFetch();
		const provider = new PostmarkEmailProvider("test-token", "from@example.com");

		await provider.sendEmail("to@example.com", "Subject", "<p>Body</p>");

		expect(capturedRequests).toHaveLength(1);
		expect(capturedRequests[0].url).toBe("https://api.postmarkapp.com/email");
		expect(capturedRequests[0].init.method).toBe("POST");

		const headers = capturedRequests[0].init.headers as Record<string, string>;
		expect(headers["X-Postmark-Server-Token"]).toBe("test-token");
		expect(headers["Content-Type"]).toBe("application/json");
	});

	test("sendEmail includes From, To, Subject, HtmlBody in request body", async () => {
		mockFetch();
		const provider = new PostmarkEmailProvider("test-token", "from@example.com");

		await provider.sendEmail("to@example.com", "Test Subject", "<p>HTML</p>");

		const body = JSON.parse(capturedRequests[0].init.body as string);
		expect(body.From).toBe("from@example.com");
		expect(body.To).toBe("to@example.com");
		expect(body.Subject).toBe("Test Subject");
		expect(body.HtmlBody).toBe("<p>HTML</p>");
		expect(body.MessageStream).toBe("outbound");
	});

	test("sendEmail includes TextBody when plainBody is provided", async () => {
		mockFetch();
		const provider = new PostmarkEmailProvider("test-token", "from@example.com");

		await provider.sendEmail("to@example.com", "Subject", "<p>HTML</p>", "Plain text");

		const body = JSON.parse(capturedRequests[0].init.body as string);
		expect(body.TextBody).toBe("Plain text");
	});

	test("sendEmail omits TextBody when plainBody is not provided", async () => {
		mockFetch();
		const provider = new PostmarkEmailProvider("test-token", "from@example.com");

		await provider.sendEmail("to@example.com", "Subject", "<p>HTML</p>");

		const body = JSON.parse(capturedRequests[0].init.body as string);
		expect(body.TextBody).toBeUndefined();
	});

	test("sendEmail includes Headers array when headers are provided", async () => {
		mockFetch();
		const provider = new PostmarkEmailProvider("test-token", "from@example.com");

		await provider.sendEmail("to@example.com", "Subject", "<p>HTML</p>", undefined, {
			"List-Unsubscribe": "<https://example.com/unsub>",
			"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
		});

		const body = JSON.parse(capturedRequests[0].init.body as string);
		expect(body.Headers).toEqual([
			{ Name: "List-Unsubscribe", Value: "<https://example.com/unsub>" },
			{ Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" },
		]);
	});

	test("sendEmail omits Headers when none are provided", async () => {
		mockFetch();
		const provider = new PostmarkEmailProvider("test-token", "from@example.com");

		await provider.sendEmail("to@example.com", "Subject", "<p>HTML</p>");

		const body = JSON.parse(capturedRequests[0].init.body as string);
		expect(body.Headers).toBeUndefined();
	});

	test("sendEmail throws on non-OK response from Postmark API", async () => {
		mockFetch(422, '{"ErrorCode":300,"Message":"Invalid email"}');
		const provider = new PostmarkEmailProvider("test-token", "from@example.com");

		await expect(provider.sendEmail("invalid", "Subject", "<p>Body</p>")).rejects.toThrow(
			"Postmark API error (422)",
		);
	});
});
