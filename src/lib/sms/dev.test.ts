import { describe, expect, test } from "bun:test";
import { makeTestDatabase } from "../test-utils";
import { DevSmsProvider } from "./dev";

describe("DevSmsProvider", () => {
	test("sendSms stores message in database", async () => {
		const db = makeTestDatabase();
		const provider = new DevSmsProvider(db);
		await provider.sendSms("+15558234567", "Hello platypus!");

		const messages = provider.getStoredMessages();
		expect(messages).toHaveLength(1);
		expect(messages[0].to).toBe("+15558234567");
		expect(messages[0].body).toBe("Hello platypus!");
	});

	test("sendSms stores mediaUrl when provided", async () => {
		const db = makeTestDatabase();
		const provider = new DevSmsProvider(db);
		await provider.sendSms("+15558234567", "Fact!", "https://example.com/image.png");

		const messages = provider.getStoredMessages();
		expect(messages[0].mediaUrl).toBe("https://example.com/image.png");
	});

	test("sendSms stores undefined mediaUrl when not provided", async () => {
		const db = makeTestDatabase();
		const provider = new DevSmsProvider(db);
		await provider.sendSms("+15558234567", "No media");

		const messages = provider.getStoredMessages();
		expect(messages[0].mediaUrl).toBeUndefined();
	});

	test("sendSms assigns sequential IDs from database", async () => {
		const db = makeTestDatabase();
		const provider = new DevSmsProvider(db);
		await provider.sendSms("+15558234567", "First");
		await provider.sendSms("+15559999999", "Second");

		const messages = provider.getStoredMessages();
		expect(messages[0].id).toBeGreaterThan(messages[1].id);
	});

	test("getStoredMessages returns messages in reverse chronological order (newest first)", async () => {
		const db = makeTestDatabase();
		const provider = new DevSmsProvider(db);
		await provider.sendSms("+15558234567", "First");
		await provider.sendSms("+15559999999", "Second");

		const messages = provider.getStoredMessages();
		expect(messages[0].body).toBe("Second");
		expect(messages[1].body).toBe("First");
	});

	test("getStoredMessageById returns the matching message", async () => {
		const db = makeTestDatabase();
		const provider = new DevSmsProvider(db);
		await provider.sendSms("+15558234567", "First");
		await provider.sendSms("+15559999999", "Second");

		const messages = provider.getStoredMessages();
		const firstId = messages[1].id;
		const msg = provider.getStoredMessageById(firstId);
		expect(msg).toBeDefined();
		expect(msg?.body).toBe("First");
	});

	test("getStoredMessageById returns undefined for nonexistent ID", () => {
		const db = makeTestDatabase();
		const provider = new DevSmsProvider(db);
		expect(provider.getStoredMessageById(999)).toBeUndefined();
	});

	test("sendSms records a timestamp on each message", async () => {
		const db = makeTestDatabase();
		const provider = new DevSmsProvider(db);
		await provider.sendSms("+15558234567", "Hello");

		const messages = provider.getStoredMessages();
		expect(messages[0].timestamp).toBeDefined();
		expect(typeof messages[0].timestamp).toBe("string");
	});

	test("messages persist across provider instances sharing the same database", async () => {
		const db = makeTestDatabase();
		const provider1 = new DevSmsProvider(db);
		await provider1.sendSms("+15558234567", "From provider 1");

		const provider2 = new DevSmsProvider(db);
		const messages = provider2.getStoredMessages();
		expect(messages).toHaveLength(1);
		expect(messages[0].body).toBe("From provider 1");
	});

	test("parseIncomingMessage extracts From and Body from form data", async () => {
		const db = makeTestDatabase();
		const provider = new DevSmsProvider(db);
		const formData = new FormData();
		formData.set("From", "+15558234567");
		formData.set("Body", "PERRY");
		const request = new Request("http://localhost/webhook", { method: "POST", body: formData });

		const result = await provider.parseIncomingMessage(request);
		expect(result.from).toBe("+15558234567");
		expect(result.body).toBe("PERRY");
	});

	test("validateWebhookSignature always returns true for dev testing", async () => {
		const db = makeTestDatabase();
		const provider = new DevSmsProvider(db);
		const request = new Request("http://localhost/webhook");
		expect(await provider.validateWebhookSignature(request)).toBe(true);
	});

	test("createWebhookResponse returns empty Response XML when no message", () => {
		const db = makeTestDatabase();
		const provider = new DevSmsProvider(db);
		expect(provider.createWebhookResponse()).toBe("<Response/>");
	});

	test("createWebhookResponse returns Response XML with Message when message is provided", () => {
		const db = makeTestDatabase();
		const provider = new DevSmsProvider(db);
		expect(provider.createWebhookResponse("Hello")).toBe(
			"<Response><Message>Hello</Message></Response>",
		);
	});

	test("createWebhookResponse escapes XML special characters in message", () => {
		const db = makeTestDatabase();
		const provider = new DevSmsProvider(db);
		const result = provider.createWebhookResponse('Test & <"hello">');
		expect(result).toContain("&amp;");
		expect(result).toContain("&lt;");
		expect(result).toContain("&gt;");
		expect(result).toContain("&quot;");
	});
});
