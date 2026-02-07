import { describe, expect, test } from "bun:test";
import { DevEmailProvider } from "./dev";

describe("DevEmailProvider", () => {
	test("sendEmail stores the email in memory", async () => {
		const provider = new DevEmailProvider();
		await provider.sendEmail("test@example.com", "Subject", "<p>Body</p>", "Body");

		const emails = provider.getStoredEmails();
		expect(emails).toHaveLength(1);
		expect(emails[0].recipient).toBe("test@example.com");
		expect(emails[0].subject).toBe("Subject");
		expect(emails[0].htmlBody).toBe("<p>Body</p>");
		expect(emails[0].plainBody).toBe("Body");
	});

	test("sendEmail stores headers when provided", async () => {
		const provider = new DevEmailProvider();
		await provider.sendEmail("test@example.com", "Subject", "<p>Body</p>", undefined, {
			"List-Unsubscribe": "<https://example.com/unsub>",
		});

		const emails = provider.getStoredEmails();
		expect(emails[0].headers).toEqual({
			"List-Unsubscribe": "<https://example.com/unsub>",
		});
	});

	test("sendEmail assigns sequential IDs", async () => {
		const provider = new DevEmailProvider();
		await provider.sendEmail("a@example.com", "First", "<p>1</p>");
		await provider.sendEmail("b@example.com", "Second", "<p>2</p>");

		const emails = provider.getStoredEmails();
		expect(emails[0].id).toBe(2);
		expect(emails[1].id).toBe(1);
	});

	test("getStoredEmails returns emails in reverse chronological order (newest first)", async () => {
		const provider = new DevEmailProvider();
		await provider.sendEmail("a@example.com", "First", "<p>1</p>");
		await provider.sendEmail("b@example.com", "Second", "<p>2</p>");

		const emails = provider.getStoredEmails();
		expect(emails[0].subject).toBe("Second");
		expect(emails[1].subject).toBe("First");
	});

	test("getStoredEmailById returns the matching email", async () => {
		const provider = new DevEmailProvider();
		await provider.sendEmail("a@example.com", "First", "<p>1</p>");
		await provider.sendEmail("b@example.com", "Second", "<p>2</p>");

		const email = provider.getStoredEmailById(1);
		expect(email).toBeDefined();
		expect(email?.subject).toBe("First");
	});

	test("getStoredEmailById returns undefined for nonexistent ID", () => {
		const provider = new DevEmailProvider();
		expect(provider.getStoredEmailById(999)).toBeUndefined();
	});

	test("sendEmail records a timestamp on each email", async () => {
		const provider = new DevEmailProvider();
		await provider.sendEmail("test@example.com", "Subject", "<p>Body</p>");

		const emails = provider.getStoredEmails();
		expect(emails[0].timestamp).toBeDefined();
		expect(typeof emails[0].timestamp).toBe("string");
	});

	test("getStoredEmails returns a copy so mutations don't affect internal state", async () => {
		const provider = new DevEmailProvider();
		await provider.sendEmail("test@example.com", "Subject", "<p>Body</p>");

		const emails = provider.getStoredEmails();
		emails.length = 0;

		expect(provider.getStoredEmails()).toHaveLength(1);
	});
});
