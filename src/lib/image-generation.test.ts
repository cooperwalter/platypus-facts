import { afterEach, describe, expect, mock, test } from "bun:test";
import * as path from "node:path";
import {
	DALL_E_API_URL,
	ImageAuthError,
	STYLE_PROMPT,
	generateFactImage,
} from "./image-generation";

const originalFetch = globalThis.fetch;
const originalBunWrite = Bun.write;

afterEach(() => {
	globalThis.fetch = originalFetch;
	Bun.write = originalBunWrite;
});

function makeSuccessResponse(b64Data = "iVBORw0KGgo=") {
	return new Response(
		JSON.stringify({
			data: [{ b64_json: b64Data }],
		}),
		{ status: 200 },
	);
}

describe("generateFactImage", () => {
	test("uses fixed style prompt without fact text", async () => {
		let capturedBody = "";
		globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
			capturedBody = typeof init?.body === "string" ? init.body : "";
			return makeSuccessResponse();
		}) as unknown as typeof fetch;
		Bun.write = mock(async () => 0) as typeof Bun.write;

		await generateFactImage(1, "sk-test");

		const parsed = JSON.parse(capturedBody) as { prompt: string };
		expect(parsed.prompt).toBe(STYLE_PROMPT);
	});

	test("STYLE_PROMPT includes no-text instruction", () => {
		expect(STYLE_PROMPT).toContain(
			"No text, no letters, no words, no numbers anywhere in the image",
		);
	});

	test("calls DALL-E API endpoint with correct parameters", async () => {
		let capturedUrl = "";
		let capturedHeaders: Record<string, string> = {};
		let capturedBody: Record<string, unknown> = {};

		globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
			capturedUrl = url.toString();
			const headers = init?.headers;
			if (headers && typeof headers === "object" && !Array.isArray(headers)) {
				capturedHeaders = headers as Record<string, string>;
			}
			capturedBody = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as Record<
				string,
				unknown
			>;
			return makeSuccessResponse();
		}) as unknown as typeof fetch;
		Bun.write = mock(async () => 0) as typeof Bun.write;

		await generateFactImage(7, "sk-test-key");

		expect(capturedUrl).toBe(DALL_E_API_URL);
		expect(capturedHeaders.Authorization).toBe("Bearer sk-test-key");
		expect(capturedHeaders["Content-Type"]).toBe("application/json");
		expect(capturedBody.model).toBe("dall-e-3");
		expect(capturedBody.size).toBe("1024x1024");
		expect(capturedBody.response_format).toBe("b64_json");
		expect(capturedBody.n).toBe(1);
	});

	test("saves decoded image to correct file path", async () => {
		let writtenPath = "";
		globalThis.fetch = mock(async () => makeSuccessResponse("AQID")) as unknown as typeof fetch;
		Bun.write = mock(async (filePath: string | URL | Response | Blob) => {
			writtenPath = filePath.toString();
			return 0;
		}) as typeof Bun.write;

		await generateFactImage(42, "sk-test");

		const expectedPath = path.join(process.cwd(), "public", "images", "facts", "42.png");
		expect(writtenPath).toBe(expectedPath);
	});

	test("returns relative image path on success", async () => {
		globalThis.fetch = mock(async () => makeSuccessResponse()) as unknown as typeof fetch;
		Bun.write = mock(async () => 0) as typeof Bun.write;

		const result = await generateFactImage(7, "sk-test");

		expect(result).toBe("images/facts/7.png");
	});

	test("returns null and logs on non-auth API error (non-200 response)", async () => {
		globalThis.fetch = mock(
			async () => new Response("Rate limited", { status: 429 }),
		) as unknown as typeof fetch;

		const result = await generateFactImage(1, "sk-test");

		expect(result).toBeNull();
	});

	test("throws ImageAuthError on 401 response for invalid API key", async () => {
		globalThis.fetch = mock(
			async () => new Response("Unauthorized", { status: 401 }),
		) as unknown as typeof fetch;

		await expect(generateFactImage(1, "sk-bad")).rejects.toBeInstanceOf(ImageAuthError);
	});

	test("throws ImageAuthError on 403 response for forbidden API key", async () => {
		globalThis.fetch = mock(
			async () => new Response("Forbidden", { status: 403 }),
		) as unknown as typeof fetch;

		await expect(generateFactImage(1, "sk-bad")).rejects.toBeInstanceOf(ImageAuthError);
	});

	test("returns null and logs on network error", async () => {
		globalThis.fetch = mock(async () => {
			throw new Error("Network timeout");
		}) as unknown as typeof fetch;

		const result = await generateFactImage(1, "sk-test");

		expect(result).toBeNull();
	});

	test("returns null when response is missing b64_json data", async () => {
		globalThis.fetch = mock(
			async () => new Response(JSON.stringify({ data: [] }), { status: 200 }),
		) as unknown as typeof fetch;

		const result = await generateFactImage(1, "sk-test");

		expect(result).toBeNull();
	});
});
